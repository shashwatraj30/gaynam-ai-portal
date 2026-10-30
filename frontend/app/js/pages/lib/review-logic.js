// Pure logic for Review and sign. No DOM access.
import { SECTION_KEYS, noisySections, emptySections, summarizeVerification, engineKind } from './studio-logic.js';

export const STEPS = ['DRAFT', 'IN_REVIEW', 'BENCH_APPROVED', 'FINAL_SEALED'];
/** RETURNED shows on the first step (back with the clerk). */
export function stepperCurrent(status) { return status === 'RETURNED' ? 'DRAFT' : (STEPS.includes(status) ? status : 'DRAFT'); }

/** Pre-approval checks as data; the page turns ids and data into translated text.
 *  verify = {status:'loading'|'done'|'error', results:[]} */
export function buildPreChecks({ texts, verify, engine }) {
  const items = [];
  const v = verify || { status: 'loading', results: [] };
  const sum = summarizeVerification(v.results);
  const vstate = (okState) => (v.status === 'loading' ? 'pending' : v.status === 'error' ? 'unchecked' : sum.total === 0 ? 'unchecked' : okState);
  items.push({ id: 'found', state: vstate(sum.missing.length ? 'fail' : 'pass'), data: { ...sum, status: v.status } });
  items.push({ id: 'overruled', state: vstate(sum.overruled.length ? 'fail' : 'pass'), data: { ...sum, status: v.status } });
  const noisy = noisySections(texts);
  items.push({ id: 'noise', state: noisy.length ? 'fail' : 'pass', data: { sections: noisy } });
  const empty = emptySections(texts);
  items.push({ id: 'filled', state: empty.length ? 'fail' : 'pass', data: { sections: empty } });
  items.push({ id: 'engine', state: 'unchecked', data: { kind: engineKind(engine) } });
  return items;
}
export function checksPending(items) { return items.some((i) => i.state === 'pending'); }
export function attentionCount(items) { return items.filter((i) => i.state === 'fail').length; }

/** What the sign-off panel offers. */
export function approvalGate({ status, canFinalize, pending }) {
  const next = status === 'IN_REVIEW' ? 'BENCH_APPROVED' : status === 'BENCH_APPROVED' ? 'FINAL_SEALED' : null;
  return {
    next,
    canReturn: status === 'IN_REVIEW' || status === 'BENCH_APPROVED',
    canAct: !!next && !!canFinalize && !pending,
    reason: !next ? 'not-reviewable' : !canFinalize ? 'no-permission' : pending ? 'checks-pending' : '',
  };
}

export function exportFileName(caseNumber, id) {
  let c = String(caseNumber || `Draft_${id}`).replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!c) c = `Draft_${id}`;
  return `Judicial_Judgment_${c}.docx`;
}

/** SHA-256 hex of an ArrayBuffer/Uint8Array; null when Web Crypto is unavailable (non-secure context). */
export async function sha256Hex(buf) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const d = await subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Which seal fingerprint to show for a draft (Bug 3). 'sealed' = hash frozen at the moment of sealing;
 * 'backfilled' = computed after the fact for a draft sealed before the fix (lower trust); 'preview' = not sealed,
 * so any export fingerprint is live and will change. */
export function sealFingerprint(d) {
  const status = String(d?.status || '').toUpperCase();
  if (status === 'FINAL_SEALED' && d?.sealed_hash) return { kind: d.sealed_hash_backfilled ? 'backfilled' : 'sealed', hash: String(d.sealed_hash), at: d.sealed_at || null };
  return { kind: 'preview', hash: null, at: null };
}
export { SECTION_KEYS };
