// Wallet/Crypto Layer — Stellar deposit rail (pseudo-onchain prototype).
//
// Model: one custodial pool account on Stellar; each user gets a unique
// text memo (the standard Stellar exchange-deposit pattern). Users send
// USDC (or XLM in demo mode) to the pool account with their memo; a
// Horizon poller attributes payments by memo, converts at the pool's
// INR rate, credits the household's fiat balance, and records the
// deposit + audit event. The "pool" is the conversion venue: its crypto
// reserve grows, its INR float shrinks by the credited amount — card
// spending settles from the float (via KripiCard in USD).
//
// Uses Horizon's public REST API directly (testnet by default). The
// fetch function is injectable so tests run against a fake Horizon.
// Attribution decisions happen here against the live cache; each
// accepted payment is recorded through one reducer so its deposit row,
// pool movement, balance credit, transaction, and audit land atomically.

import { randomUUID } from 'node:crypto';

import type { Stdb } from '../stdb/client.js';
import { mapDeposit, mapUser } from '../stdb/rows.js';
import { DomainError, type Session } from '../types.js';
import { getPool } from '../services/readModel.js';

const HORIZON_URL = process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';

interface HorizonPayment {
  id: string;
  type: string;
  transaction_hash: string;
  asset_type?: string; // 'native' | 'credit_alphanum4' | ...
  asset_code?: string;
  asset_issuer?: string;
  amount?: string;
  from?: string;
  to?: string;
  created_at?: string;
  transaction?: { memo?: string; memo_type?: string };
}

export interface DepositIntent {
  network: string;
  address: string;
  memo: string;
  memoType: 'text';
  asset: string;
  assetIssuer: string | null;
  rateInrPerUnit: number;
  note: string;
}

/** What the user needs to make a deposit: pool address + their memo. */
export function getDepositIntent(stdb: Stdb, session: Session): DepositIntent {
  const pool = getPool(stdb);
  const user = stdb.db.users.id.find(session.userId);
  if (!user?.depositMemo) {
    throw new DomainError('invalid_request', 'No deposit memo is set for this account.');
  }
  return {
    network: pool.network,
    address: pool.account,
    memo: user.depositMemo,
    memoType: 'text',
    asset: pool.asset_code,
    assetIssuer: pool.asset_issuer,
    rateInrPerUnit: pool.rate_inr_per_unit,
    note: `Send ${pool.asset_code} on Stellar ${pool.network} to this address WITH the memo — deposits without the memo can't be attributed automatically.`,
  };
}

/**
 * Poll Horizon for new incoming payments to the pool account and credit
 * matched users. Cursor-persistent and idempotent: an operation id is
 * credited at most once even if polling overlaps (the reducer enforces
 * op-id uniqueness transactionally).
 */
export async function syncDeposits(
  stdb: Stdb,
  fetchFn: typeof fetch = fetch,
): Promise<{ credited: number; unattributed: number; orderPayments: number; checked: number }> {
  const pool = getPool(stdb);
  const cursor = stdb.db.syncState.k.find('horizon_cursor')?.v ?? '';

  const url =
    `${HORIZON_URL}/accounts/${pool.account}/payments` +
    `?order=asc&limit=100&join=transactions${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;

  const res = await fetchFn(url);
  if (!res.ok) {
    // 404 = pool account not funded/created yet on this network — not an error worth crashing on.
    if (res.status === 404) return { credited: 0, unattributed: 0, orderPayments: 0, checked: 0 };
    throw new Error(`Horizon returned ${res.status}`);
  }
  const body: any = await res.json();
  const records: HorizonPayment[] = body?._embedded?.records ?? [];

  let credited = 0;
  let unattributed = 0;
  let orderPayments = 0;
  let lastCursor = cursor;

  for (const p of records) {
    lastCursor = p.id;
    if (p.type !== 'payment' || p.to !== pool.account) continue;

    // Asset must match the pool's asset (native XLM allowed in demo mode).
    const isNative = p.asset_type === 'native';
    const code = isNative ? 'XLM' : p.asset_code;
    const issuerOk = isNative || !pool.asset_issuer || p.asset_issuer === pool.asset_issuer;
    if (code !== pool.asset_code || !issuerOk) continue;

    // Unique-column accessors expose find() at runtime (typings lag).
    const seen = (stdb.db.deposits.opId as unknown as { find(v: string): unknown }).find(p.id);
    if (seen) continue;

    const amountUnits = Number(p.amount ?? 0);
    if (!(amountUnits > 0)) continue;

    const memo = p.transaction?.memo ?? undefined;
    const at = p.created_at ?? new Date().toISOString();

    // Card-order payments (ORD-… memos) belong to the order, not the
    // general balance: record the deposit, grow the crypto reserve, and
    // mark the order paid for admin review.
    if (memo) {
      const order = [...stdb.db.cardOrders.iter()].find(
        (o) => o.memo === memo && o.status === 'awaiting_payment',
      );
      if (order) {
        await stdb.call((r) =>
          r.recordOrderPayment({
            depositId: `dep-${randomUUID()}`,
            txHash: p.transaction_hash,
            opId: p.id,
            fromAddress: p.from ?? '',
            assetCode: code!,
            amountUnits,
            memo,
            at,
          }),
        );
        orderPayments += 1;
        continue;
      }
    }

    // Attribution: memo first (authoritative), then a linked wallet
    // address (synced from Privy or registered manually).
    let user = memo
      ? [...stdb.db.users.iter()].find((u) => u.depositMemo === memo)
      : undefined;
    if (!user && p.from) {
      const wallet = [...stdb.db.userWallets.address.filter(p.from)][0];
      if (wallet) user = stdb.db.users.id.find(wallet.userId) ?? undefined;
    }

    const creditedInr = Math.floor(amountUnits * pool.rate_inr_per_unit);

    if (!user) {
      // Unattributed: hold it, never guess an owner (spec: money state is never ambiguous).
      await stdb.call((r) =>
        r.recordDeposit({
          id: `dep-${randomUUID()}`,
          txHash: p.transaction_hash,
          opId: p.id,
          fromAddress: p.from ?? '',
          assetCode: code!,
          amountUnits,
          creditedInr,
          memo,
          userId: undefined,
          memberId: undefined,
          scope: undefined,
          at,
          credited: false,
        }),
      );
      unattributed += 1;
      continue;
    }

    // Credit: pool converts crypto → INR spending balance.
    const u = mapUser(user);
    const scope = u.role === 'owner' || u.role === 'admin' ? 'personal' : 'family';
    await stdb.call((r) =>
      r.recordDeposit({
        id: `dep-${randomUUID()}`,
        txHash: p.transaction_hash,
        opId: p.id,
        fromAddress: p.from ?? '',
        assetCode: code!,
        amountUnits,
        creditedInr,
        memo,
        userId: u.id,
        memberId: u.member_id,
        scope,
        at,
        credited: true,
      }),
    );
    credited += 1;
  }

  if (lastCursor !== cursor) {
    await stdb.call((r) => r.setSyncCursor({ v: lastCursor }));
  }

  return { credited, unattributed, orderPayments, checked: records.length };
}

export function listDeposits(stdb: Stdb, session: Session) {
  const rows = [...stdb.db.deposits.iter()]
    .map(mapDeposit)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 50);
  if (session.role === 'owner' || session.role === 'admin') return rows;
  return rows.filter((d) => d.user_id === session.userId);
}
