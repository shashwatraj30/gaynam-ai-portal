// Pure logic for the Alerts page (no DOM). Payload: GET /api/alerts
//   {alerts:[{id,draft_id,matter_key,case_number,case_title,draft_status,overruled_case:{id,title,citation},
//             overruled_by,found_in,severity:'critical'|'warning',date_created}], total}

const SEV_RANK = { critical: 0, warning: 1 };

export function normSeverity(s) {
  const k = String(s || '').toLowerCase();
  return k === 'critical' || k === 'warning' ? k : 'warning';
}

/** Critical first, then newest first, then id. */
export function sortAlerts(list = []) {
  return list.slice().sort((a, b) => {
    const r = SEV_RANK[normSeverity(a.severity)] - SEV_RANK[normSeverity(b.severity)];
    if (r) return r;
    const da = Date.parse(String(a.date_created || '').replace(' ', 'T')) || 0;
    const db = Date.parse(String(b.date_created || '').replace(' ', 'T')) || 0;
    if (da !== db) return db - da;
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  });
}

/** i18n key suffix and chip tone for a severity. */
export function severityChip(sev) {
  return normSeverity(sev) === 'critical' ? { key: 'critical', tone: 'danger' } : { key: 'warning', tone: 'warn' };
}

/** Where in the draft the overruled authority was found. Unknown values fall back to 'other'. */
export function foundInKey(found) {
  const k = String(found || '').toLowerCase();
  if (k.includes('verified')) return 'verified';
  if (k.includes('retrieved') || k.includes('precedent')) return 'retrieved';
  if (k.includes('section') || k.includes('text')) return 'section';
  return 'other';
}

export function summarize(alerts = []) {
  let critical = 0; let warning = 0;
  for (const a of alerts) { if (normSeverity(a.severity) === 'critical') critical += 1; else warning += 1; }
  return { total: alerts.length, critical, warning };
}

export const alertHref = (a) => `#/alerts/${encodeURIComponent(a.id)}`;
export const studioHref = (a) => `#/drafts/${encodeURIComponent(a.draft_id)}`;
export const matterHref = (a) => (a.matter_key ? `#/matters/${encodeURIComponent(a.matter_key)}` : null);
export const judgmentHref = (id) => (id != null ? `#/judgments/${encodeURIComponent(id)}` : null);
export const researchHref = (text) => `#/research?q=${encodeURIComponent(String(text || ''))}`;

/** Hand-off payload stored under store key 'alertTarget' so the studio can mark the affected citation. */
export function buildAlertTarget(a) {
  return {
    alertId: a.id,
    draftId: a.draft_id,
    matterKey: a.matter_key || null,
    citation: a.overruled_case?.citation || null,
    overruledCaseId: a.overruled_case?.id ?? null,
    overruledTitle: a.overruled_case?.title || null,
    overruledBy: a.overruled_by || null,
    foundIn: a.found_in || null,
  };
}

/** From the overruled case's graph, the id of the judgment that overruled it (or null). */
export function findOverrulingId(graph, overruledId) {
  const e = (graph?.edges || []).find((x) => x.relation === 'overruled_by' && String(x.source) === String(overruledId));
  if (!e) return null;
  const n = (graph?.nodes || []).find((x) => String(x.id) === String(e.target));
  return n && n.in_corpus !== false ? n.id : null;
}

export function pickAlert(alerts, id) {
  return alerts.find((a) => String(a.id) === String(id)) || null;
}
