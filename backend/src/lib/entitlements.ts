/**
 * Subscription entitlements, enforced server-side.
 *
 * The tier a person is on is data — `users/{uid}.subscriptionTier` — written by
 * an admin through the `api` service, never by the client (ADR-0006). This file
 * turns that data into the limits the pipeline actually applies.
 *
 * Keep these numbers in sync with `web/src/services/entitlements.ts` and
 * `android/core/model/.../SubscriptionTier.kt`. They are product policy, not
 * security boundaries: the client UI is the first line, the API quota is the
 * one a modified client cannot bypass.
 */

export type SubscriptionTier = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface TierEntitlements {
  /** Max interests (software + topics). `null` means unlimited. */
  maxTrackedItems: number | null;
  /** How much release history is visible. `null` means unlimited. */
  historyDays: number | null;
  /** Max rows in one software timeline. */
  timelineItems: number;
  /** Deep history backfill is a paid operation. */
  historyBackfill: boolean;
  /** CSV/JSON export is a paid feature. */
  exportEnabled: boolean;
  discoveryPerHour: number;
  refreshPerHour: number;
}

const ENTITLEMENTS: Record<SubscriptionTier, TierEntitlements> = {
  FREE: {
    maxTrackedItems: 5,
    historyDays: 30,
    timelineItems: 5,
    historyBackfill: false,
    exportEnabled: false,
    discoveryPerHour: 5,
    refreshPerHour: 10,
  },
  PRO: {
    maxTrackedItems: null,
    historyDays: null,
    timelineItems: 500,
    historyBackfill: true,
    exportEnabled: true,
    discoveryPerHour: 25,
    refreshPerHour: 60,
  },
  ENTERPRISE: {
    maxTrackedItems: null,
    historyDays: null,
    timelineItems: 1000,
    historyBackfill: true,
    exportEnabled: true,
    discoveryPerHour: 100,
    refreshPerHour: 300,
  },
};

export function normalizeTier(value: unknown): SubscriptionTier {
  if (typeof value !== 'string') return 'FREE';
  const upper = value.trim().toUpperCase();
  return upper === 'PRO' || upper === 'ENTERPRISE' ? upper : 'FREE';
}

/**
 * A paid tier with a past expiry date is FREE.
 *
 * A missing expiry means "no expiry" (admin-granted, legacy document). A value
 * that exists but cannot be parsed is treated as expired rather than as
 * unlimited: a corrupted grant should fail closed.
 */
export function effectiveTier(
  tierValue: unknown,
  expiresAtValue: unknown,
  now: number = Date.now(),
): SubscriptionTier {
  const tier = normalizeTier(tierValue);
  if (tier === 'FREE') return 'FREE';
  if (expiresAtValue === null || expiresAtValue === undefined || expiresAtValue === '') {
    return tier;
  }

  const expiresAt = typeof expiresAtValue === 'number'
    ? expiresAtValue
    : Date.parse(String(expiresAtValue));

  if (!Number.isFinite(expiresAt)) return 'FREE';
  return expiresAt > now ? tier : 'FREE';
}

export function limitsFor(tier: SubscriptionTier): TierEntitlements {
  return ENTITLEMENTS[tier];
}

export function isPaid(tier: SubscriptionTier): boolean {
  return tier !== 'FREE';
}
