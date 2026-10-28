import axios, { type AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import Parser from 'rss-parser';
import { config } from '../lib/config.js';
import { parseToIso } from '../lib/dates.js';
import { versionFromLabel, type StructuredRelease } from '../lib/deterministic.js';
import { log } from '../lib/logging.js';
import type { Software } from '../lib/types.js';
import { fetchNpmDoc, fetchPypiDoc, summariseNpm, summarisePypi } from './registries.js';

/**
 * Source fetching, ported from `web/server.ts`.
 *
 * On the web this existed only to defeat browser CORS. Here it exists because
 * scraping belongs on a server: the work is done **once per software item** and
 * shared by every subscriber, rather than once per user (ADR-0003).
 */

const parser = new Parser();

const BROWSER_HEADERS = {
  // Plenty of vendor sites serve a different page, or a 403, to an obvious bot.
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const REQUEST: AxiosRequestConfig = {
  headers: BROWSER_HEADERS,
  timeout: 20_000,
  // Vendor sites redirect a lot; a cap stops a redirect loop becoming a hang.
  maxRedirects: 5,
  validateStatus: (status) => status >= 200 && status < 400,
};

/**
 * Resolution order: admin override, then AI suggestion, then a sane default.
 *
 * A vendor's RSS feed is sometimes better maintained than its GitHub releases
 * page, and sometimes catastrophically worse — hence the per-software override.
 */
export function effectivePriority(software: Software): string[] {
  if (software.priority_order) {
    return software.priority_order.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  if (Array.isArray(software.suggested_priority) && software.suggested_priority.length > 0) {
    return software.suggested_priority.map((s) => s.trim().toLowerCase());
  }
  return ['github', 'rss', 'html'];
}

export interface SourceChunk {
  source: string;
  url: string;
  text: string;
  /**
   * Versions parsed from a JSON source (GitHub, npm, PyPI). Present only where the
   * source states a version outright, so it can be compared without the model.
   */
  releases?: StructuredRelease[];
  /** ETag the source sent (GitHub), stored so the next poll can ask "changed?". */
  etag?: string;
  /** The source answered 304: nothing changed since the stored ETag. */
  notModified?: boolean;
}

/** GitHub Releases API objects -> comparable releases. Drafts are never real. */
export function structuredFromGithub(
  releases: Array<Record<string, unknown>>,
): StructuredRelease[] {
  const out: StructuredRelease[] = [];
  for (const r of releases) {
    if (r.draft === true) continue;
    const version =
      versionFromLabel(typeof r.tag_name === 'string' ? r.tag_name : null) ??
      versionFromLabel(typeof r.name === 'string' ? r.name : null);
    if (!version) continue;
    const date = r.published_at ?? r.created_at;
    out.push({
      version,
      releaseDate: typeof date === 'string' ? date : null,
      notes: typeof r.body === 'string' && r.body.trim() ? r.body : null,
      prerelease: r.prerelease === true,
    });
  }
  return out;
}

/** Turns a repo URL into the Releases API path. Returns null if it is not one. */
export function githubApiUrl(repoUrl: string, perPage = 3): string | null {
  const clean = repoUrl.replace(/\/+$/, '').replace(/\.git$/, '');
  const parts = clean.split('github.com/');
  if (parts.length < 2) return null;
  const repoPath = (parts[1] ?? '').replace(/\/$/, '');
  if (repoPath.split('/').filter(Boolean).length < 2) return null;
  return `https://api.github.com/repos/${repoPath}/releases?per_page=${perPage}`;
}

/**
 * Keeps only what extraction needs from a GitHub release. The raw API object is
 * ~13 KB of URLs and author metadata around a few hundred bytes of signal, which
 * made 50 releases ~650 KB: far beyond any context window, so history extraction
 * saw only the first handful.
 */
export function compactGithubReleases(
  releases: Array<Record<string, unknown>>,
  bodyLimit: number,
): Array<Record<string, unknown>> {
  return releases.map((r) => ({
    tag: r.tag_name,
    name: r.name,
    date: r.published_at ?? r.created_at,
    prerelease: r.prerelease,
    body: typeof r.body === 'string' ? r.body.slice(0, bodyLimit) : null,
  }));
}

export async function fetchGitHubReleases(
  repoUrl: string,
  perPage = 3,
  etag?: string | null,
): Promise<SourceChunk | null> {
  const apiUrl = githubApiUrl(repoUrl, perPage);
  if (!apiUrl) return null;

  const headers: Record<string, string> = {
    ...BROWSER_HEADERS,
    Accept: 'application/vnd.github+json',
  };
  // Anonymous GitHub is 60 requests/hour, which a catalog of any size exhausts
  // immediately. A token raises it to 5,000.
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;
  // A 304 is free against the rate limit and costs no parsing or model call.
  if (etag) headers['If-None-Match'] = etag;

  const response = await axios.get(apiUrl, { ...REQUEST, headers });
  if (response.status === 304 && etag) {
    return {
      source: 'github',
      url: apiUrl,
      text: '[GitHub Releases: not modified]',
      etag,
      notModified: true,
    };
  }
  const data = response.data;
  if (!Array.isArray(data) || data.length === 0) return null;

  return {
    source: 'github',
    url: apiUrl,
    etag: typeof response.headers?.etag === 'string' ? response.headers.etag : undefined,
    releases: structuredFromGithub(data.slice(0, perPage)),
    // Latest-release polls get fuller notes; a 50-release history gets a short
    // excerpt each so all of them fit.
    text: `[GitHub Releases]\n${JSON.stringify(
      compactGithubReleases(data.slice(0, perPage), perPage <= 3 ? 2_000 : 500),
    )}`,
  };
}

export async function fetchRss(feedUrl: string, limit = 3): Promise<SourceChunk | null> {
  const response = await axios.get(feedUrl, { ...REQUEST, responseType: 'text' });
  const xml = String(response.data);

  let feed;
  try {
    feed = await parser.parseString(xml);
  } catch (first) {
    // Real feeds are frequently malformed, most often a bare ampersand. One
    // sanitisation pass rescues a surprising number of them.
    const sanitised = xml.replace(/&(?!(?:[a-z]+|#[0-9]+|#x[0-9a-f]+);)/gi, '&amp;');
    try {
      feed = await parser.parseString(sanitised);
    } catch {
      throw first;
    }
  }

  const items = feed.items?.slice(0, limit) ?? [];
  if (items.length === 0) return null;

  // Same reasoning as GitHub: feed items carry full HTML bodies and duplicate
  // fields. Title, date, link and a text excerpt are what extraction uses.
  const compact = items.map((i) => ({
    title: i.title,
    date: i.isoDate ?? i.pubDate,
    link: i.link,
    text: (i.contentSnippet ?? i.content ?? '').slice(0, limit <= 3 ? 2_000 : 500),
  }));
  return { source: 'rss', url: feedUrl, text: `[RSS Feed]\n${JSON.stringify(compact)}` };
}

export async function fetchHtml(pageUrl: string, maxChars: number): Promise<SourceChunk | null> {
  const response = await axios.get(pageUrl, REQUEST);
  const html = String(response.data ?? '');
  if (html.length < 500) return null;

  // Strip script/style before handing to the model: they are the bulk of a
  // modern page and none of the signal, and tokens cost money.
  const $ = cheerio.load(html);
  $('script, style, noscript, svg').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();

  return {
    source: 'html',
    url: pageUrl,
    text: `[Website/Changelog]\n${text.slice(0, maxChars)}`,
  };
}

/**
 * Heuristic version scrape, ported from the `custom_script` branch of
 * `web/server.ts`.
 *
 * Runs before the model because when it works it is free, exact, and returns
 * the full history rather than whatever fits in a context window. When it finds
 * nothing, extraction takes over.
 */
export function scrapeVersionsFromHtml(html: string): Array<{
  version: string;
  releaseDate: string;
  summary: string;
}> {
  const $ = cheerio.load(html);
  const found: Array<{ version: string; releaseDate: string; summary: string }> = [];
  const seen = new Set<string>();

  $('h1, h2, h3, h4, h5, p, b, strong, li, td').each((_, element) => {
    const text = $(element).text().trim();
    // A version-shaped number, in a short enough string to be a heading rather
    // than a container full of them.
    if (!/[0-9]+\.[0-9]+/.test(text) || text.length > 300) return;

    const match =
      text.match(/^([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\s*(?:RC|Beta|build|[a-zA-Z]+)\s*[0-9]*)*)\s*\((.*?)\)/i) ??
      text.match(/([0-9]+\.[0-9]+(?:\.[0-9]+)?)\s*\((.*?)\)/i);
    if (!match) return;

    const version = (match[1] ?? '').trim();
    if (!version || seen.has(version)) return;
    seen.add(version);

    found.push({
      version,
      releaseDate: parseLooseDate(match[2] ?? ''),
      summary: collectFollowingText($, element),
    });
  });

  return found;
}

/** Grabs the prose after a version heading, which is usually the changelog body. */
function collectFollowingText($: cheerio.CheerioAPI, element: Element): string {
  let node = $(element).next();
  let out = '';
  let steps = 0;

  while (node.length > 0 && !node.is('h1, h2, h3, h4, h5') && steps < 15) {
    if (node.is('ul, ol')) {
      node.find('li').each((_, li) => {
        out += `- ${$(li).text().trim()}\n`;
      });
    } else if (node.is('p, div')) {
      const text = node.text().trim();
      if (text && !/^[0-9]+\.[0-9]+/.test(text)) out += `${text}\n`;
    }
    node = node.next();
    steps += 1;
  }

  return out.slice(0, 5000);
}

/**
 * Vendors write dates in every format imaginable. This handles the common ones
 * and gives up cleanly rather than inventing a date.
 */
export function parseLooseDate(raw: string): string {
  const cleaned = raw.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return new Date().toISOString();

  // "2026 March 09" -> "March 09 2026", which Date understands.
  const yearFirst = cleaned.match(/^(\d{4})\s+([a-zA-Z]+)\s+(\d{1,2})$/);
  const candidate = yearFirst
    ? `${yearFirst[2]} ${yearFirst[3]} ${yearFirst[1]}`
    : cleaned;

  // Date-only values are anchored to UTC midnight; see lib/dates.ts for why.
  return parseToIso(candidate) ?? new Date().toISOString();
}

/**
 * Walks the priority list and aggregates **everything that responds**, rather
 * than stopping at the first hit. More context produces better extraction, and
 * conflicting sources are resolved by the prompt's "highest version, most recent
 * date" rule.
 *
 * A failing source is logged and skipped: one dead RSS feed must not lose the
 * GitHub releases that would have worked.
 */
export async function gatherSources(
  software: Software,
  options: { history?: boolean; githubEtag?: string | null } = {},
): Promise<SourceChunk[]> {
  const history = options.history ?? false;
  const chunks: SourceChunk[] = [];
  const maxChars = history ? config.limits.maxHistoryHtmlChars : config.limits.maxHtmlChars;

  const tiers = effectivePriority(software);
  // Registries are exact and nearly free, so a known package is always used even
  // when the priority list (an older AI suggestion, say) predates it.
  for (const registry of ['npm', 'pypi'] as const) {
    if (software[`${registry}_package`] && !tiers.includes(registry)) tiers.push(registry);
  }

  for (const tier of tiers) {
    try {
      if (tier === 'npm' && software.npm_package) {
        const doc = await fetchNpmDoc(software.npm_package);
        const summary = doc && summariseNpm(doc, history ? 50 : 3);
        if (summary && summary.releases.length > 0) {
          chunks.push({
            source: 'npm',
            url: `https://www.npmjs.com/package/${software.npm_package}`,
            text: `[npm Registry]\n${JSON.stringify(summary)}`,
            releases: summary.releases.map((r) => ({ ...r, notes: null })),
          });
        }
      } else if (tier === 'pypi' && software.pypi_package) {
        const doc = await fetchPypiDoc(software.pypi_package);
        const summary = doc && summarisePypi(doc, history ? 50 : 3);
        if (summary && summary.releases.length > 0) {
          chunks.push({
            source: 'pypi',
            url: `https://pypi.org/project/${software.pypi_package}/`,
            text: `[PyPI Registry]\n${JSON.stringify(summary)}`,
            releases: summary.releases.map((r) => ({ ...r, notes: null })),
          });
        }
      } else if (tier === 'github' && software.github_url) {
        const chunk = await fetchGitHubReleases(
          software.github_url,
          history ? 50 : 3,
          history ? null : options.githubEtag,
        );
        if (chunk) chunks.push(chunk);
      } else if (tier === 'rss' && software.rss_url) {
        const chunk = await fetchRss(software.rss_url, history ? 50 : 3);
        if (chunk) chunks.push(chunk);
      } else if (tier === 'changelog' || tier === 'html') {
        const url = software.changelog_url ?? software.website;
        if (url) {
          const chunk = await fetchHtml(url, maxChars);
          if (chunk) chunks.push(chunk);
        }
      }
    } catch (error) {
      log.warn('source fetch failed', {
        softwareId: software.id,
        tier,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return chunks;
}
