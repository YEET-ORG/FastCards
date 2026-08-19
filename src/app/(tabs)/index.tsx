import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthContext';
import { Composer } from '@/components/ask/Composer';
import { InsightCard } from '@/components/fin/InsightCard';
import { Avatar, QuickAction, SectionHeader } from '@/components/fin/primitives';
import { RollingMoney } from '@/components/fin/RollingMoney';
import { Segments } from '@/components/fin/Segments';
import { TransactionRow } from '@/components/fin/TransactionRow';
import { AppText } from '@/design/AppText';
import { color, screenPad, space } from '@/design/tokens';
import { formatMoney } from '@/domain/money';
import { memberRemaining, pendingApprovals, useDomain } from '@/domain/store';

// Ask Home — Kast-inspired: balance hero with rolling digits, one
// proactive insight, circular quick actions, and the AI composer always
// one gesture away.

const SCOPES = ['Personal', 'Family', 'All'] as const;

function greeting(name: string): string {
  const h = new Date().getHours();
  if (h < 12) return `Good morning, ${name}`;
  if (h < 17) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}

export default function AskHome() {
  const { state } = useDomain();
  const { session, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [scopeIndex, setScopeIndex] = useState(2);
  const [hidden, setHidden] = useState(false);
  const [insightDismissed, setInsightDismissed] = useState(false);

  const amount =
    scopeIndex === 0
      ? state.balances.personal
      : scopeIndex === 1
        ? state.balances.family
        : state.balances.personal + state.balances.family;

  const pending = pendingApprovals(state);
  const mayaRemaining = memberRemaining(state, 'm-maya');

  const insight = useMemo(() => {
    if (pending.length > 0) {
      return {
        statement: `Maya has ${formatMoney(mayaRemaining ?? 0)} left this month. One purchase needs approval.`,
        actions: [
          { label: 'Review approval', onPress: () => router.push('/approvals') },
          { label: 'View family', onPress: () => router.push('/(tabs)/family') },
        ],
      };
    }
    const remaining = state.household.budgetCap - state.household.budgetSpent;
    return {
      statement: `The household has ${formatMoney(remaining)} of this month's budget remaining.`,
      actions: [{ label: 'View family', onPress: () => router.push('/(tabs)/family') }],
    };
  }, [pending.length, mayaRemaining, state.household, router]);

  const recent = [...state.transactions].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);

  const notYet = (what: string) =>
    Alert.alert(what, 'This lands in an upcoming milestone. Nothing has changed.');

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + space.s, paddingBottom: 150 },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexShrink: 1 }}>
            <AppText variant="screenTitle">{greeting(session?.name ?? '')}</AppText>
          </View>
          <Avatar
            name={session?.name ?? '?'}
            accent={color.info}
            size={38}
            onPress={() =>
              Alert.alert(session?.name ?? 'Profile', session?.isAdmin ? 'Platform admin' : undefined, [
                ...(session?.isAdmin
                  ? [{ text: 'Admin console', onPress: () => router.push('/admin') }]
                  : []),
                { text: 'Sign out', style: 'destructive' as const, onPress: signOut },
                { text: 'Cancel', style: 'cancel' as const },
              ])
            }
          />
        </View>

        {/* Balance hero */}
        <View style={styles.snapshot}>
          <View style={styles.snapshotTop}>
            <AppText variant="label">Total available</AppText>
            <Pressable
              onPress={() => setHidden((h) => !h)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'}>
              <Ionicons
                name={hidden ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={color.textTertiary}
              />
            </Pressable>
          </View>
          <RollingMoney amount={amount} fontSize={46} hidden={hidden} />
          <View style={{ marginTop: space.m }}>
            <Segments labels={[...SCOPES]} index={scopeIndex} onChange={setScopeIndex} />
          </View>
        </View>

        {/* Proactive insight */}
        {!insightDismissed ? (
          <InsightCard
            statement={insight.statement}
            actions={insight.actions}
            onDismiss={() => setInsightDismissed(true)}
          />
        ) : null}

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <QuickAction icon="arrow-up-outline" label="Send" onPress={() => router.push('/move-money')} />
          <QuickAction icon="add-outline" label="Add funds" onPress={() => router.push('/deposit')} />
          <QuickAction icon="card-outline" label="New card" onPress={() => router.push('/order-card')} />
          <QuickAction icon="bag-handle-outline" label="Shop" onPress={() => notYet('AI shopping')} />
        </View>

        {/* Recent activity */}
        <View>
          <SectionHeader
            title="Recent"
            actionLabel="View all"
            onAction={() => router.push('/(tabs)/activity')}
          />
          {recent.map((t) => (
            <TransactionRow
              key={t.id}
              txn={t}
              member={state.members.find((m) => m.id === t.memberId)}
              onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.id } })}
            />
          ))}
        </View>
      </ScrollView>

      {/* Sticky composer above the tab bar */}
      <View style={[styles.composerWrap, { paddingBottom: space.m }]}>
        <Composer onSubmit={(text) => router.push({ pathname: '/chat', params: { q: text } })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
  },
  scroll: {
    paddingHorizontal: screenPad,
    gap: space.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.m,
    minHeight: 52,
  },
  snapshot: {
    gap: 6,
  },
  snapshotTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quickRow: {
    flexDirection: 'row',
    gap: space.s,
  },
  composerWrap: {
    position: 'absolute',
    left: screenPad,
    right: screenPad,
    bottom: 0,
  },
});
