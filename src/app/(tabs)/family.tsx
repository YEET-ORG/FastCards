import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAskDock } from '@/components/ask/AskDockContext';
import { MemberBudgetCard } from '@/components/fin/MemberBudgetCard';
import { ProgressBar, SectionHeader } from '@/components/fin/primitives';
import { HeaderIconButton, Panel, Screen, ScreenHeader } from '@/components/fin/Screen';
import { AvatarGroup } from '@/shared/ui/base/avatar-group';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { icon, space } from '@/design/tokens';
import { useMoney } from '@/domain/currency';
import { cardForMember, pendingApprovals, useDomain } from '@/domain/store';

export default function FamilyDashboard() {
  const { formatMoney } = useMoney();
  const { state } = useDomain();
  const router = useRouter();
  const colors = useColors();
  const dock = useAskDock();
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      dock.registerScrollToTop('family', () => scrollRef.current?.scrollTo({ y: 0, animated: true }));
      return () => dock.registerScrollToTop('family', null);
    }, [dock]),
  );

  const remaining = state.household.budgetCap - state.household.budgetSpent;
  const pending = useMemo(() => pendingApprovals(state), [state]);

  // Stable identity for AvatarGroup's memo: built once per members/hues change.
  const avatarItems = useMemo(
    () =>
      state.members.map((m) => ({
        id: m.id,
        name: m.name,
        color: colors.member[m.hueId]?.fill ?? colors.member.pool.fill,
      })),
    [state.members, colors.member],
  );

  // Per-member rows with stable callbacks, so the memoized MemberBudgetCard
  // only re-renders when its own member/pending state changes.
  const memberRows = useMemo(
    () =>
      state.members.map((m) => ({
        key: m.id,
        member: m,
        cardFrozen: cardForMember(state, m.id)?.status === 'frozen',
        hasPendingApproval: pending.some((a) => a.requesterId === m.id),
        onPress: () => router.push({ pathname: '/member/[id]', params: { id: m.id } }),
      })),
    [state, pending, router],
  );

  return (
    <Screen scrollToTopRef={scrollRef} onScrollDirection={dock.reportScroll}>
      <ScreenHeader
        title="Family"
        right={
          <HeaderIconButton
            icon="person-add-outline"
            label="Add family member"
            onPress={() => router.push('/invite-member')}
          />
        }
      />

      <View style={styles.avatarStrip}>
        <AvatarGroup
          avatars={avatarItems}
          size={52}
          overlap={16}
          onPress={(id) => router.push({ pathname: '/member/[id]', params: { id } })}
        />
      </View>

      <Panel style={{ gap: space.s }}>
        <AppText variant="label">This month</AppText>
        <AppText variant="balance" tabular>
          {formatMoney(remaining)}{' '}
          <AppText variant="secondary" tone={colors.textTertiary}>
            remaining
          </AppText>
        </AppText>
        <AppText variant="secondary" tone={colors.textTertiary}>
          {formatMoney(state.household.budgetSpent)} spent of the {formatMoney(state.household.budgetCap)} budget
        </AppText>
        <ProgressBar value={state.household.budgetSpent / state.household.budgetCap} style={{ marginTop: space.xs }} />
      </Panel>

      {pending.length > 0 ? (
        <Pressable
          onPress={() => router.push('/approvals')}
          accessibilityRole="button"
          accessibilityLabel={`${pending.length} purchase${pending.length > 1 ? 's' : ''} need approval`}
          style={({ pressed }) => [
            styles.approvalBanner,
            { backgroundColor: colors.warningDim, borderColor: colors.warning },
            pressed && { opacity: 0.8 },
          ]}>
          <Ionicons name="hand-left-outline" size={icon.meta} color={colors.warningInk} />
          <AppText variant="body" style={{ flex: 1 }}>
            {pending.length} purchase{pending.length > 1 ? 's' : ''} need{pending.length > 1 ? '' : 's'} approval
          </AppText>
          <AppText variant="secondary" tone={colors.accentInk}>
            Review
          </AppText>
        </Pressable>
      ) : null}

      <View style={{ gap: space.m }}>
        <SectionHeader title="Members" />
        {state.members.length === 0 ? (
          <AppText variant="secondary">Bring your household into one view.</AppText>
        ) : (
          memberRows.map((row) => (
            <MemberBudgetCard
              key={row.key}
              member={row.member}
              cardFrozen={row.cardFrozen}
              hasPendingApproval={row.hasPendingApproval}
              onPress={row.onPress}
            />
          ))
        )}
      </View>

      <Pressable
        onPress={() =>
          Alert.alert(
            'Household policies',
            'Reusable rule bundles (School Days, Vacation Mode…) arrive with the P1 milestone.',
          )
        }
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.policiesRow,
          { backgroundColor: colors.cream, borderColor: colors.line },
          pressed && { backgroundColor: colors.inset },
        ]}>
        <Ionicons name="options-outline" size={18} color={colors.textSecondary} />
        <AppText variant="body" style={{ flex: 1 }}>
          Family rules & policies
        </AppText>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
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
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
  },
  policiesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: space.l,
    paddingVertical: space.l,
  },
});
