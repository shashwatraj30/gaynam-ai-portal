// Citation graph. Route '#/graph/:id?'. Without an id: guided lineages and the overruled pairs.
// With an id: api.judgmentGraph(id) drawn as a layered SVG (built with createElementNS) plus a list view
// that is the accessible equivalent. Empty state for the many judgments with no recorded links (P9).
import { h } from '../dom.js';
import { api } from '../api.js';
import { t, addMessages } from '../i18n/index.js';
import { loadCss } from '../ui/shell.js';
import { chip } from '../ui/chip.js';
import { button } from '../ui/button.js';
import { card } from '../ui/card.js';
import { tabs } from '../ui/tabs.js';
import { listRow } from '../ui/list-row.js';
import { emptyState } from '../ui/empty-state.js';
import { errorState } from '../ui/error-state.js';
import { skeleton } from '../ui/skeleton.js';
import { banner } from '../ui/banner.js';
import { field, input } from '../ui/form.js';
import { precedentChip } from '../ui/status.js';
import en from '../i18n/pages/graph.en.js';
import hi from '../i18n/pages/graph.hi.js';
import { layoutGraph, linkRows, neighborByKey, wrapLines, truncate, nodeHref, graphHref, isEmptyGraph, resolveStreams, nodeActions, searchHits, treatmentCounts, TREATMENT_KEYS } from './lib/graph-logic.js';
import { LINEAGES, OVERRULED_PAIRS } from './lib/lineages.js';

addMessages('en', en); addMessages('hi', hi);

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, String(v));
  for (const k of kids.flat()) if (k != null) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

function head(title, lede, actions) {
  return h('div', { class: 'g-page__head' },
    h('div', {}, h('h1', { class: 'g-page__title' }, title), lede ? h('p', { class: 'g-page__lede' }, lede) : null),
    actions ? h('div', { class: 'g-page__actions' }, actions) : null);
}

const KEYS = ['privacy', 'cheque', 'natural', 'arbitration'];
const localLabel = (key) => (KEYS.includes(key) ? { title: t(`graph.lineage.${key}`), subtitle: t(`graph.lineage.${key}.sub`) } : {});

function lineageNode(n) {
  const acts = nodeActions(n).map((a) => button({
    label: a.kind === 'search' ? t('graph.searchCase') : a.kind === 'graph' ? t('graph.openGraph') : t('graph.openJudgment'),
    variant: a.kind === 'open' ? 'primary' : 'ghost', href: a.href, ariaLabel: `${a.kind === 'search' ? t('graph.searchCase') : a.kind === 'graph' ? t('graph.openGraph') : t('graph.openJudgment')}: ${n.title}`,
  }));
  const rows = [['bench', n.bench], ['coram', n.coram], ['holding', n.holding], ['impact', n.impact]].filter(([, v]) => v);
  return h('li', { class: `g-graph__lnode g-graph__node-li${n.overruled ? ' g-graph__node-li--bad' : ''}` },
    n.year ? h('span', { class: 'g-graph__year' }, n.year) : null,
    h('span', { class: 'g-graph__lmain' },
      h('span', { class: 'g-graph__ltitle' }, n.title),
      n.citation ? h('span', { class: 'g-meta' }, n.citation) : null),
    h('span', { class: 'g-graph__lacts' },
      n.overruled ? chip({ label: t('graph.status.overruled'), tone: 'danger' }) : null,
      n.judgmentId == null ? chip({ label: t('graph.notInCorpus'), tone: 'neutral' }) : null,
      ...acts),
    rows.length ? h('dl', { class: 'g-graph__ndl' }, ...rows.flatMap(([k, v]) => [h('dt', {}, t(`graph.node.${k}`)), h('dd', {}, v)])) : null);
}

