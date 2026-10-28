import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicRelease,
  classifyRelease,
  decideFromStructured,
  latestRelease,
  versionFromLabel,
  type StructuredRelease,
} from '../src/lib/deterministic.ts';

const rel = (version: string, over: Partial<StructuredRelease> = {}): StructuredRelease => ({
  version,
  releaseDate: '2026-01-01T00:00:00Z',
  notes: null,
  ...over,
});

describe('versionFromLabel', () => {
  it('reads common tag shapes', () => {
    assert.equal(versionFromLabel('v1.2.3'), '1.2.3');
    assert.equal(versionFromLabel('release-2024.1'), '2024.1');
    assert.equal(versionFromLabel('pkg@2.0.1'), '2.0.1');
    assert.equal(versionFromLabel('Audacity 3.7.1'), '3.7.1');
    assert.equal(versionFromLabel('v1.0.0-rc.1'), '1.0.0-rc.1');
  });

  it('rejects dates, codenames and moving tags', () => {
    assert.equal(versionFromLabel('2026-04-20'), null);
    assert.equal(versionFromLabel('nightly'), null);
    assert.equal(versionFromLabel('Sonoma'), null);
    assert.equal(versionFromLabel(''), null);
    assert.equal(versionFromLabel(null), null);
  });
});

describe('latestRelease', () => {
  it('compares numerically, not lexically', () => {
    assert.equal(latestRelease([rel('1.9.0'), rel('1.10.0'), rel('1.2.0')])?.version, '1.10.0');
  });

  it('ignores prereleases, flagged or labelled', () => {
    const got = latestRelease([
      rel('2.0.0-beta.1'),
      rel('2.0.0', { prerelease: true }),
      rel('1.5.0'),
    ]);
    assert.equal(got?.version, '1.5.0');
  });

  it('returns null when nothing qualifies', () => {
    assert.equal(latestRelease([]), null);
    assert.equal(latestRelease([rel('1.0.0-rc.1')]), null);
  });

  it('prefers the newer date on a tie', () => {
    const got = latestRelease([
      rel('1.0.0', { releaseDate: '2026-01-01', notes: 'old' }),
      rel('1.0.0', { releaseDate: '2026-02-01', notes: 'new' }),
    ]);
    assert.equal(got?.notes, 'new');
  });
});

describe('decideFromStructured', () => {
  const chunks = [{ releases: [rel('3.1.0')] }, { releases: [rel('3.0.5')] }];

  it('says none without structured releases', () => {
    assert.deepEqual(decideFromStructured([{}, { releases: [] }], '1.0.0'), { kind: 'none' });
  });

  it('says unchanged when the newest is not newer than what we have', () => {
    assert.deepEqual(decideFromStructured(chunks, '3.1.0'), { kind: 'unchanged', version: '3.1.0' });
    assert.deepEqual(decideFromStructured(chunks, 'v3.2.0'), { kind: 'unchanged', version: '3.1.0' });
  });

  it('says new for a higher version, and for a first poll', () => {
    const higher = decideFromStructured(chunks, '3.0.0');
    assert.equal(higher.kind === 'new' && higher.release.version, '3.1.0');
    assert.equal(decideFromStructured(chunks, null).kind, 'new');
  });

  it('takes the highest version across disagreeing sources', () => {
    const d = decideFromStructured(
      [{ releases: [rel('2.0.0')] }, { releases: [rel('2.1.0')] }],
      '1.0.0',
    );
    assert.equal(d.kind === 'new' && d.release.version, '2.1.0');
  });
});

