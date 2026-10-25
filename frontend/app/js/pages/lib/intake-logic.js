// Pure logic for the New matter (intake) flow (no DOM access; unit-tested in tests/intake.test.js).
// Backend facts (plan section 6, B6): /api/ocr/process_brief returns {success, source, metadata{...}, dpdp_redactions_applied,
// cleaned_character_count, sanitized_text_preview, file_format}. `source` is digital_text | ocr | vlm | canned_sample | fallback.
// /api/upload_pleading returns {parsed{...}} and fills parser defaults when it finds nothing; those are blanked here (P9).

export const SAMPLE_SOURCES = ['canned_sample', 'fallback'];
export function isSampleSource(source) { return SAMPLE_SOURCES.includes(String(source || '')); }

export const ALLOWED_EXT = ['pdf', 'docx', 'doc', 'txt', 'md', 'rtf', 'jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'bmp'];
export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'bmp'];
export const MAX_BYTES = 64 * 1024 * 1024; // server limit (save_upload)

export function extOf(name) { const m = /\.([A-Za-z0-9]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
export function isImageFile(file) {
  return !!file && (String(file.type || '').startsWith('image/') || IMAGE_EXT.includes(extOf(file.name)));
}
export function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
/** Returns null when the file is acceptable, else an i18n key. */
export function checkFile(file) {
  if (!file) return 'intake.err.noFile';
  if (!ALLOWED_EXT.includes(extOf(file.name))) return 'intake.err.type';
  if (file.size > MAX_BYTES) return 'intake.err.size';
  if (file.size === 0) return 'intake.err.empty';
  return null;
}
/** Map an ApiError to an i18n key (null = show nothing, e.g. user cancelled). */
export function uploadErrorKey(err) {
  const st = err && err.status;
  if (st === 413) return 'intake.err.size';
  if (st === 415) return 'intake.err.type';
  if (st === 403) return 'err.forbidden';
  if (err && err.code === 'TIMEOUT') return 'err.timeout';
  if (err && err.code === 'NETWORK') return 'err.network';
  if (err && err.code === 'ABORTED') return null;
  return 'intake.err.read';
}

// ---- fields ----
export const FIELD_KEYS = ['court', 'case_number', 'case_title', 'petitioner', 'respondent', 'statutory_provisions', 'facts', 'prayer'];
const s = (v) => (v == null ? '' : String(v).trim());

/** Normalise /api/ocr/process_brief into {fields, issues, source, isSample, redactions, chars, format, vlm, text}. */
export function normalizeBrief(resp) {
  const md = (resp && resp.metadata) || {};
  const source = s(resp && resp.source) || (resp && resp.vlm_transcription_used ? 'vlm' : 'ocr');
  return {
    source,
    isSample: isSampleSource(source),
    fields: {
      court: s(md.court), case_number: s(md.case_number), case_title: s(md.case_title),
      petitioner: s(md.petitioner), respondent: s(md.respondent),
      statutory_provisions: s(md.statutory_provisions), facts: s(md.facts_summary || md.facts), prayer: s(md.prayer_relief),
    },
    issues: s(md.grounds_of_challenge || md.issues),
    redactions: Number(resp && resp.dpdp_redactions_applied) || 0,
    chars: Number(resp && resp.cleaned_character_count) || 0,
    format: s(resp && resp.file_format),
    vlm: !!(resp && resp.vlm_transcription_used),
    blanked: 0,
  };
}

// Defaults the legacy pleading parser writes when it finds nothing. They are not read from the user's text.
export const PARSER_DEFAULTS = {
  case_title: ['Petitioner v. Respondent'],
  case_number: ['W.P. No. 1024/2023'],
  statutory_provisions: ['Constitution of India, Article 226'],
};
const DEFAULT_ISSUE_RE = /^\(A\) Whether the impugned order violates the principles of natural justice\?\n\(B\) Whether the proceedings conform to the statutory mandate under /;

/** Normalise /api/upload_pleading ({parsed}) for pasted text. Parser defaults are blanked and counted. */
export function normalizePleading(resp, redactions = 0) {
  const p = (resp && resp.parsed) || {};
  let blanked = 0;
  const take = (key, raw) => {
    const v = s(raw);
    if (PARSER_DEFAULTS[key] && PARSER_DEFAULTS[key].includes(v)) { blanked += 1; return ''; }
    return v;
  };
  let issues = s(p.issues);
  if (DEFAULT_ISSUE_RE.test(issues)) { issues = ''; blanked += 1; }
  return {
    source: 'pasted_text', isSample: false,
    fields: {
      court: s(p.court), case_number: take('case_number', p.case_number), case_title: take('case_title', p.case_title),
      petitioner: '', respondent: '',
      statutory_provisions: take('statutory_provisions', p.statutory_provisions), facts: s(p.facts), prayer: '',
    },
    issues, blanked, redactions: Number(redactions) || 0, chars: Number(p.raw_text_length) || 0, format: 'TXT', vlm: false,
  };
}

export function parseIssues(text) {
  return String(text || '').split(/\n+/)
    .map((l) => l.replace(/^\s*(?:\(?[A-Za-z0-9]{1,2}[.)]\s+|[-*•]\s+)/, '').trim()).filter(Boolean);
}

/** Step 2 validation: required fields. Returns {fieldKey: i18nKey}. */
export function validateFields(fields) {
  const err = {};
  if (!s(fields.case_title)) err.case_title = 'intake.err.required';
  if (!s(fields.facts)) err.facts = 'intake.err.required';
  return err;
}

/**
 * Sample gate (plan P4): canned or fallback text cannot proceed until at least one field was edited
 * or the user confirms "use as sample". Real sources always pass.
 */
export function canProceed({ isSample, edited, acknowledged }) {
  if (!isSample) return true;
  return !!(edited || acknowledged);
}

/** The hand-off object stored under store key "intakeParams" for the Studio (/drafts/new). */
export function buildIntakeParams({ fields, issues, source, isSample, redactions, filename }) {
  const parties = [s(fields.petitioner), s(fields.respondent)].filter(Boolean);
  return {
    case_title: s(fields.case_title) || parties.join(' v. '),
    case_number: s(fields.case_number),
    court: s(fields.court),
    petitioner: s(fields.petitioner),
    respondent: s(fields.respondent),
    facts: s(fields.facts),
    petitioner_arguments: '',
    respondent_arguments: '',
    issues: parseIssues(issues).map((x, i) => `(${String.fromCharCode(65 + (i % 26))}) ${x}`).join('\n'),
    statutory_provisions: s(fields.statutory_provisions),
    prayer: s(fields.prayer),
    source: s(source), is_sample: !!isSample, redactions: Number(redactions) || 0, filename: s(filename),
    confirmed_issues: true,
  };
}

/** i18n key describing how the text was read (no claims beyond what the server reports). */
export function sourceNoteKey(source, vlm) {
  switch (source) {
    case 'digital_text': return 'intake.read.digital';
    case 'ocr': return 'intake.read.ocr';
    case 'vlm': return 'intake.read.vlm';
    case 'pasted_text': return 'intake.read.pasted';
    default: return vlm ? 'intake.read.vlm' : 'intake.read.unknown';
  }
}
