import test from 'node:test';
import assert from 'node:assert/strict';
import { diffWords, diffSections, snapshotTexts } from '../js/pages/lib/diff.js';

const rebuild = (parts, side) => parts.filter((p) => p.type === 'eq' || p.type === side).map((p) => p.text).join('');

test('diffWords marks inserted and deleted words and round-trips both sides', () => {
  const a = 'the quick brown fox'; const b = 'the slow brown dog jumps';
  const d = diffWords(a, b);
  assert.equal(rebuild(d, 'del'), a);
  assert.equal(rebuild(d, 'ins'), b);
  assert.ok(d.some((p) => p.type === 'del' && p.text === 'quick'));
  assert.ok(d.some((p) => p.type === 'ins' && p.text === 'slow'));
});
test('diffWords identical, empty and one-sided', () => {
  assert.deepEqual(diffWords('same text', 'same text'), [{ type: 'eq', text: 'same text' }]);
  assert.deepEqual(diffWords('', ''), []);
  assert.deepEqual(diffWords('', 'new'), [{ type: 'ins', text: 'new' }]);
  assert.deepEqual(diffWords('old', ''), [{ type: 'del', text: 'old' }]);
});
test('diffWords handles very large inputs without blowing up', () => {
  const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join(' ');
  const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join(' ');
  const d = diffWords(a, b);
  assert.equal(rebuild(d, 'del'), a); assert.equal(rebuild(d, 'ins'), b);
});
test('diffSections is per section and accepts several snapshot shapes', () => {
  const a = { sections: { section_4_brief_facts: 'one two' } };
  const b = { draft_content_json: { sections: { section_4_brief_facts: 'one three', section_14_conclusion_disposition: 'Allowed' } } };
  const rows = diffSections(a, b);
  assert.equal(rows.length, 15);
  assert.equal(rows[3].changed, true);
  assert.equal(rows[13].changed, true);
  assert.equal(rows[0].changed, false);
  assert.equal(snapshotTexts(null).section_1_case_title, '');
  assert.equal(snapshotTexts({ section_1_case_title: 'T' }).section_1_case_title, 'T');
});
