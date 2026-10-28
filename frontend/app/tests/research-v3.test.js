import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchBody, emptyFilters, filtersToQuery, queryToFilters, sortLabelKey, normSort, orderResults, filterResults, courtOptions, COURTS, mergePage, hasMore,
  resultsCsv, savedSearchBody, savedSearchHref, draftHandoff, draftTarget, CHIPS,
} from '../js/pages/lib/research-logic.js';

test('url <-> filters round trip', () => {
  const f = { ...emptyFilters(), court: 'Delhi', status: 'OVERRULED', judge: 'Sharma', yearFrom: '2000', yearTo: '2010', sort: 'newest' };
  const qs = filtersToQuery('bail law', f);
  assert.equal(qs, 'q=bail+law&court=Delhi&status=OVERRULED&judge=Sharma&yf=2000&yt=2010&sort=newest');
  assert.deepEqual(queryToFilters(qs), { q: 'bail law', filters: f });
  assert.equal(filtersToQuery('x', emptyFilters()), 'q=x');
});
test('queryToFilters sanitises junk', () => {
  const r = queryToFilters('?q=%20a&status=zzz&sort=bad&yf=abc&yt=99999');
  assert.equal(r.q, 'a'); assert.equal(r.filters.status, 'ALL'); assert.equal(r.filters.sort, 'bench');
  assert.equal(r.filters.yearFrom, ''); assert.equal(r.filters.yearTo, '');
  assert.equal(queryToFilters(new URLSearchParams('court=Bombay')).filters.court, 'Bombay');
});
test('sort labels and body fields', () => {
  assert.equal(sortLabelKey('newest'), 'rs.sort.newest'); assert.equal(sortLabelKey('nope'), 'rs.sort.bench'); assert.equal(normSort('oldest'), 'oldest');
  const b = buildSearchBody('x', { ...emptyFilters(), sort: 'oldest', yearFrom: '1990', yearTo: '2000' }, 60);
  assert.equal(b.sort, 'oldest'); assert.equal(b.year_from, 1990); assert.equal(b.year_to, 2000); assert.equal(b.offset, 60);
  assert.ok(!('year_from' in buildSearchBody('x')));
});
test('only bench sort moves overruled last; relaxed shows everything', () => {
  const rows = [{ id: 1, precedent_status: 'OVERRULED' }, { id: 2 }];
  assert.deepEqual(orderResults(rows, 'bench').map((r) => r.id), [2, 1]);
  assert.deepEqual(orderResults(rows, 'newest').map((r) => r.id), [1, 2]);
  assert.equal(filterResults([{ id: 1, year: 1900 }], { ...emptyFilters(), yearFrom: '2000' }, { relaxed: true }).length, 1);
});
test('courtOptions uses the API list, else the static one', () => {
  const o = courtOptions({ items: [{ court: 'Supreme Court of India', label: 'Supreme Court', count: 12 }] }, 'All', (n) => `#${n}`);
  assert.deepEqual(o, [{ value: 'ALL', label: 'All' }, { value: 'Supreme Court of India', label: 'Supreme Court (#12)' }]);
  assert.equal(courtOptions(null).length, COURTS.length + 1);
  assert.equal(courtOptions({ items: [] })[0].value, 'ALL');
});
test('paging helpers', () => {
  assert.deepEqual(mergePage([{ id: 1 }], [{ id: 1 }, { id: 2 }]).map((r) => r.id), [1, 2]);
  assert.equal(hasMore(30, 100), true); assert.equal(hasMore(30, 30), false); assert.equal(hasMore(30, null), false);
});
test('csv export quotes cells and guards formulas', () => {
  const csv = resultsCsv([{ id: 5, title: 'A "v" B, C', court: 'SC', judgment_date: '2010-01-02', citation: '(2010) 1 SCC 1', precedent_status: 'FOLLOWED', bench_label: '5-Judge', source_pdf_url: 'http://x/p.pdf' },
    { id: 6, title: '=cmd()', court: '' }]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'Title,Court,Date,Citation,Status,Bench,URL');
  assert.equal(lines[1], '"A ""v"" B, C","SC","2010-01-02","(2010) 1 SCC 1","FOLLOWED","5-Judge","http://x/p.pdf"');
  assert.ok(lines[2].startsWith('"\'=cmd()"'));
  assert.ok(lines[2].endsWith('"#/judgments/6"'));
});
test('saved search body and href', () => {
  const b = savedSearchBody('  My search ', ' q ', { ...emptyFilters(), court: 'Delhi' });
  assert.equal(b.name, 'My search'); assert.equal(b.query, 'q'); assert.equal(b.filters.court, 'Delhi');
  assert.equal(savedSearchHref({ query: 'q', filters: { court: 'Delhi', sort: 'newest' } }), '#/research?q=q&court=Delhi&sort=newest');
  assert.equal(savedSearchHref({ query: 'q' }), '#/research?q=q');
});
test('draft hand-off never overwrites intakeParams', () => {
  const brief = [{ id: 1, title: 'A' }];
  assert.deepEqual(draftHandoff(brief, undefined).authorities, brief);
  assert.equal(draftHandoff(brief, undefined).source, 'research');
  assert.equal(draftHandoff(brief, { case_title: 'x' }), null);
  assert.notEqual(draftHandoff(brief, {}), null);
  assert.equal(draftTarget((p) => p === 'DRAFT_FULL'), '#/drafts/new');
  assert.equal(draftTarget(() => false), '#/matters/new');
});
test('landmark chips have labels', () => { assert.ok(CHIPS.length >= 9 && CHIPS.every((c) => c.label && c.q)); });
