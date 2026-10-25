// Number/date formatting (en-IN). Never format inline elsewhere. Pure module: no DOM access.
// formatNumber(118096) -> "1,18,096"; formatDate('2026-10-24') -> "24 Oct 2026"
const NUM = new Intl.NumberFormat('en-IN');
const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const DATETIME = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
const REL = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const DASH = '—';

export function toDate(d) {
  if (d == null || d === '') return null;
  if (d instanceof Date) return isNaN(d) ? null : d;
  if (typeof d === 'number') { const x = new Date(d); return isNaN(x) ? null : x; }
  const s = String(d).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]); // date-only: local, avoids tz shift
  m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}(:\d{2})?)$/.exec(s);
  const x = new Date(m ? `${m[1]}T${m[2]}` : s);
  return isNaN(x) ? null : x;
}
export function formatNumber(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return DASH;
  return NUM.format(Number(n));
}
export function formatDate(d) { const x = toDate(d); return x ? DATE.format(x) : DASH; }
export function formatDateTime(d) {
  const x = toDate(d);
  return x ? DATETIME.format(x).replace(/\b(am|pm)\b/, (v) => v.toUpperCase()) : DASH;
}
export function formatRelative(d, now = Date.now()) {
  const x = toDate(d);
  if (!x) return DASH;
  const diff = (x.getTime() - now) / 1000;
  if (Math.abs(diff) < 45) return REL.format(0, 'second');
  const steps = [['minute', 60, 60], ['hour', 3600, 24], ['day', 86400, 30], ['month', 2592000, 12]];
  for (const [unit, sec, limit] of steps) {
    const v = Math.round(diff / sec);
    if (Math.abs(v) < limit) return REL.format(v, unit);
  }
  return REL.format(Math.round(diff / 31536000), 'year');
}
export function plural(n, one, many) {
  return `${formatNumber(n)} ${Number(n) === 1 ? one : many}`;
}
