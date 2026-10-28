# Patch requests from qa1 (end-to-end verification, v3 Documents + parity)

I only edit `tests/e2e/test_documents_journey.py` (new), `tests/e2e/helpers.py` (routes only),
`docs/E2E_RUN_REPORT.md` and `docs/legacy_review/RESPONSIVE_CHECK.md`. The one gap below needs a file I
don't own (`tests/build_fixture.py`), so it is written here as an exact patch instead of guessed at.

## Add a deterministic `document` row to the fixture DB, then cover `/documents/:id` in the smoke + axe sweeps

**Why it isn't already in `tests/e2e/helpers.py` `routes()` or `tests/e2e/test_a11y_axe.py` `PAGES`:**
every other detail route in those two files (`judgment`, `draft`/`studio`, `matter`) is parametrized from a
fixed id seeded by `tests/build_fixture.py` (`ids['judgment']`, `ids['draft']`, `ids['matter']`). Documents
are created with a server-side `uuid4().hex` id (`backend/documents.py`, `_create` / `POST /api/documents`),
so there is no id to hard-code the way the others are. `/documents/:id` end-to-end coverage lives instead in
`tests/e2e/test_documents_journey.py` (uploads a real document, then exercises the detail page). The list
page `/documents` (no id needed) is already covered in both `helpers.py` `routes()` and
`test_a11y_axe.py` `PAGES`/`DRAFTER_PAGES` as of this pass.

**The patch, if a fixture document is wanted for `/documents/:id` smoke/axe parametrization too:**

1. `tests/build_fixture.py` — in `build(db_path)`, after the drafts are seeded (wherever `draft_judgments`
   rows are inserted) and inside the same `database.get_connection()` block, insert one fixed-id document +
   its first extraction version so a document detail page exists at collection time without network calls:

   ```python
   DOCUMENT_ID = "e2e00000000000000000000000000d0"  # 32 hex chars, matches uuid4().hex shape
   conn.execute(
       "INSERT INTO documents (id, title, doc_type, status, source, matter_key, original_name, mime, size, "
       "sha256, uploaded_by, uploaded_role, created_at, updated_at) VALUES (?, 'Fixture petition', 'PETITION', "
       "'CONFIRMED', 'pasted', ?, NULL, NULL, 0, '', 'Siddharth Mathur', 'LAW_CLERK', ?, ?)",
       (DOCUMENT_ID, MATTER_KEY, now_iso, now_iso))
   conn.execute(
       "INSERT INTO document_extractions (document_id, version, fields_json, issues_json, authorities_json, "
       "saved_by, saved_at) VALUES (?, 1, ?, ?, '[]', 'Siddharth Mathur', ?)",
       (DOCUMENT_ID, json.dumps({"court": "High Court of Judicature for Rajasthan at Jodhpur",
        "case_number": "E2E/1/2026", "case_title": "Fixture Petitioner v. State of Rajasthan", "petitioner": "",
        "respondent": "", "facts": "Fixture facts.", "prayer": "", "statutory_provisions": "",
        "petitioner_arguments": "", "respondent_arguments": ""}),
        json.dumps(["Whether the fixture issue is made out."]), now_iso))
   ```
   (match the exact column list/types already used for `draft_judgments` nearby; `confirmed` is implied by
   `documents.status = 'CONFIRMED'` per `backend/documents.py`'s `get_document`.)

2. `tests/e2e/helpers.py` — in `routes(ids)`, add `ids['document']` to the dict callers pass and one line
   next to the existing `("documents", "/documents", DRAFTERS)`:
   ```python
   ("document", f"/documents/{ids['document']}", DRAFTERS),
   ```
   and in `tests/e2e/test_smoke.py`, add `"document": "e2e00000000000000000000000000d0"` to `_IDS`.

3. `tests/e2e/test_a11y_axe.py` — add `("document", "/documents/e2e00000000000000000000000000d0")` to
   `PAGES` and to the `DRAFTER_PAGES` name filter tuple.

Until this lands, `/documents/:id` accessibility and smoke coverage comes only from
`test_documents_journey.py` (one Clerk pass, 1280x900 viewport, English only) rather than the full
axe sweep's role/viewport/language/font-size matrix.
