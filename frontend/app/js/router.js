// Hash router. Page module shape:
//   export default { route:'/drafts/:id', title:'Drafting studio', permission:'DRAFT_FULL'|['A','B'] (array = any of)|null,
//                    public?:true (no token needed), bare?:true (render without shell, e.g. sign-in),
//                    render(params, ctx) -> Node|Promise<Node>, onLeave() }
// ctx = {user, can, query, setBreadcrumb([{label,href}]), setHistoryHandler(fn), toast, navigate}
// Boot: configureRouter({...hooks}); registerPage(mod) for each page; startRouter().
// The pure functions (parseHash, matchRoute, resolveRoute) import cleanly in Node; DOM is touched only at render time.
import { getUser, getToken, can as realCan } from './api.js';
import { effectiveCan, effectiveUser, loadPreview } from './ui/role-preview-logic.js';

const pages = [];
const hooks = {
  outlet: null, toast: () => {}, announce: () => {}, setBreadcrumb: () => {}, setHistoryHandler: () => {},
  onLayout: () => {}, onRoute: () => {}, renderError: null, ensureProfile: null,
};
let current = null; // {page, params}
let seq = 0;

export function configureRouter(h) { Object.assign(hooks, h); }
export function registerPage(mod) {
  if (!mod || !mod.route || typeof mod.render !== 'function') throw new Error('registerPage: invalid page module');
  const i = pages.findIndex((p) => p.route === mod.route);
  if (i >= 0) pages[i] = mod; else pages.push(mod);
}
export function getPages() { return pages.slice(); }
export function _resetPages() { pages.length = 0; current = null; }

/** '#/research?q=a%20b' -> {path:'/research', query:URLSearchParams} */
export function parseHash(hash) {
  let h = String(hash || '').replace(/^#/, '');
  const qi = h.indexOf('?');
  const queryStr = qi >= 0 ? h.slice(qi + 1) : '';
  if (qi >= 0) h = h.slice(0, qi);
  if (!h.startsWith('/')) h = '/' + h;
  if (h.length > 1) h = h.replace(/\/+$/, '');
  return { path: h || '/', query: new URLSearchParams(queryStr) };
}

/** Match '/drafts/:id' against '/drafts/12' -> {id:'12'} or null. A trailing '?' on a param ('/graph/:id?') makes it optional. */
export function matchRoute(pattern, path) {
  const ps = pattern.split('/').filter(Boolean);
  const xs = path.split('/').filter(Boolean);
  const params = {};
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (p.startsWith(':')) {
      const optional = p.endsWith('?');
      const name = p.slice(1, optional ? -1 : undefined);
      if (xs[i] === undefined) { if (optional) continue; return null; }
      try { params[name] = decodeURIComponent(xs[i]); } catch { params[name] = xs[i]; }
    } else if (p !== xs[i]) return null;
  }
  if (xs.length > ps.length) return null;
  return params;
}
function score(pattern) { return pattern.split('/').filter(Boolean).reduce((a, s) => a + (s.startsWith(':') ? 1 : 3), 0); }

export function findPage(list, path) {
  let best = null;
  for (const page of list) {
    const params = matchRoute(page.route, path);
    if (params && (!best || score(page.route) > score(best.page.route))) best = { page, params };
  }
  return best;
}

/** Pure decision: what should the router do for this hash? */
// Pages follow an admin's active role preview (display only; the server still enforces the real role).
const apiCan = (permission) => effectiveCan(realCan, getUser(), loadPreview())(permission);

export function resolveRoute(list, hash, { can = () => true, hasToken = false } = {}) {
  const { path, query } = parseHash(hash);
  const hit = findPage(list, path);
  if (!hit) return { type: 'notfound', path, query };
  const { page, params } = hit;
  if (!page.public && !hasToken) return { type: 'redirect', to: `#/signin?next=${encodeURIComponent(path + (query.toString() ? '?' + query : ''))}`, path, query };
  if (page.permission && !can(page.permission)) return { type: 'forbidden', path, query, page };
  return { type: 'page', page, params, query, path };
}

export function navigate(hash) {
  const h = String(hash).startsWith('#') ? String(hash) : '#' + hash;
  if (typeof location === 'undefined') return;
  if (location.hash === h) run(); else location.hash = h;
}

