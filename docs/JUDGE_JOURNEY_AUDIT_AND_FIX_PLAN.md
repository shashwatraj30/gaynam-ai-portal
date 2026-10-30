# Gyanam AI Portal — Judge Persona End-to-End Audit, Root Causes, and Fix Plan

Produced by a 4-stage agent pipeline against the **live deployed site** (https://gaynam-ai-portal.fly.dev): Agent 1 drove a complete Judge-persona journey in a real browser (no code read); Agent 2 distilled that into a clean bug list; Agent 3 root-caused each item directly in the codebase (read-only); Agent 4 turned the confirmed root causes into a prioritized, concrete fix plan. Investigation and planning only in that pass — no code was changed.

**Update:** one additional gap was flagged afterward (not found by the agent pipeline, raised separately) — **Bug 13, sexual-offence victim-identity redaction** — and has since been implemented (not just planned). See "Bug 13" under Part 2 and Part 3 below for what was found and fixed.

---

## Executive summary

The Judge persona's full workflow — sign-in → research → citation check → document upload → precedent research → pin authorities → generate a 15-section draft → edit/version → send for review → approve → seal → export → audit trail — is **substantially complete and functional end-to-end**. No step blocked the journey. The corpus is real (118,096 judgments), the audit log is detailed and accurate, version history works, and draft generation produces substantive, well-reasoned legal text.

Four confirmed bugs matter most, because they silently corrupt or misrepresent data rather than just looking bad:

1. **Document field extraction misroutes pleadings into FIR-only parsing**, leaving most fields empty or wrong on well-structured text.
2. **The audit hash-chain silently diverges from the audit log** (1,342 verified blocks vs. 1,354 logged entries) due to a swallowed exception in a two-table write.
3. **The "sealed" document hash isn't actually reproducible** — it's computed fresh on every export rather than once at seal time, undermining the one guarantee a seal feature exists to provide.
4. Three more straightforward UX bugs (a clipped modal button, a silently-blocked print-view popup, and a router timing gap) and one inconclusive performance finding round out the list.

---

## Part 1 — Issue list (Agent 2's distillation of Agent 1's live walkthrough)

### Data-integrity / Functional bugs (priority)

**1. Document field-extraction parser fails on most fields**
A pasted bail-application pleading (explicit FACTS/ISSUES/PRAYER sections, clear parties) got only `case_number` (wrong value) and `petitioner` (wrong value — swapped with respondent) and `statutory_provisions` filled. `court`, `case_title`, `respondent`, `facts`, `prayer`, `petitioner_arguments`, `respondent_arguments` all came back "Not found," despite being clearly present and labeled. The separate "Issues" extraction from the same text worked perfectly (3/3). **Confidence: high.**

**2. Document ID permanently shown as "REDACTED" in the browser URL**
From the moment a document is created, `#/documents/{id}` displays as `#/documents/REDACTED` — reproducible even navigating directly to a known real ID. API calls underneath still use the real ID correctly. Breaks deep-linking/bookmarking. **Confidence: high that it happens; see Part 2 — not actually a code bug.**

**3. SHA-256 hash of a sealed/"immutable" draft is non-deterministic across views**
Two consecutive DOCX exports of the same sealed draft produced two different hashes (`fb3e33ba...` vs `a098f8b8...`). **Confidence: high.**

**13. (flagged separately, not from the live walkthrough) Sexual-offence victim identity was not protected by the redaction pipeline**
Asked directly (not surfaced by the journey test): does the PII redaction pipeline handle a rape/sexual-assault victim's identity, which Section 228A IPC — and the POCSO Act for a child victim/witness — legally prohibit disclosing? Answer at the time: no. `anonymize_pii()`'s own docstring stated plainly that only 4 pattern-matchable identifiers (email, Aadhaar, PAN, phone) were redacted and that **personal names are not redacted at all** — which includes a victim's name appearing anywhere in an uploaded pleading, FIR, or OCR'd document. This is a genuine statutory-compliance gap for a legal-tech tool handling such matters, not a cosmetic one. **Confidence: high. Status: implemented — see Part 2 and Part 3.**

**4. Audit hash-chain verified-block count doesn't match total ledger entries**
"Verify the chain" reports 1,342 verified blocks; the audit log's own pagination says 1,354 total entries — a 12-entry gap. **Confidence: medium** (report itself flagged this could be intentional batching rather than a bug — Agent 3 resolved this: it is a bug).

### UX / Timing bugs

**5. Dashboard panels show stale "Loading…" for 8-10s after their data already arrived** (per network tab). **Confidence: medium-high.**

**6. Approve/Seal confirmation dialog buttons clipped below the viewport at 1024×768** — had to use accessibility-tree refs rather than visible clicks. **Confidence: medium.**

**7. "Open print view" button fires a successful backend call but no tab/window visibly opens.** **Confidence: low as stated — Agent 3 confirmed it's a real, fixable bug.**

**8. Alerts page briefly shows stale "Audit trail" content under the new `#/alerts` URL** after SPA navigation, self-resolving in a few seconds. **Confidence: low as stated — Agent 3 confirmed it's a real, general router bug.**

### Cosmetic / data-completeness

**9. "Source judgment (PDF)" unavailable for most/all corpus records checked.**
**10. "Quote-to-paragraph match" citation check permanently stuck at "Not checked."**
**11. Momentary two-black-button rendering glitch during theme transition** — confirmed NOT a bug (screenshot-capture-timing artifact only).

### Documentation drift

**12. Library's "Judicial Bench User Manual" describes a different, outdated product** (5-stage lifecycle, different terminology, a "Gemini Neural Reasoning Engine" mode that doesn't exist in the live app).

