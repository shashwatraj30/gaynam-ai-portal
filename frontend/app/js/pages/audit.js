// Audit trail. Route '#/audit' (VIEW_AUDIT). Tabs: Activity (filters), Ledger entries, Corpus sync.
// Chain verify via api.ledgerVerify; CSV via api.auditCsv (server) or a client export of the filtered view.
import { h } from '../dom.js';
import { api } from '../api.js';
import { t, addMessages } from '../i18n/index.js';
import { formatDateTime, formatNumber } from '../format.js';
import { loadCss } from '../ui/shell.js';
import { chip } from '../ui/chip.js';
import { button } from '../ui/button.js';
import { card } from '../ui/card.js';
import { statTile } from '../ui/stat-tile.js';
import { tabs } from '../ui/tabs.js';
import { table } from '../ui/table.js';
import { field, input, select } from '../ui/form.js';
import { errorState } from '../ui/error-state.js';
import { skeleton } from '../ui/skeleton.js';
import { banner } from '../ui/banner.js';
import { emptyState } from '../ui/empty-state.js';
import { toast } from '../ui/toast.js';
import en from '../i18n/pages/audit.en.js';
import hi from '../i18n/pages/audit.hi.js';
import { summarize, topN, analyticsCsv, NOT_RECORDED } from './lib/audit-analytics.js';
import { isUserRecorded, humanizeAction, buildAuditParams, filterAuditRows, distinctActions, shortHash, toCsv, verifySummary, normalizeSync, formatDuration, exportParams, pageInfo, distinctRoles, filterSummary, isSimulatedSync, AUDIT_PAGE_SIZE } from './lib/audit-logic.js';

addMessages('en', en); addMessages('hi', hi);

const actionLabel = (a) => { const k = `audit.action.${a}`; const s = t(k); return s === k ? humanizeAction(a) : s; };

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function userCell(r) {
  return isUserRecorded(r)
    ? h('div', {}, h('div', { class: 'g-audit__u' }, r.user_name), h('div', { class: 'g-meta' }, r.user_role || ''))
    : h('div', {}, h('div', { class: 'g-audit__u g-audit__u--none' }, t('audit.userNotRecorded')), h('div', { class: 'g-meta' }, r.user_role || ''));
}

