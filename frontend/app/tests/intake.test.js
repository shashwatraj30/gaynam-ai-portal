import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSampleSource, checkFile, uploadErrorKey, normalizeDocument, extractionBody, isConflict, saveErrorKey, mergeDraftParams,
  defaultDocType, validDocType, FIELD_KEYS, parseIssues, validateFields,
  canProceed, buildIntakeParams, humanSize, extOf, sourceNoteKey,
} from '../js/pages/lib/intake-logic.js';

test('sample sources', () => {
  assert.ok(isSampleSource('sample'));
  assert.ok(!isSampleSource('failed'));
  assert.ok(!isSampleSource('ocr'));
  assert.ok(!isSampleSource(undefined));
});
test('file checks', () => {
  assert.equal(checkFile({ name: 'a.pdf', size: 10 }), null);
  assert.equal(checkFile({ name: 'a.exe', size: 10 }), 'intake.err.type');
  assert.equal(checkFile({ name: 'a.pdf', size: 65 * 1024 * 1024 }), 'intake.err.size');
  assert.equal(checkFile({ name: 'a.pdf', size: 0 }), 'intake.err.empty');
  assert.equal(checkFile(null), 'intake.err.noFile');
  assert.equal(extOf('X.JPG'), 'jpg');
  assert.equal(humanSize(379 * 1024), '379 KB');
  assert.equal(humanSize(2 * 1024 * 1024), '2.0 MB');
});
test('upload errors map to messages', () => {
  assert.equal(uploadErrorKey({ status: 415 }), 'intake.err.type');
  assert.equal(uploadErrorKey({ status: 413 }), 'intake.err.size');
  assert.equal(uploadErrorKey({ code: 'ABORTED' }), null);
  assert.equal(uploadErrorKey({ code: 'NETWORK' }), 'err.network');
  assert.equal(uploadErrorKey({ status: 500 }), 'intake.err.read');
});
test('normalizeDocument maps a server Document', () => {
  const r = normalizeDocument({ id: 7, doc_type: 'FIR', source: 'ocr', chars: 900, redaction_total: 0,
    redactions: [{ type: 'PHONE', count: 2 }, { type: 'PAN', count: 1 }],
    extraction: { version: 3, confirmed: false, fields: { court: ' C ', case_title: 'T', facts: 'F', petitioner_arguments: 'PA' },
      issues: ['Q1?', ' ', 'Q2?'], authorities: [{ citation: 'X' }] } });
  assert.equal(r.id, 7);
  assert.equal(r.fields.court, 'C');
  assert.equal(r.fields.petitioner_arguments, 'PA');
  assert.equal(r.fields.respondent, '');
  assert.equal(r.issues, 'Q1?\nQ2?');
  assert.equal(r.version, 3);
  assert.equal(r.redactions, 3);
  assert.equal(r.chars, 900);
  assert.equal(r.failed, false);
  assert.equal(r.authorities.length, 1);
  assert.equal(normalizeDocument({ id: 1, source: 'sample', redaction_total: 5, extraction: { fields: {} } }).isSample, true);
  assert.equal(normalizeDocument({ id: 1, source: 'sample', redaction_total: 5 }).redactions, 5);
  const f = normalizeDocument({ id: 2, source: 'failed', extraction: { version: 1, fields: {}, issues: [] } });
  assert.equal(f.failed, true);
  assert.equal(f.isSample, false);
  assert.equal(f.issues, '');
  assert.equal(normalizeDocument(null).failed, true);
});
test('document types and extraction body', () => {
  assert.equal(defaultDocType('fir_04_17'), 'FIR');
  assert.equal(defaultDocType('fir_06_17'), 'FIR');
  assert.equal(defaultDocType('pleading'), 'PETITION');
  assert.equal(defaultDocType(undefined), 'PETITION');
  assert.equal(validDocType('nope'), 'PETITION');
  assert.equal(validDocType('FIR'), 'FIR');
  const b = extractionBody({ case_title: ' T ', facts: 'f' }, '(A) One?\nTwo?', 4);
  assert.equal(b.version, 4);
  assert.deepEqual(b.issues, ['One?', 'Two?']);
  assert.equal(b.fields.case_title, 'T');
  assert.deepEqual(Object.keys(b.fields), FIELD_KEYS);
});
test('409 and save errors', () => {
  assert.equal(isConflict({ status: 409 }), true);
  assert.equal(isConflict({ status: 500 }), false);
  assert.equal(saveErrorKey({ status: 409, code: 'VERSION_CONFLICT' }), 'intake.err.conflict');
  assert.equal(saveErrorKey({ status: 409, code: 'NOT_CONFIRMED' }), 'intake.err.incomplete');
  assert.equal(saveErrorKey({ status: 422 }), 'intake.err.incomplete');
  assert.equal(saveErrorKey({ code: 'NETWORK' }), 'err.network');
  assert.equal(saveErrorKey({ code: 'ABORTED' }), null);
});
test('mergeDraftParams overlays the server params', () => {
  const local = buildIntakeParams({ fields: { case_title: 'L', facts: 'f' }, issues: 'One?', source: 'ocr', documentId: 9, authorities: [] });
  const m = mergeDraftParams(local, { params: { case_title: 'S', issues: '(A) One?', prayer: '', document_id: 9 }, authorities: [{ id: 1, title: 'Case' }] });
  assert.equal(m.case_title, 'S');
  assert.equal(m.document_id, 9);
  assert.equal(m.authorities.length, 1);
  assert.equal(m.is_sample, false);
  assert.equal(mergeDraftParams(local, null).case_title, 'L');
});
test('issues parsing and validation', () => {
  assert.deepEqual(parseIssues('(A) First?\n\n(B) Second?\n- Third\n1. Fourth'), ['First?', 'Second?', 'Third', 'Fourth']);
  assert.deepEqual(validateFields({ case_title: ' ', facts: 'x' }), { case_title: 'intake.err.required' });
  assert.deepEqual(validateFields({ case_title: 'a', facts: 'x' }), {});
});
test('sample gate: edit or acknowledge', () => {
  assert.equal(canProceed({ isSample: true, edited: false, acknowledged: false }), false);
  assert.equal(canProceed({ isSample: true, edited: true, acknowledged: false }), true);
  assert.equal(canProceed({ isSample: true, edited: false, acknowledged: true }), true);
  assert.equal(canProceed({ isSample: false, edited: false, acknowledged: false }), true);
});
test('intakeParams shape for the Studio', () => {
  const p = buildIntakeParams({ fields: { case_title: '', petitioner: 'P', respondent: 'R', facts: ' f ', court: 'C', case_number: 'N', statutory_provisions: 'S', prayer: '' },
    issues: 'One?\nTwo?', source: 'ocr', isSample: false, redactions: 2, filename: 'a.pdf', documentId: 12 });
  assert.equal(p.case_title, 'P v. R');
  assert.equal(p.facts, 'f');
  assert.equal(p.issues, '(A) One?\n(B) Two?');
  assert.equal(p.is_sample, false);
  assert.equal(p.confirmed_issues, true);
  assert.equal(p.petitioner_arguments, '');
  assert.equal(p.document_id, 12);
  assert.equal(p.petitioner, 'P');
  assert.deepEqual(p.authorities, []);
  assert.equal(sourceNoteKey('digital'), 'intake.read.digital');
  assert.equal(sourceNoteKey('failed'), 'intake.read.failed');
  assert.equal(sourceNoteKey('pasted'), 'intake.read.pasted');
});
