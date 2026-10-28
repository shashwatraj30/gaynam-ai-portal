// Judgment reader: '/judgments/:id'. API: api.judgment(id), api.judgmentParagraphs(id), api.judgmentTreatments(id), api.judgmentGraph(id).
// Curated rows get headnote/ratio/full text; every other row gets metadata plus the source PDF (the real judgment).
// Never renders full_text for uncurated rows. Deep links: ?tab=<judgment|headnote|ratio|paragraphs|cited>&para=N (anchors id="para-N").
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
import {
  honestView, citationText, paragraphs, parseCitedCases, briefItem, toggleBrief, inBrief, splitParties, parseParaParam, paraId, pickTab,
  paragraphRows, citedByRows, linkCitedCases,
} from './lib/judgment-logic.js';
import { draftHandoff } from './lib/research-logic.js';
import { statusChip, metaList, copyText } from './lib/judgment-ui.js';

const TABS = ['judgment', 'headnote', 'ratio', 'paragraphs', 'cited'];
const once = (fn) => { let p; return () => (p || (p = fn())); };

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
    const citedTexts = parseCitedCases(row.cases_cited);
    const parties = splitParties(row.title);
    const paraWanted = parseParaParam(ctx.query.get('para'));

    const getParas = once(async () => paragraphRows(await api.judgmentParagraphs(row.id)));
    const getGraph = once(() => api.judgmentGraph(row.id));
    const getTreat = once(() => api.judgmentTreatments(row.id));

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
    const startDraft = () => {
      const ho = draftHandoff([briefItem(row)], store.get('intakeParams'));
      if (ho) store.set('intakeParams', ho, { session: true });
    };
    const actions = h('div', { class: 'g-page__actions jd-noprint' },
      ctx.can('DRAFT_FULL') ? button({ label: t('jd.startDraft'), variant: 'primary', icon: 'edit', href: '#/drafts/new', onClick: startDraft }) : null,
      briefEl,
      button({ label: t('jd.copyCite'), variant: 'secondary', icon: 'copy', onClick: () => copyText(cite) }),
      button({ label: t('jd.print'), variant: 'secondary', icon: 'printer', onClick: () => window.print() }),
      button({ label: t('jd.graph'), variant: 'secondary', icon: 'graph', href: `#/graph/${encodeURIComponent(row.id)}` }),
      button({ label: t('jd.check'), variant: 'secondary', icon: 'check', href: `#/judgments/check?c=${encodeURIComponent(v.cite ? v.cite.value : title)}` }));

    const partiesCard = parties ? card({ title: t('jd.parties') }, h('dl', { class: 'jd-parties' },
      h('dt', {}, t('jd.partyPet')), h('dd', {}, parties.petitioner), h('dt', {}, t('jd.partyRes')), h('dd', {}, parties.respondent))) : null;

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

    // ---- cited-by card: treatments when recorded, else incoming graph edges ----
    const citedByBody = h('div', { class: 'jd-citedby' }, skeleton({ lines: 3 }));
    (async () => {
      let tr = null; let g = null; let failed = false;
      try { tr = await getTreat(); } catch { failed = true; }
      let rows = citedByRows(tr, null);
      if (!rows.length) {
        try { g = await getGraph(); failed = false; rows = citedByRows(null, g); } catch { /* keep failed flag */ }
      }
      clear(citedByBody);
      if (!rows.length) { citedByBody.append(h('p', { class: 'rs-note' }, failed ? t('jd.citedByFailed') : t('jd.citedByNone'))); return; }
      citedByBody.append(h('ul', { class: 'jd-cited' }, ...rows.slice(0, 50).map((r) => h('li', {},
        r.id != null ? h('a', { href: `#/judgments/${encodeURIComponent(r.id)}` }, r.title || t('jr.untitled')) : (r.title || r.citation),
        r.citation ? h('span', { class: 'rs-note' }, ` ${r.citation}`) : null,
        r.treatment ? ` ` : null, r.treatment ? chip({ label: r.treatment, tone: 'neutral' }) : null,
        r.para != null ? h('span', { class: 'rs-note' }, ` ${t('jd.citedByPara', { n: r.para })}`) : null,
        r.status ? h('span', { class: 'jd-cited__s' }, ' ', statusChip(r.status, false)) : null))));
    })();
    const citedByCard = card({ title: t('jd.citedByTitle') }, citedByBody);

    const pdfActions = pdf ? h('span', { class: 'jd-pdfact jd-noprint' },
      h('a', { href: pdf, target: '_blank', rel: 'noopener noreferrer' }, t('jd.openOriginal')),
      h('a', { href: pdf, download: '', rel: 'noopener noreferrer' }, t('jd.downloadPdf'))) : null;
    const pdfBlock = pdf
      ? card({ title: t('jd.pdfTitle'), actions: pdfActions }, h('p', { class: 'rs-note' }, t('jd.pdfNote')), pdfViewer({ url: pdf, title: title }))
      : card({ title: t('jd.pdfTitle') }, h('p', { class: 'rs-note' }, t('jd.noPdf')),
        row.source_url ? h('a', { href: row.source_url, target: '_blank', rel: 'noopener noreferrer' }, t('jd.openOriginal')) : null);

    // ---- tabs ----
    const copyBtn = (label, text) => button({ label, variant: 'secondary', icon: 'copy', onClick: () => copyText(text, 'jd.copiedText') });
    const paraRow = (p, hit) => h('div', { class: `jd-para${hit ? ' jd-para--hit' : ''}`, id: paraId(p.n), tabindex: '-1' },
      h('a', { class: 'jd-para__n', href: `#/judgments/${encodeURIComponent(row.id)}?tab=paragraphs&para=${p.n}`, 'aria-label': t('jd.paraLink', { n: p.n }) }, `¶ ${p.n}`),
      h('div', {}, h('p', { class: 'jr-read' }, p.text),
        h('div', { class: 'jd-para__act jd-noprint' },
          p.page != null ? h('span', { class: 'rs-note' }, t('jd.paraPage', { p: p.page })) : null,
          button({ label: t('jd.copyPara'), variant: 'ghost', icon: 'copy', onClick: () => copyText(`${p.text}\n(${cite}, para ${p.n})`, 'jd.copiedText') }))));
    const panels = {
      judgment: () => {
        const paras = paragraphs(row.full_text);
        return h('div', { class: 'jd-paras' }, ...(paras.length ? paras.map((p, i) => paraRow({ n: i + 1, text: p, page: null }, paraWanted === i + 1))
          : [h('p', { class: 'rs-note' }, t('jd.noText'))]));
      },
      headnote: () => (v.headnote ? h('div', { class: 'jd-stack' }, h('p', { class: 'jr-read' }, v.headnote), copyBtn(t('jd.copyHeadnote'), v.headnote)) : h('p', { class: 'rs-note' }, t('jd.none'))),
      ratio: () => (v.ratio ? h('div', { class: 'jd-stack' }, h('p', { class: 'jr-read' }, v.ratio), copyBtn(t('jd.copyRatio'), v.ratio)) : h('p', { class: 'rs-note' }, t('jd.none'))),
      paragraphs: () => {
        const box = h('div', { class: 'jd-paras' }, skeleton({ lines: 4 }));
        getParas().then((res) => {
          clear(box);
          if (!res.available) {
            box.append(emptyState({ title: t('jd.parasNone'), message: t('jd.parasNoneMsg') }));
            if (paraWanted && v.curated && tb && tb.isParaTab) { tb.isParaTab = false; tb.select('judgment'); }
            return;
          }
          res.items.forEach((p) => box.append(paraRow(p, paraWanted === p.n)));
          if (paraWanted && !res.items.some((p) => p.n === paraWanted)) box.prepend(h('p', { class: 'rs-warn', role: 'note' }, icon('info', 16), ' ', t('jd.paraMissing', { n: paraWanted })));
          focusPara();
        }).catch(() => { clear(box); box.append(h('p', { class: 'rs-note' }, t('jd.parasFailed'))); });
        return box;
      },
      cited: () => {
        const box = h('div', {});
        const plain = () => (citedTexts.length ? h('ul', { class: 'jd-cited' }, ...citedTexts.map((c) => h('li', {}, c))) : h('p', { class: 'rs-note' }, t('jd.noLinks')));
        box.append(plain());
        if (citedTexts.length) {
          getGraph().then((g) => {
            clear(box);
            box.append(h('ul', { class: 'jd-cited' }, ...linkCitedCases(citedTexts, g).map((c) => h('li', {},
              c.id != null ? h('a', { href: `#/judgments/${encodeURIComponent(c.id)}` }, c.text) : c.text))));
          }).catch(() => {});
        }
        return box;
      },
    };
    const ids = v.curated ? TABS : ['paragraphs', 'cited'];
    const labels = { judgment: t('jd.tab.judgment'), headnote: t('jd.tab.headnote'), ratio: t('jd.tab.ratio'), paragraphs: t('jd.tab.paragraphs'), cited: t('jd.tab.cited') };
    const defaultTab = paraWanted ? 'paragraphs' : (v.curated ? 'judgment' : 'paragraphs');
    const active = pickTab(ctx.query.get('tab'), ids, ids.includes(defaultTab) ? defaultTab : ids[0]);
    const panel = h('div', { class: 'jd-panel', role: 'tabpanel' });
    const tb = tabs({ items: ids.map((id) => ({ id, label: labels[id], badge: id === 'cited' ? citedTexts.length : undefined })), active, label: t('jd.sections'), onChange: (id) => paint(id) });
    tb.isParaTab = paraWanted != null && active === 'paragraphs';
    function paint(id) { clear(panel); panel.setAttribute('aria-labelledby', tb.tabId(id)); panel.append(panels[id]()); if (id === 'judgment') focusPara(); }
    function focusPara() {
      if (!paraWanted) return;
      requestAnimationFrame(() => {
        const el = document.getElementById(paraId(paraWanted));
        if (el) { el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); }
      });
    }
    paint(active);
    const body = h('div', { class: 'jd-main' },
      v.curated ? null : h('div', { class: 'jd-banner', role: 'note' }, icon('info', 16), ' ', t('jr.metadataNote')),
      partiesCard, card({}, tb, panel), pdfBlock);

    clear(root);
    root.append(
      h('header', { class: 'g-page__head' },
        h('div', {}, h('h1', { class: 'g-page__title jd-title' }, title),
          h('p', { class: 'g-page__lede' }, [row.court, row.judgment_date && formatDate(row.judgment_date), v.cite && `${v.cite.label === 'CNR' ? t('jr.cnr') : t('jr.citation')} ${v.cite.value}`].filter(Boolean).join(' · '))),
        actions),
      h('div', { class: 'g-grid-2 jd-grid' }, body, h('div', { class: 'g-stack' }, status, citedByCard, metaCard)));
  }

  load();
  return root;
}

export default { route: '/judgments/:id', title: 'Judgment', permission: 'SEARCH', render, onLeave() {} };
