// Financial domain types. This layer is the source of truth for money —
// the AI layer only ever READs it or PREPAREs actions against it
// (spec §55, §82).

export type Role = 'owner' | 'admin' | 'adult' | 'teen' | 'child' | 'dependent';

export interface Session {
  userId: string;
  memberId: string;
  name: string;
  role: Role;
  kycStatus: 'none' | 'pending' | 'approved';
  /** Platform operator (approves card orders / KYC) — not a household role. */
  isAdmin: boolean;
}

export interface MemberRow {
  id: string;
  name: string;
  role: Role;
  relationship: string | null;
  monthly_limit: number | null;
  spent_this_month: number;
  temp_allowance_amount: number | null;
  temp_allowance_expires_at: string | null;
  status: 'active' | 'invited';
}

export interface CardRow {
  id: string;
  nickname: string;
  variant: 'personal' | 'family' | 'purpose' | 'temporary' | 'subscription' | 'protected';
  status: 'active' | 'frozen' | 'closed' | 'pending';
  last4: string;
  member_id: string | null;
  monthly_cap: number | null;
  spent_this_month: number;
  approval_above: number | null;
  online: number;
  contactless: number;
  atm: number;
  international: number;
  max_authorization: number | null;
  expiry_note: string | null;
  provider: string;
  provider_card_id: string | null;
}

export interface TransactionRow {
  id: string;
  merchant: string;
  member_id: string;
  card_id: string;
  amount: number;
  direction: 'debit' | 'credit';
  category: string;
  status: 'settled' | 'pending' | 'declined' | 'refunded';
  decline_reason: string | null;
  approved_by: string | null;
  at: string;
}

export interface ApprovalRow {
  id: string;
  requester_id: string;
  card_id: string;
  merchant: string;
  amount: number;
  category: string;
  reason: string;
  requested_at: string;
  expires_at: string;
  status: 'pending' | 'approved' | 'declined' | 'expired';
  resolved_by: string | null;
  resolved_at: string | null;
}

export interface AuditRow {
  id: string;
  kind: 'ai_action' | 'card_event' | 'rule_event' | 'approval_event' | 'security_event' | 'transfer';
  title: string;
  subtitle: string | null;
  amount: number | null;
  member_id: string | null;
  actor: string;
  at: string;
}

// ---------------------------------------------------------------- actions

export type BalanceScope = 'personal' | 'family';

/** Typed PREPARE intents — the only shapes the engine accepts. */
export type ActionIntent =
  | { kind: 'temp_allowance'; memberId: string; amount: number; expiresAt: string }
  | { kind: 'freeze_card'; cardId: string }
  | { kind: 'unfreeze_card'; cardId: string }
  | { kind: 'set_monthly_limit'; memberId: string; amount: number }
  | { kind: 'set_approval_threshold'; cardId: string; amount: number }
  | { kind: 'transfer'; from: BalanceScope; to: BalanceScope; amount: number }
  | {
      kind: 'create_card';
      cardType: 'family' | 'purpose';
      memberId?: string;
      nickname: string;
      monthlyCap?: number;
      approvalAbove?: number;
      initialLoadInr: number;
    }
  | { kind: 'invite_member'; name: string; role: Exclude<Role, 'owner'>; relationship?: string; monthlyLimit?: number }
  | { kind: 'withdraw_crypto'; amountInr: number; toAddress: string };

export interface Fact {
  label: string;
  value: string;
}

export interface PreparedAction {
  id: string;
  kind: ActionIntent['kind'];
  source: 'agent' | 'user';
  subject: string;
  facts: Fact[];
  factsHash: string;
  cta: string;
  note: string;
  expiresAt: string;
  status: 'prepared' | 'executed' | 'cancelled' | 'expired';
}

export interface Receipt {
  actionId: string;
  title: string;
  rows: Fact[];
  actor: string;
  at: string;
  replayed?: boolean;
}

// Errors carry an HTTP-ish code so routes can map them without leaking
// internals (spec §59).
export class DomainError extends Error {
  constructor(
    public code:
      | 'not_found'
      | 'permission_denied'
      | 'invalid_request'
      | 'step_up_required'
      | 'action_expired'
      | 'action_conflict'
      | 'facts_mismatch',
    message: string,
  ) {
    super(message);
  }
}
