// Pure logic for the Library page (no DOM).
// /api/docs/list -> [{filename,title,path}]. The commercial proposal needs MANAGE_USERS (plan 5.1). The UI hides it;
// the server must enforce it too (P10), which it does not yet.

export const RESTRICTED = ['COMMERCIAL_PROPOSAL_GYANAM_AI.md'];
// Engineering plan, not an institutional document: kept out of the reader list.
export const HIDDEN = ['UI_REDESIGN_PLAN.md'];

const ORDER = [
  'JUDICIAL_BENCH_USER_MANUAL.md', 'SYSTEM_ARCHITECTURE_SPECIFICATION.md', 'ADMIN_DEPLOYMENT_GUIDE.md',
  'DPDP_ACT_2023_COMPLIANCE_WHITE_PAPER.md', 'TENDER_COMPLIANCE_DOSSIER.md', 'COMPREHENSIVE_SYSTEM_AUDIT_REPORT.md',
  'COMMERCIAL_PROPOSAL_GYANAM_AI.md',
];

export const DOC_KEYS = {
  'JUDICIAL_BENCH_USER_MANUAL.md': 'bench',
  'SYSTEM_ARCHITECTURE_SPECIFICATION.md': 'arch',
  'ADMIN_DEPLOYMENT_GUIDE.md': 'admin',
  'DPDP_ACT_2023_COMPLIANCE_WHITE_PAPER.md': 'dpdp',
  'TENDER_COMPLIANCE_DOSSIER.md': 'tender',
  'COMPREHENSIVE_SYSTEM_AUDIT_REPORT.md': 'audit',
  'COMMERCIAL_PROPOSAL_GYANAM_AI.md': 'commercial',
};

export function isRestricted(filename) { return RESTRICTED.includes(filename); }
export function canSeeDoc(filename, can) { return !isRestricted(filename) || !!can('MANAGE_USERS'); }

/** Sorted, filtered list the current user may see. */
export function visibleDocs(list = [], can = () => false) {
  const rank = (f) => { const i = ORDER.indexOf(f); return i < 0 ? ORDER.length : i; };
  return list
    .filter((d) => d && d.filename && !HIDDEN.includes(d.filename) && canSeeDoc(d.filename, can))
    .sort((a, b) => rank(a.filename) - rank(b.filename) || a.filename.localeCompare(b.filename));
}

export function docKey(filename) { return DOC_KEYS[filename] || null; }

export function libraryHref(filename) { return `#/library/${encodeURIComponent(filename)}`; }

/** TOC entries: levels 2 and 3 only (level 1 is the document title). */
export function tocEntries(headings = []) { return headings.filter((x) => x.level >= 2 && x.level <= 3); }
