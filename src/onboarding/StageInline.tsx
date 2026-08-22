// Pure `stage.kind` switch — the card switch. Bails immediately when
// actions aren't due yet; every card enters with a staggered chat-card
// spring (the same motion CardShell uses in the AI chat thread).

import { useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { BalanceCard, type BalanceScope } from '@/components/fin/BalanceCard';
import type { HeroBalance } from '@/components/fin/useHeroBalance';
import { PrimaryButton, SecondaryButton } from '@/components/fin/Buttons';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';
import { formatMoneyINR } from '@/domain/money';

import { onboardingCopy } from './copy';
import { onboardingCardEnter, onboardingMotion } from './motion';
import type { Stage } from './types';
import { FundingReceiveCard, OptionCard, StatusPill, WorkingPill } from './cards';

export type StageInlineProps = {
  readonly stage: Stage;
  readonly busy: boolean;
  readonly showActions: boolean;
  readonly householdName: string;
  readonly membersCount: number;
  readonly totalAvailable: number;
  /** The same hero Home opens with — see components/fin/useHeroBalance. */
  readonly hero: HeroBalance;
  readonly userName: string;
  readonly canSetBudget: boolean;
  readonly onComplete: () => void;
  readonly onPickOrder: () => void;
  readonly onPickInvite: () => void;
  readonly onPickTour: () => void;
  readonly onExplainerContinue: () => void;
  readonly onExplainerBack: () => void;
  readonly onBudgetAmount: (amount: number) => void;
  readonly onBudgetCustom: () => void;
  readonly onBudgetBack: () => void;
  /** Advance to the card reveal — the funding pair and typed commands land here. */
  readonly onReviewStart: (label: string) => void;
  /** "Add fund now" — appends the user bubble and opens the receive card. */
  readonly onFundNow: () => void;
  readonly onReviewChange: () => void;
};

function StaggeredCard({ delay, children }: { readonly delay: number; readonly children: React.ReactNode }) {
  return (
    <Animated.View
      entering={onboardingCardEnter(delay)}
      style={{ width: '100%' }}>
      {children}
    </Animated.View>
  );
}

export function StageInline({
  stage,
  busy,
  showActions,
  totalAvailable,
  hero,
  userName,
  onComplete,
  onPickOrder,
  onPickInvite,
  onPickTour,
  onExplainerContinue,
  onExplainerBack,
  onBudgetAmount,
  onBudgetCustom,
  onBudgetBack,
  onReviewStart,
  onFundNow,
}: StageInlineProps) {
  const colors = useColors();
  // Presentation-only: the funding step shows either the funding pair or the
  // receive card. The stage machine is untouched.
  const [receiving, setReceiving] = useState(false);
  if (!showActions) return null;

  if (stage.kind === 'welcome') {
    return (
      <View style={{ rowGap: space.l, marginTop: space.s, width: '100%' }}>
        <StaggeredCard delay={0}>
          <OptionCard
            icon="card-outline"
            onPress={onPickOrder}
            subtitle={onboardingCopy.choiceOrderSubtitle}
            title={onboardingCopy.choiceOrderTitle}
            variant="primary"
          />
        </StaggeredCard>
        <StaggeredCard delay={onboardingMotion.staggerCardStepMs}>
          <OptionCard
            icon="people-outline"
            onPress={onPickInvite}
            subtitle={onboardingCopy.choiceFamilySubtitle}
            title={onboardingCopy.choiceFamilyTitle}
          />
        </StaggeredCard>
        <StaggeredCard delay={onboardingMotion.staggerCardStepMs * 2}>
          <OptionCard
            icon="sparkles-outline"
            onPress={onPickTour}
            subtitle={onboardingCopy.choiceTourSubtitle}
            title={onboardingCopy.choiceTourTitle}
            variant="accent"
          />
        </StaggeredCard>
      </View>
    );
  }

  if (stage.kind === 'explainer') {
    const pill = onboardingCopy.explainerPills[stage.choice];
    return (
      <View style={{ rowGap: 10, marginTop: space.xs }}>
        <Animated.View entering={onboardingCardEnter(0)}>
          <StatusPill label={pill.label} meta={pill.meta} metaTone={colors.mintInk} glow />
        </Animated.View>
        <View style={{ flexDirection: 'row', columnGap: 10 }}>
          <SecondaryButton
            label={onboardingCopy.explainerBackLabel}
            onPress={onExplainerBack}
            disabled={busy}
            style={{ flex: 1 }}
          />
          <PrimaryButton
            label={onboardingCopy.explainerContinueLabel}
            onPress={onExplainerContinue}
            disabled={busy}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    );
  }

  if (stage.kind === 'budget') {
    if (stage.status === 'applied') {
      return <StatusPill label={onboardingCopy.budgetDonePill.label} meta={onboardingCopy.budgetDonePill.meta} tone="success" />;
    }
    return (
      <View style={{ rowGap: space.l, marginTop: space.s, width: '100%' }}>
        {onboardingCopy.budgetAmounts.map((option, index) => (
          <StaggeredCard key={option.amount} delay={onboardingMotion.staggerCardStepMs * index}>
            <OptionCard
              icon={index === 0 ? 'wallet-outline' : index === 1 ? 'flash-outline' : 'diamond-outline'}
              onPress={() => onBudgetAmount(option.amount)}
              subtitle={option.label}
              title={formatMoneyINR(option.amount)}
              variant={index === 1 ? 'primary' : index === 2 ? 'accent' : 'default'}
            />
          </StaggeredCard>
        ))}
        {/* Always exactly 4 options: 3 presets + Custom amount, which hands
            the answer to the composer. Typing any amount stays available. */}
        <StaggeredCard delay={onboardingMotion.staggerCardStepMs * 3}>
          <OptionCard
            icon="create-outline"
            onPress={onBudgetCustom}
            subtitle={onboardingCopy.budgetCustomSubtitle}
            title={onboardingCopy.budgetCustomTitle}
          />
        </StaggeredCard>
      </View>
    );
  }

  if (stage.kind === 'working') {
    return <WorkingPill label={onboardingCopy.workingLabel} meta={onboardingCopy.workingMeta} />;
  }

  if (stage.kind === 'review') {
    if (receiving) {
      return (
        <Animated.View entering={onboardingCardEnter(0)} style={{ marginTop: space.s }}>
          <FundingReceiveCard
            onSuccess={() => {
              setReceiving(false);
              onReviewStart(onboardingCopy.fundNowLabel);
            }}
            onSkip={() => {
              setReceiving(false);
              onReviewStart(onboardingCopy.fundLaterLabel);
            }}
          />
        </Animated.View>
      );
    }
    return (
      <Animated.View entering={onboardingCardEnter(0)} style={{ marginTop: space.s, rowGap: space.l }}>
        {/* The funding decision — both paths land on the card reveal. "Add fund
            now" opens the receive card below; funding itself is the same
            deposit rail the deposit screen uses, presented in-thread because
            onboarding runs outside the navigator. */}
        <View style={{ flexDirection: 'row', columnGap: 10 }}>
          <PrimaryButton
            label={onboardingCopy.fundNowLabel}
            onPress={() => {
              onFundNow();
              setReceiving(true);
            }}
            disabled={busy}
            style={{ flex: 1 }}
          />
          <SecondaryButton
            label={onboardingCopy.fundLaterLabel}
            onPress={() => onReviewStart(onboardingCopy.fundLaterLabel)}
            disabled={busy}
            style={{ flex: 1 }}
          />
        </View>
      </Animated.View>
    );
  }

  if (stage.kind === 'ready') {
    // The payoff is the actual Home hero, not a rendition of it: same
    // component, same style, glow, tilt, shine and hidden-toggle. Two
    // presentation-only differences: the card is LOCKED to the current
    // cardholder — a single scope named with their actual name showing their
    // current balance, never "All" and never household data, and no scope
    // swipe (the pan is deliberately not mounted here, so this card cannot
    // switch between scopes). Home's hero keeps its own pager untouched.
    //
    // The vertical margins are not decoration — the Skia halo is absolutely
    // positioned and bleeds 72–120pt outside the card on every side, so the
    // assistant line above and the button below have to stand well clear of it.
    const revealScopes: BalanceScope[] = [
      {
        name: userName || 'Your card',
        amount: totalAvailable,
        secondary: 'Total available',
      },
    ];
    return (
      <Animated.View
        entering={onboardingCardEnter(0)}
        style={{ marginTop: space.xl, rowGap: space.xl }}>
        <View>
          <BalanceCard {...hero.balanceProps} scopes={revealScopes} />
        </View>
        <PrimaryButton
          label={onboardingCopy.readyContinueLabel}
          onPress={onComplete}
          fill={colors.floatingPillBackground}
          fillPressed={colors.floatingPillBackground}
          ink={colors.floatingPillText}
          pressedOpacity={0.85}
        />
      </Animated.View>
    );
  }

  return null;
}