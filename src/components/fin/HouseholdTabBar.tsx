import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, type TextInput, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useAskDockOptional } from '@/components/ask/AskDockContext';
import { CommandBar, useCommandBarMetrics, type CommandBarTrailing } from '@/components/ask/CommandBar';
import { AppText } from '@/design/AppText';
import { useReduceMotion } from '@/design/motion';
import { useColors, useTheme } from '@/design/theme';
import { depth, font, icon, radius, spring } from '@/design/tokens';

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
  'How much has anyone left this month?',
  "Freeze a family member’s card",
  'Add ₹1,000 until Sunday',
];

/**
 * The field stays mounted behind the closed navbar so its ref is live the
 * moment the morph needs it. Handing it a single placeholder while closed
 * settles its rotation loop rather than cycling text nobody can see.
 */
const RESTING_PLACEHOLDER = [PLACEHOLDERS[0]];

export interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
}

/**
 * The bar's height is derived rather than measured, so screens get a correct
 * `tabBarHeight` on the first frame — and it can never disagree with the bar
 * itself, which derives its own footprint from the same tokens.
 */
export function useTabBarHeight(): number {
  return useCommandBarMetrics().footprint;
}

/**
 * Stands in for the bar inside the tab navigator — as a zero-height view.
 *
 * The bar is not a member of the navigator's layout: it renders in the overlay
 * above the scenes (so the composer's scrim can sit between the two) as an
 * absolutely-positioned floating unit with its own opaque ground. Reserving
 * space for it here as well would push every scene up by the bar's height on
 * top of the clearance each screen already pads for — which is exactly what
 * left a dead band under the chat composer and the history drawer.
 *
 * What this still does is forward the navigation state outward and publish the
 * bar's derived height, which screens read as their bottom clearance.
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

  return <View style={styles.spacer} />;
}

/**
 * A floating capsule of destinations that *becomes* the AI search field,
 * beside a detached round button that never moves.
 *
 * The control itself is `CommandBar` — the same one the chat surface mounts,
 * permanently open. This component owns only what is specific to the dock: the
 * tab row it hands over as the bar's resting layer, and the composer's
 * open/dismiss/send logic. There is deliberately only one input path — no
 * second composer is summoned anywhere in the app.
 */
export function HouseholdTabBar({ state, navigation }: TabBarProps) {
  const reduceMotion = useReduceMotion();
  const router = useRouter();
  const dock = useAskDockOptional();

  const composerOpen = dock?.composerOpen ?? false;
  const vaultOpen = dock?.vaultOpen ?? false;
  const open = composerOpen && !vaultOpen;

  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const hasText = text.trim().length > 0;

  const pillX = useSharedValue(state.index);
  const trackW = useSharedValue(0);

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

  const onChangeText = useCallback((value: string) => {
    setText(value);
  }, []);

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

  const trailing: CommandBarTrailing = hasText ? 'send' : 'plus';

  const tabsLayer = (
    <View
      style={styles.tabsRow}
      onLayout={(e) => {
        trackW.value = e.nativeEvent.layout.width;
      }}>
      <MovingWell indexSV={pillX} trackW={trackW} count={state.routes.length} />
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
    </View>
  );

  return (
    <CommandBar
      open={open}
      resting={tabsLayer}
      backdrop
      onBackdropPress={dismiss}
      value={text}
      onChangeText={onChangeText}
      onSubmit={send}
      placeholders={open ? PLACEHOLDERS : RESTING_PLACEHOLDER}
      inputRef={inputRef}
      focusOnOpen
      trailing={trailing}
      rotateMark
      onTrailingPress={onTrailingPress}
      trailingAccessibility={{
        label: !open ? 'Ask anything about your money' : hasText ? 'Send' : 'Close the Ask bar',
        hint: !open
          ? 'Turns the navigation bar into a search field.'
          : hasText
            ? 'Opens a conversation with this request.'
            : 'Dismisses the composer.',
      }}
    />
  );
}

/**
 * The recessed slot the selected tab sits in — the skeuomorphic reading of
 * "selected", replacing a flat tinted pill.
 */
function MovingWell({
  indexSV,
  trackW,
  count,
}: {
  indexSV: SharedValue<number>;
  trackW: SharedValue<number>;
  count: number;
}) {
  const colors = useColors();
  const { mode } = useTheme();
  const style = useAnimatedStyle(() => {
    const w = count > 0 ? trackW.value / count : 0;
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
  spacer: { height: 0 },
  tabsRow: {
    flex: 1,
    flexDirection: 'row',
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
});
