// The app's one AI command bar: a raised capsule that hosts the field, beside
// a detached round button that never moves.
//
// It is deliberately ONE component rather than two that resemble each other.
// The Home dock (`components/fin/HouseholdTabBar`) hands it the tab row as its
// resting layer and morphs into the field; the chat surface
// (`components/chat/ChatSurface`) mounts it permanently open. Everything that
// makes the control feel like itself — the fixed 60pt capsule, the 60pt orb,
// the `+`→`✕` rotation, the arrow that scales in as the mark shrinks out, the
// two-channel keyboard handling — lives here, so the two surfaces cannot drift
// apart the way they did when chat carried its own 56pt copy.

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Platform, Pressable, StyleSheet, type TextInput, View } from 'react-native';
import Animated, {
  cancelAnimation,
  clamp,
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useReduceMotion } from '@/design/motion';
import { useColors, useDepth } from '@/design/theme';
import { capsule, font, radius, space, spring } from '@/design/tokens';
import AnimatedInput from '@/shared/ui/base/animated-input-bar';

/** Shared with the chat/onboarding composer — see `capsule` in design/tokens. */
const CAPSULE_H = capsule.height;
const FAB_SIZE = capsule.button;
/**
 * Width the capsule permanently gives up to the FAB: the FAB plus its gap.
 * Reserved in every state, so the button is never overlapped and the field
 * ends exactly where the tabs ended.
 */
const RESERVED = FAB_SIZE + capsule.gap;

/**
 * The `+`/`✕` mark is drawn from two bars rather than set as an icon glyph.
 * Ionicons pads its ink well inside the em box — `add` at 30 renders only
 * ~19pt of actual stroke — and that ink is not centred on the em box either,
 * so a rotated glyph lands both too small and off-centre. Two bars give exact
 * length, weight and centre, which is what a 45° rotation needs to read as a
 * clean `✕`.
 */
const MARK_LEN = 22;
const MARK_THICK = 2.75;

/**
 * Focus lands at roughly two thirds of the morph, so the keyboard slide
 * overlaps the tail of the spring and the whole gesture reads as one motion.
 */
const FOCUS_AT_MS = 150;

/**
 * Android's `adjustPan` stops lifting the window as soon as the caret is on
 * screen, which leaves the bottom half of the pill under the keyboard. This is
 * the remaining lift: the pill's half-height, plus the gap it should float by.
 */
const ANDROID_PAN_CLEARANCE = CAPSULE_H / 2 + space.s;
/** Keyboard travel over which the correction above is blended in. */
const ANDROID_PAN_RAMP = 200;

/** Pulse period of the stop button's halo. */
const STOP_PULSE_MS = 900;

/**
 * Pinned identity for `AnimatedInput`. The bar is mounted on every screen, and
 * a fresh literal here defeats the component's `memo` — which cascades into
 * its staggered placeholder re-splitting the string and rebuilding one
 * animated node per glyph on every theme swap.
 */
const NO_BLUR: [number, number, number] = [0, 0, 0];

/**
 * What the detached button currently means. `plus` is the secondary action
 * (Home: open/dismiss the field; chat: open the actions menu), `send` submits,
 * `stop` cancels an in-flight generation.
 */
export type CommandBarTrailing = 'plus' | 'send' | 'stop';

/**
 * The bar's footprint is derived rather than measured, so a spacer that holds
 * its place and the floating bar itself can never disagree — and screens get a
 * correct clearance on the first frame.
 */
export function useCommandBarMetrics(): {
  /** Window bottom → top of the capsule, at rest. */
  footprint: number;
  capsuleHeight: number;
  bottomPad: number;
} {
  const insets = useSafeAreaInsets();
  return useMemo(
    () => ({
      footprint: space.s + CAPSULE_H + insets.bottom + space.s,
      capsuleHeight: CAPSULE_H,
      bottomPad: insets.bottom + space.s,
    }),
    [insets.bottom],
  );
}

/**
 * The JS-thread mirror of the bar's own `barAnim` translate. Overlays that
 * must ride above the bar (thread padding, suggestion dock, status line)
 * resolve their offset through this, so they can never disagree with the bar
 * about where it is.
 */
