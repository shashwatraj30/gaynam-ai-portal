// Pure logic for the Citation check page. Response of POST /api/verify_single_citation:
// {status: VERIFIED_ACTIVE|OVERRULED_WARNING|DISTINGUISHED(_CAUTION)|HALLUCINATED_OR_UNVERIFIED|UNVERIFIED_EXTERNAL, verified, message, case_data|null}
// The server `message` says "Active & Good Law" for default rows; we never show it (P9) and compose our own wording.

export const SAMPLES = ['(2017) 10 SCC 1', '(1976) 2 SCC 521', '(1993) 4 SCC 727', '(2008) 4 SCC 54', '(2010) 11 SCC 441'];

const FORMATS = [
  ['SCC OnLine', /SCC\s*OnLine/i], ['SCC', /\bSCC\b/i], ['AIR', /\bAIR\b/i], ['SCR', /\bSCR\b/i],
  ['INSC', /INSC/i], ['RLW', /\bRLW\b/i], ['CNR', /^[A-Z]{4}\d{12}$/],
];
export function detectFormat(text) {
  const s = String(text || '').trim();
  for (const [name, re] of FORMATS) if (re.test(s)) return name;
  return null;
}

export function normalizeInput(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }

/** Past checks kept for this browser session (newest first, unique). */
export function addPast(list, entry, max = 8) {
  const q = normalizeInput(entry.q);
  if (!q) return list || [];
  return [{ q, outcome: entry.outcome }, ...(list || []).filter((e) => e.q.toLowerCase() !== q.toLowerCase())].slice(0, max);
}

/** -> {outcome:'overruled'|'distinguished'|'found'|'notfound', caseData, overruledBy, checks:[{id,state,detail?}]} */
export function interpretResult(res, input) {
  const c = res?.case_data || res?.case || null;
  const status = String(res?.status || '').toUpperCase();
  const fmt = detectFormat(input);
  const checks = [{ id: 'format', state: fmt ? 'pass' : 'unchecked', detail: fmt || '' }];
  if (!c || status.startsWith('UNVERIFIED') || status.startsWith('HALLUCINATED')) {
    checks.push({ id: 'found', state: 'fail' }, { id: 'treatment', state: 'unchecked' });
    return { outcome: 'notfound', caseData: null, overruledBy: '', checks };
  }
  const ps = String(c.precedent_status || '').toUpperCase();
  const overruled = status === 'OVERRULED_WARNING' || ps === 'OVERRULED';
  const distinguished = !overruled && (status.startsWith('DISTINGUISHED') || ps === 'DISTINGUISHED');
  checks.push({ id: 'found', state: 'pass' });
  checks.push({ id: 'treatment', state: overruled ? 'fail' : distinguished ? 'pending' : 'pass' });
  checks.push({ id: 'quote', state: 'unchecked' });
  return {
    outcome: overruled ? 'overruled' : distinguished ? 'distinguished' : 'found',
    caseData: c, overruledBy: c.overruled_by || res?.overruled_by || '', checks,
  };
}
