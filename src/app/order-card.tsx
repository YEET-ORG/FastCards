import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { PrimaryButton, SecondaryButton } from '@/components/fin/Buttons';
import { StatusBadge, type BadgeStatus } from '@/components/fin/primitives';
import { Segments } from '@/components/fin/Segments';
import { Panel, ScreenHeader } from '@/components/fin/Screen';
import { useToast } from '@/components/fin/Toast';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { font, radius, screenPad, space, type ColorTokens } from '@/design/tokens';
import QRCode from '@/shared/ui/base/qr-code';

// Get a card — the real purchase pipeline: KYC → order → pay the Stellar
// pool with the order memo → admin reviews and issues. This screen walks
// all of it and tracks existing orders.

type Kyc = 'none' | 'pending' | 'approved';

interface Order {
  id: string;
  nickname: string;
  card_type: string;
  status: string;
  price_inr: number;
  expected_units: number;
  memo: string;
  review_note: string | null;
}

interface Payment {
  address: string;
  memo: string;
  asset: string;
  amountUnits: number;
  note: string;
  network: string;
}

const badgeFor = (status: string): BadgeStatus =>
  status === 'issued' ? 'active' : status === 'paid' ? 'approval' : status === 'rejected' ? 'declined' : 'pending';

export default function OrderCardScreen() {
  const { headers } = useAuth();
  const toast = useToast();
  const colors = useColors();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();

  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // KYC form
  const [fullName, setFullName] = useState('');
  const [document, setDocument] = useState('');
  // Order form
  const [cardTypeIndex, setCardTypeIndex] = useState(0);
  const [nickname, setNickname] = useState('');
  const [payment, setPayment] = useState<Payment | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const [k, o] = await Promise.all([api.kycStatus(headers), api.myOrders(headers)]);
      setKyc(k.status);
      setOrders(o as Order[]);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not load your orders.');
    } finally {
      setLoading(false);
    }
  }, [headers, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitKyc = async () => {
    if (fullName.trim().length < 2 || document.trim().length < 4) {
      return toast('Enter your full name and an ID document reference.');
    }
    setWorking(true);
    try {
      await api.submitKyc(headers, fullName.trim(), document.trim());
      toast('KYC submitted — an admin will review it.');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'KYC submission failed.');
    } finally {
      setWorking(false);
    }
  };

  const placeOrder = async () => {
    if (nickname.trim().length < 2) return toast('Give the card a name.');
    setWorking(true);
    try {
      const res = await api.createCardOrder(headers, {
        cardType: (['personal', 'purpose'] as const)[cardTypeIndex],
        nickname: nickname.trim(),
      });
      setPayment(res.payment);
      setNickname('');
      toast(`Order placed — pay ${res.payment.amountUnits} ${res.payment.asset} to continue.`);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not place the order.');
    } finally {
      setWorking(false);
    }
  };

  const copy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    toast(`${label} copied.`);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.s }]}>
      <View style={{ paddingHorizontal: screenPad }}>
        <ScreenHeader title="Get a card" subtitle="Pay in crypto · issued after review" back />
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {/* KYC gate */}
        {kyc === 'none' ? (
          <Panel style={{ gap: space.m }}>
            <AppText variant="section">Verify your identity</AppText>
            <AppText variant="secondary" tone={colors.textTertiary}>
              One-time KYC before your first card. An admin reviews it.
            </AppText>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Full legal name"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              accessibilityLabel="Full legal name"
            />
            <TextInput
              value={document}
              onChangeText={setDocument}
              placeholder="ID document reference (e.g. Aadhaar last 4)"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              accessibilityLabel="ID document reference"
            />
            <PrimaryButton label="Submit KYC" loading={working} onPress={() => void submitKyc()} />
          </Panel>
        ) : kyc === 'pending' ? (
          <Panel style={{ gap: space.s }}>
            <StatusBadge status="pending" label="KYC under review" />
            <AppText variant="secondary" tone={colors.textTertiary}>
              You can order a card as soon as an admin approves your KYC.
            </AppText>
          </Panel>
        ) : kyc === 'approved' ? (
          <Panel style={{ gap: space.l }}>
            <AppText variant="section">Order a card</AppText>
            <Segments labels={['Personal', 'Purpose']} index={cardTypeIndex} onChange={setCardTypeIndex} />
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="Card name, e.g. Shopping"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              accessibilityLabel="Card name"
            />
            <PrimaryButton label="Place order" loading={working} onPress={() => void placeOrder()} />
          </Panel>
        ) : null}

        {/* Payment instructions for the freshest order */}
        {payment ? (
          <Panel style={{ gap: space.m, borderColor: colors.mintBorder }}>
            <AppText variant="section">Pay to continue</AppText>
            <View style={{ alignItems: 'center' }}>
              <QRCode
                QRCodevalue={`web+stellar:pay?destination=${payment.address}&amount=${payment.amountUnits}&memo=${encodeURIComponent(payment.memo)}&memo_type=MEMO_TEXT`}
              />
            </View>
            <Pressable onPress={() => void copy('Address', payment.address)} accessibilityRole="button">
              <AppText variant="label">Address · tap to copy</AppText>
              <AppText variant="secondary" tabular style={styles.mono}>
                {payment.address}
              </AppText>
            </Pressable>
            <View style={styles.row}>
              <Pressable onPress={() => void copy('Memo', payment.memo)} accessibilityRole="button" style={{ flex: 1 }}>
                <AppText variant="label">Memo · required</AppText>
                <AppText variant="cardTitle" tabular>
                  {payment.memo}
                </AppText>
              </Pressable>
              <View>
                <AppText variant="label">Amount</AppText>
                <AppText variant="cardTitle" tabular>
                  {payment.amountUnits} {payment.asset}
                </AppText>
              </View>
            </View>
            <SecondaryButton
              label="I've paid — check now"
              onPress={() =>
                void api
                  .syncDeposits(headers)
                  .then((r) =>
                    r.orderPayments > 0 ? (toast('Payment received — awaiting admin approval.'), load()) : toast('Not seen yet — payments can take a minute.'),
                  )
                  .catch(() => toast('Could not check right now.'))
              }
            />
          </Panel>
        ) : null}

        {/* Existing orders */}
        <View style={{ gap: space.m }}>
          <AppText variant="section">Your orders</AppText>
          {orders.length === 0 ? (
            <AppText variant="secondary" tone={colors.textTertiary}>
              No orders yet.
            </AppText>
          ) : (
            orders.map((o) => (
              <Panel key={o.id} style={styles.orderRow}>
                <View style={{ flex: 1 }}>
                  <AppText variant="cardTitle">{o.nickname}</AppText>
                  <AppText variant="caption" tone={colors.textTertiary}>
                    ₹{o.price_inr.toLocaleString('en-IN')} · {o.expected_units} units · {o.memo}
                  </AppText>
                  {o.review_note ? (
                    <AppText variant="caption" tone={colors.warning}>
                      {o.review_note}
                    </AppText>
                  ) : null}
                </View>
                <StatusBadge status={badgeFor(o.status)} label={o.status.replaceAll('_', ' ')} />
              </Panel>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: screenPad, paddingBottom: 60, gap: space.xl },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.control,
    color: colors.textPrimary,
    fontFamily: font.medium,
    fontSize: 15,
    paddingHorizontal: space.l,
    paddingVertical: 12,
  },
  mono: { fontFamily: font.medium, marginTop: 4 },
  row: { flexDirection: 'row', gap: space.l, alignItems: 'flex-start' },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
});
}

