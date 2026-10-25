// Central status -> {label, tone} mappings (plan P9). Render with chip() from ui/chip.js.
//   draftStatusChip('IN_REVIEW') -> {label:'In review', tone:'info'}
//   precedentChip('FOLLOWED') -> {label:'No adverse treatment recorded', tone:'neutral'}
// FOLLOWED is the ingest default, so it is never shown as a positive finding.
// Labels go through t()/tf() (en+hi) with the English strings as fallbacks. Pure module: no DOM access.
import { tf } from '../i18n/index.js';

export const DRAFT_STATUSES = ['DRAFT', 'IN_REVIEW', 'BENCH_APPROVED', 'FINAL_SEALED', 'RETURNED'];

const LEGACY = {
  CHAMBER_REVIEW: 'IN_REVIEW', UNDER_REVIEW: 'IN_REVIEW', REVIEW: 'IN_REVIEW', PENDING_REVIEW: 'IN_REVIEW',
  APPROVED: 'BENCH_APPROVED', SIGNED: 'FINAL_SEALED', SEALED: 'FINAL_SEALED',
};
export function normalizeDraftStatus(s) {
  const k = String(s || 'DRAFT').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return LEGACY[k] || (DRAFT_STATUSES.includes(k) ? k : 'DRAFT');
}
const DRAFT_MAP = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  IN_REVIEW: { label: 'In review', tone: 'info' },
  BENCH_APPROVED: { label: 'Approved by bench', tone: 'primary' },
  FINAL_SEALED: { label: 'Final, sealed', tone: 'primary' },
  RETURNED: { label: 'Returned to clerk', tone: 'warn' },
};
const PREC = {
  none: 'No adverse treatment recorded', overruled: 'Overruled', distinguished: 'Distinguished', partly: 'Partly overruled',
  doubted: 'Doubted', notfound: 'Not found in corpus', unknown: 'Status not recorded',
};
const pl = (k) => ({ label: tf(`status.prec.${k}`, PREC[k]) });
export function draftStatusChip(status) {
  const k = normalizeDraftStatus(status);
  return { label: tf(`status.draft.${k}`, DRAFT_MAP[k].label), tone: DRAFT_MAP[k].tone };
}

export function precedentChip(status, { curated = false } = {}) {
  const k = String(status || '').trim().toUpperCase();
  switch (k) {
    case 'OVERRULED': return { ...pl('overruled'), tone: 'danger' };
    case 'DISTINGUISHED': return { ...pl('distinguished'), tone: 'warn' };
    case 'PARTIALLY_OVERRULED': return { ...pl('partly'), tone: 'warn' };
    case 'DOUBTED': case 'QUESTIONED': return { ...pl('doubted'), tone: 'warn' };
    case 'UNVERIFIED_EXTERNAL': case 'NOT_FOUND': return { ...pl('notfound'), tone: 'warn' };
    case 'ACTIVE': case 'GOOD_LAW': case 'FOLLOWED':
      return curated && k !== 'FOLLOWED'
        ? { ...pl('none'), tone: 'primary' }
        : { ...pl('none'), tone: 'neutral' };
    default: return { ...pl('unknown'), tone: 'neutral' };
  }
}

/** Allowed next statuses for the UI (server enforces; plan B7). */
export const DRAFT_TRANSITIONS = {
  DRAFT: ['IN_REVIEW'],
  IN_REVIEW: ['BENCH_APPROVED', 'RETURNED'],
  RETURNED: ['IN_REVIEW', 'DRAFT'],
  BENCH_APPROVED: ['FINAL_SEALED', 'RETURNED'],
  FINAL_SEALED: [],
};
