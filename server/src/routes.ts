// REST surface. Every handler resolves a session first (Privy bearer
// token in live mode, x-user-id in dev); DomainErrors map to stable HTTP
// codes without leaking internals (spec §59).

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { PrivyClient } from '@privy-io/node';

import { runAgentTurn } from './agent/agent.js';
import { assertManager, assertStepUp, resolveSession, type AuthContext } from './authz.js';
import type { CardProvider } from './cards/provider.js';
import { getDepositIntent, listDeposits, syncDeposits } from './chain/stellar.js';
import { bootstrapPool, processWithdrawals } from './chain/treasury.js';
import type { DB } from './db.js';
import {
  acceptInvite,
  approveOnce,
  cancelAction,
  declineApproval,
  directFreeze,
  executeAction,
  prepareAction,
  setCategory,
  setChannel,
} from './services/actions.js';
import {
  adminApproveOrder,
  adminListOrders,
  adminRejectOrder,
  adminReviewKyc,
  adminSetProviderPool,
  createCardOrder,
  getProviderPool,
  listMyOrders,
  submitKyc,
} from './services/cardOrders.js';
import {
  getActivity,
  getCard,
  getMember,
  getOverview,
  getPool,
  listApprovals,
  listCards,
  listMembers,
  listTransactions,
} from './services/readModel.js';
import { DomainError } from './types.js';

const STATUS: Record<DomainError['code'], number> = {
  not_found: 404,
  permission_denied: 403,
  invalid_request: 400,
  step_up_required: 401,
  action_expired: 410,
  action_conflict: 409,
  facts_mismatch: 409,
};

const intentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('temp_allowance'),
    memberId: z.string(),
    amount: z.number().int(),
    expiresAt: z.string(),
  }),
  z.object({ kind: z.literal('freeze_card'), cardId: z.string() }),
  z.object({ kind: z.literal('unfreeze_card'), cardId: z.string() }),
  z.object({ kind: z.literal('set_monthly_limit'), memberId: z.string(), amount: z.number().int() }),
  z.object({ kind: z.literal('set_approval_threshold'), cardId: z.string(), amount: z.number().int() }),
  z.object({
    kind: z.literal('transfer'),
    from: z.enum(['personal', 'family']),
    to: z.enum(['personal', 'family']),
    amount: z.number().int(),
  }),
  z.object({
    kind: z.literal('create_card'),
    cardType: z.enum(['family', 'purpose']),
    memberId: z.string().optional(),
    nickname: z.string(),
    monthlyCap: z.number().int().optional(),
    approvalAbove: z.number().int().optional(),
    initialLoadInr: z.number().int(),
  }),
  z.object({
    kind: z.literal('invite_member'),
    name: z.string(),
    role: z.enum(['admin', 'adult', 'teen', 'child', 'dependent']),
    relationship: z.string().optional(),
    monthlyLimit: z.number().int().optional(),
  }),
  z.object({ kind: z.literal('withdraw_crypto'), amountInr: z.number().int(), toAddress: z.string() }),
]);

const executeSchema = z.object({
  factsHash: z.string().min(8),
  idempotencyKey: z.string().min(8),
});

const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .min(1)
    .max(40),
  contextMemberId: z.string().optional(),
});

