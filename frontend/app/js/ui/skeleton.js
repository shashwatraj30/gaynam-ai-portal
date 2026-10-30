// skeleton({lines:3, class}) -> loading placeholder (aria-busy, decorative bars, SR text "Loading").
import { h } from '../dom.js';
import { tf } from '../i18n/index.js';

export function skeleton({ lines = 3, class: cls } = {}) {
  const bars = [];
  for (let i = 0; i < lines; i++) bars.push(h('span', { class: 'g-skel__line', 'aria-hidden': 'true' }));
  return h('div', { class: `g-skel${cls ? ' ' + cls : ''}`, role: 'status', 'aria-busy': 'true' },
    h('span', { class: 'g-sr' }, tf('state.loading', 'Loading')), ...bars);
}

/** Generic outlet placeholder shown by the router while a page's render() is pending (the page type is unknown). */
export function routeLoadingPlaceholder() {
  return skeleton({ lines: 3, class: 'g-skel--route' });
}
