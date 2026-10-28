// api.js: the ONLY file that calls fetch. One function per endpoint (plan §6).
// Errors become ApiError {status, code, detail, requestId}. 401 clears the session and goes to #/signin?next=,
// 403 goes to #/forbidden (pass {noRedirect:true} to handle it yourself), 409 just throws, network failure
// dispatches window event 'gyanam:offline'. Default timeout 20 s; draftJudgment 120 s (cancel via {signal}).
// Pure module: no top-level DOM access; browser globals are guarded so it imports in Node.

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'ERROR', detail = null, requestId = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status; this.code = code; this.detail = detail; this.requestId = requestId;
  }
}

const TOKEN_KEY = 'gyanam.token';
const USER_KEY = 'gyanam.user';
let memToken = null; let memUser = null;
function ss() { try { return globalThis.sessionStorage || null; } catch { return null; } }

// ---- session ----
export function getToken() {
  if (memToken) return memToken;
  try { return ss()?.getItem(TOKEN_KEY) || null; } catch { return null; }
}
export function setSession({ token, user }) {
  const was = !!getToken();
  memToken = token || null; memUser = user || null;
  try {
    const s = ss();
    if (s) {
      if (token) s.setItem(TOKEN_KEY, token); else s.removeItem(TOKEN_KEY);
      if (user) s.setItem(USER_KEY, JSON.stringify(user)); else s.removeItem(USER_KEY);
    }
  } catch { /* ignore */ }
  const now = !!token;
  // Fire on sign-in/out, and also whenever an already-signed-in session's user is replaced (e.g. loadProfile()
  // enriching a bare SSO/login response with permissions) — the shell only rebuilds its permission-gated
  // sidebar on this event, so a silent user swap would otherwise show stale/empty permissions until reload.
  if (was !== now || (now && user)) emit('gyanam:session', { signedIn: now });
}
export function clearSession() { setSession({ token: null, user: null }); }
export function getUser() {
  if (memUser) return memUser;
  try { const raw = ss()?.getItem(USER_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
/** can(null) is always true. Permissions live at user.permissions (array) or user.role_details.permissions. */
export function can(permission) {
  if (!permission) return true;
  if (Array.isArray(permission)) return permission.some((p) => can(p));
  const u = getUser();
  if (!u) return false;
  const list = u.permissions || u.role_details?.permissions || [];
  return Array.isArray(list) ? list.includes(permission) : !!list[permission];
}

// ---- errors ----
export function mapError(status, body, headers) {
  const requestId = (headers && (typeof headers.get === 'function' ? headers.get('x-request-id') : headers['x-request-id'])) || body?.request_id || null;
  let detail = body && typeof body === 'object' ? (body.detail ?? body.message ?? null) : (body || null);
  const msg = typeof detail === 'string' ? detail
    : Array.isArray(detail) ? detail.map((d) => d.msg || JSON.stringify(d)).join('; ')
    : detail && typeof detail === 'object' ? (detail.message || JSON.stringify(detail)) : '';
  const codes = { 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'TOO_LARGE', 422: 'VALIDATION', 429: 'RATE_LIMITED' };
  const code = (detail && typeof detail === 'object' && !Array.isArray(detail) && detail.code) || (body && typeof body === 'object' && typeof body.code === 'string' && body.code) || codes[status] || (status >= 500 ? 'SERVER_ERROR' : 'ERROR');
  return new ApiError(msg || `Request failed (${status})`, { status, code, detail, requestId });
}

function emit(name, detail) {
  try { if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* ignore */ }
}
function setHash(h) { try { if (typeof location !== 'undefined') location.hash = h; } catch { /* ignore */ } }
function currentHash() { try { return typeof location !== 'undefined' ? (location.hash || '') : ''; } catch { return ''; } }

const DEFAULT_TIMEOUT = 20000;
const DRAFT_TIMEOUT = 120000;

function qs(params) {
  if (!params) return '';
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}
const enc = encodeURIComponent;

async function request(path, { method = 'GET', body, form, signal, timeout = DEFAULT_TIMEOUT, blob = false, noRedirect = false, auth = true } = {}) {
  const headers = { Accept: blob ? '*/*' : 'application/json' };
  const token = getToken();
  if (token && auth) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, timeout);
  const onAbort = () => ctl.abort();
  if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }

  let res;
  try {
    res = await globalThis.fetch(path, { method, headers, body: payload, signal: ctl.signal });
  } catch (e) {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
    if (e && e.name === 'AbortError') {
      if (timedOut) throw new ApiError('The request timed out', { status: 0, code: 'TIMEOUT' });
      throw new ApiError('The request was cancelled', { status: 0, code: 'ABORTED' });
    }
    emit('gyanam:offline', { path });
    throw new ApiError('Network error', { status: 0, code: 'NETWORK' });
  }
  clearTimeout(timer);
  if (signal) signal.removeEventListener('abort', onAbort);

  if (!res.ok) {
    let data = null;
    try {
      const text = await res.text();
      try { data = JSON.parse(text); } catch { data = text ? { detail: text } : null; }
    } catch { /* ignore */ }
    const err = mapError(res.status, data, res.headers);
    if (err.status === 401 && auth && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/sso')) {
      clearSession();
      const cur = currentHash();
      if (!cur.startsWith('#/signin')) setHash(`#/signin?next=${enc(cur.replace(/^#/, '') || '/')}`);
    } else if (err.status === 403 && !noRedirect) {
      setHash('#/forbidden');
    }
    throw err;
  }
  if (blob) return res.blob();
  if (res.status === 204) return null;
  const ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
  if (ct && !ct.includes('json')) return res.text();
  try { return await res.json(); } catch { return null; }
}

const get = (p, o) => request(p, o);
const post = (p, body, o) => request(p, { ...o, method: 'POST', body });

export const api = {
  auth: {
    ssoLogin: (role) => post('/api/auth/sso/nluj', { target_role: role }, { auth: false }),
    login: (email, password) => post('/api/auth/login', { username_or_email: email, password }, { auth: false }),
    me: () => get('/api/auth/me'),
    roles: () => get('/api/auth/roles', { auth: false }),
  },
  status: () => get('/api/status'),
  dashboardMetrics: () => get('/api/dashboard_metrics'),
  recentCases: (limit = 6) => get(`/api/cases/recent${qs({ limit })}`),
  sync: {
    trigger: () => post('/api/sync/trigger', undefined, { timeout: 60000 }),
    status: (o) => get('/api/sync/status', o),
    history: () => get('/api/sync/history'),
  },
  search: (body, o) => post('/api/search', body, o),
  judgment: (id) => get(`/api/judgment/${enc(id)}`),
  verifySingleCitation: (citation) => post('/api/verify_single_citation', { citation }),
  verifyCitations: (text) => post('/api/verify_citations', { text }),
  ocrProcessBrief: (file, opts = {}) => {
    const f = new FormData();
    f.append('file', file);
    if (opts.clientText) f.append('client_text', opts.clientText);
    return request('/api/ocr/process_brief', { method: 'POST', form: f, timeout: opts.timeout || 90000, signal: opts.signal });
  },
  ocrAnonymize: (text) => post('/api/ocr/anonymize', { text }),
  uploadPleading: (file, opts = {}) => {
    const f = new FormData();
    f.append('file', file);
    return request('/api/upload_pleading', { method: 'POST', form: f, timeout: 60000, signal: opts.signal });
  },
  draftJudgment: (body, { signal } = {}) => request('/api/draft_judgment', { method: 'POST', body, signal, timeout: DRAFT_TIMEOUT }),
  saveDraft: (body) => post('/api/save_draft', body),
  drafts: () => get('/api/drafts'),
  draft: (id) => get(`/api/draft/${enc(id)}`),
  deleteDraft: (id) => request(`/api/drafts/${enc(id)}`, { method: 'DELETE', noRedirect: true }),
  updateDraftStatus: (id, status, extra = {}) => post('/api/draft/update_status', { ...extra, draft_id: Number(id), status }, { noRedirect: true }),
  exportDocx: (id) => request(`/api/draft/export/docx/${enc(id)}`, { blob: true, timeout: 60000 }),
  printHtml: (id) => request(`/api/draft/export/print/${enc(id)}`, { blob: true, timeout: 60000 }),
  printUrl: (id) => `/api/draft/export/print/${enc(id)}`,
  auditLogs: (params) => get(`/api/audit_logs${qs(params)}`),
  ledgerVerify: () => get('/api/audit/ledger/verify'),
  ledgerBlocks: (limit) => get(`/api/audit/ledger/blocks${qs({ limit })}`),
  auditCsv: (params) => request(`/api/export/audit_csv${qs(params)}`, { blob: true, timeout: 60000 }),
  admin: {
    users: () => get('/api/admin/users'),
    toggleUser: (userId) => post('/api/admin/toggle_user', { user_id: userId }),
  },
  docs: {
    list: () => get('/api/docs/list'),
    read: (file) => get(`/api/docs/read/${enc(file)}`),
  },
  matters: () => get('/api/matters'),
  matter: (key) => get(`/api/matters/${enc(key)}`),
  alerts: () => get('/api/alerts'),
  judgmentGraph: (id) => get(`/api/judgment/${enc(id)}/graph`),
  draftVersions: (id) => get(`/api/drafts/${enc(id)}/versions`),
  // ---- v3 (docs/API_V3_CONTRACT.md) ----
  draftVersion: (id, n) => get(`/api/drafts/${enc(id)}/versions/${enc(n)}`),
  restoreDraft: (id, n, version) => post(`/api/drafts/${enc(id)}/restore/${enc(n)}`, { version }, { noRedirect: true }),
  courts: () => get('/api/courts'),
  savedSearches: {
    list: () => get('/api/saved_searches'),
    create: (body) => post('/api/saved_searches', body, { noRedirect: true }),
    remove: (id) => request(`/api/saved_searches/${enc(id)}`, { method: 'DELETE' }),
  },
  lineages: () => get('/api/lineages'),
  judgmentParagraphs: (id) => get(`/api/judgment/${enc(id)}/paragraphs`),
  judgmentTreatments: (id) => get(`/api/judgment/${enc(id)}/treatments`),
  documents: {
    list: (params) => get(`/api/documents${qs(params)}`),
    get: (id) => get(`/api/documents/${enc(id)}`),
    text: (id, params) => get(`/api/documents/${enc(id)}/text${qs(params)}`),
    fileUrl: (id) => `/api/documents/${enc(id)}/file`,
    file: (id) => request(`/api/documents/${enc(id)}/file`, { blob: true, timeout: 60000 }),
    /** create({file?, text?, docType, title?, matterKey?, sample?}, {signal}) */
    create: ({ file, text, docType, title, matterKey, sample } = {}, { signal } = {}) => {
      const f = new FormData();
      if (file) f.append('file', file);
      if (text) f.append('text', text);
      f.append('doc_type', docType || 'OTHER');
      if (title) f.append('title', title);
      if (matterKey) f.append('matter_key', matterKey);
      if (sample) f.append('sample', sample);
      return request('/api/documents', { method: 'POST', form: f, timeout: 120000, signal });
    },
    update: (id, body) => request(`/api/documents/${enc(id)}`, { method: 'PATCH', body }),
    saveExtraction: (id, body) => request(`/api/documents/${enc(id)}/extraction`, { method: 'PUT', body, noRedirect: true }),
    confirm: (id, version) => post(`/api/documents/${enc(id)}/confirm`, { version }, { noRedirect: true }),
    archive: (id) => post(`/api/documents/${enc(id)}/archive`, {}),
    remove: (id) => request(`/api/documents/${enc(id)}`, { method: 'DELETE', noRedirect: true }),
    research: (id, body = {}) => post(`/api/documents/${enc(id)}/research`, body, { timeout: 60000 }),
    pins: (id) => get(`/api/documents/${enc(id)}/pins`),
    addPin: (id, body) => post(`/api/documents/${enc(id)}/pins`, body, { noRedirect: true }),
    removePin: (id, judgmentId) => request(`/api/documents/${enc(id)}/pins/${enc(judgmentId)}`, { method: 'DELETE' }),
    draftParams: (id) => post(`/api/documents/${enc(id)}/draft-params`, {}, { noRedirect: true }),
  },
};

/** Fetch /api/auth/me, merge its role_details into a permissions-bearing user, store it, and return it.
 * SSO/login responses carry the bare directory record (no permissions) — callers that just set a session
 * from one of those must call this before anything reads can(), or every permission-gated nav item hides
 * itself until the next reload. */
export async function loadProfile(token) {
  const r = await api.auth.me();
  const rd = r.role_details || {};
  const user = { ...(r.user || {}), permissions: rd.permissions || [], role_title: rd.title || '', role_details: rd };
  setSession({ token, user });
  return user;
}

export default api;
