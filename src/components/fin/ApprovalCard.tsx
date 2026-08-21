import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';
import { useMoney } from '@/domain/currency';
import { relativeTime } from '@/domain/money';
import type { Approval, Member } from '@/domain/types';

import { PrimaryButton, SecondaryButton, TextButton } from './Buttons';
import { Avatar, StatusBadge } from './primitives';

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
  const { formatMoney } = useMoney();
  const colors = useColors();
  const resolved = approval.status !== 'pending';
  const hue = requester ? (colors.member[requester.hueId] ?? colors.member.pool) : colors.member.pool;

  return (
    <View style={[styles.card, { backgroundColor: colors.raised, borderColor: colors.lineStrong }]}>
      <View style={styles.topRow}>
        {requester ? (
          <Avatar
            initials={requester.initials}
            name={requester.name}
            backgroundColor={hue.dim}
            textColor={hue.ink}
            size={38}
          />
        ) : null}
        <View style={{ flex: 1, gap: 1 }}>
          <AppText variant="cardTitle">
            {requester?.name ?? 'Member'} · {approval.merchant}
          </AppText>
          <AppText variant="secondary" tone={colors.textTertiary}>
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
          <AppText variant="secondary" tone={colors.textTertiary}>
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
          <View style={[styles.changeRule, { borderTopColor: colors.line }]}>
            <TextButton label="Change future rule instead" onPress={onChangeRule} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
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
    minHeight: 50,
  },
  changeRule: {
    borderTopWidth: 1,
    paddingTop: space.xs,
    alignItems: 'center',
  },
});
