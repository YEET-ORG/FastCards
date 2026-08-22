// Timing table for the onboarding thread — same shape as the reference
// spec, retuned to the app's chat motion scale (state 180 / nav 240 /
// sheet 280; AI chat: 220–240 entrances, ~650ms typing, spring cards).
// Fast (220–320) for feedback, medium (550–800) for conversation,
// long (2400) only for the one process step being absorbed.

import type { EntryExitAnimationFunction } from 'react-native-reanimated';
import { Easing, withDelay, withSpring, withTiming } from 'react-native-reanimated';

export const onboardingMotion = {
  assistantFirstTypingMs: 650,
  assistantTypingMs: 550,
  assistantTextHoldMs: 240,
  processTextRevealMs: 220,
  processMinVisibleMs: 2400,
  cardEnterMs: 220,
  staggerCardStepMs: 110,
  threadContentFadeMs: 200,
  errorFadeMs: 160,
  headerEnterMs: 200,
  headerExitMs: 180,
  scrollToEndDelayMs: 80,
  budgetAppliedHoldMs: 850,
} as const;

/** The AI chat message entrance, implemented locally: fade + 6pt lift,
 * 240ms, cubic-out — the same curve chat's `aiMessageEnter` uses. */
export function onboardingMessageEnter(delay = 0): EntryExitAnimationFunction {
  'worklet';
  return () => {
    const duration = 240;
    const easing = Easing.out(Easing.cubic);
    return {
      initialValues: { opacity: 0, transform: [{ translateY: 6 }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration, easing })),
        transform: [{ translateY: withDelay(delay, withTiming(0, { duration, easing })) }],
      },
    };
  };
}

/** The AI chat card entrance, implemented locally: opacity + 8pt lift on the
 * chat card spring (damping 24 / stiffness 240), staggered via `delay`. */
export function onboardingCardEnter(delay = 0): EntryExitAnimationFunction {
  'worklet';
  return () => {
    const spring = { damping: 24, stiffness: 240 };
    return {
      initialValues: { opacity: 0, transform: [{ translateY: 8 }] },
      animations: {
        opacity: withDelay(delay, withSpring(1, spring)),
        transform: [{ translateY: withDelay(delay, withSpring(0, spring)) }],
      },
    };
  };
}