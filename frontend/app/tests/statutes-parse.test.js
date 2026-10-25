// Table-driven tests for parseSections / describeSection in statutes-kb.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSections, describeAll, describeSection } from '../js/pages/lib/statutes-kb.js';

const nums = (t) => parseSections(t).map((x) => `${x.act || '-'}:${x.num}`);

const POSITIVE = [
  // (a) act after the number, no "section" word
  ['420 IPC', ['ipc:420']],
  ['302 I.P.C.', ['ipc:302']],
  ['The accused is charged under 420 IPC.', ['ipc:420']],
  ['25/27 Arms Act', ['arms:25', 'arms:27']],
  ['Sections 302 IPC, 420 IPC', ['ipc:302', 'ipc:420']],
  // (b) lists, the act applies to every number
  ['sections 341, 420 and 34 IPC', ['ipc:341', 'ipc:420', 'ipc:34']],
  ['Sections 341, 420, and 34 IPC', ['ipc:341', 'ipc:420', 'ipc:34']],
  ['Sections 25 and 27 of the Arms Act', ['arms:25', 'arms:27']],
  ['IPC 341, 420 and 34', ['ipc:341', 'ipc:420', 'ipc:34']],
  ['302 r/w 34 IPC', ['ipc:302', 'ipc:34']],
  ['Sections 302 read with 34 of the Indian Penal Code, 1860', ['ipc:302', 'ipc:34']],
  // (c) abbreviations
  ['u/s 138 N.I. Act', ['ni:138']],
  ['Sec. 138 of NI Act', ['ni:138']],
  ['S. 302 IPC', ['ipc:302']],
  ['Section 302/34 IPC', ['ipc:302', 'ipc:34']],
  ['u/s 138/141 NI Act', ['ni:138', 'ni:141']],
  ['Section 498A IPC', ['ipc:498A']],
  ['Section 25(1)(a) of the Arms Act', ['arms:25']],
  // (d) procedure codes and new codes are not IPC
  ['Section 438 CrPC', ['crpc:438']],
  ['Section 438 Cr.P.C.', ['crpc:438']],
  ['Section 438 of the Code of Criminal Procedure, 1973', ['crpc:438']],
  ['482 Cr.P.C', ['crpc:482']],
  ['Section 103 BNS', ['bns:103']],
  ['Section 103(1) B.N.S.', ['bns:103']],
  ['Section 482 BNSS', ['bnss:482']],
  ['Sections 482 and 528 of the Bharatiya Nagarik Suraksha Sanhita', ['bnss:482', 'bnss:528']],
  ['Section 11 CPC', ['cpc:11']],
  ['Section 302 IPC and Section 482 CrPC', ['ipc:302', 'crpc:482']],
];
for (const [text, want] of POSITIVE) {
  test(`parseSections: ${text}`, () => assert.deepEqual(nums(text), want));
}

const NEGATIVE = [
  // (e) plain numbers are not sections
  'Crl. Case No. 341/2020 was filed',
  'Complaint Case 341/2020 IPC',
  'The year 2020 and 1999',
  'The amount was Rs. 420 IPC fee',
  'He paid 1,000 IPC',
  'Rs. 5,000 under the Arms Act',
  'FIR No. 45 IPC',
  'Order 39 Rule 1 CPC',
  'Order 7 Rules 1 and 11 CPC',
  'Arms Act, 1959',
  'Arms Act, 1959 and 25 others',
  'the 5th IPC',
  'There were 25 persons',
  '',
  'no sections here',
];
for (const text of NEGATIVE) {
  test(`parseSections negative: "${text}"`, () => assert.deepEqual(nums(text), []));
}

test('parseSections: never guesses an act when none is named', () => {
  assert.deepEqual(nums('Section 11 of the decree'), ['-:11']);
  assert.deepEqual(nums('Sections 302 and 34'), ['-:302', '-:34']);
});
test('parseSections: ranges are flagged, not expanded; slash is two sections, not a range', () => {
  const r = parseSections('Sections 302 to 304 IPC');
  assert.deepEqual(r.map((x) => [x.num, x.inRange]), [['302', true], ['304', true]]);
  assert.ok(parseSections('302/34 IPC').every((x) => !x.inRange));
});
test('parseSections: dedupes across forms', () => {
  assert.deepEqual(nums('420 IPC. Section 420 IPC. u/s 420 of the IPC'), ['ipc:420']);
});
test('describeAll: unknown sections stay known:false, known ones keep their act', () => {
  const d = describeAll(parseSections('Section 138 NI Act, 420 IPC, 9999 IPC, 103 BNS'));
  assert.deepEqual(d.map((x) => [x.num, x.act, x.known]), [['138', 'ni', false], ['420', 'ipc', true], ['9999', 'ipc', false], ['103', 'bns', false]]);
});
test('describeAll: CrPC 420 is not described as IPC 420', () => {
  assert.equal(describeAll(parseSections('420 CrPC'))[0].known, false);
});