export function registerRoutes(
  app: FastifyInstance,
  db: DB,
  provider: CardProvider,
  auth: AuthContext,
  privyApi: PrivyClient | null = null,
): void {
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof DomainError) {
      return reply.status(STATUS[error.code]).send({ error: error.code, message: error.message });
    }
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: 'invalid_request', message: 'Malformed request body.' });
    }
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send({ error: 'rate_limited', message: 'Too many requests — slow down.' });
    }
    app.log.error(error);
    return reply.status(500).send({ error: 'server_error', message: 'Something went wrong.' });
  });

  const session = (req: FastifyRequest) =>
    resolveSession(db, auth, req.headers as { authorization?: string; 'x-user-id'?: string });
  const assertion = (req: FastifyRequest) => req.headers['x-auth-assertion'] as string | undefined;

  app.get('/health', async () => ({ ok: true, provider: provider.name, auth: auth.verifier ? 'privy' : 'dev' }));
  app.get('/readyz', async () => {
    db.prepare('SELECT 1').get();
    return { ready: true };
  });

  // ------------------------------------------------------------- READ
  app.get('/api/overview', async (req) => getOverview(db, await session(req)));
  app.get('/api/members', async (req) => listMembers(db, await session(req)));
  app.get('/api/members/:id', async (req) =>
    getMember(db, await session(req), (req.params as { id: string }).id),
  );
  app.get('/api/cards', async (req) => listCards(db, await session(req)));
  app.get('/api/cards/:id', async (req) => getCard(db, await session(req), (req.params as { id: string }).id));
  app.get('/api/transactions', async (req) => {
    const q = req.query as { memberId?: string; cardId?: string; limit?: string };
    return listTransactions(db, await session(req), {
      memberId: q.memberId,
      cardId: q.cardId,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  });
  app.get('/api/approvals', async (req) => listApprovals(db, await session(req)));
  app.get('/api/activity', async (req) => getActivity(db, await session(req)));

  // -------------------------------------------------- Stellar rail / pool
  app.get('/api/pool', async (req) => {
    await session(req);
    return getPool(db);
  });
  app.get('/api/deposits/intent', async (req) => getDepositIntent(db, await session(req)));
  app.get('/api/deposits', async (req) => listDeposits(db, await session(req)));
  app.post('/api/deposits/sync', async (req) => {
    await session(req);
    return syncDeposits(db);
  });
  // Treasury: the pool is a Privy Stellar server wallet. Bootstrap
  // creates + friendbot-funds it (testnet); process signs queued
  // withdrawal payouts via Privy raw_sign and submits on-chain.
  app.post('/api/treasury/bootstrap', async (req) => {
    const s = await session(req);
    assertManager(s);
    assertStepUp(assertion(req));
    if (!privyApi) throw new DomainError('invalid_request', 'Privy app secret is not configured.');
    return bootstrapPool(db, privyApi);
  });
  app.post('/api/treasury/process', async (req) => {
    const s = await session(req);
    assertManager(s);
    if (!privyApi) throw new DomainError('invalid_request', 'Privy app secret is not configured.');
    return processWithdrawals(db, privyApi);
  });

  app.get('/api/withdrawals', async (req) => {
    const s = await session(req);
    const rows = db.prepare('SELECT * FROM withdrawals ORDER BY at DESC LIMIT 50').all() as {
      user_id: string;
    }[];
    return s.role === 'owner' || s.role === 'admin' ? rows : rows.filter((w) => w.user_id === s.userId);
  });

  // ------------------------------------------------------------ Wallets
  app.get('/api/wallets', async (req) => {
    const s = await session(req);
    return db.prepare('SELECT address, chain_type, source, linked_at FROM user_wallets WHERE user_id = ?').all(s.userId);
  });
  // Manual registration for chains Privy doesn't embed (e.g. external
  // Stellar wallets) — used for deposit attribution by sender address.
  app.post('/api/wallets', async (req) => {
    const s = await session(req);
    const body = z
      .object({ address: z.string().regex(/^G[A-Z2-7]{55}$/, 'Stellar address expected'), chainType: z.literal('stellar') })
      .parse(req.body);
    db.prepare(
      'INSERT INTO user_wallets (user_id, address, chain_type, source, linked_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id, address) DO NOTHING',
    ).run(s.userId, body.address, body.chainType, 'manual', new Date().toISOString());
    return { linked: true, address: body.address };
  });

  // ------------------------------------------------- PREPARE / EXECUTE
  app.post('/api/actions/prepare', async (req) => {
    const intent = intentSchema.parse(req.body);
    return prepareAction(db, await session(req), intent, 'user');
  });

  app.post('/api/actions/:id/execute', async (req) => {
    const body = executeSchema.parse(req.body);
    return executeAction(db, await session(req), provider, {
      actionId: (req.params as { id: string }).id,
      factsHash: body.factsHash,
      idempotencyKey: body.idempotencyKey,
      authAssertion: assertion(req),
    });
  });

  app.post('/api/actions/:id/cancel', async (req) => {
    cancelAction(db, await session(req), (req.params as { id: string }).id);
    return { cancelled: true };
  });

  // Direct manual freeze (reversible → no prepared action, spec UI §12)
  app.post('/api/cards/:id/freeze', async (req) => {
    const body = z.object({ frozen: z.boolean() }).parse(req.body);
    return directFreeze(db, await session(req), provider, (req.params as { id: string }).id, body.frozen);
  });

  // Sensitive card credentials (spec §11): step-up required, never enters
  // AI context, served from the card provider and audited on every view.
  app.get('/api/cards/:id/sensitive', async (req) => {
    const s = await session(req);
    assertStepUp(assertion(req));
    const card = getCard(db, s, (req.params as { id: string }).id);
    if (!card.provider_card_id) {
      return { available: false, reason: 'This card has no provider credentials yet.' };
    }
    const raw: any = await provider.getDetails(card.provider_card_id);
    const d = raw?.details ?? raw ?? {};
    db.prepare(
      'INSERT INTO audit_events (kind,title,subtitle,amount,member_id,actor,at) VALUES (?,?,?,?,?,?,?)',
    ).run('security_event', `Card details viewed — ${card.nickname}`, `By ${s.name}`, null, card.member_id, s.name, new Date().toISOString());
    return {
      available: true,
      cardNumber: d.card_number ?? d.cardNumber ?? d.number ?? null,
      expiry: d.expiration ?? d.expiry ?? d.expiry_date ?? null,
      cvv: d.cvv ?? d.cvv2 ?? null,
    };
  });

  // Reversible rule toggles (audited)
  app.post('/api/cards/:id/channels', async (req) => {
    const body = z
      .object({ channel: z.enum(['online', 'contactless', 'atm', 'international']), enabled: z.boolean() })
      .parse(req.body);
    setChannel(db, await session(req), (req.params as { id: string }).id, body.channel, body.enabled);
    return { updated: true };
  });
  app.post('/api/members/:id/categories', async (req) => {
    const body = z.object({ categoryKey: z.string(), enabled: z.boolean() }).parse(req.body);
    setCategory(db, await session(req), (req.params as { id: string }).id, body.categoryKey, body.enabled);
    return { updated: true };
  });

  // --------------------------------------------------------- Approvals
  app.post('/api/approvals/:id/approve-once', async (req) =>
    approveOnce(db, await session(req), (req.params as { id: string }).id, assertion(req)),
  );
  app.post('/api/approvals/:id/decline', async (req) => {
    declineApproval(db, await session(req), (req.params as { id: string }).id);
    return { declined: true };
  });

  // -------------------------------------------------------- KYC + card orders
  // Flow: KYC → order a card → pay the Stellar pool with the order memo
  // → deposit sync marks it paid → an admin approves (payment received
  // + provider float sufficient) → card issued.
  app.get('/api/kyc', async (req) => {
    const s = await session(req);
    return { status: s.kycStatus };
  });
  app.post('/api/kyc/submit', async (req) => {
    const body = z.object({ fullName: z.string().min(2).max(80), document: z.string().min(4).max(120) }).parse(req.body);
    return submitKyc(db, await session(req), body);
  });

  app.post('/api/card-orders', async (req) => {
    const body = z
      .object({
        cardType: z.enum(['personal', 'family', 'purpose']),
        nickname: z.string(),
        memberId: z.string().optional(),
      })
      .parse(req.body);
    return createCardOrder(db, await session(req), body);
  });
  app.get('/api/card-orders', async (req) => listMyOrders(db, await session(req)));

  // ------------------------------------------------------ Admin console
  app.get('/api/admin/orders', async (req) => adminListOrders(db, await session(req)));
  app.post('/api/admin/orders/:id/approve', async (req) => {
    const s = await session(req);
    assertStepUp(assertion(req));
    return adminApproveOrder(db, s, provider, (req.params as { id: string }).id);
  });
  app.post('/api/admin/orders/:id/reject', async (req) => {
    const body = z.object({ note: z.string().min(2).max(300) }).parse(req.body);
    return adminRejectOrder(db, await session(req), (req.params as { id: string }).id, body.note);
  });
  app.get('/api/admin/kyc', async (req) => {
    const s = await session(req);
    if (!s.isAdmin) throw new DomainError('permission_denied', 'Platform admin access required.');
    return db.prepare("SELECT id, name, kyc_status FROM users WHERE kyc_status='pending'").all();
  });
  app.post('/api/admin/kyc/:userId/review', async (req) => {
    const body = z.object({ approve: z.boolean() }).parse(req.body);
    return adminReviewKyc(db, await session(req), (req.params as { userId: string }).userId, body.approve);
  });
  app.get('/api/admin/provider-pool', async (req) => {
    const s = await session(req);
    if (!s.isAdmin) throw new DomainError('permission_denied', 'Platform admin access required.');
    return getProviderPool(db);
  });
  app.post('/api/admin/provider-pool', async (req) => {
    const body = z.object({ balanceUsd: z.number() }).parse(req.body);
    return adminSetProviderPool(db, await session(req), body.balanceUsd);
  });

  // ----------------------------------------------------------- Invites
  // Accepting binds the joiner's identity (Privy DID in live mode) to
  // the invited member — no prior session exists, so this endpoint
  // authenticates the token directly.
  app.post('/api/invites/:code/accept', async (req) => {
    const code = (req.params as { code: string }).code;
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    if (auth.verifier) {
      if (!bearer) throw new DomainError('step_up_required', 'Sign in to accept the invite.');
      const { did } = await auth.verifier.verify(bearer).catch(() => {
        throw new DomainError('step_up_required', 'Sign in to accept the invite.');
      });
      return acceptInvite(db, code, { did });
    }
    if (!auth.devAuthAllowed) throw new DomainError('step_up_required', 'Sign in to accept the invite.');
    return acceptInvite(db, code, {});
  });

  // ---------------------------------------------------------------- AI
  app.post(
    '/api/agent/chat',
    { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } },
    async (req) => {
      const body = chatSchema.parse(req.body);
      return runAgentTurn(db, await session(req), body.messages, body.contextMemberId);
    },
  );
}
