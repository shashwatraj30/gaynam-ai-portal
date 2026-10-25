// Sign in (public, bare). Role picker from api.auth.roles(); Continue -> api.auth.ssoLogin(role).
import { h } from '../dom.js';
import { api, setSession } from '../api.js';
import { t, addMessages } from '../i18n/index.js';
import { loadCss } from '../ui/shell.js';
import { button } from '../ui/button.js';
import { skeleton } from '../ui/skeleton.js';
import { errorState } from '../ui/error-state.js';
import { emptyState } from '../ui/empty-state.js';
import { banner } from '../ui/banner.js';
import { safeNext, initials, displayName, profilesFromRoles } from './lib/signin-logic.js';
import en from '../i18n/pages/signin.en.js';
import hi from '../i18n/pages/signin.hi.js';

addMessages('en', en);
addMessages('hi', hi);

// frontend/ is served at /static (backend/server.py), so the seal lives at /static/nluj_seal.png.
const SEAL_URL = '/static/nluj_seal.png';

async function render(params, ctx) {
  await loadCss('page-signin.css');
  const listBox = h('div', { class: 'signin__list' });
  const actions = h('div', { class: 'signin__actions' });
  const alertBox = h('div', { class: 'signin__alert', 'aria-live': 'polite' });
  let selected = null;
  let busy = false;

  const root = h('div', { class: 'signin' },
    h('aside', { class: 'signin__brand' },
      h('img', { class: 'signin__seal', src: SEAL_URL, alt: t('signin.sealAlt'), width: 72, height: 72 }),
      h('p', { class: 'signin__name' }, t('app.name')),
      h('p', { class: 'signin__tagline' }, t('signin.tagline')),
      h('p', { class: 'signin__audience' }, t('signin.audience')),
      h('ul', { class: 'signin__points', role: 'list' },
        h('li', {}, t('signin.point1')), h('li', {}, t('signin.point2')), h('li', {}, t('signin.point3')))),
    h('main', { class: 'signin__panel', id: 'g-main' },
      h('h1', { class: 'signin__title' }, t('signin.title')),
      h('p', { class: 'signin__lede' }, t('signin.lede')),
      alertBox, listBox, actions));

  async function signIn() {
    if (!selected || busy) return;
    busy = true; draw();
    try {
      const r = await api.auth.ssoLogin(selected.role);
      setSession({ token: r.access_token, user: r.user });
      // Auditors land on the audit trail (plan 5.2) unless a deep link was requested.
      // The router sends next=/ when the visitor just opened the app, so treat "/" as "no deep link".
      const asked = ctx.query.get('next');
      const next = safeNext(asked && asked !== '/' ? asked : (r.user?.role === 'AUDITOR' ? '/audit' : '/'));
      ctx.navigate(next);
    } catch (e) {
      busy = false;
      alertBox.replaceChildren(banner({ tone: 'danger', message: e.message || t('signin.failed') }));
      draw();
    }
  }

  function draw() {
    actions.replaceChildren();
    if (!selected) return;
    actions.append(
      button({ label: busy ? t('signin.signingIn') : t('signin.continueAs', { name: displayName(selected.name) }), variant: 'primary', disabled: busy, onClick: signIn }),
      h('p', { class: 'g-meta' }, t('signin.expiry')));
  }

  function drawList(profiles) {
    const group = h('div', { class: 'signin__group', role: 'radiogroup', 'aria-label': t('signin.profiles') });
    profiles.forEach((p, i) => {
      const id = `signin-p-${i}`;
      const input = h('input', { type: 'radio', name: 'profile', id, class: 'signin__radio', value: p.role });
      input.addEventListener('change', () => { selected = p; alertBox.replaceChildren(); draw(); });
      group.append(h('label', { class: 'signin__card', for: id },
        input,
        h('span', { class: 'signin__avatar', 'aria-hidden': 'true' }, initials(p.name)),
        h('span', { class: 'signin__who' },
          h('span', { class: 'signin__person' }, p.name),
          h('span', { class: 'g-meta' }, p.designation || p.institution),
          p.designation && p.institution ? h('span', { class: 'g-meta' }, p.institution) : null),
        h('span', { class: 'signin__role' }, p.scopeRole)));
    });
    listBox.replaceChildren(group);
  }

  async function load() {
    listBox.replaceChildren(skeleton({ lines: 6 }));
    try {
      const profiles = profilesFromRoles(await api.auth.roles());
      if (!profiles.length) { listBox.replaceChildren(emptyState({ title: t('signin.empty'), message: t('signin.emptyMsg') })); return; }
      drawList(profiles);
    } catch (e) {
      listBox.replaceChildren(errorState({ message: e.message || t('signin.loadError'), requestId: e.requestId, onRetry: load, retryLabel: t('state.retry') }));
    }
  }
  load();
  return root;
}

export default { route: '/signin', title: 'Sign in', permission: null, public: true, bare: true, render, onLeave() {} };
