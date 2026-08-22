/**
 * The sheet's entire motion model, ported verbatim from GhostWallet's
 * `tokenSheetMotion.ts` (TOKEN_DETAIL_SHEET_UI_UX_SPEC.md §5–§9, §12).
 *
 * Pure worklet-safe functions plus the three springs and every threshold
 * constant the sheet depends on. Do not retune any value in here — each one
 * pins a measured feel or fixes a shipped bug; the spec marks every one
 * 🔒 MUST STAY IDENTICAL.
 */
import type { WithSpringConfig } from "react-native-reanimated";

/**
 * `AiSheet.spring` — the open, and only the open.
 * (ζ ≈ 1.00, critically damped, settles ~233.3 ms.)
 */
export const TRANSITION_SPRING: WithSpringConfig = {
  damping: 30,
  mass: 0.7,
  stiffness: 320,
  overshootClamping: true,
};

/**
 * Every way the sheet LEAVES: drag-dismiss, backdrop tap, Android back.
 * Faster than the open — a closing sheet's tail happens off the bottom edge
 * where nobody watches it land. (ζ ≈ 1.003, settles ~194.4 ms.)
 */
export const DISMISS_SPRING: WithSpringConfig = {
  damping: 36,
  mass: 0.7,
  stiffness: 460,
  overshootClamping: true,
};

/**
 * `AiChatDrawer.spring` — motions that END ON SCREEN: the floating-card lift
 * and a drag that springs back to flush. On screen stays soft, leaving the
 * screen goes fast. (ζ ≈ 0.98, settles ~307.7 ms.)
 */
export const DRAG_SPRING: WithSpringConfig = {
  damping: 26,
  mass: 0.8,
  stiffness: 220,
  overshootClamping: true,
};

/**
 * Not 0 — a zero-duration withTiming completion is not safe to hang unmount on.
 */
export const REDUCED_MS = 1;

/** The sheet is full-bleed, so a touch at `pageY` starts the card's top edge exactly there. */
export const SHEET_TOP = 0;

/**
 * Shortest opening travel, in px.
 *
 * A tap near the top of the list would otherwise produce a near-zero start
 * offset, and a spring across ~10px reads as the sheet snapping into place with
 * no animation at all. Below this the motion stops being legible, so origin
 * anchoring gives way to a fixed minimum rise.
 */
export const MIN_ORIGIN_TRAVEL = 160;

/**
 * How long to wait for an opening transition before assuming it has arrived.
 *
 * The sheet defers its secondary work until the opening spring reports
 * completion, so none of it competes with the animation. But a finger that
 * catches the sheet on the way up REPLACES that spring, and a replaced
 * animation reports `finished: false`: the completion signal alone would
 * strand an interrupted open with no content, permanently.
 *
 * So this is the floor under it, not the schedule. Comfortably longer than
 * `TRANSITION_SPRING` takes to settle (~233ms) so an uninterrupted open is
 * always driven by the real signal and never by this, and short enough that
 * the interrupted case is a beat rather than a wait.
 */
export const OPEN_SETTLE_FALLBACK_MS = 400;

/**
 * How far the card shrinks once floating. The side margins are a consequence
 * of this, not a separate inset: on a 390pt-wide screen it leaves ~15.6pt of
 * wallet down each side. A uniform scale is also what keeps every child —
 * including the absolutely-positioned action bar — inside the card and moving
 * with it, with no relayout.
 *
 * Measured off the reference, not guessed: side margins are 4.07% of the
 * screen width and the top margin 4.13% of its height, and
 * `margin = W(1-S)/2` solves both at S = 0.919. The same S predicts the
 * reference's bottom edge to within half a pixel.
 */
export const FLOAT_SCALE = 0.92;

/** Fraction of the travel past which a released drag dismisses the sheet. */
export const DISMISS_DRAG_FRACTION = 0.25;

/** Downward flick that dismisses regardless of distance (px/s). */
export const DISMISS_VELOCITY = 500;

/**
 * A hard fling reports thousands of px/s, which on a 0..1 track is a spring
 * that arrives in a frame — the shrink would read as the sheet vanishing
 * rather than travelling back to the row. Eight full morphs a second is still
 * faster than anything the spring produces on its own.
 */
export const MAX_MORPH_VELOCITY = 8;

/** Where the sheet's CONTENT has finished fading in, as a fraction of the morph. */
export const MORPH_CONTENT_FADE_END = 0.4;

/** Where the PANEL itself has finished fading in. Much shorter — this is not a fade anybody sees. */
export const MORPH_PANEL_FADE_END = 0.12;

/**
 * Drag distance, in px, over which the sheet's square edges round out.
 *
 * The sheet rests FLUSH — edge to edge, top corners square under the status
 * bar — and only becomes a rounded card once it moves. Kept very short so the
 * corners are already round by the time the eye has registered any motion.
 */
export const SHEET_CORNER_SNAP_DISTANCE = 12;

