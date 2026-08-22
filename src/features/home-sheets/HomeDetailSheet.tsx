import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type RefObject } from 'react';
import { BackHandler, Dimensions, Platform, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useAskDockOptional } from '@/components/ask/AskDockContext';
import { useReduceMotion } from '@/design/motion';
import { useColors } from '@/design/theme';

import {
  DepositSheetContent,
  PaymentsSheetContent,
  TransactionDetailSheetContent,
  TransferSheetContent,
} from './content';
import { clampDrawerPosition, sanitizeDrawerPosition, sanitizeGestureVelocity } from './drawerGuards';
import { select, tap } from './haptics';
import { SheetBackdrop } from './SheetBackdrop';
import {
  CONTENT_PULL_ACTIVATE_PX,
  CONTENT_PULL_FAIL_PX,
  DISMISS_DRAG_FRACTION,
  DISMISS_SPRING,
  DISMISS_VELOCITY,
  DRAG_SPRING,
  FLOAT_SCALE,
  HANDLE_ROW_HEIGHT,
  isDismissArmed,
  MORPH_CONTENT_FADE_END,
  MORPH_PANEL_FADE_END,
  morphVelocityFromDrag,
  OPEN_SETTLE_FALLBACK_MS,
  parseMorphOrigin,
  REDUCED_MS,
  resolveContentPull,
  resolveMorphBox,
  resolveMorphOpacity,
  resolveSheetCornerRadius,
  resolveSheetOpenOffset,
  SHEET_CORNER_SNAP_DISTANCE,
  SHEET_TOP,
  shouldDismissSheet,
  TRANSITION_SPRING,
  type MorphOrigin,
} from './sheetMotion';

/**
 * In-tree, full-bleed detail sheet, ported verbatim from GhostWallet's
 * `TokenDetailSheet` (TOKEN_DETAIL_SHEET_UI_UX_SPEC.md).
 *
 * It is NOT a bottom sheet and NOT a Modal:
 *   * a Modal renders into its own native window, so a `router.push` from
 *     inside it pushes the new screen BEHIND the modal — the buttons inside
 *     the transaction detail sheet would look dead;
 *   * being a sibling of the shell (not a child) means the shell's own Pan
 *     gesture cannot fire from touches on the sheet, and the root
 *     GestureHandlerRootView in app/_layout.tsx reaches the pans below, so no
 *     local one is needed.
 *
 * At rest the sheet covers the ENTIRE window: top edge at y=0, square against
 * all four edges, flush to the bottom. The floating-card look — margins on all
 * four sides, rounded corners, the wallet blurred around it — belongs to the
 * downward drag alone. Opening is a MORPH: the panel starts as the tapped
 * row's own measured rect and grows into the full-bleed sheet; dismissing
 * shrinks it back into the same rect.
 */

const { width, height } = Dimensions.get('window');

/** `AiSheet.borderRadius` — the resting card's corner radius. */
const SHEET_RADIUS = 24;
/** `AiChatDrawer.gesture.maxSettleVelocity` — the release-velocity cap. */
const MAX_SETTLE_VELOCITY = 8000;

/** The sheet owns both safe-area insets as padding, never as gaps. */
function getSafeBottomInset(bottom: number): number {
  return Math.max(bottom, 8);
}

export type HomeSheetVariant = 'deposit' | 'transfer' | 'payments' | 'transaction';

export type HomeSheetTarget = {
  readonly variant: HomeSheetVariant;
  /** The transaction id, for the `transaction` variant. */
  readonly txnId?: string;
  /** Window Y of the tap. The fallback when the row could not be measured. */
  readonly originY?: number;
  /** The tapped row's own frame, so the sheet expands out of it and back into it. */
  readonly originRect?: MorphOrigin;
};

