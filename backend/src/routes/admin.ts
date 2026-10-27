import express, { type Request, type Router } from 'express';
import { requireAdmin, requireAuth } from '../lib/auth.js';
import {
  isValidSoftwareId,
  slugify,
  validateRegistryPatch,
  validateReleasePatch,
  validateTierUpdate,
} from '../lib/adminValidation.js';
import { Collections, db } from '../lib/firebase.js';
import { log } from '../lib/logging.js';
import { captureException } from '../lib/sentry.js';
import { discoverSources } from '../services/gemini.js';
import { enqueuePoll } from '../services/pollRequests.js';

/**
 * Admin operations.
 *
 * The web console is the operator surface (ADR-0009), but it cannot write
 * `master_registry`, `release_notes`, `users.subscriptionTier` or `admins`
 * directly — those writes are denied to every client (ADR-0006). This router is
 * the one place they happen, behind a verified ID token *and* membership of
 * `admins/{uid}`.
 *
 * Every mutation is recorded in `admin_audit`, because "the admin can change
 * anything" and "there is no record of who changed it" is not an acceptable
 * pair.
 */

function adminId(req: Request): string {
  return req.uid!;
}

async function audit(
  req: Request,
  action: string,
  targetType: string,
  targetId: string,
  before: object | null,
  after: object | null,
): Promise<void> {
  try {
    await db().collection(Collections.ADMIN_AUDIT).add({
      actorUid: adminId(req),
      actorEmail: req.authEmail ?? null,
      action,
      targetType,
      targetId,
      before,
      after,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    // An audit write failure must not make the operation look failed when it
    // succeeded. Log loudly; never swallow silently.
    captureException(error as Error, { operation: 'adminAudit', action, targetId });
    log.error('admin audit write failed', error, { action, targetId });
  }
}

/** Audit snapshots omit scraped source text; it is untrusted and bulky. */
function snapshot(data: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!data) return null;
  const { rawData: _rawData, ...rest } = data;
  return rest;
}

async function deleteWhere(collection: string, field: string, value: string): Promise<number> {
  let deleted = 0;
  for (;;) {
    const snap = await db().collection(collection).where(field, '==', value).limit(400).get();
    if (snap.empty) return deleted;

    const batch = db().batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
  }
}

/**
 * The catalog's `lastVersion` is the genuine-update gate. After a note is
 * deleted it must be recomputed from what remains, or the next poll would
 * notify every subscriber about a release that is already in the feed.
 */
async function recomputeLastVersion(softwareIds: string[]): Promise<void> {
  for (const softwareId of new Set(softwareIds)) {
    const latest = await db()
      .collection(Collections.RELEASE_NOTES)
      .where('softwareId', '==', softwareId)
      .orderBy('releaseDate', 'desc')
      .limit(1)
      .get();

    const note = latest.docs[0];
    await db().collection(Collections.MASTER_REGISTRY).doc(softwareId).set(
      {
        lastVersion: note ? String(note.get('version') ?? 'N/A') : 'N/A',
        lastReleaseDate: note ? (note.get('releaseDate') ?? null) : null,
      },
      { merge: true },
    );
  }
}

export function createAdminRouter(): Router {
  const router = express.Router();
  router.use(requireAuth, requireAdmin);

  /** Small, cheap numbers for the console header. */
  router.get('/overview', async (_req, res) => {
    const [users, software, releases, tasks, admins] = await Promise.all([
      db().collection(Collections.USERS).count().get(),
      db().collection(Collections.MASTER_REGISTRY).count().get(),
      db().collection(Collections.RELEASE_NOTES).count().get(),
      db().collection(Collections.BACKGROUND_TASKS).where('status', 'in', ['pending', 'processing']).count().get(),
      db().collection(Collections.ADMINS).count().get(),
    ]);

    res.json({
      users: users.data().count,
      software: software.data().count,
      releases: releases.data().count,
      activeTasks: tasks.data().count,
      admins: admins.data().count,
    });
  });

  // ---------------------------------------------------------------------
  // Admins
  // ---------------------------------------------------------------------

  router.get('/admins', async (_req, res) => {
    const snap = await db().collection(Collections.ADMINS).limit(200).get();
    res.json(snap.docs.map((doc) => ({ uid: doc.id, ...doc.data() })));
  });

  router.post('/admins', async (req, res) => {
    const uid = String((req.body as { uid?: unknown })?.uid ?? '').trim();
    if (!uid || uid.length > 200) {
      res.status(400).json({ error: 'uid is required' });
      return;
    }

    const user = await db().collection(Collections.USERS).doc(uid).get();
    if (!user.exists) {
      res.status(404).json({ error: 'No such user' });
      return;
    }
    if ((await db().collection(Collections.ADMINS).doc(uid).get()).exists) {
      res.json({ uid, alreadyAdmin: true });
      return;
    }

    await db().collection(Collections.ADMINS).doc(uid).set({
      email: String(user.get('email') ?? ''),
      seededAt: new Date().toISOString(),
      grantedBy: adminId(req),
    });
    await audit(req, 'admin.grant', 'admin', uid, null, { uid });
    res.json({ uid, alreadyAdmin: false });
  });

  router.delete('/admins/:uid', async (req, res) => {
    const uid = req.params.uid;
    if (uid === adminId(req)) {
      res.status(400).json({ error: 'You cannot revoke your own admin access' });
      return;
    }

    const admins = await db().collection(Collections.ADMINS).limit(2).get();
    if (admins.size <= 1) {
      res.status(400).json({ error: 'At least one admin must remain' });
      return;
    }

    const ref = db().collection(Collections.ADMINS).doc(uid);
    if (!(await ref.get()).exists) {
      res.status(404).json({ error: 'Not an admin' });
      return;
    }
    await ref.delete();
    await audit(req, 'admin.revoke', 'admin', uid, { uid }, null);
    res.json({ uid, revoked: true });
  });

  // ---------------------------------------------------------------------
  // Users and subscription tiers
  // ---------------------------------------------------------------------

  router.patch('/users/:uid', async (req, res) => {
    const uid = req.params.uid;
    const parsed = validateTierUpdate(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const ref = db().collection(Collections.USERS).doc(uid);
    const before = await ref.get();
    if (!before.exists) {
      res.status(404).json({ error: 'No such user' });
      return;
    }

    await ref.set(
      {
        ...parsed.value,
        subscriptionUpdatedAt: new Date().toISOString(),
        subscriptionUpdatedBy: adminId(req),
      },
      { merge: true },
    );
    await audit(req, 'user.tier', 'user', uid, {
      subscriptionTier: before.get('subscriptionTier') ?? 'FREE',
      subscriptionExpiresAt: before.get('subscriptionExpiresAt') ?? null,
    }, parsed.value);

    res.json({ uid, ...parsed.value });
  });

  // ---------------------------------------------------------------------
  // Catalog
  // ---------------------------------------------------------------------

  router.post('/registry', async (req, res) => {
    const body = req.body as { name?: unknown; discover?: unknown; type?: unknown };
    const name = String(body?.name ?? '').trim();
    if (!name || name.length > 300) {
      res.status(400).json({ error: 'name must be 1-300 characters' });
      return;
    }
    const softwareId = slugify(name);
    if (!isValidSoftwareId(softwareId)) {
      res.status(400).json({ error: 'name does not produce a usable id' });
      return;
    }

    const ref = db().collection(Collections.MASTER_REGISTRY).doc(softwareId);
    if ((await ref.get()).exists) {
      res.status(409).json({ error: 'Already in the catalog', softwareId });
      return;
    }

    const now = new Date().toISOString();
    await ref.set({
      name,
      slug: softwareId,
      type: body.type === 'topic' ? 'topic' : 'software',
      vendor: null,
      website: null,
      icon_url: null,
      github_url: null,
      rss_url: null,
      changelog_url: null,
      suggested_priority: ['github', 'rss', 'html'],
      active: true,
      lastCheck: null,
      createdBy: adminId(req),
      createdAt: now,
    });

    let discovered = false;
    let warning: string | null = null;
    if (body.discover !== false) {
      try {
        const discovery = await discoverSources(name);
        const metadata = {
          name: discovery.name || name,
          vendor: discovery.vendor ?? null,
          website: discovery.website ?? null,
          icon_url: discovery.icon_url ?? null,
          github_url: discovery.github_url ?? null,
          rss_url: discovery.rss_url ?? null,
          changelog_url: discovery.changelog_url ?? null,
          suggested_priority: discovery.suggested_priority ?? ['github', 'rss', 'html'],
          sourcesVerified: true,
          lastMetadataUpdate: now,
        };
        await ref.set(metadata, { merge: true });
        discovered = true;
      } catch (error) {
        captureException(error as Error, { operation: 'adminDiscover', softwareId });
        warning = 'Added, but source discovery failed. Edit the sources manually.';
      }
    }

    let taskId: string | null = null;
    try {
      taskId = await enqueuePoll({
        softwareId,
        softwareName: name,
        requestedBy: adminId(req),
        taskType: 'initial_poll',
      });
    } catch (error) {
      captureException(error as Error, { operation: 'adminCreatePoll', softwareId });
      warning = warning
        ? `${warning} The first poll could not be queued.`
        : 'Added, but the first poll could not be queued.';
    }
    await audit(req, 'registry.create', 'software', softwareId, null, { name, discovered });

    res.status(201).json({ softwareId, discovered, warning, taskId });
  });

  router.patch('/registry/:id', async (req, res) => {
    const softwareId = req.params.id;
    if (!isValidSoftwareId(softwareId)) {
      res.status(400).json({ error: 'Invalid software id' });
      return;
    }
    const parsed = validateRegistryPatch(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const ref = db().collection(Collections.MASTER_REGISTRY).doc(softwareId);
    const before = await ref.get();
    if (!before.exists) {
      res.status(404).json({ error: 'No such software' });
      return;
    }

    await ref.set(
      { ...parsed.value, lastMetadataUpdate: new Date().toISOString() },
      { merge: true },
    );
    await audit(req, 'registry.update', 'software', softwareId, snapshot(before.data()), parsed.value);
    res.json({ softwareId, updated: Object.keys(parsed.value) });
  });

  router.delete('/registry/:id', async (req, res) => {
    const softwareId = req.params.id;
    if (!isValidSoftwareId(softwareId)) {
      res.status(400).json({ error: 'Invalid software id' });
      return;
    }

    const ref = db().collection(Collections.MASTER_REGISTRY).doc(softwareId);
    const before = await ref.get();
    if (!before.exists) {
      res.status(404).json({ error: 'No such software' });
      return;
    }

    const confirmName = String((req.body as { confirmName?: unknown })?.confirmName ?? '');
    if (confirmName !== String(before.get('name') ?? '')) {
      res.status(400).json({ error: 'confirmName must match the catalog name exactly' });
      return;
    }

    const releases = await deleteWhere(Collections.RELEASE_NOTES, 'softwareId', softwareId);
    const interests = await deleteWhere(Collections.INTERESTS, 'softwareId', softwareId);
    await ref.delete();

    await audit(req, 'registry.delete', 'software', softwareId, snapshot(before.data()), {
      deletedReleases: releases,
      deletedInterests: interests,
    });
    res.json({ softwareId, deletedReleases: releases, deletedInterests: interests });
  });

  /** Re-run source discovery and merge anything it found. */
  router.post('/registry/:id/discover', async (req, res) => {
    const softwareId = req.params.id;
    const ref = db().collection(Collections.MASTER_REGISTRY).doc(softwareId);
    const before = await ref.get();
    if (!before.exists) {
      res.status(404).json({ error: 'No such software' });
      return;
    }

    try {
      const discovered = await discoverSources(String(before.get('name') ?? softwareId));
      const current = before.data() ?? {};
      const patch = {
        name: discovered.name || current.name,
        vendor: discovered.vendor ?? current.vendor ?? null,
        website: discovered.website ?? current.website ?? null,
        icon_url: discovered.icon_url ?? current.icon_url ?? null,
        github_url: discovered.github_url ?? current.github_url ?? null,
        rss_url: discovered.rss_url ?? current.rss_url ?? null,
        changelog_url: discovered.changelog_url ?? current.changelog_url ?? null,
        suggested_priority: discovered.suggested_priority ?? current.suggested_priority ?? null,
        sourcesVerified: true,
        lastMetadataUpdate: new Date().toISOString(),
      };
      await ref.set(patch, { merge: true });
      await audit(req, 'registry.discover', 'software', softwareId, current, patch);
      res.json({ softwareId, ...patch });
    } catch (error) {
      captureException(error as Error, { operation: 'adminResync', softwareId });
      res.status(502).json({ error: 'Source discovery failed' });
    }
  });

  router.post('/registry/:id/poll', async (req, res) => {
    const softwareId = req.params.id;
    const body = req.body as {
      includeHistory?: unknown;
      historyMaxCount?: unknown;
      historyMinDate?: unknown;
    };

    const ref = db().collection(Collections.MASTER_REGISTRY).doc(softwareId);
    const software = await ref.get();
    if (!software.exists) {
      res.status(404).json({ error: 'No such software' });
      return;
    }

    if (body.historyMaxCount !== undefined || body.historyMinDate !== undefined) {
      const parsed = validateRegistryPatch({
        ...(body.historyMaxCount !== undefined ? { historyMaxCount: body.historyMaxCount } : {}),
        ...(body.historyMinDate !== undefined ? { historyMinDate: body.historyMinDate } : {}),
      });
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      await ref.set(parsed.value, { merge: true });
    }

    const includeHistory = body.includeHistory === true;
    const taskId = await enqueuePoll({
      softwareId,
      softwareName: String(software.get('name') ?? softwareId),
      requestedBy: adminId(req),
      includeHistory,
      taskType: includeHistory ? 'history_scrape' : 'initial_poll',
    });
    await audit(req, 'registry.poll', 'software', softwareId, null, { includeHistory, taskId });
    res.json({ taskId, includeHistory });
  });

  /** Enqueue every active catalog entry. Used by the console's "Scan all". */
  router.post('/poll-all', async (req, res) => {
    const snap = await db()
      .collection(Collections.MASTER_REGISTRY)
      .where('active', '==', true)
      .limit(500)
      .get();

    let enqueued = 0;
    const failures: string[] = [];
    for (const doc of snap.docs) {
      try {
        await enqueuePoll({
          softwareId: doc.id,
          softwareName: String(doc.get('name') ?? doc.id),
          requestedBy: adminId(req),
          taskType: 'initial_poll',
        });
        enqueued += 1;
      } catch (error) {
        captureException(error as Error, { operation: 'adminPollAll', softwareId: doc.id });
        failures.push(doc.id);
      }
    }

    await audit(req, 'registry.pollAll', 'system', 'all', null, { enqueued, failures });
    res.json({ enqueued, failures });
  });

  // ---------------------------------------------------------------------
  // Release notes
  // ---------------------------------------------------------------------

  router.patch('/releases/:id', async (req, res) => {
    const noteId = req.params.id;
    const parsed = validateReleasePatch(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const ref = db().collection(Collections.RELEASE_NOTES).doc(noteId);
    const before = await ref.get();
    if (!before.exists) {
      res.status(404).json({ error: 'No such release' });
      return;
    }

    await ref.set(parsed.value, { merge: true });
    await audit(req, 'release.update', 'release', noteId, snapshot(before.data()), parsed.value);
    res.json({ noteId, updated: Object.keys(parsed.value) });
  });

  router.delete('/releases/:id', async (req, res) => {
    const noteId = req.params.id;
    const ref = db().collection(Collections.RELEASE_NOTES).doc(noteId);
    const before = await ref.get();
    if (!before.exists) {
      res.status(404).json({ error: 'No such release' });
      return;
    }

    const softwareId = String(before.get('softwareId') ?? '');
    await ref.delete();
    if (softwareId) await recomputeLastVersion([softwareId]);
    await audit(req, 'release.delete', 'release', noteId, snapshot(before.data()), null);

    res.json({ noteId, softwareId, lastVersionRecomputed: Boolean(softwareId) });
  });

  router.post('/releases/bulk-delete', async (req, res) => {
    const body = req.body as { softwareId?: unknown; noteIds?: unknown };
    const softwareId = String(body?.softwareId ?? '');
    const noteIds = Array.isArray(body?.noteIds)
      ? body.noteIds.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 500)
      : [];

    if (!softwareId || noteIds.length === 0) {
      res.status(400).json({ error: 'softwareId and at least one noteId are required' });
      return;
    }

    const refs = noteIds.map((id) => db().collection(Collections.RELEASE_NOTES).doc(id));
    const snaps = await db().getAll(...refs);
    const valid = snaps.filter((snap) => snap.exists && snap.get('softwareId') === softwareId);

    for (let i = 0; i < valid.length; i += 400) {
      const batch = db().batch();
      valid.slice(i, i + 400).forEach((snap) => batch.delete(snap.ref));
      await batch.commit();
    }

    await recomputeLastVersion([softwareId]);
    await audit(req, 'release.bulkDelete', 'software', softwareId, null, {
      requested: noteIds.length,
      deleted: valid.length,
    });

    res.json({ deleted: valid.length, skipped: noteIds.length - valid.length });
  });

  // ---------------------------------------------------------------------
  // Pipeline task log
  // ---------------------------------------------------------------------

  router.delete('/tasks/:id', async (req, res) => {
    const ref = db().collection(Collections.BACKGROUND_TASKS).doc(req.params.id);
    const before = await ref.get();
    if (!before.exists) {
      res.status(404).json({ error: 'No such task' });
      return;
    }
    await ref.delete();
    await audit(req, 'task.delete', 'task', req.params.id, snapshot(before.data()), null);
    res.json({ deleted: true });
  });

  // Last-resort handler for this router. The app has its own, but an admin
  // failure should not return an Express stack trace either.
  router.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    captureException(error, { operation: 'adminApi' });
    log.error('unhandled admin error', error);
    res.status(500).json({ error: 'Admin operation failed' });
  });

  return router;
}
