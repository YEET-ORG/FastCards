// Pure `stage.kind` switch — the card switch. Bails immediately when
// actions aren't due yet; every card enters with a staggered FadeInDown.

import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BalanceCard } from '@/components/fin/BalanceCard';
import type { HeroBalance } from '@/components/fin/useHeroBalance';
import { PrimaryButton, SecondaryButton } from '@/components/fin/Buttons';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';
import { formatMoneyINR } from '@/domain/money';

import { onboardingCopy } from './copy';
import { onboardingMotion } from './motion';
import type { Stage } from './types';
import { OptionCard, ReviewCard, StatusPill, WorkingPill } from './cards';

export type StageInlineProps = {
  readonly stage: Stage;
  readonly busy: boolean;
  readonly showActions: boolean;
  readonly householdName: string;
  readonly membersCount: number;
  readonly totalAvailable: number;
  /** The same hero Home opens with — see components/fin/useHeroBalance. */
  readonly hero: HeroBalance;
  readonly canSetBudget: boolean;
  readonly onComplete: () => void;
  readonly onPickOrder: () => void;
  readonly onPickInvite: () => void;
  readonly onPickTour: () => void;
  readonly onExplainerContinue: () => void;
  readonly onExplainerBack: () => void;
  readonly onBudgetAmount: (amount: number) => void;
  readonly onBudgetBack: () => void;
  readonly onReviewStart: () => void;
  readonly onReviewChange: () => void;
};

function StaggeredCard({ delay, children }: { readonly delay: number; readonly children: React.ReactNode }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(onboardingMotion.cardEnterMs)}
      style={{ width: '100%' }}>
      {children}
    </Animated.View>
  );
}

export function StageInline({
  stage,
  busy,
  showActions,
  householdName,
  membersCount,
  totalAvailable,
  hero,
  canSetBudget,
  onComplete,
  onPickOrder,
  onPickInvite,
  onPickTour,
  onExplainerContinue,
  onExplainerBack,
  onBudgetAmount,
  onBudgetBack,
  onReviewStart,
  onReviewChange,
}: StageInlineProps) {
  const colors = useColors();
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
        <StatusPill label={pill.label} meta={pill.meta} />
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
        <Animated.View entering={FadeInDown.duration(onboardingMotion.cardEnterMs)}>
          <AppText variant="secondary" tone={colors.textTertiary} style={{ textAlign: 'center' }}>
            Or type an amount, like 15k
          </AppText>
        </Animated.View>
      </View>
    );
  }

  if (stage.kind === 'working') {
    return <WorkingPill label={onboardingCopy.workingLabel} meta={onboardingCopy.workingMeta} />;
  }

  if (stage.kind === 'review') {
    return (
      <Animated.View entering={FadeInDown.duration(onboardingMotion.cardEnterMs)} style={{ marginTop: space.s }}>
        <ReviewCard
          budgetAmount={stage.amount}
          householdName={householdName}
          membersCount={membersCount}
          onChange={canSetBudget ? onReviewChange : undefined}
          onStart={onReviewStart}
          totalAvailable={totalAvailable}
        />
      </Animated.View>
    );
  }

  if (stage.kind === 'ready') {
    // The payoff is the actual Home hero, not a rendition of it: same
    // component, same props, same pager. The thread's horizontal padding is
    // `screenPad`, exactly what the card's pre-layout width assumes, so it
    // lands at Home's geometry with nothing to tune.
    //
    // The vertical margins are not decoration — the Skia halo is absolutely
    // positioned and bleeds 72–120pt outside the card on every side, so the
    // assistant line above and the button below have to stand well clear of it.
    return (
      <Animated.View
        entering={FadeInDown.duration(onboardingMotion.cardEnterMs)}
        style={{ marginTop: space.xl, rowGap: space.xl }}>
        <GestureDetector gesture={hero.pan}>
          <View>
            <BalanceCard {...hero.balanceProps} />
          </View>
        </GestureDetector>
        <PrimaryButton label={onboardingCopy.readyContinueLabel} onPress={onComplete} />
      </Animated.View>
    );
  }

  return null;
}