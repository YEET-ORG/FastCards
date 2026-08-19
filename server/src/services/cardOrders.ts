// Card purchase pipeline (two pools + admin in between):
//
//   user (KYC'd) orders a card
//     → pays into the Stellar pool with a per-order memo
//     → deposit sync marks the order PAID
//     → an admin reviews: payment received? enough USD float in the
//       provider pool (KripiCard)? → approve issues the card, deducts
//       the provider float, and hands the card to the user
//
// Manual on purpose — the admin *is* the bridge between the two pools
// until real bridging automates the middle.

import { randomUUID } from 'node:crypto';

import { appendAudit } from '../audit.js';
import { assertAdmin } from '../authz.js';
import type { CardProvider } from '../cards/provider.js';
import type { DB } from '../db.js';
import { DomainError, type Session } from '../types.js';
import { getPool } from './readModel.js';

/** Card price: $10 provider load + $2 platform fee. */
const CARD_PRICE_USD = Number(process.env.CARD_PRICE_USD ?? 12);
const CARD_LOAD_USD = 10;
const USD_INR = Number(process.env.USD_INR_RATE ?? 88);

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export interface CardOrderRow {
  id: string;
  user_id: string;
  member_id: string;
  card_type: string;
  nickname: string;
  price_inr: number;
  price_usd: number;
  expected_units: number;
  memo: string;
  status: 'awaiting_payment' | 'paid' | 'issued' | 'rejected';
  deposit_id: string | null;
  provider_card_id: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------------------------ KYC

export function submitKyc(db: DB, session: Session, details: { fullName: string; document: string }): {
  status: string;
} {
  if (session.kycStatus === 'approved') return { status: 'approved' };
  db.prepare("UPDATE users SET kyc_status='pending' WHERE id=?").run(session.userId);
  appendAudit(db, {
    kind: 'security_event',
    title: `KYC submitted — ${session.name}`,
    subtitle: `${details.fullName} · ${details.document.slice(0, 24)}`,
    memberId: session.memberId,
    actor: session.name,
  });
  return { status: 'pending' };
}

export function adminReviewKyc(
  db: DB,
  session: Session,
  userId: string,
  approve: boolean,
): { status: string } {
  assertAdmin(session);
  const user = db.prepare('SELECT id, name, kyc_status FROM users WHERE id=?').get(userId) as
    | { id: string; name: string; kyc_status: string }
    | undefined;
  if (!user) throw new DomainError('not_found', 'User not found.');
  const status = approve ? 'approved' : 'none';
  db.prepare('UPDATE users SET kyc_status=? WHERE id=?').run(status, userId);
  appendAudit(db, {
    kind: 'security_event',
    title: `KYC ${approve ? 'approved' : 'rejected'} — ${user.name}`,
    subtitle: `By admin ${session.name}`,
    actor: session.name,
  });
  return { status };
}

// ----------------------------------------------------------- user side

export function createCardOrder(
  db: DB,
  session: Session,
  input: { cardType: 'personal' | 'family' | 'purpose'; nickname: string; memberId?: string },
) {
  if (session.kycStatus !== 'approved') {
    throw new DomainError(
      'invalid_request',
      session.kycStatus === 'pending'
        ? 'Your KYC is under review — you can order a card once it is approved.'
        : 'Complete KYC before ordering a card.',
    );
  }
  const nickname = input.nickname.trim();
  if (nickname.length < 2 || nickname.length > 40) {
    throw new DomainError('invalid_request', 'Card name must be 2-40 characters.');
  }
  const memberId = input.memberId ?? session.memberId;
  if (memberId !== session.memberId && session.role !== 'owner' && session.role !== 'admin') {
    throw new DomainError('permission_denied', 'You can only order cards for yourself.');
  }

  const stellarPool = getPool(db);
  const priceInr = Math.ceil(CARD_PRICE_USD * USD_INR);
  const expectedUnits = Math.ceil((priceInr / stellarPool.rate_inr_per_unit) * 1e7) / 1e7;
  const memo = `ORD-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const id = `ord-${randomUUID().slice(0, 8)}`;

  db.prepare(
    `INSERT INTO card_orders (id,user_id,member_id,card_type,nickname,price_inr,price_usd,expected_units,memo,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,'awaiting_payment',?,?)`,
  ).run(id, session.userId, memberId, input.cardType, nickname, priceInr, CARD_PRICE_USD, expectedUnits, memo, now, now);

  appendAudit(db, {
    kind: 'card_event',
    title: `Card ordered — ${nickname}`,
    subtitle: `${inr(priceInr)} · awaiting Stellar payment · ${session.name}`,
    memberId,
    actor: session.name,
  });

  return {
    orderId: id,
    status: 'awaiting_payment',
    payment: {
      network: stellarPool.network,
      address: stellarPool.account,
      memo,
      memoType: 'text',
      asset: stellarPool.asset_code,
      amountUnits: expectedUnits,
      note: `Send exactly ${expectedUnits} ${stellarPool.asset_code} with memo ${memo}. The order is reviewed once payment lands.`,
    },
    priceInr,
    priceUsd: CARD_PRICE_USD,
  };
}

export function listMyOrders(db: DB, session: Session): CardOrderRow[] {
  return db
    .prepare('SELECT * FROM card_orders WHERE user_id=? ORDER BY created_at DESC')
    .all(session.userId) as unknown as CardOrderRow[];
}

/**
 * Called by the Stellar deposit sync when an incoming payment's memo
 * matches an order. Returns true when consumed (the deposit belongs to
 * the order, not the general balance).
 */
export function applyOrderPayment(
  db: DB,
  memo: string,
  depositId: string,
  amountUnits: number,
): boolean {
  const order = db.prepare("SELECT * FROM card_orders WHERE memo=? AND status='awaiting_payment'").get(memo) as
    | CardOrderRow
    | undefined;
  if (!order) return false;

  const paidEnough = amountUnits + 1e-7 >= order.expected_units;
  db.prepare('UPDATE card_orders SET status=?, deposit_id=?, review_note=?, updated_at=? WHERE id=?').run(
    paidEnough ? 'paid' : 'awaiting_payment',
    depositId,
    paidEnough ? null : `Underpaid: got ${amountUnits}, expected ${order.expected_units}`,
    new Date().toISOString(),
    order.id,
  );
  appendAudit(db, {
    kind: 'transfer',
    title: paidEnough ? `Order payment received — ${order.nickname}` : `Order underpaid — ${order.nickname}`,
    subtitle: `${amountUnits} units · memo ${memo}`,
    memberId: order.member_id,
    actor: 'stellar-rail',
  });
  return true;
}

// ---------------------------------------------------------- admin side

export function adminListOrders(db: DB, session: Session) {
  assertAdmin(session);
  const providerPool = getProviderPool(db);
  const orders = db
    .prepare(
      `SELECT o.*, u.name AS user_name, u.kyc_status FROM card_orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC`,
    )
    .all() as unknown as (CardOrderRow & { user_name: string; kyc_status: string })[];
  return { providerPool, orders };
}

export function getProviderPool(db: DB) {
  return db.prepare('SELECT * FROM provider_pool ORDER BY id LIMIT 1').get() as {
    id: string;
    provider: string;
    balance_usd: number;
    updated_at: string;
  };
}

export function adminSetProviderPool(db: DB, session: Session, balanceUsd: number) {
  assertAdmin(session);
  if (!Number.isFinite(balanceUsd) || balanceUsd < 0) {
    throw new DomainError('invalid_request', 'Balance must be a non-negative number.');
  }
  db.prepare('UPDATE provider_pool SET balance_usd=?, updated_at=?').run(balanceUsd, new Date().toISOString());
  appendAudit(db, {
    kind: 'security_event',
    title: `Provider pool updated — $${balanceUsd}`,
    subtitle: `By admin ${session.name}`,
    actor: session.name,
  });
  return getProviderPool(db);
}

/**
 * Admin approval — the human bridge. Verifies both pools before
 * issuing: the Stellar payment landed, and the provider float covers
 * the card. Provider issuance happens before any local state changes.
 */
export async function adminApproveOrder(
  db: DB,
  session: Session,
  provider: CardProvider,
  orderId: string,
): Promise<{ orderId: string; cardId: string; last4: string }> {
  assertAdmin(session);
  const order = db.prepare('SELECT * FROM card_orders WHERE id=?').get(orderId) as CardOrderRow | undefined;
  if (!order) throw new DomainError('not_found', 'Order not found.');
  if (order.status === 'issued') throw new DomainError('action_conflict', 'Order already issued.');
  if (order.status === 'rejected') throw new DomainError('action_conflict', 'Order was rejected.');

  // Check 1: payment actually received (matched deposit, full amount).
  if (order.status !== 'paid' || !order.deposit_id) {
    throw new DomainError('invalid_request', 'Payment has not been received for this order yet.');
  }
  const deposit = db.prepare('SELECT id FROM deposits WHERE id=?').get(order.deposit_id);
  if (!deposit) throw new DomainError('invalid_request', 'Linked deposit record is missing.');

  // Check 2: enough USD float in the provider pool.
  const providerPool = getProviderPool(db);
  if (providerPool.balance_usd < order.price_usd) {
    throw new DomainError(
      'action_conflict',
      `Provider pool has $${providerPool.balance_usd} but the card needs $${order.price_usd}. Top up the ${providerPool.provider} float first.`,
    );
  }

  const member = db.prepare('SELECT name FROM members WHERE id=?').get(order.member_id) as
    | { name: string }
    | undefined;

  // Issue at the provider first; local state only changes on success.
  const issued = await provider.issueCard({ amountUsd: CARD_LOAD_USD, firstName: member?.name });

  const cardId = `c-${randomUUID().slice(0, 8)}`;
  const last4 = String(Math.floor(1000 + Math.random() * 9000));
  const now = new Date().toISOString();
  const variant = order.card_type === 'family' ? 'family' : order.card_type === 'purpose' ? 'purpose' : 'personal';

  db.prepare(
    `INSERT INTO cards (id,nickname,variant,status,last4,member_id,monthly_cap,spent_this_month,approval_above,online,contactless,atm,international,max_authorization,expiry_note,provider,provider_card_id)
     VALUES (?,?,?,?,?,?,NULL,0,NULL,1,1,0,0,NULL,NULL,?,?)`,
  ).run(cardId, order.nickname, variant, 'active', last4, order.member_id, provider.name, issued.providerCardId);
  db.prepare('UPDATE provider_pool SET balance_usd = balance_usd - ?, updated_at=?').run(order.price_usd, now);
  db.prepare(
    "UPDATE card_orders SET status='issued', provider_card_id=?, reviewed_by=?, updated_at=? WHERE id=?",
  ).run(issued.providerCardId, session.name, now, orderId);

  appendAudit(db, {
    kind: 'card_event',
    title: `Card issued — ${order.nickname} •••• ${last4}`,
    subtitle: `Order ${orderId} approved by admin ${session.name} · $${order.price_usd} from provider pool`,
    amount: order.price_inr,
    memberId: order.member_id,
    actor: session.name,
  });

  return { orderId, cardId, last4 };
}

export function adminRejectOrder(db: DB, session: Session, orderId: string, note: string) {
  assertAdmin(session);
  const order = db.prepare('SELECT * FROM card_orders WHERE id=?').get(orderId) as CardOrderRow | undefined;
  if (!order) throw new DomainError('not_found', 'Order not found.');
  if (order.status === 'issued') throw new DomainError('action_conflict', 'Order already issued.');
  db.prepare("UPDATE card_orders SET status='rejected', reviewed_by=?, review_note=?, updated_at=? WHERE id=?").run(
    session.name,
    note.slice(0, 300),
    new Date().toISOString(),
    orderId,
  );
  appendAudit(db, {
    kind: 'card_event',
    title: `Card order rejected — ${order.nickname}`,
    subtitle: `${note.slice(0, 80)} · admin ${session.name}${order.deposit_id ? ' · refund due' : ''}`,
    memberId: order.member_id,
    actor: session.name,
  });
  return { orderId, status: 'rejected', refundDue: Boolean(order.deposit_id) };
}
