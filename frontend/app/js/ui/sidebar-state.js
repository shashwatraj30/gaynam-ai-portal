// Pure sidebar collapse state. Storage is injectable so it is testable without a DOM.
// Stored under 'gyanam.sidebar' as 'collapsed' | 'expanded'; anything else means 'expanded'.
export const SIDEBAR_KEY = 'gyanam.sidebar';

export function normalize(v) { return v === 'collapsed' ? 'collapsed' : 'expanded'; }

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function load(storage = defaultStorage()) {
  try { return normalize(storage?.getItem(SIDEBAR_KEY)); } catch { return 'expanded'; }
}

export function save(state, storage = defaultStorage()) {
  const v = normalize(state);
  try { storage?.setItem(SIDEBAR_KEY, v); } catch { /* storage blocked: choice lasts for this page view only */ }
  return v;
}

export function toggle(state) { return normalize(state) === 'collapsed' ? 'expanded' : 'collapsed'; }
