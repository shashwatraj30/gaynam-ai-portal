# Gyanam AI: Portal UI Redesign, Phased Spec-Driven Plan (v2)

| | |
|---|---|
| Status | **v2, ready for kickoff once the decisions in §15 are signed off** (24 Oct 2026) |
| Supersedes | v1 of the same day |
| Design source | Canvas "Gyanam AI — New Portal UI" (17 screens), plus the reference deck "Legal AI Platform: A Judge's Journey" |
| Scope | Replace the whole frontend (`frontend/index.html`, 6,708 lines, 95 top-level functions) with a new UI in the deck's style. Keep every working feature, and keep it wired to the FastAPI backend. Fix the backend defects the new UI depends on. |

---

## 0. What changed from v1: review findings

v1 was checked against the real code and the real database (`data/vidhi_legal.db`). These are the gaps it had and how v2 closes them.

| # | Gap in v1 | Evidence | Fix in v2 |
|---|---|---|---|
| G1 | **It assumed the corpus has real judgment content.** It doesn't. | The 118,096 rows are metadata records. `headnote` and `ratio_decidendi` are templates ("Judicial determination by High Court of Gujarat. Disposition: …") on 118,088 rows. `full_text` averages 846 characters (max 1,758). Only ~8 seeded landmark cases have a real ratio. | §2 "ground truth". The reader shows metadata and the **source PDF** (`source_pdf_url` is present on 118,088 rows). Paragraph view and ratio panels appear only when real text exists. Designs are corrected (§13). |
| G2 | It showed "Cited N times" and treatment counts. | `citing_cases_count` is hard-coded to **35** at ingest (`ingest_authentic_cases.py:245`). Only 10 distinct values exist. | The count is never shown unless the row is curated (§2.3 reliability flags). |
| G3 | It labelled results "Good law". | `precedent_status` is `FOLLOWED` by default on 118,094 rows. Only 2 rows are `OVERRULED`. "Followed" means "nothing recorded", not "verified good law". | The label becomes **"No adverse treatment recorded"**. Only "Overruled" is a strong signal (§3 P9). |
| G4 | It promised a real citation graph. | `cases_cited` is non-empty on **6 rows**. | Graph v1 = guided lineages plus a graph only where links exist. Citation extraction is a separate backend track (§8). |
| G5 | It built Matter grouping and History on raw `case_number` and on audit "who". | `case_number` variants such as "FIR No. 07/17 (AIRport P.S.)" vs "(AIRPORT P.S.)" and "Scanned Document Intake". **All 1,213 audit rows** have user "Hon'ble User (NLUJ)" and IP 127.0.0.1. | A normalised `matter_key` (§7.2 B5). `log_audit` records the real user from the token (B2). History before cutover is labelled "user not recorded". |
| G6 | **Role gating was only cosmetic.** | Login ignores the password and no route checks permissions. Without a token the server returns the Justice profile. | Server-side permission enforcement is added in P0 (B1). The UI hides items, and the API refuses them. |
| G7 | Security defects the new UI touches were not scheduled. | Path traversal in `/api/docs/read/{filename}`. Uploads are saved under client filenames into `sample_docs/`, so they overwrite each other. CORS is `*` with credentials. The old UI uses `innerHTML` everywhere. | P0 hardening (B3, B4). The frontend escapes by default, renders markdown with a sanitiser, and ships a CSP (§9.4). |
| G8 | Canned OCR output was indistinguishable from real output. | `/api/ocr/process_brief` returns a hard-coded FIR when it fails, and `_match_known_judicial_docket` returns canned text chosen by filename, both with `success: true`. | An additive `source` field (`ocr`, `vlm`, `digital_text`, `canned_sample`, `fallback`) (B6). The UI shows a "Sample data" banner and blocks drafting from canned text unless the user edits it. |
| G9 | There was no draft state machine, and autosave semantics were unsafe. | The DB holds `DRAFT`, `BENCH_APPROVED` and `FINAL_SEALED`. The old UI also sends `CHAMBER_REVIEW` and others. `update_status` accepts any string. `save_draft` without an id inserts a new row. | A canonical status set and allowed transitions, enforced server-side (B7). Autosave = create once, then update by id, with a `version` check against lost updates (B8). |
| G10 | There was no version control, no CI and no test-DB isolation. | The zip has no `.git`. The DB is 329 MB plus WAL. Every API call writes audit rows, so tests would pollute the real DB. | P0 adds a repo, `.gitignore`/LFS policy, CI, and `GYANAM_DB_PATH` pointing at a fixture DB in tests (§10). |
| G11 | The design set was incomplete. | Only happy-path, desktop, Justice-role screens. Missing: loading, empty and error states, 403/404, Ctrl K palette, settings, confirm dialogs, intake steps 1 and 3, generation progress, role-specific Homes, phone layouts. | A design-completion track **D0** runs in parallel with P0 (§13). |
| G12 | The fonts load from Google Fonts, but the deployment claims "air-gap ready". | `fonts.googleapis.com` in `<head>` | Fonts are self-hosted as WOFF2 under `frontend/app/fonts/` (P1). |
| G13 | Long-running work had no UX spec. | Draft generation with Gemini can take tens of seconds (nginx timeout 180 s). Without a key it returns in ~0.6 s from a template. | A progress state, Cancel, and an engine label ("Template draft" vs "AI-assisted draft") in the Studio (§11, P5). |
| G14 | There was no user acceptance, training or rollback plan. | n/a | UAT with a judge or clerk at the exit of P2, P3, P5 and P8. Feature flag and `/legacy` rollback. Training material in P8 (§11, §12). |
| G15 | Estimates had no contingency or dependency graph, and the parity count was wrong. | v1 said "~120 functions". The actual count is 95 top-level ones, plus nested ones. | §11 has a dependency graph, entry and exit criteria, and 20% contingency. The parity list is generated by script (§10.6). |
| G16 | The Gemini key was sent from the browser and kept in `localStorage`. | `localStorage.gemini_api_key`, plus the form field `gemini_api_key` | Decision D7 recommends a server-side key only. A per-user key stays possible behind a setting that is off by default. |

