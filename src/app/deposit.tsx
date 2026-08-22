import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { SecondaryButton } from '@/components/fin/Buttons';
import { Panel, ScreenHeader } from '@/components/fin/Screen';
import { useToast } from '@/components/fin/Toast';
import { AppText, type TextVariant } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { font, radius, screenPad, space, type ColorTokens } from '@/design/tokens';
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

// The intent is effectively constant per user — pool address, memo, asset and
// network never move, and only the rate does. Paying a network round trip on
// every open to re-fetch that is what made this screen feel slow, so it is
// cached and revalidated in the background instead.
const INTENT_KEY = 'fastcards.deposit.intent';

function isIntent(v: unknown): v is Intent {
  if (typeof v !== 'object' || v === null) return false;
  const i = v as Intent;
  return (
    typeof i.address === 'string' &&
    typeof i.memo === 'string' &&
    typeof i.asset === 'string' &&
    typeof i.network === 'string' &&
    typeof i.rateInrPerUnit === 'number' &&
    typeof i.note === 'string'
  );
}

/**
 * Survives navigation within a session, so a second visit paints the card on
 * its first frame — no async read, no spinner, no flicker.
 *
 * Keyed by user, and every read is gated on that id. The memo is what
 * attributes a deposit to a person, so showing a signed-out user's cached memo
 * to the next one would misattribute real money.
 */
let memCache: { userId: string; intent: Intent } | null = null;

