// Pure helpers shared by the research, judgment and citation-check pages (no DOM, imports in Node).
// Honesty rules (plan P9 / section 2): ratio and headnote are shown only when is_curated; citing_cases_count only when
// curated; a CNR is labelled "CNR", not as a law-report citation; FOLLOWED never reads as "good law".

const CNR_RE = /^[A-Z]{4}\d{12}$/;

export function isCnr(value) { return CNR_RE.test(String(value || '').trim()); }

/** {label:'CNR'|'Citation', value} or null. A CNR-valued citation is labelled as a CNR. */
export function citationLabel(row) {
  const c = String(row?.citation || '').trim();
  if (c) return { label: isCnr(c) ? 'CNR' : 'Citation', value: c };
  const cnr = String(row?.cnr_number || '').trim();
  return cnr ? { label: 'CNR', value: cnr } : null;
}

export function yearOf(row) {
  const y = Number(row?.year);
  if (Number.isInteger(y) && y > 1700) return y;
  const m = String(row?.judgment_date || '').match(/(1[7-9]\d\d|20\d\d)/);
  return m ? Number(m[1]) : null;
}

/** "Disposition: dismissed" is carried in the templated headnote; it is metadata, so it may be shown. */
export function dispositionOf(row) {
  const m = String(row?.headnote || '').match(/Disposition:\s*([^.\n]+)/i);
  return m ? m[1].trim() : '';
}

export const isCurated = (row) => row?.is_curated === true;

/** What may be shown as a finding for this row. */
export function honestView(row) {
  const curated = isCurated(row);
  const ratio = curated ? String(row?.ratio_decidendi || '').trim() : '';
  const headnote = curated ? String(row?.headnote || '').trim() : '';
  const raw = row?.citing_cases_count;
  const count = curated && raw != null && Number.isFinite(Number(raw)) ? Number(raw) : null;
  return {
    curated, ratio, headnote, citedCount: count,
    overruled: String(row?.precedent_status || '').toUpperCase() === 'OVERRULED',
    overruledBy: row?.overruled_by || '',
    disposition: dispositionOf(row),
    cite: citationLabel(row),
    year: yearOf(row),
  };
}

export function snippet(text, max = 280) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30)).trimEnd() + '…';
}

/** Plain-text citation for copy/print: "Title, (2010) 11 SCC 441 (Supreme Court, 7 May 2010)". */
export function citationText(row, formatDate = (d) => String(d || '')) {
  const c = citationLabel(row);
  const parts = [String(row?.title || '').trim()];
  if (c) parts.push(c.label === 'CNR' ? `CNR ${c.value}` : c.value);
  const when = row?.judgment_date ? formatDate(row.judgment_date) : (yearOf(row) || '');
  const where = [row?.court, when].filter(Boolean).join(', ');
  return parts.filter(Boolean).join(', ') + (where ? ` (${where})` : '');
}

/** Full-text paragraphs (curated rows only): blank-line split, falling back to line split. */
export function paragraphs(text) {
  const s = String(text || '').replace(/\r/g, '').trim();
  if (!s) return [];
  let parts = s.split(/\n\s*\n/);
  if (parts.length === 1) parts = s.split(/\n/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** cases_cited may be JSON text, a list, or ';'/newline separated text. */
export function parseCitedCases(value) {
  if (!value) return [];
  let v = value;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return [];
    try { v = JSON.parse(s); } catch { v = s.split(/[;\n]+/); }
  }
  if (!Array.isArray(v)) v = [v];
  return v.map((x) => (typeof x === 'string' ? x : (x && (x.title || x.citation || x.case_id)) || '')).map((x) => String(x).trim()).filter(Boolean);
}

/** Bench-brief item stored under store key 'benchBrief' (legacy shape plus curated flag). The ratio is kept for curated rows only. */
export function briefItem(row) {
  const v = honestView(row);
  return {
    id: row.id, title: row.title || '', citation: v.cite ? v.cite.value : '', court: row.court || '',
    ratio: v.ratio, curated: v.curated, status: row.precedent_status || '',
  };
}
export const BRIEF_MAX = 5;
/** Toggle an item in the brief. Returns {list, action:'added'|'removed'|'full'}. */
export function toggleBrief(list, item, max = BRIEF_MAX) {
  const cur = Array.isArray(list) ? list : [];
  const i = cur.findIndex((c) => c.id === item.id);
  if (i >= 0) return { list: cur.filter((c) => c.id !== item.id), action: 'removed' };
  if (cur.length >= max) return { list: cur, action: 'full' };
  return { list: [...cur, item], action: 'added' };
}
export const inBrief = (list, id) => Array.isArray(list) && list.some((c) => c.id === id);
