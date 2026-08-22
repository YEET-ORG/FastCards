import { useEffect } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { ChatFonts } from '@/constants/ai-ui';
import { useColors } from '@/design/theme';
import type { CardLifecycle } from '@/store/chatStore';

/**
 * Card shell (AI_CHAT_UI_UX_SPEC §12.4): surfaceCard fill, borderStrong edge,
 * tiered padding by width, and a right-aligned lifecycle badge. Entrance:
 * translateY 8→0, opacity 0→1, both withSpring({ damping: 24, stiffness: 240 }).
 */

function lifecycleLabel(lifecycle: CardLifecycle | undefined): string {
  switch (lifecycle) {
    case 'loading':
      return 'Loading';
    case 'streaming':
      return 'Updating';
    case 'stale':
      return 'Expired';
    case 'error':
      return 'Error';
    case 'empty':
      return 'No data';
    default:
      return '';
  }
}

function paddingForCardWidth(cardWidth: number): number {
  if (cardWidth < 320) return 12;
  if (cardWidth < 460) return 16;
  return 20;
}

export function CardShell({
  lifecycle,
  cardWidth,
  children,
  style,
}: {
  lifecycle?: CardLifecycle;
  cardWidth: number;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const colors = useColors();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(1, { damping: 24, stiffness: 240 });
  }, [progress]);

  const entrance = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: 8 * (1 - progress.value) }],
  }));

  const label = lifecycleLabel(lifecycle);

  return (
    <Animated.View
      style={[
        styles.shell,
        {
          backgroundColor: colors.surfaceCard,
          borderColor: colors.lineStrong,
          padding: paddingForCardWidth(cardWidth),
          shadowColor: '#000',
        },
        entrance,
        style,
      ]}>
      {label ? (
        <Text style={[styles.badge, { color: colors.textMuted }]}>{label}</Text>
      ) : null}
      {children}
    </Animated.View>
  );
}

export function CardSkeleton({ rows = 4 }: { rows?: number }) {
  const colors = useColors();
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={[styles.skeletonRow, { backgroundColor: colors.inset, opacity: 1 - (i % 2) * 0.35 }]}
        />
      ))}
    </View>
  );
}

export function CardEmpty({
  icon,
  title,
  message,
}: {
  icon?: React.ReactNode;
  title: string;
  message?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      {icon}
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{title}</Text>
      {message ? (
        <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 5,
  },
  badge: {
    fontSize: 10,
    fontFamily: ChatFonts.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  skeletonRow: {
    height: 14,
    borderRadius: 6,
  },
  empty: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: ChatFonts.semiBold,
  },
  emptyMessage: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: ChatFonts.regular,
    textAlign: 'center',
  },
});