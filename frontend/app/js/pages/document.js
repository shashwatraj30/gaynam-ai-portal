// Document workspace (#/documents/:id): check the extraction, research the issues and start a draft.
// API: api.documents.{get,text,file,saveExtraction,confirm,archive,research,pins,addPin,removePin,draftParams}.
// Hand-off to the studio: store 'intakeParams' (session) and 'benchBrief' (session), then #/drafts/new.
import { h, clear } from '../dom.js';
import { t } from '../i18n/index.js';
import '../i18n/pages/document.en.js';
import '../i18n/pages/document.hi.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { loadCss } from '../ui/shell.js';
import { formatDate } from '../format.js';
import { chip } from '../ui/chip.js';
import { button } from '../ui/button.js';
import { card } from '../ui/card.js';
import { field, input, textarea } from '../ui/form.js';
import { tabs } from '../ui/tabs.js';
import { stepper } from '../ui/stepper.js';
import { banner } from '../ui/banner.js';
import { skeleton } from '../ui/skeleton.js';
import { emptyState } from '../ui/empty-state.js';
import { errorState } from '../ui/error-state.js';
import { confirmDialog } from '../ui/confirm.js';
import { toast } from '../ui/toast.js';
import { draftStatusChip } from '../ui/status.js';
import {
  FIELD_KEYS, LONG_FIELDS, PINS_MAX, STEPS, stepperState, fieldsView, issuesFromText, issuesToText, moveItem, removeItem,
  redactionSummary, pinsFull, isPinned, draftReady, researchReady, missingForConfirm, canDownloadOriginal, authorityStatus,
  researchHref, benchFromAuthorities, intakeParamsFrom,
} from './lib/document-logic.js';
import { saveBlob, sourceView, issueList } from './lib/document-ui.js';
import { resultCard } from './lib/research-ui.js';

let cleanup = [];

