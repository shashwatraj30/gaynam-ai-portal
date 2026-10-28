// Citation check: '/judgments/check' (permission VERIFY_CITATION). API: api.verifySingleCitation(citation).
// Deep link: ?c=<citation> prefills and runs. Past checks live in sessionStorage via store key 'citationChecks'.
import { h, clear, icon } from '../dom.js';
import { t } from '../i18n/index.js';
import '../i18n/pages/citation-check.en.js';
import '../i18n/pages/citation-check.hi.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { loadCss } from '../ui/shell.js';
import { formatDate } from '../format.js';
import { chip } from '../ui/chip.js';
import { button } from '../ui/button.js';
import { card } from '../ui/card.js';
import { field, input, textarea } from '../ui/form.js';
import { tabs } from '../ui/tabs.js';
import { table } from '../ui/table.js';
import { toast } from '../ui/toast.js';
import { checkList } from '../ui/check-list.js';
import { skeleton } from '../ui/skeleton.js';
import { errorState } from '../ui/error-state.js';
import { banner } from '../ui/banner.js';
import {
  SAMPLES, interpretResult, normalizeInput, addPast, sampleLabel, DOC_ACCEPT, isTextFile, isSupportedDoc, documentCitationRows, documentSummary, briefItemFromRow, documentCsv,
} from './lib/citation-check-logic.js';
import { honestView, citationText, briefItem, toggleBrief } from './lib/judgment-logic.js';
import { draftHandoff } from './lib/research-logic.js';
import { statusChip, metaList, copyText } from './lib/judgment-ui.js';

const KEY = 'citationChecks';

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function addToBrief(item) {
  const r = toggleBrief(store.get('benchBrief') || [], item);
  if (r.action === 'full') { toast(t('rs.briefFull', { max: 5 }), { tone: 'warn' }); return; }
  if (r.action === 'removed') return; // already in the brief: leave it there
  store.set('benchBrief', r.list, { session: true });
  toast(t('rs.briefAdded'), { tone: 'primary' });
}

