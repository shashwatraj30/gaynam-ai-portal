// Research page: past + saved questions (left), ranked authorities (middle), source panel (right) + bench-brief tray.
// API: api.search(body) -> {query,count,total,offset,filters_relaxed,results[]}; api.courts(); api.savedSearches.*; api.judgment(id).
// The query and filters live in the URL (?q=&court=&status=&judge=&yf=&yt=&sort=) so searches are shareable.
// Hand-off: store 'benchBrief' (array of {id,title,citation,court,ratio,curated,status}); 'intakeParams' (only if none exist) on "Use in draft";
// store 'researchHistory' (session).
import { h, clear, icon } from '../dom.js';
import { t } from '../i18n/index.js';
import '../i18n/pages/research.en.js';
import '../i18n/pages/research.hi.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { loadCss } from '../ui/shell.js';
import { formatDate, formatNumber } from '../format.js';
import { chip } from '../ui/chip.js';
import { button } from '../ui/button.js';
import { card } from '../ui/card.js';
import { field, input, select } from '../ui/form.js';
import { checkList } from '../ui/check-list.js';
import { sourcePanel } from '../ui/source-panel.js';
import { skeleton } from '../ui/skeleton.js';
import { emptyState } from '../ui/empty-state.js';
import { errorState } from '../ui/error-state.js';
import { banner } from '../ui/banner.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import {
  STATUS_FILTERS, SORTS, CHIPS, emptyFilters, activeFilterCount, buildSearchBody, filterResults, orderResults, addHistory, groupHistory,
  queryToFilters, filtersToQuery, courtOptions, mergePage, hasMore, resultsCsv, savedSearchBody, savedSearchHref, draftHandoff, draftTarget, sortLabelKey,
} from './lib/research-logic.js';
import { honestView, snippet, briefItem, toggleBrief, inBrief, BRIEF_MAX } from './lib/judgment-logic.js';
import { statusChip, metaList } from './lib/judgment-ui.js';

