/**
 * Adds `searchKey` / `searchTokens` to every master_registry entry that lacks
 * them or has them stale. Additive and idempotent: it writes only those two
 * fields, and only where they differ. Run once after deploying the search change.
 *
 *   pnpm run backfill:search            # report only
 *   pnpm run backfill:search --write
 */
import { parseArgs } from 'node:util';
import { Collections, db } from '../src/lib/firebase.js';
import { searchFields } from '../src/lib/searchKey.js';

const { values } = parseArgs({
  allowPositionals: true,
  options: { write: { type: 'boolean', default: false } },
});

async function main(): Promise<void> {
  const snap = await db()
    .collection(Collections.MASTER_REGISTRY)
    .select('name', 'searchKey')
    .get();

  const writer = db().bulkWriter();
  let stale = 0;
  let failed = 0;

  for (const doc of snap.docs) {
    const name = String(doc.get('name') ?? doc.id);
    const fields = searchFields(name);
    if (doc.get('searchKey') === fields.searchKey) continue;
    stale += 1;
    if (values.write) {
      writer.update(doc.ref, fields).catch(() => {
        failed += 1;
      });
    }
  }

  await writer.close();
  console.log(
    `${snap.size} entries, ${stale} ${values.write ? 'updated' : 'need updating'}, ${failed} failed`,
  );
  if (!values.write && stale > 0) console.log('dry run: re-run with --write.');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
