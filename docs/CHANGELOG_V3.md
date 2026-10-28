# Changelog: v3 (Documents + parity round) — 2026-10-26

Backend: 320 pytest passing. Frontend: 322 `node --test` passing. Manual smoke test of
upload → confirm → research → draft via curl against the real server, end to end with real Gemini, succeeded.

## Added

- **Documents feature**: new sidebar section (`#/matters`, `#/matters/new`, `#/documents/:id`) covering
  upload or paste → OCR + redaction → edit extracted fields → confirm → research precedents → pin up to
  5 authorities → hand off to a draft. Replaces the old intake-only flow; `/matters/new` now saves through
  `POST /api/documents` instead of an ad hoc blob.
  - Routes: `backend/document_routes.py` (service in `backend/documents.py`) — `POST/GET /api/documents`,
    `GET /api/documents/{id}`, `GET /api/documents/{id}/text`, `GET /api/documents/{id}/file`,
    `PATCH /api/documents/{id}`, `PUT /api/documents/{id}/extraction`, `POST /api/documents/{id}/confirm`,
    `POST /api/documents/{id}/archive`, `POST /api/documents/{id}/research`,
    `GET/POST /api/documents/{id}/pins`, `DELETE /api/documents/{id}/pins/{judgment_id}`,
    `POST /api/documents/{id}/draft-params`.
  - Tables: `documents`, `document_text`, `document_extractions`, `document_pins`.
  - Frontend: `frontend/app/js/pages/documents.js`, `document.js`, and their `*-logic.js`/`*-ui.js` libs.
- **Judgment reader**: real paragraph list (`GET /api/judgment/{id}/paragraphs`) and cited-by/cites treatment
  view (`GET /api/judgment/{id}/treatments`), backed by new `judgment_paragraphs` and `judgment_treatments`
  tables, plus a `backend/ingest/adapters` scaffold (`base.py`, `scitation.py`) for a future citator feed.
- **Citation graph / lineages**: `GET /api/lineages`, seeded idempotently from the front-end's hard-coded
  lineage data into `lineage_streams`/`lineage_nodes`.
- **Saved searches**: `GET/POST /api/saved_searches`, `DELETE /api/saved_searches/{id}` (table `saved_searches`,
  max 50 per user), `GET /api/courts` for the Research court filter.
- **Draft versions/restore**: `GET /api/drafts/{id}/versions/{n}` (full snapshot), `POST /api/drafts/{id}/restore/{n}`.
- **Persisted user suspension**: `user_status` table; `/api/admin/toggle_user` survives restarts.
- **Home KPIs, audit, chamber, dark theme, Ctrl K, citation-document-check** and the rest of the UI gap list
  from `docs/legacy_review/COMPARE_A.md` / `COMPARE_B.md` (P1/P2 items) closed in this round.
- `database.run_migrations()`: idempotent migration runner (tracked in `schema_migrations`), safe to run
  repeatedly against the real 329 MB database without touching existing rows.

## Changed

- **Search**: `POST /api/search` adds `offset`, `sort` (relevance|bench|newest|oldest), `year_from`,
  `year_to`; response adds `total`, `offset`, `filters_relaxed` (true only when an unfiltered fallback was
  substituted — never silent).
- **Drafts**: `draft_judgment`/`save_draft` accept `document_id`, `petitioner`, `respondent`, `prayer`,
  `outcome`, linking a draft back to its source document; `sections`/`current` allow regenerating only
  selected sections; `update_status` requires a `reason` (≥5 chars) on `RETURNED`, stored in
  `draft_versions.note`; `GET /api/draft/{id}` surfaces `last_return_reason`.
- **UI gaps closed**: search filters/sort/pagination, judgment reader paragraphs/cited-by, citation ↔
  document check, studio regenerate/versions/reasons, Home KPI strip, audit IP column/export/pagination,
  Chamber (user directory) page, dark theme, Ctrl K command palette, citation-graph lineages with real
  node links — see `docs/legacy_review/COMPARE_A.md` and `COMPARE_B.md` for the full before/after per item.
- **OCR**: failures now return an honest empty-fields payload (`source: "failed"`) instead of a canned
  transcript; no result is invented for a real upload.

## Security

- `GYANAM_ALLOW_LEGACY_HEADER` now defaults to `0` (was `1`) — the tokenless `X-Gyanam-Legacy` header no
  longer works unless explicitly re-enabled.
- Endpoints that used to answer anonymously now require a token: `/api/dashboard_metrics`,
  `/api/cases/recent`, `/api/verify_citations`, `/api/sync/status`, `/api/sync/history`,
  `/api/ocr/anonymize`, `/api/search`, `/api/judgment/{id}`.
- `/api/status` without a token returns only `{status, version, time}`; the full payload needs a token.
- `/api/auth/roles` returns only sign-in card fields — no emails, badge ids or permission lists.
- User suspension (`/api/admin/toggle_user`) now persists in `user_status` and is enforced by
  `get_current_user_from_header` (403 `ACCOUNT_SUSPENDED`), instead of an in-memory flag that reset on
  restart and was never checked at sign-in.
- `/api/dashboard_metrics` is role-scoped: corpus counts for everyone; activity counts need `DRAFT_FULL`
  or `VIEW_AUDIT`; recent audit rows need `VIEW_AUDIT`.
- `/api/audit_logs` adds `until`, `role`, `offset`; `/api/export/audit_csv` streams every matching row
  (no more 500-row cap) and neutralises spreadsheet formula injection (`= + - @` cells get a leading `'`).
- Print export escapes every value; sync batch size and ledger-block queries are capped (≤500).
- Sync status/history are explicitly labelled `mode: "simulated"` — no invented latency or protocol strings.

## Known limitations (carried forward)

- No real paragraph-level judgment text: `judgment_paragraphs`/`judgment_treatments` exist and are wired
  into the API (`available: false` when empty), but nothing populates them yet beyond the handful of
  seeded landmark cases — the corpus is still metadata-plus-PDF for the other ~118,000 rows.
- No SCitation (or any real citator) integration: `backend/ingest/adapters/scitation.py` raises
  `NotConfigured` until credentials exist; treatment/"good law" status is still the single
  `precedent_status` column, not a real citator feed.
- Sign-in still has no password: `/api/auth/sso/nluj` issues a token for any role name, and
  `/api/auth/login` mints one for any unknown email (unused by the UI, but still reachable).
- Hindi strings are unreviewed by a native speaker — the `hi.js`/`*.hi.js` translations exist and are
  wired up, but haven't had a linguistic QA pass.
- No digital signature on sealed drafts: the review page shows a real SHA-256 of the exported DOCX, but
  "Signature: not connected" — there is no PKCS#7/PAdES signature, DSC/eSign integration, or §63 BSA /
  §65B certificate text.
