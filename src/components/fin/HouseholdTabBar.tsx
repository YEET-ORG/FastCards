import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, type TextInput, View } from 'react-native';
import Animated, {
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
import { PlusMenu } from '@/components/ask/PlusMenu';
import { useToast } from '@/components/fin/Toast';
import { AppText } from '@/design/AppText';
import { useReduceMotion } from '@/design/motion';
import { useColors, useDepth, useTheme } from '@/design/theme';
import { depth, font, icon, radius, space, spring } from '@/design/tokens';
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

const CAPSULE_H = 60;
const FAB_SIZE = 60;
/** The trailing button the FAB shrinks into once the field is open. */
const FAB_SMALL = 44;
const FAB_INSET = 8;
/** Width the capsule gives up to the FAB when closed: the FAB plus its gap. */
const RESERVED = FAB_SIZE + space.m;
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
 * A floating capsule of destinations that *becomes* the AI search field: the
 * `+` is not a separate composer trigger but the right-hand end of the same
 * surface, so opening Ask widens the capsule over the gap the FAB occupied
 * while the FAB shrinks in place into the field's trailing button. There is
 * deliberately only one input path — no second composer is summoned, and the
 * keyboard is raised part-way through the morph rather than on the tap.
 */
export function HouseholdTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const router = useRouter();
  const toast = useToast();
  const dock = useAskDockOptional();
  const barHeight = useTabBarHeight();
  const capsuleShade = useDepth('raise3');

  const composerOpen = dock?.composerOpen ?? false;
  const vaultOpen = dock?.vaultOpen ?? false;
  const open = composerOpen && !vaultOpen;

  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

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
    setMenuOpen(false);
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
    // Typing turns the trailing button into Send, so the menu it would have
    // opened is no longer reachable — close it rather than leave it orphaned.
    if (value.trim().length > 0) setMenuOpen(false);
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

  const backdropAnim = useAnimatedStyle(() => ({ opacity: morph.value }));

  const groundAnim = useAnimatedStyle(() => ({ opacity: 1 - morph.value }));

  // Growing the surface rightward over the gap the FAB sat in is the whole
  // trick: no element travels, the capsule simply annexes the FAB's space.
  const surfaceAnim = useAnimatedStyle(() => ({
    right: RESERVED * (1 - morph.value),
  }));

  const tabsAnim = useAnimatedStyle(() => ({
    // Held at the closed width so the tabs stay put while they fade rather
    // than stretching with the surface.
    width: Math.max(rowW.value - RESERVED, 0),
    opacity: interpolate(morph.value, [0, 0.45, 1], [1, 0, 0], Extrapolation.CLAMP),
    transform: [{ scale: 1 - 0.06 * morph.value }],
  }));

  const inputAnim = useAnimatedStyle(() => ({
    opacity: interpolate(morph.value, [0, 0.55, 1], [0, 0, 1], Extrapolation.CLAMP),
  }));

  const fabAnim = useAnimatedStyle(() => {
    const m = morph.value;
    const size = FAB_SIZE - (FAB_SIZE - FAB_SMALL) * m;
    const openBg = interpolateColor(sendProgress.value, [0, 1], [colors.inset, colors.accent]);
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: interpolateColor(m, [0, 1], [colors.accent, openBg]),
      transform: [
        { translateX: -FAB_INSET * m },
        { translateY: ((FAB_SIZE - FAB_SMALL) / 2) * m },
        { scale: reduceMotion ? 1 : 1 - pressed.value * 0.03 },
      ],
    };
  });

  const bigPlusAnim = useAnimatedStyle(() => ({
    opacity: interpolate(morph.value, [0, 0.4, 1], [1, 0, 0], Extrapolation.CLAMP),
  }));

  const smallPlusAnim = useAnimatedStyle(() => ({
    opacity:
      interpolate(morph.value, [0, 0.6, 1], [0, 0, 1], Extrapolation.CLAMP) *
      (1 - sendProgress.value),
    transform: [{ rotate: `${sendProgress.value * 90}deg` }],
  }));

  const sendAnim = useAnimatedStyle(() => ({
    opacity: sendProgress.value * interpolate(morph.value, [0, 0.6, 1], [0, 0, 1], Extrapolation.CLAMP),
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
    setMenuOpen((v) => !v);
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

        {open && menuOpen && !hasText ? (
          <>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setMenuOpen(false)}
              accessibilityLabel="Dismiss menu"
            />
            <View style={styles.menuAnchor}>
              <PlusMenu
                onDismiss={() => setMenuOpen(false)}
                items={[
                  {
                    key: 'voice',
                    icon: 'mic-outline',
                    label: 'Voice',
                    onPress: () => toast('Voice arrives after MVP.'),
                  },
                  {
                    key: 'move',
                    icon: 'swap-horizontal-outline',
                    label: 'Move money',
                    onPress: () => router.push('/move-money'),
                  },
                  {
                    key: 'card',
                    icon: 'card-outline',
                    label: 'New card',
                    onPress: () => router.push('/order-card'),
                  },
                  {
                    key: 'photo',
                    icon: 'camera-outline',
                    label: 'Photo',
                    caption: 'Coming later',
                    disabled: true,
                    onPress: () => undefined,
                  },
                ]}
              />
            </View>
          </>
        ) : null}

        <View
          style={styles.row}
          onLayout={(e) => {
            rowW.value = e.nativeEvent.layout.width;
          }}>
          <Animated.View
            style={[
              styles.surface,
              { backgroundColor: colors.raised, boxShadow: capsuleShade },
              surfaceAnim,
            ]}>
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
          </Animated.View>

          <Animated.View style={[styles.fab, { boxShadow: capsuleShade }, fabAnim]}>
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
                !open ? 'Ask anything about your money' : hasText ? 'Send' : 'More actions'
              }
              accessibilityHint={
                !open
                  ? 'Turns the navigation bar into a search field.'
                  : hasText
                    ? 'Opens a conversation with this request.'
                    : 'Voice, move money, new card.'
              }
              style={StyleSheet.absoluteFill}>
              <Animated.View style={[StyleSheet.absoluteFill, styles.fabIcon, bigPlusAnim]}>
                <Ionicons name="add" size={30} color={colors.onAccent} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, styles.fabIcon, smallPlusAnim]}>
                <Ionicons name="add" size={22} color={colors.iconPrimary} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, styles.fabIcon, sendAnim]}>
                <Ionicons name="arrow-up" size={20} color={colors.onAccent} />
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
  menuAnchor: {
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  row: {
    height: CAPSULE_H,
  },
  surface: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  tabsLayer: {
    position: 'absolute',
    left: 0,
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
    paddingRight: FAB_SMALL + FAB_INSET + space.xs,
  },
  inputContainer: {
    flex: 1,
    width: undefined,
    marginVertical: 0,
  },
  inputWrapper: {
    // 18 matches the placeholder overlay's hard-coded `left`, so the animated
    // placeholder and the typed text sit on the same baseline.
    paddingHorizontal: 18,
    paddingVertical: 0,
    minHeight: 44,
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
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
