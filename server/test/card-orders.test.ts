// Card-order pipeline tests: KYC gate → order → Stellar payment with the
// order memo → admin review (payment received + provider float) → issue.

import { beforeEach, describe, expect, it } from 'vitest';

import { syncDeposits } from '../src/chain/stellar.js';
import { freshApp } from './helpers.js';

const ADMIN = { 'x-user-id': 'u-rohan' }; // seeded platform admin
const MAYA = { 'x-user-id': 'u-maya' }; // kyc_status 'none' in seed
const STEP_UP = { 'x-auth-assertion': 'passkey-mock-ok' };

let ctx: Awaited<ReturnType<typeof freshApp>>;
beforeEach(async () => {
  ctx = await freshApp();
});

function fakeHorizonPayment(memo: string, amount: string) {
  const pool = [...ctx.stdb.db.pool.iter()][0]!;
  const record = {
    id: `op-${memo}-${amount}`,
    type: 'payment',
    transaction_hash: `hash-${memo}-${amount}`,
    asset_type: 'credit_alphanum4',
    asset_code: 'USDC',
    asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    amount,
    from: 'GSENDER',
    to: pool.account,
    created_at: new Date().toISOString(),
    transaction: { memo, memo_type: 'text' },
  };
  return (async () =>
    new Response(JSON.stringify({ _embedded: { records: [record] } }), { status: 200 })) as typeof fetch;
}

describe('KYC gate', () => {
  it('blocks ordering until KYC is approved by an admin', async () => {
    const blocked = await ctx.app.inject({
      method: 'POST',
      url: '/api/card-orders',
      headers: MAYA,
      payload: { cardType: 'personal', nickname: 'Maya Shopping' },
    });
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().message).toContain('KYC');

    const submit = await ctx.app.inject({
      method: 'POST',
      url: '/api/kyc/submit',
      headers: MAYA,
      payload: { fullName: 'Maya Sharma', document: 'AADHAAR-XXXX-1234' },
    });
    expect(submit.json().status).toBe('pending');

    // Still blocked while pending
    const pending = await ctx.app.inject({
      method: 'POST',
      url: '/api/card-orders',
      headers: MAYA,
      payload: { cardType: 'personal', nickname: 'Maya Shopping' },
    });
    expect(pending.statusCode).toBe(400);

    const review = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/kyc/u-maya/review',
      headers: ADMIN,
      payload: { approve: true },
    });
    expect(review.json().status).toBe('approved');

    const ok = await ctx.app.inject({
      method: 'POST',
      url: '/api/card-orders',
      headers: MAYA,
      payload: { cardType: 'personal', nickname: 'Maya Shopping' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().payment.memo).toMatch(/^ORD-/);
  });

  it('non-admins cannot touch admin endpoints', async () => {
    for (const [method, url, payload] of [
      ['GET', '/api/admin/orders', undefined],
      ['POST', '/api/admin/kyc/u-maya/review', { approve: true }],
      ['POST', '/api/admin/provider-pool', { balanceUsd: 100 }],
    ] as const) {
      const res = await ctx.app.inject({ method, url, headers: MAYA, payload });
      expect(res.statusCode).toBe(403);
    }
  });
});

describe('Order → payment → admin approval', () => {
  async function placeOrder() {
    await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/kyc/u-maya/review',
      headers: ADMIN,
      payload: { approve: true },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/card-orders',
      headers: MAYA,
      payload: { cardType: 'personal', nickname: 'Maya Shopping' },
    });
    expect(res.statusCode).toBe(200);
    return res.json() as {
      orderId: string;
      payment: { memo: string; amountUnits: number };
      priceUsd: number;
    };
  }

  it('cannot approve before payment lands', async () => {
    const order = await placeOrder();
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/orders/${order.orderId}/approve`,
      headers: { ...ADMIN, ...STEP_UP },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('Payment has not been received');
  });

  it('full pipeline: payment marks order paid, approval issues the card and debits the provider pool', async () => {
    const order = await placeOrder();

    // Payment arrives on-chain with the order memo — no balance credit.
    const before = (await ctx.app.inject({ url: '/api/overview', headers: ADMIN })).json();
    const sync = await syncDeposits(ctx.stdb, fakeHorizonPayment(order.payment.memo, String(order.payment.amountUnits)));
    expect(sync.orderPayments).toBe(1);
    const after = (await ctx.app.inject({ url: '/api/overview', headers: ADMIN })).json();
    expect(after.balances).toEqual(before.balances);

    const queue = (await ctx.app.inject({ url: '/api/admin/orders', headers: ADMIN })).json();
    expect(queue.orders[0].status).toBe('paid');
    const floatBefore = queue.providerPool.balance_usd;

    // Admin approves: card issued via provider, float debited.
    const approve = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/orders/${order.orderId}/approve`,
      headers: { ...ADMIN, ...STEP_UP },
      payload: {},
    });
    expect(approve.statusCode).toBe(200);
    const { cardId } = approve.json();

    const card = ctx.stdb.db.cards.id.find(cardId);
    expect(card?.memberId).toBe('m-maya');
    expect(card?.providerCardId).toMatch(/^mock-card-/);

    const poolAfter = (await ctx.app.inject({ url: '/api/admin/provider-pool', headers: ADMIN })).json();
    expect(poolAfter.balance_usd).toBe(floatBefore - order.priceUsd);

    // Maya sees her card and her issued order
    const mayaCards = (await ctx.app.inject({ url: '/api/cards', headers: MAYA })).json();
    expect(mayaCards.some((c: any) => c.id === cardId)).toBe(true);
    const myOrders = (await ctx.app.inject({ url: '/api/card-orders', headers: MAYA })).json();
    expect(myOrders[0].status).toBe('issued');

    // Double-approve conflicts
    const again = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/orders/${order.orderId}/approve`,
      headers: { ...ADMIN, ...STEP_UP },
      payload: {},
    });
    expect(again.statusCode).toBe(409);
  });

  it('blocks approval when the provider pool cannot cover the card', async () => {
    const order = await placeOrder();
    await syncDeposits(ctx.stdb, fakeHorizonPayment(order.payment.memo, String(order.payment.amountUnits)));
    await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/provider-pool',
      headers: ADMIN,
      payload: { balanceUsd: 5 },
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/orders/${order.orderId}/approve`,
      headers: { ...ADMIN, ...STEP_UP },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toContain('Top up');
  });

  it('underpaid orders stay unapprovable', async () => {
    const order = await placeOrder();
    await syncDeposits(ctx.stdb, fakeHorizonPayment(order.payment.memo, '1'));
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/orders/${order.orderId}/approve`,
      headers: { ...ADMIN, ...STEP_UP },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('reject flags a refund when payment had landed', async () => {
    const order = await placeOrder();
    await syncDeposits(ctx.stdb, fakeHorizonPayment(order.payment.memo, String(order.payment.amountUnits)));
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/orders/${order.orderId}/reject`,
      headers: ADMIN,
      payload: { note: 'Suspicious activity' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().refundDue).toBe(true);
  });
});
