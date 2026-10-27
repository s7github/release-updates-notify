import { GoogleGenAI } from '@google/genai';
import { config } from '../lib/config.js';
import { parseToIso } from '../lib/dates.js';
import { log } from '../lib/logging.js';
import { isProbablyDateNotVersion } from '../lib/version.js';
import { captureMessage } from '../lib/sentry.js';
import {
  isReleaseCategory,
  type DiscoveredSource,
  type ExtractedRelease,
} from '../lib/types.js';

/**
 * AI extraction.
 *
 * The prompts are ported **verbatim** from `web/src/services/gemini.ts`. They
 * are tuned — the version-versus-date rule and the category enum in particular
 * were clearly arrived at by hitting the failure — and rewriting them would
 * silently regress extraction quality with no way to notice.
 *
 * What changed is *where* this runs. On the web it ran in the browser with the
 * key in frontend code; here it runs server-side with the key from Secret
 * Manager (ADR-0003).
 */

let client: GoogleGenAI | undefined;

function ai(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: config.geminiApiKey() });
  return client;
}

/**
 * Models wrap JSON in Markdown fences even when told not to, and even in JSON
 * mode occasionally. Stripping is cheaper than retrying.
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.includes('```json')) {
    return (trimmed.split('```json')[1] ?? '').split('```')[0]?.trim() ?? '';
  }
  if (trimmed.includes('```')) {
    return (trimmed.split('```')[1] ?? '').split('```')[0]?.trim() ?? '';
  }
  return trimmed;
}

export function parseJsonResponse<T>(text: string): T {
  return JSON.parse(stripCodeFences(text)) as T;
}

/** Finds official sources for something not yet in the catalog. */
export async function discoverSources(query: string): Promise<DiscoveredSource> {
  const prompt = `You are a high-fidelity software discovery engine.
  Task: Find the official software release sources for: "${query}".

  Guidelines & Priority:
  1. Primary Sources: Official changelogs (/changelog, /releases, /whats-new), Documentation archives, Manuals.
  2. GitHub/GitLab: Find the REST API /releases or /tags endpoint.
  3. RSS Feeds: Technical update feeds.

  Google Search Task:
  - Find the absolute official homepage.
  - Search specifically for terms like "[software] version history archive", "[software] changelog", "[software] release notes github".
  - Identify the real Developer/Vendor.
  - Find a high-res official logo URL (using clearbit: https://logo.clearbit.com/[domain]).

  Return ONLY a JSON object:
  {
    "name": string,
    "vendor": string|null,
    "website": string|null,
    "icon_url": string|null,
    "type": "software"|"topic",
    "github_url": string|null,
    "rss_url": string|null,
    "changelog_url": string|null,
    "suggested_priority": string[] (e.g. ["html", "github", "rss"])
  }.`;

  const response = await ai().models.generateContent({
    model: config.model,
    contents: prompt,
    // Search grounding: discovery is about the open web, not the model's memory.
    config: { tools: [{ googleSearch: {} }] },
  });

  return parseJsonResponse<DiscoveredSource>(response.text ?? '');
}

/** Turns aggregated raw source text into one structured release. */
export async function extractRelease(
  softwareName: string,
  rawData: string,
): Promise<ExtractedRelease> {
  const prompt = `Analyze this raw data from multiple sources (GitHub, RSS, Website) for the software "${softwareName}".

  Critical Extraction Rules:
  1. Standardized Categorization: Use ONLY these categories: "New Features", "Feature Updates", "Optimization/Tips", "Bug Fixes", "Security Patches", "Major Milestone Update".
  2. Version vs Date Discrimination: STRICTLY extract technical version numbers (e.g. "25.2.5", "2024.1.2"). NEVER use a date string (like "2026-04-20") as a version name. If you see "25.2.5 (2026/03/09)", extract "25.2.5" as version. DO NOT extract content packs or plugins as software versions.
  3. Major Milestones: If a release marks a major integer change (e.g., 24.x to 25.0), lacks a patch number (e.g., "25.1"), or introduces major new features, categorize it as "Major Milestone Update".
  4. Entity-First Extraction: AI must prioritize Named Releases over generic Date-Based Titles.
  5. Accuracy Filtering: Ignore "dependency bumps" or "internal housekeeping" unless accompanied by feature notes.
  6. The Cluster Rule: You are receiving data from parallel streams. Aggregate it into a single "Product Profile".
  7. Self-Correction & Learning: Suggest metadata corrections in the "metadataLearnings" object.
  8. Conflict Resolution: If sources disagree, adopt "Highest Version + Most Recent Date" logic.

  Tasks:
  1. Determine if this data contains a valid software update or product status.
  2. Extract:
     - Version: Technical version (e.g. v24.1.1) or Marketing Name (e.g. "FL Studio 2024"). Lead with technical version if both exist.
     - Release Date: ISO format.
     - Category: From the allowed list above.
     - Summary: Markdown, focused on actionable information.
     - isGenuineUpdate: Set to TRUE if you can find ANY version number, any release date, or any product announcement.

  Raw data (Merged Streams): ${rawData.slice(0, 40_000)}

  Return ONLY a JSON object:
  {
    "version": string,
    "releaseDate": string | null,
    "category": "New Features" | "Feature Updates" | "Optimization/Tips" | "Bug Fixes" | "Security Patches" | "Major Milestone Update" | "Compliance Updates" | "Accessibility Improvements" | "Localization Updates" | "API Breaking Changes" | "Enterprise Features" | "Performance Changes" | "Developer Experience Changes" | "Infrastructure Changes" | "Data Changes" | "UI/UX Changes" | "Documentation Updates",
    "summary": string,
    "isGenuineUpdate": boolean,
    "metadataLearnings": {
      "vendor": string | null,
      "website": string | null,
      "github_url": string | null,
      "rss_url": string | null,
      "changelog_url": string | null,
      "logo_url": string | null
    }
  }`;

  const response = await ai().models.generateContent({
    model: config.model,
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });

  return sanitizeRelease(parseJsonResponse<ExtractedRelease>(response.text ?? ''));
}

