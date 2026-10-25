// emptyState({title, message, action(Node)}) -> centred "nothing here" block.
import { h } from '../dom.js';
import { tf } from '../i18n/index.js';

export function emptyState({ title, message, action } = {}) {
  return h('div', { class: 'g-empty' },
    h('h3', { class: 'g-empty__title' }, title || tf('state.empty', 'Nothing here yet')),
    message ? h('p', { class: 'g-empty__msg' }, message) : null,
    action || null);
}
