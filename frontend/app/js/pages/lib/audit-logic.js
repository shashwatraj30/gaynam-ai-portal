// Pure logic for the Audit trail page (no DOM).
// audit_logs rows: {id,timestamp,user_name,user_role,action,details,ip_address}
// ledger blocks: {id,timestamp,user_name,user_role,action,details,ip_address,prev_hash,current_hash}
// verify: {status:'VERIFIED_SECURE'|'VALID'|'CORRUPTED', total_blocks_verified?, total_blocks?, latest_block_hash?, compromised_block_id?, message?}

export const KNOWN_ACTIONS = [
  'SSO_LOGIN', 'SEARCH_QUERY', 'VIEW_JUDGMENT', 'GENERATE_DRAFT_JUDGMENT', 'VERIFY_CITATION', 'OCR_PROCESSED_BRIEF',
  'SAVE_DRAFT', 'SYNC_TRIGGERED', 'UPLOAD_PLEADING', 'PRINT_JUDGMENT', 'EXPORT_DOCX', 'DRAFT_STATUS_UPDATED', 'UPDATE_DRAFT', 'ADMIN_TOGGLE_USER',
];

// Until backend B2 ships, every row carries a placeholder identity. These are shown as "user not recorded".
const PLACEHOLDER_USERS = new Set(['', 'unknown', 'anonymous', "hon'ble user (nluj)", "hon'ble judicial user", 'hon’ble user (nluj)']);

export function isUserRecorded(row) {
  const n = String(row?.user_name ?? '').trim().toLowerCase();
  return !PLACEHOLDER_USERS.has(n);
}

export function humanizeAction(a) {
  const s = String(a || '').toLowerCase().replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** Query params for api.auditLogs; empty values are dropped. */
export function buildAuditParams({ action, user, q, since, limit = 200 } = {}) {
  const p = {};
  if (action && action !== 'ALL') p.action = action;
  if (user && user.trim()) p.user = user.trim();
  if (q && q.trim()) p.q = q.trim();
  if (since) p.since = since;
  if (limit) p.limit = limit;
  return p;
}

/** Client-side filter (the server may ignore params today, so the page always applies this too). */
export function filterAuditRows(rows = [], f = {}) {
  const user = String(f.user || '').trim().toLowerCase();
  const q = String(f.q || '').trim().toLowerCase();
  const since = f.since ? String(f.since) : '';
  return rows.filter((r) => {
    if (f.action && f.action !== 'ALL' && r.action !== f.action) return false;
    if (user && !`${r.user_name || ''} ${r.user_role || ''}`.toLowerCase().includes(user)) return false;
    if (q && !`${r.action || ''} ${r.details || ''} ${r.user_name || ''}`.toLowerCase().includes(q)) return false;
    if (since && String(r.timestamp || '').slice(0, 10) < since) return false;
    return true;
  });
}

export function distinctActions(rows = []) {
  return [...new Set([...KNOWN_ACTIONS, ...rows.map((r) => r.action).filter(Boolean)])].sort();
}

export function shortHash(h, n = 8) {
  const s = String(h || '');
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** CSV cell with RFC 4180 quoting and spreadsheet formula-injection guard. */
export function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export const AUDIT_CSV_COLUMNS = [
  ['id', 'Log_ID'], ['timestamp', 'Timestamp'], ['user_name', 'User_Name'], ['user_role', 'User_Role'],
  ['action', 'Action'], ['details', 'Details'], ['ip_address', 'IP_Address'],
];
export function toCsv(rows = [], columns = AUDIT_CSV_COLUMNS) {
  const lines = [columns.map(([, label]) => label).join(',')];
  for (const r of rows) lines.push(columns.map(([k]) => csvCell(r[k])).join(','));
  return `${lines.join('\n')}\n`;
}

/** Normalise the ledger-verify payload to {state:'ok'|'bad'|'empty', count, hash, blockId, message}. */
export function verifySummary(r) {
  const st = String(r?.status || '').toUpperCase();
  if (st === 'VERIFIED_SECURE') return { state: 'ok', count: r.total_blocks_verified ?? r.total_blocks ?? 0, hash: r.latest_block_hash || null, blockId: null, message: r.message || '' };
  if (st === 'VALID') return { state: 'empty', count: r.total_blocks ?? 0, hash: null, blockId: null, message: r.message || '' };
  return { state: 'bad', count: 0, hash: null, blockId: r?.compromised_block_id ?? null, message: r?.message || '' };
}

/** Sync history may be an array or {history:[...]}. */
export function normalizeSync(res) {
  const list = Array.isArray(res) ? res : (res?.history || res?.logs || []);
  return list.map((r) => ({
    id: r.id, timestamp: r.timestamp, court: r.court, ingested: Number(r.cases_ingested ?? 0),
    durationMs: Number(r.duration_ms ?? 0), status: String(r.status || '').toUpperCase(), details: r.details || '',
  }));
}

export function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '—';
  return n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1)} s`;
}
