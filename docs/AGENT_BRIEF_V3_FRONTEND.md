# Frontend brief (v3)

Read `docs/AGENT_BRIEF_V3.md` (working rules), `docs/API_V3_CONTRACT.md` (API shapes; every call goes through the
`api` object in `frontend/app/js/api.js`, already extended with `api.documents.*`, `api.courts`, `api.savedSearches.*`,
`api.lineages`, `api.judgmentParagraphs`, `api.judgmentTreatments`, `api.draftVersion`, `api.restoreDraft`), and
`frontend/app/CONTRACT.md` (hard rules, enforced by `tests/lint.test.js`).

## Consistency (the user asked for one consistent UI)
- Study before writing: `css/tokens.css`, `css/base.css`, `css/pages.css`, `css/components.css`, and the most recent
  page styling `css/page-research.css` + `js/pages/research.js` (search card, result cards, chips that wrap,
  breakpoints 1680 / 1180 / 480). Reuse components from `js/ui/` (card, button, chip, tabs, table, stepper, field/
  input/select/textarea, modal, drawer, confirmDialog, emptyState, errorState, skeleton, banner, toast, listRow,
  statTile, sourcePanel, pdfViewer, citationChip, checkList, timeline). Icons: names in `icons.svg` only.
- Page shape: `h('div', {class: 'g-page <prefix>'}, header.g-page__head (h1.g-page__title + p.g-page__lede + actions), …)`.
  Serif for titles/judgment text (`var(--font-serif)`), sans for UI. Fonts in px only as `calc(Npx * var(--fz))`
  or the `--fs-*` tokens. Colours only via tokens. Min touch target 44px for primary controls.
- Every state: loading (skeleton), empty (emptyState with a next action), error (errorState with retry + requestId),
  permission-hidden controls via `ctx.can(...)`.
- Honest labels: never present defaults/templates as findings (see CLAUDE.md). Unavailable data says so.
- i18n: every visible string via `t()`; per-page files `js/i18n/pages/<page>.en.js` and `.hi.js` with identical keys
  (Hindi may be a careful translation; mark nothing as reviewed).
- Pure logic in `js/pages/lib/<name>-logic.js` with `node --test` tests in `tests/<name>.test.js` (no DOM at import).
  Pages never import other page files.
- Accessibility: labels for every input, `aria-live` for async results, focus management after navigation-like
  actions, keyboard reachable controls, `role="group"`/`aria-labelledby` on card sections.
- Run `node --test "tests/*.test.js"` from `frontend/app` until green (lint + routes + i18n parity included).
- Core files (`api.js`, `router.js`, `pages/index.js`, `ui/sidebar.js`, `ui/topbar.js`, `ui/shell.js`,
  `ui/search-palette.js`, `i18n/en.js`, `i18n/hi.js`, `css/tokens.css`, `css/base.css`, `index.html`,
  `tests/routes.test.js`) may only be edited by the agent whose prompt names them. Otherwise write the request in
  `docs/wiring/<agent>.md`.
