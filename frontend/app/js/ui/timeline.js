// timeline(events:[{time, title, detail, user}]) -> <ol class="g-timeline">
import { h } from '../dom.js';

export function timeline(events = []) {
  return h('ol', { class: 'g-timeline' }, ...events.map((e) => h('li', { class: 'g-timeline__item' },
    h('span', { class: 'g-timeline__dot', 'aria-hidden': 'true' }),
    h('div', { class: 'g-timeline__body' },
      h('div', { class: 'g-timeline__title' }, e.title),
      e.detail ? h('div', { class: 'g-timeline__detail' }, e.detail) : null,
      h('div', { class: 'g-timeline__meta' }, [e.time, e.user].filter(Boolean).join(' - '))))));
}