/** Last resort when every configured source came back empty. */
export async function searchLatestRelease(softwareName: string): Promise<ExtractedRelease> {
  const prompt = `Search the absolute latest official release notes for the software "${softwareName}".
  Your goal is to find the most recent software version update, release date, and the URL where the changelog was found.

  Return ONLY a JSON object:
  {
    "version": string,
    "releaseDate": string | null,
    "category": "New Features" | "Major Milestone Update" | "Bug Fixes" | "Security Patches" | "Feature Updates" | "Optimization/Tips" | "Compliance Updates" | "Accessibility Improvements" | "Localization Updates" | "API Breaking Changes" | "Enterprise Features" | "Performance Changes" | "Developer Experience Changes" | "Infrastructure Changes" | "Data Changes" | "UI/UX Changes" | "Documentation Updates",
    "summary": string,
    "isGenuineUpdate": true,
    "metadataLearnings": {
      "changelog_url": string | null
    }
  }`;

  const response = await ai().models.generateContent({
    model: config.model,
    contents: prompt,
    config: { tools: [{ googleSearch: {} }] },
  });

  return sanitizeRelease(parseJsonResponse<ExtractedRelease>(response.text ?? ''));
}

/** Multi-strategy extraction with fallback chain and confidence scoring */
export interface ExtractionStrategy {
  name: string;
  weight: number;
  timeoutMs: number;
  retryCount: number;
}

export interface ExtractionResult {
  release: ExtractedRelease;
  strategy: string;
  confidence: number;
  executionTimeMs: number;
  sourceUrls?: string[];
}

