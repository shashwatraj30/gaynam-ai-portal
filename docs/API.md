# API reference (current)

This is the live API surface, read from the route decorators and Pydantic models in `backend/server.py`,
`backend/document_routes.py`, `backend/search_routes.py`, `backend/corpus_routes.py`, `backend/draft_routes.py`
and `backend/ui_routes.py`. `docs/API_V3_CONTRACT.md` is the earlier build plan the agents worked from; where
this file and that one disagree, this file describes what was actually built (noted inline).

Unless marked otherwise, every route needs `Authorization: Bearer <token>`. Errors are
`HTTPException(status_code, detail={"code", "message"})` or the `AuthError` shape (401 `AUTH_REQUIRED`,
403 `FORBIDDEN_PERMISSION`). Times are ISO-8601 UTC strings. `require(perm)` needs exactly that permission;
`require_any(a, b, ...)` needs at least one. With `GYANAM_ENFORCE_AUTH=0` or a trusted `X-Gyanam-Legacy: 1`
header (only honoured when `GYANAM_ALLOW_LEGACY_HEADER=1`, default `0` now), permission checks are bypassed.

## Auth

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/api/auth/login` | none | `LoginRequest {username_or_email, password="vidhi2026"}` | `{access_token, token_type, user}`. **Still insecure**: the password is never checked; any unknown email mints a token with a synthetic LAW_CLERK profile. Not called by the new UI. |
| POST | `/api/auth/sso/nluj` | none | `SSOLoginRequest {target_role}` | `{access_token, token_type, user}` for a fixed institutional profile keyed by role (passwordless by design — this is the sign-in flow the UI actually uses). |
| GET | `/api/auth/me` | token | — | `{user, role_details}` |
| GET | `/api/auth/roles` | none | — | `{roles: {role: {title, scope_access}}, directory: [{role, full_name, designation, institution, scope_role}]}` — no emails, badge ids or permission lists (hardened; contract only said "sign-in card fields"). |

## Search (`search_routes.py` for courts/saved searches; `/api/search` itself is in `server.py`)

| Method | Path | Auth | Body / query | Returns |
|---|---|---|---|---|
| POST | `/api/search` | `SEARCH` | `SearchRequest {query, court="ALL", judge="", precedent_status="ALL", limit=20, offset=0, sort="bench" (relevance\|bench\|newest\|oldest), year_from?, year_to?}`; `limit` effectively capped at 100 in `search_service.run_search` | `{results: [SearchRow], total, offset, sort, filters_relaxed}`. `filters_relaxed=true` only when the filtered query had zero hits and unfiltered results were substituted — never silent, matches contract. |
| GET | `/api/judgment/{id}` | `SEARCH` | — | Full judgment row + `district`, curation flags; 404 if missing |
| GET | `/api/judgment/{id}/graph` | `SEARCH` (`ui_routes.py`) | — | citation graph (nodes/edges) for the layered SVG view |
| GET | `/api/judgment/{id}/paragraphs` | `SEARCH` (`corpus_routes.py`) | — | `{items: [{para_no, text, page}], available}` — `available=false` while `judgment_paragraphs` is empty for that judgment (true for essentially all rows today; nothing populates this table yet) |
| GET | `/api/judgment/{id}/treatments` | `SEARCH` (`corpus_routes.py`) | — | `{cited_by, cites, available}` — same honesty gate; `judgment_treatments` has no real data source wired up |
| GET | `/api/courts` | `SEARCH` | — | `{items: [{court, label, count}]}` distinct courts with counts, for the Research court filter |
| POST | `/api/verify_citations` | `VERIFY_CITATION` or `SEARCH` | `{text}` | `{verifications: [...]}` bulk citation scan |
| POST | `/api/verify_single_citation` | any token | `{citation}` | single verification result (regex match, falls back to a DB `LIKE` search) |
| GET | `/api/saved_searches` | `SEARCH` | — | `{items: [{id, name, query, filters, created_at}]}` for the caller |
| POST | `/api/saved_searches` | `SEARCH` | `{name, query, filters?}` | created item; 422 `INVALID_NAME`/`INVALID_QUERY`; 409 `LIMIT_REACHED` past 50 per user |
| DELETE | `/api/saved_searches/{id}` | `SEARCH` | — | `{ok: true}`; 404 if not the owner |
| GET | `/api/cases/recent` | any token | `limit` (≤50) | `{count, recent_cases}` |

## Documents (`document_routes.py`, service in `documents.py`)

Permission is `require_any("UPLOAD_PLEADING", "DRAFT_FULL")` unless noted. All errors raised as `documents.DocError`
are turned into `HTTPException(e.status, e.detail())`.

| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/api/documents` | multipart: `file` OR `text`; `doc_type` (default `OTHER`); `title?`; `matter_key?`; `sample?` (`pleading`, `degraded`, `fir_04_17`, `fir_06_17`). Needs `UPLOAD_PLEADING` specifically (tighter than the shared `require_any`). | 201 `Document` (status `READ`, extraction v1, `confirmed=false`); `source="failed"` with empty text when nothing could be read; 422 `NO_INPUT`/`INVALID_SAMPLE` |
| GET | `/api/documents` | `matter_key, doc_type, status, q, limit (≤100, default 25), offset` | `{items: [Document minus extraction text], total}`, newest first; `ARCHIVED` hidden unless `status=ARCHIVED` |
| GET | `/api/documents/{id}` | — | `Document` (+`drafts`); 404 `DOCUMENT_NOT_FOUND` |
| GET | `/api/documents/{id}/text` | `offset=0, limit=20000 (≤200000)` | `{text, offset, total_chars}` (redacted text only) |
| GET | `/api/documents/{id}/file` | — | original file as `FileResponse`, RFC 5987 `Content-Disposition`; 404 `FILE_NOT_AVAILABLE` for pasted text or a missing stored file; logs `DOCUMENT_FILE_VIEWED` |
| PATCH | `/api/documents/{id}` | `{title?, doc_type?, matter_key?}` | `Document`; 422 `INVALID_DOC_TYPE`/`INVALID_TITLE` |
| PUT | `/api/documents/{id}/extraction` | `{fields, issues, version}` | `Document` with a new extraction version (`confirmed=false`); 409 `VERSION_CONFLICT` (body includes `current_version`) |
| POST | `/api/documents/{id}/confirm` | `{version}` | `Document` (`status=CONFIRMED`, `extraction.confirmed=true`); 422 `EXTRACTION_INCOMPLETE` unless case_title, facts and ≥1 issue are present — this is the confirm-before-draft gate |
| POST | `/api/documents/{id}/archive` | — | `Document` (`status=ARCHIVED`); no hard delete exists anywhere in this API |
| POST | `/api/documents/{id}/research` | `{limit_per_issue (≤10, default 5)}`; also needs `SEARCH` | `{issues: [{issue, query, results: [SearchRow]}], statutes: {query, results}}` |
| GET | `/api/documents/{id}/pins` | — | `{items: [{judgment_id, title, citation, court, precedent_status, issue_ref, note, added_by, added_at}]}` |
| POST | `/api/documents/{id}/pins` | `{judgment_id, issue_ref?, note?}` | same shape as GET; 404 `JUDGMENT_NOT_FOUND`; 409 `PINS_FULL` past 5 |
| DELETE | `/api/documents/{id}/pins/{judgment_id}` | — | same shape as GET; 404 `PIN_NOT_FOUND` |
| POST | `/api/documents/{id}/draft-params` | — | `{params: {...}, authorities: [...]}`; 409 `NOT_CONFIRMED` if the document isn't confirmed yet |

