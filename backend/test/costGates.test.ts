import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseSearch, searchFields } from '../src/lib/searchKey.ts';
import { hashSources } from '../src/lib/sourceHash.ts';
import { pollIntervalMinutes, selectDue } from '../src/lib/schedule.ts';
import { evaluatePipelineHealth, expiresAt } from '../src/lib/retention.ts';
import { blockDurationMs, isQuotaError, parseRetryDelayMs } from '../src/lib/geminiGate.ts';
import { SCHEDULED_STRATEGIES } from '../src/services/gemini.ts';

describe('searchFields', () => {
  it('normalises case, punctuation and accents', () => {
    assert.equal(normaliseSearch('  Node.js  '), 'node js');
    assert.equal(normaliseSearch('Café-Ünïcode'), 'cafe unicode');
  });

  it('builds a prefix key and whole-word tokens', () => {
    const f = searchFields('FL Studio');
    assert.equal(f.searchKey, 'fl studio');
    assert.deepEqual(f.searchTokens, ['fl', 'studio']);
  });

  it('drops one-letter tokens, dedupes and caps the count', () => {
    assert.deepEqual(searchFields('C and C Studio Studio').searchTokens, ['and', 'studio']);
    assert.equal(searchFields('a b c d e f g h i j k l m n o p').searchTokens.length, 0);
    const many = searchFields('aa bb cc dd ee ff gg hh ii jj').searchTokens;
    assert.equal(many.length, 8);
  });
});

describe('hashSources', () => {
  const a = { source: 'github', text: 'releases v1' };
  const b = { source: 'rss', text: 'feed' };

  it('is stable regardless of fetch order', () => {
    assert.equal(hashSources([a, b]), hashSources([b, a]));
  });

  it('changes when any source changes', () => {
    assert.notEqual(hashSources([a, b]), hashSources([a, { ...b, text: 'feed v2' }]));
  });

  it('does not confuse where one source ends and the next begins', () => {
    assert.notEqual(
      hashSources([{ source: 'a', text: 'bc' }]),
      hashSources([{ source: 'ab', text: 'c' }]),
    );
  });
});

describe('selectDue', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z');
  const entries = [
    { id: 'never', active: true, lastCheck: null },
    { id: 'old', active: true, lastCheck: '2026-10-28T01:00:00.000Z' },
    { id: 'older', active: true, lastCheck: '2026-10-27T01:00:00.000Z' },
    { id: 'fresh', active: true, lastCheck: '2026-10-28T07:00:00.000Z' },
    { id: 'off', active: false, lastCheck: null },
    { id: 'unfollowed', active: true, lastCheck: null },
  ];
  const followed = new Set(['never', 'old', 'older', 'fresh', 'off']);

  it('polls only followed, active, due entries', () => {
    const due = selectDue(entries, followed, now, 100, 360);
    assert.ok(!due.includes('unfollowed'));
    assert.ok(!due.includes('off'));
    assert.ok(!due.includes('fresh'));
  });

  it('puts never-polled first, then oldest check', () => {
    assert.deepEqual(selectDue(entries, followed, now, 100, 360), ['never', 'older', 'old']);
  });

  it('respects the cap', () => {
    assert.deepEqual(selectDue(entries, followed, now, 1, 360), ['never']);
  });

  it('polls recently released products sooner than quiet ones', () => {
    const checkedFourHoursAgo = '2026-10-28T08:00:00.000Z';
    const probes = [
      { id: 'busy', active: true, lastCheck: checkedFourHoursAgo, lastReleaseDate: '2026-10-27T12:00:00.000Z' },
      { id: 'quiet', active: true, lastCheck: checkedFourHoursAgo, lastReleaseDate: '2025-01-01T00:00:00.000Z' },
      { id: 'unknown', active: true, lastCheck: checkedFourHoursAgo, lastReleaseDate: null },
    ];
    // busy: 60 min interval, due. quiet: 24 h, not due. unknown: 6 h, not due after 4 h.
    assert.deepEqual(selectDue(probes, new Set(['busy', 'quiet', 'unknown']), now, 10), ['busy']);
  });
});

describe('pollIntervalMinutes', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z');
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

  it('backs off as a product goes quiet', () => {
    assert.equal(pollIntervalMinutes(daysAgo(1), now), 60);
    assert.equal(pollIntervalMinutes(daysAgo(7), now), 180);
    assert.equal(pollIntervalMinutes(daysAgo(30), now), 360);
    assert.equal(pollIntervalMinutes(daysAgo(100), now), 720);
    assert.equal(pollIntervalMinutes(daysAgo(400), now), 1_440);
  });

  it('falls back to the default without a usable date', () => {
    assert.equal(pollIntervalMinutes(null, now), 360);
    assert.equal(pollIntervalMinutes('not a date', now), 360);
  });
});

describe('retention', () => {
  it('stamps a Timestamp the right number of days ahead', () => {
    const now = Date.parse('2026-10-28T00:00:00.000Z');
    assert.equal(expiresAt(30, now).toMillis(), now + 30 * 86_400_000);
  });
});

describe('pipeline health', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z');

  it('is healthy while sweeps keep arriving', () => {
    const h = evaluatePipelineHealth('2026-10-28T11:10:00.000Z', now);
    assert.equal(h.ok, true);
    assert.equal(h.ageMinutes, 50);
  });

  it('fails on silence or no record at all', () => {
    assert.equal(evaluatePipelineHealth('2026-10-28T07:00:00.000Z', now).ok, false);
    assert.equal(evaluatePipelineHealth(null, now).ok, false);
    assert.equal(evaluatePipelineHealth('garbage', now).ok, false);
  });
});

describe('Gemini quota gate', () => {
  const body =
    '{"error":{"code":429,"message":"You exceeded your current quota. Please retry in 10h46m8.9s.",' +
    '"status":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"38768s"}]}}';

  it('recognises quota errors however they are wrapped', () => {
    assert.equal(isQuotaError(Object.assign(new Error('x'), { status: 429 })), true);
    assert.equal(isQuotaError(new Error(body)), true);
    assert.equal(isQuotaError(new Error('RESOURCE_EXHAUSTED')), true);
    assert.equal(isQuotaError(new Error('connect ECONNRESET')), false);
    assert.equal(isQuotaError(null), false);
  });

  it('reads the retry delay from either form Google uses', () => {
    assert.equal(parseRetryDelayMs('"retryDelay":"38753s"'), 38_753_000);
    assert.equal(parseRetryDelayMs('Please retry in 2m30s'), 150_000);
    assert.equal(parseRetryDelayMs('Please retry in 10h46m8.9s'), 38_768_900);
  });

  it('defaults and caps the block', () => {
    assert.equal(parseRetryDelayMs('no hint here'), 15 * 60_000);
    assert.equal(blockDurationMs(new Error('retryDelay":"999999s')), 24 * 3_600_000);
  });
});

describe('scheduled polls', () => {
  it('use one extraction and never paid web search', () => {
    assert.deepEqual(SCHEDULED_STRATEGIES.map((s) => s.name), ['gemini_direct']);
  });
});
