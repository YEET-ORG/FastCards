import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/fin/primitives';
import { Panel, Screen, ScreenHeader } from '@/components/fin/Screen';
import { AppText } from '@/design/AppText';
import { useColors, useTheme } from '@/design/theme';
import { font, space } from '@/design/tokens';
import { AnimatedThemeToggle } from '@/shared/ui/micro-interactions/animated-theme-toggle';

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const { mode, toggleMode } = useTheme();
  const colors = useColors();
  const router = useRouter();
  const hue = colors.member.rohan;

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

      <Panel style={styles.rowPanel}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="cardTitle">Appearance</AppText>
          <AppText variant="secondary" tone={colors.textTertiary}>
            {mode === 'night' ? 'Night' : 'Sunlit'}
          </AppText>
        </View>
        <View
          accessible
          accessibilityRole="switch"
          accessibilityLabel="Night mode"
          accessibilityState={{ checked: mode === 'night' }}>
          <AnimatedThemeToggle
            isDark={mode === 'night'}
            onToggle={toggleMode}
            size={28}
            duration={220}
            color={colors.textPrimary}
            strokeWidth={2}
            style={styles.toggleHit}
          />
        </View>
      </Panel>

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
  rowPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
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
