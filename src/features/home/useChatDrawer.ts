import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AiChatDrawer } from '@/constants/ai-ui';
import {
  clampDrawerPosition,
  sanitizeDrawerPosition,
  sanitizeGestureVelocity,
  shouldCloseDrawer,
  shouldOpenDrawer,
} from '@/components/chat/conversationDrawerLogic';

export type ChatDrawerMode = 'chat' | 'wallet';

const SPRING = AiChatDrawer.spring; // { damping: 26, mass: 0.8, stiffness: 220, overshootClamping: true }
const GESTURE = AiChatDrawer.gesture;
const REVEAL = AiChatDrawer.reveal;

const SHELL_SWIPE_DISTANCE = 54;
const SHELL_SWIPE_VELOCITY = 520;

const CORNER_RADIUS = Platform.select({
  android: AiChatDrawer.cornerRadius.android, // 32
  default: AiChatDrawer.cornerRadius.web, // 28
  ios: AiChatDrawer.cornerRadius.ios, // 55
});

export interface ChatDrawerCallbacks {
  /** The drawer is being closed by the gesture (JS side must mirror state). */
  onClose: () => void;
  /** The drawer is being opened by the gesture. */
  onOpenDrawer: () => void;
  /** A mode switch was decided by the gesture's Branch 3. */
  onSwitchMode: (mode: ChatDrawerMode) => void;
  /** The close spring settled — the moment queued drawer actions may run. */
  onSettled: () => void;
}

/**
 * The drawer's entire physics (AI_CHAT_UI_UX_SPEC §7). One Pan drives both
 * axes — drawer drag and chat↔wallet mode switch — branched on drawer state,
 * so they cannot fight because they are literally the same gesture.
 *
 * Callers MUST pass referentially stable callbacks: an unstable one rebuilds
 * the gesture on every shell render — including from inside its own `onEnd`,
 * which drops the native handler while it is still finalising.
 */
