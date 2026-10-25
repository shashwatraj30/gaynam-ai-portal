// modal({title, body, actions, onClose}) -> {el, open(), close()}
// body: Node|string; actions: Node|Node[] (footer buttons). Focus trap, Esc, backdrop click, focus return.
// Example: const m = modal({title:'Share', body: p, actions: button({label:'Done'})}); m.open();
import { createOverlay } from './overlay.js';

export function modal(opts = {}) {
  return createOverlay({ ...opts, kind: 'modal' });
}
