// checkList(items:[{label, state:'pass|fail|pending|unchecked', detail}]) -> <ul>; state shown as icon + word.
import { h, icon as svgIcon } from '../dom.js';
import { tf } from '../i18n/index.js';

export const CHECK_STATES = {
  pass: { word: 'Passed', icon: 'check' },
  fail: { word: 'Failed', icon: 'x' },
  pending: { word: 'Pending', icon: 'clock' },
  unchecked: { word: 'Not checked', icon: 'minus' },
};
export function checkList(items = []) {
  return h('ul', { class: 'g-check' }, ...items.map((it) => {
    const s = CHECK_STATES[it.state] ? it.state : 'unchecked';
    return h('li', { class: `g-check__item g-check__item--${s}` },
      h('span', { class: 'g-check__icon' }, svgIcon(CHECK_STATES[s].icon, 16)),
      h('span', { class: 'g-check__main' },
        h('span', { class: 'g-check__label' }, it.label),
        it.detail ? h('span', { class: 'g-check__detail' }, it.detail) : null),
      h('span', { class: 'g-check__word' }, tf(`ui.check.${s}`, CHECK_STATES[s].word)));
  }));
}
