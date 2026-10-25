import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSampleSource, checkFile, uploadErrorKey, normalizeBrief, normalizePleading, parseIssues, validateFields,
  canProceed, buildIntakeParams, humanSize, extOf, sourceNoteKey,
} from '../js/pages/lib/intake-logic.js';

test('sample sources', () => {
  assert.ok(isSampleSource('canned_sample'));
  assert.ok(isSampleSource('fallback'));
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
test('normalizeBrief carries source and flags samples', () => {
  const r = normalizeBrief({ success: true, source: 'fallback', dpdp_redactions_applied: 3, cleaned_character_count: 900,
    metadata: { court: 'C', case_number: 'N', case_title: 'T', facts_summary: 'F', grounds_of_challenge: '(A) Q?', statutory_provisions: 'S' } });
  assert.equal(r.isSample, true);
  assert.equal(r.fields.facts, 'F');
  assert.equal(r.issues, '(A) Q?');
  assert.equal(r.redactions, 3);
  assert.equal(normalizeBrief({ source: 'ocr', metadata: {} }).isSample, false);
  assert.equal(normalizeBrief({ vlm_transcription_used: true, metadata: {} }).source, 'vlm');
});
test('normalizePleading blanks parser defaults (P9)', () => {
  const r = normalizePleading({ parsed: { case_title: 'Petitioner v. Respondent', case_number: 'W.P. No. 1024/2023',
    statutory_provisions: 'Constitution of India, Article 226', court: 'High Court of Rajasthan at Jodhpur', facts: 'text',
    issues: '(A) Whether the impugned order violates the principles of natural justice?\n(B) Whether the proceedings conform to the statutory mandate under X?' } }, 2);
  assert.equal(r.fields.case_title, '');
  assert.equal(r.fields.case_number, '');
  assert.equal(r.fields.statutory_provisions, '');
  assert.equal(r.issues, '');
  assert.equal(r.blanked, 4);
  assert.equal(r.fields.facts, 'text');
  assert.equal(r.redactions, 2);
  const real = normalizePleading({ parsed: { case_title: 'A v. B', case_number: 'WP 4521 of 2023' } });
  assert.equal(real.fields.case_title, 'A v. B');
  assert.equal(real.blanked, 0);
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
    issues: 'One?\nTwo?', source: 'ocr', isSample: false, redactions: 2, filename: 'a.pdf' });
  assert.equal(p.case_title, 'P v. R');
  assert.equal(p.facts, 'f');
  assert.equal(p.issues, '(A) One?\n(B) Two?');
  assert.equal(p.is_sample, false);
  assert.equal(p.confirmed_issues, true);
  assert.equal(p.petitioner_arguments, '');
  assert.equal(sourceNoteKey('digital_text'), 'intake.read.digital');
});
