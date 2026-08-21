// The orchestrator — a local finite state machine rendered as a chat
// transcript (ported from onboarding-chat-flow.md §11.12). `stage` is
// the live card; `events` is the append-only visible thread. Only the
// last assistant message is "active" and renders a card.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UserBubble } from '@/components/ask/blocks';
import { Composer } from '@/components/ask/Composer';
import { TextButton } from '@/components/fin/Buttons';
import { AppText } from '@/design/AppText';
import { useReduceMotion } from '@/design/motion';
import { useColors } from '@/design/theme';
import { radius, screenPad, space } from '@/design/tokens';
import { formatMoneyINR } from '@/domain/money';

import { ScrollToBottomPill, TypingIndicator } from './cards';
import { onboardingCopy } from './copy';
import { onboardingMotion } from './motion';
import {
  resolveOnboardingCommandInput,
  resolveOnboardingPlaceholder,
} from './route-command';
import { StageInline } from './StageInline';
import type { Stage, ThreadEvent } from './types';
import {
  shouldShowPresentationContent,
  shouldShowStageActions,
  useThreadPresentation,
} from './useThreadPresentation';

type Props = {
  readonly userName: string;
  readonly householdName: string;
  readonly membersCount: number;
  readonly totalAvailable: number;
  readonly onSetBudget: (amount: number) => Promise<void>;
  readonly onComplete: () => void;
};

