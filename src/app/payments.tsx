import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, ApiError, type Receipt, type ServerPreparedAction } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { PrimaryButton } from '@/components/fin/Buttons';
import { ConfirmSheet } from '@/components/fin/ConfirmSheet';
import { SectionHeader } from '@/components/fin/primitives';
import { Segments } from '@/components/fin/Segments';
import { Panel, ScreenHeader } from '@/components/fin/Screen';
import { useToast } from '@/components/fin/Toast';
import { TransactionRow } from '@/components/fin/TransactionRow';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { font, radius, screenPad, space, type ColorTokens } from '@/design/tokens';
import { formatMoneyINR } from '@/domain/money';
import { useDomain } from '@/domain/store';

// Payments — pay anyone on the Stellar rail. The flow mirrors Move money:
// prepare → review server facts in the ConfirmSheet (biometric step-up) →
// execute with an idempotency key. Recipients are remembered locally after
// each successful payment; QR codes are SEP-0007 `web+stellar:pay` URIs.

interface SavedRecipient {
  address: string;
  at: string;
}

const RECIPIENTS_KEY = 'fastcards.payments.recipients.v1';
const RECIPIENTS_MAX = 8;

async function loadRecipients(): Promise<SavedRecipient[]> {
  try {
    const raw = await SecureStore.getItemAsync(RECIPIENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is SavedRecipient =>
        typeof r === 'object' && r !== null && typeof (r as SavedRecipient).address === 'string',
    );
  } catch {
    return [];
  }
}

async function rememberRecipient(address: string, current: SavedRecipient[]): Promise<SavedRecipient[]> {
  const next = [
    { address, at: new Date().toISOString() },
    ...current.filter((r) => r.address !== address),
  ].slice(0, RECIPIENTS_MAX);
  await SecureStore.setItemAsync(RECIPIENTS_KEY, JSON.stringify(next)).catch(() => undefined);
  return next;
}

/** Parse a SEP-0007 `web+stellar:pay` URI (as encoded in payment QRs). */
function parsePayUri(uri: string): { address?: string; amountUnits?: number } | null {
  if (!uri.startsWith('web+stellar:pay')) return null;
  const query = uri.slice(uri.indexOf('?') + 1);
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const key = decodeURIComponent(pair.slice(0, eq));
    const value = decodeURIComponent(pair.slice(eq + 1));
    params.set(key, value);
  }
  const address = params.get('destination');
  if (!address || !/^G[A-Z2-7]{55}$/.test(address)) return null;
  const amount = Number(params.get('amount'));
  return { address, amountUnits: Number.isFinite(amount) && amount > 0 ? amount : undefined };
}

