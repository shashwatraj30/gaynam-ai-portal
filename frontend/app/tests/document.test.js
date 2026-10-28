import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stepperState, fieldsView, emptyFieldKeys, issuesFromText, issuesToText, moveItem, removeItem, highlightRanges, segmentText,
  redactionSummary, pinsFull, isPinned, draftReady, researchReady, missingForConfirm, sourceNotice, canDownloadOriginal, authorityStatus,
  researchHref, benchFromAuthorities, intakeParamsFrom, FIELD_KEYS, isImageMime,
} from '../js/pages/lib/document-logic.js';
import en from '../js/i18n/pages/document.en.js';
import hi from '../js/i18n/pages/document.hi.js';

const doc = (o = {}) => ({ status: 'READ', pins_count: 0, drafts: [], extraction: { version: 1, confirmed: false }, ...o });

test('stepper walks Read to Drafted', () => {
  assert.equal(stepperState(doc()).current, 'checked');
  assert.equal(stepperState(doc(), { acknowledged: true }).current, 'confirmed');
  assert.equal(stepperState(doc({ extraction: { version: 2, confirmed: false } })).current, 'confirmed');
  const c = doc({ status: 'CONFIRMED', extraction: { version: 2, confirmed: true } });
  assert.equal(stepperState(c).current, 'researched');
  assert.equal(stepperState(c, { researched: true }).current, 'drafted');
  assert.equal(stepperState({ ...c, pins_count: 2 }).reached.researched, true);
  const d = { ...c, pins_count: 1, drafts: [{ id: 1 }] };
  assert.equal(stepperState(d).current, 'drafted');
  assert.ok(stepperState(d).reached.drafted);
  assert.equal(stepperState(null).reached.read, false);
});

test('fields view and empty keys', () => {
  const v = fieldsView({ court: 'High Court', facts: '  ' });
  assert.equal(v.length, FIELD_KEYS.length);
  assert.equal(v[0].empty, false);
  assert.ok(emptyFieldKeys({ court: 'x' }).includes('facts'));
  assert.ok(!emptyFieldKeys({ court: 'x' }).includes('court'));
  assert.equal(emptyFieldKeys(null).length, FIELD_KEYS.length);
});

test('issues text round trip and markers', () => {
  assert.deepEqual(issuesFromText('(A) Is the cheque valid?\n\n2. Was notice served?\n- Limitation\r\nPlain'), ['Is the cheque valid?', 'Was notice served?', 'Limitation', 'Plain']);
  assert.equal(issuesToText(['a', 'b']), 'a\nb');
  assert.equal(issuesToText(null), '');
  assert.deepEqual(issuesFromText(null), []);
  assert.deepEqual(issuesFromText('Section 138 applies?'), ['Section 138 applies?']);
});

test('reorder and remove', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(['a', 'b'], 0, 5), ['a', 'b']);
  assert.deepEqual(removeItem(['a', 'b', 'c'], 1), ['a', 'c']);
});

test('highlight ranges', () => {
  assert.deepEqual(highlightRanges('The Cheque, the cheque', 'cheque'), [{ start: 4, end: 10 }, { start: 16, end: 22 }]);
  assert.deepEqual(highlightRanges('abc', 'a'), []);
  assert.deepEqual(highlightRanges('abc', ''), []);
  assert.deepEqual(highlightRanges('aaaa', 'aa'), [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
});

test('segmentText marks redactions and matches', () => {
  const seg = segmentText('Pay [REDACTED_PHONE] to Ravi now', 'ravi');
  assert.deepEqual(seg.map((x) => x.kind), ['plain', 'redacted', 'plain', 'match', 'plain']);
  assert.equal(seg.map((x) => x.text).join(''), 'Pay [REDACTED_PHONE] to Ravi now');
  assert.deepEqual(segmentText('', 'x'), []);
});

test('redaction summary', () => {
  const r = redactionSummary([{ type: 'PHONE', count: 1 }, { type: 'EMAIL', count: 3 }, { type: 'X', count: 0 }], 0);
  assert.deepEqual(r.items.map((x) => x.type), ['EMAIL', 'PHONE']);
  assert.equal(r.total, 4);
  assert.equal(redactionSummary([], 7).total, 7);
  assert.equal(redactionSummary(null).total, 0);
});

test('pins', () => {
  assert.ok(pinsFull(new Array(5).fill({})));
  assert.ok(!pinsFull([{}]));
  assert.ok(isPinned([{ judgment_id: 12 }], '12'));
  assert.ok(!isPinned(null, 1));
});

test('draft and research readiness', () => {
  const ok = doc({ status: 'CONFIRMED', extraction: { version: 2, confirmed: true } });
  assert.ok(draftReady(ok, true));
  assert.ok(!draftReady(ok, false));
  assert.ok(!draftReady(doc(), true));
  assert.ok(!draftReady({ ...ok, status: 'ARCHIVED' }, true));
  assert.ok(researchReady(ok, true));
  assert.ok(!researchReady(ok, false));
  assert.ok(!draftReady(null, true));
});

test('confirm requirements', () => {
  assert.deepEqual(missingForConfirm({ case_title: 'A v B', facts: 'f' }, ['i']), []);
  assert.deepEqual(missingForConfirm({}, []), ['case_title', 'facts', 'issues']);
  assert.deepEqual(missingForConfirm({ case_title: 'x', facts: 'y' }, ['  ']), ['issues']);
});

test('source notice and download rules', () => {
  assert.equal(sourceNotice({ source: 'failed' }), 'failed');
  assert.equal(sourceNotice({ source: 'sample' }), 'sample');
  assert.equal(sourceNotice({ source: 'ocr' }), null);
  assert.ok(canDownloadOriginal({ source: 'digital', original_name: 'a.pdf' }));
  assert.ok(!canDownloadOriginal({ source: 'pasted', original_name: '' }));
  assert.ok(isImageMime('image/png'));
  assert.ok(!isImageMime('application/pdf'));
});

test('authority status', () => {
  assert.equal(authorityStatus('VERIFIED').key, 'verified');
  assert.equal(authorityStatus('Not found').key, 'notfound');
  assert.equal(authorityStatus('NOT_FOUND').key, 'notfound');
  assert.equal(authorityStatus('overruled').tone, 'danger');
  assert.equal(authorityStatus('DISTINGUISHED').tone, 'warn');
  assert.equal(authorityStatus('weird').key, 'other');
});

test('links and hand-off shapes', () => {
  assert.equal(researchHref(' s 138 & bail '), '#/research?q=s%20138%20%26%20bail');
  const b = benchFromAuthorities([{ id: 3, title: 'T', citation: 'C', court: 'SC', status: 'GOOD' }]);
  assert.deepEqual(b, [{ id: 3, title: 'T', citation: 'C', court: 'SC', ratio: '', curated: false, status: 'GOOD' }]);
  const p = intakeParamsFrom({ params: { case_title: 'x' }, authorities: [{ id: 1 }] });
  assert.equal(p.source, 'document');
  assert.equal(p.confirmed_issues, true);
  assert.equal(p.case_title, 'x');
  assert.equal(p.authorities.length, 1);
  assert.deepEqual(intakeParamsFrom(null).authorities, []);
});

test('i18n parity', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(hi).sort());
  assert.ok(Object.keys(en).length > 50);
});
