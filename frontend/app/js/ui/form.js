// field({label, input, hint, error, required}) -> <div class="g-field"> wiring label[for], aria-describedby, aria-invalid.
// input()/textarea()/select() build controls. The field node exposes .setError(msg|null).
// Example: const f = field({label:'Email', input: input({type:'email', name:'email'}), hint:'Work address'});
//          f.setError('Required');
import { h } from '../dom.js';
import { uid } from './a11y.js';

export function input(attrs = {}) { return h('input', { type: 'text', ...attrs, class: `g-input${attrs.class ? ' ' + attrs.class : ''}` }); }
export function textarea(attrs = {}) { return h('textarea', { rows: 4, ...attrs, class: `g-input g-textarea${attrs.class ? ' ' + attrs.class : ''}` }); }
export function select({ options = [], value, ...attrs } = {}) {
  const el = h('select', { ...attrs, class: `g-input g-select${attrs.class ? ' ' + attrs.class : ''}` },
    ...options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label ?? o.value)));
  return el;
}

// Pure-ish wiring: sets aria attributes on a control from the ids/error state.
export function wireControl(control, { hintId, errorId, error, required }) {
  const ids = [];
  if (hintId) ids.push(hintId);
  if (error && errorId) ids.push(errorId);
  if (ids.length) control.setAttribute('aria-describedby', ids.join(' ')); else control.removeAttribute('aria-describedby');
  if (error) control.setAttribute('aria-invalid', 'true'); else control.removeAttribute('aria-invalid');
  if (required) control.setAttribute('aria-required', 'true');
}

export function field({ label, input: control, hint, error, required } = {}) {
  const id = (control.getAttribute('id')) || uid('f');
  control.setAttribute('id', id);
  const hintId = hint ? `${id}-hint` : null;
  const errorId = `${id}-err`;
  const errEl = h('p', { class: 'g-field__error', id: errorId, role: 'alert' });
  const root = h('div', { class: 'g-field' },
    h('label', { class: 'g-field__label', for: id }, label, required ? h('span', { class: 'g-field__req', 'aria-hidden': 'true' }, ' *') : null),
    control,
    hint ? h('p', { class: 'g-field__hint', id: hintId }, hint) : null,
    errEl);
  root.setError = (msg) => {
    errEl.textContent = msg || '';
    if (msg) root.classList.add('g-field--error'); else root.classList.remove('g-field--error');
    wireControl(control, { hintId, errorId, error: msg, required });
  };
  root.setError(error || null);
  return root;
}
