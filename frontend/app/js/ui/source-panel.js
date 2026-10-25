// sourcePanel({title, subtitle, pdfUrl, highlights:[string], body: string|Node}) -> <aside class="g-source">
// Text bodies get `highlights` wrapped in <mark class="g-hl"> (built with nodes, never innerHTML).
import { h } from '../dom.js';
import { pdfViewer } from './pdf-viewer.js';

// Pure: split text into [{text, hit}] segments for the given phrases (case-insensitive, non-overlapping).
export function splitHighlights(text, highlights = []) {
  const src = String(text ?? '');
  const lower = src.toLowerCase();
  const phrases = highlights.map((p) => String(p || '').toLowerCase()).filter(Boolean);
  const spans = [];
  for (const p of phrases) {
    let from = 0;
    for (;;) {
      const i = lower.indexOf(p, from);
      if (i < 0) break;
      spans.push([i, i + p.length]); from = i + p.length;
    }
  }
  spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const out = []; let pos = 0;
  for (const [s, e] of spans) {
    if (s < pos) continue;
    if (s > pos) out.push({ text: src.slice(pos, s), hit: false });
    out.push({ text: src.slice(s, e), hit: true }); pos = e;
  }
  if (pos < src.length) out.push({ text: src.slice(pos), hit: false });
  return out;
}

export function sourcePanel({ title, subtitle, pdfUrl, highlights = [], body } = {}) {
  let content = null;
  if (body instanceof Node) content = body;
  else if (body != null) {
    content = h('div', { class: 'g-source__text' },
      ...splitHighlights(body, highlights).map((s) => (s.hit ? h('mark', { class: 'g-hl' }, s.text) : s.text)));
  }
  return h('aside', { class: 'g-source', 'aria-label': title || 'Source' },
    h('header', { class: 'g-source__head' },
      h('h2', { class: 'g-source__title' }, title || 'Source'),
      subtitle ? h('p', { class: 'g-source__sub' }, subtitle) : null),
    pdfUrl ? pdfViewer({ url: pdfUrl }) : null,
    content);
}
