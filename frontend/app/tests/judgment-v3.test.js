import test from 'node:test';
import assert from 'node:assert/strict';
import { splitParties, parseParaParam, paraId, pickTab, paragraphRows, citedByRows, linkCitedCases } from '../js/pages/lib/judgment-logic.js';

test('splitParties', () => {
  assert.deepEqual(splitParties('Rangappa v. Sri Mohan'), { petitioner: 'Rangappa', respondent: 'Sri Mohan' });
  assert.deepEqual(splitParties('State vs Kumar'), { petitioner: 'State', respondent: 'Kumar' });
  assert.deepEqual(splitParties('A v. B v. C'), { petitioner: 'A', respondent: 'B v. C' });
  assert.equal(splitParties('In re Natural Justice'), null);
  assert.equal(splitParties(''), null);
});
test('paragraph anchors and tab param', () => {
  assert.equal(parseParaParam('12'), 12); assert.equal(parseParaParam('0'), null); assert.equal(parseParaParam('x'), null); assert.equal(parseParaParam(null), null);
  assert.equal(paraId(7), 'para-7');
  assert.equal(pickTab('ratio', ['judgment', 'ratio'], 'judgment'), 'ratio');
  assert.equal(pickTab('zzz', ['judgment'], 'judgment'), 'judgment');
});
test('paragraphRows is honest when empty', () => {
  assert.equal(paragraphRows({ items: [], available: false }).available, false);
  assert.equal(paragraphRows(null).available, false);
  const r = paragraphRows({ available: true, items: [{ para_no: 2, text: 'b', page: 3 }, { para_no: 1, text: '' }] });
  assert.deepEqual(r.items, [{ n: 2, text: 'b', page: 3 }]);
  assert.equal(r.available, true);
});
test('citedByRows prefers treatments, falls back to graph edges', () => {
  const tr = { available: true, cited_by: [{ citing_id: 9, title: 'T', citation: 'C', treatment: 'FOLLOWED', para_no: 4 }] };
  assert.equal(citedByRows(tr, null)[0].treatment, 'FOLLOWED');
  const g = { nodes: [{ id: '1', judgment_id: 1, is_center: true }, { id: '2', judgment_id: 2, title: 'Later', citation: 'X', precedent_status: 'FOLLOWED' }, { id: '3', judgment_id: 3, title: 'Earlier' }],
    edges: [{ source: '2', target: '1', relation: 'cites' }, { source: '1', target: '3', relation: 'cites' }] };
  assert.deepEqual(citedByRows({ available: false }, g).map((r) => r.id), [2]);
  assert.deepEqual(citedByRows(null, null), []);
});
test('linkCitedCases links corpus matches only', () => {
  const g = { nodes: [{ id: '4', judgment_id: 4, in_corpus: true, citation: '(2010) 11 SCC 441', title: 'Rangappa v. Sri Mohan' }, { id: 'ext:x', judgment_id: null, in_corpus: false, citation: '(2000) 1 SCC 1' }] };
  const r = linkCitedCases(['Rangappa, (2010) 11 SCC 441', 'Other (2000) 1 SCC 1'], g);
  assert.equal(r[0].id, 4);
  assert.equal(r[1].id, null);
});
