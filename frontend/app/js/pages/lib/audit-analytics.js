// Pure aggregation for the Audit "Reports & Analytics" tab (no DOM). Rows: {timestamp,user_name,user_role,action,...}.
import { isUserRecorded } from './audit-logic.js';

export const NOT_RECORDED = '';

function tally(rows, keyFn) {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r); m.set(k, (m.get(k) || 0) + 1); }
  return m;
}
function rank(m) {
  return [...m.entries()].map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
}

/** Count rows per action; sorted by count desc then name. -> [{key,count}] */
export function byAction(rows = []) {
  return rank(tally(rows, (r) => r.action || '-'));
}

/** Count rows per user. Unrecorded identities share one bucket with key ''. */
export function byUser(rows = []) {
  return rank(tally(rows, (r) => (isUserRecorded(r) ? String(r.user_name).trim() : NOT_RECORDED)));
}

export function distinctUsers(rows = []) {
  return new Set(rows.filter(isUserRecorded).map((r) => String(r.user_name).trim())).size;
}

export function topN(list = [], n = 8) {
  return list.slice(0, Math.max(0, n));
}

const DAY_MS = 86400000;
function toUtcDay(today) {
  if (today instanceof Date) return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  return new Date(`${String(today).slice(0, 10)}T00:00:00Z`);
}

/** Events per calendar day for the `days` days ending at `today` (Date or 'YYYY-MM-DD'), oldest first, zero-filled.
 *  A row's day is the first 10 characters of its timestamp, matching the Activity tab's date handling. */
export function byDay(rows = [], today = new Date(), days = 14) {
  const end = toUtcDay(today);
  const out = [];
  const idx = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end.getTime() - i * DAY_MS).toISOString().slice(0, 10);
    idx.set(day, out.length); out.push({ day, count: 0 });
  }
  for (const r of rows) {
    const i = idx.get(String(r.timestamp || '').slice(0, 10));
    if (i !== undefined) out[i].count += 1;
  }
  return out;
}

export function summarize(rows = [], today = new Date()) {
  return { total: rows.length, users: distinctUsers(rows), actions: byAction(rows), usersRank: byUser(rows), days: byDay(rows, today) };
}

/** Flat CSV text of the aggregates. `labels` may override headings and section names. */
export function analyticsCsv(s, labels = {}) {
  const cell = (v) => {
    let x = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(x)) x = `'${x}`;
    return `"${x.replace(/"/g, '""')}"`;
  };
  const L = { section: 'Section', key: 'Item', count: 'Events', totals: 'Totals', action: 'By action', user: 'By user', day: 'By day', events: 'Total events', users: 'Distinct users', notRecorded: 'User not recorded', ...labels };
  const lines = [[L.section, L.key, L.count].map(cell).join(',')];
  lines.push([L.totals, L.events, s.total].map(cell).join(','));
  lines.push([L.totals, L.users, s.users].map(cell).join(','));
  s.actions.forEach((a) => lines.push([L.action, a.key, a.count].map(cell).join(',')));
  s.usersRank.forEach((u) => lines.push([L.user, u.key === NOT_RECORDED ? L.notRecorded : u.key, u.count].map(cell).join(',')));
  s.days.forEach((d) => lines.push([L.day, d.day, d.count].map(cell).join(',')));
  return `${lines.join('\n')}\n`;
}
