// Boot: validate token (api.auth.me), mount shell, register pages, start router, wire offline banner.
import { api, getToken, getUser, setSession, clearSession } from './api.js';
import { configureRouter, startRouter, refresh } from './router.js';
import { mountShell } from './ui/shell.js';
import { ensurePagesFor } from './pages/index.js';
import { onLangChange, getLang, setLang } from './i18n/index.js';
import { store } from './store.js';
import { loadCss } from './ui/shell.js';
import { applyDensity, loadDensity, applyFontSize, loadFontSize } from './pages/lib/settings-logic.js';

async function loadProfile() {
  const token = getToken();
  if (!token) return null;
  const r = await api.auth.me();
  const rd = r.role_details || {};
  const user = { ...(r.user || {}), permissions: rd.permissions || [], role_title: rd.title || '', role_details: rd };
  setSession({ token, user });
  return user;
}

async function toast(message, opts) {
  try { const m = await import('./ui/toast.js'); m.toast(message, opts); } catch { console.info(message); }
}

async function boot() {
  setLang(getLang()); // applies <html lang>
  loadCss('page-density.css');
  applyDensity(loadDensity());
  loadCss('page-fontsize.css');
  applyFontSize(loadFontSize());
  const root = document.getElementById('app');

  if (getToken()) {
    try { await loadProfile(); }
    catch (e) { if (e.status === 401 || e.status === 403) clearSession(); /* offline: keep cached user */ }
  }

  const shell = mountShell(root, {
    onToast: toast,
    onSignOut: () => { clearSession(); location.hash = '#/signin'; },
  });

  let profilePromise = null;
  configureRouter({
    ensurePages: ensurePagesFor,
    outlet: shell.content,
    toast,
    announce: (m) => shell.announce(m),
    setBreadcrumb: (items) => shell.setBreadcrumb(items),
    setHistoryHandler: (fn) => shell.setHistoryHandler(fn),
    onLayout: (bare) => shell.setBare(bare),
    onRoute: ({ path }) => shell.setActive(path),
    ensureProfile: () => (profilePromise ||= loadProfile().finally(() => { profilePromise = null; })),
  });

  window.addEventListener('gyanam:session', () => { shell.rebuild(); refreshBadges(); });
  window.addEventListener('gyanam:offline', () => shell.setOffline(true));
  window.addEventListener('online', () => { shell.setOffline(false); shell.refreshFreshness(); });
  onLangChange(() => refresh());

  function refreshBadges() {
    const u = getUser();
    if (!getToken() || !u || !(u.permissions || []).includes('DRAFT_FULL')) return;
    api.alerts().then((a) => {
      const n = Number.isFinite(a?.total) ? a.total : (Array.isArray(a) ? a : (a?.alerts || [])).length;
      store.set('alertCount', n); // also drives the badge via store.on below
    }).catch(() => {});
  }

  store.on('alertCount', (n) => shell.setBadge('alerts', Number(n) || 0));
  if (!location.hash && getUser()?.role === 'AUDITOR') location.replace('#/audit');
  startRouter();
  refreshBadges();
}

boot().catch((e) => {
  console.error(e);
  const root = document.getElementById('app');
  if (root) root.textContent = 'Gyanam AI could not start. Please reload the page.';
});
