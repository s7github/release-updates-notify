import axios from 'axios';
import * as cheerio from 'cheerio';
import { isIP } from 'node:net';
import { log } from '../lib/logging.js';
import { discoverSources } from './gemini.js';
import type { DiscoveredSource } from '../lib/types.js';
import {
  fetchNpmDoc,
  fetchPypiDoc,
  repoSlug,
  summariseNpm,
  summarisePypi,
} from './registries.js';

/**
 * Deterministic source discovery that runs before (and cheaper than) the model.
 *
 * Gemini's search-grounded guess is the fallback, not the first resort. The
 * cascade here fills what it left empty: feeds advertised by the homepage, the
 * conventional changelog paths, and registry packages that provably belong to
 * the product's repository.
 */

const FEED_TYPES = /application\/(?:rss|atom)\+xml|application\/xml|text\/xml/i;
const CHANGELOG_PATHS = ['/changelog', '/releases', '/release-notes', '/whats-new', '/updates'];
const FEED_PATHS = ['/feed', '/feed.xml', '/rss.xml', '/atom.xml', '/changelog.xml', '/releases.atom'];

const PROBE = {
  timeout: 8_000,
  maxRedirects: 3,
  maxContentLength: 2_000_000,
  validateStatus: (s: number) => s >= 200 && s < 300,
  // A public host can still redirect to an internal one; re-check every hop.
  beforeRedirect: (options: { href?: string }) => {
    if (!options.href || !isPublicHttpUrl(options.href)) {
      throw new Error('redirect to a non-public address blocked');
    }
  },
  headers: { 'User-Agent': 'UpdateNotify-Discovery/1.0 (+release tracker)' },
} as const;

/**
 * The website value comes from a model reading the open web, so it is untrusted
 * input to a server-side fetch. Refuse anything that is not a plain public
 * http(s) host, which closes off the cloud metadata endpoint and localhost.
 */
export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    return false;
  }
  if (!host.includes('.') && isIP(host) === 0) return false;
  if (isIP(host) !== 0) {
    // Any literal IP: only allow it if it is clearly not private/loopback/link-local.
    if (/^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.)/.test(host)) return false;
    if (host === '::1' || /^(?:fc|fd|fe80)/i.test(host)) return false;
  }
  return true;
}

/** Feed URLs a page advertises through `<link rel="alternate">`, resolved and de-duplicated. */
export function extractFeedLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const found = new Set<string>();
  $('link[rel~="alternate"]').each((_, el) => {
    const type = $(el).attr('type') ?? '';
    const href = $(el).attr('href');
    if (!href || !FEED_TYPES.test(type)) return;
    try {
      found.add(new URL(href, baseUrl).toString());
    } catch {
      /* malformed href: skip */
    }
  });
  return [...found];
}

/** True if the body looks like an RSS/Atom document rather than an HTML error page. */
export function looksLikeFeed(body: string): boolean {
  return /<(?:rss|feed|rdf:RDF)[\s>]/i.test(body.slice(0, 2000));
}

/** True if a page plausibly holds release notes: several version-shaped tokens. */
export function looksLikeChangelog(html: string): boolean {
  const text = cheerio.load(html)('body').text();
  const versions = text.match(/\bv?\d+\.\d+(?:\.\d+)?\b/g) ?? [];
  return versions.length >= 3 && /release|changelog|what.?s new|version/i.test(text.slice(0, 20_000));
}

async function get(url: string): Promise<string | null> {
  if (!isPublicHttpUrl(url)) return null;
  try {
    const res = await axios.get<string>(url, { ...PROBE, responseType: 'text' });
    return typeof res.data === 'string' ? res.data : null;
  } catch {
    return null;
  }
}

export async function findFeed(website: string): Promise<string | null> {
  const home = await get(website);
  if (home) {
    for (const candidate of extractFeedLinks(home, website)) {
      const body = await get(candidate);
      if (body && looksLikeFeed(body)) return candidate;
    }
  }
  const origin = new URL(website).origin;
  for (const path of FEED_PATHS) {
    const candidate = origin + path;
    const body = await get(candidate);
    if (body && looksLikeFeed(body)) return candidate;
  }
  return null;
}

export async function findChangelogPage(website: string): Promise<string | null> {
  const origin = new URL(website).origin;
  for (const path of CHANGELOG_PATHS) {
    const candidate = origin + path;
    const body = await get(candidate);
    if (body && looksLikeChangelog(body)) return candidate;
  }
  return null;
}

/**
 * Registry names to try, derived from the repository name. A registry entry is
 * accepted only if it declares the **same repository**, so a squatted or merely
 * similar name can never attach the wrong product's releases.
 */
export async function findRegistryPackages(
  githubUrl: string,
): Promise<{ npm: string | null; pypi: string | null }> {
  const slug = repoSlug(githubUrl);
  if (!slug) return { npm: null, pypi: null };
  const repoName = slug.split('/')[1] ?? '';

  const npmDoc = await fetchNpmDoc(repoName);
  const npm =
    npmDoc && repoSlug(summariseNpm(npmDoc).repositoryUrl) === slug ? repoName : null;

  const pypiDoc = await fetchPypiDoc(repoName);
  const pypi =
    pypiDoc && repoSlug(summarisePypi(pypiDoc).repositoryUrl) === slug ? repoName : null;

  return { npm, pypi };
}

/**
 * Fills the gaps in a model-produced discovery. Never overwrites a value the
 * model already supplied, and never throws: discovery must still succeed with
 * whatever it had before.
 */
export async function enrichDiscovery(found: DiscoveredSource): Promise<DiscoveredSource> {
  const out: DiscoveredSource = { ...found };
  try {
    if (out.website && isPublicHttpUrl(out.website)) {
      if (!out.rss_url) out.rss_url = await findFeed(out.website);
      if (!out.changelog_url) out.changelog_url = await findChangelogPage(out.website);
    }
    if (out.github_url && !out.npm_package && !out.pypi_package) {
      const pkgs = await findRegistryPackages(out.github_url);
      out.npm_package = pkgs.npm;
      out.pypi_package = pkgs.pypi;
    }

    // Order sources by how exact they are; the model's own suggestion is kept
    // only as a tiebreak for tiers we have no deterministic opinion on.
    const order: string[] = [];
    if (out.npm_package) order.push('npm');
    if (out.pypi_package) order.push('pypi');
    if (out.github_url) order.push('github');
    if (out.rss_url) order.push('rss');
    if (out.changelog_url || out.website) order.push('html');
    if (order.length > 0) out.suggested_priority = order;
  } catch (error) {
    log.warn('discovery enrichment failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return out;
}

/** The entry point routes use: deterministic cascade first, model as the base layer. */
export async function discoverAll(query: string): Promise<DiscoveredSource> {
  return enrichDiscovery(await discoverSources(query));
}
