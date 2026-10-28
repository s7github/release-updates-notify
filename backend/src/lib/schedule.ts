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
}

export function selectDue(
  entries: ReadonlyArray<RegistryProbe>,
  followedIds: ReadonlySet<string>,
  cutoffIso: string,
  max: number,
): string[] {
  return entries
    .filter((e) => followedIds.has(e.id) && e.active === true)
    .filter((e) => !e.lastCheck || e.lastCheck < cutoffIso)
    // Never-polled first, then oldest check first.
    .sort((a, b) => (a.lastCheck ?? '').localeCompare(b.lastCheck ?? ''))
    .slice(0, max)
    .map((e) => e.id);
}
