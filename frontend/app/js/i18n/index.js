// i18n: t('nav.home', {n:3}) with {n} interpolation; missing hi falls back to en, then to the key.
// Page agents: addMessages('en', obj) / addMessages('hi', obj) at module load. setLang('hi'|'en') persists.
// Pure module: DOM/storage access guarded.
import en from './en.js';
import hi from './hi.js';

const msgs = { en: { ...en }, hi: { ...hi } };
let lang = 'en';
const listeners = new Set();
function ls() { try { return globalThis.localStorage || null; } catch { return null; } }
try { const v = ls()?.getItem('gyanam.lang'); if (v === 'en' || v === 'hi') lang = v; } catch { /* ignore */ }

export function addMessages(l, obj) { msgs[l] = Object.assign(msgs[l] || {}, obj); }
export function getLang() { return lang; }
export function setLang(l) {
  if (!msgs[l]) return;
  lang = l;
  try { ls()?.setItem('gyanam.lang', l); } catch { /* ignore */ }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  listeners.forEach((fn) => fn(l));
}
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** t() with an English fallback string when the key is missing in every language. */
export function tf(key, fallback, vars) {
  const s = t(key, vars);
  if (s !== key) return s;
  let f = fallback;
  if (vars) for (const k of Object.keys(vars)) f = f.split('{' + k + '}').join(String(vars[k]));
  return f;
}
export function t(key, vars) {
  let s = msgs[lang]?.[key] ?? msgs.en?.[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}
