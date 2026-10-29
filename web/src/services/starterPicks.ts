import type { CatalogHit } from "./catalogSearch";

// Loaded lazily so this module (and its unit test) never pulls in Firebase.
const defaultSearch = async (q: string): Promise<CatalogHit[]> =>
  (await import("./catalogSearch")).searchCatalog(q);

/** Familiar names for a first follow. Resolved against the catalog, so a missing entry simply doesn't show. */
export const STARTER_NAMES = ["Visual Studio Code", "Figma", "Chrome", "macOS", "Node.js", "FL Studio"] as const;

export async function resolveStarterPicks(
  search: (q: string) => Promise<CatalogHit[]> = defaultSearch,
): Promise<CatalogHit[]> {
  const found = await Promise.all(
    STARTER_NAMES.map(async (name) => {
      try {
        const hits = await search(name);
        return hits.find((h) => h.name.toLowerCase() === name.toLowerCase()) ?? hits[0] ?? null;
      } catch {
        return null;
      }
    }),
  );
  return found.filter((h): h is CatalogHit => h !== null);
}
