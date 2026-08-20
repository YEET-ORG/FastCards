import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { color, space } from '@/design/tokens';

/** Shown while a stored session (Privy or dev) is being restored at boot —
 * keeps the sign-in screen from flashing for already-logged-in users. */
export function RestoringScreen() {
  return (
    <View style={styles.root}>
      <AppText variant="label" tone={color.mint}>
        FASTCARDS
      </AppText>
      <ActivityIndicator color={color.mint} />
      <AppText variant="secondary" tone={color.textTertiary}>
        Restoring your session…
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.l,
  },
});
