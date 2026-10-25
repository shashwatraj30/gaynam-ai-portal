import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, matchRoute, findPage, resolveRoute } from '../js/router.js';

test('parseHash splits path and query', () => {
  const r = parseHash('#/research?q=section%20139&x=1');
  assert.equal(r.path, '/research');
  assert.equal(r.query.get('q'), 'section 139');
  assert.equal(parseHash('').path, '/');
  assert.equal(parseHash('#/drafts/').path, '/drafts');
});
test('matchRoute params and optional params', () => {
  assert.deepEqual(matchRoute('/drafts/:id', '/drafts/12'), { id: '12' });
  assert.equal(matchRoute('/drafts/:id', '/drafts'), null);
  assert.equal(matchRoute('/drafts/:id', '/drafts/1/review'), null);
  assert.deepEqual(matchRoute('/drafts/:id/review', '/drafts/9/review'), { id: '9' });
  assert.deepEqual(matchRoute('/graph/:id?', '/graph'), {});
  assert.deepEqual(matchRoute('/graph/:id?', '/graph/5'), { id: '5' });
  assert.deepEqual(matchRoute('/library/:file', '/library/a%20b.md'), { file: 'a b.md' });
});
const pages = [
  { route: '/', permission: null, render() {} },
  { route: '/signin', public: true, render() {} },
  { route: '/matters/:key', permission: 'DRAFT_FULL', render() {} },
  { route: '/matters/new', permission: 'UPLOAD_PLEADING', render() {} },
  { route: '/judgments/:id', permission: 'SEARCH', render() {} },
  { route: '/judgments/check', permission: 'VERIFY_CITATION', render() {} },
];
test('static segments beat params', () => {
  assert.equal(findPage(pages, '/matters/new').page.permission, 'UPLOAD_PLEADING');
  assert.equal(findPage(pages, '/matters/abc').params.key, 'abc');
  assert.equal(findPage(pages, '/judgments/check').page.permission, 'VERIFY_CITATION');
});
test('resolveRoute: redirect without token, forbidden, notfound, page', () => {
  const ok = { can: (p) => p === 'SEARCH', hasToken: true };
  assert.equal(resolveRoute(pages, '#/', { can: () => false, hasToken: false }).type, 'redirect');
  assert.match(resolveRoute(pages, '#/signin', { hasToken: false }).type, /page/);
  assert.equal(resolveRoute(pages, '#/matters/x', ok).type, 'forbidden');
  assert.equal(resolveRoute(pages, '#/judgments/77', ok).type, 'page');
  assert.equal(resolveRoute(pages, '#/nope', ok).type, 'notfound');
  assert.match(resolveRoute(pages, '#/', { hasToken: false }).to, /^#\/signin\?next=/);
});

test('array permissions mean "any of"', () => {
  const list = [{ route: '/matters', permission: ['DRAFT_FULL', 'UPLOAD_PLEADING'], render() {} }];
  const can = (set) => (p) => (Array.isArray(p) ? p.some((x) => set.includes(x)) : set.includes(p));
  assert.equal(resolveRoute(list, '#/matters', { can: can(['UPLOAD_PLEADING']), hasToken: true }).type, 'page');
  assert.equal(resolveRoute(list, '#/matters', { can: can(['DRAFT_FULL']), hasToken: true }).type, 'page');
  assert.equal(resolveRoute(list, '#/matters', { can: can(['SEARCH']), hasToken: true }).type, 'forbidden');
});
