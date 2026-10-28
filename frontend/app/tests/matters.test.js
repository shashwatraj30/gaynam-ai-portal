import test from 'node:test';
import assert from 'node:assert/strict';
import {
  statusGroup, groupCounts, filterMatters, sortMatters, matterHeading, nextActionKey, eventCategory, filterEvents,
  eventCounts, groupEventsByDay, timeOf, draftHref, lastActivity, userRecorded, humanizeAction, eventTitleKey,
  matterDocuments, documentHref, newDocumentHref, confirmedIssues, researchQuery, researchHref,
} from '../js/pages/lib/matters-logic.js';
import en from '../js/i18n/pages/matters.en.js';
import hi from '../js/i18n/pages/matters.hi.js';
import mEn from '../js/i18n/pages/matter.en.js';
import mHi from '../js/i18n/pages/matter.hi.js';
import iEn from '../js/i18n/pages/intake.en.js';
import iHi from '../js/i18n/pages/intake.hi.js';

const M = [
  { matter_key: 'a', case_number: 'FIR No. 06/17', title: 'State v. X', court: 'ACJM Barrackpore', latest_status: 'BENCH_APPROVED', last_updated: '2026-10-16 10:00' },
  { matter_key: 'b', case_number: 'WP 1/2023', title: 'P v. R', court: 'High Court', latest_status: 'DRAFT', last_updated: '2026-10-18 09:00' },
  { matter_key: 'c', case_number: null, title: 'Old', court: null, latest_status: 'SIGNED', last_updated: null },
];

test('status groups and next action', () => {
  assert.equal(statusGroup('BENCH_APPROVED'), 'ready');
  assert.equal(statusGroup('CHAMBER_REVIEW'), 'review');
  assert.equal(statusGroup('RETURNED'), 'drafting');
  assert.equal(statusGroup('SIGNED'), 'signed');
  assert.equal(statusGroup('weird'), 'drafting');
  assert.equal(nextActionKey('IN_REVIEW'), 'matters.next.review');
  assert.deepEqual(groupCounts(M), { all: 3, ready: 1, review: 0, drafting: 1, signed: 1 });
});
test('filter and sort', () => {
  assert.equal(filterMatters(M, { q: 'barrackpore' }).length, 1);
  assert.equal(filterMatters(M, { q: 'p v. r high' }).length, 1);
  assert.equal(filterMatters(M, { group: 'drafting' })[0].matter_key, 'b');
  assert.equal(filterMatters(M, { q: 'nope' }).length, 0);
  assert.deepEqual(sortMatters(M).map((m) => m.matter_key), ['b', 'a', 'c']);
});
test('heading never invents text', () => {
  assert.deepEqual(matterHeading(M[0]), { primary: 'FIR No. 06/17', secondary: 'State v. X' });
  assert.deepEqual(matterHeading({ title: 'T', matter_key: 'k' }), { primary: 'T', secondary: '' });
});
test('events: category, filter, day grouping', () => {
  const ev = [
    { id: 1, timestamp: '2026-10-16 23:31:00', action: 'SAVE_DRAFT', user_recorded: false },
    { id: 2, timestamp: '2026-10-16 00:02:00', action: 'SEARCH_QUERY', user_recorded: true, user: 'A' },
    { id: 3, timestamp: '2026-10-14 00:09:00', action: 'DRAFT_STATUS_UPDATED' },
    { id: 4, timestamp: '2026-10-13 20:10:00', action: 'OCR_PROCESSED_BRIEF' },
  ];
  assert.equal(eventCategory('SAVE_DRAFT'), 'drafts');
  assert.equal(eventCategory('SSO_LOGIN'), 'other');
  assert.equal(filterEvents(ev, 'approvals').length, 1);
  assert.deepEqual(eventCounts(ev), { all: 4, research: 1, drafts: 1, documents: 1, approvals: 1 });
  const g = groupEventsByDay(ev);
  assert.deepEqual(g.map((x) => x.day), ['2026-10-16', '2026-10-14', '2026-10-13']);
  assert.equal(g[0].events[0].id, 1);
  assert.equal(timeOf('2026-10-16 23:31:00'), '23:31');
  assert.equal(userRecorded(ev[0]), false);
  assert.equal(userRecorded(ev[1]), true);
  assert.equal(eventTitleKey('SAVE_DRAFT'), 'matter.event.SAVE_DRAFT');
  assert.equal(eventTitleKey('SSO_LOGIN'), null);
  assert.equal(humanizeAction('SSO_LOGIN'), 'Sso login');
});
test('draft links and last activity', () => {
  assert.equal(draftHref({ id: 5, status: 'DRAFT' }), '#/drafts/5');
  assert.equal(draftHref({ id: 5, status: 'IN_REVIEW' }), '#/drafts/5/review');
  assert.equal(lastActivity({ drafts: [{ date_created: '2026-10-01' }], events: [{ timestamp: '2026-10-05 10:00' }] }), '2026-10-05 10:00');
  assert.equal(lastActivity({}), null);
});
test('Hindi has every English key for the three pages', () => {
  for (const [e, hh] of [[en, hi], [mEn, mHi], [iEn, iHi]]) {
    assert.deepEqual(Object.keys(e).sort(), Object.keys(hh).sort());
  }
});

test('matter documents and research link', () => {
  const m = { case_number: 'WP 1/2024', documents: [
    { id: 3, status: 'READ', extraction: { issues: ['draft?'] } },
    { id: 4, status: 'CONFIRMED', extraction: { confirmed: true, issues: [' Is it valid? ', ''] } },
    { id: 5, status: 'ARCHIVED' }] };
  assert.deepEqual(matterDocuments(m).map((d) => d.id), [3, 4]);
  assert.deepEqual(matterDocuments({}), []);
  assert.equal(documentHref({ id: 4 }), '#/documents/4');
  assert.equal(newDocumentHref('WP 1/2024'), '#/matters/new?matter=WP%201%2F2024');
  assert.deepEqual(confirmedIssues(m), ['Is it valid?']);
  assert.equal(researchQuery(m), 'Is it valid?');
  assert.equal(researchQuery({ case_number: 'WP 1/2024', documents: [{ id: 1, status: 'READ' }] }), 'WP 1/2024');
  assert.equal(researchHref({}), '#/research');
  assert.equal(researchHref({ case_number: 'A B' }), '#/research?q=A%20B');
});
