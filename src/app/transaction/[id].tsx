import { useLocalSearchParams } from 'expo-router';

import { Screen, ScreenHeader } from '@/components/fin/Screen';
import { TransactionDetailSheetContent } from '@/features/home-sheets/content';

// Transaction Detail (spec §31, UI §24): only fields that exist, the rule
// or approval that shaped the transaction, and an Ask AI shortcut that
// carries context. The route version of the same content the Home sheet
// hosts; deep links still land here.

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen>
      <ScreenHeader title="Transaction" back />
      <TransactionDetailSheetContent presentation="screen" txnId={id} />
    </Screen>
  );
}