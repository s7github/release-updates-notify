/**
 * Client-side view of subscription entitlements.
 *
 * The numbers must match `backend/src/lib/entitlements.ts`; the backend is the
 * enforcer for quota spending and history backfill, this copy drives what the
 * UI offers and what it displays. A client that lies to itself only sees a
 * paywall; a client that lies to the API gets a 403.
 */

export type SubscriptionTier = "FREE" | "PRO" | "ENTERPRISE";

export interface TierEntitlements {
  /** Max interests (software + topics). `null` means unlimited. */
  maxTrackedItems: number | null;
  /** How much release history is visible. `null` means unlimited. */
  historyDays: number | null;
  /** Max rows in one software timeline. */
  timelineItems: number;
  historyBackfill: boolean;
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

export const TIER_ORDER: SubscriptionTier[] = ["FREE", "PRO", "ENTERPRISE"];

export function normalizeTier(value: unknown): SubscriptionTier {
  if (typeof value !== "string") return "FREE";
  const upper = value.trim().toUpperCase();
  return upper === "PRO" || upper === "ENTERPRISE" ? upper : "FREE";
}

/** A paid tier with a past expiry is FREE. Missing expiry means no expiry. */
export function effectiveTier(tierValue: unknown, expiresAtValue: unknown): SubscriptionTier {
  const tier = normalizeTier(tierValue);
  if (tier === "FREE") return "FREE";
  if (expiresAtValue === null || expiresAtValue === undefined || expiresAtValue === "") return tier;

  let expiresAt: number;
  if (typeof expiresAtValue === "number") {
    expiresAt = expiresAtValue;
  } else if (
    typeof expiresAtValue === "object" &&
    expiresAtValue !== null &&
    "toMillis" in expiresAtValue &&
    typeof (expiresAtValue as { toMillis: unknown }).toMillis === "function"
  ) {
    expiresAt = (expiresAtValue as { toMillis: () => number }).toMillis();
  } else {
    expiresAt = Date.parse(String(expiresAtValue));
  }

  if (!Number.isFinite(expiresAt)) return "FREE";
  return expiresAt > Date.now() ? tier : "FREE";
}

export function limitsFor(tier: SubscriptionTier): TierEntitlements {
  return ENTITLEMENTS[tier];
}

export function isPaid(tier: SubscriptionTier): boolean {
  return tier !== "FREE";
}

export function tierLabel(tier: SubscriptionTier): string {
  return tier === "FREE" ? "Free" : tier === "PRO" ? "Pro" : "Enterprise";
}

export function historyStart(tier: SubscriptionTier): Date | null {
  const days = limitsFor(tier).historyDays;
  if (days === null) return null;
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function trackedItemLimitLabel(tier: SubscriptionTier): string {
  const max = limitsFor(tier).maxTrackedItems;
  return max === null ? "Unlimited tracking" : `Up to ${max} tracked items`;
}
