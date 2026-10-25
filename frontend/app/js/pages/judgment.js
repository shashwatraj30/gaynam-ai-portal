// Judgment reader: '/judgments/:id'. API: api.judgment(id). Curated rows get headnote/ratio/paragraphs;
// every other row gets metadata plus the source PDF (the real judgment). Never renders full_text for uncurated rows.
import { h, clear, icon } from '../dom.js';
import { t } from '../i18n/index.js';
import '../i18n/pages/judgment.en.js';
import '../i18n/pages/judgment.hi.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { loadCss } from '../ui/shell.js';
import { formatDate } from '../format.js';
import { chip } from '../ui/chip.js';
import { button } from '../ui/button.js';
import { card } from '../ui/card.js';
import { tabs } from '../ui/tabs.js';
import { pdfViewer } from '../ui/pdf-viewer.js';
import { skeleton } from '../ui/skeleton.js';
import { emptyState } from '../ui/empty-state.js';
import { errorState } from '../ui/error-state.js';
import { toast } from '../ui/toast.js';
import { honestView, citationText, paragraphs, parseCitedCases, briefItem, toggleBrief, inBrief } from './lib/judgment-logic.js';
import { statusChip, metaList, copyText } from './lib/judgment-ui.js';

function render(params, ctx) {
  loadCss('page-judgment.css');
  ctx.setBreadcrumb([{ label: t('nav.judgments'), href: '#/research' }, { label: t('jd.reader') }]);
  const root = h('div', { class: 'g-page jd' });

  async function load() {
    clear(root); root.append(skeleton({ lines: 8 }));
    try {
      const row = await api.judgment(params.id);
      if (!row || typeof row !== 'object') throw new Error(t('jd.notFound'));
      show(row);
    } catch (e) {
      clear(root);
      root.append(e && e.status === 404
        ? emptyState({ title: t('jd.notFound'), message: t('jd.notFoundMsg'), action: button({ label: t('jd.backResearch'), variant: 'primary', href: '#/research' }) })
        : errorState({ message: e?.message, requestId: e?.requestId, onRetry: load, retryLabel: t('jr.retry') }));
    }
  }

  function show(row) {
    const v = honestView(row);
    const title = row.title || t('jr.untitled');
    ctx.setBreadcrumb([{ label: t('nav.judgments'), href: '#/research' }, { label: title }]);
    const cite = citationText(row, formatDate);
    const pdf = row.source_pdf_url;
    const cited = parseCitedCases(row.cases_cited);

    const briefBtn = () => {
      const saved = inBrief(store.get('benchBrief'), row.id);
      return button({ label: saved ? t('rs.inBrief') : t('rs.addBrief'), variant: saved ? 'primary' : 'secondary', icon: saved ? 'check' : undefined, onClick: () => {
        const r = toggleBrief(store.get('benchBrief') || [], briefItem(row));
        if (r.action === 'full') { toast(t('rs.briefFull', { max: 5 }), { tone: 'warn' }); return; }
        store.set('benchBrief', r.list, { session: true });
        const next = briefBtn(); briefEl.replaceWith(next); briefEl = next;
        toast(t(r.action === 'added' ? 'rs.briefAdded' : 'rs.briefRemoved'), { tone: 'primary' });
      } });
    };
    let briefEl = briefBtn();
    const actions = h('div', { class: 'g-page__actions jd-noprint' },
      briefEl,
      button({ label: t('jd.copyCite'), variant: 'secondary', icon: 'copy', onClick: () => copyText(cite) }),
      button({ label: t('jd.print'), variant: 'secondary', icon: 'printer', onClick: () => window.print() }),
      button({ label: t('jd.graph'), variant: 'secondary', icon: 'graph', href: `#/graph/${encodeURIComponent(row.id)}` }),
      button({ label: t('jd.check'), variant: 'secondary', icon: 'check', href: `#/judgments/check?c=${encodeURIComponent(v.cite ? v.cite.value : title)}` }));

    const metaCard = card({ title: t('jd.metadata') }, metaList([
      [t('jr.court'), row.court], [t('jr.district'), row.district], [t('jr.bench'), row.bench], [t('jr.coram'), row.judges],
      [t('jr.date'), row.judgment_date && formatDate(row.judgment_date)],
      [v.cite ? (v.cite.label === 'CNR' ? t('jr.cnr') : t('jr.citation')) : '', v.cite && v.cite.value],
      [t('jr.equivalent'), row.equivalent_citations], [t('jr.docket'), row.docket_number],
      [t('jr.cnr'), v.cite && v.cite.label !== 'CNR' ? row.cnr_number : ''],
      [t('jr.subject'), row.subject_category], [t('jr.statutes'), row.statutes_considered],
      [t('jr.disposition'), !v.curated && v.disposition],
      [t('jr.citedLabel'), v.curated && v.citedCount != null ? t('jr.citedN', { n: v.citedCount }) : ''],
    ]));

    const status = card({ title: t('jd.status') },
      h('div', { class: 'jr-chips' }, statusChip(row.precedent_status, v.curated), v.curated ? chip({ label: t('jr.curated'), tone: 'info' }) : null),
      v.overruled ? h('p', { class: 'rs-warn', role: 'note' }, icon('alert', 16), ' ', v.overruledBy ? t('jr.overruledBy', { by: v.overruledBy }) : t('jr.overruledNoBy')) : null,
      v.overruled && v.overruledBy ? button({ label: t('jd.openOverruling'), variant: 'secondary', href: `#/research?q=${encodeURIComponent(v.overruledBy)}` }) : null,
      !v.overruled ? h('p', { class: 'rs-note' }, t('jd.statusNote')) : null);

    const pdfBlock = pdf
      ? card({ title: t('jd.pdfTitle'), actions: h('a', { class: 'jd-noprint', href: pdf, target: '_blank', rel: 'noopener noreferrer' }, t('jd.openOriginal')) },
        h('p', { class: 'rs-note' }, t('jd.pdfNote')), pdfViewer({ url: pdf, title: title }))
      : card({ title: t('jd.pdfTitle') }, h('p', { class: 'rs-note' }, t('jd.noPdf')),
        row.source_url ? h('a', { href: row.source_url, target: '_blank', rel: 'noopener noreferrer' }, t('jd.openOriginal')) : null);

    let body;
    if (v.curated) {
      const paras = paragraphs(row.full_text);
      const panels = {
        judgment: () => h('div', { class: 'jd-paras' }, ...(paras.length ? paras.map((p, i) => h('div', { class: 'jd-para' }, h('span', { class: 'jd-para__n' }, `¶ ${i + 1}`), h('p', { class: 'jr-read' }, p)))
          : [h('p', { class: 'rs-note' }, t('jd.noText'))])),
        headnote: () => (v.headnote ? h('p', { class: 'jr-read' }, v.headnote) : h('p', { class: 'rs-note' }, t('jd.none'))),
        ratio: () => (v.ratio ? h('p', { class: 'jr-read' }, v.ratio) : h('p', { class: 'rs-note' }, t('jd.none'))),
        cited: () => (cited.length ? h('ul', { class: 'jd-cited' }, ...cited.map((c) => h('li', {}, c))) : h('p', { class: 'rs-note' }, t('jd.noLinks'))),
      };
      const items = [{ id: 'judgment', label: t('jd.tab.judgment') }, { id: 'headnote', label: t('jd.tab.headnote') }, { id: 'ratio', label: t('jd.tab.ratio') }, { id: 'cited', label: t('jd.tab.cited'), badge: cited.length }];
      const panel = h('div', { class: 'jd-panel', role: 'tabpanel' });
      const tb = tabs({ items, active: 'judgment', label: t('jd.sections'), onChange: (id) => paint(id) });
      function paint(id) { clear(panel); panel.setAttribute('aria-labelledby', tb.tabId(id)); panel.append(panels[id]()); }
      paint('judgment');
      body = h('div', { class: 'jd-main' }, card({}, tb, panel), pdf ? pdfBlock : null);
    } else {
      body = h('div', { class: 'jd-main' }, h('div', { class: 'jd-banner', role: 'note' }, icon('info', 16), ' ', t('jr.metadataNote')), pdfBlock);
    }

    clear(root);
    root.append(
      h('header', { class: 'g-page__head' },
        h('div', {}, h('h1', { class: 'g-page__title jd-title' }, title),
          h('p', { class: 'g-page__lede' }, [row.court, row.judgment_date && formatDate(row.judgment_date), v.cite && `${v.cite.label === 'CNR' ? t('jr.cnr') : t('jr.citation')} ${v.cite.value}`].filter(Boolean).join(' · '))),
        actions),
      h('div', { class: 'g-grid-2 jd-grid' }, body, h('div', { class: 'g-stack' }, status, metaCard)));
  }

  load();
  return root;
}

export default { route: '/judgments/:id', title: 'Judgment', permission: 'SEARCH', render, onLeave() {} };
