import test from 'node:test';
import assert from 'node:assert/strict';
import { ZOOM_STEPS, clampZoom, nextZoom, keyToAction } from '../js/pages/lib/intake-zoom.js';

test('steps', () => assert.deepEqual(ZOOM_STEPS, [100, 150, 200, 300]));
test('clampZoom', () => {
  assert.equal(clampZoom(50), 100); assert.equal(clampZoom(999), 300);
  assert.equal(clampZoom('x'), 100); assert.equal(clampZoom(150), 150);
});
test('nextZoom walks the steps and stops at the ends', () => {
  assert.equal(nextZoom(100, 'in'), 150); assert.equal(nextZoom(150, 'in'), 200); assert.equal(nextZoom(200, 'in'), 300);
  assert.equal(nextZoom(300, 'in'), 300); assert.equal(nextZoom(300, 'out'), 200);
  assert.equal(nextZoom(100, 'out'), 100); assert.equal(nextZoom(300, 'reset'), 100);
  assert.equal(nextZoom(175, 'in'), 200); assert.equal(nextZoom(175, 'out'), 150); assert.equal(nextZoom(200, 'zzz'), 200);
});
test('keyToAction', () => {
  assert.equal(keyToAction('+'), 'in'); assert.equal(keyToAction('='), 'in');
  assert.equal(keyToAction('-'), 'out'); assert.equal(keyToAction('0'), 'reset'); assert.equal(keyToAction('a'), null);
});
