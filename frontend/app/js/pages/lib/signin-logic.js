// Pure helpers for the sign-in page (no DOM access).

const HONORIFICS = new Set(["hon'ble", 'honble', 'mr.', 'mrs.', 'ms.', 'dr.', '(dr.)', 'prof.', 'adv.', 'ca', 'shri', 'smt.', 'justice']);

/** '/research?q=a' -> '/research?q=a'. Anything that is not an in-app path (or points back at sign-in) becomes '/'. */
export function safeNext(next) {
  if (typeof next !== 'string') return '/';
  const n = next.trim();
  if (!n.startsWith('/') || n.startsWith('//') || n.includes('\\')) return '/';
  if (/^\/(signin|forbidden|not-found)(\?|\/|$)/.test(n)) return '/';
  return n;
}

/** "Hon'ble Mr. Justice R.K. Sharma" -> "RS"; "Prof. (Dr.) Harishankar Pareek" -> "HP". */
export function initials(fullName) {
  const parts = String(fullName || '').split(/\s+/).filter(Boolean)
    .filter((p) => !HONORIFICS.has(p.toLowerCase()));
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** Short form for buttons: "Hon'ble Mr. Justice R.K. Sharma" -> "Justice R.K. Sharma". */
export function displayName(fullName) {
  const parts = String(fullName || '').split(/\s+/).filter(Boolean);
  while (parts.length > 1 && /^(hon'ble|honble|mr\.|mrs\.|ms\.)$/i.test(parts[0])) parts.shift();
  return parts.join(' ');
}

/** Turn the /api/auth/roles payload ({roles, directory}) into a list of selectable profiles. */
export function profilesFromRoles(resp) {
  const dir = Array.isArray(resp?.directory) ? resp.directory : [];
  const roles = resp?.roles && typeof resp.roles === 'object' ? resp.roles : {};
  const seen = new Set();
  const out = [];
  for (const u of dir) {
    if (!u || !u.role || seen.has(u.role)) continue;
    seen.add(u.role);
    out.push({
      role: u.role,
      name: u.full_name || u.email || u.role,
      designation: u.designation || '',
      institution: u.institution || '',
      scopeRole: u.scope_role || (roles[u.role]?.title || u.role),
      badge: u.badge_id || '',
    });
  }
  return out;
}
