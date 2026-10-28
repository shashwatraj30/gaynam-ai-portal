// Route smoke test: every page module imports under the DOM shim, every plan §5.1 route resolves to the right page
// (with the right permission outcome), no page imports another page, and each page's en/hi message keys match.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDom } from './helpers/dom-shim.js';

installDom();
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PAGE_FILES } = await import('../js/pages/index.js');
const { resolveRoute } = await import('../js/router.js');

const pages = [];
for (const name of PAGE_FILES) {
  const mod = await import(`../js/pages/${name}.js`);
  const list = Array.isArray(mod.default) ? mod.default : [mod.default];
  for (const p of list) {
    assert.ok(p && p.route && typeof p.render === 'function', `${name}.js must default-export a page module`);
    pages.push(p);
  }
}

test('every page file loads and has a unique route', () => {
  assert.equal(PAGE_FILES.length >= 17, true);
  const routes = pages.map((p) => p.route);
  assert.equal(new Set(routes).size, routes.length, 'duplicate route');
});

// [hash, expected page route, permission the user needs (null = any signed-in user)]
const ROUTES = [
  ['#/signin', '/signin', null, { public: true }],
  ['#/', '/', null],
  ['#/research', '/research', 'SEARCH'],
  ['#/research?q=section%20139', '/research', 'SEARCH'],
  ['#/judgments/42', '/judgments/:id', 'SEARCH'],
  ['#/judgments/check', '/judgments/check', 'VERIFY_CITATION'],
  ['#/documents', '/documents', 'UPLOAD_PLEADING'],
  ['#/documents', '/documents', 'DRAFT_FULL'],
  ['#/documents/abc123', '/documents/:id', 'UPLOAD_PLEADING'],
  ['#/matters', '/matters', 'DRAFT_FULL'],
  ['#/matters', '/matters', 'UPLOAD_PLEADING'],
  ['#/matters/new', '/matters/new', 'UPLOAD_PLEADING'],
  ['#/matters/CRL-1', '/matters/:key', 'UPLOAD_PLEADING'],
  ['#/drafts', '/drafts', 'DRAFT_FULL'],
  ['#/drafts/new', '/drafts/:id', 'DRAFT_FULL'],
  ['#/drafts/12', '/drafts/:id', 'DRAFT_FULL'],
  ['#/drafts/12/review', '/drafts/:id/review', 'DRAFT_FULL'],
  ['#/graph', '/graph/:id?', 'SEARCH'],
  ['#/graph/7', '/graph/:id?', 'SEARCH'],
  ['#/alerts', '/alerts/:id?', 'DRAFT_FULL'],
  ['#/alerts/3', '/alerts/:id?', 'DRAFT_FULL'],
  ['#/audit', '/audit', 'VIEW_AUDIT'],
  ['#/chamber', '/chamber', 'MANAGE_USERS'],
  ['#/library', '/library/:file?', null],
  ['#/library/guide.md', '/library/:file?', null],
  ['#/settings', '/settings', null],
];

test('every plan §5.1 route resolves to its page', () => {
  for (const [hash, route, perm, opts] of ROUTES) {
    const all = (p) => (Array.isArray(p) ? p.every((x) => all(x)) : true);
    void all;
    const granted = resolveRoute(pages, hash, { can: () => true, hasToken: !(opts && opts.public) });
    assert.equal(granted.type, 'page', `${hash} should resolve (got ${granted.type})`);
    assert.equal(granted.page.route, route, `${hash} -> ${granted.page.route}`);
    if (perm) {
      const denied = resolveRoute(pages, hash, { can: (p) => (Array.isArray(p) ? p.includes('NONE') : p === 'NONE'), hasToken: true });
      assert.equal(denied.type, 'forbidden', `${hash} should be forbidden without ${perm}`);
      const only = resolveRoute(pages, hash, { can: (p) => (Array.isArray(p) ? p.includes(perm) : p === perm), hasToken: true });
      assert.equal(only.type, 'page', `${hash} should be allowed with just ${perm}`);
    }
  }
});

test('route params are extracted', () => {
  assert.equal(resolveRoute(pages, '#/drafts/12/review', { hasToken: true }).params.id, '12');
  assert.equal(resolveRoute(pages, '#/matters/CRL-1', { hasToken: true }).params.key, 'CRL-1');
  assert.equal(resolveRoute(pages, '#/judgments/check', { hasToken: true }).page.route, '/judgments/check');
});

test('protected routes redirect to sign-in without a token; sign-in is public', () => {
  assert.equal(resolveRoute(pages, '#/drafts', { hasToken: false }).type, 'redirect');
  assert.equal(resolveRoute(pages, '#/signin', { hasToken: false }).type, 'page');
});

test('unknown routes are not found; /forbidden and /not-found pages exist', () => {
  assert.equal(resolveRoute(pages, '#/nope/nothing', { hasToken: true }).type, 'notfound');
  assert.ok(pages.some((p) => p.route === '/forbidden'));
  assert.ok(pages.some((p) => p.route === '/not-found'));
});

test('no page imports another page file (shared code lives in js/pages/lib or js/ui)', () => {
  const dir = path.join(ROOT, 'js', 'pages');
  const names = new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.js')));
  const bad = [];
  for (const f of names) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/from\s+['"]\.\/([\w-]+\.js)['"]/g)) if (names.has(m[1]) && m[1] !== 'index.js') bad.push(`${f} -> ${m[1]}`);
  }
  // index.js legitimately imports nothing page-level; kit.js is the shared page kit.
  assert.deepEqual(bad.filter((b) => !b.endsWith('kit.js')), []);
});

test('every page i18n file has identical en and hi key sets', async () => {
  const dir = path.join(ROOT, 'js', 'i18n', 'pages');
  const bases = new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.en.js')).map((f) => f.replace('.en.js', '')));
  assert.ok(bases.size >= 15);
  for (const b of bases) {
    assert.ok(fs.existsSync(path.join(dir, `${b}.hi.js`)), `${b}.hi.js missing`);
    const en = (await import(`../js/i18n/pages/${b}.en.js`)).default;
    const hi = (await import(`../js/i18n/pages/${b}.hi.js`)).default;
    const ek = Object.keys(en).sort(); const hk = Object.keys(hi).sort();
    assert.deepEqual(hk.filter((k) => !(k in en)), [], `${b}: keys only in hi`);
    assert.deepEqual(ek.filter((k) => !(k in hi)), [], `${b}: keys missing in hi`);
    for (const k of ek) assert.equal(typeof hi[k], 'string', `${b}.${k}`);
  }
});