export default {
  route: '/audit',
  title: 'Audit trail',
  permission: 'VIEW_AUDIT',
  async render() {
    await loadCss('page-audit.css');
    const wrap = h('section', { class: 'g-page' });
    const verifyHost = h('div', { 'aria-live': 'polite' });
    const panel = h('div', { class: 'g-stack' });
    const blankFilters = () => ({ action: 'ALL', user: '', role: 'ALL', q: '', since: '', until: '' });
    const state = { tab: 'activity', filters: blankFilters(), rows: [], filtered: [], offset: 0, total: 0 };

    // ---- verify ----
    const renderVerify = (r, loading) => {
      if (loading) { verifyHost.replaceChildren(skeleton({ lines: 2 })); return; }
      if (!r) { verifyHost.replaceChildren(h('p', { class: 'g-meta' }, t('audit.verify.idle'))); return; }
      const s = verifySummary(r);
      const body = s.state === 'ok'
        ? [chip({ label: t('audit.verify.ok'), tone: 'primary', icon: 'check' }), h('span', {}, t('audit.verify.okMsg', { n: formatNumber(s.count) })), s.hash ? h('span', { class: 'g-meta' }, t('audit.verify.hash', { hash: shortHash(s.hash, 12) })) : null]
        : s.state === 'empty'
          ? [chip({ label: t('audit.verify.empty'), tone: 'neutral' }), h('span', {}, s.message)]
          : [chip({ label: t('audit.verify.bad'), tone: 'danger' }), h('span', {}, t('audit.verify.badMsg', { id: s.blockId ?? '?' })), s.message ? h('span', { class: 'g-meta' }, s.message) : null];
      verifyHost.replaceChildren(h('div', { class: 'g-row g-audit__verify' }, ...body.filter(Boolean), h('span', { class: 'g-meta' }, t('audit.verify.checked', { when: formatDateTime(new Date()) }))));
    };
    const verify = async () => {
      renderVerify(null, true);
      try { renderVerify(await api.ledgerVerify()); } catch (e) { verifyHost.replaceChildren(errorState({ message: e?.message, requestId: e?.requestId, onRetry: verify, retryLabel: t('state.retry') })); }
    };

    // ---- activity ----
    const goPage = (off) => { state.offset = off; activityView(); };
    const pager = () => {
      const pg = pageInfo(state.total, state.offset, AUDIT_PAGE_SIZE, state.rows.length);
      if (pg.total <= AUDIT_PAGE_SIZE) return null;
      return h('nav', { class: 'g-audit__pager', 'aria-label': t('audit.page.of', { page: pg.page, pages: pg.pages }) },
        button({ label: t('audit.page.prev'), variant: 'ghost', disabled: !pg.hasPrev, onClick: () => goPage(pg.prevOffset) }),
        h('span', { class: 'g-meta' }, `${t('audit.page.range', { from: formatNumber(pg.from), to: formatNumber(pg.to), total: formatNumber(pg.total) })} · ${t('audit.page.of', { page: pg.page, pages: pg.pages })}`),
        button({ label: t('audit.page.next'), variant: 'ghost', disabled: !pg.hasNext, onClick: () => goPage(pg.nextOffset) }));
    };
    const loadRows = async () => {
      const f = state.filters;
      const res = await api.auditLogs(buildAuditParams({ ...f, offset: state.offset }));
      state.rows = Array.isArray(res) ? res : (res?.logs || []);
      state.total = Number.isFinite(Number(res?.total)) ? Number(res.total) : state.rows.length;
      if (Number.isFinite(Number(res?.offset))) state.offset = Number(res.offset);
      state.filtered = filterAuditRows(state.rows, f);
    };
    const activityView = async () => {
      panel.replaceChildren(skeleton({ lines: 6 }));
      try { await loadRows(); } catch (e) { panel.replaceChildren(errorState({ message: e?.message, requestId: e?.requestId, onRetry: activityView, retryLabel: t('state.retry') })); return; }
      const act = select({ name: 'action', options: [{ value: 'ALL', label: t('audit.filter.allActions') }, ...distinctActions(state.rows).map((a) => ({ value: a, label: actionLabel(a) }))], value: state.filters.action });
      const user = input({ name: 'user', value: state.filters.user });
      const q = input({ name: 'q', type: 'search', value: state.filters.q });
      const since = input({ name: 'since', type: 'date', value: state.filters.since });
      const until = input({ name: 'until', type: 'date', value: state.filters.until });
      const roleOpts = distinctRoles(state.rows.concat(state.filters.role !== 'ALL' ? [{ user_role: state.filters.role }] : []));
      const role = select({ name: 'role', options: [{ value: 'ALL', label: t('audit.filter.allRoles') }, ...roleOpts.map((r) => ({ value: r, label: r }))], value: state.filters.role });
      const form = h('form', { class: 'g-audit__filters', onSubmit: (ev) => {
        ev.preventDefault();
        state.filters = { action: act.value, user: user.value, role: role.value, q: q.value, since: since.value, until: until.value };
        state.offset = 0;
        activityView();
      } },
      field({ label: t('audit.filter.action'), input: act }), field({ label: t('audit.filter.user'), input: user }),
      field({ label: t('audit.filter.role'), input: role }), field({ label: t('audit.filter.q'), input: q }),
      field({ label: t('audit.filter.since'), input: since }), field({ label: t('audit.filter.until'), input: until }),
      h('div', { class: 'g-audit__apply' }, button({ label: t('audit.filter.apply'), variant: 'primary', type: 'submit' }),
        button({ label: t('audit.filter.clear'), variant: 'ghost', onClick: () => { state.filters = blankFilters(); state.offset = 0; activityView(); } })));
      const tbl = table({
        caption: t('audit.table.caption'),
        columns: [
          { key: 'timestamp', label: t('audit.col.time'), render: (r) => formatDateTime(r.timestamp) },
          { key: 'user_name', label: t('audit.col.user'), render: userCell },
          { key: 'action', label: t('audit.col.action'), render: (r) => chip({ label: actionLabel(r.action), tone: 'neutral' }) },
          { key: 'details', label: t('audit.col.details'), render: (r) => h('span', { class: 'g-audit__details' }, r.details || '') },
          { key: 'ip_address', label: t('audit.col.ip'), render: (r) => (r.ip_address ? h('code', { class: 'g-audit__ip' }, r.ip_address) : h('span', { class: 'g-meta' }, '-')) },
        ],
        rows: state.filtered, empty: { title: t('audit.empty.title'), message: t('audit.empty.msg') },
      });
      panel.replaceChildren(
        banner({ tone: 'info', message: t('audit.legacyNote') }),
        card({ title: t('audit.filter.title') }, form),
        h('p', { class: 'g-meta', 'aria-live': 'polite' }, t('audit.showing', { n: formatNumber(state.filtered.length) })),
        tbl, pager());
    };

    // ---- ledger ----
    const ledgerView = async () => {
      panel.replaceChildren(skeleton({ lines: 6 }));
      let blocks;
      try { const r = await api.ledgerBlocks(50); blocks = Array.isArray(r) ? r : (r?.blocks || []); } catch (e) { panel.replaceChildren(errorState({ message: e?.message, requestId: e?.requestId, onRetry: ledgerView, retryLabel: t('state.retry') })); return; }
      panel.replaceChildren(
        h('p', { class: 'g-meta' }, t('audit.ledger.note')),
        table({
          caption: t('audit.ledger.caption'),
          columns: [
            { key: 'id', label: t('audit.col.block') },
            { key: 'timestamp', label: t('audit.col.time'), render: (r) => formatDateTime(r.timestamp) },
            { key: 'user_name', label: t('audit.col.user'), render: userCell },
            { key: 'action', label: t('audit.col.action'), render: (r) => actionLabel(r.action) },
            { key: 'ip_address', label: t('audit.col.ip'), render: (r) => (r.ip_address ? h('code', { class: 'g-audit__ip' }, r.ip_address) : h('span', { class: 'g-meta' }, '-')) },
            { key: 'current_hash', label: t('audit.col.hash'), render: (r) => h('code', { class: 'g-audit__hash', title: r.current_hash }, shortHash(r.current_hash, 12)) },
            { key: 'prev_hash', label: t('audit.col.prev'), render: (r) => h('code', { class: 'g-audit__hash', title: r.prev_hash }, shortHash(r.prev_hash, 12)) },
          ],
          rows: blocks, empty: { title: t('audit.empty.title'), message: t('audit.ledger.empty') },
        }));
    };

    // ---- corpus sync ----
    const syncView = async () => {
      panel.replaceChildren(skeleton({ lines: 5 }));
      let list; let sim = false;
      try { const raw = await api.sync.history(); sim = isSimulatedSync(raw); list = normalizeSync(raw); } catch (e) { panel.replaceChildren(errorState({ message: e?.message, requestId: e?.requestId, onRetry: syncView, retryLabel: t('state.retry') })); return; }
      panel.replaceChildren(...[sim ? banner({ tone: 'warn', message: `${t('audit.sync.simulated')}. ${t('audit.sync.simulatedNote')}` }) : null, table({
        caption: t('audit.sync.caption'),
        columns: [
          { key: 'timestamp', label: t('audit.col.time'), render: (r) => formatDateTime(r.timestamp) },
          { key: 'court', label: t('audit.col.court') },
          { key: 'ingested', label: t('audit.col.ingested'), render: (r) => formatNumber(r.ingested) },
          { key: 'durationMs', label: t('audit.col.duration'), render: (r) => formatDuration(r.durationMs) },
          { key: 'status', label: t('audit.col.status'), render: (r) => chip({ label: r.status === 'SUCCESS' ? t('audit.sync.success') : r.status || t('audit.sync.unknown'), tone: r.status === 'SUCCESS' ? 'primary' : 'warn' }) },
        ],
        rows: list, empty: { title: t('audit.empty.title'), message: t('audit.sync.empty') },
      })].filter(Boolean));
    };

    // ---- reports & analytics (computed client-side from the most recent 1000 rows) ----
    const barList = (items, label, labelOf) => {
      const max = Math.max(1, ...items.map((i) => i.count));
      const list = h('ul', { class: 'g-audit__bars', 'aria-label': label });
      items.forEach((i) => {
        const fill = h('span', { class: 'g-audit__fill' });
        fill.style.width = `${Math.round((i.count / max) * 100)}%`;
        list.append(h('li', { class: 'g-audit__bar' },
          h('span', { class: 'g-audit__bar-label' }, labelOf(i)),
          h('span', { class: 'g-audit__track', 'aria-hidden': 'true' }, fill),
          h('span', { class: 'g-audit__bar-n' }, formatNumber(i.count))));
      });
      return list;
    };
    const dayChart = (days) => {
      const max = Math.max(1, ...days.map((d) => d.count));
      const cols = h('div', { class: 'g-audit__cols', 'aria-hidden': 'true' });
      days.forEach((d) => {
        const col = h('div', { class: 'g-audit__col', title: `${d.day}: ${d.count}` });
        const fill = h('span', { class: 'g-audit__colfill' });
        fill.style.height = `${Math.round((d.count / max) * 100)}%`;
        col.append(h('span', { class: 'g-audit__colnum' }, d.count ? formatNumber(d.count) : ''), h('span', { class: 'g-audit__coltrack' }, fill), h('span', { class: 'g-audit__colday' }, d.day.slice(8)));
        cols.append(col);
      });
      const tbl = h('table', { class: 'g-sr' }, h('caption', {}, t('audit.rep.perDay')),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t('audit.rep.day')), h('th', { scope: 'col' }, t('audit.rep.events')))),
        h('tbody', {}, ...days.map((d) => h('tr', {}, h('td', {}, d.day), h('td', {}, String(d.count))))));
      return h('div', { role: 'group', 'aria-label': t('audit.rep.perDay') }, cols, tbl);
    };
    const reportsView = async () => {
      panel.replaceChildren(skeleton({ lines: 6 }));
      let rows;
      try { const res = await api.auditLogs({ limit: 1000 }); rows = Array.isArray(res) ? res : (res?.logs || []); } catch (e) { panel.replaceChildren(errorState({ message: e?.message, requestId: e?.requestId, onRetry: reportsView, retryLabel: t('state.retry') })); return; }
      if (!rows.length) { panel.replaceChildren(emptyState({ title: t('audit.rep.empty.title'), message: t('audit.rep.empty.msg') })); return; }
      const s = summarize(rows, new Date());
      const userLabel = (i) => (i.key === NOT_RECORDED ? t('audit.userNotRecorded') : i.key);
      const exportReport = () => {
        const csv = analyticsCsv(s, { section: t('audit.rep.csv.section'), key: t('audit.rep.csv.item'), count: t('audit.rep.events'), totals: t('audit.rep.csv.totals'),
          action: t('audit.rep.byAction'), user: t('audit.rep.byUser'), day: t('audit.rep.perDay'), events: t('audit.rep.totalEvents'), users: t('audit.rep.totalUsers'), notRecorded: t('audit.userNotRecorded') });
        saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'gyanam_audit_report.csv');
      };
      panel.replaceChildren(
        h('div', { class: 'g-row g-row--between' },
          h('p', { class: 'g-meta' }, t('audit.rep.basis', { n: formatNumber(rows.length) })),
          button({ label: t('audit.rep.export'), icon: 'download', onClick: exportReport })),
        h('div', { class: 'g-audit__tiles' },
          statTile({ label: t('audit.rep.totalEvents'), value: formatNumber(s.total) }),
          statTile({ label: t('audit.rep.totalUsers'), value: formatNumber(s.users), hint: t('audit.rep.usersHint') })),
        card({ title: t('audit.rep.byAction') }, barList(s.actions, t('audit.rep.byAction'), (i) => actionLabel(i.key))),
        card({ title: t('audit.rep.byUser') }, barList(topN(s.usersRank, 8), t('audit.rep.byUser'), userLabel)),
        card({ title: t('audit.rep.perDay') }, dayChart(s.days)));
    };

    const views = { activity: activityView, ledger: ledgerView, sync: syncView, reports: reportsView };
    const tabBar = tabs({ items: [{ id: 'activity', label: t('audit.tab.activity') }, { id: 'ledger', label: t('audit.tab.ledger') }, { id: 'sync', label: t('audit.tab.sync') }, { id: 'reports', label: t('audit.tab.reports') }], active: 'activity', label: t('audit.tabs.label'), onChange: (id) => { state.tab = id; views[id](); } });

    const exportServer = async () => {
      try { saveBlob(await api.auditCsv(exportParams(state.filters)), 'gyanam_audit_log.csv'); } catch (e) { toast(e?.message || t('audit.export.failed'), { tone: 'danger' }); }
    };
    const exportExcel = async () => {
      try { saveBlob(await api.auditCsv(exportParams(state.filters, { excel: true })), 'gyanam_audit_log_excel.csv'); } catch (e) { toast(e?.message || t('audit.export.failed'), { tone: 'danger' }); }
    };
    // Print report: renders the current filtered rows into a print-only layout and calls window.print().
    const printReport = () => {
      if (!state.filtered.length) { toast(t('audit.export.none'), { tone: 'warn' }); return; }
      const list = filterSummary(state.filters);
      const root = h('div', { class: 'g-printroot', role: 'document' },
        h('h1', {}, t('audit.print.title')),
        h('p', {}, t('audit.print.generated', { when: formatDateTime(new Date()) })),
        h('p', {}, list.length ? t('audit.print.filters', { list: list.join('; ') }) : t('audit.print.noFilters')),
        h('p', {}, t('audit.print.rows', { n: formatNumber(state.filtered.length), total: formatNumber(state.total) })),
        h('table', { class: 'g-printroot__table' },
          h('thead', {}, h('tr', {}, ...['audit.col.time', 'audit.col.user', 'audit.col.action', 'audit.col.details', 'audit.col.ip'].map((k) => h('th', { scope: 'col' }, t(k))))),
          h('tbody', {}, ...state.filtered.map((r) => h('tr', {},
            h('td', {}, formatDateTime(r.timestamp)),
            h('td', {}, isUserRecorded(r) ? `${r.user_name}${r.user_role ? ` (${r.user_role})` : ''}` : t('audit.userNotRecorded')),
            h('td', {}, actionLabel(r.action)), h('td', {}, r.details || ''), h('td', {}, r.ip_address || ''))))));
      const done = () => { root.remove(); document.body.classList.remove('g-printing'); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      document.body.append(root); document.body.classList.add('g-printing');
      try { window.print(); } finally { setTimeout(done, 0); }
    };
    const exportFiltered = () => {
      if (!state.filtered.length) { toast(t('audit.export.none'), { tone: 'warn' }); return; }
      saveBlob(new Blob([toCsv(state.filtered)], { type: 'text/csv;charset=utf-8' }), 'gyanam_audit_filtered.csv');
    };

    wrap.append(
      h('div', { class: 'g-page__head' },
        h('div', {}, h('h1', { class: 'g-page__title' }, t('audit.title')), h('p', { class: 'g-page__lede' }, t('audit.lede'))),
        h('div', { class: 'g-page__actions' },
          button({ label: t('audit.print'), icon: 'printer', variant: 'ghost', onClick: printReport }),
          button({ label: t('audit.export.filtered'), variant: 'ghost', onClick: exportFiltered }),
          button({ label: t('audit.export.excel'), icon: 'download', variant: 'ghost', onClick: exportExcel }),
          button({ label: t('audit.export'), icon: 'download', onClick: exportServer }),
          button({ label: t('audit.verify.btn'), variant: 'primary', onClick: verify }))),
      card({ title: t('audit.verify.title') }, verifyHost),
      tabBar, h('div', { role: 'tabpanel' }, panel));
    renderVerify(null);
    verify();
    activityView();
    return wrap;
  },
  onLeave() {},
};
