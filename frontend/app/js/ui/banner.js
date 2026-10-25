// banner({tone:'info|warn|danger|primary|neutral', message, action:{label,onClick,href}})
// For "sample data", offline, canned-text notices. Example: banner({tone:'warn', message:'Sample data'})
import { h } from '../dom.js';
import { button } from './button.js';

export function banner({ tone = 'info', message, action } = {}) {
  return h('div', { class: `g-banner g-banner--${tone}`, role: tone === 'danger' ? 'alert' : 'status' },
    h('span', { class: 'g-banner__msg' }, message || ''),
    action ? button({ label: action.label, variant: 'ghost', onClick: action.onClick, href: action.href }) : null);
}
