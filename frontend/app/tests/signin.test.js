import test from 'node:test';
import assert from 'node:assert/strict';
import { safeNext, initials, displayName, profilesFromRoles } from '../js/pages/lib/signin-logic.js';

test('safeNext blocks open redirects and loops', () => {
  assert.equal(safeNext('/research?q=a'), '/research?q=a');
  assert.equal(safeNext('//evil.com'), '/');
  assert.equal(safeNext('https://evil.com'), '/');
  assert.equal(safeNext('/signin?next=/'), '/');
  assert.equal(safeNext(null), '/');
  assert.equal(safeNext('/\\evil'), '/');
});

test('initials and displayName strip honorifics', () => {
  assert.equal(initials("Hon'ble Mr. Justice R.K. Sharma"), 'RS');
  assert.equal(initials('Prof. (Dr.) Harishankar Pareek'), 'HP');
  assert.equal(initials('CA Rajeshwar Singhal'), 'RS');
  assert.equal(initials(''), '?');
  assert.equal(displayName("Hon'ble Mr. Justice R.K. Sharma"), 'Justice R.K. Sharma');
  assert.equal(displayName('Ananya Rathore'), 'Ananya Rathore');
});

test('profilesFromRoles dedups by role and tolerates bad input', () => {
  const p = profilesFromRoles({ roles: { A: { title: 'Role A' } }, directory: [
    { role: 'A', full_name: 'X Y', designation: 'd', institution: 'i', badge_id: 'b' },
    { role: 'A', full_name: 'Dup' }, { role: 'B', full_name: 'Z', scope_role: 'Bee' }, null] });
  assert.equal(p.length, 2);
  assert.equal(p[0].scopeRole, 'Role A');
  assert.equal(p[1].scopeRole, 'Bee');
  assert.deepEqual(profilesFromRoles(null), []);
});
