// Typed-input routing: every tap has a typed equivalent. Matches in
// order of strictness — exact set, exact-or-substring, predicate —
// then falls through to `invalid`.

import type { Stage } from './types';

export type OnboardingCommandAction =
  | { readonly kind: 'pick-order-card' }
  | { readonly kind: 'pick-invite-family' }
  | { readonly kind: 'pick-tour' }
  | { readonly kind: 'explainer-continue' }
  | { readonly kind: 'explainer-back' }
  | { readonly kind: 'budget-amount'; readonly amount: number }
  | { readonly kind: 'budget-back' }
  | { readonly kind: 'review-start' }
  | { readonly kind: 'review-change' }
  | { readonly kind: 'ready-continue' }
  | { readonly kind: 'invalid' };

const ORDER_PHRASES = new Set([
  'order',
  'order a card',
  'order my first card',
  'first card',
  'create a card',
  'new card',
]);

const INVITE_PHRASES = new Set([
  'invite',
  'invite family',
  'invite a family',
  'invite a family member',
  'add family',
  'add a family member',
  'add member',
  'family',
]);

const TOUR_PHRASES = new Set(['tour', 'around', 'show me', 'show me around', 'explore', 'walk me through']);

const EXPLAINER_CONTINUE = new Set(['continue', 'next', 'ok', 'okay', 'sure', 'got it', 'yes']);

const EXPLAINER_BACK = new Set(['back', 'other', 'something else', 'pick something else', 'nothing', 'not yet']);

const REVIEW_START = new Set(['start', 'continue', 'go', 'done', 'enter', 'finish', 'start using fastcards']);

const REVIEW_CHANGE = new Set(['change', 'change budget', 'back', 'different', 'rethink']);

const READY = new Set(['continue', 'done', 'enter', 'go', 'home', 'finish', 'start', 'open fastcards']);

export function normalizeCommandInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s₹]/gu, ' ') // punctuation → space
    .replace(/\s+/gu, ' ')
    .trim();
}

function matchesPhrase(normalized: string, phrases: ReadonlySet<string>): boolean {
  if (phrases.has(normalized)) return true;
  for (const phrase of phrases) {
    if (phrase.length >= 4 && normalized.includes(phrase)) return true;
  }
  return false;
}

/** "15k" / "15,000" / "15000" / "₹15 000" → number. */
function parseBudgetAmount(normalized: string): number | null {
  const kMatch = /^(\d{1,3})\s?k$/.exec(normalized);
  const digits = kMatch ? kMatch[1]! : normalized.replace(/\D/gu, '');
  if (!/^\d{1,8}$/.test(digits)) return null;
  const amount = parseInt(digits, 10) * (kMatch ? 1000 : 1);
  if (!Number.isFinite(amount) || amount < 1 || amount > 50_000_000) return null;
  return amount;
}

function resolveWelcome(normalized: string): OnboardingCommandAction | null {
  if (matchesPhrase(normalized, ORDER_PHRASES)) return { kind: 'pick-order-card' };
  if (matchesPhrase(normalized, INVITE_PHRASES)) return { kind: 'pick-invite-family' };
  if (matchesPhrase(normalized, TOUR_PHRASES)) return { kind: 'pick-tour' };
  if (
    normalized.includes('card') &&
    (normalized.includes('order') || normalized.includes('create') || normalized.includes('first') || normalized.includes('new'))
  ) {
    return { kind: 'pick-order-card' };
  }
  if (normalized.includes('family') || normalized.includes('invite')) {
    return { kind: 'pick-invite-family' };
  }
  if (normalized.includes('tour') || normalized.includes('around') || normalized.includes('show me')) {
    return { kind: 'pick-tour' };
  }
  return null;
}

export interface OnboardingCommandOptions {
  /** False for members who cannot set the household budget (a teen signing in
   * on the demo build). The budget stage is unreachable for them, so "change
   * budget" must not resolve to an action that would only fail server-side. */
  readonly canSetBudget?: boolean;
}

export function resolveOnboardingCommandInput(
  stage: Stage,
  value: string,
  opts?: OnboardingCommandOptions,
): OnboardingCommandAction {
  const n = normalizeCommandInput(value);
  const canSetBudget = opts?.canSetBudget ?? true;

  switch (stage.kind) {
    case 'welcome':
      return resolveWelcome(n) ?? { kind: 'invalid' };
    case 'explainer':
      if (EXPLAINER_CONTINUE.has(n)) return { kind: 'explainer-continue' };
      if (EXPLAINER_BACK.has(n)) return { kind: 'explainer-back' };
      return { kind: 'invalid' };
    case 'budget': {
      if (stage.status !== 'idle') return { kind: 'invalid' };
      const amount = parseBudgetAmount(n);
      if (amount !== null) return { kind: 'budget-amount', amount };
      if (EXPLAINER_BACK.has(n) || REVIEW_CHANGE.has(n)) return { kind: 'budget-back' };
      return { kind: 'invalid' };
    }
    case 'working':
      return { kind: 'invalid' };
    case 'review':
      if (REVIEW_START.has(n)) return { kind: 'review-start' };
      if (canSetBudget && REVIEW_CHANGE.has(n)) return { kind: 'review-change' };
      return { kind: 'invalid' };
    case 'ready':
      if (READY.has(n)) return { kind: 'ready-continue' };
      return { kind: 'invalid' };
  }
}

export function resolveOnboardingPlaceholder(stage: Stage): string {
  if (stage.kind === 'budget' && stage.status === 'idle') return 'type an amount, like 15k…';
  return 'tap an option above…';
}