import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { PrimaryButton, TextButton } from '@/components/fin/Buttons';
import { PaymentCardVisual } from '@/components/fin/PaymentCardVisual';
import { QuickAction, RuleChip, SectionHeader, StatusBadge } from '@/components/fin/primitives';
import { Panel, Screen, ScreenHeader } from '@/components/fin/Screen';
import { useToast } from '@/components/fin/Toast';
import { TransactionRow } from '@/components/fin/TransactionRow';
import { AppText } from '@/design/AppText';
import { color, font, radius, space } from '@/design/tokens';
import { formatMoney } from '@/domain/money';
import { useDomain } from '@/domain/store';

// Card Detail (spec §21-22, UI §10-11): an object control surface.
// Sensitive details live behind device biometrics and come from the
// card provider via the server (audited) — never inside AI chat. Destructive actions
// sit separated at the bottom with consequence copy.

export default function CardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useDomain();
  const { headers } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [reveal, setReveal] = useState<'hidden' | 'authenticating' | 'shown'>('hidden');
  const [sensitive, setSensitive] = useState<{ cardNumber?: string; expiry?: string; cvv?: string } | null>(null);

  const card = state.cards.find((c) => c.id === id);
  if (!card) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title="Card" back />
        <AppText variant="secondary">This card no longer exists.</AppText>
      </Screen>
    );
  }

  const member = card.memberId ? state.members.find((m) => m.id === card.memberId) : undefined;
  const frozen = card.status === 'frozen';
  const closed = card.status === 'closed';
  const effectiveCap =
    card.monthlyCap !== undefined ? card.monthlyCap + (member?.tempAllowance?.amount ?? 0) : undefined;
  const remaining = effectiveCap !== undefined ? effectiveCap - card.spentThisMonth : undefined;
  const cardTxns = state.transactions.filter((t) => t.cardId === card.id).slice(0, 5);

  const ruleChips: { label: string; state?: 'active' | 'off' | 'temporary' }[] = [];
  if (card.monthlyCap !== undefined)
    ruleChips.push({ label: `${formatMoney(card.monthlyCap)} / month` });
  if (card.approvalAbove !== undefined)
    ruleChips.push({ label: `Ask > ${formatMoney(card.approvalAbove)}` });
  ruleChips.push({ label: card.channels.online ? 'Online on' : 'Online off', state: card.channels.online ? 'active' : 'off' });
  ruleChips.push({ label: card.channels.atm ? 'ATM on' : 'ATM off', state: card.channels.atm ? 'active' : 'off' });
  if (member?.tempAllowance)
    ruleChips.push({ label: `+${formatMoney(member.tempAllowance.amount)} temp`, state: 'temporary' });

  const startReveal = async () => {
    if (closed) {
      Alert.alert('Card closed', 'Closed cards no longer have active credentials.');
      return;
    }
    setReveal('authenticating');
    try {
      // Step-up: real device biometric/passcode, then the credentials
      // come from the card provider via the server (audited there).
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());
      if (enrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: `Show ${card.nickname} details`,
        });
        if (!result.success) {
          setReveal('hidden');
          return;
        }
      }
      const details = await api.cardSensitive(headers, card.id);
      if (!details.available) {
        setReveal('hidden');
        Alert.alert('No credentials yet', details.reason ?? 'This card has no provider credentials.');
        return;
      }
      setSensitive(details);
      setReveal('shown');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setReveal('hidden');
      Alert.alert('Could not load details', 'Nothing was revealed. Try again.');
    }
  };

  const closeReveal = () => {
    setSensitive(null); // details never outlive the sheet
    setReveal('hidden');
  };

  return (
    <Screen>
      <ScreenHeader title={card.nickname} back />

      <View style={{ alignItems: 'center' }}>
        <PaymentCardVisual card={card} member={member} width={Math.min(width * 0.86, 380)} />
      </View>

      {/* Status row */}
      <View style={styles.statusRow}>
        <StatusBadge status={closed ? 'closed' : frozen ? 'frozen' : 'active'} />
        <View style={{ flex: 1 }} />
        {remaining !== undefined && !closed ? (
          <AppText variant="body" tabular>
            {formatMoney(Math.max(remaining, 0))}{' '}
            <AppText variant="secondary" tone={color.textTertiary}>
              left of {formatMoney(effectiveCap ?? 0)}
            </AppText>
          </AppText>
        ) : (
          <AppText variant="secondary" tone={color.textTertiary}>
            {closed ? `Spent ${formatMoney(card.spentThisMonth)}` : `Spent ${formatMoney(card.spentThisMonth)} this month`}
          </AppText>
        )}
      </View>

      {/* Core controls */}
      <View style={styles.quickRow}>
        <QuickAction
          icon={frozen ? 'sunny-outline' : 'snow-outline'}
          label={frozen ? 'Unfreeze' : 'Freeze'}
          onPress={() => {
            if (closed) {
              Alert.alert('Card closed', 'This card closed after use and cannot be reactivated.');
              return;
            }
            dispatch({ type: frozen ? 'unfreeze_card' : 'freeze_card', cardId: card.id });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            toast(`${card.nickname} is ${frozen ? 'active again' : 'frozen'}.`);
          }}
        />
        <QuickAction icon="eye-outline" label="Show details" onPress={() => void startReveal()} />
        <QuickAction
          icon="options-outline"
          label="Rules"
          onPress={() => router.push({ pathname: '/card-rules/[id]', params: { id: card.id } })}
        />
        <QuickAction
          icon="sparkles-outline"
          label="Ask AI"
          onPress={() => router.push({ pathname: '/chat', params: { member: card.memberId ?? '' } })}
        />
      </View>

      {/* Rules summary */}
      <View style={{ gap: space.m }}>
        <SectionHeader
          title="Spending controls"
          actionLabel="Edit"
          onAction={() => router.push({ pathname: '/card-rules/[id]', params: { id: card.id } })}
        />
        <View style={styles.chipWrap}>
          {ruleChips.map((c) => (
            <RuleChip key={c.label} label={c.label} state={c.state} />
          ))}
        </View>
      </View>

      {/* Activity */}
      <View>
        <SectionHeader title="Recent activity" />
        {cardTxns.length === 0 ? (
          <AppText variant="secondary" tone={color.textTertiary}>
            No activity on this card yet.
          </AppText>
        ) : (
          cardTxns.map((t) => (
            <TransactionRow
              key={t.id}
              txn={t}
              member={state.members.find((m) => m.id === t.memberId)}
              showMember={false}
              onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.id } })}
            />
          ))
        )}
      </View>

      {/* Destructive area — visually separated (spec UI §10, §50) */}
      <Panel style={styles.dangerPanel}>
        <Pressable
          onPress={() =>
            Alert.alert(
              'Report lost or stolen',
              'This permanently replaces the card credentials and ships a new card. It is different from a temporary freeze.\n\nThis flow lands in an upcoming milestone.',
            )
          }
          accessibilityRole="button"
          style={styles.dangerRow}>
          <AppText variant="body" tone={color.error}>
            Report lost or stolen
          </AppText>
        </Pressable>
        <View style={styles.dangerDivider} />
        <Pressable
          onPress={() =>
            Alert.alert(
              'Close card',
              'Closing is permanent. Recurring payments on this card will start failing.\n\nThis flow lands in an upcoming milestone.',
            )
          }
          accessibilityRole="button"
          style={styles.dangerRow}>
          <AppText variant="body" tone={color.error}>
            Close card
          </AppText>
        </Pressable>
      </Panel>

      {/* Sensitive details — distinct elevated surface (spec UI §11) */}
      <Modal
        visible={reveal !== 'hidden'}
        transparent
        animationType="slide"
        onRequestClose={closeReveal}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeReveal} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.l }]}>
            <View style={styles.grabber} />
            {reveal === 'authenticating' ? (
              <View style={{ alignItems: 'center', gap: space.l, paddingVertical: space.x32 }}>
                <AppText variant="section">Verify it's you</AppText>
                <AppText variant="secondary" tone={color.textTertiary}>
                  Confirming with Face ID…
                </AppText>
              </View>
            ) : (
              <View style={{ gap: space.l }}>
                <AppText variant="section">Card details</AppText>
                <View style={styles.credBox}>
                  {(
                    [
                      ['Cardholder', member?.name ?? '—'],
                      ['Number', sensitive?.cardNumber ?? '—'],
                      ['Expiry', sensitive?.expiry ?? '—'],
                      ['CVV', sensitive?.cvv ?? '—'],
                    ] as const
                  ).map(([label, value]) => (
                    <View key={label} style={styles.credRow}>
                      <AppText variant="secondary" tone={color.textTertiary}>
                        {label}
                      </AppText>
                      <AppText variant="body" tabular style={{ fontFamily: font.medium, letterSpacing: 1 }}>
                        {value}
                      </AppText>
                    </View>
                  ))}
                </View>
                <AppText variant="caption" tone={color.textTertiary}>
                  Served by the card provider; each view is audited. Details hide when you close this sheet and are
                  never shared with the AI assistant.
                </AppText>
                <PrimaryButton label="Done" onPress={closeReveal} />
              </View>
            )}
            {reveal === 'authenticating' ? (
              <TextButton label="Cancel" tone={color.textSecondary} onPress={closeReveal} />
            ) : null}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  quickRow: {
    flexDirection: 'row',
    gap: space.s,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.s,
  },
  dangerPanel: {
    padding: 0,
    borderColor: color.errorDim,
    marginTop: space.s,
  },
  dangerRow: {
    paddingHorizontal: space.l,
    paddingVertical: space.l,
  },
  dangerDivider: {
    height: 1,
    backgroundColor: color.borderSoft,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 4, 3, 0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: color.surface3,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space.xl,
    paddingTop: space.m,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.borderStrong,
    marginBottom: space.l,
  },
  credBox: {
    gap: 14,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.mintBorder,
    borderRadius: 16,
    padding: space.xl,
  },
  credRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