Audit actions: `DOCUMENT_UPLOADED`, `DOCUMENT_UPDATED`, `DOCUMENT_EXTRACTION_SAVED`, `DOCUMENT_CONFIRMED`,
`DOCUMENT_ARCHIVED`, `DOCUMENT_RESEARCHED`, `DOCUMENT_PIN_ADDED`, `DOCUMENT_PIN_REMOVED`, `DOCUMENT_FILE_VIEWED`.

`/api/save_draft` and `/api/draft_judgment` (below) accept optional `document_id`, `petitioner`, `respondent`,
`prayer`, `outcome` to link a draft back to the document it came from.

## Drafts (`draft_routes.py` for versions/restore; the rest is in `server.py`; generation in `judgment_engine.py` / `drafts_service.py`)

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/api/draft_judgment` (alias `/api/draft/generate`) | `DRAFT_FULL` | `DraftRequest {case_title, case_number, court, facts, petitioner_arguments, respondent_arguments, issues, statutory_provisions, gemini_api_key?, sections: [int 1..15]\|null, current: {section_key: text}?, outcome?, authorities?, document_id?, petitioner?, respondent?, prayer?}` | Full `draft_content_json`, or only the requested keys plus `engine` when `sections` is set |
| POST | `/api/save_draft` | `DRAFT_FULL` | `SaveDraftRequest {draft_id?, case_title, case_number, court, facts, issues, petitioner_arguments, respondent_arguments, statutory_provisions, draft_content_json, status="DRAFT", reviewed_by?, version?, document_id?, petitioner?, respondent?, prayer?, outcome?}` | `{draft_id, version, ...}`; 409 on `drafts_svc.DraftError` (e.g. version conflict) |
| GET | `/api/drafts` | `DRAFT_FULL` | — | list of drafts with normalised status |
| GET | `/api/draft/{id}` | `DRAFT_FULL` | — | full draft incl. `last_return_reason` (latest `RETURNED` note or null) |
| GET | `/api/drafts/{id}/versions` | `DRAFT_FULL` | — | version rows, each with `note` |
| GET | `/api/drafts/{id}/versions/{n}` | `DRAFT_FULL` (`draft_routes.py`) | — | `{version, saved_at, saved_by, status, note, snapshot}` (`snapshot`=stored draft JSON, or null for status-only versions) |
| POST | `/api/drafts/{id}/restore/{n}` | `DRAFT_FULL` (`draft_routes.py`) | `{version?}` (expected current version) | draft as `GET /api/draft/{id}` returns it, as a new version with note `Restored from v{n}`; 409 on version mismatch or `DRAFT_SEALED` |
| POST | `/api/draft/update_status` | `DRAFT_FULL` | `{draft_id, status?, new_status?, reviewer_name?, reason?, version?}` | updated draft; `reason` required (≥5 chars) when moving to `RETURNED` (422 `REASON_REQUIRED` otherwise), stored in `draft_versions.note` and the audit details; finalizing (`BENCH_APPROVED`→`FINAL_SEALED`) additionally needs `FINALIZE_JUDGMENT` (or legacy fallback) |
| GET | `/api/draft/export/docx/{id}` | `EXPORT_DRAFT`, `EXPORT_GAZETTE` or `DRAFT_FULL` | — | `.docx` stream, High Court formatting, SHA-256'd filename-safe |
| GET | `/api/draft/export/print/{id}` | same as above | — | printable gazette HTML |

Status machine: `DRAFT → IN_REVIEW → BENCH_APPROVED → FINAL_SEALED`, with `RETURNED → DRAFT`. `FINAL_SEALED` is terminal (immutable; 409 `DRAFT_SEALED`/`ILLEGAL_TRANSITION` on any further transition).

## Corpus, lineages, paragraphs (`corpus_routes.py`)

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/lineages` | `SEARCH` | `{streams: [{id, title, subtitle, nodes: [{id, judgment_id, year, title, citation, holding, coram, bench, impact, overruled}]}]}`, seeded once (idempotent `INSERT OR IGNORE`) from the front-end's hard-coded lineage data; `holding`/`coram`/`bench`/`impact` are empty strings — not recorded anywhere yet |
| GET | `/api/judgment/{id}/paragraphs` | `SEARCH` | see Search section above |
| GET | `/api/judgment/{id}/treatments` | `SEARCH` | see Search section above |

