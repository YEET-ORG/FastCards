// Cache rows → legacy REST row shapes. The generated client rows are
// camelCase with absent optionals; the REST contract (and the app's
// mappers) speak the original SQLite shapes: snake_case, null for
// missing, 0/1 for booleans. Converting here keeps every route and
// service payload byte-compatible with the pre-migration API.

import type {
  ApprovalRow,
  AuditRow,
  CardRow,
  MemberRow,
  TransactionRow,
} from '../types.js';
import type {
  Approvals,
  AuditEvents,
  CardOrders,
  Cards,
  Deposits,
  MemberCategories,
  Members,
  Pool,
  PreparedActions,
  ProviderPool,
  Transactions,
  Users,
  UserWallets,
  Withdrawals,
} from './bindings/types.js';

const orNull = <T>(v: T | undefined): T | null => (v === undefined ? null : v);
const bit = (b: boolean): number => (b ? 1 : 0);

export interface UserRowShape {
  id: string;
  name: string;
  role: string;
  member_id: string;
  deposit_memo: string;
  privy_did: string | null;
  kyc_status: string;
  is_admin: number;
}

export const mapUser = (u: Users): UserRowShape => ({
  id: u.id,
  name: u.name,
  role: u.role,
  member_id: u.memberId,
  deposit_memo: u.depositMemo,
  privy_did: orNull(u.privyDid),
  kyc_status: u.kycStatus,
  is_admin: bit(u.isAdmin),
});

export const mapMember = (m: Members): MemberRow => ({
  id: m.id,
  name: m.name,
  role: m.role as MemberRow['role'],
  relationship: orNull(m.relationship),
  monthly_limit: orNull(m.monthlyLimit),
  spent_this_month: m.spentThisMonth,
  temp_allowance_amount: orNull(m.tempAllowanceAmount),
  temp_allowance_expires_at: orNull(m.tempAllowanceExpiresAt),
  status: m.status as MemberRow['status'],
});

export const mapCategory = (c: MemberCategories) => ({
  key: c.key,
  label: c.label,
  cap: c.cap,
  spent: c.spent,
  enabled: bit(c.enabled),
});

export const mapCard = (c: Cards): CardRow => ({
  id: c.id,
  nickname: c.nickname,
  variant: c.variant as CardRow['variant'],
  status: c.status as CardRow['status'],
  last4: c.last4,
  member_id: orNull(c.memberId),
  monthly_cap: orNull(c.monthlyCap),
  spent_this_month: c.spentThisMonth,
  approval_above: orNull(c.approvalAbove),
  online: bit(c.online),
  contactless: bit(c.contactless),
  atm: bit(c.atm),
  international: bit(c.international),
  max_authorization: orNull(c.maxAuthorization),
  expiry_note: orNull(c.expiryNote),
  provider: c.provider,
  provider_card_id: orNull(c.providerCardId),
});

export const mapTxn = (t: Transactions): TransactionRow => ({
  id: t.id,
  merchant: t.merchant,
  member_id: t.memberId,
  card_id: t.cardId,
  amount: t.amount,
  direction: t.direction as TransactionRow['direction'],
  category: t.category,
  status: t.status as TransactionRow['status'],
  decline_reason: orNull(t.declineReason),
  approved_by: orNull(t.approvedBy),
  at: t.at,
});

export const mapApproval = (a: Approvals): ApprovalRow => ({
  id: a.id,
  requester_id: a.requesterId,
  card_id: a.cardId,
  merchant: a.merchant,
  amount: a.amount,
  category: a.category,
  reason: a.reason,
  requested_at: a.requestedAt,
  expires_at: a.expiresAt,
  status: a.status as ApprovalRow['status'],
  resolved_by: orNull(a.resolvedBy),
  resolved_at: orNull(a.resolvedAt),
});

export const mapAudit = (e: AuditEvents): AuditRow => ({
  id: String(e.id),
  kind: e.kind as AuditRow['kind'],
  title: e.title,
  subtitle: orNull(e.subtitle),
  amount: orNull(e.amount),
  member_id: orNull(e.memberId),
  actor: e.actor,
  at: e.at,
});

export interface PoolRowShape {
  id: string;
  network: string;
  account: string;
  asset_code: string;
  asset_issuer: string | null;
  crypto_reserve_units: number;
  fiat_float_inr: number;
  rate_inr_per_unit: number;
  privy_wallet_id: string | null;
}

export const mapPool = (p: Pool): PoolRowShape => ({
  id: p.id,
  network: p.network,
  account: p.account,
  asset_code: p.assetCode,
  asset_issuer: orNull(p.assetIssuer),
  crypto_reserve_units: p.cryptoReserveUnits,
  fiat_float_inr: p.fiatFloatInr,
  rate_inr_per_unit: p.rateInrPerUnit,
  privy_wallet_id: orNull(p.privyWalletId),
});

export const mapDeposit = (d: Deposits) => ({
  id: d.id,
  tx_hash: d.txHash,
  op_id: d.opId,
  from_address: d.fromAddress,
  asset_code: d.assetCode,
  amount_units: d.amountUnits,
  credited_inr: d.creditedInr,
  memo: orNull(d.memo),
  user_id: orNull(d.userId),
  status: d.status,
  at: d.at,
});

export const mapWithdrawal = (w: Withdrawals) => ({
  id: w.id,
  user_id: w.userId,
  to_address: w.toAddress,
  amount_inr: w.amountInr,
  amount_units: w.amountUnits,
  status: w.status,
  at: w.at,
  tx_hash: orNull(w.txHash),
  error: orNull(w.error),
});

export const mapProviderPool = (p: ProviderPool) => ({
  id: p.id,
  provider: p.provider,
  balance_usd: p.balanceUsd,
  updated_at: p.updatedAt,
});

export const mapOrder = (o: CardOrders) => ({
  id: o.id,
  user_id: o.userId,
  member_id: o.memberId,
  card_type: o.cardType,
  nickname: o.nickname,
  price_inr: o.priceInr,
  price_usd: o.priceUsd,
  expected_units: o.expectedUnits,
  memo: o.memo,
  status: o.status as 'awaiting_payment' | 'paid' | 'issued' | 'rejected',
  deposit_id: orNull(o.depositId),
  provider_card_id: orNull(o.providerCardId),
  reviewed_by: orNull(o.reviewedBy),
  review_note: orNull(o.reviewNote),
  created_at: o.createdAt,
  updated_at: o.updatedAt,
});

export const mapWallet = (w: UserWallets) => ({
  user_id: w.userId,
  address: w.address,
  chain_type: w.chainType,
  source: w.source,
  linked_at: w.linkedAt,
});

export interface PreparedActionRowShape {
  id: string;
  kind: string;
  source: 'agent' | 'user';
  payload_json: string;
  subject: string;
  facts_json: string;
  facts_hash: string;
  cta: string;
  note: string;
  status: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  executed_at: string | null;
  receipt_json: string | null;
}

export const mapPrepared = (p: PreparedActions): PreparedActionRowShape => ({
  id: p.id,
  kind: p.kind,
  source: p.source as 'agent' | 'user',
  payload_json: p.payloadJson,
  subject: p.subject,
  facts_json: p.factsJson,
  facts_hash: p.factsHash,
  cta: p.cta,
  note: p.note,
  status: p.status,
  created_by: p.createdBy,
  created_at: p.createdAt,
  expires_at: p.expiresAt,
  executed_at: orNull(p.executedAt),
  receipt_json: orNull(p.receiptJson),
});
