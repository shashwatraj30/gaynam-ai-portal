import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../js/pages/lib/audit-logic.js';

test('buildAuditParams carries until, role, offset and drops empties', () => {
  assert.deepEqual(A.buildAuditParams({ action: 'ALL', role: 'ALL', until: '2026-10-31', offset: 100 }), { until: '2026-10-31', limit: 50, offset: 100 });
  assert.deepEqual(A.buildAuditParams({ role: 'AUDITOR', since: '2026-10-01' }), { since: '2026-10-01', role: 'AUDITOR', limit: 50 });
});

test('exportParams drops paging; excel adds bom=1', () => {
  assert.deepEqual(A.exportParams({ user: 'a', offset: 50 }), { user: 'a' });
  assert.deepEqual(A.exportParams({ action: 'SSO_LOGIN' }, { excel: true }), { action: 'SSO_LOGIN', bom: 1 });
});

test('pageInfo', () => {
  assert.deepEqual(A.pageInfo(120, 50, 50, 50), { total: 120, from: 51, to: 100, hasPrev: true, hasNext: true, prevOffset: 0, nextOffset: 100, page: 2, pages: 3 });
  const last = A.pageInfo(120, 100, 50, 50);
  assert.equal(last.to, 120);
  assert.equal(last.hasNext, false);
  assert.equal(A.pageInfo(0).from, 0);
});

test('filterAuditRows applies until and role; filterSummary lists active filters', () => {
  const rows = [{ timestamp: '2026-10-01 10:00', user_role: 'AUDITOR' }, { timestamp: '2026-10-20 10:00', user_role: 'RESEARCHER' }];
  assert.equal(A.filterAuditRows(rows, { until: '2026-10-10' }).length, 1);
  assert.equal(A.filterAuditRows(rows, { role: 'researcher' }).length, 1);
  assert.equal(A.filterAuditRows(rows, { role: 'ALL' }).length, 2);
  assert.deepEqual(A.filterSummary({ action: 'ALL', role: 'AUDITOR', until: '2026-10-10' }), ['role: AUDITOR', 'until: 2026-10-10']);
  assert.deepEqual(A.distinctRoles(rows), ['AUDITOR', 'RESEARCHER']);
});
