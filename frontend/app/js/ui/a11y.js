// a11y helpers shared by FE-UI components.
// uid('tab') -> unique id; focusables(root) -> tabbable elements in DOM order;
// trapKeydown(root, event) keeps Tab inside root (call from a keydown handler);
// safeUrl(url) -> url or null (blocks javascript:/data:/vbscript:).
let n = 0;
export function uid(prefix = 'g') { n += 1; return `${prefix}-${n}`; }

const NATIVE = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);
export function focusables(root) {
  const out = [];
  const walk = (el) => {
    for (const c of Array.from(el.children || [])) {
      const tag = String(c.tagName).toUpperCase();
      const ti = c.getAttribute('tabindex');
      const disabled = c.hasAttribute('disabled');
      if (c.hasAttribute('hidden')) continue;
      const tabbable = !disabled && ti !== '-1' &&
        (NATIVE.has(tag) || (tag === 'A' && c.hasAttribute('href')) || (ti != null && ti !== ''));
      if (tabbable) out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
}

export function trapKeydown(root, e) {
  if (e.key !== 'Tab') return;
  const items = focusables(root);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !root.contains(active))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (active === last || !root.contains(active))) { e.preventDefault(); first.focus(); }
}

export function safeUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  if (/^\s*(javascript|data|vbscript):/i.test(url)) return null;
  return url;
}
