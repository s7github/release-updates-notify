import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  githubRepoUrl,
  mapCask,
  mapEol,
  mapFormula,
  mergeEntries,
  toRegistryDoc,
} from '../src/services/catalogSeed.ts';

describe('githubRepoUrl', () => {
  it('reduces any github url to the repo', () => {
    assert.equal(githubRepoUrl('https://github.com/o/r/archive/v1.tar.gz'), 'https://github.com/o/r');
    assert.equal(githubRepoUrl('https://github.com/o/r.git'), 'https://github.com/o/r');
    assert.equal(githubRepoUrl('https://www.github.com/o/r/releases'), 'https://github.com/o/r');
  });

  it('rejects org pages and non-github hosts', () => {
    assert.equal(githubRepoUrl('https://github.com/o'), null);
    assert.equal(githubRepoUrl('https://github.com/sponsors/someone'), null);
    assert.equal(githubRepoUrl('https://gitlab.com/o/r'), null);
    assert.equal(githubRepoUrl(null), null);
  });
});

describe('mapFormula / mapCask', () => {
  it('maps a formula and finds the repo from the source url', () => {
    const e = mapFormula({
      name: 'ripgrep',
      homepage: 'https://example.org/rg',
      urls: { stable: { url: 'https://github.com/BurntSushi/ripgrep/archive/14.tar.gz' } },
    });
    assert.equal(e?.id, 'ripgrep');
    assert.equal(e?.github_url, 'https://github.com/BurntSushi/ripgrep');
    assert.deepEqual(e?.origins, ['homebrew-formula']);
  });

  it('skips version pins, deprecated and disabled entries', () => {
    assert.equal(mapFormula({ name: 'python@3.12' }), null);
    assert.equal(mapFormula({ name: 'old', deprecated: true }), null);
    assert.equal(mapCask({ token: 'gone', disabled: true }), null);
  });

  it('uses the display name for a cask', () => {
    const e = mapCask({ token: '0-ad', name: ['0 A.D.'], homepage: 'https://play0ad.com/' });
    assert.equal(e?.name, '0 A.D.');
    assert.equal(e?.website, 'https://play0ad.com/');
  });

  it('drops a non-http homepage', () => {
    assert.equal(mapFormula({ name: 'x', homepage: 'javascript:alert(1)' })?.website, null);
  });
});

describe('mapEol', () => {
  it('treats the release policy as the changelog and never the aggregator as the website', () => {
    const e = mapEol({
      name: 'nodejs',
      label: 'Node.js',
      links: { html: 'https://endoflife.date/nodejs', releasePolicy: 'https://nodejs.org/en/about/previous-releases' },
    });
    assert.equal(e?.id, 'node-js');
    assert.equal(e?.website, null);
    assert.equal(e?.changelog_url, 'https://nodejs.org/en/about/previous-releases');
  });
});

describe('mergeEntries', () => {
  it('keeps the first non-null value per field and accumulates origins', () => {
    const [merged, ...rest] = mergeEntries([
      { id: 'a', name: 'A', website: null, github_url: 'https://github.com/o/a', changelog_url: 'https://a.io/log', description: null, origins: ['endoflife'] },
      { id: 'a', name: 'A2', website: 'https://a.io', github_url: 'https://github.com/x/other', changelog_url: null, description: 'd', origins: ['homebrew-cask'] },
    ]);
    assert.equal(rest.length, 0);
    assert.equal(merged?.name, 'A');
    assert.equal(merged?.github_url, 'https://github.com/o/a');
    assert.equal(merged?.website, 'https://a.io');
    assert.deepEqual(merged?.origins, ['endoflife', 'homebrew-cask']);
  });
});

describe('toRegistryDoc', () => {
  it('is searchable but never due for polling, and not claimed as verified', () => {
    const doc = toRegistryDoc(
      { id: 'a', name: 'A', website: 'https://a.io', github_url: 'https://github.com/o/a', changelog_url: null, description: null, origins: ['homebrew-cask'] },
      '2026-10-27T00:00:00.000Z',
    );
    assert.equal(doc.active, true);
    assert.equal(doc.lastCheck, null);
    assert.equal(doc.sourcesVerified, false);
    assert.deepEqual(doc.suggested_priority, ['github', 'html']);
  });
});
