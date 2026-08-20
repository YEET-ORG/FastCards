import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';

/** Shown while a stored session (Privy or dev) is being restored at boot —
 * keeps the sign-in screen from flashing for already-logged-in users. */
export function RestoringScreen() {
  const colors = useColors();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <AppText variant="label" tone={colors.accentInk}>
        FASTCARDS
      </AppText>
      <ActivityIndicator color={colors.accent} />
      <AppText variant="secondary" tone={colors.textTertiary}>
        Restoring your session…
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.l,
  },
});
