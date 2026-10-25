import test from 'node:test';
import assert from 'node:assert/strict';
import { isUserRecorded, humanizeAction, buildAuditParams, filterAuditRows, distinctActions, shortHash, csvCell, toCsv, verifySummary, normalizeSync, formatDuration } from '../js/pages/lib/audit-logic.js';

const rows = [
  { id: 3, timestamp: '2026-10-24 23:04:57', user_name: "Hon'ble User (NLUJ)", user_role: 'Judicial', action: 'SEARCH_QUERY', details: 'dishonour of cheque' },
  { id: 2, timestamp: '2026-10-16 23:31:02', user_name: 'Justice R.K. Sharma', user_role: 'Judicial', action: 'SAVE_DRAFT', details: 'Draft #52' },
  { id: 1, timestamp: '2026-10-01 10:00:00', user_name: 'anonymous', user_role: 'X', action: 'VIEW_JUDGMENT', details: 'id 7' },
];

test('legacy placeholder users are not recorded', () => {
  assert.equal(isUserRecorded(rows[0]), false);
  assert.equal(isUserRecorded(rows[2]), false);
  assert.equal(isUserRecorded(rows[1]), true);
  assert.equal(isUserRecorded({}), false);
});

test('params drop empty values', () => {
  assert.deepEqual(buildAuditParams({ action: 'ALL', user: ' ', q: 'x', since: '2026-10-01' }), { q: 'x', since: '2026-10-01', limit: 200 });
});

test('filterAuditRows by action, user, q, since', () => {
  assert.equal(filterAuditRows(rows, { action: 'SAVE_DRAFT' }).length, 1);
  assert.equal(filterAuditRows(rows, { user: 'sharma' }).length, 1);
  assert.equal(filterAuditRows(rows, { q: 'CHEQUE' }).length, 1);
  assert.equal(filterAuditRows(rows, { since: '2026-10-10' }).length, 2);
  assert.equal(filterAuditRows(rows, {}).length, 3);
});

test('actions list merges known and seen; humanize', () => {
  assert.ok(distinctActions([{ action: 'NEW_THING' }]).includes('NEW_THING'));
  assert.equal(humanizeAction('DRAFT_STATUS_UPDATED'), 'Draft status updated');
});

test('csv quoting and formula guard', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
  const out = toCsv([rows[1]]);
  assert.ok(out.startsWith('Log_ID,Timestamp'));
  assert.equal(out.trim().split('\n').length, 2);
});

test('verify summary states', () => {
  assert.equal(verifySummary({ status: 'VERIFIED_SECURE', total_blocks_verified: 1201, latest_block_hash: 'abc' }).count, 1201);
  assert.equal(verifySummary({ status: 'VALID', total_blocks: 0 }).state, 'empty');
  const bad = verifySummary({ status: 'CORRUPTED', compromised_block_id: 9, message: 'x' });
  assert.equal(bad.state, 'bad'); assert.equal(bad.blockId, 9);
  assert.equal(shortHash('1234567890abcdef'), '12345678…');
});

test('sync history normalisation', () => {
  const n = normalizeSync([{ id: 1, timestamp: 't', court: 'c', cases_ingested: 12, duration_ms: 1500, status: 'success' }]);
  assert.equal(n[0].ingested, 12); assert.equal(n[0].status, 'SUCCESS');
  assert.deepEqual(normalizeSync(null), []);
  assert.equal(formatDuration(1500), '1.5 s'); assert.equal(formatDuration(80), '80 ms');
});
