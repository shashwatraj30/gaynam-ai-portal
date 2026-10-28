// Shared authority result card (same markup and classes as the card in pages/research.js; needs css/page-research.css + page-judgment.css).
// resultCard(row, {actions: Node[], selected, idPrefix, onSelect}) -> <article class="rs-res">.
// With onSelect the title is a button (as in Research); without it the title links to the reader.
import { h, icon } from '../../dom.js';
import { t } from '../../i18n/index.js';
import '../../i18n/pages/research.en.js';
import '../../i18n/pages/research.hi.js';
import { formatDate, formatNumber } from '../../format.js';
import { chip } from '../../ui/chip.js';
import { honestView, snippet } from './judgment-logic.js';
import { statusChip, metaList } from './judgment-ui.js';

export function resultCard(r, { actions = [], selected = false, idPrefix = 'rs-t', onSelect } = {}) {
  const v = honestView(r);
  const id = `${idPrefix}-${r.id}`;
  const meta = [r.court, r.bench, v.year ? (r.judgment_date ? formatDate(r.judgment_date) : String(v.year)) : null].filter(Boolean).join(' · ');
  const label = r.title || t('jr.untitled');
  const title = onSelect
    ? h('button', { type: 'button', class: 'rs-res__sel', 'aria-pressed': selected ? 'true' : 'false', onClick: () => onSelect(r) }, label)
    : h('a', { class: 'rs-res__sel', href: `#/judgments/${encodeURIComponent(r.id)}` }, label);
  return h('article', { class: `rs-res${selected ? ' rs-res--on' : ''}${v.overruled ? ' rs-res--bad' : ''}`, 'aria-labelledby': id },
    h('div', { class: 'rs-res__top' },
      statusChip(r.precedent_status, v.curated),
      v.curated ? chip({ label: t('jr.curated'), tone: 'info' }) : null,
      r.bench_label ? chip({ label: r.bench_label, tone: 'neutral' }) : null),
    h('h3', { class: 'rs-res__title', id }, title),
    h('p', { class: 'rs-res__meta' }, meta),
    h('p', { class: 'rs-res__cite' },
      v.cite ? `${v.cite.label === 'CNR' ? t('jr.cnr') : t('jr.citation')}: ${v.cite.value}` : null,
      v.curated && v.citedCount != null ? ` · ${t('jr.citedN', { n: formatNumber(v.citedCount) })}` : null),
    v.overruled ? h('p', { class: 'rs-warn', role: 'note' }, icon('alert', 16), ' ', v.overruledBy ? t('jr.overruledBy', { by: v.overruledBy }) : t('jr.overruledNoBy')) : null,
    v.curated && v.ratio ? h('p', { class: 'rs-res__ratio' }, snippet(v.ratio)) : metaList([
      [t('jr.coram'), r.judges], [t('jr.disposition'), v.disposition], [t('jr.statutes'), r.statutes_considered && snippet(r.statutes_considered, 120)],
    ], 'jr-meta jr-meta--inline'),
    actions.length ? h('div', { class: 'rs-res__act' }, ...actions) : null);
}
