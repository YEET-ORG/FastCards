import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { SecondaryButton } from '@/components/fin/Buttons';
import { Panel, ScreenHeader } from '@/components/fin/Screen';
import { useToast } from '@/components/fin/Toast';
import { AppText } from '@/design/AppText';
import { color, font, screenPad, space } from '@/design/tokens';
import { useDomain } from '@/domain/store';
import QRCode from '@/shared/ui/base/qr-code';

// Add funds — the real Stellar deposit rail: pool address + your memo
// (as a QR too). Pull to refresh runs a deposit sync; credited money
// appears in the balance and Activity.

interface Intent {
  network: string;
  address: string;
  memo: string;
  asset: string;
  rateInrPerUnit: number;
  note: string;
}

export default function DepositScreen() {
  const { headers } = useAuth();
  const { refresh } = useDomain();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [intent, setIntent] = useState<Intent | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api
      .depositIntent(headers)
      .then(setIntent)
      .catch((e) => toast(e instanceof ApiError ? e.message : 'Could not load deposit details.'));
  }, [headers, toast]);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await api.syncDeposits(headers);
      if (res.credited > 0) {
        toast(`${res.credited} deposit${res.credited > 1 ? 's' : ''} credited.`);
        await refresh();
      } else if (res.orderPayments > 0) {
        toast('Card-order payment received — awaiting admin review.');
      } else {
        toast('No new deposits yet.');
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Sync failed — try again.');
    } finally {
      setSyncing(false);
    }
  }, [headers, refresh, toast]);

  const copy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    toast(`${label} copied.`);
  };

  // QR payload: SEP-0007 pay URI so Stellar wallets prefill destination + memo.
  const qrValue = intent
    ? `web+stellar:pay?destination=${intent.address}&memo=${encodeURIComponent(intent.memo)}&memo_type=MEMO_TEXT`
    : '';

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.s }]}>
      <View style={{ paddingHorizontal: screenPad }}>
        <ScreenHeader title="Add funds" subtitle="Deposit on Stellar" back />
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void sync()} tintColor={color.mint} />}
        showsVerticalScrollIndicator={false}>
        {intent ? (
          <>
            <View style={styles.qrWrap}>
              <QRCode QRCodevalue={qrValue} />
            </View>

            <Panel style={{ gap: space.m }}>
              <Pressable onPress={() => void copy('Address', intent.address)} accessibilityRole="button">
                <AppText variant="label">Pool address · tap to copy</AppText>
                <AppText variant="secondary" tabular style={styles.monoText}>
                  {intent.address}
                </AppText>
              </Pressable>
              <Pressable onPress={() => void copy('Memo', intent.memo)} accessibilityRole="button">
                <AppText variant="label">Your memo · tap to copy · required</AppText>
                <AppText variant="cardTitle" tabular style={styles.monoText}>
                  {intent.memo}
                </AppText>
              </Pressable>
              <View style={styles.row}>
                <AppText variant="secondary" tone={color.textTertiary}>
                  Asset
                </AppText>
                <AppText variant="secondary" tabular>
                  {intent.asset} · Stellar {intent.network}
                </AppText>
              </View>
              <View style={styles.row}>
                <AppText variant="secondary" tone={color.textTertiary}>
                  Rate
                </AppText>
                <AppText variant="secondary" tabular>
                  ₹{intent.rateInrPerUnit} per {intent.asset}
                </AppText>
              </View>
            </Panel>

            <AppText variant="secondary" tone={color.textTertiary}>
              {intent.note}
            </AppText>

            <SecondaryButton label={syncing ? 'Checking…' : 'Check for deposits'} loading={syncing} onPress={() => void sync()} />
          </>
        ) : (
          <AppText variant="secondary" tone={color.textTertiary}>
            Loading deposit details…
          </AppText>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  scroll: { paddingHorizontal: screenPad, paddingBottom: 60, gap: space.xl },
  qrWrap: { alignItems: 'center', paddingVertical: space.s },
  monoText: { fontFamily: font.medium, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.m },
});