/** The handle strip's height. */
export const HANDLE_ROW_HEIGHT = 28;

/** Downward, vertical-dominant pull from a list at offset 0 that takes the sheet. */
export const CONTENT_PULL_ACTIVATE_PX = 12;
/** Upward movement that hands the touch back to the list. */
export const CONTENT_PULL_FAIL_PX = 6;

export type MorphOrigin = Readonly<{ x: number; y: number; width: number; height: number }>;

export interface MorphBoxArgs {
  progress: number;
  origin: MorphOrigin | null;
  fullWidth: number;
  fullHeight: number;
}

export interface SheetOpenOffsetArgs {
  originY: number | undefined;
  sheetTop: number;
  travel: number;
}

export interface SheetDismissDecision {
  committedClosed: boolean;
  success: boolean;
  velocityY: number;
  translateY: number;
  travel: number;
  velocityThreshold: number;
  dragFraction: number;
}

export type ContentPullVerdict = "activate" | "fail" | "undecided";

/**
 * The tapped row's rect, or `null` for "there isn't one — take the slide".
 *
 * `null` is the whole fallback switch: without a usable rect the sheet opens
 * exactly the way it did before the morph landed, on `resolveSheetOpenOffset`.
 * So every rejection here is a downgrade to the old animation, never a broken
 * one, and that is why the bar is low rather than clever.
 *
 * A zero or negative size is the case worth spelling out: `measureInWindow`
 * reports 0×0 for a view that has been detached — a list row recycled out from
 * under the touch — and a zero-size origin would morph the sheet out of a
 * point rather than out of the row.
 *
 * Runs on the JS thread (it is the one function in this module that is *not*
 * a worklet).
 */
export function parseMorphOrigin(rect: MorphOrigin | undefined): MorphOrigin | null {
  if (rect === undefined) return null;
  if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y)) return null;
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/**
 * The panel's box for a given morph progress.
 *
 * Linear, and deliberately so: the spring already owns the shape of the motion,
 * and easing a spring's output is how a settle picks up a second personality it
 * was never tuned for.
 *
 * Both ends are EXACT rather than nearly-exact — `t = 0` returns the origin's
 * own numbers and `t = 1` the full box's — because those two frames are the
 * ones a user can compare against something: the row underneath at one end,
 * the resting sheet at the other. A half-pixel of drift at `t = 1` would leave
 * the settled sheet permanently off the screen edge.
 *
 * Every fallback is the FULL box, which is the resting geometry: a broken
 * input makes the sheet skip the morph, not vanish.
 */
export function resolveMorphBox({ progress, origin, fullWidth, fullHeight }: MorphBoxArgs): MorphOrigin {
  "worklet";
  // Sanitized rather than propagated: these reach `width`/`height` on a native
  // view, where NaN aborts in the shadow tree with no JS error.
  const width = Number.isFinite(fullWidth) && fullWidth > 0 ? fullWidth : 0;
  const height = Number.isFinite(fullHeight) && fullHeight > 0 ? fullHeight : 0;
  const full: MorphOrigin = { x: 0, y: 0, width, height };

  if (origin === null) return full;
  if (!Number.isFinite(progress)) return full;
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return full;
  if (!Number.isFinite(origin.width) || !Number.isFinite(origin.height)) return full;

  const t = progress <= 0 ? 0 : progress >= 1 ? 1 : progress;
  if (t >= 1) return full;

  return {
    x: origin.x + (full.x - origin.x) * t,
    y: origin.y + (full.y - origin.y) * t,
    width: origin.width + (full.width - origin.width) * t,
    height: origin.height + (full.height - origin.height) * t,
  };
}

/**
 * Where the sheet's CONTENT has finished fading in, as a fraction of the morph.
 *
 * The content layer is full-size the whole way and simply clipped by the box,
 * so at low progress what shows is the sheet's top-left corner — a handle and a
 * sliver of header — cropped to the size of a row. That fragment is what reads
 * as a bug. Fading it in over the first stretch means the box is a plain card
 * while it is small enough for the crop to be legible.
 */
export function resolveMorphOpacity(progress: number, fadeEnd: number): number {
  "worklet";
  if (!Number.isFinite(progress)) return 1;
  if (!Number.isFinite(fadeEnd) || fadeEnd <= 0) return 1;
  if (progress <= 0) return 0;
  if (progress >= fadeEnd) return 1;
  return progress / fadeEnd;
}

/**
 * A dismissing drag hands its velocity to whatever finishes the motion, so a
 * flick reads as a flick — but the gesture reports px/s down the screen and
 * the morph runs on a unit progress, so it cannot be passed through. Dividing
 * by the travel turns px/s into progress/s, and the NEGATION is the direction:
 * a downward flick is positive px/s and drives the morph DOWN toward the row.
 */
