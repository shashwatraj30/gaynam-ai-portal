import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSections, buildSearchBody, filterResults, orderResults, addHistory, groupHistory, emptyFilters, activeFilterCount, matchesSections,
} from '../js/pages/lib/research-logic.js';
import { honestView, toggleBrief, briefItem, snippet } from '../js/pages/lib/judgment-logic.js';

test('parseSections extracts unique section tokens', () => {
  assert.deepEqual(parseSections('302, 34 IPC; 498a 302'), ['302', '34', '498A']);
  assert.deepEqual(parseSections(''), []);
});

test('buildSearchBody matches the legacy payload shape', () => {
  const b = buildSearchBody('  bail  ', { ...emptyFilters(), court: 'Rajasthan', status: 'OVERRULED', judge: ' Sharma ' });
  assert.deepEqual(b, { query: 'bail', court: 'Rajasthan', judge: 'Sharma', precedent_status: 'OVERRULED', limit: 30 });
  assert.equal(buildSearchBody('theft', { ...emptyFilters(), sections: '379' }).query, 'theft section 379');
});

test('activeFilterCount', () => {
  assert.equal(activeFilterCount(emptyFilters()), 0);
  assert.equal(activeFilterCount({ ...emptyFilters(), court: 'Bombay', yearFrom: '2000', sections: '302' }), 3);
});

const rows = [
  { id: 1, title: 'A', judgment_date: '2010-05-07', statutes_considered: 'NI Act 138, 139', precedent_status: 'FOLLOWED' },
  { id: 2, title: 'B', year: 2008, statutes_considered: 'IPC 302', precedent_status: 'OVERRULED' },
  { id: 3, title: 'C', judgment_date: '2019-01-01', statutes_considered: 'IPC 1302', precedent_status: 'FOLLOWED' },
  { id: 4, title: 'D', statutes_considered: '' },
];
test('year filter drops rows without a year', () => {
  assert.deepEqual(filterResults(rows, { ...emptyFilters(), yearFrom: '2009' }).map((r) => r.id), [1, 3]);
  assert.deepEqual(filterResults(rows, { ...emptyFilters(), yearFrom: '2008', yearTo: '2010' }).map((r) => r.id), [1, 2]);
});
test('section filter matches whole tokens only', () => {
  assert.equal(matchesSections(rows[2], ['302']), false);
  assert.deepEqual(filterResults(rows, { ...emptyFilters(), sections: '302' }).map((r) => r.id), [2]);
  assert.deepEqual(filterResults(rows, { ...emptyFilters(), sections: '139' }).map((r) => r.id), [1]);
});
test('overruled authorities move to the end, others keep order', () => {
  assert.deepEqual(orderResults([rows[1], rows[0], rows[2]]).map((r) => r.id), [1, 3, 2]);
});

test('history: newest first, deduped case-insensitively, capped', () => {
  let l = addHistory([], { q: 'Bail' }, 1000);
  l = addHistory(l, { q: 'theft' }, 2000);
  l = addHistory(l, { q: 'bail ' }, 3000);
  assert.deepEqual(l.map((e) => e.q), ['bail', 'theft']);
  assert.equal(addHistory(l, { q: '  ' }).length, 2);
  let big = [];
  for (let i = 0; i < 40; i++) big = addHistory(big, { q: `q${i}` }, i);
  assert.equal(big.length, 30);
});
test('groupHistory buckets by day', () => {
  const now = new Date(2026, 9, 24, 12).getTime();
  const g = groupHistory([{ q: 'a', at: now - 3600e3 }, { q: 'b', at: now - 26 * 3600e3 }, { q: 'c', at: now - 5 * 86400e3 }], now);
  assert.deepEqual([g.today.length, g.yesterday.length, g.earlier.length], [1, 1, 1]);
});

test('bench brief caps at 5, toggles and hides templated ratio', () => {
  let list = [];
  for (let i = 1; i <= 5; i++) list = toggleBrief(list, { id: i }).list;
  assert.equal(toggleBrief(list, { id: 6 }).action, 'full');
  const r = toggleBrief(list, { id: 3 });
  assert.equal(r.action, 'removed'); assert.equal(r.list.length, 4);
  const tmpl = briefItem({ id: 9, title: 'T', citation: 'RJHC020056402024', court: 'HC', ratio_decidendi: 'Judicial determination by High Court', is_curated: false });
  assert.equal(tmpl.ratio, '');
  const cur = briefItem({ id: 8, title: 'R', ratio_decidendi: 'Burden shifts', is_curated: true });
  assert.equal(cur.ratio, 'Burden shifts');
});

test('honestView hides ratio and cited count unless curated; labels CNR', () => {
  const u = honestView({ is_curated: false, ratio_decidendi: 'x', headnote: 'Judicial determination by X. Disposition: dismissed.', citing_cases_count: 35, citation: 'RJHC020056402024' });
  assert.equal(u.ratio, ''); assert.equal(u.citedCount, null);
  assert.equal(u.disposition, 'dismissed');
  assert.equal(u.cite.label, 'CNR');
  const c = honestView({ is_curated: true, ratio_decidendi: 'r', citing_cases_count: 3100, citation: '(2010) 11 SCC 441' });
  assert.equal(c.citedCount, 3100); assert.equal(c.cite.label, 'Citation');
  assert.equal(honestView({ is_curated: true, citing_cases_count: null }).citedCount, null);
});
test('snippet truncates on a word boundary', () => {
  assert.equal(snippet('short'), 'short');
  assert.ok(snippet('word '.repeat(100), 50).endsWith('…'));
});
