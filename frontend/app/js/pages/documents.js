// Documents library (#/documents): upload FIRs, pleadings and case documents, then browse them.
// API: api.documents.create({file|text|sample, docType, title, matterKey}, {signal}) -> Document; api.documents.list(params) -> {items, total}.
// The filter bar is driven by the URL query (?q=&type=&status=&matter=) so links are shareable.
import { h, clear } from '../dom.js';
import { t, addMessages } from '../i18n/index.js';
import en from '../i18n/pages/documents.en.js';
import hi from '../i18n/pages/documents.hi.js';
import { api } from '../api.js';
import { loadCss } from '../ui/shell.js';
import { formatDate, formatNumber } from '../format.js';
import { chip } from '../ui/chip.js';
import { button } from '../ui/button.js';
import { field, input, select, textarea } from '../ui/form.js';
import { skeleton } from '../ui/skeleton.js';
import { emptyState } from '../ui/empty-state.js';
import { errorState } from '../ui/error-state.js';
import { toast } from '../ui/toast.js';
import { confirmDialog } from '../ui/confirm.js';
import {
  DOC_TYPES, STATUSES, SAMPLES, ACCEPT, PAGE_SIZE, humanSize, validateUpload, createErrorKey,
  parseListQuery, buildQueryString, buildListParams, hasFilters, rowView, mergePage,
} from './lib/documents-logic.js';

addMessages('en', en);
addMessages('hi', hi);