export default function PaymentsScreen() {
  const { headers } = useAuth();
  const { state, refresh } = useDomain();
  const toast = useToast();
  const colors = useColors();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [mode, setMode] = useState(0); // 0 pay someone · 1 scan QR
  const [address, setAddress] = useState('');
  const [amountText, setAmountText] = useState('');
  const [recipients, setRecipients] = useState<SavedRecipient[]>([]);
  const [prepared, setPrepared] = useState<ServerPreparedAction | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const handledScan = useRef(false);

  useEffect(() => {
    void loadRecipients().then(setRecipients);
  }, []);

  // Re-arm the scanner each time the user enters the Scan segment.
  useEffect(() => {
    if (mode === 1) handledScan.current = false;
  }, [mode]);

  const amount = Number(amountText.replace(/[^0-9]/g, ''));
  const validAmount = Number.isFinite(amount) && amount > 0;
  const validAddress = /^G[A-Z2-7]{55}$/.test(address.trim());
  const canPrepare = validAmount && validAddress;

  const prepare = async () => {
    if (!canPrepare || preparing) return;
    setPreparing(true);
    try {
      const res = await api.prepareAction(headers, {
        kind: 'withdraw_crypto',
        amountInr: amount,
        toAddress: address.trim(),
      });
      setPrepared(res);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not prepare that payment.');
    } finally {
      setPreparing(false);
    }
  };

  const onBarcodeScanned = (result: BarcodeScanningResult) => {
    if (handledScan.current) return;
    const parsed = parsePayUri(result.data);
    if (!parsed?.address) {
      toast("That isn't a payment QR code.");
      return;
    }
    handledScan.current = true;
    setAddress(parsed.address);
    setReceipt(null);
    // The QR amount is in asset units; the deposit intent carries the
    // INR rate, so the amount field can be prefilled too.
    if (parsed.amountUnits) {
      api
        .depositIntent(headers)
        .then((intent) => {
          const inr = Math.round(parsed.amountUnits! * intent.rateInrPerUnit);
          if (inr > 0) setAmountText(String(inr));
        })
        .catch(() => undefined);
    }
    toast('Recipient prefilled from QR.');
    setMode(0);
  };

  const recent = state.transactions
    .filter((t) => t.category === 'Withdrawal')
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 4);

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.s }]}>
      <View style={{ paddingHorizontal: screenPad }}>
        <ScreenHeader title="Payments" back />
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <Segments labels={['Pay someone', 'Scan QR']} index={mode} onChange={setMode} />

        {receipt ? (
          <Panel style={{ gap: space.s, borderColor: colors.mintBorder }}>
            <View style={styles.successRow}>
              <View style={[styles.successIcon, { backgroundColor: colors.mintDim }]}>
                <Ionicons name="checkmark" size={18} color={colors.mint} />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <AppText variant="cardTitle">{receipt.title}</AppText>
                <AppText variant="secondary" tone={colors.textTertiary}>
                  Queued for treasury signing · track it in Activity
                </AppText>
              </View>
            </View>
            {receipt.rows.map((row) => (
              <View key={row.label} style={styles.row}>
                <AppText variant="secondary" tone={colors.textTertiary}>
                  {row.label}
                </AppText>
                <AppText variant="secondary" tabular style={{ flexShrink: 1, textAlign: 'right' }}>
                  {row.value}
                </AppText>
              </View>
            ))}
            <PrimaryButton label="New payment" onPress={() => setReceipt(null)} />
          </Panel>
        ) : null}

        {mode === 0 ? (
          <>
            <Panel style={{ gap: space.l }}>
              <View style={{ gap: space.s }}>
                <AppText variant="label">Pay to</AppText>
                {recipients.length > 0 ? (
                  <View style={styles.chipRow}>
                    {recipients.map((r) => (
                      <Pressable
                        key={r.address}
                        onPress={() => setAddress(r.address)}
                        accessibilityRole="button"
                        accessibilityLabel={`Recent recipient ${r.address}`}
                        style={({ pressed }) => [
                          styles.chip,
                          { backgroundColor: colors.cream, borderColor: colors.line },
                          pressed && { backgroundColor: colors.inset },
                        ]}>
                        <Ionicons name="person-outline" size={12} color={colors.textSecondary} />
                        <AppText variant="caption" tone={colors.textSecondary} style={styles.chipText}>
                          {r.address.slice(0, 6)}…{r.address.slice(-4)}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Stellar address (G…)"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.input}
                  accessibilityLabel="Recipient Stellar address"
                />
                {address.length > 0 && !validAddress ? (
                  <AppText variant="caption" tone={colors.warning}>
                    That doesn&apos;t look like a Stellar address yet.
                  </AppText>
                ) : null}
              </View>

              <View style={{ gap: space.s }}>
                <AppText variant="label">Amount</AppText>
                <TextInput
                  value={amountText}
                  onChangeText={setAmountText}
                  keyboardType="number-pad"
                  placeholder="₹ amount"
                  placeholderTextColor={colors.textTertiary}
                  style={[styles.input, { fontSize: 22 }]}
                  accessibilityLabel="Amount in rupees"
                />
              </View>

              <View style={styles.row}>
                <AppText variant="secondary" tone={colors.textTertiary}>
                  Available · paid out on-chain by the treasury
                </AppText>
                <AppText variant="secondary" tabular>
                  {formatMoneyINR(state.balances.personal)}
                </AppText>
              </View>

              <PrimaryButton
                label="Review payment"
                disabled={!canPrepare}
                loading={preparing}
                onPress={() => void prepare()}
              />
            </Panel>

            <AppText variant="secondary" tone={colors.textTertiary}>
              Payments can&apos;t be reversed. They&apos;re queued and signed by the treasury wallet, then confirmed
              on-chain — track them in Activity.
            </AppText>
          </>
        ) : (
          <View style={{ gap: space.xl }}>
            {!permission ? (
              <AppText variant="secondary" tone={colors.textTertiary}>
                Preparing camera…
              </AppText>
            ) : !permission.granted ? (
              <Panel style={{ gap: space.m, alignItems: 'center' }}>
                <Ionicons name="scan-outline" size={28} color={colors.textSecondary} />
                <AppText variant="body" style={{ textAlign: 'center' }}>
                  Allow camera access to scan payment QR codes.
                </AppText>
                {permission.canAskAgain ? (
                  <PrimaryButton label="Allow camera" onPress={() => void requestPermission()} />
                ) : (
                  <AppText variant="secondary" tone={colors.textTertiary} style={{ textAlign: 'center' }}>
                    Camera access is off — enable it in your device settings.
                  </AppText>
                )}
              </Panel>
            ) : (
              <View style={styles.scanner}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={onBarcodeScanned}
                />
                <View pointerEvents="none" style={styles.scanFrame} />
                <AppText variant="caption" tone="#FFFFFF" style={styles.scanHint}>
                  Point at a payment QR code
                </AppText>
              </View>
            )}
            <AppText variant="secondary" tone={colors.textTertiary}>
              Any web+stellar:pay QR code prefills the recipient and amount.
            </AppText>
          </View>
        )}

        <View style={{ gap: space.xs }}>
          <SectionHeader
            title="Recent payments"
            actionLabel="View all"
            onAction={() => router.push('/(tabs)/activity')}
          />
          {recent.length === 0 ? (
            <AppText variant="secondary" tone={colors.textTertiary}>
              Your payments will appear here.
            </AppText>
          ) : (
            recent.map((t) => (
              <TransactionRow
                key={t.id}
                txn={t}
                member={state.members.find((m) => m.id === t.memberId)}
                onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.id } })}
              />
            ))
          )}
        </View>
      </ScrollView>

      {prepared ? (
        <ConfirmSheet
          visible
          title="Review payment"
          subject={prepared.subject}
          facts={prepared.facts.map((f, i) => ({ ...f, emphasis: i === 0 }))}
          note={prepared.note}
          cta={prepared.cta}
          onConfirm={async () => {
            try {
              const res = await api.executeAction(headers, prepared.id, prepared.factsHash, `app-${prepared.id}`);
              setReceipt(res);
              setAmountText('');
              toast(`${res.title}.`);
              setRecipients(await rememberRecipient(address.trim(), recipients));
              await refresh();
            } catch (e) {
              toast(e instanceof ApiError ? e.message : 'The payment could not be sent.');
              throw e;
            }
          }}
          onClose={() => setPrepared(null)}
        />
      ) : null}
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
      marginTop: 6,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.m, flexWrap: 'wrap' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    chipText: { fontFamily: font.medium },
    scanner: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: radius.tile,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    scanFrame: {
      width: 220,
      height: 220,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: '#FFFFFF',
      opacity: 0.85,
    },
    scanHint: {
      position: 'absolute',
      bottom: space.m,
      textAlign: 'center',
      textShadowColor: 'rgba(0,0,0,0.6)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    successRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
    successIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}