function makeCtx(query) {
  return {
    user: effectiveUser(getUser(), loadPreview()), can: apiCan, query,
    setBreadcrumb: (items) => hooks.setBreadcrumb(items || []),
    setHistoryHandler: (fn) => hooks.setHistoryHandler(fn || null),
    toast: (...a) => hooks.toast(...a), navigate,
  };
}

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function fallbackPage(kind) {
  const wrap = el('section', 'g-page');
  const h1 = el('h1', 'g-page__title', kind === 'forbidden' ? 'You do not have access to this page' : 'Page not found');
  const p = el('p', 'g-page__lede', kind === 'forbidden' ? 'Your role does not include this area. Ask an administrator if you need it.' : 'The address may be mistyped or the page may have moved.');
  const a = el('a', 'g-btn g-btn--secondary', 'Go to Home'); a.href = '#/';
  wrap.append(h1, p, a);
  return wrap;
}
function errorNode(err, retry) {
  if (hooks.renderError) return hooks.renderError(err, retry);
  const wrap = el('section', 'g-page');
  wrap.append(el('h1', 'g-page__title', 'Something went wrong'), el('p', 'g-page__lede', err?.message || 'Unexpected error'));
  if (err?.requestId) wrap.append(el('p', 'g-meta', `Request id: ${err.requestId}`));
  const b = el('button', 'g-btn g-btn--secondary', 'Retry'); b.type = 'button'; b.addEventListener('click', retry);
  wrap.append(b);
  return wrap;
}

async function run() {
  const mySeq = ++seq;
  const outlet = hooks.outlet;
  if (!outlet || typeof location === 'undefined') return;
  if (hooks.ensurePages) { try { await hooks.ensurePages(location.hash); } catch { /* ignore */ } if (mySeq !== seq) return; }
  const u0 = getUser();
  if (getToken() && !(u0 && (u0.permissions || u0.role_details)) && hooks.ensureProfile) { try { await hooks.ensureProfile(); } catch { /* ignore */ } if (mySeq !== seq) return; }
  const decision = resolveRoute(pages, location.hash, { can: apiCan, hasToken: !!getToken() });
  if (decision.type === 'redirect') { location.replace(decision.to); return; }

  if (decision.type === 'notfound' && (decision.path === '/forbidden' || decision.path === '/not-found')) {
    decision.type = decision.path === '/forbidden' ? 'forbidden' : 'notfound'; decision.builtin = true;
  } else if (decision.type === 'forbidden' || decision.type === 'notfound') {
    const target = decision.type === 'forbidden' ? '/forbidden' : '/not-found';
    if (decision.path !== target) { location.replace('#' + target); return; }
  }

  if (current?.page?.onLeave) { try { current.page.onLeave(); } catch (e) { console.error(e); } }
  current = null;
  hooks.setBreadcrumb([]); hooks.setHistoryHandler(null);

  let node; let title; let page = null; let bare = false;
  if (decision.type === 'notfound' || decision.type === 'forbidden') {
    page = pages.find((p) => p.route === (decision.type === 'forbidden' ? '/forbidden' : '/not-found')) || null;
    if (!page) { node = fallbackPage(decision.type); title = decision.type === 'forbidden' ? 'No access' : 'Not found'; }
  } else page = decision.page;

  if (page) {
    bare = !!page.bare; title = page.title || 'Gyanam AI';
    hooks.onLayout(bare);
    outlet.setAttribute('aria-busy', 'true');
    const ctx = makeCtx(decision.query || new URLSearchParams());
    hooks.setBreadcrumb([{ label: title }]);
    try {
      node = await page.render(decision.params || {}, ctx);
      if (mySeq !== seq) { try { page.onLeave?.(); } catch { /* ignore */ } return; }
      current = { page, params: decision.params };
    } catch (err) {
      if (mySeq !== seq) return;
      if (err && err.status === 401) return; // api.js already redirected
      console.error(err);
      node = errorNode(err, () => run());
    }
  } else hooks.onLayout(false);

  outlet.removeAttribute('aria-busy');
  while (outlet.firstChild) outlet.removeChild(outlet.firstChild);
  if (node) outlet.append(node);
  try { window.scrollTo(0, 0); outlet.scrollTop = 0; } catch { /* ignore */ }
  document.title = `${title} · Gyanam AI`;
  const h1 = outlet.querySelector('h1');
  if (h1) { if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  hooks.announce(title);
  hooks.onRoute({ path: parseHash(location.hash).path, page, title });
}

let started = false;
export function startRouter() {
  if (!started) { window.addEventListener('hashchange', run); started = true; }
  if (!location.hash) location.replace('#/'); else run();
}
export function refresh() { return run(); }
export function currentRoute() { return current; }
