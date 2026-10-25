// 403 page (public so it renders even when the permission check failed).
import { h } from '../dom.js';
import { t, addMessages } from '../i18n/index.js';
import { loadCss } from '../ui/shell.js';
import { button } from '../ui/button.js';
import en from '../i18n/pages/settings.en.js';
import hi from '../i18n/pages/settings.hi.js';

addMessages('en', en);
addMessages('hi', hi);

async function render() {
  await loadCss('page-settings.css');
  return h('section', { class: 'g-page g-page--narrow system' },
    h('h1', { class: 'g-page__title' }, t('forbidden.heading')),
    h('p', { class: 'g-page__lede' }, t('forbidden.body')),
    button({ label: t('system.goHome'), variant: 'primary', href: '#/' }));
}

export default { route: '/forbidden', title: 'No access', permission: null, public: true, render, onLeave() {} };
