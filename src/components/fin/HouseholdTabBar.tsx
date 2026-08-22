import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, type TextInput, View } from 'react-native';
import Animated, {
  clamp,
  Extrapolation,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useAskDockOptional } from '@/components/ask/AskDockContext';
import { AppText } from '@/design/AppText';
import { useReduceMotion } from '@/design/motion';
import { useColors, useDepth, useTheme } from '@/design/theme';
import { capsule, depth, font, icon, radius, space, spring } from '@/design/tokens';
import AnimatedInput from '@/shared/ui/base/animated-input-bar';

const TABS: {
  name: string;
  label: string;
  outline: keyof typeof Ionicons.glyphMap;
  filled: keyof typeof Ionicons.glyphMap;
}[] = [
  { name: 'index', label: 'Home', outline: 'home-outline', filled: 'home' },
  { name: 'cards', label: 'Cards', outline: 'card-outline', filled: 'card' },
  { name: 'family', label: 'Family', outline: 'people-outline', filled: 'people' },
  { name: 'activity', label: 'Activity', outline: 'time-outline', filled: 'time' },
];

const PLACEHOLDERS = [
  'Ask anything…',
  'How much does Maya have left?',
  "Freeze Dad’s card",
  'Add ₹1,000 until Sunday',
];

/**
 * The field stays mounted behind the closed navbar so its ref is live the
 * moment the morph needs it. Handing it a single placeholder while closed
 * settles its rotation loop rather than cycling text nobody can see.
 */
const RESTING_PLACEHOLDER = [PLACEHOLDERS[0]];

/**
 * Pinned identities for `AnimatedInput`. The bar is mounted on every screen,
 * and a fresh literal here defeats the component's `memo` — which cascades
 * into its staggered placeholder re-splitting the string and rebuilding one
 * animated node per glyph on every theme swap.
 */
const NO_BLUR: [number, number, number] = [0, 0, 0];

// Shared with the chat/onboarding composer — see `capsule` in design/tokens.
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

export interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
}

/**
 * The bar's height is derived rather than measured, so the spacer that holds
 * its place inside the navigator and the floating bar itself can never
 * disagree — and screens get a correct `tabBarHeight` on the first frame.
 */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return space.s + CAPSULE_H + insets.bottom + space.s;
}

/**
 * Stands in for the bar inside the tab navigator. The real bar renders in the
 * overlay above the scenes so the composer's scrim can sit between the two;
 * this reserves exactly the space the bar used to occupy and forwards the
 * navigation state outward.
 */
export function TabBarSpacer({
  state,
  navigation,
  onProps,
}: TabBarProps & { onProps: (p: TabBarProps) => void }) {
  const height = useTabBarHeight();
  const dock = useAskDockOptional();
  const setTabBarHeight = dock?.setTabBarHeight;
  const signature = `${state.index}:${state.routes.map((r) => r.key).join(',')}`;
  const lastSignature = useRef<string | null>(null);

  useEffect(() => {
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    onProps({ state, navigation });
  }, [signature, state, navigation, onProps]);

  useEffect(() => {
    setTabBarHeight?.(height);
  }, [height, setTabBarHeight]);

  return <View style={{ height }} />;
}

/**
 * A floating capsule of destinations that *becomes* the AI search field,
 * beside a detached round button that never moves.
 *
 * The capsule's footprint is fixed — it always stops `RESERVED` short of the
 * right edge — so opening Ask changes nothing about the geometry: the tabs
 * fade out and the field fades in inside the same surface, and the FAB stays
 * a 60pt circle at the same coordinates, only re-colouring and rotating its
 * `+` 45° into a `✕`. Nothing travels or resizes, which is what keeps the two
 * pieces reading as one floating unit. There is deliberately only one input
 * path — no second composer is summoned, and the keyboard is raised part-way
 * through the morph rather than on the tap.
 */
