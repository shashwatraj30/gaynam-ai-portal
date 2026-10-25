// App shell. mountShell(root, {onSignOut}) -> {content, rebuild (re-render chrome after sign-in/out), setBreadcrumb, setHistoryHandler, announce, setBare, setOffline, setActive, setBadge}
// Renders skip link, role-aware sidebar, top bar, <main id="g-main">, an aria-live region and the offline banner.
// The palette (ui/search-palette.js, FE-UI) is loaded dynamically so the shell still boots if it is missing.
// loadCss('page-foo.css') adds <link rel="stylesheet" href="css/page-foo.css"> once (page agents use it).
import { h, icon, clear } from '../dom.js';
import { t, onLangChange } from '../i18n/index.js';
import { getUser, can } from '../api.js';
import { buildSidebar } from './sidebar.js';
import { buildTopbar } from './topbar.js';
import { canPreview, effectiveCan, loadPreview, savePreview, clearPreview } from './role-preview-logic.js';
import { buildPreviewBanner } from './role-preview.js';
import { load as loadSidebarState, save as saveSidebarState, toggle as toggleSidebarState } from './sidebar-state.js';

const loaded = new Map();
export function loadCss(file) {
  if (loaded.has(file)) return loaded.get(file);
  const p = new Promise((resolve) => {
    const link = h('link', { rel: 'stylesheet', href: `css/${file}` });
    link.addEventListener('load', () => resolve(true));
    link.addEventListener('error', () => { console.warn(`loadCss: ${file} not found`); resolve(false); });
    document.head.append(link);
  });
  loaded.set(file, p);
  return p;
}

async function optional(path) {
  try { return await import(path); } catch (e) { console.warn(`shell: optional module ${path} unavailable`, e?.message); return null; }
}

export function mountShell(root, { onSignOut, onToast } = {}) {
  let sidebar; let topbar; let palette = null; let active = '/'; let crumbs = []; let historyFn = null;
  const badges = {};
  let sidebarState = loadSidebarState();
  let previewRole = loadPreview(); // admin-only, display-only; never touches API auth
  const previewHost = h('div', { class: 'g-preview-host' });

  loadCss('page-role-preview.css');
  const scrim = h('div', { class: 'g-scrim', onClick: () => setNav(false) });
  const content = h('main', { class: 'g-content', id: 'g-main', tabindex: '-1' });
  const live = h('div', { class: 'sr-only', id: 'g-live', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const offline = h('div', { class: 'g-offline', role: 'status', hidden: true },
    icon('alert', 16), h('span', {}, t('banner.offline')));
  const main = h('div', { class: 'g-main' });
  const skip = h('a', { class: 'g-skip', href: '#g-main', onClick: (e) => { e.preventDefault(); content.focus(); } }, t('app.skip'));
  const shell = h('div', { class: 'g-shell' });

  function setNav(open) {
    shell.classList.toggle('g-shell--nav-open', open);
    topbar?.menuBtn.setAttribute('aria-expanded', String(open));
  }
  function applySidebarState() {
    shell.classList.toggle('g-shell--collapsed', sidebarState === 'collapsed');
    sidebar?.setCollapsed(sidebarState === 'collapsed');
  }
  function toggleSidebar() {
    sidebarState = toggleSidebarState(sidebarState);
    saveSidebarState(sidebarState);
    applySidebarState();
  }
  function openPalette() {
    if (palette && typeof palette.open === 'function') palette.open();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  }

  function setPreview(role) {
    previewRole = savePreview(role);
    rebuild();
    if (typeof window !== 'undefined') window.dispatchEvent(new HashChangeEvent('hashchange')); // re-render the open page under the new view
    topbar.focusPreview(); // keep keyboard focus on the picker, which is rebuilt with the top bar
  }
  function renderPreviewBanner() {
    clear(previewHost);
    if (!previewRole) return;
    previewHost.append(buildPreviewBanner({ role: previewRole, onExit: () => setPreview(null) }).el);
  }

  function build() {
    // Preview is honoured only for a signed-in user whose real role is the top admin role; otherwise (e.g. sign-out) it resets.
    if (previewRole && !canPreview(getUser())) { previewRole = clearPreview(); }
    const viewCan = effectiveCan(can, getUser(), previewRole); // display-only wrapper
    renderPreviewBanner();
    sidebar = buildSidebar({ can: viewCan, collapsed: sidebarState === 'collapsed', onToggle: toggleSidebar });
    topbar = buildTopbar({ user: getUser() || {}, can: viewCan, preview: { role: previewRole, onChange: setPreview }, onMenu: () => setNav(!shell.classList.contains('g-shell--nav-open')), onOpenPalette: openPalette, onSignOut, onToast });
    sidebar.el.addEventListener('click', (e) => { if (e.target.closest('a')) setNav(false); });
    sidebar.setActive(active);
    for (const [id, n] of Object.entries(badges)) sidebar.setBadge(id, n);
    topbar.setBreadcrumb(crumbs);
    topbar.setHistoryHandler(historyFn);
    topbar.refreshFreshness();
  }
  build();
  main.append(topbar.el, previewHost, offline, content);
  shell.append(skip, sidebar.el, scrim, main, live);
  root.append(shell);
  applySidebarState();

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && shell.classList.contains('g-shell--nav-open')) { setNav(false); topbar.menuBtn.focus(); } });

  // Palette commands follow the current (possibly role-previewed) sidebar items.
  function paletteCommands() {
    return sidebar.items.map((i) => ({
      id: i.id, label: t(i.labelKey), hint: t('cmd.go', { name: t(i.labelKey) }), icon: i.icon, group: 'Go to',
      href: `#${i.route}`, onSelect: () => { location.hash = `#${i.route}`; }, run: () => { location.hash = `#${i.route}`; },
    }));
  }
  function rebuild() {
    const oldSide = sidebar.el; const oldTop = topbar.el;
    build();
    oldSide.replaceWith(sidebar.el); oldTop.replaceWith(topbar.el);
    skip.textContent = t('app.skip');
    offline.lastChild.textContent = t('banner.offline');
    if (palette && typeof palette.setCommands === 'function') palette.setCommands(paletteCommands());
  }
  onLangChange(rebuild);

  // Command palette (Ctrl K)
  (async () => {
    const mod = await optional('./search-palette.js');
    if (!mod?.searchPalette) return;
    try {
      palette = mod.searchPalette({ commands: paletteCommands() });
    } catch (e) { console.warn('shell: searchPalette failed', e); }
  })();

  return {
    content, rebuild,
    setBreadcrumb(items) { crumbs = items || []; topbar.setBreadcrumb(crumbs); },
    setHistoryHandler(fn) { historyFn = fn || null; topbar.setHistoryHandler(historyFn); },
    announce(msg) { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); },
    setBare(bare) { shell.classList.toggle('g-shell--bare', !!bare); },
    setOffline(on) { offline.hidden = !on; },
    setActive(path) { active = path; sidebar.setActive(path); },
    setBadge(id, n) { badges[id] = n; sidebar.setBadge(id, n); },
    refreshFreshness() { topbar.refreshFreshness(); },
  };
}
