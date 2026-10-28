// Pure helpers for Settings: density preference with injectable storage (works in Node).
export const DENSITIES = ['comfortable', 'compact'];
export const DENSITY_KEY = 'gyanam.density';

export function normalizeDensity(v) { return DENSITIES.includes(v) ? v : 'comfortable'; }

function defStore() { try { return globalThis.localStorage || null; } catch { return null; } }

export function loadDensity(store = defStore()) {
  try { return normalizeDensity(store?.getItem(DENSITY_KEY)); } catch { return 'comfortable'; }
}
export function saveDensity(v, store = defStore()) {
  const d = normalizeDensity(v);
  try { store?.setItem(DENSITY_KEY, d); } catch { /* ignore */ }
  return d;
}
/** Sets data-density on <html> (guarded for Node). */
export function applyDensity(v, root = (typeof document !== 'undefined' ? document.documentElement : null)) {
  const d = normalizeDensity(v);
  if (root) root.dataset.density = d;
  return d;
}

// ---- Font size: four levels applied app-wide through <html data-fontsize> (css/page-fontsize.css) ----
export const FONT_SIZES = ['small', 'default', 'large', 'xlarge'];
export const FONT_SIZE_KEY = 'gyanam.fontsize';

export function normalizeFontSize(v) { return FONT_SIZES.includes(v) ? v : 'default'; }

export function loadFontSize(store = defStore()) {
  try { return normalizeFontSize(store?.getItem(FONT_SIZE_KEY)); } catch { return 'default'; }
}
export function saveFontSize(v, store = defStore()) {
  const s = normalizeFontSize(v);
  try { store?.setItem(FONT_SIZE_KEY, s); } catch { /* ignore */ }
  return s;
}
/** Sets data-fontsize on <html> (guarded for Node). */
export function applyFontSize(v, root = (typeof document !== 'undefined' ? document.documentElement : null)) {
  const s = normalizeFontSize(v);
  if (root) root.dataset.fontsize = s;
  try { if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') window.dispatchEvent(new CustomEvent('gyanam:fontsize', { detail: s })); } catch { /* ignore */ }
  return s;
}
/** One step larger (dir > 0) or smaller (dir < 0), clamped to the ends. */
export function stepFontSize(current, dir) {
  const i = FONT_SIZES.indexOf(normalizeFontSize(current));
  return FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, i + (dir > 0 ? 1 : -1)))];
}

// ---- Theme: system (follow the OS) / light / dark, applied through <html data-theme> (css/tokens.css) ----
export const THEMES = ['system', 'light', 'dark'];
export const THEME_KEY = 'gyanam.theme';

export function normalizeTheme(v) { return THEMES.includes(v) ? v : 'system'; }

export function loadTheme(store = defStore()) {
  try { return normalizeTheme(store?.getItem(THEME_KEY)); } catch { return 'system'; }
}
export function saveTheme(v, store = defStore()) {
  const s = normalizeTheme(v);
  try { store?.setItem(THEME_KEY, s); } catch { /* ignore */ }
  return s;
}
/** "system" removes data-theme so the prefers-color-scheme rule decides; light/dark set it. */
export function applyTheme(v, root = (typeof document !== 'undefined' ? document.documentElement : null)) {
  const s = normalizeTheme(v);
  if (root) { if (s === 'system') delete root.dataset.theme; else root.dataset.theme = s; }
  return s;
}
