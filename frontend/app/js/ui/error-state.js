// errorState({message, requestId, onRetry}) -> role="alert" block with Retry button and request id.
import { h } from '../dom.js';
import { button } from './button.js';
import { tf } from '../i18n/index.js';

export function errorState({ message, requestId, onRetry, retryLabel } = {}) {
  return h('div', { class: 'g-error', role: 'alert' },
    h('h3', { class: 'g-error__title' }, tf('state.error', 'Something went wrong')),
    h('p', { class: 'g-error__msg' }, message || tf('ui.error.default', 'The request failed.')),
    requestId ? h('p', { class: 'g-error__id' }, tf('state.requestId', 'Request id: {id}', { id: requestId })) : null,
    onRetry ? button({ label: retryLabel || tf('state.retry', 'Retry'), variant: 'secondary', onClick: onRetry }) : null);
}
