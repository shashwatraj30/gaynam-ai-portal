// Small DOM helpers shared by research / judgment / citation-check (not unit-tested; logic lives in *-logic.js).
import { h } from '../../dom.js';
import { t } from '../../i18n/index.js';
import { chip } from '../../ui/chip.js';
import { precedentChip } from '../../ui/status.js';
import { toast } from '../../ui/toast.js';

/** Translated precedent-status chip. FOLLOWED never reads as good law (P9). */
export function statusChip(status, curated) {
  const c = precedentChip(status, { curated });
  return chip({ label: c.label, tone: c.tone, icon: c.tone === 'danger' ? 'alert' : undefined });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('jr.copied'), { tone: 'primary' });
  } catch {
    toast(t('jr.copyFailed'), { tone: 'warn' });
  }
}

/** Definition list of label/value pairs; empty values are skipped. */
export function metaList(pairs, cls = 'jr-meta') {
  return h('dl', { class: cls }, ...pairs.filter(([, v]) => v != null && v !== '').flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}
