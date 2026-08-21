// Timing table for the onboarding thread — same shape as the reference
// spec, retuned to the app's duration scale (state 180 / nav 240 /
// sheet 280). Fast (220–320) for feedback, medium (640–800) for
// introductions, long (1400–2800) for things being absorbed.

export const onboardingMotion = {
  assistantFirstTypingMs: 1000,
  assistantTypingMs: 800,
  assistantTextHoldMs: 300,
  processTextRevealMs: 280,
  processMinVisibleMs: 2800,
  cardEnterMs: 320,
  staggerCardStepMs: 150,
  threadContentFadeMs: 240,
  errorFadeMs: 220,
  headerEnterMs: 240,
  headerExitMs: 180,
  scrollToEndDelayMs: 80,
  budgetAppliedHoldMs: 700,
  /** How long the "you're all set" payoff card is held before onboarding
   * hands off to the app on its own. Long enough to read, short enough to
   * feel like a handoff rather than a wait. */
  readyHandoffHoldMs: 1600,
} as const;