export function resolveCommandBarLift({
  keyboardHeight,
  safeAreaBottom,
}: {
  keyboardHeight: number;
  safeAreaBottom: number;
}): number {
  if (keyboardHeight <= 0) return 0;
  // iOS never moves the window, so the bar covers the whole keyboard itself.
  if (Platform.OS === 'ios') return Math.max(keyboardHeight - safeAreaBottom, 0);
  // Android runs `adjustPan` (see app.json): the OS already lifted the window,
  // and the bar only adds the remainder.
  return ANDROID_PAN_CLEARANCE * Math.min(keyboardHeight / ANDROID_PAN_RAMP, 1);
}

export interface CommandBarProps {
  /** Morph target. Home: the dock's composer state. Chat: permanently true. */
  open: boolean;
  /**
   * Drawn inside the capsule behind the field and cross-faded out as `open`
   * rises. Home passes its tab row; chat passes nothing, which pins the morph
   * open with no mount animation.
   */
  resting?: ReactNode;
  /** Dims the app behind an open bar. Home only — chat must not dim its thread. */
  backdrop?: boolean;
  onBackdropPress?: () => void;

  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  placeholders: string[];
  /** Rotation period of `placeholders`; a single-entry list never rotates. */
  placeholderInterval?: number;
  editable?: boolean;
  multiline?: boolean;
  /** Caps a multiline field so the capsule keeps its fixed height. */
  inputMaxHeight?: number;
  inputRef?: RefObject<TextInput | null>;
  /** Raise the keyboard part-way through the opening morph. Home only. */
  focusOnOpen?: boolean;
  /** Monotonic counter; each new value focuses the field. */
  focusSignal?: number;

  trailing: CommandBarTrailing;
  /** Home turns the `+` 45° into a `✕` as the bar opens; chat keeps it upright. */
  rotateMark?: boolean;
  /** External driver for the `+` → `✕` rotation (e.g. chat's actions menu).
      Overrides `rotateMark` when provided — the value is the rotation
      progress 0..1, spring-driven by the caller. */
  markMorph?: SharedValue<number>;
  onTrailingPress: () => void;
  trailingAccessibility: { label: string; hint?: string; disabled?: boolean };

  /** Rendered above the row, inside the bar (chat's "Editing message" strip). */
  accessory?: ReactNode;
}

/**
 * The capsule's footprint is fixed — it always stops `RESERVED` short of the
 * right edge — so opening the field changes nothing about the geometry: the
 * resting layer fades out and the field fades in inside the same surface, and
 * the button stays a 60pt circle at the same coordinates, only re-colouring
 * and rotating its `+`. Nothing travels or resizes, which is what keeps the
 * two pieces reading as one floating unit.
 */
