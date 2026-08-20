import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { SecondaryButton } from '@/components/fin/Buttons';
import { StatusBadge } from '@/components/fin/primitives';
import { Panel, Screen, ScreenHeader } from '@/components/fin/Screen';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { space, type ColorTokens } from '@/design/tokens';
import { exactTime, formatSigned } from '@/domain/money';
import { useDomain } from '@/domain/store';

// Transaction Detail (spec §31, UI §24): only fields that exist, the rule
// or approval that shaped the transaction, and an Ask AI shortcut that
// carries context.

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useDomain();
  const router = useRouter();
  const colors = useColors();
  const styles = makeStyles(colors);

  const txn = state.transactions.find((t) => t.id === id);
  if (!txn) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title="Transaction" back />
        <AppText variant="secondary">This transaction no longer exists.</AppText>
      </Screen>
    );
  }

  const member = state.members.find((m) => m.id === txn.memberId);
  const card = state.cards.find((c) => c.id === txn.cardId);
  const declined = txn.status === 'declined';

  const meta: { label: string; value: string }[] = [
    { label: 'Date & time', value: exactTime(txn.at) },
    { label: 'Card', value: card ? `${card.nickname} · •••• ${card.last4}` : '—' },
    { label: 'Member', value: member?.name ?? '—' },
    { label: 'Category', value: txn.category },
    { label: 'Currency', value: 'INR' },
  ];

  return (
    <Screen>
      <ScreenHeader title="Transaction" back />

      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.merchantIcon}>
          <Ionicons name="storefront-outline" size={22} color={colors.textSecondary} />
        </View>
        <AppText variant="section">{txn.merchant}</AppText>
        <AppText variant="hero" tabular tone={declined ? colors.textTertiary : undefined}>
          {formatSigned(txn.amount, txn.direction)}
        </AppText>
        <StatusBadge
          status={declined ? 'declined' : txn.status === 'pending' ? 'pending' : 'active'}
          label={declined ? 'Declined' : txn.status === 'pending' ? 'Pending' : 'Settled'}
        />
      </View>

      {/* Rule / approval context */}
      {declined && txn.declineReason ? (
        <Panel style={{ borderColor: colors.errorDim, gap: space.s }}>
          <AppText variant="label" tone={colors.error}>
            Why it was declined
          </AppText>
          <AppText variant="body">{txn.declineReason}.</AppText>
          <AppText variant="secondary" tone={colors.textTertiary}>
            No money left the account. You can change this rule from the card's Rules screen.
          </AppText>
          {card ? (
            <SecondaryButton
              label="Edit card rules"
              onPress={() => router.push({ pathname: '/card-rules/[id]', params: { id: card.id } })}
            />
          ) : null}
        </Panel>
      ) : null}

      {txn.approvedBy ? (
        <Panel style={{ borderColor: colors.mintBorder, gap: space.xs }}>
          <AppText variant="label" tone={colors.mint}>
            Approval
          </AppText>
          <AppText variant="body">
            Approved once by {txn.approvedBy}. {member?.name}'s rules were not changed.
          </AppText>
        </Panel>
      ) : null}

      {/* Metadata */}
      <Panel style={{ gap: 12 }}>
        {meta.map((m) => (
          <View key={m.label} style={styles.metaRow}>
            <AppText variant="secondary" tone={colors.textTertiary}>
              {m.label}
            </AppText>
            <AppText variant="secondary" tabular style={{ flexShrink: 1, textAlign: 'right' }}>
              {m.value}
            </AppText>
          </View>
        ))}
      </Panel>

      {/* Actions */}
      <View style={{ gap: space.m }}>
        <SecondaryButton
          label="Ask AI about this transaction"
          onPress={() =>
            router.push({
              pathname: '/chat',
              params: { member: txn.memberId, q: `Tell me about the ${txn.merchant} transaction` },
            })
          }
        />
        <SecondaryButton
          label="Get help"
          onPress={() => Alert.alert('Support', 'Disputes and support land in an upcoming milestone.')}
        />
      </View>
    </Screen>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: space.s,
    paddingVertical: space.m,
  },
  merchantIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.l,
  },
});
}

