// Drafting studio: /drafts/:id (id 'new' starts from store 'intakeParams').
// Left: confirmed issues + 15-section outline. Middle: editable sections / parameters. Right: claim check + precedents.
// API: draft, saveDraft (create then update with version, 409 dialog), draftJudgment (cancellable), verifyCitations, updateDraftStatus.
import { h, clear } from '../dom.js';
import { t, addMessages } from '../i18n/index.js';
import en from '../i18n/pages/studio.en.js';
import hi from '../i18n/pages/studio.hi.js';
import dEn from '../i18n/pages/drafts.en.js';
import dHi from '../i18n/pages/drafts.hi.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { loadCss } from '../ui/shell.js';
import { precedentChip, normalizeDraftStatus, draftStatusChip } from '../ui/status.js';
import { chip } from '../ui/chip.js';
import { button } from '../ui/button.js';
import { card } from '../ui/card.js';
import { tabs } from '../ui/tabs.js';
import { listRow } from '../ui/list-row.js';
import { checkList } from '../ui/check-list.js';
import { banner } from '../ui/banner.js';
import { skeleton } from '../ui/skeleton.js';
import { errorState } from '../ui/error-state.js';
import { emptyState } from '../ui/empty-state.js';
import { confirmDialog } from '../ui/confirm.js';
import { toast } from '../ui/toast.js';
import { field, input, textarea } from '../ui/form.js';
import { formatRelative } from '../format.js';
import { statusChip } from './lib/draft-ui.js';
import { createInsights } from './lib/studio-insights-ui.js';
import {
  SECTION_KEYS, PARAM_KEYS, normalizeSections, joinSections, hasContent, detectOcrNoise, engineKind, normalizeIntake,
  paramsFromDraft, missingParams, parseIssues, buildDraftRequest, buildSavePayload, classifyConflict, citationChecks,
  summarizeVerification, createAutosaver, alertMarks, sendForReviewPath, isEditableStatus,
} from './lib/studio-logic.js';

addMessages('en', dEn); addMessages('hi', dHi); addMessages('en', en); addMessages('hi', hi);

const LONG = new Set(['facts', 'issues', 'petitioner_arguments', 'respondent_arguments', 'statutory_provisions']);
let cleanup = null;

function rowsFor(text) { const s = String(text || ''); return Math.min(40, Math.max(4, s.split('\n').length + Math.ceil(s.length / 110))); }

