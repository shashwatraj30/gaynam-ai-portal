import test from 'node:test';
import assert from 'node:assert/strict';
import { SIDEBAR_KEY, normalize, load, save, toggle } from '../js/ui/sidebar-state.js';
import { visibleReferenceItems, REFERENCE_ITEMS } from '../js/ui/sidebar.js';

const mem = (init = {}) => { const d = { ...init }; return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = v; }, d }; };

test('normalize defaults to expanded', () => {
  assert.equal(normalize('collapsed'), 'collapsed');
  for (const v of ['expanded', '', null, undefined, 'x', 1]) assert.equal(normalize(v), 'expanded');
});
test('load/save round trip with injected storage', () => {
  const s = mem();
  assert.equal(load(s), 'expanded');
  assert.equal(save('collapsed', s), 'collapsed');
  assert.equal(s.d[SIDEBAR_KEY], 'collapsed');
  assert.equal(load(s), 'collapsed');
  save('junk', s);
  assert.equal(s.d[SIDEBAR_KEY], 'expanded');
});
test('storage failures never throw', () => {
  const bad = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  assert.equal(load(bad), 'expanded');
  assert.equal(save('collapsed', bad), 'collapsed');
  assert.equal(load(null), 'expanded');
});
test('toggle flips', () => {
  assert.equal(toggle('expanded'), 'collapsed');
  assert.equal(toggle('collapsed'), 'expanded');
  assert.equal(toggle(undefined), 'collapsed');
});
test('reference links visible to every role and open /pdf and /presentation', () => {
  const none = () => false;
  const items = visibleReferenceItems(none);
  assert.deepEqual(items.map((i) => i.href), ['/pdf', '/presentation']);
  assert.equal(REFERENCE_ITEMS.every((i) => i.icon === 'external'), true);
  assert.equal(visibleReferenceItems(() => true).length, 2);
});
