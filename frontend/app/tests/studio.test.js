import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SECTION_KEYS, normalizeSections, sectionsToObject, detectOcrNoise, engineKind, normalizeIntake, missingParams,
  parseIssues, buildSavePayload, classifyConflict, citationChecks, summarizeVerification, createAutosaver,
  sendForReviewPath, sectionToText, isEditableStatus,
} from '../js/pages/lib/studio-logic.js';
import { buildPreChecks, approvalGate, exportFileName, sha256Hex, stepperCurrent } from '../js/pages/lib/review-logic.js';
import { filterDrafts, countByStatus, normalizeRows, rowAction } from '../js/pages/lib/drafts-logic.js';

const CLEAN = 'The appellant admits that the cheque bears his signature. The question is whether the statutory presumption under Section 139 of the Negotiable Instruments Act, 1881 (NI Act) extends to the existence of a legally enforceable debt, see Rangappa v. Sri Mohan (2010) 11 SCC 441 and AIR 1973 SC 1461; Cr.P.C. s. 482 and Art. 226 of the Constitution.';
const NOISY = 'Tbe c0mpIainant st@ted tbat ihe accused wa$ pre5ent at tlie p1ace of occurrence on the date and the FIR was lodged at the police station after some delay by the wltnes5 who is a resident of the village near the road';

