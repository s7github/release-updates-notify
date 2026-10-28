/**
 * Catalog search fields.
 *
 * Firestore has no substring search, and the web client used to fake one by
 * fetching the first 200 documents and filtering in memory. That was fine at six
 * entries and wrong at fifteen thousand: it searched only the first 200 ids.
 *
 * `searchKey` supports prefix search ("fl s" finds "FL Studio") with one range
 * query; `searchTokens` supports whole-word search ("studio") with one
 * `array-contains`. Both are plain lowercase so the client can build the query
 * from what the user typed with the same normaliser.
 */

/** Lowercases and collapses everything that is not a letter or digit to one space. */
export function normaliseSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function searchFields(name: string): { searchKey: string; searchTokens: string[] } {
  const searchKey = normaliseSearch(name);
  const tokens = [...new Set(searchKey.split(' ').filter((t) => t.length >= 2))].slice(0, 8);
  return { searchKey, searchTokens: tokens };
}
