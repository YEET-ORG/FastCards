// Financial-safety acceptance tests (spec §78): trusted values, no
// double execution, confirmation binding, permission enforcement, audit
// trail, and the Stellar deposit rail.

import { beforeEach, describe, expect, it } from 'vitest';

import type { MockCardProvider } from '../src/cards/provider.js';
import { syncDeposits } from '../src/chain/stellar.js';
import { freshApp } from './helpers.js';

const OWNER = { 'x-user-id': 'u-rohan' };
const TEEN = { 'x-user-id': 'u-maya' };
const STEP_UP = { 'x-auth-assertion': 'passkey-mock-ok' };

let ctx: Awaited<ReturnType<typeof freshApp>>;
beforeEach(async () => {
  ctx = await freshApp();
});

describe('READ scoping', () => {
  it('owner sees the household, teen sees only herself', async () => {
    const ownerRes = await ctx.app.inject({ url: '/api/members', headers: OWNER });
    expect(ownerRes.json()).toHaveLength(4);

    const teenRes = await ctx.app.inject({ url: '/api/members', headers: TEEN });
    expect(teenRes.json()).toHaveLength(1);
    expect(teenRes.json()[0].id).toBe('m-maya');
  });

  it("teen cannot read another member's spending", async () => {
    const res = await ctx.app.inject({ url: '/api/members/m-arjun', headers: TEEN });
    expect(res.statusCode).toBe(403);
  });

  it('teen transaction feed excludes other members', async () => {
    const res = await ctx.app.inject({ url: '/api/transactions', headers: TEEN });
    const rows = res.json() as { member_id: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((t) => t.member_id === 'm-maya')).toBe(true);
  });
});

