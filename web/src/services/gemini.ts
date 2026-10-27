/**
 * Removed: the browser must never call Gemini.
 *
 * An APK or a web bundle is readable; a key shipped in one is a published key.
 * Discovery and extraction live in `backend/src/services/gemini.ts`, behind the
 * authenticated `api` service (ADR-0003). This module is intentionally empty so
 * any stale import fails at build time rather than leaking a key.
 */
export {};
