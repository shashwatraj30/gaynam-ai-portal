import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/pages/lib/home-logic.js';
import { normalizeDensity, loadDensity, saveDensity, applyDensity } from '../js/pages/lib/settings-logic.js';

test('homeVariant maps roles', () => {
  assert.equal(L.homeVariant('HON_JUSTICE'), 'judicial');
  assert.equal(L.homeVariant('LAW_CLERK'), 'researcher');
  assert.equal(L.homeVariant('NLU_SCHOLAR'), 'academic');
  assert.equal(L.homeVariant('REGISTRAR_NLUJ'), 'admin');
  assert.equal(L.homeVariant('AUDITOR'), 'auditor');
  assert.equal(L.homeVariant(undefined), 'academic');
});

test('greetingKey', () => {
  assert.equal(L.greetingKey(9), 'morning');
  assert.equal(L.greetingKey(13), 'afternoon');
  assert.equal(L.greetingKey(22), 'evening');
  assert.equal(L.greetingKey(2), 'evening');
});

test('sortMatters drops placeholders and orders by next action', () => {
  const ms = [
    { matter_key: 'a', latest_status: 'DRAFT', last_updated: '2026-01-02' },
    { matter_key: 'unfiled', latest_status: 'DRAFT', is_placeholder: true },
    { matter_key: 'b', latest_status: 'BENCH_APPROVED', last_updated: '2026-01-01' },
    { matter_key: 'c', latest_status: 'FINAL_SEALED' },
    { matter_key: 'd', latest_status: 'DRAFT', last_updated: '2026-02-01' },
  ];
  assert.deepEqual(L.sortMatters(ms).map((m) => m.matter_key), ['b', 'd', 'a', 'c']);
  assert.equal(L.sortMatters(ms, 2).length, 2);
  assert.deepEqual(L.matterCounts(ms), { total: 4, ready: 1, open: 3 });
  assert.deepEqual(L.sortMatters(null), []);
});

test('pickAttention prefers critical', () => {
  assert.equal(L.pickAttention({ alerts: [] }), null);
  assert.equal(L.pickAttention({ alerts: [{ id: 1, severity: 'warning' }, { id: 2, severity: 'critical' }] }).id, 2);
  assert.equal(L.alertCount({ alerts: [1, 2] }), 2);
});

test('summarizeLedger', () => {
  assert.equal(L.summarizeLedger({ status: 'VERIFIED_SECURE', total_blocks_verified: 5 }).state, 'ok');
  assert.equal(L.summarizeLedger({ status: 'VALID', total_blocks: 0 }).state, 'ok');
  assert.equal(L.summarizeLedger({ status: 'CORRUPTED', message: 'x' }).state, 'broken');
  assert.equal(L.summarizeLedger(null).state, 'unknown');
});

test('admin data helpers ignore padded fields and empty rows', () => {
  assert.equal(L.activityEvents([{ action: 'SEARCH_QUERY', timestamp: 't', user_name: 'u' }])[0].title, 'search query');
  assert.equal(L.lastSyncTimestamp({ sync_state: { last_sync_timestamp: 'x' } }), 'x');
  assert.equal(L.lastSyncTimestamp(null), null);
  assert.equal(L.syncRows([{ timestamp: 't', court: 'c', cases_ingested: 3, status: 'OK' }])[0].ingested, 3);
  assert.deepEqual(L.userSummary({ users: [{ status: 'ACTIVE' }, { status: 'SUSPENDED' }] }), { total: 2, active: 1 });
});

test('density preference round-trips through injectable storage', () => {
  const m = new Map();
  const store = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  assert.equal(normalizeDensity('weird'), 'comfortable');
  assert.equal(loadDensity(store), 'comfortable');
  assert.equal(saveDensity('compact', store), 'compact');
  assert.equal(loadDensity(store), 'compact');
  const root = { dataset: {} };
  applyDensity('compact', root);
  assert.equal(root.dataset.density, 'compact');
});
