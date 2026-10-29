import { normaliseSearch } from "./searchText";

export interface IndexEntry {
  id: string;
  name: string;
  /** normaliseSearch(name), precomputed by the index builder. */
  key: string;
  slug?: string;
  vendor?: string | null;
}

export type SuggestKind = "prefix" | "word" | "fuzzy";
export interface Suggestion { entry: IndexEntry; kind: SuggestKind; score: number }

/** Optimal-string-alignment distance (insert, delete, replace, adjacent swap). Returns max+1 once the limit is exceeded. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev: number[] | null = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prevPrev && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prevPrev[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = cur;
  }
  return prev[b.length];
}

const allowedEdits = (len: number) => (len <= 3 ? 0 : len <= 5 ? 1 : 2);

export function suggest(entries: readonly IndexEntry[], raw: string, limit = 8): Suggestion[] {
  const needle = normaliseSearch(raw);
  if (needle.length < 2) return [];
  const compactNeedle = needle.replace(/ /g, "");
  const maxEdits = allowedEdits(compactNeedle.length);
  const out: Suggestion[] = [];

  for (const entry of entries) {
    const key = entry.key;
    if (key.startsWith(needle)) {
      out.push({ entry, kind: "prefix", score: key.length });
      continue;
    }
    const compact = key.replace(/ /g, "");
    if (compact.startsWith(compactNeedle)) {
      out.push({ entry, kind: "prefix", score: 100 + key.length });
      continue;
    }
    const tokens = key.split(" ");
    if (tokens.some((t, i) => i > 0 && t.startsWith(needle))) {
      out.push({ entry, kind: "word", score: 1000 + key.length });
      continue;
    }
    if (maxEdits > 0) {
      // Compare against name prefixes one shorter/longer too, so a typo that adds or drops a letter still lines up.
      const n = compactNeedle.length;
      const candidates = [compact.slice(0, n - 1), compact.slice(0, n), compact.slice(0, n + 1), ...tokens];
      let best = maxEdits + 1;
      for (const c of candidates) best = Math.min(best, editDistance(compactNeedle, c, maxEdits));
      if (best <= maxEdits) out.push({ entry, kind: "fuzzy", score: 2000 + best * 100 + key.length });
    }
  }
  return out.sort((a, b) => a.score - b.score).slice(0, limit);
}
