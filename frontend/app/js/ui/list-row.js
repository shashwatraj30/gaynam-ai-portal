// listRow({title, meta, status(chip Node), selected, href, onClick}) -> <a>/<button>/<div class="g-row">
// Example: listRow({title:'State v. X', meta:'2024, SC', status: chip({label:'Followed',tone:'primary'}), href:'#/judgment/1'})
import { h } from '../dom.js';
import { safeUrl } from './a11y.js';

export function listRow({ title, meta, status, selected, href, onClick } = {}) {
  const cls = `g-row${selected ? ' g-row--selected' : ''}${href || onClick ? ' g-row--action' : ''}`;
  const kids = [
    h('span', { class: 'g-row__main' },
      h('span', { class: 'g-row__title' }, title),
      meta ? h('span', { class: 'g-row__meta' }, meta) : null),
    status ? h('span', { class: 'g-row__status' }, status) : null,
  ];
  const safe = href ? safeUrl(href) : null;
  if (safe) return h('a', { class: cls, href: safe, 'aria-current': selected ? 'true' : null, onClick }, ...kids);
  if (onClick) return h('button', { class: cls, type: 'button', 'aria-pressed': selected ? 'true' : null, onClick }, ...kids);
  return h('div', { class: cls }, ...kids);
}
