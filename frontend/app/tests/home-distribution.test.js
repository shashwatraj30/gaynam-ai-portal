import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeDistribution, normalizeLabel, indexedTotal } from '../js/pages/lib/home-logic.js';

test('normalizeLabel', () => {
  assert.equal(normalizeLabel('GOOD_LAW'), 'Good law');
  assert.equal(normalizeLabel(null), '');
  assert.equal(normalizeLabel('  '), '');
});

test('shapeDistribution top-N, pct, width, sorting', () => {
  const rows = [{ court: 'A', c: 50 }, { court: 'B', c: 25 }, { court: 'C', c: 25 }, { court: 'D', c: 0 }, null];
  const r = shapeDistribution(rows, 'court', 2);
  assert.equal(r.total, 100);
  assert.equal(r.shown, 2);
  assert.equal(r.more, 1);
  assert.deepEqual(r.bars.map((b) => [b.label, b.count, b.pct, b.width]), [['A', 50, 50, 100], ['B', 25, 25, 50]]);
});

test('shapeDistribution merges normalised labels and flags unknown', () => {
  const r = shapeDistribution([{ precedent_status: 'GOOD_LAW', c: 3 }, { precedent_status: 'good law', c: 2 }, { precedent_status: null, c: 1 }], 'precedent_status');
  assert.equal(r.bars[0].label, 'Good law');
  assert.equal(r.bars[0].count, 5);
  assert.equal(r.bars[1].known, false);
});

test('shapeDistribution handles null/empty', () => {
  for (const v of [null, undefined, [], 'x', [{ c: 'abc' }]]) {
    assert.deepEqual(shapeDistribution(v, 'court'), { bars: [], total: 0, shown: 0, more: 0 });
  }
});

test('indexedTotal', () => {
  assert.equal(indexedTotal({ total_judgments_indexed: 118000 }), 118000);
  assert.equal(indexedTotal({ total_judgments_indexed: 0 }), null);
  assert.equal(indexedTotal(null), null);
});
