import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseSearch, searchFields } from '../src/lib/searchKey.ts';
import { hashSources } from '../src/lib/sourceHash.ts';
import { selectDue } from '../src/lib/schedule.ts';
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
  const cutoff = '2026-10-28T06:00:00.000Z';
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
    const due = selectDue(entries, followed, cutoff, 100);
    assert.ok(!due.includes('unfollowed'));
    assert.ok(!due.includes('off'));
    assert.ok(!due.includes('fresh'));
  });

  it('puts never-polled first, then oldest check', () => {
    assert.deepEqual(selectDue(entries, followed, cutoff, 100), ['never', 'older', 'old']);
  });

  it('respects the cap', () => {
    assert.deepEqual(selectDue(entries, followed, cutoff, 1), ['never']);
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
