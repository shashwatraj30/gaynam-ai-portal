// DOM builders for the document workspace: source preview, paged redacted text with find, issue list editor, download helper.
import { h, clear } from '../../dom.js';
import { t } from '../../i18n/index.js';
import { api } from '../../api.js';
import { formatNumber } from '../../format.js';
import { button } from '../../ui/button.js';
import { banner } from '../../ui/banner.js';
import { skeleton } from '../../ui/skeleton.js';
import { input } from '../../ui/form.js';
import { pdfViewer } from '../../ui/pdf-viewer.js';
import { ZOOM_STEPS, nextZoom } from './intake-zoom.js';
import { segmentText, highlightRanges, isImageMime, isPdfMime, sourceNotice } from './document-logic.js';

const PAGE = 20000;

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name || 'document', class: 'sr-only' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// The page CSP allows data: but not blob: for images, so images are shown from a data URL.
function toDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function imageStage(src) {
  let zoom = ZOOM_STEPS[0];
  const img = h('img', { class: 'dc-img', src, alt: t('dw.imageAlt') });
  const level = h('span', { class: 'dc-zoom__level', role: 'status', 'aria-live': 'polite' }, t('dw.zoomLevel', { n: zoom }));
  const out = button({ label: t('dw.zoomOut'), onClick: () => apply('out') });
  const inn = button({ label: t('dw.zoomIn'), onClick: () => apply('in') });
  const reset = button({ label: t('dw.zoomReset'), variant: 'ghost', onClick: () => apply('reset') });
  function apply(action) {
    zoom = nextZoom(zoom, action);
    img.style.width = `${zoom}%`;
    level.textContent = t('dw.zoomLevel', { n: zoom });
    out.disabled = zoom <= ZOOM_STEPS[0];
    inn.disabled = zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1];
  }
  apply('reset');
  return h('div', { class: 'dc-zoom' },
    h('div', { class: 'dc-zoom__bar' }, out, level, inn, reset),
    h('div', { class: 'dc-zoom__stage', tabindex: '0', role: 'region', 'aria-label': t('dw.stage') }, img));
}

/** Original preview (image or PDF) loaded from api.documents.file. Returns a Node that fills itself in. */
export function originalPreview(doc) {
  const box = h('div', { class: 'dc-orig' });
  if (doc.source === 'pasted' || !doc.original_name) return null;
  const image = isImageMime(doc.mime);
  const pdf = isPdfMime(doc.mime);
  if (!image && !pdf) return null;
  box.append(skeleton({ lines: 3 }));
  let revoke = null;
  api.documents.file(doc.id).then(async (blob) => {
    clear(box);
    if (image) box.append(imageStage(await toDataUrl(blob)));
    else {
      const url = URL.createObjectURL(blob); revoke = url;
      box.append(pdfViewer({ url, title: doc.title }), h('p', { class: 'dc-note' }, t('dw.pdfNote')));
    }
  }).catch(() => { clear(box); box.append(h('p', { class: 'dc-note', role: 'status' }, t('dw.imageFailed'))); });
  box.release = () => { if (revoke) URL.revokeObjectURL(revoke); };
  return box;
}

/** Redacted text, paged from api.documents.text, with find-in-text. */
export function textViewer(docId) {
  const S = { text: '', total: 0, loaded: false, busy: false, failed: false, q: '' };
  const body = h('div', { class: 'dc-text', tabindex: '0', role: 'region', 'aria-label': t('dw.textTitle') });
  const info = h('p', { class: 'dc-note', 'aria-live': 'polite' });
  const more = button({ label: t('dw.loadMore'), variant: 'secondary', onClick: () => load() });
  const find = input({ type: 'search', name: 'find', 'aria-label': t('dw.find'), placeholder: t('dw.find') });
  const count = h('p', { class: 'dc-note', role: 'status', 'aria-live': 'polite' });
  const el = h('div', { class: 'dc-textbox' },
    h('h3', { class: 'dc-h' }, t('dw.textTitle')), h('p', { class: 'dc-note' }, t('dw.textNote')),
    h('div', { class: 'dc-find' }, find), count, body, info, more);

  function paint() {
    clear(body);
    if (S.failed && !S.text) { body.append(h('p', { class: 'dc-note' }, t('dw.textFailed'))); }
    else if (!S.loaded) { body.append(skeleton({ lines: 5 })); }
    else if (!S.text) { body.append(h('p', { class: 'dc-note' }, t('dw.textEmpty'))); }
    else {
      body.append(...segmentText(S.text, S.q).map((s) => (s.kind === 'plain' ? document.createTextNode(s.text)
        : h('mark', { class: s.kind === 'match' ? 'dc-mark' : 'dc-redact' }, s.text))));
    }
    const n = highlightRanges(S.text, S.q).length;
    count.textContent = S.q.trim().length < 2 ? '' : (n ? t('dw.findCount', { n: formatNumber(n) }) : t('dw.findNone'));
    info.textContent = S.loaded && S.text ? t('dw.textShown', { shown: formatNumber(S.text.length), total: formatNumber(S.total) }) : '';
    more.hidden = !(S.loaded && S.text.length < S.total);
    more.disabled = S.busy;
  }
  async function load() {
    if (S.busy) return;
    S.busy = true; S.failed = false; paint();
    try {
      const r = await api.documents.text(docId, { offset: S.text.length, limit: PAGE });
      S.text += String(r?.text || '');
      S.total = Number(r?.total_chars) || S.text.length;
      S.loaded = true;
    } catch { S.failed = true; S.loaded = S.loaded || false; }
    S.busy = false; paint();
  }
  find.addEventListener('input', () => { S.q = find.value; paint(); });
  paint();
  el.start = () => { if (!S.loaded && !S.busy) load(); };
  return el;
}

/** Source column/tab: notice banner, original preview, text viewer. Text loads when .start() is called. */
export function sourceView(doc) {
  const notice = sourceNotice(doc);
  const orig = originalPreview(doc);
  const text = textViewer(doc.id);
  const el = h('div', { class: 'dc-source' },
    notice ? banner({ tone: 'warn', message: t(notice === 'failed' ? 'dw.sourceFailed' : 'dw.sourceSample') }) : null,
    orig, text);
  el.start = () => text.start();
  el.release = () => { if (orig && orig.release) orig.release(); };
  return el;
}

/** Ordered issue list with move/remove buttons. onChange(list) after every change. */
export function issueList(issues, { onMove, onRemove }) {
  if (!issues.length) return h('p', { class: 'dc-note' }, t('dw.issuesEmpty'));
  return h('ol', { class: 'dc-issues', 'aria-label': t('dw.issuesList') }, ...issues.map((text, i) => h('li', { class: 'dc-issue' },
    h('span', { class: 'dc-issue__t' }, text),
    h('span', { class: 'dc-issue__act' },
      button({ label: '↑', ariaLabel: t('dw.up', { n: i + 1 }), variant: 'ghost', disabled: i === 0, onClick: () => onMove(i, i - 1) }),
      button({ label: '↓', ariaLabel: t('dw.down', { n: i + 1 }), variant: 'ghost', disabled: i === issues.length - 1, onClick: () => onMove(i, i + 1) }),
      button({ label: '×', ariaLabel: t('dw.remove', { n: i + 1 }), variant: 'ghost', onClick: () => onRemove(i) })))));
}