function finder() {
  const live = h('div', { class: 'g-meta', 'aria-live': 'polite' });
  const hits = h('div', { class: 'g-graph__hits' });
  const inp = input({ type: 'search', placeholder: t('graph.find.label'), autocomplete: 'off' });
  let seq = 0;
  const run = async () => {
    const q = inp.value.trim();
    if (q.length < 3) { live.textContent = t('graph.find.hint'); hits.replaceChildren(); return; }
    const my = ++seq; live.textContent = '';
    hits.replaceChildren(skeleton({ lines: 3 }));
    try {
      const list = searchHits(await api.search({ query: q, limit: 8 }));
      if (my !== seq) return;
      live.textContent = list.length ? t('graph.find.count', { n: list.length }) : t('graph.find.none');
      hits.replaceChildren(...list.map((r) => listRow({ title: r.title, meta: r.meta, href: graphHref(r.id) })));
    } catch (err) {
      if (my !== seq) return;
      hits.replaceChildren(); live.textContent = t('graph.find.error');
    }
  };
  const form = h('form', { class: 'g-graph__find', role: 'search', onSubmit: (ev) => { ev.preventDefault(); run(); } },
    field({ label: t('graph.find.label'), input: inp, hint: t('graph.find.hint') }),
    button({ label: t('graph.find.go'), variant: 'primary', type: 'submit' }));
  return card({ title: t('graph.find.title') }, form, live, hits);
}

function guided() {
  const wrap = h('section', { class: 'g-page g-graph' });
  const body = h('div', { class: 'g-stack' }, skeleton({ lines: 6 }));
  wrap.append(head(t('graph.title'), t('graph.lede.guided')), banner({ tone: 'info', message: t('graph.honest') }), finder(), body);

  const paint = ({ streams, source }) => {
    let cur = streams[0].id;
    const panel = h('div', { role: 'tabpanel' });
    const bar = tabs({ items: streams.map((s) => ({ id: s.id, label: s.title })), active: cur, label: t('graph.streams.label'), onChange: (id) => { cur = id; show(); } });
    const show = () => {
      const s = streams.find((x) => x.id === cur) || streams[0];
      panel.setAttribute('aria-labelledby', bar.tabId(s.id));
      panel.replaceChildren(
        s.subtitle ? h('p', { class: 'g-meta' }, s.subtitle) : null,
        s.nodes.length ? h('ol', { class: 'g-graph__nodes', 'aria-label': t('graph.nodes.label') }, ...s.nodes.map(lineageNode)) : null);
    };
    show();
    const pairs = source === 'local' ? card({ title: t('graph.pairs.title') },
      h('p', { class: 'g-meta' }, t('graph.pairs.lede')),
      h('div', {}, ...OVERRULED_PAIRS.map((p) => listRow({
        title: `${p.from.title}  →  ${p.to.title}`,
        meta: `${p.from.citation} · ${t('graph.pairs.overruledBy')} ${p.to.citation}`,
        status: chip({ label: t('graph.status.overruled'), tone: 'danger' }), href: graphHref(p.from.id) })))) : null;
    body.replaceChildren(...[
      source === 'local' ? banner({ tone: 'warn', message: t('graph.offline'), action: { label: t('graph.retryLineages'), onClick: load } }) : null,
      h('h2', { class: 'g-section__title' }, t('graph.guided.title')),
      h('div', { class: 'g-graph__streams' }, bar), panel, pairs,
      h('p', { class: 'g-meta' }, t('graph.hint.open'))].filter(Boolean));
  };
  async function load() {
    body.replaceChildren(skeleton({ lines: 6 }));
    let payload = null;
    try { payload = await api.lineages(); } catch (e) { payload = null; }
    paint(resolveStreams(payload, LINEAGES, localLabel));
  }
  load();
  return wrap;
}

async function treatmentCard(id) {
  const host = card({ title: t('graph.treat.title') });
  let tc;
  try { tc = treatmentCounts(await api.judgmentTreatments(id)); } catch (e) { tc = treatmentCounts(null); }
  if (!tc.available) { host.append(h('p', { class: 'g-meta' }, t('graph.treat.none'))); return host; }
  host.append(
    h('ul', { class: 'g-graph__treat' }, ...TREATMENT_KEYS.filter((k) => tc.counts[k] > 0).map((k) =>
      h('li', {}, h('span', {}, t(`graph.treat.${k}`)), h('strong', {}, String(tc.counts[k])))),
      tc.other ? h('li', {}, h('span', {}, t('graph.treat.other')), h('strong', {}, String(tc.other))) : null),
    h('p', { class: 'g-meta' }, t('graph.treat.total', { n: tc.total })));
  return host;
}

function nodeChip(n) {
  if (n.in_corpus === false) return chip({ label: t('graph.notInCorpus'), tone: 'neutral' });
  const p = precedentChip(n.precedent_status);
  return chip({ label: p.label, tone: p.tone });
}

