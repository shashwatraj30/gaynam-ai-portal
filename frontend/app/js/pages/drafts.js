// Drafts list: GET /api/drafts, filter by status chip and text, open the studio or the review page.
// Four states: loading (skeleton), empty, error (retry), data.
import { h, clear } from '../dom.js';
import { t, addMessages } from '../i18n/index.js';
import en from '../i18n/pages/drafts.en.js';
import hi from '../i18n/pages/drafts.hi.js';
import { api } from '../api.js';
import { loadCss } from '../ui/shell.js';
import { draftStatusChip } from '../ui/status.js';
import { statusChip } from './lib/draft-ui.js';
import { button } from '../ui/button.js';
import { tabs } from '../ui/tabs.js';
import { table } from '../ui/table.js';
import { skeleton } from '../ui/skeleton.js';
import { errorState } from '../ui/error-state.js';
import { input, field } from '../ui/form.js';
import { formatDateTime } from '../format.js';
import { FILTERS, normalizeRows, countByStatus, filterDrafts, validFilter, rowAction } from './lib/drafts-logic.js';

addMessages('en', en); addMessages('hi', hi);


async function render(params, ctx) {
  loadCss('page-drafts.css');
  let status = validFilter(ctx.query.get('status') || 'all');
  let query = '';
  let rows = [];
  const body = h('div', { class: 'drafts__body' });
  const root = h('section', { class: 'g-page drafts' },
    h('div', { class: 'g-page__head' },
      h('div', {}, h('h1', { class: 'g-page__title' }, t('drafts.title')), h('p', { class: 'g-page__lede' }, t('drafts.lede'))),
      h('div', { class: 'g-page__actions' }, button({ label: t('drafts.new'), variant: 'primary', icon: 'plus', href: '#/drafts/new' }))),
    body);

  function paintList(list) {
    const counts = countByStatus(rows);
    const tabBar = tabs({
      label: t('drafts.filter'), active: status,
      items: FILTERS.map((f) => ({ id: f, label: f === 'all' ? t('drafts.all') : draftStatusChip(f).label, badge: counts[f] || 0 })),
      onChange: (id) => {
        status = id;
        try { history.replaceState(null, '', `#/drafts${id === 'all' ? '' : `?status=${id}`}`); } catch { /* ignore */ }
        paintList(list);
      },
    });
    const search = field({ label: t('drafts.searchLabel'), input: input({ type: 'search', placeholder: t('drafts.search'), value: query, onInput: (e) => { query = e.target.value; paintTable(); } }) });
    const tableHost = h('div', { class: 'drafts__table', 'aria-live': 'polite' });
    function paintTable() {
      const shown = filterDrafts(rows, { status, query });
      clear(tableHost);
      tableHost.append(table({
        caption: t('drafts.title'),
        columns: [
          { key: 'id', label: t('drafts.col.id') },
          { key: 'case_title', label: t('drafts.col.case'), render: (r) => h('div', { class: 'drafts__case' }, h('span', { class: 'drafts__name' }, r.case_title || t('drafts.untitled')), h('span', { class: 'g-meta' }, r.case_number || '')) },
          { key: 'court', label: t('drafts.col.court') },
          { key: 'status', label: t('drafts.col.status'), render: (r) => statusChip(r.status) },
          { key: 'date_created', label: t('drafts.col.created'), render: (r) => formatDateTime(r.date_created) },
          { key: 'act', label: t('drafts.col.actions'), render: (r) => { const a = rowAction(r); return button({ label: t(`drafts.action.${a.key}`), variant: 'secondary', href: a.href, ariaLabel: `${t(`drafts.action.${a.key}`)} #${r.id}` }); } },
        ],
        rows: shown,
        onRowClick: (r) => { location.hash = rowAction(r).href; },
        empty: rows.length && !shown.length
          ? { title: t('drafts.emptyFilter.title'), message: t('drafts.emptyFilter.msg') }
          : { title: t('drafts.empty.title'), message: t('drafts.empty.msg'), action: button({ label: t('drafts.new'), variant: 'primary', href: '#/drafts/new' }) },
      }));
    }
    clear(list); list.append(tabBar, search, tableHost);
    paintTable();
  }

  async function load() {
    clear(body); body.append(skeleton({ lines: 6 }));
    try {
      rows = normalizeRows(await api.drafts());
      clear(body);
      const list = h('div', { class: 'g-stack' });
      body.append(list);
      paintList(list);
    } catch (e) {
      clear(body);
      body.append(errorState({ message: e?.message || t('drafts.error'), requestId: e?.requestId, onRetry: load, retryLabel: t('state.retry') }));
    }
  }
  load();
  return root;
}

export default { route: '/drafts', title: 'Drafts', permission: 'DRAFT_FULL', render, onLeave() {} };
