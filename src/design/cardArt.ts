import type { Card } from '@/domain/types';

export type CardArtId =
  | 'rohan-personal'
  | 'maya-everyday'
  | 'arjun-school'
  | 'dad'
  | 'subscriptions'
  | 'protected-checkout'
  | 'purpose-groceries'
  | 'teen-allowance'
  | 'merchant-locked'
  | 'family-pool'
  | 'custom-physical'
  | 'temporary-24h';

export const CARD_ART: Record<CardArtId, number> = {
  'rohan-personal': require('../../assets/cards/rohan-personal.png'),
  'maya-everyday': require('../../assets/cards/maya-everyday.png'),
  'arjun-school': require('../../assets/cards/arjun-school.png'),
  dad: require('../../assets/cards/dad.png'),
  subscriptions: require('../../assets/cards/subscriptions.png'),
  'protected-checkout': require('../../assets/cards/protected-checkout.png'),
  'purpose-groceries': require('../../assets/cards/purpose-groceries.png'),
  'teen-allowance': require('../../assets/cards/teen-allowance.png'),
  'merchant-locked': require('../../assets/cards/merchant-locked.png'),
  'family-pool': require('../../assets/cards/family-pool.png'),
  'custom-physical': require('../../assets/cards/custom-physical.png'),
  'temporary-24h': require('../../assets/cards/temporary-24h.png'),
};

const BY_MEMBER: Record<string, CardArtId> = {
  'm-rohan': 'rohan-personal',
  'm-maya': 'maya-everyday',
  'm-arjun': 'arjun-school',
  'm-dad': 'dad',
};

const BY_SEED: Record<string, CardArtId> = {
  'c-personal': 'rohan-personal',
  'c-maya': 'maya-everyday',
  'c-arjun': 'arjun-school',
  'c-dad': 'dad',
  'c-subs': 'subscriptions',
  'c-amzn': 'protected-checkout',
};

export function artIdForCard(card: Card): CardArtId {
  if (card.memberId && BY_MEMBER[card.memberId]) return BY_MEMBER[card.memberId];
  if (BY_SEED[card.id]) return BY_SEED[card.id];
  switch (card.variant) {
    case 'personal':
      return 'rohan-personal';
    case 'subscription':
      return 'subscriptions';
    case 'protected':
      return 'protected-checkout';
    case 'purpose':
      return 'purpose-groceries';
    case 'temporary':
      return 'temporary-24h';
    case 'family':
      return card.memberId ? 'teen-allowance' : 'family-pool';
  }
}
