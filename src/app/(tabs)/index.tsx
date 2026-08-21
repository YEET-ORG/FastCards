import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useAskDock } from '@/components/ask/AskDockContext';
import { useAuth } from '@/auth/AuthContext';
import { BalanceCard, type BalanceScope } from '@/components/fin/BalanceCard';
import { useScopePager } from '@/components/fin/useScopePager';
import { InsightCard } from '@/components/fin/InsightCard';
import { Avatar, QuickAction, SectionHeader } from '@/components/fin/primitives';
import { HeaderIconButton } from '@/components/fin/Screen';
import { TransactionRow } from '@/components/fin/TransactionRow';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { screenPad, space } from '@/design/tokens';
import { useMoney } from '@/domain/currency';
import { memberRemaining, pendingApprovals, useDomain } from '@/domain/store';

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
  const { formatMoney } = useMoney();
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
  }, [pending.length, mayaRemaining, state.household, router, noFunding, formatMoney]);

  const recent = [...state.transactions].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  const owner = state.members.find((m) => m.role === 'owner') ?? state.members[0];
  const budgetRemaining = state.household.budgetCap - state.household.budgetSpent;
  // The card whose credentials finish the hero: the owner's first live card,
  // falling back to any live card so the surface is never half-drawn.
  const primaryCard =
    state.cards.find((c) => c.memberId === owner?.id && c.status === 'active') ??
    state.cards.find((c) => c.status === 'active');
  const hue = colors.member[owner?.hueId ?? 'rohan'];

  // The three faces the hero card morphs between.
  const scopes = useMemo<BalanceScope[]>(() => {
    const secondary = `${formatMoney(budgetRemaining)} left this month`;
    return [
      { name: 'Personal', amount: state.balances.personal, secondary },
      { name: 'Family', amount: state.balances.family, secondary },
      {
        name: 'All',
        amount: state.balances.personal + state.balances.family,
        secondary,
      },
    ];
  }, [state.balances.personal, state.balances.family, budgetRemaining, formatMoney]);

  const scopeNames = useMemo(() => scopes.map((s) => s.name), [scopes]);
  // Swiping anywhere on the page changes scope, so the gesture lives here
  // rather than on the card. It stands down while the Ask composer is up.
  const pager = useScopePager(scopeNames, { enabled: !dock.composerOpen });

  const actions: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[] = [];
  if (pending.length > 0) actions.push({ icon: 'notifications', label: 'Review', onPress: () => router.push('/approvals') });
  actions.push({ icon: 'people-outline', label: 'Family', onPress: () => router.push('/(tabs)/family') });
  if (total === 0) actions.push({ icon: 'add-outline', label: 'Deposit', onPress: () => router.push('/deposit') });
  else actions.push({ icon: 'card-outline', label: 'Cards', onPress: () => router.push('/(tabs)/cards') });
  if (actions.length < 4 && total > 0) {
    actions.push({ icon: 'add-outline', label: 'Deposit', onPress: () => router.push('/deposit') });
  }

  return (
    <GestureDetector gesture={pager.pan}>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        {/* The page's blue ground. A sibling of the ScrollView, not a child of
            its content: inside the scroll it would be clipped at the content
            edge. `styles.root` has no `overflow`, so nothing cuts it here. */}
        <View pointerEvents="none" style={styles.glow}>
          <Svg width="100%" height="100%">
            <Defs>
              <RadialGradient id="heroGlow" cx="50%" cy="42%" rx="72%" ry="58%">
                <Stop offset="0" stopColor={colors.accent} stopOpacity={0.20} />
                <Stop offset="0.55" stopColor={colors.accent} stopOpacity={0.07} />
                <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroGlow)" />
          </Svg>
        </View>

        <ScrollView
          ref={scrollRef}
        contentContainerStyle={[
          styles.scroll,
          // Clear the floating nav using its measured height rather than a
          // fixed constant, so the last row can never slide underneath it.
          { paddingTop: insets.top + space.s, paddingBottom: dock.tabBarHeight + space.l },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          {/* Row 1: identity and the one contextual action. Nothing centred —
              there is no period filter in this product to put there. */}
          <View style={styles.headerRow}>
            <Avatar
              name={session?.name ?? '?'}
              size={36}
              backgroundColor={hue.dim}
              textColor={hue.ink}
              onPress={() => router.push('/profile')}
            />
            <View style={styles.approvalsSlot}>
              <HeaderIconButton
                icon="notifications"
                size={36}
                label={
                  pending.length > 0
                    ? `Review ${pending.length} pending approval${pending.length > 1 ? 's' : ''}`
                    : 'Approvals'
                }
                onPress={() => router.push('/approvals')}
              />
              {pending.length > 0 ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.badge,
                    { backgroundColor: colors.accent, borderColor: colors.bg },
                  ]}
                />
              ) : null}
            </View>
          </View>
          {/* Row 2: the greeting, quiet, so the card is the hero. */}
          <AppText variant="body" tone={colors.textSecondary} numberOfLines={1}>
            {greeting(session?.name ?? '')}
          </AppText>
        </View>

        <BalanceCard
          scopes={scopes}
          index={pager.index}
          progress={pager.progress}
          hidden={hidden}
          onToggleHidden={() => setHidden((h) => !h)}
          card={primaryCard}
        />

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
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Sized to sit behind the hero and fade out well above the floating tab
  // bar, which paints an opaque band and would otherwise cut the glow off
  // with a hard horizontal edge.
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 460,
  },
  scroll: {
    paddingHorizontal: screenPad,
    gap: space.xl,
  },
  header: {
    gap: space.m,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.m,
  },
  approvalsSlot: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  quickRow: {
    flexDirection: 'row',
    gap: space.s,
  },
});
