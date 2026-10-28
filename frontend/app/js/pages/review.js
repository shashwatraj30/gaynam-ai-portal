// Review and sign: /drafts/:id/review. Stepper, real stat tiles, pre-approval checks (incl. final api.verifyCitations over all
// sections and the OCR-noise detector), approve/seal gated by FINALIZE_JUDGMENT, return for changes, DOCX download, print.
// Honest labelling: "digital signature not connected"; SHA-256 is the fingerprint of the DOCX actually downloaded.
import { h, clear } from '../dom.js';
import { t, addMessages } from '../i18n/index.js';
import en from '../i18n/pages/review.en.js';
import hi from '../i18n/pages/review.hi.js';
import dEn from '../i18n/pages/drafts.en.js';
import dHi from '../i18n/pages/drafts.hi.js';
import { api, can } from '../api.js';
import { loadCss } from '../ui/shell.js';
import { normalizeDraftStatus, draftStatusChip } from '../ui/status.js';
import { button } from '../ui/button.js';
import { card } from '../ui/card.js';
import { stepper } from '../ui/stepper.js';
import { statTile } from '../ui/stat-tile.js';
import { checkList } from '../ui/check-list.js';
import { skeleton } from '../ui/skeleton.js';
import { errorState } from '../ui/error-state.js';
import { banner } from '../ui/banner.js';
import { confirmDialog } from '../ui/confirm.js';
import { modal } from '../ui/modal.js';
import { textarea } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { statusChip } from './lib/draft-ui.js';
import { SECTION_KEYS, normalizeSections, joinSections, classifyConflict, summarizeVerification, engineKind, validateReason, isReasonRequired, returnReasonFor } from './lib/studio-logic.js';
import { STEPS, stepperCurrent, buildPreChecks, checksPending, attentionCount, approvalGate, exportFileName, sha256Hex } from './lib/review-logic.js';

