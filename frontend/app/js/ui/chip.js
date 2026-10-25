// chip({label, tone:'neutral|primary|danger|warn|info', icon}) -> <span class="g-chip g-chip--tone">
// Always renders text (status = word + colour). Example: chip({label:'Verified', tone:'primary', icon:'check'})
import { h, icon as svgIcon } from '../dom.js';

export const TONES = ['neutral', 'primary', 'danger', 'warn', 'info'];
export function chip({ label, tone = 'neutral', icon } = {}) {
  const t = TONES.includes(tone) ? tone : 'neutral';
  return h('span', { class: `g-chip g-chip--${t}` }, icon ? svgIcon(icon, 14) : null, h('span', {}, String(label ?? '')));
}
