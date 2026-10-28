// Pure logic for the Chamber and access page (no DOM).
// users: [{user_id,username,email,full_name,designation,institution,role,scope_role,badge_id,status:'ACTIVE'|'SUSPENDED',permissions:[]}]

export function initials(name) {
  const parts = String(name || '').replace(/[().,]/g, ' ').split(/\s+/).filter((w) => /^[A-Za-zऀ-ॿ]/.test(w) && !/^(dr|prof|mr|mrs|ms|hon|adv|justice|ca)$/i.test(w.replace(/'.*/, '')));
  const pick = parts.length ? parts : String(name || '?').split(/\s+/).filter(Boolean);
  return (pick[0]?.[0] || '?').toUpperCase() + (pick.length > 1 ? pick[pick.length - 1][0].toUpperCase() : '');
}

export function isActive(u) { return String(u?.status || 'ACTIVE').toUpperCase() !== 'SUSPENDED'; }

export function summarizeUsers(users = []) {
  const roles = new Set(users.map((u) => u.role).filter(Boolean));
  return { total: users.length, active: users.filter(isActive).length, suspended: users.filter((u) => !isActive(u)).length, roles: roles.size };
}

export function isSelf(u, me) {
  if (!me || !u) return false;
  const a = String(u.email || u.username || '').toLowerCase();
  const b = String(me.email || me.username || '').toLowerCase();
  return !!a && a === b;
}

/** Identifier sent to the toggle endpoint (it matches email, user_id or badge_id). */
export function toggleId(u) { return u.user_id ?? u.email ?? u.username; }

export function permissionSummary(u, max = 4) {
  const p = Array.isArray(u?.permissions) ? u.permissions : [];
  return { count: p.length, shown: p.slice(0, max), more: Math.max(0, p.length - max) };
}

export function humanizePermission(p) {
  const s = String(p || '').toLowerCase().replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function humanizeRole(r) {
  const s = String(r || '').toLowerCase().replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** Apply the server's answer to a local copy of the list. */
export function applyStatus(users, id, newStatus) {
  const key = String(id).toLowerCase();
  return users.map((u) => ([u.user_id, u.email, u.username, u.badge_id].some((v) => v != null && String(v).toLowerCase() === key) ? { ...u, status: newStatus } : u));
}

/**
 * Roles x permissions from the users payload (each user carries their role's permission list).
 * -> {roles:[{role, count}], permissions:[...sorted], has(role, perm)}. Built only from what the server sent.
 */
export function permissionMatrix(users = []) {
  const byRole = new Map();
  for (const u of users) {
    if (!u?.role) continue;
    const set = byRole.get(u.role) || new Set();
    (Array.isArray(u.permissions) ? u.permissions : []).forEach((p) => set.add(p));
    byRole.set(u.role, set);
  }
  const permissions = [...new Set([...byRole.values()].flatMap((s) => [...s]))].sort();
  const roles = [...byRole.entries()].map(([role, s]) => ({ role, count: s.size })).sort((a, b) => a.role.localeCompare(b.role));
  return { roles, permissions, has: (role, perm) => !!byRole.get(role)?.has(perm) };
}

export function badgeId(u) { return String(u?.badge_id ?? '').trim(); }
