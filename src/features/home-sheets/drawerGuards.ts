/**
 * Three NaN guards, ported verbatim from the chat drawer's
 * `conversationDrawerLogic.ts` (AI_CHAT_UI_UX_SPEC.md §7.5). All three
 * document real crashes; do not "simplify" them.
 */

/**
 * Clamp a surface position, and act as the choke point that keeps a non-finite
 * position — or a non-finite panel width — off a native prop. Math.min and
 * Math.max PROPAGATE NaN, so the naive form happily returns NaN.
 *
 * NaN carries no direction, so it resolves to the minimum (closed). Infinities
 * do carry one and clamp to the near bound. Either way the result is finite, so
 * the surface self-heals.
 */
export function clampDrawerPosition(value: number, minimum: number, maximum: number): number {
  "worklet";
  const low = Number.isFinite(minimum) ? minimum : 0;
  const high = Number.isFinite(maximum) && maximum > low ? maximum : low;
  if (Number.isNaN(value)) return low;
  return Math.min(high, Math.max(low, value));
}

/**
 * Last line of defence before a native transform. React Native passes NaN
 * straight through to a CGFloat/float in the shadow tree, where both platforms
 * abort without a JS error — which is why this failure mode has no redbox.
 */
export function sanitizeDrawerPosition(value: number): number {
  "worklet";
  return Number.isFinite(value) ? value : 0;
}

/**
 * Reanimated does NOT validate `config.velocity`: `checkIfConfigIsValid` does
 * not list it, `config.velocity || 0` catches NaN (falsy) but NOT ±Infinity
 * (truthy), and `getEnergy` squares the raw value regardless. A non-finite
 * velocity makes `initialEnergy` Infinity, so `currentEnergy / initialEnergy`
 * is NaN, the termination test never fires, and every later frame writes NaN
 * to the shared value — which reaches a native transform and hard-crashes both
 * platforms silently.
 *
 * Velocities also ADD when a spring interrupts an in-flight spring, so repeated
 * interrupted flicks accumulate; the clamp bounds that too.
 *
 * The cap is resolved in the BODY, never as a parameter default. A worklet may
 * not reference a closure variable from a parameter default — the worklets
 * Babel plugin rebuilds the function with its params verbatim and then declares
 * the closure inside the body, too late on the UI runtime.
 */
export function sanitizeGestureVelocity(velocityX: number, maximum: number): number {
  "worklet";
  const cap = Number.isFinite(maximum) && maximum > 0 ? maximum : 8000;
  if (!Number.isFinite(velocityX)) return 0;
  if (velocityX > cap) return cap;
  if (velocityX < -cap) return -cap;
  return velocityX;
}