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
// until real bridging automates the middle. State transitions live in
// reducers; this layer sequences the provider call in between.

import { randomUUID } from 'node:crypto';

import { assertAdmin } from '../authz.js';
import type { CardProvider } from '../cards/provider.js';
import type { Stdb } from '../stdb/client.js';
import { mapOrder, mapProviderPool, mapUser } from '../stdb/rows.js';
import { DomainError, type Session } from '../types.js';
import { getPool } from './readModel.js';

/** Card price: $10 provider load + $2 platform fee. */
const CARD_PRICE_USD = Number(process.env.CARD_PRICE_USD ?? 12);
const CARD_LOAD_USD = 10;
const USD_INR = Number(process.env.USD_INR_RATE ?? 88);

export type CardOrderRow = ReturnType<typeof mapOrder>;

// ------------------------------------------------------------------ KYC

export async function submitKyc(
  stdb: Stdb,
  session: Session,
  details: { fullName: string; document: string },
): Promise<{ status: string }> {
  if (session.kycStatus === 'approved') return { status: 'approved' };
  await stdb.call((r) =>
    r.submitKyc({
      userId: session.userId,
      actorName: session.name,
      fullName: details.fullName,
      document: details.document,
    }),
  );
  return { status: 'pending' };
}

export async function adminReviewKyc(
  stdb: Stdb,
  session: Session,
  userId: string,
  approve: boolean,
): Promise<{ status: string }> {
  assertAdmin(session);
  await stdb.call((r) => r.adminReviewKyc({ userId, approve, adminName: session.name }));
  return { status: approve ? 'approved' : 'none' };
}

// ----------------------------------------------------------- user side

export async function createCardOrder(
  stdb: Stdb,
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

  const stellarPool = getPool(stdb);
  const priceInr = Math.ceil(CARD_PRICE_USD * USD_INR);
  const expectedUnits = Math.ceil((priceInr / stellarPool.rate_inr_per_unit) * 1e7) / 1e7;
  const memo = `ORD-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  const id = `ord-${randomUUID().slice(0, 8)}`;

  await stdb.call((r) =>
    r.createCardOrder({
      id,
      userId: session.userId,
      memberId,
      cardType: input.cardType,
      nickname,
      priceInr,
      priceUsd: CARD_PRICE_USD,
      expectedUnits,
      memo,
      actorName: session.name,
    }),
  );

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

export function listMyOrders(stdb: Stdb, session: Session): CardOrderRow[] {
  return [...stdb.db.cardOrders.userId.filter(session.userId)]
    .map(mapOrder)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

// ---------------------------------------------------------- admin side

export function adminListOrders(stdb: Stdb, session: Session) {
  assertAdmin(session);
  const providerPool = getProviderPool(stdb);
  const orders = [...stdb.db.cardOrders.iter()]
    .map((o) => {
      const user = stdb.db.users.id.find(o.userId);
      return {
        ...mapOrder(o),
        user_name: user?.name ?? o.userId,
        kyc_status: user?.kycStatus ?? 'none',
      };
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return { providerPool, orders };
}

export function getProviderPool(stdb: Stdb) {
  const p = [...stdb.db.providerPool.iter()][0];
  if (!p) throw new DomainError('not_found', 'Provider pool not configured.');
  return mapProviderPool(p);
}

export async function adminSetProviderPool(stdb: Stdb, session: Session, balanceUsd: number) {
  assertAdmin(session);
  if (!Number.isFinite(balanceUsd) || balanceUsd < 0) {
    throw new DomainError('invalid_request', 'Balance must be a non-negative number.');
  }
  await stdb.call((r) => r.adminSetProviderPool({ balanceUsd, adminName: session.name }));
  return getProviderPool(stdb);
}

/**
 * Admin approval — the human bridge. Verifies both pools before
 * issuing: the Stellar payment landed, and the provider float covers
 * the card. Provider issuance happens before any local state changes;
 * the reducer then re-verifies both checks transactionally.
 */
export async function adminApproveOrder(
  stdb: Stdb,
  session: Session,
  provider: CardProvider,
  orderId: string,
): Promise<{ orderId: string; cardId: string; last4: string }> {
  assertAdmin(session);
  const raw = stdb.db.cardOrders.id.find(orderId);
  if (!raw) throw new DomainError('not_found', 'Order not found.');
  const order = mapOrder(raw);
  if (order.status === 'issued') throw new DomainError('action_conflict', 'Order already issued.');
  if (order.status === 'rejected') throw new DomainError('action_conflict', 'Order was rejected.');

  // Check 1: payment actually received (matched deposit, full amount).
  if (order.status !== 'paid' || !order.deposit_id) {
    throw new DomainError('invalid_request', 'Payment has not been received for this order yet.');
  }
  if (!stdb.db.deposits.id.find(order.deposit_id)) {
    throw new DomainError('invalid_request', 'Linked deposit record is missing.');
  }

  // Check 2: enough USD float in the provider pool.
  const providerPool = getProviderPool(stdb);
  if (providerPool.balance_usd < order.price_usd) {
    throw new DomainError(
      'action_conflict',
      `Provider pool has $${providerPool.balance_usd} but the card needs $${order.price_usd}. Top up the ${providerPool.provider} float first.`,
    );
  }

  const member = stdb.db.members.id.find(order.member_id);

  // Issue at the provider first; local state only changes on success.
  const issued = await provider.issueCard({ amountUsd: CARD_LOAD_USD, firstName: member?.name });

  const cardId = `c-${randomUUID().slice(0, 8)}`;
  const last4 = issued.last4 ?? String(Math.floor(1000 + Math.random() * 9000));

  await stdb.call((r) =>
    r.adminApproveOrder({
      orderId,
      providerCardId: issued.providerCardId,
      providerName: provider.name,
      newCardId: cardId,
      newLast4: last4,
      adminName: session.name,
    }),
  );

  return { orderId, cardId, last4 };
}

export async function adminRejectOrder(stdb: Stdb, session: Session, orderId: string, note: string) {
  assertAdmin(session);
  const raw = stdb.db.cardOrders.id.find(orderId);
  if (!raw) throw new DomainError('not_found', 'Order not found.');
  const order = mapOrder(raw);
  await stdb.call((r) => r.adminRejectOrder({ orderId, note, adminName: session.name }));
  return { orderId, status: 'rejected', refundDue: Boolean(order.deposit_id) };
}

/** Admin KYC queue (pending submissions). */
export function adminListPendingKyc(stdb: Stdb) {
  return [...stdb.db.users.iter()]
    .filter((u) => u.kycStatus === 'pending')
    .map((u) => {
      const m = mapUser(u);
      return { id: m.id, name: m.name, kyc_status: m.kyc_status };
    });
}
