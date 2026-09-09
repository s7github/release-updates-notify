import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isNewerThan,
  isProbablyDateNotVersion,
  normalizeVersion,
  releaseDocumentId,
  toDocumentIdSegment,
} from '../src/lib/version.ts';

/**
 * These mirror `VersionNormalizerTest.kt` case for case.
 *
 * The two implementations must agree: the client derives release document ids
 * the same way, and a disagreement means re-extraction creates duplicates
 * instead of overwriting — which means duplicate notifications.
 */

describe('normalizeVersion', () => {
  it('strips a leading v', () => {
    assert.equal(normalizeVersion('v25.2.5'), '25.2.5');
    assert.equal(normalizeVersion('V1.0'), '1.0');
  });

  it('keeps a leading v that is part of a word', () => {
    assert.equal(normalizeVersion('vivaldi 6.0'), 'vivaldi 6.0');
  });

  it('strips a trailing date parenthetical', () => {
    assert.equal(normalizeVersion('25.2.5 (2026/03/09)'), '25.2.5');
  });
});

describe('toDocumentIdSegment', () => {
  it('is stable and url safe', () => {
    assert.equal(toDocumentIdSegment('v25.2.5 (2026/03/09)'), '25-2-5');
    assert.equal(toDocumentIdSegment('1.2.3-beta'), '1-2-3-beta');
  });

  it('gives cosmetic variants the same id', () => {
    assert.equal(toDocumentIdSegment('v25.2.5'), toDocumentIdSegment('25.2.5 (2026/03/09)'));
  });

  it('composes a full document id', () => {
    assert.equal(releaseDocumentId('fl-studio', 'v25.2.5'), 'fl-studio-25-2-5');
  });
});

describe('isProbablyDateNotVersion', () => {
  it('recognises bare dates', () => {
    assert.equal(isProbablyDateNotVersion('2026-04-20'), true);
    assert.equal(isProbablyDateNotVersion('2026/4/20'), true);
  });

  it('does not misfire on real versions', () => {
    assert.equal(isProbablyDateNotVersion('25.2.5'), false);
    assert.equal(isProbablyDateNotVersion('2024.1.2'), false);
  });
});

describe('isNewerThan — the genuine-update gate', () => {
  it('compares component-wise, not lexically', () => {
    assert.equal(isNewerThan('1.10.0', '1.9.0'), true);
    assert.equal(isNewerThan('1.9.0', '1.10.0'), false);
  });

  it('handles differing component counts', () => {
    assert.equal(isNewerThan('25.1', '25.0.9'), true);
    assert.equal(isNewerThan('25.0', '25.0.0'), false);
  });

  it('treats anything as newer than no recorded version', () => {
    assert.equal(isNewerThan('1.0', null), true);
    assert.equal(isNewerThan('1.0', undefined), true);
    assert.equal(isNewerThan('1.0', ''), true);
  });

  it('does not consider an identical version newer', () => {
    // If this regresses, every scheduled poll notifies every subscriber again.
    assert.equal(isNewerThan('25.2.5', '25.2.5'), false);
    assert.equal(isNewerThan('v25.2.5', '25.2.5'), false);
    assert.equal(isNewerThan('25.2.5 (2026/03/09)', '25.2.5'), false);
  });
});
