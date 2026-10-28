// Pure logic for the Documents library (no DOM access; unit-tested in tests/documents.test.js).
// Backend facts (docs/API_V3_CONTRACT.md): doc_type, status and source are the canonical enums below.
import { extOf, humanSize, uploadErrorKey } from './intake-logic.js';

export { humanSize };

export const DOC_TYPES = [
  { value: 'FIR', key: 'docs.type.FIR' },
  { value: 'PLAINT', key: 'docs.type.PLAINT' },
  { value: 'WRITTEN_STATEMENT', key: 'docs.type.WRITTEN_STATEMENT' },
  { value: 'PETITION', key: 'docs.type.PETITION' },
  { value: 'COUNTER_AFFIDAVIT', key: 'docs.type.COUNTER_AFFIDAVIT' },
  { value: 'REJOINDER', key: 'docs.type.REJOINDER' },
  { value: 'APPEAL', key: 'docs.type.APPEAL' },
  { value: 'APPLICATION', key: 'docs.type.APPLICATION' },
  { value: 'EVIDENCE_SUMMARY', key: 'docs.type.EVIDENCE_SUMMARY' },
  { value: 'PREVIOUS_ORDER', key: 'docs.type.PREVIOUS_ORDER' },
  { value: 'SUBMISSIONS', key: 'docs.type.SUBMISSIONS' },
  { value: 'OTHER', key: 'docs.type.OTHER' },
];
export const DOC_TYPE_VALUES = DOC_TYPES.map((d) => d.value);
export const STATUSES = ['READ', 'CONFIRMED', 'ARCHIVED'];

/** Server allowlist for documents (narrower than the intake page). */
export const UPLOAD_EXT = ['pdf', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'tif', 'tiff'];
export const ACCEPT = UPLOAD_EXT.map((e) => `.${e}`).join(',');
export const MAX_BYTES = 64 * 1024 * 1024;
export const PAGE_SIZE = 25;

/** Samples offered on the upload card; `sample` is the value sent to the API. */
export const SAMPLES = [
  { sample: 'pleading', key: 'docs.sample.pleading', docType: 'PETITION' },
  { sample: 'degraded', key: 'docs.sample.degraded', docType: 'PETITION' },
  { sample: 'fir_04_17', key: 'docs.sample.fir0417', docType: 'FIR' },
  { sample: 'fir_06_17', key: 'docs.sample.fir0617', docType: 'FIR' },
];

export function docTypeKey(value) {
  const f = DOC_TYPES.find((d) => d.value === value);
  return f ? f.key : 'docs.type.OTHER';
}

/** Chip tone for a document status. */
export function statusTone(status) {
  if (status === 'CONFIRMED') return 'primary';
  if (status === 'ARCHIVED') return 'neutral';
  return 'info'; // READ and anything unknown
}
export function statusKey(status) {
  return STATUSES.includes(status) ? `docs.status.${status}` : 'docs.status.READ';
}

const SOURCE_KEYS = {
  digital: 'docs.source.digital', ocr: 'docs.source.ocr', vlm: 'docs.source.vlm',
  pasted: 'docs.source.pasted', sample: 'docs.source.sample', failed: 'docs.source.failed',
};
export function sourceLabelKey(source) { return SOURCE_KEYS[source] || 'docs.source.unknown'; }
export function sourceTone(source) { return source === 'failed' ? 'warn' : 'neutral'; }

/** Validate an upload. input = {file?, text?, sample?}. Returns null when fine, else an i18n key. */
export function validateUpload({ file, text, sample } = {}) {
  if (sample) return null;
  if (file) {
    if (!UPLOAD_EXT.includes(extOf(file.name))) return 'docs.err.type';
    if (file.size === 0) return 'docs.err.empty';
    if (file.size > MAX_BYTES) return 'docs.err.size';
    return null;
  }
  if (text != null) return String(text).trim() ? null : 'docs.err.noText';
  return 'docs.err.noFile';
}

/** Map an ApiError from create/list to an i18n key (null = say nothing, e.g. the user cancelled). */
export function createErrorKey(err) {
  const st = err && err.status;
  if (st === 413) return 'docs.err.size';
  if (st === 415) return 'docs.err.type';
  const k = uploadErrorKey(err);
  return k === 'intake.err.read' ? 'docs.err.read' : k;
}

const clean = (v) => (v == null ? '' : String(v).trim());

/** Query string -> filter state. Unknown type/status values are dropped. */
export function parseListQuery(params) {
  const p = params instanceof URLSearchParams ? params : new URLSearchParams(params || '');
  const type = clean(p.get('type')).toUpperCase();
  const status = clean(p.get('status')).toUpperCase();
  return {
    q: clean(p.get('q')),
    type: DOC_TYPE_VALUES.includes(type) ? type : '',
    status: STATUSES.includes(status) ? status : '',
    matter: clean(p.get('matter')),
  };
}

/** Filter state -> the page query string used in the URL; empty values are omitted. */
export function buildQueryString(f = {}) {
  const p = new URLSearchParams();
  if (clean(f.q)) p.set('q', clean(f.q));
  if (f.type) p.set('type', f.type);
  if (f.status) p.set('status', f.status);
  if (clean(f.matter)) p.set('matter', clean(f.matter));
  return p.toString();
}

/** URLSearchParams (or filter-state query string) -> api.documents.list params. */
export function buildListParams(source, { offset = 0, limit = PAGE_SIZE } = {}) {
  const f = parseListQuery(source);
  const out = { limit, offset };
  if (f.q) out.q = f.q;
  if (f.type) out.doc_type = f.type;
  if (f.status) out.status = f.status;
  if (f.matter) out.matter_key = f.matter;
  return out;
}
export function hasFilters(f) { return !!(f && (f.q || f.type || f.status || f.matter)); }

/** Flat view model for one list row. Dates stay raw (the page formats them). */
export function rowView(doc) {
  const d = doc || {};
  const failed = d.source === 'failed';
  return {
    id: d.id,
    href: `#/documents/${encodeURIComponent(d.id)}`,
    title: clean(d.title) || clean(d.original_name) || '',
    typeKey: docTypeKey(d.doc_type),
    statusKey: statusKey(d.status),
    statusTone: statusTone(d.status),
    sourceKey: sourceLabelKey(d.source),
    sourceTone: sourceTone(d.source),
    failed,
    redactions: Number(d.redaction_total) || 0,
    chars: failed ? 0 : Number(d.chars) || 0,
    pages: failed ? 0 : Number(d.pages) || 0,
    matter: clean(d.matter_key),
    by: clean(d.uploaded_by),
    at: d.created_at || null,
  };
}

/** Append a new page of rows to the current list without duplicates. */
export function mergePage(current, next) {
  const seen = new Set((current || []).map((d) => d.id));
  return [...(current || []), ...(next || []).filter((d) => !seen.has(d.id))];
}
