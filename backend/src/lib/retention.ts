import { Timestamp } from 'firebase-admin/firestore';

/**
 * Firestore TTL policies delete a document once its `expiresAt` Timestamp passes,
 * at no charge. These collections are append-only logs nobody reads past a few
 * weeks, and left alone they grow (and are billed for storage) forever.
 */
export const RETENTION_DAYS = {
  tasks: 30,
  learnings: 180,
  audit: 400,
} as const;

export function expiresAt(days: number, nowMs: number = Date.now()): Timestamp {
  return Timestamp.fromMillis(nowMs + days * 86_400_000);
}

export type PipelineHealth = {
  ok: boolean;
  lastSweepAt: string | null;
  ageMinutes: number | null;
};

/**
 * The pipeline is healthy while sweeps keep arriving. Silence is the failure
 * mode: a dead scheduler or a crashed poller produces no errors to alert on.
 */
export function evaluatePipelineHealth(
  lastSweepAt: string | null | undefined,
  nowMs: number,
  maxAgeMinutes = 180,
): PipelineHealth {
  const t = lastSweepAt ? Date.parse(lastSweepAt) : NaN;
  if (!Number.isFinite(t)) return { ok: false, lastSweepAt: null, ageMinutes: null };
  const ageMinutes = Math.max(0, Math.round((nowMs - t) / 60_000));
  return { ok: ageMinutes <= maxAgeMinutes, lastSweepAt: lastSweepAt ?? null, ageMinutes };
}
