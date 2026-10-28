// Studio right-rail insight panels: Applicable sections, Solved precedents, Why the judgment was given.
// createInsights({ api, onInsert }) -> { el, update({params, texts, engine, precedents, authorities, canEdit}), destroy() }.
// Every precedent row has "Insert into section 10 / 15": onInsert(sectionNumber, precedent) -> {added} (the page edits the text and
// marks it dirty); the result is announced in an aria-live region. Pinned authorities (from the hand-off) are listed first.
// The element is persistent (the page re-appends it when it repaints); each panel is a collapsible card
// (button with aria-expanded) with a "?" help toggle. Solved precedents search lazily (only while the panel is open),
// debounced, one search per section, and stale responses are ignored.
import { h, clear } from '../../dom.js';
import { t } from '../../i18n/index.js';
import { card } from '../../ui/card.js';
import { chip } from '../../ui/chip.js';
import { banner } from '../../ui/banner.js';
import { skeleton } from '../../ui/skeleton.js';
import { errorState } from '../../ui/error-state.js';
import { emptyState } from '../../ui/empty-state.js';
import { listRow } from '../../ui/list-row.js';
import { precedentChip } from '../../ui/status.js';
import { button } from '../../ui/button.js';
import { sectionsForDraft, pickSearchSections, sectionsKey, buildSearchBody, mergeResults, createLatest, deriveWhy, sectionLabel, DEBOUNCE_MS } from './studio-insights.js';

const IDLE = { status: 'idle', rows: [], failed: 0, total: 0, more: 0, error: null };

