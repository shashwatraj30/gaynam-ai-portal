// escapeHtml(s): escape &, <, >, ", ' for the one place markdown/HTML strings are built (Library).
// Everywhere else use textContent via h(). Pure module: no DOM access.
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => MAP[c]);
}
