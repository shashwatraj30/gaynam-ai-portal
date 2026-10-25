import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FONT_SIZES, normalizeFontSize, loadFontSize, saveFontSize, applyFontSize, stepFontSize,
} from '../js/pages/lib/settings-logic.js';
import { SAMPLE_PLEADING, SAMPLE_DEGRADED } from '../js/pages/lib/intake-samples.js';

test('font size normalises unknown values to default', () => {
  assert.deepEqual(FONT_SIZES, ['small', 'default', 'large', 'xlarge']);
  assert.equal(normalizeFontSize('huge'), 'default');
  assert.equal(normalizeFontSize(undefined), 'default');
  assert.equal(normalizeFontSize('large'), 'large');
});
test('font size round-trips through injectable storage and applies to the root', () => {
  const mem = new Map();
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadFontSize(store), 'default');
  assert.equal(saveFontSize('xlarge', store), 'xlarge');
  assert.equal(loadFontSize(store), 'xlarge');
  const root = { dataset: {} };
  applyFontSize('small', root);
  assert.equal(root.dataset.fontsize, 'small');
});
test('stepFontSize moves one level and stops at the ends', () => {
  assert.equal(stepFontSize('default', 1), 'large');
  assert.equal(stepFontSize('default', -1), 'small');
  assert.equal(stepFontSize('small', -1), 'small');
  assert.equal(stepFontSize('xlarge', 1), 'xlarge');
  assert.equal(stepFontSize('bogus', 1), 'large');
});
test('css defines every non-default level and the type tokens it overrides exist in tokens.css', () => {
  const css = readFileSync(new URL('../css/page-fontsize.css', import.meta.url), 'utf8');
  const tokens = readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8');
  for (const lvl of ['small', 'large', 'xlarge']) assert.ok(css.includes(`html[data-fontsize="${lvl}"]`), lvl);
  for (const v of ['--fs-h1', '--fs-body', '--fs-ui', '--fs-meta', '--lh-body']) assert.ok(tokens.includes(v), v);
});
test('intake samples are fictional demo text', () => {
  assert.match(SAMPLE_PLEADING, /PETITIONER/);
  assert.match(SAMPLE_DEGRADED, /Aadhaar/);
});
