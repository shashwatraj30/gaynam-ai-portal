// statTile({label, value, hint, tone}) -> metric tile. value is shown verbatim (format in the caller).
import { h } from '../dom.js';

export function statTile({ label, value, hint, tone = 'neutral' } = {}) {
  return h('div', { class: `g-stat g-stat--${tone}` },
    h('div', { class: 'g-stat__label' }, label),
    h('div', { class: 'g-stat__value' }, String(value ?? '-')),
    hint ? h('div', { class: 'g-stat__hint' }, hint) : null);
}
