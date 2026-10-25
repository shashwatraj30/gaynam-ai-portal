import test from 'node:test';
import assert from 'node:assert/strict';
import { citationText, paragraphs, parseCitedCases, isCnr, citationLabel, yearOf, dispositionOf } from '../js/pages/lib/judgment-logic.js';

test('isCnr / citationLabel', () => {
  assert.equal(isCnr('RJHC020056402024'), true);
  assert.equal(isCnr('(2010) 11 SCC 441'), false);
  assert.deepEqual(citationLabel({ citation: '', cnr_number: 'RJHC020056402024' }), { label: 'CNR', value: 'RJHC020056402024' });
  assert.equal(citationLabel({}), null);
});
test('citationText', () => {
  assert.equal(citationText({ title: 'Rangappa v. Sri Mohan', citation: '(2010) 11 SCC 441', court: 'Supreme Court', judgment_date: '2010-05-07' }),
    'Rangappa v. Sri Mohan, (2010) 11 SCC 441 (Supreme Court, 2010-05-07)');
  assert.equal(citationText({ title: 'X v. Y', citation: 'RJHC020056402024', court: 'Rajasthan HC', year: 2024 }), 'X v. Y, CNR RJHC020056402024 (Rajasthan HC, 2024)');
  assert.equal(citationText({ title: 'Only' }), 'Only');
});
test('paragraphs splits on blank lines then lines', () => {
  assert.deepEqual(paragraphs('a\n\nb\n\n\nc'), ['a', 'b', 'c']);
  assert.deepEqual(paragraphs('a\nb'), ['a', 'b']);
  assert.deepEqual(paragraphs(''), []);
});
test('parseCitedCases handles json, list, text', () => {
  assert.deepEqual(parseCitedCases('["A v. B","C v. D"]'), ['A v. B', 'C v. D']);
  assert.deepEqual(parseCitedCases('A v. B; C v. D'), ['A v. B', 'C v. D']);
  assert.deepEqual(parseCitedCases([{ title: 'T' }, 'S']), ['T', 'S']);
  assert.deepEqual(parseCitedCases(null), []);
  assert.deepEqual(parseCitedCases('[]'), []);
});
test('yearOf and dispositionOf', () => {
  assert.equal(yearOf({ judgment_date: '7 May 2010' }), 2010);
  assert.equal(yearOf({}), null);
  assert.equal(dispositionOf({ headnote: 'Judicial determination by X. Disposition: Allowed in part. More' }), 'Allowed in part');
});
