import test from 'node:test';
import assert from 'node:assert/strict';
import { sealFingerprint } from '../js/pages/lib/review-logic.js';
import en from '../js/i18n/pages/review.en.js';
import hi from '../js/i18n/pages/review.hi.js';

test('sealFingerprint: sealed draft with a hash captured at seal time', () => {
  const r = sealFingerprint({ status: 'FINAL_SEALED', sealed_hash: 'abc', sealed_at: '2026-01-01T00:00:00+00:00', sealed_hash_backfilled: false });
  assert.deepEqual(r, { kind: 'sealed', hash: 'abc', at: '2026-01-01T00:00:00+00:00' });
});
test('sealFingerprint: backfilled hash is distinguished', () => {
  assert.equal(sealFingerprint({ status: 'FINAL_SEALED', sealed_hash: 'abc', sealed_hash_backfilled: true }).kind, 'backfilled');
});
test('sealFingerprint: unsealed or missing data is a preview with no hash', () => {
  for (const d of [null, undefined, {}, { status: 'DRAFT', sealed_hash: 'abc' }, { status: 'BENCH_APPROVED' }, { status: 'FINAL_SEALED' }]) {
    assert.deepEqual(sealFingerprint(d), { kind: 'preview', hash: null, at: null });
  }
});
test('every sealFingerprint kind has en and hi labels', () => {
  for (const k of ['sealed', 'backfilled', 'preview']) {
    assert.ok(en[`review.seal.fp.${k}`] && hi[`review.seal.fp.${k}`]);
  }
  assert.ok(en['review.seal.fp.previewNote'] && hi['review.seal.fp.previewNote']);
});
