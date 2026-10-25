// Top bar: menu button (mobile), breadcrumb, History button, Ctrl K, freshness indicator, EN/HI, user menu.
// buildTopbar({user, can, onMenu, onOpenPalette, onSignOut, onSyncDone}) ->
//   {el, setBreadcrumb(items), setHistoryHandler(fn|null), refreshFreshness()}
// Freshness comes from api.sync.status().sync_state.last_sync_timestamp (real value, plan §8).
import { h, icon, clear } from '../dom.js';
import { t, getLang, setLang } from '../i18n/index.js';
import { api } from '../api.js';
import { formatRelative } from '../format.js';
import { canPreview } from './role-preview-logic.js';
import { buildPreviewPicker } from './role-preview.js';
import { loadFontSize, saveFontSize, applyFontSize, stepFontSize, FONT_SIZES } from '../pages/lib/settings-logic.js';

function initials(name) {
  const parts = String(name || '?').replace(/^(Hon'ble|Justice|Dr\.?|Prof\.?)\s+/i, '').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// preview: {role, onChange(role|null)}  admin-only "Preview as role" picker (shown only when the REAL role is the top admin).
export function buildTopbar({ user, can, onMenu, onOpenPalette, onSignOut, onToast, preview }) {
  // ---- breadcrumb ----
  const crumbs = h('nav', { class: 'g-crumbs', 'aria-label': t('top.breadcrumb') });
  function setBreadcrumb(items) {
    clear(crumbs);
    const list = h('ol', { class: 'g-crumbs__list' });
    (items || []).forEach((it, i) => {
      const last = i === items.length - 1;
      const inner = it.href && !last ? h('a', { href: it.href }, it.label) : h('span', last ? { 'aria-current': 'page', class: 'g-crumbs__current' } : {}, it.label);
      list.append(h('li', { class: 'g-crumbs__item' }, inner, last ? null : icon('chevron-right', 14)));
    });
    crumbs.append(list);
  }

  // ---- history button ----
  let historyFn = null;
  const historyBtn = h('button', { class: 'g-topbtn', type: 'button', hidden: true, onClick: () => historyFn && historyFn() },
    icon('history', 16), h('span', {}, t('top.history')));
  function setHistoryHandler(fn) {
    historyFn = typeof fn === 'function' ? fn : null;
    historyBtn.hidden = !historyFn;
  }

  // ---- palette trigger ----
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || '');
  const paletteBtn = h('button', { class: 'g-topbtn g-topbtn--search', type: 'button', 'aria-label': t('top.search'), onClick: () => onOpenPalette && onOpenPalette() },
    icon('search', 16), h('span', { class: 'g-topbtn__text' }, t('top.palette')), h('kbd', { class: 'g-kbd' }, isMac ? '⌘K' : 'Ctrl K'));

  // ---- freshness ----
  const freshText = h('span', {}, t('top.syncUnknown'));
  const fresh = h('div', { class: 'g-fresh', title: '' }, h('span', { class: 'g-fresh__dot', 'aria-hidden': 'true' }), freshText);
  const syncBtn = can('MANAGE_CORPUS')
    ? h('button', { class: 'g-link-btn', type: 'button', onClick: doSync }, t('top.syncNow')) : null;
  if (syncBtn) fresh.append(syncBtn);
  async function refreshFreshness() {
    try {
      const s = await api.sync.status();
      const ts = s?.sync_state?.last_sync_timestamp || s?.last_sync_timestamp;
      if (ts) { freshText.textContent = t('top.synced', { when: formatRelative(ts) }); fresh.dataset.state = 'ok'; }
      else { freshText.textContent = t('top.syncUnknown'); fresh.dataset.state = 'unknown'; }
    } catch { freshText.textContent = t('top.syncUnknown'); fresh.dataset.state = 'unknown'; }
  }
  async function doSync() {
    syncBtn.disabled = true; freshText.textContent = t('top.syncing');
    try { await api.sync.trigger(); onToast && onToast(t('top.syncDone'), { tone: 'primary' }); }
    catch (e) { onToast && onToast(e.message || t('top.syncFailed'), { tone: 'danger' }); }
    syncBtn.disabled = false; refreshFreshness();
  }

  // ---- language ----
  const langBtn = (code, label) => h('button', {
    type: 'button', class: 'g-lang__btn', 'aria-pressed': String(getLang() === code), lang: code,
    onClick: () => { if (getLang() !== code) setLang(code); },
  }, label);
  const lang = h('div', { class: 'g-lang', role: 'group', 'aria-label': t('top.language') }, langBtn('en', 'EN'), langBtn('hi', 'हि'));

  // ---- text size (A- / A+), applies to the whole portal ----
  const smaller = h('button', { type: 'button', class: 'g-fontsize__btn', 'aria-label': t('top.fontsize.smaller'), title: t('top.fontsize.smaller'), onClick: () => stepSize(-1) }, 'A-');
  const larger = h('button', { type: 'button', class: 'g-fontsize__btn', 'aria-label': t('top.fontsize.larger'), title: t('top.fontsize.larger'), onClick: () => stepSize(1) }, 'A+');
  const fontsize = h('div', { class: 'g-fontsize', role: 'group', 'aria-label': t('top.fontsize') }, smaller, larger);
  function syncSize(s) { smaller.disabled = s === FONT_SIZES[0]; larger.disabled = s === FONT_SIZES[FONT_SIZES.length - 1]; }
  function stepSize(dir) { const s = applyFontSize(saveFontSize(stepFontSize(loadFontSize(), dir))); syncSize(s); }
  syncSize(loadFontSize());
  if (typeof window !== 'undefined') window.addEventListener('gyanam:fontsize', (e) => syncSize(e.detail));

  // ---- preview as role (admin only, display only) ----
  const picker = preview && canPreview(user) ? buildPreviewPicker(preview) : null;

  // ---- user menu ----
  const name = user?.full_name || user?.email || '';
  const roleLabel = user?.role_title || user?.designation || t('role.unknown');
  const menu = h('div', { class: 'g-usermenu__panel', role: 'menu', hidden: true },
    h('div', { class: 'g-usermenu__who' }, h('strong', {}, name), h('span', { class: 'g-meta' }, roleLabel)),
    h('a', { class: 'g-usermenu__item', role: 'menuitem', href: '#/settings' }, icon('settings', 16), t('top.settings')),
    h('button', { class: 'g-usermenu__item', role: 'menuitem', type: 'button', onClick: () => { close(); onSignOut && onSignOut(); } }, icon('x', 16), t('top.signOut')));
  const trigger = h('button', { class: 'g-avatar', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `${t('top.userMenu')}: ${name}`, onClick: toggle }, initials(name));
  const userMenu = h('div', { class: 'g-usermenu' }, trigger, menu);
  function open() { menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); menu.querySelector('a,button')?.focus(); }
  function close() { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }
  function toggle() { menu.hidden ? open() : close(); }
  document.addEventListener('click', (e) => { if (!menu.hidden && !userMenu.contains(e.target)) close(); });
  userMenu.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { close(); trigger.focus(); } });

  const menuBtn = h('button', { class: 'g-topbtn g-topbtn--icon g-menu-btn', type: 'button', 'aria-label': t('nav.open'), 'aria-controls': 'g-sidebar', onClick: () => onMenu && onMenu() }, icon('menu', 20));

  const el = h('header', { class: 'g-topbar' },
    menuBtn, crumbs, historyBtn, h('span', { class: 'g-grow' }), paletteBtn, fresh, picker?.el, fontsize, lang, userMenu);
  return { el, setBreadcrumb, setHistoryHandler, refreshFreshness, menuBtn, focusPreview: () => picker?.focus() };
}
