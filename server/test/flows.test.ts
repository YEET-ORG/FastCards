// P0 flow + auth tests: Privy session binding, transfers, card creation,
// invitations, crypto withdrawals, and wallet-based deposit attribution.

import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthVerifier } from '../src/auth/privy.js';
import { MockCardProvider } from '../src/cards/provider.js';
import { syncDeposits } from '../src/chain/stellar.js';
import { openDb, seed } from '../src/db.js';
import { buildApp } from '../src/server.js';

process.env.NODE_ENV = 'test';
process.env.AGENT_MODE = 'scripted';

const STELLAR_ADDR = 'G' + 'A'.repeat(55);
const OWNER = { 'x-user-id': 'u-rohan' };
const STEP_UP = { 'x-auth-assertion': 'passkey-mock-ok' };

const fakeVerifier: AuthVerifier = {
  async verify(token: string) {
    if (token === 'tok-owner') return { did: 'did:privy:owner1' };
    if (token === 'tok-stranger') return { did: 'did:privy:stranger' };
    throw new Error('invalid token');
  },
  async getWallets() {
    return [{ address: STELLAR_ADDR, chainType: 'stellar' }];
  },
};

async function freshApp(withPrivy = false) {
  const db = openDb(':memory:');
  seed(db);
  const provider = new MockCardProvider();
  const { app } = await buildApp({ db, provider, verifier: withPrivy ? fakeVerifier : null });
  return { app, db, provider };
}

async function prepareAndExecute(
  ctx: Awaited<ReturnType<typeof freshApp>>,
  intent: object,
  key: string,
  headers: Record<string, string> = OWNER,
) {
  const prep = await ctx.app.inject({ method: 'POST', url: '/api/actions/prepare', headers, payload: intent });
  expect(prep.statusCode).toBe(200);
  const action = prep.json();
  const exec = await ctx.app.inject({
    method: 'POST',
    url: `/api/actions/${action.id}/execute`,
    headers: { ...headers, ...STEP_UP },
    payload: { factsHash: action.factsHash, idempotencyKey: key },
  });
  return { action, exec };
}

