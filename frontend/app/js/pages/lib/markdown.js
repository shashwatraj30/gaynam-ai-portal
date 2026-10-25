// Small, safe Markdown renderer. NO innerHTML: text is parsed into an AST (parseMarkdown) and built with h().
// Supported: headings, paragraphs (hard break = two trailing spaces), ordered/unordered lists (nested by indent),
// tables, fenced code, block quotes, rules, **bold**, *italic*, `code`, [links](url).
// Raw HTML is never interpreted; it shows as literal text. Images render as their alt text.
// Links: only http/https (new tab, noopener) and relative URLs. '#anchors' are not linked (they would hijack the hash router).
import { h } from '../../dom.js';

/** Returns the URL if safe to put in href, otherwise null. */
export function safeHref(u) {
  const s = String(u ?? '').trim();
  if (!s) return null;
  if (/[\u0000-\u001f\u007f\s\\]/.test(s)) return null;
  if (s.startsWith('//') || s.startsWith('#')) return null;
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (m) return /^https?$/i.test(m[1]) ? s : null;
  return s;
}

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|>~]/;

export function parseInline(s) {
  const out = []; let buf = ''; let i = 0;
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length && ESCAPABLE.test(s[i + 1])) { buf += s[i + 1]; i += 2; continue; }
    if (ch === '\n') { flush(); out.push({ t: 'br' }); i += 1; continue; }
    if (ch === '`') {
      const j = s.indexOf('`', i + 1);
      if (j > i) { flush(); out.push({ t: 'code', v: s.slice(i + 1, j) }); i = j + 1; continue; }
    }
    if (ch === '!' && s[i + 1] === '[') {
      const m = /^!\[([^\]]*)\]\(([^)]*)\)/.exec(s.slice(i));
      if (m) { buf += m[1]; i += m[0].length; continue; }
    }
    if (ch === '[') {
      const m = /^\[([^\]]*)\]\(\s*([^)\s]*)(?:\s+"[^"]*")?\s*\)/.exec(s.slice(i));
      if (m) { flush(); out.push({ t: 'link', href: safeHref(m[2]), c: parseInline(m[1]) }); i += m[0].length; continue; }
    }
    if (ch === '*' || ch === '_') {
      const prev = i > 0 ? s[i - 1] : ' ';
      const canOpen = ch === '*' || !/[A-Za-z0-9]/.test(prev);
      if (canOpen && s[i + 1] === ch) {
        const j = s.indexOf(ch + ch, i + 2);
        if (j > i + 2) { flush(); out.push({ t: 'strong', c: parseInline(s.slice(i + 2, j)) }); i = j + 2; continue; }
      } else if (canOpen && i + 1 < s.length && !/\s/.test(s[i + 1])) {
        let j = i + 1;
        while ((j = s.indexOf(ch, j)) !== -1) {
          if (s[j - 1] !== ' ' && s[j + 1] !== ch && (ch === '*' || !/[A-Za-z0-9]/.test(s[j + 1] || ' '))) break;
          j += 1;
        }
        if (j > i + 1) { flush(); out.push({ t: 'em', c: parseInline(s.slice(i + 1, j)) }); i = j + 1; continue; }
      }
    }
    buf += ch; i += 1;
  }
  flush();
  return out;
}

export function inlineText(nodes) {
  return nodes.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : n.t === 'br' ? ' ' : n.c ? inlineText(n.c) : '')).join('');
}

