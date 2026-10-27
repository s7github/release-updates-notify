/**
 * Validation for admin operations.
 *
 * The Admin SDK bypasses Firestore rules, so these functions are the only check
 * between an admin request body and the production database. They are pure and
 * unit-tested (`backend/test/adminValidation.test.ts`) so the allow-lists cannot
 * drift silently.
 *
 * Unknown keys are rejected rather than dropped: a typo in the console should
 * fail loudly, not write half a document and look successful.
 */

import { isReleaseCategory } from './types.js';
import { normalizeTier, type SubscriptionTier } from './entitlements.js';

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const MAX_URL = 2048;
const MAX_NAME = 300;
const MAX_SUMMARY = 20_000;

const REGISTRY_STRING_FIELDS: Record<string, number> = {
  name: MAX_NAME,
  vendor: 300,
  website: MAX_URL,
  icon_url: MAX_URL,
  github_url: MAX_URL,
  rss_url: MAX_URL,
  changelog_url: MAX_URL,
  package_registry_url: MAX_URL,
  priority_order: 300,
  lastVersion: 100,
};

const REGISTRY_BOOLEAN_FIELDS = ['active', 'sourcesVerified'] as const;
const REGISTRY_URL_FIELDS = new Set([
  'website', 'icon_url', 'github_url', 'rss_url', 'changelog_url', 'package_registry_url',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(
  value: unknown,
  maxLength: number,
  field: string,
): Validated<string | null | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') {
    return { ok: false, error: `${field} must be a string or null` };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > maxLength) {
    return { ok: false, error: `${field} must be at most ${maxLength} characters` };
  }
  return { ok: true, value: trimmed };
}

function optionalUrl(value: unknown, field: string): Validated<string | null | undefined> {
  const parsed = optionalString(value, MAX_URL, field);
  if (!parsed.ok || parsed.value === undefined || parsed.value === null) return parsed;
  try {
    const url = new URL(parsed.value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, error: `${field} must be an http(s) URL` };
    }
  } catch {
    return { ok: false, error: `${field} must be a valid URL` };
  }
  return parsed;
}

function optionalDate(value: unknown, field: string): Validated<string | null | undefined> {
  const parsed = optionalString(value, 64, field);
  if (!parsed.ok || parsed.value === undefined || parsed.value === null) return parsed;
  if (!Number.isFinite(Date.parse(parsed.value))) {
    return { ok: false, error: `${field} must be an ISO-8601 date` };
  }
  return { ok: true, value: new Date(parsed.value).toISOString() };
}

export type RegistryPatch = Record<string, string | string[] | number | boolean | null>;

export function validateRegistryPatch(body: unknown): Validated<RegistryPatch> {
  if (!isPlainObject(body)) return { ok: false, error: 'body must be an object' };

  const allowed = new Set([
    ...Object.keys(REGISTRY_STRING_FIELDS),
    ...REGISTRY_BOOLEAN_FIELDS,
    'type',
    'suggested_priority',
    'historyMaxCount',
    'historyMinDate',
    'lastReleaseDate',
  ]);

  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    return { ok: false, error: `unknown field(s): ${unknown.join(', ')}` };
  }

  const patch: RegistryPatch = {};

  for (const [field, maxLength] of Object.entries(REGISTRY_STRING_FIELDS)) {
    if (!(field in body)) continue;
    const parsed = REGISTRY_URL_FIELDS.has(field)
      ? optionalUrl(body[field], field)
      : optionalString(body[field], maxLength, field);
    if (!parsed.ok) return parsed;
    if (field === 'name' && (parsed.value === null || parsed.value === undefined)) {
      return { ok: false, error: 'name cannot be empty' };
    }
    patch[field] = parsed.value ?? null;
  }

  if ('type' in body) {
    if (body.type !== 'software' && body.type !== 'topic') {
      return { ok: false, error: "type must be 'software' or 'topic'" };
    }
    patch.type = body.type;
  }

  for (const field of REGISTRY_BOOLEAN_FIELDS) {
    if (!(field in body)) continue;
    if (typeof body[field] !== 'boolean') {
      return { ok: false, error: `${field} must be a boolean` };
    }
    patch[field] = body[field];
  }

  if ('suggested_priority' in body) {
    const value = body.suggested_priority;
    if (value !== null && !Array.isArray(value)) {
      return { ok: false, error: 'suggested_priority must be an array or null' };
    }
    if (Array.isArray(value)) {
      if (value.length > 12 || value.some((item) => typeof item !== 'string' || item.length > 40)) {
        return { ok: false, error: 'suggested_priority must contain at most 12 short strings' };
      }
      patch.suggested_priority = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
    } else {
      patch.suggested_priority = null;
    }
  }

  if ('historyMaxCount' in body) {
    const value = body.historyMaxCount;
    if (value === null) {
      patch.historyMaxCount = null;
    } else if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 1000
    ) {
      return { ok: false, error: 'historyMaxCount must be an integer between 1 and 1000' };
    } else {
      patch.historyMaxCount = value;
    }
  }

  if ('historyMinDate' in body) {
    const parsed = optionalDate(body.historyMinDate, 'historyMinDate');
    if (!parsed.ok) return parsed;
    if (parsed.value !== undefined) patch.historyMinDate = parsed.value;
  }

  if ('lastReleaseDate' in body) {
    const parsed = optionalDate(body.lastReleaseDate, 'lastReleaseDate');
    if (!parsed.ok) return parsed;
    if (parsed.value !== undefined) patch.lastReleaseDate = parsed.value;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'no updatable fields supplied' };
  }

  return { ok: true, value: patch };
}