describe('Privy auth', () => {
  it('first Privy identity binds to the owner and syncs wallets', async () => {
    const ctx = await freshApp(true);
    const res = await ctx.app.inject({ url: '/api/overview', headers: { authorization: 'Bearer tok-owner' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().scope).toBe('household');

    const wallets = ctx.db.prepare("SELECT * FROM user_wallets WHERE user_id='u-rohan'").all();
    expect(wallets).toHaveLength(1);

    const bound = ctx.db.prepare("SELECT privy_did FROM users WHERE id='u-rohan'").get() as any;
    expect(bound.privy_did).toBe('did:privy:owner1');
  });

  it('unknown identities are refused until invited', async () => {
    const ctx = await freshApp(true);
    await ctx.app.inject({ url: '/api/overview', headers: { authorization: 'Bearer tok-owner' } }); // owner binds first
    const res = await ctx.app.inject({ url: '/api/overview', headers: { authorization: 'Bearer tok-stranger' } });
    expect(res.statusCode).toBe(403);
  });

  it('invalid tokens get 401, and the dev header is ignored in privy mode when a bearer is present', async () => {
    const ctx = await freshApp(true);
    const bad = await ctx.app.inject({ url: '/api/overview', headers: { authorization: 'Bearer nonsense' } });
    expect(bad.statusCode).toBe(401);
  });
});

describe('Transfers', () => {
  it('moves money between personal and family, with audit', async () => {
    const ctx = await freshApp();
    const { exec } = await prepareAndExecute(
      ctx,
      { kind: 'transfer', from: 'personal', to: 'family', amount: 5000 },
      'idem-tr-000001',
    );
    expect(exec.statusCode).toBe(200);
    expect(exec.json().title).toBe('Transfer complete');

    const overview = (await ctx.app.inject({ url: '/api/overview', headers: OWNER })).json();
    expect(overview.balances.personal).toBe(96410 - 5000);
    expect(overview.balances.family).toBe(87810 + 5000);
  });

  it('rejects transfers that exceed the balance at prepare time', async () => {
    const ctx = await freshApp();
    const prep = await ctx.app.inject({
      method: 'POST',
      url: '/api/actions/prepare',
      headers: OWNER,
      payload: { kind: 'transfer', from: 'family', to: 'personal', amount: 99999 },
    });
    expect(prep.statusCode).toBe(400);
  });
});

describe('Create card', () => {
  it('issues through the provider, deducts the load, and stores the card', async () => {
    const ctx = await freshApp();
    const { exec } = await prepareAndExecute(
      ctx,
      { kind: 'create_card', cardType: 'family', memberId: 'm-arjun', nickname: 'Arjun Weekend', monthlyCap: 2000, approvalAbove: 500, initialLoadInr: 1000 },
      'idem-cc-000001',
    );
    expect(exec.statusCode).toBe(200);
    expect(exec.json().title).toBe('Card created');

    const cards = (await ctx.app.inject({ url: '/api/cards', headers: OWNER })).json();
    const created = cards.find((c: any) => c.nickname === 'Arjun Weekend');
    expect(created).toBeTruthy();
    expect(created.provider_card_id).toMatch(/^mock-card-/);
    expect(created.monthly_cap).toBe(2000);

    const overview = (await ctx.app.inject({ url: '/api/overview', headers: OWNER })).json();
    expect(overview.balances.family).toBe(87810 - 1000);
  });

  it('enforces the provider minimum load (₹880 at the demo rate)', async () => {
    const ctx = await freshApp();
    const prep = await ctx.app.inject({
      method: 'POST',
      url: '/api/actions/prepare',
      headers: OWNER,
      payload: { kind: 'create_card', cardType: 'purpose', nickname: 'Travel', initialLoadInr: 500 },
    });
    expect(prep.statusCode).toBe(400);
  });
});

describe('Invitations', () => {
  it('invite → accept activates the member and creates their user', async () => {
    const ctx = await freshApp();
    const { exec } = await prepareAndExecute(
      ctx,
      { kind: 'invite_member', name: 'Meera', role: 'adult', relationship: 'Spouse', monthlyLimit: 20000 },
      'idem-inv-000001',
    );
    expect(exec.statusCode).toBe(200);
    const code = exec.json().rows.find((r: any) => r.label === 'Invite code').value;
    expect(code).toMatch(/^[A-Z0-9]{8}$/);

    // Invited member is visible but not active yet
    const before = (await ctx.app.inject({ url: '/api/members', headers: OWNER })).json();
    expect(before.find((m: any) => m.name === 'Meera').status).toBe('invited');

    const accept = await ctx.app.inject({ method: 'POST', url: `/api/invites/${code}/accept`, payload: {} });
    expect(accept.statusCode).toBe(200);
    const { userId } = accept.json();

    const after = (await ctx.app.inject({ url: '/api/members', headers: OWNER })).json();
    expect(after.find((m: any) => m.name === 'Meera').status).toBe('active');

    // The new user has their own scoped session
    const self = await ctx.app.inject({ url: '/api/members', headers: { 'x-user-id': userId } });
    expect(self.json()).toHaveLength(1);
    expect(self.json()[0].name).toBe('Meera');

    // Reuse is rejected
    const again = await ctx.app.inject({ method: 'POST', url: `/api/invites/${code}/accept`, payload: {} });
    expect(again.statusCode).toBe(409);
  });

  it('in privy mode, accepting binds the DID', async () => {
    const ctx = await freshApp(true);
    await ctx.app.inject({ url: '/api/overview', headers: { authorization: 'Bearer tok-owner' } });
    const { exec } = await prepareAndExecute(
      ctx,
      { kind: 'invite_member', name: 'Priya', role: 'teen' },
      'idem-inv-000002',
      { authorization: 'Bearer tok-owner' } as any,
    );
    const code = exec.json().rows.find((r: any) => r.label === 'Invite code').value;

    const accept = await ctx.app.inject({
      method: 'POST',
      url: `/api/invites/${code}/accept`,
      headers: { authorization: 'Bearer tok-stranger' },
      payload: {},
    });
    expect(accept.statusCode).toBe(200);

    // The stranger's DID now resolves to Priya's scoped session
    const self = await ctx.app.inject({ url: '/api/members', headers: { authorization: 'Bearer tok-stranger' } });
    expect(self.statusCode).toBe(200);
    expect(self.json()[0].name).toBe('Priya');
  });
});

describe('Crypto withdrawals', () => {
  it('queues a withdrawal, adjusts balance and pool', async () => {
    const ctx = await freshApp();
    const { exec } = await prepareAndExecute(
      ctx,
      { kind: 'withdraw_crypto', amountInr: 8800, toAddress: STELLAR_ADDR },
      'idem-wd-000001',
    );
    expect(exec.statusCode).toBe(200);
    expect(exec.json().title).toBe('Withdrawal queued');

    const overview = (await ctx.app.inject({ url: '/api/overview', headers: OWNER })).json();
    expect(overview.balances.personal).toBe(96410 - 8800);

    const pool = (await ctx.app.inject({ url: '/api/pool', headers: OWNER })).json();
    expect(pool.crypto_reserve_units).toBeCloseTo(1240.5 - 100, 5); // 8800 / 88

    const wd = (await ctx.app.inject({ url: '/api/withdrawals', headers: OWNER })).json();
    expect(wd[0].status).toBe('queued');
  });

  it('rejects invalid Stellar addresses', async () => {
    const ctx = await freshApp();
    const prep = await ctx.app.inject({
      method: 'POST',
      url: '/api/actions/prepare',
      headers: OWNER,
      payload: { kind: 'withdraw_crypto', amountInr: 1000, toAddress: '0xdeadbeef' },
    });
    expect(prep.statusCode).toBe(400);
  });
});

describe('Deposit attribution by linked wallet', () => {
  it('credits a memo-less deposit from a linked wallet address', async () => {
    const ctx = await freshApp();
    ctx.db
      .prepare("INSERT INTO user_wallets VALUES ('u-rohan', ?, 'stellar', 'manual', ?)")
      .run(STELLAR_ADDR, new Date().toISOString());

    const pool = ctx.db.prepare('SELECT account FROM pool').get() as { account: string };
    const fakeHorizon = (async () =>
      new Response(
        JSON.stringify({
          _embedded: {
            records: [
              {
                id: 'op-wallet-1',
                type: 'payment',
                transaction_hash: 'hash-w1',
                asset_type: 'credit_alphanum4',
                asset_code: 'USDC',
                asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
                amount: '25',
                from: STELLAR_ADDR,
                to: pool.account,
                created_at: new Date().toISOString(),
                transaction: {}, // no memo
              },
            ],
          },
        }),
        { status: 200 },
      )) as typeof fetch;

    const result = await syncDeposits(ctx.db, fakeHorizon);
    expect(result.credited).toBe(1);
    const overview = (await ctx.app.inject({ url: '/api/overview', headers: OWNER })).json();
    expect(overview.balances.personal).toBe(96410 + 25 * 88);
  });
});

describe('Sensitive card details', () => {
  it('requires step-up, scopes access, and serves provider credentials', async () => {
    const ctx = await freshApp();

    const noAuth = await ctx.app.inject({ url: '/api/cards/c-maya/sensitive', headers: OWNER });
    expect(noAuth.statusCode).toBe(401);

    // No provider credentials linked yet
    const unlinked = await ctx.app.inject({ url: '/api/cards/c-maya/sensitive', headers: { ...OWNER, ...STEP_UP } });
    expect(unlinked.json().available).toBe(false);

    // Linked → provider details, and the view is audited
    ctx.db.prepare("UPDATE cards SET provider_card_id='mock-9' WHERE id='c-maya'").run();
    const linked = await ctx.app.inject({ url: '/api/cards/c-maya/sensitive', headers: { ...OWNER, ...STEP_UP } });
    expect(linked.json().cardNumber).toBe('4242 4242 4242 4242');
    const audited = ctx.db
      .prepare("SELECT count(*) AS c FROM audit_events WHERE title LIKE 'Card details viewed%'")
      .get() as { c: number };
    expect(audited.c).toBe(1);

    // Another member's card is out of scope for a teen
    const teenOther = await ctx.app.inject({ url: '/api/cards/c-dad/sensitive', headers: { 'x-user-id': 'u-maya', ...STEP_UP } });
    expect(teenOther.statusCode).toBe(403);
  });
});
