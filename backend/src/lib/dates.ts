/**
 * Date parsing for values scraped from vendor pages or returned by the model.
 *
 * **The rule: a date with no time-of-day is a calendar date, not an instant.**
 *
 * `new Date('March 9, 2026')` is midnight *local time*, so `.toISOString()`
 * shifts the calendar day for anyone not on UTC — in Europe/Amsterdam it becomes
 * `2026-03-08T23:00:00Z`, a day earlier. Servers run in UTC so this hides in
 * production and then surfaces on a developer machine, or on a device rendering
 * the timestamp back in local time.
 *
 * The Kotlin client already gets this right — `TimeParsing.parseIsoToEpochMillis`
 * uses `LocalDate.atStartOfDay(ZoneOffset.UTC)` for bare dates. This keeps the two
 * implementations agreeing about what a date-only changelog entry means.
 */

/** Matches a time-of-day, e.g. "12:30". Its absence means the value is date-only. */
const HAS_TIME_OF_DAY = /\d{1,2}:\d{2}/;

/**
 * Parses a loose date string to an ISO-8601 instant, or null if unparseable.
 *
 * Date-only inputs are anchored to UTC midnight so the calendar day survives the
 * round trip regardless of the machine's timezone.
 */
export function parseToIso(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  if (HAS_TIME_OF_DAY.test(trimmed)) {
    // A real instant — leave it alone; any offset in the string already applies.
    return parsed.toISOString();
  }

  // Date-only. Rebuild from the *local* Y/M/D the parser produced, because that
  // is the calendar date the source actually wrote, then anchor it to UTC.
  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
  ).toISOString();
}