// ---- unsupported acts, glued acts, trailing act-less numbers ----
test('unsupported act is reported as that act, never IPC', () => {
  for (const t of ['Section 420 of the Companies Act', 'Section 420 of the Companies Act, 1956', 'Companies Act Section 420', '420 Companies Act']) {
    const p = parseSections(t);
    assert.equal(p.length, 1, t);
    assert.equal(p[0].act, null);
    assert.match(p[0].actText, /^Companies Act/);
    const d = describeAll(p)[0];
    assert.equal(d.known, false);
    assert.equal(d.unsupportedAct, true);
    assert.match(d.actLabel, /^Companies Act/);
    assert.ok(!d.actNotStated && !d.assumedAct);
  }
});
test('unsupported act does not swallow neighbouring supported sections', () => {
  const d = describeAll(parseSections('Section 420 of the Companies Act and Section 302 IPC'));
  assert.deepEqual(d.map((x) => [x.num, x.act, !!x.unsupportedAct]), [['420', null, true], ['302', 'ipc', false]]);
  assert.equal(d[1].known, true);
});
test('describeSection: explicit unsupported act text is never looked up as IPC', () => {
  const d = describeSection('420', 'Companies Act');
  assert.deepEqual([d.known, d.act, d.unsupportedAct, d.actLabel], [false, null, true, 'Companies Act']);
});
test('act-less section keeps the explicit assumed-IPC flag', () => {
  const d = describeAll(parseSections('Section 420'))[0];
  assert.deepEqual([d.known, d.actNotStated, d.assumedAct], [true, true, true]);
  const u = describeAll(parseSections('Section 9999'))[0];
  assert.deepEqual([u.known, u.actNotStated], [false, true]);
});
test('no space between number and act: 34IPC, 302IPC, 420CrPC', () => {
  assert.deepEqual(nums('34IPC'), ['ipc:34']);
  assert.deepEqual(nums('302IPC'), ['ipc:302']);
  assert.deepEqual(nums('420CrPC'), ['crpc:420']);
  assert.deepEqual(nums('Sections 302IPC, 34IPC'), ['ipc:302', 'ipc:34']);
});
test('Sections 302 IPC and 420: 420 stays act-less and is labelled act not stated', () => {
  assert.deepEqual(nums('Sections 302 IPC and 420'), ['ipc:302', '-:420']);
  const d = describeAll(parseSections('Sections 302 IPC and 420'));
  assert.equal(d[0].actNotStated, false);
  assert.equal(d[1].actNotStated, true);
  assert.equal(parseSections('Sections 302 IPC and 420')[1].act, null);
  assert.equal(d[1].assumedAct, true);
  assert.deepEqual(nums('Sections 302 IPC and 420 CrPC'), ['ipc:302', 'crpc:420']);
  assert.deepEqual(nums('Sections 302 IPC and 25 persons'), ['ipc:302']);
});
test('Evidence Act, 1872 Section 65B -> evidence act (supported act, no KB rows)', () => {
  assert.deepEqual(nums('Evidence Act, 1872 Section 65B'), ['evidence:65B']);
  assert.deepEqual(nums('Section 65B of the Indian Evidence Act, 1872'), ['evidence:65B']);
  const d = describeAll(parseSections('Evidence Act, 1872 Section 65B'))[0];
  assert.deepEqual([d.known, d.act, !!d.unsupportedAct], [false, 'evidence', false]);
});
test('"341,420" without a space stays a thousands separator (not two sections)', () => {
  assert.deepEqual(nums('Sections 341,420 IPC'), []);
  assert.deepEqual(nums('341,420 IPC'), []);
  assert.deepEqual(nums('Sections 341, 420 IPC'), ['ipc:341', 'ipc:420']);
});
