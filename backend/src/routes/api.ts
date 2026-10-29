import { gzipSync } from 'node:zlib';
import express, { type Express } from 'express';
import { requireAuth } from '../lib/auth.js';
import { effectiveTier, limitsFor } from '../lib/entitlements.js';
import { Collections, db } from '../lib/firebase.js';
import { log } from '../lib/logging.js';
import { evaluatePipelineHealth } from '../lib/retention.js';
import { captureException } from '../lib/sentry.js';
import { consumeQuota } from '../lib/rateLimit.js';
import { geminiBlockedUntil, isQuotaError, recordGeminiBlock } from '../lib/geminiGate.js';
import { searchFields } from '../lib/searchKey.js';
import { toIndexEntries, type CatalogIndexEntry } from '../lib/catalogIndex.js';
import { discoverAll } from '../services/discovery.js';
import { enqueuePoll } from '../services/pollRequests.js';
import { createAdminRouter } from './admin.js';

/**
 * The `api` service: the only HTTP surface the Android app talks to.
 *
 * Two operations, both of which merely **enqueue** work. Neither does the work
 * inline, so a slow scrape never blocks a user-facing request (ADR-0003).
 */

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

const INDEX_TTL_MS = 6 * 60 * 60 * 1000;
interface BuiltIndex { builtAt: number; count: number; json: Buffer; gzipped: Buffer }
let indexCache: BuiltIndex | null = null;
let indexBuild: Promise<BuiltIndex> | null = null;

async function getCatalogIndex(): Promise<BuiltIndex> {
  if (indexCache && Date.now() - indexCache.builtAt < INDEX_TTL_MS) return indexCache;
  indexBuild ??= (async () => {
    const snap = await db()
      .collection(Collections.MASTER_REGISTRY)
      .select('name', 'vendor', 'active')
      .get();
    const entries = toIndexEntries(
      snap.docs.map((d) => ({ id: d.id, name: d.get('name'), vendor: d.get('vendor'), active: d.get('active') })),
    );
    const builtAt = Date.now();
    const json = Buffer.from(JSON.stringify({ builtAt, count: entries.length, entries }));
    indexCache = { builtAt, count: entries.length, json, gzipped: gzipSync(json) };
    return indexCache;
  })().finally(() => { indexBuild = null; });
  return indexBuild;
}

async function tierFor(uid: string) {
  const snap = await db().collection(Collections.USERS).doc(uid).get();
  return effectiveTier(
    snap.get('subscriptionTier'),
    snap.get('subscriptionExpiresAt'),
  );
}

