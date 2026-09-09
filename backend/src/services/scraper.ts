import axios, { type AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import Parser from 'rss-parser';
import { config } from '../lib/config.js';
import { parseToIso } from '../lib/dates.js';
import { log } from '../lib/logging.js';
import type { Software } from '../lib/types.js';

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

export async function fetchGitHubReleases(
  repoUrl: string,
  perPage = 3,
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

  const response = await axios.get(apiUrl, { ...REQUEST, headers });
  const data = response.data;
  if (!Array.isArray(data) || data.length === 0) return null;

  return {
    source: 'github',
    url: apiUrl,
    text: `[GitHub Releases]\n${JSON.stringify(data.slice(0, perPage))}`,
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

  return { source: 'rss', url: feedUrl, text: `[RSS Feed]\n${JSON.stringify(items)}` };
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
  options: { history?: boolean } = {},
): Promise<SourceChunk[]> {
  const history = options.history ?? false;
  const chunks: SourceChunk[] = [];
  const maxChars = history ? config.limits.maxHistoryHtmlChars : config.limits.maxHtmlChars;

  for (const tier of effectivePriority(software)) {
    try {
      if (tier === 'github' && software.github_url) {
        const chunk = await fetchGitHubReleases(software.github_url, history ? 50 : 3);
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
