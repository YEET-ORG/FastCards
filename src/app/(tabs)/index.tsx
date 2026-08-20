import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAskDock } from '@/components/ask/AskDockContext';
import { useAuth } from '@/auth/AuthContext';
import { InsightCard } from '@/components/fin/InsightCard';
import { Avatar, QuickAction, SectionHeader } from '@/components/fin/primitives';
import { RollingMoney } from '@/components/fin/RollingMoney';
import { Segments } from '@/components/fin/Segments';
import { TransactionRow } from '@/components/fin/TransactionRow';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { screenPad, space } from '@/design/tokens';
import { formatMoney } from '@/domain/money';
import { memberRemaining, pendingApprovals, useDomain } from '@/domain/store';

const SCOPES = ['Personal', 'Family', 'All'] as const;

function greeting(name: string): string {
  const h = new Date().getHours();
  if (h < 12) return `Good morning, ${name}`;
  if (h < 17) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}

export default function AskHome() {
  const { state } = useDomain();
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const dock = useAskDock();
  const scrollRef = useRef<ScrollView>(null);
  const [scopeIndex, setScopeIndex] = useState(2);
  const [hidden, setHidden] = useState(false);
  const [insightDismissed, setInsightDismissed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      dock.setAskHome(true);
      dock.registerScrollToTop('index', () => scrollRef.current?.scrollTo({ y: 0, animated: true }));
      return () => {
        dock.setAskHome(false);
        dock.registerScrollToTop('index', null);
      };
    }, [dock]),
  );

  const amount =
    scopeIndex === 0
      ? state.balances.personal
      : scopeIndex === 1
        ? state.balances.family
        : state.balances.personal + state.balances.family;

  const pending = pendingApprovals(state);
  const mayaRemaining = memberRemaining(state, 'm-maya');
  const total = state.balances.personal + state.balances.family;
  const newUser = state.cards.length === 0 && state.members.length <= 1;
  const noFunding = total === 0 && state.cards.length > 0;

  const insight = useMemo(() => {
    if (noFunding) {
      return {
        statement: 'Add funds to start spending.',
        actions: [{ label: 'Deposit', onPress: () => router.push('/deposit') }],
      };
    }
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
  }, [pending.length, mayaRemaining, state.household, router, noFunding]);

  const recent = [...state.transactions].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  const owner = state.members.find((m) => m.role === 'owner') ?? state.members[0];
  const hue = colors.member[owner?.hueId ?? 'rohan'];

  const actions: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[] = [];
  if (pending.length > 0) actions.push({ icon: 'hand-left-outline', label: 'Review', onPress: () => router.push('/approvals') });
  actions.push({ icon: 'people-outline', label: 'Family', onPress: () => router.push('/(tabs)/family') });
  if (total === 0) actions.push({ icon: 'add-outline', label: 'Deposit', onPress: () => router.push('/deposit') });
  else actions.push({ icon: 'card-outline', label: 'Cards', onPress: () => router.push('/(tabs)/cards') });
  if (actions.length < 4 && total > 0) {
    actions.push({ icon: 'add-outline', label: 'Deposit', onPress: () => router.push('/deposit') });
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + space.s, paddingBottom: space.dockClearance },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flexShrink: 1 }}>
            <AppText variant="screenTitle">{greeting(session?.name ?? '')}</AppText>
          </View>
          <Avatar
            name={session?.name ?? '?'}
            size={38}
            backgroundColor={hue.dim}
            textColor={hue.ink}
            onPress={() => router.push('/profile')}
          />
        </View>

        <View style={styles.snapshot}>
          <View style={styles.snapshotTop}>
            <AppText variant="label">Total available</AppText>
            <Pressable
              onPress={() => setHidden((h) => !h)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'}
              style={styles.eye}>
              <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textTertiary} />
            </Pressable>
          </View>
          <RollingMoney amount={amount} fontSize={52} hidden={hidden} variant="display" />
          <View style={{ marginTop: space.m }}>
            <Segments labels={[...SCOPES]} index={scopeIndex} onChange={setScopeIndex} />
          </View>
        </View>

        {newUser ? (
          <View style={styles.quickRow}>
            <QuickAction icon="card-outline" label="First card" onPress={() => router.push('/order-card')} />
            <QuickAction icon="person-add-outline" label="Add family" onPress={() => router.push('/invite-member')} />
            <QuickAction icon="swap-horizontal-outline" label="Move money" onPress={() => router.push('/move-money')} />
            <QuickAction icon="sparkles-outline" label="Ask spending" onPress={() => undefined} />
          </View>
        ) : (
          <>
            {!insightDismissed ? (
              <InsightCard
                statement={insight.statement}
                actions={insight.actions}
                onDismiss={() => setInsightDismissed(true)}
              />
            ) : null}
            <View style={styles.quickRow}>
              {actions.slice(0, 4).map((a) => (
                <QuickAction key={a.label} icon={a.icon} label={a.label} onPress={a.onPress} />
              ))}
            </View>
          </>
        )}

        <View>
          <SectionHeader title="Recent" actionLabel="View all" onAction={() => router.push('/(tabs)/activity')} />
          {recent.length === 0 ? (
            <AppText variant="secondary" tone={colors.textTertiary}>
              Your activity will appear here.
            </AppText>
          ) : (
            recent.map((t) => (
              <TransactionRow
                key={t.id}
                txn={t}
                member={state.members.find((m) => m.id === t.memberId)}
                onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.id } })}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
  snapshot: { gap: 6 },
  snapshotTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eye: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRow: {
    flexDirection: 'row',
    gap: space.s,
  },
});
