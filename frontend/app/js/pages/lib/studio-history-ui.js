// Studio version history drawer: list versions, pick two to compare (word diff per section), restore one.
// openHistory({ api, id, getVersion, canRestore, onRestored }) -> drawer. Restore calls api.restoreDraft(id, n, currentVersion).
import { h, clear } from '../../dom.js';
import { t } from '../../i18n/index.js';
import { drawer } from '../../ui/drawer.js';
import { button } from '../../ui/button.js';
import { chip } from '../../ui/chip.js';
import { banner } from '../../ui/banner.js';
import { skeleton } from '../../ui/skeleton.js';
import { errorState } from '../../ui/error-state.js';
import { emptyState } from '../../ui/empty-state.js';
import { confirmDialog } from '../../ui/confirm.js';
import { toast } from '../../ui/toast.js';
import { draftStatusChip } from '../../ui/status.js';
import { formatDateTime } from '../../format.js';
import { toggleCompare, orderPair, classifyConflict } from './studio-logic.js';
import { diffSections } from './diff.js';

export function openHistory({ api, id, getVersion, canRestore = true, onRestored = () => {} }) {
  const body = h('div', { class: 'studio-hist' });
  const dr = drawer({ title: t('studio.hist.title'), body });
  let rows = []; let selected = [];

  async function loadList() {
    clear(body); body.append(h('div', { role: 'status', 'aria-label': t('studio.hist.loading') }, skeleton({ lines: 5 })));
    try {
      const r = await api.draftVersions(id);
      rows = (Array.isArray(r) ? r : (r?.versions || r?.items || [])).slice().sort((a, b) => (b.version || 0) - (a.version || 0));
      paintList();
    } catch (e) {
      clear(body); body.append(errorState({ message: e?.message || t('studio.hist.error'), requestId: e?.requestId, onRetry: loadList, retryLabel: t('state.retry') }));
    }
  }

  function paintList() {
    clear(body);
    if (!rows.length) { body.append(emptyState({ title: t('studio.hist.empty') })); return; }
    const cur = getVersion();
    const cmp = button({ label: t('studio.hist.compare'), variant: 'primary', disabled: selected.length !== 2, onClick: () => compare() });
    body.append(h('p', { class: 'g-meta' }, t('studio.hist.lede')),
      h('div', { class: 'studio-hist__bar' }, cmp, selected.length === 2 ? null : h('span', { class: 'g-meta', role: 'status' }, t('studio.hist.compareNeed'))));
    body.append(h('ul', { class: 'studio-hist__list g-reset-list' }, ...rows.map((v) => {
      const sc = draftStatusChip(v.status);
      const cb = h('input', { type: 'checkbox', id: `hist-${v.version}`, checked: selected.includes(v.version), 'aria-label': t('studio.hist.pick', { n: v.version }) });
      cb.checked = selected.includes(v.version);
      cb.addEventListener('change', () => { selected = toggleCompare(selected, v.version); paintList(); const again = body.querySelector(`#hist-${v.version}`); if (again) again.focus(); });
      return h('li', { class: 'studio-hist__item' }, cb,
        h('div', { class: 'studio-hist__main' },
          h('div', { class: 'studio-hist__title' }, h('strong', {}, t('studio.hist.version', { n: v.version })), v.version === cur ? chip({ label: t('studio.hist.current'), tone: 'info' }) : null, sc ? chip({ label: sc.label, tone: sc.tone }) : null),
          h('div', { class: 'g-meta' }, [v.saved_at ? formatDateTime(v.saved_at) : '', v.saved_by ? t('studio.hist.by', { who: v.saved_by }) : ''].filter(Boolean).join(' · ')),
          v.note ? h('div', { class: 'studio-hist__note' }, v.note) : null),
        canRestore && v.version !== cur ? button({ label: t('studio.hist.restore'), variant: 'secondary', ariaLabel: t('studio.hist.restoreAria', { n: v.version }), onClick: () => restore(v.version) }) : null);
    })));
  }

  async function compare() {
    const [a, b] = orderPair(selected);
    clear(body); body.append(skeleton({ lines: 6 }));
    try {
      const [va, vb] = await Promise.all([api.draftVersion(id, a), api.draftVersion(id, b)]);
      clear(body);
      body.append(button({ label: t('studio.hist.back'), variant: 'ghost', onClick: paintList }), h('h3', { class: 'studio-hist__h' }, t('studio.hist.compareTitle', { a, b })));
      if (!va?.snapshot || !vb?.snapshot) body.append(banner({ tone: 'warn', message: t('studio.hist.noSnapshot') }));
      const secs = diffSections(va?.snapshot, vb?.snapshot).filter((x) => x.changed);
      body.append(h('p', { class: 'g-meta', role: 'status' }, secs.length ? t('studio.hist.changedSections', { n: secs.length }) : t('studio.hist.noChange')),
        h('p', { class: 'g-meta studio-hist__legend' }, h('ins', {}, t('studio.hist.legendIns')), ' ', h('del', {}, t('studio.hist.legendDel'))));
      for (const sec of secs) {
        body.append(h('section', { class: 'studio-hist__sec' }, h('h4', {}, `${sec.n}. ${t(`studio.sec.${sec.n}`)}`),
          h('p', { class: 'studio-hist__diff g-reading' }, ...sec.parts.map((p) => (p.type === 'ins' ? h('ins', {}, p.text) : p.type === 'del' ? h('del', {}, p.text) : p.text)))));
      }
    } catch (e) {
      clear(body); body.append(button({ label: t('studio.hist.back'), variant: 'ghost', onClick: paintList }), errorState({ message: e?.message, requestId: e?.requestId, onRetry: compare, retryLabel: t('state.retry') }));
    }
  }

  async function restore(n) {
    if (!(await confirmDialog({ title: t('studio.hist.restore.title', { n }), message: t('studio.hist.restore.msg', { n }), confirmLabel: t('studio.hist.restore.ok') }))) return;
    try {
      const d = await api.restoreDraft(id, n, getVersion());
      dr.close();
      toast(t('studio.hist.restore.done', { n }), { tone: 'primary' });
      onRestored(d);
    } catch (e) {
      const kind = classifyConflict(e);
      toast(kind === 'DRAFT_SEALED' ? t('studio.hist.restore.sealed') : kind ? t('err.conflict') : (e?.message || t('state.error')), { tone: 'danger' });
    }
  }

  dr.open(); loadList();
  return dr;
}
