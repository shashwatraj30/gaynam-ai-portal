// 404 page.
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
    h('h1', { class: 'g-page__title' }, t('notfound.heading')),
    h('p', { class: 'g-page__lede' }, t('notfound.body')),
    button({ label: t('system.goHome'), variant: 'primary', href: '#/' }));
}

export default { route: '/not-found', title: 'Not found', permission: null, public: true, render, onLeave() {} };
