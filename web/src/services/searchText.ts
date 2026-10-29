/** Must match backend/src/lib/searchKey.ts `normaliseSearch`. Pure, so tests and the prerender can import it without Firebase. */
export function normaliseSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
