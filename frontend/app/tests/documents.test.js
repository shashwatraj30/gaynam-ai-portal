import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOC_TYPES, STATUSES, SAMPLES, ACCEPT, MAX_BYTES, statusTone, statusKey, sourceLabelKey, sourceTone, docTypeKey,
  validateUpload, createErrorKey, parseListQuery, buildQueryString, buildListParams, hasFilters, rowView, mergePage,
} from '../js/pages/lib/documents-logic.js';
import en from '../js/i18n/pages/documents.en.js';
import hi from '../js/i18n/pages/documents.hi.js';

test('doc types cover the contract enum and have i18n keys in en and hi', () => {
  assert.deepEqual(DOC_TYPES.map((d) => d.value), ['FIR', 'PLAINT', 'WRITTEN_STATEMENT', 'PETITION', 'COUNTER_AFFIDAVIT', 'REJOINDER',
    'APPEAL', 'APPLICATION', 'EVIDENCE_SUMMARY', 'PREVIOUS_ORDER', 'SUBMISSIONS', 'OTHER']);
  for (const d of DOC_TYPES) { assert.ok(en[d.key], d.key); assert.ok(hi[d.key], d.key); }
  assert.equal(docTypeKey('nope'), 'docs.type.OTHER');
});

test('every key the logic returns exists in both languages', () => {
  const keys = [
    ...STATUSES.map(statusKey), ...['digital', 'ocr', 'vlm', 'pasted', 'sample', 'failed', 'x'].map(sourceLabelKey),
    ...SAMPLES.map((s) => s.key), 'docs.err.noFile', 'docs.err.noText', 'docs.err.type', 'docs.err.size', 'docs.err.empty', 'docs.err.read',
  ];
  for (const k of keys) { assert.ok(en[k], k); assert.ok(hi[k], k); }
});

test('status and source mapping', () => {
  assert.equal(statusTone('READ'), 'info');
  assert.equal(statusTone('CONFIRMED'), 'primary');
  assert.equal(statusTone('ARCHIVED'), 'neutral');
  assert.equal(statusKey('weird'), 'docs.status.READ');
  assert.equal(sourceLabelKey('vlm'), 'docs.source.vlm');
  assert.equal(sourceLabelKey(undefined), 'docs.source.unknown');
  assert.equal(sourceTone('failed'), 'warn');
  assert.equal(sourceTone('ocr'), 'neutral');
});

test('samples match the API values', () => {
  assert.deepEqual(SAMPLES.map((s) => s.sample), ['pleading', 'degraded', 'fir_04_17', 'fir_06_17']);
  assert.ok(ACCEPT.includes('.tiff') && !ACCEPT.includes('.doc,'));
});

test('validateUpload', () => {
  const f = (name, size = 10) => ({ name, size });
  assert.equal(validateUpload({ sample: 'pleading' }), null);
  assert.equal(validateUpload({ file: f('a.pdf') }), null);
  assert.equal(validateUpload({ file: f('a.TIFF') }), null);
  assert.equal(validateUpload({ file: f('a.exe') }), 'docs.err.type');
  assert.equal(validateUpload({ file: f('a.doc') }), 'docs.err.type');
  assert.equal(validateUpload({ file: f('a.pdf', 0) }), 'docs.err.empty');
  assert.equal(validateUpload({ file: f('a.pdf', MAX_BYTES + 1) }), 'docs.err.size');
  assert.equal(validateUpload({ text: '   ' }), 'docs.err.noText');
  assert.equal(validateUpload({ text: 'FIR text' }), null);
  assert.equal(validateUpload({}), 'docs.err.noFile');
});

test('createErrorKey maps API errors', () => {
  assert.equal(createErrorKey({ status: 413 }), 'docs.err.size');
  assert.equal(createErrorKey({ status: 415 }), 'docs.err.type');
  assert.equal(createErrorKey({ status: 403 }), 'err.forbidden');
  assert.equal(createErrorKey({ code: 'TIMEOUT' }), 'err.timeout');
  assert.equal(createErrorKey({ code: 'NETWORK' }), 'err.network');
  assert.equal(createErrorKey({ code: 'ABORTED' }), null);
  assert.equal(createErrorKey({ status: 500 }), 'docs.err.read');
});

test('query parsing and list params', () => {
  const f = parseListQuery(new URLSearchParams('q=%20fir%20&type=fir&status=confirmed&matter=06%2F17'));
  assert.deepEqual(f, { q: 'fir', type: 'FIR', status: 'CONFIRMED', matter: '06/17' });
  assert.deepEqual(parseListQuery(new URLSearchParams('type=BOGUS&status=x')), { q: '', type: '', status: '', matter: '' });
  assert.deepEqual(parseListQuery(), { q: '', type: '', status: '', matter: '' });
  assert.deepEqual(buildListParams(new URLSearchParams('q=a&type=FIR&status=READ&matter=m1')),
    { limit: 25, offset: 0, q: 'a', doc_type: 'FIR', status: 'READ', matter_key: 'm1' });
  assert.deepEqual(buildListParams('', { offset: 25 }), { limit: 25, offset: 25 });
  const qs = buildQueryString(f);
  assert.deepEqual(parseListQuery(qs), f);
  assert.equal(buildQueryString({ q: ' ', type: '' }), '');
  assert.equal(hasFilters(f), true);
  assert.equal(hasFilters(parseListQuery('')), false);
});

test('rowView', () => {
  const v = rowView({ id: 7, title: ' ', original_name: 'fir.jpg', doc_type: 'FIR', status: 'CONFIRMED', source: 'ocr',
    redaction_total: 3, chars: 1200, pages: 2, matter_key: '06/17', uploaded_by: 'asha', created_at: '2026-10-20T10:00:00Z' });
  assert.equal(v.title, 'fir.jpg');
  assert.equal(v.href, '#/documents/7');
  assert.equal(v.typeKey, 'docs.type.FIR');
  assert.equal(v.statusTone, 'primary');
  assert.equal(v.redactions, 3);
  assert.equal(v.matter, '06/17');
  assert.equal(v.failed, false);
  const bad = rowView({ id: 'a/b', source: 'failed', chars: 50, pages: 1 });
  assert.equal(bad.failed, true);
  assert.equal(bad.sourceTone, 'warn');
  assert.equal(bad.chars, 0);
  assert.equal(bad.href, '#/documents/a%2Fb');
  assert.equal(rowView(null).title, '');
});

test('mergePage drops duplicates', () => {
  assert.deepEqual(mergePage([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]).map((d) => d.id), [1, 2, 3]);
  assert.deepEqual(mergePage(null, [{ id: 1 }]).map((d) => d.id), [1]);
});
