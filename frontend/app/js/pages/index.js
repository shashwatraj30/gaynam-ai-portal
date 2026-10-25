// Registers every page module (plan §5.1). A missing page file is skipped with a console warning.
// Page modules `export default { route, title, permission, render, onLeave }` (optionally public:true, bare:true).
import { registerPage } from '../router.js';

export const PAGE_FILES = [
  'signin', 'home', 'research', 'judgment', 'citation-check', 'matters', 'matter', 'intake',
  'drafts', 'studio', 'review', 'graph', 'alerts', 'audit', 'chamber', 'library', 'settings',
  'forbidden', 'not-found', 'kit',
];

// Pages are loaded on demand (the whole set was an 1.8 s module waterfall before the first paint).
const inflight = new Map();

/** Page files needed to serve a hash route. Unknown routes load everything so 404 vs. a real page is decided correctly. */
export function filesForHash(hash) {
  const path = String(hash || '').replace(/^#/, '').split('?')[0].replace(/\/+$/, '') || '/';
  const seg = path.split('/').filter(Boolean)[0] || '';
  const base = ['forbidden', 'not-found'];
  const map = {
    '': ['home'], signin: ['signin'], research: ['research'], judgments: ['judgment', 'citation-check'],
    matters: ['matters', 'matter', 'intake'], drafts: ['drafts', 'studio', 'review'], graph: ['graph'],
    alerts: ['alerts'], audit: ['audit'], chamber: ['chamber'], library: ['library'], settings: ['settings'],
    forbidden: [], 'not-found': [], _kit: ['kit'],
  };
  return seg in map ? [...base, ...map[seg]] : PAGE_FILES.slice();
}

/** Router hook: make sure the pages for this hash are registered. */
export function ensurePagesFor(hash) { return loadPages(filesForHash(hash)); }

export async function loadPages(files = PAGE_FILES) {
  const loaded = [];
  await Promise.all(files.map(async (name) => {
    if (inflight.has(name)) { await inflight.get(name); return; }
    let done; inflight.set(name, new Promise((r) => { done = r; }));
    try {
      const mod = await import(`./${name}.js`);
      const pg = mod.default;
      (Array.isArray(pg) ? pg : [pg]).forEach((p) => { if (p) { registerPage(p); loaded.push(p.route); } });
    } catch (e) {
      console.warn(`pages: ${name}.js skipped (${e?.message || e})`);
    } finally { done(); }
  }));
  return loaded;
}
