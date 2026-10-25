// Pure zoom-step logic for the intake "View full size" dialog (no DOM).
export const ZOOM_STEPS = [100, 150, 200, 300];

/** Clamp to the supported range; non-numbers fall back to 100. */
export function clampZoom(z) {
  const n = Number(z);
  if (!Number.isFinite(n)) return ZOOM_STEPS[0];
  return Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], Math.max(ZOOM_STEPS[0], n));
}

/** action: 'in' | 'out' | 'reset'. Moves to the adjacent step; off-step values snap in the requested direction. */
export function nextZoom(current, action) {
  const z = clampZoom(current);
  if (action === 'reset') return ZOOM_STEPS[0];
  if (action === 'in') return ZOOM_STEPS.find((s) => s > z) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  if (action === 'out') return [...ZOOM_STEPS].reverse().find((s) => s < z) ?? ZOOM_STEPS[0];
  return z;
}

/** Map a KeyboardEvent.key to a zoom action, or null. */
export function keyToAction(key) {
  if (key === '+' || key === '=') return 'in';
  if (key === '-' || key === '_') return 'out';
  if (key === '0') return 'reset';
  return null;
}
