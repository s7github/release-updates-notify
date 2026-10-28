import {
  collection, getDocs, limit, query, where,
  type DocumentData, type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * Catalog search over `master_registry`, built on two derived fields written by
 * the backend (`searchKey`, `searchTokens`; see backend/src/lib/searchKey.ts).
 *
 * The previous version fetched the first 200 documents and filtered them in
 * memory, which only ever searched the first 200 ids once the catalog grew past
 * a few thousand entries. This costs at most ~40 reads per search and covers the
 * whole catalog.
 */

/** Must match backend/src/lib/searchKey.ts `normaliseSearch`. */
export function normaliseSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const PAGE = 20;

export interface CatalogHit {
  id: string;
  name: string;
  vendor?: string | null;
  website?: string | null;
  icon_url?: string | null;
  type?: "software" | "topic";
  active?: boolean;
  searchKey?: string;
}

function toHit(d: QueryDocumentSnapshot<DocumentData>): CatalogHit {
  return { id: d.id, ...d.data() } as CatalogHit;
}

export async function searchCatalog(
  raw: string,
  { includeInactive = false }: { includeInactive?: boolean } = {},
): Promise<CatalogHit[]> {
  const needle = normaliseSearch(raw);
  if (needle.length < 2) return [];
  const words = needle.split(" ").filter((w) => w.length >= 2);

  const registry = collection(db, "master_registry");
  const queries = [
    // Names that start with what was typed: "fl s" -> "FL Studio".
    getDocs(query(
      registry,
      where("searchKey", ">=", needle),
      where("searchKey", "<=", needle + "\uf8ff"),
      limit(PAGE),
    )),
  ];
  // Names that contain a whole word typed: "studio" -> "FL Studio", "Studio One".
  if (words[0]) {
    queries.push(getDocs(query(
      registry, where("searchTokens", "array-contains", words[0]), limit(PAGE),
    )));
  }

  const seen = new Map<string, CatalogHit>();
  for (const snap of await Promise.all(queries)) {
    for (const d of snap.docs) {
      const hit = toHit(d);
      if (hit.active === false && !includeInactive) continue; // admin-disabled entries stay hidden from users
      // Multi-word input must match every word, wherever it appears in the name.
      const key = hit.searchKey ?? normaliseSearch(hit.name ?? "");
      if (!words.every((w) => key.includes(w))) continue;
      seen.set(hit.id, hit);
    }
  }

  // Prefix matches first, then shorter names (closer to what was typed).
  return [...seen.values()].sort((a, b) => {
    const ap = (a.searchKey ?? "").startsWith(needle) ? 0 : 1;
    const bp = (b.searchKey ?? "").startsWith(needle) ? 0 : 1;
    return ap - bp || (a.name ?? "").length - (b.name ?? "").length;
  });
}
