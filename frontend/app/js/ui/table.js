// table({columns:[{key,label,render}], rows, empty:{title,message,action}|Node, onRowClick}) -> scrollable <table>.
// render(row) may return a Node or string; default is row[key]. Rows are keyboard-activable when onRowClick is set.
// Example: table({columns:[{key:'name',label:'Name'}], rows:[{name:'A'}], onRowClick: open})
import { h } from '../dom.js';
import { emptyState } from './empty-state.js';

export function table({ columns = [], rows = [], empty, onRowClick, caption } = {}) {
  if (!rows.length) {
    const e = empty instanceof Node ? empty : emptyState(empty || { title: 'Nothing to show' });
    return h('div', { class: 'g-table-wrap' }, e);
  }
  const head = h('thead', {}, h('tr', {}, ...columns.map((c) => h('th', { scope: 'col' }, c.label))));
  const body = h('tbody', {}, ...rows.map((row) => {
    const tr = h('tr', { class: onRowClick ? 'g-table__row--action' : null, tabindex: onRowClick ? '0' : null },
      ...columns.map((c) => h('td', {}, c.render ? c.render(row) : (row[c.key] ?? ''))));
    if (onRowClick) {
      tr.addEventListener('click', () => onRowClick(row));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); } });
    }
    return tr;
  }));
  return h('div', { class: 'g-table-wrap', tabindex: '0', role: 'region', 'aria-label': caption || 'Table' }, h('table', { class: 'g-table' }, caption ? h('caption', { class: 'g-sr' }, caption) : null, head, body));
}