function render(params, ctx) {
  loadCss('page-research.css'); loadCss('page-documents.css');
  ctx.setBreadcrumb([{ label: t('nav.documents') }]);
  const U = { mode: 'file', file: null, busy: false, ctrl: null };
  const L = { filters: parseListQuery(ctx.query), items: [], total: 0, status: 'loading', error: null, seq: 0 };

  // ---------------- upload card ----------------
  const fileInput = h('input', { type: 'file', accept: ACCEPT, class: 'dc-file', tabindex: '-1', 'aria-hidden': 'true' });
  const fileMsg = h('p', { class: 'dc-drop__file', 'aria-live': 'polite' });
  const chooseBtn = button({ label: t('docs.choose'), variant: 'secondary', icon: 'upload', onClick: () => fileInput.click() });
  const clearBtn = button({ label: t('docs.clearFile'), variant: 'ghost', onClick: () => setFile(null) });
  const drop = h('div', { class: 'dc-drop' },
    h('p', { class: 'dc-drop__t' }, t('docs.drop')),
    h('p', { class: 'dc-drop__h' }, t('docs.dropHint')),
    h('div', { class: 'dc-drop__act' }, chooseBtn, clearBtn), fileMsg);
  const text = textarea({ name: 'text', rows: 8, placeholder: t('docs.pastePlaceholder') });
  const textField = field({ label: t('docs.pasteLabel'), input: text });
  const typeSel = select({ name: 'doc_type', options: DOC_TYPES.map((d) => ({ value: d.value, label: t(d.key) })), value: 'OTHER' });
  const titleIn = input({ name: 'title', maxlength: '200' });
  const matterIn = input({ name: 'matter', maxlength: '120' });
  const errEl = h('p', { class: 'dc-err', role: 'alert' });
  const progress = h('div', { class: 'dc-prog', role: 'status', 'aria-live': 'polite' });
  const toggleBtn = button({ label: t('docs.pasteToggle'), variant: 'ghost', onClick: () => { U.mode = U.mode === 'file' ? 'text' : 'file'; errEl.textContent = ''; paintMode(); } });
  const submitBtn = button({ label: t('docs.submit'), variant: 'primary', icon: 'upload', onClick: () => submit({ file: U.file, text: U.mode === 'text' ? text.value : null }) });
  const sampleRow = h('div', { class: 'dc-samples' }, ...SAMPLES.map((s) => button({
    label: t(s.key), variant: 'secondary', onClick: () => submit({ sample: s.sample, docType: s.docType }),
  })));

  function setFile(f) {
    U.file = f; fileInput.value = ''; errEl.textContent = '';
    fileMsg.textContent = f ? t('docs.fileChosen', { name: f.name, size: humanSize(f.size) }) : '';
    clearBtn.hidden = !f;
  }
  function paintMode() {
    const isFile = U.mode === 'file';
    drop.hidden = !isFile; textField.hidden = isFile;
    toggleBtn.textContent = ''; toggleBtn.append(t(isFile ? 'docs.pasteToggle' : 'docs.fileToggle'));
  }
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });
  for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('dc-drop--on'); });
  for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('dc-drop--on'); });
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) setFile(f); });

  function setBusy(on, label) {
    U.busy = on;
    for (const b of [submitBtn, chooseBtn, clearBtn, toggleBtn, ...sampleRow.children]) b.disabled = on;
    for (const c of [typeSel, titleIn, matterIn, text]) c.disabled = on;
    clear(progress);
    if (on) {
      progress.append(h('p', { class: 'dc-prog__t' }, label),
        button({ label: t('docs.cancel'), variant: 'secondary', onClick: () => { if (U.ctrl) U.ctrl.abort(); } }));
    }
  }

  async function submit({ file, text: pasted, sample, docType }) {
    if (U.busy) return;
    const bad = validateUpload({ file, text: pasted, sample });
    if (bad) { errEl.textContent = t(bad); return; }
    errEl.textContent = '';
    U.ctrl = new AbortController();
    setBusy(true, file ? t('docs.reading', { name: file.name }) : sample ? t('docs.readingSample') : t('docs.reading', { name: t('docs.source.pasted') }));
    try {
      const doc = await api.documents.create({
        file: file || undefined, text: pasted || undefined, sample,
        docType: sample ? docType : typeSel.value, title: titleIn.value.trim() || undefined, matterKey: matterIn.value.trim() || undefined,
      }, { signal: U.ctrl.signal });
      toast(t('docs.uploaded'), { tone: 'primary' });
      ctx.navigate(`#/documents/${encodeURIComponent(doc.id)}`);
    } catch (err) {
      const key = createErrorKey(err);
      if (key) errEl.textContent = t(key); else toast(t('docs.cancelled'), { tone: 'info' });
      setBusy(false);
    }
  }

  const uploadCard = h('section', { class: 'dc-up', 'aria-labelledby': 'dc-up-h' },
    h('h2', { class: 'dc-h', id: 'dc-up-h' }, t('docs.upload')),
    fileInput, drop, textField, h('div', {}, toggleBtn),
    h('div', { class: 'dc-up__fields' },
      field({ label: t('docs.typeLabel'), input: typeSel }),
      field({ label: t('docs.titleLabel'), input: titleIn, hint: t('docs.titleHint') }),
      field({ label: t('docs.matterLabel'), input: matterIn, hint: t('docs.matterHint') })),
    errEl, progress,
    h('div', { class: 'dc-up__go' }, submitBtn),
    h('div', { class: 'dc-up__samples' }, h('h3', { class: 'dc-sub' }, t('docs.samples')), sampleRow, h('p', { class: 'dc-note' }, t('docs.sampleNote'))));
  setFile(null); paintMode();

  // ---------------- library ----------------
  const qIn = input({ type: 'search', name: 'q', value: L.filters.q, placeholder: t('docs.searchPlaceholder'), 'aria-label': t('docs.search') });
  const fType = select({ name: 'type', value: L.filters.type, options: [{ value: '', label: t('docs.f.any') }, ...DOC_TYPES.map((d) => ({ value: d.value, label: t(d.key) }))] });
  const fStatus = select({ name: 'status', value: L.filters.status, options: [{ value: '', label: t('docs.f.any') }, ...STATUSES.map((s) => ({ value: s, label: t(`docs.status.${s}`) }))] });
  const fMatter = input({ name: 'matter', value: L.filters.matter, maxlength: '120' });
  const countEl = h('p', { class: 'dc-count', 'aria-live': 'polite' });
  const listEl = h('div', { class: 'dc-list' });
  const moreEl = h('div', { class: 'dc-more' });

  const readFilters = () => ({ q: qIn.value.trim(), type: fType.value, status: fStatus.value, matter: fMatter.value.trim() });
  function applyFilters() {
    L.filters = readFilters();
    const qs = buildQueryString(L.filters);
    history.replaceState(null, '', `#/documents${qs ? `?${qs}` : ''}`);
    load(true);
  }
  let timer = null;
  for (const c of [qIn, fMatter]) c.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(applyFilters, 350); });
  for (const c of [fType, fStatus]) c.addEventListener('change', applyFilters);
  const clearFilters = button({ label: t('docs.f.clear'), variant: 'ghost', onClick: () => {
    qIn.value = ''; fType.value = ''; fStatus.value = ''; fMatter.value = ''; applyFilters();
  } });
  const bar = h('form', { class: 'dc-bar', role: 'search', onSubmit: (e) => { e.preventDefault(); clearTimeout(timer); applyFilters(); } },
    field({ label: t('docs.search'), input: qIn }),
    field({ label: t('docs.f.type'), input: fType }), field({ label: t('docs.f.status'), input: fStatus }),
    field({ label: t('docs.f.matter'), input: fMatter }));

  const errMsg = (e, fallback) => (e && e.message && e.status !== 0 ? e.message : fallback);

  async function deleteRow(doc) {
    if (!(await confirmDialog({ title: t('docs.deleteTitle'), message: t('docs.deleteMsg'), confirmLabel: t('docs.delete'), tone: 'danger' }))) return;
    try {
      await api.documents.remove(doc.id);
      toast(t('docs.deleted'), { tone: 'primary' });
      load(true);
    } catch (e) {
      toast(errMsg(e, t('docs.deleteFailed')), { tone: 'danger' });
    }
  }

  function rowEl(doc) {
    const v = rowView(doc);
    const sizeBits = v.failed || (!v.chars && !v.pages) ? t('docs.noText')
      : [v.pages ? t('docs.pages', { n: formatNumber(v.pages) }) : null, v.chars ? t('docs.chars', { n: formatNumber(v.chars) }) : null].filter(Boolean).join(' · ');
    return h('article', { class: 'dc-row', 'aria-labelledby': `dc-t-${v.id}` },
      h('div', { class: 'dc-row__main' },
        h('h3', { class: 'dc-row__title', id: `dc-t-${v.id}` }, h('a', { href: v.href }, v.title || t('docs.untitled'))),
        h('div', { class: 'dc-row__chips' },
          chip({ label: t(v.typeKey), tone: 'neutral' }), chip({ label: t(v.statusKey), tone: v.statusTone }),
          chip({ label: t(v.sourceKey), tone: v.sourceTone }),
          chip({ label: v.redactions ? t('docs.redactions', { n: formatNumber(v.redactions) }) : t('docs.noRedactions'), tone: 'neutral' }))),
      h('div', { class: 'dc-row__meta' },
        h('span', { class: 'dc-row__size' }, sizeBits),
        v.matter ? h('span', {}, t('docs.matter', { m: v.matter })) : null,
        h('span', {}, [v.by ? t('docs.by', { who: v.by }) : null, v.at ? formatDate(v.at) : null].filter(Boolean).join(' · '))),
      h('div', { class: 'dc-row__act' },
        button({ label: t('docs.delete'), variant: 'danger', onClick: () => deleteRow(doc) })));
  }

  function paint() {
    clear(listEl); clear(moreEl); clear(countEl);
    if (L.status === 'loading') { listEl.append(skeleton({ lines: 4 })); listEl.setAttribute('aria-busy', 'true'); return; }
    listEl.removeAttribute('aria-busy');
    if (L.status === 'error') {
      listEl.append(errorState({ message: t('docs.loadError'), requestId: L.error && L.error.requestId, onRetry: () => load(true) }));
      return;
    }
    countEl.textContent = L.total === 1 ? t('docs.count1') : t('docs.count', { n: formatNumber(L.total) });
    if (!L.items.length) {
      listEl.append(hasFilters(L.filters)
        ? emptyState({ title: t('docs.noMatchTitle'), message: t('docs.noMatchMsg'), action: clearFilters })
        : emptyState({ title: t('docs.emptyTitle'), message: t('docs.emptyMsg') }));
      return;
    }
    for (const d of L.items) listEl.append(rowEl(d));
    if (L.items.length < L.total) moreEl.append(button({ label: t('docs.loadMore'), variant: 'secondary', onClick: () => load(false) }));
  }

  async function load(reset) {
    const seq = ++L.seq;
    if (reset) { L.items = []; L.total = 0; L.status = 'loading'; paint(); }
    try {
      const res = await api.documents.list(buildListParams(buildQueryString(L.filters), { offset: reset ? 0 : L.items.length, limit: PAGE_SIZE }));
      if (seq !== L.seq) return;
      L.items = reset ? (res.items || []) : mergePage(L.items, res.items);
      L.total = Number(res.total) || L.items.length;
      L.status = 'ready';
    } catch (err) {
      if (seq !== L.seq) return;
      L.status = 'error'; L.error = err;
    }
    paint();
  }

  const library = h('section', { class: 'dc-lib', 'aria-labelledby': 'dc-lib-h' },
    h('h2', { class: 'dc-h', id: 'dc-lib-h' }, t('docs.library')), bar, countEl, listEl, moreEl);

  load(true);
  return h('div', { class: 'g-page dc' },
    h('header', { class: 'g-page__head' },
      h('div', {}, h('h1', { class: 'g-page__title' }, t('docs.title')), h('p', { class: 'g-page__lede' }, t('docs.lede')))),
    uploadCard, library);
}

export default { route: '/documents', title: 'Documents', permission: ['UPLOAD_PLEADING', 'DRAFT_FULL'], render, onLeave() {} };
