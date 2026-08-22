import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/fin/Screen';
import { useColors } from '@/design/theme';
import { screenPad, space } from '@/design/tokens';
import { DepositSheetContent } from '@/features/home-sheets/content';

// Add funds — the real Stellar deposit rail: pool address + your memo
// (as a QR too). The route version of the same content the Home sheet hosts.

export default function DepositScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + space.s }]}>
      <View style={{ paddingHorizontal: screenPad }}>
        <ScreenHeader title="Add funds" back />
      </View>
      <DepositSheetContent presentation="screen" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});