export function useChatDrawer({
  mode,
  open,
  menuWidth,
  actionMenuOpen,
  surfaceX: externalSurfaceX,
  onClose,
  onOpenDrawer,
  onSwitchMode,
  onSettled,
}: {
  mode: ChatDrawerMode;
  open: boolean;
  menuWidth: number;
  actionMenuOpen: boolean;
  /** The drawer's shared surface translate. The shell normally borrows the
      dock-owned value so the floating nav bar can ride the same position;
      omitting it creates a private value (standalone use). */
  surfaceX?: SharedValue<number>;
} & ChatDrawerCallbacks) {
  const privateSurfaceX = useSharedValue(0); // only used when no external value
  const surfaceX = externalSurfaceX ?? privateSurfaceX; // the only animated position
  const gestureStartX = useSharedValue(0);
  const gestureTranslationOffsetX = useSharedValue<number | null>(null);
  const modeSV = useSharedValue<ChatDrawerMode>(mode);
  const openSV = useSharedValue(open);
  const menuWidthSV = useSharedValue(menuWidth);
  const gestureOwnsTransition = useSharedValue(false);
  const gestureActive = useSharedValue(false);

  // Mirror React state into shared values.
  useEffect(() => {
    modeSV.set(mode);
  }, [mode, modeSV]);
  useEffect(() => {
    openSV.set(open);
  }, [open, openSV]);
  useEffect(() => {
    menuWidthSV.set(menuWidth);
  }, [menuWidth, menuWidthSV]);

  const swipeGesture = useMemo(() => {
    return (
      Gesture.Pan()
        .enabled(!actionMenuOpen)
        .activeOffsetX([-GESTURE.activationDistance, GESTURE.activationDistance]) // [-24, 24]
        .failOffsetY([-GESTURE.verticalTolerance, GESTURE.verticalTolerance]) // [-20, 20]

        .onBegin(() => {
          // Deliberately no cancelAnimation here: onBegin fires on touch-down,
          // including for taps that never activate the pan, and cancelling
          // there would strand the surface wherever the in-flight spring had
          // reached. onUpdate's assignment overrides a running animation on
          // its own, so a real drag still takes over immediately.
          //
          // The gestureOwnsTransition reset does NOT belong here either: this
          // fires on touch-down, so a tap that never pans would consume a
          // hand-off raised by the previous gesture's settle and let the
          // reaction re-drive a transition the gesture already owns.
          gestureStartX.set(surfaceX.get());
          gestureTranslationOffsetX.set(null);
        })

        .onStart(() => {
          gestureActive.set(true); // only a real activation takes ownership
          gestureOwnsTransition.set(false);
        })

        .onUpdate((event) => {
          if (modeSV.get() !== 'chat') return;
          if (!openSV.get() && event.translationX <= 0) return;

          // Captured here rather than in onBegin/onStart so it lands AFTER the
          // guard above: a closed-drawer leftward drag that reverses right has
          // to anchor at the crossing point, not at the negative translation
          // it activated with.
          let offset = gestureTranslationOffsetX.get();
          if (offset === null) {
            offset = event.translationX;
            gestureTranslationOffsetX.set(offset);
          }

          surfaceX.set(
            clampDrawerPosition(
              gestureStartX.get() + (event.translationX - offset),
              0,
              menuWidthSV.get(),
            ),
          );
        })

        .onEnd((event, success) => {
          const panelWidth = menuWidthSV.get();
          const isChat = modeSV.get() === 'chat';
          const velocityX = sanitizeGestureVelocity(event.velocityX);
          const settleSpring = { ...SPRING, velocity: velocityX };

          // ── Branch 0: RNGH failure/cancel of an ACTIVE pan ────────────────
          // (system edge-swipe takes over, gesture disabled mid-drag, app
          // backgrounds). The surface is stranded and must settle, but the
          // user completed no intent, so NOTHING here may fire onClose/
          // onOpenDrawer/onSwitchMode/onSettled. Settle to whichever edge
          // matches the state React still holds — not the geometrically nearer
          // one, because `open` never changed and the openSV reaction will not
          // fire to correct a surface parked on the wrong side.
          if (!success) {
            surfaceX.set(withSpring(openSV.get() ? panelWidth : 0, settleSpring));
            return;
          }

          const endState = {
            currentPosition: surfaceX.get(),
            menuWidth: panelWidth,
            translationX: event.translationX,
            velocityX,
          };

          // ── Branch 1: drawer is OPEN ──────────────────────────────────────
          if (openSV.get()) {
            if (shouldCloseDrawer(endState)) {
              gestureOwnsTransition.set(true);
              surfaceX.set(withSpring(0, settleSpring, (finished) => {
                'worklet';
                if (finished) scheduleOnRN(onSettled);
              }));
              scheduleOnRN(onClose);
            } else {
              surfaceX.set(withSpring(panelWidth, settleSpring));
            }
            return;
          }

          // ── Branch 2: CLOSED, in chat, and actually dragged rightward ─────
          if (isChat && surfaceX.get() > 0) {
            if (shouldOpenDrawer(endState)) {
              gestureOwnsTransition.set(true);
              surfaceX.set(withSpring(panelWidth, settleSpring));
              scheduleOnRN(onOpenDrawer);
            } else {
              surfaceX.set(withSpring(0, settleSpring));
            }
            return;
          }

          // ── Branch 3: the shell's mode switch, on its own thresholds ──────
          const shouldMoveLeft =
            event.translationX <= -SHELL_SWIPE_DISTANCE || velocityX <= -SHELL_SWIPE_VELOCITY;
          const shouldMoveRight =
            event.translationX >= SHELL_SWIPE_DISTANCE || velocityX >= SHELL_SWIPE_VELOCITY;

          if (isChat && shouldMoveLeft) scheduleOnRN(onSwitchMode, 'wallet');
          else if (!isChat && shouldMoveRight) scheduleOnRN(onSwitchMode, 'chat');
        })

        .onFinalize(() => {
          // Runs after onEnd, and also for gestures that never activated or
          // that failed/cancelled, so ownership can never latch on.
          gestureActive.set(false);
        })
    );
    // All callbacks must be referentially stable — the spec treats instability
    // as load-bearing (the gesture rebuilds mid-finalise and drops the native
    // handler). The shared values are stable for the hook's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionMenuOpen, onClose, onOpenDrawer, onSwitchMode, onSettled]);

  // ── Animation ownership ───────────────────────────────────────────────────
  // surfaceX must be written by exactly ONE thing per transition. A
  // gesture-driven open/close starts its spring in onEnd and raises
  // gestureOwnsTransition. Every other open/close — header button, hardware
  // back, a mode switch — has no gesture behind it, so this reaction on
  // openSV owns the spring instead.
  useAnimatedReaction(
    () => openSV.get(),
    (isOpen, previous) => {
      // `previous === null` keeps this from firing on mount, so onSettled runs
      // exactly once per close and never for a close that never happened.
      if (previous === null || isOpen === previous) return;

      // The gesture already started this transition. Consume the hand-off.
      if (gestureOwnsTransition.get()) {
        gestureOwnsTransition.set(false);
        return;
      }

      // A drag is in progress and is already writing surfaceX every frame.
      // Springing here would give the surface two owners for the rest of the
      // gesture. Stand down: onEnd runs for every gesture that activated.
      if (gestureActive.get()) return;

      cancelAnimation(surfaceX);
      if (isOpen) {
        surfaceX.set(withSpring(menuWidthSV.get(), SPRING));
        return;
      }
      surfaceX.set(
        withSpring(0, SPRING, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(onSettled);
        }),
      );
    },
  );

  // Second reaction — keeps an open drawer pinned across rotation and
  // split-view resizes.
  useAnimatedReaction(
    () => menuWidthSV.get(),
    (width, previous) => {
      if (previous === null || width === previous) return;
      if (!openSV.get()) return;
      surfaceX.set(withSpring(width, SPRING));
    },
  );

  // Unmount cleanup.
  useEffect(() => () => cancelAnimation(surfaceX), [surfaceX]);

  const surfaceAnimatedStyle = useAnimatedStyle(() => {
    const width = menuWidthSV.get();
    // Sanitized, not clamped to [0, width]: a menuWidth change (rotation,
    // split view) springs the surface from the old width to the new one, and
    // clamping would jump-cut that instead of animating it.
    const position = sanitizeDrawerPosition(surfaceX.get());
    const progress = width > 0 ? clampDrawerPosition(position, 0, width) / width : 0;
    return {
      transform: [{ translateX: position }],
      // One radius rather than four: this view clips the entire app, so every
      // extra animated prop is another per-frame relayout of that subtree.
      borderRadius: progress * CORNER_RADIUS,
    };
  });

  const surfaceEdgeAnimatedStyle = useAnimatedStyle(() => {
    const width = menuWidthSV.get();
    const progress =
      width > 0 ? clampDrawerPosition(sanitizeDrawerPosition(surfaceX.get()), 0, width) / width : 0;
    return { borderRadius: progress * CORNER_RADIUS, opacity: progress };
  });

  const menuContentAnimatedStyle = useAnimatedStyle(() => {
    const width = menuWidthSV.get();
    const progress = width > 0 ? clampDrawerPosition(surfaceX.get(), 0, width) / width : 0;
    return {
      opacity: interpolate(
        progress,
        [0, REVEAL.fadeStartProgress, REVEAL.fadeEndProgress],
        [0, 0, 1],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          translateY: interpolate(
            progress,
            [0, 1],
            [REVEAL.startVerticalOffset, 0],
            Extrapolation.CLAMP,
          ),
        },
        { scale: interpolate(progress, [0, 1], [REVEAL.startScale, 1], Extrapolation.CLAMP) },
      ],
    };
  });

  return { swipeGesture, surfaceAnimatedStyle, surfaceEdgeAnimatedStyle, menuContentAnimatedStyle };
}