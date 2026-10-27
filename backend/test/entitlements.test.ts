import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveTier,
  limitsFor,
  normalizeTier,
} from '../src/lib/entitlements.js';

describe('normalizeTier', () => {
  it('accepts the three known tiers case-insensitively', () => {
    assert.equal(normalizeTier('pro'), 'PRO');
    assert.equal(normalizeTier(' Enterprise '), 'ENTERPRISE');
    assert.equal(normalizeTier('FREE'), 'FREE');
  });

  it('fails closed to FREE for unknown or missing values', () => {
    assert.equal(normalizeTier('PLATINUM'), 'FREE');
    assert.equal(normalizeTier(undefined), 'FREE');
    assert.equal(normalizeTier(42), 'FREE');
  });
});

describe('effectiveTier', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');

  it('leaves FREE alone even with a future expiry', () => {
    assert.equal(effectiveTier('FREE', '2027-01-01T00:00:00Z', now), 'FREE');
  });

  it('keeps a paid tier with no expiry', () => {
    assert.equal(effectiveTier('PRO', null, now), 'PRO');
    assert.equal(effectiveTier('ENTERPRISE', '', now), 'ENTERPRISE');
  });

  it('keeps a paid tier before its expiry', () => {
    assert.equal(effectiveTier('PRO', '2026-11-01T00:00:00Z', now), 'PRO');
  });

  it('downgrades an expired paid tier', () => {
    assert.equal(effectiveTier('PRO', '2026-10-01T00:00:00Z', now), 'FREE');
  });

  it('fails closed on an unparseable expiry', () => {
    assert.equal(effectiveTier('ENTERPRISE', 'next tuesday', now), 'FREE');
  });
});

describe('limitsFor', () => {
  it('gives FREE the documented hard limits', () => {
    const limits = limitsFor('FREE');
    assert.equal(limits.maxTrackedItems, 5);
    assert.equal(limits.historyDays, 30);
    assert.equal(limits.historyBackfill, false);
    assert.equal(limits.exportEnabled, false);
    assert.ok(limits.discoveryPerHour < limitsFor('PRO').discoveryPerHour);
  });

  it('gives paid tiers unlimited tracking and history', () => {
    for (const tier of ['PRO', 'ENTERPRISE'] as const) {
      const limits = limitsFor(tier);
      assert.equal(limits.maxTrackedItems, null);
      assert.equal(limits.historyDays, null);
      assert.equal(limits.historyBackfill, true);
      assert.equal(limits.exportEnabled, true);
    }
  });

  it('keeps enterprise quotas above pro', () => {
    assert.ok(limitsFor('ENTERPRISE').refreshPerHour > limitsFor('PRO').refreshPerHour);
    assert.ok(limitsFor('ENTERPRISE').discoveryPerHour > limitsFor('PRO').discoveryPerHour);
  });
});
