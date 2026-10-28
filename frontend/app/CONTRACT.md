# Frontend contract (all agents must follow this exactly)

Source of truth: `docs/UI_REDESIGN_PLAN.md` (§3 principles, §4 tokens, §5 pages, §6 wiring, §9 architecture). Designs: `docs/ui_designs/*.dc.html`.
Zero-build ES modules, served at `/app/`. No `innerHTML`, no `eval`, no inline handlers, no raw hex outside `css/tokens.css`, no `fetch` outside `js/api.js`.
All paths below are relative to `frontend/app/`. Import with relative paths and `.js` extensions.

## Shared files already written
- `css/tokens.css` (tokens), `js/dom.js` exports `h, append, clear, icon`.

## Ownership (never edit a file you don't own)
- Core (agent FE-CORE): `index.html`, `icons.svg`, `css/base.css`, `css/pages.css` (shared page layout helpers only), `js/main.js router.js api.js store.js format.js escape.js i18n/en.js i18n/hi.js i18n/index.js`, `js/ui/shell.js sidebar.js topbar.js status.js`.
- Components (agent FE-UI): `css/components.css`, `js/ui/*` except the four above, `js/pages/kit.js`.
- Page agents: only their own `js/pages/<name>.js`, optional `css/page-<name>.css` (loaded by their page via `loadCss('page-<name>.css')` exported from `js/ui/shell.js`... see below), and `tests/<name>.test.js`.

## api.js (FE-CORE) — exact exports, one per endpoint, all return parsed JSON (or Blob for exports)
`class ApiError extends Error {status, code, detail, requestId}`
`api.auth`: `ssoLogin(role)`, `login(email,password)`, `me()`, `roles()`
`api.status()`, `api.dashboardMetrics()`, `api.recentCases(limit)`
`api.sync`: `trigger()`, `status()`, `history()`
`api.search(body)`, `api.judgment(id)`, `api.verifySingleCitation(citation)`, `api.verifyCitations(text)`
`api.ocrProcessBrief(file, opts)` (multipart), `api.ocrAnonymize(text)`, `api.uploadPleading(file)`
`api.draftJudgment(body, {signal})` (120 s), `api.saveDraft(body)`, `api.drafts()`, `api.draft(id)`, `api.updateDraftStatus(id,status,extra)`
`api.exportDocx(id)` (Blob), `api.printUrl(id)`
`api.auditLogs(params)`, `api.ledgerVerify()`, `api.ledgerBlocks()`, `api.auditCsv()` (Blob)
`api.admin`: `users()`, `toggleUser(userId)`
`api.docs`: `list()`, `read(file)`
`api.matters()`, `api.matter(key)`, `api.alerts()`, `api.judgmentGraph(id)`, `api.draftVersions(id)`
Session: `getToken()`, `setSession({token,user})`, `clearSession()`, `getUser()`, `can(permission)`. Token in `sessionStorage`.
Errors: 401 → clear session + `location.hash = '#/signin?next=...'`; 403 → `#/forbidden`; 409 → throw `ApiError` with `status 409` (page shows `confirmDialog`); network failure → dispatch `window` event `gyanam:offline`.
Base URL is same origin (`/api/...`).

## router.js
`registerPage(mod)`; `navigate(hash)`; page module shape: `export default { route:'/drafts/:id', title:'Drafting studio', permission:'DRAFT_FULL'|null, render(params, ctx) -> Node|Promise<Node>, onLeave() }`.
`ctx = {user, can, query (URLSearchParams), setBreadcrumb([{label,href}]), setHistoryHandler(fn), toast, navigate}`.
Pages register via `js/pages/index.js` (FE-CORE owns it; it imports every page file listed in plan §5.1; a missing page file is skipped with a console warning via dynamic import).

## store.js
`store.get(key)`, `store.set(key,val,{session:true})`, `store.on(key,fn)`. Hand-off keys: `benchBrief`, `intakeParams`, `alertTarget`.