function drawSvg(model, onSelect, getSelected) {
  const root = svg('svg', {
    class: 'g-graph__svg', viewBox: `0 0 ${model.width} ${model.height}`, width: model.width, height: model.height,
    role: 'group', 'aria-label': t('graph.svg.label', { n: model.nodes.length }),
  });
  root.append(svg('defs', {},
    svg('marker', { id: 'g-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svg('path', { d: 'M0 0 L10 5 L0 10 z', class: 'g-graph__arrow' })),
    svg('marker', { id: 'g-arrow-bad', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svg('path', { d: 'M0 0 L10 5 L0 10 z', class: 'g-graph__arrow g-graph__arrow--bad' }))));
  for (const e of model.edges) {
    root.append(svg('path', { d: e.d, class: `g-graph__edge${e.overruled ? ' g-graph__edge--bad' : ''}`, 'marker-end': `url(#${e.overruled ? 'g-arrow-bad' : 'g-arrow'})`, 'aria-hidden': 'true' }));
  }
  const groups = new Map();
  for (const n of model.nodes) {
    const over = String(n.precedent_status || '').toUpperCase() === 'OVERRULED';
    const lines = wrapLines(n.title, 28, 2);
    const g = svg('g', {
      class: `g-graph__node${n.isCenter ? ' g-graph__node--center' : ''}${over ? ' g-graph__node--bad' : ''}${n.in_corpus === false ? ' g-graph__node--ext' : ''}`,
      tabindex: 0, role: 'button', 'data-id': n.id,
      'aria-label': `${n.title}${n.citation ? ', ' + n.citation : ''}${over ? ', ' + t('graph.status.overruled') : ''}${n.isCenter ? ', ' + t('graph.center') : ''}`,
    },
      svg('rect', { x: n.x, y: n.y, width: n.w, height: n.h, rx: 8, class: 'g-graph__box' }),
      ...lines.map((ln, i) => svg('text', { x: n.x + 12, y: n.y + 22 + i * 16, class: 'g-graph__t' }, ln)),
      svg('text', { x: n.x + 12, y: n.y + n.h - 10, class: 'g-graph__c' }, truncate([n.citation, n.year].filter(Boolean).join(' · '), 34)));
    g.addEventListener('click', () => onSelect(n.id));
    g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(n.id); return; }
      const nx = neighborByKey(model, n.id, ev.key);
      if (nx != null) { ev.preventDefault(); groups.get(String(nx))?.focus(); }
    });
    groups.set(String(n.id), g);
    root.append(g);
  }
  const mark = () => { const sel = String(getSelected()); groups.forEach((g, id) => g.classList.toggle('g-graph__node--sel', id === sel)); };
  return { el: root, mark };
}

function detailCard(n) {
  const href = nodeHref(n);
  return card({ title: t('graph.selected') },
    h('div', { class: 'g-stack' },
      h('h3', { class: 'g-graph__dtitle' }, n.title),
      h('p', { class: 'g-meta' }, [n.citation, n.court, n.year].filter(Boolean).join(' · ')),
      h('div', { class: 'g-row' }, nodeChip(n), n.isCenter ? chip({ label: t('graph.center'), tone: 'info' }) : null),
      String(n.precedent_status || '').toUpperCase() === 'OVERRULED' ? h('p', { class: 'g-graph__warn' }, t('graph.doNotRely')) : null,
      n.in_corpus === false ? h('p', { class: 'g-meta' }, t('graph.extNote')) : null,
      h('div', { class: 'g-row' },
        href ? button({ label: t('graph.openJudgment'), variant: 'primary', href }) : null,
        !n.isCenter && n.in_corpus !== false ? button({ label: t('graph.graphFromHere'), href: graphHref(n.id) }) : null)));
}