async function render({ id }, ctx) {
  loadCss('page-studio.css');
  if (cleanup) cleanup();
  const isNew = id === 'new';
  const S = {
    id: null, version: null, status: 'DRAFT', params: normalizeIntake(isNew ? store.get('intakeParams') : null), content: {}, texts: normalizeSections(null),
    engine: '', tab: 'draft', active: 0, noisy: new Set(), missing: [], saveState: 'none', savedAt: null,
    generating: null, genError: null, check: null, busy: false,
  };
  let ctl = null; let ticker = null; let noiseTimer = null; let guardBusy = false;
  const root = h('div', { class: 'studio' });
  const insights = createInsights({ api });
  const pushInsights = () => insights.update({ params: S.params, texts: S.texts, engine: S.engine, precedents: Array.isArray(S.content.retrieved_precedents) ? S.content.retrieved_precedents : [] });

  const head = h('header', { class: 'studio__head' });
  const notes = h('div', { class: 'studio__notes' });
  const left = h('aside', { class: 'g-work-3__left', 'aria-label': t('studio.outline') });
  const main = h('div', { class: 'g-work-3__main' });
  const right = h('aside', { class: 'g-work-3__right', 'aria-label': t('studio.claim.title') });
  const layout = h('div', { class: 'g-work-3' }, left, main, right);

  const editable = () => isEditableStatus(S.status);
  const title = () => S.params.case_title || t('studio.new');

  function applyDraft(d) {
    let c = d.draft_content_json;
    if (!c || typeof c !== 'object') c = {};
    S.id = d.id; S.version = d.version ?? 1; S.status = normalizeDraftStatus(d.status);
    S.params = paramsFromDraft(d);
    const { sections, ...rest } = c;
    S.content = rest; S.texts = normalizeSections(sections);
    S.engine = c.engine || c.generation_mode || '';
    S.noisy = new Set(SECTION_KEYS.filter((k) => detectOcrNoise(S.texts[k]).noisy));
    S.saveState = 'saved'; S.savedAt = null;
  }

  // ---------- saving ----------
  async function doSave(retry = true) {
    const payload = buildSavePayload({ id: S.id, version: S.version, status: S.status, params: S.params, content: S.content, texts: S.texts });
    try {
      const r = await api.saveDraft(payload);
      const first = !S.id;
      S.id = r.draft_id; S.version = r.version; S.status = normalizeDraftStatus(r.status || S.status); S.savedAt = new Date();
      if (first) {
        try { history.replaceState(null, '', `#/drafts/${S.id}`); } catch { /* ignore */ }
        ctx.setBreadcrumb([{ label: t('nav.drafts'), href: '#/drafts' }, { label: title() }]);
      }
    } catch (e) {
      const kind = classifyConflict(e);
      if (kind === 'DRAFT_SEALED') {
        autosaver.clearDirty(); S.status = 'FINAL_SEALED'; toast(t('studio.sealed'), { tone: 'warn' }); paintAll(); return;
      }
      if (kind === 'VERSION_CONFLICT' && S.id) { await resolveConflict(retry); return; }
      throw e;
    }
  }
  async function resolveConflict(retry) {
    autosaver.pause();
    try {
      const reload = await confirmDialog({
        title: t('studio.conflict.title'), message: t('studio.conflict.msg'),
        confirmLabel: t('studio.conflict.reload'), cancelLabel: t('studio.conflict.keep'), tone: 'danger',
      });
      const fresh = await api.draft(S.id);
      if (reload) { autosaver.clearDirty(); applyDraft(fresh); paintAll(); toast(t('studio.conflict.reloaded'), { tone: 'info' }); }
      else { S.version = fresh.version ?? 1; S.status = normalizeDraftStatus(fresh.status); if (retry) await doSave(false); }
    } finally { autosaver.resume(); }
  }
  const autosaver = createAutosaver({
    save: doSave,
    onState: (s) => { S.saveState = s; if (s === 'saved') S.savedAt = S.savedAt || new Date(); paintSaveState(); if (s === 'saved' || s === 'saving') paintHeader(); },
  });

  // ---------- generation ----------
  async function prepare() {
    const miss = missingParams(S.params);
    if (miss.length) { S.missing = miss; S.tab = 'params'; paintAll(); toast(t('studio.params.missing'), { tone: 'warn' }); return; }
    if (hasContent(S.texts) && !(await confirmDialog({ title: t('studio.replace.title'), message: t('studio.replace.msg'), confirmLabel: t('studio.replace.ok'), tone: 'danger' }))) return;
    ctl = new AbortController(); S.generating = { start: Date.now() }; S.genError = null; S.tab = 'draft'; S.missing = [];
    paintAll();
    ticker = setInterval(() => { const el = main.querySelector('[data-elapsed]'); if (el) el.textContent = t('studio.gen.elapsed', { s: Math.round((Date.now() - S.generating.start) / 1000) }); }, 1000);
    try {
      const res = await api.draftJudgment(buildDraftRequest(S.params), { signal: ctl.signal });
      const { sections, ...rest } = res || {};
      S.content = rest; S.texts = normalizeSections(sections); S.engine = rest.engine || rest.generation_mode || '';
      S.noisy = new Set(SECTION_KEYS.filter((k) => detectOcrNoise(S.texts[k]).noisy)); S.check = null; S.active = 0;
      stopGen(); paintAll();
      autosaver.markDirty();
      autosaver.flush().catch(() => {});
    } catch (e) {
      stopGen();
      if (e?.code === 'ABORTED') toast(t('studio.gen.cancelled'), { tone: 'neutral' }); else S.genError = e;
      paintAll();
    }
  }
  function stopGen() { if (ticker) clearInterval(ticker); ticker = null; ctl = null; S.generating = null; }

  // ---------- status ----------
  async function sendForReview() {
    if (!(await confirmDialog({ title: t('studio.send.title'), message: t('studio.send.msg'), confirmLabel: t('studio.send') }))) return;
    S.busy = true; paintHeader();
    try {
      if (autosaver.dirty || !S.id) { autosaver.markDirty(); await autosaver.flush(); }
      for (const st of sendForReviewPath(S.status)) {
        const r = await api.updateDraftStatus(S.id, st);
        S.status = normalizeDraftStatus(r.status); S.version = r.version ?? (S.version + 1);
      }
      toast(t('studio.send.done'), { tone: 'primary' });
      ctx.navigate(`#/drafts/${S.id}/review`);
    } catch (e) {
      const kind = classifyConflict(e);
      toast(kind ? t('err.conflict') : (e?.message || t('state.error')), { tone: 'danger' });
      if (kind && S.id) { try { applyDraft(await api.draft(S.id)); } catch { /* ignore */ } }
    } finally { S.busy = false; paintAll(); }
  }

  // ---------- claim check ----------
  async function runCheck(scope) {
    const text = scope === 'all' ? joinSections(S.texts) : S.texts[SECTION_KEYS[S.active]] || '';
    S.check = { scope, section: S.active + 1, status: 'loading', results: [], text }; paintRight();
    try {
      const r = await api.verifyCitations(text);
      S.check = { ...S.check, status: 'done', results: Array.isArray(r?.verifications) ? r.verifications : [] };
    } catch (e) { S.check = { ...S.check, status: 'error', error: e }; }
    paintRight();
  }

  // ---------- painting ----------
  function paintSaveState() {
    const el = head.querySelector('[data-save]');
    if (!el) return;
    const m = { none: t('studio.save.none'), dirty: t('studio.save.dirty'), saving: t('studio.save.saving'), error: t('studio.save.error'),
      saved: S.savedAt ? t('studio.save.saved', { when: formatRelative(S.savedAt) }) : t('studio.save.savedPlain') };
    el.textContent = m[S.saveState] || '';
    el.classList.toggle('studio__save--error', S.saveState === 'error');
  }
  function paintHeader() {
    clear(head);
    const has = hasContent(S.texts);
    const kind = engineKind(S.engine);
    head.append(
      h('div', { class: 'studio__titles' },
        h('h1', { class: 'g-page__title studio__h1' }, title()),
        h('p', { class: 'g-meta' }, [S.params.case_number, S.params.court, S.id ? t('studio.draftNo', { id: S.id }) : t('studio.notSaved')].filter(Boolean).join(' · ')),
        h('div', { class: 'studio__chips' }, S.id ? statusChip(S.status) : null,
          kind === 'template' ? chip({ label: t('studio.engine.template'), tone: 'warn', icon: 'alert' }) : null,
          kind === 'model' ? chip({ label: t('studio.engine.model'), tone: 'info' }) : null,
          h('span', { class: 'g-meta studio__save', 'data-save': '', role: 'status', 'aria-live': 'polite' }),
          S.saveState === 'error' ? button({ label: t('state.retry'), variant: 'ghost', onClick: () => autosaver.flush().catch(() => {}) }) : null)),
      h('div', { class: 'g-page__actions' },
        editable() && has ? button({ label: t('studio.prepareAgain'), variant: 'secondary', disabled: !!S.generating || S.busy, onClick: prepare }) : null,
        editable() && !has ? button({ label: t('studio.prepare'), variant: 'primary', icon: 'edit', disabled: !!S.generating, onClick: prepare }) : null,
        editable() && has ? button({ label: t('studio.send'), variant: 'primary', disabled: !!S.generating || S.busy, onClick: sendForReview }) : null,
        !editable() && S.id ? button({ label: t('studio.openReview'), variant: 'primary', href: `#/drafts/${S.id}/review` }) : null));
    paintSaveState();
  }
  function paintNotes() {
    clear(notes);
    const kind = engineKind(S.engine);
    if (!editable()) notes.append(banner({ tone: 'info', message: t('studio.readonly', { status: draftStatusChip(S.status).label }) }));
    if (kind === 'template') notes.append(banner({ tone: 'warn', message: t('studio.banner.template') }));
    if (kind === 'model') notes.append(banner({ tone: 'info', message: t('studio.banner.model') }));
    const noisy = SECTION_KEYS.map((k, i) => (S.noisy.has(k) ? i + 1 : 0)).filter(Boolean);
    if (noisy.length) {
      notes.append(banner({ tone: 'warn', message: t('studio.banner.noise', { sections: noisy.join(', ') }),
        action: { label: t('studio.banner.goto', { n: noisy[0] }), onClick: () => focusSection(noisy[0] - 1) } }));
    }
    const am = alertMarks(store.get('alertTarget'), S.id, S.texts);
    if (am) {
      const who = am.target.overruledTitle || am.target.citation || '';
      notes.append(banner({ tone: 'warn', message: t('studio.alert.banner', { cite: am.target.citation || who, by: am.target.overruledBy || t('studio.chk.largerBench') })
          + (am.sections.length ? ' ' + t('studio.alert.in', { sections: am.sections.join(', ') }) : ' ' + t('studio.alert.notFound')),
        action: am.sections.length ? { label: t('studio.banner.goto', { n: am.sections[0] }), onClick: () => focusSection(am.sections[0] - 1) } : { label: t('studio.alert.open'), href: `#/alerts/${encodeURIComponent(am.target.alertId)}` } }));
    }
    if (S.genError) notes.append(errorState({ message: S.genError.message, requestId: S.genError.requestId, onRetry: prepare, retryLabel: t('studio.gen.retry') }));
  }
  function paintLeft() {
    clear(left);
    const issues = parseIssues(S.params.issues);
    const alertSecs = new Set(alertMarks(store.get('alertTarget'), S.id, S.texts)?.sections || []);
    left.append(
      card({ title: t('studio.issues.title') }, issues.length
        ? h('ol', { class: 'studio__issues' }, ...issues.map((x, i) => h('li', {}, h('span', { class: 'g-meta' }, t('studio.issues.n', { n: i + 1 })), h('span', {}, x))))
        : h('p', { class: 'g-meta' }, t('studio.issues.none'))),
      card({ title: t('studio.outline') }, h('nav', { 'aria-label': t('studio.outline') },
        h('ul', { class: 'studio__toc g-reset-list' }, ...SECTION_KEYS.map((k, i) => h('li', {},
          h('button', { type: 'button', class: `studio__tocbtn${i === S.active ? ' studio__tocbtn--on' : ''}`, 'aria-current': i === S.active ? 'true' : null, onClick: () => focusSection(i) },
            h('span', {}, `${i + 1}. ${t(`studio.sec.${i + 1}`)}`),
            S.noisy.has(k) ? chip({ label: t('studio.noise.chip'), tone: 'warn' }) : null,
            alertSecs.has(i + 1) ? chip({ label: t('studio.alert.chip'), tone: 'warn', icon: 'alert' }) : null)))))));
  }
  function focusSection(i) {
    S.active = i; if (S.tab !== 'draft') { S.tab = 'draft'; paintMain(); }
    paintLeft();
    const ta = main.querySelector(`#sec-${i + 1}`);
    if (ta) { ta.scrollIntoView({ block: 'center' }); if (typeof ta.focus === 'function' && ta.tagName === 'TEXTAREA') ta.focus({ preventScroll: true }); }
  }
  function onSectionInput(i, ta) {
    const k = SECTION_KEYS[i];
    S.texts[k] = ta.value; ta.setAttribute('rows', String(rowsFor(ta.value)));
    autosaver.markDirty();
    clearTimeout(noiseTimer);
    noiseTimer = setTimeout(() => {
      const was = S.noisy.has(k); const now = detectOcrNoise(S.texts[k]).noisy;
      if (now) S.noisy.add(k); else S.noisy.delete(k);
      if (was !== now) { paintLeft(); paintNotes(); }
      if (S.check && S.check.status === 'done') paintRight(); else pushInsights();
    }, 500);
  }
  function paintMain() {
    clear(main);
    const tabBar = tabs({ label: t('studio.tabs'), active: S.tab, items: [{ id: 'draft', label: t('studio.tab.draft') }, { id: 'params', label: t('studio.tab.params') }], onChange: (x) => { S.tab = x; paintMain(); } });
    main.append(tabBar);
    const panel = h('div', { class: 'studio__panel', role: 'tabpanel', 'aria-labelledby': tabBar.tabId(S.tab) });
    main.append(panel);
    if (S.tab === 'params') return paintParams(panel);
    if (S.generating) {
      panel.append(card({ title: t('studio.gen.title') },
        h('div', { class: 'studio__gen', role: 'status', 'aria-live': 'polite' },
          h('p', {}, t('studio.gen.what')),
          h('p', { class: 'g-meta' }, t('studio.gen.noprogress')),
          h('p', { class: 'studio__elapsed', 'data-elapsed': '' }, t('studio.gen.elapsed', { s: 0 })),
          button({ label: t('btn.cancel'), variant: 'secondary', onClick: () => ctl && ctl.abort() }))));
      return undefined;
    }
    if (!hasContent(S.texts)) {
      panel.append(emptyState({ title: t('studio.empty.title'), message: t('studio.empty.msg'),
        action: editable() ? button({ label: t('studio.prepare'), variant: 'primary', onClick: prepare }) : null }));
      return undefined;
    }
    const alertTarget = store.get('alertTarget') || {};
    const alertSecs = new Set(alertMarks(alertTarget, S.id, S.texts)?.sections || []);
    SECTION_KEYS.forEach((k, i) => {
      const n = i + 1; const taId = `sec-${n}`;
      const label = h('label', { class: 'studio__sectitle', for: taId }, `${n}. ${t(`studio.sec.${n}`)}`);
      let ctrl;
      if (editable()) {
        ctrl = textarea({ id: taId, rows: rowsFor(S.texts[k]), class: 'studio__ta', onInput: (e) => onSectionInput(i, e.target), onFocus: () => { if (S.active !== i) { S.active = i; paintLeft(); } } }, S.texts[k]);
        ctrl.value = S.texts[k];
      } else { ctrl = h('div', { id: taId, class: 'studio__text g-reading', tabindex: '0' }, S.texts[k]); }
      const flagged = alertSecs.has(n);
      panel.append(h('section', { class: `studio__sec${S.noisy.has(k) ? ' studio__sec--noisy' : ''}${flagged ? ' studio__sec--alert' : ''}` }, label,
        flagged ? banner({ tone: 'warn', message: t('studio.alert.sec', { cite: alertTarget.citation || alertTarget.overruledTitle || '', by: alertTarget.overruledBy || t('studio.chk.largerBench') }) }) : null, ctrl));
    });
    return undefined;
  }
  function paintParams(panel) {
    panel.append(h('p', { class: 'g-meta' }, t('studio.params.hint')));
    for (const k of PARAM_KEYS) {
      const long = LONG.has(k);
      const ctrl = long ? textarea({ rows: k === 'facts' ? 8 : 4, name: k }, S.params[k]) : input({ name: k, value: S.params[k] });
      if (long) ctrl.value = S.params[k];
      ctrl.addEventListener('input', (e) => { S.params[k] = e.target.value; if (editable()) autosaver.markDirty(); if (k === 'issues') paintLeft(); if (k === 'statutory_provisions' || k === 'facts') pushInsights(); if (k === 'case_title') { ctx.setBreadcrumb([{ label: t('nav.drafts'), href: '#/drafts' }, { label: title() }]); } });
      ctrl.disabled = !editable();
      panel.append(field({ label: t(`studio.param.${k}`), input: ctrl, required: ['case_title', 'case_number', 'court', 'facts', 'issues'].includes(k), error: S.missing.includes(k) ? t('studio.params.required') : null }));
    }
  }
  function claimCard(v) {
    const c = citationChecks(v);
    const items = [
      { label: t('studio.chk.found'), state: c.found, detail: c.found === 'pass' ? t('studio.chk.matched', { title: c.matchedTitle || '-' }) : t('studio.chk.notFound') },
      { label: t('studio.chk.overruled'), state: c.overruled,
        detail: c.overruled === 'fail' ? t('studio.chk.overruledBy', { by: c.overruledBy || t('studio.chk.largerBench') }) : c.overruled === 'pass' ? (c.distinguished ? t('studio.chk.distinguished') : t('studio.chk.none')) : t('studio.chk.needsFound') },
    ];
    const later = ['quote', 'support', 'bench'].map((x) => ({ label: t(`studio.chk.${x}`), state: 'unchecked', detail: t('studio.chk.later') }));
    return h('li', { class: 'studio__claim' },
      h('div', { class: 'studio__claimcite' }, v.citation || v.query_citation),
      checkList(items),
      c.overruled === 'fail' ? button({ label: t('studio.replaceCite'), variant: 'secondary', href: `#/research?q=${encodeURIComponent(c.overruledBy || c.matchedTitle || v.citation || '')}` }) : null,
      c.judgmentId != null ? h('a', { class: 'g-meta', href: `#/judgments/${c.judgmentId}` }, t('studio.openJudgment')) : null,
      h('details', { class: 'studio__more' }, h('summary', {}, t('studio.chk.more')), checkList(later)));
  }
  function paintRight() {
    clear(right);
    const has = hasContent(S.texts);
    const body = [h('p', { class: 'g-meta' }, t('studio.claim.lede'))];
    const ck = S.check;
    if (ck?.status === 'loading') body.push(skeleton({ lines: 3 }));
    else if (ck?.status === 'error') body.push(errorState({ message: ck.error?.message, requestId: ck.error?.requestId, onRetry: () => runCheck(ck.scope), retryLabel: t('state.retry') }));
    else if (ck?.status === 'done') {
      const cur = ck.scope === 'all' ? joinSections(S.texts) : S.texts[SECTION_KEYS[ck.section - 1]];
      const sum = summarizeVerification(ck.results);
      body.push(h('p', { class: 'studio__scope' }, ck.scope === 'all' ? t('studio.claim.scopeAll') : t('studio.claim.scopeSection', { n: ck.section })));
      if (cur !== ck.text) body.push(banner({ tone: 'warn', message: t('studio.claim.stale') }));
      if (!sum.total) body.push(emptyState({ title: t('studio.claim.none'), message: t('studio.claim.noneMsg') }));
      else {
        body.push(h('p', { class: 'studio__summary' }, t('studio.claim.summary', { found: sum.found, total: sum.total, overruled: sum.overruled.length })));
        body.push(h('ul', { class: 'studio__claims g-reset-list' }, ...ck.results.map(claimCard)));
      }
    }
    right.append(card({ title: t('studio.claim.title'), actions: null },
      h('div', { class: 'studio__checkbtns' },
        button({ label: t('studio.claim.section', { n: S.active + 1 }), variant: 'secondary', disabled: !has || ck?.status === 'loading', onClick: () => runCheck('section') }),
        button({ label: t('studio.claim.all'), variant: 'ghost', disabled: !has || ck?.status === 'loading', onClick: () => runCheck('all') })),
      ...body));
    right.append(insights.el);
    pushInsights();
    const pre = Array.isArray(S.content.retrieved_precedents) ? S.content.retrieved_precedents : [];
    if (pre.length) {
      right.append(card({ title: t('studio.prec.title', { n: pre.length }) },
        h('div', { class: 'studio__prec' }, ...pre.map((p) => {
          const pc = precedentChip(p.precedent_status, { curated: false });
          return listRow({ title: p.title || p.case_title || p.citation || '-', meta: [p.citation, p.court].filter(Boolean).join(' · '),
            status: chip({ label: pc.label, tone: pc.tone }), href: p.id ? `#/judgments/${p.id}` : undefined });
        }))));
    }
  }
  function paintAll() { paintHeader(); paintNotes(); paintLeft(); paintMain(); paintRight(); }

  // ---------- leave guard ----------
  const onBefore = (e) => { if (autosaver.dirty) { e.preventDefault(); e.returnValue = ''; } };
  const onClick = async (e) => {
    const a = e.target?.closest?.('a[href^="#"]');
    if (!a || !autosaver.dirty || guardBusy || a.getAttribute('href') === location.hash) return;
    e.preventDefault(); e.stopPropagation();
    guardBusy = true;
    const href = a.getAttribute('href');
    const ok = await confirmDialog({ title: t('studio.leave.title'), message: t('studio.leave.msg'), confirmLabel: t('studio.leave.save'), cancelLabel: t('studio.leave.stay') });
    if (ok) { try { await autosaver.flush(); location.hash = href; } catch { toast(t('studio.save.error'), { tone: 'danger' }); } }
    guardBusy = false;
  };
  document.addEventListener('click', onClick, true);
  window.addEventListener('beforeunload', onBefore);
  cleanup = () => {
    document.removeEventListener('click', onClick, true); window.removeEventListener('beforeunload', onBefore);
    if (ticker) clearInterval(ticker); clearTimeout(noiseTimer);
    if (ctl) ctl.abort();
    insights.destroy();
    if (autosaver.dirty) autosaver.flush().catch(() => {});
    cleanup = null;
  };

  // ---------- load ----------
  async function load() {
    clear(root); root.append(h('div', { class: 'g-page' }, skeleton({ lines: 8 })));
    try {
      if (!isNew) applyDraft(await api.draft(id));
      else S.saveState = 'none';
      ctx.setBreadcrumb([{ label: t('nav.drafts'), href: '#/drafts' }, { label: title() }]);
      clear(root); root.append(head, notes, layout);
      const sec = Number(ctx.query.get('section'));
      if (sec >= 1 && sec <= 15) S.active = sec - 1;
      paintAll();
      if (sec >= 1 && sec <= 15) focusSection(sec - 1);
      if (isNew && hasContent(S.texts) === false && missingParams(S.params).length === 0 && store.get('intakeParams')) { /* params ready; user presses Prepare draft */ }
    } catch (e) {
      clear(root);
      root.append(h('div', { class: 'g-page' }, errorState({ message: e?.status === 404 ? t('err.notFound') : e?.message, requestId: e?.requestId, onRetry: load, retryLabel: t('state.retry') })));
    }
  }
  load();
  return root;
}

export default { route: '/drafts/:id', title: 'Drafting studio', permission: 'DRAFT_FULL', render, onLeave() { if (cleanup) cleanup(); } };
