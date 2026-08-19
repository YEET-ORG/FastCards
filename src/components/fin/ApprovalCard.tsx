import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { color, space } from '@/design/tokens';
import { formatMoney, relativeTime } from '@/domain/money';
import type { Approval, Member } from '@/domain/types';

import { PrimaryButton, SecondaryButton, TextButton } from './Buttons';
import { Avatar, StatusBadge } from './primitives';

// ApprovalCard (spec §29, UI §21-22): Approve once and Change rule are
// deliberately separate controls — never one ambiguous action.

export function ApprovalCard({
  approval,
  requester,
  remainingBudget,
  onApprove,
  onDecline,
  onChangeRule,
}: {
  approval: Approval;
  requester?: Member;
  remainingBudget?: number;
  onApprove?: () => void;
  onDecline?: () => void;
  onChangeRule?: () => void;
}) {
  const resolved = approval.status !== 'pending';

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        {requester ? <Avatar initials={requester.initials} accent={requester.accentColor} size={38} /> : null}
        <View style={{ flex: 1, gap: 1 }}>
          <AppText variant="cardTitle">
            {requester?.name ?? 'Member'} · {approval.merchant}
          </AppText>
          <AppText variant="secondary" tone={color.textTertiary}>
            {relativeTime(approval.requestedAt)} · {approval.expiryNote}
          </AppText>
        </View>
        <AppText variant="section" tabular>
          {formatMoney(approval.amount)}
        </AppText>
      </View>

      <View style={styles.factRow}>
        <AppText variant="secondary">{approval.reason}</AppText>
        {remainingBudget !== undefined ? (
          <AppText variant="secondary" tone={color.textTertiary}>
            {formatMoney(remainingBudget)} left in {requester?.name ?? 'member'}'s monthly budget
          </AppText>
        ) : null}
      </View>

      {resolved ? (
        <StatusBadge
          status={approval.status === 'approved' ? 'active' : 'declined'}
          label={
            approval.status === 'approved'
              ? `Approved once by ${approval.resolvedBy ?? 'you'}`
              : `Declined by ${approval.resolvedBy ?? 'you'}`
          }
        />
      ) : (
        <>
          <View style={styles.actions}>
            <PrimaryButton label="Approve once" onPress={onApprove} style={styles.actionBtn} />
            <SecondaryButton label="Decline" onPress={onDecline} style={styles.actionBtn} />
          </View>
          <View style={styles.changeRule}>
            <TextButton label="Change future rule instead" onPress={onChangeRule} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 18,
    padding: space.l,
    gap: space.m,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  factRow: {
    gap: 3,
  },
  actions: {
    flexDirection: 'row',
    gap: space.m,
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
  },
  changeRule: {
    borderTopWidth: 1,
    borderTopColor: color.borderSoft,
    paddingTop: space.xs,
    alignItems: 'center',
  },
});
