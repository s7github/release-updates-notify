import type { ExtractedRelease, ReleaseCategory } from './types.js';
import { isNewerThan, isProbablyDateNotVersion, normalizeVersion } from './version.js';

/**
 * Version detection without the model (ADR-0017).
 *
 * GitHub, npm and PyPI return versions as JSON, so "is there a new release?" is a
 * comparison, not a judgement. The model is only worth paying for when there is
 * something new to summarise, and the notification must not depend on it.
 */

export interface StructuredRelease {
  version: string;
  releaseDate: string | null;
  /** Release notes as published, or null when the source has none (npm, PyPI). */
  notes: string | null;
  prerelease?: boolean;
}

const PRERELEASE = /[-.](?:alpha|beta|rc|canary|next|nightly|dev|pre|preview|snapshot)\b/i;
// A dotted number with an optional suffix, not glued to a longer word or number.
const VERSION_TOKEN = /(?<![\w.])v?(\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?)(?![\w.]*\w)/;

/**
 * Pulls a version out of a tag or title: `v1.2.3`, `release-2024.1`, `pkg@2.0.1`.
 * Returns null for anything without a dotted number, so a date, a codename or a
 * moving tag like `nightly` is never mistaken for a version.
 */
export function versionFromLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const trimmed = label.trim();
  if (!trimmed || isProbablyDateNotVersion(trimmed)) return null;
  const match = VERSION_TOKEN.exec(trimmed);
  if (!match?.[1]) return null;
  const version = normalizeVersion(match[1]);
  return isProbablyDateNotVersion(version) ? null : version;
}

export function isPrereleaseLabel(label: string): boolean {
  return PRERELEASE.test(label);
}

/** Highest version wins; a tie goes to the newer date. Prereleases never qualify. */
export function latestRelease(releases: ReadonlyArray<StructuredRelease>): StructuredRelease | null {
  let best: StructuredRelease | null = null;
  for (const r of releases) {
    if (r.prerelease || !r.version || isPrereleaseLabel(r.version)) continue;
    if (!best) {
      best = r;
    } else if (isNewerThan(r.version, best.version)) {
      best = r;
    } else if (
      !isNewerThan(best.version, r.version) &&
      (r.releaseDate ?? '') > (best.releaseDate ?? '')
    ) {
      best = r;
    }
  }
  return best;
}

export type StructuredDecision =
  | { kind: 'none' }
  | { kind: 'unchanged'; version: string }
  | { kind: 'new'; release: StructuredRelease };

/**
 * Decides from structured sources alone. `none` means there was nothing
 * trustworthy to decide from, and the caller falls back to the model.
 */
export function decideFromStructured(
  chunks: ReadonlyArray<{ releases?: StructuredRelease[] }>,
  lastVersion: string | null | undefined,
): StructuredDecision {
  const all = chunks.flatMap((c) => c.releases ?? []);
  const latest = latestRelease(all);
  if (!latest) return { kind: 'none' };
  return isNewerThan(latest.version, lastVersion)
    ? { kind: 'new', release: latest }
    : { kind: 'unchanged', version: latest.version };
}

const SECURITY = /\b(?:CVE-\d{4}-\d+|security|vulnerabilit\w*|GHSA-[\w-]+)\b/i;
const BREAKING = /\b(?:breaking(?: change)?s?|BREAKING)\b/i;
const FEATURE = /\b(?:feat(?:ure)?s?|add(?:ed|s)?|new|introduc\w+|support for)\b/i;
const FIX = /\b(?:fix(?:es|ed)?|bug(?:fix)?|patch|regression|crash)\b/i;
const PERF = /\b(?:perf(?:ormance)?|faster|speed(?:s|ed)? up|optimi[sz]\w*)\b/i;

function majorOf(version: string | null | undefined): number | null {
  const m = version ? /\d+/.exec(normalizeVersion(version)) : null;
  return m ? Number(m[0]) : null;
}

/** A coarse, explainable category. The model refines it when it is available. */
export function classifyRelease(
  version: string,
  notes: string | null,
  previousVersion: string | null | undefined,
): ReleaseCategory {
  const text = notes ?? '';
  if (SECURITY.test(text)) return 'Security Patches';
  const prevMajor = majorOf(previousVersion);
  const major = majorOf(version);
  if (prevMajor !== null && major !== null && major > prevMajor) return 'Major Milestone Update';
  if (BREAKING.test(text)) return 'API Breaking Changes';
  if (FEATURE.test(text)) return 'New Features';
  if (PERF.test(text)) return 'Performance Changes';
  if (FIX.test(text)) return 'Bug Fixes';
  return 'Feature Updates';
}

const SUMMARY_LIMIT = 1_200;

export function summaryFromNotes(softwareName: string, r: StructuredRelease): string {
  const notes = (r.notes ?? '').replace(/\r\n/g, '\n').trim();
  if (!notes) return `${softwareName} ${r.version} is available.`;
  return notes.length > SUMMARY_LIMIT ? `${notes.slice(0, SUMMARY_LIMIT).trimEnd()}…` : notes;
}

/** A complete, notifiable release built with no model call. */
export function buildDeterministicRelease(
  softwareName: string,
  r: StructuredRelease,
  previousVersion: string | null | undefined,
): ExtractedRelease {
  return {
    version: r.version,
    releaseDate: r.releaseDate,
    category: classifyRelease(r.version, r.notes, previousVersion),
    summary: summaryFromNotes(softwareName, r),
    isGenuineUpdate: true,
    metadataLearnings: null,
  };
}
