// Settings: language, density, AI key note (D7: server-side only, nothing secret stored in the browser).
import { h } from '../dom.js';
import { t, addMessages, getLang, setLang } from '../i18n/index.js';
import { loadCss } from '../ui/shell.js';
import { card } from '../ui/card.js';
import { chip } from '../ui/chip.js';
import { DENSITIES, loadDensity, saveDensity, applyDensity, FONT_SIZES, loadFontSize, saveFontSize, applyFontSize } from './lib/settings-logic.js';
import en from '../i18n/pages/settings.en.js';
import hi from '../i18n/pages/settings.hi.js';

addMessages('en', en);
addMessages('hi', hi);

function radioGroup(name, legend, options, current, hint, onPick) {
  return h('fieldset', { class: 'settings__fieldset' },
    h('legend', { class: 'settings__legend' }, legend),
    h('div', { class: 'settings__opts' }, ...options.map((o) => {
      const inp = h('input', { type: 'radio', name, value: o.value, checked: o.value === current });
      inp.addEventListener('change', () => onPick(o.value));
      if (name === 'fontsize' && typeof window !== 'undefined') window.addEventListener('gyanam:fontsize', (e) => { inp.checked = inp.value === e.detail; });
      return h('label', { class: 'settings__opt' }, inp, h('span', {}, o.label));
    })),
    hint ? h('p', { class: 'g-meta' }, hint) : null);
}

async function render(params, ctx) {
  await Promise.all([loadCss('page-settings.css'), loadCss('page-density.css'), loadCss('page-fontsize.css')]);
  const density = loadDensity();
  applyDensity(density);
  return h('section', { class: 'g-page g-page--narrow' },
    h('header', { class: 'g-page__head' }, h('div', {},
      h('h1', { class: 'g-page__title' }, t('settings.title')),
      h('p', { class: 'g-page__lede' }, t('settings.lede')))),
    card({ title: t('settings.language') },
      radioGroup('lang', t('settings.language.label'),
        [{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }], getLang(), t('settings.language.hint'),
        (v) => setLang(v))),
    card({ title: t('settings.density') },
      radioGroup('density', t('settings.density.label'),
        DENSITIES.map((d) => ({ value: d, label: t(`settings.density.${d}`) })), density, t('settings.density.hint'),
        (v) => { applyDensity(saveDensity(v)); ctx.toast(t('settings.saved'), { tone: 'primary' }); })),
    card({ title: t('settings.fontsize') },
      radioGroup('fontsize', t('settings.fontsize.label'),
        FONT_SIZES.map((s) => ({ value: s, label: t(`settings.fontsize.${s}`) })), loadFontSize(), t('settings.fontsize.hint'),
        (v) => { applyFontSize(saveFontSize(v)); ctx.toast(t('settings.saved'), { tone: 'primary' }); })),
    card({ title: t('settings.ai'), actions: chip({ label: t('settings.ai.status'), tone: 'neutral' }) },
      h('p', {}, t('settings.ai.body'))));
}

export default { route: '/settings', title: 'Settings', permission: null, render, onLeave() {} };
