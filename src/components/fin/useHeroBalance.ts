// Everything the hero balance card needs, assembled once.
//
// The hero appears in two places — Home, and the payoff step at the end of
// onboarding — and they must be the same card, not two cards that happen to
// look alike today. Keeping the scope list, the card credentials, the hidden
// toggle and the pager here is what makes that structural rather than a
// convention: both call sites render `<BalanceCard {...hero.balanceProps} />`
// and cannot drift apart.
//
// The swipe still belongs to the screen, not the card (see useScopePager), so
// `pan` is returned separately for the caller to mount its GestureDetector
// wherever the gesture should be live.

import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import type { Gesture } from 'react-native-gesture-handler';

import type { BalanceCard, BalanceScope } from '@/components/fin/BalanceCard';
import { useScopePager } from '@/components/fin/useScopePager';
import { useMoney } from '@/domain/currency';
import { useDomain } from '@/domain/store';
import type { Card, Member } from '@/domain/types';

export interface HeroBalance {
  /** Spread straight onto `<BalanceCard/>`. */
  readonly balanceProps: ComponentProps<typeof BalanceCard>;
  /** The scope swipe. Mount it on whatever area should accept the drag. */
  readonly pan: ReturnType<typeof Gesture.Pan>;
  /** Derivations the hero already needed, shared so callers don't recompute. */
  readonly owner: Member | undefined;
  readonly budgetRemaining: number;
}

export function useHeroBalance(opts?: { pagerEnabled?: boolean }): HeroBalance {
  const { state } = useDomain();
  const { formatMoney } = useMoney();
  const [hidden, setHidden] = useState(false);

  const owner = state.members.find((m) => m.role === 'owner') ?? state.members[0];
  const budgetRemaining = state.household.budgetCap - state.household.budgetSpent;

  // The card whose credentials finish the hero: the owner's first live card,
  // falling back to any live card so the surface is never half-drawn.
  const primaryCard: Card | undefined =
    state.cards.find((c) => c.memberId === owner?.id && c.status === 'active') ??
    state.cards.find((c) => c.status === 'active');

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
  const pager = useScopePager(scopeNames, { enabled: opts?.pagerEnabled ?? true });

  const balanceProps = useMemo<ComponentProps<typeof BalanceCard>>(
    () => ({
      scopes,
      index: pager.index,
      progress: pager.progress,
      settled: pager.settled,
      commitSeq: pager.commitSeq,
      hidden,
      onToggleHidden: () => setHidden((h) => !h),
      card: primaryCard,
    }),
    // Shared values are stable for the life of the pager; listing them would
    // only make the hooks lint treat them as frozen inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopes, pager.index, pager.commitSeq, hidden, primaryCard],
  );

  // Assembled once: a fresh object per render re-renders every consumer
  // (Home's shell, the onboarding flow) on every parent render.
  return useMemo(
    () => ({ balanceProps, pan: pager.pan, owner, budgetRemaining }),
    [balanceProps, pager.pan, owner, budgetRemaining],
  );
}
