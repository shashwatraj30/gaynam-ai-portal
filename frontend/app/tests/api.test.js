import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, mapError, setSession, clearSession, getToken, getUser, can } from '../js/api.js';

function res(status, body, headers = {}) {
  const text = body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  const isObj = body != null && typeof body === 'object';
  return {
    ok: status >= 200 && status < 300, status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? (isObj && k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    text: async () => text, json: async () => JSON.parse(text), blob: async () => new Blob([text]),
  };
}
let events = [];
function setup(fn) {
  globalThis.window = { dispatchEvent: (e) => events.push(e.type) };
  globalThis.location = { hash: '#/research?q=x' };
  clearSession(); events = [];
  globalThis.fetch = fn;
}

test('success sends bearer token and JSON body', async () => {
  let seen;
  setup(async (url, init) => { seen = { url, init }; return res(200, { ok: 1 }); });
  setSession({ token: 'tok', user: { permissions: ['SEARCH'] } });
  const out = await api.search({ query: 'a' });
  assert.deepEqual(out, { ok: 1 });
  assert.equal(seen.url, '/api/search');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
  assert.equal(seen.init.body, '{"query":"a"}');
});

test('sso login sends target_role, no auth header', async () => {
  let seen;
  setup(async (url, init) => { seen = { url, init }; return res(200, { access_token: 't' }); });
  setSession({ token: 'tok', user: {} });
  await api.auth.ssoLogin('AUDITOR');
  assert.equal(JSON.parse(seen.init.body).target_role, 'AUDITOR');
  assert.equal(seen.init.headers.Authorization, undefined);
});

test('401 clears session and redirects to signin with next', async () => {
  setup(async () => res(401, { detail: 'expired' }));
  setSession({ token: 'tok', user: { full_name: 'A' } });
  await assert.rejects(api.drafts(), (e) => e instanceof ApiError && e.status === 401 && e.code === 'UNAUTHORIZED');
  assert.equal(getToken(), null);
  assert.equal(getUser(), null);
  assert.equal(location.hash, '#/signin?next=' + encodeURIComponent('/research?q=x'));
});

test('failed login 401 does not redirect', async () => {
  setup(async () => res(401, { detail: 'bad' }));
  await assert.rejects(api.auth.login('a@b', 'x'));
  assert.equal(location.hash, '#/research?q=x');
});

test('403 goes to #/forbidden', async () => {
  setup(async () => res(403, { detail: 'nope' }));
  setSession({ token: 'tok', user: {} });
  await assert.rejects(api.admin.users(), (e) => e.status === 403 && e.code === 'FORBIDDEN');
  assert.equal(location.hash, '#/forbidden');
});

test('409 throws ApiError without redirect, keeps request id', async () => {
  setup(async () => res(409, { detail: { code: 'VERSION_CONFLICT', message: 'changed' } }, { 'x-request-id': 'r1' }));
  setSession({ token: 'tok', user: {} });
  await assert.rejects(api.saveDraft({}), (e) => e.status === 409 && e.code === 'VERSION_CONFLICT' && e.requestId === 'r1' && e.message === 'changed');
  assert.equal(location.hash, '#/research?q=x');
});

test('network failure dispatches gyanam:offline', async () => {
  setup(async () => { throw new TypeError('failed to fetch'); });
  await assert.rejects(api.status(), (e) => e.code === 'NETWORK');
  assert.ok(events.includes('gyanam:offline'));
});

test('user cancel maps to ABORTED', async () => {
  const hang = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))));
  setup(hang);
  const ctl = new AbortController();
  const p = api.draftJudgment({}, { signal: ctl.signal });
  ctl.abort();
  await assert.rejects(p, (e) => e.code === 'ABORTED');
});

test('422 validation detail array is joined; 500 is SERVER_ERROR', () => {
  const e = mapError(422, { detail: [{ msg: 'field required' }, { msg: 'bad' }] }, {});
  assert.equal(e.message, 'field required; bad');
  assert.equal(e.code, 'VALIDATION');
  assert.equal(mapError(500, null, {}).code, 'SERVER_ERROR');
});

test('can() reads permissions; null permission always allowed', () => {
  setup(async () => res(200, {}));
  assert.equal(can(null), true);
  assert.equal(can('SEARCH'), false);
  setSession({ token: 't', user: { permissions: ['SEARCH'] } });
  assert.equal(can('SEARCH'), true);
  assert.equal(can('MANAGE_USERS'), false);
  setSession({ token: 't', user: { role_details: { permissions: ['VIEW_AUDIT'] } } });
  assert.equal(can('VIEW_AUDIT'), true);
});

test('blob exports, query strings and url helpers', async () => {
  let url;
  setup(async (u) => { url = u; return res(200, 'DOCXBYTES', { 'content-type': 'application/octet-stream' }); });
  const b = await api.exportDocx(7);
  assert.equal(url, '/api/draft/export/docx/7');
  assert.equal(b.size, 9);
  await api.auditLogs({ action: 'SEARCH_QUERY', user: '', limit: 5 });
  assert.equal(url, '/api/audit_logs?action=SEARCH_QUERY&limit=5');
  assert.equal(api.printUrl(3), '/api/draft/export/print/3');
});

test('updateDraftStatus sends draft_id, status and extras', async () => {
  let body;
  setup(async (u, init) => { body = JSON.parse(init.body); return res(200, { success: true }); });
  await api.updateDraftStatus('4', 'IN_REVIEW', { version: 2 });
  assert.deepEqual(body, { version: 2, draft_id: 4, status: 'IN_REVIEW' });
});

test('every contract function exists', () => {
  const fns = ['status', 'dashboardMetrics', 'recentCases', 'search', 'judgment', 'verifySingleCitation', 'verifyCitations', 'ocrProcessBrief', 'ocrAnonymize', 'uploadPleading', 'draftJudgment', 'saveDraft', 'drafts', 'draft', 'updateDraftStatus', 'exportDocx', 'printUrl', 'auditLogs', 'ledgerVerify', 'ledgerBlocks', 'auditCsv', 'matters', 'matter', 'alerts', 'judgmentGraph', 'draftVersions'];
  for (const f of fns) assert.equal(typeof api[f], 'function', f);
  for (const f of ['ssoLogin', 'login', 'me', 'roles']) assert.equal(typeof api.auth[f], 'function');
  for (const f of ['trigger', 'status', 'history']) assert.equal(typeof api.sync[f], 'function');
  for (const f of ['users', 'toggleUser']) assert.equal(typeof api.admin[f], 'function');
  for (const f of ['list', 'read']) assert.equal(typeof api.docs[f], 'function');
});
