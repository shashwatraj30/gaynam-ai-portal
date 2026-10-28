import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from '../js/pages/lib/home-logic.js';

test('kpiTiles shows only fields present for the role', () => {
  assert.deepEqual(H.kpiTiles({ total_judgments: 10, supreme_court_count: 4, high_court_count: 6 }).map((k) => k.id),
    ['total_judgments', 'supreme_court_count', 'high_court_count']);
  const all = H.kpiTiles({ total_judgments: 1, searches_performed: 0, drafts_created: 2, other: 5 });
  assert.deepEqual(all.map((k) => k.id), ['total_judgments', 'searches_performed', 'drafts_created']);
  assert.equal(all[1].value, 0);
  assert.deepEqual(H.kpiTiles(null), []);
});

test('quickLaunch is permission filtered', () => {
  const can = (set) => (p) => set.includes(p);
  assert.deepEqual(H.quickLaunch(can(['SEARCH'])).map((i) => i.id), ['research', 'verify']);
  assert.deepEqual(H.quickLaunch(can(['DRAFT_FULL'])).map((i) => i.id), ['upload', 'draft']);
  assert.deepEqual(H.quickLaunch(can([])), []);
  assert.equal(H.quickLaunch(can(['UPLOAD_PLEADING']))[0].route, '/documents');
});

test('metrics distributions and simulated sync detection', () => {
  const m = { top_courts: [{ court: 'A', c: 3 }], status_counts: { GOOD_LAW: 5, OVERRULED: 1 } };
  assert.equal(H.metricsCourtRows(m).length, 1);
  assert.deepEqual(H.metricsStatusRows(m).map((r) => r.precedent_status), ['GOOD_LAW', 'OVERRULED']);
  assert.deepEqual(H.metricsStatusRows({}), []);
  assert.equal(H.isSimulatedSync({ mode: 'simulated' }), true);
  assert.equal(H.isSimulatedSync({ sync_state: { mode: 'simulated' } }), true);
  assert.equal(H.isSimulatedSync([{ mode: 'simulated' }]), true);
  assert.equal(H.isSimulatedSync({ mode: 'live' }), false);
  assert.equal(H.isSimulatedSync(null), false);
});
