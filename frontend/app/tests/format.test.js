import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, formatDate, formatDateTime, formatRelative, plural } from '../js/format.js';
import { escapeHtml } from '../js/escape.js';

test('formatNumber uses en-IN grouping', () => {
  assert.equal(formatNumber(118096), '1,18,096');
  assert.equal(formatNumber(1234567), '12,34,567');
  assert.equal(formatNumber(null), '—');
});
test('formatDate / formatDateTime', () => {
  assert.equal(formatDate('2026-10-24'), '24 Oct 2026');
  assert.equal(formatDate('garbage'), '—');
  assert.match(formatDateTime('2026-10-24 14:05:00'), /^24 Oct 2026,? 2:05 PM$/);
});
test('formatRelative', () => {
  const now = new Date('2026-10-24T12:00:00').getTime();
  assert.equal(formatRelative('2026-10-24 11:55:00', now), '5 minutes ago');
  assert.equal(formatRelative('2026-10-22 12:00:00', now), '2 days ago');
  assert.equal(formatRelative('2026-10-24 11:59:50', now), 'now');
});
test('plural', () => {
  assert.equal(plural(1, 'matter', 'matters'), '1 matter');
  assert.equal(plural(1500, 'matter', 'matters'), '1,500 matters');
});
test('escapeHtml', () => {
  assert.equal(escapeHtml('<a href="x">\'&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
});
