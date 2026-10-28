// Pure helpers for the document workspace (#/documents/:id). No DOM, no network.
export const FIELD_KEYS = ['court', 'case_number', 'case_title', 'petitioner', 'respondent', 'statutory_provisions', 'facts', 'prayer', 'petitioner_arguments', 'respondent_arguments'];
export const LONG_FIELDS = ['facts', 'prayer', 'statutory_provisions', 'petitioner_arguments', 'respondent_arguments'];
export const PINS_MAX = 5;
export const STEPS = ['read', 'checked', 'confirmed', 'researched', 'drafted'];
export const REDACTION_RE = /\[REDACTED_[A-Z0-9_]+\]/g;

const s = (v) => (v == null ? '' : String(v));

/**
 * Stepper position. doc: Document; opts: {researched (research run this session), acknowledged}.
 * Returns {current, reached:{id:bool}}; current is the first step not yet reached (last step when all are).
 */
export function stepperState(doc, { researched = false, acknowledged = false } = {}) {
  const ex = doc && doc.extraction;
  const confirmed = !!(ex && ex.confirmed) || (!!doc && doc.status === 'CONFIRMED');
  const reached = {
    read: !!doc,
    checked: confirmed || acknowledged || !!(ex && Number(ex.version) > 1),
    confirmed,
    researched: researched || Number(doc && doc.pins_count) > 0,
    drafted: Array.isArray(doc && doc.drafts) && doc.drafts.length > 0,
  };
  const current = STEPS.find((id) => !reached[id]) || 'drafted';
  return { current, reached };
}

/** Ordered [{key, value, empty}] for the ten extraction fields. Empty means "Not found in the document". */
export function fieldsView(fields) {
  const f = fields || {};
  return FIELD_KEYS.map((key) => {
    const value = s(f[key]);
    return { key, value, empty: value.trim() === '' };
  });
}
export const emptyFieldKeys = (fields) => fieldsView(fields).filter((x) => x.empty).map((x) => x.key);

/** Strip a leading "(A)", "1." or "-" marker so the draft numbers issues itself. */
const MARKER = /^\s*(?:\(?[A-Za-z0-9]{1,3}[.)]\s+|\([A-Za-z0-9]{1,3}\)\s*|[-*•]\s+)/;
export function issuesFromText(text) {
  return s(text).split(/\r?\n/).map((l) => l.replace(MARKER, '').trim()).filter(Boolean);
}
export const issuesToText = (issues) => (Array.isArray(issues) ? issues : []).map(s).join('\n');

export function moveItem(list, from, to) {
  const a = Array.isArray(list) ? [...list] : [];
  if (from < 0 || from >= a.length || to < 0 || to >= a.length || from === to) return a;
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
}
export const removeItem = (list, i) => (Array.isArray(list) ? list.filter((_, k) => k !== i) : []);

/** Case-insensitive, non-overlapping [{start,end}] ranges of query in text. Queries under 2 chars match nothing. */
export function highlightRanges(text, query, cap = 500) {
  const q = s(query).trim().toLowerCase();
  const src = s(text);
  if (q.length < 2) return [];
  const low = src.toLowerCase();
  const out = [];
  let i = low.indexOf(q);
  while (i >= 0 && out.length < cap) {
    out.push({ start: i, end: i + q.length });
    i = low.indexOf(q, i + q.length);
  }
  return out;
}

/** Split text into [{text, kind:'plain'|'match'|'redacted'}]. Redaction tokens win over matches. */
export function segmentText(text, query) {
  const src = s(text);
  const out = [];
  const pushPlain = (chunk) => {
    if (!chunk) return;
    let pos = 0;
    for (const r of highlightRanges(chunk, query)) {
      if (r.start > pos) out.push({ text: chunk.slice(pos, r.start), kind: 'plain' });
      out.push({ text: chunk.slice(r.start, r.end), kind: 'match' });
      pos = r.end;
    }
    if (pos < chunk.length) out.push({ text: chunk.slice(pos), kind: 'plain' });
  };
  let last = 0;
  for (const m of src.matchAll(REDACTION_RE)) {
    pushPlain(src.slice(last, m.index));
    out.push({ text: m[0], kind: 'redacted' });
    last = m.index + m[0].length;
  }
  pushPlain(src.slice(last));
  return out;
}

/** {items:[{type,count}] largest first, total}. total falls back to the sum of counts. */
export function redactionSummary(redactions, total) {
  const items = (Array.isArray(redactions) ? redactions : [])
    .map((r) => ({ type: s(r && r.type), count: Number(r && r.count) || 0 }))
    .filter((r) => r.type && r.count > 0)
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  const sum = items.reduce((n, r) => n + r.count, 0);
  const t = Number(total);
  return { items, total: Number.isFinite(t) && t > 0 ? t : sum };
}

export const pinsFull = (pins, max = PINS_MAX) => Array.isArray(pins) && pins.length >= max;
export const isPinned = (pins, id) => Array.isArray(pins) && pins.some((p) => String(p.judgment_id) === String(id));

/** Start draft needs a confirmed extraction, the DRAFT_FULL permission and a non-archived document. */
export function draftReady(doc, canDraft) {
  const confirmed = !!(doc && doc.extraction && doc.extraction.confirmed);
  return !!canDraft && confirmed && doc.status !== 'ARCHIVED';
}
export function researchReady(doc, canSearch) {
  return draftReady(doc, true) && !!canSearch;
}

/** What /confirm will reject: the case title, the facts and at least one issue. Returns field/issue keys. */
export function missingForConfirm(fields, issues) {
  const f = fields || {};
  const out = [];
  if (!s(f.case_title).trim()) out.push('case_title');
  if (!s(f.facts).trim()) out.push('facts');
  if (!Array.isArray(issues) || !issues.some((i) => s(i).trim())) out.push('issues');
  return out;
}

/** Banner kind for the Source column, or null. */
export function sourceNotice(doc) {
  const src = doc && doc.source;
  return src === 'failed' || src === 'sample' ? src : null;
}
export const isImageMime = (mime) => /^image\//i.test(s(mime));
export const isPdfMime = (mime) => /^application\/pdf/i.test(s(mime));
export const canDownloadOriginal = (doc) => !!doc && doc.source !== 'pasted' && !!doc.original_name;

/** Tone + i18n suffix for an authority status from the citation verifier. */
export function authorityStatus(status) {
  const v = s(status).toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (v.includes('overrul')) return { key: 'overruled', tone: 'danger' };
  if (v.includes('distinguish')) return { key: 'distinguished', tone: 'warn' };
  if (v.includes('not found') || v.includes('unverified') || v.includes('notfound') || v === '') return { key: 'notfound', tone: 'neutral' };
  if (v.includes('verified') || v.includes('valid') || v.includes('found') || v.includes('followed')) return { key: 'verified', tone: 'primary' };
  return { key: 'other', tone: 'neutral' };
}

export const researchHref = (q) => `#/research?q=${encodeURIComponent(s(q).trim())}`;

/** Bench-brief items (shape of judgment-logic briefItem) from draft-params authorities. */
export function benchFromAuthorities(list) {
  return (Array.isArray(list) ? list : []).map((a) => ({
    id: a.id, title: s(a.title), citation: s(a.citation), court: s(a.court), ratio: '', curated: false, status: s(a.status),
  }));
}

/** Params for the draft studio, merged with the confirmed authorities. */
export function intakeParamsFrom(res) {
  const authorities = Array.isArray(res && res.authorities) ? res.authorities : [];
  return { ...((res && res.params) || {}), authorities, source: 'document', confirmed_issues: true };
}
