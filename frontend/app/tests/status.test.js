import test from 'node:test';
import assert from 'node:assert/strict';
import { draftStatusChip, precedentChip, normalizeDraftStatus } from '../js/ui/status.js';

test('FOLLOWED is never shown as a positive finding (P9)', () => {
  assert.deepEqual(precedentChip('FOLLOWED'), { label: 'No adverse treatment recorded', tone: 'neutral' });
  assert.deepEqual(precedentChip('FOLLOWED', { curated: true }), { label: 'No adverse treatment recorded', tone: 'neutral' });
  assert.equal(precedentChip(undefined).tone, 'neutral');
});
test('OVERRULED is danger, DISTINGUISHED warn', () => {
  assert.deepEqual(precedentChip('overruled'), { label: 'Overruled', tone: 'danger' });
  assert.equal(precedentChip('DISTINGUISHED').tone, 'warn');
});
test('draft statuses and legacy mapping', () => {
  assert.equal(draftStatusChip('DRAFT').tone, 'neutral');
  assert.equal(normalizeDraftStatus('CHAMBER_REVIEW'), 'IN_REVIEW');
  assert.equal(normalizeDraftStatus('under review'), 'IN_REVIEW');
  assert.equal(normalizeDraftStatus('SIGNED'), 'FINAL_SEALED');
  assert.equal(normalizeDraftStatus('weird'), 'DRAFT');
  assert.equal(normalizeDraftStatus(null), 'DRAFT');
  assert.equal(draftStatusChip('BENCH_APPROVED').tone, 'primary');
  assert.equal(draftStatusChip('RETURNED').tone, 'warn');
  assert.equal(draftStatusChip('IN_REVIEW').label, 'In review');
});

import { setLang } from '../js/i18n/index.js';
test('chip labels follow the active language and fall back to English', () => {
  setLang('hi');
  assert.notEqual(draftStatusChip('IN_REVIEW').label, 'In review');
  assert.notEqual(precedentChip('OVERRULED').label, 'Overruled');
  setLang('en');
  assert.equal(draftStatusChip('IN_REVIEW').label, 'In review');
});
