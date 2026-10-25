import test from 'node:test';
import assert from 'node:assert/strict';
import { initials, isActive, summarizeUsers, isSelf, toggleId, permissionSummary, applyStatus, humanizeRole } from '../js/pages/lib/chamber-logic.js';

const users = [
  { user_id: 'U1', email: 'a@x.in', full_name: "Hon'ble Mr. Justice R.K. Sharma", role: 'JUDICIAL_USER', status: 'ACTIVE', permissions: ['A', 'B', 'C', 'D', 'E', 'F'] },
  { user_id: 'U2', email: 'b@x.in', full_name: 'Prof. (Dr.) H. Pareek', role: 'ADMIN', status: 'SUSPENDED', permissions: [] },
];

test('initials skip honorifics', () => {
  assert.equal(initials('Prof. (Dr.) Harishankar Pareek'), 'HP');
  assert.equal(initials('Ananya Rathore'), 'AR');
  assert.equal(initials(''), '?');
});

test('summaries and flags', () => {
  assert.deepEqual(summarizeUsers(users), { total: 2, active: 1, suspended: 1, roles: 2 });
  assert.equal(isActive(users[1]), false);
  assert.equal(isSelf(users[0], { email: 'A@x.in' }), true);
  assert.equal(isSelf(users[0], null), false);
  assert.equal(toggleId(users[0]), 'U1');
  assert.deepEqual(permissionSummary(users[0], 4).more, 2);
  assert.equal(humanizeRole('JUDICIAL_USER'), 'Judicial user');
});

test('applyStatus updates the matching user only', () => {
  const r = applyStatus(users, 'u1', 'SUSPENDED');
  assert.equal(r[0].status, 'SUSPENDED');
  assert.equal(r[1].status, 'SUSPENDED');
  assert.equal(applyStatus(users, 'b@x.in', 'ACTIVE')[1].status, 'ACTIVE');
  assert.equal(users[0].status, 'ACTIVE');
});
