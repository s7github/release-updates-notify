import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify,
  validateRegistryPatch,
  validateReleasePatch,
  validateTierUpdate,
} from '../src/lib/adminValidation.js';

describe('validateTierUpdate', () => {
  it('accepts a tier with an ISO expiry and normalises it', () => {
    const parsed = validateTierUpdate({
      subscriptionTier: 'pro',
      subscriptionExpiresAt: '2027-01-01T00:00:00Z',
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.value.subscriptionTier, 'PRO');
      assert.equal(parsed.value.subscriptionExpiresAt, '2027-01-01T00:00:00.000Z');
    }
  });

  it('treats a missing expiry as no expiry', () => {
    const parsed = validateTierUpdate({ subscriptionTier: 'ENTERPRISE' });
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.value.subscriptionExpiresAt, null);
  });

  it('clears expiry when moving to FREE', () => {
    const parsed = validateTierUpdate({
      subscriptionTier: 'FREE',
      subscriptionExpiresAt: '2027-01-01T00:00:00Z',
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.value.subscriptionExpiresAt, null);
  });

  it('rejects privilege-shaped fields and unknown tiers', () => {
    assert.equal(validateTierUpdate({ subscriptionTier: 'PRO', role: 'admin' }).ok, false);
    assert.equal(validateTierUpdate({ subscriptionTier: 'GOLD' }).ok, false);
    assert.equal(validateTierUpdate({ subscriptionTier: 'PRO', subscriptionExpiresAt: 'tomorrow' }).ok, false);
  });
});

describe('validateRegistryPatch', () => {
  it('accepts the fields the console edits', () => {
    const parsed = validateRegistryPatch({
      name: 'FL Studio',
      vendor: 'Image-Line',
      website: 'https://www.image-line.com',
      active: true,
      suggested_priority: ['github', 'rss', 'github'],
      historyMaxCount: 50,
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.deepEqual(parsed.value.suggested_priority, ['github', 'rss']);
      assert.equal(parsed.value.name, 'FL Studio');
    }
  });

  it('normalises URLs and rejects non-http schemes', () => {
    const good = validateRegistryPatch({ website: 'https://example.com/changelog' });
    assert.equal(good.ok, true);
    const bad = validateRegistryPatch({ website: 'javascript:alert(1)' });
    assert.equal(bad.ok, false);
  });

  it('rejects unknown fields rather than silently dropping them', () => {
    const parsed = validateRegistryPatch({ name: 'X', role: 'admin' });
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.match(parsed.error, /role/);
  });

  it('rejects empty names, oversized values and bad history counts', () => {
    assert.equal(validateRegistryPatch({ name: '   ' }).ok, false);
    assert.equal(validateRegistryPatch({ vendor: 'x'.repeat(301) }).ok, false);
    assert.equal(validateRegistryPatch({ historyMaxCount: 0 }).ok, false);
    assert.equal(validateRegistryPatch({ historyMaxCount: 1.5 }).ok, false);
    assert.equal(validateRegistryPatch({}).ok, false);
  });

  it('rejects an invalid date instead of inventing one', () => {
    assert.equal(validateRegistryPatch({ historyMinDate: 'not-a-date' }).ok, false);
    assert.equal(validateRegistryPatch({ historyMinDate: null }).ok, true);
  });
});

describe('validateReleasePatch', () => {
  it('accepts verification and a category from the closed enum', () => {
    const parsed = validateReleasePatch({ isVerified: true, category: 'Security Patches' });
    assert.equal(parsed.ok, true);
  });

  it('rejects an unknown category', () => {
    assert.equal(validateReleasePatch({ category: 'Cool Stuff' }).ok, false);
  });

  it('rejects an empty summary and unknown fields', () => {
    assert.equal(validateReleasePatch({ summary: '   ' }).ok, false);
    assert.equal(validateReleasePatch({ summary: 'ok', promoted: true }).ok, false);
  });
});

describe('slugify', () => {
  it('produces catalog ids that match the rules alphabet', () => {
    assert.equal(slugify('FL Studio 25!'), 'fl-studio-25');
    assert.equal(slugify('  '), '');
  });
});
