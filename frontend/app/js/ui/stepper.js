// stepper({steps:[{id,label}], current}) -> <ol class="g-stepper">; current is a step id.
// stepStates(steps, current) -> ['done'|'current'|'todo', ...] (pure).
import { h, icon as svgIcon } from '../dom.js';
import { tf } from '../i18n/index.js';

export function stepStates(steps = [], current) {
  const idx = steps.findIndex((s) => s.id === current);
  return steps.map((_, i) => (idx < 0 ? 'todo' : i < idx ? 'done' : i === idx ? 'current' : 'todo'));
}
const WORD = { done: 'completed', current: 'current', todo: 'upcoming' };
export function stepper({ steps = [], current } = {}) {
  const states = stepStates(steps, current);
  return h('ol', { class: 'g-stepper', 'aria-label': tf('ui.progress', 'Progress') }, ...steps.map((s, i) => h('li', {
    class: `g-step g-step--${states[i]}`, 'aria-current': states[i] === 'current' ? 'step' : null },
    h('span', { class: 'g-step__dot', 'aria-hidden': 'true' }, states[i] === 'done' ? svgIcon('check', 14) : String(i + 1)),
    h('span', { class: 'g-step__label' }, s.label),
    h('span', { class: 'g-sr' }, ` (${tf(`ui.step.${states[i]}`, WORD[states[i]])})`))));
}