## format.js
`formatNumber(n)` (en-IN), `formatDate(d)`, `formatDateTime(d)`, `formatRelative(d)`, `plural(n,one,many)`.

## escape.js
`escapeHtml(s)`. Needed only for the Library markdown path; elsewhere use `textContent` via `h()`.

## i18n
`t('key.path', vars)`; keys flat dotted strings in `en.js` / `hi.js` default exports; missing hi falls back to en. Page agents add their keys in `js/i18n/pages/<name>.en.js` / `.hi.js` (default-exported flat objects) and register them at module load with `addMessages('en', obj)` from `js/i18n/index.js`. Chrome strings only.

## Components (FE-UI) — all return DOM Nodes; options objects; every one has a header comment with usage
`ui/status.js` (FE-CORE) exports `draftStatusChip(status)`, `precedentChip(status, {curated})` returning `{label, tone}`; chips render via `chip()`.
- `chip({label, tone:'neutral|primary|danger|warn|info', icon})`
- `button({label, variant:'primary|secondary|ghost|danger', icon, onClick, disabled, type, href})`
- `card({title, actions, class}, ...children)`
- `tabs({items:[{id,label,badge}], active, onChange})`
- `listRow({title, meta, status(chip), selected, href, onClick})`
- `table({columns:[{key,label,render}], rows, empty, onRowClick})`
- `timeline(events:[{time, title, detail, user}])`
- `statTile({label, value, hint, tone})`
- `checkList(items:[{label, state:'pass|fail|pending|unchecked', detail}])`
- `citationChip({citation, status, curated, href})`
- `sourcePanel({title, subtitle, pdfUrl, highlights, body})`; `pdfViewer({url})` (iframe with "Open original" fallback)
- `stepper({steps:[{id,label}], current})`
- `modal({title, body, actions, onClose})` returns `{el, open(), close()}`; `drawer({title, body, onClose})` same shape
- `toast(message, {tone})` (global, self-mounting)
- `confirmDialog({title, message, confirmLabel, tone}) -> Promise<boolean>`
- `searchPalette({commands})` (Ctrl K) mounted by shell
- `emptyState({title, message, action})`, `errorState({message, requestId, onRetry})`, `skeleton({lines, class})`
- `banner({tone, message, action})` (for "sample data", offline, etc.)
- `field({label, input, hint, error})`, `input()/textarea()/select()` helpers in `ui/form.js`
Class naming: BEM-ish prefixed `g-` (e.g. `g-card`, `g-chip--danger`). Component CSS lives only in `css/components.css`.

## shell (FE-CORE)
`mountShell(root)` returns `{content: HTMLElement}`; renders sidebar (role-aware items per plan §5.1), topbar (breadcrumb, History button, Ctrl K, freshness indicator "Corpus synced N min ago" from `api.sync.status()`, EN/HI switch, user menu with sign-out), a live `aria-live` region, and the offline banner. `loadCss(file)` exported for page CSS.

## Cross-page UI libs (v3 convention)
A page agent with more than one related route (e.g. `documents.js` + `document.js`, or `research.js` + `judgment.js`) may put DOM-building helpers shared by that family in `js/pages/lib/<name>-ui.js` (e.g. `document-ui.js`, `research-ui.js`, `judgment-ui.js`, `draft-ui.js`) alongside the pure-logic `<name>-logic.js`, and import it from any page in the family. These stay owned by the same page agent; they are not promoted to `js/ui/kit.js` unless a second, unrelated page needs them. Related pages also share a one-letter-ish CSS class prefix across their `page-*.css` files (e.g. `dc-` for both `page-documents.css` and `page-document.css`) instead of repeating full page names in class names.

## Testing
Pure logic (format, router matching, api error mapping with a fake fetch, status mappings, store) is unit-tested with `node --test` in `tests/`. Anything that touches `document` must be guarded so pure modules import cleanly in Node (no top-level DOM access in `api.js format.js escape.js store.js status.js i18n`).
