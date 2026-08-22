import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/fin/Screen';
import { useColors } from '@/design/theme';
import { screenPad, space } from '@/design/tokens';
import { TransferSheetContent } from '@/features/home-sheets/content';

// Move money — real gateway flows: internal transfers between the
// personal balance and the family pool, and crypto withdrawals to a
// Stellar address (queued for the treasury, paid on-chain). Both go
// PREPARE → review server facts → step-up → EXECUTE. The route version
// of the same content the Home sheet hosts.

export default function MoveMoneyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + space.s }]}>
      <View style={{ paddingHorizontal: screenPad }}>
        <ScreenHeader title="Move money" back />
      </View>
      <TransferSheetContent presentation="screen" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});