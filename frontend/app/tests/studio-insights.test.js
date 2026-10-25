// Pure logic for the Studio insight panels: section parsing, built-in lookup, query building, merge/dedupe, why-derivation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSections, describeSection, describeAll } from '../js/pages/lib/statutes-kb.js';
import {
  sectionSource, pickSearchSections, buildSectionQuery, buildSearchBody, sectionsKey, mergeResults, createLatest, excerpt, deriveWhy,
  MAX_SECTIONS, numberIsOnlyCaseNo,
} from '../js/pages/lib/studio-insights.js';

const nums = (t) => parseSections(t).map((x) => `${x.act || '-'}:${x.num}`);

test('parseSections: IPC list with and', () => {
  assert.deepEqual(nums('IPC 341, 420 and 34'), ['ipc:341', 'ipc:420', 'ipc:34']);
});
test('parseSections: Section N then act, and long act name', () => {
  assert.deepEqual(nums('Section 138 NI Act'), ['ni:138']);
  assert.deepEqual(nums('Section 498A of the Indian Penal Code, 1860'), ['ipc:498A']);
});
test('parseSections: dedupe keeps first order; no act is dropped when the same number has one', () => {
  assert.deepEqual(nums('Sections 302 and 34 IPC. Also section 302 IPC and s. 34'), ['ipc:302', 'ipc:34']);
  assert.deepEqual(nums('Section 420. Later IPC 420'), ['ipc:420']);
});
test('parseSections: ranges are not expanded, years are ignored, no sections gives []', () => {
  const r = parseSections('u/s 302 to 304 IPC');
  assert.deepEqual(r.map((x) => x.num), ['302', '304']);
  assert.ok(r.every((x) => x.inRange));
  assert.deepEqual(nums('Arms Act, 1959'), []);
  assert.deepEqual(nums('The petition was filed in 2020 by the owner'), []);
  assert.deepEqual(parseSections(''), []);
  assert.deepEqual(parseSections(null), []);
});
test('parseSections: unnamed act stays null', () => {
  assert.deepEqual(nums('Section 11 of the decree'), ['-:11']);
});

test('describeSection: known IPC section', () => {
  const d = describeSection('420', 'ipc');
  assert.equal(d.known, true);
  assert.match(d.title, /Cheating/);
  assert.equal(d.assumedAct, false);
  assert.ok(d.penalty && d.nature);
});
test('describeSection: no act hint assumes IPC and says so; lower case number is normalised', () => {
  const d = describeSection('498a', null);
  assert.equal(d.known, true);
  assert.equal(d.assumedAct, true);
  assert.equal(d.num, '498A');
});
test('describeSection: unknown never invents a meaning', () => {
  const a = describeSection('138', 'ni');
  assert.deepEqual(a, { known: false, num: '138', act: 'ni', actLabel: 'Negotiable Instruments Act, 1881' });
  const b = describeSection('9999', 'ipc');
  assert.equal(b.known, false);
  assert.equal(b.title, undefined);
  assert.equal(describeSection('302', 'bns').known, false); // IPC numbers must not be reused for another act
  assert.equal(describeSection('toString', 'ipc').known, false);
});
test('describeSection: Arms Act sections 25 and 27', () => {
  assert.equal(describeSection('25', 'arms').known, true);
  assert.equal(describeSection('25', 'arms').bns, '');
});
test('describeAll keeps order and flags', () => {
  const rows = describeAll(parseSections('IPC 341 and 9999'));
  assert.deepEqual(rows.map((r) => [r.num, r.known]), [['341', true], ['9999', false]]);
});

test('sectionSource joins provisions, section 8 and facts', () => {
  const s = sectionSource({ statutory_provisions: 'IPC 341', facts: 'F' }, { section_8_statutory_provisions: 'S8' });
  assert.equal(s, 'IPC 341\nS8\nF');
});

test('pickSearchSections caps at 4 and reports the rest', () => {
  const p = parseSections('IPC 1, 2, 3, 4, 5, 6');
  const r = pickSearchSections(p);
  assert.equal(r.picked.length, MAX_SECTIONS);
  assert.equal(r.more, 2);
});

