// citationChip({citation, status, curated, href}) -> inline chip with citation text and status word.
// status: string ('verified'|'followed' -> green, 'unverified'|'distinguished'|'doubted' -> amber,
// 'overruled'|'not found' -> red) or {label, tone}. Links to the source when href is given.
// Example: citationChip({citation:'AIR 1973 SC 1461', status:'verified', href:'#/judgment/9'})
import { h } from '../dom.js';
import { safeUrl } from './a11y.js';

export function citationTone(status) {
  if (status && typeof status === 'object') return status.tone || 'neutral';
  const s = String(status || '').toLowerCase();
  if (/(unverified|pending|partial)/.test(s)) return 'warn';
  if (/(verified|followed|good|pass|valid)/.test(s)) return 'primary';
  if (/(overrul|bad|fail|invalid|reversed|not found)/.test(s)) return 'danger';
  if (/(warn|distinguish|doubt|criticis)/.test(s)) return 'warn';
  return 'neutral';
}
export function citationChip({ citation, status, curated, href } = {}) {
  const label = status && typeof status === 'object' ? status.label : status;
  const kids = [
    h('span', { class: 'g-cite__text' }, citation),
    label ? h('span', { class: 'g-cite__status' }, String(label)) : null,
    curated ? h('span', { class: 'g-cite__curated' }, 'Curated') : null,
  ];
  const cls = `g-cite g-cite--${citationTone(status)}`;
  const safe = href ? safeUrl(href) : null;
  return safe ? h('a', { class: cls, href: safe }, ...kids) : h('span', { class: cls }, ...kids);
}
