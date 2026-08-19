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

import { randomUUID } from 'node:crypto';

import { appendAudit } from '../audit.js';
import type { DB } from '../db.js';
import { DomainError, type Session } from '../types.js';
import { applyOrderPayment } from '../services/cardOrders.js';
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
export function getDepositIntent(db: DB, session: Session): DepositIntent {
  const pool = getPool(db);
  const memo = db.prepare('SELECT deposit_memo FROM users WHERE id = ?').get(session.userId) as
    | { deposit_memo: string | null }
    | undefined;
  if (!memo?.deposit_memo) {
    throw new DomainError('invalid_request', 'No deposit memo is set for this account.');
  }
  return {
    network: pool.network,
    address: pool.account,
    memo: memo.deposit_memo,
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
 * credited at most once even if polling overlaps.
 */
export async function syncDeposits(
  db: DB,
  fetchFn: typeof fetch = fetch,
): Promise<{ credited: number; unattributed: number; orderPayments: number; checked: number }> {
  const pool = getPool(db);
  const cursorRow = db.prepare("SELECT v FROM sync_state WHERE k='horizon_cursor'").get() as
    | { v: string }
    | undefined;
  const cursor = cursorRow?.v ?? '';

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

    const already = db.prepare('SELECT 1 FROM deposits WHERE op_id = ?').get(p.id);
    if (already) continue;

    const amountUnits = Number(p.amount ?? 0);
    if (!(amountUnits > 0)) continue;

    const memo = p.transaction?.memo ?? null;

    // Card-order payments (ORD-… memos) belong to the order, not the
    // general balance: record the deposit, grow the crypto reserve, and
    // mark the order paid for admin review.
    if (memo) {
      const order = db
        .prepare("SELECT id, user_id FROM card_orders WHERE memo=? AND status='awaiting_payment'")
        .get(memo) as { id: string; user_id: string } | undefined;
      if (order) {
        const amountUnits = Number(p.amount ?? 0);
        const depositId = `dep-${randomUUID()}`;
        db.prepare(
          "INSERT INTO deposits (id,tx_hash,op_id,from_address,asset_code,amount_units,credited_inr,memo,user_id,status,at) VALUES (?,?,?,?,?,?,0,?,?,'order_payment',?)",
        ).run(depositId, p.transaction_hash, p.id, p.from ?? '', code!, amountUnits, memo, order.user_id, p.created_at ?? new Date().toISOString());
        db.prepare('UPDATE pool SET crypto_reserve_units = crypto_reserve_units + ?').run(amountUnits);
        applyOrderPayment(db, memo, depositId, amountUnits);
        orderPayments += 1;
        continue;
      }
    }

    // Attribution: memo first (authoritative), then a linked wallet
    // address (synced from Privy or registered manually).
    let user = memo
      ? (db.prepare('SELECT id, name, member_id, role FROM users WHERE deposit_memo = ?').get(memo) as
          | { id: string; name: string; member_id: string; role: string }
          | undefined)
      : undefined;
    if (!user && p.from) {
      user = db
        .prepare(
          'SELECT u.id, u.name, u.member_id, u.role FROM user_wallets w JOIN users u ON u.id = w.user_id WHERE w.address = ?',
        )
        .get(p.from) as typeof user;
    }

    const creditedInr = Math.floor(amountUnits * pool.rate_inr_per_unit);
    const at = p.created_at ?? new Date().toISOString();

    if (!user) {
      // Unattributed: hold it, never guess an owner (spec: money state is never ambiguous).
      db.prepare(
        "INSERT INTO deposits VALUES (?,?,?,?,?,?,?,?,NULL,'unattributed',?)",
      ).run(`dep-${randomUUID()}`, p.transaction_hash, p.id, p.from ?? '', code!, amountUnits, creditedInr, memo, at);
      unattributed += 1;
      continue;
    }

    // Credit: pool converts crypto → INR spending balance.
    db.prepare("INSERT INTO deposits VALUES (?,?,?,?,?,?,?,?,?,'credited',?)").run(
      `dep-${randomUUID()}`,
      p.transaction_hash,
      p.id,
      p.from ?? '',
      code!,
      amountUnits,
      creditedInr,
      memo,
      user.id,
      at,
    );
    db.prepare('UPDATE pool SET crypto_reserve_units = crypto_reserve_units + ?, fiat_float_inr = fiat_float_inr - ?').run(
      amountUnits,
      creditedInr,
    );
    const scope = user.role === 'owner' || user.role === 'admin' ? 'personal' : 'family';
    db.prepare('UPDATE balances SET amount = amount + ? WHERE scope = ?').run(creditedInr, scope);
    db.prepare(
      'INSERT INTO transactions (id,merchant,member_id,card_id,amount,direction,category,status,at) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(
      `t-dep-${p.id}`,
      `Stellar deposit · ${amountUnits} ${code}`,
      user.member_id,
      'c-personal',
      creditedInr,
      'credit',
      'Deposit',
      'settled',
      at,
    );
    appendAudit(db, {
      kind: 'transfer',
      title: `Deposit credited — ${creditedInr.toLocaleString('en-IN')} INR`,
      subtitle: `${amountUnits} ${code} on Stellar · memo ${memo}`,
      amount: creditedInr,
      memberId: user.member_id,
      actor: 'stellar-rail',
    });
    credited += 1;
  }

  if (lastCursor !== cursor) {
    db.prepare(
      "INSERT INTO sync_state (k,v) VALUES ('horizon_cursor', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
    ).run(lastCursor);
  }

  return { credited, unattributed, orderPayments, checked: records.length };
}

export function listDeposits(db: DB, session: Session) {
  const rows = db.prepare('SELECT * FROM deposits ORDER BY at DESC LIMIT 50').all() as any[];
  if (session.role === 'owner' || session.role === 'admin') return rows;
  return rows.filter((d) => d.user_id === session.userId);
}