export function HomeDetailSheet({
  target,
  visible,
  onDismiss,
}: {
  /**
   * The descriptor of what is on screen. Deliberately NEVER cleared on
   * dismiss: the sheet stays mounted through its closing animation, and
   * nulling it here would flip the content for the whole close. Holding the
   * last target is free — it is a plain descriptor, and the next open
   * overwrites it.
   */
  target: HomeSheetTarget | null;
  visible: boolean;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const dock = useAskDockOptional();
  const reduceMotion = useReduceMotion();

  const [rootSize, setRootSize] = useState<{ width: number; height: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [openSettled, setOpenSettled] = useState(false);

  // The tree exists on the same render `visible` flips — not a render later,
  // after a passive effect. `mounted` only holds the tree up through the
  // closing animation after `visible` has already gone false.
  const rendered = visible || mounted;

  const reduceMotionSV = useSharedValue(reduceMotion);
  const visibleSV = useSharedValue(false);
  const mountedSV = useSharedValue(false);

  // Measured on the ROOT, not on the panel: the panel's width and height are
  // animated, so measuring there would feed the morph straight back into
  // `travel` and re-render this component on every frame of it. The root is
  // absolute inset-0 and never animates.
  //
  // The fallback deliberately over-estimates: starting further off-screen is
  // invisible, whereas under-estimating leaves the sheet resting with a sliver
  // on screen. That is the failure mode of trusting `height` alone on Android
  // edge-to-edge, where the window height may exclude system bars.
  const fullWidth = rootSize && rootSize.width > 0 ? rootSize.width : width;
  const fullHeight =
    rootSize && rootSize.height > 0 ? rootSize.height : height + insets.top + insets.bottom;
  const travel = fullHeight;

  // Three independent shared values, none derived from another.
  const translateY = useSharedValue(travel);
  const morphProgress = useSharedValue(1);
  const liftProgress = useSharedValue(0);

  // The morph origin, LATCHED from the prop — not read per frame — so the
  // close reverses into the SAME rect the open came out of even if the row
  // underneath has since been recycled to another row.
  const morphOriginSV = useSharedValue<MorphOrigin | null>(null);
  const originSV = useSharedValue(0);
  const travelSV = useSharedValue(travel);
  const fadeSpanSV = useSharedValue(travel);

  const gestureStartY = useSharedValue(0);
  const gestureAnchor = useSharedValue(0);
  const dismissArmed = useSharedValue(false);
  const contentScrollY = useSharedValue(0);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const gestureOwnsTransition = useSharedValue(false);
  const gestureActive = useSharedValue(false);

  // RNGH resolves this at runtime as `ref.current?.handlerTag`, and
  // `createNativeWrapper` — which builds RNGH's ScrollView — assigns that tag
  // onto the forwarded instance for exactly this purpose. Its `GestureRef`
  // type says `RefObject<ComponentType>` instead, which no component ref can
  // ever satisfy: a ref holds an instance, not a component type. The cast buys
  // back the supported usage, not an unsupported one.
  const scrollRef = useRef<ComponentType | null>(null);

  useEffect(() => {
    reduceMotionSV.set(reduceMotion);
  }, [reduceMotion, reduceMotionSV]);

  // Measuring corrects travel once; as a JS dependency it would re-run the
  // effect and restart the opening spring from a standstill, so travel lives
  // in a shared value and is only ever corrected while the sheet is at rest.
  useEffect(() => {
    if (fullHeight > 0 && fullHeight !== travelSV.get()) travelSV.set(fullHeight);
  }, [fullHeight, travelSV]);

  // The sheet steals the surface from the Ask dock while it is up, exactly
  // like ConfirmSheet.
  useEffect(() => {
    dock?.setVaultOpen(rendered);
    return () => dock?.setVaultOpen(false);
  }, [rendered, dock]);

  const handleClosed = useCallback(() => {
    setMounted(false);
    setOpenSettled(false);
  }, []);

  // Fired here rather than alongside the spring: this effect runs once per
  // visible→true transition, whereas the reaction can fire again on a
  // re-mount and would tick a second time.
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Known and accepted (TOKEN_DETAIL_SHEET_UI_UX_SPEC.md §13.3): the extra render lands while the sheet is opening and changes nothing on screen, and both alternatives are worse — adjusting during render trades it for `no-adjust-state-on-prop-change`, and latching on `visible → false` leaves `rendered` false for a frame and unmounts the sheet mid-close.
    setMounted(true);
    tap();
  }, [visible]);

  // The gate values are published in a LAYOUT effect, in one batch:
  //   1. Layout, not passive — a passive effect is scheduled after the commit
  //      has been handed off, and under a commit as large as this sheet React
  //      is free to yield in between — so the panel could be on screen, at
  //      rest, off the bottom edge, for a frame or two before anything moved.
  //   2. Both written in one effect — so the reaction observes a single batch
  //      and can never see a half-open state.
  //   3. The origin race — the morph origin is published HERE alongside them:
  //      layout effects run before passive ones, so a rect mirrored passively
  //      would land after this effect had already flipped the gate — and the
  //      open branch reads the rect at the moment it fires.
  useLayoutEffect(() => {
    morphOriginSV.set(parseMorphOrigin(target?.originRect));
    originSV.set(target?.originY ?? 0);
    visibleSV.set(visible);
    mountedSV.set(rendered);
  }, [morphOriginSV, mountedSV, originSV, rendered, target, visible, visibleSV]);

  // Belt and braces under the opening spring's completion signal: a finger
  // that catches the sheet on the way up REPLACES that spring, and a replaced
  // animation reports `finished: false` — the completion signal alone would
  // strand an interrupted open with no content, permanently.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setOpenSettled(true), OPEN_SETTLE_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  // Armed while `rendered` (so it stays armed through the close) and always
  // consumes the event. Funnels through the same close branch as the backdrop
  // tap — `onDismiss` flips `visible` and the reaction owns the spring.
  useEffect(() => {
    if (!rendered) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => sub.remove();
  }, [rendered, onDismiss]);

  // The open/close driver lives HERE, in a `useAnimatedReaction` — it MUST NOT
  // go back to a `useEffect`. A dismissing drag starts its settle on the UI
  // thread and then flips `visible` through `onDismiss` — a dependency change,
  // so React runs the PREVIOUS effect's cleanup first. A
  // `cancelAnimation(translateY)` in that cleanup killed the closing spring
  // mid-flight, and the hand-off branch then declined to start a replacement,
  // leaving the sheet frozen mid-screen with `visible` already false and
  // nothing left that could re-run the effect: no unmount, no way back, a
  // permanently stranded panel over an unreachable screen. `useAnimatedReaction`
  // has no cleanup contract at all, so the hand-off cannot be cancelled out
  // from under the gesture.
  //
  // Both completion callbacks are written inline rather than hoisted to one
  // shared const: `useAnimatedReaction` derives its effect dependencies from
  // the closures of these two worklets, so a per-render function among them
  // would stop and restart the mapper on every render of this sheet.
  // Everything captured here is stable — shared values, module constants, and
  // `setMounted` — so the mapper registers once.
  useAnimatedReaction(
    () => mountedSV.get() && visibleSV.get(),
    (open, previous) => {
      // A mount with the sheet closed has nothing to animate — that, and only
      // that, is what the first run is skipped for. Spelled out rather than
      // `previous === null` alone because the gate values are published in a
      // LAYOUT effect, which lands before reanimated registers this mapper (it
      // does so in a passive effect of its own): a sheet mounted already open
      // would otherwise swallow its own opening spring here and sit off screen
      // with no way back.
      if (previous === null && !open) return;
      if (open === previous) return;

      if (open) {
        gestureOwnsTransition.set(false);
        // ...including the floating-card lift a previous drag was mid-way through.
        liftProgress.set(0);
        dismissArmed.set(false);

        if (morphOriginSV.get() !== null) {
          // The morph carries the whole opening motion, vertical included, so
          // the offset stays at rest and the two drivers never double up.
          translateY.set(0);
          fadeSpanSV.set(travelSV.get());
          // Set to 0 BEFORE animating to 1. Animating to a value already held
          // is a no-op, and the morph would silently never render.
          morphProgress.set(0);
          morphProgress.set(
            reduceMotionSV.get()
              ? withTiming(1, { duration: REDUCED_MS }, (f) => {
                  'worklet';
                  if (f) scheduleOnRN(setOpenSettled, true);
                })
              : withSpring(1, TRANSITION_SPRING, (f) => {
                  'worklet';
                  if (f) scheduleOnRN(setOpenSettled, true);
                }),
          );
          return;
        }

        // No rect: the older rise from the touch point. The morph must be
        // parked at the full sheet or the panel would open at zero size.
        morphProgress.set(1);

        // Written before the spring so the first painted frame is already at
        // the origin — the frame before this runs still has the sheet
        // off-screen, so nothing flashes.
        const startOffset = resolveSheetOpenOffset({
          originY: originSV.get(),
          sheetTop: SHEET_TOP,
          travel: travelSV.get(),
        });
        translateY.set(startOffset);
        fadeSpanSV.set(startOffset);
        translateY.set(
          reduceMotionSV.get()
            ? withTiming(0, { duration: REDUCED_MS }, (f) => {
                'worklet';
                if (f) scheduleOnRN(setOpenSettled, true);
              })
            : withSpring(0, TRANSITION_SPRING, (f) => {
                'worklet';
                if (f) scheduleOnRN(setOpenSettled, true);
              }),
        );
        return;
      }

      // A dismissing drag already launched the closing settle with the flick's
      // own velocity, and owns the unmount callback. Starting another spring
      // here would restart that motion from a standstill.
      if (gestureOwnsTransition.get()) {
        gestureOwnsTransition.set(false);
        return;
      }

      // A finger is still driving the sheet — an Android back or a close
      // committed from elsewhere mid-drag. Springing now would give
      // `translateY` two owners for the rest of the gesture. Stand down:
      // `onEnd` runs for every gesture that activated, and `committedClosed`
      // makes every branch settle to the side React now holds.
      if (gestureActive.get()) return;

      if (morphOriginSV.get() !== null) {
        morphProgress.set(
          reduceMotionSV.get()
            ? withTiming(0, { duration: REDUCED_MS }, (f) => {
                'worklet';
                if (f) scheduleOnRN(handleClosed);
              })
            : withSpring(0, DISMISS_SPRING, (f) => {
                'worklet';
                if (f) scheduleOnRN(handleClosed);
              }),
        );
        // Usually a no-op, and there for the one case where it is not: a close
        // committed while a released drag was still springing back leaves an
        // offset in flight on DRAG_SPRING, and the two would otherwise settle
        // on different schedules with the panel landing beside the row rather
        // than on it.
        translateY.set(withSpring(0, DISMISS_SPRING));
        return;
      }

      const target = travelSV.get();
      fadeSpanSV.set(target);
      // DISMISS_SPRING, not the open's: this is the backdrop tap and Android
      // back, and with no flick velocity behind them they were the
      // slowest-feeling close of the three despite carrying the lower settle
      // number.
      translateY.set(
        reduceMotionSV.get()
          ? withTiming(target, { duration: REDUCED_MS }, (f) => {
              'worklet';
              if (f) scheduleOnRN(handleClosed);
            })
          : withSpring(target, DISMISS_SPRING, (f) => {
              'worklet';
              if (f) scheduleOnRN(handleClosed);
            }),
      );
    },
  );

  // `cancelAnimation` lives in an UNMOUNT-ONLY effect. Any other placement
  // reintroduces the stranded-panel failure mode (§11 of the spec).
  useEffect(
    () => () => {
      cancelAnimation(translateY);
      cancelAnimation(liftProgress);
      cancelAnimation(morphProgress);
    },
    [liftProgress, morphProgress, translateY],
  );

  // ── The drag lifecycle ─────────────────────────────────────────────────────
  // The handle strip and the content pull share these three bodies verbatim,
  // so the two entry points cannot drift into two different dismissal feels.
  const beginDrag = (anchorTranslation: number) => {
    'worklet';
    gestureStartY.set(translateY.get());
    gestureAnchor.set(anchorTranslation);
    // The finger owns the sheet now, so it owns a FULL sheet. This is the ONLY
    // write to `morphProgress` outside the reaction, and it can only ever take
    // it back to 1 — never away from it.
    //
    // It matters for a CLOSING morph the user catches: left alone it would
    // carry the panel down to a row-sized card under the finger and then, on
    // its completion callback, unmount the tree mid-drag. Replacing it here
    // also makes that callback report `finished: false`, which is what stops
    // the unmount.
    if (morphProgress.get() < 1) morphProgress.set(withSpring(1, DRAG_SPRING));
    // Started before the first onUpdate so the very first moved frame is
    // already lifting rather than beginning it a frame later.
    liftProgress.set(withSpring(1, DRAG_SPRING));
    dismissArmed.set(isDismissArmed(translateY.get(), travelSV.get(), DISMISS_DRAG_FRACTION));
    // A drag from rest can carry the sheet the whole way out, so the scrim has
    // to fade over the full travel. Only from rest: at translateY 0 both spans
    // give the same progress, so the switch is invisible.
    if (translateY.get() <= 1) fadeSpanSV.set(travelSV.get());
  };

  const updateDrag = (translation: number) => {
    'worklet';
    const fullTravel = travelSV.get();
    // No upward over-drag: the panel is already at its top detent.
    const next = clampDrawerPosition(
      gestureStartY.get() + (translation - gestureAnchor.get()),
      0,
      fullTravel,
    );
    translateY.set(next);

    // The detent tick, off the same predicate the release uses — so it fires
    // exactly where letting go commits, and only on a crossing.
    const armed = isDismissArmed(next, fullTravel, DISMISS_DRAG_FRACTION);
    if (armed !== dismissArmed.get()) {
      dismissArmed.set(armed);
      scheduleOnRN(select);
    }
  };

  const endDrag = (rawVelocityY: number, success: boolean) => {
    'worklet';
    // The raw event velocity must never reach Reanimated: it does not validate
    // `config.velocity`, and a non-finite one turns every later frame into NaN
    // on a native transform.
    const velocityY = sanitizeGestureVelocity(rawVelocityY, MAX_SETTLE_VELOCITY);
    const fullTravel = travelSV.get();

    const dismissing = shouldDismissSheet({
      committedClosed: !visibleSV.get(),
      success,
      velocityY,
      translateY: translateY.get(),
      travel: fullTravel,
      velocityThreshold: DISMISS_VELOCITY,
      dragFraction: DISMISS_DRAG_FRACTION,
    });

    // ── A: spring back to flush ─────────────────────────────────────────────
    if (!dismissing) {
      dismissArmed.set(false);
      // Both springs start now and run together. Lowering the lift here rather
      // than on arrival is also what stops a LATER programmatic close from
      // inheriting this drag's lift and shrinking on the way out.
      liftProgress.set(withSpring(0, DRAG_SPRING));
      // Back to flush on DRAG_SPRING, with the release velocity. This motion
      // ENDS ON SCREEN and the user watches it land, so it keeps the softer
      // settle.
      translateY.set(withSpring(0, { ...DRAG_SPRING, velocity: velocityY }));
      return;
    }

    // Not conditional on `dismissArmed`: a fast flick dismisses on velocity
    // after a few px of travel, and that release deserves feedback too.
    dismissArmed.set(false);
    scheduleOnRN(tap);
    gestureOwnsTransition.set(true);

    // ── B: dismiss WITH a rect — morph back into the row ────────────────────
    if (morphOriginSV.get() !== null) {
      // All three values settle on one spring so they arrive together. The
      // lift and the offset have to unwind rather than being left where the
      // finger put them: the morph converges on the row's rect, and anything
      // still applied on top of it would land the panel 8% small and a drag's
      // worth of pixels below the row.
      liftProgress.set(withSpring(0, DISMISS_SPRING));
      translateY.set(withSpring(0, DISMISS_SPRING));
      // The morph finishes last, so it owns the unmount. It also carries the
      // release velocity, converted for a 0..1 track.
      morphProgress.set(
        reduceMotionSV.get()
          ? withTiming(0, { duration: REDUCED_MS }, (finished) => {
              'worklet';
              if (finished) scheduleOnRN(handleClosed);
            })
          : withSpring(
              0,
              { ...DISMISS_SPRING, velocity: morphVelocityFromDrag(velocityY, fullTravel) },
              (finished) => {
                'worklet';
                if (finished) scheduleOnRN(handleClosed);
              },
            ),
      );
      scheduleOnRN(onDismiss);
      return;
    }

    // ── C: dismiss with NO rect — throw off the bottom edge ─────────────────
    // The card leaves as a card: `liftProgress` stays where the drag put it,
    // and the reaction's open branch resets it on the way back in.
    translateY.set(
      withSpring(fullTravel, { ...DISMISS_SPRING, velocity: velocityY }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(handleClosed);
      }),
    );
    scheduleOnRN(onDismiss);
  };

  // The handle strip drags unconditionally — it sits outside the ScrollView,
  // so it stays a grab point no matter how far the content has been scrolled.
  const handleGesture = Gesture.Pan()
    .onStart((event) => {
      gestureActive.set(true);
      beginDrag(event.translationY);
    })
    .onUpdate((event) => {
      updateDrag(event.translationY);
    })
    .onEnd((event, success) => {
      endDrag(event.velocityY, success);
    })
    // Runs after onEnd, and also for gestures that never activated or that
    // failed, so ownership can never latch on.
    .onFinalize(() => {
      gestureActive.set(false);
    });

  // Manual activation rather than activeOffset/failOffset so the decision can
  // read the live scroll offset: this pan sits ABOVE the list and blocks it,
  // so it has to hand the touch back within a few pixels on anything that is
  // not a dismissal. `resolveContentPull` is that decision.
  //
  // Manual activation exists to avoid toggling `scrollEnabled`: that is React
  // state, and re-rendering the screen mid-drag would rebuild its content.
  const contentGesture = Gesture.Pan()
    .manualActivation(true)
    // eslint-disable-next-line react-hooks/refs -- Accepted bailout (TOKEN_DETAIL_SHEET_UI_UX_SPEC.md §8.3): reading the ref during render bails the sheet out of React Compiler memoization, which is why the hosted screens are wrapped in `memo()`.
    .blocksExternalGesture(scrollRef as unknown as RefObject<ComponentType | undefined>)
    .onTouchesDown((event) => {
      const touch = event.allTouches[0];
      if (!touch) return;
      touchStartX.set(touch.absoluteX);
      touchStartY.set(touch.absoluteY);
    })
    .onTouchesMove((event, manager) => {
      const touch = event.allTouches[0];
      if (!touch) return;
      const verdict = resolveContentPull(
        contentScrollY.get(),
        touch.absoluteX - touchStartX.get(),
        touch.absoluteY - touchStartY.get(),
        CONTENT_PULL_ACTIVATE_PX,
        CONTENT_PULL_FAIL_PX,
      );
      if (verdict === 'activate') manager.activate();
      else if (verdict === 'fail') manager.fail();
    })
    .onStart((event) => {
      gestureActive.set(true);
      beginDrag(event.translationY);
    })
    .onUpdate((event) => {
      updateDrag(event.translationY);
    })
    .onEnd((event, success) => {
      endDrag(event.velocityY, success);
    })
    .onFinalize(() => {
      gestureActive.set(false);
    });

  const panelAnimatedStyle = useAnimatedStyle(() => {
    const offset = sanitizeDrawerPosition(translateY.get());
    // Clamped rather than trusted: both springs carry overshootClamping, but
    // this is the last guard before a native transform.
    const lift = clampDrawerPosition(sanitizeDrawerPosition(liftProgress.get()), 0, 1);
    const morph = morphProgress.get();
    const box = resolveMorphBox({
      progress: morph,
      origin: morphOriginSV.get(),
      fullWidth,
      fullHeight,
    });

    return {
      // The only two layout props in this style, and the reason panelContent
      // exists: they resize the clip, not the content.
      width: box.width,
      height: box.height,
      opacity: resolveMorphOpacity(morph, MORPH_PANEL_FADE_END),
      transform: [
        // The morph's own position, plus the drag/dismiss offset on top. Only
        // ever one of the two is animating.
        { translateX: box.x },
        { translateY: box.y + offset },
        // Uniform scale about the panel's CENTRE: this is what opens the
        // margins on all four sides AND carries every child with the sheet.
        // No transformOrigin: the drag's scale has to inset the sheet evenly
        // on every side, which is what the default centre origin does.
        { scale: interpolate(lift, [0, 1], [1, FLOAT_SCALE], Extrapolation.CLAMP) },
      ],
    };
  });

  // The morph folded in as an OFFSET, not a second rule: anything short of
  // the full sheet contributes the whole snap distance, so the radius is at
  // max for every frame of a morph and collapses to exactly the old behaviour
  // at morph === 1. "A row-sized box with square corners is the one frame that
  // reads as a glitch rather than as a card."
  const cornerAnimatedStyle = useAnimatedStyle(() => {
    const morph = clampDrawerPosition(sanitizeDrawerPosition(morphProgress.get()), 0, 1);
    const radius = resolveSheetCornerRadius(
      sanitizeDrawerPosition(translateY.get()) + (1 - morph) * SHEET_CORNER_SNAP_DISTANCE,
      SHEET_CORNER_SNAP_DISTANCE,
      SHEET_RADIUS,
    );
    return { borderRadius: radius };
  });

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: resolveMorphOpacity(morphProgress.get(), MORPH_CONTENT_FADE_END),
  }));

  const backdropProgress = useDerivedValue(() => {
    const fromOffset = interpolate(
      translateY.get(),
      [0, Math.max(fadeSpanSV.get(), 1)],
      [1, 0],
      Extrapolation.CLAMP,
    );
    const morph = clampDrawerPosition(sanitizeDrawerPosition(morphProgress.get()), 0, 1);
    return fromOffset * morph;
  });

  // Rounded and identity-preserving, so a layout pass that reports the same
  // box does not re-render.
  const handleRootLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setRootSize((previous) =>
      previous && previous.width === nextWidth && previous.height === nextHeight
        ? previous
        : { width: nextWidth, height: nextHeight },
    );
  };

  if (!rendered) return null;

  const handleStyle = {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
  };

  return (
    <View style={styles.root} pointerEvents="box-none" onLayout={handleRootLayout}>
      {/* A SIBLING of the panel, never an ancestor — see SheetBackdrop. */}
      <SheetBackdrop progress={backdropProgress} onPress={onDismiss} accessibilityLabel="Close details" />

      {/* The TRANSFORM + SHADOW layer. Its width/height are animated. */}
      <Animated.View
        style={[styles.panel, { backgroundColor: colors.bg }, panelAnimatedStyle, cornerAnimatedStyle]}>
        {/* The CLIPPING layer. Coincident with the panel for free. */}
        <Animated.View style={[styles.panelSurface, { backgroundColor: colors.bg }, cornerAnimatedStyle]}>
          {/* Pinned to the FULL sheet size for the whole morph, so the only
              nodes Yoga re-lays out per frame are the two wrappers above it:
              no re-measure, no reflow, no onLayout storm feeding React a
              render per frame. */}
          <Animated.View
            style={[
              styles.panelContent,
              {
                width: fullWidth,
                height: fullHeight,
                paddingTop: insets.top,
                paddingBottom: getSafeBottomInset(insets.bottom),
              },
              contentAnimatedStyle,
            ]}>
            <GestureDetector gesture={handleGesture}>
              <View style={styles.handleRow}>
                <View style={handleStyle} />
              </View>
            </GestureDetector>

            <GestureDetector gesture={contentGesture}>
              <View style={styles.content}>
                {target === null ? null : target.variant === 'deposit' ? (
                  <DepositSheetContent
                    presentation="sheet"
                    openSettled={openSettled}
                    scrollOffsetOut={contentScrollY}
                    scrollRef={scrollRef}
                  />
                ) : target.variant === 'transfer' ? (
                  <TransferSheetContent
                    presentation="sheet"
                    openSettled={openSettled}
                    scrollOffsetOut={contentScrollY}
                    scrollRef={scrollRef}
                  />
                ) : target.variant === 'payments' ? (
                  <PaymentsSheetContent
                    presentation="sheet"
                    openSettled={openSettled}
                    scrollOffsetOut={contentScrollY}
                    scrollRef={scrollRef}
                  />
                ) : (
                  <TransactionDetailSheetContent
                    presentation="sheet"
                    openSettled={openSettled}
                    scrollOffsetOut={contentScrollY}
                    scrollRef={scrollRef}
                    txnId={target.txnId}
                  />
                )}
              </View>
            </GestureDetector>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// Plain object, not StyleSheet.create — banned by this repo's eslint config.
const styles = {
  root: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    elevation: 30,
  },
  panel: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    overflow: 'visible' as const,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        // Centred and wide: this is the soft halo that makes the floating card
        // read as lifted off the blurred wallet, not as a hole cut in it.
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
      },
      android: { elevation: 16 },
    }),
  },
  panelSurface: { flex: 1, overflow: 'hidden' as const },
  panelContent: { position: 'absolute' as const, top: 0, left: 0 },
  handleRow: {
    height: HANDLE_ROW_HEIGHT,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  content: { flex: 1 },
};