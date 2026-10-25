// Matters list: '/matters'. Data: api.matters() (drafts grouped by case number, plan 7.3).
// Filter by next action (from the latest draft's status), free-text search, 'New matter' button.
// Access: any of DRAFT_FULL / UPLOAD_PLEADING, declared as a permission array on the route (router treats it as "any of").
import { h, clear } from '../dom.js';
import { MATTER_ACCESS } from './lib/access.js';
import { api } from '../api.js';
import { t, addMessages } from '../i18n/index.js';
import { formatDate, formatNumber } from '../format.js';
import { loadCss } from '../ui/shell.js';
import { button } from '../ui/button.js';
import { chip } from '../ui/chip.js';
import { emptyState } from '../ui/empty-state.js';
import { errorState } from '../ui/error-state.js';
import { skeleton } from '../ui/skeleton.js';
import { field, input } from '../ui/form.js';
import { draftStatusChip } from '../ui/status.js';
import en from '../i18n/pages/matters.en.js';
import hi from '../i18n/pages/matters.hi.js';
import {
  STATUS_GROUPS, groupCounts, filterMatters, sortMatters, matterHeading, nextActionKey, matterHref,
} from './lib/matters-logic.js';

addMessages('en', en);
addMessages('hi', hi);

function render(params, ctx) {
  loadCss('page-matters.css');
  const state = { matters: [], q: '', group: 'all' };

  const body = h('div', { class: 'g-stack' });
  const live = h('p', { class: 'mx-count', role: 'status', 'aria-live': 'polite' });
  const searchInput = input({ type: 'search', name: 'q', placeholder: t('matters.searchHint'), autocomplete: 'off' });
  const searchField = field({ label: t('matters.search'), input: searchInput });
  searchField.classList.add('mx-search');
  const filters = h('div', { class: 'mx-filters', role: 'group', 'aria-label': t('matters.filters') });
  const listHost = h('div', {});

  const head = h('header', { class: 'g-page__head' },
    h('div', {}, h('h1', { class: 'g-page__title' }, t('matters.title')), h('p', { class: 'g-page__lede' }, t('matters.lede'))),
    h('div', { class: 'g-page__actions' }, ctx.can('UPLOAD_PLEADING') ? button({ label: t('matters.new'), variant: 'primary', href: '#/matters/new' }) : null));
  const page = h('section', { class: 'g-page' }, head, body);

  function paintFilters() {
    clear(filters);
    const counts = groupCounts(state.matters);
    for (const g of STATUS_GROUPS) {
      filters.append(h('button', {
        type: 'button', class: 'mx-pill', 'aria-pressed': state.group === g.id ? 'true' : 'false',
        onClick: () => { state.group = g.id; paintFilters(); paintList(); },
      }, t(`matters.filter.${g.id}`), h('span', { class: 'mx-pill__n' }, formatNumber(counts[g.id]))));
    }
  }

  function row(m) {
    const hd = matterHeading(m);
    const status = draftStatusChip(m.latest_status);
    const noNumber = !m.case_number || m.is_placeholder;
    return h('li', { class: 'mx-li' }, h('a', { class: 'mx-item', href: matterHref(m.matter_key) },
      h('span', { class: 'mx-case' },
        h('span', { class: 'mx-case__t' }, noNumber && !m.case_number ? t('matters.noCaseNumber') : hd.primary),
        noNumber && m.case_number ? h('span', { class: 'mx-case__s' }, t('matters.noCaseNumber')) : null,
        hd.secondary ? h('span', { class: 'mx-case__s' }, hd.secondary) : (noNumber && !m.case_number && hd.primary ? h('span', { class: 'mx-case__s' }, hd.primary) : null)),
      h('span', { class: 'mx-cell' }, h('span', { class: 'mx-lbl' }, t('matters.col.court')), m.court || t('matters.courtUnknown')),
      h('span', { class: 'mx-cell' }, h('span', { class: 'mx-lbl g-sr' }, t('matters.col.next')),
        chip(status), h('span', { class: 'mx-case__s' }, t(nextActionKey(m.latest_status)))),
      h('span', { class: 'mx-cell mx-num' }, h('span', { class: 'mx-lbl' }, t('matters.col.drafts')), formatNumber(m.draft_count)),
      h('span', { class: 'mx-cell' }, h('span', { class: 'mx-lbl' }, t('matters.col.updated')), formatDate(m.last_updated))));
  }

  function paintList() {
    clear(listHost);
    const shown = sortMatters(filterMatters(state.matters, { q: state.q, group: state.group }));
    live.textContent = t('matters.showing', { n: formatNumber(shown.length), total: formatNumber(state.matters.length) });
    if (!state.matters.length) {
      listHost.append(emptyState({ title: t('matters.empty.title'), message: t('matters.empty.msg'),
        action: ctx.can('UPLOAD_PLEADING') ? button({ label: t('matters.new'), variant: 'primary', href: '#/matters/new' }) : null }));
      return;
    }
    if (!shown.length) {
      listHost.append(emptyState({ title: t('matters.noMatch.title'), message: t('matters.noMatch.msg'),
        action: button({ label: t('matters.clear'), onClick: () => { state.q = ''; state.group = 'all'; searchInput.value = ''; paintFilters(); paintList(); } }) }));
      return;
    }
    listHost.append(h('ul', { class: 'mx-list' },
      h('li', { class: 'mx-head', 'aria-hidden': 'true' },
        h('span', {}, t('matters.col.case')), h('span', {}, t('matters.col.court')), h('span', {}, t('matters.col.next')),
        h('span', { class: 'mx-num' }, t('matters.col.drafts')), h('span', {}, t('matters.col.updated'))),
      ...shown.map(row)));
  }

  searchInput.addEventListener('input', () => { state.q = searchInput.value; paintList(); });

  async function load() {
    clear(body);
    body.append(skeleton({ lines: 6 }));
    try {
      const res = await api.matters();
      state.matters = Array.isArray(res && res.matters) ? res.matters : [];
    } catch (err) {
      clear(body);
      body.append(errorState({ message: t('matters.loadError'), requestId: err && err.requestId, onRetry: load, retryLabel: t('btn.retry') }));
      return;
    }
    clear(body);
    if (state.matters.length) body.append(h('div', { class: 'mx-tools' }, searchField, filters), live);
    body.append(listHost, h('p', { class: 'mx-foot' }, t('matters.footnote')));
    paintFilters(); paintList();
  }
  load();
  return page;
}

export default { route: '/matters', title: 'Matters', permission: MATTER_ACCESS, render, onLeave() {} };
