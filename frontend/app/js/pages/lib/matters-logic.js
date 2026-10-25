// Pure logic for the Matters list and Matter pages (no DOM access; unit-tested in tests/matters.test.js).
// Statuses come from the server already canonical (DRAFT, IN_REVIEW, RETURNED, BENCH_APPROVED, FINAL_SEALED).

/** Filter groups shown on the Matters list, keyed by the latest draft's status ("next action"). */
export const STATUS_GROUPS = [
  { id: 'all', statuses: null },
  { id: 'ready', statuses: ['BENCH_APPROVED'] },
  { id: 'review', statuses: ['IN_REVIEW'] },
  { id: 'drafting', statuses: ['DRAFT', 'RETURNED'] },
  { id: 'signed', statuses: ['FINAL_SEALED'] },
];

const LEGACY = { CHAMBER_REVIEW: 'IN_REVIEW', UNDER_REVIEW: 'IN_REVIEW', SIGNED: 'FINAL_SEALED' };
export function canonStatus(s) {
  const k = String(s || 'DRAFT').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return LEGACY[k] || k;
}

/** Group id ('ready'|'review'|'drafting'|'signed') for a status; unknown statuses count as drafting. */
export function statusGroup(status) {
  const k = canonStatus(status);
  const g = STATUS_GROUPS.find((x) => x.statuses && x.statuses.includes(k));
  return g ? g.id : 'drafting';
}

/** i18n key for the next-action sentence of a status. */
export function nextActionKey(status) {
  switch (canonStatus(status)) {
    case 'IN_REVIEW': return 'matters.next.review';
    case 'RETURNED': return 'matters.next.returned';
    case 'BENCH_APPROVED': return 'matters.next.ready';
    case 'FINAL_SEALED': return 'matters.next.signed';
    default: return 'matters.next.drafting';
  }
}

export function groupCounts(matters = []) {
  const out = { all: matters.length, ready: 0, review: 0, drafting: 0, signed: 0 };
  for (const m of matters) out[statusGroup(m.latest_status)] += 1;
  return out;
}

const norm = (s) => String(s || '').toLowerCase();
export function matterHaystack(m) {
  return [m.title, m.case_number, m.court, m.petitioner, m.respondent, m.matter_key].map(norm).join(' \n ');
}

export function filterMatters(matters = [], { q = '', group = 'all' } = {}) {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  return matters.filter((m) => {
    if (group !== 'all' && statusGroup(m.latest_status) !== group) return false;
    if (!terms.length) return true;
    const hay = matterHaystack(m);
    return terms.every((t) => hay.includes(t));
  });
}

/** Newest activity first; matters without a date go last. Does not mutate. */
export function sortMatters(matters = []) {
  return matters.slice().sort((a, b) => String(b.last_updated || '').localeCompare(String(a.last_updated || '')));
}

/** Heading for a matter: case number plus title when both exist; never invents text. */
export function matterHeading(m) {
  const num = (m.case_number || '').trim();
  const title = (m.title || '').trim();
  if (num && title) return { primary: num, secondary: title };
  return { primary: num || title || m.matter_key || '', secondary: '' };
}

// ---- history events ----
export const EVENT_FILTERS = ['all', 'research', 'drafts', 'documents', 'approvals'];
const CATS = {
  research: ['SEARCH_QUERY', 'VIEW_JUDGMENT', 'VERIFY_CITATION'],
  drafts: ['GENERATE_DRAFT_JUDGMENT', 'SAVE_DRAFT', 'UPDATE_DRAFT', 'PRINT_JUDGMENT', 'EXPORT_DOCX'],
  documents: ['UPLOAD_PLEADING', 'OCR_PROCESSED_BRIEF'],
  approvals: ['DRAFT_STATUS_UPDATED'],
};
export function eventCategory(action) {
  const a = String(action || '').toUpperCase();
  for (const [cat, list] of Object.entries(CATS)) if (list.includes(a)) return cat;
  return 'other';
}
export function eventTitleKey(action) {
  const a = String(action || '').toUpperCase();
  return Object.values(CATS).flat().includes(a) ? `matter.event.${a}` : null;
}
export function humanizeAction(action) {
  const s = String(action || '').replace(/_/g, ' ').toLowerCase().trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
export function filterEvents(events = [], filter = 'all') {
  if (filter === 'all') return events.slice();
  return events.filter((e) => eventCategory(e.action) === filter);
}
export function eventCounts(events = []) {
  const out = { all: events.length, research: 0, drafts: 0, documents: 0, approvals: 0 };
  for (const e of events) { const c = eventCategory(e.action); if (c in out) out[c] += 1; }
  return out;
}
/** Is the acting user known? Pre-B2 rows are not (plan 13.2: show "user not recorded"). */
export function userRecorded(e) { return !!(e && e.user_recorded && e.user); }

/** Newest first, grouped by calendar day: [{day:'2026-10-16', events:[...]}]. */
export function groupEventsByDay(events = []) {
  const sorted = events.slice().sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')) || (b.id || 0) - (a.id || 0));
  const out = [];
  for (const e of sorted) {
    const day = String(e.timestamp || '').slice(0, 10);
    const last = out[out.length - 1];
    if (last && last.day === day) last.events.push(e); else out.push({ day, events: [e] });
  }
  return out;
}
export function timeOf(ts) {
  const m = /[ T](\d{2}:\d{2})/.exec(String(ts || ''));
  return m ? m[1] : '';
}

/** Where a draft opens: review page once it is in or past review, otherwise the Studio. */
export function draftHref(draft) {
  const s = canonStatus(draft && draft.status);
  const id = encodeURIComponent(draft && draft.id);
  return s === 'IN_REVIEW' || s === 'BENCH_APPROVED' || s === 'FINAL_SEALED' ? `#/drafts/${id}/review` : `#/drafts/${id}`;
}
export function matterHref(key) { return `#/matters/${encodeURIComponent(key)}`; }

/** Most recent timestamp across drafts and events (for "Last activity"). */
export function lastActivity(matter) {
  const ts = [];
  (matter.drafts || []).forEach((d) => d.date_created && ts.push(d.date_created));
  (matter.events || []).forEach((e) => e.timestamp && ts.push(e.timestamp));
  return ts.sort().pop() || null;
}
