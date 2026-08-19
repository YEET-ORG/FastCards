import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { MemberBudgetCard } from '@/components/fin/MemberBudgetCard';
import { ProgressBar, SectionHeader } from '@/components/fin/primitives';
import { HeaderIconButton, Panel, Screen, ScreenHeader } from '@/components/fin/Screen';
import { AvatarGroup } from '@/shared/ui/base/avatar-group';
import { AppText } from '@/design/AppText';
import { color, space } from '@/design/tokens';
import { formatMoney } from '@/domain/money';
import { cardForMember, pendingApprovals, useDomain } from '@/domain/store';

// Family Dashboard (spec §25, UI §17): remaining spending power leads,
// pending approvals surface near the top without dominating the page.

export default function FamilyDashboard() {
  const { state } = useDomain();
  const router = useRouter();

  const remaining = state.household.budgetCap - state.household.budgetSpent;
  const pending = pendingApprovals(state);

  return (
    <Screen>
      <ScreenHeader
        title="Family"
        subtitle={state.household.name}
        right={
          <HeaderIconButton
            icon="person-add-outline"
            label="Add family member"
            onPress={() => router.push('/invite-member')}
          />
        }
      />

      {/* Overlapping avatar strip (Reacticx AvatarGroup) — tap to open */}
      <View style={styles.avatarStrip}>
        <AvatarGroup
          avatars={state.members.map((m) => ({ id: m.id, name: m.name }))}
          size={52}
          overlap={16}
          onPress={(id) => router.push({ pathname: '/member/[id]', params: { id } })}
        />
      </View>

      {/* Household summary */}
      <Panel style={{ gap: space.s }}>
        <AppText variant="label">This month</AppText>
        <AppText variant="balance" tabular>
          {formatMoney(remaining)}{' '}
          <AppText variant="secondary" tone={color.textTertiary}>
            remaining
          </AppText>
        </AppText>
        <AppText variant="secondary" tone={color.textTertiary}>
          {formatMoney(state.household.budgetSpent)} spent of the {formatMoney(state.household.budgetCap)} budget
        </AppText>
        <ProgressBar value={state.household.budgetSpent / state.household.budgetCap} style={{ marginTop: 4 }} />
      </Panel>

      {/* Pending approvals banner */}
      {pending.length > 0 ? (
        <Pressable
          onPress={() => router.push('/approvals')}
          accessibilityRole="button"
          accessibilityLabel={`${pending.length} purchase${pending.length > 1 ? 's' : ''} need approval`}
          style={({ pressed }) => [styles.approvalBanner, pressed && { opacity: 0.8 }]}>
          <Ionicons name="hand-left-outline" size={17} color={color.warning} />
          <AppText variant="body" style={{ flex: 1 }}>
            {pending.length} purchase{pending.length > 1 ? 's' : ''} need{pending.length > 1 ? '' : 's'} approval
          </AppText>
          <AppText variant="secondary" tone={color.mint}>
            Review
          </AppText>
        </Pressable>
      ) : null}

      {/* Members */}
      <View style={{ gap: space.m }}>
        <SectionHeader title="Members" />
        {state.members.map((m) => {
          const card = cardForMember(state, m.id);
          return (
            <MemberBudgetCard
              key={m.id}
              member={m}
              cardFrozen={card?.status === 'frozen'}
              hasPendingApproval={pending.some((a) => a.requesterId === m.id)}
              onPress={() => router.push({ pathname: '/member/[id]', params: { id: m.id } })}
            />
          );
        })}
      </View>

      {/* Policies entry */}
      <Pressable
        onPress={() => Alert.alert('Household policies', 'Reusable rule bundles (School Days, Vacation Mode…) arrive with the P1 milestone.')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.policiesRow, pressed && { backgroundColor: color.surface2 }]}>
        <Ionicons name="options-outline" size={18} color={color.textSecondary} />
        <AppText variant="body" style={{ flex: 1 }}>
          Family rules & policies
        </AppText>
        <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatarStrip: {
    paddingVertical: 2,
    alignItems: 'flex-start',
  },
  approvalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    backgroundColor: color.warningDim,
    borderWidth: 1,
    borderColor: '#4A3A17',
    borderRadius: 16,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
  },
  policiesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.borderSoft,
    borderRadius: 16,
    paddingHorizontal: space.l,
    paddingVertical: space.l,
  },
});
