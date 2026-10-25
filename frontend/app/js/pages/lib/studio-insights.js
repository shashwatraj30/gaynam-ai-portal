// Pure logic for the three Studio insight panels (applicable sections, solved precedents, why the judgment was given).
// No DOM. Honesty rules: the section list is a built-in reference, search results are corpus matches that are not
// verified to turn on the same section, and "why" text comes only from the draft itself (or a curated record).
import { parseSections, describeAll, actInfo } from './statutes-kb.js';
import { SECTION_KEYS, engineKind } from './studio-logic.js';

export const MAX_SECTIONS = 4;
export const PER_SECTION_LIMIT = 6;
export const DEBOUNCE_MS = 700;
/** Draft sections used for "why the judgment was given": 11 discussion and reasoning, 13 findings, 14 conclusion. */
export const WHY_SECTIONS = [11, 13, 14];
export const EXCERPT_CHARS = 600;
export const RATIO_CHARS = 500;

/** Text where section numbers are looked for: statutory provisions input, draft section 8, then the case facts. */
export function sectionSource(params, texts) {
  return [params?.statutory_provisions, texts?.section_8_statutory_provisions, params?.facts].filter((x) => String(x || '').trim()).join('\n');
}

/** -> {rows: describeAll(...), all: parsed} */
export function sectionsForDraft(params, texts) {
  const all = parseSections(sectionSource(params, texts));
  return { all, rows: describeAll(all) };
}

/** First MAX_SECTIONS parsed sections (order kept); `more` is how many were left out. */
export function pickSearchSections(parsed, max = MAX_SECTIONS) {
  const list = parsed || [];
  return { picked: list.slice(0, max), more: Math.max(0, list.length - max) };
}

export function sectionLabel(sec) {
  const a = sec?.act ? actInfo(sec.act) : null;
  return `Section ${sec.num}${a ? ' ' + a.short : ''}`;
}
/** One corpus search per section. No act is asserted when the draft names none. */
export function buildSectionQuery(sec) { return sectionLabel(sec); }
export function buildSearchBody(sec, limit = PER_SECTION_LIMIT) {
  return { query: buildSectionQuery(sec), court: 'ALL', judge: '', precedent_status: 'ALL', limit };
}
/** Stable key for debouncing: changes only when the picked sections change. */
export function sectionsKey(picked) { return (picked || []).map((s) => `${s.act || ''}:${s.num}`).join('|'); }

const isOverruled = (r) => String(r?.precedent_status || '').toUpperCase() === 'OVERRULED';
const rowKey = (r) => (r?.id != null ? `id:${r.id}` : r?.citation ? `c:${String(r.citation).toLowerCase()}` : `t:${String(r?.title || r?.case_title || '').toLowerCase()}`);

/**
 * perSection: [{sec, results:[row]}] -> deduped rows [{...row, matchedSections:[label]}], overruled authorities last,
 * otherwise first-seen order (the server's order within a section).
 */
/** True when the section number only appears as a case number ("CMP.M/341/2020"), not as a statute reference. */
export function numberIsOnlyCaseNo(row, sec) {
  const text = `${row?.title || ''} ${row?.case_title || ''} ${row?.citation || ''}`;
  if (!sec || sec.num == null) return false;
  const num = String(sec.num).replace(/[^0-9A-Za-z]/g, '');
  const asCaseNo = new RegExp(`(^|[^0-9])${num}\\s*/\\s*(19|20)\\d{2}`);
  const asStatute = /(section|sec\.|u\/s|ipc|crpc|n\.?i\.? act)/i;
  return asCaseNo.test(text) && !asStatute.test(text);
}

export function mergeResults(perSection) {
  const map = new Map();
  for (const { sec, results } of perSection || []) {
    for (const r of Array.isArray(results) ? results : []) {
      if (!r || rowKey(r) === 't:') continue;
      if (numberIsOnlyCaseNo(r, sec)) continue;
      const k = rowKey(r);
      const lab = sectionLabel(sec);
      if (!map.has(k)) map.set(k, { ...r, matchedSections: [lab] });
      else if (!map.get(k).matchedSections.includes(lab)) map.get(k).matchedSections.push(lab);
    }
  }
  const rows = [...map.values()];
  return [...rows.filter((r) => !isOverruled(r)), ...rows.filter(isOverruled)];
}

/** Stale-response guard: take a token before each request; only the newest token is current. */
export function createLatest() {
  let n = 0;
  return { next: () => ++n, isCurrent: (token) => token === n, invalidate: () => { n++; } };
}

// ---------- why the judgment was given ----------
/** Trim to a whole-word/sentence-ish excerpt of at most `max` characters. */
export function excerpt(text, max = EXCERPT_CHARS) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const dot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  const end = dot > max * 0.5 ? dot + 1 : cut.lastIndexOf(' ');
  return `${cut.slice(0, end > 0 ? end : max).trim()}...`;
}

/**
 * -> {template, excerpts:[{n, text}], curated:[{id, title, citation, ratio}]}.
 * excerpts: only non-empty draft sections 11, 13, 14. template: the draft came from the built-in template fallback.
 * curated: only rows with is_curated === true and a non-empty ratio_decidendi (corpus ratio text is otherwise a template).
 */
export function deriveWhy({ texts, engine, precedents }) {
  const excerpts = WHY_SECTIONS.map((n) => ({ n, text: excerpt(texts?.[SECTION_KEYS[n - 1]]) })).filter((x) => x.text);
  const seen = new Set();
  const curated = [];
  for (const p of precedents || []) {
    if (!p || p.is_curated !== true) continue;
    const ratio = excerpt(p.ratio_decidendi, RATIO_CHARS);
    const k = rowKey(p);
    if (!ratio || seen.has(k)) continue;
    seen.add(k);
    curated.push({ id: p.id ?? null, title: p.title || p.case_title || p.citation || '', citation: p.citation || '', ratio });
  }
  return { template: engineKind(engine) === 'template', excerpts, curated };
}
