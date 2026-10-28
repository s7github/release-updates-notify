import { createHash } from 'node:crypto';

/**
 * Fingerprint of everything a poll fetched.
 *
 * If it equals the fingerprint stored after the last successful extraction, the
 * sources are byte-for-byte what the model already saw, so asking it again can
 * only return the same answer. Most hourly polls land here.
 */
export function hashSources(chunks: ReadonlyArray<{ source: string; text: string }>): string {
  const hash = createHash('sha256');
  // Sorted so a change in fetch order (e.g. a slow source) is not a "change".
  const parts = chunks.map((c) => `${c.source}\u0000${c.text}`).sort();
  for (const part of parts) hash.update(part).update('\u0001');
  return hash.digest('hex');
}
