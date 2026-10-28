import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/dom-shim.js';

installDom();
const { dynamicCommands } = await import('../js/ui/search-palette.js');
const { NAV_ITEMS } = await import('../js/ui/sidebar.js');

const tr = (k, v) => `${k}:${v.q}`;

test('dynamic palette commands are permission-aware and encode the text', () => {
  let went = '';
  const all = dynamicCommands(' bail & "x" ', { can: () => true, tr, go: (hash) => { went = hash; } });
  assert.deepEqual(all.map((c) => c.id), ['dyn-search', 'dyn-check', 'dyn-docs']);
  assert.equal(all[0].href, '#/research?q=bail%20%26%20%22x%22');
  assert.equal(all[1].href, '#/judgments/check?c=bail%20%26%20%22x%22');
  assert.ok(all[2].href.startsWith('#/documents?q='));
  all[0].run();
  assert.equal(went, all[0].href);
  assert.deepEqual(dynamicCommands('x', { can: (p) => p === 'SEARCH', tr }).map((c) => c.id), ['dyn-search', 'dyn-check']);
  assert.deepEqual(dynamicCommands('x', { can: () => false, tr }), []);
  assert.deepEqual(dynamicCommands('  ', { can: () => true, tr }), []);
});

test('documents nav item is kept', () => {
  assert.ok(NAV_ITEMS.some((i) => i.id === 'documents'));
});