`backend/ingest/adapters/base.py` defines `SourceAdapter` (`fetch_judgment`, `fetch_paragraphs`, `fetch_treatments`);
`scitation.py` raises `NotConfigured` until real credentials exist — there is no live citator feed.

## Matters, graph, alerts (`ui_routes.py`)

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/matters` | `DRAFT_FULL` or `UPLOAD_PLEADING` | `{matters: [...], total}` — drafts grouped by matter key, with status counts and next-action label |
| GET | `/api/matters/{key}` | `DRAFT_FULL` or `UPLOAD_PLEADING` | one matter: drafts, documents, merged audit/document event timeline; 404 if the key has neither drafts nor documents |
| GET | `/api/judgment/{id}/graph` | `SEARCH` | citation graph for the per-judgment layered view |
| GET | `/api/alerts` | `DRAFT_FULL` | `{alerts: [...], total}` — drafts that cite a judgment now `precedent_status=OVERRULED` |

## Admin (`server.py`)

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| GET | `/api/admin/users` | `MANAGE_USERS` | — | `{users: [...]}` incl. live `status` from `user_status` |
| POST | `/api/admin/toggle_user` | `MANAGE_USERS` | `{email\|username\|user_id}` | `{success, email, new_status}`; 409 `CANNOT_SUSPEND_SELF`; write persists in `user_status` (survives restart — contract/CLAUDE.md item), and `get_current_user_from_header` then rejects that user with 403 `ACCOUNT_SUSPENDED` |

## Audit (`server.py`)

| Method | Path | Auth | Query | Returns |
|---|---|---|---|---|
| GET | `/api/audit_logs` | `VIEW_AUDIT` or `EXPORT_AUDIT_LOGS` | `action, user, q, since, until, role, offset, limit (≤1000; default 50 unfiltered / 200 filtered)` | `{logs, total, offset}` |
| GET | `/api/export/audit_csv` | `VIEW_AUDIT` or `EXPORT_AUDIT_LOGS` | same filters + `bom` | streamed CSV of every matching row (no cap — contract item; cells starting `= + - @` are quote-prefixed against formula injection) |
| GET | `/api/audit/ledger/verify` | `VIEW_AUDIT` or `VERIFY_LEDGER` | — | ledger hash-chain verification result |
| GET | `/api/audit/ledger/blocks` | `VIEW_AUDIT` or `VERIFY_LEDGER` | `limit (≤500)` | recent ledger blocks |
| GET | `/api/dashboard_metrics` | any token | — | role-scoped: corpus counts for everyone; `searches_performed`/`drafts_created` need `DRAFT_FULL` or `VIEW_AUDIT`; `active_users`/`system_health`/`recent_activity` need `VIEW_AUDIT`; `sync_status` needs `MANAGE_CORPUS` or `VIEW_AUDIT` |

## Sync (`server.py`)

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/sync/status` | `MANAGE_CORPUS` or `VIEW_AUDIT` | current sync state; `mode: "simulated"` — no real court feed |
| POST | `/api/sync/trigger` | `MANAGE_CORPUS` | `batch_size` (≤500) | sync result; logs `SYNC_TRIGGERED` |
| GET | `/api/sync/history` | `MANAGE_CORPUS` or `VIEW_AUDIT` | recent sync batches |

