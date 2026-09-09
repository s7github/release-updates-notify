/**
 * Version normalisation.
 *
 * **This must stay behaviourally identical to
 * `android/core/common/.../VersionNormalizer.kt`.** The client derives
 * `release_notes` document ids the same way; if the two disagree, re-extraction
 * creates duplicate documents instead of overwriting, and duplicates mean
 * duplicate notifications.
 *
 * Kept in sync by hand, and by the tests in test/version.test.ts, which mirror
 * the Kotlin test cases.
 */

const LEADING_V = /^[vV](?=\d)/;
const TRAILING_PARENS = /\s*\(.*\)\s*$/;
const NON_ID_CHARS = /[^a-z0-9]+/g;
const DATE_ONLY = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/;

export function normalizeVersion(raw: string): string {
  return raw.trim().replace(TRAILING_PARENS, '').replace(LEADING_V, '').trim();
}

/** The document id suffix. Must match the Kotlin implementation exactly. */
export function toDocumentIdSegment(raw: string): string {
  return normalizeVersion(raw)
    .toLowerCase()
    .replace(NON_ID_CHARS, '-')
    .replace(/^-+|-+$/g, '');
}

export function releaseDocumentId(softwareId: string, version: string): string {
  return `${softwareId}-${toDocumentIdSegment(version)}`;
}

/**
 * A bare date is never a version. The extraction prompt says so, and the model
 * still does it occasionally — so it is checked here too.
 */
export function isProbablyDateNotVersion(raw: string): boolean {
  return DATE_ONLY.test(raw.trim());
}

function numericParts(value: string): number[] {
  return [...value.matchAll(/\d+/g)].map((m) => Number(m[0]) || 0);
}

/**
 * The genuine-update gate (ADR-0008).
 *
 * Compares component-wise, not lexically: "1.10.0" is newer than "1.9.0", which
 * string comparison gets backwards.
 */
export function isNewerThan(candidate: string, current: string | null | undefined): boolean {
  if (!current) return true;

  const a = normalizeVersion(candidate);
  const b = normalizeVersion(current);
  if (a.toLowerCase() === b.toLowerCase()) return false;

  const aParts = numericParts(a);
  const bParts = numericParts(b);
  // Non-numeric versions ("Alpha V1"): a difference is treated as newer.
  if (aParts.length === 0 || bParts.length === 0) return true;

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i += 1) {
    const x = aParts[i] ?? 0;
    const y = bParts[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