function render(params, ctx) {
  loadCss('page-judgment.css'); loadCss('page-research.css'); loadCss('page-document.css');
  const id = params.id;
  ctx.setBreadcrumb([{ label: t('nav.documents'), href: '#/documents' }, { label: id }]);
  const S = {
    doc: null, pins: [], fields: {}, issues: [], dirty: false, ack: false, researched: false, research: null, researchBusy: false,
    tab: 'details', saveMsg: '', saving: false, confirming: false, confirmMissing: null, confirmErr: '', starting: false,
  };
  const root = h('div', { class: 'g-page dc' });
  let src = null; let tabsEl = null; let wide = false;
  const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(min-width: 1681px)') : null;
  const host = { head: h('header', { class: 'g-page__head' }), steps: h('div', { class: 'dc-steps' }), tabsHost: h('div', { class: 'dc-tabs' }),
    panel: h('div', { class: 'dc-panel', role: 'tabpanel' }), source: h('div', { class: 'dc-col dc-col--src' }), rail: h('aside', { class: 'dc-col dc-col--rail', 'aria-label': t('dw.rail') }) };
  const live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const say = (m) => { live.textContent = ''; setTimeout(() => { live.textContent = m; }, 30); };

  const canSearch = () => ctx.can('SEARCH');
  const canDraft = () => ctx.can('DRAFT_FULL');
  const errMsg = (e, fallback) => (e && e.message && e.status !== 0 ? e.message : fallback);

  // ---------- data ----------
  function adopt(doc) {
    S.doc = { ...(S.doc || {}), ...doc, drafts: doc.drafts ?? S.doc?.drafts ?? [], pins_count: doc.pins_count ?? S.doc?.pins_count ?? 0 };
    const ex = S.doc.extraction || {};
    S.fields = { ...(ex.fields || {}) };
    S.issues = Array.isArray(ex.issues) ? [...ex.issues] : [];
    S.dirty = false;
  }
  async function load() {
    clear(root); root.append(skeleton({ lines: 8 }));
    let doc; let pins = [];
    try {
      doc = await api.documents.get(id);
      try { pins = (await api.documents.pins(id))?.items || []; } catch { pins = []; }
    } catch (e) {
      clear(root);
      if (e && e.status === 404) {
        root.append(emptyState({ title: t('dw.notFoundTitle'), message: t('dw.notFoundMsg'), action: button({ label: t('dw.back'), variant: 'primary', href: '#/documents' }) }));
      } else {
        root.append(errorState({ message: errMsg(e, t('dw.error')), requestId: e?.requestId, onRetry: load, retryLabel: t('dw.retry') }));
      }
      return;
    }
    S.pins = pins; adopt(doc);
    if (S.doc.source === 'failed') S.tab = 'details';
    ctx.setBreadcrumb([{ label: t('nav.documents'), href: '#/documents' }, { label: S.doc.title || id }]);
    build();
    const h1 = root.querySelector('h1'); if (h1) h1.focus();
  }

  // ---------- header, stepper ----------
  function paintHead() {
    const d = S.doc;
    clear(host.head);
    host.head.append(
      h('div', {},
        h('nav', { class: 'dc-crumb', 'aria-label': 'Breadcrumb' }, h('a', { href: '#/documents' }, t('nav.documents')), ' › ', h('span', {}, d.title)),
        h('h1', { class: 'g-page__title', tabindex: '-1' }, d.title || t('dw.title')),
        h('div', { class: 'dc-chips' },
          chip({ label: t('dw.type', { v: d.doc_type || '' }), tone: 'neutral' }),
          chip({ label: t(`dw.status.${d.status}`), tone: d.status === 'CONFIRMED' ? 'primary' : 'neutral' }),
          chip({ label: t(`dw.source.${d.source || 'digital'}`), tone: d.source === 'failed' ? 'danger' : d.source === 'sample' ? 'warn' : 'info' }),
          d.created_at ? chip({ label: formatDate(d.created_at), tone: 'neutral' }) : null)),
      h('div', { class: 'g-page__actions dc-actions' },
        canDownloadOriginal(d) ? button({ label: t('dw.download'), icon: 'download', variant: 'secondary', onClick: download }) : null,
        d.status !== 'ARCHIVED' ? button({ label: t('dw.archive'), variant: 'ghost', onClick: archive }) : null,
        button({ label: t('dw.delete'), variant: 'danger', onClick: deleteDoc })));
  }
  function paintSteps() {
    const st = stepperState(S.doc, { researched: S.researched, acknowledged: S.ack });
    clear(host.steps);
    host.steps.append(stepper({ steps: STEPS.map((sid) => ({ id: sid, label: t(`dw.step.${sid}`) })), current: st.current }));
  }
  async function download() {
    try { saveBlob(await api.documents.file(id), S.doc.original_name); } catch { toast(t('dw.downloadFailed'), { tone: 'danger' }); }
  }
  async function archive() {
    if (!(await confirmDialog({ title: t('dw.archiveTitle'), message: t('dw.archiveMsg'), confirmLabel: t('dw.archive'), tone: 'danger' }))) return;
    try { await api.documents.archive(id); toast(t('dw.archived'), { tone: 'primary' }); ctx.navigate('#/documents'); } catch (e) { toast(errMsg(e, t('dw.archiveFailed')), { tone: 'danger' }); }
  }
  async function deleteDoc() {
    if (!(await confirmDialog({ title: t('dw.deleteTitle'), message: t('dw.deleteMsg'), confirmLabel: t('dw.delete'), tone: 'danger' }))) return;
    try { await api.documents.remove(id); toast(t('dw.deleted'), { tone: 'primary' }); ctx.navigate('#/documents'); } catch (e) { toast(errMsg(e, t('dw.deleteFailed')), { tone: 'danger' }); }
  }

  // ---------- layout / tabs ----------
  function tabItems() {
    const d = S.doc;
    return [
      ...(wide ? [] : [{ id: 'source', label: t('dw.tab.source') }]),
      { id: 'details', label: t('dw.tab.details') },
      { id: 'issues', label: t('dw.tab.issues'), badge: S.issues.length },
      { id: 'research', label: t('dw.tab.research') },
      { id: 'authorities', label: t('dw.tab.authorities'), badge: (d.extraction?.authorities || []).length },
      { id: 'drafts', label: t('dw.tab.drafts'), badge: (d.drafts || []).length },
    ];
  }
  function paintTabs() {
    if (wide && S.tab === 'source') S.tab = 'details';
    clear(host.tabsHost);
    tabsEl = tabs({ items: tabItems(), active: S.tab, label: t('dw.tabs'), onChange: (tid) => { S.tab = tid; paintPanel(); } });
    host.tabsHost.append(tabsEl);
  }
  function placeSource() {
    clear(host.source);
    if (wide) { host.source.append(h('h2', { class: 'dc-h' }, t('dw.source')), src); src.start(); }
    host.source.hidden = !wide;
  }
  function onBreakpoint() {
    wide = !!(mq && mq.matches);
    paintTabs(); placeSource(); paintPanel();
  }

  function paintPanel() {
    clear(host.panel);
    host.panel.setAttribute('aria-labelledby', tabsEl.tabId(S.tab));
    const fn = { source: panelSource, details: panelDetails, issues: panelIssues, research: panelResearch, authorities: panelAuthorities, drafts: panelDrafts }[S.tab];
    host.panel.append(fn());
  }
  function refresh() { paintSteps(); paintTabsKeep(); paintRail(); }
  function paintTabsKeep() { paintTabs(); }

  function panelSource() { queueMicrotask(() => src.start()); return src; }

  // ---------- details ----------
  const saveStatus = h('span', { class: 'dc-status', role: 'status', 'aria-live': 'polite' });
  function setSaveMsg(m) { S.saveMsg = m; saveStatus.textContent = m; }
  function markDirty() { if (!S.dirty) { S.dirty = true; setSaveMsg(t('dw.unsaved')); } }

  function panelDetails() {
    const view = fieldsView(S.fields);
    const rows = view.map(({ key, value, empty }) => {
      const long = LONG_FIELDS.includes(key);
      const ctl = long ? textarea({ name: key, rows: key === 'facts' ? 8 : 4, placeholder: t('dw.notFoundField') }) : input({ name: key, placeholder: t('dw.notFoundField') });
      ctl.value = value;
      const f = field({ label: t(`dw.f.${key}`), input: ctl, hint: empty ? t('dw.notFoundField') : undefined });
      ctl.addEventListener('input', () => { S.fields[key] = ctl.value; markDirty(); });
      return f;
    });
    setSaveMsg(S.saveMsg);
    return h('div', { class: 'dc-pane' },
      S.doc.sexual_offence_matter ? banner({ tone: 'warn', message: t('dw.victimWarning') }) : null,
      h('p', { class: 'dc-note' }, t('dw.fieldsNote')),
      h('div', { class: 'dc-fields' }, ...rows),
      h('div', { class: 'dc-bar' }, button({ label: S.saving ? t('dw.saving') : t('dw.save'), variant: 'primary', disabled: S.saving, onClick: () => save() }), saveStatus));
  }

  async function handleConflict() {
    const reload = await confirmDialog({ title: t('dw.conflictTitle'), message: t('dw.conflictMsg'), confirmLabel: t('dw.reload'), cancelLabel: t('dw.keepEditing') });
    if (reload) {
      try { adopt(await api.documents.get(id)); setSaveMsg(''); refresh(); paintHead(); paintPanel(); } catch (e) { toast(errMsg(e, t('dw.error')), { tone: 'danger' }); }
    }
  }
  async function save() {
    if (S.saving) return false;
    S.saving = true; setSaveMsg(t('dw.saving'));
    try {
      const res = await api.documents.saveExtraction(id, { fields: S.fields, issues: S.issues, version: S.doc.extraction.version });
      adopt(res); S.ack = false; setSaveMsg(t('dw.saved', { v: S.doc.extraction.version }));
      S.saving = false; paintHead(); refresh(); paintPanel(); say(t('dw.saved', { v: S.doc.extraction.version }));
      return true;
    } catch (e) {
      S.saving = false;
      if (e && (e.code === 'VERSION_CONFLICT' || e.status === 409)) { setSaveMsg(t('dw.conflictTitle')); await handleConflict(); } else { setSaveMsg(t('dw.saveFailed')); toast(errMsg(e, t('dw.saveFailed')), { tone: 'danger' }); }
      return false;
    }
  }

  // ---------- issues ----------
  function panelIssues() {
    const ex = S.doc.extraction || {};
    const listBox = h('div', { class: 'dc-listbox' });
    const ta = textarea({ name: 'issues', rows: 7 }); ta.value = issuesToText(S.issues);
    const taField = field({ label: t('dw.issuesText'), input: ta });
    const confirmBox = h('div', { class: 'dc-confirm', 'aria-live': 'polite' });
    const paintList = () => { clear(listBox); listBox.append(issueList(S.issues, {
      onMove: (a, b) => { S.issues = moveItem(S.issues, a, b); ta.value = issuesToText(S.issues); markDirty(); paintList(); },
      onRemove: (i) => { S.issues = removeItem(S.issues, i); ta.value = issuesToText(S.issues); markDirty(); paintList(); },
    })); };
    ta.addEventListener('input', () => { S.issues = issuesFromText(ta.value); markDirty(); paintList(); });
    const ackBox = h('input', { type: 'checkbox', id: 'dc-ack' }); ackBox.checked = S.ack;
    const confirmBtn = button({ label: S.confirming ? t('dw.confirming') : t('dw.confirm'), variant: 'primary', disabled: S.confirming, onClick: () => confirmNow() });
    ackBox.addEventListener('change', () => { S.ack = ackBox.checked; S.confirmMissing = null; paintSteps(); });

    function paintConfirm() {
      clear(confirmBox);
      if (S.confirmMissing) {
        confirmBox.append(h('div', { class: 'dc-warn', role: 'alert' }, h('strong', {}, t('dw.incompleteTitle')), ' ', t('dw.incompleteMsg'),
          h('ul', {}, ...S.confirmMissing.map((k) => h('li', {}, k === 'issues' ? t('dw.miss.issues') : t(`dw.f.${k}`))))));
      } else if (S.confirmErr) confirmBox.append(h('p', { class: 'dc-warn', role: 'alert' }, S.confirmErr));
    }
    paintList(); paintConfirm();
    async function confirmNow() {
      S.confirmErr = '';
      const missing = missingForConfirm(S.fields, S.issues);
      if (missing.length) { S.confirmMissing = missing; paintConfirm(); return; }
      if (!S.ack) { S.confirmErr = t('dw.confirmNeedsAck'); S.confirmMissing = null; paintConfirm(); ackBox.focus(); return; }
      S.confirmMissing = null; S.confirming = true; confirmBtn.disabled = true;
      try {
        if (S.dirty && !(await save())) { S.confirming = false; confirmBtn.disabled = false; return; }
        const res = await api.documents.confirm(id, S.doc.extraction.version);
        adopt(res); S.confirming = false;
        paintHead(); refresh(); paintPanel(); say(t('dw.confirmed')); toast(t('dw.confirmed'), { tone: 'primary' });
      } catch (e) {
        S.confirming = false;
        if (e && e.code === 'VERSION_CONFLICT') { await handleConflict(); return; }
        if (e && (e.code === 'EXTRACTION_INCOMPLETE' || e.status === 422)) {
          S.confirmMissing = missingForConfirm(S.fields, S.issues);
          if (!S.confirmMissing.length) { S.confirmMissing = null; S.confirmErr = errMsg(e, t('dw.confirmFailed')); }
        } else S.confirmErr = errMsg(e, t('dw.confirmFailed'));
        paintConfirm(); confirmBtn.disabled = false;
      }
    }
    return h('div', { class: 'dc-pane' },
      h('p', { class: 'dc-note' }, t('dw.issuesLede')), taField, listBox,
      ex.confirmed ? banner({ tone: 'primary', message: t('dw.confirmedNote', { v: ex.version }) }) : null,
      h('div', { class: 'dc-ack' }, ackBox, h('label', { for: 'dc-ack' }, t('dw.ack'))),
      h('div', { class: 'dc-bar' }, button({ label: t('dw.save'), variant: 'secondary', disabled: S.saving, onClick: () => save() }), confirmBtn, saveStatus), confirmBox);
  }

  // ---------- research ----------
  const resultsLive = h('div', { class: 'dc-results', 'aria-live': 'polite' });
  async function pinToggle(row, issue) {
    try {
      if (isPinned(S.pins, row.id)) {
        S.pins = (await api.documents.removePin(id, row.id))?.items || []; toast(t('dw.pinRemoved'), { tone: 'primary' });
      } else {
        if (pinsFull(S.pins)) { toast(t('dw.pinsFull', { max: PINS_MAX }), { tone: 'warn' }); return; }
        S.pins = (await api.documents.addPin(id, { judgment_id: row.id, issue_ref: issue }))?.items || []; toast(t('dw.pinAdded'), { tone: 'primary' });
      }
      S.doc.pins_count = S.pins.length; refresh(); paintResults();
    } catch (e) {
      if (e && (e.code === 'PINS_FULL' || e.status === 409)) toast(t('dw.pinsFull', { max: PINS_MAX }), { tone: 'warn' }); else toast(errMsg(e, t('dw.pinFailed')), { tone: 'danger' });
    }
  }
  function paintResults() {
    clear(resultsLive);
    if (S.researchBusy) { resultsLive.append(skeleton({ lines: 5 })); return; }
    const r = S.research; if (!r) return;
    (r.issues || []).forEach((sec, n) => {
      const hid = `dc-is-${n}`;
      const rows = Array.isArray(sec.results) ? sec.results : [];
      resultsLive.append(h('section', { class: 'dc-issue-sec', 'aria-labelledby': hid },
        h('h3', { class: 'dc-h', id: hid }, t('dw.issueSection', { n: n + 1, issue: sec.issue })),
        h('div', { class: 'dc-sec__act' }, button({ label: t('dw.openInResearch'), variant: 'ghost', icon: 'external', href: researchHref(sec.query || sec.issue) })),
        rows.length ? h('div', { class: 'rs-results' }, ...rows.map((row) => {
          const pinned = isPinned(S.pins, row.id);
          return resultCard(row, { idPrefix: `dc-r${n}`, actions: [
            button({ label: pinned ? t('dw.unpin') : t('dw.pin'), variant: pinned ? 'primary' : 'secondary', icon: pinned ? 'check' : undefined, onClick: () => pinToggle(row, sec.issue) }),
            button({ label: t('rs.openReader'), variant: 'ghost', href: `#/judgments/${encodeURIComponent(row.id)}` })] });
        })) : h('p', { class: 'dc-note' }, t('dw.noResults'))));
    });
    const st = r.statutes && Array.isArray(r.statutes.results) ? r.statutes.results : null;
    if (st) {
      resultsLive.append(h('section', { class: 'dc-issue-sec', 'aria-labelledby': 'dc-stat' }, h('h3', { class: 'dc-h', id: 'dc-stat' }, t('dw.statutes')),
        st.length ? h('ul', { class: 'dc-list' }, ...st.map((x) => h('li', {}, String(x.title || x.section || x.heading || x.name || x.id || '')))) : h('p', { class: 'dc-note' }, t('dw.statutesNone'))));
    }
  }
  async function runResearch() {
    S.researchBusy = true; paintPanel();
    try {
      S.research = await api.documents.research(id, {});
      S.researched = true; S.researchBusy = false;
      paintPanel(); paintSteps(); say(t('dw.researchDone', { n: (S.research.issues || []).length }));
    } catch (e) {
      S.researchBusy = false; paintPanel(); toast(errMsg(e, t('dw.researchFailed')), { tone: 'danger' });
    }
  }
  function panelResearch() {
    const ok = researchReady(S.doc, canSearch());
    const why = !S.doc.extraction?.confirmed ? t('dw.researchLocked') : !canSearch() ? t('dw.researchNoPerm') : '';
    paintResults();
    return h('div', { class: 'dc-pane' },
      h('h2', { class: 'dc-h' }, t('dw.researchTitle')), h('p', { class: 'dc-note' }, t('dw.researchLede')),
      h('div', { class: 'dc-bar' }, button({ label: S.researchBusy ? t('dw.researchRunning') : t('dw.researchRun'), variant: 'primary', icon: 'search', disabled: !ok || S.researchBusy, onClick: runResearch }),
        why ? h('span', { class: 'dc-note' }, why) : null),
      resultsLive);
  }

  // ---------- authorities, drafts ----------
  function panelAuthorities() {
    const list = S.doc.extraction?.authorities || [];
    return h('div', { class: 'dc-pane' }, h('h2', { class: 'dc-h' }, t('dw.authTitle')), h('p', { class: 'dc-note' }, t('dw.authNote')),
      list.length ? h('ul', { class: 'dc-list' }, ...list.map((a) => {
        const s = authorityStatus(a.status);
        return h('li', { class: 'dc-auth' },
          h('div', { class: 'dc-auth__top' }, h('strong', {}, a.citation), chip({ label: t(`dw.auth.${s.key}`), tone: s.tone, icon: s.tone === 'danger' ? 'alert' : undefined })),
          a.matched_title ? h('p', { class: 'dc-note' }, t('dw.authMatched', { title: a.matched_title })) : null,
          a.matched_id ? button({ label: t('dw.authOpen'), variant: 'ghost', href: `#/judgments/${encodeURIComponent(a.matched_id)}` }) : null);
      })) : emptyState({ title: t('dw.authNone') }));
  }
  function panelDrafts() {
    const list = S.doc.drafts || [];
    return h('div', { class: 'dc-pane' }, h('h2', { class: 'dc-h' }, t('dw.draftsTitle')),
      list.length ? h('ul', { class: 'dc-list' }, ...list.map((d) => h('li', { class: 'dc-auth' },
        h('div', { class: 'dc-auth__top' }, h('strong', {}, d.case_title || `#${d.id}`), draftStatusChip(d.status), chip({ label: t('dw.draftVer', { v: d.version }), tone: 'neutral' })),
        button({ label: t('dw.draftOpen'), variant: 'ghost', href: `#/drafts/${encodeURIComponent(d.id)}` }))))
        : emptyState({ title: t('dw.draftsNone') }));
  }

  // ---------- rail ----------
  async function startDraft() {
    if (S.starting) return;
    S.starting = true; paintRail();
    try {
      const res = await api.documents.draftParams(id);
      store.set('intakeParams', intakeParamsFrom(res), { session: true });
      store.set('benchBrief', benchFromAuthorities(res?.authorities), { session: true });
      ctx.navigate('#/drafts/new');
    } catch (e) { S.starting = false; paintRail(); toast(errMsg(e, t('dw.startFailed')), { tone: 'danger' }); }
  }
  async function unpin(p) {
    try { S.pins = (await api.documents.removePin(id, p.judgment_id))?.items || []; S.doc.pins_count = S.pins.length; toast(t('dw.pinRemoved'), { tone: 'primary' }); refresh(); paintResults(); } catch (e) { toast(errMsg(e, t('dw.pinFailed')), { tone: 'danger' }); }
  }
  function paintRail() {
    const d = S.doc; const red = redactionSummary(d.redactions, d.redaction_total);
    const ready = draftReady(d, canDraft());
    const why = !d.extraction?.confirmed ? t('dw.startLocked') : !canDraft() ? t('dw.startNoPerm') : '';
    clear(host.rail);
    host.rail.append(
      card({ title: t('dw.redTitle') },
        red.total ? h('p', { class: 'dc-note' }, t('dw.redTotal', { n: red.total })) : h('p', { class: 'dc-note' }, t('dw.redNone')),
        red.items.length ? h('ul', { class: 'dc-list dc-list--tight' }, ...red.items.map((r) => h('li', {}, `${t(`dw.red.${r.type}`) === `dw.red.${r.type}` ? r.type : t(`dw.red.${r.type}`)}: ${r.count}`))) : null,
        h('p', { class: 'dc-note' }, t('dw.redNames'))),
      card({ title: t('dw.pinsTitle', { n: S.pins.length, max: PINS_MAX }) },
        S.pins.length ? h('ul', { class: 'dc-list dc-list--tight' }, ...S.pins.map((p) => h('li', { class: 'dc-pin' },
          h('a', { href: `#/judgments/${encodeURIComponent(p.judgment_id)}` }, p.title || String(p.judgment_id)), p.citation ? h('span', { class: 'dc-note' }, ` ${p.citation}`) : null,
          button({ label: '×', ariaLabel: t('dw.removePin', { title: p.title || p.judgment_id }), variant: 'ghost', onClick: () => unpin(p) }))))
          : h('p', { class: 'dc-note' }, t('dw.pinsNone'))),
      h('div', { class: 'dc-start' },
        button({ label: S.starting ? t('dw.starting') : t('dw.startDraft'), variant: 'primary', icon: 'edit', disabled: !ready || S.starting, onClick: startDraft }),
        !ready && why ? h('p', { class: 'dc-note' }, why) : null));
  }

  // ---------- build ----------
  function build() {
    clear(root);
    wide = !!(mq && mq.matches);
    src = sourceView(S.doc);
    paintHead(); paintSteps(); paintTabs(); placeSource(); paintRail(); paintPanel();
    root.append(host.head, host.steps, live,
      h('div', { class: 'dc-cols' }, host.source, h('section', { class: 'dc-col dc-col--main' }, host.tabsHost, host.panel), host.rail));
    if (mq) { mq.addEventListener('change', onBreakpoint); cleanup.push(() => mq.removeEventListener('change', onBreakpoint)); }
    cleanup.push(() => { if (src && src.release) src.release(); });
  }

  cleanup.forEach((f) => f()); cleanup = [];
  load();
  return root;
}

export default { route: '/documents/:id', title: 'Document', permission: ['UPLOAD_PLEADING', 'DRAFT_FULL'], render, onLeave() { cleanup.forEach((f) => f()); cleanup = []; } };
