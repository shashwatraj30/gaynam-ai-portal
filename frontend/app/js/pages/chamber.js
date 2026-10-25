// Chamber and access. Route '#/chamber' (MANAGE_USERS). Users from api.admin.users(); suspend/activate via
// api.admin.toggleUser after a confirm dialog. The server keeps the change in memory only: labelled "until restart".
import { h } from '../dom.js';
import { api, getUser } from '../api.js';
import { t, addMessages } from '../i18n/index.js';
import { loadCss } from '../ui/shell.js';
import { chip } from '../ui/chip.js';
import { button } from '../ui/button.js';
import { table } from '../ui/table.js';
import { statTile } from '../ui/stat-tile.js';
import { banner } from '../ui/banner.js';
import { errorState } from '../ui/error-state.js';
import { skeleton } from '../ui/skeleton.js';
import { confirmDialog } from '../ui/confirm.js';
import { toast } from '../ui/toast.js';
import en from '../i18n/pages/chamber.en.js';
import hi from '../i18n/pages/chamber.hi.js';
import { initials, isActive, summarizeUsers, isSelf, toggleId, permissionSummary, humanizePermission, humanizeRole, applyStatus } from './lib/chamber-logic.js';

addMessages('en', en); addMessages('hi', hi);

const roleLabel = (r) => { const k = `chamber.role.${r}`; const s = t(k); return s === k ? humanizeRole(r) : s; };

export default {
  route: '/chamber',
  title: 'Chamber and access',
  permission: 'MANAGE_USERS',
  async render() {
    await loadCss('page-chamber.css');
    const wrap = h('section', { class: 'g-page' });
    const body = h('div', { class: 'g-stack' }, skeleton({ lines: 6 }));
    let users = [];
    wrap.append(h('div', { class: 'g-page__head' }, h('div', {}, h('h1', { class: 'g-page__title' }, t('chamber.title')), h('p', { class: 'g-page__lede' }, t('chamber.lede')))), body);

    const toggle = async (u) => {
      const suspending = isActive(u);
      const ok = await confirmDialog({
        title: t(suspending ? 'chamber.confirm.suspend.title' : 'chamber.confirm.activate.title', { name: u.full_name || u.email }),
        message: t(suspending ? 'chamber.confirm.suspend.msg' : 'chamber.confirm.activate.msg'),
        confirmLabel: t(suspending ? 'chamber.suspend' : 'chamber.activate'),
        cancelLabel: t('chamber.cancel'),
        tone: suspending ? 'danger' : 'primary',
      });
      if (!ok) return;
      try {
        const r = await api.admin.toggleUser(toggleId(u));
        users = applyStatus(users, toggleId(u), r?.new_status || r?.status || (suspending ? 'SUSPENDED' : 'ACTIVE'));
        toast(t(suspending ? 'chamber.toast.suspended' : 'chamber.toast.activated', { name: u.full_name || u.email }), { tone: 'primary' });
        draw();
      } catch (e) {
        toast(e?.message || t('chamber.toast.failed'), { tone: 'danger' });
      }
    };

    function draw() {
      const me = getUser();
      const s = summarizeUsers(users);
      body.replaceChildren(
        banner({ tone: 'warn', message: t('chamber.untilRestart') }),
        h('div', { class: 'g-chamber__stats' },
          statTile({ label: t('chamber.stat.profiles'), value: s.total }),
          statTile({ label: t('chamber.stat.active'), value: s.active, tone: 'primary' }),
          statTile({ label: t('chamber.stat.suspended'), value: s.suspended, tone: s.suspended ? 'warn' : 'neutral' }),
          statTile({ label: t('chamber.stat.roles'), value: s.roles })),
        table({
          caption: t('chamber.table.caption'),
          columns: [
            { key: 'full_name', label: t('chamber.col.person'), render: (u) => h('div', { class: 'g-chamber__person' },
              h('span', { class: 'g-avatar', 'aria-hidden': 'true' }, initials(u.full_name)),
              h('div', {}, h('div', { class: 'g-chamber__name' }, u.full_name || u.email, isSelf(u, me) ? h('span', { class: 'g-meta' }, ` (${t('chamber.you')})`) : null),
                h('div', { class: 'g-meta' }, u.email), u.designation ? h('div', { class: 'g-meta' }, u.designation) : null)) },
            { key: 'role', label: t('chamber.col.role'), render: (u) => chip({ label: roleLabel(u.role), tone: 'info' }) },
            { key: 'permissions', label: t('chamber.col.can'), render: (u) => {
              const p = permissionSummary(u);
              return h('div', { class: 'g-chamber__perms' }, p.shown.map(humanizePermission).join(', ') || t('chamber.noPerms'),
                p.more ? h('span', { class: 'g-meta' }, ` ${t('chamber.morePerms', { n: p.more })}`) : null);
            } },
            { key: 'status', label: t('chamber.col.status'), render: (u) => isActive(u)
              ? chip({ label: t('chamber.status.active'), tone: 'primary' })
              : chip({ label: t('chamber.status.suspended'), tone: 'warn' }) },
            { key: 'actions', label: t('chamber.col.actions'), render: (u) => isSelf(u, me)
              ? h('span', { class: 'g-meta' }, t('chamber.selfNote'))
              : button({ label: isActive(u) ? t('chamber.suspend') : t('chamber.activate'), variant: isActive(u) ? 'secondary' : 'ghost', onClick: () => toggle(u), ariaLabel: `${isActive(u) ? t('chamber.suspend') : t('chamber.activate')}: ${u.full_name || u.email}` }) },
          ],
          rows: users, empty: { title: t('chamber.empty.title'), message: t('chamber.empty.msg') },
        }),
        h('p', { class: 'g-meta' }, t('chamber.footnote')));
    }

    const load = async () => {
      body.replaceChildren(skeleton({ lines: 6 }));
      try { const r = await api.admin.users(); users = Array.isArray(r) ? r : (r?.users || []); draw(); } catch (e) {
        body.replaceChildren(errorState({ message: e?.message, requestId: e?.requestId, onRetry: load, retryLabel: t('state.retry') }));
      }
    };
    await load();
    return wrap;
  },
  onLeave() {},
};
