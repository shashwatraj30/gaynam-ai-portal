// Shared draft-status chip for drafts / studio / review (label + tone come from ui/status.js, translated).
import { chip } from '../../ui/chip.js';
import { draftStatusChip } from '../../ui/status.js';

export function statusChip(status) {
  const c = draftStatusChip(status);
  return chip({ label: c.label, tone: c.tone });
}
