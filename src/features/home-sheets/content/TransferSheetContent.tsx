import { memo, useState, type RefObject } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { api, ApiError, type ServerPreparedAction } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { PrimaryButton } from '@/components/fin/Buttons';
import { ConfirmSheet } from '@/components/fin/ConfirmSheet';
import { Segments } from '@/components/fin/Segments';
import { Panel } from '@/components/fin/Screen';
import { useToast } from '@/components/fin/Toast';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { font, radius, screenPad, space, type ColorTokens } from '@/design/tokens';
import { formatMoneyINR } from '@/domain/money';
import { useDomain } from '@/domain/store';

import type { SheetScreenProps } from './types';

// Move money — real gateway flows: internal transfers between the
// personal balance and the family pool, and crypto withdrawals to a
// Stellar address (queued for the treasury, paid on-chain). Both go
// PREPARE → review server facts → step-up → EXECUTE.

function TransferContentInner({
  presentation = 'screen',
  scrollOffsetOut,
  scrollRef,
}: SheetScreenProps) {
  const { headers } = useAuth();
  const { state, refresh } = useDomain();
  const toast = useToast();
  const colors = useColors();
  const styles = makeStyles(colors);

  const [mode, setMode] = useState(0); // 0 transfer · 1 withdraw
  const [direction, setDirection] = useState(0); // 0 personal→family · 1 family→personal
  const [amountText, setAmountText] = useState('');
  const [address, setAddress] = useState('');
  const [prepared, setPrepared] = useState<ServerPreparedAction | null>(null);
  const [preparing, setPreparing] = useState(false);

  const amount = Number(amountText.replace(/[^0-9]/g, ''));
  const validAmount = Number.isFinite(amount) && amount > 0;
  const validAddress = /^G[A-Z2-7]{55}$/.test(address.trim());
  const canPrepare = validAmount && (mode === 0 || validAddress);

  const prepare = async () => {
    if (!canPrepare || preparing) return;
    setPreparing(true);
    try {
      const intent =
        mode === 0
          ? {
              kind: 'transfer',
              from: direction === 0 ? 'personal' : 'family',
              to: direction === 0 ? 'family' : 'personal',
              amount,
            }
          : { kind: 'withdraw_crypto', amountInr: amount, toAddress: address.trim() };
      setPrepared(await api.prepareAction(headers, intent));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not prepare that.');
    } finally {
      setPreparing(false);
    }
  };

  // `scrollOffsetOut` is written from a plain JS handler (not
  // `useAnimatedScrollHandler`, which returns a handler object only usable
  // with reanimated's `Animated.ScrollView`) so the gesture-handler ScrollView
  // keeps `RefreshControl`.
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    scrollOffsetOut?.set(offsetY);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef as RefObject<ScrollView | null>}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}>
        <Segments dense labels={['Between balances', 'Withdraw crypto']} index={mode} onChange={setMode} />

        <Panel style={{ gap: space.l }}>
          {mode === 0 ? (
            <>
              <Segments
                dense
                labels={['Personal → Family', 'Family → Personal']}
                index={direction}
                onChange={setDirection}
              />
              <View style={styles.row}>
                <AppText variant="secondary" tone={colors.textTertiary}>
                  Available
                </AppText>
                <AppText variant="secondary" tabular>
                  {formatMoneyINR(direction === 0 ? state.balances.personal : state.balances.family)}
                </AppText>
              </View>
            </>
          ) : (
            <>
              <View>
                <AppText variant="label">Stellar address</AppText>
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  placeholder="G…"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.input}
                  accessibilityLabel="Destination Stellar address"
                />
                {address.length > 0 && !validAddress ? (
                  <AppText variant="caption" tone={colors.warning}>
                    That doesn&apos;t look like a Stellar address yet.
                  </AppText>
                ) : null}
              </View>
              <View style={styles.row}>
                <AppText variant="secondary" tone={colors.textTertiary}>
                  Available · paid out on-chain by the treasury
                </AppText>
                <AppText variant="secondary" tabular>
                  {formatMoneyINR(state.balances.personal)}
                </AppText>
              </View>
            </>
          )}

          <View>
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

          <PrimaryButton
            label={mode === 0 ? 'Review transfer' : 'Review withdrawal'}
            disabled={!canPrepare}
            loading={preparing}
            onPress={() => void prepare()}
          />
        </Panel>

        {mode === 1 ? (
          <AppText variant="secondary" tone={colors.textTertiary}>
            Crypto transfers are irreversible. Withdrawals are queued and signed by the treasury
            wallet, then confirmed on-chain — track them in Activity.
          </AppText>
        ) : null}
      </ScrollView>

      {prepared ? (
        <ConfirmSheet
          visible
          title="Review"
          subject={prepared.subject}
          facts={prepared.facts.map((f, i) => ({ ...f, emphasis: i === 0 }))}
          note={prepared.note}
          cta={prepared.cta}
          onConfirm={async () => {
            const receipt = await api.executeAction(
              headers,
              prepared.id,
              prepared.factsHash,
              `app-${prepared.id}`,
            );
            toast(`${receipt.title}.`);
            setAmountText('');
            await refresh();
          }}
          onClose={() => setPrepared(null)}
        />
      ) : null}
    </View>
  );
}

/**
 * `memo()`'d: `blocksExternalGesture(scrollRef)` excludes the sheet from React
 * Compiler memoization, so without it every sheet-local state change
 * re-renders the whole hosted screen.
 */
export const TransferSheetContent = memo(TransferContentInner);

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingHorizontal: screenPad, paddingBottom: 60, gap: space.xl },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.m, flexWrap: 'wrap' },
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
  });
}