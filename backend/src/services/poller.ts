import { PubSub } from '@google-cloud/pubsub';
import { config } from '../lib/config.js';
import { Collections, db } from '../lib/firebase.js';
import { log } from '../lib/logging.js';
import { isNewerThan, releaseDocumentId } from '../lib/version.js';
import type {
  ExtractedRelease,
  MetadataLearnings,
  ReleasePublishedMessage,
  Software,
} from '../lib/types.js';
import { extractHistory, extractRelease, searchLatestRelease } from './gemini.js';
import { gatherSources, effectivePriority } from './scraper.js';
import { progressReporter, updateTask } from './tasks.js';

/**
 * The poller.
 *
 * Fetches every source that responds, extracts a structured release, and — only
 * when the version is genuinely new — publishes to the notification stage.
 *
 * Ported from `web/src/services/pollService.ts`, with one substantive change:
 * **the genuine-update gate** (ADR-0008). The web app wrote a release note on
 * every poll and had no notifications, so re-extracting the same version was
 * harmless. Here it would notify every subscriber again, which is the fastest
 * way to lose them.
 */

let pubsub: PubSub | undefined;
function client(): PubSub {
  if (!pubsub) pubsub = new PubSub();
  return pubsub;
}

export async function getSoftware(softwareId: string): Promise<Software | null> {
  const snap = await db().collection(Collections.MASTER_REGISTRY).doc(softwareId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<Software, 'id'>) };
}

export interface PollResult {
  softwareId: string;
  version: string | null;
  isNewVersion: boolean;
  notified: boolean;
}

