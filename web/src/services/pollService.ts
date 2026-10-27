/**
 * Removed: the client does not scrape and does not write release notes.
 *
 * Polling, extraction and task progress are server-side (ADR-0003, ADR-0006).
 * The web console now enqueues work through `services/api.ts`, which calls the
 * authenticated `api` service. Keeping a client-side poller here would either
 * be dead code or a permission-denied error; neither is useful.
 */
export {};
