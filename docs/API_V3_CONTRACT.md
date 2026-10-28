# API v3 contract (Documents + parity work)

Backend and frontend agents build against this file. Change it only through the orchestrator.
All routes need `Authorization: Bearer <token>`; errors use the existing `{detail: {code, message}}` /
`AuthError` shapes (401 `AUTH_REQUIRED`, 403 `FORBIDDEN_PERMISSION`). Times are ISO-8601 UTC strings.
Every mutating route writes `log_audit(ACTION, details, request=request)` and the details contain the id.

Schema: `backend/database.py` migrations 002-008 (`documents`, `document_text`, `document_extractions`,
`document_pins`, `draft_judgments.document_id`, `saved_searches`, `user_status`, `draft_versions.note`,
`judgment_paragraphs`, `judgment_treatments`, `lineage_streams`, `lineage_nodes`, audit indexes).

Routers (included from `server.py`): `document_routes.py`, `search_routes.py`, `draft_routes.py`, `corpus_routes.py`.

## Shared shapes

```
Document = {
  id, title, doc_type, status, source, matter_key, original_name, mime, size, sha256,
  chars, pages, redactions: [{type, count}], redaction_total,
  uploaded_by, uploaded_role, created_at, updated_at,
  extraction: Extraction | null,         # latest version
  pins_count, drafts: [{id, case_title, status, version}]   # only on GET /api/documents/{id}
}
Extraction = {
  version, confirmed: bool, saved_by, saved_at,
  fields: {court, case_number, case_title, petitioner, respondent, facts, prayer,
           statutory_provisions, petitioner_arguments, respondent_arguments},
  issues: [string],
  authorities: [{citation, status, matched_title, matched_id, source_pdf_url}]   # status as citation_verifier
}
SearchRow = existing /api/search row (id, title, court, bench, judges, judgment_date, year, citation,
  precedent_status, overruled_by, ratio_decidendi, headnote, source_pdf_url, bench_label, district, ...)
```

- `doc_type` ∈ FIR, PLAINT, WRITTEN_STATEMENT, PETITION, COUNTER_AFFIDAVIT, REJOINDER, APPEAL, APPLICATION,
  EVIDENCE_SUMMARY, PREVIOUS_ORDER, SUBMISSIONS, OTHER.
- `status` ∈ READ, CONFIRMED, ARCHIVED. `source` ∈ digital, ocr, vlm, pasted, sample, failed.
- Empty strings mean "not found in the document". The backend never invents text for real uploads.

## Documents (`document_routes.py`, service in `documents.py`)
Permission: `require_any("UPLOAD_PLEADING", "DRAFT_FULL")` unless noted.

| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | /api/documents | multipart: `file` OR `text`; `doc_type` (default OTHER); `title?`; `matter_key?`; `sample?` (`pleading`, `degraded`, `fir_04_17`, `fir_06_17`) | 201 `Document` (status READ, extraction v1 confirmed=false). 415/413 as `save_upload`. `source:"failed"` with empty text when nothing could be read. Requires UPLOAD_PLEADING. |
| GET | /api/documents | `matter_key, doc_type, status, q, limit (≤100, default 25), offset` | `{items: [Document without extraction text fields], total}` newest first; ARCHIVED hidden unless `status=ARCHIVED` |
| GET | /api/documents/{id} | | `Document` (+`drafts`) or 404 `DOCUMENT_NOT_FOUND` |
| GET | /api/documents/{id}/text | `offset=0, limit=20000 (≤200000)` | `{text, offset, total_chars}` (redacted text only) |
| GET | /api/documents/{id}/file | | original file (FileResponse, correct mime, `Content-Disposition: inline; filename=original_name`); 404 for pasted text |
| PATCH | /api/documents/{id} | `{title?, doc_type?, matter_key?}` | `Document` |
| PUT | /api/documents/{id}/extraction | `{fields, issues, version}` (version = current, else 409 `VERSION_CONFLICT`) | `Document` with new extraction version (confirmed=false) |
| POST | /api/documents/{id}/confirm | `{version}`; needs non-empty case_title, facts and ≥1 issue (else 422 `EXTRACTION_INCOMPLETE`) | `Document` (status CONFIRMED, extraction.confirmed=true) |
| POST | /api/documents/{id}/archive | | `Document` (status ARCHIVED). No hard delete exists. |
| POST | /api/documents/{id}/research | `{limit_per_issue (≤10, default 5)}`; needs SEARCH too | `{issues: [{issue, query, results: [SearchRow]}], statutes: {query, results}}` |
| GET | /api/documents/{id}/pins | | `{items: [{judgment_id, title, citation, court, precedent_status, issue_ref, note, added_by, added_at}]}` |
| POST | /api/documents/{id}/pins | `{judgment_id, issue_ref?, note?}`; max 5 pins → 409 `PINS_FULL` | same as GET |
| DELETE | /api/documents/{id}/pins/{judgment_id} | | same as GET |
| POST | /api/documents/{id}/draft-params | | `{params: {case_title, case_number, court, petitioner, respondent, facts, prayer, issues (string "(A) ..\n(B) .."), statutory_provisions, petitioner_arguments, respondent_arguments, document_id}, authorities: [{id, title, citation, court, status}]}`; 409 `NOT_CONFIRMED` if not confirmed |

