import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_SETTING, RELEASE_CATEGORIES, isReleaseCategory } from '../src/lib/types.ts';

describe('release categories', () => {
  it('matches the extraction prompt verbatim', () => {
    // A drift here silently turns a whole category into a default.
    assert.deepEqual(RELEASE_CATEGORIES, [
      'New Features',
      'Feature Updates',
      'Optimization/Tips',
      'Bug Fixes',
      'Security Patches',
      'Major Milestone Update',
      'Compliance Updates',
      'Accessibility Improvements',
      'Localization Updates',
      'API Breaking Changes',
      'Enterprise Features',
      'Performance Changes',
      'Developer Experience Changes',
      'Infrastructure Changes',
      'Data Changes',
      'UI/UX Changes',
      'Documentation Updates',
    ]);
  });

  it('rejects anything off-list', () => {
    assert.equal(isReleaseCategory('New Features'), true);
    assert.equal(isReleaseCategory('new features'), false);
    assert.equal(isReleaseCategory(null), false);
  });
});

describe('CATEGORY_SETTING', () => {
  it('covers every category', () => {
    for (const category of RELEASE_CATEGORIES) {
      assert.ok(category in CATEGORY_SETTING, `${category} has no mapping`);
    }
  });

  it('matches the Android client mapping', () => {
    // Pinned on both sides. If these disagree, users either get muted
    // categories or silently miss ones they asked for.
    assert.equal(CATEGORY_SETTING['New Features'], 'notifyFeatures');
    assert.equal(CATEGORY_SETTING['Feature Updates'], 'notifyFeatures');
    assert.equal(CATEGORY_SETTING['Optimization/Tips'], 'notifyOptimizations');
    assert.equal(CATEGORY_SETTING['Bug Fixes'], 'notifyFixes');
    assert.equal(CATEGORY_SETTING['Security Patches'], 'notifySecurity');
    // Verify new categories have mappings
    assert.ok(CATEGORY_SETTING['Compliance Updates'] !== undefined);
    assert.ok(CATEGORY_SETTING['Accessibility Improvements'] !== undefined);
    assert.ok(CATEGORY_SETTING['Localization Updates'] !== undefined);
    assert.ok(CATEGORY_SETTING['API Breaking Changes'] !== undefined);
    assert.ok(CATEGORY_SETTING['Enterprise Features'] !== undefined);
    assert.ok(CATEGORY_SETTING['Performance Changes'] !== undefined);
    assert.ok(CATEGORY_SETTING['Developer Experience Changes'] !== undefined);
    assert.ok(CATEGORY_SETTING['Infrastructure Changes'] !== undefined);
    assert.ok(CATEGORY_SETTING['Data Changes'] !== undefined);
    assert.ok(CATEGORY_SETTING['UI/UX Changes'] !== undefined);
    assert.ok(CATEGORY_SETTING['Documentation Updates'] !== undefined);
  });

  it('always sends major milestones and compliance updates', () => {
    assert.equal(CATEGORY_SETTING['Major Milestone Update'], null);
    assert.equal(CATEGORY_SETTING['Compliance Updates'], null);
  });
});
