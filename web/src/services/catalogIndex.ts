import { API_BASE } from "./api";
import type { IndexEntry } from "./suggest";

/**
 * Downloads the catalog index once (backend `GET /v1/catalog-index.json`, ADR-0021)
 * so suggestions are computed locally and typing costs no Firestore reads.
 *
 * A returning visitor starts from a localStorage copy and refreshes it in the
 * background. Every storage call is wrapped: private windows and blocked site
 * data make it throw, and search must still work without it.
 */

const STORAGE_KEY = "rs.catalogIndex.v1";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

interface Stored { builtAt: number; entries: IndexEntry[] }

const indexUrl = () =>
  (import.meta.env.VITE_CATALOG_INDEX_URL as string | undefined)?.trim() || `${API_BASE}/v1/catalog-index.json`;

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    return Array.isArray(parsed.entries) && typeof parsed.builtAt === "number" ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(value: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* quota or blocked storage: fine, we just re-download next visit */
  }
}

async function download(): Promise<IndexEntry[]> {
  const response = await fetch(indexUrl());
  if (!response.ok) throw new Error(`catalog index ${response.status}`);
  const body = (await response.json()) as { entries?: IndexEntry[] };
  const entries = Array.isArray(body.entries) ? body.entries : [];
  writeStored({ builtAt: Date.now(), entries });
  return entries;
}

let pending: Promise<IndexEntry[]> | null = null;

/** Resolves `[]` on failure so the page falls back to Firestore prefix search. */
export function loadCatalogIndex(): Promise<IndexEntry[]> {
  pending ??= (async () => {
    const stored = readStored();
    if (stored) {
      if (Date.now() - stored.builtAt > MAX_AGE_MS) void download().catch(() => undefined);
      return stored.entries;
    }
    try {
      return await download();
    } catch {
      pending = null; // allow a retry on the next mount
      return [];
    }
  })();
  return pending;
}
