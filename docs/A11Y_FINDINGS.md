# Accessibility findings (axe-core sweep)

Test: `tests/e2e/test_a11y_axe.py` (Chromium, vendored `tests/e2e/vendor/axe.min.js`, tags wcag2a/2aa/21a/21aa).
Signed in as Admin on 11 pages: home, research, studio (`/drafts/1`), drafts, intake, audit, settings, library,
alerts, matters, citation-check. Modes: 1280px, 375px, and 1280px with `data-fontsize=xlarge`.

## Result

33 of 33 page/mode combinations passed: **zero serious or critical violations**.

| Rule id | Page | Selector | Fix suggestion |
|---|---|---|---|
| (none) | - | - | - |

## Scope and caveats

- Only serious/critical impacts are asserted (the shared `run_axe` helper filters out moderate/minor). Moderate and
  minor issues were not reported and may exist.
- axe cannot judge everything (focus order, meaning of alt text, reflow quality at 375px, contrast over images/gradients).
  Pair with `test_keyboard.py` and manual review.
- Pages reached in the loaded (data-present) fixture state only; empty/error states, open overlays (palette, dialogs)
  and Hindi are covered by the older `test_a11y.py`, not this file.
- The xlarge mode sets `data-fontsize` on `<html>` after load (and seeds localStorage `gyanam.fontsize`).
- Environment note: installed playwright (1.64.1) expects Chromium rev 1248 but only rev 1234 is installed, so the test
  file overrides the `browser` fixture to fall back to the installed `chromium-1234` via `executable_path`
  (override with `GYANAM_E2E_CHROMIUM`). No browsers were downloaded. The shared `conftest.py` `browser` fixture
  (used by the other e2e tests) still fails on this machine for that reason.

## Firefox smoke

Not run: `%LOCALAPPDATA%\ms-playwright` contains only chromium-1234, chromium_headless_shell-1234, ffmpeg and winldd;
no Firefox build. Browsers were not downloaded. To run once installed:
`python -m pytest -c tests/e2e/pytest.ini tests/e2e/test_smoke.py --e2e-browsers=firefox`.

## Report-only sweep: all impacts + best-practice (added)

Collector tests in `tests/e2e/test_a11y_axe.py` (`test_axe_collect_all_*`), enabled with `GYANAM_AXE_ALL=1` (skipped
otherwise; they never fail on violations, only record). Tags: wcag2a, wcag2aa, wcag21a, wcag21aa, **wcag22aa,
best-practice**; all impacts kept. Findings (rule, impact, page, mode, selector, failure summary) are written to
`tests/e2e/.artifacts/axe_all.json` (gitignored-style output dir; regenerated each run). Run:
`GYANAM_AXE_ALL=1 PYTHONPATH=... python -m pytest -c tests/e2e/pytest.ini tests/e2e/test_a11y_axe.py -k collect_all --e2e-browsers=chromium`
(73 scenarios, about 4.5 minutes).

Scenarios (73): the 11 pages x {1280, 375, xlarge} as Admin (33); Hindi home/studio/intake as Admin (3);
sidebar collapsed (`gyanam.sidebar=collapsed`) on home/research/studio (3); command palette open (Ctrl K) (1);
intake "View full size" dialog (1, as Clerk, using an uploaded blank PNG); admin role-preview banner
(`#g-preview-select` = STUDENT) at 1280 and 375 (2); and, added because the Admin role gets the Forbidden page on
drafter-only routes (see caveat), studio/drafts/intake/alerts/matters as **Clerk** x 3 modes x {English, Hindi} (30).
All 73 scenarios were reached (no "not reachable" notes).

### Totals: 18 node-level findings, 4 distinct rules

| Rule | Impact | Type | Nodes | Where | Selector |
|---|---|---|---|---|---|
| landmark-unique | moderate | best-practice | 13 | home (all modes, Hindi, sidebar-collapsed, palette-open); full-size dialog state (topbar) | `section[aria-labelledby="card-4"]`, `section[aria-labelledby="card-5"]`; `.g-topbar` |
| landmark-complementary-is-top-level | moderate | best-practice | 3 | library, 1280/375/xlarge | `.g-library__side` |
| landmark-no-duplicate-banner | moderate | best-practice | 1 | intake with the "View full size" dialog open | `.g-topbar` |
| target-size (WCAG 2.2 AA 2.5.8) | serious | wcag22aa | 1 | research, xlarge only | `#f-9` |

Zero minor findings. Clean (no findings at any impact): Hindi on studio/intake, Clerk English and Hindi on
studio/drafts/intake/alerts/matters at all three modes, the open palette (apart from the home-page landmarks), and the
role-preview banner state at 1280 and 375.

### Assessment

- **landmark-unique on home (real, low priority).** Two `<section aria-labelledby="card-N">` regions on the home page
  share the same landmark role and the accessible names are not distinct (or are empty: the ids `card-4`/`card-5`
  appear to be generated per card and may not resolve to a heading). Fix: give each section a unique visible heading
  and point `aria-labelledby` at it, or drop the section role (use a `div`) if they are not landmarks worth
  navigating to. Same rule on `.g-topbar` only appears in the dialog state (see next).
- **landmark-no-duplicate-banner / landmark-unique on `.g-topbar` with the full-size dialog open (probable
  artifact, unverified).** Only the dialog state triggers it, so it is most likely the dialog layer (portal/clone or a
  dialog header with a banner role) rather than a second topbar in the normal page. Needs a manual look at the
  dialog DOM before changing anything; do not treat as confirmed.
- **landmark-complementary-is-top-level on library (real, low).** `<aside class="g-library__side">` is nested inside
  another landmark. Fix: move the `aside` out of `main`/its landmark ancestor, or replace it with
  `<div role="region" aria-label=...>` / a `nav`/`section` appropriate to its content.
- **target-size on `#f-9`, research, xlarge only (real in that mode, but needs confirmation).** At the xlarge font
  setting the target is "partially obscured" (smallest free area 12x53 px) and lacks 24 px of spacing. Likely a filter
  control that overlaps its neighbour when text is enlarged. Fix: add min-height/min-width 24 px and spacing, or stop
  the overlap (flex-wrap/gap) in the research filter row at `data-fontsize=xlarge`. Only the node-obscured check is
  involved; a manual look is warranted since axe sometimes miscomputes overlap with sticky/positioned elements.
- No contrast, name/label, ARIA, heading-order, region, tabindex, or autocomplete issues were found at any impact.
  The best-practice rules `region`, `heading-order`, `page-has-heading-one`, `landmark-one-main` all passed.

### Caveats specific to this sweep

- **Admin probably sees the Forbidden page on drafter-only routes (inferred from the role table and the intake file input being absent for Admin; not screenshot-verified).** `helpers.routes` allows studio, drafts, intake, matters and
  alerts for Justice/Clerk only, so the original Admin sweep (and the serious/critical test above) effectively scanned a
  Forbidden screen for those five routes. The Clerk scenarios added here cover the real pages; the original assertion
  test was left unchanged.
- Hindi and the sidebar-collapsed state use the same data-present fixtures; empty/error states are still not covered.
- Colour contrast is only evaluated where axe can compute the background (not over images/gradients).
- axe does not exercise keyboard focus order, focus return, or screen-reader output; see `test_keyboard.py`.
- Palette and dialog scans cover the first open state only, not filtered/empty palette results or zoomed dialog states.
