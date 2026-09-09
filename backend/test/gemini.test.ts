import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRelease, stripCodeFences } from '../src/services/gemini.ts';

/**
 * Model output is not trusted. These cover the re-validation that stands between
 * a hallucinated field and a notification sent to every subscriber.
 */

describe('stripCodeFences', () => {
  it('unwraps a json fence', () => {
    assert.equal(stripCodeFences('```json\n{"a":1}\n```'), '{"a":1}');
  });

  it('unwraps a bare fence', () => {
    assert.equal(stripCodeFences('```\n{"a":1}\n```'), '{"a":1}');
  });

  it('leaves unfenced json alone', () => {
    assert.equal(stripCodeFences('{"a":1}'), '{"a":1}');
  });
});

describe('sanitizeRelease', () => {
  it('rejects a date returned as a version', () => {
    // The prompt forbids this; the model does it anyway often enough to matter.
    // Accepting one creates a brand-new "release" on every single scrape.
    const result = sanitizeRelease({
      version: '2026-04-20',
      category: 'New Features',
      summary: 'x',
      isGenuineUpdate: true,
      releaseDate: null,
    });
    assert.equal(result.version, '');
    assert.equal(result.isGenuineUpdate, false);
  });

  it('defaults an off-list category rather than propagating it', () => {
    const result = sanitizeRelease({
      version: '1.0',
      category: 'Something Invented' as never,
      summary: 'x',
      isGenuineUpdate: true,
      releaseDate: null,
    });
    assert.equal(result.category, 'Feature Updates');
  });

  it('normalises a parseable date to ISO, anchored to UTC', () => {
    // Must hold in every timezone. `new Date('March 9, 2026')` is local
    // midnight, so a naive toISOString() yields 2026-03-08 anywhere east of
    // UTC — the calendar day silently shifts. See lib/dates.ts.
    const result = sanitizeRelease({
      version: '1.0',
      category: 'Bug Fixes',
      summary: 'x',
      isGenuineUpdate: true,
      releaseDate: 'March 9, 2026',
    });
    assert.equal(result.releaseDate, '2026-03-09T00:00:00.000Z');
  });

  it('preserves an explicit instant rather than flattening it to a date', () => {
    const result = sanitizeRelease({
      version: '1.0',
      category: 'Bug Fixes',
      summary: 'x',
      isGenuineUpdate: true,
      releaseDate: '2026-03-09T14:30:00Z',
    });
    assert.equal(result.releaseDate, '2026-03-09T14:30:00.000Z');
  });

  it('nulls an unparseable date instead of inventing one', () => {
    const result = sanitizeRelease({
      version: '1.0',
      category: 'Bug Fixes',
      summary: 'x',
      isGenuineUpdate: true,
      releaseDate: 'whenever',
    });
    assert.equal(result.releaseDate, null);
  });

  it('treats a missing version as not a genuine update', () => {
    const result = sanitizeRelease({
      version: '',
      category: 'Bug Fixes',
      summary: 'x',
      isGenuineUpdate: true,
      releaseDate: null,
    });
    assert.equal(result.isGenuineUpdate, false);
  });
});