const RE_FENCE = /^\s*```\s*([\w-]*)\s*$/;
const RE_HEAD = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RE_HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const RE_LIST = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const RE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const RE_QUOTE = /^\s{0,3}>\s?(.*)$/;

const indentOf = (l) => l.match(/^\s*/)[0].replace(/\t/g, '    ').length;
const splitRow = (l) => { let s = l.trim(); if (s.startsWith('|')) s = s.slice(1); if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1); return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|')); };
const isTableStart = (lines, i) => lines[i].includes('|') && i + 1 < lines.length && lines[i + 1].includes('-') && RE_SEP.test(lines[i + 1]);

function startsBlock(lines, i) {
  const l = lines[i];
  return RE_FENCE.test(l) || RE_HEAD.test(l) || RE_HR.test(l) || RE_QUOTE.test(l) || RE_LIST.test(l) || isTableStart(lines, i);
}

function parseList(lines, i) {
  const first = RE_LIST.exec(lines[i]);
  const base = indentOf(lines[i]);
  const ordered = /\d/.test(first[2]);
  const items = [];
  while (i < lines.length) {
    const m = RE_LIST.exec(lines[i]);
    if (!m || indentOf(lines[i]) !== base || /\d/.test(m[2]) !== ordered) break;
    const text = [m[3]]; const sub = [];
    i += 1;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) {
        // a blank line continues the item only if the next non-blank line is indented deeper
        let k = i; while (k < lines.length && !lines[k].trim()) k += 1;
        if (k < lines.length && indentOf(lines[k]) > base) { sub.push(''); i += 1; continue; }
        break;
      }
      if (indentOf(l) > base) { sub.push(l); i += 1; continue; }
      if (RE_LIST.test(l) || startsBlock(lines, i)) break;
      text.push(l.trim()); i += 1; // lazy continuation
    }
    const children = sub.length ? parseBlocks(dedent(sub)) : [];
    items.push({ c: parseInline(text.join(' ')), children });
    // skip single blank lines between items of the same list
    if (i < lines.length && !lines[i].trim()) {
      let k = i; while (k < lines.length && !lines[k].trim()) k += 1;
      const nm = k < lines.length ? RE_LIST.exec(lines[k]) : null;
      if (nm && indentOf(lines[k]) === base && /\d/.test(nm[2]) === ordered) i = k; else break;
    }
  }
  return [{ t: 'list', ordered, items }, i];
}

function dedent(lines) {
  const ind = Math.min(...lines.filter((l) => l.trim()).map(indentOf));
  return lines.map((l) => (l.trim() ? l.replace(/\t/g, '    ').slice(Math.min(ind, indentOf(l))) : ''));
}

function parseBlocks(lines) {
  const out = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i += 1; continue; }
    let m;
    if ((m = RE_FENCE.exec(l))) {
      const buf = []; i += 1;
      while (i < lines.length && !RE_FENCE.test(lines[i])) { buf.push(lines[i]); i += 1; }
      i += 1;
      out.push({ t: 'code', lang: m[1] || '', v: buf.join('\n') });
      continue;
    }
    if ((m = RE_HEAD.exec(l))) { out.push({ t: 'h', level: m[1].length, c: parseInline(m[2]) }); i += 1; continue; }
    if (RE_HR.test(l)) { out.push({ t: 'hr' }); i += 1; continue; }
    if (isTableStart(lines, i)) {
      const head = splitRow(l);
      const align = splitRow(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : ''));
      const rows = []; i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { rows.push(splitRow(lines[i])); i += 1; }
      out.push({ t: 'table', align, head: head.map(parseInline), rows: rows.map((r) => r.map(parseInline)) });
      continue;
    }
    if (RE_QUOTE.test(l)) {
      const buf = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) { buf.push(RE_QUOTE.exec(lines[i])[1]); i += 1; }
      out.push({ t: 'quote', c: parseBlocks(buf) });
      continue;
    }
    if (RE_LIST.test(l)) { const [blk, ni] = parseList(lines, i); out.push(blk); i = ni; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && (buf.length === 0 || !startsBlock(lines, i))) { buf.push(lines[i]); i += 1; }
    const text = buf.map((x, k) => (k < buf.length - 1 ? (/ {2,}$/.test(x) ? `${x.trimEnd()}\n` : `${x.trim()} `) : x.trim())).join('');
    out.push({ t: 'p', c: parseInline(text) });
  }
  return out;
}

export function parseMarkdown(src) {
  return parseBlocks(String(src ?? '').replace(/\r\n?/g, '\n').split('\n'));
}

export function slugify(s) {
  const x = String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return x || 'section';
}

/** Headings (levels 1-6) with unique ids, in document order. */
export function headingsOf(blocks, prefix = 'doc') {
  const seen = new Map(); const out = [];
  const walk = (bs) => bs.forEach((b) => {
    if (b.t === 'h') {
      const base = `${prefix}-${slugify(inlineText(b.c))}`;
      const n = seen.get(base) || 0; seen.set(base, n + 1);
      b.id = n ? `${base}-${n}` : base;
      out.push({ level: b.level, text: inlineText(b.c), id: b.id });
    } else if (b.t === 'quote') walk(b.c);
  });
  walk(blocks);
  return out;
}

function inlineNodes(nodes) {
  return nodes.map((n) => {
    switch (n.t) {
      case 'text': return n.v;
      case 'br': return h('br');
      case 'code': return h('code', { class: 'g-md__code' }, n.v);
      case 'strong': return h('strong', {}, ...inlineNodes(n.c));
      case 'em': return h('em', {}, ...inlineNodes(n.c));
      case 'link': {
        if (!n.href) return h('span', {}, ...inlineNodes(n.c));
        const ext = /^https?:/i.test(n.href);
        return h('a', { href: n.href, target: ext ? '_blank' : null, rel: ext ? 'noopener noreferrer' : null }, ...inlineNodes(n.c));
      }
      default: return '';
    }
  });
}

function blockNode(b) {
  switch (b.t) {
    case 'h': return h(`h${Math.min(6, b.level)}`, { id: b.id || null, class: `g-md__h g-md__h${b.level}` }, ...inlineNodes(b.c));
    case 'p': return h('p', {}, ...inlineNodes(b.c));
    case 'hr': return h('hr', { class: 'g-md__hr' });
    case 'code': return h('pre', { class: 'g-md__pre', tabindex: '0' }, h('code', { 'data-lang': b.lang || null }, b.v));
    case 'quote': return h('blockquote', { class: 'g-md__quote' }, ...b.c.map(blockNode));
    case 'list': return h(b.ordered ? 'ol' : 'ul', { class: 'g-md__list' }, ...b.items.map((it) => h('li', {}, ...inlineNodes(it.c), ...it.children.map(blockNode))));
    case 'table': {
      const cell = (tag, c, i) => h(tag, { scope: tag === 'th' ? 'col' : null, class: b.align[i] ? `g-md__al-${b.align[i]}` : null }, ...inlineNodes(c));
      return h('div', { class: 'g-md__tablewrap' }, h('table', { class: 'g-md__table' },
        h('thead', {}, h('tr', {}, ...b.head.map((c, i) => cell('th', c, i)))),
        h('tbody', {}, ...b.rows.map((r) => h('tr', {}, ...r.map((c, i) => cell('td', c, i)))))));
    }
    default: return '';
  }
}

/** Render Markdown text to a DOM element. Returns {el, headings}. */
export function renderMarkdown(src, { idPrefix = 'doc' } = {}) {
  const blocks = parseMarkdown(src);
  const headings = headingsOf(blocks, idPrefix);
  return { el: h('div', { class: 'g-md' }, ...blocks.map(blockNode)), headings };
}