export function HouseholdTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const router = useRouter();
  const dock = useAskDockOptional();
  const barHeight = useTabBarHeight();
  // Same elevation, two shapes: the capsule is a rounded rect and keeps the
  // lit top edge, the button is a circle and cannot (see `orb` in tokens).
  const capsuleShade = useDepth('raise3');
  const fabShade = useDepth('orb');

  const composerOpen = dock?.composerOpen ?? false;
  const vaultOpen = dock?.vaultOpen ?? false;
  const open = composerOpen && !vaultOpen;

  const [text, setText] = useState('');

  // Keyed on the two tokens they read, not the palette object.
  const placeholderStyle = useMemo(
    () => ({ color: colors.textTertiary, fontFamily: font.regular, fontSize: 15 }),
    [colors.textTertiary],
  );
  const inputStyle = useMemo(
    () => ({ color: colors.textPrimary, fontFamily: font.regular, fontSize: 15 }),
    [colors.textPrimary],
  );
  const inputRef = useRef<TextInput>(null);
  const hasText = text.trim().length > 0;

  const pillX = useSharedValue(state.index);
  const rowW = useSharedValue(0);
  const morph = useSharedValue(0);
  const focusGate = useSharedValue(0);
  const sendProgress = useSharedValue(0);
  const pressed = useSharedValue(0);
  const keyboard = useAnimatedKeyboard();

  const closeComposer = dock?.closeComposer;

  const dismiss = useCallback(() => {
    inputRef.current?.blur();
    Keyboard.dismiss();
    closeComposer?.();
  }, [closeComposer]);

  const send = useCallback(() => {
    const value = text.trim();
    // Submitting an empty composer is a dismissal, not a no-op.
    if (!value) {
      dismiss();
      return;
    }
    setText('');
    dismiss();
    router.push({ pathname: '/chat', params: { q: value } });
  }, [text, dismiss, router]);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (reduceMotion) pillX.value = state.index;
    else pillX.value = withSpring(state.index, spring);
  }, [state.index, reduceMotion, pillX]);

  // Switching destinations dismisses the composer, which is what the old
  // per-screen `useIsFocused` check did before the bar became always-mounted.
  const lastIndex = useRef(state.index);
  useEffect(() => {
    if (lastIndex.current === state.index) return;
    lastIndex.current = state.index;
    if (composerOpen) dismiss();
  }, [state.index, composerOpen, dismiss]);

  useEffect(() => {
    if (reduceMotion) {
      morph.value = open ? 1 : 0;
      if (!open) return;
      const t = setTimeout(focusInput, 0);
      return () => clearTimeout(t);
    }
    morph.value = withSpring(open ? 1 : 0, spring);
    // Assigning first cancels any in-flight gate, so a fast open/close/open
    // can never leave a stale focus callback queued.
    focusGate.value = 0;
    if (!open) return;
    focusGate.value = withTiming(1, { duration: FOCUS_AT_MS }, (finished) => {
      'worklet';
      if (finished) scheduleOnRN(focusInput);
    });
  }, [open, reduceMotion, focusInput, morph, focusGate]);

  // Covers both dismissal and a sheet stealing the surface via `vaultOpen`.
  useEffect(() => {
    if (!open) inputRef.current?.blur();
  }, [open]);

  useEffect(() => {
    sendProgress.value = reduceMotion
      ? hasText
        ? 1
        : 0
      : withSpring(hasText ? 1 : 0, spring);
  }, [hasText, reduceMotion, sendProgress]);

  const onChangeText = useCallback((value: string) => {
    setText(value);
  }, []);

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
  const tabsAnim = useAnimatedStyle(() => ({
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
    return {
      backgroundColor: interpolateColor(morph.value, [0, 1], [colors.accent, openBg]),
      transform: [{ scale: reduceMotion ? 1 : 1 - pressed.value * 0.03 }],
    };
  });

  /**
   * One mark, rotated: a `+` turned 45° *is* the `✕`, so opening reads as a
   * true morph rather than a swap. It is deliberately not rotated further on
   * the send transition — a `+` is 90°-symmetric, so continuing the turn would
   * walk it back into a `+`; it shrinks out instead while the arrow scales in.
   *
   * Send is gated on `morph` as well as on text, because dismissing the bar
   * keeps whatever was typed — without the gate a closed FAB would sit there
   * with no glyph at all, the arrow being hidden and the `+` faded out.
   */
  const markAnim = useAnimatedStyle(() => {
    // `spring` is underdamped, so both drivers overshoot past 1 — clamped here
    // because a negative opacity is not a valid value to hand the view.
    const arrow = clamp(sendProgress.value * morph.value, 0, 1);
    return {
      opacity: 1 - arrow,
      transform: [
        { rotate: `${45 * morph.value}deg` },
        // A `✕` reads optically larger than a `+` of the same span, so it is
        // trimmed very slightly rather than held at parity.
        { scale: (1 - 0.08 * morph.value) * (1 - 0.3 * arrow) },
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
    transform: [{ scale: 0.7 + sendProgress.value * 0.3 }],
  }));

  const onTrailingPress = () => {
    if (!open) {
      Haptics.selectionAsync();
      dock?.openComposer();
      return;
    }
    if (hasText) {
      send();
      return;
    }
    Haptics.selectionAsync();
    dismiss();
  };

  return (
    <>
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
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss the composer"
        />
      </Animated.View>

      <Animated.View
        pointerEvents="box-none"
        style={[styles.bar, { paddingBottom: insets.bottom + space.s }, barAnim]}>
        <Animated.View
          pointerEvents="none"
          style={[styles.ground, { height: barHeight, backgroundColor: colors.bg }, groundAnim]}
        />

        <View
          style={styles.row}
          onLayout={(e) => {
            rowW.value = e.nativeEvent.layout.width;
          }}>
          <View style={[styles.surface, { backgroundColor: colors.raised, boxShadow: capsuleShade }]}>
            <Animated.View
              pointerEvents={open ? 'none' : 'auto'}
              accessibilityElementsHidden={open}
              importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}
              style={[styles.tabsLayer, tabsAnim]}>
              <MovingWell indexSV={pillX} rowW={rowW} count={state.routes.length} />
              {state.routes.map((route, index) => {
                const meta = TABS.find((t) => t.name === route.name) ?? {
                  name: route.name,
                  label: route.name,
                  outline: 'ellipse-outline' as const,
                  filled: 'ellipse' as const,
                };
                const selected = state.index === index;
                return (
                  <TabItem
                    key={route.key}
                    label={meta.label}
                    outline={meta.outline}
                    filled={meta.filled}
                    selected={selected}
                    onPress={() => {
                      Haptics.selectionAsync();
                      if (selected) {
                        dock?.scrollToTop(route.name);
                      } else {
                        navigation.navigate(route.name);
                      }
                    }}
                  />
                );
              })}
            </Animated.View>

            <Animated.View
              pointerEvents={open ? 'auto' : 'none'}
              accessibilityElementsHidden={!open}
              importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
              style={[styles.inputLayer, inputAnim]}>
              <AnimatedInput
                inputRef={inputRef}
                placeholders={open ? PLACEHOLDERS : RESTING_PLACEHOLDER}
                animationInterval={3200}
                value={text}
                onChangeText={onChangeText}
                blurIntensityRange={NO_BLUR}
                accessibilityLabel="Ask anything"
                accessibilityRole="search"
                placeholderStyle={placeholderStyle}
                inputStyle={inputStyle}
                containerStyle={styles.inputContainer}
                inputWrapperStyle={styles.inputWrapper}
                returnKeyType="send"
                onSubmitEditing={send}
              />
            </Animated.View>
          </View>

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
              accessibilityLabel={
                !open
                  ? 'Ask anything about your money'
                  : hasText
                    ? 'Send'
                    : 'Close the Ask bar'
              }
              accessibilityHint={
                !open
                  ? 'Turns the navigation bar into a search field.'
                  : hasText
                    ? 'Opens a conversation with this request.'
                    : 'Dismisses the composer.'
              }
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
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </>
  );
}

