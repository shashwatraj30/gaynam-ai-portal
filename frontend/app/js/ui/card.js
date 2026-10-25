// card({title, actions, class}, ...children) -> <section class="g-card">
// actions: Node | Node[] shown at the right of the header. Example: card({title:'Facts', actions:button({...})}, p)
import { h } from '../dom.js';
import { uid } from './a11y.js';

export function card({ title, actions, class: cls } = {}, ...children) {
  const id = title ? uid('card') : null;
  const head = (title || actions)
    ? h('header', { class: 'g-card__head' },
        title ? h('h2', { class: 'g-card__title', id }, title) : null,
        actions ? h('div', { class: 'g-card__actions' }, actions) : null)
    : null;
  return h('section', { class: `g-card${cls ? ' ' + cls : ''}`, role: 'group', 'aria-labelledby': id }, head, h('div', { class: 'g-card__body' }, ...children));
}