describe('classifyRelease', () => {
  it('flags security first', () => {
    assert.equal(classifyRelease('1.0.1', 'Fixes CVE-2026-1234', '1.0.0'), 'Security Patches');
  });

  it('flags a major bump', () => {
    assert.equal(classifyRelease('2.0.0', 'misc', '1.9.0'), 'Major Milestone Update');
  });

  it('falls through breaking, feature, perf, fix, default', () => {
    assert.equal(classifyRelease('1.1.0', 'BREAKING: removed flag', '1.0.0'), 'API Breaking Changes');
    assert.equal(classifyRelease('1.1.0', 'Added dark mode', '1.0.0'), 'New Features');
    assert.equal(classifyRelease('1.1.0', 'Much faster startup', '1.0.0'), 'Performance Changes');
    assert.equal(classifyRelease('1.0.1', 'Fixed a crash', '1.0.0'), 'Bug Fixes');
    assert.equal(classifyRelease('1.0.1', null, '1.0.0'), 'Feature Updates');
  });
});

describe('buildDeterministicRelease', () => {
  it('produces a notifiable release with no notes', () => {
    const r = buildDeterministicRelease('Foo', rel('1.2.3'), '1.2.2');
    assert.equal(r.version, '1.2.3');
    assert.equal(r.isGenuineUpdate, true);
    assert.match(r.summary, /Foo 1\.2\.3/);
  });

  it('truncates very long notes', () => {
    const r = buildDeterministicRelease('Foo', rel('1.2.3', { notes: 'x'.repeat(5_000) }), null);
    assert.ok(r.summary.length <= 1_201);
  });
});

describe('structuredFromGithub', () => {
  it('keeps versioned, non-draft releases and flags prereleases', async () => {
    const { structuredFromGithub } = await import('../src/services/scraper.ts');
    const got = structuredFromGithub([
      { tag_name: 'v2.1.0', published_at: '2026-03-01T00:00:00Z', body: 'Added X', prerelease: false },
      { tag_name: 'v2.2.0-rc.1', prerelease: true, published_at: '2026-03-05T00:00:00Z' },
      { tag_name: 'v9.9.9', draft: true },
      { tag_name: 'nightly', name: 'Nightly build' },
    ]);
    assert.deepEqual(
      got.map((r) => [r.version, r.prerelease]),
      [['2.1.0', false], ['2.2.0-rc.1', true]],
    );
    assert.equal(got[0]?.notes, 'Added X');
    assert.equal(latestRelease(got)?.version, '2.1.0');
  });
});

describe('fetchGitHubReleases conditional requests', () => {
  it('sends If-None-Match and reports a 304 as not modified', async () => {
    const axios = (await import('axios')).default;
    const { fetchGitHubReleases } = await import('../src/services/scraper.ts');
    const original = axios.defaults.adapter;
    let sent: unknown;
    axios.defaults.adapter = async (config) => {
      sent = config.headers?.get?.('If-None-Match') ?? (config.headers as Record<string, unknown>)['If-None-Match'];
      return { data: '', status: 304, statusText: 'Not Modified', headers: {}, config };
    };
    try {
      const chunk = await fetchGitHubReleases('https://github.com/o/r', 3, 'W/"abc"');
      assert.equal(sent, 'W/"abc"');
      assert.equal(chunk?.notModified, true);
      assert.equal(chunk?.etag, 'W/"abc"');
    } finally {
      axios.defaults.adapter = original;
    }
  });

  it('captures the ETag from a normal response', async () => {
    const axios = (await import('axios')).default;
    const { fetchGitHubReleases } = await import('../src/services/scraper.ts');
    const original = axios.defaults.adapter;
    axios.defaults.adapter = async (config) => ({
      data: [{ tag_name: 'v1.2.3', published_at: '2026-01-01T00:00:00Z', body: 'x' }],
      status: 200,
      statusText: 'OK',
      headers: { etag: 'W/"new"' },
      config,
    });
    try {
      const chunk = await fetchGitHubReleases('https://github.com/o/r', 3, null);
      assert.equal(chunk?.etag, 'W/"new"');
      assert.equal(chunk?.releases?.[0]?.version, '1.2.3');
      assert.equal(chunk?.notModified, undefined);
    } finally {
      axios.defaults.adapter = original;
    }
  });
});
