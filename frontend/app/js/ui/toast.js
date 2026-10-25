// toast(message, {tone:'neutral|primary|danger|warn|info', duration}) -> self-mounting, announced via aria-live.
// Example: toast('Draft saved', {tone:'primary'})
import { h } from '../dom.js';

let region = null;
function getRegion() {
  if (region && region.parentNode) return region;
  region = h('div', { class: 'g-toasts', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false' });
  document.body.append(region);
  return region;
}
export function toast(message, { tone = 'neutral', duration = 5000 } = {}) {
  const r = getRegion();
  const el = h('div', { class: `g-toast g-toast--${tone}` },
    h('span', { class: 'g-toast__msg' }, String(message)),
    h('button', { type: 'button', class: 'g-toast__x', 'aria-label': 'Dismiss', onClick: () => dismiss() }, '×'));
  const dismiss = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  r.append(el);
  if (duration > 0) setTimeout(dismiss, duration);
  return { el, dismiss };
}