## OCR / intake (`server.py`)

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/api/ocr/process_brief` | `UPLOAD_PLEADING` | multipart `file`, `client_text?`, `gemini_api_key?` | OCR/extraction result; honest failure payload (empty fields, `source="failed"`) if nothing could be read — never a canned transcript |
| POST | `/api/ocr/anonymize` | `UPLOAD_PLEADING` | `{text}` | redaction result; now requires a token (previously open) |
| POST | `/api/upload_pleading` | `UPLOAD_PLEADING` | multipart `file` | `{filename, stored_filename, parsed}` — the older, non-Documents intake path; still present, superseded in the UI by `POST /api/documents` |

## Docs (`server.py`)

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/docs/list` | none (restricted docs filtered unless caller has `MANAGE_USERS`) | `[{filename, title, path}]` |
| GET | `/api/docs/read/{filename}` | none, except `MANAGE_USERS` for `RESTRICTED_DOCS` | `{filename, content}`; only exact basenames from `/api/docs/list` are served (no path traversal) |

## Status

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/status` | none | tokenless callers get `{status, version, time}` only; a valid token (or trusted legacy header) gets the full payload (corpus counts, court/status distribution, sync telemetry, compliance flags) |

## Differences from `docs/API_V3_CONTRACT.md`

- The contract describes `document_routes.py`/`search_routes.py`/`draft_routes.py`/`corpus_routes.py` as "the" routers; in practice most Documents-era routes that aren't document-, search-, draft- or corpus-specific (matters, judgment graph, alerts, admin, audit, sync, docs) still live in `server.py` and `ui_routes.py`, as before. The contract didn't claim otherwise but is easy to misread as "everything v3 moved."
- `/api/auth/roles` goes further than "sign-in card fields": it strips emails, badge ids and permission lists entirely, returning only `{title, scope_access}` per role and a directory with no identifiers.
- `GET /api/documents/{id}/file` 404s with `FILE_NOT_AVAILABLE` for both "no file stored" and "the stored file went missing from disk" — the contract only mentions the first case.
- `/api/auth/login` and `/api/auth/sso/nluj` are unchanged from the pre-v3 security posture (no password); the contract's security section is explicit that "sign-in itself unchanged," so this isn't a gap, but it's worth restating here since everything else in Auth got tightened.