---

## 1. Goals and non-goals

**Goals**
1. Replace the UI with a calm, judge-first workspace like the deck's. Every page uses the same shell, tokens and components.
2. Keep 100% of today's working functions, each mapped and tested. There are no regressions in search, OCR intake, drafting, export or audit.
3. Fix the backend defects the new UI relies on: auth, audit identity, matter keys, statuses, uploads and fallbacks.
4. Make the UI **truthful**. It never displays synthetic numbers or default values as facts.

**Non-goals in this programme** (they go on the backend roadmap, §8):
- AI answer synthesis with claim binding.
- Quote-to-paragraph checks.
- Citation extraction for the 118k corpus.
- Live overruling detection.
- Raj eSign / RajSSO.
- Hindi summaries of judgments.
- The AWS Phase 2 architecture.

---

## 2. Ground truth: what the data and backend really support

Measured on 24 Oct 2026 against `vidhi_legal.db`.

### 2.1 Corpus
| Field | Reality | UI rule |
|---|---|---|
| Judgments | 118,096: Gujarat 43,556 · Telangana 20,402 · Bombay 18,809 · Uttarakhand 14,505 · Chhattisgarh 5,398 · SC 4,611 · Rajasthan 926 · … | Show the real counts, and format them in en-IN (1,18,096). |
| `title`, `court`, `bench`, `judges`, `judgment_date`, `cnr_number`, `docket_number` | Present on all rows | Primary display fields |
| `citation` | CNR on 113,484 rows. INSC 4,471, SCR 133, SCC 7. | Label CNR as "CNR", not as a law-report citation. |
| `headnote`, `ratio_decidendi` | Templated on all rows except ~8 seeded landmark cases | Show them only when `is_curated` is true. Otherwise show "Disposition: …" as metadata. |
| `full_text` | A metadata record of ~850 characters | Never render it as "the judgment". The judgment is the PDF. |
| `source_pdf_url` | Present on 118,088 rows (AWS Open Data S3, sci.gov.in) | The reader's main body: an embedded viewer with an "Open original" link |
| `precedent_status` | 118,094 FOLLOWED (the default), 2 OVERRULED | FOLLOWED → "No adverse treatment recorded". OVERRULED → red with `overruled_by`. |
| `citing_cases_count` | Hard-coded to 35 at ingest. Real only on curated rows. | Hidden unless curated |
| `cases_cited` | Non-empty on 6 rows | Graph only where links exist. Otherwise "No citation links recorded yet". |

**Curation flag.** B9 adds an `is_curated` boolean, derived as `case_id LIKE 'SCI-%'` or headnote not matching the template pattern. It is returned in search, judgment and graph payloads. All honesty rules key off this flag.

