import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/design/AppText';
import { color, screenPad, space } from '@/design/tokens';

// Global page anatomy (spec UI §1-2): Obsidian ground, safe-area aware
// header with at most three zones, 20-24pt section rhythm.

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
            <Ionicons name="chevron-back" size={22} color={color.textPrimary} />
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: color.surface2 }]}>
      <Ionicons name={icon} size={20} color={color.textPrimary} />
    </Pressable>
  );
}

export function Screen({
  children,
  scroll = true,
  padBottom = true,
  style,
}: React.PropsWithChildren<{ scroll?: boolean; padBottom?: boolean; style?: ViewStyle }>) {
  const insets = useSafeAreaInsets();
  const base: ViewStyle = {
    flex: 1,
    backgroundColor: color.bg,
    paddingTop: insets.top + space.s,
  };
  if (!scroll) {
    return <View style={[base, { paddingHorizontal: screenPad }, style]}>{children}</View>;
  }
  return (
    <View style={base}>
      <ScrollView
        contentContainerStyle={[
          {
            paddingHorizontal: screenPad,
            paddingBottom: padBottom ? insets.bottom + 96 : space.xl,
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

/** Standard surface container (spec UI §3, depth level 2). */
export function Panel({ children, style }: React.PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.panel, style]}>{children}</View>;
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
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: color.borderSoft,
    backgroundColor: color.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.borderSoft,
    borderRadius: 18,
    padding: space.l,
  },
});
