import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toIndexEntries } from '../src/lib/catalogIndex.js';

describe('toIndexEntries', () => {
  it('drops inactive and nameless entries', () => {
    const out = toIndexEntries([
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta', active: false },
      { id: 'c' },
      { id: 'd', name: '   ' },
      { id: 'e', name: '!!!' },
    ]);
    assert.deepEqual(out.map((e) => e.id), ['a']);
  });

  it('computes the search key and slug from the name', () => {
    const [entry] = toIndexEntries([{ id: 'x1', name: 'FL Studio', vendor: 'Image-Line' }]);
    assert.deepEqual(entry, { id: 'x1', name: 'FL Studio', key: 'fl studio', slug: 'fl-studio', vendor: 'Image-Line' });
  });

  it('keeps slugs unique and stable regardless of input order', () => {
    const docs = [
      { id: 'zzzzzzzz', name: 'Studio' },
      { id: 'aaaaaaaa', name: 'Studio' },
    ];
    const forward = toIndexEntries(docs);
    const reversed = toIndexEntries([...docs].reverse());
    assert.deepEqual(forward, reversed);
    assert.equal(forward.find((e) => e.id === 'aaaaaaaa')?.slug, 'studio');
    assert.equal(forward.find((e) => e.id === 'zzzzzzzz')?.slug, 'studio-zzzzzz');
    assert.equal(new Set(forward.map((e) => e.slug)).size, 2);
  });

  it('omits a blank vendor', () => {
    const [entry] = toIndexEntries([{ id: 'a', name: 'Alpha', vendor: ' ' }]);
    assert.equal('vendor' in entry!, false);
  });
});
