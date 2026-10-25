// Pure logic for the Research page (no DOM). Search request per backend/server.py /api/search:
// body {query, court:'ALL'|name, judge, precedent_status:'ALL'|..., limit}. Year and section filters are applied
// client-side because the endpoint has no such parameters; sections are also appended to the query so the
// engine's IPC-section detection can rank on them.
import { yearOf } from './judgment-logic.js';

export const COURTS = ['Supreme Court', 'Rajasthan', 'Gujarat', 'Bombay', 'Telangana', 'Uttarakhand', 'Chhattisgarh', 'Delhi', 'Allahabad', 'Madras', 'Calcutta', 'Karnataka', 'Kerala', 'Punjab'];
export const STATUS_FILTERS = ['ALL', 'OVERRULED', 'DISTINGUISHED', 'FOLLOWED'];
export const SEARCH_LIMIT = 30;
export const HISTORY_MAX = 30;

/** "302, 34 IPC; 498A" -> ['302','34','498A'] */
export function parseSections(text) {
  const out = [];
  for (const m of String(text || '').toUpperCase().matchAll(/\b(\d{1,4}[A-Z]{0,2})\b/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export function emptyFilters() { return { court: 'ALL', status: 'ALL', judge: '', yearFrom: '', yearTo: '', sections: '' }; }

export function activeFilterCount(f) {
  let n = 0;
  if (f.court && f.court !== 'ALL') n++;
  if (f.status && f.status !== 'ALL') n++;
  if (String(f.judge || '').trim()) n++;
  if (f.yearFrom || f.yearTo) n++;
  if (parseSections(f.sections).length) n++;
  return n;
}

export function buildSearchBody(q, f = emptyFilters()) {
  const secs = parseSections(f.sections);
  const base = String(q || '').trim();
  const query = secs.length ? `${base} ${secs.map((s) => `section ${s}`).join(' ')}`.trim() : base;
  return { query, court: f.court || 'ALL', judge: String(f.judge || '').trim(), precedent_status: f.status || 'ALL', limit: SEARCH_LIMIT };
}

export function matchesSections(row, secs) {
  if (!secs.length) return true;
  const hay = ` ${[row.statutes_considered, row.title, row.headnote].filter(Boolean).join(' ').toUpperCase()} `;
  return secs.some((s) => new RegExp(`(?<![0-9A-Z])${s}(?![0-9A-Z])`).test(hay));
}

export function filterResults(rows, f = emptyFilters()) {
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

/** Overruled authorities go to the end; otherwise the server's bench-strength order is kept (stable). */
export function orderResults(rows) {
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
