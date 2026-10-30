// Home: role variants per plan §5.2. Only fields marked reliable in plan §6 are shown (P5/P9).
import { h, icon } from '../dom.js';
import { api } from '../api.js';
import { t, addMessages } from '../i18n/index.js';
import { loadCss } from '../ui/shell.js';
import { formatNumber, formatDate, formatDateTime } from '../format.js';
import { draftStatusChip } from '../ui/status.js';
import { button } from '../ui/button.js';
import { card } from '../ui/card.js';
import { chip } from '../ui/chip.js';
import { listRow } from '../ui/list-row.js';
import { statTile } from '../ui/stat-tile.js';
import { table } from '../ui/table.js';
import { timeline } from '../ui/timeline.js';
import { skeleton } from '../ui/skeleton.js';
import { emptyState } from '../ui/empty-state.js';
import { errorState } from '../ui/error-state.js';
import { field, input } from '../ui/form.js';
import {
  homeVariant, greetingKey, sortMatters, matterCounts, pickAttention, alertCount, summarizeLedger,
  shapeDistribution, activityEvents, lastSyncTimestamp, syncRows, userSummary, isSimulatedSync, kpiTiles, quickLaunch,
  metricsCourtRows, metricsStatusRows, createTtlMemo, memoUserKey,
} from './lib/home-logic.js';
import { displayName } from './lib/signin-logic.js';
import { loadDensity, applyDensity } from './lib/settings-logic.js';
import en from '../i18n/pages/home.en.js';
import hi from '../i18n/pages/home.hi.js';

addMessages('en', en);
addMessages('hi', hi);

const enc = encodeURIComponent;

// One dashboard_metrics request per render, shared by the KPI strip, distributions and admin cards; Refresh clears it.
let metricsP = null;
const refreshers = [];
function getMetrics() {
  if (!metricsP) metricsP = api.dashboardMetrics().catch((e) => { metricsP = null; throw e; });
  return metricsP;
}
// The admin sync/users cards share one short-TTL memo across mounts (keyed by user, so sign-out/user switch never leaks);
// Refresh clears it along with the metrics promise.
const adminMemo = createTtlMemo(30000);
let memoKey = '';
function refreshAll() { metricsP = null; adminMemo.clear(); refreshers.forEach((run) => run()); }

/** A card whose body loads asynchronously: skeleton -> data | empty | error with Retry. */
function asyncCard({ title, actions, load, render, className }) {
  const body = h('div', { class: 'g-stack' });
  const el = card({ title, actions, class: className }, body);
  async function run() {
    body.replaceChildren(skeleton({ lines: 3 }));
    try {
      const data = await load();
      body.replaceChildren(render(data, run));
    } catch (e) {
      body.replaceChildren(errorState({ message: e.message, requestId: e.requestId, onRetry: run, retryLabel: t('state.retry') }));
    }
  }
  refreshers.push(run);
  run();
  return el;
}

function askBox(ctx) {
  const q = input({ type: 'search', name: 'q', placeholder: t('home.ask.placeholder'), autocomplete: 'off' });
  const f = field({ label: t('home.ask.label'), input: q });
  const hint = h('span', { class: 'g-meta' }, t('home.ask.hintNoCount'));
  const form = h('form', { class: 'home__ask', novalidate: true }, f, button({ label: t('home.ask.submit'), variant: 'primary', type: 'submit', icon: 'search' }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = q.value.trim();
    if (!v) { f.setError?.(t('home.ask.required')); q.focus(); return; }
    f.setError?.(null);
    ctx.navigate(`/research?q=${enc(v)}`);
  });
  api.status().then((s) => {
    const n = s?.total_judgments_indexed;
    if (n > 0) hint.textContent = t('home.ask.hint', { n: formatNumber(n) });
  }).catch(() => {});
  return card({ title: t('home.ask.title') }, form, h('div', { class: 'home__askhint' }, hint, h('span', { class: 'g-meta' }, t('home.ask.flag'))));
}