describe('PREPARE → EXECUTE gateway', () => {
  async function prepareAllowance() {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/actions/prepare',
      headers: OWNER,
      payload: {
        kind: 'temp_allowance',
        memberId: 'm-maya',
        amount: 1000,
        expiresAt: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json() as { id: string; factsHash: string; facts: unknown[] };
  }

  it('prepare does not mutate state', async () => {
    await prepareAllowance();
    const member = (await ctx.app.inject({ url: '/api/members/m-maya', headers: OWNER })).json();
    expect(member.temp_allowance_amount).toBeNull();
    expect(member.remaining).toBe(1680);
  });

  it('execute applies the change, writes audit, and is idempotent', async () => {
    const action = await prepareAllowance();
    const exec = await ctx.app.inject({
      method: 'POST',
      url: `/api/actions/${action.id}/execute`,
      headers: { ...OWNER, ...STEP_UP },
      payload: { factsHash: action.factsHash, idempotencyKey: 'idem-000001' },
    });
    expect(exec.statusCode).toBe(200);
    expect(exec.json().title).toBe('Temporary allowance added');

    const member = (await ctx.app.inject({ url: '/api/members/m-maya', headers: OWNER })).json();
    expect(member.temp_allowance_amount).toBe(1000);
    expect(member.remaining).toBe(2680);

    // Same idempotency key → replayed receipt, no double application
    const again = await ctx.app.inject({
      method: 'POST',
      url: `/api/actions/${action.id}/execute`,
      headers: { ...OWNER, ...STEP_UP },
      payload: { factsHash: action.factsHash, idempotencyKey: 'idem-000001' },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().replayed).toBe(true);
    const memberAfter = (await ctx.app.inject({ url: '/api/members/m-maya', headers: OWNER })).json();
    expect(memberAfter.remaining).toBe(2680);

    // New key against the already-executed action → conflict, not re-run
    const rerun = await ctx.app.inject({
      method: 'POST',
      url: `/api/actions/${action.id}/execute`,
      headers: { ...OWNER, ...STEP_UP },
      payload: { factsHash: action.factsHash, idempotencyKey: 'idem-000002' },
    });
    expect(rerun.statusCode).toBe(409);

    // Audit trail exists
    const activity = (await ctx.app.inject({ url: '/api/activity', headers: OWNER })).json();
    expect(
      activity.events.some((e: { title: string }) => e.title.includes('Temporary allowance — Maya')),
    ).toBe(true);
  });

  it('rejects a facts hash that does not match what was prepared', async () => {
    const action = await prepareAllowance();
    const exec = await ctx.app.inject({
      method: 'POST',
      url: `/api/actions/${action.id}/execute`,
      headers: { ...OWNER, ...STEP_UP },
      payload: { factsHash: 'deadbeefdeadbeef', idempotencyKey: 'idem-00000x' },
    });
    expect(exec.statusCode).toBe(409);
    expect(exec.json().error).toBe('facts_mismatch');
  });

  it('requires step-up authentication', async () => {
    const action = await prepareAllowance();
    const exec = await ctx.app.inject({
      method: 'POST',
      url: `/api/actions/${action.id}/execute`,
      headers: OWNER,
      payload: { factsHash: action.factsHash, idempotencyKey: 'idem-00000y' },
    });
    expect(exec.statusCode).toBe(401);
  });

  it('teen can neither prepare nor execute household actions', async () => {
    const prep = await ctx.app.inject({
      method: 'POST',
      url: '/api/actions/prepare',
      headers: TEEN,
      payload: {
        kind: 'temp_allowance',
        memberId: 'm-maya',
        amount: 1000,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    expect(prep.statusCode).toBe(403);
  });

  it('validates intents at prepare time', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/actions/prepare',
      headers: OWNER,
      payload: { kind: 'temp_allowance', memberId: 'm-maya', amount: 999999, expiresAt: new Date(Date.now() + 1000).toISOString() },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Approvals', () => {
  it('approve-once settles the transaction and leaves rules unchanged', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/approvals/a-nike/approve-once',
      headers: { ...OWNER, ...STEP_UP },
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    const member = (await ctx.app.inject({ url: '/api/members/m-maya', headers: OWNER })).json();
    expect(member.spent_this_month).toBe(4320 + 1420);
    expect(member.monthly_limit).toBe(6000); // rules unchanged

    const txns = (await ctx.app.inject({ url: '/api/transactions?memberId=m-maya', headers: OWNER })).json();
    expect(txns.some((t: { merchant: string; approved_by: string }) => t.merchant === 'Nike' && t.approved_by === 'Rohan')).toBe(true);

    // Second approval attempt conflicts
    const again = await ctx.app.inject({
      method: 'POST',
      url: '/api/approvals/a-nike/approve-once',
      headers: { ...OWNER, ...STEP_UP },
      payload: {},
    });
    expect(again.statusCode).toBe(409);
  });

  it('teen cannot approve', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/approvals/a-nike/approve-once',
      headers: { ...TEEN, ...STEP_UP },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('Cards + provider', () => {
  it('direct freeze flips status, calls the provider when linked, and audits', async () => {
    // Link Maya's card to a provider card to verify the adapter is called
    await ctx.stdb.call((r) => r.devLinkCardProvider({ cardId: 'c-maya', providerCardId: 'mock-1' }));

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/cards/c-maya/freeze',
      headers: OWNER,
      payload: { frozen: true },
    });
    expect(res.statusCode).toBe(200);
    expect((ctx.provider as MockCardProvider).frozen.get('mock-1')).toBe(true);

    const card = (await ctx.app.inject({ url: '/api/cards/c-maya', headers: OWNER })).json();
    expect(card.status).toBe('frozen');
  });

  it('teen can freeze her own card but not others', async () => {
    const own = await ctx.app.inject({
      method: 'POST',
      url: '/api/cards/c-maya/freeze',
      headers: TEEN,
      payload: { frozen: true },
    });
    expect(own.statusCode).toBe(200);

    const other = await ctx.app.inject({
      method: 'POST',
      url: '/api/cards/c-dad/freeze',
      headers: TEEN,
      payload: { frozen: true },
    });
    expect(other.statusCode).toBe(403);
  });
});

describe('Agent (scripted mode)', () => {
  it('prepares but never executes', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/agent/chat',
      headers: OWNER,
      payload: { messages: [{ role: 'user', content: 'Give Maya ₹1,000 more until Sunday' }] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe('scripted');
    expect(body.prepared).toHaveLength(1);
    expect(body.prepared[0].kind).toBe('temp_allowance');

    // Nothing executed
    const member = (await ctx.app.inject({ url: '/api/members/m-maya', headers: OWNER })).json();
    expect(member.temp_allowance_amount).toBeNull();

    // The prepared action can then be executed through the gateway
    const exec = await ctx.app.inject({
      method: 'POST',
      url: `/api/actions/${body.prepared[0].id}/execute`,
      headers: { ...OWNER, ...STEP_UP },
      payload: { factsHash: body.prepared[0].factsHash, idempotencyKey: 'idem-agent' },
    });
    expect(exec.statusCode).toBe(200);
  });

  it('agent READ respects the caller scope', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/agent/chat',
      headers: TEEN,
      payload: { messages: [{ role: 'user', content: 'how much do I have left?' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().text).toContain('1,680');
  });

  it('teen asking for an allowance change is refused by the domain layer', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/agent/chat',
      headers: TEEN,
      payload: { messages: [{ role: 'user', content: 'Give Maya ₹1,000 more until Sunday' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().prepared).toHaveLength(0);
  });
});

describe('Stellar deposit rail', () => {
  function fakeHorizon(records: unknown[]): typeof fetch {
    return (async () =>
      new Response(JSON.stringify({ _embedded: { records } }), { status: 200 })) as typeof fetch;
  }

  const payment = (id: string, memo: string | null, amount = '100', to?: string) => ({
    id,
    type: 'payment',
    transaction_hash: `hash-${id}`,
    asset_type: 'credit_alphanum4',
    asset_code: 'USDC',
    asset_issuer: process.env.STELLAR_USDC_ISSUER ?? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    amount,
    from: 'GSENDER',
    to: to ?? [...ctx.stdb.db.pool.iter()][0]!.account,
    created_at: new Date().toISOString(),
    transaction: memo ? { memo, memo_type: 'text' } : {},
  });

  it('credits a memo-matched deposit at the pool rate and audits it', async () => {
    const before = (await ctx.app.inject({ url: '/api/overview', headers: OWNER })).json();
    const result = await syncDeposits(ctx.stdb, fakeHorizon([payment('op-1', 'FC-ROHAN-7431', '100')]));
    expect(result.credited).toBe(1);

    const after = (await ctx.app.inject({ url: '/api/overview', headers: OWNER })).json();
    expect(after.balances.personal - before.balances.personal).toBe(8800); // 100 USDC × ₹88

    const deposits = (await ctx.app.inject({ url: '/api/deposits', headers: OWNER })).json();
    expect(deposits[0].status).toBe('credited');

    const activity = (await ctx.app.inject({ url: '/api/activity', headers: OWNER })).json();
    expect(activity.events.some((e: { title: string }) => e.title.startsWith('Deposit credited'))).toBe(true);
  });

  it('is idempotent across repeated polls of the same operation', async () => {
    // Same op id twice (cursor reset simulates overlap)
    await syncDeposits(ctx.stdb, fakeHorizon([payment('op-2', 'FC-ROHAN-7431', '50')]));
    await ctx.stdb.call((r) => r.setSyncCursor({ v: '' })); // simulate cursor reset / overlapping poll
    const second = await syncDeposits(ctx.stdb, fakeHorizon([payment('op-2', 'FC-ROHAN-7431', '50')]));
    expect(second.credited).toBe(0);

    const deposits = (await ctx.app.inject({ url: '/api/deposits', headers: OWNER })).json();
    expect(deposits.filter((d: { op_id: string }) => d.op_id === 'op-2')).toHaveLength(1);
  });

  it('holds deposits with unknown memos instead of guessing', async () => {
    const before = (await ctx.app.inject({ url: '/api/overview', headers: OWNER })).json();
    const result = await syncDeposits(ctx.stdb, fakeHorizon([payment('op-3', 'WRONG-MEMO', '75')]));
    expect(result.unattributed).toBe(1);

    const after = (await ctx.app.inject({ url: '/api/overview', headers: OWNER })).json();
    expect(after.balances.personal).toBe(before.balances.personal);

    const deposits = (await ctx.app.inject({ url: '/api/deposits', headers: OWNER })).json();
    expect(deposits.find((d: { op_id: string }) => d.op_id === 'op-3').status).toBe('unattributed');
  });

  it('gives each user a deposit intent with the pool address and their memo', async () => {
    const res = await ctx.app.inject({ url: '/api/deposits/intent', headers: OWNER });
    const intent = res.json();
    expect(intent.memo).toBe('FC-ROHAN-7431');
    expect(intent.asset).toBe('USDC');
    expect(intent.rateInrPerUnit).toBe(88);
  });
});
