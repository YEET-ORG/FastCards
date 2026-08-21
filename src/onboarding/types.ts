// Scripted onboarding thread — adapted from the GhostWallet chat-flow
// spec (onboarding-chat-flow.md). `Stage` is the "where am I" pointer;
// `ThreadEvent` is the visible transcript. Append-only, stable ids.

export type OnboardingChoice = 'order-card' | 'invite-family' | 'tour';

export type Stage =
  | { readonly kind: 'welcome' }
  | { readonly kind: 'explainer'; readonly choice: OnboardingChoice }
  | { readonly kind: 'budget'; readonly status: 'idle' | 'applied'; readonly amount?: number }
  | { readonly kind: 'working' }
  | { readonly kind: 'review'; readonly amount: number }
  | { readonly kind: 'ready'; readonly amount: number };

export type ThreadEventVariant =
  | 'greet'
  | 'explainer'
  | 'budget'
  | 'budget-done'
  | 'working'
  | 'review'
  | 'ready';

export type ThreadEvent =
  | { readonly kind: 'user'; readonly id: string; readonly label: string }
  | {
      readonly kind: 'assistant';
      readonly id: string;
      readonly variant: ThreadEventVariant;
      readonly text?: string;
    };