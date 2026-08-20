import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAskDockOptional } from '@/components/ask/AskDockContext';
import { AppText } from '@/design/AppText';
import { useReduceMotion } from '@/design/motion';
import { useColors } from '@/design/theme';
import { font, icon, shadow, spring } from '@/design/tokens';
import { useTheme } from '@/design/theme';

const TABS: {
  name: string;
  label: string;
  outline: keyof typeof Ionicons.glyphMap;
  filled: keyof typeof Ionicons.glyphMap;
}[] = [
  { name: 'index', label: 'Ask', outline: 'sparkles-outline', filled: 'sparkles' },
  { name: 'cards', label: 'Cards', outline: 'card-outline', filled: 'card' },
  { name: 'family', label: 'Family', outline: 'people-outline', filled: 'people' },
  { name: 'activity', label: 'Activity', outline: 'time-outline', filled: 'time' },
];

interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
}

export function HouseholdTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { mode } = useTheme();
  const reduceMotion = useReduceMotion();
  const dock = useAskDockOptional();
  const pillX = useSharedValue(state.index);
  const trackW = useSharedValue(0);
  const shade = mode === 'night' ? shadow.night.tile : shadow.sunlit.tile;

  useEffect(() => {
    if (reduceMotion) pillX.value = state.index;
    else pillX.value = withSpring(state.index, spring);
  }, [state.index, reduceMotion, pillX]);

  const height = 56 + insets.bottom + 8;

  return (
    <View
      onLayout={(e) => dock?.setTabBarHeight(e.nativeEvent.layout.height)}
      style={[styles.bar, { backgroundColor: colors.bg, paddingBottom: insets.bottom, height }]}>
      <View
        style={[
          styles.pillTrack,
          {
            backgroundColor: colors.raised,
            borderColor: colors.line,
            shadowColor: shade.color,
            shadowOffset: shade.offset,
            shadowOpacity: shade.opacity,
            shadowRadius: shade.radius,
            elevation: shade.elevation,
          },
        ]}
        onLayout={(e) => {
          trackW.value = e.nativeEvent.layout.width;
        }}>
        <MovingPill indexSV={pillX} trackW={trackW} color={colors.accentDim} count={state.routes.length} />
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
    </View>
  );
}

function MovingPill({
  indexSV,
  trackW,
  color,
  count,
}: {
  indexSV: SharedValue<number>;
  trackW: SharedValue<number>;
  color: string;
  count: number;
}) {
  const style = useAnimatedStyle(() => {
    const w = count > 0 ? trackW.value / count : 0;
    return { width: w, transform: [{ translateX: indexSV.value * w }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.movingPill, { backgroundColor: color }, style]} />;
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
      <AppText variant="caption" tone={tone} style={{ fontFamily: font.medium, fontSize: 11 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    justifyContent: 'flex-start',
  },
  pillTrack: {
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  movingPill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 14,
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
