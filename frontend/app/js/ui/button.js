// button({label, variant:'primary|secondary|ghost|danger', icon, onClick, disabled, type, href})
// Renders <a> when href is given, otherwise <button type="button"> (type defaults to 'button').
// Example: button({label:'Save', variant:'primary', onClick: save})
import { h, icon as svgIcon } from '../dom.js';
import { safeUrl } from './a11y.js';

export function button({ label, variant = 'secondary', icon, onClick, disabled, type = 'button', href, ariaLabel } = {}) {
  const cls = `g-btn g-btn--${variant}`;
  const kids = [icon ? svgIcon(icon, 18) : null, label != null ? h('span', {}, String(label)) : null];
  const safe = href ? safeUrl(href) : null;
  if (safe) {
    const a = h('a', { class: cls, href: safe, 'aria-label': ariaLabel, 'aria-disabled': disabled ? 'true' : null }, ...kids);
    if (onClick) a.addEventListener('click', onClick);
    return a;
  }
  return h('button', { class: cls, type, disabled: !!disabled, 'aria-label': ariaLabel, onClick }, ...kids);
}
