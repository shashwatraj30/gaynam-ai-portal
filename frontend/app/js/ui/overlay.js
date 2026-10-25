// Internal: shared dialog behaviour for modal() and drawer().
// Focus moves in on open, Tab is trapped, Esc and backdrop click close, focus returns to the opener.
import { h } from '../dom.js';
import { tf } from '../i18n/index.js';
import { focusables, trapKeydown, uid } from './a11y.js';

export function createOverlay({ kind, title, body, actions, onClose, role = 'dialog', initialFocus }) {
  const titleId = uid('dlg-title');
  const panel = h('div', { class: `g-${kind}__panel`, role, 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
    h('header', { class: `g-${kind}__head` },
      h('h2', { class: `g-${kind}__title`, id: titleId }, title || ''),
      h('button', { type: 'button', class: 'g-btn g-btn--ghost g-overlay__x', 'aria-label': tf('btn.close', 'Close'), onClick: () => api.close() }, '×')),
    h('div', { class: `g-${kind}__body` }, body || null),
    actions ? h('footer', { class: `g-${kind}__actions` }, actions) : null);
  const el = h('div', { class: `g-overlay g-overlay--${kind}` }, panel);
  let opener = null;
  let isOpen = false;

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); api.close(); return; }
    trapKeydown(panel, e);
  });
  el.addEventListener('mousedown', (e) => { if (e.target === el) api.close(); });

  const api = {
    el,
    get isOpen() { return isOpen; },
    open() {
      if (isOpen) return;
      isOpen = true;
      opener = document.activeElement;
      document.body.append(el);
      const target = (initialFocus && initialFocus(panel)) || focusables(panel).find((x) => !x.classList.contains('g-overlay__x')) || panel;
      target.focus();
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      if (el.parentNode) el.parentNode.removeChild(el);
      if (opener && typeof opener.focus === 'function') opener.focus();
      opener = null;
      if (onClose) onClose();
    },
  };
  return api;
}
