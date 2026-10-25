// tabs({items:[{id,label,badge}], active, onChange}) -> tablist (roving tabindex, Left/Right/Home/End).
// Returned node has .select(id) and .tabId(id). Panels are the page's job: give them
// role="tabpanel" and aria-labelledby = el.tabId(id).
import { h } from '../dom.js';
import { uid } from './a11y.js';

// Pure: index of the tab to focus after a key press (null = key not handled).
export function nextTabIndex(key, index, length) {
  if (!length) return null;
  switch (key) {
    case 'ArrowRight': case 'ArrowDown': return (index + 1) % length;
    case 'ArrowLeft': case 'ArrowUp': return (index - 1 + length) % length;
    case 'Home': return 0;
    case 'End': return length - 1;
    default: return null;
  }
}

export function tabs({ items = [], active, onChange, label = 'Sections' } = {}) {
  const base = uid('tabs');
  let current = active ?? (items[0] && items[0].id);
  const btns = items.map((it) => h('button', {
    type: 'button', role: 'tab', class: 'g-tab', id: `${base}-${it.id}`, dataset: { tab: it.id },
  }, h('span', {}, it.label), it.badge != null ? h('span', { class: 'g-tab__badge' }, String(it.badge)) : null));
  const el = h('div', { class: 'g-tabs', role: 'tablist', 'aria-label': label }, ...btns);
  const paint = () => items.forEach((it, i) => {
    const on = it.id === current;
    btns[i].setAttribute('aria-selected', on ? 'true' : 'false');
    btns[i].setAttribute('tabindex', on ? '0' : '-1');
    btns[i].className = on ? 'g-tab g-tab--on' : 'g-tab';
  });
  const select = (id, focus) => {
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) return;
    const changed = current !== id;
    current = id; paint();
    if (focus) btns[i].focus();
    if (changed && onChange) onChange(id);
  };
  btns.forEach((b, i) => {
    b.addEventListener('click', () => select(items[i].id, false));
    b.addEventListener('keydown', (e) => {
      const ni = nextTabIndex(e.key, i, items.length);
      if (ni == null) return;
      e.preventDefault();
      select(items[ni].id, true);
    });
  });
  paint();
  el.select = (id) => select(id, false);
  el.tabId = (id) => `${base}-${id}`;
  return el;
}
