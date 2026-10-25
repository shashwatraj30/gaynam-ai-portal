// Library: institutional documents. Route '#/library/:file?' (any signed-in role; the commercial proposal needs MANAGE_USERS).
// Markdown is rendered to DOM by lib/markdown.js (no innerHTML, no sanitiser library needed).
import { h } from '../dom.js';
import { api } from '../api.js';
import { t, addMessages } from '../i18n/index.js';
import { loadCss } from '../ui/shell.js';
import { button } from '../ui/button.js';
import { chip } from '../ui/chip.js';
import { listRow } from '../ui/list-row.js';
import { emptyState } from '../ui/empty-state.js';
import { errorState } from '../ui/error-state.js';
import { skeleton } from '../ui/skeleton.js';
import { toast } from '../ui/toast.js';
import en from '../i18n/pages/library.en.js';
import hi from '../i18n/pages/library.hi.js';
import { renderMarkdown } from './lib/markdown.js';
import { visibleDocs, canSeeDoc, docKey, isRestricted, libraryHref, tocEntries } from './lib/library-logic.js';

addMessages('en', en); addMessages('hi', hi);

const docTitle = (d) => { const k = docKey(d.filename); return k ? t(`library.doc.${k}`) : (d.title || d.filename); };
const docSub = (d) => { const k = docKey(d.filename); return k ? t(`library.doc.${k}.sub`) : ''; };

export default {
  route: '/library/:file?',
  title: 'Library',
  permission: null,
  async render(params, ctx) {
    await loadCss('page-library.css');
    const wrap = h('section', { class: 'g-page' });
    const listHost = h('nav', { class: 'g-library__list', 'aria-label': t('library.list.title') });
    const reader = h('div', { class: 'g-library__reader', 'aria-live': 'polite' }, skeleton({ lines: 8 }));
    wrap.append(h('div', { class: 'g-page__head' }, h('div', {}, h('h1', { class: 'g-page__title' }, t('library.title')), h('p', { class: 'g-page__lede' }, t('library.lede')))),
      h('div', { class: 'g-library' }, h('div', { class: 'g-library__side' }, h('h2', { class: 'g-section__title' }, t('library.list.title')), listHost), reader));

    let docs = [];
    const open = async (file) => {
      reader.replaceChildren(skeleton({ lines: 8 }));
      if (!canSeeDoc(file, ctx.can)) { reader.replaceChildren(emptyState({ title: t('library.restricted.title'), message: t('library.restricted.msg') })); return; }
      let res;
      try { res = await api.docs.read(file); } catch (e) {
        if (e && e.status === 404) { reader.replaceChildren(emptyState({ title: t('library.notFound.title'), message: t('library.notFound.msg') })); return; }
        reader.replaceChildren(errorState({ message: e?.message, requestId: e?.requestId, onRetry: () => open(file), retryLabel: t('state.retry') })); return;
      }
      const raw = String(res?.content ?? '');
      const md = renderMarkdown(raw, { idPrefix: 'lib' });
      const meta = docs.find((d) => d.filename === file) || { filename: file };
      const toc = tocEntries(md.headings);
      const copy = async () => {
        try { await navigator.clipboard.writeText(raw); toast(t('library.copied'), { tone: 'primary' }); } catch { toast(t('library.copyFailed'), { tone: 'warn' }); }
      };
      ctx.setBreadcrumb?.([{ label: t('library.title'), href: '#/library' }, { label: docTitle(meta) }]);
      reader.replaceChildren(
        h('div', { class: 'g-library__bar' },
          h('div', {}, h('h2', { class: 'g-library__doctitle' }, docTitle(meta)), docSub(meta) ? h('div', { class: 'g-meta' }, docSub(meta)) : null),
          h('div', { class: 'g-row' }, isRestricted(file) ? chip({ label: t('library.adminOnly'), tone: 'warn' }) : null,
            button({ label: t('library.copy'), icon: 'copy', onClick: copy }), button({ label: t('library.print'), icon: 'printer', onClick: () => window.print() }))),
        h('div', { class: 'g-library__body' },
          h('article', { class: 'g-library__doc' }, md.el),
          toc.length ? h('nav', { class: 'g-library__toc', 'aria-label': t('library.toc') },
            h('h3', { class: 'g-library__tochead' }, t('library.toc')),
            h('ul', {}, ...toc.map((x) => h('li', { class: `g-library__toc${x.level}` }, h('button', { type: 'button', class: 'g-link-btn', onClick: () => document.getElementById(x.id)?.scrollIntoView({ block: 'start' }) }, x.text))))) : null));
    };

    try {
      const list = await api.docs.list();
      docs = visibleDocs(Array.isArray(list) ? list : (list?.docs || []), ctx.can);
    } catch (e) {
      reader.replaceChildren(errorState({ message: e?.message, requestId: e?.requestId, onRetry: () => ctx.navigate('#/library'), retryLabel: t('state.retry') }));
      return wrap;
    }
    if (!docs.length) { reader.replaceChildren(emptyState({ title: t('library.empty.title'), message: t('library.empty.msg') })); return wrap; }
    const current = params.file && docs.some((d) => d.filename === params.file) ? params.file : (params.file || docs[0].filename);
    listHost.replaceChildren(...docs.map((d) => listRow({ title: docTitle(d), meta: docSub(d), href: libraryHref(d.filename), selected: d.filename === current,
      status: isRestricted(d.filename) ? chip({ label: t('library.adminOnly'), tone: 'warn' }) : null })));
    await open(current);
    return wrap;
  },
  onLeave() {},
};
