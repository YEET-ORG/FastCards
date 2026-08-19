import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEV_USERS, useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/fin/primitives';
import { AppText } from '@/design/AppText';
import { color, screenPad, space } from '@/design/tokens';

// Sign-in (spec UI §38): "Your money, one conversation away." Dev mode
// offers the seeded sessions; the Privy button is the live-login seam
// (needs the mobile client ID from the dashboard + a dev build).

export function SignInScreen() {
  const { signInDev } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.x40, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.hero}>
        <AppText variant="label" tone={color.mint}>
          FASTCARDS
        </AppText>
        <AppText variant="hero" style={{ fontSize: 38, lineHeight: 44 }}>
          Your money, one conversation away.
        </AppText>
        <AppText variant="secondary">
          Cards, family controls, global money and AI — in one place.
        </AppText>
      </View>

      <View style={{ gap: space.m }}>
        <AppText variant="label">Continue as (dev)</AppText>
        {DEV_USERS.map((u) => (
          <Pressable
            key={u.userId}
            onPress={() => signInDev(u.userId)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.userRow, pressed && { backgroundColor: color.surface2 }]}>
            <Avatar name={u.name} size={40} />
            <View style={{ flex: 1 }}>
              <AppText variant="cardTitle">{u.name}</AppText>
              <AppText variant="secondary" tone={color.textTertiary}>
                {u.role === 'owner' ? 'Household owner · platform admin' : 'Teen member'}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
          </Pressable>
        ))}

        <Pressable
          onPress={() =>
            Alert.alert(
              'Sign in with Privy',
              'Live login needs the Privy mobile client ID (Dashboard → App settings → Clients) and a dev build with @privy-io/expo. The backend is already verifying Privy tokens.',
            )
          }
          accessibilityRole="button"
          style={({ pressed }) => [styles.privyBtn, pressed && { opacity: 0.8 }]}>
          <Ionicons name="key-outline" size={17} color={color.onMint} />
          <AppText variant="cardTitle" tone={color.onMint}>
            Sign in with Privy
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
    paddingHorizontal: screenPad,
    justifyContent: 'space-between',
  },
  hero: {
    gap: space.m,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.borderSoft,
    borderRadius: 16,
    padding: space.l,
  },
  privyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
    backgroundColor: color.mint,
    borderRadius: 999,
    minHeight: 52,
    marginTop: space.s,
  },
});
