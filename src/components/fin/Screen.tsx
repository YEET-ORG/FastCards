import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, type RefObject } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAskDockOptional } from '@/components/ask/AskDockContext';
import { PressableSurface } from '@/components/fin/primitives';
import { AppText } from '@/design/AppText';
import { useColors, useDepth } from '@/design/theme';
import { radius, screenPad, space } from '@/design/tokens';

export function ScreenHeader({
  title,
  subtitle,
  back,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const colors = useColors();
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {back ? (
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        <View style={{ flexShrink: 1 }}>
          <AppText variant="screenTitle" numberOfLines={1}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="secondary" style={{ marginTop: 2 }}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

export function HeaderIconButton({
  icon,
  label,
  onPress,
  size = 44,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  size?: number;
}) {
  const colors = useColors();
  return (
    <PressableSurface
      level="raise1"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        { backgroundColor: colors.raised },
      ]}>
      <Ionicons name={icon} size={size <= 40 ? 19 : 20} color={colors.iconPrimary} />
    </PressableSurface>
  );
}

export function Screen({
  children,
  scroll = true,
  padBottom = true,
  style,
  onScrollDirection,
  scrollToTopRef,
}: React.PropsWithChildren<{
  scroll?: boolean;
  padBottom?: boolean;
  style?: ViewStyle;
  onScrollDirection?: (dir: 'up' | 'down') => void;
  scrollToTopRef?: RefObject<ScrollView | null>;
}>) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const dock = useAskDockOptional();
  const lastY = useRef(0);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!onScrollDirection) return;
      const y = e.nativeEvent.contentOffset.y;
      if (y < 0) {
        lastY.current = 0;
        return;
      }
      const dy = y - lastY.current;
      if (dy > 12) onScrollDirection('down');
      else if (dy < -12) onScrollDirection('up');
      lastY.current = y;
    },
    [onScrollDirection],
  );

  const base: ViewStyle = {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: insets.top + space.s,
  };
  if (!scroll) {
    return <View style={[base, { paddingHorizontal: screenPad }, style]}>{children}</View>;
  }
  return (
    <View style={base}>
      <ScrollView
        ref={scrollToTopRef}
        scrollEventThrottle={16}
        onScroll={onScroll}
        contentContainerStyle={[
          {
            paddingHorizontal: screenPad,
            // Measured nav height, not a fixed constant — see AskDockContext.
            paddingBottom: padBottom ? (dock?.tabBarHeight ?? space.dockClearance) + space.l : space.xl,
            gap: space.xl,
          },
          style,
        ]}
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

export function Panel({ children, style }: React.PropsWithChildren<{ style?: ViewStyle }>) {
  const colors = useColors();
  const shade = useDepth('raise2');
  // No border: the shadow does the separating. A 1px line on top of a soft
  // shadow is what makes a surface read as flat rather than raised.
  const panelStyle = useMemo(
    () => ({
      backgroundColor: colors.cream,
      borderRadius: radius.card,
      padding: space.l,
      boxShadow: shade,
    }),
    [colors, shade],
  );
  return <View style={[panelStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    marginBottom: space.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
});
