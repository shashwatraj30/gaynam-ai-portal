import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARAM_KEYS, normalizeIntake, normalizeExtra, extraFromDraft, buildDraftRequest, buildSavePayload, outcomeParts, outcomeFromParts, OUTCOME_VALUES,
  formatPrecedent, insertPrecedentText, missingAuthorities, addAuthoritiesText, buildRegenerateRequest, mergeRegenerated, createUndoStack, rejectTarget,
  validateReason, isReasonRequired, returnReasonFor, supportCheck, toggleCompare, orderPair, canSectionAction, SECTION_KEYS,
} from '../js/pages/lib/studio-logic.js';

const P = { title: 'Rangappa v. Sri Mohan', citation: '(2010) 11 SCC 441', court: 'Supreme Court' };

test('hand-off: new param keys, extras and request bodies', () => {
  for (const k of ['petitioner', 'respondent', 'prayer', 'outcome']) assert.ok(PARAM_KEYS.includes(k));
  const p = normalizeIntake({ petitioner: 'A', respondent: 'B', prayer: 'relief', outcome: 'Allowed', case_title: 'X' });
  assert.equal(p.petitioner, 'A'); assert.equal(p.outcome, 'Allowed');
  const e = normalizeExtra({ document_id: 7, authorities: [P, P, { id: 1 }, null] });
  assert.equal(e.document_id, 7); assert.equal(e.authorities.length, 1);
  const body = buildDraftRequest(p, e);
  assert.equal(body.document_id, 7); assert.equal(body.authorities.length, 1); assert.equal(body.petitioner, 'A');
  assert.equal('authorities' in buildDraftRequest(p, null), false);
  const save = buildSavePayload({ id: 3, version: 2, status: 'DRAFT', params: p, content: {}, texts: {}, extra: e });
  assert.equal(save.document_id, 7); assert.equal(save.draft_content_json.pinned_authorities.length, 1);
  assert.equal('gemini_api_key' in save, false);
  assert.equal(extraFromDraft({ draft_content_json: save.draft_content_json }).authorities.length, 1);
});
test('outcome options and free text', () => {
  assert.deepEqual(OUTCOME_VALUES, ['', 'Allowed', 'Dismissed', 'Partly allowed', 'Disposed of', 'Remanded']);
  assert.deepEqual(outcomeParts(''), { choice: '', text: '' });
  assert.deepEqual(outcomeParts('Allowed'), { choice: 'Allowed', text: '' });
  const o = outcomeParts('Allowed with costs');
  assert.equal(outcomeFromParts(o.choice, o.text), 'Allowed with costs');
  assert.equal(outcomeFromParts('Dismissed', 'ignored'), 'Dismissed');
});
test('insertPrecedentText formats, appends and does not duplicate', () => {
  assert.equal(formatPrecedent(P), 'Rangappa v. Sri Mohan, (2010) 11 SCC 441 (Supreme Court)');
  const r = insertPrecedentText('Existing line', P);
  assert.equal(r.added, true); assert.equal(r.text, 'Existing line\nRangappa v. Sri Mohan, (2010) 11 SCC 441 (Supreme Court)');
  assert.equal(insertPrecedentText(r.text, P).added, false);
  assert.equal(insertPrecedentText('see 2010 11 SCC 441', P).added, false);
  assert.equal(insertPrecedentText('', P).text, formatPrecedent(P));
  assert.equal(insertPrecedentText('x', {}).added, false);
});
test('pinned authorities missing from section 15', () => {
  const auth = [P, { title: 'Other', citation: 'AIR 1973 SC 1461', court: '' }];
  assert.equal(missingAuthorities('', auth).length, 2);
  assert.equal(missingAuthorities('Rangappa, (2010) 11 SCC 441', auth).length, 1);
  const r = addAuthoritiesText('', auth);
  assert.equal(r.added, 2); assert.equal(missingAuthorities(r.text, auth).length, 0);
});
test('regenerate request and merge replace only the chosen section', () => {
  const texts = { section_4_brief_facts: 'old facts', section_10_applicable_principles: 'old p' };
  const req = buildRegenerateRequest({ case_title: 'T' }, { document_id: 2 }, 10, texts);
  assert.deepEqual(req.sections, [10]); assert.equal(req.current.section_4_brief_facts, 'old facts');
  assert.equal(Object.keys(req.current).length, 15); assert.equal(req.document_id, 2);
  const m = mergeRegenerated(texts, { sections: { section_10_applicable_principles: 'new p' }, engine: 'x' }, 10);
  assert.equal(m.found, true); assert.equal(m.texts.section_10_applicable_principles, 'new p'); assert.equal(m.texts.section_4_brief_facts, 'old facts');
  const none = mergeRegenerated(texts, { sections: {} }, 10);
  assert.equal(none.found, false); assert.equal(none.texts.section_10_applicable_principles, 'old p');
  assert.equal(mergeRegenerated(texts, { sections: [{ number: 10, content: 'arr' }] }, 10).text, 'arr');
});
test('undo stack and reject target', () => {
  const k = SECTION_KEYS[9]; const st = createUndoStack(2);
  assert.equal(st.pop(k), undefined);
  assert.deepEqual(rejectTarget(st, k, { [k]: 'saved' }, 'cur'), { source: 'saved', text: 'saved' });
  assert.deepEqual(rejectTarget(st, k, { [k]: 'cur' }, 'cur'), { source: null, text: 'cur' });
  st.push(k, 'a'); st.push(k, 'b'); st.push(k, 'c');
  assert.equal(st.size(k), 2);
  assert.deepEqual(rejectTarget(st, k, { [k]: 'saved' }, 'cur'), { source: 'undo', text: 'c' });
  assert.equal(st.pop(k), 'c'); assert.equal(st.pop(k), 'b'); assert.equal(st.pop(k), undefined);
});
test('section actions disabled when sealed or without permission', () => {
  assert.equal(canSectionAction({ status: 'DRAFT', canDraft: true }), true);
  assert.equal(canSectionAction({ status: 'FINAL_SEALED', canDraft: true }), false);
  assert.equal(canSectionAction({ status: 'DRAFT', canDraft: false }), false);
});
test('return reason validation and server error detection', () => {
  assert.equal(validateReason('  abc ').ok, false);
  assert.deepEqual(validateReason('  needs work '), { ok: true, reason: 'needs work' });
  assert.equal(isReasonRequired({ status: 422, code: 'REASON_REQUIRED' }), true);
  assert.equal(isReasonRequired({ status: 422, message: 'reason is required' }), true);
  assert.equal(isReasonRequired({ status: 409 }), false);
  assert.equal(returnReasonFor({ status: 'RETURNED', last_return_reason: 'Fix S.4' }), 'Fix S.4');
  assert.equal(returnReasonFor({ status: 'DRAFT', last_return_reason: 'Fix' }), 'Fix');
  assert.equal(returnReasonFor({ status: 'IN_REVIEW', last_return_reason: 'Fix' }), '');
  assert.equal(returnReasonFor({ status: 'RETURNED' }), '');
});
test('support check needs the citation among authorities AND verified', () => {
  const ok = { verified: true, status: 'ACTIVE', citation: '(2010) 11 SCC 441' };
  assert.equal(supportCheck(ok, [P]), 'pass');
  assert.equal(supportCheck(ok, []), 'fail');
  assert.equal(supportCheck({ verified: false, status: 'HALLUCINATED_OR_UNVERIFIED', citation: P.citation }, [P]), 'unchecked');
});
test('compare selection keeps the latest two, ordered', () => {
  let s = toggleCompare([], 3); s = toggleCompare(s, 1); s = toggleCompare(s, 5);
  assert.deepEqual(s, [1, 5]); assert.deepEqual(orderPair([5, 1]), [1, 5]);
  assert.deepEqual(toggleCompare([1, 5], 5), [1]);
});
