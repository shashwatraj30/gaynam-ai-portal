import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleLabel, verdictOf, documentCitationRows, documentSummary, isTextFile, isSupportedDoc, fileExt, documentCsv, briefItemFromRow } from '../js/pages/lib/citation-check-logic.js';

test('sample chips show case names', () => {
  assert.equal(sampleLabel('(2017) 10 SCC 1'), '(2017) 10 SCC 1 - Puttaswamy');
  assert.equal(sampleLabel('(1999) 1 SCC 1'), '(1999) 1 SCC 1');
});
test('file types', () => {
  assert.equal(fileExt('A.PDF'), 'pdf');
  assert.equal(isTextFile('a.txt'), true);
  assert.equal(isSupportedDoc('a.docx'), true);
  assert.equal(isSupportedDoc('a.png'), false);
});
test('verdictOf', () => {
  assert.equal(verdictOf('OVERRULED_WARNING'), 'overruled');
  assert.equal(verdictOf('DISTINGUISHED_CAUTION'), 'distinguished');
  assert.equal(verdictOf('HALLUCINATED_OR_UNVERIFIED'), 'notfound');
  assert.equal(verdictOf('VERIFIED_ACTIVE'), 'found');
  assert.equal(verdictOf(''), 'unknown');
});
test('documentCitationRows from an extraction and from verify_citations', () => {
  const ext = { authorities: [{ citation: '(2010) 11 SCC 441', status: 'VERIFIED_ACTIVE', matched_title: 'Rangappa', matched_id: 4, source_pdf_url: '/p.pdf' },
    { citation: '(2010) 11 SCC 441', status: 'VERIFIED_ACTIVE' }, { citation: '(1) SCC 2', status: 'UNVERIFIED_EXTERNAL' }] };
  const rows = documentCitationRows(ext);
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].verdict, rows[0].id, rows[0].pdf, rows[1].verdict], ['found', 4, '/p.pdf', 'notfound']);
  const v = documentCitationRows({ verifications: [{ citation: 'X', status: 'OVERRULED_WARNING', case_data: { id: 8, title: 'T', overruled_by: 'Y' } }] });
  assert.deepEqual([v[0].verdict, v[0].id, v[0].matchedTitle, v[0].overruledBy], ['overruled', 8, 'T', 'Y']);
  assert.deepEqual(documentCitationRows(null), []);
  const s = documentSummary(rows);
  assert.deepEqual([s.total, s.found, s.notfound], [2, 1, 1]);
  assert.ok(documentCsv(rows).startsWith('Citation,Result'));
  assert.equal(briefItemFromRow(rows[0]).id, 4);
});
