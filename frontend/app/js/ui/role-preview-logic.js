// Pure logic for the admin-only "Preview as role" control (no DOM; imports cleanly in Node).
// HONEST by design: the preview only changes what the client SHOWS (sidebar, nav, buttons). It never touches the
// token, API headers or what the server allows; the server enforces the real role on every request.
//
// The client has no role -> permission table, so this one mirrors backend/auth.py ROLES_PERMISSIONS.
// tests/role-preview.test.js parses backend/auth.py and fails if the two drift apart.
export const PREVIEW_KEY = 'gyanam.rolePreview';
export const TOP_ADMIN_ROLE = 'ADMINISTRATOR';

export const ROLE_PERMISSIONS = {
  JUDICIAL_USER: ['SEARCH', 'DRAFT_FULL', 'FINALIZE_JUDGMENT', 'DIGITAL_SIGN', 'VERIFY_CITATION', 'UPLOAD_PLEADING', 'VIEW_AUDIT', 'EXPORT_GAZETTE'],
  HON_JUSTICE: ['SEARCH', 'DRAFT_FULL', 'FINALIZE_JUDGMENT', 'DIGITAL_SIGN', 'VERIFY_CITATION', 'UPLOAD_PLEADING', 'VIEW_AUDIT', 'EXPORT_GAZETTE'],
  RESEARCHER: ['SEARCH', 'DRAFT_FULL', 'VERIFY_CITATION', 'UPLOAD_PLEADING', 'EXPORT_DRAFT'],
  LAW_CLERK: ['SEARCH', 'DRAFT_FULL', 'VERIFY_CITATION', 'UPLOAD_PLEADING', 'EXPORT_DRAFT'],
  FACULTY: ['SEARCH', 'VERIFY_CITATION', 'VIEW_RATIO', 'STUDY_LINEAGE', 'ACADEMIC_NOTES'],
  STUDENT: ['SEARCH', 'VERIFY_CITATION', 'VIEW_RATIO', 'STUDY_LINEAGE'],
  NLU_SCHOLAR: ['SEARCH', 'VERIFY_CITATION', 'VIEW_RATIO', 'STUDY_LINEAGE'],
  ADMINISTRATOR: ['SEARCH', 'VERIFY_CITATION', 'VIEW_AUDIT', 'MANAGE_CORPUS', 'SYSTEM_METRICS', 'EXPORT_REPORT', 'MANAGE_USERS'],
  REGISTRAR_NLUJ: ['SEARCH', 'VERIFY_CITATION', 'VIEW_AUDIT', 'MANAGE_CORPUS', 'SYSTEM_METRICS', 'EXPORT_REPORT'],
  AUDITOR: ['VIEW_AUDIT', 'VERIFY_LEDGER', 'DPDP_INSPECT', 'EXPORT_AUDIT_LOGS'],
};

/** Roles offered in the picker (aliases such as HON_JUSTICE / LAW_CLERK / NLU_SCHOLAR are omitted: same permissions). */
export const PREVIEW_ROLES = ['JUDICIAL_USER', 'RESEARCHER', 'FACULTY', 'STUDENT', 'REGISTRAR_NLUJ', 'AUDITOR', 'ADMINISTRATOR'];

export function isValidRole(r) { return typeof r === 'string' && Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, r); }

/** Only a signed-in user whose REAL role is the top admin role may preview. */
export function canPreview(user) { return !!user && user.role === TOP_ADMIN_ROLE; }

function defaultStorage() { try { return globalThis.sessionStorage || null; } catch { return null; } }

export function loadPreview(storage = defaultStorage()) {
  try { const v = storage?.getItem(PREVIEW_KEY); return isValidRole(v) ? v : null; } catch { return null; }
}
export function savePreview(role, storage = defaultStorage()) {
  try {
    if (isValidRole(role)) storage?.setItem(PREVIEW_KEY, role); else storage?.removeItem(PREVIEW_KEY);
  } catch { /* storage blocked: preview lasts for this page view only */ }
  return isValidRole(role) ? role : null;
}
export function clearPreview(storage = defaultStorage()) { return savePreview(null, storage); }

/** Same semantics as api.can: null is always true, arrays mean "any of". Display-only. */
export function previewCan(role) {
  const set = new Set(ROLE_PERMISSIONS[role] || []);
  const fn = (permission) => {
    if (!permission) return true;
    if (Array.isArray(permission)) return permission.some((p) => fn(p));
    return set.has(permission);
  };
  return fn;
}

/** The `can` the sidebar/topbar should use: the real one unless an eligible user has an active preview. */
export function effectiveCan(realCan, user, role) {
  return canPreview(user) && isValidRole(role) ? previewCan(role) : realCan;
}

/** The `user` pages see: the real one, with the previewed role swapped in while an eligible admin previews. Display only. */
export function effectiveUser(user, role) {
  return canPreview(user) && isValidRole(role) ? { ...user, role } : user;
}
