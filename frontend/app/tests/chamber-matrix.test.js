import test from 'node:test';
import assert from 'node:assert/strict';
import { permissionMatrix, badgeId } from '../js/pages/lib/chamber-logic.js';

test('permissionMatrix builds roles x permissions from the users payload', () => {
  const users = [
    { role: 'AUDITOR', permissions: ['VIEW_AUDIT'] },
    { role: 'ADMIN', permissions: ['MANAGE_USERS', 'VIEW_AUDIT'] },
    { role: 'ADMIN', permissions: ['MANAGE_USERS', 'VIEW_AUDIT'] },
    { permissions: ['X'] },
  ];
  const m = permissionMatrix(users);
  assert.deepEqual(m.roles, [{ role: 'ADMIN', count: 2 }, { role: 'AUDITOR', count: 1 }]);
  assert.deepEqual(m.permissions, ['MANAGE_USERS', 'VIEW_AUDIT']);
  assert.equal(m.has('AUDITOR', 'MANAGE_USERS'), false);
  assert.equal(m.has('ADMIN', 'VIEW_AUDIT'), true);
  assert.deepEqual(permissionMatrix([]).roles, []);
});

test('badgeId', () => {
  assert.equal(badgeId({ badge_id: ' B-1 ' }), 'B-1');
  assert.equal(badgeId({}), '');
});