test('15 section keys', () => { assert.equal(SECTION_KEYS.length, 15); assert.equal(new Set(SECTION_KEYS).size, 15); });
test('normalizeSections fills all keys, handles arrays and objects', () => {
  const o = normalizeSections({ section_4_brief_facts: 'facts', section_15_citations_authorities: ['a', { title: 'X', citation: 'C' }] });
  assert.equal(Object.keys(o).length, 15);
  assert.equal(o.section_4_brief_facts, 'facts');
  assert.match(o.section_15_citations_authorities, /X - C/);
  assert.equal(normalizeSections([{ number: 2, content: 'n' }]).section_2_case_number, 'n');
  assert.equal(Object.keys(sectionsToObject({})).length, 15);
  assert.equal(sectionToText('[object Object]'), '');
});
test('OCR noise: clean legal text is fine, garbled text is flagged', () => {
  assert.equal(detectOcrNoise(CLEAN).noisy, false);
  const n = detectOcrNoise(NOISY);
  assert.equal(n.noisy, true);
  assert.ok(n.garbled >= 5);
  assert.equal(detectOcrNoise('short').noisy, false);
  assert.equal(detectOcrNoise('a � b � c �').noisy, true);
  assert.equal(detectOcrNoise('अभियुक्त ने न्यायालय के समक्ष यह कथन किया कि वह घटना स्थल पर उपस्थित नहीं था और उसे झूठा फंसाया गया है क्योंकि पुरानी रंजिश थी').noisy, false);
});
test('engineKind: Gemini is a model, anything else is the template', () => {
  assert.equal(engineKind('Gemini Multimodal Judicial Model (Upper Bench Prioritized)'), 'model');
  assert.equal(engineKind('Gyanam AI Neural Legal Synthesis Engine (Upper Bench Prioritized)'), 'template');
  assert.equal(engineKind(''), '');
});
test('intake hand-off tolerates aliases and issue arrays', () => {
  const p = normalizeIntake({ caseTitle: 'A v. B', caseNumber: '1/2020', court: 'HC', facts: 'f', issues: ['one', { text: 'two' }] });
  assert.equal(p.case_title, 'A v. B'); assert.equal(p.issues, 'one\ntwo');
  assert.deepEqual(missingParams(p), []);
  assert.deepEqual(missingParams({}), ['case_title', 'case_number', 'court', 'facts', 'issues']);
  assert.deepEqual(parseIssues('1. First\nIssue 2: Second\n- Third'), ['First', 'Second', 'Third']);
});
test('save payload: create has no version, update carries it', () => {
  const base = { params: normalizeIntake({ case_title: 't' }), content: { engine: 'x' }, texts: {} };
  const c = buildSavePayload({ ...base, id: null, version: null });
  assert.equal(c.draft_id, null); assert.ok(!('version' in c)); assert.equal(c.draft_content_json.engine, 'x');
  assert.equal(Object.keys(c.draft_content_json.sections).length, 15);
  const u = buildSavePayload({ ...base, id: 5, version: 3 });
  assert.equal(u.draft_id, 5); assert.equal(u.version, 3); assert.ok(!('gemini_api_key' in u));
});
test('classifyConflict', () => {
  assert.equal(classifyConflict({ status: 409, code: 'VERSION_CONFLICT' }), 'VERSION_CONFLICT');
  assert.equal(classifyConflict({ status: 409, code: 'CONFLICT', message: 'Sealed drafts are immutable.' }), 'DRAFT_SEALED');
  assert.equal(classifyConflict({ status: 409, code: 'CONFLICT', message: 'Illegal transition DRAFT -> FINAL_SEALED.' }), 'ILLEGAL_TRANSITION');
  assert.equal(classifyConflict({ status: 409, code: 'CONFLICT', message: 'Draft was modified elsewhere.' }), 'VERSION_CONFLICT');
  assert.equal(classifyConflict({ status: 500 }), null);
});
test('status path and editability', () => {
  assert.deepEqual(sendForReviewPath('RETURNED'), ['DRAFT', 'IN_REVIEW']);
  assert.deepEqual(sendForReviewPath('DRAFT'), ['IN_REVIEW']);
  assert.deepEqual(sendForReviewPath('FINAL_SEALED'), []);
  assert.equal(isEditableStatus('IN_REVIEW'), false);
});
const V = [
  { citation: '(2010) 11 SCC 441', verified: true, status: 'VERIFIED_ACTIVE', case_data: { id: 1, title: 'Rangappa' } },
  { citation: '(2008) 4 SCC 54', verified: true, status: 'OVERRULED_WARNING', case_data: { id: 2, title: 'Bhat', overruled_by: 'Rangappa' } },
  { citation: 'X 1', query_citation: 'X 1', verified: false, status: 'HALLUCINATED_OR_UNVERIFIED', case_data: null },
];
test('citation checks and summary', () => {
  assert.deepEqual([citationChecks(V[0]).found, citationChecks(V[0]).overruled], ['pass', 'pass']);
  assert.equal(citationChecks(V[1]).overruled, 'fail');
  assert.deepEqual([citationChecks(V[2]).found, citationChecks(V[2]).overruled], ['fail', 'unchecked']);
  const s = summarizeVerification(V);
  assert.equal(s.found, 2); assert.deepEqual(s.missing, ['X 1']); assert.equal(s.overruled[0].overruledBy, 'Rangappa');
});
test('pre-approval checks', () => {
  const texts = normalizeSections({ section_4_brief_facts: NOISY });
  const c = Object.fromEntries(buildPreChecks({ texts, verify: { status: 'done', results: V }, engine: 'Gyanam AI Neural' }).map((i) => [i.id, i]));
  assert.equal(c.found.state, 'fail'); assert.equal(c.overruled.state, 'fail');
  assert.deepEqual(c.noise.data.sections, [4]); assert.equal(c.filled.state, 'fail'); assert.equal(c.engine.data.kind, 'template');
  assert.equal(buildPreChecks({ texts, verify: { status: 'loading', results: [] } })[0].state, 'pending');
  assert.equal(buildPreChecks({ texts, verify: { status: 'done', results: [] } })[0].state, 'unchecked');
});
test('approval gate', () => {
  assert.equal(approvalGate({ status: 'IN_REVIEW', canFinalize: false, pending: false }).reason, 'no-permission');
  assert.equal(approvalGate({ status: 'IN_REVIEW', canFinalize: true, pending: true }).reason, 'checks-pending');
  assert.equal(approvalGate({ status: 'BENCH_APPROVED', canFinalize: true, pending: false }).next, 'FINAL_SEALED');
  assert.equal(approvalGate({ status: 'DRAFT', canFinalize: true, pending: false }).canAct, false);
  assert.equal(stepperCurrent('RETURNED'), 'DRAFT');
  assert.equal(exportFileName('FIR No. 06/17', 1), 'Judicial_Judgment_FIR_No_06_17.docx');
});
test('sha256Hex', async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('autosaver debounces, single-flights and reports errors', async () => {
  const timers = []; const states = []; let saves = 0; let fail = false;
  const a = createAutosaver({ save: async () => { saves++; if (fail) throw new Error('x'); }, onState: (s) => states.push(s),
    setTimer: (f) => { timers.push(f); return timers.length; }, clearTimer: () => {} });
  a.markDirty(); a.markDirty();
  await a.flush(); assert.equal(saves, 1); assert.equal(a.dirty, false);
  assert.equal(await a.flush(), false);
  fail = true; a.markDirty();
  await assert.rejects(a.flush()); assert.equal(states.at(-1), 'error'); assert.equal(a.dirty, true);
  a.pause(); a.clearDirty(); assert.equal(a.dirty, false);
});
test('drafts list helpers', () => {
  const rows = normalizeRows([{ id: 1, case_title: 'A v B', case_number: 'FIR 6', status: 'CHAMBER_REVIEW' }, { id: 2, case_title: 'C', status: 'FINAL_SEALED' }, { id: 3, status: 'DRAFT' }]);
  assert.equal(rows[0].status, 'IN_REVIEW');
  assert.equal(countByStatus(rows).all, 3); assert.equal(countByStatus(rows).IN_REVIEW, 1);
  assert.equal(filterDrafts(rows, { status: 'IN_REVIEW' }).length, 1);
  assert.equal(filterDrafts(rows, { query: 'fir' }).length, 1);
  assert.equal(rowAction(rows[0]).href, '#/drafts/1/review');
  assert.equal(rowAction(rows[2]).href, '#/drafts/3');
  assert.equal(rowAction(rows[1]).key, 'view');
});

import { alertMarks, buildDraftRequest } from '../js/pages/lib/studio-logic.js';
import { buildIntakeParams } from '../js/pages/lib/intake-logic.js';
import { normalizeIntake as normIntake } from '../js/pages/lib/studio-logic.js';

test('alertMarks matches only the same draft and finds citation sections', () => {
  const tg = { alertId: 1, draftId: 7, citation: '(2010) 5 SCC 100', overruledTitle: 'X v. Y' };
  const texts = { section_15_citations_authorities: 'See (2010) 5  SCC 100.', section_3_introduction: 'none' };
  assert.equal(alertMarks(tg, 8, texts), null);
  assert.deepEqual(alertMarks(tg, '7', texts).sections, [15]);
  assert.equal(alertMarks(null, 7, texts), null);
});
test('intakeParams maps to exactly the backend DraftRequest keys', () => {
  const p = buildIntakeParams({ fields: { case_title: 'A v B', case_number: '1/2024', court: 'HC', petitioner: 'A', respondent: 'B', facts: 'f', statutory_provisions: 's', prayer: 'p' }, issues: 'one\ntwo', source: 'ocr' });
  const req = buildDraftRequest(normIntake(p));
  assert.deepEqual(Object.keys(req).sort(), ['case_number', 'case_title', 'court', 'facts', 'gemini_api_key', 'issues', 'petitioner_arguments', 'respondent_arguments', 'statutory_provisions']);
  assert.equal(req.issues, '(A) one\n(B) two');
  assert.deepEqual(parseIssues(req.issues), ['one', 'two']);
});
