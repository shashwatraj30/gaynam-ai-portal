import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutGraph, assignLayers, limitGraph, linkRows, neighborByKey, wrapLines, truncate, isEmptyGraph, nodeHref } from '../js/pages/lib/graph-logic.js';
import { LINEAGES, OVERRULED_PAIRS } from '../js/pages/lib/lineages.js';
import { sortAlerts, severityChip, summarize, buildAlertTarget, findOverrulingId, foundInKey, pickAlert } from '../js/pages/lib/alerts-logic.js';

const data = {
  judgment_id: 7,
  nodes: [
    { id: 7, title: 'Puttaswamy', is_center: true, in_corpus: true },
    { id: 8, title: 'ADM Jabalpur', precedent_status: 'OVERRULED', in_corpus: true },
    { id: 99, title: 'M.P. Sharma', in_corpus: false },
  ],
  edges: [
    { source: 7, target: 8, relation: 'cites' },
    { source: 8, target: 7, relation: 'overruled_by' },
    { source: 7, target: 99, relation: 'cites' },
  ],
  is_linked: true,
};

test('layers: cited authorities left of centre, overruling to the right', () => {
  const l = assignLayers(data.nodes, data.edges, 7);
  assert.equal(l.get('7'), 1);
  assert.equal(l.get('8'), 0);
  assert.equal(l.get('99'), 0);
});

test('layoutGraph positions every node and builds edge paths', () => {
  const m = layoutGraph(data);
  assert.equal(m.nodes.length, 3);
  assert.equal(m.centerId, 7);
  assert.ok(m.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
  assert.equal(m.edges.length, 3);
  assert.ok(m.edges.every((e) => e.d.startsWith('M ')));
  assert.equal(m.edges.filter((e) => e.overruled).length, 1);
  assert.ok(m.width > 0 && m.height > 0);
});

test('limitGraph caps nodes at 30, keeps the centre, drops dangling edges', () => {
  const nodes = Array.from({ length: 45 }, (_, i) => ({ id: i + 1, title: `n${i}` }));
  const edges = nodes.slice(1).map((n) => ({ source: 1, target: n.id, relation: 'cites' }));
  const r = limitGraph(nodes, edges, 1);
  assert.equal(r.nodes.length, 30);
  assert.ok(r.truncated);
  assert.equal(r.total, 45);
  assert.ok(r.nodes.some((n) => n.id === 1));
  assert.ok(r.edges.every((e) => r.nodes.some((n) => n.id === e.target)));
});

test('linkRows describes each node relative to the centre', () => {
  const rows = linkRows(layoutGraph(data));
  const by = Object.fromEntries(rows.map((r) => [r.node.id, r.kind]));
  assert.equal(by[8], 'relied_on'); // first matching edge: centre cites 8
  assert.equal(by[99], 'relied_on');
  const m2 = layoutGraph({ judgment_id: 8, nodes: data.nodes.map((n) => ({ ...n, is_center: n.id === 8 })), edges: [{ source: 8, target: 7, relation: 'overruled_by' }] });
  assert.equal(linkRows(m2).find((r) => r.node.id === 7).kind, 'overruled_by');
});

test('neighborByKey moves across columns and returns null at the edge', () => {
  const m = layoutGraph(data);
  assert.equal(neighborByKey(m, 7, 'ArrowLeft') != null, true);
  assert.equal(neighborByKey(m, 7, 'ArrowRight'), null);
  assert.equal(neighborByKey(m, 7, 'x'), null);
  const first = m.nodes.find((n) => n.layer === 0);
  assert.equal(neighborByKey(m, first.id, 'ArrowUp'), null);
});

test('text helpers and empty detection', () => {
  assert.equal(truncate('abcdefghij', 5), 'abcd…');
  assert.ok(wrapLines('Managing Director ECIL Hyderabad v. B. Karunakar', 20, 2).length <= 2);
  assert.equal(isEmptyGraph({ edges: [], is_linked: false }), true);
  assert.equal(isEmptyGraph(data), false);
  assert.equal(nodeHref({ id: 3 }), '#/judgments/3');
  assert.equal(nodeHref({ id: 3, in_corpus: false }), null);
});

test('lineages: external cases are never linked; pairs cover the 2 overruled rows', () => {
  const ext = LINEAGES.flatMap((l) => l.nodes).filter((n) => n.id == null);
  assert.ok(ext.length >= 3);
  assert.deepEqual(OVERRULED_PAIRS.map((p) => p.from.id).sort(), [4, 8]);
});

const alerts = [
  { id: 1, severity: 'warning', date_created: '2026-10-20 10:00:00', draft_id: 5, matter_key: 'k', overruled_case: { id: 4, citation: '(2008) 4 SCC 54' } },
  { id: 2, severity: 'critical', date_created: '2026-10-01 10:00:00', draft_id: 6 },
  { id: 3, severity: 'critical', date_created: '2026-10-10 10:00:00', draft_id: 7 },
];

test('alerts: sort critical first then newest', () => {
  assert.deepEqual(sortAlerts(alerts).map((a) => a.id), [3, 2, 1]);
  assert.deepEqual(summarize(alerts), { total: 3, critical: 2, warning: 1 });
  assert.equal(severityChip('critical').tone, 'danger');
  assert.equal(severityChip('weird').tone, 'warn');
});

test('alerts: target payload, overruling lookup, found_in', () => {
  const tgt = buildAlertTarget(alerts[0]);
  assert.equal(tgt.draftId, 5);
  assert.equal(tgt.citation, '(2008) 4 SCC 54');
  const g = { nodes: [{ id: 4 }, { id: 3, in_corpus: true }], edges: [{ source: 4, target: 3, relation: 'overruled_by' }] };
  assert.equal(findOverrulingId(g, 4), 3);
  assert.equal(findOverrulingId(g, 9), null);
  assert.equal(foundInKey('verified_citations'), 'verified');
  assert.equal(foundInKey('retrieved_precedents'), 'retrieved');
  assert.equal(foundInKey('zzz'), 'other');
  assert.equal(pickAlert(alerts, '2').id, 2);
});
