import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractFeedLinks,
  isPublicHttpUrl,
  looksLikeChangelog,
  looksLikeFeed,
  rediscover,
} from '../src/services/discovery.ts';
import {
  isValidNpmName,
  repoSlug,
  summariseNpm,
  summarisePypi,
} from '../src/services/registries.ts';

describe('isPublicHttpUrl', () => {
  it('accepts ordinary public sites', () => {
    assert.equal(isPublicHttpUrl('https://example.com/changelog'), true);
    assert.equal(isPublicHttpUrl('http://www.vendor.io'), true);
  });

  it('rejects loopback, private ranges and the metadata endpoint', () => {
    for (const url of [
      'http://localhost:8080',
      'http://127.0.0.1',
      'http://169.254.169.254/latest/meta-data',
      'http://10.0.0.5',
      'http://192.168.1.1',
      'http://172.16.0.1',
      'http://[::1]/',
      'http://metadata.google.internal',
      'http://intranet',
    ]) {
      assert.equal(isPublicHttpUrl(url), false, url);
    }
  });

  it('rejects non-http schemes and junk', () => {
    assert.equal(isPublicHttpUrl('file:///etc/passwd'), false);
    assert.equal(isPublicHttpUrl('ftp://example.com'), false);
    assert.equal(isPublicHttpUrl('not a url'), false);
  });
});

describe('extractFeedLinks', () => {
  it('finds advertised feeds and resolves relative hrefs', () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="/blog/feed.xml">
      <link rel="alternate" type="application/atom+xml" href="https://example.com/a.atom">
      <link rel="alternate" hreflang="de" href="/de">
      <link rel="stylesheet" href="/s.css">
    </head></html>`;
    assert.deepEqual(extractFeedLinks(html, 'https://example.com/'), [
      'https://example.com/blog/feed.xml',
      'https://example.com/a.atom',
    ]);
  });

  it('returns nothing when no feed is advertised', () => {
    assert.deepEqual(extractFeedLinks('<html><head></head></html>', 'https://x.com'), []);
  });
});

describe('looksLikeFeed / looksLikeChangelog', () => {
  it('tells a feed from an HTML soft-404', () => {
    assert.equal(looksLikeFeed('<?xml version="1.0"?><rss version="2.0"><channel/></rss>'), true);
    assert.equal(looksLikeFeed('<feed xmlns="http://www.w3.org/2005/Atom"></feed>'), true);
    assert.equal(looksLikeFeed('<html><body>Page not found</body></html>'), false);
  });

  it('accepts a page with several versions and rejects a marketing page', () => {
    const changelog = '<body><h1>Changelog</h1>\n<h2>2.1.0</h2>\n<h2>2.0.1</h2>\n<h2>2.0.0</h2></body>';
    assert.equal(looksLikeChangelog(changelog), true);
    assert.equal(looksLikeChangelog('<body><h1>Welcome</h1><p>We build things.</p></body>'), false);
  });
});

describe('repoSlug', () => {
  it('normalises the many spellings of a repo url', () => {
    for (const url of [
      'https://github.com/Owner/Repo',
      'git+https://github.com/owner/repo.git',
      'git://github.com/owner/repo.git',
      'git@github.com:owner/repo.git',
      'https://github.com/owner/repo/tree/main',
    ]) {
      assert.equal(repoSlug(url), 'owner/repo', url);
    }
  });

  it('returns null for non-repo values', () => {
    assert.equal(repoSlug(null), null);
    assert.equal(repoSlug('https://example.com'), null);
  });
});

describe('summariseNpm', () => {
  const doc = {
    'dist-tags': { latest: '2.0.0' },
    repository: { url: 'git+https://github.com/o/r.git' },
    time: {
      created: '2020-01-01T00:00:00.000Z',
      modified: '2026-03-01T00:00:00.000Z',
      '1.0.0': '2021-01-01T00:00:00.000Z',
      '2.0.0-beta.1': '2026-01-01T00:00:00.000Z',
      '2.0.0': '2026-02-01T00:00:00.000Z',
      '1.5.0': '2022-01-01T00:00:00.000Z',
    },
  };

  it('returns newest-first stable releases and skips bookkeeping and prereleases', () => {
    const s = summariseNpm(doc, 2);
    assert.deepEqual(s.releases.map((r) => r.version), ['2.0.0', '1.5.0']);
    assert.equal(s.latest, '2.0.0');
    assert.equal(s.repositoryUrl, 'git+https://github.com/o/r.git');
  });

  it('handles a string repository field', () => {
    assert.equal(summariseNpm({ repository: 'github:o/r' }).repositoryUrl, 'github:o/r');
  });
});

describe('summarisePypi', () => {
  it('uses earliest live upload, skips yanked files and prereleases', () => {
    const s = summarisePypi({
      info: { version: '3.0', project_urls: { Source: 'https://github.com/o/r' } },
      releases: {
        '3.0': [{ upload_time_iso_8601: '2026-02-01T00:00:00Z' }],
        '3.1rc1': [{ upload_time_iso_8601: '2026-03-01T00:00:00Z' }],
        '2.0': [{ upload_time_iso_8601: '2025-01-01T00:00:00Z', yanked: true }],
        '1.0': [{ upload_time_iso_8601: '2024-01-01T00:00:00Z' }],
      },
    });
    assert.deepEqual(s.releases.map((r) => r.version), ['3.0', '1.0']);
    assert.equal(repoSlug(s.repositoryUrl), 'o/r');
  });
});

describe('isValidNpmName', () => {
  it('accepts normal and scoped names, rejects path tricks', () => {
    assert.equal(isValidNpmName('left-pad'), true);
    assert.equal(isValidNpmName('@scope/pkg'), true);
    assert.equal(isValidNpmName('../etc'), false);
    assert.equal(isValidNpmName('Has Space'), false);
  });
});

describe('rediscover', () => {
  const existing = {
    name: 'Audacity',
    vendor: 'Muse Group',
    website: null,
    icon_url: null,
    github_url: null,
    rss_url: 'https://example.com/feed.xml',
    changelog_url: null,
  };

  it('keeps the existing record and flags it when the model is unavailable', async () => {
    const result = await rediscover(existing, async () => {
      throw new Error('429 RESOURCE_EXHAUSTED');
    });
    assert.equal(result.usedModel, false);
    assert.match(result.modelError ?? '', /429/);
    assert.equal(result.source.name, 'Audacity');
    assert.equal(result.source.rss_url, 'https://example.com/feed.xml');
  });

  it('uses the model result when it answers', async () => {
    const result = await rediscover(existing, async (query) => ({
      name: query,
      vendor: 'Muse Group',
      website: null,
      icon_url: null,
      type: 'software',
      github_url: 'https://github.com/audacity/audacity',
      rss_url: null,
      changelog_url: null,
      suggested_priority: [],
    }));
    assert.equal(result.usedModel, true);
    assert.equal(result.modelError, null);
    assert.equal(result.source.github_url, 'https://github.com/audacity/audacity');
  });
});
