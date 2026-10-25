import test from 'node:test';
import assert from 'node:assert/strict';
import { byAction, byUser, byDay, topN, distinctUsers, summarize, analyticsCsv } from '../js/pages/lib/audit-analytics.js';

const rows = [
  { timestamp: '2026-10-24 10:00:00', user_name: 'Asha', action: 'SEARCH_QUERY' },
  { timestamp: '2026-10-24T11:00:00', user_name: 'Asha', action: 'SEARCH_QUERY' },
  { timestamp: '2026-10-20 09:00:00', user_name: 'Ravi', action: 'SAVE_DRAFT' },
  { timestamp: '2026-09-01 09:00:00', user_name: "Hon'ble User (NLUJ)", action: 'SAVE_DRAFT' },
  { timestamp: '2026-10-25 09:00:00', user_name: 'unknown', action: 'EXPORT_DOCX' },
];
test('byAction sorted', () => {
  assert.deepEqual(byAction(rows), [{ key: 'SAVE_DRAFT', count: 2 }, { key: 'SEARCH_QUERY', count: 2 }, { key: 'EXPORT_DOCX', count: 1 }]);
});
test('byUser groups unrecorded', () => {
  const u = byUser(rows);
  assert.deepEqual(u[0], { key: '', count: 2 }); assert.equal(u.find((x) => x.key === 'Asha').count, 2);
  assert.equal(distinctUsers(rows), 2);
});
test('byDay fixed today, zero filled, 14 days', () => {
  const d = byDay(rows, '2026-10-25');
  assert.equal(d.length, 14); assert.equal(d[13].day, '2026-10-25'); assert.equal(d[0].day, '2026-10-12');
  assert.equal(d[13].count, 1); assert.equal(d[12].count, 2); assert.equal(d[8].count, 1);
  assert.equal(d.reduce((a, x) => a + x.count, 0), 4);
});
test('topN', () => { assert.equal(topN([1, 2, 3], 2).length, 2); assert.deepEqual(topN([1], 8), [1]); assert.deepEqual(topN([1], 0), []); });
test('empty', () => { const s = summarize([], '2026-10-25'); assert.equal(s.total, 0); assert.equal(s.days.length, 14); });
test('csv escapes formula cells', () => {
  const csv = analyticsCsv(summarize([{ timestamp: '2026-10-25', user_name: '=cmd', action: 'A' }], '2026-10-25'));
  assert.ok(csv.includes('"\'=cmd"')); assert.ok(csv.startsWith('"Section"'));
});