### Explicitly not bugs
- Draft generation taking up to ~25s–2min: fully disclosed via warning text, live timer, and a Cancel option.
- Hindi UI chrome translating while document body content (user-authored English text) stays English.
- The theme-toggle screenshot glitch (item 11).

---

## Part 2 — Root causes (Agent 3's read-only codebase investigation)

### Confirmed code bugs

**Bug 1 — `backend/document_parser.py`**
`_is_fir()` (lines 119-129) flags any text matching `\bfir\s*no` as an FIR *unless* an exact "A versus B" line is found in the **first 60 lines only**. A bail application whose cause-title appears later, or in a `BETWEEN:` block rather than a `versus` line, slips through and gets misclassified. Once routed into `_parse_fir()` (lines 137-201): `case_number` is **overwritten** by the FIR-number regex (destroying the correct value the generic parser would have found); `petitioner` is **hardcoded** to "State of X" (always wrong for a pleading, where the State is usually the respondent); `respondent`/`case_title` stay empty (accused-block regex doesn't match pleading text); and `court`, `prayer`, `petitioner_arguments`, `respondent_arguments` are **never set anywhere in `_parse_fir()` at all** — not attempted, just left at the `""` default. The separate issues-extraction (`_QUESTION_RE`) runs unconditionally regardless of this branch, which is why it alone succeeded.

**Bug 3 — `backend/export_engine.py`**
`generate_judgment_hash()` (lines 64-67) hashes `case_number|title|content|...` fresh on every call — there is no `sealed_hash` column on `draft_judgments` (only `documents.sha256` exists). Every `GET /api/draft/export/docx/{id}` (`server.py:700-703`) recomputes the whole DOCX + hash from the *current* draft row live. Separately, the exported file's actual bytes are **never** stable regardless: lines 149 and 249 stamp `datetime.now()` into the visible document body twice on every export, plus python-docx/zipfile's own per-save ZIP timestamps vary. So even though the *printed* fingerprint text would be stable if content didn't change, a verifier hashing the *downloaded file itself* — which is what `review.js:3`'s own comment says is the intent — gets a different result every time.

**Bug 4 — `backend/server.py` (and duplicated in `backend/search_service.py:50-74`)**
`log_audit()` INSERTs into `audit_logs`, commits, closes the connection — **then separately** calls `record_tamper_evident_event()`, which writes to the different `cryptographic_audit_ledger` table. Both steps share **one bare `try/except Exception: print(...)`** with no re-raise, no rollback, no retry. If the ledger write throws (e.g. SQLite lock contention under concurrent requests — the ledger's own `threading.Lock()` only serializes ledger writes against each other, not against the independent `audit_logs` connection), the exception is silently swallowed, the `audit_logs` row stays committed, and the ledger block is simply never written. This is a non-atomic two-table write with silent failure, not a deliberate exclusion of old/unsealed rows.

**Bug 6 — `frontend/app/css/components.css`**
`.g-modal__head` and `.g-modal__actions` (which holds the Confirm button) lack `flex-shrink: 0`. Because `.g-modal__body{flex:1}` resolves to `flex-basis:0%` and so contributes almost nothing to flexbox's shrink-weighting, the browser squeezes the header/footer instead of confining overflow to the scrollable body when a dialog (like Approve/Seal, which includes a reason/warning paragraph) exceeds the viewport height.

**Bug 7 — `frontend/app/js/pages/review.js:220-228`**
`printView()` calls `window.open()` only **after** `await api.printHtml(id)` resolves. Because the `await` yields control before the popup call, it falls outside the synchronous click-handler stack browsers require to allow a popup — real browsers (not just the test environment) silently block this every time, with no error surfaced.

**Bug 8 — `frontend/app/js/router.js` `run()` (~lines 115-169)**
The breadcrumb/title update to the new page happens immediately, but the outlet's old DOM is only cleared and replaced **after** `await page.render(...)` fully resolves. Any page that awaits data before returning its node (like `alerts.js`, which awaits `api.alerts()`) will show the *previous* page's content under the *new* URL/breadcrumb for the duration of that fetch. This is a general router-level gap, not Alerts-specific.

### Inconclusive

**Bug 5 — dashboard loading lag.** Could not find a client-side bug after reading `home.js`/`home-logic.js`/`api.js`/`skeleton.js` in full — the loading-state wiring looks correct. What *is* independently confirmed real: `GET /api/dashboard_metrics` (`server.py:314-372`) runs 5+ sequential, unindexed full-table-scan queries over the 118k-row `judgments` table per call — including a `WHERE court LIKE '%Supreme Court%'` leading-wildcard scan that can never use an index — and `syncCard()`/`usersCard()` in `home.js` make their own unmemoized calls not covered by the dashboard_metrics cache.

### Not found / likely false lead

**Bug 2 — the "REDACTED" URL.** Exhaustive search of `router.js`, `topbar.js`, `document.js`, `api.js`, and every PII/redaction-pattern match in the frontend found **zero** code that rewrites the URL/hash/breadcrumb to contain "REDACTED." All real "REDACTED"-style code in the repo is backend PII tokens (`[REDACTED_EMAIL_XXXX]`) used only for rendering extracted **document text**, unrelated to URLs. Most plausible explanation: an external tool (browser extension, password manager, or the QA environment's own screen-capture/masking tool) pattern-matched the 32-char hex document ID and masked it client-side, outside the app's own code.

### Bug 13 — implemented (not just planned)

**Everything connected to redaction, mapped first:** `backend/ocr_engine.py` (`_PII_PATTERNS`, `anonymize_pii()` — the only place redaction actually happens) → called from `backend/documents.py` (both the file-OCR and paste-text upload paths, lines ~301/324, result stored in `documents.redactions_json`) and `backend/server.py`'s standalone `/api/ocr/anonymize` live-preview endpoint → surfaced to the frontend via `frontend/app/js/pages/lib/document-logic.js`'s generic `REDACTION_RE`/`redactionSummary()` (already type-agnostic, needed no change) → rendered in `frontend/app/js/pages/document.js` (per-type list, generic `dw.red.${type}` lookup with graceful fallback) and `frontend/app/js/pages/intake.js` (total-count chip) → labeled via `frontend/app/js/i18n/pages/document.en.js`/`.hi.js` and `intake.en.js`/`.hi.js`.

**What was implemented:**
- `backend/ocr_engine.py`: a new `VICTIM_NAME` redaction pattern (`VICTIM_CUE_RE`) — redacts a name immediately following a cue word ("victim", "prosecutrix", "survivor", "minor girl/victim/complainant"), with an exclusion list to avoid false positives like "victim compensation scheme" or "Victim No. 2." Added to `_PII_PATTERNS` so it runs through the existing `anonymize_pii()` pipeline automatically — no other code needed to change to pick it up.
- A separate `is_sexual_offence_matter(text)` signal function (checks for IPC ss. 354/376 series or POCSO language) — doesn't redact anything itself, just flags the document so the UI can warn the user to verify manually, regardless of whether the name-redaction pattern actually caught anything.
- `backend/documents.py`: `doc_dict()` now computes and returns `sexual_offence_matter` on document-detail responses (reads the already-stored, already-redacted text, so no schema migration needed).
- `frontend/app/js/pages/lib/intake-logic.js`: `normalizeDocument()` now passes `sexualOffenceMatter` through (it was being silently dropped by the existing field whitelist).
- Warning banners added in both places a user reviews extracted fields: `intake.js` (the upload/Matters-new flow, step 2) and `document.js` (the saved document's Details tab) — both state the statutory basis (Section 228A IPC / POCSO Act) and explicitly say automatic redaction is best-effort and may miss names, telling the user to verify manually before saving/sharing/exporting. English and Hindi strings added for the banner text and the new `VICTIM_NAME` type label.
- Tests added to `tests/test_redaction.py`: all 6 cue-word variants redact correctly, a "namely"/comma-punctuated form, three known false-positive phrasings stay unredacted, and `is_sexual_offence_matter()`'s true/false cases. Full backend suite (31/31 in that file, whole suite clean) and the frontend's 322-test suite both still pass.

**Known, explicitly documented limitation (by design, not an oversight):** this is a heuristic, not true name recognition — it only catches a name immediately following one of the cue words above. A victim's name mentioned elsewhere in the document without a nearby cue (e.g. introduced once, then referred to by name alone for the rest of the text) will **not** be caught. This is exactly why the warning banner exists and says "best-effort" explicitly rather than claiming full protection — consistent with this codebase's existing honesty principle (the OCR engine already refuses to fabricate text rather than claim false success; this follows the same pattern rather than overclaiming reliability it can't deliver).

### Confirmed not code bugs
- **Bug 9** (missing source PDFs): `source_pdf_url` is simply NULL for most of the 118k rows — an open-dataset ingestion limitation already documented in this project's own `CLAUDE.md`, not a rendering bug.
- **Bug 10** (quote-to-paragraph check): a hardcoded client-side placeholder (`citation-check-logic.js:42`, `checks.push({id:'quote', state:'unchecked'})`) — an unimplemented feature stub, not a broken query against an empty table.
- **Bug 12** (manual drift): `docs/JUDICIAL_BENCH_USER_MANUAL.md` is a static file never updated to track the real status lifecycle (`CANONICAL_STATUSES` in `drafts_service.py:13`) — pure documentation maintenance.

---

## Part 3 — Prioritized fix plan (Agent 4; planning only, nothing implemented)

### Tier 0 — statutory compliance, done
- **Bug 13** (sexual-offence victim-identity redaction) — **implemented**, not just planned. See Part 2 for what shipped and its documented limitation.

### Tier 1 — data-integrity, fix before any real deployment
1. **Bug 1** (field misrouting) — worst: corrupts case data silently, on every affected document.
2. **Bug 4** (audit ledger divergence) — second-worst: corrupts auditability/compliance of the whole system's history.
3. **Bug 3** (seal hash) — real, but one rung lower: the hash was never trustworthy, so nothing previously-trusted has been silently falsified.

### Tier 2 — real UX defects, bounded fixes
4. **Bug 6** (modal clipping) — trivial-small effort, ship first as a quick independent win.
5. **Bug 7** (print view) — small effort.
6. **Bug 8** (router stale content) — medium effort, touches every page.

### Tier 3 — needs reproduction before a confident fix
7. **Bug 5** (dashboard lag) — backend query fix is in scope now (confirmed real); client-side half needs timing instrumentation first.

### Recommended concrete approach per bug

- **Bug 1**: Replace the boolean `_is_fir()` gate with a **scored classifier** (≥2 independent FIR-form markers AND zero pleading markers, widening cause-title detection beyond 60 lines / exact "versus" lines to include `BETWEEN:` blocks). Change `extract_fields()` to **always run generic extraction first**, then layer FIR-specific fields on top only when the classifier is confident — and only overwrite `case_number`/`petitioner` if the generic pass found nothing. This also fixes court/prayer/arguments never being set. *Rejected alternative*: just widen the exclusion regex — doesn't fix the "never sets these fields at all" sub-bug.

- **Bug 4**: De-duplicate the two copy-pasted `log_audit()` implementations into one shared function. Split the swallowed try/except into two stages: Stage A (audit_logs insert) propagates failure; Stage B (ledger write) gets bounded retries, and on exhaustion flags the row `ledger_synced=0` instead of silently losing it. Add a reconciliation job to backfill the already-diverged rows and close the current 12-entry gap. *Rejected alternative*: full cross-table transaction/2PC — correct but architecturally bigger than needed; the retry+flag ("transactional outbox") pattern gets the same eventual-consistency guarantee with much less risk.

- **Bug 3**: Add a `sealed_hash`/`sealed_at` column to `draft_judgments`; compute the hash **once**, at the actual seal action, and persist it — don't recompute on every export. Separately fix DOCX byte non-determinism (stamp the persisted seal timestamp instead of live `datetime.now()`; normalize ZIP member timestamps and docProps metadata) so the *downloaded file itself* hashes reproducibly, matching what the UI already claims. *Rejected alternative*: redefine the hash to only cover semantic content and give up on file-byte reproducibility — smaller change, but weakens the actual guarantee the feature exists to provide.

- **Bug 6**: Add `flex-shrink: 0` to `.g-modal__head` and `.g-modal__actions`; keep `.g-modal__body{flex:1; overflow:auto; min-height:0}` as the sole scroll target. Trivial, independent, ship anytime.

- **Bug 7**: Open the popup window **synchronously** inside the click handler (before any `await`), then navigate that already-open window once the fetch resolves — the standard pattern for async-content popups.

- **Bug 8**: Clear the outlet (or show a loading placeholder) **before** awaiting `page.render()`, not after; guard against rapid back-to-back navigation with a generation-token check so a late-resolving render from an abandoned navigation can never clobber the page the user actually navigated to.

- **Bug 5**: Fix the confirmed backend inefficiency now (remove the leading-wildcard `LIKE`, add indexes, collapse multiple COUNT queries, memoize `syncCard`/`usersCard`). Separately instrument client-vs-server timing to conclusively settle whether a client re-render bug also exists before investing further there.

### Dependency notes
- Deploy Bug 4 with monitoring on the new `ledger_synced=0` rate for at least one cycle — fixing the silent swallow will, for the first time, surface previously-hidden contention; a persistently high pending rate would point to needing SQLite WAL mode or a single-writer queue, not just this fix.
- Confirm `drafts_service.py`'s `CANONICAL_STATUSES` actually treats "sealed" as immutable before implementing Bug 3 — if it doesn't, that enforcement needs to be in scope too.
- Bug 1's fix is fully independent and can proceed in parallel with the other two Tier-1 items.
- Bug 6 has zero dependencies — recommend shipping it first regardless of the rest of the sequencing.

### Explicitly out of scope for this plan
- **Bug 2**: not confirmed as a code defect at all — needs reproduction in a clean browser profile with extensions disabled before any fix plan makes sense.
- **Bug 5 (client half)**: needs the timing-instrumentation data described above before a client-side fix can be planned with confidence.
- **Bugs 9, 10, 12**: not code bugs — a data-engineering/re-ingestion project, a feature-build task, and a documentation task respectively, each needing its own separate scoping.

---

## Part 4 — Complete feature list of the portal (as currently implemented)

**Identity & access**
- Role-picker sign-in (no password) across 6 institutional personas: Judge, Researcher/Law Clerk, Faculty, Student, Administrator, Auditor — each with a distinct permission set gating what's visible/actionable.
- Role-aware sidebar, top bar, and route guards — pages and buttons are hidden/blocked per role.
- Admin-only "preview as another role" display mode.
- Light/dark/system theme toggle; English/Hindi UI language switch.
- Account menu: settings, switch profile, sign out.

**Home dashboard**
- At-a-glance KPIs (total judgments, Supreme Court / High Court counts, searches run, drafts created).
- Court-distribution and precedent-status charts.
- "Needs your attention" alerts panel (e.g. overruled authorities cited in a draft).
- Quick-action tiles (upload document, research, verify citation, new draft).
- Inline "ask a question about the law" box.

**Research**
- Full-text search across a 118,096-judgment corpus (Supreme Court + multiple High Courts), with preset/suggested query chips.
- Judgment reader: headnote, ratio decidendi, full text/paragraphs, cited-cases list, coram, equivalent citations, "cited by" count, precedent-treatment status, source-PDF link (where available).

**Citation verification**
- Standalone citation checker: format recognition, corpus lookup, adverse-treatment check, quote-to-paragraph match (stubbed, not yet implemented).
- Bulk citation verification from pasted text (used inside the review workflow too).

**Document intake (Matters)**
- Two upload paths: file upload (PDF/Word/text/photo, up to 64MB) and paste-text.
- OCR pipeline for scanned/photographed documents (Gemini Vision → local fallback cascade), with an honest "could not be read" state rather than fabricated text.
- Automatic PII redaction (Aadhaar, PAN, phone, email, sensitive names) over extracted text.
- Structured field extraction (court, case number, cause title, petitioner/respondent, statutes, facts, prayer, arguments) with manual review/edit before confirming.
- Separate issues-for-determination extraction.
- "Confirm" gate — a document can't feed research or a draft until its fields and issues are explicitly reviewed/confirmed.
- Archive and permanently delete actions for documents (archived docs can still be deleted if nothing depends on them).

**Precedent research from a document**
- Per-issue automated precedent search once a document is confirmed.
- Pin up to 5 authorities per document, carried through into drafting.
- Authority status chips (verified/active, overruled, etc.).

**Drafting studio**
- Generates a full 15-section draft judgment (or any subset of sections) via an LLM, using retrieved + pinned precedents, with mandatory-citation instructions and independent citation re-verification afterward.
- Live progress indicator with elapsed time and cancel option for long generations.
- Manual section-by-section editing with autosave and a "Save now" control.
- Full version history per draft (every save creates a version) with restore and side-by-side compare.
- Outcome handling: never predetermines a disposition unless the judge explicitly directs one (uses a neutral placeholder otherwise).

**Review & approval workflow**
- A defined status lifecycle: Draft → In review → Approved by bench → Final, sealed (plus a Returned state).
- Automated pre-sign checks before approval (citations found in corpus, no overruled authorities cited, no unedited-scan-text sections, all sections have content).
- Explicit confirmation dialogs at each irreversible transition (send for review, approve, seal), each stating plainly that "approval"/"seal" in this app is a status change, not a cryptographic digital signature.
- Once sealed, a draft becomes immutable — no further edits or deletion, enforced both client- and server-side.
- "Return" path back to editable state from review, with a reason.

**Export**
- DOCX export in formal High Court formatting, with an embedded integrity fingerprint.
- Printable gazette-style HTML view.

**Audit & compliance**
- Full, detailed, real-time audit trail of every action (who, what, when, from where), filterable by action/role/date, exportable as CSV or print view.
- Tamper-evident, SHA-256 hash-chained audit ledger, independent of the human-readable log, with a one-click "Verify the chain" integrity check.
- DPDP (Indian data-protection law) and Indian Evidence Act §65B compliance framing throughout.

**Precedent lineage graph**
- Visual citation/treatment graph per judgment — who cites, who overrules, bench-strength legend — with guided example lineages.

**Alerts**
- Surfaces consequences of corpus changes that affect existing drafts (e.g. "an authority you cited has since been overruled").

**Administration (Chamber)**
- User directory, role assignment, and suspend/reactivate controls (suspension persists across restarts).

**Library**
- In-app document viewer for internal reference material: user manuals, architecture/deployment docs, compliance whitepapers, audit reports.

**Platform-wide**
- Keyboard command palette (Ctrl/Cmd+K) for jumping to any page or action.
- Text-size controls (A-/A+), independent of browser zoom.
- Offline/connectivity banner.
- Accessibility: skip-to-content link, ARIA live regions for async updates, keyboard navigation throughout.

---

*This document captures findings only; no fixes from Part 3 have been implemented. Let me know which tier to start on, or if you'd like any item investigated further before implementation begins.*
