/**
 * Backfill release history for music entries using a LOCAL Ollama model instead
 * of Gemini. Runs on this machine: gathers sources with the same code as the
 * poller, extracts with Ollama, writes release_notes with the Admin SDK. Never
 * notifies (it writes documents directly; nothing is published).
 *
 *   pnpm run backfill:music:local -- --only lmms
 *   pnpm run backfill:music:local                 # every verified entry without notes
 *   options: --model qwen3:14b  --num-ctx 12288  --force (re-extract even if notes exist)
 */
import { parseArgs } from 'node:util';
import { Collections, db } from '../src/lib/firebase.js';
import { releaseDocumentId } from '../src/lib/version.js';
import { extractHistoryLocal } from '../src/services/ollama.js';
import { gatherSources } from '../src/services/scraper.js';
import type { Software } from '../src/lib/types.js';

const { values } = parseArgs({
  allowPositionals: true,
  options: {
    only: { type: 'string' },
    force: { type: 'boolean', default: false },
    model: { type: 'string', default: 'qwen3:14b' },
    'num-ctx': { type: 'string', default: '12288' },
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
  console.log(`${targets.length} candidates, model ${values.model}`);

  let saved = 0;
  for (const doc of targets) {
    const have = await db()
      .collection(Collections.RELEASE_NOTES)
      .where('softwareId', '==', doc.id)
      .limit(1)
      .get();
    if (!have.empty && !values.force) {
      console.log(`skip ${doc.id} (already has notes)`);
      continue;
    }

    const software = { id: doc.id, ...doc.data() } as Software;
    const started = Date.now();
    const chunks = await gatherSources(software, { history: true });
    if (chunks.length === 0) {
      console.log(`FAIL ${doc.id}: no sources resolved`);
      continue;
    }

    try {
      const items = await extractHistoryLocal(
        software.name,
        chunks.map((c) => c.text).join('\n\n---\n\n'),
        { model: values.model as string, numCtx: Number(values['num-ctx']) },
      );
      const batch = db().batch();
      for (const item of items) {
        batch.set(
          db().collection(Collections.RELEASE_NOTES).doc(releaseDocumentId(doc.id, item.version)),
          {
            ...item,
            softwareId: doc.id,
            softwareName: software.name,
            createdAt: new Date().toISOString(),
            isGenuineUpdate: true,
          },
          { merge: true },
        );
      }
      await batch.commit();
      saved += items.length;
      console.log(`ok   ${doc.id}: ${items.length} releases in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (error) {
      console.log(`FAIL ${doc.id}: ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`done, ${saved} releases saved`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
