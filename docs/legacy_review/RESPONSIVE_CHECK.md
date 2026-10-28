# Responsive check: Documents + studio/research (v3)

QA agent 1. Standalone Python Playwright script (`C:/Temp/responsive_check.py`, pattern from
`C:/Temp/shot_research.py`), against the live dev server `http://127.0.0.1:8091` (real Gemini key, test
corpus DB), signed in as Clerk (token injection via `sessionStorage`, same SSO endpoint the real sign-in
page uses -- see "Documents feature - issues found" in `docs/E2E_RUN_REPORT.md` for why the real sign-in
*page* itself currently can't be used for this: a pre-existing bug bounces non-admin roles to Forbidden).
Pages: `#/documents`, `#/documents/<id>` (a confirmed Clerk document already on this server), `#/research`,
`#/drafts/<id>` (studio, a DRAFT-status draft already on this server). Widths: 390, 800, 1100, 1280, 1440,
1920. For each page/width: a screenshot, plus an in-page check for (a) any element whose right edge exceeds
the viewport width, (b) `document.documentElement.scrollWidth` > viewport width (page-level horizontal
scroll), and (c) the height of every distinct primary/secondary button and link-styled-as-button under 44px
(first instance of each accessible name only, to avoid duplicate noise).

Screenshots: `tests/e2e/.artifacts/responsive_v3/<page>_<width>.png` (24 total). Raw measurements:
`tests/e2e/.artifacts/responsive_v3/findings.json`.

## Summary

No page-level horizontal scroll (`hscroll: false`) at any width, on any of the four pages. One real overflow
issue (document detail tab strip at phone width) and one pre-existing, app-wide, non-Documents-specific
touch-target pattern (topbar icon buttons ~34-38px). Full detail below.

## Pass / fail per page / width

| Page | 390 | 800 | 1100 | 1280 | 1440 | 1920 |
|---|---|---|---|---|---|---|
| `#/documents` | PASS | PASS | PASS | PASS | PASS | PASS |
| `#/documents/<id>` | **FAIL** (tab strip clipped, see below) | PASS | PASS | PASS | PASS | PASS |
| `#/research` | PASS (see note: stray "null" text) | PASS | PASS | PASS | PASS | PASS |
| `#/drafts/<id>` (studio) | PASS | PASS | PASS | PASS | PASS | PASS |

"PASS" here means: no page-level horizontal scroll, no element overflowing past the viewport's right edge,
and no *Documents-feature-specific* layout break. It does not mean zero findings -- see the touch-target
note, which applies to every page at every width and is pre-existing/app-wide, not scored as a per-cell
failure.

## Issues found

### 1. `#/documents/<id>` at 390px: the workspace tab strip clips two of six tabs, with no visible scroll cue

- **Where**: `frontend/app/js/pages/document.js`, the `tabsHost` built by `paintTabs()` (around line
  127-131), rendering `tabs({...})` from `frontend/app/js/ui/tabs.js`. The tab list is
  `Source, Details, Issues, Research, Authorities cited, Drafts` (6 items when not wide; `document.js`
  line 116-126).
- **Expected**: all 6 tabs reachable at phone width -- either wrapped, or in a horizontally scrollable strip
  with a visible affordance (fade/arrow/scrollbar) that a touch user would notice.
- **Actual**: at 390px, "Authorities cited" and "Drafts" are cut off past the right edge of the viewport
  (measured: tab elements with `right = 500px` and `right = 599px` against a 390px viewport) with no visual
  cue that more tabs exist. `document.documentElement.scrollWidth` is NOT inflated (the clip happens inside
  the tab strip's own box, which presumably has `overflow` scroll behaviour on its own axis), so this is a
  **component-local** overflow, not a page-level one -- `tests/e2e/test_smoke.py`-style "no horizontal
  scroll" checks would not catch it.
- **How it was found**: `tests/e2e/.artifacts/responsive_v3/document_detail_390.png`, and
  `findings.json`'s `"document_detail"` row at `"width": 390` (`"overflow": ["overflow:.g-tab right=500
  vw=390", ..., "overflow:.g-tab right=599 vw=390", ...]`).
- **Not seen** at 800px and above (`document_detail_800.png`): all 6 tabs visible, normal row, no clipping.

### 2. `#/research` at 390px: a stray literal "null" renders on the page

- **Where**: visible in `tests/e2e/.artifacts/responsive_v3/research_390.png`, between the "Sort by /
  Save search" row and the "Ask a question" heading. Not Documents-specific (pre-existing `research.js`),
  noted here because it was seen during this sweep and nowhere else in the owned test files tracks it.
  Likely an un-guarded `${value}` template interpolation or a conditional that renders `null` as text
  instead of being left empty when a value (e.g. a saved-search count, or a `researchHistory` entry with no
  query) is absent. Not reproduced at 800px+ in this run, so it may be width- or state-dependent; worth a
  second look by whichever agent owns `frontend/app/js/pages/research.js`.

### 3. Topbar icon buttons are 34-38px tall on every page, at every width (not Documents-specific)

`Open menu`/`Collapse sidebar` 36px, `Search or jump to... Ctrl K` 36px, `A-`/`A+` 34px, `EN`/`हि` 34px,
user-menu avatar 38px -- all under the 44px touch-target guideline, consistently across `#/documents`,
`#/documents/<id>`, `#/research` and `#/drafts/<id>` and across every width including 390 (phone). This is a
topbar-wide (`frontend/app/js/ui/topbar.js`) design choice, not something introduced by the Documents work,
so it is reported here as an observation rather than a per-page fail. The actual primary action buttons on
each page (`Choose file`, `Save now`, `Send for review`, `Search`, etc.) were not flagged -- only the
topbar's small icon buttons.

## What was not covered

- Hindi (`lang=hi`) and dark-theme variants were not screenshotted (English, system theme only, matching the
  dev server's default state).
- `#/documents/<id>` was only checked in its default tab (Details); Issues/Research/Authorities/Drafts tabs
  were not individually screenshotted at each width.
- Firefox/WebKit were not covered (Chromium only, per the available install).
