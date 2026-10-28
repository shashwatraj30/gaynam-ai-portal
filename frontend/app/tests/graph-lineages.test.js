import test from 'node:test';
import assert from 'node:assert/strict';
import { mapStreams, resolveStreams, nodeActions, searchHits, treatmentCounts } from '../js/pages/lib/graph-logic.js';
import { LINEAGES } from '../js/pages/lib/lineages.js';

const payload = { streams: [{ id: 's1', title: 'T', subtitle: 'S', nodes: [
  { id: 2, judgment_id: null, year: 2017, title: 'B', citation: 'c', holding: '', coram: '9 judges', bench: null, impact: 'x', overruled: false },
  { id: 1, judgment_id: 8, year: 1976, title: 'A', citation: 'd', overruled: true }] }] };

test('mapStreams sorts by year, keeps empty fields empty', () => {
  const s = mapStreams(payload);
  assert.equal(s[0].nodes[0].title, 'A');
  assert.equal(s[0].nodes[0].judgmentId, 8);
  assert.equal(s[0].nodes[1].holding, '');
  assert.equal(s[0].nodes[1].bench, '');
  assert.equal(s[0].nodes[1].coram, '9 judges');
  assert.equal(mapStreams({ streams: [] }), null);
  assert.equal(mapStreams(null), null);
});

test('fallback uses local lineages with labels, nothing invented', () => {
  const r = resolveStreams(null, LINEAGES, (k) => ({ title: `L-${k}` }));
  assert.equal(r.source, 'local');
  assert.equal(r.streams.length, LINEAGES.length);
  assert.equal(r.streams[0].title, 'L-privacy');
  const n = r.streams[0].nodes[0];
  assert.equal(n.judgmentId, 8); assert.equal(n.overruled, true); assert.equal(n.holding, ''); assert.equal(n.impact, '');
  assert.equal(resolveStreams(payload, LINEAGES).source, 'api');
});

test('nodeActions: open + graph with id, search without', () => {
  assert.deepEqual(nodeActions({ judgmentId: 8, title: 'A' }).map((a) => a.href), ['#/judgments/8', '#/graph/8']);
  assert.deepEqual(nodeActions({ judgmentId: null, title: 'A & B', citation: 'c' }), [{ kind: 'search', href: '#/research?q=A%20%26%20B' }]);
  assert.equal(nodeActions({ judgmentId: null, title: '', citation: '(1) SCC' })[0].href, '#/research?q=(1)%20SCC');
  assert.deepEqual(nodeActions({ judgmentId: null }), []);
});

test('searchHits keeps rows with ids', () => {
  const r = searchHits({ results: [{ id: 3, title: 'T', citation: 'C', court: 'SC', date: '2010-05-01' }, { title: 'no id' }] });
  assert.equal(r.length, 1); assert.equal(r[0].meta, 'C · SC · 2010');
  assert.deepEqual(searchHits(null), []);
});

test('treatmentCounts', () => {
  assert.equal(treatmentCounts({ available: false, cited_by: [{ treatment: 'FOLLOWED' }] }).available, false);
  assert.equal(treatmentCounts(null).total, 0);
  const c = treatmentCounts({ available: true, cited_by: [{ treatment: 'Followed' }, { treatment: 'followed' }, { treatment: 'overruled' }, { treatment: 'weird' }] });
  assert.equal(c.counts.followed, 2); assert.equal(c.counts.overruled, 1); assert.equal(c.other, 1); assert.equal(c.total, 4);
});
