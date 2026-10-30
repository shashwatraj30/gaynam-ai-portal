# Gyanam AI Portal — Spec-Driven Bug-Fix Plan (for review before implementation)

**Status: PLAN ONLY. No code changed, nothing committed, nothing pushed.** Per your standing instruction, I will not commit or push anything — including creating the PR branch — until you review this and tell me to proceed.

Source: `docs/JUDGE_JOURNEY_AUDIT_AND_FIX_PLAN.md` (the prior 4-agent audit). This document takes that plan's 7 open bugs (1, 3, 4, 5, 6, 7, 8 — Bug 13 is already shipped, Bugs 2/9/10/12 are out of scope, see that doc) and turns each into an implementation-ready spec: exact schema/API contracts, file-by-file steps, **every place in the platform that touches the changed code** (so nothing breaks silently), a test plan, and acceptance criteria. I re-verified the wiring directly against the current code rather than trusting the prior pass at face value, and found a few things worth flagging up front.

---

## New findings from re-verifying the wiring (not in the prior plan)

1. **Bug 3 is worse than previously documented.** `generate_judgment_hash()` has **two** call sites, not one: `export_engine.py:256` (DOCX export) and `export_engine.py:318` (the print-view HTML renderer). They serialize content differently — the DOCX path hashes an accumulated plain-text string built section-by-section; the print-view path hashes `json.dumps(content_json)` directly. **These two paths will produce two different hashes for the same sealed draft even before accounting for the non-determinism already found** — "the hash" is not one thing today, it's two independently-computed things that happen to share a function. The fix must unify both onto the single persisted `sealed_hash`, not just fix the DOCX path.
2. **`log_audit` duplication exists for a real architectural reason, not carelessness**: `search_service.py:50-55`'s own docstring says it exists "to have the same effect as `server.log_audit`... without importing server" — i.e. it was copy-pasted specifically to avoid a circular import (`search_service.py` is imported by `server.py`, so `search_service.py` importing back from `server.py` would cycle). `documents.py` avoids this correctly already via a lazy `_server()` / `sys.modules` lookup — that pattern is the one to generalize, not to abandon. The fix must pick a module neither `server.py` nor `search_service.py` depends on (a new `audit_utils.py`, or move the shared logic into `audit_dpdp.py` itself, which both already import) — a naive "just import server.log_audit from search_service" will reintroduce the circular import that caused this duplication in the first place.
3. **`extract_fields()` has a third consumer**: `ocr_engine.py:183-194`'s `extract_pleading_structure()` — used by the **legacy UI's** `/api/ocr/process_brief` endpoint (`GYANAM_UI=legacy`), which re-shapes the same five fields under different key names (`facts_summary`, `grounds_of_challenge`, `prayer_relief`). Bug 1's fix automatically fixes this path too (same root function), but the regression test plan must include a legacy-path fixture, not just the V3 Documents path, since this old endpoint is still live and reachable.
4. **Bug 3's seal-immutability dependency is already resolved — good news.** Agent 4 flagged needing to verify `FINAL_SEALED` is actually enforced as immutable before building Bug 3's fix. I checked: it already is, in three places (`drafts_service.py:160,192,283`, blocking edits/deletes once status is `FINAL_SEALED`). **No prerequisite work needed here** — Bug 3 can proceed directly.
5. **`CANONICAL_STATUSES` and the status-transition map are independently duplicated** between `drafts_service.py:13-24` and `server.py:634-645` — same copy-paste pattern as `log_audit`. Not a bug on its own (both copies currently agree), but it's a risk multiplier: Bug 3's schema change (adding a `sealed_hash` column, gated on `FINAL_SEALED`) must be implemented against *both* copies' transition logic, or better, this is a good moment to flag de-duplicating this too (see "Opportunistic cleanup" at the end — explicitly optional, not required for these fixes).
6. **Bug 6's CSS fix has a wide, shared blast radius (in a good way)**: the `.g-modal__*` classes are used by 7 page modules (`chamber.js`, `document.js`, `documents.js`, `drafts.js`, `kit.js`, `review.js`, `studio.js`) plus the shared `ui/confirm.js`. One CSS fix covers all of them — but the test plan must check more than just the Approve/Seal dialogs that surfaced the bug.
7. **Bug 8's router fix has a 10-page blast radius**: 10 page modules use `async function render`. Not all necessarily await data before returning a node (only genuinely-affected ones show the stale-content symptom), but the fix is router-level and will change timing for all 10 — the test plan must spot-check a sample beyond just Alerts.