Audit actions: DOCUMENT_UPLOADED, DOCUMENT_UPDATED, DOCUMENT_EXTRACTION_SAVED, DOCUMENT_CONFIRMED,
DOCUMENT_ARCHIVED, DOCUMENT_RESEARCHED, DOCUMENT_PIN_ADDED, DOCUMENT_PIN_REMOVED, DOCUMENT_FILE_VIEWED.
Details start with `document <id>` and include `matter <matter_key>` when set.

`/api/save_draft` and `/api/draft_judgment` accept optional `document_id`, `petitioner`, `respondent`, `prayer`, `outcome`
(stored on the draft; `document_id` links drafts back to the document).

## Search (`search_routes.py`, service in `search_service.py`)
- `POST /api/search` (handler moved to `search_service.run_search`, permission SEARCH). Body adds
  `offset (default 0)`, `sort` ∈ relevance|bench|newest|oldest (default bench), `year_from`, `year_to`;
  `limit` capped at 100. Response adds `total` (matches before paging), `offset`, `filters_relaxed: bool`
  (true only when the filtered query had no hits and unfiltered results are returned instead; never silent).
  Court/judge/status filters are applied inside the SQL on every path (including court=ALL + status filter).
- `GET /api/courts` (SEARCH) → `{items: [{court, label, count}]}` from `judgments` (distinct court, count desc).
- `GET /api/saved_searches` → `{items: [{id, name, query, filters, created_at}]}` for the caller (SEARCH).
- `POST /api/saved_searches` `{name, query, filters}` → item; max 50 per user (409 `LIMIT_REACHED`).
- `DELETE /api/saved_searches/{id}` → `{ok: true}` (only the owner; else 404).

## Drafts (`draft_routes.py`; generation in `judgment_engine.py`)
- `POST /api/draft_judgment` body adds `sections: [int 1..15] | null`, `current: {section_key: text}`
  (existing text so the model keeps context), `outcome`. With `sections`, only those keys are regenerated and the
  response `draft_content_json` contains only those keys plus `engine`.
- `GET /api/drafts/{id}/versions/{n}` (DRAFT_FULL) → `{version, saved_at, saved_by, status, note, snapshot}`
  (`snapshot` = the stored draft JSON, or null for status-only versions).
- `POST /api/drafts/{id}/restore/{n}` `{version}` (current version; 409 on mismatch, 409 `DRAFT_SEALED`)
  → the draft as `GET /api/draft/{id}` returns it, with a new version whose note is `Restored from v{n}`.
- `POST /api/draft/update_status` body adds `reason` (required, ≥5 chars, for RETURNED → 422 `REASON_REQUIRED`),
  `version` (optional optimistic check). Reason is stored in `draft_versions.note` and the audit details.
  `GET /api/draft/{id}` adds `last_return_reason` (latest RETURNED note or null).
- `GET /api/drafts/{id}/versions` rows add `note`.

## Corpus, lineages, paragraphs (`corpus_routes.py`)
- `GET /api/lineages` (SEARCH) → `{streams: [{id, title, subtitle, nodes: [{id, judgment_id, year, title, citation,
  holding, coram, bench, impact, overruled}]}]}` seeded once from the current front-end lineage data.
- `GET /api/judgment/{id}/paragraphs` (SEARCH) → `{items: [{para_no, text, page}], available: bool}`.
- `GET /api/judgment/{id}/treatments` (SEARCH) → `{cited_by: [{citing_id, title, citation, treatment, para_no, source_ref}],
  cites: [...], available: bool}` (`available=false` while the tables are empty for this judgment).
- `backend/ingest/adapters/base.py` (`SourceAdapter` with `fetch_judgment`, `fetch_paragraphs`, `fetch_treatments`)
  and `scitation.py` (raises `NotConfigured` until credentials exist).

## Security changes (server.py / auth.py) — sign-in itself unchanged
- Token required: `/api/dashboard_metrics`, `/api/cases/recent` (limit ≤50), `/api/verify_citations` (VERIFY_CITATION
  or SEARCH), `/api/sync/status`, `/api/sync/history` (MANAGE_CORPUS or VIEW_AUDIT), `/api/ocr/anonymize`
  (UPLOAD_PLEADING), `/api/search` + `/api/judgment/{id}` (SEARCH).
- `/api/status` without a token returns only `{status, version, time}`; with a token, the full current payload.
- `/api/auth/roles` returns only sign-in card fields (no badge ids or emails).
- `GYANAM_ALLOW_LEGACY_HEADER` default `0`.
- `/api/admin/toggle_user` persists in `user_status`; `get_current_user_from_header` rejects suspended users with
  403 `ACCOUNT_SUSPENDED`; `/api/admin/users` reads the table.
- `/api/dashboard_metrics` is role-scoped: everyone gets corpus counts; drafts/searches counts only with DRAFT_FULL
  or VIEW_AUDIT; recent audit rows only with VIEW_AUDIT.
- `/api/audit_logs` adds `until`, `role`, `offset`; returns `{logs, total, offset}` (keeps the old keys).
- `/api/export/audit_csv` honours the same filters, streams all rows (no 500 cap), prefixes `'` to cells starting with
  `= + - @`, optional `bom=1` for Excel.
- Print export escapes every value. Limits capped: ledger blocks ≤500, sync batch ≤500.
- Sync status/history carry `mode: "simulated"`; no invented latency/protocol strings; failed ingests log FAILED.
