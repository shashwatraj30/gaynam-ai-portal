// Pure logic for the Drafting studio (and shared with Review). No DOM access.
// 15 section keys, text conversion, OCR-noise detector, engine label, intake hand-off, save payload,
// conflict classification, status path, citation-check summary, debounced autosaver.

export const SECTION_KEYS = [
  'section_1_case_title', 'section_2_case_number', 'section_3_introduction', 'section_4_brief_facts',
  'section_5_submissions_petitioner', 'section_6_submissions_respondent', 'section_7_issues_framed',
  'section_8_statutory_provisions', 'section_9_evidence_analysis', 'section_10_applicable_principles',
  'section_11_discussion_reasoning', 'section_12_application_of_law', 'section_13_findings_on_issues',
  'section_14_conclusion_disposition', 'section_15_citations_authorities',
];

export const PARAM_KEYS = ['case_title', 'case_number', 'court', 'facts', 'issues', 'petitioner_arguments', 'respondent_arguments', 'statutory_provisions'];
export const REQUIRED_PARAMS = ['case_title', 'case_number', 'court', 'facts', 'issues'];

/** Server-aligned transitions (backend ALLOWED_TRANSITIONS). RETURNED only goes back to DRAFT. */
export const SERVER_TRANSITIONS = {
  DRAFT: ['IN_REVIEW'], IN_REVIEW: ['BENCH_APPROVED', 'RETURNED'], BENCH_APPROVED: ['FINAL_SEALED', 'RETURNED'],
  RETURNED: ['DRAFT'], FINAL_SEALED: [],
};
export function isEditableStatus(s) { return s === 'DRAFT' || s === 'RETURNED'; }
/** Steps to send a draft for review: RETURNED must go through DRAFT first. */
export function sendForReviewPath(status) {
  if (status === 'DRAFT') return ['IN_REVIEW'];
  if (status === 'RETURNED') return ['DRAFT', 'IN_REVIEW'];
  return [];
}

// ---------- text conversion ----------
export function sectionToText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.replace(/\[object Object\]/g, '').trim() === '' && v.includes('[object Object]') ? '' : v.replace(/\[object Object\]/g, '');
  if (Array.isArray(v)) {
    return v.map((it, i) => {
      if (it && typeof it === 'object') {
        const p = [`[${i + 1}]`];
        const title = it.title || it.case_title; if (title) p.push(String(title));
        if (it.citation) p.push(`- ${it.citation}`);
        if (it.court) p.push(`(${it.court})`);
        return p.join(' ');
      }
      return String(it);
    }).join('\n');
  }
  if (typeof v === 'object') return Object.entries(v).map(([k, val]) => `${k.replace(/_/g, ' ')}: ${sectionToText(val)}`).join('\n');
  return String(v);
}

/** raw sections (object keyed by section_N_*, or array) -> {key: text} with all 15 keys. */
export function normalizeSections(raw) {
  const out = {};
  SECTION_KEYS.forEach((k) => { out[k] = ''; });
  if (Array.isArray(raw)) {
    raw.forEach((s, i) => {
      const key = SECTION_KEYS.includes(s?.key) ? s.key : SECTION_KEYS[(Number(s?.number) || i + 1) - 1];
      if (key) out[key] = sectionToText(s?.content ?? s?.text ?? '');
    });
  } else if (raw && typeof raw === 'object') {
    for (const k of SECTION_KEYS) if (raw[k] !== undefined) out[k] = sectionToText(raw[k]);
    SECTION_KEYS.forEach((k, i) => { if (!out[k] && raw[String(i + 1)] !== undefined) out[k] = sectionToText(raw[String(i + 1)]); });
  }
  return out;
}
export function sectionsToObject(texts) {
  const o = {}; SECTION_KEYS.forEach((k) => { o[k] = texts?.[k] ?? ''; }); return o;
}
export function joinSections(texts) { return SECTION_KEYS.map((k) => texts?.[k] || '').join('\n\n'); }
export function hasContent(texts) { return SECTION_KEYS.some((k) => (texts?.[k] || '').trim()); }
export function emptySections(texts) { return SECTION_KEYS.map((k, i) => ((texts?.[k] || '').trim() ? 0 : i + 1)).filter(Boolean); }

