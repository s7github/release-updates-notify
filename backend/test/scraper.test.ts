import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectivePriority,
  githubApiUrl,
  parseLooseDate,
  scrapeVersionsFromHtml,
} from '../src/services/scraper.ts';

describe('effectivePriority', () => {
  it('prefers the admin override over the AI suggestion', () => {
    assert.deepEqual(
      effectivePriority({
        id: 'x',
        name: 'X',
        priority_order: 'rss, github',
        suggested_priority: ['html'],
      }),
      ['rss', 'github'],
    );
  });

  it('falls back to the AI suggestion', () => {
    assert.deepEqual(
      effectivePriority({ id: 'x', name: 'X', suggested_priority: ['html', 'github'] }),
      ['html', 'github'],
    );
  });

  it('falls back to a sane default', () => {
    assert.deepEqual(effectivePriority({ id: 'x', name: 'X' }), ['github', 'rss', 'html']);
  });

  it('ignores an empty suggestion rather than producing no sources', () => {
    assert.deepEqual(
      effectivePriority({ id: 'x', name: 'X', suggested_priority: [] }),
      ['github', 'rss', 'html'],
    );
  });
});

describe('githubApiUrl', () => {
  it('builds the releases endpoint', () => {
    assert.equal(
      githubApiUrl('https://github.com/owner/repo'),
      'https://api.github.com/repos/owner/repo/releases?per_page=3',
    );
  });

  it('tolerates trailing slashes and .git', () => {
    assert.equal(
      githubApiUrl('https://github.com/owner/repo.git/'),
      'https://api.github.com/repos/owner/repo/releases?per_page=3',
    );
  });

  it('returns null for things that are not repo urls', () => {
    // An org page has no releases; building the URL anyway would 404 every poll.
    assert.equal(githubApiUrl('https://github.com/owner'), null);
    assert.equal(githubApiUrl('https://example.com/owner/repo'), null);
  });
});

describe('parseLooseDate', () => {
  it('parses the year-first form vendors use', () => {
    assert.ok(parseLooseDate('2026 / March / 09').startsWith('2026-03-09'));
  });

  it('parses an ordinary date', () => {
    assert.ok(parseLooseDate('March 9, 2026').startsWith('2026-03-09'));
  });

  it('falls back to now rather than throwing on junk', () => {
    const result = parseLooseDate('sometime last spring');
    assert.ok(!Number.isNaN(new Date(result).getTime()));
  });
});

describe('scrapeVersionsFromHtml', () => {
  it('extracts versions and dates from a changelog page', () => {
    const html = `
      <html><body>
        <h3>25.2.5 (2026/03/09)</h3>
        <ul><li>Fixed a crash</li><li>Added a thing</li></ul>
        <h3>25.2.4 (2026/01/15)</h3>
        <p>Minor improvements</p>
      </body></html>`;

    const found = scrapeVersionsFromHtml(html);
    assert.equal(found.length, 2);
    assert.equal(found[0]?.version, '25.2.5');
    assert.ok(found[0]?.summary.includes('Fixed a crash'));
    assert.equal(found[1]?.version, '25.2.4');
  });

  it('does not emit the same version twice', () => {
    const html = `<body><h3>1.0 (2026/01/01)</h3><p>x</p><h3>1.0 (2026/01/01)</h3></body>`;
    assert.equal(scrapeVersionsFromHtml(html).length, 1);
  });

  it('finds nothing in a page with no versions', () => {
    const html = '<body><h1>About us</h1><p>We make software.</p></body>';
    assert.deepEqual(scrapeVersionsFromHtml(html), []);
  });
});
