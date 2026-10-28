import { Collections, db } from './firebase.js';
import { log } from './logging.js';

/**
 * Circuit breaker for Gemini quota exhaustion.
 *
 * A daily-quota 429 does not clear on retry, but a 5xx makes Pub/Sub retry it up
 * to five times per message, and the next hourly sweep queues the same work
 * again. That pile-up is what filled the task list with `processing` jobs. When
 * a quota error says "retry in 10 hours", this records that, and every caller
 * checks it first and stops instead of hammering the API.
 *
 * State lives in `system_state/gemini` so every Cloud Run instance agrees.
 */

const DOC = 'gemini';
const CACHE_MS = 60_000;
/** Below this the limit is a per-minute one: wait in memory, don't persist. */
const PERSIST_AFTER_MS = 5 * 60_000;
const MAX_BLOCK_MS = 24 * 3_600_000;
const DEFAULT_BLOCK_MS = 15 * 60_000;

let cached: { until: number; readAt: number } | undefined;

export function isQuotaError(error: unknown): boolean {
  const e = error as { status?: number; code?: number; message?: string } | null;
  if (e?.status === 429 || e?.code === 429) return true;
  return /RESOURCE_EXHAUSTED|"code"\s*:\s*429|exceeded your current quota/i.test(
    String(e?.message ?? error ?? ''),
  );
}

/** Reads "retryDelay":"38753s" or "Please retry in 10h46m8.9s" out of a 429 body. */
export function parseRetryDelayMs(message: string): number {
  const json = message.match(/retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/i);
  if (json) return Math.round(Number(json[1]) * 1000);

  const human = message.match(/retry in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?/i);
  if (human && (human[1] || human[2] || human[3])) {
    const ms =
      Number(human[1] ?? 0) * 3_600_000 + Number(human[2] ?? 0) * 60_000 + Number(human[3] ?? 0) * 1000;
    if (ms > 0) return Math.round(ms);
  }
  return DEFAULT_BLOCK_MS;
}

export function blockDurationMs(error: unknown): number {
  const ms = parseRetryDelayMs(String((error as { message?: string })?.message ?? error ?? ''));
  return Math.min(Math.max(ms, 1000), MAX_BLOCK_MS);
}

export async function geminiBlockedUntil(): Promise<Date | null> {
  const now = Date.now();
  if (!cached || now - cached.readAt > CACHE_MS) {
    let until = 0;
    try {
      const snap = await db().collection(Collections.SYSTEM_STATE).doc(DOC).get();
      const iso = snap.get('blockedUntil');
      until = typeof iso === 'string' ? Date.parse(iso) || 0 : 0;
    } catch (error) {
      // Failing open: if the flag cannot be read, calling Gemini is the old behaviour.
      log.warn('could not read gemini block flag', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    // Keep a longer in-memory block set by this instance.
    cached = { until: Math.max(until, cached?.until ?? 0), readAt: now };
  }
  return cached.until > now ? new Date(cached.until) : null;
}

/** Records a quota error. Returns when calls may resume. */
export async function recordGeminiBlock(error: unknown): Promise<Date> {
  const ms = blockDurationMs(error);
  const until = new Date(Date.now() + ms);
  cached = { until: until.getTime(), readAt: Date.now() };

  if (ms >= PERSIST_AFTER_MS) {
    try {
      await db().collection(Collections.SYSTEM_STATE).doc(DOC).set({
        blockedUntil: until.toISOString(),
        reason: 'quota',
        updatedAt: new Date().toISOString(),
      });
    } catch (writeError) {
      log.warn('could not persist gemini block flag', {
        error: writeError instanceof Error ? writeError.message : String(writeError),
      });
    }
    log.warn('gemini quota exhausted; pausing AI calls', { until: until.toISOString() });
  }
  return until;
}

/** Test seam. */
export function resetGeminiGateCache(): void {
  cached = undefined;
}