function render(params, ctx) {
  loadCss('page-judgment.css'); loadCss('page-citation-check.css');
  ctx.setBreadcrumb([{ label: t('nav.judgments'), href: '#/research' }, { label: t('cc.title') }]);
  let seq = 0;
  const box = input({ name: 'citation', placeholder: '(2010) 11 SCC 441', autocomplete: 'off', value: ctx.query.get('c') || '' });
  const out = h('div', { class: 'cc-out', 'aria-live': 'polite' });
  const pastEl = h('div', { class: 'cc-past' });

  function paintPast() {
    clear(pastEl);
    const list = store.get(KEY) || [];
    if (!list.length) return;
    pastEl.append(h('h2', { class: 'g-section__title' }, t('cc.past')),
      h('div', { class: 'cc-chips' }, ...list.map((e) => h('button', { type: 'button', class: 'cc-sample', onClick: () => { box.value = e.q; run(); } }, e.q))),
      h('p', { class: 'rs-note' }, t('cc.pastNote')));
  }

  function resultView(res, q) {
    const r = interpretResult(res, q);
    const c = r.caseData;
    const checkItems = r.checks.map((k) => ({
      label: t(`cc.chk.${k.id}`),
      state: k.state,
      detail: k.id === 'format' ? (k.detail ? t('cc.fmtOk', { f: k.detail }) : t('cc.fmtUnknown'))
        : k.id === 'treatment' ? (k.state === 'fail' ? t('cc.treat.overruled') : k.state === 'pending' ? t('cc.treat.dist') : k.state === 'pass' ? t('jr.st.none') : t('cc.notChecked'))
        : k.id === 'quote' ? t('cc.later') : undefined,
    }));
    if (r.outcome === 'notfound') {
      return card({ title: t('cc.notFoundTitle') },
        h('p', {}, t('cc.notFoundMsg', { q })),
        h('p', { class: 'rs-note' }, t('cc.notFoundHint')),
        checkList(checkItems),
        button({ label: t('cc.searchInstead'), variant: 'secondary', href: `#/research?q=${encodeURIComponent(q)}` }));
    }
    const row = { ...c, is_curated: c.is_curated === true, source_pdf_url: c.source_pdf_url };
    const v = honestView({ ...row, precedent_status: c.precedent_status });
    const cite = citationText({ title: c.title, citation: c.citation, court: c.court, judgment_date: c.date || c.judgment_date }, formatDate);
    const lead = r.outcome === 'overruled'
      ? banner({ tone: 'danger', message: r.overruledBy ? t('cc.overruledBy', { by: r.overruledBy }) : t('cc.overruled') })
      : r.outcome === 'distinguished' ? banner({ tone: 'warn', message: t('cc.distinguished') })
      : banner({ tone: 'info', message: t('cc.foundNote') });
    return card({ title: c.title || t('jr.untitled'), class: `cc-card cc-card--${r.outcome}` },
      lead,
      h('div', { class: 'jr-chips' }, statusChip(c.precedent_status, v.curated), v.curated ? chip({ label: t('jr.curated'), tone: 'info' }) : null),
      metaList([
        [t('jr.court'), c.court], [t('jr.bench'), c.bench], [t('jr.coram'), c.judges], [t('jr.date'), (c.date || c.judgment_date) && formatDate(c.date || c.judgment_date)],
        [v.cite ? (v.cite.label === 'CNR' ? t('jr.cnr') : t('jr.citation')) : '', v.cite && v.cite.value],
        [t('jr.statutes'), c.statutes], [t('jr.ratio'), v.curated ? v.ratio : ''],
      ]),
      !v.curated ? h('p', { class: 'rs-note' }, t('jr.metadataNote')) : null,
      h('h3', { class: 'rs-h' }, t('cc.checks')), checkList(checkItems),
      h('div', { class: 'rs-res__act' },
        c.id != null ? button({ label: t('cc.openJudgment'), variant: 'primary', href: `#/judgments/${encodeURIComponent(c.id)}` }) : null,
        r.overruledBy ? button({ label: t('cc.openOverruling'), variant: 'secondary', href: `#/research?q=${encodeURIComponent(r.overruledBy)}` }) : null,
        c.id != null ? button({ label: t('cc.addBrief'), variant: 'secondary', onClick: () => addToBrief(briefItem(c)) }) : null,
        c.id != null && ctx.can('DRAFT_FULL') ? button({ label: t('cc.startDraft'), variant: 'secondary', icon: 'edit', href: '#/drafts/new', onClick: () => {
          const ho = draftHandoff([briefItem(c)], store.get('intakeParams'));
          if (ho) store.set('intakeParams', ho, { session: true });
        } }) : null,
        c.source_pdf_url ? button({ label: t('cc.openPdf'), variant: 'secondary', icon: 'external', href: c.source_pdf_url }) : null,
        button({ label: t('jd.copyCite'), variant: 'secondary', icon: 'copy', onClick: () => copyText(cite) })));
  }

  // ---- second tab: check a document ----
  const docOut = h('div', { class: 'cc-out', 'aria-live': 'polite' });
  const docText = textarea({ name: 'doctext', rows: 8 });
  const docFile = input({ type: 'file', name: 'docfile', accept: DOC_ACCEPT });
  let docSeq = 0;
  function docResult(rows, note) {
    const s = documentSummary(rows);
    const tone = { overruled: 'danger', distinguished: 'warn', found: 'info', notfound: 'neutral', unknown: 'neutral' };
    const noteEl = note ? h('p', { class: 'rs-note' }, note) : null;
    if (!rows.length) return card({}, noteEl, h('p', {}, t('cc.doc.none')));
    return card({ title: t('cc.doc.summary', s) }, noteEl, table({
      caption: t('cc.doc.summary', s),
      columns: [
        { key: 'citation', label: t('cc.doc.col.citation') },
        { key: 'verdict', label: t('cc.doc.col.verdict'), render: (r) => chip({ label: t(`cc.doc.v.${r.verdict}`), tone: tone[r.verdict] || 'neutral', icon: r.verdict === 'overruled' ? 'alert' : undefined }) },
        { key: 'matchedTitle', label: t('cc.doc.col.match'), render: (r) => (r.id != null ? h('a', { href: `#/judgments/${encodeURIComponent(r.id)}` }, r.matchedTitle || t('cc.doc.openJudgment')) : (r.matchedTitle || t('cc.doc.noMatch'))) },
        { key: 'actions', label: t('cc.doc.col.actions'), render: (r) => h('div', { class: 'rs-res__act' },
          r.id != null ? button({ label: t('cc.doc.addBrief'), variant: 'ghost', onClick: () => addToBrief(briefItemFromRow(r)) }) : null,
          r.pdf ? button({ label: t('cc.doc.openPdf'), variant: 'ghost', icon: 'external', href: r.pdf }) : null) },
      ],
      rows,
    }), button({ label: t('cc.doc.exportCsv'), variant: 'secondary', icon: 'download', onClick: () => saveBlob(new Blob([documentCsv(rows)], { type: 'text/csv;charset=utf-8' }), 'gyanam_citation_check.csv') }));
  }
  async function runDoc() {
    const file = docFile.files && docFile.files[0];
    const text = docText.value.trim();
    if (!file && !text) { toast(t('cc.doc.needInput'), { tone: 'warn' }); docText.focus(); return; }
    if (file && !isSupportedDoc(file.name)) { toast(t('cc.doc.unsupported'), { tone: 'warn' }); return; }
    const canUpload = ctx.can('UPLOAD_PLEADING');
    if (file && !isTextFile(file.name) && !canUpload) { clear(docOut); docOut.append(banner({ tone: 'warn', message: t('cc.doc.textOnly') })); return; }
    const my = ++docSeq;
    clear(docOut); docOut.append(skeleton({ lines: 5 }));
    try {
      let rows; let note = '';
      if (file && !isTextFile(file.name)) {
        const doc = await api.documents.create({ file, docType: 'OTHER' });
        rows = documentCitationRows(doc && doc.extraction ? doc.extraction : doc);
        note = t('cc.doc.uploaded');
      } else {
        const body = file ? await file.text() : text;
        rows = documentCitationRows(await api.verifyCitations(body));
      }
      if (my !== docSeq) return;
      clear(docOut); docOut.append(docResult(rows, note));
    } catch (e) {
      if (my !== docSeq) return;
      clear(docOut); docOut.append(errorState({ message: e?.message || t('cc.doc.failed'), requestId: e?.requestId, onRetry: runDoc, retryLabel: t('jr.retry') }));
    }
  }
  const docForm = h('form', { class: 'cc-form', onSubmit: (e) => { e.preventDefault(); runDoc(); } },
    h('p', { class: 'rs-note' }, t('cc.doc.lede')),
    ctx.can('UPLOAD_PLEADING') ? null : banner({ tone: 'info', message: t('cc.doc.textOnly') }),
    field({ label: t('cc.doc.text'), input: docText }),
    field({ label: t('cc.doc.file'), input: docFile }),
    button({ label: t('cc.doc.run'), variant: 'primary', type: 'submit', icon: 'check' }));

  async function run() {
    const q = normalizeInput(box.value);
    if (!q) { box.focus(); return; }
    const my = ++seq;
    clear(out); out.append(skeleton({ lines: 5 }));
    try {
      const res = await api.verifySingleCitation(q);
      if (my !== seq) return;
      clear(out); out.append(resultView(res, q));
      store.set(KEY, addPast(store.get(KEY), { q, outcome: interpretResult(res, q).outcome }), { session: true });
      paintPast();
    } catch (e) {
      if (my !== seq) return;
      clear(out);
      out.append(errorState({ message: e?.message, requestId: e?.requestId, onRetry: run, retryLabel: t('jr.retry') }));
    }
  }

  const form = h('form', { class: 'cc-form', onSubmit: (e) => { e.preventDefault(); run(); } },
    field({ label: t('cc.label'), input: box, hint: t('cc.hint') }),
    button({ label: t('cc.submit'), variant: 'primary', type: 'submit', icon: 'check' }));
  const singleCard = card({}, form,
    h('div', { class: 'cc-try' }, h('span', { class: 'rs-note' }, t('cc.benchmarks')),
      h('div', { class: 'cc-chips' }, ...SAMPLES.map((s) => h('button', { type: 'button', class: 'cc-sample', onClick: () => { box.value = s; run(); } }, sampleLabel(s))))));
  const singlePane = h('div', { class: 'cc-pane' }, singleCard, out, pastEl);
  const docPane = h('div', { class: 'cc-pane' }, card({}, docForm), docOut);
  const pane = h('div', { role: 'tabpanel' });
  const startTab = ctx.query.get('tab') === 'doc' ? 'doc' : 'single';
  const tb = tabs({ items: [{ id: 'single', label: t('cc.tab.single') }, { id: 'doc', label: t('cc.tab.doc') }], active: startTab, label: t('cc.tabs'), onChange: (id) => paintPane(id) });
  function paintPane(id) { clear(pane); pane.setAttribute('aria-labelledby', tb.tabId(id)); pane.append(id === 'doc' ? docPane : singlePane); }
  const root = h('div', { class: 'g-page g-page--narrow cc' },
    h('header', { class: 'g-page__head' }, h('div', {}, h('h1', { class: 'g-page__title' }, t('cc.title')), h('p', { class: 'g-page__lede' }, t('cc.lede')))),
    tb, pane);
  paintPane(startTab);
  paintPast();
  if (box.value) run();
  return root;
}

export default { route: '/judgments/check', title: 'Check a citation', permission: 'VERIFY_CITATION', render, onLeave() {} };