async function readCachedIntent(userId: string): Promise<Intent | null> {
  try {
    const raw = await SecureStore.getItemAsync(`${INTENT_KEY}.${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isIntent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedIntent(userId: string, intent: Intent) {
  memCache = { userId, intent };
  void SecureStore.setItemAsync(`${INTENT_KEY}.${userId}`, JSON.stringify(intent)).catch(
    () => undefined,
  );
}

/**
 * A value that copies itself. The card shows values without labels, so the
 * accessibility label is the only thing naming what this is — it is not
 * optional here.
 */
function CopyValue({
  value,
  variant,
  a11yLabel,
  style,
}: {
  value: string;
  variant: TextVariant;
  a11yLabel: string;
  style?: TextStyle;
}) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Navigating back inside the confirmation window would otherwise set state
  // on an unmounted component.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onPress = useCallback(async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <Pressable
      onPress={() => void onPress()}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      style={({ pressed }) => [copyStyles.wrap, pressed && { opacity: 0.6 }]}>
      <AppText variant={variant} tabular style={style}>
        {value}
      </AppText>
      {/* Overlaid rather than swapped in: the address wraps to two lines, and
          replacing its text would reflow the whole card on every copy. */}
      {copied ? (
        <View style={copyStyles.slot} pointerEvents="none">
          <View style={[copyStyles.pill, { backgroundColor: colors.mintDim }]}>
            <Ionicons name="checkmark" size={12} color={colors.mintInk} />
            <AppText variant="caption" tone={colors.mintInk}>
              Copied
            </AppText>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const copyStyles = StyleSheet.create({
  wrap: { position: 'relative' },
  slot: { position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.s,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  mono: { fontFamily: font.medium },
});

export default function DepositScreen() {
  const { headers, session } = useAuth();
  const userId = session?.userId;
  const { refresh } = useDomain();
  const toast = useToast();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  // Lazy initialiser, so a repeat visit already has the card on its very first
  // render rather than after an effect.
  const [intent, setIntent] = useState<Intent | null>(() =>
    userId && memCache?.userId === userId ? memCache.intent : null,
  );
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read inside the fetch callback without making it a dependency: taking
  // `intent` there would rebuild `fetchIntent` on every load and re-fire the
  // effect that calls it.
  const intentRef = useRef(intent);
  useEffect(() => {
    intentRef.current = intent;
  }, [intent]);

  // Held in state as well as toasted: a toast disappears, and without it the
  // screen had no way to show the failure or to recover from it — a failed
  // load left the loading state up forever.
  const fetchIntent = useCallback(() => {
    api
      .depositIntent(headers)
      .then((next) => {
        setIntent(next);
        if (userId) writeCachedIntent(userId, next);
      })
      .catch((e) => {
        const msg = e instanceof ApiError ? e.message : 'Could not load deposit details.';
        // Stale details beat an error screen: only take over the screen when
        // there is nothing on it to keep.
        if (!intentRef.current) setError(msg);
        toast(msg);
      });
  }, [headers, toast, userId]);

  // Cold start. The persisted copy lands a frame or two in, well ahead of the
  // network, and defers to anything already on screen.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void readCachedIntent(userId).then((cached) => {
      if (cancelled || !cached) return;
      if (!memCache || memCache.userId !== userId) memCache = { userId, intent: cached };
      setIntent((cur) => cur ?? cached);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    fetchIntent();
  }, [fetchIntent]);

  // Clearing the error belongs to the retry gesture, not to the fetch — doing
  // it inside `fetchIntent` meant the mount effect set state synchronously.
  const retry = useCallback(() => {
    setError(null);
    fetchIntent();
  }, [fetchIntent]);

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

  // QR payload: SEP-0007 pay URI so Stellar wallets prefill destination + memo.
  const qrValue = intent
    ? `web+stellar:pay?destination=${intent.address}&memo=${encodeURIComponent(intent.memo)}&memo_type=MEMO_TEXT`
    : '';

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.s }]}>
      <View style={{ paddingHorizontal: screenPad }}>
        <ScreenHeader title="Add funds" back />
      </View>
      {/* The loading and error states replace the ScrollView rather than
          sitting inside it: as its first child they rendered flush under the
          header, and there is nothing to scroll or pull-to-sync until the
          intent lands. */}
      {intent ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void sync()} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}>
          <View style={styles.qrWrap}>
            <QRCode QRCodevalue={qrValue} />
          </View>

          {/* Values only, no labels. The note below the card carries the one
              instruction that matters — that the memo is what attributes the
              deposit. */}
          <Panel style={{ gap: space.m }}>
            <CopyValue
              value={intent.memo}
              variant="cardTitle"
              style={copyStyles.mono}
              a11yLabel={`Memo ${intent.memo}. Double tap to copy.`}
            />
            <CopyValue
              value={intent.address}
              variant="secondary"
              style={copyStyles.mono}
              a11yLabel={`Deposit address ${intent.address}. Double tap to copy.`}
            />
            <View style={styles.row}>
              <AppText variant="secondary" tone={colors.textTertiary}>
                Asset
              </AppText>
              <AppText variant="secondary" tabular>
                {intent.asset} · Stellar {intent.network}
              </AppText>
            </View>
            <View style={styles.row}>
              <AppText variant="secondary" tone={colors.textTertiary}>
                Rate
              </AppText>
              <AppText variant="secondary" tabular>
                ₹{intent.rateInrPerUnit} per {intent.asset}
              </AppText>
            </View>
          </Panel>

          <AppText variant="secondary" tone={colors.textTertiary}>
            {intent.note}
          </AppText>

          <SecondaryButton label={syncing ? 'Checking…' : 'Check for deposits'} loading={syncing} onPress={() => void sync()} />
        </ScrollView>
      ) : (
        <View style={styles.centerState}>
          {error ? (
            <>
              <Ionicons name="alert-circle-outline" size={28} color={colors.textTertiary} />
              <AppText variant="secondary" tone={colors.textTertiary} style={styles.centerText}>
                {error}
              </AppText>
              <SecondaryButton label="Try again" onPress={retry} />
            </>
          ) : (
            <>
              <ActivityIndicator color={colors.accent} />
              <AppText variant="secondary" tone={colors.textTertiary}>
                Loading deposit details…
              </AppText>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: screenPad, paddingBottom: 60, gap: space.xl },
  qrWrap: { alignItems: 'center', paddingVertical: space.s },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.l,
    paddingHorizontal: screenPad,
  },
  centerText: { textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.m },
});
}