test('query building', () => {
  assert.equal(buildSectionQuery({ num: '420', act: 'ipc' }), 'Section 420 IPC');
  assert.equal(buildSectionQuery({ num: '138', act: 'ni' }), 'Section 138 NI Act');
  assert.equal(buildSectionQuery({ num: '11', act: null }), 'Section 11');
  assert.deepEqual(buildSearchBody({ num: '34', act: 'ipc' }), { query: 'Section 34 IPC', court: 'ALL', judge: '', precedent_status: 'ALL', limit: 6 });
  assert.equal(sectionsKey([{ num: '1', act: 'ipc' }, { num: '2', act: null }]), 'ipc:1|:2');
});

test('mergeResults dedupes by id, notes every matching section, overruled last', () => {
  const a = { id: 1, title: 'A', precedent_status: 'OVERRULED' };
  const b = { id: 2, title: 'B', precedent_status: 'FOLLOWED' };
  const c = { id: 3, title: 'C' };
  const out = mergeResults([
    { sec: { num: '420', act: 'ipc' }, results: [a, b] },
    { sec: { num: '34', act: 'ipc' }, results: [b, c, null, {}] },
  ]);
  assert.deepEqual(out.map((r) => r.id), [2, 3, 1]);
  assert.deepEqual(out[0].matchedSections, ['Section 420 IPC', 'Section 34 IPC']);
  assert.deepEqual(mergeResults([{ sec: { num: '1', act: null }, results: undefined }]), []);
});

test('createLatest ignores stale tokens', () => {
  const l = createLatest();
  const t1 = l.next(); const t2 = l.next();
  assert.equal(l.isCurrent(t1), false);
  assert.equal(l.isCurrent(t2), true);
  l.invalidate();
  assert.equal(l.isCurrent(t2), false);
});

test('excerpt trims long text on a boundary', () => {
  assert.equal(excerpt('  short   text '), 'short text');
  const long = `${'Word '.repeat(300)}`;
  const e = excerpt(long, 100);
  assert.ok(e.length <= 104 && e.endsWith('...'));
  assert.equal(excerpt(null), '');
});

test('deriveWhy: only sections 11, 13, 14 from the draft', () => {
  const texts = { section_11_discussion_reasoning: 'Reasoning here.', section_13_findings_on_issues: '', section_14_conclusion_disposition: 'Appeal allowed.', section_3_introduction: 'ignored' };
  const w = deriveWhy({ texts, engine: 'gemini-2.5', precedents: [] });
  assert.deepEqual(w.excerpts.map((x) => x.n), [11, 14]);
  assert.equal(w.template, false);
  assert.deepEqual(w.curated, []);
});
test('deriveWhy: template fallback is flagged', () => {
  const w = deriveWhy({ texts: { section_11_discussion_reasoning: 'x' }, engine: 'template_fallback', precedents: [] });
  assert.equal(w.template, true);
});
test('deriveWhy: non-curated ratio is never used; curated is, once', () => {
  const precedents = [
    { id: 1, title: 'T', ratio_decidendi: 'Template ratio', is_curated: false, citation: 'X' },
    { id: 2, title: 'Landmark', ratio_decidendi: 'Real ratio.', is_curated: true, citation: 'AIR 1' },
    { id: 2, title: 'Landmark', ratio_decidendi: 'Real ratio.', is_curated: true, citation: 'AIR 1' },
    { id: 3, title: 'Empty', ratio_decidendi: '  ', is_curated: true },
    { id: 4, title: 'Truthy only', ratio_decidendi: 'r', is_curated: 'true' },
  ];
  const w = deriveWhy({ texts: {}, engine: '', precedents });
  assert.deepEqual(w.curated.map((c) => c.id), [2]);
  assert.equal(w.curated[0].ratio, 'Real ratio.');
  assert.deepEqual(w.excerpts, []);
});

test('numberIsOnlyCaseNo drops rows where the number is only a case number', () => {
  const sec = { num: '341', act: 'IPC' };
  assert.equal(numberIsOnlyCaseNo({ title: 'CMP.M/341/2020 of NARESH KUMAR Vs RENU SHARMA' }, sec), true);
  assert.equal(numberIsOnlyCaseNo({ title: 'State v. X (Section 341 IPC) 2019' }, sec), false);
  assert.equal(numberIsOnlyCaseNo({ title: 'Some Case' }, sec), false);
  const merged = mergeResults([{ sec, results: [{ id: 1, title: 'WP(C)/341/2022 of A Vs B' }, { id: 2, title: 'Real Case on wrongful restraint' }] }]);
  assert.deepEqual(merged.map((r) => r.id), [2]);
});
