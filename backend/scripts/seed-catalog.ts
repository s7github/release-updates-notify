/**
 * Seed master_registry from public catalogs (Homebrew formulae + casks,
 * endoflife.date). See src/services/catalogSeed.ts and ADR-0015.
 *
 * Dry run by default: fetches, merges, prints stats and writes a JSONL file.
 * Nothing touches Firestore unless --write is passed. Existing registry ids are
 * never overwritten.
 *
 *   doppler run -- pnpm run seed:catalog                       # dry run
 *   doppler run -- pnpm run seed:catalog --write --github-only # real run
 *
 * --write needs Application Default Credentials and FIRESTORE_DATABASE_ID set
 * (docs/SETUP.md), the same as the services.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  loadCasks,
  loadEol,
  loadFormulae,
  mergeEntries,
  toRegistryDoc,
  type SeedEntry,
} from '../src/services/catalogSeed.js';

const { values } = parseArgs({
  // pnpm forwards a literal `--` when one is typed; ignore it.
  allowPositionals: true,
  options: {
    write: { type: 'boolean', default: false },
    'github-only': { type: 'boolean', default: false },
    sources: { type: 'string', default: 'eol,cask,formula' },
    limit: { type: 'string' },
    out: { type: 'string', default: 'seed-catalog.jsonl' },
  },
});

const wanted = new Set((values.sources ?? '').split(',').map((s) => s.trim()));

async function main(): Promise<void> {
  const batches: SeedEntry[][] = [];
  // Trust order: curated first, then GUI apps, then CLI packages.
  if (wanted.has('eol')) batches.push(await loadEol());
  if (wanted.has('cask')) batches.push(await loadCasks());
  if (wanted.has('formula')) batches.push(await loadFormulae());

  let entries = mergeEntries(batches.flat());
  const total = entries.length;
  if (values['github-only']) entries = entries.filter((e) => e.github_url);
  if (values.limit) entries = entries.slice(0, Number(values.limit));

  const withGithub = entries.filter((e) => e.github_url).length;
  const withChangelog = entries.filter((e) => e.changelog_url).length;
  console.log(
    `merged ${total} unique products; selected ${entries.length} ` +
      `(${withGithub} with a GitHub repo, ${withChangelog} with a changelog page)`,
  );

  const now = new Date().toISOString();
  writeFileSync(
    values.out as string,
    entries.map((e) => JSON.stringify({ id: e.id, ...toRegistryDoc(e, now) })).join('\n') + '\n',
  );
  console.log(`wrote ${values.out}`);

  if (!values.write) {
    console.log('dry run: Firestore untouched. Re-run with --write to import.');
    return;
  }

  // Imported lazily so a dry run needs no Firebase credentials at all.
  const { db, Collections } = await import('../src/lib/firebase.js');
  const writer = db().bulkWriter();
  let created = 0;
  let skipped = 0;
  let failed = 0;

  writer.onWriteError((error) => {
    // 6 = ALREADY_EXISTS: someone added it first; leave their entry alone.
    if (error.code === 6) return false;
    return error.failedAttempts < 5;
  });

  for (const entry of entries) {
    const ref = db().collection(Collections.MASTER_REGISTRY).doc(entry.id);
    writer.create(ref, toRegistryDoc(entry, now)).then(
      () => (created += 1),
      (error: { code?: number }) => {
        if (error.code === 6) skipped += 1;
        else failed += 1;
      },
    );
  }

  await writer.close();
  console.log(`created ${created}, already existed ${skipped}, failed ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