export interface TierUpdate {
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt: string | null;
}

export function validateTierUpdate(body: unknown): Validated<TierUpdate> {
  if (!isPlainObject(body)) return { ok: false, error: 'body must be an object' };
  const unknown = Object.keys(body).filter(
    (key) => key !== 'subscriptionTier' && key !== 'subscriptionExpiresAt',
  );
  if (unknown.length > 0) {
    return { ok: false, error: `unknown field(s): ${unknown.join(', ')}` };
  }

  if (typeof body.subscriptionTier !== 'string') {
    return { ok: false, error: 'subscriptionTier is required' };
  }
  const tier = body.subscriptionTier.trim().toUpperCase();
  if (tier !== 'FREE' && tier !== 'PRO' && tier !== 'ENTERPRISE') {
    return { ok: false, error: 'subscriptionTier must be FREE, PRO or ENTERPRISE' };
  }
  const normalized = normalizeTier(tier);

  if (normalized === 'FREE') {
    return {
      ok: true,
      value: { subscriptionTier: 'FREE', subscriptionExpiresAt: null },
    };
  }

  if (body.subscriptionExpiresAt === undefined || body.subscriptionExpiresAt === null || body.subscriptionExpiresAt === '') {
    return {
      ok: true,
      value: { subscriptionTier: normalized, subscriptionExpiresAt: null },
    };
  }

  if (typeof body.subscriptionExpiresAt !== 'string') {
    return { ok: false, error: 'subscriptionExpiresAt must be an ISO-8601 date or null' };
  }
  const parsed = Date.parse(body.subscriptionExpiresAt);
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: 'subscriptionExpiresAt must be an ISO-8601 date or null' };
  }

  return {
    ok: true,
    value: {
      subscriptionTier: normalized,
      subscriptionExpiresAt: new Date(parsed).toISOString(),
    },
  };
}

export interface ReleasePatch {
  isVerified?: boolean;
  summary?: string;
  category?: string;
}

export function validateReleasePatch(body: unknown): Validated<ReleasePatch> {
  if (!isPlainObject(body)) return { ok: false, error: 'body must be an object' };
  const unknown = Object.keys(body).filter(
    (key) => !['isVerified', 'summary', 'category'].includes(key),
  );
  if (unknown.length > 0) {
    return { ok: false, error: `unknown field(s): ${unknown.join(', ')}` };
  }

  const patch: ReleasePatch = {};
  if ('isVerified' in body) {
    if (typeof body.isVerified !== 'boolean') {
      return { ok: false, error: 'isVerified must be a boolean' };
    }
    patch.isVerified = body.isVerified;
  }
  if ('summary' in body) {
    if (typeof body.summary !== 'string' || body.summary.trim().length === 0) {
      return { ok: false, error: 'summary cannot be empty' };
    }
    if (body.summary.length > MAX_SUMMARY) {
      return { ok: false, error: `summary must be at most ${MAX_SUMMARY} characters` };
    }
    patch.summary = body.summary;
  }
  if ('category' in body) {
    if (!isReleaseCategory(body.category)) {
      return { ok: false, error: 'category is not a recognised release category' };
    }
    patch.category = body.category;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'no updatable fields supplied' };
  }
  return { ok: true, value: patch };
}

export function isValidSoftwareId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 &&
    /^[A-Za-z0-9_.~:@+-]+$/.test(value);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}