function listView(model, select, getSelected) {
  const rows = linkRows(model);
  const center = model.nodes.find((n) => n.isCenter);
  if (!rows.length) return emptyState({ title: t('graph.empty.title'), message: t('graph.list.none') });
  const kinds = ['overruled_by', 'overrules', 'relied_on', 'cited_by', 'indirect'];
  return h('div', { class: 'g-stack' }, ...kinds.map((k) => {
    const sub = rows.filter((r) => r.kind === k);
    if (!sub.length) return null;
    return h('section', { class: 'g-stack', 'aria-label': t(`graph.kind.${k}`) },
      h('h3', { class: 'g-graph__kind' }, t(`graph.kind.${k}`, { title: center ? center.title : '' })),
      h('div', {}, ...sub.map((r) => listRow({
        title: r.node.title,
        meta: [r.node.citation, r.node.year, r.label].filter(Boolean).join(' · '),
        status: nodeChip(r.node),
        selected: String(getSelected()) === String(r.node.id),
        onClick: () => select(r.node.id),
      }))));
  }));
}

async function renderGraph(id, ctx) {
  const wrap = h('section', { class: 'g-page' });
  const body = h('div', { class: 'g-stack' }, skeleton({ lines: 6 }));
  wrap.append(head(t('graph.title'), t('graph.lede.graph'), button({ label: t('graph.back'), variant: 'ghost', href: '#/graph' })), body);

  const load = async () => {
    body.replaceChildren(skeleton({ lines: 6 }));
    let data;
    try { data = await api.judgmentGraph(id); } catch (err) {
      if (err && err.status === 404) { body.replaceChildren(emptyState({ title: t('graph.notFound.title'), message: t('graph.notFound.msg'), action: button({ label: t('graph.back'), href: '#/graph' }) })); return; }
      body.replaceChildren(errorState({ message: err?.message, requestId: err?.requestId, onRetry: load, retryLabel: t('state.retry') })); return;
    }
    const model = layoutGraph(data);
    const center = model.nodes.find((n) => n.isCenter) || (data?.nodes || [])[0];
    if (center) ctx.setBreadcrumb([{ label: t('graph.title'), href: '#/graph' }, { label: truncate(center.title, 40) }]);
    if (isEmptyGraph(data)) {
      body.replaceChildren(...[
        center ? card({ title: center.title }, h('p', { class: 'g-meta' }, [center.citation, center.court, center.year].filter(Boolean).join(' · ')),
          button({ label: t('graph.openJudgment'), href: nodeHref(center) || undefined })) : null,
        emptyState({ title: t('graph.empty.title'), message: data?.message || t('graph.empty.msg'), action: button({ label: t('graph.guided.title'), href: '#/graph' }) })].filter(Boolean));
      return;
    }
    let selected = model.centerId;
    const side = h('div', { class: 'g-graph__side' });
    const treat = h('div', {}); treatmentCard(id).then((c) => treat.replaceChildren(c));
    const drawing = drawSvg(model, (nid) => select(nid), () => selected);
    const listHost = h('div', { role: 'tabpanel' });
    const graphHost = h('div', { class: 'g-graph__scroll', role: 'tabpanel', tabindex: '0', 'aria-label': t('graph.svg.scroll') }, drawing.el);
    const renderList = () => listHost.replaceChildren(listView(model, select, () => selected));
    const showSide = () => { const n = model.nodes.find((x) => String(x.id) === String(selected)); if (n) side.replaceChildren(detailCard(n)); };
    function select(nid) { selected = nid; drawing.mark(); showSide(); renderList(); }
    const tabBar = tabs({
      items: [{ id: 'graph', label: t('graph.tab.graph') }, { id: 'list', label: t('graph.tab.list'), badge: model.nodes.length - 1 }],
      active: 'graph', label: t('graph.tabs.label'),
      onChange: (tid) => { graphHost.hidden = tid !== 'graph'; listHost.hidden = tid !== 'list'; },
    });
    listHost.hidden = true;
    select(model.centerId);
    body.replaceChildren(...[
      model.truncated ? banner({ tone: 'info', message: t('graph.truncated', { shown: model.nodes.length, total: model.total }) }) : null,
      h('div', { class: 'g-grid-2' },
        h('div', { class: 'g-stack' }, tabBar, h('p', { class: 'g-meta' }, t('graph.legend')), graphHost, listHost),
        side),
      h('p', { class: 'g-meta' }, t('graph.honest'))].filter(Boolean));
  };
  await load();
  return wrap;
}

export default {
  route: '/graph/:id?',
  title: 'Citation graph',
  permission: 'SEARCH',
  async render(params, ctx) {
    await loadCss('page-graph.css');
    return params.id ? renderGraph(params.id, ctx) : guided();
  },
  onLeave() {},
};