export function createApiApp(): Express {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  // Token auth, not cookies: `*` leaks nothing and keeps the Vercel-hosted
  // console able to call the Cloud Run / Vercel API from any preview URL.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', service: 'api' });
  });

  /**
   * Is the pipeline actually running? 503 when no sweep has been recorded for
   * three hours, so a free Cloud Monitoring uptime check on this path becomes a
   * dead-man's switch. Exposes only a timestamp.
   */
  app.get('/healthz/pipeline', async (_req, res) => {
    try {
      const snap = await db().collection(Collections.SYSTEM_STATE).doc('sweep').get();
      const health = evaluatePipelineHealth(snap.get('lastSweepAt'), Date.now());
      res.status(health.ok ? 200 : 503).json({ status: health.ok ? 'ok' : 'stale', ...health });
    } catch (error) {
      log.error('pipeline health read failed', error);
      res.status(503).json({ status: 'unknown' });
    }
  });

  /**
   * Public catalog index for the browser's local search (ADR-0021). Names only,
   * no user data. Rebuilt at most once per instance per six hours, so a cold
   * build is the only time it costs ~15k document reads; the CDN and browser
   * caches absorb the rest.
   */
  app.get('/v1/catalog-index.json', async (req, res) => {
    try {
      const index = await getCatalogIndex();
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Vary', 'Accept-Encoding');
      // ~1.2 MB raw for 15k entries; Cloud Run does not compress for us.
      if (req.acceptsEncodings('gzip')) {
        res.setHeader('Content-Encoding', 'gzip');
        res.send(index.gzipped);
      } else {
        res.send(index.json);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      captureException(err, { route: 'catalog-index' });
      log.error('catalog_index_failed', err);
      res.status(502).json({ error: 'Catalog index unavailable' });
    }
  });

  /** Who am I, and what does my tier actually allow? */
  app.get('/v1/me', requireAuth, async (req, res) => {
    const uid = req.uid!;
    const user = await db().collection(Collections.USERS).doc(uid).get();
    const tier = effectiveTier(
      user.get('subscriptionTier'),
      user.get('subscriptionExpiresAt'),
    );
    const admin = await db().collection(Collections.ADMINS).doc(uid).get();

    res.json({
      uid,
      tier,
      subscriptionExpiresAt: user.get('subscriptionExpiresAt') ?? null,
      isAdmin: admin.exists,
      limits: limitsFor(tier),
    });
  });

  app.use('/v1/admin', createAdminRouter());

  /**
   * POST /v1/discover — find sources for something not in the catalog.
   *
   * The client cannot do this itself: it would need to call Gemini (ADR-0003)
   * and write master_registry (ADR-0006), and it may do neither.
   */
  app.post('/v1/discover', requireAuth, async (req, res) => {
    const uid = req.uid!;
    const query = String((req.body as { query?: unknown })?.query ?? '').trim();

    if (!query || query.length > 200) {
      res.status(400).json({ error: 'query must be 1-200 characters' });
      return;
    }

    const tier = await tierFor(uid);
    const entitlements = limitsFor(tier);

    // While the AI quota is spent, a lookup cannot succeed. Say so before
    // charging the user's hourly allowance for it.
    const pausedUntil = await geminiBlockedUntil();
    if (pausedUntil) {
      res.status(503)
        .set('Retry-After', String(Math.ceil((pausedUntil.getTime() - Date.now()) / 1000)))
        .json({
          error: 'AI lookups are paused until the daily limit resets. Try again later.',
          retryAt: pausedUntil.toISOString(),
        });
      return;
    }

    // Checked before spending anything. This call costs real money.
    const quota = await consumeQuota(uid, 'discover', entitlements.discoveryPerHour);
    if (!quota.allowed) {
      res.status(429)
        .set('Retry-After', String(Math.ceil((quota.resetsAt.getTime() - Date.now()) / 1000)))
        .json({ error: 'Discovery limit reached. Try again later.', tier });
      return;
    }

    try {
      const softwareId = slugify(query);
      const existing = await db().collection(Collections.MASTER_REGISTRY).doc(softwareId).get();

      // Someone else may have discovered it since the client last searched.
      // Returning the existing entry is both correct and free.
      if (existing.exists) {
        res.json({ softwareId, taskId: null, alreadyExisted: true });
        return;
      }

      const discovered = await discoverAll(query);

      await db().collection(Collections.MASTER_REGISTRY).doc(softwareId).set({
        name: discovered.name || query,
        ...searchFields(discovered.name || query),
        slug: softwareId,
        type: discovered.type === 'topic' ? 'topic' : 'software',
        vendor: discovered.vendor ?? null,
        website: discovered.website ?? null,
        icon_url: discovered.icon_url ?? null,
        github_url: discovered.github_url ?? null,
        rss_url: discovered.rss_url ?? null,
        changelog_url: discovered.changelog_url ?? null,
        npm_package: discovered.npm_package ?? null,
        pypi_package: discovered.pypi_package ?? null,
        suggested_priority: discovered.suggested_priority ?? ['github', 'rss', 'html'],
        active: true,
        // Deliberately no lastVersion: the entry exists but has never been
        // polled, which the client renders as "looking for release notes".
        lastCheck: null,
        createdBy: uid,
        createdAt: new Date().toISOString(),
      });

      const taskId = await enqueuePoll({
        softwareId,
        softwareName: discovered.name || query,
        requestedBy: uid,
        taskType: 'initial_poll',
      });

      log.info('discovered software', { softwareId, uid, tier });
      res.json({ softwareId, taskId, alreadyExisted: false });
    } catch (error) {
      if (isQuotaError(error)) {
        const until = await recordGeminiBlock(error);
        res.status(503)
          .set('Retry-After', String(Math.ceil((until.getTime() - Date.now()) / 1000)))
          .json({
            error: 'AI lookups are paused until the daily limit resets. Try again later.',
            retryAt: until.toISOString(),
          });
        return;
      }
      log.error('discovery failed', error, { uid, query });
      res.status(502).json({ error: 'Could not find sources for that right now' });
    }
  });

  /** POST /v1/refresh — enqueue a poll. Does not perform it. */
  app.post('/v1/refresh', requireAuth, async (req, res) => {
    const uid = req.uid!;
    const body = req.body as { softwareId?: unknown; includeHistory?: unknown };
    const softwareId = String(body?.softwareId ?? '').trim();
    const includeHistory = body?.includeHistory === true;

    if (!softwareId || softwareId.length > 200) {
      res.status(400).json({ error: 'softwareId is required' });
      return;
    }

    const tier = await tierFor(uid);
    const entitlements = limitsFor(tier);

    if (includeHistory && !entitlements.historyBackfill) {
      res.status(403).json({
        error: 'History backfill requires Pro',
        code: 'UPGRADE_REQUIRED',
        tier,
      });
      return;
    }

    const quota = await consumeQuota(uid, 'refresh', entitlements.refreshPerHour);
    if (!quota.allowed) {
      res.status(429)
        .set('Retry-After', String(Math.ceil((quota.resetsAt.getTime() - Date.now()) / 1000)))
        .json({ error: 'Refresh limit reached. Try again later.', tier });
      return;
    }

    const software = await db().collection(Collections.MASTER_REGISTRY).doc(softwareId).get();
    if (!software.exists) {
      res.status(404).json({ error: 'Unknown software' });
      return;
    }

    const taskId = await enqueuePoll({
      softwareId,
      softwareName: String(software.get('name') ?? softwareId),
      requestedBy: uid,
      includeHistory,
      taskType: includeHistory ? 'history_scrape' : 'initial_poll',
    });

    res.json({ taskId, includeHistory, tier });
  });

  // Last-resort handler. Without it an unhandled rejection returns an Express
  // stack trace to the client, which is an information leak.
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    captureException(error, {
      operation: 'unhandledApiError',
      service: 'api',
    });
    log.error('unhandled api error', error);
    res.status(500).json({ error: 'Internal error' });
  });

  return app;
}
