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

/**
 * Back-button box. Smaller than the 44pt minimum target on purpose — `hitSlop`
 * restores it — so the chevron sits tight to the title instead of floating in a
 * box that is mostly padding.
 */
const BACK_SIZE = 36;
/**
 * Pulls the glyph's ink onto the same 20pt grid the content below aligns to,
 * compensating for the box padding plus the Ionicons side bearing.
 */
const BACK_INSET = 10;
const BACK_GAP = space.xs;

export function ScreenHeader({
  title,
  back,
  right,
}: {
  title: string;
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
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        <AppText variant="screenTitle" numberOfLines={1} style={{ flexShrink: 1 }}>
          {title}
        </AppText>
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
  // chat.tsx floats the Home↔AI switch over the header and offsets its overlay
  // by this exact bottom margin — keep them in step.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginBottom: space.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: BACK_GAP,
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  backBtn: {
    width: BACK_SIZE,
    height: BACK_SIZE,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -BACK_INSET,
  },
});
