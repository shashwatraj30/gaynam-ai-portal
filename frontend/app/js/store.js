// Tiny pub/sub store. store.get(k), store.set(k, v, {session:true}), store.on(k, fn) -> unsubscribe.
// Hand-off keys: benchBrief, intakeParams, alertTarget. session:true also persists to sessionStorage.
// Pure module: storage access is guarded.
const mem = new Map();
const subs = new Map();
const PFX = 'gyanam.store.';
function ss() { try { return globalThis.sessionStorage || null; } catch { return null; } }
export const store = {
  get(key) {
    if (mem.has(key)) return mem.get(key);
    const s = ss();
    if (s) { try { const raw = s.getItem(PFX + key); if (raw != null) { const v = JSON.parse(raw); mem.set(key, v); return v; } } catch { /* ignore */ } }
    return undefined;
  },
  set(key, val, opts = {}) {
    mem.set(key, val);
    const s = ss();
    if (opts.session && s) { try { s.setItem(PFX + key, JSON.stringify(val)); } catch { /* ignore */ } }
    (subs.get(key) || []).slice().forEach((fn) => { try { fn(val); } catch (e) { console.error(e); } });
  },
  remove(key) {
    mem.delete(key);
    const s = ss(); if (s) { try { s.removeItem(PFX + key); } catch { /* ignore */ } }
    (subs.get(key) || []).slice().forEach((fn) => fn(undefined));
  },
  on(key, fn) {
    if (!subs.has(key)) subs.set(key, []);
    subs.get(key).push(fn);
    return () => { const a = subs.get(key); const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
  },
  _reset() { mem.clear(); subs.clear(); },
};
export default store;
