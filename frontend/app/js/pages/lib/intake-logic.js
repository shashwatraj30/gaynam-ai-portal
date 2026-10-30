// Pure logic for the New matter (intake) flow (no DOM access; unit-tested in tests/intake.test.js).
// Every read document is a server Document (api.documents.create, docs/API_V3_CONTRACT.md).
// `source` is digital | ocr | vlm | pasted | sample | failed. Empty strings mean "not found in the document".

export const SAMPLE_SOURCES = ['sample'];
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
export const FIELD_KEYS = ['court', 'case_number', 'case_title', 'petitioner', 'respondent', 'statutory_provisions', 'facts', 'prayer',
  'petitioner_arguments', 'respondent_arguments'];
const s = (v) => (v == null ? '' : String(v).trim());

export const DOC_TYPES = ['PETITION', 'FIR', 'PLAINT', 'WRITTEN_STATEMENT', 'COUNTER_AFFIDAVIT', 'REJOINDER', 'APPEAL', 'APPLICATION',
  'EVIDENCE_SUMMARY', 'PREVIOUS_ORDER', 'SUBMISSIONS', 'OTHER'];
export const FIR_SAMPLES = ['fir_04_17', 'fir_06_17'];
/** Default document type: FIR for the FIR samples, PETITION otherwise. */
export function defaultDocType(sample) { return FIR_SAMPLES.includes(sample) ? 'FIR' : 'PETITION'; }
export function validDocType(v) { return DOC_TYPES.includes(v) ? v : 'PETITION'; }

export function parseIssues(text) {
  return String(text || '').split(/\n+/)
    .map((l) => l.replace(/^\s*(?:\(?[A-Za-z0-9]{1,2}[.)]\s+|[-*•]\s+)/, '').trim()).filter(Boolean);
}

/** Map a server Document into the step state. */
export function normalizeDocument(doc) {
  const d = doc || {};
  const ex = d.extraction || {};
  const f = ex.fields || {};
  const fields = {};
  FIELD_KEYS.forEach((k) => { fields[k] = s(f[k]); });
  const source = s(d.source) || 'failed';
  const total = Number(d.redaction_total);
  const red = Array.isArray(d.redactions) ? d.redactions.reduce((n, r) => n + (Number(r && r.count) || 0), 0) : 0;
  return {
    id: d.id == null ? '' : d.id,
    docType: s(d.doc_type),
    source,
    isSample: isSampleSource(source),
    failed: source === 'failed',
    fields,
    issues: (Array.isArray(ex.issues) ? ex.issues : []).map(s).filter(Boolean).join('\n'),
    version: Number(ex.version) || 1,
    confirmed: !!ex.confirmed,
    authorities: Array.isArray(ex.authorities) ? ex.authorities : [],
    redactions: Number.isFinite(total) && total > 0 ? total : red,
    chars: Number(d.chars) || 0,
    format: s(d.mime || d.original_name),
    vlm: source === 'vlm',
    blanked: 0,
    title: s(d.title || d.original_name),
    sexualOffenceMatter: !!d.sexual_offence_matter,
  };
}

/** Body for api.documents.saveExtraction. */
export function extractionBody(fields, issues, version) {
  const out = {};
  FIELD_KEYS.forEach((k) => { out[k] = s(fields && fields[k]); });
  return { fields: out, issues: parseIssues(issues), version };
}
/** 409 VERSION_CONFLICT (a newer version exists on the server). */
export function isConflict(err) { return !!err && err.status === 409; }
/** Message key for save/confirm failures (null = say nothing, e.g. cancelled). */
export function saveErrorKey(err) {
  if (isConflict(err)) return (err.code === 'NOT_CONFIRMED' || err.code === 'EXTRACTION_INCOMPLETE') ? 'intake.err.incomplete' : 'intake.err.conflict';
  if (err && err.status === 422) return 'intake.err.incomplete';
  return uploadErrorKey(err);
}

/** Step 2 validation: required fields. Returns {fieldKey: i18nKey}. */
export function validateFields(fields) {
  const err = {};
  if (!s(fields.case_title)) err.case_title = 'intake.err.required';
  if (!s(fields.facts)) err.facts = 'intake.err.required';
  return err;
}

/** Sample gate: only applies when the server says source is "sample". Real sources always pass. */
export function canProceed({ isSample, edited, acknowledged }) {
  if (!isSample) return true;
  return !!(edited || acknowledged);
}

/** The hand-off object stored under store key "intakeParams" for the Studio (/drafts/new). */
export function buildIntakeParams({ fields, issues, source, isSample, redactions, filename, documentId, authorities }) {
  const parties = [s(fields.petitioner), s(fields.respondent)].filter(Boolean);
  return {
    case_title: s(fields.case_title) || parties.join(' v. '),
    case_number: s(fields.case_number),
    court: s(fields.court),
    petitioner: s(fields.petitioner),
    respondent: s(fields.respondent),
    facts: s(fields.facts),
    petitioner_arguments: s(fields.petitioner_arguments),
    respondent_arguments: s(fields.respondent_arguments),
    issues: parseIssues(issues).map((x, i) => `(${String.fromCharCode(65 + (i % 26))}) ${x}`).join('\n'),
    statutory_provisions: s(fields.statutory_provisions),
    prayer: s(fields.prayer),
    source: s(source), is_sample: !!isSample, redactions: Number(redactions) || 0, filename: s(filename),
    document_id: documentId == null || documentId === '' ? null : documentId,
    authorities: Array.isArray(authorities) ? authorities : [],
    confirmed_issues: true,
  };
}

/** Overlay the server's draft-params response ({params, authorities}) on the locally built object. */
export function mergeDraftParams(local, resp) {
  const p = (resp && resp.params) || {};
  const out = { ...local };
  Object.keys(p).forEach((k) => { if (p[k] != null && p[k] !== '') out[k] = p[k]; });
  out.authorities = Array.isArray(resp && resp.authorities) ? resp.authorities : (local.authorities || []);
  out.confirmed_issues = true;
  return out;
}

/** i18n key describing how the text was read (no claims beyond what the server reports). */
export function sourceNoteKey(source, vlm) {
  switch (source) {
    case 'digital': case 'digital_text': return 'intake.read.digital';
    case 'ocr': return 'intake.read.ocr';
    case 'vlm': return 'intake.read.vlm';
    case 'pasted': case 'pasted_text': return 'intake.read.pasted';
    case 'failed': return 'intake.read.failed';
    default: return vlm ? 'intake.read.vlm' : 'intake.read.unknown';
  }
}
