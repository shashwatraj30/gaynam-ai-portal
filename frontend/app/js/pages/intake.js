// New matter: '/matters/new'. Three steps: 1 add documents (file, drag-drop, or pasted text with Redact),
// 2 check what was read (editable fields; 'Sample data' banner when source is "sample"; honest banner when "failed"),
// 3 confirm issues (human gate #1), then store 'intakeParams' and go to the Studio '/drafts/new'.
// API: api.documents.create (every read document is saved as a Document), saveExtraction (versioned, 409 handled),
// confirm, draftParams; api.ocrAnonymize(text) for the Redact button on pasted text.
import { h, clear } from '../dom.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { t, addMessages } from '../i18n/index.js';
import { formatNumber } from '../format.js';
import { loadCss } from '../ui/shell.js';
import { button } from '../ui/button.js';
import { card } from '../ui/card.js';
import { chip } from '../ui/chip.js';
import { banner } from '../ui/banner.js';
import { stepper } from '../ui/stepper.js';
import { modal } from '../ui/modal.js';
import { skeleton } from '../ui/skeleton.js';
import { field, input, textarea, select } from '../ui/form.js';
import en from '../i18n/pages/intake.en.js';
import hi from '../i18n/pages/intake.hi.js';
import mEn from '../i18n/pages/matters.en.js';
import mHi from '../i18n/pages/matters.hi.js';
import {
  FIELD_KEYS, DOC_TYPES, defaultDocType, validDocType, checkFile, humanSize, extOf, isImageFile, uploadErrorKey,
  normalizeDocument, extractionBody, isConflict, saveErrorKey, mergeDraftParams,
  parseIssues, validateFields, canProceed, buildIntakeParams, sourceNoteKey,
} from './lib/intake-logic.js';
import { ZOOM_STEPS, nextZoom, keyToAction } from './lib/intake-zoom.js';
import { SAMPLE_PLEADING, SAMPLE_DEGRADED } from './lib/intake-samples.js';

addMessages('en', en);
addMessages('hi', hi);
addMessages('en', mEn);
addMessages('hi', mHi);

const MULTILINE = new Set(['facts', 'prayer', 'statutory_provisions', 'petitioner_arguments', 'respondent_arguments']);
const WIDE = new Set(['case_title', 'statutory_provisions', 'facts', 'prayer', 'petitioner_arguments', 'respondent_arguments']);

let cleanup = () => {};

