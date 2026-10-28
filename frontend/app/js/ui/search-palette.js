// searchPalette({commands:[{id,label,hint,group,keywords,run}], placeholder}) -> {el, open, close, toggle, destroy}
// Ctrl/Cmd+K toggles. Combobox + listbox semantics; ArrowUp/Down move, Enter runs, Esc closes.
// Mounted once by the shell. Example: const p = searchPalette({commands:[{id:'home', label:'Home', run:()=>go('#/')}])
import { h } from '../dom.js';
import { createOverlay } from './overlay.js';
import { uid } from './a11y.js';

// Pure: filter commands by every whitespace-separated term appearing in label/hint/group/keywords.
export function filterCommands(commands = [], query = '') {
  const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return commands.slice();
  return commands.filter((c) => {
    const hay = [c.label, c.hint, c.group, c.keywords].filter(Boolean).join(' ').toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}
// Pure: commands built from the typed text (permission-aware). `go(hash)` navigates; `tr(key, vars)` translates.
// Returns [] for empty input.
export function dynamicCommands(query, { can = () => false, tr = (k) => k, go = () => {} } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const enc = encodeURIComponent(q);
  const defs = [
    ['dyn-search', 'cmd.searchFor', `#/research?q=${enc}`, can('SEARCH')],
    ['dyn-check', 'cmd.checkCitation', `#/judgments/check?c=${enc}`, can('VERIFY_CITATION') || can('SEARCH')],
    ['dyn-docs', 'cmd.openDocs', `#/documents?q=${enc}`, can('UPLOAD_PLEADING') || can('DRAFT_FULL')],
  ];
  return defs.filter((d) => d[3]).map(([id, key, href]) => ({ id, label: tr(key, { q }), group: 'Search', href, dynamic: true, run: () => go(href) }));
}
// Pure: next active index with wrap-around.
export function moveIndex(index, delta, length) {
  if (!length) return -1;
  return (index + delta + length) % length;
}

export function searchPalette({ commands: initial = [], placeholder = 'Type a command or search', dynamic = null } = {}) {
  const listId = uid('pal-list');
  let commands = initial.slice();
  let results = commands.slice();
  let active = 0;
  const input = h('input', {
    type: 'text', class: 'g-input g-palette__input', role: 'combobox', 'aria-expanded': 'true',
    'aria-controls': listId, 'aria-autocomplete': 'list', 'aria-label': 'Search commands', placeholder, autocomplete: 'off',
  });
  const list = h('ul', { class: 'g-palette__list', role: 'listbox', id: listId, 'aria-label': 'Commands' });
  const body = h('div', { class: 'g-palette' }, input, list);
  const dlg = createOverlay({ kind: 'modal', title: 'Command palette', body, initialFocus: () => input, onClose: () => { input.value = ''; } });
  dlg.el.classList.add('g-overlay--palette');

  const optId = (i) => `${listId}-o${i}`;
  function paint() {
    while (list.firstChild) list.removeChild(list.firstChild);
    if (!results.length) list.append(h('li', { class: 'g-palette__none', role: 'presentation' }, 'No matching commands'));
    results.forEach((c, i) => {
      const li = h('li', { class: `g-palette__opt${i === active ? ' g-palette__opt--on' : ''}`, role: 'option', id: optId(i), 'aria-selected': i === active ? 'true' : 'false' },
        h('span', { class: 'g-palette__label' }, c.label), c.hint ? h('span', { class: 'g-palette__hint' }, c.hint) : null);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); run(i); });
      list.append(li);
    });
    if (results.length) input.setAttribute('aria-activedescendant', optId(active)); else input.removeAttribute('aria-activedescendant');
  }
  function run(i) {
    const c = results[i];
    if (!c) return;
    dlg.close();
    if (c.run) c.run();
  }
  const compute = (q) => [...(typeof dynamic === 'function' ? dynamic(q) : []), ...filterCommands(commands, q)];
  input.addEventListener('input', () => { results = compute(input.value); active = 0; paint(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = moveIndex(active, 1, results.length); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = moveIndex(active, -1, results.length); paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(active); }
  });
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); api.toggle(); }
  };
  document.addEventListener('keydown', onKey);
  const api = {
    el: dlg.el,
    open() { results = commands.slice(); active = 0; paint(); dlg.open(); },
    close() { dlg.close(); },
    // Replace the command list (e.g. when the sidebar is rebuilt); keeps the current query if open.
    setCommands(next = []) {
      commands = Array.from(next);
      results = compute(input.value); active = 0;
      if (dlg.isOpen) paint();
    },
    toggle() { if (dlg.isOpen) dlg.close(); else api.open(); },
    destroy() { document.removeEventListener('keydown', onKey); dlg.close(); },
  };
  return api;
}
