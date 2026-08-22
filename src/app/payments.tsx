import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/fin/Screen';
import { useColors } from '@/design/theme';
import { screenPad, space } from '@/design/tokens';
import { PaymentsSheetContent } from '@/features/home-sheets/content';

// Payments — pay anyone on the Stellar rail. The flow mirrors Move money:
// prepare → review server facts in the ConfirmSheet (biometric step-up) →
// execute with an idempotency key. The route version of the same content
// the Home sheet hosts.

export default function PaymentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + space.s }]}>
      <View style={{ paddingHorizontal: screenPad }}>
        <ScreenHeader title="Payments" back />
      </View>
      <PaymentsSheetContent presentation="screen" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});