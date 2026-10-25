# Parity fixes: items 1,2,3,5,6,8,9 (test plan)

Scope: bring back features the old portal had. Honesty principle stays: no invented data; corpus is metadata only.

| # | Item | Owner | Unit tests (node --test) | Browser checks (orchestrator) |
|---|------|-------|--------------------------|-------------------------------|
| 1 | Studio: applicable sections breakdown (statute knowledge base) | Agent A | section parsing, lookup, unknown section handled | Studio draft with "IPC 341, 420" shows explained rows; unknown section shows "not in the built-in list" |
| 2 | Studio: solved precedents for these sections (api.search per section) | Agent A | query building, dedupe, overruled last | panel lists real corpus results, empty and error states |
| 3 | Studio: why judgment was given (ratio) | Agent A | derives from draft sections 11-13 and curated ratio only | panel shows labelled excerpt, never template ratio as fact |
| 5 | Intake: full-size zoom of scanned image | Agent B | zoom level clamp, keyboard handling | open, zoom in/out, Esc closes, focus returns |
| 8 | Audit: Reports & Analytics tab (computed from audit rows) | Agent B | aggregation by action, user, day; empty state | tab shows counts that match Activity rows |
| 6 | Sidebar: Tender dossier link (+ slides) | Agent C | nav item visibility by permission | link opens /pdf in new tab |
| 9 | Sidebar collapse and wide-screen toggle (persisted) | Agent C | collapse state persistence | collapse/expand, persists on reload, keyboard operable, mobile unaffected |

Cross-cutting (all agents): en and hi strings for every new label; tokens only (lint test); no innerHTML; all text scales with the text-size control; focus-visible and aria on new controls; 375 px no horizontal overflow.
Gates: `node --test frontend/app/tests/*.test.js` all pass; `python -m pytest tests --ignore=tests/e2e` all pass; orchestrator browser pass on port 8091.
