// READ layer — every query is scoped by the caller's session. The AI's
// READ tools call these same functions, so context can never widen
// permissions (spec §13.4).

import { listAudit } from '../audit.js';
import { canReadMember, isManager } from '../authz.js';
import type { DB } from '../db.js';
import {
  DomainError,
  type ApprovalRow,
  type CardRow,
  type MemberRow,
  type Session,
  type TransactionRow,
} from '../types.js';

export function getOverview(db: DB, session: Session) {
  const household = db.prepare('SELECT * FROM household').get() as {
    name: string;
    budget_cap: number;
    budget_spent: number;
  };
  const balances = Object.fromEntries(
    (db.prepare('SELECT scope, amount FROM balances').all() as { scope: string; amount: number }[]).map(
      (b) => [b.scope, b.amount],
    ),
  );
  if (isManager(session)) {
    return { household, balances, scope: 'household' as const };
  }
  const self = getMember(db, session, session.memberId);
  return {
    household: { name: household.name },
    balances: {},
    self,
    scope: 'member' as const,
  };
}

export function listMembers(db: DB, session: Session) {
  const rows = db.prepare('SELECT * FROM members').all() as unknown as MemberRow[];
  const visible = isManager(session) ? rows : rows.filter((m) => m.id === session.memberId);
  const catStmt = db.prepare(
    'SELECT key, label, cap, spent, enabled FROM member_categories WHERE member_id = ?',
  );
  return visible.map((m) => ({ ...m, categories: catStmt.all(m.id) }));
}

export function getMember(db: DB, session: Session, memberId: string): MemberRow & {
  categories: { key: string; label: string; cap: number; spent: number; enabled: number }[];
  remaining: number | null;
} {
  if (!canReadMember(session, memberId)) {
    throw new DomainError('permission_denied', 'You can only view your own activity.');
  }
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId) as
    | MemberRow
    | undefined;
  if (!m) throw new DomainError('not_found', 'Member not found.');
  const categories = db
    .prepare('SELECT key, label, cap, spent, enabled FROM member_categories WHERE member_id = ?')
    .all(memberId) as { key: string; label: string; cap: number; spent: number; enabled: number }[];
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

export function listCards(db: DB, session: Session): CardRow[] {
  const rows = db.prepare('SELECT * FROM cards').all() as unknown as CardRow[];
  return isManager(session) ? rows : rows.filter((c) => c.member_id === session.memberId);
}

export function getCard(db: DB, session: Session, cardId: string): CardRow {
  const c = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as CardRow | undefined;
  if (!c) throw new DomainError('not_found', 'Card not found.');
  if (!isManager(session) && c.member_id !== session.memberId) {
    throw new DomainError('permission_denied', 'You can only view your own cards.');
  }
  return c;
}

export function listTransactions(
  db: DB,
  session: Session,
  filter: { memberId?: string; cardId?: string; limit?: number } = {},
): TransactionRow[] {
  const limit = Math.min(filter.limit ?? 50, 200);
  let rows = db
    .prepare('SELECT * FROM transactions ORDER BY at DESC LIMIT ?')
    .all(limit * 2) as unknown as TransactionRow[];
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

export function listApprovals(db: DB, session: Session): ApprovalRow[] {
  const rows = db
    .prepare('SELECT * FROM approvals ORDER BY requested_at DESC')
    .all() as unknown as ApprovalRow[];
  return isManager(session) ? rows : rows.filter((a) => a.requester_id === session.memberId);
}

export function getActivity(db: DB, session: Session) {
  if (!isManager(session)) {
    // Members see their own transactions plus audit rows about them.
    return {
      transactions: listTransactions(db, session),
      events: listAudit(db).filter((e) => e.member_id === session.memberId),
    };
  }
  return { transactions: listTransactions(db, session), events: listAudit(db) };
}

export function getPool(db: DB) {
  return db.prepare('SELECT * FROM pool').get() as {
    id: string;
    network: string;
    account: string;
    asset_code: string;
    asset_issuer: string | null;
    crypto_reserve_units: number;
    fiat_float_inr: number;
    rate_inr_per_unit: number;
  };
}