export async function pollSoftware(
  softwareId: string,
  options: { taskId?: string } = {},
): Promise<PollResult> {
  const { taskId } = options;
  const report = progressReporter(taskId);

  const software = await getSoftware(softwareId);
  if (!software) {
    await updateTask(taskId, { status: 'failed', error: `Unknown software ${softwareId}` });
    throw new Error(`Unknown software ${softwareId}`);
  }

  try {
    await report(10, 'Determining sources…', {
      activePriority: effectivePriority(software),
    });

    const chunks = await gatherSources(software);
    await report(40, `Gathered ${chunks.length} source(s)`, {
      sources: chunks.map((c) => c.source),
    });

    const rawData = chunks.map((c) => c.text).join('\n\n---\n\n');

    let extracted: ExtractedRelease | null = null;
    if (chunks.length > 0) {
      await report(60, 'Extracting with Gemini…');
      try {
        extracted = await extractRelease(software.name, rawData);
      } catch (error) {
        log.warn('direct extraction failed, will try search', {
          softwareId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fall back to search grounding when the configured sources yielded nothing
    // usable. This is the "10-tier" hierarchy's last tier.
    if (!extracted?.version || !extracted.isGenuineUpdate) {
      await report(70, 'Sources inconclusive; searching the web…');
      extracted = await searchLatestRelease(software.name);
    }

    if (!extracted?.version) {
      // Record the attempt even on failure, so a dead source is visible as a
      // stale lastCheck rather than as silence.
      await touchLastCheck(softwareId);
      await updateTask(taskId, {
        status: 'failed',
        error: `No version could be resolved for ${software.name}`,
        message: 'No release found',
      });
      return { softwareId, version: null, isNewVersion: false, notified: false };
    }

    if (extracted.metadataLearnings) {
      await report(80, 'Applying metadata corrections…');
      await applyLearnings(software, extracted.metadataLearnings);
    }

    // --- The genuine-update gate. The most important check in the pipeline. ---
    const isNewVersion = isNewerThan(extracted.version, software.lastVersion);

    await report(90, isNewVersion ? 'New release found' : 'No change since last check');

    await writeRelease(software, extracted, rawData);
    await db().collection(Collections.MASTER_REGISTRY).doc(softwareId).set(
      {
        lastVersion: extracted.version,
        lastReleaseDate: extracted.releaseDate ?? new Date().toISOString(),
        lastCheck: new Date().toISOString(),
      },
      { merge: true },
    );

    let notified = false;
    if (isNewVersion) {
      await publishRelease({
        softwareId,
        softwareName: software.name,
        version: extracted.version,
        category: extracted.category,
        summary: extracted.summary,
        releaseId: releaseDocumentId(softwareId, extracted.version),
      });
      notified = true;
    }

    await updateTask(taskId, {
      status: 'completed',
      progress: 100,
      message: isNewVersion
        ? `Found ${extracted.version}`
        : `Already up to date at ${extracted.version}`,
    });

    return { softwareId, version: extracted.version, isNewVersion, notified };
  } catch (error) {
    log.error('poll failed', error, { softwareId });
    await touchLastCheck(softwareId);
    await updateTask(taskId, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      message: 'Poll failed',
    });
    throw error;
  }
}

/** Bulk history ingest. Never notifies — backfilling is not news. */
export async function pollHistory(
  softwareId: string,
  options: { taskId?: string } = {},
): Promise<number> {
  const { taskId } = options;
  const report = progressReporter(taskId);

  const software = await getSoftware(softwareId);
  if (!software) throw new Error(`Unknown software ${softwareId}`);

  await report(15, 'Gathering historical sources…');
  const chunks = await gatherSources(software, { history: true });
  if (chunks.length === 0) {
    await updateTask(taskId, { status: 'failed', error: 'No historical sources resolved' });
    return 0;
  }

  await report(50, 'Bulk extracting history…');
  let history = await extractHistory(software.name, chunks.map((c) => c.text).join('\n\n---\n\n'));

  if (software.historyMinDate) {
    const min = new Date(software.historyMinDate).getTime();
    history = history.filter((item) => {
      const d = item.releaseDate ? new Date(item.releaseDate).getTime() : NaN;
      return Number.isNaN(d) || d >= min;
    });
  }
  if (software.historyMaxCount && software.historyMaxCount > 0) {
    history = history.slice(0, software.historyMaxCount);
  }

  await report(75, `Saving ${history.length} historical releases…`);

  // Batched: 100 individual writes is 100 round trips, and Firestore caps a
  // batch at 500 operations.
  const BATCH = 400;
  for (let i = 0; i < history.length; i += BATCH) {
    const batch = db().batch();
    for (const item of history.slice(i, i + BATCH)) {
      if (!item.version) continue;
      const ref = db()
        .collection(Collections.RELEASE_NOTES)
        .doc(releaseDocumentId(softwareId, item.version));
      batch.set(
        ref,
        {
          ...item,
          softwareId,
          softwareName: software.name,
          createdAt: new Date().toISOString(),
          isGenuineUpdate: true,
        },
        { merge: true },
      );
    }
    await batch.commit();
  }

  await updateTask(taskId, {
    status: 'completed',
    progress: 100,
    message: `Saved ${history.length} historical releases`,
  });
  return history.length;
}

async function writeRelease(
  software: Software,
  extracted: ExtractedRelease,
  rawData: string,
): Promise<void> {
  // Deterministic id: Pub/Sub is at-least-once and Gemini is non-deterministic,
  // so the same release will be extracted more than once. A derived id makes
  // that an idempotent overwrite rather than a duplicate card in the feed.
  const id = releaseDocumentId(software.id, extracted.version);

  await db().collection(Collections.RELEASE_NOTES).doc(id).set(
    {
      softwareId: software.id,
      softwareName: software.name,
      version: extracted.version,
      releaseDate: extracted.releaseDate ?? new Date().toISOString(),
      category: extracted.category,
      summary: extracted.summary,
      isGenuineUpdate: extracted.isGenuineUpdate,
      createdAt: new Date().toISOString(),
      // Debug only, never displayed. Capped because it is untrusted scraped text.
      rawData: rawData.slice(0, 5_000),
    },
    { merge: true },
  );
}

/**
 * Self-correction: the model often finds a better source URL than the one it was
 * given. Applying those is what makes the registry improve as it runs.
 */
async function applyLearnings(
  software: Software,
  learnings: MetadataLearnings,
): Promise<void> {
  const updates: Record<string, string> = {};
  const changes: string[] = [];

  const fields = ['vendor', 'website', 'github_url', 'rss_url', 'changelog_url'] as const;
  for (const field of fields) {
    const proposed = learnings[field];
    if (proposed && proposed !== software[field]) {
      updates[field] = proposed;
      changes.push(`${field}: ${software[field] ?? 'none'} -> ${proposed}`);
    }
  }

  if (changes.length === 0) return;

  await db().collection(Collections.MASTER_REGISTRY).doc(software.id).set(updates, { merge: true });
  await db().collection(Collections.SYSTEM_LEARNINGS).add({
    type: 'source_correction',
    softwareId: software.id,
    softwareName: software.name,
    description: 'Automatic metadata correction from a successful extraction.',
    newValue: JSON.stringify(updates),
    impact: changes.join('; '),
    confidence: 0.9,
    applied: true,
    createdAt: new Date().toISOString(),
  });
}

async function touchLastCheck(softwareId: string): Promise<void> {
  await db()
    .collection(Collections.MASTER_REGISTRY)
    .doc(softwareId)
    .set({ lastCheck: new Date().toISOString() }, { merge: true })
    .catch(() => undefined);
}

async function publishRelease(message: ReleasePublishedMessage): Promise<void> {
  await client()
    .topic(config.topics.releasePublished)
    .publishMessage({ json: message });
  log.info('published release', {
    softwareId: message.softwareId,
    version: message.version,
  });
}

/**
 * Enqueues everything due for a check. Called by Cloud Scheduler.
 *
 * Publishes to a queue rather than polling inline: 5,000 catalog items must not
 * become 5,000 concurrent scrapes (ADR-0004).
 */
export async function enqueueDuePolls(olderThanMinutes: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();

  const snapshot = await db()
    .collection(Collections.MASTER_REGISTRY)
    .where('active', '==', true)
    .where('lastCheck', '<', cutoff)
    .orderBy('lastCheck', 'asc')
    .limit(500)
    .get();

  const topic = client().topic(config.topics.pollRequests);
  await Promise.all(
    snapshot.docs.map((doc) => topic.publishMessage({ json: { softwareId: doc.id } })),
  );

  log.info('enqueued due polls', { count: snapshot.size, cutoff });
  return snapshot.size;
}