function mattersCard(ctx, { allHint }) {
  return asyncCard({
    title: t('home.matters.title'),
    actions: button({ label: t('home.matters.all'), variant: 'ghost', href: '#/matters' }),
    load: () => api.matters(),
    render: (res) => {
      const rows = sortMatters(res?.matters, 5);
      if (!rows.length) return emptyState({ title: t('home.matters.empty'), message: t('home.matters.emptyMsg') });
      return h('div', {},
        h('p', { class: 'g-meta' }, allHint ? t('home.matters.allHint') : t('home.matters.sorted')),
        ...rows.map((m) => {
          const st = draftStatusChip(m.latest_status);
          const nextKey = `home.next.${m.latest_status}`;
          const next = t(nextKey) !== nextKey ? t(nextKey) : (m.next_action || '');
          return listRow({
            title: [m.case_number, m.title].filter(Boolean).join(' · '),
            meta: [next, m.court, m.last_updated ? formatDate(m.last_updated) : ''].filter(Boolean).join(' · '),
            status: chip(st), href: `#/matters/${enc(m.matter_key)}`,
          });
        }));
    },
  });
}

function attentionCard() {
  return asyncCard({
    title: t('home.attention.title'), className: 'home__attn',
    load: () => api.alerts(),
    render: (res) => {
      const a = pickAttention(res);
      if (!a) return h('p', { class: 'g-meta' }, t('home.attention.none'));
      const oc = a.overruled_case || {};
      const vars = { title: oc.title || '', citation: oc.citation ? `(${oc.citation})` : '', by: a.overruled_by || '', matter: a.case_number || a.case_title || '' };
      const n = alertCount(res);
      return h('div', {},
        h('h3', { class: 'home__attn-title' }, t('home.attention.heading')),
        h('p', { class: 'home__attn-body' }, t(a.overruled_by ? 'home.attention.body' : 'home.attention.bodyNoBy', vars)),
        n > 1 ? h('p', { class: 'g-meta' }, t('home.attention.more', { n })) : null,
        button({ label: t('home.attention.review'), href: `#/alerts/${enc(a.id)}` }));
    },
  });
}

function corpusNew() {
  return asyncCard({
    title: t('home.corpus.title'),
    load: () => api.recentCases(6),
    render: (res) => {
      const rows = res?.recent_cases || [];
      if (!rows.length) return emptyState({ title: t('home.corpus.empty'), message: t('home.corpus.emptyMsg') });
      return h('div', {},
        h('p', { class: 'g-meta' }, t('home.corpus.note')),
        ...rows.map((c) => listRow({
          title: c.title,
          meta: [c.court, c.citation, c.judgment_date ? formatDate(c.judgment_date) : ''].filter(Boolean).join(' · '),
          href: `#/judgments/${enc(c.id)}`,
        })));
    },
  });
}

function lineageCard() {
  return card({ title: t('home.lineage.title') },
    h('p', {}, t('home.lineage.body')),
    button({ label: t('home.lineage.open'), href: '#/graph' }));
}

function ledgerCard(ctx, { withOpen = true } = {}) {
  return asyncCard({
    title: t('home.ledger.title'),
    load: () => api.ledgerVerify(),
    render: (v, rerun) => {
      const s = summarizeLedger(v);
      const label = { ok: t('home.ledger.ok'), broken: t('home.ledger.broken'), unknown: t('home.ledger.unknown') }[s.state];
      const tone = { ok: 'primary', broken: 'danger', unknown: 'neutral' }[s.state];
      const msg = s.state === 'ok' ? (s.blocks != null ? t('home.ledger.okMsg', { n: formatNumber(s.blocks) }) : t('home.ledger.okNoCount')) : s.message;
      return h('div', { class: 'home__ledger' },
        chip({ label, tone, icon: s.state === 'ok' ? 'check' : undefined }),
        msg ? h('p', {}, msg) : null,
        h('div', { class: 'home__ledger-actions' },
          withOpen ? button({ label: t('home.ledger.open'), href: '#/audit' }) : null,
          button({ label: t('home.ledger.recheck'), variant: 'ghost', onClick: rerun })));
    },
  });
}

function activityCard() {
  return asyncCard({
    title: t('home.admin.activity'),
    load: getMetrics,
    render: (m) => {
      const ev = activityEvents(m?.recent_activity, 6).map((e) => ({ ...e, time: e.time ? formatDateTime(e.time) : '' }));
      return ev.length ? timeline(ev) : h('p', { class: 'g-meta' }, t('home.admin.noActivity'));
    },
  });
}

