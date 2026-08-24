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
  'my own card',
  'get a card',
  'get my first card',
  'i want a card',
  'create a card',
  'new card',
  'set up my card',
]);

const INVITE_PHRASES = new Set([
  'invite',
  'invite family',
  'invite a family',
  'invite a family member',
  'invite someone',
  'add family',
  'add a family member',
  'add member',
  'add someone',
  'add them',
  'family',
]);

const TOUR_PHRASES = new Set([
  'tour',
  'around',
  'show me',
  'show me around',
  'walk me through',
  'explore',
  'what can i do',
  'what can i ask',
  'whats next',
  'get to know',
  'show me everything',
]);

const EXPLAINER_CONTINUE = new Set([
  'continue',
  'next',
  'ok',
  'okay',
  'sure',
  'got it',
  'yes',
  'sounds good',
  'perfect',
  'lets do it',
  'lets go',
  'that sounds great',
]);

const EXPLAINER_BACK = new Set([
  'back',
  'other',
  'something else',
  'pick something else',
  'pick another',
  'another option',
  'not that',
  'different one',
  'nothing',
  'not yet',
  'skip',
]);

const REVIEW_START = new Set([
  'start',
  'continue',
  'go',
  'done',
  'enter',
  'finish',
  'start using kami',
  'looks good',
  'looks great',
  'perfect',
  'thats it',
  'lets start',
  'im ready',
  'lets go',
  // The funding pair — both paths land on the hero reveal.
  'add fund now',
  'add funds',
  'fund now',
  'later',
  'not now',
  'skip',
]);

const REVIEW_CHANGE = new Set(['change', 'change budget', 'back', 'different', 'rethink', 'change it', 'different amount', 'edit', 'update']);

const READY = new Set([
  'continue',
  'done',
  'enter',
  'go',
  'home',
  'finish',
  'start',
  'open kami',
  'im done',
  'thanks',
  'thats it',
  'all set',
]);

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

/** Spoken small numbers, for "fifteen thousand" / "one lakh" style answers. */
const SMALL_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const MULTIPLIER_WORDS: ReadonlySet<string> = new Set(['hundred', 'thousand', 'lakh', 'crore']);

function wordMultiplier(word: string): number {
  switch (word) {
    case 'hundred':
      return 100;
    case 'thousand':
      return 1000;
    case 'lakh':
      return 100000;
    default:
      return 10_000_000; // crore
  }
}

/** A contiguous run of number words, e.g. ["twenty","five","thousand"] → 25000. */
function parseWordRun(run: readonly string[]): number | null {
  let total = 0;
  let current = 0;
  for (const word of run) {
    const small = SMALL_WORDS[word];
    if (small !== undefined) {
      current += small;
    } else if (MULTIPLIER_WORDS.has(word)) {
      current *= wordMultiplier(word);
      total += current;
      current = 0;
    } else {
      return null;
    }
  }
  total += current;
  return total;
}

/** "15k" / "1.5 lakh" / "fifteen thousand" / "15,000" / "₹15000" → number. */
function parseBudgetAmount(normalized: string): number | null {
  // k — anywhere in the sentence ("set it to 15k"), not just alone.
  const kMatch = /(\d{1,3})\s?k\b/.exec(normalized);
  if (kMatch) {
    const amount = parseInt(kMatch[1]!, 10) * 1000;
    if (Number.isFinite(amount) && amount >= 1 && amount <= 50_000_000) return amount;
  }
  // Digit lakh ("1.5 lakh", "2 lakh").
  const lakhMatch = /(\d{1,3}(?:\.\d)?)\s*lakh\b/.exec(normalized);
  if (lakhMatch) {
    const amount = Math.round(parseFloat(lakhMatch[1]!) * 100000);
    if (Number.isFinite(amount) && amount >= 1 && amount <= 50_000_000) return amount;
  }
  // Spoken numbers — the longest run that parses wins.
  const tokens = normalized.split(' ');
  let best: number | null = null;
  for (let i = 0; i < tokens.length; i++) {
    if (SMALL_WORDS[tokens[i]!] === undefined) continue;
    for (let j = i + 1; j <= tokens.length; j++) {
      const run = tokens.slice(i, j);
      if (
        !run.every(
          (t) => SMALL_WORDS[t] !== undefined || MULTIPLIER_WORDS.has(t),
        )
      ) {
        break;
      }
      const value = parseWordRun(run);
      if (value !== null && value >= 1 && value <= 50_000_000) best = value;
    }
  }
  if (best !== null) return best;
  // Plain digits ("15000", "15 000", "₹15000").
  const digits = normalized.replace(/\D/gu, '');
  if (/^\d{1,8}$/.test(digits)) {
    const amount = parseInt(digits, 10);
    if (Number.isFinite(amount) && amount >= 1 && amount <= 50_000_000) return amount;
  }
  return null;
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
  /** False for members who cannot set the household budget (a teen signing
   * in). The budget stage is unreachable for them, so "change budget" must
   * not resolve to an action that would only fail server-side. */
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