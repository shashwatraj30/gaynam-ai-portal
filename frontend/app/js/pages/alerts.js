// Alerts: overruled precedents cited in saved drafts. Route '#/alerts/:id?' (DRAFT_FULL). List plus detail.
// "Open in studio" stores store 'alertTarget' so the studio can mark the affected citation.
import { h } from '../dom.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { t, addMessages } from '../i18n/index.js';
import { formatDateTime } from '../format.js';
import { loadCss } from '../ui/shell.js';
import { chip } from '../ui/chip.js';
import { button } from '../ui/button.js';
import { card } from '../ui/card.js';
import { listRow } from '../ui/list-row.js';
import { emptyState } from '../ui/empty-state.js';
import { errorState } from '../ui/error-state.js';
import { skeleton } from '../ui/skeleton.js';
import { statTile } from '../ui/stat-tile.js';
import { draftStatusChip } from '../ui/status.js';
import en from '../i18n/pages/alerts.en.js';
import hi from '../i18n/pages/alerts.hi.js';
import { sortAlerts, severityChip, summarize, alertHref, studioHref, matterHref, judgmentHref, researchHref, buildAlertTarget, findOverrulingId, foundInKey, pickAlert } from './lib/alerts-logic.js';

addMessages('en', en); addMessages('hi', hi);

const sevChip = (a) => { const s = severityChip(a.severity); return chip({ label: t(`alerts.sev.${s.key}`), tone: s.tone }); };

function detail(a) {
  const host = h('div', { class: 'g-stack' });
  const oc = a.overruled_case || {};
  const overrulingSlot = h('span', {}, button({ label: t('alerts.openOverruling'), href: researchHref(a.overruled_by || oc.title), variant: 'secondary' }));
  // Best effort: resolve the overruling judgment id from the overruled case's graph.
  if (oc.id != null) {
    api.judgmentGraph(oc.id).then((g) => {
      const id = findOverrulingId(g, oc.id);
      if (id != null) overrulingSlot.replaceChildren(button({ label: t('alerts.openOverruling'), href: judgmentHref(id), variant: 'secondary' }));
    }).catch(() => { /* keep the research link */ });
  }
  const mh = matterHref(a);
  host.append(
    h('div', { class: 'g-row' }, sevChip(a), chip({ label: t('alerts.overruled'), tone: 'danger' }),
      h('span', { class: 'g-meta' }, t('alerts.found', { when: formatDateTime(a.date_created) }))),
    h('h2', { class: 'g-alerts__title' }, t('alerts.detail.title', { title: oc.title || t('alerts.unknownCase') })),
    h('p', { class: 'g-page__lede' }, t('alerts.detail.by', { by: a.overruled_by || t('alerts.notRecorded') })),
    card({ title: t('alerts.affected') },
      h('div', { class: 'g-stack' },
        h('div', {}, h('div', { class: 'g-alerts__k' }, a.case_title || a.case_number || t('alerts.draft', { id: a.draft_id })),
          h('div', { class: 'g-meta' }, [a.case_number, t('alerts.draft', { id: a.draft_id })].filter(Boolean).join(' · '))),
        h('div', { class: 'g-row' }, a.draft_status ? chip(draftStatusChip(a.draft_status)) : null,
          chip({ label: t(`alerts.foundIn.${foundInKey(a.found_in)}`), tone: 'warn' }),
          oc.citation ? h('span', { class: 'g-meta' }, oc.citation) : null),
        h('p', { class: 'g-meta' }, t('alerts.honest')))),
    h('div', { class: 'g-row' },
      button({ label: t('alerts.openStudio'), variant: 'primary', href: studioHref(a), onClick: () => store.set('alertTarget', buildAlertTarget(a), { session: true }) }),
      oc.id != null ? button({ label: t('alerts.openOverruled'), href: judgmentHref(oc.id) }) : null,
      overrulingSlot,
      mh ? button({ label: t('alerts.openMatter'), variant: 'ghost', href: mh }) : null));
  return host;
}

export default {
  route: '/alerts/:id?',
  title: 'Alerts',
  permission: 'DRAFT_FULL',
  async render(params, ctx) {
    await loadCss('page-alerts.css');
    const wrap = h('section', { class: 'g-page' });
    const body = h('div', { class: 'g-stack' }, skeleton({ lines: 5 }));
    wrap.append(h('div', { class: 'g-page__head' }, h('div', {}, h('h1', { class: 'g-page__title' }, t('alerts.title')), h('p', { class: 'g-page__lede' }, t('alerts.lede')))), body);
    const load = async () => {
      body.replaceChildren(skeleton({ lines: 5 }));
      let res;
      try { res = await api.alerts(); } catch (err) {
        body.replaceChildren(errorState({ message: err?.message, requestId: err?.requestId, onRetry: load, retryLabel: t('state.retry') })); return;
      }
      const list = sortAlerts(res?.alerts || []);
      store.set('alertCount', list.length); // for the sidebar badge (shell may subscribe)
      if (!list.length) { body.replaceChildren(emptyState({ title: t('alerts.empty.title'), message: t('alerts.empty.msg') })); return; }
      const sum = summarize(list);
      const selected = pickAlert(list, params.id) || list[0];
      if (params.id && selected !== pickAlert(list, params.id)) ctx.toast?.(t('alerts.notFound'), { tone: 'warn' });
      body.replaceChildren(
        h('div', { class: 'g-alerts__stats' },
          statTile({ label: t('alerts.stat.total'), value: sum.total }),
          statTile({ label: t('alerts.stat.critical'), value: sum.critical, tone: sum.critical ? 'danger' : 'neutral' }),
          statTile({ label: t('alerts.stat.warning'), value: sum.warning, tone: sum.warning ? 'warn' : 'neutral' })),
        h('div', { class: 'g-grid-2 g-alerts__grid' },
          h('div', { class: 'g-stack' },
            h('h2', { class: 'g-section__title' }, t('alerts.list.title')),
            h('nav', { 'aria-label': t('alerts.list.title') }, ...list.map((a) => listRow({
              title: a.overruled_case?.title || t('alerts.unknownCase'),
              meta: [a.case_title || a.case_number, a.overruled_case?.citation].filter(Boolean).join(' · '),
              status: sevChip(a), href: alertHref(a), selected: a === selected,
            })))),
          h('div', { class: 'g-alerts__detail', 'aria-live': 'polite' }, detail(selected))));
      ctx.setBreadcrumb?.([{ label: t('alerts.title'), href: '#/alerts' }, { label: selected.overruled_case?.title || t('alerts.title') }]);
    };
    await load();
    return wrap;
  },
  onLeave() {},
};
