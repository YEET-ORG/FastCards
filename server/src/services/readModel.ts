// READ layer — every query is scoped by the caller's session. The AI's
// READ tools call these same functions, so context can never widen
// permissions (spec §13.4). Reads come from the gateway's live
// SpacetimeDB subscription cache (the Node process is the sole writer,
// and reducer calls resolve only after the cache has applied their
// transaction, so reads here are always current).

import { listAudit } from '../audit.js';
import { canReadMember, isManager } from '../authz.js';
import type { Stdb } from '../stdb/client.js';
import {
  mapApproval,
  mapCard,
  mapCategory,
  mapMember,
  mapPool,
  mapTxn,
  type PoolRowShape,
} from '../stdb/rows.js';
import {
  DomainError,
  type ApprovalRow,
  type CardRow,
  type MemberRow,
  type Session,
  type TransactionRow,
} from '../types.js';

export function getOverview(stdb: Stdb, session: Session) {
  const h = [...stdb.db.household.iter()][0];
  const household = { name: h?.name ?? '', budget_cap: h?.budgetCap ?? 0, budget_spent: h?.budgetSpent ?? 0 };
  const balances = Object.fromEntries([...stdb.db.balances.iter()].map((b) => [b.scope, b.amount]));
  if (isManager(session)) {
    return { household, balances, scope: 'household' as const };
  }
  const self = getMember(stdb, session, session.memberId);
  return {
    household: { name: household.name },
    balances: {},
    self,
    scope: 'member' as const,
  };
}

export function listMembers(stdb: Stdb, session: Session) {
  const rows = [...stdb.db.members.iter()].map(mapMember);
  const visible = isManager(session) ? rows : rows.filter((m) => m.id === session.memberId);
  return visible.map((m) => ({
    ...m,
    categories: [...stdb.db.memberCategories.memberId.filter(m.id)].map(mapCategory),
  }));
}

export function getMember(stdb: Stdb, session: Session, memberId: string): MemberRow & {
  categories: { key: string; label: string; cap: number; spent: number; enabled: number }[];
  remaining: number | null;
} {
  if (!canReadMember(session, memberId)) {
    throw new DomainError('permission_denied', 'You can only view your own activity.');
  }
  const raw = stdb.db.members.id.find(memberId);
  if (!raw) throw new DomainError('not_found', 'Member not found.');
  const m = mapMember(raw);
  const categories = [...stdb.db.memberCategories.memberId.filter(memberId)].map(mapCategory);
  const temp = activeTempAllowance(m);
  const remaining =
    m.monthly_limit === null ? null : m.monthly_limit + temp - m.spent_this_month;
  return { ...m, categories, remaining };
}

/** Temp allowance counts only until its exact expiry (spec UI §49). */
export function activeTempAllowance(m: MemberRow): number {
  if (!m.temp_allowance_amount || !m.temp_allowance_expires_at) return 0;
  return new Date(m.temp_allowance_expires_at).getTime() > Date.now()
    ? m.temp_allowance_amount
    : 0;
}

export function listCards(stdb: Stdb, session: Session): CardRow[] {
  const rows = [...stdb.db.cards.iter()].map(mapCard);
  return isManager(session) ? rows : rows.filter((c) => c.member_id === session.memberId);
}

export function getCard(stdb: Stdb, session: Session, cardId: string): CardRow {
  const raw = stdb.db.cards.id.find(cardId);
  if (!raw) throw new DomainError('not_found', 'Card not found.');
  const c = mapCard(raw);
  if (!isManager(session) && c.member_id !== session.memberId) {
    throw new DomainError('permission_denied', 'You can only view your own cards.');
  }
  return c;
}

export function listTransactions(
  stdb: Stdb,
  session: Session,
  filter: { memberId?: string; cardId?: string; limit?: number } = {},
): TransactionRow[] {
  const limit = Math.min(filter.limit ?? 50, 200);
  let rows = [...stdb.db.transactions.iter()]
    .map(mapTxn)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit * 2);
  if (!isManager(session)) rows = rows.filter((t) => t.member_id === session.memberId);
  if (filter.memberId) {
    if (!canReadMember(session, filter.memberId)) {
      throw new DomainError('permission_denied', 'You can only view your own activity.');
    }
    rows = rows.filter((t) => t.member_id === filter.memberId);
  }
  if (filter.cardId) rows = rows.filter((t) => t.card_id === filter.cardId);
  return rows.slice(0, limit);
}

export function listApprovals(stdb: Stdb, session: Session): ApprovalRow[] {
  const rows = [...stdb.db.approvals.iter()]
    .map(mapApproval)
    .sort((a, b) => (a.requested_at < b.requested_at ? 1 : -1));
  return isManager(session) ? rows : rows.filter((a) => a.requester_id === session.memberId);
}

export function getActivity(stdb: Stdb, session: Session) {
  if (!isManager(session)) {
    // Members see their own transactions plus audit rows about them.
    return {
      transactions: listTransactions(stdb, session),
      events: listAudit(stdb).filter((e) => e.member_id === session.memberId),
    };
  }
  return { transactions: listTransactions(stdb, session), events: listAudit(stdb) };
}

export function getPool(stdb: Stdb): PoolRowShape {
  const p = [...stdb.db.pool.iter()][0];
  if (!p) throw new DomainError('not_found', 'Pool not configured.');
  return mapPool(p);
}