export function morphVelocityFromDrag(velocityY: number, travel: number): number {
  "worklet";
  if (!Number.isFinite(velocityY)) return 0;
  if (!Number.isFinite(travel) || travel <= 0) return 0;
  const perSecond = -velocityY / travel;
  // Normalised, because negating zero gives -0: harmless in the spring's own
  // arithmetic, but it makes an `Object.is` comparison anywhere downstream
  // read a motionless release as a moving one.
  if (perSecond === 0) return 0;
  if (perSecond > MAX_MORPH_VELOCITY) return MAX_MORPH_VELOCITY;
  if (perSecond < -MAX_MORPH_VELOCITY) return -MAX_MORPH_VELOCITY;
  return perSecond;
}

/**
 * Shortest opening travel, in px — see `MIN_ORIGIN_TRAVEL`.
 *
 * `travel` is the ceiling: a touch below the card's resting bottom edge must
 * not start the card further out than fully off-screen.
 */
export function resolveSheetOpenOffset({ originY, sheetTop, travel }: SheetOpenOffsetArgs): number {
  "worklet";
  if (!Number.isFinite(travel) || travel <= 0) return 0;
  if (originY === undefined) return travel;
  if (!Number.isFinite(originY) || !Number.isFinite(sheetTop)) return travel;

  const raw = originY - sheetTop;
  if (raw >= travel) return travel;
  if (raw <= MIN_ORIGIN_TRAVEL) return Math.min(MIN_ORIGIN_TRAVEL, travel);
  return raw;
}

/**
 * Drag distance, in px, over which the sheet's square edges round out — see
 * `SHEET_CORNER_SNAP_DISTANCE`.
 */
export function resolveSheetCornerRadius(translateY: number, snapDistance: number, maxRadius: number): number {
  "worklet";
  if (!Number.isFinite(maxRadius) || maxRadius <= 0) return 0;
  if (!Number.isFinite(translateY)) return 0;
  if (!Number.isFinite(snapDistance) || snapDistance <= 0) {
    return translateY > 0 ? maxRadius : 0; // degrades to a hard switch, never NaN
  }
  if (translateY <= 0) return 0;
  if (translateY >= snapDistance) return maxRadius;
  return (translateY / snapDistance) * maxRadius;
}

/**
 * The single source of truth for both the detent haptic and the release
 * decision, so the tick under the finger fires at exactly the point where
 * releasing commits. Disarmed is the safe fallback: a spurious tick is noise,
 * but a spurious dismissal throws the screen away under the user's finger.
 */
export function isDismissArmed(translateY: number, travel: number, dragFraction: number): boolean {
  "worklet";
  if (!Number.isFinite(translateY) || translateY <= 0) return false;
  if (!Number.isFinite(travel) || travel <= 0) return false;
  if (!Number.isFinite(dragFraction) || dragFraction <= 0) return false;
  return translateY > travel * dragFraction;
}

/**
 * The release decision. The order is exact:
 *
 * 1. `committedClosed` wins unconditionally — a close committed elsewhere
 *    while the finger was still down (Android back, a backdrop tap, a re-grab
 *    during the closing settle).
 * 2. `!success` — RNGH calls `onEnd` with `success = false` when an *active*
 *    pan is cancelled (a system edge swipe, the app backgrounding). The user
 *    completed no intent, so that alone must not dismiss.
 * 3. Velocity — strictly `> velocityThreshold` px/s downward. A non-finite
 *    velocity cannot force a dismissal; the `Number.isFinite` guard makes it
 *    fall through to the distance test.
 * 4. Distance — strictly `translateY > travel × dragFraction`.
 */
export function shouldDismissSheet({
  committedClosed,
  success,
  velocityY,
  translateY,
  travel,
  velocityThreshold,
  dragFraction,
}: SheetDismissDecision): boolean {
  "worklet";
  if (committedClosed) return true;
  if (!success) return false;
  if (Number.isFinite(velocityY) && velocityY > velocityThreshold) return true;
  return isDismissArmed(translateY, travel, dragFraction);
}

/**
 * Three ways to lose the touch, all of which must hand it straight back to the
 * list rather than sit on it:
 *   * the list is not at its top, so this is an ordinary scroll;
 *   * the finger went up, so this is an ordinary scroll;
 *   * the movement is horizontal-dominant, so this is a horizontal scrub.
 *
 * Only a downward, vertical-dominant pull from a list already at offset 0
 * takes the sheet.
 */
export function resolveContentPull(
  scrollOffset: number,
  translationX: number,
  translationY: number,
  activateAt: number,
  failAt: number,
): ContentPullVerdict {
  "worklet";
  if (!Number.isFinite(scrollOffset) || scrollOffset > 0) return "fail";
  if (!Number.isFinite(translationX) || !Number.isFinite(translationY)) return "fail";
  if (translationY <= -failAt) return "fail";
  if (translationY < activateAt) return "undecided";
  // Ties go to the sheet: a perfectly diagonal pull from the top of the list
  // is far more likely a dismissal than a scrub.
  return translationY >= Math.abs(translationX) ? "activate" : "fail";
}