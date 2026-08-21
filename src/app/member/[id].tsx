import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ApprovalFlow } from '@/components/fin/ApprovalFlow';
import { ConfirmSheet } from '@/components/fin/ConfirmSheet';
import { Avatar, ProgressBar, QuickAction, RuleChip, SectionHeader } from '@/components/fin/primitives';
import { RollingMoney } from '@/components/fin/RollingMoney';
import { Panel, Screen, ScreenHeader } from '@/components/fin/Screen';
import { useToast } from '@/components/fin/Toast';
import { TransactionRow } from '@/components/fin/TransactionRow';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';
import { useMoney } from '@/domain/currency';
import { cardForMember, memberRemaining, pendingApprovals, useDomain } from '@/domain/store';

// Family Member Detail (spec §26, UI §19): remaining amount leads,
// category budgets below, declines explain their rule, Ask AI carries
// member context into the thread.

const LIMIT_STEP = 1000;

export default function MemberDetail() {
  const { formatMoney } = useMoney();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useDomain();
  const router = useRouter();
  const toast = useToast();
  const colors = useColors();
  const [adjusting, setAdjusting] = useState(false);
  const [proposedLimit, setProposedLimit] = useState<number | null>(null);

  const member = state.members.find((m) => m.id === id);
  if (!member) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title="Member" back />
        <AppText variant="secondary">This member no longer exists.</AppText>
      </Screen>
    );
  }

  const card = cardForMember(state, member.id);
  const remaining = memberRemaining(state, member.id);
  const effectiveLimit =
    member.monthlyLimit !== undefined
      ? member.monthlyLimit + (member.tempAllowance?.amount ?? 0)
      : undefined;
  const memberTxns = state.transactions.filter((t) => t.memberId === member.id).slice(0, 5);
  const memberApprovals = pendingApprovals(state).filter((a) => a.requesterId === member.id);
  const frozen = card?.status === 'frozen';

  const startAdjust = () => {
    if (member.monthlyLimit === undefined) {
      Alert.alert('No limit', `${member.name} has no monthly limit to adjust.`);
      return;
    }
    setProposedLimit(member.monthlyLimit + LIMIT_STEP);
    setAdjusting(true);
  };

  return (
    <Screen>
      <ScreenHeader title={member.name} subtitle={member.relationship ?? member.role} back />

      <View style={styles.hero}>
        <Avatar
          initials={member.initials}
          name={member.name}
          backgroundColor={(colors.member[member.hueId] ?? colors.member.pool).dim}
          textColor={(colors.member[member.hueId] ?? colors.member.pool).ink}
          size={52}
        />
        <View style={{ flex: 1, gap: 4 }}>
          {remaining !== undefined && effectiveLimit !== undefined ? (
            <>
              <RollingMoney amount={Math.max(remaining, 0)} fontSize={32} />
              <AppText variant="secondary" tone={colors.textTertiary}>
                of {formatMoney(effectiveLimit)} this month
              </AppText>
              <ProgressBar value={member.spentThisMonth / effectiveLimit} style={{ marginTop: 4 }} />
            </>
          ) : (
            <AppText variant="secondary" tone={colors.textTertiary}>
              No monthly limit · spent {formatMoney(member.spentThisMonth)} this month
            </AppText>
          )}
        </View>
      </View>

      {member.tempAllowance ? (
        <RuleChip
          state="temporary"
          label={`Temporary +${formatMoney(member.tempAllowance.amount)} · until ${member.tempAllowance.expiresAtLabel}`}
        />
      ) : null}

      {/* Quick actions */}
      <View style={styles.quickRow}>
        <QuickAction
          icon="arrow-up-circle-outline"
          label="Send money"
          onPress={() => router.push('/move-money')}
        />
        <QuickAction icon="trending-up-outline" label="Adjust limit" onPress={startAdjust} />
        <QuickAction
          icon={frozen ? 'sunny-outline' : 'snow-outline'}
          label={frozen ? 'Unfreeze' : 'Freeze'}
          onPress={() => {
            if (!card) return;
            dispatch({ type: frozen ? 'unfreeze_card' : 'freeze_card', cardId: card.id });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            toast(`${member.name}'s card is ${frozen ? 'active again' : 'frozen'}.`);
          }}
        />
        <QuickAction
          icon="sparkles-outline"
          label="Ask AI"
          onPress={() => router.push({ pathname: '/chat', params: { member: member.id } })}
        />
      </View>

      {/* Pending requests */}
      {memberApprovals.length > 0 ? (
        <View style={{ gap: space.m }}>
          <SectionHeader title="Needs your approval" />
          {memberApprovals.map((a) => (
            <ApprovalFlow key={a.id} approvalId={a.id} />
          ))}
        </View>
      ) : null}

      {/* Category budgets */}
      {member.categories.length > 0 ? (
        <View style={{ gap: space.m }}>
          <SectionHeader
            title="Category budgets"
            actionLabel={card ? 'Rules' : undefined}
            onAction={card ? () => router.push({ pathname: '/card-rules/[id]', params: { id: card.id } }) : undefined}
          />
          <Panel style={{ gap: space.l }}>
            {member.categories.map((c) => (
              <View key={c.key} style={{ gap: 6 }}>
                <View style={styles.catRow}>
                  <AppText variant="body" tone={c.enabled ? undefined : colors.textTertiary}>
                    {c.label}
                    {!c.enabled ? '  · off' : ''}
                  </AppText>
                  <AppText variant="secondary" tabular tone={colors.textTertiary}>
                    {formatMoney(c.spent)} / {formatMoney(c.cap)}
                  </AppText>
                </View>
                <ProgressBar value={c.enabled ? c.spent / c.cap : 0} />
              </View>
            ))}
          </Panel>
        </View>
      ) : null}

      {/* Recent activity */}
      <View>
        <SectionHeader title="Recent activity" />
        {memberTxns.map((t) => (
          <TransactionRow
            key={t.id}
            txn={t}
            member={member}
            showMember={false}
            onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.id } })}
          />
        ))}
      </View>

      {/* Adjust limit — PREPARE then confirm through the trusted sheet */}
      {member.monthlyLimit !== undefined && proposedLimit !== null ? (
        <ConfirmSheet
          visible={adjusting}
          title="Change monthly limit"
          subject={`${member.name} · ${card?.nickname ?? 'card'}`}
          facts={[
            { label: 'Current limit', value: `${formatMoney(member.monthlyLimit)} / month` },
            { label: 'New limit', value: `${formatMoney(proposedLimit)} / month`, emphasis: true },
            { label: 'Effective', value: 'Immediately' },
          ]}
          note="This is a permanent rule change, not a temporary allowance."
          cta={`Set limit to ${formatMoney(proposedLimit)}`}
          onConfirm={() => {
            dispatch({ type: 'set_monthly_limit', memberId: member.id, amount: proposedLimit });
            toast(`${member.name}'s monthly limit is now ${formatMoney(proposedLimit)}.`);
          }}
          onClose={() => setAdjusting(false)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.l,
  },
  quickRow: {
    flexDirection: 'row',
    gap: space.s,
  },
  catRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.m,
  },
});
