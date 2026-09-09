import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase.js';

/**
 * Per-user hourly quota, backed by Firestore.
 *
 * Discovery and refresh both spend Gemini money, so an unthrottled loop is a
 * billing attack, not just noise. Firestore rather than in-memory because Cloud
 * Run scales to many instances and an in-memory counter would be per-instance —
 * i.e. no limit at all.
 *
 * A transaction, so two concurrent requests cannot both read 9 and both write 10.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetsAt: Date;
}

export async function consumeQuota(
  uid: string,
  bucket: string,
  limitPerHour: number,
): Promise<RateLimitResult> {
  const hour = Math.floor(Date.now() / 3_600_000);
  const ref = db().collection('rate_limits').doc(`${uid}_${bucket}_${hour}`);
  const resetsAt = new Date((hour + 1) * 3_600_000);

  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = snap.exists ? Number(snap.get('count') ?? 0) : 0;

    if (used >= limitPerHour) {
      return { allowed: false, remaining: 0, resetsAt };
    }

    tx.set(
      ref,
      {
        count: FieldValue.increment(1),
        uid,
        bucket,
        // Set a TTL policy on this field in the Firestore console; otherwise
        // these documents accumulate one per user per bucket per hour forever.
        expiresAt: resetsAt,
      },
      { merge: true },
    );

    return { allowed: true, remaining: limitPerHour - used - 1, resetsAt };
  });
}