// ---------- OCR-noise detector ----------
const EDGE = /^[\s.,;:!?'"“”‘’()[\]{}<>\-–—•*]+|[\s.,;:!?'"“”‘’()[\]{}<>\-–—•*]+$/g;
export function isGarbledToken(raw) {
  const core = String(raw).replace(EDGE, '');
  if (!core) return false;
  if (/�|[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(core)) return true;
  if (/[ऀ-ॿ]/.test(core)) return false;
  if (!/[A-Za-z0-9]/.test(core)) return /[|~#@$%^\\_=+]/.test(core);
  if (!/[A-Za-z]{2}/.test(core)) return false; // numbers, "5th", "s.", single letters
  if (/[A-Za-z]\d+[A-Za-z]/.test(core)) return true;
  if (/[A-Za-z][@#$%^|~\\_=+]|[@#$%^|~\\_=+][A-Za-z]/.test(core)) return true;
  if ((core.match(/[a-z][A-Z]/g) || []).length >= 2) return true;
  if (/^[A-Za-z]{5,}$/.test(core) && !/[aeiouyAEIOUY]/.test(core) && core !== core.toUpperCase()) return true;
  if (/([A-Za-z])\1{3,}/.test(core)) return true;
  return false;
}
/** -> {noisy, ratio, garbled, total, replacement}. Heuristic only: it says "looks like", never "is". */
export function detectOcrNoise(text, { threshold = 0.12, minTokens = 15 } = {}) {
  const s = String(text || '');
  const replacement = (s.match(/�/g) || []).length;
  const tokens = s.split(/\s+/).filter((x) => /[A-Za-zऀ-ॿ]/.test(x.replace(EDGE, '')));
  const total = tokens.length;
  const garbled = tokens.filter(isGarbledToken).length;
  const ratio = total ? garbled / total : 0;
  const noisy = replacement >= 3 || (total >= minTokens && garbled >= 3 && ratio >= threshold);
  return { noisy, ratio, garbled, total, replacement };
}
/** texts -> section numbers (1-based) that look like OCR noise. */
export function noisySections(texts) {
  return SECTION_KEYS.map((k, i) => (detectOcrNoise(texts?.[k]).noisy ? i + 1 : 0)).filter(Boolean);
}

// ---------- engine ----------
/** 'model' when a Gemini model wrote the text, else 'template' (built-in fixed-text fallback), '' if unknown. */
export function engineKind(engine) {
  const e = String(engine || '').trim();
  if (!e) return '';
  return /gemini/i.test(e) ? 'model' : 'template';
}

// ---------- params / intake ----------
export function emptyParams() { const p = {}; PARAM_KEYS.forEach((k) => { p[k] = ''; }); return p; }
const ALIASES = {
  case_title: ['case_title', 'caseTitle', 'title'], case_number: ['case_number', 'caseNumber', 'caseNo', 'case_no'],
  court: ['court'], facts: ['facts', 'brief_facts', 'briefFacts'], issues: ['issues', 'issues_framed'],
  petitioner_arguments: ['petitioner_arguments', 'petitionerArguments', 'petitioner_args'],
  respondent_arguments: ['respondent_arguments', 'respondentArguments', 'respondent_args'],
  statutory_provisions: ['statutory_provisions', 'statutoryProvisions', 'statutes'],
};
export function normalizeIntake(src) {
  const p = emptyParams();
  if (!src || typeof src !== 'object') return p;
  for (const k of PARAM_KEYS) {
    for (const a of ALIASES[k]) {
      const v = src[a];
      if (v == null || v === '') continue;
      p[k] = Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x?.text || x?.issue || '')).filter(Boolean).join('\n') : String(v);
      break;
    }
  }
  return p;
}
export function paramsFromDraft(d) { const p = emptyParams(); PARAM_KEYS.forEach((k) => { p[k] = d?.[k] == null ? '' : String(d[k]); }); return p; }
export function missingParams(params) { return REQUIRED_PARAMS.filter((k) => !String(params?.[k] || '').trim()); }
export function parseIssues(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.replace(/^\s*\((?:[A-Za-z]|[ivxIVX]+)\)\s*/, '').replace(/^\s*(?:issue\s*)?\(?\d+[.)]?\s*[:\-]?\s*/i, '').replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
}
// ---------- alert hand-off ----------
const squash = (s) => String(s || '').toLowerCase().replace(/[\s.,;:()[\]]+/g, ' ').trim();
/**
 * Store 'alertTarget' {alertId, draftId, matterKey, citation, overruledCaseId, overruledTitle, overruledBy, foundIn}
 * -> null when it does not belong to this draft, else {target, sections:[1-based numbers whose text contains the citation or overruled title]}.
 */
export function alertMarks(target, draftId, texts) {
  if (!target || typeof target !== 'object' || draftId == null || String(target.draftId) !== String(draftId)) return null;
  const needles = [target.citation, target.overruledTitle].map(squash).filter((x) => x.length >= 4);
  const sections = [];
  SECTION_KEYS.forEach((k, i) => {
    const hay = squash(texts?.[k]);
    if (hay && needles.some((n) => hay.includes(n))) sections.push(i + 1);
  });
  return { target, sections };
}
export function buildDraftRequest(params) {
  const b = {}; PARAM_KEYS.forEach((k) => { b[k] = String(params?.[k] ?? ''); });
  b.gemini_api_key = null;
  return b;
}
export function buildSavePayload({ id, version, status, params, content, texts }) {
  const payload = {
    draft_id: id || null, ...buildDraftRequest(params),
    draft_content_json: { ...(content || {}), sections: sectionsToObject(texts) },
    status: status || 'DRAFT',
  };
  delete payload.gemini_api_key;
  if (id && version != null) payload.version = version;
  return payload;
}

// ---------- conflicts ----------
/** -> 'VERSION_CONFLICT' | 'DRAFT_SEALED' | 'ILLEGAL_TRANSITION' | null (api.js keeps only the message for string details). */
export function classifyConflict(err) {
  if (!err || err.status !== 409) return null;
  if (['VERSION_CONFLICT', 'DRAFT_SEALED', 'ILLEGAL_TRANSITION'].includes(err.code)) return err.code;
  const m = String(err.message || '');
  if (/illegal transition/i.test(m)) return 'ILLEGAL_TRANSITION';
  if (/immutable|sealed drafts/i.test(m)) return 'DRAFT_SEALED';
  if (/modified elsewhere|changed elsewhere|version/i.test(m)) return 'VERSION_CONFLICT';
  return 'VERSION_CONFLICT';
}

// ---------- citation check ----------
/** verification row (/api/verify_citations) -> the two checks the corpus can really answer. */
export function citationChecks(v) {
  const found = !!v && v.verified === true && v.status !== 'HALLUCINATED_OR_UNVERIFIED';
  const overruled = found && v.status === 'OVERRULED_WARNING';
  return {
    found: found ? 'pass' : 'fail',
    overruled: !found ? 'unchecked' : overruled ? 'fail' : 'pass',
    distinguished: found && v.status === 'DISTINGUISHED_CAUTION',
    matchedTitle: v?.case_data?.title || '',
    overruledBy: v?.case_data?.overruled_by || '',
    judgmentId: v?.case_data?.id ?? null,
  };
}
export function summarizeVerification(results) {
  const rows = (results || []).map((v) => ({ v, c: citationChecks(v) }));
  return {
    total: rows.length,
    found: rows.filter((r) => r.c.found === 'pass').length,
    missing: rows.filter((r) => r.c.found === 'fail').map((r) => r.v.query_citation || r.v.citation),
    overruled: rows.filter((r) => r.c.overruled === 'fail').map((r) => ({ citation: r.v.citation, title: r.c.matchedTitle, overruledBy: r.c.overruledBy })),
    distinguished: rows.filter((r) => r.c.distinguished).map((r) => r.v.citation),
  };
}

// ---------- autosave ----------
/** Debounced single-flight autosaver. save() performs one request. onState(state, err): dirty|saving|saved|error.
 *  Timers are injectable for tests. pause()/resume() hold saving while a dialog is open. */
export function createAutosaver({ save, delay = 1500, onState = () => {}, setTimer = (f, ms) => setTimeout(f, ms), clearTimer = (id) => clearTimeout(id) }) {
  let timer = null; let dirty = false; let inflight = null; let paused = false;
  const clear = () => { if (timer != null) { clearTimer(timer); timer = null; } };
  const schedule = () => { clear(); if (!paused) timer = setTimer(() => { timer = null; flush().catch(() => {}); }, delay); };
  async function flush() {
    clear();
    if (inflight) { try { await inflight; } catch { /* reported via onState */ } }
    if (!dirty) return false;
    dirty = false; onState('saving');
    inflight = (async () => {
      try { await save(); onState(dirty ? 'dirty' : 'saved'); } catch (e) { dirty = true; onState('error', e); throw e; }
    })();
    try { await inflight; } finally { inflight = null; }
    if (dirty && !paused) schedule();
    return true;
  }
  return {
    markDirty() { dirty = true; onState('dirty'); schedule(); },
    flush, cancel() { clear(); },
    pause() { paused = true; clear(); }, resume() { paused = false; if (dirty) schedule(); },
    get dirty() { return dirty || inflight != null; },
    clearDirty() { dirty = false; clear(); },
  };
}
