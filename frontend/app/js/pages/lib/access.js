// Shared access rules for pages (pure; no DOM).
// MATTER_ACCESS: any one of these permissions grants access to Matters (plan §5.1). Used as the router `permission` array.
export const MATTER_ACCESS = ['DRAFT_FULL', 'UPLOAD_PLEADING'];
export function hasAccess(can, perms = MATTER_ACCESS) { return perms.some((p) => can(p)); }
