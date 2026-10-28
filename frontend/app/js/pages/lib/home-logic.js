// Pure helpers for the Home page (no DOM access). Plan §5.2 and §6 (only reliable fields are used).

export function homeVariant(role) {
  switch (String(role || '').toUpperCase()) {
    case 'JUDICIAL_USER': case 'HON_JUSTICE': return 'judicial';
    case 'RESEARCHER': case 'LAW_CLERK': return 'researcher';
    case 'FACULTY': case 'STUDENT': case 'NLU_SCHOLAR': return 'academic';
    case 'ADMINISTRATOR': case 'REGISTRAR_NLUJ': return 'admin';
    case 'AUDITOR': return 'auditor';
    default: return 'academic';
  }
}

export function greetingKey(hour) {
  const h = Number(hour);
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
}

const ORDER = ['BENCH_APPROVED', 'RETURNED', 'IN_REVIEW', 'DRAFT', 'FINAL_SEALED'];
const realMatters = (matters) => (Array.isArray(matters) ? matters : []).filter((m) => m && !m.is_placeholder && m.matter_key);

/** Real matters only (placeholders such as "unfiled" are dropped), ordered by next action, then recency. */
export function sortMatters(matters, max = 5) {
  const rank = (m) => { const i = ORDER.indexOf(m.latest_status); return i < 0 ? ORDER.length : i; };
  return realMatters(matters)
    .map((m, i) => ({ m, i }))
    .sort((a, b) => rank(a.m) - rank(b.m)
      || String(b.m.last_updated || '').localeCompare(String(a.m.last_updated || '')) || a.i - b.i)
    .map((x) => x.m)
    .slice(0, max);
}

export function matterCounts(matters) {
  const real = realMatters(matters);
  return {
    total: real.length,
    ready: real.filter((m) => m.latest_status === 'BENCH_APPROVED').length,
    open: real.filter((m) => m.latest_status !== 'FINAL_SEALED').length,
  };
}

/** The alert that most needs attention: critical first, otherwise the first one. null when none. */
export function pickAttention(payload) {
  const list = Array.isArray(payload) ? payload : (payload?.alerts || []);
  if (!list.length) return null;
  return list.find((a) => a.severity === 'critical') || list[0];
}

export function alertCount(payload) {
  const list = Array.isArray(payload) ? payload : (payload?.alerts || []);
  return list.length;
}

/** Ledger verification -> {state:'ok'|'broken'|'unknown', blocks, message} */
export function summarizeLedger(v) {
  if (!v || typeof v !== 'object') return { state: 'unknown', blocks: null, message: '' };
  const s = String(v.status || '').toUpperCase();
  const blocks = v.total_blocks_verified ?? v.total_blocks ?? null;
  if (s === 'VERIFIED_SECURE' || s === 'VALID') return { state: 'ok', blocks, message: v.message || '' };
  if (s === 'CORRUPTED') return { state: 'broken', blocks, message: v.message || '' };
  return { state: 'unknown', blocks, message: v.message || '' };
}

/** audit rows -> timeline events (time is passed through; the page formats it). */
export function activityEvents(rows, n = 6) {
  return (Array.isArray(rows) ? rows : []).slice(0, n).map((r) => ({
    time: r.timestamp || '',
    title: String(r.action || '').replace(/_/g, ' ').toLowerCase(),
    detail: r.details ? String(r.details).slice(0, 140) : '',
    user: r.user_name || '',
  }));
}

export function lastSyncTimestamp(status) {
  return status?.sync_state?.last_sync_timestamp || status?.last_sync_timestamp || null;
}

/** Sync history rows (real log entries only). */
export function syncRows(history, n = 5) {
  return (Array.isArray(history) ? history : []).slice(0, n).map((r) => ({
    when: r.timestamp, court: r.court, ingested: Number(r.cases_ingested) || 0, status: String(r.status || ''),
  }));
}

export function userSummary(payload) {
  const list = Array.isArray(payload?.users) ? payload.users : [];
  return { total: list.length, active: list.filter((u) => String(u.status || 'ACTIVE').toUpperCase() === 'ACTIVE').length };
}