addMessages('en', dEn); addMessages('hi', dHi); addMessages('en', en); addMessages('hi', hi);

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, class: 'sr-only' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function render({ id }, ctx) {
  loadCss('page-review.css');
  const R = { d: null, texts: normalizeSections(null), status: 'DRAFT', verify: { status: 'loading', results: [] }, hash: null, hashUnavailable: false, fileName: '', busy: false };
  const root = h('section', { class: 'g-page review' });

  const body = h('div', { class: 'review__body' });
  root.append(body);

  const checks = () => buildPreChecks({ texts: R.texts, verify: R.verify, engine: R.d?.draft_content_json?.engine });

  function checkText(it) {
    const d = it.data;
    switch (it.id) {
      case 'found': {
        const label = t('review.chk.found');
        if (it.state === 'pending') return { label, detail: t('review.chk.pending') };
        if (R.verify.status === 'error') return { label, detail: t('review.chk.verifyError') };
        if (!d.total) return { label, detail: t('review.chk.noCites') };
        return { label, detail: it.state === 'pass' ? t('review.chk.foundOk', { found: d.found, total: d.total }) : t('review.chk.foundFail', { list: d.missing.join('; ') }) };
      }
      case 'overruled': {
        const label = t('review.chk.overruled');
        if (it.state === 'pending') return { label, detail: t('review.chk.pending') };
        if (R.verify.status === 'error') return { label, detail: t('review.chk.verifyError') };
        if (!d.total) return { label, detail: t('review.chk.noCites') };
        return { label, detail: it.state === 'pass'
          ? t('review.chk.overruledOk') + (d.distinguished.length ? ' ' + t('review.chk.distinguished', { list: d.distinguished.join('; ') }) : '')
          : t('review.chk.overruledFail', { list: d.overruled.map((o) => `${o.citation}${o.overruledBy ? ` (${o.overruledBy})` : ''}`).join('; ') }) };
      }
      case 'noise': return { label: t('review.chk.noise'), detail: it.state === 'pass' ? t('review.chk.noiseOk') : t('review.chk.noiseFail', { sections: d.sections.join(', ') }) };
      case 'filled': return { label: t('review.chk.filled'), detail: it.state === 'pass' ? t('review.chk.filledOk') : t('review.chk.filledFail', { sections: d.sections.join(', ') }) };
      default: return { label: t('review.chk.engine'), detail: d.kind === 'template' ? t('review.chk.engineTemplate') : d.kind === 'model' ? t('review.chk.engineModel') : t('review.chk.engineUnknown') };
    }
  }

  async function runVerify() {
    R.verify = { status: 'loading', results: [] }; paintChecks();
    try {
      const r = await api.verifyCitations(joinSections(R.texts));
      R.verify = { status: 'done', results: Array.isArray(r?.verifications) ? r.verifications : [] };
    } catch (e) { R.verify = { status: 'error', results: [], error: e }; }
    paintChecks();
  }

  async function exportDocx() {
    const blob = await api.exportDocx(id);
    R.fileName = exportFileName(R.d.case_number, id);
    try { R.hash = await sha256Hex(await blob.arrayBuffer()); R.hashUnavailable = R.hash == null; } catch { R.hash = null; R.hashUnavailable = true; }
    paintSign();
    return blob;
  }
  async function download() {
    R.busy = true; paintSign();
    try { saveBlob(await exportDocx(), R.fileName); toast(t('review.export.done'), { tone: 'primary' }); }
    catch (e) { toast(e?.message || t('state.error'), { tone: 'danger' }); }
    finally { R.busy = false; paintSign(); }
  }
  async function setStatus(to, extra = {}) {
    const r = await api.updateDraftStatus(id, to, { ...extra, version: R.d?.version });
    R.status = normalizeDraftStatus(r.status);
    if (R.d) { R.d.status = R.status; if (r.version != null) R.d.version = r.version; if (extra.reason) R.d.last_return_reason = extra.reason; }
    paintAll();
  }
  async function act(gate) {
    const attn = attentionCount(checks());
    const sealing = gate.next === 'FINAL_SEALED';
    const ok = await confirmDialog({
      title: sealing ? t('review.seal.title') : t('review.approve.title'),
      message: (sealing ? t('review.seal.msg') : t('review.approve.msg')) + (attn ? ` ${t('review.confirm.attention', { n: attn })}` : '') + (R.verify.status === 'error' ? ` ${t('review.confirm.noCheck')}` : ''),
      confirmLabel: sealing ? t('review.seal') : t('review.approve'), tone: sealing ? 'danger' : 'primary',
    });
    if (!ok) return;
    R.busy = true; paintSign();
    try {
      let blob = null;
      if (sealing) blob = await exportDocx();
      await setStatus(gate.next);
      toast(sealing ? t('review.seal.done') : t('review.approve.done'), { tone: 'primary' });
      if (blob) saveBlob(blob, R.fileName);
    } catch (e) { fail(e); } finally { R.busy = false; paintSign(); }
  }
  /** Modal with a required reason (min 5 chars). Resolves the trimmed reason, or null when cancelled. */
  function askReason() {
    return new Promise((resolve) => {
      let result = null;
      const ta = textarea({ id: 'review-return-reason', rows: 4, 'aria-describedby': 'review-return-hint review-return-err', 'aria-required': 'true' });
      const err = h('p', { id: 'review-return-err', class: 'review__reasonerr', role: 'alert' });
      const submit = () => {
        const v = validateReason(ta.value);
        if (!v.ok) { err.textContent = t('review.return.reasonShort'); ta.setAttribute('aria-invalid', 'true'); ta.focus(); return; }
        result = v.reason; dlg.close();
      };
      const cancelBtn = button({ label: t('review.return.cancel'), variant: 'secondary', onClick: () => dlg.close() });
      const okBtn = button({ label: t('review.return'), variant: 'danger', onClick: submit });
      const dlg = modal({
        title: t('review.return.title'),
        body: h('div', { class: 'review__reasonbox' }, h('p', {}, t('review.return.msg')),
          h('label', { class: 'g-label', for: 'review-return-reason' }, t('review.return.reason')),
          ta, h('p', { id: 'review-return-hint', class: 'g-meta' }, t('review.return.reasonHint')), err),
        actions: [cancelBtn, okBtn], initialFocus: () => ta, onClose: () => resolve(result),
      });
      dlg.open();
    });
  }
  async function giveBack() {
    const reason = await askReason();
    if (reason == null) return;
    R.busy = true; paintSign();
    try { await setStatus('RETURNED', { reason }); toast(t('review.return.done'), { tone: 'primary' }); }
    catch (e) { if (isReasonRequired(e)) toast(t('review.return.reasonServer'), { tone: 'danger' }); else fail(e); }
    finally { R.busy = false; paintSign(); }
  }
  async function fail(e) {
    const kind = classifyConflict(e);
    toast(kind ? t('err.conflict') : (e?.message || t('state.error')), { tone: 'danger' });
    if (kind) { try { const d = await api.draft(id); R.d = d; R.status = normalizeDraftStatus(d.status); paintAll(); } catch { /* ignore */ } }
  }

  // ---------- painting ----------
  const top = h('div', {}); const stepHost = h('div', { class: 'review__steps' }); const tiles = h('div', { class: 'review__tiles' });
  const checksHost = h('div', {}); const signHost = h('div', {});
  const cols = h('div', { class: 'g-grid-2' }, h('div', { class: 'g-stack' }, tiles, checksHost), signHost);

  function paintTop() {
    clear(top);
    const dc = R.d.draft_content_json || {};
    top.append(h('div', { class: 'g-page__head' },
      h('div', {}, h('h1', { class: 'g-page__title' }, t('review.title')),
        h('p', { class: 'g-page__lede' }, `${R.d.case_title || ''}`),
        h('p', { class: 'g-meta' }, [R.d.case_number, t('studio.draftNo', { id }), engineKind(dc.engine) === 'template' ? t('review.templateTag') : ''].filter(Boolean).join(' · '))),
      h('div', { class: 'g-page__actions' }, statusChip(R.status), button({ label: t('review.backToStudio'), variant: 'ghost', href: `#/drafts/${id}` }))));
    clear(stepHost);
    stepHost.append(stepper({ steps: STEPS.map((s) => ({ id: s, label: draftStatusChip(s).label })), current: stepperCurrent(R.status) }));
    if (R.status === 'RETURNED') {
      const why = returnReasonFor({ status: R.status, last_return_reason: R.d?.last_return_reason });
      stepHost.append(banner({ tone: 'warn', message: t('review.returnedNote') + (why ? ` ${t('studio.returned.banner', { reason: why })}` : '') }));
    }
  }
  function paintTiles() {
    clear(tiles);
    const sum = summarizeVerification(R.verify.results);
    const ready = R.verify.status === 'done';
    const filled = SECTION_KEYS.filter((k) => (R.texts[k] || '').trim()).length;
    tiles.append(
      statTile({ label: t('review.tile.found'), value: ready ? `${sum.found} / ${sum.total}` : '-', hint: t('review.tile.foundHint'), tone: ready && sum.missing.length ? 'warn' : 'primary' }),
      statTile({ label: t('review.tile.overruled'), value: ready ? sum.overruled.length : '-', hint: t('review.tile.overruledHint'), tone: ready && sum.overruled.length ? 'danger' : 'neutral' }),
      statTile({ label: t('review.tile.sections'), value: `${filled} / 15`, hint: t('review.tile.sectionsHint'), tone: filled < 15 ? 'warn' : 'primary' }));
  }
  function paintChecks() {
    paintTiles(); clear(checksHost);
    const items = checks();
    const noise = items.find((i) => i.id === 'noise');
    checksHost.append(card({ title: t('review.checks.title'), actions: button({ label: t('review.checks.rerun'), variant: 'ghost', disabled: R.verify.status === 'loading', onClick: runVerify }) },
      h('p', { class: 'g-meta' }, t('review.checks.lede')),
      checkList(items.map((it) => ({ state: it.state, ...checkText(it) }))),
      noise?.data.sections.length ? h('p', { class: 'review__links' }, ...noise.data.sections.map((n) => h('a', { href: `#/drafts/${id}?section=${n}` }, t('review.goto', { n })))) : null,
      R.verify.status === 'error' ? errorState({ message: R.verify.error?.message, requestId: R.verify.error?.requestId, onRetry: runVerify, retryLabel: t('state.retry') }) : null));
    paintSign();
  }
  function paintSign() {
    clear(signHost);
    const gate = approvalGate({ status: R.status, canFinalize: can('FINALIZE_JUDGMENT'), pending: checksPending(checks()) });
    const name = ctx.user?.full_name || ctx.user?.name || '';
    const kv = [
      [t('review.kv.signer'), name || t('review.kv.unknown')],
      [t('review.kv.signature'), t('review.sig.none')],
      [t('review.kv.document'), R.fileName || exportFileName(R.d.case_number, id)],
      [t('review.kv.fingerprint'), R.hash ? R.hash : R.hashUnavailable ? t('review.fp.unavailable') : t('review.fp.after')],
      [t('review.kv.stored'), t('review.stored')],
    ];
    const reason = { 'no-permission': t('review.gate.noperm'), 'checks-pending': t('review.gate.pending'),
      'not-reviewable': R.status === 'FINAL_SEALED' ? t('review.gate.sealed') : t('review.gate.notSent') }[gate.reason];
    signHost.append(card({ title: gate.next === 'FINAL_SEALED' ? t('review.seal') : t('review.approve') },
      h('p', {}, t('review.sign.lede')),
      h('dl', { class: 'review__kv' }, ...kv.flatMap(([k, v], i) => [h('dt', {}, k), h('dd', { class: i === 3 && R.hash ? 'review__hash' : null }, v)])),
      reason ? h('p', { class: 'review__reason', role: 'status' }, reason) : null,
      h('div', { class: 'review__actions' },
        gate.next ? button({ label: gate.next === 'FINAL_SEALED' ? t('review.seal') : t('review.approve'), variant: 'primary', disabled: !gate.canAct || R.busy, onClick: () => act(gate) }) : null,
        gate.canReturn ? button({ label: t('review.return'), variant: 'secondary', disabled: R.busy || !can('DRAFT_FULL'), onClick: giveBack }) : null,
        button({ label: t('review.docx'), variant: 'secondary', icon: 'download', disabled: R.busy, onClick: download }),
        button({ label: t('review.print'), variant: 'ghost', onClick: printView }))));
  }
  async function printView() {
    R.busy = true; paintSign();
    try {
      const blob = await api.printHtml(id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast(e?.message || t('state.error'), { tone: 'danger' }); }
    finally { R.busy = false; paintSign(); }
  }
  function paintAll() { paintTop(); paintChecks(); }

  async function load() {
    clear(body); body.append(skeleton({ lines: 8 }));
    try {
      const d = await api.draft(id);
      R.d = d; R.status = normalizeDraftStatus(d.status);
      const c = d.draft_content_json && typeof d.draft_content_json === 'object' ? d.draft_content_json : {};
      R.texts = normalizeSections(c.sections);
      ctx.setBreadcrumb([{ label: t('nav.drafts'), href: '#/drafts' }, { label: d.case_number || `#${id}`, href: `#/drafts/${id}` }, { label: t('review.title') }]);
      clear(body); body.append(top, stepHost, cols);
      paintAll(); runVerify();
    } catch (e) {
      clear(body);
      body.append(errorState({ message: e?.status === 404 ? t('err.notFound') : e?.message, requestId: e?.requestId, onRetry: load, retryLabel: t('state.retry') }));
    }
  }
  load();
  return root;
}

export default { route: '/drafts/:id/review', title: 'Review and sign', permission: 'DRAFT_FULL', render, onLeave() {} };