export function createInsights({ api, onInsert = () => ({ added: false }), setTimer = (f, ms) => setTimeout(f, ms), clearTimer = (id) => clearTimeout(id) }) {
  const el = h('div', { class: 'studio-ins' });
  const latest = createLatest();
  const open = { sections: true, prec: false, why: true };
  const help = { sections: false, prec: false, why: false };
  let input = { params: {}, texts: {}, engine: '', precedents: [], authorities: [], canEdit: false };
  const live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  let liveTimer = null;
  function say(msg) { live.textContent = ''; if (liveTimer != null) clearTimer(liveTimer); liveTimer = setTimer(() => { live.textContent = msg; }, 30); }
  let lastKey = null; let timer = null; let ctl = null; let destroyed = false;
  let fetchState = { ...IDLE };
  const bodies = {};

  function panel(id, titleKey, noteKey, helpKey) {
    const body = h('div', { class: 'studio-ins__body', id: `studio-ins-${id}` });
    const helpP = h('p', { class: 'g-meta studio-ins__help', id: `studio-ins-help-${id}` }, t(helpKey));
    const toggle = h('button', { type: 'button', class: 'studio-ins__toggle', 'aria-expanded': String(open[id]), 'aria-controls': `studio-ins-wrap-${id}` }, t(titleKey));
    const q = h('button', { type: 'button', class: 'studio-ins__q', 'aria-expanded': String(help[id]), 'aria-controls': `studio-ins-help-${id}`, 'aria-label': t('studio.ins.helpLabel') }, '?');
    const wrap = h('div', { class: 'studio-ins__panelbody', id: `studio-ins-wrap-${id}` }, helpP, h('p', { class: 'g-meta studio-ins__note' }, t(noteKey)), body);
    const sync = () => {
      toggle.setAttribute('aria-expanded', String(open[id])); wrap.hidden = !open[id];
      q.setAttribute('aria-expanded', String(help[id])); helpP.hidden = !help[id];
    };
    toggle.addEventListener('click', () => { open[id] = !open[id]; sync(); if (id === 'prec' && open[id]) schedule({ now: true }); });
    q.addEventListener('click', () => { help[id] = !help[id]; if (help[id] && !open[id]) open[id] = true; sync(); });
    sync();
    bodies[id] = body;
    return card({ class: 'studio-ins__card', title: h('span', { class: 'studio-ins__titlerow' }, toggle, q) }, wrap);
  }
  el.append(
    panel('sections', 'studio.ins.sections.title', 'studio.ins.sections.note', 'studio.ins.sections.help'),
    panel('prec', 'studio.ins.prec.title', 'studio.ins.prec.note', 'studio.ins.prec.help'),
    panel('why', 'studio.ins.why.title', 'studio.ins.why.note', 'studio.ins.why.help'));

  // ---------- panel 1 ----------
  function paintSections() {
    const b = bodies.sections; clear(b);
    const { rows } = sectionsForDraft(input.params, input.texts);
    if (!rows.length) { b.append(emptyState({ title: t('studio.ins.sections.empty'), message: t('studio.ins.sections.emptyMsg') })); return; }
    b.append(h('ul', { class: 'studio-ins__list g-reset-list' }, ...rows.map((r) => h('li', { class: 'studio-ins__item' },
      h('div', { class: 'studio-ins__head' },
        h('strong', {}, sectionLabel({ num: r.num, act: r.act })),
        r.actLabel ? h('span', { class: 'g-meta' }, r.actLabel) : null),
      r.known
        ? h('div', { class: 'studio-ins__detail' },
          h('p', {}, r.title),
          r.assumedAct ? h('p', { class: 'g-meta' }, t('studio.ins.sections.assumed')) : null,
          h('p', { class: 'g-meta' }, `${t('studio.ins.sections.nature')}: ${r.nature}`),
          h('p', { class: 'g-meta' }, `${t('studio.ins.sections.penalty')}: ${r.penalty}`),
          r.bns ? h('p', { class: 'g-meta' }, `${t('studio.ins.sections.bns')}: ${r.bns}`) : null)
        : h('div', { class: 'studio-ins__detail' },
          chip({ label: t(r.unsupportedAct ? 'studio.ins.sections.unsupported' : 'studio.ins.sections.unknown'), tone: 'neutral' }),
          r.actNotStated ? h('p', { class: 'g-meta' }, t('studio.ins.sections.notStated')) : null),
      r.inRange ? h('p', { class: 'g-meta' }, t('studio.ins.sections.range')) : null))));
  }

  // ---------- panel 2 ----------
  function precRow(p) {
    const pc = precedentChip(p.precedent_status || p.status, { curated: p.is_curated === true });
    const name = p.title || p.case_title || p.citation || '-';
    const insert = (n) => {
      const r = onInsert(n, p);
      say(r && r.added ? t('studio.ins.prec.inserted', { n }) : t(input.canEdit ? 'studio.ins.prec.already' : 'studio.ins.prec.locked', { n }));
    };
    return h('div', { class: 'studio-ins__prec' },
      listRow({
        title: name,
        meta: [p.citation, p.court, p.matchedSections && p.matchedSections.length ? t('studio.ins.prec.matched', { sections: p.matchedSections.join(', ') }) : ''].filter(Boolean).join(' · '),
        status: pc.label ? chip({ label: pc.label, tone: pc.tone }) : null, href: p.id != null ? `#/judgments/${p.id}` : undefined,
      }),
      input.canEdit ? h('div', { class: 'studio-ins__ins' },
        button({ label: t('studio.ins.prec.insert10'), variant: 'ghost', ariaLabel: t('studio.ins.prec.insertAria10', { title: name }), onClick: () => insert(10) }),
        button({ label: t('studio.ins.prec.insert15'), variant: 'ghost', ariaLabel: t('studio.ins.prec.insertAria15', { title: name }), onClick: () => insert(15) })) : null);
  }
  function paintPrec() {
    const b = bodies.prec; clear(b);
    const s = fetchState;
    b.append(live);
    if (input.authorities && input.authorities.length) {
      b.append(h('h3', { class: 'studio-ins__sub' }, t('studio.ins.prec.pinned')), h('div', { class: 'studio-ins__rows' }, ...input.authorities.map(precRow)));
    }
    if (s.status === 'idle') { b.append(emptyState({ title: t('studio.ins.prec.idle'), message: t('studio.ins.prec.idleMsg') })); return; }
    if (s.status === 'loading') { b.append(skeleton({ lines: 4 })); return; }
    if (s.status === 'error') { b.append(errorState({ message: s.error?.message, requestId: s.error?.requestId, onRetry: () => schedule({ now: true, force: true }), retryLabel: t('state.retry') })); return; }
    if (s.more) b.append(banner({ tone: 'info', message: t('studio.ins.prec.more', { n: s.total, extra: s.more }) }));
    if (s.failed) b.append(banner({ tone: 'warn', message: t('studio.ins.prec.partial', { n: s.failed, total: s.total }), action: { label: t('state.retry'), onClick: () => schedule({ now: true, force: true }) } }));
    if (!s.rows.length) { b.append(emptyState({ title: t('studio.ins.prec.empty'), message: t('studio.ins.prec.emptyMsg') })); return; }
    b.append(h('div', { class: 'studio-ins__rows' }, ...s.rows.map(precRow)));
  }

  // ---------- panel 3 ----------
  function paintWhy() {
    const b = bodies.why; clear(b);
    const w = deriveWhy({ texts: input.texts, engine: input.engine, precedents: [...(input.precedents || []), ...fetchState.rows] });
    if (!w.excerpts.length && !w.curated.length) { b.append(emptyState({ title: t('studio.ins.why.empty'), message: t('studio.ins.why.emptyMsg') })); return; }
    if (w.template && w.excerpts.length) b.append(banner({ tone: 'warn', message: t('studio.ins.why.template') }));
    if (w.excerpts.length) {
      b.append(h('ul', { class: 'studio-ins__list g-reset-list' }, ...w.excerpts.map((x) => h('li', { class: 'studio-ins__item' },
        h('strong', {}, `${x.n}. ${t(`studio.sec.${x.n}`)}`), h('p', { class: 'studio-ins__quote' }, x.text)))));
    }
    if (w.curated.length) {
      b.append(h('h3', { class: 'studio-ins__sub' }, t('studio.ins.why.curated')),
        h('ul', { class: 'studio-ins__list g-reset-list' }, ...w.curated.map((c) => h('li', { class: 'studio-ins__item' },
          c.id != null ? h('a', { href: `#/judgments/${c.id}` }, c.title || c.citation) : h('strong', {}, c.title || c.citation),
          h('p', { class: 'studio-ins__quote' }, c.ratio)))));
    }
  }

  // ---------- fetching ----------
  async function run() {
    const { all } = sectionsForDraft(input.params, input.texts);
    const { picked, more } = pickSearchSections(all);
    if (!picked.length) { fetchState = { ...IDLE }; paintPrec(); paintWhy(); return; }
    if (ctl) ctl.abort();
    const mine = new AbortController(); ctl = mine;
    const token = latest.next();
    fetchState = { ...IDLE, status: 'loading' }; paintPrec();
    const settled = await Promise.allSettled(picked.map((sec) => api.search(buildSearchBody(sec), { signal: mine.signal })));
    if (destroyed || !latest.isCurrent(token)) return; // stale: a newer search started or the page left
    const ok = []; let failed = 0; let firstErr = null;
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') ok.push({ sec: picked[i], results: r.value?.results });
      else { failed++; firstErr = firstErr || r.reason; }
    });
    fetchState = ok.length
      ? { status: 'done', rows: mergeResults(ok), failed, total: picked.length, more, error: null }
      : { status: 'error', rows: [], failed, total: picked.length, more, error: firstErr };
    paintPrec(); paintWhy();
  }
  function schedule({ now = false, force = false } = {}) {
    if (destroyed) return;
    const { all } = sectionsForDraft(input.params, input.texts);
    const key = sectionsKey(pickSearchSections(all).picked);
    if (!open.prec && !force) {
      if (key !== lastKey && lastKey !== null) { lastKey = null; latest.invalidate(); if (ctl) ctl.abort(); fetchState = { ...IDLE }; paintPrec(); paintWhy(); }
      return;
    }
    if (!force && key === lastKey) return;
    lastKey = key;
    if (timer != null) { clearTimer(timer); timer = null; }
    if (!key) { latest.invalidate(); if (ctl) ctl.abort(); fetchState = { ...IDLE }; paintPrec(); return; }
    fetchState = { ...IDLE, status: 'loading' }; paintPrec();
    if (now) { run(); return; }
    timer = setTimer(() => { timer = null; run(); }, DEBOUNCE_MS);
  }

  paintSections(); paintPrec(); paintWhy();
  return {
    el,
    update(next) {
      const prevKey = JSON.stringify([input.canEdit, (input.authorities || []).map((a) => a.citation || a.title)]);
      input = { ...input, ...next };
      paintSections(); paintWhy();
      if (JSON.stringify([input.canEdit, (input.authorities || []).map((a) => a.citation || a.title)]) !== prevKey) paintPrec();
      schedule();
    },
    destroy() { destroyed = true; if (timer != null) clearTimer(timer); latest.invalidate(); if (ctl) ctl.abort(); },
  };
}
