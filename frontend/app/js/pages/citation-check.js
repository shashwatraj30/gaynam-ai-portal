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
import { field, input } from '../ui/form.js';
import { checkList } from '../ui/check-list.js';
import { skeleton } from '../ui/skeleton.js';
import { errorState } from '../ui/error-state.js';
import { banner } from '../ui/banner.js';
import { SAMPLES, interpretResult, normalizeInput, addPast } from './lib/citation-check-logic.js';
import { honestView, citationText } from './lib/judgment-logic.js';
import { statusChip, metaList, copyText } from './lib/judgment-ui.js';

const KEY = 'citationChecks';

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
        button({ label: t('jd.copyCite'), variant: 'secondary', icon: 'copy', onClick: () => copyText(cite) })));
  }

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
  const root = h('div', { class: 'g-page g-page--narrow cc' },
    h('header', { class: 'g-page__head' }, h('div', {}, h('h1', { class: 'g-page__title' }, t('cc.title')), h('p', { class: 'g-page__lede' }, t('cc.lede')))),
    card({}, form,
      h('div', { class: 'cc-try' }, h('span', { class: 'rs-note' }, t('cc.try')),
        h('div', { class: 'cc-chips' }, ...SAMPLES.map((s) => h('button', { type: 'button', class: 'cc-sample', onClick: () => { box.value = s; run(); } }, s))))),
    out, pastEl);
  paintPast();
  if (box.value) run();
  return root;
}

export default { route: '/judgments/check', title: 'Check a citation', permission: 'VERIFY_CITATION', render, onLeave() {} };
