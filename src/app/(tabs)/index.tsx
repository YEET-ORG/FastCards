import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAskDock } from '@/components/ask/AskDockContext';
import { useAuth } from '@/auth/AuthContext';
import { BalanceCard } from '@/components/fin/BalanceCard';
import { useHeroBalance } from '@/components/fin/useHeroBalance';
import { InsightCard } from '@/components/fin/InsightCard';
import { Avatar, QuickAction, SectionHeader } from '@/components/fin/primitives';
import { HomeAiSwitch } from '@/components/fin/HomeAiSwitch';
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
  const [insightDismissed, setInsightDismissed] = useState(false);
  // Same hero the last step of onboarding shows. It stands down while the Ask
  // composer is up so the swipe cannot fight the sheet.
  const hero = useHeroBalance({ pagerEnabled: !dock.composerOpen });

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
  const hue = colors.member[hero.owner?.hueId ?? 'rohan'];

  // Swiping anywhere on the page changes scope, so the gesture lives here
  // rather than on the card.
  //
  // There used to be a second pan here: a rightward drag of 80pt or more left
  // Home for the AI chat, composed with the pager as `Gesture.Exclusive`. It
  // never really worked — Exclusive gives priority to its FIRST gesture, and
  // the pager activates at 16pt of travel against the chat swipe's 80pt, so the
  // pager won nearly every race. It only looked plausible because a rightward
  // drag on the first scope merely rubber-banded, which read as "nothing else
  // could have happened". Now that paging is cyclic a rightward drag always
  // pages, so the chat swipe could never fire at all. The header's Home/AI
  // switch is the route to chat.
  const rootPan = hero.pan;

  const actions: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[] = [
    { icon: 'add-outline', label: 'Deposit', onPress: () => router.push('/deposit') },
    { icon: 'swap-horizontal-outline', label: 'Transfer', onPress: () => router.push('/move-money') },
    { icon: 'card-outline', label: 'Payments', onPress: () => router.push('/payments') },
  ];

  return (
    <GestureDetector gesture={rootPan}>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        {/* The page ground is flat, and deliberately so. There used to be a
            460pt elliptical accent radial here. It had to be held very faint so
            it would not wash out the hero card's own halo — and that faintness
            is exactly what broke it: a gradient that changes by well under
            1/255 per pixel cannot render as a gradient, it renders as wide
            plateaus separated by single-level steps. Because the gradient was
            elliptical, those steps came out as curved contour arcs across the
            top of the screen, mirror-symmetric about the centre line.

            There is no opacity that fixes it. Faint enough to leave the halo
            alone is faint enough to band; steep enough not to band is bright
            enough to flatten the halo. The card's halo is the page's light now. */}
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
          {/* Row 1: identity, the Home ↔ AI switch, and the one contextual action.
              The avatar and bell are both 36pt, so the switch sits centred. */}
          <View style={styles.headerRow}>
            <Avatar
              name={session?.name ?? '?'}
              size={36}
              backgroundColor={hue.dim}
              textColor={hue.ink}
              onPress={() => router.push('/profile')}
            />
            <HomeAiSwitch mode="home" />
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

        <BalanceCard {...hero.balanceProps} />

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
