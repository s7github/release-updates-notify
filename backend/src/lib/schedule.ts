/**
 * Which catalog entries a scheduled sweep should poll.
 *
 * Only entries somebody follows are polled. The catalog is ~15k seeded entries
 * and every poll can cost model calls; polling products nobody is waiting for
 * buys nothing. A followed entry that has never been polled (`lastCheck` null)
 * is due immediately, which is how a freshly followed seeded product gets its
 * first release.
 */
export interface RegistryProbe {
  id: string;
  active?: boolean | null;
  lastCheck?: string | null;
  lastReleaseDate?: string | null;
}

const DAY_MS = 86_400_000;
/** Used when a product has no usable release date yet. */
export const DEFAULT_POLL_MINUTES = 360;

/**
 * How long to wait between polls of one product, from how recently it shipped.
 *
 * Software that released yesterday is likely to ship again soon; software that
 * has been quiet for half a year is not. Polling both every six hours spends most
 * fetches on the quiet ones. The sweep still runs hourly, so the shortest
 * interval is one sweep.
 */
export function pollIntervalMinutes(
  lastReleaseDate: string | null | undefined,
  nowMs: number,
): number {
  const released = lastReleaseDate ? Date.parse(lastReleaseDate) : NaN;
  if (!Number.isFinite(released)) return DEFAULT_POLL_MINUTES;
  const days = (nowMs - released) / DAY_MS;
  if (days < 2) return 60;
  if (days < 14) return 180;
  if (days < 60) return 360;
  if (days < 180) return 720;
  return 1_440;
}

/**
 * @param fixedMinutes When given, every product uses this one interval (a manual
 *   sweep). Otherwise each product gets its own, from `pollIntervalMinutes`.
 */
export function selectDue(
  entries: ReadonlyArray<RegistryProbe>,
  followedIds: ReadonlySet<string>,
  nowMs: number,
  max: number,
  fixedMinutes?: number,
): string[] {
  return entries
    .filter((e) => followedIds.has(e.id) && e.active === true)
    .filter((e) => {
      if (!e.lastCheck) return true;
      const checked = Date.parse(e.lastCheck);
      if (!Number.isFinite(checked)) return true;
      const interval = fixedMinutes ?? pollIntervalMinutes(e.lastReleaseDate, nowMs);
      return checked <= nowMs - interval * 60_000;
    })
    // Never-polled first, then oldest check first.
    .sort((a, b) => (a.lastCheck ?? '').localeCompare(b.lastCheck ?? ''))
    .slice(0, max)
    .map((e) => e.id);
}