function render(params, ctx) {
  loadCss('page-intake.css');
  const st = {
    step: '1', file: null, previewUrl: '', filename: '', paste: '', pasteRedactions: 0, pasteMsg: '',
    busy: false, error: '', result: null, fields: {}, original: {}, issues: '', edited: false, sampleAck: false, ack: false,
    ctl: null, docType: 'PETITION', matterKey: (ctx.query && ctx.query.get('matter')) || '', saving: false,
  };
  const live = h('p', { class: 'g-sr', role: 'status', 'aria-live': 'polite' });
  const stepHost = h('div', {});
  const view = h('div', { class: 'g-stack g-stack--lg' });
  const heading = h('h1', { class: 'g-page__title' }, t('intake.title'));
  const page = h('section', { class: 'g-page' },
    h('header', { class: 'g-page__head' }, h('div', {}, heading, h('p', { class: 'g-page__lede' }, t('intake.lede')))),
    stepHost, view, live);

  const say = (m) => { live.textContent = ''; setTimeout(() => { live.textContent = m; }, 30); };
  const revoke = () => { if (st.previewUrl) { try { URL.revokeObjectURL(st.previewUrl); } catch { /* ignore */ } st.previewUrl = ''; } };
  cleanup = () => { revoke(); if (st.ctl) st.ctl.abort(); };
  ctx.setBreadcrumb([{ label: t('matters.title'), href: '#/matters' }, { label: t('intake.title') }]);

  function paintSteps() {
    clear(stepHost);
    stepHost.append(stepper({ steps: [
      { id: '1', label: t('intake.step.add') }, { id: '2', label: t('intake.step.check') }, { id: '3', label: t('intake.step.confirm') },
    ], current: st.step }));
  }
  function go(step) {
    st.step = step; paint();
    const hd = view.querySelector('h2'); if (hd) { hd.setAttribute('tabindex', '-1'); hd.focus({ preventScroll: false }); }
  }

  // ---------- reading ----------
  function loaded(res, filename) {
    st.result = res; st.filename = filename;
    st.fields = { ...res.fields }; st.original = { ...res.fields };
    st.issues = parseIssues(res.issues).join('\n');
    st.edited = false; st.sampleAck = false; st.ack = false; st.error = '';
    say(res.failed ? t('intake.failed.banner') : res.isSample ? t('intake.sample.banner') : t('intake.check.title'));
    go('2');
  }
  /** Save the current fields + issues as a new extraction version. Returns true on success. */
  async function persist() {
    const r = st.result;
    try {
      const doc = await api.documents.saveExtraction(r.id, extractionBody(st.fields, st.issues, r.version));
      const n = normalizeDocument(doc);
      r.version = n.version; r.authorities = n.authorities;
      return true;
    } catch (err) {
      if (isConflict(err)) {
        // someone saved a newer version: adopt its version number but keep what the user typed
        try { const n = normalizeDocument(await api.documents.get(r.id)); r.version = n.version; } catch { /* ignore */ }
      }
      const key = saveErrorKey(err);
      st.error = key ? t(key) : '';
      return false;
    }
  }
  async function createDoc(input, filename) {
    st.busy = true; st.error = ''; st.ctl = new AbortController(); paint();
    try {
      const doc = await api.documents.create({ ...input, docType: st.docType, matterKey: st.matterKey || undefined }, { signal: st.ctl.signal });
      st.busy = false;
      loaded(normalizeDocument(doc), filename);
    } catch (err) { fail(err); }
  }
  function fail(err) {
    const key = uploadErrorKey(err);
    st.error = key ? t(key) : '';
    st.busy = false; paint();
  }
  async function readFile(file) {
    const bad = checkFile(file);
    if (bad) { st.error = t(bad); paint(); return; }
    revoke(); st.file = file;
    if (isImageFile(file)) { try { st.previewUrl = URL.createObjectURL(file); } catch { st.previewUrl = ''; } }
    await createDoc({ file }, file.name);
  }
  async function readPasted() {
    const text = st.paste.trim();
    if (!text) { st.error = t('intake.paste.empty'); paint(); return; }
    revoke(); st.file = null;
    await createDoc({ text }, 'pasted_pleading.txt');
  }
  async function readSample(key) {
    revoke(); st.file = null; st.docType = defaultDocType(key);
    await createDoc({ sample: key }, key);
  }
  async function redact(areaEl, btn) {
    const text = areaEl.value.trim();
    if (!text) { st.error = t('intake.paste.empty'); paint(); return; }
    btn.disabled = true;
    try {
      const r = await api.ocrAnonymize(text);
      const n = Number(r && r.total_redactions) || 0;
      st.paste = (r && r.anonymized_text) || text;
      st.pasteRedactions += n;
      st.pasteMsg = n ? t('intake.paste.redacted', { n: formatNumber(n) }) : t('intake.paste.noneFound');
      st.error = ''; say(st.pasteMsg); paint();
    } catch (err) { fail(err); }
  }

  // ---------- step 1 ----------
  function step1() {
    if (st.busy) {
      return card({ title: t('intake.reading', { name: st.file ? st.file.name : 'pasted_pleading.txt' }) },
        h('div', { class: 'g-stack' }, skeleton({ lines: 4 }), h('p', { class: 'in-note' }, t('intake.reading.msg')),
          button({ label: t('intake.cancel'), onClick: () => { if (st.ctl) st.ctl.abort(); st.busy = false; paint(); } })));
    }
    const fileInput = h('input', { type: 'file', class: 'in-file', id: 'in-file', 'aria-label': t('intake.add.choose'),
      accept: '.pdf,.docx,.doc,.txt,.md,.rtf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.bmp,image/*' });
    fileInput.addEventListener('change', () => { if (fileInput.files && fileInput.files[0]) readFile(fileInput.files[0]); });
    const pick = h('span', { class: 'in-pick' }, fileInput, button({ label: t('intake.add.choose'), variant: 'primary', icon: 'upload', onClick: () => fileInput.click() }));
    const title = h('p', { class: 'in-drop__t' }, t('intake.add.drop'));
    const zone = h('div', { class: 'in-drop' }, title, h('p', { class: 'in-note' }, t('intake.add.formats')), pick, h('p', { class: 'in-note' }, t('intake.add.one')));
    const over = (on) => { zone.classList.toggle('in-drop--over', on); title.textContent = on ? t('intake.add.dragging') : t('intake.add.drop'); };
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); over(true); }));
    zone.addEventListener('dragleave', (e) => { if (!e.relatedTarget || !zone.contains(e.relatedTarget)) over(false); });
    zone.addEventListener('drop', (e) => {
      e.preventDefault(); over(false);
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) readFile(f);
    });

    const area = textarea({ rows: 10, name: 'paste', value: st.paste });
    area.value = st.paste;
    area.addEventListener('input', () => { st.paste = area.value; });
    const redactBtn = button({ label: t('intake.paste.redact'), onClick: () => redact(area, redactBtn) });
    const pasteCard = card({ title: t('intake.paste.title') }, h('div', { class: 'g-stack' },
      field({ label: t('intake.paste.label'), input: area, hint: t('intake.paste.hint') }),
      st.pasteMsg ? h('p', { class: 'in-note' }, st.pasteMsg) : null,
      h('div', { class: 'g-page__actions' }, redactBtn, button({ label: t('intake.paste.read'), variant: 'secondary', onClick: readPasted }))));

    const useSample = (text) => { st.paste = text; st.pasteMsg = ''; st.pasteRedactions = 0; st.error = ''; paint(); say(t('intake.sample.loaded')); };
    const samples = h('div', { class: 'in-samples' },
      h('span', { class: 'in-note' }, t('intake.samples.label')),
      button({ label: t('intake.samples.pleading'), variant: 'ghost', onClick: () => useSample(SAMPLE_PLEADING) }),
      button({ label: t('intake.samples.degraded'), variant: 'ghost', onClick: () => useSample(SAMPLE_DEGRADED) }),
      button({ label: t('intake.samples.fir0417'), variant: 'ghost', onClick: () => readSample('fir_04_17') }),
      button({ label: t('intake.samples.fir0617'), variant: 'ghost', onClick: () => readSample('fir_06_17') }));

    const typeSel = select({ name: 'doc_type', value: st.docType, options: DOC_TYPES.map((v) => ({ value: v, label: t(`intake.doctype.${v}`) })) });
    typeSel.addEventListener('change', () => { st.docType = validDocType(typeSel.value); });

    return h('div', { class: 'g-stack' },
      st.error ? banner({ tone: 'danger', message: st.error }) : null,
      h('h2', { class: 'g-section__title' }, t('intake.add.title')),
      st.matterKey ? h('p', { class: 'in-note' }, t('intake.forMatter', { key: st.matterKey })) : null,
      field({ label: t('intake.doctype.label'), input: typeSel, hint: t('intake.doctype.hint') }),
      samples,
      h('div', { class: 'in-two' }, zone, pasteCard));
  }

  // ---------- full-size view (no network: reuses the blob URL) ----------
  function openFullSize() {
    let zoom = ZOOM_STEPS[0];
    const img = h('img', { class: 'in-zoom__img', src: st.previewUrl, alt: t('intake.file.preview') });
    const level = h('span', { class: 'in-zoom__level', role: 'status', 'aria-live': 'polite' });
    const stage = h('div', { class: 'in-zoom__stage', tabindex: '0', role: 'region', 'aria-label': t('intake.zoom.stage') }, img);
    const out = button({ label: t('intake.zoom.out'), onClick: () => apply('out') });
    const inn = button({ label: t('intake.zoom.in'), onClick: () => apply('in') });
    const reset = button({ label: t('intake.zoom.reset'), variant: 'ghost', onClick: () => apply('reset') });
    function apply(action) {
      zoom = nextZoom(zoom, action);
      img.style.width = `${zoom}%`;
      level.textContent = t('intake.zoom.level', { n: zoom });
      out.disabled = zoom <= ZOOM_STEPS[0];
      inn.disabled = zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1];
    }
    const m = modal({ title: t('intake.zoom.title'), body: h('div', { class: 'in-zoom' }, h('div', { class: 'in-zoom__bar' }, out, level, inn, reset), stage),
      onClose: () => {} });
    m.el.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const a = keyToAction(e.key);
      if (a) { e.preventDefault(); apply(a); }
    });
    m.el.classList.add('in-zoom-overlay');
    apply('reset');
    m.open();
  }

  // ---------- step 2 ----------
  function step2() {
    const r = st.result;
    const fieldNodes = {};
    const nodes = FIELD_KEYS.map((k) => {
      const ctrl = MULTILINE.has(k) ? textarea({ rows: k === 'facts' ? 8 : 3, name: k }) : input({ name: k });
      ctrl.value = st.fields[k] || '';
      const f = field({ label: t(`intake.field.${k}`), input: ctrl, required: k === 'case_title' || k === 'facts',
        hint: !st.original[k] ? t('intake.field.notFound') : undefined });
      f.classList.toggle('in-wide', WIDE.has(k));
      ctrl.addEventListener('input', () => {
        st.fields[k] = ctrl.value;
        st.edited = FIELD_KEYS.some((x) => (st.fields[x] || '') !== (st.original[x] || ''));
        f.setError(null); syncGate();
      });
      fieldNodes[k] = f;
      return f;
    });

    const ackBox = h('input', { type: 'checkbox', id: 'in-sample-ack' });
    ackBox.checked = st.sampleAck;
    ackBox.addEventListener('change', () => { st.sampleAck = ackBox.checked; syncGate(); });
    const next = button({ label: t('intake.toConfirm'), variant: 'primary', onClick: async () => {
      const errs = validateFields(st.fields);
      FIELD_KEYS.forEach((k) => fieldNodes[k].setError(errs[k] ? t(errs[k]) : null));
      if (Object.keys(errs).length) { st.error = t('intake.err.fixFields'); errMsg.textContent = st.error; return; }
      if (!canProceed({ isSample: r.isSample, edited: st.edited, acknowledged: st.sampleAck })) return;
      next.disabled = true; errMsg.textContent = '';
      const ok = await persist();
      if (!ok) { errMsg.textContent = st.error; next.disabled = false; return; }
      st.error = ''; go('3');
    } });
    const errMsg = h('p', { class: 'in-err', role: 'alert' });
    function syncGate() {
      const ok = canProceed({ isSample: r.isSample, edited: st.edited, acknowledged: st.sampleAck });
      next.disabled = !ok;
    }
    syncGate();

    const side = h('div', { class: 'in-fileinfo' },
      st.previewUrl ? h('img', { class: 'in-thumb', src: st.previewUrl, alt: t('intake.file.preview') }) : null,
      st.previewUrl ? button({ label: t('intake.zoom.open'), variant: 'secondary', onClick: openFullSize }) : null,
      h('span', { class: 'in-fname' }, st.filename),
      st.file ? h('span', { class: 'in-meta' }, `${(extOf(st.file.name) || 'file').toUpperCase()} · ${humanSize(st.file.size)}`) : null,
      h('div', { class: 'in-chips' },
        chip({ label: r.failed ? t('intake.failed.banner') : r.isSample ? t('intake.sample.banner') : t('intake.read.title'),
          tone: r.failed ? 'danger' : r.isSample ? 'warn' : 'primary', icon: r.isSample || r.failed ? 'alert' : 'check' }),
        r.redactions ? chip({ label: t('intake.redactions', { n: formatNumber(r.redactions) }), tone: 'info' }) : null),
      r.isSample ? null : h('p', { class: 'in-note' }, t(sourceNoteKey(r.source, r.vlm))),
      r.id !== '' ? h('a', { class: 'in-note', href: `#/documents/${encodeURIComponent(r.id)}` }, t('intake.openInDocuments')) : null,
      r.chars ? h('p', { class: 'in-meta' }, t('intake.chars', { n: formatNumber(r.chars) })) : null,
      r.blanked ? h('p', { class: 'in-note' }, t('intake.blanked', { n: formatNumber(r.blanked) })) : null,
      button({ label: t('intake.file.replace'), variant: 'secondary', onClick: () => { revoke(); st.result = null; go('1'); } }));

    return h('div', { class: 'g-stack' },
      r.failed ? banner({ tone: 'danger', message: `${t('intake.failed.banner')}. ${t('intake.failed.detail')}` }) : null,
      r.isSample ? banner({ tone: 'warn', message: `${t('intake.sample.banner')}. ${t('intake.sample.detail')}` }) : null,
      r.sexualOffenceMatter ? banner({ tone: 'warn', message: t('intake.victimWarning') }) : null,
      r.isSample ? h('label', { class: 'in-check', for: 'in-sample-ack' }, ackBox, h('span', {}, t('intake.sample.ack'))) : null,
      h('div', { class: 'in-cols' }, side,
        h('div', { class: 'g-stack' },
          h('div', {}, h('h2', { class: 'g-section__title' }, t('intake.check.title')), h('p', { class: 'g-page__lede' }, t('intake.check.lede'))),
          h('div', { class: 'in-fields' }, ...nodes), errMsg,
          h('div', { class: 'in-nav' }, button({ label: t('intake.back'), onClick: () => go('1') }), next))));
  }

  // ---------- step 3 ----------
  function step3() {
    const area = textarea({ rows: 7, name: 'issues' });
    area.value = st.issues;
    const preview = h('ol', { class: 'in-issues' });
    const errMsg = h('p', { class: 'in-err', role: 'alert' });
    const ackBox = h('input', { type: 'checkbox', id: 'in-ack' });
    ackBox.checked = st.ack;
    function paintPreview() {
      clear(preview);
      parseIssues(st.issues).forEach((x) => preview.append(h('li', {}, x)));
    }
    area.addEventListener('input', () => { st.issues = area.value; errMsg.textContent = ''; paintPreview(); });
    ackBox.addEventListener('change', () => { st.ack = ackBox.checked; errMsg.textContent = ''; });
    paintPreview();
    const goBtn = button({ label: t('intake.confirm.go'), variant: 'primary', onClick: async () => {
      if (!parseIssues(st.issues).length) { errMsg.textContent = t('intake.confirm.needIssue'); area.focus(); return; }
      if (!st.ack) { errMsg.textContent = t('intake.confirm.needAck'); ackBox.focus(); return; }
      const r = st.result;
      goBtn.disabled = true; errMsg.textContent = '';
      try {
        if (!(await persist())) { errMsg.textContent = st.error; goBtn.disabled = false; return; }
        await api.documents.confirm(r.id, r.version);
        const resp = await api.documents.draftParams(r.id);
        const local = buildIntakeParams({ fields: st.fields, issues: st.issues, source: r.source, isSample: r.isSample,
          redactions: r.redactions, filename: st.filename, documentId: r.id, authorities: r.authorities });
        store.set('intakeParams', mergeDraftParams(local, resp), { session: true });
      } catch (err) {
        const key = saveErrorKey(err);
        errMsg.textContent = key ? t(key) : '';
        if (isConflict(err)) { try { r.version = normalizeDocument(await api.documents.get(r.id)).version; } catch { /* ignore */ } }
        goBtn.disabled = false; return;
      }
      revoke();
      ctx.navigate('#/drafts/new');
    } });
    return h('div', { class: 'g-stack' },
      r0().isSample && !st.edited ? banner({ tone: 'warn', message: t('intake.sample.banner') }) : null,
      h('div', {}, h('h2', { class: 'g-section__title' }, t('intake.confirm.title')), h('p', { class: 'g-page__lede' }, t('intake.confirm.lede'))),
      h('div', { class: 'in-two' },
        field({ label: t('intake.confirm.issues'), input: area, hint: parseIssues(st.issues).length ? t('intake.confirm.issuesHint') : `${t('intake.confirm.none')} ${t('intake.confirm.issuesHint')}` }),
        card({ title: t('intake.confirm.preview') }, preview)),
      h('label', { class: 'in-check', for: 'in-ack' }, ackBox, h('span', {}, t('intake.confirm.ack'))),
      errMsg,
      h('div', { class: 'in-nav' }, button({ label: t('intake.back'), onClick: () => go('2') }),
        button({ label: t('intake.openInDocuments'), variant: 'ghost', href: `#/documents/${encodeURIComponent(st.result.id)}` }), goBtn));
  }
  const r0 = () => st.result;

  function paint() {
    paintSteps();
    clear(view);
    view.append(st.step === '1' || !st.result ? step1() : st.step === '2' ? step2() : step3());
  }
  paint();
  return page;
}

export default {
  route: '/matters/new', title: 'New matter', permission: 'UPLOAD_PLEADING', render,
  onLeave() { cleanup(); cleanup = () => {}; },
};
