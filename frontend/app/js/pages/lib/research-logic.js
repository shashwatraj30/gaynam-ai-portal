// Pure logic for the Research page (no DOM). Search request per docs/API_V3_CONTRACT.md POST /api/search:
// body {query, court:'ALL'|name, judge, precedent_status, sort, year_from, year_to, offset, limit}; response adds
// total, offset, filters_relaxed. Section filters stay client-side; they are also appended to the query so the
// engine's IPC-section detection can rank on them.
import { yearOf } from './judgment-logic.js';
import { csvCell } from './audit-logic.js';

export const COURTS = ['Supreme Court', 'Rajasthan', 'Gujarat', 'Bombay', 'Telangana', 'Uttarakhand', 'Chhattisgarh', 'Delhi', 'Allahabad', 'Madras', 'Calcutta', 'Karnataka', 'Kerala', 'Punjab'];
export const SORTS = ['bench', 'relevance', 'newest', 'oldest'];
export const DEFAULT_SORT = 'bench';
export const normSort = (s) => (SORTS.includes(s) ? s : DEFAULT_SORT);
export const sortLabelKey = (s) => `rs.sort.${normSort(s)}`;
export const STATUS_FILTERS = ['ALL', 'OVERRULED', 'DISTINGUISHED', 'FOLLOWED'];
export const SEARCH_LIMIT = 30;
export const HISTORY_MAX = 30;

// Short labels for the chips under the search card (SAMPLES = the original queries, LANDMARKS = benchmark authorities).
export const SAMPLES = [
  { label: 'NI Act s.139', q: 'Section 139 presumption NI Act' }, { label: 'Bail 438/439', q: 'bail 438 439' },
  { label: 'Cheating 420', q: 'cheating 420' }, { label: 'Dowry 498A', q: 'dowry 498A' },
];
export const LANDMARKS = [
  { label: 'Natural justice (ECIL)', q: 'natural justice ECIL Karunakar inquiry report' },
  { label: 'Privacy (Puttaswamy)', q: 'right to privacy Puttaswamy' },
  { label: 'Section 139 (Rangappa)', q: 'Rangappa Mohan section 139 presumption' },
  { label: 'Alternative remedy (Whirlpool)', q: 'Whirlpool alternative remedy writ' },
  { label: 'Patent illegality (arbitration)', q: 'patent illegality arbitration award' },
];
export const CHIPS = [...LANDMARKS, ...SAMPLES];

