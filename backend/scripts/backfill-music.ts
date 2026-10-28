/**
 * Queue a history backfill for music-tagged registry entries that have at least
 * one verified source. Each job is a normal `history_scrape` task, so progress is
 * visible in the admin console. Backfill never notifies (poller.pollHistory).
 *
 *   pnpm run backfill:music -- --only audacity     # one entry, to test
 *   pnpm run backfill:music                        # every verified music entry
 *   pnpm run backfill:music --dry-run              # list what would be queued
 */
import { parseArgs } from 'node:util';
import { Collections, db } from '../src/lib/firebase.js';
import { enqueuePoll } from '../src/services/pollRequests.js';

const { values } = parseArgs({
  allowPositionals: true,
  options: {
    only: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

async function main(): Promise<void> {
  const snap = await db()
    .collection(Collections.MASTER_REGISTRY)
    .where('tags', 'array-contains', 'music')
    .get();

  const targets = snap.docs.filter(
    (d) => d.get('sourcesVerified') === true && (!values.only || d.id === values.only),
  );
  console.log(`${targets.length} verified music entries selected`);

  for (const doc of targets) {
    // Already backfilled: re-running would only spend another model call.
    const existing = await db()
      .collection(Collections.RELEASE_NOTES)
      .where('softwareId', '==', doc.id)
      .limit(1)
      .get();
    if (!existing.empty) {
      console.log(`skip ${doc.id} (already has release notes)`);
      continue;
    }
    if (values['dry-run']) {
      console.log(`would queue ${doc.id}`);
      continue;
    }
    const taskId = await enqueuePoll({
      softwareId: doc.id,
      softwareName: String(doc.get('name') ?? doc.id),
      requestedBy: 'catalog-seed',
      includeHistory: true,
      taskType: 'history_scrape',
    });
    console.log(`queued ${doc.id} (task ${taskId})`);
  }
  // The Pub/Sub client keeps the event loop alive; exit explicitly when done.
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
