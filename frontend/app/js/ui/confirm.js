// confirmDialog({title, message, confirmLabel, cancelLabel, tone}) -> Promise<boolean>
// Resolves true on confirm; false on cancel, Esc, backdrop or close. tone 'danger' styles the confirm button red.
// Example: if (await confirmDialog({title:'Delete draft?', message:'...', tone:'danger'})) remove();
import { h } from '../dom.js';
import { button } from './button.js';
import { tf } from '../i18n/index.js';
import { createOverlay } from './overlay.js';

export function confirmDialog({ title, message, confirmLabel, cancelLabel, tone = 'primary' } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const cancelBtn = button({ label: cancelLabel || tf('btn.cancel', 'Cancel'), variant: 'secondary', onClick: () => dlg.close() });
    const okBtn = button({ label: confirmLabel || tf('btn.confirm', 'Confirm'), variant: tone === 'danger' ? 'danger' : 'primary', onClick: () => { result = true; dlg.close(); } });
    const dlg = createOverlay({
      kind: 'modal', role: 'alertdialog', title,
      body: h('p', { class: 'g-confirm__msg' }, message || ''),
      actions: [cancelBtn, okBtn],
      initialFocus: () => cancelBtn,
      onClose: () => resolve(result),
    });
    dlg.open();
  });
}
