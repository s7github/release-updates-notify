import { PubSub } from '@google-cloud/pubsub';
import express, { type Express } from 'express';
import { requireAuth } from '../lib/auth.js';
import { config } from '../lib/config.js';
import { Collections, db } from '../lib/firebase.js';
import { log } from '../lib/logging.js';
import { consumeQuota } from '../lib/rateLimit.js';
import { discoverSources } from '../services/gemini.js';
import { createTask } from '../services/tasks.js';

/**
 * The `api` service: the only HTTP surface the Android app talks to.
 *
 * Two operations, both of which merely **enqueue** work. Neither does the work
 * inline, so a slow scrape never blocks a user-facing request (ADR-0003).
 */

let pubsub: PubSub | undefined;
function client(): PubSub {
  if (!pubsub) pubsub = new PubSub();
  return pubsub;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function createApiApp(): Express {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', service: 'api' });
  });

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

    // Checked before spending anything. This call costs real money.
    const quota = await consumeQuota(uid, 'discover', config.limits.discoveryPerUserPerHour);
    if (!quota.allowed) {
      res.status(429)
        .set('Retry-After', String(Math.ceil((quota.resetsAt.getTime() - Date.now()) / 1000)))
        .json({ error: 'Discovery limit reached. Try again later.' });
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

      const discovered = await discoverSources(query);

      await db().collection(Collections.MASTER_REGISTRY).doc(softwareId).set({
        name: discovered.name || query,
        slug: softwareId,
        type: discovered.type === 'topic' ? 'topic' : 'software',
        vendor: discovered.vendor ?? null,
        website: discovered.website ?? null,
        icon_url: discovered.icon_url ?? null,
        github_url: discovered.github_url ?? null,
        rss_url: discovered.rss_url ?? null,
        changelog_url: discovered.changelog_url ?? null,
        suggested_priority: discovered.suggested_priority ?? ['github', 'rss', 'html'],
        active: true,
        // Deliberately no lastVersion: the entry exists but has never been
        // polled, which the client renders as "looking for release notes".
        lastCheck: null,
        createdBy: uid,
        createdAt: new Date().toISOString(),
      });

      const taskId = await createTask({
        type: 'initial_poll',
        softwareId,
        softwareName: discovered.name || query,
        requestedBy: uid,
      });

      await client().topic(config.topics.pollRequests).publishMessage({
        json: { softwareId, taskId, requestedBy: uid },
      });

      log.info('discovered software', { softwareId, uid });
      res.json({ softwareId, taskId, alreadyExisted: false });
    } catch (error) {
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

    const quota = await consumeQuota(uid, 'refresh', config.limits.refreshPerUserPerHour);
    if (!quota.allowed) {
      res.status(429)
        .set('Retry-After', String(Math.ceil((quota.resetsAt.getTime() - Date.now()) / 1000)))
        .json({ error: 'Refresh limit reached. Try again later.' });
      return;
    }

    const software = await db().collection(Collections.MASTER_REGISTRY).doc(softwareId).get();
    if (!software.exists) {
      res.status(404).json({ error: 'Unknown software' });
      return;
    }

    const taskId = await createTask({
      type: includeHistory ? 'history_scrape' : 'initial_poll',
      softwareId,
      softwareName: String(software.get('name') ?? softwareId),
      requestedBy: uid,
    });

    await client().topic(config.topics.pollRequests).publishMessage({
      json: { softwareId, taskId, includeHistory, requestedBy: uid },
    });

    res.json({ taskId });
  });

  // Last-resort handler. Without it an unhandled rejection returns an Express
  // stack trace to the client, which is an information leak.
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error('unhandled api error', error);
    res.status(500).json({ error: 'Internal error' });
  });

  return app;
}
