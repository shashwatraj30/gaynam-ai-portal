import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFormat, interpretResult, addPast, normalizeInput, SAMPLES } from '../js/pages/lib/citation-check-logic.js';

test('detectFormat', () => {
  assert.equal(detectFormat('(2017) 10 SCC 1'), 'SCC');
  assert.equal(detectFormat('2000 INSC 361'), 'INSC');
  assert.equal(detectFormat('AIR 1973 SC 1461'), 'AIR');
  assert.equal(detectFormat('(2012) 3 SCC OnLine Del 4'), 'SCC OnLine');
  assert.equal(detectFormat('RJHC020056402024'), 'CNR');
  assert.equal(detectFormat('some words'), null);
  assert.ok(SAMPLES.includes('(2008) 4 SCC 54'));
});
test('overruled result', () => {
  const r = interpretResult({ status: 'OVERRULED_WARNING', case_data: { precedent_status: 'OVERRULED', overruled_by: 'K.S. Puttaswamy' } }, '(1976) 2 SCC 521');
  assert.equal(r.outcome, 'overruled'); assert.equal(r.overruledBy, 'K.S. Puttaswamy');
  assert.equal(r.checks.find((c) => c.id === 'treatment').state, 'fail');
  assert.equal(r.checks.find((c) => c.id === 'quote').state, 'unchecked');
});
test('active result is "found", never a positive guarantee', () => {
  const r = interpretResult({ status: 'VERIFIED_ACTIVE', case_data: { precedent_status: 'FOLLOWED' } }, '(2010) 11 SCC 441');
  assert.equal(r.outcome, 'found');
  assert.equal(r.checks.find((c) => c.id === 'found').state, 'pass');
});
test('distinguished and not found', () => {
  assert.equal(interpretResult({ status: 'DISTINGUISHED_CAUTION', case_data: { precedent_status: 'DISTINGUISHED' } }, 'x').outcome, 'distinguished');
  const nf = interpretResult({ status: 'HALLUCINATED_OR_UNVERIFIED', case_data: null }, '(2024) 99 SCC 9999');
  assert.equal(nf.outcome, 'notfound'); assert.equal(nf.checks.find((c) => c.id === 'found').state, 'fail');
  assert.equal(interpretResult({ status: 'UNVERIFIED_EXTERNAL', case_data: { id: 1 } }, 'x').outcome, 'notfound');
  assert.equal(interpretResult(null, '').outcome, 'notfound');
});
test('addPast dedupes and caps', () => {
  let l = addPast([], { q: 'a  b', outcome: 'found' });
  l = addPast(l, { q: 'A B', outcome: 'overruled' });
  assert.equal(l.length, 1); assert.equal(l[0].outcome, 'overruled');
  assert.equal(normalizeInput('  x   y '), 'x y');
  for (let i = 0; i < 12; i++) l = addPast(l, { q: `q${i}` });
  assert.equal(l.length, 8);
});
