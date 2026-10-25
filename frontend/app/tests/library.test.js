import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/dom-shim.js';

installDom();
const { safeHref, parseInline, parseMarkdown, headingsOf, slugify, renderMarkdown } = await import('../js/pages/lib/markdown.js');
const { visibleDocs, canSeeDoc, docKey, tocEntries } = await import('../js/pages/lib/library-logic.js');

test('safeHref allows http(s) and relative only', () => {
  assert.equal(safeHref('https://a.in/x'), 'https://a.in/x');
  assert.equal(safeHref('docs/a.md'), 'docs/a.md');
  assert.equal(safeHref('/app/x'), '/app/x');
  for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.com', '#frag', '/\\evil.com', 'java\nscript:x', 'mailto:a@b.c', '']) {
    assert.equal(safeHref(bad), null, bad);
  }
});

test('inline: bold, italic, code, links, escapes', () => {
  const n = parseInline('a **b** *c* `d` [e](https://x.in) \\*f\\*');
  assert.deepEqual(n.map((x) => x.t), ['text', 'strong', 'text', 'em', 'text', 'code', 'text', 'link', 'text']);
  assert.equal(n[7].href, 'https://x.in');
  assert.equal(n[8].v, ' *f*');
  const bad = parseInline('[x](javascript:alert(1))')[0];
  assert.equal(bad.t, 'link'); assert.equal(bad.href, null);
  assert.equal(parseInline('snake_case_name')[0].v, 'snake_case_name');
});

test('blocks: headings, paragraphs, lists, tables, code, quotes, rules', () => {
  const md = [
    '# Title', '', 'Para one', 'continues.', '', '- a', '- b', '  - nested', '', '1. one', '2. two', '',
    '| H1 | H2 |', '|---|:-:|', '| x | y |', '', '```bash', 'echo hi', '```', '', '> quoted **b**', '', '---',
  ].join('\n');
  const b = parseMarkdown(md);
  assert.deepEqual(b.map((x) => x.t), ['h', 'p', 'list', 'list', 'table', 'code', 'quote', 'hr']);
  assert.equal(b[1].c[0].v, 'Para one continues.');
  assert.equal(b[2].items.length, 2);
  assert.equal(b[2].items[1].children[0].t, 'list');
  assert.equal(b[3].ordered, true);
  assert.equal(b[4].head.length, 2); assert.equal(b[4].align[1], 'center'); assert.equal(b[4].rows.length, 1);
  assert.equal(b[5].v, 'echo hi'); assert.equal(b[5].lang, 'bash');
});

test('hard break and raw html stay text', () => {
  const p = parseMarkdown('line one  \nline two')[0];
  assert.ok(p.c.some((x) => x.t === 'br'));
  const html = parseMarkdown('<script>alert(1)</script>')[0];
  assert.equal(html.c[0].v, '<script>alert(1)</script>');
});

test('headings get unique ids; toc keeps levels 2-3', () => {
  const b = parseMarkdown('# A\n## Same\n## Same\n#### Deep');
  const hs = headingsOf(b);
  assert.deepEqual(hs.map((x) => x.id), ['doc-a', 'doc-same', 'doc-same-1', 'doc-deep']);
  assert.equal(slugify('1. Executive summary'), '1-executive-summary');
  assert.equal(tocEntries(hs).length, 2);
});

test('renderMarkdown builds no script/img elements and unsafe links become spans', () => {
  const { el } = renderMarkdown('# T\n\n[x](javascript:alert(1)) ![i](http://a/b.png) <img src=x onerror=alert(1)>\n');
  const tags = [];
  const walk = (n) => { if (n.tagName) tags.push(n.tagName); (n.childNodes || []).forEach(walk); };
  walk(el);
  assert.ok(!tags.includes('SCRIPT') && !tags.includes('IMG') && !tags.includes('A'));
  assert.ok(tags.includes('H1') && tags.includes('SPAN'));
});

test('library visibility: commercial proposal needs MANAGE_USERS; plan hidden', () => {
  const list = [
    { filename: 'COMMERCIAL_PROPOSAL_GYANAM_AI.md' }, { filename: 'UI_REDESIGN_PLAN.md' },
    { filename: 'TENDER_COMPLIANCE_DOSSIER.md' }, { filename: 'JUDICIAL_BENCH_USER_MANUAL.md' },
  ];
  assert.deepEqual(visibleDocs(list, () => false).map((d) => d.filename), ['JUDICIAL_BENCH_USER_MANUAL.md', 'TENDER_COMPLIANCE_DOSSIER.md']);
  assert.equal(visibleDocs(list, (p) => p === 'MANAGE_USERS').length, 3);
  assert.equal(canSeeDoc('COMMERCIAL_PROPOSAL_GYANAM_AI.md', () => false), false);
  assert.equal(docKey('ADMIN_DEPLOYMENT_GUIDE.md'), 'admin');
});
