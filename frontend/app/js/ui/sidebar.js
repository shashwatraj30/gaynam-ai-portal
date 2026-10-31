// Role-aware sidebar (plan §5.1). buildSidebar({can}) -> {el, setActive(path), setBadge(id, n), items}
// Items whose permission the user lacks are not rendered (the API refuses them too: P10).
// `permission` may be null (everyone), a string, or an array meaning "any of".
import { h, icon } from '../dom.js';
import { t } from '../i18n/index.js';

// frontend/ is served at /static (backend/server.py); same seal used on the sign-in page.
const SEAL_URL = '/static/nluj_seal.png';

export const NAV_ITEMS = [
  { id: 'home', route: '/', labelKey: 'nav.home', icon: 'home', permission: null, match: (p) => p === '/' },
  { id: 'research', route: '/research', labelKey: 'nav.research', icon: 'search', permission: 'SEARCH', match: (p) => p.startsWith('/research') },
  { id: 'documents', route: '/documents', labelKey: 'nav.documents', icon: 'upload', permission: ['UPLOAD_PLEADING', 'DRAFT_FULL'], match: (p) => p.startsWith('/documents') },
  { id: 'judgments', route: '/judgments/check', labelKey: 'nav.judgments', icon: 'scale', permission: ['SEARCH', 'VERIFY_CITATION'], match: (p) => p.startsWith('/judgments') },
  { id: 'matters', route: '/matters', labelKey: 'nav.matters', icon: 'folder', permission: ['DRAFT_FULL', 'UPLOAD_PLEADING'], match: (p) => p.startsWith('/matters') },
  { id: 'drafts', route: '/drafts', labelKey: 'nav.drafts', icon: 'edit', permission: 'DRAFT_FULL', match: (p) => p.startsWith('/drafts') },
  { id: 'graph', route: '/graph', labelKey: 'nav.graph', icon: 'graph', permission: 'SEARCH', match: (p) => p.startsWith('/graph') },
  { id: 'alerts', route: '/alerts', labelKey: 'nav.alerts', icon: 'bell', permission: 'DRAFT_FULL', match: (p) => p.startsWith('/alerts') },
  { id: 'audit', route: '/audit', labelKey: 'nav.audit', icon: 'shield', permission: 'VIEW_AUDIT', section: 'admin', match: (p) => p.startsWith('/audit') },
  { id: 'chamber', route: '/chamber', labelKey: 'nav.chamber', icon: 'users', permission: 'MANAGE_USERS', section: 'admin', match: (p) => p.startsWith('/chamber') },
  { id: 'library', route: '/library', labelKey: 'nav.library', icon: 'book', permission: null, section: 'admin', match: (p) => p.startsWith('/library') },
];

// External reference documents served by the backend (/pdf = architecture/tender dossier, /presentation = slides).
export const REFERENCE_ITEMS = [
  { id: 'tender', href: '/pdf', labelKey: 'nav.ref.tender', icon: 'external', permission: null },
  { id: 'presentation', href: '/presentation', labelKey: 'nav.ref.presentation', icon: 'external', permission: null },
];

export function allowed(item, can) {
  const p = item.permission;
  if (!p) return true;
  return Array.isArray(p) ? p.some((x) => can(x)) : can(p);
}
export function visibleItems(can) { return NAV_ITEMS.filter((i) => allowed(i, can)); }

export function visibleReferenceItems(can) { return REFERENCE_ITEMS.filter((i) => allowed(i, can)); }

export function buildSidebar({ can, collapsed = false, onToggle, user } = {}) {
  const links = new Map();
  const badges = new Map();
  const items = visibleItems(can);

  function link(item) {
    const badge = h('span', { class: 'g-nav__badge', hidden: true });
    badges.set(item.id, badge);
    const a = h('a', { class: 'g-nav__item', href: `#${item.route}`, title: t(item.labelKey), 'aria-label': t(item.labelKey), dataset: { nav: item.id } },
      icon(item.icon, 18), h('span', { class: 'g-nav__label' }, t(item.labelKey)), badge);
    links.set(item.id, { a, item });
    return a;
  }
  const work = items.filter((i) => i.section !== 'admin');
  const admin = items.filter((i) => i.section === 'admin');
  const nav = h('nav', { class: 'g-nav', 'aria-label': t('nav.main') },
    work.map(link),
    admin.length ? h('div', { class: 'g-nav__section' }, t('nav.section.admin')) : null,
    admin.map(link));

  const refs = visibleReferenceItems(can);
  const refNav = refs.length ? h('nav', { class: 'g-nav g-nav--ref', 'aria-label': t('nav.section.reference') },
    h('div', { class: 'g-nav__section' }, t('nav.section.reference')),
    refs.map((r) => h('a', {
      class: 'g-nav__item', href: r.href, target: '_blank', rel: 'noopener noreferrer',
      title: t(r.labelKey), 'aria-label': `${t(r.labelKey)} (${t('nav.newTab')})`, dataset: { ref: r.id },
    }, icon('external', 18), h('span', { class: 'g-nav__label' }, t(r.labelKey))))) : null;

  const toggleLabel = h('span', { class: 'g-collapse__label' });
  const toggleBtn = h('button', { type: 'button', class: 'g-collapse', 'aria-controls': 'g-sidebar', 'aria-expanded': 'true', onClick: () => onToggle?.() },
    icon('menu', 18), toggleLabel);
  function setCollapsed(c) {
    const text = t(c ? 'nav.expand' : 'nav.collapse');
    toggleLabel.textContent = text;
    toggleBtn.title = text;
    toggleBtn.setAttribute('aria-expanded', String(!c));
  }
  setCollapsed(collapsed);

  const brand = h('a', { class: 'g-brand', href: '#/' },
    h('img', { class: 'g-brand__mark', src: SEAL_URL, alt: '', 'aria-hidden': 'true', width: 34, height: 34 }),
    h('span', { class: 'g-brand__name' }, t('app.name')));
  // Session card (expanded mode only; css hides it when collapsed): who is signed in and in which role.
  const sName = user?.full_name || user?.email || '';
  const session = sName ? h('div', { class: 'g-session', role: 'group', 'aria-label': t('nav.session') },
    h('span', { class: 'g-session__name' }, sName),
    h('span', { class: 'g-session__role' }, user?.role_title || user?.designation || t('role.unknown'))) : null;
  const el = h('aside', { class: 'g-sidebar', id: 'g-sidebar' }, toggleBtn, brand, nav, h('div', { class: 'g-grow' }), refNav, session);

  function setActive(path) {
    let best = null;
    for (const { item } of links.values()) if (item.match(path) && (!best || item.route.length > best.route.length)) best = item;
    for (const [id, { a }] of links) {
      if (best && id === best.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
  }
  function setBadge(id, n) {
    const b = badges.get(id);
    if (!b) return;
    b.textContent = n > 99 ? '99+' : String(n);
    b.hidden = !(n > 0);
  }
  return { el, setActive, setBadge, setCollapsed, toggleBtn, items };
}
