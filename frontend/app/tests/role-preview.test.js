import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PREVIEW_KEY, ROLE_PERMISSIONS, PREVIEW_ROLES, canPreview, isValidRole, loadPreview, savePreview, clearPreview, previewCan, effectiveCan,
} from '../js/ui/role-preview-logic.js';
import { visibleItems } from '../js/ui/sidebar.js';
import en from '../js/i18n/en.js';
import hi from '../js/i18n/hi.js';

const mem = (init = {}) => { const d = { ...init }; return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = v; }, removeItem: (k) => { delete d[k]; }, d }; };
const here = path.dirname(fileURLToPath(import.meta.url));

test('role table matches backend/auth.py ROLES_PERMISSIONS (drift guard)', () => {
  const src = fs.readFileSync(path.join(here, '../../../backend/auth.py'), 'utf8');
  const block = src.slice(src.indexOf('ROLES_PERMISSIONS = {'), src.indexOf('INSTITUTIONAL_DIRECTORY'));
  const parsed = {};
  for (const m of block.matchAll(/"([A-Z_]+)":\s*\{[\s\S]*?"permissions":\s*\[([^\]]*)\]/g)) {
    parsed[m[1]] = [...m[2].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
  }
  assert.ok(Object.keys(parsed).length >= 10);
  assert.deepEqual(ROLE_PERMISSIONS, parsed);
});

test('only a real ADMINISTRATOR may preview', () => {
  assert.equal(canPreview({ role: 'ADMINISTRATOR' }), true);
  for (const u of [null, undefined, {}, { role: 'STUDENT' }, { role: 'REGISTRAR_NLUJ' }]) assert.equal(canPreview(u), false);
});

test('previewCan mirrors api.can semantics and ignores unknown roles', () => {
  const c = previewCan('STUDENT');
  assert.equal(c(null), true);
  assert.equal(c('SEARCH'), true);
  assert.equal(c('DRAFT_FULL'), false);
  assert.equal(c(['DRAFT_FULL', 'VIEW_RATIO']), true);
  assert.equal(previewCan('NOPE')('SEARCH'), false);
});

test('effectiveCan only swaps for an eligible user with a valid role', () => {
  const real = () => 'real';
  assert.equal(effectiveCan(real, { role: 'STUDENT' }, 'RESEARCHER'), real);
  assert.equal(effectiveCan(real, { role: 'ADMINISTRATOR' }, null), real);
  assert.equal(effectiveCan(real, { role: 'ADMINISTRATOR' }, 'bogus'), real);
  assert.notEqual(effectiveCan(real, { role: 'ADMINISTRATOR' }, 'STUDENT'), real);
});

test('preview changes nav visibility only through the wrapped can', () => {
  const ids = (role) => visibleItems(previewCan(role)).map((i) => i.id);
  assert.ok(ids('RESEARCHER').includes('drafts'));
  assert.ok(!ids('STUDENT').includes('drafts'));
  assert.ok(ids('ADMINISTRATOR').includes('chamber'));
  assert.ok(!ids('REGISTRAR_NLUJ').includes('chamber'));
});

test('sessionStorage persistence validates and never throws', () => {
  const s = mem();
  assert.equal(loadPreview(s), null);
  assert.equal(savePreview('AUDITOR', s), 'AUDITOR');
  assert.equal(s.d[PREVIEW_KEY], 'AUDITOR');
  assert.equal(loadPreview(s), 'AUDITOR');
  assert.equal(savePreview('junk', s), null);
  assert.equal(PREVIEW_KEY in s.d, false);
  savePreview('STUDENT', s); clearPreview(s);
  assert.equal(loadPreview(s), null);
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert.equal(loadPreview(bad), null);
  assert.equal(savePreview('STUDENT', bad), 'STUDENT');
  assert.equal(loadPreview(null), null);
});

test('every pickable role is valid and has en + hi labels; strings exist', () => {
  for (const r of PREVIEW_ROLES) {
    assert.ok(isValidRole(r));
    assert.ok(en[`preview.role.${r}`] && hi[`preview.role.${r}`], r);
  }
  for (const k of ['label', 'hint', 'none', 'exit', 'bannerLabel', 'banner']) assert.ok(en[`preview.${k}`] && hi[`preview.${k}`], k);
  assert.match(en['preview.banner'], /display only, server permissions unchanged/);
});