---

## Ground rules for this work

- **One new branch, one PR**, per your instruction — not split across multiple PRs. Proposed branch name: `fix/judge-journey-bugs-tier1-2` (Tier 3 / Bug 5's client-side half stays explicitly out of this PR — see below).
- **I will not run `git checkout -b`, commit, or push anything until you say go.** This document is the full plan for your review first.
- Every fix below includes its own test plan; CI (`ci/backend`, `ci/frontend`, `ci/e2e`) must pass before the PR is proposed as ready, same bar as the last PR.
- **Tier 3 (Bug 5's client-side half) is excluded from this PR's scope** — it still needs the timing-instrumentation step described in the prior plan before a confident client-side fix can be specified. The backend half (query optimization) *is* in scope. See Bug 5 below for the split.

---

## Bug 1 — Document field-extraction misrouting (Tier 1, data-integrity)

### Spec
Replace the boolean `_is_fir()` gate with a scored classifier, and change `extract_fields()` from an either/or branch into an always-generic-first, FIR-overlay-second merge.

**New/changed functions in `backend/document_parser.py`:**
```python
_FIR_FORM_MARKERS: tuple[re.Pattern, ...]  # extracted from _parse_fir()'s existing literal anchors:
    # ^\s*POLICE STATION\s*:, ^\s*ACCUSED\s+(?:PERSONS|PARTICULARS)\s*:, ^\s*ACTS\s*&\s*SECTIONS\s*:?,
    # ^\s*SUBSTANCE OF COMPLAINT, "first information report" (anywhere), "\bfir\s*no\b" (anywhere)
    # Anchored (^\s*...) where the original was a heading, NOT anywhere-in-text, to avoid counting
    # quoted/reproduced FIR boilerplate inside a pleading's own argument section.

_BETWEEN_BLOCK_RE: re.Pattern  # matches a "BETWEEN:" line followed within ~15 lines by two party
    # blocks tagged ".../PETITIONER" or "...APPLICANT" and ".../RESPONDENT" or "AND"

def _fir_score(text: str) -> int: ...      # count of _FIR_FORM_MARKERS matches (capped, e.g. max 4)
def _has_pleading_cause_title(text: str) -> bool: ...
    # _VERSUS_LINE_RE / _VERSUS_INLINE_RE OR _BETWEEN_BLOCK_RE, scanned over
    # min(len(text)//4, 150) lines instead of the current hard 60-line cap

def _is_fir(text: str) -> bool:
    # unchanged signature/name (existing callers keep working), new body:
    # return _fir_score(text) >= 2 and not _has_pleading_cause_title(text)

def _parse_generic(text: str) -> Dict[str, Any]:
    # NEW: extract the existing generic-pleading logic currently inlined in extract_fields()'s
    # else-branch (lines ~276-297) into its own named function, unchanged behavior, just extracted
    # so it can be called unconditionally.

def extract_fields(text: str) -> Tuple[Dict[str, str], List[str]]:
    # NEW body:
    #   fields = _parse_generic(text)          # always runs first now
    #   if _is_fir(text):
    #       fir_fields = _parse_fir(text)
    #       for k, v in fir_fields.items():
    #           if v and not fields.get(k):     # FIR pass only fills what generic pass left empty
    #               fields[k] = v
    #   issues = ... (unchanged, still unconditional)
    #   return fields, issues
```

**`_parse_fir()` itself is NOT rewritten** — its existing FIR-form-specific extraction (police station, accused block, acts & sections, substance of complaint) stays as-is; it's now an *overlay* contributor instead of the sole source, and the merge logic above (fill-only-if-empty) is what stops it from stomping a correct generic `case_number`/`petitioner`.

### Wiring map — every consumer that must be re-verified
| Caller | File | What changes for it |
|---|---|---|
| V3 document upload | `backend/documents.py:338` | Gets better fields for both FIR and non-FIR documents; no signature change needed. |
| Legacy OCR endpoint | `backend/ocr_engine.py:184` (`extract_pleading_structure`) | Same fix, different field-name mapping downstream — must be in the test matrix (see below), not just incidentally covered. |
| `document_parser.py` self-test harness (if any) | `backend/document_parser.py:314` | Internal `if __name__` smoke-test block — verify it still runs if present. |

### Implementation steps
1. Extract `_FIR_FORM_MARKERS` from `_parse_fir()`'s existing regexes (don't restate them — import/reference the same compiled patterns so the classifier can never drift out of sync with the parser, per the original plan's own reasoning).
2. Add `_BETWEEN_BLOCK_RE`, `_fir_score()`, `_has_pleading_cause_title()`.
3. Rewrite `_is_fir()`'s body (keep signature — `_is_fir` is also called directly in `tests/test_redaction.py`-adjacent fixtures and possibly elsewhere; grep for direct callers before changing the signature, not just behavior).
4. Extract `_parse_generic()` from `extract_fields()`'s else-branch verbatim (pure refactor, no behavior change at this step — keeps this step's diff reviewable/revertable independent of the merge-logic step).
5. Rewrite `extract_fields()`'s body to the always-generic-then-overlay-FIR merge shown above.

### Test plan
- Unit tests directly on `_fir_score()` / `_has_pleading_cause_title()` / `_is_fir()` in isolation (new, not just end-to-end through `extract_fields()`).
- Fixtures: (a) existing passing real-FIR sample — regression guard, must still classify as FIR and extract police-station/accused fields; (b) the bail application that originally exposed this bug (`FIR No. 221/2026` cited, no versus-line in first 60 lines); (c) a pleading with a `BETWEEN:` block past line 60; (d) a hybrid document (FIR text quoted inside a pleading's argument section) — must NOT inflate `_fir_score` past the anchored-heading restriction.
- Assert `court`, `prayer`, `petitioner_arguments`, `respondent_arguments` are non-empty for fixtures (b) and (c) — the direct regression test for "never set in `_parse_fir()`".
- New fixture for `extract_pleading_structure()` (legacy path) using the same misrouted-bail-application text, asserting `grounds_of_challenge`/`prayer_relief` are populated.
- Full `tests/test_documents.py` and `tests/test_corpus.py` runs (existing fixtures must not regress).

### Acceptance criteria
- Bail-application fixture (b): `case_number` = the application number (not an FIR number), `petitioner`/`respondent` correctly assigned (not swapped), `facts`/`prayer`/`court`/arguments all non-empty.
- Real-FIR fixture (a): unchanged output vs. current behavior (byte-identical field values).
- Legacy-path fixture: `grounds_of_challenge`/`prayer_relief` populated for the same misrouted input.

---

## Bug 4 — Audit ledger divergence (Tier 1, data-integrity)

### Spec
**Schema change** (`backend/database.py`, new migration function following the existing `_m00N_*` pattern in `MIGRATIONS`):
```sql
ALTER TABLE audit_logs ADD COLUMN ledger_synced INTEGER NOT NULL DEFAULT 1;
-- DEFAULT 1 so existing rows aren't retroactively flagged pending; a one-time backfill
-- migration (see below) sets it to 0 only for rows actually missing a ledger counterpart.
```

**New shared module** `backend/audit_utils.py` (avoids the circular-import reason the duplication exists):
```python
def log_audit(action: str, details: str, request=None, user=None) -> None:
    """Writes audit_logs (always), then attempts the hash-chain ledger write (audit_dpdp).
    On ledger-write failure after bounded retries, the audit_logs row is marked
    ledger_synced=0 rather than silently losing the mirror -- never raises to the caller
    for ledger-side failure (primary action must not fail because of an audit-mirror hiccup).
    Raises only if the audit_logs INSERT itself fails."""
    conn = get_connection()
    row_id = conn.execute("INSERT INTO audit_logs (...) VALUES (...)", (...)).lastrowid
    conn.commit()
    conn.close()  # Stage A complete; failure above propagates to caller (logged, request still fails loudly)
    _try_ledger_write(row_id, action, details, request, user)  # Stage B, see below

def _try_ledger_write(row_id, action, details, request, user, retries=3) -> None:
    for attempt in range(retries):
        try:
            record_tamper_evident_event(...)
            return
        except Exception as e:
            if attempt == retries - 1:
                logging.getLogger(__name__).exception(f"Ledger write failed for audit_logs row {row_id} after {retries} attempts")
                conn = get_connection()
                conn.execute("UPDATE audit_logs SET ledger_synced = 0 WHERE id = ?", (row_id,))
                conn.commit(); conn.close()
            else:
                time.sleep(0.05 * (attempt + 1) + random.uniform(0, 0.02))  # small jittered backoff
```

**New admin reconciliation endpoint** `POST /api/admin/audit/resync-ledger` (gated `MANAGE_USERS` or a new `MANAGE_CORPUS`-equivalent, follow existing admin-route permission convention in `server.py`): finds `audit_logs WHERE ledger_synced = 0`, re-attempts `_try_ledger_write` for each, idempotently (skip rows where a concurrent process already set `ledger_synced=1`).

**One-time backfill migration** (new `_m009_audit_ledger_sync` in `database.py`'s `MIGRATIONS` list): for every existing `audit_logs` row, check whether a corresponding `cryptographic_audit_ledger` entry exists (match on timestamp+action+user, best-effort — the ledger doesn't currently store a back-reference to the `audit_logs.id`, which this migration should **also add** as a new `cryptographic_audit_ledger.audit_log_id` column going forward, nullable for pre-existing rows, to make this reconciliation exact rather than fuzzy from now on); set `ledger_synced = 0` for the ~12 currently-diverged rows so the reconciliation endpoint can pick them up post-deploy.

### Wiring map — every call site that must be migrated
| File | Current state | Change needed |
|---|---|---|
| `backend/server.py` (`log_audit` definition + its ~20+ call sites) | Defines `log_audit`, swallows exceptions | Replace definition with `from audit_utils import log_audit`; **do not change any call site** — same name/signature, drop-in. |
| `backend/search_service.py:50-74` | Independent copy-pasted `log_audit` | Delete the copy; `from audit_utils import log_audit`. Update `search_routes.py:11`'s import accordingly (still `from search_service import log_audit` works if `search_service.py` re-exports it, or change to `from audit_utils import log_audit` directly — prefer the latter, one less indirection layer). |
| `backend/documents.py:95-113` (`_server()`/`audit()` lazy lookup) | Calls `_server().log_audit(...)` via `sys.modules` | **No change needed** — this already indirects through whatever `server.py.log_audit` currently is; once `server.py` re-exports the shared `audit_utils.log_audit`, this keeps working unmodified. Verify with a targeted test, don't just assume. |
| `backend/audit_dpdp.py` (`record_tamper_evident_event`, `threading.Lock()`) | Unchanged function, now called from `audit_utils.py` instead of inline in two places | No internal change required for this bug, but **monitor its contention rate post-deploy** per the dependency note below. |

### Test plan
- Unit: monkeypatch `record_tamper_evident_event` to raise; assert the `audit_logs` row is still committed and ends up `ledger_synced=0`, not lost.
- Unit: same, but succeeding on the 2nd of 3 retries; assert `ledger_synced` stays `1` and no false-pending flag.
- Integration: run the reconciliation endpoint against a DB with manufactured `ledger_synced=0` rows; assert convergence and that `audit_dpdp.verify_ledger_integrity()` still passes afterward (the hash-chain's sequencing assumptions must tolerate out-of-real-time-order backfilled blocks — **read `audit_dpdp.py`'s chain-linking logic as the first implementation step**, before writing the backfill job, to confirm this is actually safe; if the chain links strictly by insertion order rather than by a logical timestamp, the backfill approach needs to append new blocks referencing the old timestamp rather than literally reordering, and that distinction must be nailed down before writing code, not discovered during review).
- Concurrency: N parallel `log_audit()` calls against a deliberately lock-contended SQLite ledger; assert zero silent loss (every row ends up `ledger_synced` 1 or correctly flagged 0, never undetectable).
- Regression: assert `server.py.log_audit is search_service.log_audit is audit_utils.log_audit` (import identity) to structurally prevent this duplication from recurring.
- Full `tests/test_security.py`, `tests/test_permissions.py` (audit-adjacent) runs.

### Acceptance criteria
- `GET /api/audit/ledger/verify`'s `total_blocks_verified` matches `audit_logs`' total row count after the backfill migration + one reconciliation run, in a fresh deploy.
- A forced ledger-write failure during normal operation results in a `ledger_synced=0` row, not a silently lost one, verified by a test that inspects the DB directly.

### Dependency / rollout note (carried from the prior plan, now sharper)
Deploy with the `ledger_synced=0` rate monitored (via the existing audit/admin surface, or a quick ad-hoc query) for at least one cycle post-deploy. A persistently high pending rate is a signal the underlying SQLite lock contention needs separate attention (WAL mode, or a single-writer queue for the ledger) — **not** a sign this fix is wrong, but don't declare total victory on the first clean day.

---

## Bug 3 — Seal hash non-reproducibility (Tier 1, data-integrity)

### Spec
**Schema change** (`backend/database.py`):
```sql
ALTER TABLE draft_judgments ADD COLUMN sealed_hash TEXT;
ALTER TABLE draft_judgments ADD COLUMN sealed_at TEXT;
-- Both NULL for drafts never sealed, and for already-sealed drafts until the one-time
-- backfill below runs.
```

**Seal-time hash computation** — the actual seal action lives in `drafts_service.py`'s status-transition logic (where `target == "FINAL_SEALED"` is accepted, per the `STATUS_TRANSITIONS` map at `drafts_service.py:22-24`). At that exact transition:
```python
if target == "FINAL_SEALED":
    sealed_at = datetime.now(timezone.utc).isoformat()
    sections_text = _build_accumulator(draft_row)  # same accumulation export_engine.py already does
    sealed_hash = generate_judgment_hash(draft_row["case_number"], draft_row["case_title"], sections_text)
    conn.execute("UPDATE draft_judgments SET sealed_hash = ?, sealed_at = ? WHERE id = ?", (sealed_hash, sealed_at, draft_id))
```
(Exact accumulator-building call should be extracted into a shared helper importable from both `drafts_service.py` and `export_engine.py`, rather than duplicated — see "DOCX/print-view unification" below.)

**DOCX/print-view unification** (`backend/export_engine.py`):
1. Replace both live `datetime.now()` stamps (lines 149, 249) with the persisted `draft_data["sealed_at"]` **when the draft is sealed**; keep `datetime.now()` only for the explicitly-unsealed "preview" export path (draft not yet `FINAL_SEALED`).
2. Normalize ZIP member timestamps: after `document.save(buffer)`, re-open the buffer as a `zipfile.ZipFile`, set every `ZipInfo.date_time` to a fixed constant (`(1980, 1, 1, 0, 0, 0)` — the standard "deterministic build" convention), and re-serialize. Audit `document.core_properties.created`/`modified` for the same issue (python-docx sets these to real-time `datetime.now()` by default) and pin them to `sealed_at` too when sealed.
3. Both `generate_judgment_hash()` call sites (DOCX export at line 256, print-view at line 318) must, **for a sealed draft**, return the persisted `draft_data["sealed_hash"]` directly rather than recomputing — this is the fix for the "two independently-computed hashes" finding above. For an **unsealed** draft (preview export, which the API must distinguish — see below), both paths may continue to compute fresh, since "preview, not a seal" is a legitimate, different semantic that should not claim seal-level integrity.

**API contract change**: `GET /api/draft/export/docx/{id}` and `GET /api/draft/export/print/{id}` responses should include a `sealed: bool` header or field (e.g. `X-Gyanam-Sealed: true` response header, cheap and doesn't require changing the response body shape) so the frontend can visually distinguish "this is the sealed, verified fingerprint" from "this is a live preview hash that will change" — currently `review.js` presents both identically, which is itself part of why the non-determinism matters (a reviewer has no signal the hash they're looking at isn't the trustworthy kind).

### Wiring map
| File | What changes |
|---|---|
| `backend/drafts_service.py` (status-transition logic, `FINAL_SEALED` branch) | New: computes and persists `sealed_hash`/`sealed_at` at the moment of sealing. |
| `backend/export_engine.py:149,249` | Live `datetime.now()` → persisted `sealed_at` when sealed. |
| `backend/export_engine.py:256,318` (both `generate_judgment_hash` calls) | For sealed drafts: use persisted `sealed_hash`, don't recompute. For unsealed: unchanged (fresh compute, clearly a preview). |
| `backend/server.py:700-703` (`export_docx_endpoint`) and the print-view endpoint | Pass through / set the new `sealed`-status signal in the response. |
| `frontend/app/js/pages/review.js` | Read and display the `sealed` signal distinctly (e.g. "Preview fingerprint (will change until sealed)" vs. "Sealed fingerprint"). This is a real, if small, frontend change — not purely backend. |
| `backend/database.py` `MIGRATIONS` list | New migration for the two columns; **separate** one-time backfill migration (compute `sealed_hash` for already-`FINAL_SEALED` drafts using their current `draft_data`, on the understanding this is a best-effort backfill — a draft sealed before this fix shipped has no way to prove its content wasn't altered between the real seal moment and this backfill run; **document this limitation explicitly in the migration's own comment and in release notes**, don't silently present backfilled hashes as equivalent in trust level to hashes computed at genuine seal time going forward). |

### Test plan
- Seal the same judgment, export DOCX twice: assert byte-identical files (hash the raw response bytes in the test, not just the printed fingerprint string).
- Export via both DOCX and print-view for the same sealed draft: assert identical `sealed_hash` surfaced through both paths (the specific regression test for the two-call-sites finding).
- Attempt any edit path against a `FINAL_SEALED` draft (already blocked per the wiring map's finding #4 above) — assert `sealed_hash` is never silently recomputed/changed as a side effect of a blocked edit attempt.
- Unsealed/preview export: assert it is clearly marked non-sealed in the response and that two previews of an *unchanged* unsealed draft may still differ (acceptable — not a regression, since preview was never claimed to be stable) while two previews *do* differ if the draft content changed (sanity check the preview path still reflects live edits).
- Golden-file test: open a ZIP-timestamp-normalized docx in python-docx, confirm it's still valid and Word/LibreOffice-compatible (use the existing `scripts/office/soffice.py`-equivalent conversion check if available in this repo's tooling, or a `python-docx` round-trip read).

### Acceptance criteria
- Two consecutive DOCX exports of one sealed draft produce byte-identical files.
- DOCX export and print-view export of the same sealed draft report the same hash.
- A backfilled (pre-existing sealed) draft's hash is clearly distinguishable in the API/UI from a post-fix "genuinely sealed-at-the-moment" hash (even if both happen to look like valid SHA-256 strings) — e.g. via a `sealed_hash_backfilled: bool` flag, so the audit trail is honest about which guarantee actually applies to which document.

---

## Bug 6 — Modal confirm-button clipping (Tier 2, UX)

### Spec
`frontend/app/css/components.css`:
```css
.g-modal__head, .g-drawer__head,
.g-modal__actions, .g-drawer__actions { flex-shrink: 0; }
.g-modal__body, .g-drawer__body { flex: 1; overflow: auto; min-height: 0; }
.g-modal__panel, .g-drawer__panel { max-height: 90vh; overflow: hidden; }
```
(`min-height: 0` on the body is the standard companion fix for a flex child with `overflow:auto` that would otherwise refuse to shrink below its content's intrinsic size in some browsers; `max-height: 90vh` + `overflow: hidden` on the panel itself confines all scrolling to the body as intended, rather than letting the whole panel overflow the viewport.)

### Wiring map
Affects all 7 consumers found: `chamber.js`, `document.js`, `documents.js`, `drafts.js`, `kit.js`, `review.js`, `studio.js`, plus `ui/confirm.js` itself — all get the fix for free from one shared-CSS change, no per-page edits needed.

### Test plan
- e2e (`tests/e2e/`): open the Approve/Seal dialog (the one that originally surfaced this) at 1024×768 with its reason/warning text populated; assert the Confirm button's bounding box is fully within the viewport (position/visibility check, not just DOM presence).
- Spot-check at least 2 other `.g-modal` consumers (e.g. `chamber.js`'s suspend-user dialog, `documents.js`'s delete confirmation) at the same viewport, plus a smaller one (e.g. 1024×600) and a typical mobile breakpoint if any of these dialogs are reachable on mobile.
- Visual regression snapshot if the e2e suite's existing baseline-diffing (`test_visual.py`) is extended to cover this — optional, not blocking.

### Acceptance criteria
Confirm button visible and clickable (real click, not just accessibility-tree ref) at 1024×768 for Approve, Seal, and at least one other modal consumer.

---

## Bug 7 — Print-view popup silently blocked (Tier 2, UX)

### Spec
`frontend/app/js/pages/review.js`'s `printView()` (lines 220-228), restructured to open the window synchronously within the click handler:
```javascript
async function printView() {
  const win = window.open('', '_blank');  // synchronous, inside the click's call stack
  if (!win) { toast(t('review.popupBlocked'), { tone: 'warn' }); return; }  // defensive fallback message
  win.document.write('<p>Loading…</p>');  // minimal placeholder while the fetch is in flight
  R.busy = true; paintSign();
  try {
    const blob = await api.printHtml(id);
    const url = URL.createObjectURL(blob);
    win.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    win.close();  // don't leave an orphaned blank/loading tab on failure
    toast(e?.message || t('state.error'), { tone: 'danger' });
  } finally { R.busy = false; paintSign(); }
}
```
Note on `noopener`: the original code passed `'noopener'` as a third arg to `window.open`, which in some browsers makes the returned handle `null` (defeating the "open blank, then set location" pattern). Confirm whether `noopener` isolation is actually required here (it prevents the new window from accessing `window.opener` — likely unnecessary for a same-origin print view) before dropping it; if it *is* required for a security reason not obvious from this read, fall back to an `<a target="_blank" rel="noopener">`-click-simulation pattern instead, which also preserves synchronous-gesture timing.

### Wiring map
Scoped entirely to `review.js`'s `printView()` — no other file calls this function or depends on its internals.

### Test plan
- e2e: click the print-view control, assert a new window/tab actually opens with real content (not just that the backend call fired) — this is the exact gap that let the original bug ship undetected.
- Failure-path test: mock `api.printHtml` to reject, assert no orphaned window is left open and an error toast is shown.
- Popup-blocked-handle test: mock `window.open` to return `null` (simulating a real blocker), assert the defensive toast fires and nothing throws.

### Acceptance criteria
Print view opens a visible new tab/window with real rendered content on a normal click, in both a real browser and the e2e test harness.

---

## Bug 8 — Router shows stale content during async render (Tier 2, UX)

### Spec
`frontend/app/js/router.js`'s `run()` (~lines 115-169), reordered:
```javascript
// 1. breadcrumb/title update (unchanged timing)
hooks.setBreadcrumb([{ label: title }]);
// 2. NEW: clear outlet + show loading placeholder BEFORE awaiting render
const myGen = ++navigationGeneration;  // module-level counter
outlet.setAttribute('aria-busy', 'true');
while (outlet.firstChild) outlet.removeChild(outlet.firstChild);
outlet.append(routeLoadingPlaceholder());  // new small shared helper, reuse ui/skeleton.js's primitive
// 3. await page.render(...) (unchanged call)
const node = await page.render(decision.params || {}, ctx);
// 4. NEW: guard against a stale/abandoned navigation
if (myGen !== navigationGeneration) return;  // user navigated again before this resolved; discard
// 5. swap in the real content, update document.title (existing logic, just now gated by the generation check)
outlet.removeAttribute('aria-busy');
while (outlet.firstChild) outlet.removeChild(outlet.firstChild);
if (node) outlet.append(node);
document.title = `${title} · Gyanam AI`;
```
`routeLoadingPlaceholder()`: a small new export in `ui/skeleton.js` (or inline in `router.js` if it doesn't warrant its own export) — a generic, unstyled-to-any-specific-page loading indicator, since the outlet doesn't know what kind of page is coming.

### Wiring map
Router-core change, so it affects all 10 pages using `async function render`, by construction (that's the fix's whole point — a general gap gets a general fix). Any existing scroll-position-reset or focus-management logic currently living in the post-render swap step (step 5 above) must be audited and preserved exactly — re-read that block of `run()` in full as the first implementation step, before touching anything, to make sure nothing besides DOM-swap timing moves.

### Test plan
- e2e: navigate to a page with a deliberately slowed mock API response (Alerts, with `api.alerts()` artificially delayed via a test-only hook or network throttling) — assert the outlet shows the loading placeholder (not the previous page's content) immediately after the URL/breadcrumb changes, for the duration of the fetch.
- Race-condition test: navigate to page A, then immediately to page B before A's `render()` resolves — assert only B's content ever appears, A's late-resolving render never flashes in. This is the concrete regression test for the generation-token guard.
- Spot-check at least 3 of the 10 `async render` pages beyond Alerts (e.g. Research, Documents, Drafts) at normal speed — assert no regression in existing scroll/focus behavior.

### Acceptance criteria
No page ever shows a different page's content under a URL/breadcrumb that doesn't match it, even transiently, across a sample of pages with async data-fetch-before-render. Rapid back-to-back navigation never shows a stale/abandoned page's content.

---

## Bug 5 — Dashboard loading lag (Tier 3, split scope)

### In scope for this PR: backend query fix
`backend/server.py:314-372` (`GET /api/dashboard_metrics`):
- Replace the leading-wildcard `WHERE court LIKE '%Supreme Court%'` with an exact/prefix match against a normalized value, or a dedicated indexed boolean column (`is_supreme_court`) populated at ingest time (`backend/ingest_authentic_cases.py`) — a leading-wildcard `LIKE` can never use a B-tree index regardless of what else is done.
- Add appropriate `CREATE INDEX` statements (new migration in `database.py`) for whatever columns the other 4+ aggregate queries filter/group on (`court`, `precedent_status` at minimum — confirm exact columns by re-reading the full query block before writing the migration).
- Collapse the 5+ separate `SELECT COUNT(*)`-style queries into fewer aggregate queries where possible (e.g. one query with `GROUP BY`/conditional `SUM(CASE WHEN...)` instead of several full-table passes).
- `frontend/app/js/pages/home.js:248-288` (`syncCard()`/`usersCard()`): memoize these the same way `dashboard_metrics` already is, with a short TTL, so repeated mounts don't refire all three independently.

### Explicitly NOT in scope for this PR
The client-side-possible-bug half. Before that can be specified: add timing instrumentation (server-side request-timing logs around the relevant endpoints at realistic data volume; client-side `performance.now()` correlation around each `api.*` call in `home.js` vs. the DOM's loading→shown transition). **This is a short investigation spike, not a fix** — its output determines whether a second PR is even needed. Flagging this split explicitly so it isn't silently dropped.

### Test plan (backend half only)
- Load/perf test against a 100k+-row seeded fixture DB, asserting `/api/dashboard_metrics` p95 latency under an explicit SLA (e.g. <1s), run in CI — currently there's no guard against this regressing again.

### Acceptance criteria (backend half only)
`/api/dashboard_metrics` p95 latency under the agreed SLA against a realistically-sized fixture. (No claim about the full 8-10s symptom being eliminated — that depends on the instrumentation spike's findings.)

---

## PR structure and sequencing

**Single branch/PR**, as requested: `fix/judge-journey-bugs-tier1-2`.

Recommended internal commit sequence within that one PR (smallest/safest first, so a partial revert is possible if review flags an issue with a later piece):
1. Bug 6 (CSS only, zero backend dependency, trivial to verify).
2. Bug 1 (fully independent of everything else in this batch).
3. Bug 7 (small, isolated to one function).
4. Bug 8 (router-core, touches many pages — do after 6/1/7 so CI has already validated the simpler changes land cleanly on this branch).
5. Bug 4 (schema migration + shared-module refactor — **read `audit_dpdp.py`'s chain-linking logic first**, as its own sub-step, before writing the backfill job).
6. Bug 3 (schema migration — depends on nothing else in this list, but is the most involved single piece; do last so the simpler schema migration in step 5 has already proven the migration pattern works cleanly on this branch).
7. Bug 5 backend half (fully independent, can actually happen anywhere in this sequence — listed last only because it's the lowest-tier item).

Each step gets its own commit (not squashed), so review can go commit-by-commit if preferred.

### Opportunistic cleanup (explicitly optional — flag for your decision, not assumed)
While in this code, two other duplication patterns were found that aren't bugs today but are risk multipliers for the future, matching the `log_audit` pattern this PR already fixes:
- `CANONICAL_STATUSES` / status-transition map duplicated between `drafts_service.py` and `server.py`.
- Not discovered elsewhere in this pass, but worth a quick grep sweep for other `server.py`-vs-`*_service.py` copy-paste pairs while this architectural pattern is fresh, since it's exactly how Bug 4 happened.

**I have not included de-duplicating these in the plan above** — say the word if you want it folded into this PR (small additional scope, same branch) or left for later.

---

## What I need from you before starting

1. Confirm the branch name, or give me a different one.
2. Confirm scope: proceed with all 7 (Bugs 1, 3, 4, 5-backend, 6, 7, 8) in one PR as planned, or trim/reorder anything.
3. Decide on the opportunistic `CANONICAL_STATUSES` cleanup — in or out.
4. **Explicit go-ahead to start implementing** — I will not create the branch, write code, commit, or push until you say so, per your instruction.