const HKEY = 'researchHistory';

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function render(params, ctx) {
  loadCss('page-judgment.css'); loadCss('page-research.css');
  ctx.setBreadcrumb([{ label: t('nav.research') }]);
  const init = queryToFilters(ctx.query);
  const S = { q: init.q, filters: init.filters, raw: [], total: null, relaxed: false, status: 'idle', error: null, selected: null, seq: 0, more: false, saved: null };

  const qInput = input({ type: 'search', name: 'q', value: S.q, placeholder: t('rs.placeholder'), 'aria-label': t('rs.askLabel') });
  const left = h('aside', { class: 'rs-left', 'aria-label': t('rs.past') });
  const resultsEl = h('div', { class: 'rs-results', 'aria-live': 'polite' });
  const countEl = h('p', { class: 'rs-count' });
  const toolsEl = h('div', { class: 'rs-tools' });
  const moreEl = h('div', { class: 'rs-more' });
  const rightEl = h('div', { class: 'rs-right' });
  const trayEl = h('div', { class: 'rs-tray' });

  // ---- filters ----
  const fCourt = select({ name: 'court', options: courtOptions(null, t('rs.allCourts')) });
  const fStatus = select({ name: 'status', options: STATUS_FILTERS.map((s) => ({ value: s, label: t(`rs.status.${s}`) })) });
  const fJudge = input({ name: 'judge' });
  const fFrom = input({ name: 'yf', type: 'number', min: '1950', max: '2100', inputmode: 'numeric' });
  const fTo = input({ name: 'yt', type: 'number', min: '1950', max: '2100', inputmode: 'numeric' });
  const fSecs = input({ name: 'secs', placeholder: '302, 34, 498A' });
  const fSort = select({ name: 'sort', options: SORTS.map((s) => ({ value: s, label: t(sortLabelKey(s)) })) });
  const filterBox = h('div', { class: 'rs-filters' },
    field({ label: t('rs.f.court'), input: fCourt }), field({ label: t('rs.f.status'), input: fStatus }),
    field({ label: t('rs.f.judge'), input: fJudge }), field({ label: t('rs.f.yearFrom'), input: fFrom }),
    field({ label: t('rs.f.yearTo'), input: fTo }), field({ label: t('rs.f.sections'), input: fSecs, hint: t('rs.f.sectionsHint') }));
  const filterBtn = button({ label: t('rs.filters'), variant: 'secondary', icon: 'settings', onClick: () => {
    filterBox.hidden = !filterBox.hidden; filterBtn.setAttribute('aria-expanded', String(!filterBox.hidden));
  } });
  const readFilters = () => ({ court: fCourt.value, status: fStatus.value, judge: fJudge.value, yearFrom: fFrom.value, yearTo: fTo.value, sections: fSecs.value, sort: fSort.value });
  function setCourt(value) {
    if (value && value !== 'ALL' && ![...fCourt.options].some((o) => o.value === value)) fCourt.append(h('option', { value }, value));
    fCourt.value = value || 'ALL';
  }
  function setFilterControls(f) {
    setCourt(f.court); fStatus.value = f.status; fJudge.value = f.judge; fFrom.value = f.yearFrom; fTo.value = f.yearTo; fSecs.value = f.sections; fSort.value = f.sort;
  }
  setFilterControls(S.filters);
  filterBox.hidden = activeFilterCount(S.filters) === 0;
  filterBtn.setAttribute('aria-expanded', String(!filterBox.hidden));
  fSort.addEventListener('change', () => { if (S.status === 'data') run(); });
  // Courts and counts come from the corpus; the static list stays when the call fails.
  api.courts().then((resp) => {
    const keep = fCourt.value;
    clear(fCourt);
    for (const o of courtOptions(resp, t('rs.allCourts'), formatNumber)) fCourt.append(h('option', { value: o.value }, o.label));
    setCourt(keep);
  }).catch(() => {});

  // ---- left: past + saved questions ----
  async function loadSaved() {
    try { const r = await api.savedSearches.list(); S.saved = Array.isArray(r?.items) ? r.items : []; } catch { S.saved = false; }
    paintLeft();
  }
  async function deleteSaved(item) {
    try { await api.savedSearches.remove(item.id); toast(t('rs.savedDeleted'), { tone: 'primary' }); } catch (e) { toast(e?.message || t('rs.saveFailed'), { tone: 'danger' }); }
    loadSaved();
  }
  function openSaved(item) {
    const parsed = queryToFilters(savedSearchHref(item).split('?')[1] || '');
    qInput.value = parsed.q; setFilterControls(parsed.filters); filterBox.hidden = activeFilterCount(parsed.filters) === 0; run();
  }
  function paintLeft() {
    clear(left);
    const hist = store.get(HKEY) || [];
    left.append(button({ label: t('rs.new'), variant: 'primary', icon: 'edit', onClick: () => {
      S.q = ''; qInput.value = ''; S.raw = []; S.total = null; S.status = 'idle'; S.selected = null; setFilterControls(emptyFilters()); syncUrl(); paintAll(); qInput.focus();
    } }));
    left.append(h('h2', { class: 'rs-h' }, t('rs.savedTitle')));
    if (S.saved === false) left.append(h('p', { class: 'rs-note' }, t('rs.savedLoadFailed')));
    else if (S.saved && S.saved.length) {
      left.append(h('ul', { class: 'rs-hist' }, ...S.saved.map((it) => h('li', { class: 'rs-saved' },
        h('button', { type: 'button', class: 'rs-hist__btn', 'aria-label': t('rs.savedOpen', { name: it.name }), onClick: () => openSaved(it) },
          h('span', { class: 'rs-hist__q' }, it.name), h('span', { class: 'rs-hist__m' }, it.query)),
        h('button', { type: 'button', class: 'rs-x', 'aria-label': t('rs.savedDelete', { name: it.name }), onClick: () => deleteSaved(it) }, icon('x', 14))))));
    } else left.append(h('p', { class: 'rs-note' }, S.saved ? t('rs.savedEmpty') : ''));
    left.append(h('h2', { class: 'rs-h' }, t('rs.past')));
    left.append(h('p', { class: 'rs-note' }, t('rs.pastNote')));
    if (!hist.length) { left.append(h('p', { class: 'rs-note' }, t('rs.pastEmpty'))); return; }
    const g = groupHistory(hist);
    for (const [key, list] of Object.entries(g)) {
      if (!list.length) continue;
      left.append(h('h3', { class: 'rs-grp' }, t(`rs.grp.${key}`)),
        h('ul', { class: 'rs-hist' }, ...list.map((e) => h('li', {},
          h('button', { type: 'button', class: 'rs-hist__btn', onClick: () => { S.q = e.q; qInput.value = e.q; run(); } },
            h('span', { class: 'rs-hist__q' }, e.q),
            e.count != null ? h('span', { class: 'rs-hist__m' }, t('rs.nFound', { n: formatNumber(e.count) })) : null)))));
    }
    left.append(button({ label: t('rs.clearHist'), variant: 'ghost', onClick: () => { store.set(HKEY, [], { session: true }); paintLeft(); } }));
  }

  // ---- bench brief tray ----
  function useInDraft() {
    const brief = store.get('benchBrief') || [];
    const ho = draftHandoff(brief, store.get('intakeParams'));
    if (ho) { store.set('intakeParams', ho, { session: true }); toast(t('rs.briefHandoff'), { tone: 'primary' }); }
  }
  function paintTray() {
    clear(trayEl);
    const list = store.get('benchBrief') || [];
    trayEl.append(card({ title: t('rs.brief', { n: list.length, max: BRIEF_MAX }) },
      list.length
        ? h('ul', { class: 'rs-brief' }, ...list.map((c) => h('li', {},
          h('span', { class: 'rs-brief__t' }, c.title, c.citation ? h('span', { class: 'rs-brief__c' }, ` ${c.citation}`) : null),
          h('button', { type: 'button', class: 'rs-x', 'aria-label': t('rs.removeBrief', { title: c.title }), onClick: () => setBrief(toggleBrief(list, c).list) }, icon('x', 14)))))
        : h('p', { class: 'rs-note' }, t('rs.briefEmpty')),
      list.length ? h('div', { class: 'rs-brief__act' },
        button({ label: t('rs.clearBrief'), variant: 'ghost', onClick: () => setBrief([]) }),
        button({ label: t('rs.useInDraft'), variant: 'secondary', href: draftTarget(ctx.can), onClick: useInDraft })) : null));
  }
  function setBrief(list) { store.set('benchBrief', list, { session: true }); paintTray(); paintResults(); paintRight(); }
  function toggle(row) {
    const r = toggleBrief(store.get('benchBrief') || [], briefItem(row));
    if (r.action === 'full') { toast(t('rs.briefFull', { max: BRIEF_MAX }), { tone: 'warn' }); return; }
    setBrief(r.list);
    toast(t(r.action === 'added' ? 'rs.briefAdded' : 'rs.briefRemoved'), { tone: 'primary' });
  }

  // ---- middle: results ----
  const visible = () => orderResults(filterResults(S.raw, S.filters, { relaxed: S.relaxed }), S.filters.sort);
  function resultCard(r) {
    const v = honestView(r);
    const sel = S.selected && S.selected.id === r.id;
    const saved = inBrief(store.get('benchBrief'), r.id);
    const meta = [r.court, r.bench, v.year ? (r.judgment_date ? formatDate(r.judgment_date) : String(v.year)) : null].filter(Boolean).join(' · ');
    return h('article', { class: `rs-res${sel ? ' rs-res--on' : ''}${v.overruled ? ' rs-res--bad' : ''}`, 'aria-labelledby': `rs-t-${r.id}` },
      h('div', { class: 'rs-res__top' },
        statusChip(r.precedent_status, v.curated),
        v.curated ? chip({ label: t('jr.curated'), tone: 'info' }) : null,
        r.bench_label ? chip({ label: r.bench_label, tone: 'neutral' }) : null,
        r.district ? chip({ label: t('rs.district', { d: r.district }), tone: 'neutral' }) : null),
      h('h3', { class: 'rs-res__title', id: `rs-t-${r.id}` },
        h('button', { type: 'button', class: 'rs-res__sel', 'aria-pressed': sel ? 'true' : 'false', onClick: () => selectResult(r) }, r.title || t('jr.untitled'))),
      h('p', { class: 'rs-res__meta' }, meta),
      h('p', { class: 'rs-res__cite' },
        v.cite ? `${v.cite.label === 'CNR' ? t('jr.cnr') : t('jr.citation')}: ${v.cite.value}` : null,
        v.curated && v.citedCount != null ? ` · ${t('jr.citedN', { n: formatNumber(v.citedCount) })}` : null),
      v.overruled ? h('p', { class: 'rs-warn', role: 'note' }, icon('alert', 16), ' ', v.overruledBy ? t('jr.overruledBy', { by: v.overruledBy }) : t('jr.overruledNoBy')) : null,
      v.curated && v.ratio ? h('p', { class: 'rs-res__ratio' }, snippet(v.ratio)) : metaList([
        [t('jr.coram'), r.judges], [t('jr.disposition'), v.disposition], [t('jr.statutes'), r.statutes_considered && snippet(r.statutes_considered, 120)],
      ], 'jr-meta jr-meta--inline'),
      h('div', { class: 'rs-res__act' },
        button({ label: saved ? t('rs.inBrief') : t('rs.addBrief'), variant: saved ? 'primary' : 'secondary', icon: saved ? 'check' : undefined, onClick: () => toggle(r) }),
        button({ label: t('rs.openReader'), variant: 'ghost', href: `#/judgments/${encodeURIComponent(r.id)}` })));
  }
  function exportCsv() {
    saveBlob(new Blob([resultsCsv(visible())], { type: 'text/csv;charset=utf-8' }), 'gyanam_research_results.csv');
    toast(t('rs.exported'), { tone: 'primary' });
  }
  function paintTools() {
    clear(toolsEl);
    const items = [
      field({ label: t('rs.sortLabel'), input: fSort }),
      button({ label: t('rs.saveSearch'), variant: 'secondary', icon: 'book', onClick: openSaveModal }),
    ];
    if (S.status === 'data' && S.raw.length) items.push(button({ label: t('rs.exportCsv'), variant: 'secondary', icon: 'download', onClick: exportCsv }));
    toolsEl.append(...items);
  }
  function paintResults() {
    clear(resultsEl); clear(countEl); clear(moreEl);
    paintTools();
    if (S.status === 'idle') {
      resultsEl.append(emptyState({ title: t('rs.idleTitle'), message: t('rs.idleMsg') }));
      return;
    }
    if (S.status === 'loading') { resultsEl.append(skeleton({ lines: 6 })); return; }
    if (S.status === 'error') {
      resultsEl.append(errorState({ message: S.error?.message, requestId: S.error?.requestId, onRetry: () => run(), retryLabel: t('jr.retry') }));
      return;
    }
    const list = visible();
    const n = activeFilterCount(S.filters);
    countEl.textContent = (S.total != null ? t('rs.total', { shown: formatNumber(list.length), total: formatNumber(S.total) }) : t('rs.totalUnknown', { shown: formatNumber(list.length) })) + (n && !S.relaxed ? ` ${t('rs.filtered', { n })}` : '');
    if (S.relaxed) resultsEl.append(banner({ tone: 'warn', message: t('rs.relaxed') }));
    if (!list.length) {
      resultsEl.append(emptyState({ title: t('rs.noneTitle'), message: S.raw.length ? t('rs.noneFiltered') : t('rs.noneMsg') }));
      return;
    }
    resultsEl.append(...list.map(resultCard));
    if (S.more) moreEl.append(button({ label: S.loadingMore ? t('rs.loadingMore') : t('rs.loadMore'), variant: 'secondary', disabled: S.loadingMore, onClick: loadMore }));
  }

  // ---- right: source panel ----
  let detail = null; let detailSeq = 0;
  async function selectResult(r) {
    S.selected = r; detail = null; paintResults(); paintRight();
    const my = ++detailSeq;
    try { const d = await api.judgment(r.id); if (my === detailSeq) { detail = d; paintRight(); } } catch { if (my === detailSeq) { detail = { _failed: true }; paintRight(); } }
  }
  function paintRight() {
    clear(rightEl);
    const r = S.selected;
    if (!r) { rightEl.append(card({ title: t('rs.sourceTitle') }, h('p', { class: 'rs-note' }, t('rs.sourceEmpty')))); return; }
    const row = detail && !detail._failed ? { ...r, ...detail } : r;
    const v = honestView(row);
    const checks = [
      { label: t('rs.chk.found'), state: 'pass' },
      { label: t('rs.chk.overruled'), state: v.overruled ? 'fail' : 'pass', detail: v.overruled ? (v.overruledBy ? t('jr.overruledBy', { by: v.overruledBy }) : t('jr.overruledNoBy')) : t('jr.st.none') },
      { label: t('rs.chk.quote'), state: 'unchecked', detail: t('rs.chk.later') },
    ];
    const body = h('div', { class: 'rs-src' },
      h('div', { class: 'rs-res__top' }, statusChip(row.precedent_status, v.curated), v.curated ? chip({ label: t('jr.curated'), tone: 'info' }) : null),
      metaList([
        [t('jr.court'), row.court], [t('jr.district'), row.district], [t('jr.bench'), row.bench], [t('jr.coram'), row.judges],
        [t('jr.date'), row.judgment_date && formatDate(row.judgment_date)],
        [v.cite ? (v.cite.label === 'CNR' ? t('jr.cnr') : t('jr.citation')) : '', v.cite && v.cite.value],
        [t('jr.disposition'), !v.curated && v.disposition],
      ]),
      v.curated && v.ratio ? h('div', {}, h('h3', { class: 'rs-h' }, t('jr.ratio')), h('p', { class: 'jr-read' }, v.ratio)) : null,
      h('h3', { class: 'rs-h' }, t('rs.checks')), checkList(checks),
      !detail ? skeleton({ lines: 2 }) : null,
      detail && detail._failed ? h('p', { class: 'rs-note' }, t('rs.detailFailed')) : null,
      !v.curated ? h('p', { class: 'rs-note' }, t('jr.metadataNote')) : null,
      h('div', { class: 'rs-res__act' },
        button({ label: t('rs.openReader'), variant: 'primary', href: `#/judgments/${encodeURIComponent(r.id)}` }),
        button({ label: inBrief(store.get('benchBrief'), r.id) ? t('rs.inBrief') : t('rs.addBrief'), variant: 'secondary', onClick: () => toggle(r) })));
    rightEl.append(sourcePanel({ title: r.title || t('jr.untitled'), subtitle: t('rs.sourceSub'), pdfUrl: detail && !detail._failed ? detail.source_pdf_url : null, body }));
  }

  function paintAll() { paintLeft(); paintTray(); paintResults(); paintRight(); }

  // ---- URL sync (replaceState: no re-render, the link stays shareable) ----
  function syncUrl() {
    try {
      const qs = filtersToQuery(S.q, S.filters);
      history.replaceState(history.state, '', `#/research${qs ? `?${qs}` : ''}`);
    } catch { /* ignore */ }
  }

  // ---- save search (name prompt) ----
  function openSaveModal() {
    const q = qInput.value.trim();
    if (!q) { toast(t('rs.saveNeedQuery'), { tone: 'warn' }); qInput.focus(); return; }
    const name = input({ name: 'name', maxlength: '80', value: q.slice(0, 80) });
    const f = field({ label: t('rs.saveName'), input: name, hint: t('rs.saveHint'), required: true });
    let m;
    const save = async () => {
      if (!name.value.trim()) { f.setError(t('rs.saveNeedName')); name.focus(); return; }
      try {
        await api.savedSearches.create(savedSearchBody(name.value, q, readFilters()));
        m.close(); toast(t('rs.saveDone'), { tone: 'primary' }); loadSaved();
      } catch (e) { f.setError(e?.message || t('rs.saveFailed')); }
    };
    const form = h('form', { onSubmit: (e) => { e.preventDefault(); save(); } }, f);
    m = modal({ title: t('rs.saveTitle'), body: form, actions: [
      button({ label: t('rs.saveCancel'), variant: 'ghost', onClick: () => m.close() }),
      button({ label: t('rs.saveConfirm'), variant: 'primary', onClick: save })] });
    m.open();
  }

  async function run() {
    const q = qInput.value.trim();
    if (!q) { qInput.focus(); return; }
    S.q = q; S.filters = readFilters(); S.status = 'loading'; S.selected = null; detail = null; S.raw = []; S.total = null; S.relaxed = false; S.more = false;
    syncUrl();
    const my = ++S.seq;
    paintResults(); paintRight();
    try {
      const data = await api.search(buildSearchBody(q, S.filters, 0));
      if (my !== S.seq) return;
      S.raw = Array.isArray(data?.results) ? data.results : [];
      S.total = Number.isFinite(Number(data?.total)) ? Number(data.total) : null;
      S.relaxed = data?.filters_relaxed === true;
      S.more = hasMore(S.raw.length, S.total);
      S.status = 'data';
      store.set(HKEY, addHistory(store.get(HKEY), { q, count: S.total ?? S.raw.length }), { session: true });
      paintAll();
    } catch (e) {
      if (my !== S.seq) return;
      S.error = e; S.status = 'error'; paintResults();
    }
  }
  async function loadMore() {
    if (S.loadingMore) return;
    S.loadingMore = true; paintResults();
    const my = S.seq;
    try {
      const data = await api.search(buildSearchBody(S.q, S.filters, S.raw.length));
      if (my !== S.seq) return;
      const page = Array.isArray(data?.results) ? data.results : [];
      const before = S.raw.length;
      S.raw = mergePage(S.raw, page);
      S.more = page.length > 0 && S.raw.length > before && hasMore(S.raw.length, S.total);
    } catch (e) { toast(e?.message || t('rs.loadMoreFailed'), { tone: 'danger' }); }
    S.loadingMore = false; paintResults();
  }

  const form = h('form', { class: 'rs-ask', role: 'search', onSubmit: (e) => { e.preventDefault(); run(); } },
    h('div', { class: 'rs-ask__row' }, field({ label: t('rs.askLabel'), input: qInput }),
      button({ label: t('rs.search'), variant: 'primary', icon: 'search', type: 'submit' }), filterBtn), filterBox,
    h('div', { class: 'rs-chips', role: 'group', 'aria-label': t('rs.chipsLabel') },
      ...CHIPS.map((c) => h('button', { type: 'button', class: 'rs-chip', title: c.q, onClick: () => { qInput.value = c.q; run(); } }, c.label))));

  const root = h('div', { class: 'g-page rs' },
    h('header', { class: 'g-page__head' }, h('div', {}, h('h1', { class: 'g-page__title' }, t('rs.title')), h('p', { class: 'g-page__lede' }, t('rs.lede')))),
    h('div', { class: 'rs-cols' },
      left,
      h('section', { class: 'rs-mid', 'aria-label': t('rs.resultsLabel') }, form, toolsEl, countEl, resultsEl, moreEl),
      h('div', { class: 'rs-side' }, rightEl, trayEl)));
  paintAll();
  loadSaved();
  if (S.q) run();
  return root;
}

export default { route: '/research', title: 'Research', permission: 'SEARCH', render, onLeave() {} };
