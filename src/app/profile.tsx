import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useAuth } from '@/auth/AuthContext';
import { Avatar, PressableSurface } from '@/components/fin/primitives';
import { Panel, Screen, ScreenHeader } from '@/components/fin/Screen';
import { AppText } from '@/design/AppText';
import { useColors, useTheme } from '@/design/theme';
import { font, radius, space, type ThemeName } from '@/design/tokens';
import { useDomain } from '@/domain/store';
import { AnimatedThemeToggle } from '@/shared/ui/micro-interactions/animated-theme-toggle';

const MODE_LABELS: Record<ThemeName, string> = {
  white: 'White',
  black: 'Black',
};

/** Stiffer than the shared `spring` so the dip settles inside the morph. */
const GLYPH_SPRING = { damping: 18, stiffness: 420, mass: 0.6 };

/**
 * The sun/moon glyph. `AnimatedThemeToggle` morphs one into the other by
 * retracting and redrawing the SVG paths; the surrounding spring gives the
 * tap a physical beat. Pointer events are off so the whole row owns the
 * gesture — one handler, one interaction.
 */
function ThemeGlyph({
  mode,
  color,
  reduceMotion,
  onToggle,
}: {
  mode: ThemeName;
  color: string;
  reduceMotion: boolean;
  onToggle: () => void;
}) {
  const scale = useSharedValue(1);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (reduceMotion) return;
    scale.value = withSequence(
      withTiming(0.86, { duration: 60, easing: Easing.out(Easing.quad) }),
      withSpring(1, GLYPH_SPRING),
    );
  }, [mode, reduceMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View pointerEvents="none" style={[styles.toggleHit, animatedStyle]}>
      <AnimatedThemeToggle
        isDark={mode === 'black'}
        onToggle={onToggle}
        size={28}
        // The palette now flips on the tap frame, so the morph is the only
        // thing still moving — keep it short enough to read as the same beat.
        duration={reduceMotion ? 0 : 220}
        color={color}
        strokeWidth={2}
      />
    </Animated.View>
  );
}

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const { state } = useDomain();
  const { mode, toggleMode, reduceMotion } = useTheme();
  const colors = useColors();
  const router = useRouter();
  const profileMember = session?.userId
    ? state.members.find((m) => m.id === session.userId)
    : undefined;
  const hue = colors.member[profileMember?.hueId ?? 'custom'];
  const nextLabel = MODE_LABELS[mode === 'black' ? 'white' : 'black'];

  return (
    <Screen>
      <ScreenHeader title="Profile" back />

      <Panel style={styles.card}>
        <Avatar
          name={session?.name ?? '?'}
          size={56}
          backgroundColor={hue.dim}
          textColor={hue.ink}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="section">{session?.name ?? 'You'}</AppText>
          <AppText variant="secondary" tone={colors.textTertiary}>
            {session?.isAdmin ? 'Household owner · platform admin' : session?.role ?? 'Member'}
          </AppText>
        </View>
      </Panel>

      <PressableSurface
        onPress={toggleMode}
        style={[styles.rowPanel, { backgroundColor: colors.cream }]}
        accessibilityRole="switch"
        accessibilityLabel="Theme"
        accessibilityHint={`Switches to ${nextLabel}`}
        accessibilityState={{ checked: mode === 'black' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="cardTitle">Theme</AppText>
          <AppText variant="secondary" tone={colors.textTertiary}>
            {MODE_LABELS[mode]}
          </AppText>
        </View>
        <ThemeGlyph
          mode={mode}
          color={colors.textPrimary}
          reduceMotion={reduceMotion}
          onToggle={toggleMode}
        />
      </PressableSurface>

      {session?.isAdmin ? (
        <Pressable
          onPress={() => router.push('/admin')}
          accessibilityRole="button"
          accessibilityLabel="Admin console"
          style={({ pressed }) => [styles.navRow, { backgroundColor: colors.cream, borderColor: colors.line }, pressed && { backgroundColor: colors.inset }]}>
          <Ionicons name="shield-outline" size={18} color={colors.textSecondary} />
          <AppText variant="body" style={{ flex: 1 }}>
            Admin console
          </AppText>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </Pressable>
      ) : null}

      <Pressable
        onPress={signOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}>
        <AppText variant="body" tone={colors.errorInk} style={{ fontFamily: font.medium }}>
          Sign out
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.l,
  },
  // Matches Panel's surface treatment — PressableSurface owns the shadow, so
  // only the fill, radius and padding are repeated here.
  rowPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    borderRadius: radius.card,
    padding: space.l,
  },
  toggleHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: space.l,
    paddingVertical: space.l,
    minHeight: 56,
  },
  signOut: {
    alignItems: 'center',
    paddingVertical: space.l,
    minHeight: 50,
    marginTop: space.x32,
  },
});
