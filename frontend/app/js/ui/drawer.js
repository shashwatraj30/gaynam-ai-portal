// drawer({title, body, onClose}) -> {el, open(), close()}  (right-hand panel, full width on phones)
// Same accessibility behaviour as modal(). Example: const d = drawer({title:'History', body: list}); d.open();
import { createOverlay } from './overlay.js';

export function drawer(opts = {}) {
  return createOverlay({ ...opts, kind: 'drawer' });
}
