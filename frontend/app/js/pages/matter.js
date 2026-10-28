// Matter page: '/matters/:key' with tabs Overview / Documents / Research / Drafts / History.
// Data: api.matter(key) -> {matter_key, case_number, title, court, drafts[], events[] (user_label), ...}.
// Pre-B2 events have no recorded user and show "user not recorded". The topbar History button opens the same
// history in a drawer (ctx.setHistoryHandler). Documents lists m.documents (saved Documents of the matter); Research links
// to the search with the first confirmed document's issue (else the case number). Empty states stay honest (P5).
import { h, clear } from '../dom.js';
import { api } from '../api.js';
import { t, addMessages } from '../i18n/index.js';
import { formatDate, formatDateTime, formatNumber } from '../format.js';
import { loadCss } from '../ui/shell.js';
import { button } from '../ui/button.js';
import { card } from '../ui/card.js';
import { chip } from '../ui/chip.js';
import { tabs } from '../ui/tabs.js';
import { timeline } from '../ui/timeline.js';
import { statTile } from '../ui/stat-tile.js';
import { table } from '../ui/table.js';
import { drawer } from '../ui/drawer.js';
import { emptyState } from '../ui/empty-state.js';
import { errorState } from '../ui/error-state.js';
import { skeleton } from '../ui/skeleton.js';
import { draftStatusChip } from '../ui/status.js';
import en from '../i18n/pages/matter.en.js';
import hi from '../i18n/pages/matter.hi.js';
import {
  EVENT_FILTERS, filterEvents, eventCounts, eventTitleKey, humanizeAction, groupEventsByDay, timeOf,
  userRecorded, draftHref, lastActivity, matterHeading, nextActionKey,
  matterDocuments, documentHref, newDocumentHref, confirmedIssues, researchHref,
} from './lib/matters-logic.js';
import { MATTER_ACCESS } from './lib/access.js';

addMessages('en', en);
addMessages('hi', hi);

function eventNode(e) {
  const key = eventTitleKey(e.action);
  return {
    time: timeOf(e.timestamp),
    title: key ? t(key) : humanizeAction(e.action),
    detail: e.details || '',
    user: userRecorded(e) ? e.user_label || e.user : t('matter.userNotRecorded'),
  };
}

/** History list (day-grouped, filterable). Used in the tab and in the drawer. */
function historyView(events, { canAudit, filterLabel }) {
  const root = h('div', { class: 'mt-panel' });
  const bar = h('div', { class: 'mx-filters', role: 'group', 'aria-label': filterLabel });
  const list = h('div', {});
  let filter = 'all';
  const counts = eventCounts(events);
  function paint() {
    clear(bar);
    EVENT_FILTERS.forEach((f) => bar.append(h('button', {
      type: 'button', class: 'mx-pill', 'aria-pressed': filter === f ? 'true' : 'false',
      onClick: () => { filter = f; paint(); },
    }, t(`matter.history.filter.${f}`), h('span', { class: 'mx-pill__n' }, formatNumber(counts[f])))));
    clear(list);
    const shown = filterEvents(events, filter);
    if (!events.length) {
      list.append(emptyState({ title: t('matter.history.empty.title'), message: t('matter.history.empty.msg') }));
      return;
    }
    if (!shown.length) { list.append(h('p', { class: 'mt-nodata' }, t('matter.history.noMatch'))); return; }
    groupEventsByDay(shown).forEach((g) => {
      list.append(h('h3', { class: 'mt-day' }, formatDate(g.day)), timeline(g.events.map(eventNode)));
    });
  }
  paint();
  if (events.length) root.append(bar);
  root.append(list,
    h('p', { class: 'mt-meta' }, t('matter.history.audit'), ' ',
      canAudit ? h('a', { href: '#/audit' }, t('matter.history.openAudit')) : null));
  return root;
}

function draftsTable(drafts) {
  return table({
    caption: t('matter.tab.drafts'),
    columns: [
      { key: 'id', label: t('matter.col.draft'), render: (d) => h('a', { href: draftHref(d) }, t('matter.draftNo', { id: d.id })) },
      { key: 'status', label: t('matter.col.status'), render: (d) => chip(draftStatusChip(d.status)) },
      { key: 'version', label: t('matter.col.version'), render: (d) => (d.version != null ? String(d.version) : '—') },
      { key: 'date_created', label: t('matter.col.created'), render: (d) => formatDate(d.date_created) },
      { key: 'reviewed_by', label: t('matter.col.action'), render: (d) => button({ label: draftHref(d).endsWith('/review') ? t('matter.review') : t('matter.open'), variant: 'ghost', href: draftHref(d) }) },
    ],
    rows: drafts,
    empty: { title: t('matter.drafts.empty') },
  });
}