### 2.2 Drafts and workflow
- 52 drafts. Statuses in the DB: DRAFT 48, BENCH_APPROVED 2, FINAL_SEALED 2.
- `draft_content_json` holds `sections` (15 keys), `verified_citations`, `retrieved_precedents`, `primary_binding_authority` and `engine`.
- Facts sections can contain raw OCR noise (draft #48). Review must warn about it (§11 P5).
- Generation without a Gemini key takes ~0.6 s (template). With a key it calls a model cascade.

### 2.3 Audit
- 1,213 `audit_logs` rows and 1,201 ledger blocks, with the chain verifying. Every row has the same user and IP until B2 ships.
- The actions recorded are SSO_LOGIN, SEARCH_QUERY, VIEW_JUDGMENT, GENERATE_DRAFT_JUDGMENT, VERIFY_CITATION, OCR_PROCESSED_BRIEF, SAVE_DRAFT, SYNC_TRIGGERED, UPLOAD_PLEADING, PRINT_JUDGMENT, EXPORT_DOCX, DRAFT_STATUS_UPDATED and UPDATE_DRAFT.

### 2.4 What works well and is reused as-is
- FTS5 search with legal query expansion and bench-priority ranking.
- The citation verifier. It recognises SCC, INSC and others, and flags `(2008) 4 SCC 54` as OVERRULED.
- DOCX and print export, the hash-chained ledger, and the OCR pipeline for digital PDF, DOCX and TXT, and for images via RapidOCR.

---

## 3. Design principles: acceptance rules for every screen

| # | Principle | Review check |
|---|---|---|
| P1 | One page, one job | An H1 (serif) and at most one primary button |
| P2 | The same frame everywhere | Every route renders inside `shell.js`. No page draws its own nav. |
| P3 | Status is a word plus a colour | Every chip has text. Contrast is at least 4.5:1. |
| P4 | Show the source | Every authority opens its reader or PDF |
| P5 | Real data only | Every number traces to an API field marked reliable in §6 |
| P6 | Red = law changed or signature. Amber = attention. Green = verified or primary. | Token-usage lint (§10.5) |
| P7 | Keyboard and screen reader, **WCAG 2.1 AA** | axe: 0 serious issues. Everything reachable by Tab. Ctrl K works. |
| P8 | 1440, 1280, 1024 and 390 px | Visual baselines at 1440, 1024 and 390 |
| **P9** | **No default shown as a finding** | FOLLOWED → "No adverse treatment recorded". Synthetic counts are hidden. Canned or OCR-fallback text carries a banner. |
| **P10** | **The UI never decides what the server must enforce** | Every hidden control is also refused by the API for that role (B1) |

---

## 4. Visual language (design tokens)

`frontend/app/css/tokens.css` is the only place these values live. A stylelint rule bans raw hex values outside it.

- **Colour.** As in v1, validated on the canvas:
  - Base: `--bg #F6F5F1`, `--surface #FFF`, `--surface-2 #F1F0EB`, `--line #E4E2DC`.
  - Text: `--ink #1B1D1C`, `--ink-2 #4A4F4C`, `--muted #6A6F6C`.
  - Status: `--primary #1F5C45` (tint `#E5EEE9`), `--danger #A3271F` (`#FBEAE7`), `--warn #8A5A00` (`#FBF0D9`), `--info #2D4E8A` (`#E8EEF8`), `--highlight #F5E6B3`.
  - **New:** `--focus #2D6CDF` for the 2 px focus ring, and `--overlay rgba(27,29,28,.45)`.
- **Type.**
  - Source Serif 4 for headings and reading text, Inter for UI. Both are **self-hosted WOFF2** with `font-display: swap`, and the Devanagari subsets are Noto Serif and Noto Sans Devanagari for HI.
  - Scale: H1 40/48, H2 24/32, reading 18/32, body 15/24, UI 14/20, meta 13/18, chip 12/18.
- **Space and shape.** A 4 px grid. Gutter 40 (16 on phones). Card padding 24. Radius 10/8/999. Border plus a 2 px soft shadow. No gradients or edge stripes.
- **New tokens:**
  - Breakpoints `--bp-md 1024`, `--bp-sm 768`, `--bp-xs 480`.
  - Motion `--t-fast 120ms`, `--t 200ms`, all respecting `prefers-reduced-motion`.
  - z-index scale: sidebar 10, topbar 20, drawer 40, modal 50, toast 60.
- **Numbers and dates.** `Intl.NumberFormat('en-IN')` and `Intl.DateTimeFormat('en-IN')` live in `ui/format.js`. Never format inline.
- **Icons.** A 1.5 px stroke inline SVG sprite, `frontend/app/icons.svg`, which works offline.

---

## 5. Information architecture

### 5.1 Pages and routes (hash router; deep links survive reloads)
| Old (tab / modal / function) | New page (route) | Sidebar | Permission |
|---|---|---|---|
| `auth-gateway-modal`, `selectAuthRole`, `confirmAuthSignIn`, `instantSignInRole`, `switchJudicialRole` | Sign in `#/signin` | n/a | public |
| `tab-dashboard`, `loadDashboardMetrics`, `renderLiveCasesStream`, `loadSystemStatus` | Home `#/`, with a variant per role (§5.2) | Home | any |
| `tab-research`, `executeSearch`, `applyQuickSearch`, `toggleAdvancedFilters`, Bench Brief functions | Research `#/research[?q=]` | Research | SEARCH |
| `case-modal`, `viewJudgment`, `switchDossierTab`, copy and print functions | Judgment reader `#/judgments/:id` | Judgments | SEARCH |
| `tab-citation`, `executeSingleCitationVerify`, `applyCitationSample` | Citation check `#/judgments/check` | Judgments | VERIFY_CITATION |
| *(new)* | Matters `#/matters`, Matter `#/matters/:key` | Matters | DRAFT_FULL or UPLOAD_PLEADING |
| `tab-intake` and all intake functions | New matter `#/matters/new` (3 steps) | Matters | UPLOAD_PLEADING |
| *(unused today)* `/api/drafts` | Drafts `#/drafts` | Drafts | DRAFT_FULL |
| `tab-studio`, `generateDraftJudgment`, `renderDraftSections`, `saveCurrentDraft`, section breakdown, solved cases | Studio `#/drafts/:id` | Drafts | DRAFT_FULL |
| `advanceDraftStage`, `downloadOfficialDocx`, `openOfficialPrintView` | Review and sign `#/drafts/:id/review` | Drafts | DRAFT_FULL. Approve needs FINALIZE_JUDGMENT. |
| `tab-graph`, `switchLineageStream` | Citation graph `#/graph[/:id]` | Citation graph | SEARCH |
| *(new)* | Alerts `#/alerts[/:id]` | Alerts (badge) | DRAFT_FULL |
| `tab-audit` ledger, `loadAuditLogs`, `verifyLedgerIntegrity` | Audit trail `#/audit` | Audit trail | VIEW_AUDIT |
| `tab-audit` users, `loadAdminUsers`, `toggleAdminUser` | Chamber and access `#/chamber` | Chamber | MANAGE_USERS |
| `docs-modal`, `loadDocContent`, `renderMarkdownDossier` | Library `#/library[/:file]` | Library | any. The commercial proposal needs MANAGE_USERS. |
| `triggerCourtSync`, live dispatch | Top-bar freshness indicator plus "Sync now" | n/a | MANAGE_CORPUS |
| *(new)* | Settings `#/settings` (language, density, optional AI key per D7) | User menu | any |
| *(new)* | 403 `#/forbidden`, 404 `#/not-found`, an offline banner | n/a | n/a |
| Campus hero, sidebar retract, `handleScrollAnimation` | **Dropped** (decoration). Sidebar collapse is kept as a shell feature. | n/a | n/a |

`presentation.html` and `/pdf` stay outside the portal and are untouched.

### 5.2 Role-specific Home
| Role | Home shows |
|---|---|
| Judicial user | Ask box, matters by next action, attention card (alerts), new in the corpus |
| Researcher / law clerk | Ask box, matters by next action filtered to "assigned to me" (D8), recent research |
| Faculty / student | Ask box, recent research, guided lineages, new in the corpus. No matters or drafts. |
| Administrator / registrar | Corpus card (real counts by court), sync status and history, users summary, audit chain status |
| Auditor | Ledger chain status, recent activity, export. Lands on Audit trail by default. |

---

## 6. Frontend ↔ backend wiring matrix

**Reliable?** marks whether a field may be shown as fact (P5/P9). One canonical endpoint is used per action. Duplicates are noted.

| Endpoint | Method | Today | New consumer | Fields used (Reliable?) |
|---|---|---|---|---|
| `/api/auth/sso/nluj` | POST | yes | Sign in → Continue | token, user ✔ |
| `/api/auth/login` | POST | no | Sign in → "Use institutional email" (hidden until D3) | token, user ✔ |
| `/api/auth/me` | GET | no | Shell boot validates the token. Permissions come from `role_details.permissions`. | ✔ |
| `/api/auth/roles` | GET | no | Sign in list | ✔ |
| `/api/status` | GET | yes | Freshness indicator, Admin Home | counts ✔, `sync_telemetry` ✔, `compliance` ✘ (static claims, never shown) |
| `/api/dashboard_metrics` | GET | yes | Admin Home **only** for `total_judgments`, `top_courts`, `recent_activity` | ✔ for those; ✘ `searches_performed`, `drafts_created`, `active_users`, `system_health.*` (padded) |
| `/api/cases/recent` | GET | yes | Home "New in the corpus" | ✔ |
| `/api/sync/trigger`, `/status`, `/history` | POST/GET | partly | Sync now, freshness, Audit → Corpus sync | ✔ |
| `/api/search` | POST | yes | Research; Studio precedents | metadata ✔; `headnote`/`ratio` ✔ only if `is_curated`; `citing_cases_count` ✘ unless curated; `precedent_status` ✔ for OVERRULED only |
| `/api/judgment/{id}` | GET | yes | Reader | as above, plus `source_pdf_url` ✔ |
| `/api/verify_single_citation` | POST | yes | Citation check | ✔ |
| `/api/verify_citations` | POST | no | Studio claim check | ✔ |
| `/api/ocr/process_brief` | POST multipart | yes | New matter → upload | ✔ only when `source ∈ {digital_text, ocr, vlm}` (B6) |
| `/api/ocr/anonymize` | POST | yes | New matter → paste → Redact | ✔ |
| `/api/upload_pleading` | POST multipart | yes | New matter → plain pleadings | ✔ |
| `/api/draft_judgment` (canonical; `/api/draft/generate` is an alias and is not used) | POST | yes | Studio → Prepare draft | ✔ plus `engine` |
| `/api/save_draft` | POST | yes | Studio save/autosave (B8 semantics) | ✔ |
| `/api/drafts`, `/api/draft/{id}` | GET | no | Drafts, Studio, Review | ✔ |
| `/api/draft/update_status` (use the `status` field only) | POST | yes | Studio "send for review", Review stepper, Approve | ✔ (B7 transitions) |
| `/api/draft/export/docx/{id}`, `/print/{id}` | GET | yes | Review | ✔ |
| `/api/audit_logs`, `/api/audit/ledger/verify`, `/api/audit/ledger/blocks`, `/api/export/audit_csv` | GET | partly | Audit trail, Matter history | ✔ (user ✔ only after B2) |
| `/api/admin/users`, `/api/admin/toggle_user` | GET/POST | yes | Chamber | ✔. The toggle is in-memory, so label it "until restart" until B10. |
| `/api/docs/list`, `/api/docs/read/{file}` | GET | partly | Library | ✔ after B3 |
| `/api/verify_citations` (text) | POST | no | Review → final check across all sections | ✔ |

---

## 7. Backend work required by the UI

### 7.1 Principles
- **Additive or behaviour-preserving only** until cutover. The legacy UI must keep working.
- Every change ships with contract tests in the same PR.
- The parity rule: if a change alters a response, the legacy-UI smoke test must still pass.

### 7.2 P0 hardening and enablers (blocking)
| ID | Change | Why | Compatibility |
|---|---|---|---|
| B0 | Paths from `PROJECT_ROOT` plus env (`GYANAM_DB_PATH`, `GYANAM_UPLOAD_DIR`, `GYANAM_DOCS_DIR`). Secrets from env. Rotate the leaked Gemini key and JWT secret. Requirements install on Python 3.11 and 3.12. Fix the Dockerfile. | Runs anywhere; test isolation | No API change |
| B1 | Permission dependency `require(perm)` on mutating and admin routes:<br>• drafts → DRAFT_FULL<br>• status APPROVED/SIGNED → FINALIZE_JUDGMENT<br>• admin → MANAGE_USERS<br>• audit export → VIEW_AUDIT or EXPORT_AUDIT_LOGS<br>• sync trigger → MANAGE_CORPUS<br>• uploads → UPLOAD_PLEADING<br>A missing token returns 401 (behind `GYANAM_ENFORCE_AUTH`, default **on** for `/app`, so legacy keeps working via a header shim) | P10 | Legacy UI sends no token. The flag keeps it working until cutover. |
| B2 | `log_audit` takes the real user, role and client IP from the request | Truthful History and Audit | Additive |
| B3 | `/api/docs/read` accepts only basenames from `/api/docs/list`. Otherwise 404. | Path traversal | Same responses for valid files |
| B4 | Uploads are saved as `uploads/{uuid}{ext}`, with the original name stored. Size limit 64 MB, and an extension and MIME allowlist. | Overwrites, traversal | Same responses |
| B5 | `matter_key` = normalised `case_number` (casefold, strip "(… P.S.)", collapse separators), stored on save. Backfill script for the 52 drafts, plus a manual merge list. | Matter grouping | New nullable column |
| B6 | `source` field on OCR responses: `digital_text`, `ocr`, `vlm`, `canned_sample`, `fallback` | P9 | Additive field |
| B7 | Draft status set: `DRAFT → IN_REVIEW → BENCH_APPROVED → FINAL_SEALED`, plus `RETURNED` to DRAFT. Server-side transition check. Legacy values are mapped on read (`CHAMBER_REVIEW`/`UNDER_REVIEW` → `IN_REVIEW`; `SIGNED` → `FINAL_SEALED`). | Consistent workflow | The mapping keeps legacy values valid |
| B8 | `save_draft` returns a `version`. Updates send `version`; a mismatch returns 409. Autosave = one create, then updates. | Lost updates, duplicate rows | Version is optional, so legacy is unaffected |
| B9 | `is_curated` on judgment payloads | P9 | Additive |
| B10 | *(optional)* Persist user suspension in a `user_status` table | Chamber honesty | Additive |
| B11 | *(optional)* `POST /api/feedback` plus a `feedback` table | In-app feedback (D11) | Additive |

### 7.3 New read endpoints (additive)
| Endpoint | Built from | Phase |
|---|---|---|
| `GET /api/matters`, `GET /api/matters/{key}` | drafts grouped by `matter_key`, plus audit rows referencing their draft ids | P4 |
| `GET /api/audit_logs?action=&user=&q=&since=&limit=` | optional params on the existing route | P3 |
| `GET /api/judgment/{id}/graph` | `cases_cited` (6 rows) plus `overruled_by` links, so the 2 overruled pairs always show | P6 |
| `GET /api/alerts` | OVERRULED judgments × `retrieved_precedents` and `verified_citations` inside `draft_content_json` | P6 |
| `GET /api/drafts/{id}/versions` *(optional, D4)* | an append-only `draft_versions` table | P5 |

---

## 8. Honesty contract: deck features vs this programme

| Deck feature | Ships in this programme | Backend roadmap (separate track) |
|---|---|---|
| Written answer with verified chips | **Ranked authorities**, with metadata and PDF. No generated prose. | Answer synthesis with sentence-to-source binding |
| Five checks per claim | Shows **found in corpus** and **overruled?**. The other checks are shown greyed as "not checked yet". | Quote match, entailment, larger-bench conflict |
| Good law with treatment counts | "No adverse treatment recorded" or "Overruled by …". Counts only on curated rows. | Treatment classification |
| Paragraph roles (issue, reasoning, holding) | Curated rows only. Other rows show the PDF. | Full-text ingestion and paragraph segmentation |
| Citation graph | Guided lineages, plus graphs for the 6 linked and 2 overruled rows | Citation extraction from the PDFs of 118k judgments |
| Courts checked every 15 min | Real `last_sync_timestamp`, plus manual Sync | Scheduled daemon |
| Alert: law changed this morning | Alerts for overruled precedents cited in saved drafts | Live overruling detection |
| Matter timeline | Drafts and audit by `matter_key`. "User not recorded" before B2. | A first-class `matters` table |
| Raj eSign / OTP | "Approve" sets FINAL_SEALED, with the export SHA-256, labelled "digital signature not connected" | Raj eSign / RajSSO |
| EN / HI | UI chrome strings in both languages | Hindi summaries |

---

## 9. Frontend architecture

### 9.1 Stack (D1)
Zero-build **ES modules**, plain CSS and an SVG sprite. The tooling is dev-only: Node is used only for `node --test`, stylelint and eslint, and is never needed to serve the app.

### 9.2 Layout
```
frontend/app/
  index.html  icons.svg  fonts/
  css/   tokens.css base.css components.css pages.css
  js/
    main.js router.js api.js store.js format.js escape.js
    i18n/en.js i18n/hi.js
    ui/    shell sidebar topbar chip button card tabs list-row table timeline stat-tile
           check-list citation-chip source-panel pdf-viewer stepper modal drawer toast
           confirm search-palette empty-state error-state skeleton status
    pages/ signin home research judgment citation-check matters matter intake drafts
           studio review graph alerts audit chamber library settings forbidden not-found kit
  tests/   *.test.js  (node --test)
```

### 9.3 Rules
- **`api.js` is the only file that calls `fetch`.** There is one function per endpoint (§6). It adds the bearer token and maps errors to `ApiError {status, code, detail}`:
  - 401 → clear the session and go to `#/signin?next=`.
  - 403 → the Forbidden page.
  - 409 → the "changed elsewhere" dialog.
  - Network failure → the offline banner.
  - Each call has a timeout and an `AbortController`. Generation uses 120 s; everything else uses 20 s.
- **Statuses and labels are centralised** in `ui/status.js`. There is one mapping table for draft status → chip and for precedent status → chip (P9).
- **Pages** export `{route, title, permission, render(params, ctx) → Node, onLeave()}`. The router enforces `permission` before `render`.
- **Every page has four states:** skeleton, empty, error (message, Retry, request id), and data.
- **Cross-page hand-offs** go through `store`: the bench brief, intake → studio parameters, and alert → studio section. Session-scoped data goes to `sessionStorage`. Drafts are never kept only client-side.
- **Long work** (OCR, generation) shows a progress panel with Cancel. Navigating away asks for confirmation if unsaved work exists.

### 9.4 Security in the client
- Text goes through `escape.js` or `textContent`. **`innerHTML` is banned** by an eslint rule, with one exception: markdown in the Library, which is sanitised by a vendored, pinned DOMPurify.
- The `/app` CSP is `default-src 'self'; img-src 'self' data:; frame-src` S3/sci.gov.in hosts for PDFs; `connect-src 'self'`.
- The token is kept in `sessionStorage`, not `localStorage`. On a 401 the token is cleared.

### 9.5 Browsers (D9)
The latest two versions of Chrome, Edge and Firefox, plus Safari 16 and later. There's no IE or legacy Edge. Court desktops must be confirmed in D9.

### 9.6 Serving and cutover
- P0 mounts `/app` (StaticFiles, html=True) beside the legacy `/`.
- At P8, `/` serves `/app` and the old UI moves to `/legacy` for one release.
- `GYANAM_UI=legacy|new` switches between them in seconds, for rollback.

---

## 10. Quality, testing and delivery engineering

### 10.1 Repository and CI (P0)
- Initialise git.
- `.gitignore`:
  - `data/*.db*`, `uploads/`, `logs/`, `venv/`, `pydeps/`.
  - The DB is distributed separately with a checksum, or via Git LFS (D10).
- CI runs on every PR: ruff, pytest (contract), `node --test`, eslint and stylelint, then Playwright smoke, then axe. The nightly job runs the full journey and visual regression.

### 10.2 API contract tests (pytest + TestClient)
- The fixture DB is `tests/fixtures/mini.db`, built by `build_fixture.py`. It holds:
  - 300 judgments, including the 8 curated rows and both overruled pairs.
  - 6 drafts across 3 `matter_key`s (one citing K. J. Bhat, to trigger an alert).
  - 40 audit rows.
- `GYANAM_DB_PATH` points at a temp copy per test session. **The real DB is never touched.**
- One test file per area asserts the status code plus every field in §6, including the reliability flags (`is_curated`, `source`).
- Permission tests run every route × every role → expected 200, 401 or 403 (B1).
- Gemini is unset in CI. One test is marked `@pytest.mark.live_ai` and runs manually.

### 10.3 Frontend unit tests (`node --test`)
- `router` (matching, guards), `api` (payloads, error mapping, timeout; with fetch mocked), `status` mapping, `format` (en-IN), `escape`, `i18n` fallback, and `store` (bench brief, autosave queue).
- Coverage gate: 85% lines on `js/` excluding pages.

### 10.4 End-to-end (Playwright for Python)
- **Per-page smoke**: H1 present, no console errors, the expected requests and payloads, and all 4 states forced via route mocks.
- **Golden journey (Judicial user):**
  1. Sign in.
  2. Home loads.
  3. Research "Section 139 presumption" returns Rangappa first and K. J. Bhat last, marked Overruled.
  4. The reader opens a curated row (ratio visible) and a metadata row (PDF viewer visible, no ratio).
  5. Add to the bench brief.
  6. New matter: upload `sample_docs/handwritten_fir_sample.jpg`. Expect `source = ocr` (or `canned_sample` with the banner), then edit the fields and confirm the issues.
  7. Studio prepares the draft and shows the engine label.
  8. Claim check flags the seeded K. J. Bhat citation, and "Replace" opens Research.
  9. Autosave → reload → content persists, with no duplicate rows.
  10. Send for review, then Approve. The 403 path is tested as a Researcher.
  11. DOCX download and print view return 200.
  12. Audit shows the real user and the chain verifies.
- **Role journeys:**
  - Student: no Matters, Drafts or Chamber, and the API returns 403.
  - Auditor: lands on Audit.
  - Admin: suspend and reactivate with a confirm dialog.
- **Negative paths:** OCR failure, empty search, 409 conflict, expired token, offline.

### 10.5 Visual, accessibility, performance
- **Visual:** baselines at 1440, 1024 and 390 for every page, approved against the canvas. Threshold 0.2%.
- **Accessibility:** axe on every smoke test (0 serious or critical). Manual keyboard and NVDA pass at each phase exit. A stylelint token rule, plus a check for contrast pairs in `tokens.css`.
- **Performance budget** (Lighthouse CI on Home and Research):
  - Shell interactive under 1.5 s and JS under 120 KB uncompressed for the shell.
  - Research render under 200 ms after the response.

### 10.6 Parity checklist (generated)
- `scripts/parity_inventory.py` extracts every function, every `fetch` and every `id=` in the legacy `index.html` into `docs/ui_parity_checklist.md`.
- Each row is marked **moved → module**, **replaced by** or **dropped (reason)**. A phase can't exit with an open row in its area.

### 10.7 Definition of Ready and Definition of Done
- **Ready:**
  - The design for every state exists on the canvas.
  - The endpoint and its fields are in §6, with the contract test written (red).
  - Copy is approved in EN, with HI strings queued.
- **Done:**
  - Tests are green.
  - axe is clean.
  - Screenshots at 1440 and 390 are in the PR.
  - Parity rows are ticked.
  - No raw hex values and no `innerHTML`.
  - Strings go through `t()`.
  - Reviewed by one developer and the designer.

---

## 11. Phases

Effort is in developer-weeks (dw) for one frontend developer (FE) and one backend developer (BE, part-time). Contingency is added at the end.

```
D0 design completion ─┐
P0 foundations (BE+FE)┴─► P1 design system & shell ─► P2 sign-in/home ─┬─► P3 research/reader/check ─┐
                                                                          └─► P4 matters/intake ───────┴─► P5 studio/review ─► P6 graph/alerts ─┐
                                                                                                                      P7 audit/chamber/library ─┴─► P8 hardening & cutover
```

### D0: Design completion (designer, 1.5 weeks, in parallel with P0)
Covers everything §13 lists. **Exit:** the canvas has every page in every state and at 390 px, the copy corrections from §13.2 are applied, and the designer and product owner have signed off.

### P0: Foundations and safety net (BE 1.5 dw, FE 0.5 dw)
**Scope:** B0–B4 and B6–B9 from §7.2, `/app` mount, repo and CI, fixture DB, contract tests for every endpoint and role, a legacy-UI Playwright baseline, and the parity inventory.

**Exit:**
- A clone runs on Windows, macOS and Linux with one command.
- CI is green.
- The permission matrix test passes.
- The legacy UI still works, with the flag set for legacy.
- The leaked secrets are rotated.

### P1: Design system and app shell (FE 2 dw)
**Scope:**
- Tokens, self-hosted fonts, components (§9.2 `ui/`), shell (role-gated sidebar, top bar, palette, user menu), `api.js` with every endpoint, router guards, `status.js`, `format.js`, i18n EN, and the error and offline infrastructure.
- **Kit page** `#/_kit` showing every component in every state.

**Exit:**
- The Kit matches the canvas "Design system" board.
- Unit coverage ≥ 85%.
- axe is clean.
- 390 px works, with the sidebar as a drawer.

### P2: Sign in and Home (FE 1 dw)
**Scope:** Sign in (§5.1) and the role-specific Homes (§5.2). Data comes from `/api/drafts` until P4 provides `/api/matters`.

**Exit:**
- The token persists for the session.
- 401 → Sign in, and the user returns to `next`.
- Each role lands correctly.
- UAT #1: a judge or clerk walkthrough with feedback logged.

### P3: Research, Judgment reader, Citation check (FE 2 dw, BE 0.25 dw)
**Scope:**
- Three-column Research:
  - History from `audit_logs?action=SEARCH_QUERY&user=me` (only after B2; before that, "this browser's history" in `sessionStorage`).
  - Results with metadata-first cards and an `is_curated` ratio.
  - Source panel and bench brief tray.
- Reader with a curated layout and a metadata+PDF layout (`pdf-viewer` with an "Open original" fallback when framing is blocked).
- Citation check.

**Exit:**
- The search payload equals the legacy payload (contract test).
- No templated ratio is ever shown.
- Golden journey steps 3–5 pass.
- UAT #2.

### P4: Matters and intake (FE 1.5 dw, BE 0.5 dw)
**Scope:**
- B5 backfill, `/api/matters*`.
- The Matters list.
- The Matter page tabs: Overview, Documents, Research, Drafts and History, with "user not recorded" shown for pre-B2 rows.
- The 3-step New matter flow with a `source` banner (B6). Canned or fallback text can't proceed until it's edited or the user confirms "use as sample".

**Exit:**
- Every file in `sample_docs/` processes.
- The 52 drafts group into the expected matters (reviewed list).
- Golden journey step 6 passes.

### P5: Drafts, Studio, Review and sign (FE 2.5 dw, BE 0.5 dw)
**Scope:**
- **Drafts list:** filtered by the B7 statuses.
- **Studio:**
  - Issues (Gate 1), the 15-section outline, and editable sections.
  - The engine label, generation progress and Cancel.
  - Claim check via `/api/verify_citations`, with "Replace with overruling judgment" opening Research prefilled.
  - Autosave per B8, with the 409 dialog.
- **Review:**
  - The stepper and real stat tiles.
  - "Before you sign" checks, which include an **OCR-noise detector**: it flags sections whose non-dictionary or garbled-character ratio exceeds a threshold. This is real, from draft #48.
  - Approve, which needs FINALIZE_JUDGMENT; Return to clerk; DOCX and print.
- *(D4)* Version history.

**Exit:**
- Golden journey steps 7–11 pass.
- No duplicate rows from autosave.
- A Researcher gets 403 on Approve.
- UAT #3.

### P6: Citation graph and Alerts (FE 1.5 dw, BE 0.5 dw)
**Scope:**
- **Graph:** `/api/judgment/{id}/graph` and `/api/alerts`. The graph is SVG radial with ≤ 30 nodes. It has a **list view as an accessible equivalent**, and an empty state of "No citation links recorded yet" for the 118k uncurated rows. Guided lineages are kept.
- **Alerts:** list and detail. The sidebar badge and the Home attention card are switched on.

**Exit:**
- The fixture draft citing K. J. Bhat raises exactly one alert, and "Open with fix" lands on that section.
- The graph is keyboard-navigable.

### P7: Audit trail, Chamber, Library (FE 1 dw)
**Scope:**
- Audit: filters, ledger view, sync history, verify and CSV.
- Chamber: confirm dialog; label the change "until restart" unless B10 ships.
- Library: sanitised markdown and a contents rail.

**Exit:** the Auditor and Admin role journeys pass.

### P8: Hardening, Hindi and cutover (FE 1.5 dw, BE 0.25 dw)
**Scope:**
- **Quality passes:** responsive at 1024 and 390; HI strings reviewed by a native speaker; the performance budget; cross-browser (D9); an accessibility audit.
- **Release:** the cutover switch, `/legacy` kept for one release, then delete the legacy UI, `index.html.bak` and the Tailwind CDN.
- **Docs and training:** update the README, CLAUDE.md and `UI_UX_DESIGN_GUIDELINES.md` (replaced by tokens and the Kit). Short training guides and a 10-minute walkthrough video script for judges and clerks.

**Exit:** all suites are green, parity is 100%, UAT #4 is signed, and the rollback has been drilled once.

### Effort summary
| Track | FE dw | BE dw |
|---|---|---|
| P0–P8 | 13.5 | 3.5 |
| Contingency 20% | 2.7 | 0.7 |
| **Total** | **≈16** | **≈4.2** |

- **Calendar with one FE developer, a part-time BE developer and a designer for D0:** about 16 weeks.
- **With two FE developers**, P3 runs alongside P4 and P6 alongside P7: about 11 weeks.

---

## 12. Release, rollback and support
- **Environments.** Local, then staging (`staging.*`, using the fixture plus a nightly copy of the real DB), then production. Each phase ships to staging behind `/app` and is demoed there.
- **Rollback.** Flip `GYANAM_UI=legacy` (no deploy). DB changes are additive and nullable, so no down-migration is needed.
- **Feedback.** A "Send feedback" item in the user menu writes to a `feedback` table (B11, optional). Otherwise it opens a mailto to the support address (D11).
- **Support.** A known-issues page in the Library, and an error id shown in every error state that maps to server logs.

---

## 13. Design backlog (D0)

### 13.1 Missing designs to add to the canvas
1. **States sheet:**
   - Skeletons for list, card and reader.
   - Empty states: no results, no matters, no alerts, no graph links.
   - Errors: inline, page and offline.
   - 403 and 404 pages.
2. **Overlays:** the Ctrl K palette, user menu, confirm dialog (suspend, approve, discard), toast, and the "changed elsewhere" (409) dialog.
3. **Intake step 1** (drop zone, samples, paste), **step 3** (confirm issues), and the "sample data" banner.
4. **Studio:** generation in progress (with Cancel), the Parameters tab, the Precedents tab, engine label variants, and the autosave indicator.
5. **Reader, metadata-only variant:** header metadata plus the embedded PDF with "Open original".
6. **Role Homes:** Researcher, Faculty/Student, Administrator, Auditor.
7. **Settings:** language, optional AI key (D7), density.
8. **Phone (390 px)** versions of Home, Research, Reader and Review. The Studio is read-only on phones (D12).
9. **Hindi** samples of the shell and Home, to check Devanagari line height.

### 13.2 Copy corrections to the existing 17 boards (P9)
| Board | Change |
|---|---|
| Research, Judgment, Graph | "Good law" → "No adverse treatment recorded". Remove "Binding on Rajasthan HC" unless it's derived from court hierarchy (SC → binding; same HC → binding; other HC → persuasive), which is computable and allowed. |
| Research, Judgment | Remove "Cited 3,100 times" and "×3,100" unless the row is curated. Keep them on Rangappa (curated), but add a "curated" marker. |
| Research (Omprakash row) | Show coram, disposition and date instead of a ratio. CNR label. |
| Matter history | Pre-B2 events show "User not recorded". |
| Home | "Searches 1,18,096 real judgments" → "Searches 1,18,096 judgments (metadata and source PDFs)". |
| Sign in | The left-panel claims stay factual. Remove anything implying full-text AI review. |

---

## 14. Working agreements
- The canvas is the source of truth for layout, and `tokens.css` for values. A change goes into both.
- **Kit first.** A component is built and shown in the Kit before any page uses it.
- One branch per phase (`ui/p3-research`), with small PRs per page or component.
- The legacy UI is frozen after P0, except for security fixes.
- **Copy:** sentence case, verbs on buttons, no marketing claims in product UI.

---

## 15. Decisions needed before kickoff

| # | Decision | Recommendation |
|---|---|---|
| D1 | Zero-build ES modules vs React/Vite | **ES modules** |
| D2 | Remove padded values from `/api/dashboard_metrics` | **Yes.** The UI ignores them either way. |
| D3 | Real authentication now (passwords or SSO) vs demo SSO with server-side role enforcement | **Demo SSO plus B1 enforcement** now. Real SSO goes on the roadmap. |
| D4 | Ship `draft_versions` (0.5 BE dw) | Yes |
| D5 | Signature wording until Raj eSign | "Approve" plus "digital signature not connected" |
| D6 | Branding | "Gyanam AI" in the shell. NLUJ seal on Sign in and the print view only. |
| D7 | Gemini key: server-side only vs per user in the browser | **Server-side only.** A per-user key only behind a setting that is off by default. |
| D8 | Matter assignment ("assigned to me") for clerks | Out of scope. Show all matters, filterable. |
| D9 | Court desktop browsers | Confirm with NLUJ IT. The assumption is Chrome/Edge from the last 2 years. |
| D10 | DB distribution | Not in git. A versioned download with a SHA-256 checksum. |
| D11 | Feedback channel | An in-app feedback table (B11) |
| D12 | Studio on phones | Read-only |

---

## 16. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| The corpus is metadata-only, so the UI feels thin next to the deck | High | The PDF reader is first-class. Curated rows are highlighted. The full-text ingestion roadmap is made visible to stakeholders. |
| PDFs on S3 can't be framed (X-Frame-Options or CSP) or are blocked offline | Medium | Test in P3. Fallback to "Open original" in a new tab. Optional proxy endpoint. |
| B1 enforcement breaks the legacy UI | Medium | The flag keeps legacy working. The legacy smoke test runs in CI. |
| `matter_key` merges unrelated cases | Medium | A reviewed backfill list, and a manual "split / merge matter" admin action (later) |
| Hidden behaviour in 6.7k lines is lost | Medium | The generated parity inventory (§10.6) and the legacy baseline |
| Hindi quality | Medium | Native review. Legal text is not machine-translated. |
| Gemini latency and outages | Medium | Progress UI, Cancel, a template fallback with a clear engine label |
| Scope creep toward the deck's AI features | High | The §8 honesty contract is enforced in design review. Roadmap items need a new plan. |