/** "PRECEDENT_STATUS" / null -> readable label; empty -> '' (the page shows its "unknown" label). */
export function normalizeLabel(raw) {
  const s = String(raw ?? '').replace(/[_\s]+/g, ' ').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Distribution rows [{<key>, c}] -> bars. Drops rows with no positive count, merges rows with the same label,
 * sorts by count desc, keeps the top n. `pct` is share of the whole (all valid rows, not just the top n);
 * `width` is relative to the largest bar (0-100) so the longest bar fills the track.
 * Returns {bars:[{label,count,pct,width,known}], total, shown, more}. Never throws on null/garbage.
 */
export function shapeDistribution(rows, key, n = 8) {
  const merged = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const count = Number(r?.c);
    if (!r || !Number.isFinite(count) || count <= 0) continue;
    const label = key === 'precedent_status' ? normalizeLabel(r[key]) : String(r[key] ?? '').trim();
    merged.set(label, (merged.get(label) || 0) + count);
  }
  const all = [...merged.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const total = all.reduce((s, r) => s + r.count, 0);
  const top = all.slice(0, Math.max(0, n));
  const max = top.length ? top[0].count : 0;
  const bars = top.map((r) => ({
    label: r.label, known: r.label !== '', count: r.count,
    pct: total ? Math.round((r.count / total) * 1000) / 10 : 0,
    width: max ? Math.max(1, Math.round((r.count / max) * 100)) : 0,
  }));
  return { bars, total, shown: top.length, more: all.length - top.length };
}

/** Indexed total from /api/status; null when absent or not a positive number. */
export function indexedTotal(status) {
  const n = Number(status?.total_judgments_indexed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** True when a sync payload (status or history) says it is simulated, so the UI never implies a live court connection. */
export function isSimulatedSync(p) {
  const m = (x) => String(x?.mode ?? '').toLowerCase() === 'simulated';
  if (!p) return false;
  return m(p) || m(p.sync_state) || (Array.isArray(p) && p.some(m)) || (Array.isArray(p?.history) && p.history.some(m));
}

const KPI_FIELDS = [
  ['total_judgments', 'home.kpi.total'], ['supreme_court_count', 'home.kpi.sc'], ['high_court_count', 'home.kpi.hc'],
  ['searches_performed', 'home.kpi.searches'], ['drafts_created', 'home.kpi.drafts'],
];
/** KPI tiles from /api/dashboard_metrics: only fields the backend sent for this role (numbers), in a fixed order. */
export function kpiTiles(m) {
  if (!m || typeof m !== 'object') return [];
  return KPI_FIELDS.filter(([k]) => m[k] != null && Number.isFinite(Number(m[k])))
    .map(([k, labelKey]) => ({ id: k, labelKey, value: Number(m[k]) }));
}

const LAUNCH = [
  { id: 'upload', route: '/documents', labelKey: 'home.launch.upload', icon: 'upload', permission: ['UPLOAD_PLEADING', 'DRAFT_FULL'] },
  { id: 'research', route: '/research', labelKey: 'home.launch.research', icon: 'search', permission: 'SEARCH' },
  { id: 'verify', route: '/judgments/check', labelKey: 'home.launch.verify', icon: 'scale', permission: ['VERIFY_CITATION', 'SEARCH'] },
  { id: 'draft', route: '/drafts', labelKey: 'home.launch.draft', icon: 'edit', permission: 'DRAFT_FULL' },
];
/** Quick-launch tiles the user may use (permission string or "any of" array). */
export function quickLaunch(can) {
  return LAUNCH.filter((i) => (Array.isArray(i.permission) ? i.permission.some((p) => can(p)) : can(i.permission)));
}

/** dashboard_metrics -> rows for shapeDistribution: courts [{court,c}], status {name: n} -> [{precedent_status,c}]. */
export function metricsCourtRows(m) { return Array.isArray(m?.top_courts) ? m.top_courts : []; }
export function metricsStatusRows(m) {
  const s = m?.status_counts;
  return s && typeof s === 'object' ? Object.entries(s).map(([k, c]) => ({ precedent_status: k, c })) : [];
}
