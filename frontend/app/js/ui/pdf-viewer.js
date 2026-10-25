// pdfViewer({url, title}) -> iframe (no sandbox attribute: Chrome refuses to render PDFs in a sandboxed frame; hosts are restricted by CSP frame-src) plus an always-visible "Open original" link fallback.
import { h } from '../dom.js';
import { safeUrl } from './a11y.js';
import { tf } from '../i18n/index.js';

export function pdfViewer({ url, title } = {}) {
  const safe = safeUrl(url);
  return h('div', { class: 'g-pdf' },
    safe ? h('iframe', { class: 'g-pdf__frame', src: safe, title: title || tf('ui.pdf.title', 'Original document'), referrerpolicy: 'no-referrer', loading: 'lazy' }) : null,
    h('p', { class: 'g-pdf__fallback' },
      safe ? h('a', { href: safe, target: '_blank', rel: 'noopener noreferrer' }, tf('ui.pdf.open', 'Open original'))
           : h('span', {}, tf('ui.pdf.unavailable', 'Original not available')),
      safe ? tf('ui.pdf.fallback', ' if the preview does not load.') : '.'));
}
