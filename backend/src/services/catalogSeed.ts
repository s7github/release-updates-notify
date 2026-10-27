import axios from 'axios';
import { slugify } from '../lib/adminValidation.js';

/**
 * Bulk catalog seeding from public software catalogs.
 *
 * Homebrew (formulae + casks) lists ~16k packages and apps with homepages and,
 * for most, a GitHub repo; endoflife.date lists ~500 products with the vendor's
 * release-policy page. None of that needs a model: it is exactly the
 * `github_url` / `website` / `changelog_url` data discovery would otherwise pay
 * Gemini to guess. The mappers are pure so they can be tested offline.
 */

export type SeedOrigin = 'homebrew-formula' | 'homebrew-cask' | 'endoflife';

export interface SeedEntry {
  id: string;
  name: string;
  website: string | null;
  github_url: string | null;
  changelog_url: string | null;
  description: string | null;
  origins: SeedOrigin[];
}

interface BrewFormula {
  name?: string;
  desc?: string | null;
  homepage?: string | null;
  deprecated?: boolean;
  disabled?: boolean;
  urls?: { stable?: { url?: string }; head?: { url?: string } };
}

interface BrewCask {
  token?: string;
  name?: string[];
  desc?: string | null;
  homepage?: string | null;
  url?: string | null;
  deprecated?: boolean;
  disabled?: boolean;
}

export interface EolProduct {
  name: string;
  label?: string;
  links?: { html?: string; releasePolicy?: string | null };
}

const NOT_A_REPO_OWNER = new Set(['sponsors', 'orgs', 'features', 'topics', 'marketplace', 'settings']);

/** `https://github.com/o/r/archive/x.tar.gz` -> `https://github.com/o/r`, else null. */
export function githubRepoUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i);
  if (!match) return null;
  const owner = match[1] as string;
  const repo = (match[2] as string).replace(/\.git$/, '');
  if (!repo || NOT_A_REPO_OWNER.has(owner.toLowerCase())) return null;
  return `https://github.com/${owner}/${repo}`;
}

function cleanUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** `python@3.12` and friends are version pins of one product; they only add noise. */
function isVersionPin(name: string): boolean {
  return /@\d/.test(name);
}

export function mapFormula(f: BrewFormula): SeedEntry | null {
  if (!f.name || f.deprecated || f.disabled || isVersionPin(f.name)) return null;
  const id = slugify(f.name);
  if (!id) return null;
  return {
    id,
    name: f.name,
    website: cleanUrl(f.homepage),
    github_url:
      githubRepoUrl(f.homepage) ??
      githubRepoUrl(f.urls?.stable?.url) ??
      githubRepoUrl(f.urls?.head?.url),
    changelog_url: null,
    description: f.desc ?? null,
    origins: ['homebrew-formula'],
  };
}

export function mapCask(c: BrewCask): SeedEntry | null {
  if (!c.token || c.deprecated || c.disabled) return null;
  const name = c.name?.[0] ?? c.token;
  const id = slugify(name) || slugify(c.token);
  if (!id) return null;
  return {
    id,
    name,
    website: cleanUrl(c.homepage),
    github_url: githubRepoUrl(c.homepage) ?? githubRepoUrl(c.url),
    changelog_url: null,
    description: c.desc ?? null,
    origins: ['homebrew-cask'],
  };
}

export function mapEol(p: EolProduct): SeedEntry | null {
  const name = p.label ?? p.name;
  const id = slugify(name);
  if (!id) return null;
  const policy = cleanUrl(p.links?.releasePolicy);
  return {
    id,
    name,
    // The endoflife.date page is an aggregator, not the vendor, so it is never
    // used as the website. The vendor's release-policy page is a good changelog.
    website: null,
    github_url: githubRepoUrl(policy),
    changelog_url: policy,
    description: null,
    origins: ['endoflife'],
  };
}

/**
 * Merges entries that share an id, first non-null value winning per field. Pass
 * them in trust order (curated catalog first). Origins accumulate.
 */
export function mergeEntries(entries: SeedEntry[]): SeedEntry[] {
  const byId = new Map<string, SeedEntry>();
  for (const e of entries) {
    const existing = byId.get(e.id);
    if (!existing) {
      byId.set(e.id, { ...e, origins: [...e.origins] });
      continue;
    }
    existing.website ??= e.website;
    existing.github_url ??= e.github_url;
    existing.changelog_url ??= e.changelog_url;
    existing.description ??= e.description;
    for (const o of e.origins) if (!existing.origins.includes(o)) existing.origins.push(o);
  }
  return [...byId.values()];
}

/** The Firestore document for an entry. Mirrors docs/DATA_MODEL.md. */
export function toRegistryDoc(entry: SeedEntry, nowIso: string): Record<string, unknown> {
  const priority: string[] = [];
  if (entry.github_url) priority.push('github');
  if (entry.changelog_url || entry.website) priority.push('html');
  return {
    name: entry.name,
    slug: entry.id,
    type: 'software',
    vendor: null,
    website: entry.website,
    icon_url: null,
    github_url: entry.github_url,
    rss_url: null,
    changelog_url: entry.changelog_url,
    suggested_priority: priority.length > 0 ? priority : ['github', 'rss', 'html'],
    // Visible in catalog search (the web client filters on active==true) but
    // never polled until someone asks: the scheduler's `lastCheck < cutoff`
    // query does not match a null lastCheck.
    active: true,
    lastCheck: null,
    // Honest about provenance: nobody has confirmed these sources work.
    sourcesVerified: false,
    seededFrom: entry.origins,
    createdBy: 'catalog-seed',
    createdAt: nowIso,
  };
}

const HTTP = { timeout: 120_000, maxContentLength: 200_000_000 };

export async function loadFormulae(): Promise<SeedEntry[]> {
  const res = await axios.get<BrewFormula[]>('https://formulae.brew.sh/api/formula.json', HTTP);
  return res.data.map(mapFormula).filter((e): e is SeedEntry => e !== null);
}

export async function loadCasks(): Promise<SeedEntry[]> {
  const res = await axios.get<BrewCask[]>('https://formulae.brew.sh/api/cask.json', HTTP);
  return res.data.map(mapCask).filter((e): e is SeedEntry => e !== null);
}

export async function loadEol(concurrency = 8): Promise<SeedEntry[]> {
  const list = await axios.get<{ result: Array<{ name: string; label?: string }> }>(
    'https://endoflife.date/api/v1/products/',
    HTTP,
  );
  const products = list.data.result;
  const out: SeedEntry[] = [];
  let next = 0;

  // The list endpoint has no links, so each product is fetched once; a small
  // pool keeps this polite to a free public API.
  async function worker(): Promise<void> {
    while (next < products.length) {
      const p = products[next++] as { name: string; label?: string };
      try {
        const res = await axios.get<{ result: EolProduct }>(
          `https://endoflife.date/api/v1/products/${encodeURIComponent(p.name)}`,
          { timeout: 20_000 },
        );
        const entry = mapEol(res.data.result);
        if (entry) out.push(entry);
      } catch {
        const entry = mapEol(p);
        if (entry) out.push(entry);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}
