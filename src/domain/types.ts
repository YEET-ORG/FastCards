// First-class domain objects (spec §8). This is the mocked shape of the
// financial domain backend — the AI layer never owns any of this state.

import type { MemberHueId } from '@/design/tokens';

export type MemberRole = 'owner' | 'admin' | 'adult' | 'teen' | 'child' | 'dependent';

export interface CategoryBudget {
  key: string;
  label: string;
  cap: number;
  spent: number;
  enabled: boolean;
}

export interface TempAllowance {
  amount: number;
  expiresAt: string; // ISO — rule expiry is always exact (spec UI §49)
  expiresAtLabel: string;
}

export interface Member {
  id: string;
  name: string;
  role: MemberRole;
  relationship?: string;
  initials: string;
  hueId: MemberHueId;
  /** @deprecated resolve via colors.member[hueId] */
  accentColor?: string;
  monthlyLimit?: number; // undefined = no monthly limit (owner)
  spentThisMonth: number;
  tempAllowance?: TempAllowance;
  categories: CategoryBudget[];
  cardIds: string[];
}

export type CardVariant = 'personal' | 'family' | 'purpose' | 'temporary' | 'subscription' | 'protected';
export type CardStatus = 'active' | 'frozen' | 'closed' | 'pending';

export interface CardChannels {
  online: boolean;
  contactless: boolean;
  atm: boolean;
  international: boolean;
}

export interface Card {
  id: string;
  nickname: string;
  variant: CardVariant;
  status: CardStatus;
  last4: string;
  /**
   * Card network, when the issuer reports one. Optional on purpose: the
   * provider currently returns only `last4`, so the UI must not imply a
   * network it has not been told about.
   */
  network?: 'visa' | 'mastercard';
  memberId?: string;
  purpose?: string;
  monthlyCap?: number;
  spentThisMonth: number;
  channels: CardChannels;
  approvalAbove?: number;
  /** Protected/temporary cards only */
  maxAuthorization?: number;
  expiryNote?: string;
}

export type TxnStatus = 'settled' | 'pending' | 'declined' | 'refunded';

export interface Transaction {
  id: string;
  merchant: string;
  memberId: string;
  cardId: string;
  amount: number; // always positive; direction carries the sign
  direction: 'debit' | 'credit';
  category: string;
  status: TxnStatus;
  declineReason?: string;
  approvedBy?: string; // set when the txn went through a one-time approval
  /** Row-subtitle override (e.g. "From Visa *6636"). Optional; the server
   * usually leaves it unset. */
  subtitle?: string;
  at: string; // ISO
}

export type ApprovalStatus = 'pending' | 'approved' | 'declined' | 'expired';

export interface Approval {
  id: string;
  requesterId: string;
  cardId: string;
  merchant: string;
  amount: number;
  category: string;
  reason: string;
  requestedAt: string;
  expiryNote: string;
  status: ApprovalStatus;
  resolvedBy?: string;
  resolvedAt?: string;
}

export type AuditKind = 'ai_action' | 'card_event' | 'rule_event' | 'approval_event' | 'security_event' | 'transfer';

// Universal event ledger entry (spec §30): everything important leaves a
// receipt here, not just transactions.
export interface AuditEvent {
  id: string;
  kind: AuditKind;
  title: string;
  subtitle?: string;
  amount?: number;
  memberId?: string;
  at: string;
}

export interface DomainState {
  balances: { personal: number; family: number };
  household: { name: string; budgetCap: number; budgetSpent: number };
  members: Member[];
  cards: Card[];
  transactions: Transaction[];
  approvals: Approval[];
  events: AuditEvent[];
}