export async function extractWithFallback(
  softwareName: string,
  rawData: string,
  strategies?: ExtractionStrategy[],
): Promise<ExtractionResult> {
  const defaultStrategies: ExtractionStrategy[] = [
    { name: 'gemini_direct', weight: 1.0, timeoutMs: 30000, retryCount: 2 },
    { name: 'gemini_search_grounded', weight: 0.9, timeoutMs: 30000, retryCount: 1 },
    { name: 'gemini_history', weight: 0.8, timeoutMs: 60000, retryCount: 2 },
    { name: 'gemini_web_search', weight: 0.7, timeoutMs: 30000, retryCount: 1 },
  ];

  const extractionStrategies = strategies || defaultStrategies;
  let lastError: Error | null = null;

  for (const strategy of extractionStrategies) {
    const startTime = Date.now();
    let attempts = 0;
    
    while (attempts <= strategy.retryCount) {
      attempts++;
      try {
        let result: ExtractedRelease;
        let sourceUrls: string[] = [];

        switch (strategy.name) {
          case 'gemini_direct':
            result = await extractRelease(softwareName, rawData);
            sourceUrls = ['direct_extraction'];
            break;
          case 'gemini_search_grounded':
            // This is essentially what extractRelease already does with search grounding
            result = await extractRelease(softwareName, rawData);
            sourceUrls = ['search_grounded'];
            break;
          case 'gemini_history':
            result = await extractHistory(softwareName, rawData);
            if (Array.isArray(result) && result.length > 0) {
              result = result[0]; // Take the most recent
            } else {
              throw new Error('No history extracted');
            }
            sourceUrls = ['history_extraction'];
            break;
          case 'gemini_web_search':
            result = await searchLatestRelease(softwareName);
            sourceUrls = ['web_search'];
            break;
          default:
            throw new Error(`Unknown extraction strategy: ${strategy.name}`);
        }

        // Validate and sanitize the result
        const sanitized = sanitizeRelease(result);
        
        // Calculate confidence score
        const confidence = calculateExtractionConfidence(strategy, sanitized, rawData);
        
        // Log successful extraction
        const executionTime = Date.now() - startTime;
        await captureMessage('extraction_successful', 'info', {
          softwareName,
          strategy: strategy.name,
          confidence,
          executionTimeMs: executionTime,
          version: sanitized.version,
          category: sanitized.category,
        });

        return {
          release: sanitized,
          strategy: strategy.name,
          confidence,
          executionTimeMs: executionTime,
          sourceUrls,
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Categorize the error for better monitoring
        categorizeExtractionError(strategy, lastError, softwareName);
        
        await captureMessage('extraction_strategy_failed', 'warning', {
          softwareName,
          strategy: strategy.name,
          attempt: attempts,
          maxAttempts: strategy.retryCount + 1,
          error: lastError.message,
          lastError: lastError.toString(),
        });
        
        // Wait before retry (exponential backoff)
        if (attempts <= strategy.retryCount) {
          const delayMs = 1000 * Math.pow(2, attempts - 1);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
  }

  // All strategies failed
  const fallbackError = lastError || new Error('All extraction strategies failed');
  
  // For backward compatibility, throw a formatted error
  const errorMessage = `Failed to extract release for ${softwareName} using all strategies. Last error: ${fallbackError.message}`;
  
  await captureMessage('extraction_all_strategies_failed', 'error', {
    softwareName,
    totalStrategies: extractionStrategies.length,
    lastError: fallbackError.message,
    rawDataLength: rawData.length,
    errorStack: fallbackError.stack,
  });
  
  throw new Error(errorMessage);
}

/** Calculate confidence score for extraction result */
function calculateExtractionConfidence(
  strategy: ExtractionStrategy,
  release: ExtractedRelease,
  rawData: string,
): number {
  let confidence = strategy.weight;

  // Increase confidence for valid categories
  if (release.category && isReleaseCategory(release.category)) {
    confidence += 0.1;
  } else {
    confidence -= 0.2; // penalize invalid categories
  }

  // Increase confidence for version numbers
  const versionRegex = /^\d+\.\d+(\.\d+)?([-.][a-zA-Z0-9]+)?$/;
  if (versionRegex.test(release.version)) {
    confidence += 0.15;
  } else if (!release.version || release.version.length === 0) {
    confidence -= 0.3; // heavily penalize missing or invalid versions
  }

  // Increase confidence for genuine updates
  if (release.isGenuineUpdate) {
    confidence += 0.1;
  } else {
    confidence -= 0.2; // penalize non-genuine updates
  }

  // Increase confidence for substantial data
  if (rawData.length > 1000) {
    confidence += 0.05;
  }

  // Normalize to 0-1 range
  return Math.max(0, Math.min(1, confidence));
}

/** Categorize extraction errors for better monitoring and alerting */
function categorizeExtractionError(strategy: ExtractionStrategy, error: Error, softwareName: string): void {
  const errorLower = error.message.toLowerCase();
  let category = 'unknown';
  
  if (errorLower.includes('rate') || errorLower.includes('quota')) {
    category = 'rate_limit';
  } else if (errorLower.includes('auth') || errorLower.includes('key') || errorLower.includes('api key')) {
    category = 'authentication';
  } else if (errorLower.includes('parse') || errorLower.includes('json') || errorLower.includes('malformed')) {
    category = 'parsing';
  } else if (errorLower.includes('timeout') || errorLower.includes('network') || errorLower.includes('fetch')) {
    category = 'network';
  } else if (errorLower.includes('validation') || errorLower.includes('schema')) {
    category = 'validation';
  } else if (errorLower.includes('model') || errorLower.includes('gemini') || errorLower.includes('ai')) {
    category = 'ai_service';
  } else if (errorLower.includes('permission') || errorLower.includes('access')) {
    category = 'permission';
  }

  await captureMessage('extraction_error_categorized', 'warning', {
    softwareName,
    strategy: strategy.name,
    errorCategory: category,
    errorMessage: error.message,
    errorType: error.constructor.name,
  });
}

/** Bulk extraction for a full version history. */
export async function extractHistory(
  softwareName: string,
  rawData: string,
): Promise<ExtractedRelease[]> {
  const prompt = `Analyze this raw data describing the historical releases of "${softwareName}".

  Task: Extract a COMPREHENSIVE list of ALL identifiable release updates found in this text.

  Critical Extraction Rules:
  1. Maximum Coverage: Scan the entire text for ALL unique versions and dates.
  2. Version Strings: Extract technical version numbers (e.g., "25.2.5", "1.2.3-beta") OR Named Releases (e.g. "Release 1", "Alpha V1", "Stable Patch"). NEVER use a date string ONLY (like "2026-04-20") as a version name. If a line says "v25.2.5 (2026 / March / 09)", the version is "25.2.5".
  3. Default if no version: If you find a release text but no version number/name, synthesize a logical name (e.g. "Update - [Date]").
  4. Ignore Content Packs/Assets: DO NOT extract plugins, sound packs, or sub-assets as software versions.
  5. Major Milestones: If a release marks a major integer change (e.g., 24.x to 25.0) or is explicitly called a major release, categorize it as "Major Milestone Update".
  6. Categorization: Use: "New Features", "Feature Updates", "Optimization/Tips", "Bug Fixes", "Security Patches", "Major Milestone Update".
  7. Date Format: Convert all parsed dates into ISO YYYY-MM-DD format.
  8. Max Items: Extract up to 100 unique historical releases if available.

  Raw data: ${rawData.slice(0, 100_000)}

  Return ONLY a JSON array of objects:
  [{
    "version": "string (strictly the numeric/semantic version, no dates)",
    "releaseDate": "string (ISO date YYYY-MM-DD)",
    "category": "string",
    "summary": "string (brief markdown summary focusing on key changes)"
  }]`;

  const response = await ai().models.generateContent({
    model: config.model,
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });

  const parsed = parseJsonResponse<ExtractedRelease[]>(response.text ?? '');
  if (!Array.isArray(parsed)) return [];
  return parsed.map(sanitizeRelease).filter((r) => r.version.length > 0);
}

/**
 * Re-validates model output before it is trusted.
 *
 * The prompt states these rules; the model follows them *most* of the time.
 * "Most" is not good enough for a value that becomes a document id and decides
 * whether every subscriber gets a notification.
 */
export function sanitizeRelease(raw: Partial<ExtractedRelease>): ExtractedRelease {
  const version = String(raw.version ?? '').trim();

  // Rule 2 of the prompt, enforced rather than hoped for. A date accepted as a
  // version creates a new "release" every time the page is scraped.
  const versionIsDate = version.length > 0 && isProbablyDateNotVersion(version);
  if (versionIsDate) {
    log.warn('model returned a date as a version; rejecting', { version });
  }

  const category = isReleaseCategory(raw.category) ? raw.category : 'Feature Updates';
  if (raw.category && !isReleaseCategory(raw.category)) {
    log.warn('model returned an off-list category; defaulting', { category: raw.category });
  }

  return {
    version: versionIsDate ? '' : version,
    releaseDate: normalizeDate(raw.releaseDate),
    category,
    summary: String(raw.summary ?? '').trim(),
    isGenuineUpdate: raw.isGenuineUpdate !== false && !versionIsDate && version.length > 0,
    metadataLearnings: raw.metadataLearnings ?? null,
  };
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  // The prompt asks for ISO YYYY-MM-DD, but the model returns other formats often
  // enough to matter, and non-ISO forms parse as local midnight. See lib/dates.ts.
  return parseToIso(value);
}

/** Multi-strategy extraction with fallback chain and confidence scoring */
export interface ExtractionStrategy {
  name: string;
  weight: number;
  timeoutMs: number;
  retryCount: number;
}

export interface ExtractionResult {
  release: ExtractedRelease;
  strategy: string;
  confidence: number;
  executionTimeMs: number;
  sourceUrls?: string[];
}

export async function extractWithFallback(
  softwareName: string,
  rawData: string,
  strategies?: ExtractionStrategy[],
): Promise<ExtractionResult> {
  const defaultStrategies: ExtractionStrategy[] = [
    { name: 'gemini_direct', weight: 1.0, timeoutMs: 30000, retryCount: 2 },
    { name: 'gemini_search_grounded', weight: 0.9, timeoutMs: 30000, retryCount: 1 },
    { name: 'gemini_history', weight: 0.8, timeoutMs: 60000, retryCount: 2 },
    { name: 'gemini_web_search', weight: 0.7, timeoutMs: 30000, retryCount: 1 },
  ];

  const extractionStrategies = strategies || defaultStrategies;
  let lastError: Error | null = null;

  for (const strategy of extractionStrategies) {
    const startTime = Date.now();
    let attempts = 0;
    
    while (attempts <= strategy.retryCount) {
      attempts++;
      try {
        let result: ExtractedRelease;
        let sourceUrls: string[] = [];

        switch (strategy.name) {
          case 'gemini_direct':
            result = await extractRelease(softwareName, rawData);
            sourceUrls = ['direct_extraction'];
            break;
          case 'gemini_search_grounded':
            result = await extractRelease(softwareName, rawData);
            sourceUrls = ['search_grounded'];
            break;
          case 'gemini_history':
            result = await extractHistory(softwareName, rawData);
            if (Array.isArray(result) && result.length > 0) {
              result = result[0]; // Take the most recent
            } else {
              throw new Error('No history extracted');
            }
            sourceUrls = ['history_extraction'];
            break;
          case 'gemini_web_search':
            result = await searchLatestRelease(softwareName);
            sourceUrls = ['web_search'];
            break;
          default:
            throw new Error(`Unknown extraction strategy: ${strategy.name}`);
        }

        const sanitized = sanitizeRelease(result);
        const confidence = calculateExtractionConfidence(strategy, sanitized, rawData);
        const executionTime = Date.now() - startTime;
        await captureMessage('extraction_successful', 'info', {
          softwareName,
          strategy: strategy.name,
          confidence,
          executionTimeMs: executionTime,
          version: sanitized.version,
          category: sanitized.category,
        });

        return {
          release: sanitized,
          strategy: strategy.name,
          confidence,
          executionTimeMs: executionTime,
          sourceUrls,
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        categorizeExtractionError(strategy, lastError, softwareName);
        await captureMessage('extraction_strategy_failed', 'warning', {
          softwareName,
          strategy: strategy.name,
          attempt: attempts,
          maxAttempts: strategy.retryCount + 1,
          error: lastError.message,
        });
        
        if (attempts <= strategy.retryCount) {
          const delayMs = 1000 * Math.pow(2, attempts - 1);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
  }

  const fallbackError = lastError || new Error('All extraction strategies failed');
  await captureMessage('extraction_all_strategies_failed', 'error', {
    softwareName,
    totalStrategies: extractionStrategies.length,
    lastError: fallbackError.message,
    rawDataLength: rawData.length,
    errorStack: fallbackError.stack,
  });
  
  throw new Error(`Failed to extract release for ${softwareName} using all strategies. Last error: ${fallbackError.message}`);
}

/** Calculate confidence score for extraction result */
export function calculateExtractionConfidence(
  strategy: ExtractionStrategy,
  release: ExtractedRelease,
  rawData: string,
): number {
  let confidence = strategy.weight;

  if (release.category && isReleaseCategory(release.category)) {
    confidence += 0.1;
  } else {
    confidence -= 0.2;
  }

  const versionRegex = /^\d+\.\d+(\.\d+)?([-.][a-zA-Z0-9]+)?$/;
  if (versionRegex.test(release.version)) {
    confidence += 0.15;
  } else if (!release.version || release.version.length === 0) {
    confidence -= 0.3;
  }

  if (release.isGenuineUpdate) {
    confidence += 0.1;
  } else {
    confidence -= 0.2;
  }

  if (rawData.length > 1000) {
    confidence += 0.05;
  }

  return Math.max(0, Math.min(1, confidence));
}

/** Categorize extraction errors for better monitoring and alerting */
export function categorizeExtractionError(strategy: ExtractionStrategy, error: Error, softwareName: string): void {
  const errorLower = error.message.toLowerCase();
  let category = 'unknown';
  
  if (errorLower.includes('rate') || errorLower.includes('quota')) {
    category = 'rate_limit';
  } else if (errorLower.includes('auth') || errorLower.includes('key') || errorLower.includes('api key')) {
    category = 'authentication';
  } else if (errorLower.includes('parse') || errorLower.includes('json') || errorLower.includes('malformed')) {
    category = 'parsing';
  } else if (errorLower.includes('timeout') || errorLower.includes('network') || errorLower.includes('fetch')) {
    category = 'network';
  } else if (errorLower.includes('validation') || errorLower.includes('schema')) {
    category = 'validation';
  } else if (errorLower.includes('model') || errorLower.includes('gemini') || errorLower.includes('ai')) {
    category = 'ai_service';
  } else if (errorLower.includes('permission') || errorLower.includes('access')) {
    category = 'permission';
  }

  await captureMessage('extraction_error_categorized', 'warning', {
    softwareName,
    strategy: strategy.name,
    errorCategory: category,
    errorMessage: error.message,
    errorType: error.constructor.name,
  });
}
