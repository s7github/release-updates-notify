/**
 * Seed curated music software (DAWs, plugins, DJ and notation tools) into
 * master_registry with **verified** sources. See data/music-software.json.
 *
 * Every declared URL is fetched live; a changelog that does not look like one is
 * dropped, missing feeds/changelogs are looked for with the discovery probes, and
 * GitHub repos are kept only if they publish releases. Dry run unless --write.
 * An existing entry is only updated if the catalog seed created it, and never if
 * it looks like a different product that merely shares the id (e.g. Helm).
 *
 *   pnpm run seed:music            # dry run: prints the verification report
 *   pnpm run seed:music --write
 */
import axios from 'axios';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { slugify } from '../src/lib/adminValidation.js';
import { findChangelogPage, findFeed, looksLikeChangelog } from '../src/services/discovery.js';
import { repoSlug } from '../src/services/registries.js';
import { toRegistryDoc, type SeedEntry } from '../src/services/catalogSeed.js';
import { fetchGitHubReleases } from '../src/services/scraper.js';

interface CuratedMusic {
  id?: string;
  name: string;
  vendor: string;
  website: string;
  github_url?: string;
  changelog_url?: string;
}

const { values } = parseArgs({
  allowPositionals: true,
  options: { write: { type: 'boolean', default: false } },
});

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36' };

async function body(url: string): Promise<string | null> {
  try {
    const res = await axios.get<string>(url, {
      timeout: 15_000,
      maxRedirects: 5,
      responseType: 'text',
      headers: UA,
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return typeof res.data === 'string' ? res.data : null;
  } catch {
    return null;
  }
}

const host = (u: string | null | undefined): string =>
  u ? new URL(u).hostname.replace(/^www\./, '') : '';

function sameProduct(existing: Record<string, unknown>, mine: { github_url: string | null; website: string }): boolean {
  const eg = repoSlug(existing.github_url as string | null);
  const mg = repoSlug(mine.github_url);
  if (eg && mg) return eg === mg;
  const eh = host(existing.website as string | null);
  const mh = host(mine.website);
  if (!eh) return true; // nothing to contradict
  return eh === mh || eh.endsWith(`.${mh}`) || mh.endsWith(`.${eh}`);
}

interface Row {
  id: string;
  doc: Record<string, unknown>;
  notes: string[];
}

async function verify(item: CuratedMusic, now: string): Promise<Row> {
  const notes: string[] = [];
  const id = item.id ?? slugify(item.name);

  const siteOk = (await body(item.website)) !== null;
  if (!siteOk) notes.push('website unreachable');

  let changelog: string | null = null;
  if (item.changelog_url) {
    const text = await body(item.changelog_url);
    if (text && looksLikeChangelog(text)) changelog = item.changelog_url;
    else notes.push(`declared changelog rejected (${text ? 'not changelog-like' : 'unreachable'})`);
  }

  let github: string | null = null;
  if (item.github_url) {
    try {
      github = (await fetchGitHubReleases(item.github_url, 3)) ? item.github_url : null;
    } catch {
      github = null;
    }
    if (!github) notes.push('github repo has no releases');
  }

  let rss: string | null = null;
  if (siteOk) {
    rss = await findFeed(item.website);
    if (!changelog) changelog = await findChangelogPage(item.website);
    if (rss) notes.push('feed found');
    if (changelog && !item.changelog_url) notes.push('changelog found by probe');
  }

  const entry: SeedEntry = {
    id,
    name: item.name,
    website: item.website,
    github_url: github,
    changelog_url: changelog,
    description: null,
    origins: ['curated-music'],
  };
  const priority = [github && 'github', rss && 'rss', (changelog || siteOk) && 'html'].filter(
    Boolean,
  ) as string[];

  return {
    id,
    notes,
    doc: {
      ...toRegistryDoc(entry, now),
      vendor: item.vendor,
      rss_url: rss,
      tags: ['music'],
      suggested_priority: priority.length > 0 ? priority : ['html'],
      sourcesVerified: Boolean(github || changelog || rss),
    },
  };
}

async function main(): Promise<void> {
  const items = JSON.parse(
    readFileSync(new URL('../data/music-software.json', import.meta.url), 'utf8'),
  ) as CuratedMusic[];
  const now = new Date().toISOString();

  const rows: Row[] = [];
  for (const item of items) {
    const row = await verify(item, now);
    rows.push(row);
    const d = row.doc;
    console.log(
      `${d.sourcesVerified ? 'OK ' : '-- '} ${row.id.padEnd(22)} ` +
        `gh:${d.github_url ? 'y' : '-'} rss:${d.rss_url ? 'y' : '-'} log:${d.changelog_url ? 'y' : '-'} ` +
        row.notes.join('; '),
    );
  }
  const verified = rows.filter((r) => r.doc.sourcesVerified).length;
  console.log(`\n${rows.length} entries, ${verified} with at least one verified source`);

  if (!values.write) {
    console.log('dry run: Firestore untouched. Re-run with --write.');
    return;
  }

  const { db, Collections } = await import('../src/lib/firebase.js');
  let created = 0;
  let updated = 0;
  const skipped: string[] = [];
  for (const row of rows) {
    const ref = db().collection(Collections.MASTER_REGISTRY).doc(row.id);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.create(row.doc);
      created += 1;
      continue;
    }
    const existing = snap.data() ?? {};
    const ours = existing.createdBy === 'catalog-seed';
    const mine = { github_url: row.doc.github_url as string | null, website: row.doc.website as string };
    if (!ours || !sameProduct(existing, mine)) {
      skipped.push(`${row.id} (${ours ? 'different product, same id' : 'not a seeded entry'})`);
      continue;
    }
    // Enrich in place; keep identity and poll state untouched.
    const { createdAt: _c, createdBy: _b, lastCheck: _l, active: _a, ...patch } = row.doc;
    await ref.set(patch, { merge: true });
    updated += 1;
  }
  console.log(`created ${created}, updated ${updated}, skipped ${skipped.length}`);
  for (const s of skipped) console.log(`  skipped: ${s}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
