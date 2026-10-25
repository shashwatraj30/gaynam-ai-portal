import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../js/store.js';
import { t, setLang, getLang, addMessages } from '../js/i18n/index.js';
import hi from '../js/i18n/hi.js';

test('store get/set/on/unsubscribe', () => {
  store._reset();
  const seen = [];
  const off = store.on('benchBrief', (v) => seen.push(v));
  assert.equal(store.get('benchBrief'), undefined);
  store.set('benchBrief', [1]);
  store.set('benchBrief', [1, 2]);
  off();
  store.set('benchBrief', []);
  assert.deepEqual(seen, [[1], [1, 2]]);
  assert.deepEqual(store.get('benchBrief'), []);
});
test('store session persistence uses sessionStorage when present', () => {
  const data = {};
  globalThis.sessionStorage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
  store._reset();
  store.set('intakeParams', { a: 1 }, { session: true });
  store._reset();
  assert.deepEqual(store.get('intakeParams'), { a: 1 });
  delete globalThis.sessionStorage;
});
test('i18n: interpolation, hi override, hi falls back to en, then key', () => {
  assert.equal(getLang(), 'en');
  assert.equal(t('nav.home'), 'Home');
  assert.equal(t('top.synced', { when: '5 min ago' }), 'Corpus synced 5 min ago');
  setLang('hi');
  assert.equal(t('nav.home'), hi['nav.home']);
  assert.notEqual(t('nav.home'), 'Home');
  assert.equal(t('top.syncDone'), 'Sync finished'); // not in hi.js -> en
  assert.equal(t('no.such.key'), 'no.such.key');
  addMessages('en', { 'page.x': 'X {n}' });
  assert.equal(t('page.x', { n: 2 }), 'X 2');
  setLang('en');
});
