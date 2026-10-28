import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { THEMES, normalizeTheme, loadTheme, saveTheme, applyTheme } from '../js/pages/lib/settings-logic.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };

test('theme normalise, persist and apply', () => {
  assert.deepEqual(THEMES, ['system', 'light', 'dark']);
  assert.equal(normalizeTheme('purple'), 'system');
  const s = mem();
  assert.equal(loadTheme(s), 'system');
  assert.equal(saveTheme('dark', s), 'dark');
  assert.equal(loadTheme(s), 'dark');
  const root = { dataset: {} };
  applyTheme('dark', root);
  assert.equal(root.dataset.theme, 'dark');
  applyTheme('system', root);
  assert.equal('theme' in root.dataset, false);
  assert.equal(loadTheme({ getItem() { throw new Error('blocked'); } }), 'system');
  assert.doesNotThrow(() => saveTheme('light', { setItem() { throw new Error('blocked'); } }));
});

test('tokens.css defines both dark paths', () => {
  const css = fs.readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8');
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /prefers-color-scheme: dark[\s\S]*:root:not\(\[data-theme="light"\]\)/);
});
