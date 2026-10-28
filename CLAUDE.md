# CLAUDE.md

Gyanam AI (earlier name "Vidhi AI"; "NLU Jodhpur Edition", powered by Kelyvo) is a legal research and 15-section judgment drafting portal for Indian courts. It was built as a tender/POC for National Law University, Jodhpur. Both names appear in the code. `vidhi_legal.db`, `VIDHI_JWT_SECRET` and `start_vidhi.sh` are the old name. Everything else says Gyanam.

## Run

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python backend/server.py          # PORT env, default 8090; serves API and UI
```

- UI: `/`. Slides: `/presentation`. Architecture PDF: `/pdf`. Health: `/api/status`. Swagger: `/docs`.
- Tests: `pip install -r requirements-dev.txt && pytest` (fixture DB in a temp dir; never touches `data/`). CI also runs ruff and `node --test frontend/app/tests/*.test.js`.
- There is no build step. `frontend/index.html` is served straight from disk. Edit it and refresh.
- `scripts/benchmark_search.py` is the only test-like script. `scripts/backup_db.sh` takes a SQLite online backup, gzips it and writes a SHA-256 file.
- Docker: `docker-compose.yml` has the backend on 8090 plus nginx on 80. It is stale. The image is Python 3.9, which cannot install the pinned `pypdf` and `pydantic` versions. It also doesn't copy `data/`, so the DB must come from the volume mount.

## Hard-coded paths and secrets to fix before running anywhere else

- Absolute macOS paths `/Users/ujjwalsingh/Movies/Our Company/Vidhi_AI_NLUJ/...` appear in:
  - `backend/database.py` (`DB_PATH`)
  - `backend/server.py` (`sys.path`, `FRONTEND_DIR`, `DOCS_DIR`, and the upload dir `sample_docs` in two endpoints)
  - `start_*.sh` and `watchdog_server.sh`
  
  On any other machine, change these to paths derived from `__file__` (as `ingest_authentic_cases.py` already does) or an env var.
- `start_gyanam.sh` contains a Gemini API key. `auth.py` and `docker-compose.yml` hold a default JWT secret. Treat both as leaked. Rotate them and read them from the environment.
- `backend/keycheck.py` blocks the once-committed Gemini key by its SHA-256 (the key itself is never stored). Any other key of 25+ characters is accepted; with no key, drafting uses the template fallback.

## Architecture

Single FastAPI app, `backend/server.py` (about 900 lines, all routes). It uses one SQLite file in WAL mode, opened per call by `database.get_connection()`. There is no ORM.

| Module | Role |
|---|---|
| `database.py` | Schema. `judgments` plus the FTS5 table `judgments_fts` (external-content, kept in sync by triggers), `draft_judgments`, `audit_logs`. |
| `judgment_engine.py` | `search_relevant_precedents` (FTS5 BM25 plus legal query expansion and IPC-section token detection). `calculate_bench_priority` ranks by Article 141 bench strength. `resolve_case_district`. `generate_15_section_judgment` retrieves non-overruled precedents, then calls Gemini (model cascade, JSON output) or falls back to a template. |
| `citation_verifier.py` | Regexes for SCC, AIR, SCR, INSC, SCC OnLine, RLW and others. It looks citations up in the DB and returns OVERRULED/DISTINGUISHED/ACTIVE badges. |
| `ocr_engine.py` | `process_scanned_brief` runs the intake pipeline. Text-based PDF/DOCX/TXT are read directly. Images and scanned PDFs go to Gemini vision (if a key is set), then RapidOCR, then Apple Vision (`vision_ocr.m`, macOS only). It also holds `clean_ocr_text`, `extract_pleading_structure` and `anonymize_pii` (Aadhaar, PAN, phone, email, sensitive names). |
| `document_parser.py` | `extract_text_from_file` and `parse_pleadings` for `/api/upload_pleading`. |
| `export_engine.py` | DOCX export (python-docx, High Court formatting, SHA-256 hash) and printable gazette HTML. |
| `audit_dpdp.py` | `cryptographic_audit_ledger` table. Each block is the SHA-256 of the previous hash plus timestamp, user, role, action, details and IP. `verify_ledger_integrity` re-walks the chain. |
| `court_sync_daemon.py` | Manual or scheduled ingestion trigger. It calls `ingest_authentic_cases.ingest_sci_parquet_year(1951, ...)`, so the "sync" always ingests Supreme Court 1951 data. |
| `ingest_authentic_cases.py` | Bulk loader from open Parquet data (AWS Open Data SC/HC buckets, a KanoonGPT dataset on Hugging Face). |
| `seeder.py` | Hand-written landmark judgments. |

`.deprecated` and `.bak` files (`bulk_ingester.py.deprecated`, `scale_to_one_million.py.deprecated`, `frontend/index.html.bak`) are dead code.

### Data (`data/vidhi_legal.db`, 329 MB)

- 118,096 judgments from 1950 to 2026. Gujarat HC 43.5k, Telangana HC 20k, Bombay HC 18.8k, Uttarakhand HC 14.5k, Chhattisgarh HC 5.4k, Supreme Court 4.6k, plus others.
- `precedent_status` is `FOLLOWED` for 118,094 rows and `OVERRULED` for only 2. Treatment tracking is therefore almost entirely default values, not real analysis.
- The corpus is metadata only, except for about 8 seeded landmark cases:
  - `headnote` and `ratio_decidendi` are templates.
  - `full_text` is a record of about 850 characters.
  - `citing_cases_count` is hard-coded to 35 at ingest.
  - `cases_cited` is non-empty on only 6 rows.
  - The real judgment is the PDF at `source_pdf_url`.
- The redesign plan is `docs/UI_REDESIGN_PLAN.md` and the screen designs are in `docs/ui_designs/`.
- The DB also holds 52 drafts, about 1.2k audit rows, about 1.2k ledger blocks and 42 sync logs.
- The `-shm` and `-wal` files travel with the DB. Don't copy the `.db` alone while the server runs.
- v3 added `documents`, `document_text`, `document_extractions`, `document_pins` (the Documents feature), `saved_searches` (Research), `user_status` (persisted suspension), `judgment_paragraphs` and `judgment_treatments` (empty until a real paragraph/citator source is wired up), and `lineage_streams`/`lineage_nodes` (seeded once from the front-end's hard-coded lineage data). Migrations now run via `database.run_migrations()`, tracked in a `schema_migrations` table and safe to re-run (`CREATE TABLE IF NOT EXISTS` plus idempotent seeding); it has been run against the real 329 MB DB without touching existing rows.

### Frontend (`frontend/index.html`, about 6.7k lines)

It is one file of Tailwind via CDN, vanilla JS and Lucide icons. Tabs are `<section id="tab-*">` and `switchTab()` toggles them:
- dashboard
- research
- citation
- intake (OCR)
- studio (drafting)
- graph (lineage)
- audit (including a docs viewer that fetches `/api/docs/read/*.md`)

Role-based UI is built client-side in `applyRoleUI` and the related `update*ForRole` functions. Design tokens are in `UI_UX_DESIGN_GUIDELINES.md`.

## Known behaviours to be aware of

These matter if the code is ever used beyond a demo.

- **Auth is not enforced.** `/api/auth/login` ignores the password and invents a user for any unknown email. `get_current_user_from_header` falls back to the Hon'ble Justice profile when no token is sent. No route uses `check_permission`. Admin routes (`/api/admin/*`, audit CSV, sync trigger) are open. CORS is `*` with credentials. `log_audit` always records the same user and IP (`127.0.0.1`).
  - This has been tightened since: `GYANAM_ALLOW_LEGACY_HEADER` now defaults to `0` (was `1`), so the tokenless `X-Gyanam-Legacy` header no longer works unless explicitly re-enabled. Several endpoints that used to answer anonymously now require a token: `/api/dashboard_metrics`, `/api/cases/recent`, `/api/verify_citations`, `/api/sync/status`, `/api/sync/history`, `/api/ocr/anonymize`, `/api/search`, `/api/judgment/{id}`. `/api/status` without a token returns only `{status, version, time}`. `/api/admin/toggle_user` suspension now persists in the `user_status` table (survives restarts) instead of an in-memory dict, and `get_current_user_from_header` rejects suspended users with 403 `ACCOUNT_SUSPENDED`. `/api/auth/login` and the passwordless SSO picker are unchanged (still no password) — see `docs/legacy_review/COMPARE_B.md` for what's still open.
- **Fabricated data in responses.**
  - `/api/dashboard_metrics` pads counts (`max(search_count, 142)`, `active_users: 6`, `dpdp_redactions_total: 842`, `sha256_ledger_blocks: 256`, latency "< 8ms").
  - `/api/status` claims "air_gap_ready" while the app can call Gemini and Hugging Face.
  - `/api/ocr/process_brief` returns a hard-coded Airport P.S. FIR 04/17 transcript if OCR throws.
  - `ocr_engine._match_known_judicial_docket` returns canned FIR text chosen by filename, so benchmark sample files "OCR" perfectly.
  
  Don't treat these as real results.
- **Path traversal.** `/api/docs/read/{filename}` joins the filename onto `DOCS_DIR` without sanitising. Uploads are saved under their client-supplied filenames.
- **Privacy.** `gemini_api_key` can be passed from the browser. Document images and pleading text are sent to Google when a key is present, which contradicts the "zero external processing / air-gap" claims in `docs/`.
- **Marketing and reality differ.** `docs/` describes the target AWS architecture (OpenSearch, Aurora, Bedrock, QLDB, Cognito SSO). The code is only the Phase 1 single-node SQLite/FastAPI version, and SSO is scaffolding. Check `docs/COMPREHENSIVE_SYSTEM_AUDIT_REPORT.md` and `plans_and_blueprints/handwritten_fir_ocr_audit_and_fix.md` for known gaps.

## Other directories

- `docs/`: tender, DPDP, architecture, user and admin manuals (Markdown). Served by the in-app docs viewer.
- `plans_and_blueprints/`: commercial proposal, presentation guides, rollout plan.
- `sample_docs/`: FIR and pleading images used to demo OCR. Uploaded files are also written here.
- `presentation_screenshots/`, `frontend/nluj_assets`, `frontend/nluj_thumbs`: images only.

## Auth and deployment notes

- `GYANAM_ENFORCE_AUTH` (default 1): routes need a Bearer token. `GYANAM_ALLOW_LEGACY_HEADER` (default 1) makes the server honour a client-sent `X-Gyanam-Legacy: 1` header, which grants the open legacy profile so the old UI works. **Production nginx must strip `X-Gyanam-Legacy` from incoming requests** (`proxy_set_header X-Gyanam-Legacy "";`), and set `GYANAM_ALLOW_LEGACY_HEADER=0` after cutover.
- `/api/docs/read/COMMERCIAL_PROPOSAL_GYANAM_AI.md` needs `MANAGE_USERS` when auth is enforced.
- `/api/audit_logs` accepts `action`, `user`, `q`, `since` (YYYY-MM-DD) and `limit` (default 50, or 200 when filtered; max 1000). `GET /api/drafts/{id}/versions` reads the append-only `draft_versions` table.

## New UI and configuration (current)
- The new UI is `frontend/app/` (zero-build ES modules, tests: `node --test frontend/app/tests/*.test.js`) and is served at `/` and `/app/`. The old UI is at `/legacy` (set `GYANAM_UI=legacy` to make `/` serve it again). The legacy UI sends no token, so it only works with `GYANAM_ENFORCE_AUTH=0`.
- Secrets and settings live in `<project>/.env` (gitignored; loaded by `backend/envload.py`; real environment variables win): `GYANAM_JWT_SECRET`, `GEMINI_API_KEY` (optional), `GYANAM_DB_PATH`, `GYANAM_ALLOW_LEGACY_HEADER`.
- Self-hosted fonts are in `frontend/app/fonts/` (Fontsource, OFL). Backend tests: `python -m pytest` (fixture DB only, never the real one).
- `/api/dashboard_metrics` and `/api/status` now return real counts only (no padded numbers or fixed compliance claims). Judicial roles can now upload pleadings (`UPLOAD_PLEADING`).

### Documents (v3)
- New sidebar section "Matters" (`#/matters`, `#/matters/new`, `#/documents/:id`) stores pleadings server-side instead of the old intake-only flow: upload or paste -> OCR + redaction -> edit the extracted fields -> confirm -> research precedents -> pin up to 5 authorities -> hand off to a draft. `/matters/new` now saves through this (`POST /api/documents`) instead of an ad hoc intake blob; nothing is held only in browser state. A document can't feed a draft until it is explicitly confirmed (`POST /api/documents/{id}/confirm`, requires a non-empty case title, facts and at least one issue) — this is the "confirm-before-draft" gate. Confirmed documents expose `/draft-params`, which `save_draft`/`draft_judgment` accept as `document_id` to link the draft back to its source document. Routes live in `document_routes.py`, service logic in `documents.py`; see `docs/API_V3_CONTRACT.md` and `docs/API.md` for the full surface.