/** "302, 34 IPC; 498A" -> ['302','34','498A'] */
export function parseSections(text) {
  const out = [];
  for (const m of String(text || '').toUpperCase().matchAll(/\b(\d{1,4}[A-Z]{0,2})\b/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export function emptyFilters() { return { court: 'ALL', status: 'ALL', judge: '', yearFrom: '', yearTo: '', sections: '', sort: DEFAULT_SORT }; }

export function activeFilterCount(f) {
  let n = 0;
  if (f.court && f.court !== 'ALL') n++;
  if (f.status && f.status !== 'ALL') n++;
  if (String(f.judge || '').trim()) n++;
  if (f.yearFrom || f.yearTo) n++;
  if (parseSections(f.sections).length) n++;
  return n;
}

export function buildSearchBody(q, f = emptyFilters(), offset = 0) {
  const secs = parseSections(f.sections);
  const base = String(q || '').trim();
  const query = secs.length ? `${base} ${secs.map((s) => `section ${s}`).join(' ')}`.trim() : base;
  const body = { query, court: f.court || 'ALL', judge: String(f.judge || '').trim(), precedent_status: f.status || 'ALL', sort: normSort(f.sort), limit: SEARCH_LIMIT, offset: Number(offset) || 0 };
  if (Number(f.yearFrom)) body.year_from = Number(f.yearFrom);
  if (Number(f.yearTo)) body.year_to = Number(f.yearTo);
  return body;
}

// ---- URL <-> filters (shareable searches) ----
/** (q, filters) -> 'q=..&court=..' (defaults omitted). */
export function filtersToQuery(q, f = emptyFilters()) {
  const p = new URLSearchParams();
  const put = (k, v) => { const x = String(v ?? '').trim(); if (x) p.set(k, x); };
  put('q', q);
  if (f.court && f.court !== 'ALL') put('court', f.court);
  if (f.status && f.status !== 'ALL') put('status', f.status);
  put('judge', f.judge); put('yf', f.yearFrom); put('yt', f.yearTo); put('secs', f.sections);
  if (normSort(f.sort) !== DEFAULT_SORT) put('sort', f.sort);
  return p.toString();
}
/** URLSearchParams | string -> {q, filters}; unknown values fall back to defaults. */
export function queryToFilters(src) {
  const p = src instanceof URLSearchParams ? src : new URLSearchParams(String(src || '').replace(/^[#?]/, ''));
  const f = emptyFilters();
  const status = String(p.get('status') || 'ALL').toUpperCase();
  f.court = p.get('court') || 'ALL';
  f.status = STATUS_FILTERS.includes(status) ? status : 'ALL';
  f.judge = p.get('judge') || '';
  const yr = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1000 && n <= 2200 ? String(n) : ''; };
  f.yearFrom = yr(p.get('yf')); f.yearTo = yr(p.get('yt'));
  f.sections = p.get('secs') || '';
  f.sort = normSort(p.get('sort'));
  return { q: (p.get('q') || '').trim(), filters: f };
}
export const searchHref = (q, f) => `#/research?${filtersToQuery(q, f)}`;

// ---- saved searches: {id, name, query, filters} ----
export function savedSearchBody(name, q, f) {
  return { name: String(name || '').trim().slice(0, 80), query: String(q || '').trim(), filters: { ...emptyFilters(), ...f } };
}
export function savedSearchHref(item) {
  const fl = item && item.filters && typeof item.filters === 'object' ? item.filters : {};
  return searchHref(item && item.query, { ...emptyFilters(), ...fl });
}

// ---- courts select ----
/** api.courts() response -> select options with 'ALL' first; null/empty -> the static list. */
export function courtOptions(resp, allLabel = 'All courts', fmtCount = (n) => String(n)) {
  const items = Array.isArray(resp && resp.items) ? resp.items.filter((i) => i && i.court) : [];
  const rest = items.length
    ? items.map((i) => ({ value: i.court, label: i.count != null ? `${i.label || i.court} (${fmtCount(i.count)})` : (i.label || i.court) }))
    : COURTS.map((c) => ({ value: c, label: c }));
  return [{ value: 'ALL', label: allLabel }, ...rest];
}

// ---- paging ----
/** Append a page without duplicates (by id). */
export function mergePage(prev, next) {
  const seen = new Set((prev || []).map((r) => r.id));
  return [...(prev || []), ...(next || []).filter((r) => !seen.has(r.id))];
}
export const hasMore = (loaded, total) => Number.isFinite(Number(total)) && Number(total) > loaded;

// ---- CSV export ----
export const RESULT_CSV_COLUMNS = [['title', 'Title'], ['court', 'Court'], ['date', 'Date'], ['citation', 'Citation'], ['status', 'Status'], ['bench', 'Bench'], ['url', 'URL']];
export function resultsCsv(rows) {
  const lines = [RESULT_CSV_COLUMNS.map(([, l]) => l).join(',')];
  for (const r of rows || []) {
    const rec = {
      title: r.title, court: r.court, date: r.judgment_date || r.year || '', citation: r.citation || r.cnr_number || '',
      status: r.precedent_status || '', bench: r.bench_label || r.bench || '', url: r.source_pdf_url || (r.id != null ? `#/judgments/${r.id}` : ''),
    };
    lines.push(RESULT_CSV_COLUMNS.map(([k]) => csvCell(rec[k])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

// ---- hand-off to the drafting flow ----
/** intakeParams to store when none exist yet; null when the user already has params (never overwritten). */
export function draftHandoff(brief, existing) {
  if (existing && typeof existing === 'object' && Object.keys(existing).length) return null;
  return { authorities: (brief || []).map((b) => ({ ...b })), source: 'research', is_sample: false, confirmed_issues: false };
}
export const draftTarget = (can) => (can && can('DRAFT_FULL') ? '#/drafts/new' : '#/matters/new');

export function matchesSections(row, secs) {
  if (!secs.length) return true;
  const hay = ` ${[row.statutes_considered, row.title, row.headnote].filter(Boolean).join(' ').toUpperCase()} `;
  return secs.some((s) => new RegExp(`(?<![0-9A-Z])${s}(?![0-9A-Z])`).test(hay));
}

/** Client-side pass (years re-checked, sections applied). When the server relaxed the filters nothing is hidden. */
export function filterResults(rows, f = emptyFilters(), { relaxed = false } = {}) {
  if (relaxed) return rows || [];
  const from = Number(f.yearFrom) || 0; const to = Number(f.yearTo) || 0;
  const secs = parseSections(f.sections);
  return (rows || []).filter((r) => {
    if (from || to) {
      const y = yearOf(r);
      if (y == null || (from && y < from) || (to && y > to)) return false;
    }
    return matchesSections(r, secs);
  });
}

/** Bench-strength sort only: overruled authorities go to the end (stable). Other sorts keep the server's order. */
export function orderResults(rows, sort = DEFAULT_SORT) {
  if (normSort(sort) !== 'bench') return rows;
  const isO = (r) => String(r.precedent_status || '').toUpperCase() === 'OVERRULED';
  return [...rows.filter((r) => !isO(r)), ...rows.filter(isO)];
}

// ---- past questions (this browser's session history) ----
export function addHistory(list, entry, now = Date.now(), max = HISTORY_MAX) {
  const q = String(entry.q || '').trim();
  if (!q) return list || [];
  const rest = (list || []).filter((e) => e.q.toLowerCase() !== q.toLowerCase());
  return [{ q, at: now, count: entry.count ?? null }, ...rest].slice(0, max);
}
/** Group by calendar day: today / yesterday / earlier. */
export function groupHistory(list, now = Date.now()) {
  const day = (ts) => { const d = new Date(ts); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  const today = day(now);
  const groups = { today: [], yesterday: [], earlier: [] };
  for (const e of list || []) {
    const diff = Math.round((today - day(e.at)) / 86400000);
    (diff <= 0 ? groups.today : diff === 1 ? groups.yesterday : groups.earlier).push(e);
  }
  return groups;
}
