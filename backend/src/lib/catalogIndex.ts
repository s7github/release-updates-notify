import { slugify } from './adminValidation.js';
import { normaliseSearch } from './searchKey.js';

/**
 * The compact catalog index the browser downloads once and searches locally
 * (ADR-0021). Typing then costs zero Firestore reads.
 *
 * Fields are short on purpose: ~15k entries are sent to every visitor.
 */
export interface CatalogIndexEntry {
  id: string;
  name: string;
  /** normaliseSearch(name), so the client does not have to recompute it. */
  key: string;
  slug: string;
  vendor?: string;
}

export interface RegistryDoc {
  id: string;
  name?: unknown;
  vendor?: unknown;
  active?: unknown;
}

/**
 * Drops disabled and nameless entries, and gives every survivor a unique,
 * stable slug: kebab-case of the name, or on collision the name plus the first
 * six characters of the id. Docs are sorted by id first so a collision always
 * resolves the same way, whatever order Firestore returned them in.
 */
export function toIndexEntries(docs: readonly RegistryDoc[]): CatalogIndexEntry[] {
  const sorted = [...docs].sort((a, b) => a.id.localeCompare(b.id));
  const taken = new Set<string>();
  const out: CatalogIndexEntry[] = [];
  for (const doc of sorted) {
    if (doc.active === false) continue;
    const name = typeof doc.name === 'string' ? doc.name.trim() : '';
    if (!name) continue;
    const key = normaliseSearch(name);
    if (!key) continue;
    const base = slugify(name) || slugify(doc.id) || doc.id.toLowerCase();
    let slug = base;
    if (taken.has(slug)) slug = `${base}-${doc.id.slice(0, 6).toLowerCase()}`;
    let n = 2;
    while (taken.has(slug)) slug = `${base}-${doc.id.slice(0, 6).toLowerCase()}-${n++}`;
    taken.add(slug);
    const entry: CatalogIndexEntry = { id: doc.id, name, key, slug };
    if (typeof doc.vendor === 'string' && doc.vendor.trim()) entry.vendor = doc.vendor.trim();
    out.push(entry);
  }
  return out;
}
