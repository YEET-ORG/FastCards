import { AiChatDrawer } from '@/constants/ai-ui';

/**
 * Pure, worklet-safe drawer decision math (AI_CHAT_UI_UX_SPEC §7.4–§7.5).
 * Unit-testable on the JS thread; the `"worklet"` directive keeps every
 * function serializable for the UI runtime.
 */

interface DrawerGestureConfig {
  directionDistanceThreshold: number;
  velocityThreshold: number;
  velocityInfluence: number;
  positionThreshold: number;
  maxSettleVelocity?: number;
}

function hasDirectionalIntent(
  translationX: number,
  velocityX: number,
  gesture: DrawerGestureConfig,
) {
  'worklet';
  return (
    Math.abs(translationX) > gesture.directionDistanceThreshold || // > 12
    Math.abs(velocityX) > gesture.velocityThreshold // > 160
  );
}

export function projectDragDirection(
  translationX: number,
  velocityX: number,
  gesture: DrawerGestureConfig,
) {
  'worklet';
  return translationX + velocityX * gesture.velocityInfluence; // + v * 0.05
}

export interface DrawerEndState {
  currentPosition: number;
  menuWidth: number;
  translationX: number;
  velocityX: number;
}

export function shouldOpenDrawer(
  { currentPosition, menuWidth, translationX, velocityX }: DrawerEndState,
  gesture?: DrawerGestureConfig,
) {
  'worklet';
  const config = gesture ?? AiChatDrawer.gesture;
  if (hasDirectionalIntent(translationX, velocityX, config)) {
    return projectDragDirection(translationX, velocityX, config) > 0;
  }
  return currentPosition > menuWidth * config.positionThreshold; // > 0.18 W
}

export function shouldCloseDrawer(
  { currentPosition, menuWidth, translationX, velocityX }: DrawerEndState,
  gesture?: DrawerGestureConfig,
) {
  'worklet';
  const config = gesture ?? AiChatDrawer.gesture;
  if (hasDirectionalIntent(translationX, velocityX, config)) {
    return projectDragDirection(translationX, velocityX, config) < 0;
  }
  return currentPosition < menuWidth * (1 - config.positionThreshold); // < 0.82 W
}

/**
 * Clamp a surface position, and act as the choke point that keeps a non-finite
 * position — or a non-finite panel width — off a native prop. Math.min and
 * Math.max PROPAGATE NaN, so the naive form happily returns NaN.
 *
 * NaN carries no direction, so it resolves to the minimum (closed). Infinities
 * do carry one and clamp to the near bound. Either way the result is finite, so
 * the surface self-heals.
 */
export function clampDrawerPosition(value: number, minimum: number, maximum: number) {
  'worklet';
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
export function sanitizeDrawerPosition(value: number) {
  'worklet';
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
 * The cap is resolved in the BODY, never as a parameter default: a worklet may
 * not reference a closure variable from a parameter default (the default
 * evaluates in its own scope, whose parent is the enclosing scope rather than
 * the body — on the UI runtime nothing encloses it). The same applies to the
 * `gesture` destructuring defaults above, which is why both use `gesture ?? …`
 * in the body.
 */
export function sanitizeGestureVelocity(velocityX: number, maximum?: number) {
  'worklet';
  const cap = maximum ?? AiChatDrawer.gesture.maxSettleVelocity; // 8000
  if (!Number.isFinite(velocityX)) return 0;
  if (velocityX > cap) return cap;
  if (velocityX < -cap) return -cap;
  return velocityX;
}