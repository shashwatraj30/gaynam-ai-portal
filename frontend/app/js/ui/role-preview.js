// Admin-only "Preview as role" DOM pieces (logic lives in role-preview-logic.js).
// buildPreviewPicker({role, onChange}) -> {el, focus()}   a labelled <select> for the top bar
// buildPreviewBanner({role, onExit}) -> {el, focus()}     persistent banner with an "Exit preview" button
// Display only: nothing here touches tokens, API calls or server permissions.
import { h, icon } from '../dom.js';
import { t } from '../i18n/index.js';
import { PREVIEW_ROLES } from './role-preview-logic.js';

export function buildPreviewPicker({ role, onChange }) {
  const sel = h('select', { class: 'g-preview__select', id: 'g-preview-select', 'aria-label': t('preview.label'), title: t('preview.hint'),
    onChange: () => onChange?.(sel.value || null) },
  h('option', { value: '' }, t('preview.none')),
  PREVIEW_ROLES.map((r) => h('option', { value: r }, t(`preview.role.${r}`))));
  sel.value = role || '';
  const el = h('div', { class: 'g-preview' }, h('label', { class: 'g-preview__lbl', for: 'g-preview-select' }, t('preview.label')), sel);
  return { el, focus: () => sel.focus() };
}

export function buildPreviewBanner({ role, onExit }) {
  const btn = h('button', { type: 'button', class: 'g-preview__exit', onClick: () => onExit?.() }, t('preview.exit'));
  const el = h('div', { class: 'g-preview-banner', role: 'region', 'aria-label': t('preview.bannerLabel') },
    icon('shield', 16),
    h('span', { class: 'g-preview-banner__text' }, t('preview.banner', { role: t(`preview.role.${role}`) })),
    btn);
  return { el, focus: () => btn.focus() };
}