function kpiCard() {
  return asyncCard({
    title: t('home.kpi.title'), className: 'home__kpi',
    load: getMetrics,
    render: (m) => {
      const tiles = kpiTiles(m);
      if (!tiles.length) return emptyState({ title: t('home.kpi.empty'), message: t('home.kpi.emptyMsg') });
      return h('div', { class: 'g-stack' },
        h('div', { class: 'home__stats home__kpis', role: 'list' },
          ...tiles.map((k) => h('div', { role: 'listitem' }, statTile({ label: t(k.labelKey), value: formatNumber(k.value) })))),
        h('p', { class: 'g-meta' }, t('home.kpi.note')));
    },
  });
}

function launchCard(ctx) {
  const items = quickLaunch(ctx.can);
  if (!items.length) return null;
  return h('nav', { class: 'home__launch', 'aria-label': t('home.launch.title') },
    ...items.map((i) => h('a', { class: 'home__tile', href: `#${i.route}`, dataset: { launch: i.id } },
      icon(i.icon, 20), h('span', { class: 'home__tile-label' }, t(i.labelKey)))));
}

/** Horizontal bars. Visual list is aria-hidden; the same data is exposed as a visually hidden table. Every bar shows label, count and % as text. */
function distBars(rows, key, caption, labelHead) {
  const d = shapeDistribution(rows, key, 8);
  if (!d.bars.length) return emptyState({ title: t('home.dist.empty'), message: t('home.dist.emptyMsg') });
  const name = (b) => b.label || t('home.dist.unknown');
  const list = h('ul', { class: 'home__bars', 'aria-hidden': 'true' }, ...d.bars.map((b) => {
    const fill = h('span', { class: 'home__bar-fill' });
    fill.style.setProperty('--w', `${b.width}%`);
    return h('li', { class: 'home__bar' },
      h('span', { class: 'home__bar-label' }, name(b)),
      h('span', { class: 'home__bar-track' }, fill),
      h('span', { class: 'home__bar-num' }, `${formatNumber(b.count)} (${fmtPct(b)})`));
  }));
  const sr = h('div', { class: 'home__sr' }, table({
    caption,
    columns: [
      { key: 'label', label: labelHead, render: (r) => name(r) },
      { key: 'count', label: t('home.admin.count'), render: (r) => formatNumber(r.count) },
      { key: 'pct', label: t('home.dist.share'), render: (r) => fmtPct(r) },
    ],
    rows: d.bars, empty: { title: t('home.dist.empty') },
  }));
  return h('div', { class: 'g-stack' }, list, sr,
    d.more > 0 ? h('p', { class: 'g-meta' }, t('home.dist.more', { n: d.more })) : null);
}

function courtDistCard() {
  return asyncCard({
    title: t('home.dist.courts'),
    load: getMetrics,
    render: (m) => {
      return h('div', { class: 'g-stack' },
        distBars(metricsCourtRows(m), 'court', t('home.dist.courts'), t('home.admin.court')),
        h('p', { class: 'g-meta' }, t('home.dist.note')));
    },
  });
}

function statusDistCard() {
  return asyncCard({
    title: t('home.dist.status'),
    load: getMetrics,
    render: (m) => h('div', { class: 'g-stack' },
      distBars(metricsStatusRows(m), 'precedent_status', t('home.dist.status'), t('home.dist.statusCol')),
      h('p', { class: 'g-meta' }, t('home.dist.note'))),
  });
}

function syncCard() {
  return asyncCard({
    title: t('home.admin.sync'),
    load: () => adminMemo.get(`sync|${memoKey}`, async () => {
      const [status, history] = await Promise.all([api.sync.status(), api.sync.history()]);
      return { status, history };
    }),
    render: ({ status, history }) => {
      const ts = lastSyncTimestamp(status);
      const rows = syncRows(history, 5);
      const sim = isSimulatedSync(status) || isSimulatedSync(history);
      return h('div', { class: 'g-stack' },
        sim ? h('div', { class: 'home__simsync' }, chip({ label: t('home.sync.simulated'), tone: 'warn' }), h('span', { class: 'g-meta' }, t('home.sync.simulatedNote'))) : null,
        h('div', { class: 'home__stats' },
          statTile({ label: t('home.admin.lastSync'), value: ts ? formatDateTime(ts) : '-' }),
          statTile({ label: t('home.admin.syncState'), value: sim ? t('home.sync.simulated') : (status?.sync_state?.status || '-') })),
        h('h3', {}, t('home.admin.syncHistory')),
        table({
          caption: t('home.admin.syncHistory'),
          columns: [
            { key: 'when', label: t('home.admin.syncWhen'), render: (r) => formatDateTime(r.when) },
            { key: 'court', label: t('home.admin.court') },
            { key: 'ingested', label: t('home.admin.syncIngested'), render: (r) => formatNumber(r.ingested) },
            { key: 'status', label: t('home.admin.syncStatus') },
          ],
          rows, empty: { title: t('home.admin.noSync') },
        }));
    },
  });
}