export function CommandBar({
  open,
  resting,
  backdrop = false,
  onBackdropPress,
  value,
  onChangeText,
  onSubmit,
  placeholders,
  placeholderInterval = 3200,
  editable = true,
  multiline = false,
  inputMaxHeight,
  inputRef: externalInputRef,
  focusOnOpen = false,
  focusSignal,
  trailing,
  rotateMark = false,
  markMorph,
  onTrailingPress,
  trailingAccessibility,
  accessory,
}: CommandBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const metrics = useCommandBarMetrics();
  // Same elevation, two shapes: the capsule is a rounded rect and keeps the
  // lit top edge, the button is a circle and cannot (see `orb` in tokens).
  const capsuleShade = useDepth('raise3');
  const fabShade = useDepth('orb');

  const fallbackInputRef = useRef<TextInput>(null);
  const inputRef = externalInputRef ?? fallbackInputRef;
  const lastFocusSignal = useRef<number | undefined>(undefined);

  // Keyed on the two tokens they read, not the palette object.
  const placeholderStyle = useMemo(
    () => ({ color: colors.textTertiary, fontFamily: font.regular, fontSize: 15 }),
    [colors.textTertiary],
  );
  const inputStyle = useMemo(
    () => ({
      color: colors.textPrimary,
      fontFamily: font.regular,
      fontSize: 15,
      ...(inputMaxHeight !== undefined ? { maxHeight: inputMaxHeight } : null),
    }),
    [colors.textPrimary, inputMaxHeight],
  );

  // Chat mounts without a resting layer, so the field must already be there on
  // the first frame rather than fading in.
  const morph = useSharedValue(open ? 1 : 0);
  const focusGate = useSharedValue(0);
  const sendProgress = useSharedValue(trailing === 'send' ? 1 : 0);
  const stopProgress = useSharedValue(trailing === 'stop' ? 1 : 0);
  const pressed = useSharedValue(0);
  const haloScale = useSharedValue(1);
  const haloOpacity = useSharedValue(0);
  const keyboard = useAnimatedKeyboard();

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  useEffect(() => {
    if (reduceMotion) {
      morph.value = open ? 1 : 0;
      if (!open || !focusOnOpen) return;
      const t = setTimeout(focusInput, 0);
      return () => clearTimeout(t);
    }
    morph.value = withSpring(open ? 1 : 0, spring);
    // Assigning first cancels any in-flight gate, so a fast open/close/open
    // can never leave a stale focus callback queued.
    focusGate.value = 0;
    if (!open || !focusOnOpen) return;
    focusGate.value = withTiming(1, { duration: FOCUS_AT_MS }, (finished) => {
      'worklet';
      if (finished) scheduleOnRN(focusInput);
    });
  }, [open, reduceMotion, focusOnOpen, focusInput, morph, focusGate]);

  // Covers both dismissal and a sheet stealing the surface.
  useEffect(() => {
    if (!open) inputRef.current?.blur();
  }, [open, inputRef]);

  // Programmatic focus via a monotonically increasing signal. The frame defer
  // is required — focusing synchronously in the same commit is dropped.
  useEffect(() => {
    if (focusSignal === undefined || focusSignal === lastFocusSignal.current) return;
    lastFocusSignal.current = focusSignal;
    if (!editable) return;
    const frame = requestAnimationFrame(focusInput);
    return () => cancelAnimationFrame(frame);
  }, [focusSignal, editable, focusInput]);

  useEffect(() => {
    const toSend = trailing === 'send' ? 1 : 0;
    const toStop = trailing === 'stop' ? 1 : 0;
    if (reduceMotion) {
      sendProgress.value = toSend;
      stopProgress.value = toStop;
      return;
    }
    sendProgress.value = withSpring(toSend, spring);
    stopProgress.value = withSpring(toStop, spring);
  }, [trailing, reduceMotion, sendProgress, stopProgress]);

  // The stop halo breathes only while there is something to stop.
  useEffect(() => {
    if (trailing !== 'stop' || reduceMotion) {
      cancelAnimation(haloScale);
      cancelAnimation(haloOpacity);
      haloScale.value = withTiming(1, { duration: 160 });
      haloOpacity.value = withTiming(0, { duration: 160 });
      return;
    }
    haloScale.value = withRepeat(
      withSequence(withTiming(1, { duration: 0 }), withTiming(1.64, { duration: STOP_PULSE_MS })),
      -1,
      false,
    );
    haloOpacity.value = withRepeat(
      withSequence(withTiming(0.28, { duration: 0 }), withTiming(0, { duration: STOP_PULSE_MS })),
      -1,
      false,
    );
    return () => {
      cancelAnimation(haloScale);
      cancelAnimation(haloOpacity);
    };
  }, [trailing, reduceMotion, haloScale, haloOpacity]);

  // iOS never moves the window, so the bar rides Reanimated's keyboard value
  // and stays glued to the system's own animation curve.
  //
  // Android runs `adjustPan` (see `app.json`), so the OS lifts the window
  // itself — offsetting by the full keyboard height here as well would move
  // the bar twice. It lifts only far enough to expose the caret line, though,
  // which leaves the bottom of the pill under the keyboard, so all that is
  // needed is the remaining distance plus a small gap.
  const barAnim = useAnimatedStyle(() => {
    const kb = keyboard.height.value;
    if (Platform.OS === 'ios') {
      return { transform: [{ translateY: -Math.max(kb - insets.bottom, 0) * morph.value }] };
    }
    // Ramped over the start of the keyboard's rise rather than switched, so the
    // correction blends into the pan instead of snapping on at the end of it.
    const lifted = Math.min(kb / ANDROID_PAN_RAMP, 1);
    return { transform: [{ translateY: -ANDROID_PAN_CLEARANCE * lifted * morph.value }] };
  });

  const backdropAnim = useAnimatedStyle(() => ({ opacity: clamp(morph.value, 0, 1) }));

  const groundAnim = useAnimatedStyle(() => ({ opacity: clamp(1 - morph.value, 0, 1) }));

  // The surface never resizes, so the crossfade *is* the transition. The two
  // layers overlap slightly rather than handing off hard.
  const restingAnim = useAnimatedStyle(() => ({
    opacity: interpolate(morph.value, [0, 0.4], [1, 0], Extrapolation.CLAMP),
    transform: [{ scale: 1 - 0.04 * morph.value }],
  }));

  // Opacity only: `AnimatedInput` runs its own per-glyph placeholder stagger,
  // and a translate here would fight it.
  const inputAnim = useAnimatedStyle(() => ({
    opacity: interpolate(morph.value, [0.25, 0.8], [0, 1], Extrapolation.CLAMP),
  }));

  // Size, radius and position are static (see `styles.fab`) — the button is
  // the one thing on screen that is guaranteed not to move.
  //
  // Cancel uses `lineStrong` rather than `inset`: the button sits beside a
  // white capsule *and* over the dimmed backdrop, and `inset` is so close to
  // both surfaces in White (#EDEFF3) — and so close to the ground in Black
  // (#0A0A0A on #000) — that the disc reads as a washed-out ghost either way.
  const fabAnim = useAnimatedStyle(() => {
    const openBg = interpolateColor(
      sendProgress.value,
      [0, 1],
      [colors.lineStrong, colors.accent],
    );
    const base = interpolateColor(morph.value, [0, 1], [colors.accent, openBg]);
    return {
      backgroundColor: interpolateColor(
        clamp(stopProgress.value, 0, 1),
        [0, 1],
        [base, colors.accentNegative],
      ),
      transform: [{ scale: reduceMotion ? 1 : 1 - pressed.value * 0.03 }],
    };
  });

  /**
   * One mark, rotated: a `+` turned 45° *is* the `✕`, so opening reads as a
   * true morph rather than a swap. It is deliberately not rotated further on
   * the send transition — a `+` is 90°-symmetric, so continuing the turn would
   * walk it back into a `+`; it shrinks out instead while the arrow scales in.
   *
   * Send is gated on `morph` as well as on the trailing mode, because
   * dismissing the bar keeps whatever was typed — without the gate a closed
   * button would sit there with no glyph at all, the arrow being hidden and
   * the `+` faded out.
   */
  const markAnim = useAnimatedStyle(() => {
    // `spring` is underdamped, so both drivers overshoot past 1 — clamped here
    // because a negative opacity is not a valid value to hand the view.
    const arrow = clamp(sendProgress.value * morph.value, 0, 1);
    const stop = clamp(stopProgress.value * morph.value, 0, 1);
    const hidden = Math.max(arrow, stop);
    // Chat keeps a literal `+` (it opens the actions menu), so only the dock
    // couples the rotation to the morph. When an external `markMorph` is
    // provided (chat's actions menu), it owns the turn instead.
    const turn = markMorph?.value ?? (rotateMark ? morph.value : 0);
    return {
      opacity: 1 - hidden,
      transform: [
        { rotate: `${45 * turn}deg` },
        // A `✕` reads optically larger than a `+` of the same span, so it is
        // trimmed very slightly rather than held at parity.
        { scale: (1 - 0.08 * turn) * (1 - 0.3 * hidden) },
      ],
    };
  });

  // The bars recolour in place — no second copy to crossfade against.
  const markInkAnim = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      morph.value,
      [0, 1],
      [colors.onAccent, colors.iconPrimary],
    ),
  }));

  const sendAnim = useAnimatedStyle(() => ({
    opacity: clamp(sendProgress.value * morph.value, 0, 1),
    transform: [{ scale: 0.7 + clamp(sendProgress.value, 0, 1) * 0.3 }],
  }));

  const stopAnim = useAnimatedStyle(() => ({
    opacity: clamp(stopProgress.value * morph.value, 0, 1),
    transform: [{ scale: 0.7 + clamp(stopProgress.value, 0, 1) * 0.3 }],
  }));

  const haloAnim = useAnimatedStyle(() => ({
    opacity: haloOpacity.value,
    transform: [{ scale: haloScale.value }],
  }));

  return (
    <>
      {backdrop ? (
        <Animated.View
          pointerEvents={open ? 'auto' : 'none'}
          style={[
            StyleSheet.absoluteFill,
            styles.backdrop,
            { backgroundColor: colors.overlay },
            backdropAnim,
          ]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onBackdropPress}
            accessibilityRole="button"
            accessibilityLabel="Dismiss the composer"
          />
        </Animated.View>
      ) : null}

      <Animated.View
        pointerEvents="box-none"
        style={[styles.bar, { paddingBottom: metrics.bottomPad }, barAnim]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ground,
            { height: metrics.footprint, backgroundColor: colors.bg },
            groundAnim,
          ]}
        />

        {accessory}

        <View style={styles.row}>
          <View style={[styles.surface, { backgroundColor: colors.raised, boxShadow: capsuleShade }]}>
            {resting ? (
              <Animated.View
                pointerEvents={open ? 'none' : 'auto'}
                accessibilityElementsHidden={open}
                importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}
                style={[styles.restingLayer, restingAnim]}>
                {resting}
              </Animated.View>
            ) : null}

            <Animated.View
              pointerEvents={open ? 'auto' : 'none'}
              accessibilityElementsHidden={!open}
              importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
              style={[styles.inputLayer, inputAnim]}>
              <AnimatedInput
                inputRef={inputRef}
                placeholders={placeholders}
                animationInterval={placeholderInterval}
                value={value}
                onChangeText={onChangeText}
                blurIntensityRange={NO_BLUR}
                accessibilityLabel={placeholders[0]}
                accessibilityRole="search"
                placeholderStyle={placeholderStyle}
                inputStyle={inputStyle}
                containerStyle={styles.inputContainer}
                inputWrapperStyle={styles.inputWrapper}
                editable={editable}
                multiline={multiline}
                returnKeyType="send"
                submitBehavior="submit"
                onSubmitEditing={onSubmit}
              />
            </Animated.View>
          </View>

          {/* Outside the button, which clips its own content — the pulse has to
              be able to grow past the disc. */}
          <Animated.View
            pointerEvents="none"
            style={[styles.halo, { backgroundColor: colors.accentNegative }, haloAnim]}
          />

          <Animated.View style={[styles.fab, { boxShadow: fabShade }, fabAnim]}>
            <Pressable
              onPress={onTrailingPress}
              onPressIn={() => {
                pressed.value = withTiming(1, { duration: 100 });
              }}
              onPressOut={() => {
                pressed.value = withTiming(0, { duration: 200 });
              }}
              accessibilityRole="button"
              accessibilityLabel={trailingAccessibility.label}
              accessibilityHint={trailingAccessibility.hint}
              accessibilityState={{ disabled: trailingAccessibility.disabled ?? false }}
              style={StyleSheet.absoluteFill}>
              <Animated.View style={[StyleSheet.absoluteFill, styles.fabIcon, markAnim]}>
                <View style={styles.mark}>
                  <Animated.View style={[styles.markBar, styles.markBarH, markInkAnim]} />
                  <Animated.View style={[styles.markBar, styles.markBarV, markInkAnim]} />
                </View>
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, styles.fabIcon, sendAnim]}>
                <Ionicons name="arrow-up" size={26} color={colors.onAccent} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, styles.fabIcon, stopAnim]}>
                <Ionicons name="square" size={15} color={colors.onAccent} />
              </Animated.View>
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    zIndex: 19,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    paddingHorizontal: space.l,
    paddingTop: space.s,
    justifyContent: 'flex-end',
  },
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  row: {
    height: CAPSULE_H,
  },
  surface: {
    position: 'absolute',
    left: 0,
    // Fixed: the capsule always stops short of the detached button.
    right: RESERVED,
    top: 0,
    bottom: 0,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  restingLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  inputLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    // Mirrors `inputWrapper`'s leading padding, so the field is optically
    // centred inside the capsule now that no button overlaps it.
    paddingRight: 18,
  },
  inputContainer: {
    flex: 1,
    alignSelf: 'stretch',
    width: undefined,
    marginVertical: 0,
  },
  inputWrapper: {
    // 18 matches the placeholder overlay's hard-coded `left`, so the animated
    // placeholder and the typed text sit on the same baseline.
    paddingHorizontal: 18,
    paddingVertical: 0,
    // Fills the capsule's full height so a tap anywhere in the field focuses it.
    flex: 1,
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  halo: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
  },
  fabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    width: MARK_LEN,
    height: MARK_LEN,
  },
  // Centred by explicit insets rather than by the parent's flex alignment, so
  // the two bars cross exactly on the box's centre — which is the point the
  // 45° rotation turns about.
  markBar: {
    position: 'absolute',
    borderRadius: MARK_THICK / 2,
  },
  markBarH: {
    width: MARK_LEN,
    height: MARK_THICK,
    left: 0,
    top: (MARK_LEN - MARK_THICK) / 2,
  },
  markBarV: {
    width: MARK_THICK,
    height: MARK_LEN,
    top: 0,
    left: (MARK_LEN - MARK_THICK) / 2,
  },
});
