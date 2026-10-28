// Pure word-level diff (LCS). No DOM. diffWords(a, b) -> [{type:'eq'|'ins'|'del', text}] (adjacent same-type parts merged).
// diffSections(snapA, snapB) -> per-section rows for the version compare view.
import { SECTION_KEYS, normalizeSections } from './studio-logic.js';

const MAX_CELLS = 4000000;

function tokens(s) { return String(s || '').match(/\s+|[^\s]+/g) || []; }

function push(out, type, text) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === type) last.text += text; else out.push({ type, text });
}

export function diffWords(a, b) {
  const x = tokens(a); const y = tokens(b);
  let s = 0;
  while (s < x.length && s < y.length && x[s] === y[s]) s++;
  let ex = x.length; let ey = y.length;
  while (ex > s && ey > s && x[ex - 1] === y[ey - 1]) { ex--; ey--; }
  const mx = x.slice(s, ex); const my = y.slice(s, ey);
  const out = [];
  push(out, 'eq', x.slice(0, s).join(''));
  if (!mx.length || !my.length || mx.length * my.length > MAX_CELLS) {
    push(out, 'del', mx.join('')); push(out, 'ins', my.join(''));
  } else {
    const n = mx.length; const m = my.length; const w = m + 1;
    const L = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        L[i * w + j] = mx[i] === my[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
      }
    }
    let i = 0; let j = 0;
    while (i < n && j < m) {
      if (mx[i] === my[j]) { push(out, 'eq', mx[i]); i++; j++; }
      else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) { push(out, 'del', mx[i]); i++; }
      else { push(out, 'ins', my[j]); j++; }
    }
    while (i < n) push(out, 'del', mx[i++]);
    while (j < m) push(out, 'ins', my[j++]);
  }
  push(out, 'eq', x.slice(ex).join(''));
  return out;
}

/** A stored snapshot may be the draft JSON itself, {sections}, or {draft_content_json:{sections}}. null -> all empty. */
export function snapshotTexts(snap) {
  if (!snap || typeof snap !== 'object') return normalizeSections(null);
  const raw = snap.draft_content_json?.sections ?? snap.sections ?? snap;
  return normalizeSections(raw);
}

export function diffSections(snapA, snapB) {
  const a = snapshotTexts(snapA); const b = snapshotTexts(snapB);
  return SECTION_KEYS.map((key, i) => {
    const parts = diffWords(a[key], b[key]);
    return { key, n: i + 1, changed: parts.some((p) => p.type !== 'eq'), parts };
  });
}