function usersCard() {
  return asyncCard({
    title: t('home.admin.users'),
    load: () => adminMemo.get(`users|${memoKey}`, () => api.admin.users()),
    render: (res) => {
      const s = userSummary(res);
      return h('div', {}, h('p', {}, t('home.admin.usersTotal', s)), button({ label: t('nav.chamber'), variant: 'ghost', href: '#/chamber' }));
    },
  });
}

function subtitle(variant, ctx, matters) {
  if (!matters) return null;
  const c = matterCounts(matters);
  if (variant === 'judicial' && ctx.can('FINALIZE_JUDGMENT') && c.ready > 0) return t('home.sub.ready', { n: c.ready });
  if (c.open > 0) return t('home.sub.open', { n: c.open });
  return null;
}

async function render(params, ctx) {
  await Promise.all([loadCss('page-home.css'), loadCss('page-density.css')]);
  applyDensity(loadDensity());
  const user = ctx.user || {};
  const variant = homeVariant(user.role);
  const name = displayName(user.full_name || '') || t('role.unknown');
  const subEl = h('p', { class: 'g-page__lede' });
  metricsP = null; refreshers.length = 0; memoKey = memoUserKey(user);
  const head = h('header', { class: 'g-page__head' },
    h('div', {}, h('h1', { class: 'g-page__title' }, t(`home.greeting.${greetingKey(new Date().getHours())}`, { name })), subEl),
    h('div', { class: 'g-page__actions' }, button({ label: t('home.refresh'), variant: 'ghost', onClick: refreshAll })));
  const sections = [kpiCard(), launchCard(ctx)];
  const showDist = ctx.can('SEARCH') || variant === 'admin';
  const canMatters = ctx.can('DRAFT_FULL');

  if (variant === 'judicial' || variant === 'researcher') {
    if (ctx.can('SEARCH')) sections.push(askBox(ctx));
    if (canMatters) {
      sections.push(mattersCard(ctx, { allHint: variant === 'researcher' }));
      sections.push(attentionCard());
    }
    if (ctx.can('SEARCH')) sections.push(corpusNew());
    if (showDist) sections.push(h('div', { class: 'home__cols' }, courtDistCard(), statusDistCard()));
    if (canMatters) {
      api.matters().then((res) => {
        const s = subtitle(variant, ctx, res?.matters);
        if (s) subEl.textContent = s;
      }).catch(() => {});
    }
  } else if (variant === 'academic') {
    if (ctx.can('SEARCH')) sections.push(askBox(ctx));
    sections.push(h('div', { class: 'home__cols' }, lineageCard(), corpusNew()));
    if (showDist) sections.push(h('div', { class: 'home__cols' }, courtDistCard(), statusDistCard()));
  } else if (variant === 'admin') {
    subEl.textContent = t('home.admin.corpus');
    sections.push(h('div', { class: 'home__cols' }, courtDistCard(), statusDistCard()), syncCard());
    if (ctx.can('MANAGE_USERS')) sections.push(usersCard());
    if (ctx.can('VIEW_AUDIT')) sections.push(ledgerCard(ctx));
  } else {
    subEl.textContent = t('home.auditor.lede');
    sections.push(ledgerCard(ctx), activityCard());
    if (showDist) sections.push(h('div', { class: 'home__cols' }, courtDistCard(), statusDistCard()));
  }
  return h('section', { class: 'g-page' }, head, ...sections.filter(Boolean));
}

export default { route: '/', title: 'Home', permission: null, render, onLeave() {} };

// A non-zero count that rounds to 0% is shown as "<0.1%" so it never reads as empty.
function fmtPct(b) { return b.count > 0 && b.pct < 0.1 ? "<0.1%" : `${b.pct}%`; }
