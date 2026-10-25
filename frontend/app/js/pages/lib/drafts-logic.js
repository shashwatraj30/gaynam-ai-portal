// Pure logic for the Drafts list. No DOM access.
import { normalizeDraftStatus } from '../../ui/status.js';

export const FILTERS = ['all', 'DRAFT', 'IN_REVIEW', 'BENCH_APPROVED', 'FINAL_SEALED', 'RETURNED'];
export function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({ ...r, status: normalizeDraftStatus(r.status) }));
}
export function countByStatus(rows) {
  const c = { all: rows.length };
  FILTERS.slice(1).forEach((s) => { c[s] = 0; });
  rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
  return c;
}
export function filterDrafts(rows, { status = 'all', query = '' } = {}) {
  const q = String(query).trim().toLowerCase();
  return rows.filter((r) => (status === 'all' || r.status === status)
    && (!q || `${r.case_title || ''} ${r.case_number || ''} ${r.id}`.toLowerCase().includes(q)));
}
export function validFilter(s) { return FILTERS.includes(s) ? s : 'all'; }
/** Row action: where it goes and which label key to show. */
export function rowAction(row) {
  switch (row.status) {
    case 'DRAFT': case 'RETURNED': return { href: `#/drafts/${row.id}`, key: 'open' };
    case 'FINAL_SEALED': return { href: `#/drafts/${row.id}/review`, key: 'view' };
    default: return { href: `#/drafts/${row.id}/review`, key: 'review' };
  }
}
