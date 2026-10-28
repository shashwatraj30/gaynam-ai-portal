// Pure logic for the Citation check page. Response of POST /api/verify_single_citation:
// {status: VERIFIED_ACTIVE|OVERRULED_WARNING|DISTINGUISHED(_CAUTION)|HALLUCINATED_OR_UNVERIFIED|UNVERIFIED_EXTERNAL, verified, message, case_data|null}
// The server `message` says "Active & Good Law" for default rows; we never show it (P9) and compose our own wording.
import { csvCell } from './audit-logic.js';

export const SAMPLES = ['(2017) 10 SCC 1', '(1976) 2 SCC 521', '(1993) 4 SCC 727', '(2008) 4 SCC 54', '(2010) 11 SCC 441'];

const FORMATS = [
  ['SCC OnLine', /SCC\s*OnLine/i], ['SCC', /\bSCC\b/i], ['AIR', /\bAIR\b/i], ['SCR', /\bSCR\b/i],
  ['INSC', /INSC/i], ['RLW', /\bRLW\b/i], ['CNR', /^[A-Z]{4}\d{12}$/],
];
export function detectFormat(text) {
  const s = String(text || '').trim();
  for (const [name, re] of FORMATS) if (re.test(s)) return name;
  return null;
}

export function normalizeInput(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }

/** Past checks kept for this browser session (newest first, unique). */
export function addPast(list, entry, max = 8) {
  const q = normalizeInput(entry.q);
  if (!q) return list || [];
  return [{ q, outcome: entry.outcome }, ...(list || []).filter((e) => e.q.toLowerCase() !== q.toLowerCase())].slice(0, max);
}

/** -> {outcome:'overruled'|'distinguished'|'found'|'notfound', caseData, overruledBy, checks:[{id,state,detail?}]} */
export function interpretResult(res, input) {
  const c = res?.case_data || res?.case || null;
  const status = String(res?.status || '').toUpperCase();
  const fmt = detectFormat(input);
  const checks = [{ id: 'format', state: fmt ? 'pass' : 'unchecked', detail: fmt || '' }];
  if (!c || status.startsWith('UNVERIFIED') || status.startsWith('HALLUCINATED')) {
    checks.push({ id: 'found', state: 'fail' }, { id: 'treatment', state: 'unchecked' });
    return { outcome: 'notfound', caseData: null, overruledBy: '', checks };
  }
  const ps = String(c.precedent_status || '').toUpperCase();
  const overruled = status === 'OVERRULED_WARNING' || ps === 'OVERRULED';
  const distinguished = !overruled && (status.startsWith('DISTINGUISHED') || ps === 'DISTINGUISHED');
  checks.push({ id: 'found', state: 'pass' });
  checks.push({ id: 'treatment', state: overruled ? 'fail' : distinguished ? 'pending' : 'pass' });
  checks.push({ id: 'quote', state: 'unchecked' });
  return {
    outcome: overruled ? 'overruled' : distinguished ? 'distinguished' : 'found',
    caseData: c, overruledBy: c.overruled_by || res?.overruled_by || '', checks,
  };
}

// ---- sample chips with case names, and the document check (v3) ----
export const SAMPLE_NAMES = {
  '(2017) 10 SCC 1': 'Puttaswamy', '(1976) 2 SCC 521': 'ADM Jabalpur', '(1993) 4 SCC 727': 'ECIL',
  '(2008) 4 SCC 54': 'Krishna Janardhan Bhat', '(2010) 11 SCC 441': 'Rangappa',
};
/** "(2017) 10 SCC 1 - Puttaswamy". Whether it is overruled is resolved live on click, not asserted here. */
export const sampleLabel = (c) => (SAMPLE_NAMES[c] ? `${c} - ${SAMPLE_NAMES[c]}` : c);

export const DOC_ACCEPT = '.txt,.pdf,.docx';
export const DOC_EXTS = ['txt', 'pdf', 'docx'];
export const fileExt = (name) => (String(name || '').match(/\.([A-Za-z0-9]+)$/) || [, ''])[1].toLowerCase();
export const isTextFile = (name) => fileExt(name) === 'txt';
export const isSupportedDoc = (name) => DOC_EXTS.includes(fileExt(name));

/** Verdict chip kind from a citation_verifier status (never "good law"). */
export function verdictOf(status) {
  const s = String(status || '').toUpperCase();
  if (s.startsWith('OVERRULED')) return 'overruled';
  if (s.startsWith('DISTINGUISHED')) return 'distinguished';
  if (s.startsWith('UNVERIFIED') || s.startsWith('HALLUCINATED') || s === 'NOT_FOUND') return 'notfound';
  if (s) return 'found';
  return 'unknown';
}

/**
 * Rows for the document table from either a Document extraction ({authorities:[{citation,status,matched_title,matched_id,source_pdf_url}]})
 * or the verify_citations response (array, or {results|citations|items:[...]}, entries like {citation,status,case_data}).
 */
export function documentCitationRows(src) {
  let list = [];
  if (Array.isArray(src)) list = src;
  else if (Array.isArray(src?.authorities)) list = src.authorities;
  else if (Array.isArray(src?.extraction?.authorities)) list = src.extraction.authorities;
  else if (src) list = src.verifications || src.results || src.citations || src.items || [];
  const seen = new Set();
  const rows = [];
  for (const a of list) {
    const citation = String(a?.citation || a?.text || '').trim();
    if (!citation) continue;
    const key = citation.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const c = a.case_data || a.case || null;
    const id = a.matched_id ?? c?.id ?? null;
    rows.push({
      citation, verdict: verdictOf(a.status || a.verdict), matchedTitle: a.matched_title || c?.title || '',
      id, pdf: a.source_pdf_url || c?.source_pdf_url || '', overruledBy: c?.overruled_by || a.overruled_by || '',
    });
  }
  return rows;
}
export function documentSummary(rows) {
  const s = { total: rows.length, found: 0, overruled: 0, distinguished: 0, notfound: 0, unknown: 0 };
  for (const r of rows) s[r.verdict] = (s[r.verdict] || 0) + 1;
  return s;
}
export function briefItemFromRow(r) {
  return { id: r.id, title: r.matchedTitle || r.citation, citation: r.citation, court: '', ratio: '', curated: false, status: '' };
}
/** CSV of the document table (citation, result, matched case, id). */
export function documentCsv(rows) {
  const lines = ['Citation,Result,Matched case,Judgment id'];
  for (const r of rows || []) lines.push([r.citation, r.verdict, r.matchedTitle, r.id ?? ''].map(csvCell).join(','));
  return `${lines.join('\n')}\n`;
}