/**
 * The recessed slot the selected tab sits in — the skeuomorphic reading of
 * "selected", replacing a flat tinted pill.
 */
function MovingWell({
  indexSV,
  rowW,
  count,
}: {
  indexSV: SharedValue<number>;
  rowW: SharedValue<number>;
  count: number;
}) {
  const colors = useColors();
  const { mode } = useTheme();
  const style = useAnimatedStyle(() => {
    const track = Math.max(rowW.value - RESERVED, 0);
    const w = count > 0 ? track / count : 0;
    return { width: Math.max(w - 8, 0), transform: [{ translateX: indexSV.value * w + 4 }] };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.movingWell,
        { backgroundColor: colors.inset, boxShadow: depth[mode].well },
        style,
      ]}
    />
  );
}

function TabItem({
  label,
  outline,
  filled,
  selected,
  onPress,
}: {
  label: string;
  outline: keyof typeof Ionicons.glyphMap;
  filled: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(selected ? 1.12 : 1);
  useEffect(() => {
    if (reduceMotion) scale.value = selected ? 1.12 : 1;
    else scale.value = withSpring(selected ? 1.12 : 1, spring);
  }, [selected, reduceMotion, scale]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const tone = selected ? colors.accentInk : colors.textTertiary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={styles.tab}>
      <Animated.View style={iconStyle}>
        <Ionicons name={selected ? filled : outline} size={icon.tab} color={tone} />
      </Animated.View>
      <AppText variant="caption" tone={tone} style={{ fontFamily: font.medium, fontSize: 10 }}>
        {label}
      </AppText>
    </Pressable>
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
  tabsLayer: {
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
  movingWell: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    borderRadius: radius.pill,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    zIndex: 1,
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