let eventCounter = 0;
function makeEventId(prefix: string): string {
  eventCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${eventCounter}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function OnboardingFlow({
  userName,
  householdName,
  membersCount,
  totalAvailable,
  onSetBudget,
  onComplete,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { height: viewportHeight } = useWindowDimensions();

  const [stage, setStage] = useState<Stage>({ kind: 'welcome' });
  const [events, setEvents] = useState<readonly ThreadEvent[]>(() => [
    {
      kind: 'assistant',
      id: makeEventId('greet'),
      variant: 'greet',
      text: onboardingCopy.greeting(userName),
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  const stageRef = useRef(stage);
  const budgetAppliedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);
  const pushReviewRef = useRef<(amount: number) => void>(() => {});

  useEffect(() => {
    stageRef.current = stage;
  });

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (budgetAppliedTimerRef.current) clearTimeout(budgetAppliedTimerRef.current);
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    },
    [],
  );

  /** Onboarding can finish from the hold timer, the Continue button, the
   * typed command or Skip — whichever lands first wins, and the rest are
   * no-ops. Completion must never run twice. */
  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    onComplete();
  }, [onComplete]);

  /** Enter the payoff stage, then hand off to the app on its own. Reduce
   * motion skips the hold — there is no motion to appreciate. */
  function enterReady(amount: number) {
    setStage({ kind: 'ready', amount });
    if (reduceMotion) {
      finish();
      return;
    }
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    readyTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      if (stageRef.current.kind !== 'ready') return;
      finish();
    }, onboardingMotion.readyHandoffHoldMs);
  }

  const threadStarted = events.some((ev) => ev.kind === 'user');

  function appendEvents(...next: ThreadEvent[]) {
    setEvents((prev) => [...prev, ...next]);
  }

  const activeAssistantId = (() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]!;
      if (ev.kind === 'assistant') return ev.id;
    }
    return null;
  })();

  const presentation = useThreadPresentation(events, activeAssistantId);

  // ── Handlers (every tap has a typed equivalent) ────────────────────────

  function handlePick(choice: 'order-card' | 'invite-family' | 'tour', label: string) {
    const explainerText =
      choice === 'order-card'
        ? onboardingCopy.explainerOrder
        : choice === 'invite-family'
          ? onboardingCopy.explainerFamily
          : onboardingCopy.explainerTour;
    appendEvents(
      { kind: 'user', id: makeEventId('u'), label },
      { kind: 'assistant', id: makeEventId('exp'), variant: 'explainer', text: explainerText },
    );
    setStage({ kind: 'explainer', choice });
  }

  function handleExplainerContinue() {
    appendEvents(
      { kind: 'user', id: makeEventId('u'), label: onboardingCopy.explainerContinueLabel },
      { kind: 'assistant', id: makeEventId('budget'), variant: 'budget', text: onboardingCopy.budgetQuestion },
    );
    setStage({ kind: 'budget', status: 'idle' });
  }

  function handleExplainerBack() {
    appendEvents(
      { kind: 'user', id: makeEventId('u'), label: onboardingCopy.explainerBackLabel },
      { kind: 'assistant', id: makeEventId('greet2'), variant: 'greet', text: onboardingCopy.welcomeAgain },
    );
    setStage({ kind: 'welcome' });
  }

  function pushReview(amount: number) {
    budgetAppliedTimerRef.current = null;
    if (!mountedRef.current) return;
    appendEvents({
      kind: 'assistant',
      id: makeEventId('review'),
      variant: 'review',
      text: onboardingCopy.reviewText,
    });
    setStage({ kind: 'review', amount });
  }

  useEffect(() => {
    pushReviewRef.current = pushReview;
  });

  async function handleBudgetAmount(amount: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    appendEvents(
      { kind: 'user', id: makeEventId('u'), label: formatMoneyINR(amount) },
      {
        kind: 'assistant',
        id: makeEventId('working'),
        variant: 'working',
        text: onboardingCopy.workingText,
      },
    );
    setStage({ kind: 'working' });
    try {
      await onSetBudget(amount);
      await wait(onboardingMotion.processMinVisibleMs);
      if (!mountedRef.current) return;
      appendEvents({
        kind: 'assistant',
        id: makeEventId('budget-done'),
        variant: 'budget-done',
        text: onboardingCopy.budgetDoneText,
      });
      setStage({ kind: 'budget', status: 'applied', amount });
      if (budgetAppliedTimerRef.current) clearTimeout(budgetAppliedTimerRef.current);
      budgetAppliedTimerRef.current = setTimeout(() => {
        const current = stageRef.current;
        if (current.kind !== 'budget' || current.status !== 'applied') return;
        pushReviewRef.current(current.amount ?? amount);
      }, onboardingMotion.budgetAppliedHoldMs);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Could not update the budget');
      setStage({ kind: 'budget', status: 'idle' });
    } finally {
      // Unguarded on purpose: mountedRef is a one-way latch; a state update
      // after unmount is a harmless no-op.
      setBusy(false);
    }
  }

  function handleBudgetBack() {
    appendEvents(
      { kind: 'user', id: makeEventId('u'), label: onboardingCopy.explainerBackLabel },
      { kind: 'assistant', id: makeEventId('greet3'), variant: 'greet', text: onboardingCopy.welcomeAgain },
    );
    setStage({ kind: 'welcome' });
  }

  function handleReviewStart() {
    const current = stageRef.current;
    const amount = current.kind === 'review' ? current.amount : 0;
    appendEvents(
      { kind: 'user', id: makeEventId('u'), label: onboardingCopy.reviewStartLabel },
      { kind: 'assistant', id: makeEventId('ready'), variant: 'ready', text: onboardingCopy.readyText },
    );
    enterReady(amount);
  }

  function handleReviewChange() {
    appendEvents(
      { kind: 'user', id: makeEventId('u'), label: onboardingCopy.reviewChangeLabel },
      { kind: 'assistant', id: makeEventId('budget2'), variant: 'budget', text: onboardingCopy.budgetBack },
    );
    setStage({ kind: 'budget', status: 'idle' });
  }

  function handlePromptSend(value: string) {
    if (busy || stage.kind === 'working') return;
    const trimmed = value.trim();
    if (!trimmed) return;

    const action = resolveOnboardingCommandInput(stage, trimmed);
    setError(null);

    switch (action.kind) {
      case 'pick-order-card':
        handlePick('order-card', trimmed);
        return;
      case 'pick-invite-family':
        handlePick('invite-family', trimmed);
        return;
      case 'pick-tour':
        handlePick('tour', trimmed);
        return;
      case 'explainer-continue':
        handleExplainerContinue();
        return;
      case 'explainer-back':
        handleExplainerBack();
        return;
      case 'budget-amount':
        void handleBudgetAmount(action.amount);
        return;
      case 'budget-back':
        handleBudgetBack();
        return;
      case 'review-start':
        handleReviewStart();
        return;
      case 'review-change':
        handleReviewChange();
        return;
      case 'ready-continue':
        finish();
        return;
      case 'invalid':
        setError(onboardingCopy.invalidMessage);
        return;
    }
  }

  // ── Reliable auto-scroll via content size changes ──────────────────────

  const ONBOARDING_SCROLL_THRESHOLD = 300;
  const scrollMetrics = useRef({ offset: 0, contentHeight: 0, layoutHeight: 0 });
  const [nearBottom, setNearBottom] = useState(true);

  const scrollToEnd = () => {
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  const handleOnboardingScroll = (e: {
    nativeEvent: {
      contentOffset: { y: number };
      contentSize: { height: number };
      layoutMeasurement: { height: number };
    };
  }) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    scrollMetrics.current = {
      offset: contentOffset.y,
      contentHeight: contentSize.height,
      layoutHeight: layoutMeasurement.height,
    };
    const dist = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setNearBottom(dist <= ONBOARDING_SCROLL_THRESHOLD);
  };

  const handleOnboardingContentSizeChange = (_w: number, h: number) => {
    const { layoutHeight, offset, contentHeight: prevH } = scrollMetrics.current;
    if (
      h > prevH &&
      prevH > 0 &&
      h - layoutHeight - offset <= ONBOARDING_SCROLL_THRESHOLD
    ) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
    scrollMetrics.current.contentHeight = h;
  };

  const initialThreadTopPadding = Math.round(
    Math.min(56, Math.max(28, viewportHeight * 0.045)),
  );

  return (
    <View style={styles.root}>
      {/* Always reachable, and outside the scroller so it cannot scroll away:
          onboarding gates the whole app, so a stalled step must never be a
          dead end. Its own band, so it can never overlap the thread. */}
      <View style={styles.skipRow}>
        <TextButton label={onboardingCopy.skipLabel} onPress={finish} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        bounces={false}
        contentContainerStyle={[
          styles.thread,
          { paddingTop: threadStarted ? space.l : initialThreadTopPadding },
        ]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={handleOnboardingContentSizeChange}
        onScroll={handleOnboardingScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}>
        {threadStarted ? (
          <Animated.View
            entering={FadeIn.duration(onboardingMotion.headerEnterMs)}
            style={{ marginBottom: space.xl, rowGap: 2 }}>
            <AppText variant="section">{onboardingCopy.headerTitle}</AppText>
            <AppText variant="label" style={{ letterSpacing: 1.2 }}>
              {onboardingCopy.headerMeta}
            </AppText>
          </Animated.View>
        ) : null}

        {events.map((ev) => {
          if (ev.kind === 'user') {
            return <UserBubble key={ev.id} text={ev.label} />;
          }
          const isActive = ev.id === activeAssistantId;
          const phase = isActive ? presentation.getPhase(ev.id) : 'actions';
          const showContent = !isActive || shouldShowPresentationContent(phase);
          const showActions = isActive && shouldShowStageActions(phase, ev);

          return (
            <View key={ev.id} style={styles.assistantBlock}>
              {showContent ? (
                <Animated.View entering={FadeIn.duration(onboardingMotion.threadContentFadeMs)}>
                  {isActive && phase === 'typing' && ev.variant !== 'working' ? (
                    <TypingIndicator />
                  ) : ev.text ? (
                    <AppText
                      variant="body"
                      tone={colors.textSecondary}
                      style={styles.assistantText}>
                      {ev.text}
                    </AppText>
                  ) : (
                    <TypingIndicator />
                  )}
                </Animated.View>
              ) : null}

              {isActive && showContent ? (
                <StageInline
                  busy={busy}
                  householdName={householdName}
                  membersCount={membersCount}
                  onBudgetAmount={(amount) => void handleBudgetAmount(amount)}
                  onBudgetBack={handleBudgetBack}
                  onComplete={finish}
                  onExplainerBack={handleExplainerBack}
                  onExplainerContinue={handleExplainerContinue}
                  onPickInvite={() => handlePick('invite-family', onboardingCopy.choiceFamilyTitle)}
                  onPickOrder={() => handlePick('order-card', onboardingCopy.choiceOrderTitle)}
                  onPickTour={() => handlePick('tour', onboardingCopy.choiceTourTitle)}
                  onReviewChange={handleReviewChange}
                  onReviewStart={handleReviewStart}
                  showActions={showActions}
                  stage={stage}
                  totalAvailable={totalAvailable}
                />
              ) : null}
            </View>
          );
        })}

        {error ? (
          <Animated.View entering={FadeIn.duration(onboardingMotion.errorFadeMs)} style={styles.errorChipWrap}>
            <View style={[styles.errorChip, { backgroundColor: colors.errorDim, borderColor: colors.error }]}>
              <AppText variant="caption" tone={colors.errorInk}>
                {error}
              </AppText>
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>

      <ScrollToBottomPill
        visible={!nearBottom}
        onPress={scrollToEnd}
        bottomOffset={insets.bottom + 120}
      />

      <View style={[styles.composerWrap, { paddingBottom: insets.bottom + space.m }]}>
        <Composer
          onSubmit={handlePromptSend}
          placeholder={resolveOnboardingPlaceholder(stage)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  skipRow: {
    alignItems: 'flex-end',
    paddingHorizontal: screenPad,
  },
  thread: {
    paddingHorizontal: screenPad,
    paddingBottom: space.xl,
    gap: space.l,
  },
  assistantBlock: {
    gap: 10,
    marginBottom: space.xl,
  },
  assistantText: {
    fontSize: 17,
    lineHeight: 24,
    maxWidth: '92%',
  },
  errorChipWrap: {
    alignSelf: 'flex-start',
    marginTop: space.xs,
    marginBottom: space.xl,
  },
  errorChip: {
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
  },
  composerWrap: {
    paddingHorizontal: screenPad,
    paddingTop: space.s,
  },
});