async function render(params, ctx) {
  loadCss('page-matters.css');
  const root = h('section', { class: 'g-page' });
  let drawerRef = null;
  render.cleanup = () => { try { drawerRef?.close(); } catch { /* ignore */ } };
  ctx.setBreadcrumb([{ label: t('matter.crumb'), href: '#/matters' }, { label: params.key }]);

  async function load() {
    clear(root);
    root.append(skeleton({ lines: 6 }));
    let m;
    try {
      m = await api.matter(params.key);
    } catch (err) {
      clear(root);
      if (err && err.status === 404) {
        root.append(h('h1', { class: 'g-page__title' }, t('matter.notFound.title')),
          emptyState({ title: t('matter.notFound.title'), message: t('matter.notFound.msg'), action: button({ label: t('matter.back'), href: '#/matters' }) }));
      } else {
        root.append(h('h1', { class: 'g-page__title' }, t('matter.crumb')),
          errorState({ message: t('matter.loadError'), requestId: err && err.requestId, onRetry: load, retryLabel: t('btn.retry') }));
      }
      return;
    }
    clear(root);
    const drafts = Array.isArray(m.drafts) ? m.drafts : [];
    const events = Array.isArray(m.events) ? m.events : [];
    const hd = matterHeading(m);
    const latest = drafts[0] || null;
    const status = draftStatusChip(m.latest_status);
    const canAudit = ctx.can('VIEW_AUDIT');
    ctx.setBreadcrumb([{ label: t('matter.crumb'), href: '#/matters' }, { label: hd.primary || params.key }]);

    ctx.setHistoryHandler(() => {
      drawerRef = drawer({ title: t('matter.history.title'), body: h('div', { class: 'mt-drawer' }, historyView(events, { canAudit, filterLabel: t('matter.history.filters') })) });
      drawerRef.open();
    });

    const reviewish = latest && draftHref(latest).endsWith('/review');
    root.append(h('header', { class: 'g-page__head' },
      h('div', {},
        h('h1', { class: 'g-page__title' }, hd.secondary || hd.primary),
        hd.secondary ? h('p', { class: 'mt-sub' }, [hd.primary, m.court].filter(Boolean).join(' · ')) : (m.court ? h('p', { class: 'mt-sub' }, m.court) : null),
        h('div', { class: 'mt-chips' }, chip(status), h('span', { class: 'mt-meta' }, t(nextActionKey(m.latest_status))))),
      h('div', { class: 'g-page__actions' }, latest ? button({ label: reviewish ? t('matter.reviewLatest') : t('matter.openLatest'), variant: 'primary', href: draftHref(latest) }) : null)));
    if (m.is_placeholder) root.append(h('p', { class: 'mt-meta', role: 'note' }, t('matter.placeholder')));

    const docs = matterDocuments(m);
    const issues = confirmedIssues(m);
    const docEvents = filterEvents(events, 'documents');
    const resEvents = filterEvents(events, 'research');
    const items = [
      { id: 'overview', label: t('matter.tab.overview') },
      { id: 'documents', label: t('matter.tab.documents'), badge: docs.length || null },
      { id: 'research', label: t('matter.tab.research'), badge: issues.length || resEvents.length || null },
      { id: 'drafts', label: t('matter.tab.drafts'), badge: drafts.length },
      { id: 'history', label: t('matter.tab.history'), badge: events.length || null },
    ];
    const panel = h('div', { role: 'tabpanel', tabindex: '0' });
    let tabBar;

    const eventsSection = (list, empty) => (list.length
      ? h('div', { class: 'mt-panel' }, ...groupEventsByDay(list).flatMap((g) => [h('h3', { class: 'mt-day' }, formatDate(g.day)), timeline(g.events.map(eventNode))]))
      : emptyState(empty));

    const views = {
      overview: () => h('div', { class: 'mt-panel' },
        h('div', { class: 'mt-stats' },
          statTile({ label: t('matter.stat.drafts'), value: formatNumber(drafts.length) }),
          statTile({ label: t('matter.stat.status'), value: status.label }),
          statTile({ label: t('matter.stat.activity'), value: formatDate(lastActivity(m)) }),
          statTile({ label: t('matter.stat.events'), value: formatNumber(events.length) })),
        latest ? card({ title: t('matter.latestDraft'), actions: button({ label: t('matter.open'), href: draftHref(latest) }) },
          h('div', { class: 'mt-chips' }, h('strong', {}, t('matter.draftNo', { id: latest.id })), chip(draftStatusChip(latest.status)),
            latest.version != null ? h('span', { class: 'mt-meta' }, t('matter.version', { n: latest.version })) : null,
            latest.reviewed_by ? h('span', { class: 'mt-meta' }, t('matter.reviewedBy', { name: latest.reviewed_by })) : null,
            h('span', { class: 'mt-meta' }, formatDateTime(latest.date_created)))) : null,
        card({ title: t('matter.recent'), actions: events.length ? button({ label: t('matter.seeAll'), variant: 'ghost', onClick: () => tabBar.select('history') }) : null },
          events.length ? timeline(groupEventsByDay(events).flatMap((g) => g.events).slice(0, 4).map((e) => ({ ...eventNode(e), time: [formatDate(e.timestamp), timeOf(e.timestamp)].filter(Boolean).join(' ') })))
            : emptyState({ title: t('matter.history.empty.title'), message: t('matter.history.empty.msg') }))),
      documents: () => {
        const add = ctx.can('UPLOAD_PLEADING') ? button({ label: t('matter.documents.upload'), variant: 'primary', icon: 'upload', href: newDocumentHref(params.key) }) : null;
        const lib = ctx.can('UPLOAD_PLEADING') || ctx.can('DRAFT_FULL') ? button({ label: t('matter.documents.library'), variant: 'ghost', href: '#/documents' }) : null;
        if (!docs.length) {
          return h('div', { class: 'mt-panel' }, emptyState({ title: t('matter.documents.title'), message: t('matter.documents.msg'), action: add }),
            docEvents.length ? eventsSection(docEvents, {}) : null);
        }
        return h('div', { class: 'mt-panel' },
          h('div', { class: 'g-page__actions' }, add, lib),
          table({
            caption: t('matter.tab.documents'),
            columns: [
              { key: 'title', label: t('matter.col.document'), render: (d) => h('a', { href: documentHref(d) }, d.title || d.original_name || t('matter.documents.untitled')) },
              { key: 'doc_type', label: t('matter.col.type'), render: (d) => d.doc_type || '—' },
              { key: 'status', label: t('matter.col.status'), render: (d) => chip({ label: d.status === 'CONFIRMED' ? t('matter.documents.confirmed') : d.status === 'READ' ? t('matter.documents.read') : String(d.status || '—'), tone: d.status === 'CONFIRMED' ? 'primary' : 'neutral' }) },
              { key: 'created_at', label: t('matter.col.created'), render: (d) => formatDate(d.created_at) },
            ],
            rows: docs,
            empty: { title: t('matter.documents.title') },
          }));
      },
      research: () => h('div', { class: 'mt-panel' },
        issues.length ? card({ title: t('matter.research.issues') },
          h('ol', { class: 'mt-issues' }, ...issues.map((x) => h('li', {}, x)))) : null,
        issues.length ? null : h('p', { class: 'mt-meta' }, t('matter.research.noIssues')),
        ctx.can('SEARCH') ? h('div', { class: 'g-page__actions' }, button({ label: issues.length ? t('matter.research.actionIssue') : t('matter.research.action'), variant: 'primary', href: researchHref(m) })) : null,
        resEvents.length ? eventsSection(resEvents, {}) : emptyState({ title: t('matter.research.title'), message: t('matter.research.msg') })),
      drafts: () => draftsTable(drafts),
      history: () => historyView(events, { canAudit, filterLabel: t('matter.history.filters') }),
    };
    function select(id) {
      clear(panel);
      panel.setAttribute('aria-labelledby', tabBar.tabId(id));
      panel.append(views[id]());
    }
    tabBar = tabs({ items, active: 'overview', label: t('matter.tabs'), onChange: select });
    root.append(tabBar, panel);
    select('overview');
  }

  await load();
  return root;
}

export default {
  route: '/matters/:key', title: 'Matter', permission: MATTER_ACCESS, render,
  onLeave() { if (typeof render.cleanup === 'function') render.cleanup(); },
};
