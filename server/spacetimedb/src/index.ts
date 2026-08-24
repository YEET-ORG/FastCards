// Kami reducers — the only write path into the system of record.
//
// Trust model: the Node service is the single client (the database
// owner). It handles auth (Privy), role checks, HTTP side effects
// (Horizon, KripiCard, Qwen) and builds user-facing receipts; reducers
// re-validate every state-dependent invariant transactionally (status,
// TTL, facts-hash binding, idempotency, balances, floats) and write the
// audit trail atomically with the mutation.
//
// Errors use `code|message` — the gateway maps them onto DomainError.

import { SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { t } from 'spacetimedb/server';
import spacetimedb from './schema';

export { default } from './schema';

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

// ------------------------------------------------------------- helpers

function err(code: string, message: string): never {
  throw new SenderError(`${code}|${message}`);
}

function assertGateway(ctx: Ctx): void {
  const cfg = ctx.db.module_config.id.find(0);
  if (!cfg || !cfg.owner.equals(ctx.sender)) {
    err('permission_denied', 'Only the Kami gateway may call reducers.');
  }
}

const nowMs = (ctx: Ctx) => Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
const iso = (ctx: Ctx) => new Date(nowMs(ctx)).toISOString();

/** en-IN integer grouping (2,2,3): 100000 → "₹1,00,000". */
function inr(n: number): string {
  const s = String(Math.trunc(Math.abs(n)));
  let grouped: string;
  if (s.length <= 3) {
    grouped = s;
  } else {
    const last3 = s.slice(-3);
    let rest = s.slice(0, -3);
    const parts: string[] = [];
    while (rest.length > 2) {
      parts.unshift(rest.slice(-2));
      rest = rest.slice(0, -2);
    }
    if (rest) parts.unshift(rest);
    grouped = `${parts.join(',')},${last3}`;
  }
  return `${n < 0 ? '-' : ''}₹${grouped}`;
}

interface AuditInput {
  kind: string;
  title: string;
  subtitle?: string;
  amount?: number;
  memberId?: string;
  actor: string;
}

function audit(ctx: Ctx, e: AuditInput): void {
  ctx.db.audit_events.insert({
    id: 0n,
    kind: e.kind,
    title: e.title,
    subtitle: e.subtitle,
    amount: e.amount,
    memberId: e.memberId,
    actor: e.actor,
    at: iso(ctx),
  });
}

function getMember(ctx: Ctx, id: string) {
  const m = ctx.db.members.id.find(id);
  if (!m) err('not_found', 'Member not found.');
  return m;
}

function getCard(ctx: Ctx, id: string) {
  const c = ctx.db.cards.id.find(id);
  if (!c) err('not_found', 'Card not found.');
  return c;
}

function getPoolRow(ctx: Ctx) {
  const p = [...ctx.db.pool.iter()][0];
  if (!p) err('not_found', 'Pool not configured.');
  return p;
}

function getProviderPoolRow(ctx: Ctx) {
  const p = [...ctx.db.provider_pool.iter()][0];
  if (!p) err('not_found', 'Provider pool not configured.');
  return p;
}

function balanceOf(ctx: Ctx, scope: string): number {
  return ctx.db.balances.scope.find(scope)?.amount ?? 0;
}

function moveBalance(ctx: Ctx, scope: string, delta: number): void {
  const row = ctx.db.balances.scope.find(scope);
  if (!row) err('not_found', `Unknown balance scope ${scope}.`);
  ctx.db.balances.scope.update({ ...row, amount: row.amount + delta });
}

function activeTempAllowance(
  ctx: Ctx,
  m: { tempAllowanceAmount?: number; tempAllowanceExpiresAt?: string },
): number {
  if (!m.tempAllowanceAmount || !m.tempAllowanceExpiresAt) return 0;
  return Date.parse(m.tempAllowanceExpiresAt) > nowMs(ctx) ? m.tempAllowanceAmount : 0;
}

function applyFreezeState(ctx: Ctx, cardId: string, freezing: boolean, actor: string): void {
  const c = getCard(ctx, cardId);
  if (c.status === 'closed') err('invalid_request', 'This card is closed.');
  ctx.db.cards.id.update({ ...c, status: freezing ? 'frozen' : 'active' });
  audit(ctx, {
    kind: 'card_event',
    title: `${c.nickname} ${freezing ? 'frozen' : 'unfrozen'}`,
    subtitle: `By ${actor}`,
    memberId: c.memberId,
    actor,
  });
}

// ---------------------------------------------------------------- seed

function seedIfEmpty(ctx: Ctx): void {
  if ([...ctx.db.members.iter()].length > 0) return;
  const now = nowMs(ctx);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  const ago = (ms: number) => new Date(now - ms).toISOString();

  ctx.db.users.insert({
    id: 'u-rohan', name: 'Rohan', role: 'owner', memberId: 'm-rohan',
    depositMemo: 'FC-ROHAN-7431', privyDid: undefined, kycStatus: 'approved', isAdmin: true,
  });
  ctx.db.users.insert({
    id: 'u-maya', name: 'Maya', role: 'teen', memberId: 'm-maya',
    depositMemo: 'FC-MAYA-2209', privyDid: undefined, kycStatus: 'none', isAdmin: false,
  });

  ctx.db.provider_pool.insert({ id: 'kripicard', provider: 'kripicard', balanceUsd: 500, updatedAt: iso(ctx) });

  // Demo pool: USDC on Stellar testnet, ₹88 per USDC. Placeholder account
  // until the treasury bootstrap points it at a Privy server wallet.
  ctx.db.pool.insert({
    id: 'pool-1', network: 'testnet',
    account: 'GBVYYQ7XXRZW6ZCNNCL2X2THNPQ6IM4O47HAA25JTAG7Z3CXJCQ3W7CD',
    assetCode: 'USDC',
    assetIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    cryptoReserveUnits: 1240.5, fiatFloatInr: 250000, rateInrPerUnit: 88, privyWalletId: undefined,
  });

  ctx.db.household.insert({ id: 'h-1', name: 'Sharma household', budgetCap: 120000, budgetSpent: 84210 });
  ctx.db.balances.insert({ scope: 'personal', amount: 96410 });
  ctx.db.balances.insert({ scope: 'family', amount: 87810 });

  const member = (id: string, name: string, role: string, relationship: string | undefined, monthlyLimit: number | undefined, spent: number) =>
    ctx.db.members.insert({
      id, name, role, relationship, monthlyLimit, spentThisMonth: spent,
      tempAllowanceAmount: undefined, tempAllowanceExpiresAt: undefined, status: 'active',
    });
  member('m-rohan', 'Rohan', 'owner', undefined, undefined, 12240);
  member('m-maya', 'Maya', 'teen', 'Daughter', 6000, 4320);
  member('m-arjun', 'Arjun', 'child', 'Son', 4000, 1240);
  member('m-dad', 'Dad', 'dependent', 'Father', 10000, 3410);

  const cat = (memberId: string, key: string, label: string, cap: number, spent: number, enabled: boolean) =>
    ctx.db.member_categories.insert({ id: `${memberId}:${key}`, memberId, key, label, cap, spent, enabled });
  cat('m-maya', 'food', 'Food', 3000, 2130, true);
  cat('m-maya', 'transport', 'Transport', 2000, 1420, true);
  cat('m-maya', 'other', 'Other', 1000, 770, true);
  cat('m-arjun', 'food', 'Food', 2000, 840, true);
  cat('m-arjun', 'transport', 'Transport', 1000, 240, true);
  cat('m-arjun', 'shopping', 'Shopping', 1000, 160, false);
  cat('m-dad', 'groceries', 'Groceries', 6000, 2960, true);
  cat('m-dad', 'health', 'Health', 2000, 450, true);
  cat('m-dad', 'other', 'Other', 2000, 0, true);

  const card = (
    id: string, nickname: string, variant: string, status: string, last4: string,
    memberId: string | undefined, monthlyCap: number | undefined, spent: number,
    approvalAbove: number | undefined, online: boolean, contactless: boolean, atm: boolean,
    international: boolean, maxAuthorization: number | undefined, expiryNote: string | undefined,
  ) =>
    ctx.db.cards.insert({
      id, nickname, variant, status, last4, memberId, monthlyCap, spentThisMonth: spent,
      approvalAbove, online, contactless, atm, international, maxAuthorization, expiryNote,
      provider: 'mock', providerCardId: undefined,
    });
  card('c-personal', 'Personal', 'personal', 'active', '8132', 'm-rohan', undefined, 12240, undefined, true, true, true, false, undefined, undefined);
  card('c-maya', 'Maya Everyday', 'family', 'active', '5588', 'm-maya', 6000, 4320, 1000, true, true, false, false, undefined, undefined);
  card('c-arjun', 'Arjun School', 'family', 'active', '2240', 'm-arjun', 4000, 1240, 500, false, true, false, false, undefined, undefined);
  card('c-dad', "Dad's Card", 'family', 'active', '7031', 'm-dad', 10000, 3410, undefined, true, true, true, false, undefined, undefined);
  card('c-subs', 'Subscriptions', 'subscription', 'active', '4470', undefined, 3000, 2140, undefined, true, false, false, true, undefined, undefined);
  card('c-amzn', 'Amazon Temporary', 'protected', 'closed', '9917', undefined, undefined, 18999, undefined, true, false, false, false, 19100, 'Closed automatically after use');

  const txn = (
    id: string, merchant: string, memberId: string, cardId: string, amount: number,
    direction: string, category: string, status: string, declineReason: string | undefined,
    approvedBy: string | undefined, at: string,
  ) =>
    ctx.db.transactions.insert({ id, merchant, memberId, cardId, amount, direction, category, status, declineReason, approvedBy, at });
  txn('t-zomato', 'Zomato', 'm-maya', 'c-maya', 389, 'debit', 'Food', 'settled', undefined, undefined, ago(45 * min));
  txn('t-swiggy', 'Swiggy', 'm-maya', 'c-maya', 640, 'debit', 'Food', 'settled', undefined, undefined, ago(2 * hour));
  txn('t-amazon', 'Amazon', 'm-rohan', 'c-personal', 1299, 'debit', 'Shopping', 'settled', undefined, undefined, ago(5 * hour));
  txn('t-bmtc', 'BMTC Transit', 'm-arjun', 'c-arjun', 35, 'debit', 'Transport', 'settled', undefined, undefined, ago(7 * hour));
  txn('t-netflix', 'Netflix', 'm-rohan', 'c-subs', 649, 'debit', 'Entertainment', 'settled', undefined, undefined, ago(day + 3 * hour));
  txn('t-steam', 'Steam', 'm-arjun', 'c-arjun', 899, 'debit', 'Shopping', 'declined', 'Shopping is off for this card', undefined, ago(day + 6 * hour));
  txn('t-blinkit', 'Blinkit', 'm-dad', 'c-dad', 412, 'debit', 'Groceries', 'settled', undefined, undefined, ago(day + 8 * hour));
  txn('t-zara', 'Zara', 'm-maya', 'c-maya', 1850, 'debit', 'Shopping', 'settled', undefined, 'Rohan', ago(4 * day + 6 * hour));
  txn('t-salary', 'Salary · HDFC Bank', 'm-rohan', 'c-personal', 120000, 'credit', 'Deposit', 'settled', undefined, undefined, ago(6 * day + 5 * hour));

  ctx.db.approvals.insert({
    id: 'a-nike', requesterId: 'm-maya', cardId: 'c-maya', merchant: 'Nike', amount: 1420,
    category: 'Shopping', reason: 'Above ₹1,000 approval threshold',
    requestedAt: ago(24 * min), expiresAt: new Date(now + 24 * hour).toISOString(),
    status: 'pending', resolvedBy: undefined, resolvedAt: undefined,
  });

  const ev = (kind: string, title: string, subtitle: string | undefined, amount: number | undefined, memberId: string | undefined, actor: string, at: string) =>
    ctx.db.audit_events.insert({ id: 0n, kind, title, subtitle, amount, memberId, actor, at });
  ev('approval_event', 'Approved once — Zara ₹1,850', 'Maya · rules unchanged', 1850, 'm-maya', 'Rohan', ago(4 * day + 6 * hour));
  ev('ai_action', 'Protected checkout completed', 'Sony WH-CH720N · max authorization ₹19,100', 18999, 'm-rohan', 'Rohan via AI', ago(5 * day + 2 * hour));
  ev('security_event', 'New sign-in', 'iPhone 15 · Bengaluru', undefined, undefined, 'system', ago(6 * day + 8 * hour));
}

export const init = spacetimedb.init((ctx) => {
  ctx.db.module_config.insert({ id: 0, owner: ctx.sender });
  seedIfEmpty(ctx);
});

/** Test/dev-only: wipe and reseed. Gateway-gated plus an explicit token. */
export const devReset = spacetimedb.reducer({ confirm: t.string() }, (ctx, { confirm }) => {
  assertGateway(ctx);
  if (confirm !== 'RESET-KAMI') err('invalid_request', 'Reset confirmation token mismatch.');
  const wipe = (tbl: { iter(): Iterable<unknown> } & Record<string, any>, pk: string) => {
    for (const row of [...tbl.iter()]) tbl[pk].delete((row as Record<string, unknown>)[pk]);
  };
  wipe(ctx.db.users, 'id');
  wipe(ctx.db.household, 'id');
  wipe(ctx.db.balances, 'scope');
  wipe(ctx.db.members, 'id');
  wipe(ctx.db.member_categories, 'id');
  wipe(ctx.db.cards, 'id');
  wipe(ctx.db.pool, 'id');
  wipe(ctx.db.deposits, 'id');
  wipe(ctx.db.sync_state, 'k');
  wipe(ctx.db.transactions, 'id');
  wipe(ctx.db.approvals, 'id');
  wipe(ctx.db.prepared_actions, 'id');
  wipe(ctx.db.idempotency, 'key');
  wipe(ctx.db.audit_events, 'id');
  wipe(ctx.db.user_wallets, 'id');
  wipe(ctx.db.invites, 'code');
  wipe(ctx.db.withdrawals, 'id');
  wipe(ctx.db.provider_pool, 'id');
  wipe(ctx.db.card_orders, 'id');
  seedIfEmpty(ctx);
});

/** Test/dev-only: link a card to a provider card id. */
export const devLinkCardProvider = spacetimedb.reducer(
  { cardId: t.string(), providerCardId: t.string() },
  (ctx, { cardId, providerCardId }) => {
    assertGateway(ctx);
    const c = getCard(ctx, cardId);
    ctx.db.cards.id.update({ ...c, providerCardId });
  },
);

// ------------------------------------------------------------ audit

export const appendAudit = spacetimedb.reducer(
  {
    kind: t.string(),
    title: t.string(),
    subtitle: t.option(t.string()),
    amount: t.option(t.i32()),
    memberId: t.option(t.string()),
    actor: t.string(),
  },
  (ctx, e) => {
    assertGateway(ctx);
    audit(ctx, e);
  },
);

// -------------------------------------------------- PREPARE / EXECUTE

/** Store a validated intent with frozen facts. Validation happens in the
 * gateway (it owns formatting); execute re-validates state here. */
export const prepareActionRow = spacetimedb.reducer(
  {
    id: t.string(),
    kind: t.string(),
    source: t.string(),
    payloadJson: t.string(),
    subject: t.string(),
    factsJson: t.string(),
    factsHash: t.string(),
    cta: t.string(),
    note: t.string(),
    createdBy: t.string(),
    expiresAt: t.string(),
  },
  (ctx, a) => {
    assertGateway(ctx);
    ctx.db.prepared_actions.insert({
      ...a,
      status: 'prepared',
      createdAt: iso(ctx),
      executedAt: undefined,
      receiptJson: undefined,
    });
  },
);

export const cancelAction = spacetimedb.reducer(
  { actionId: t.string(), userId: t.string() },
  (ctx, { actionId, userId }) => {
    assertGateway(ctx);
    const row = ctx.db.prepared_actions.id.find(actionId);
    if (!row) err('not_found', 'Action not found.');
    if (row.createdBy !== userId) err('permission_denied', 'Not your action.');
    if (row.status === 'prepared') {
      ctx.db.prepared_actions.id.update({ ...row, status: 'cancelled' });
    }
  },
);

export const expireAction = spacetimedb.reducer({ actionId: t.string() }, (ctx, { actionId }) => {
  assertGateway(ctx);
  const row = ctx.db.prepared_actions.id.find(actionId);
  if (row && row.status === 'prepared' && Date.parse(row.expiresAt) < nowMs(ctx)) {
    ctx.db.prepared_actions.id.update({ ...row, status: 'expired' });
  }
});

/**
 * EXECUTE — every invariant is re-checked inside this transaction:
 * idempotency, ownership, status, TTL, facts-hash binding, balances.
 * Provider side effects (card issuance, freeze) already happened in the
 * gateway; their results arrive as aux args. The receipt is built by the
 * gateway from the same trusted state and stored verbatim.
 */
export const executeAction = spacetimedb.reducer(
  {
    actionId: t.string(),
    factsHash: t.string(),
    idempotencyKey: t.string(),
    userId: t.string(),
    sessionMemberId: t.string(),
    actor: t.string(),
    receiptJson: t.string(),
    // aux values generated/fetched by the gateway, per intent kind
    expiresAtLabel: t.option(t.string()),
    providerCardId: t.option(t.string()),
    providerName: t.option(t.string()),
    newCardId: t.option(t.string()),
    newLast4: t.option(t.string()),
    inviteMemberId: t.option(t.string()),
    inviteCode: t.option(t.string()),
    withdrawalId: t.option(t.string()),
  },
  (ctx, input) => {
    assertGateway(ctx);

    if (ctx.db.idempotency.key.find(input.idempotencyKey)) {
      err('idempotent_replay', 'Already executed with this idempotency key.');
    }

    const row = ctx.db.prepared_actions.id.find(input.actionId);
    if (!row) err('not_found', 'Action not found.');
    if (row.createdBy !== input.userId) err('permission_denied', 'This action belongs to another session.');
    if (row.status !== 'prepared') err('action_conflict', `Action is already ${row.status}.`);
    if (Date.parse(row.expiresAt) < nowMs(ctx)) {
      // The gateway follows up with expireAction (a throw rolls back writes).
      err('action_expired', 'This proposal expired. Ask again to get a fresh one.');
    }
    if (input.factsHash !== row.factsHash) {
      err('facts_mismatch', 'The confirmation does not match the prepared action.');
    }

    const intent = JSON.parse(row.payloadJson) as Record<string, any>;
    const actor = input.actor;
    const at = iso(ctx);

    switch (intent.kind) {
      case 'temp_allowance': {
        const m = getMember(ctx, intent.memberId);
        if (m.monthlyLimit === undefined) err('invalid_request', 'Member has no limit.');
        ctx.db.members.id.update({
          ...m,
          tempAllowanceAmount: intent.amount,
          tempAllowanceExpiresAt: intent.expiresAt,
        });
        audit(ctx, {
          kind: 'ai_action',
          title: `Temporary allowance — ${m.name} +${inr(intent.amount)}`,
          subtitle: `Until ${input.expiresAtLabel ?? intent.expiresAt} · ${actor}`,
          amount: intent.amount,
          memberId: m.id,
          actor,
        });
        break;
      }
      case 'freeze_card':
      case 'unfreeze_card': {
        applyFreezeState(ctx, intent.cardId, intent.kind === 'freeze_card', actor);
        break;
      }
      case 'set_monthly_limit': {
        const m = getMember(ctx, intent.memberId);
        ctx.db.members.id.update({ ...m, monthlyLimit: intent.amount });
        for (const c of [...ctx.db.cards.iter()]) {
          if (c.memberId === m.id && c.variant === 'family') {
            ctx.db.cards.id.update({ ...c, monthlyCap: intent.amount });
          }
        }
        audit(ctx, {
          kind: 'rule_event',
          title: `Monthly limit changed — ${m.name}`,
          subtitle: `${m.monthlyLimit === undefined ? 'No limit' : inr(m.monthlyLimit)} → ${inr(intent.amount)} · ${actor}`,
          memberId: m.id,
          actor,
        });
        break;
      }
      case 'set_approval_threshold': {
        const c = getCard(ctx, intent.cardId);
        ctx.db.cards.id.update({ ...c, approvalAbove: intent.amount });
        audit(ctx, {
          kind: 'rule_event',
          title: `Approval threshold changed — ${c.nickname}`,
          subtitle: `Ask before purchases over ${inr(intent.amount)} · ${actor}`,
          memberId: c.memberId,
          actor,
        });
        break;
      }
      case 'transfer': {
        if (balanceOf(ctx, intent.from) < intent.amount) {
          err('invalid_request', `Not enough in the ${intent.from} balance.`);
        }
        moveBalance(ctx, intent.from, -intent.amount);
        moveBalance(ctx, intent.to, intent.amount);
        ctx.db.transactions.insert({
          id: `t-tr-${input.actionId.slice(-12)}`,
          merchant: `Internal transfer · ${intent.from} → ${intent.to}`,
          memberId: input.sessionMemberId,
          cardId: 'internal',
          amount: intent.amount,
          direction: intent.to === 'personal' ? 'credit' : 'debit',
          category: 'Transfer',
          status: 'settled',
          declineReason: undefined,
          approvedBy: undefined,
          at,
        });
        audit(ctx, {
          kind: 'transfer',
          title: `Transfer — ${inr(intent.amount)} ${intent.from} → ${intent.to}`,
          subtitle: `By ${actor}`,
          amount: intent.amount,
          memberId: input.sessionMemberId,
          actor,
        });
        break;
      }
      case 'create_card': {
        const source = intent.cardType === 'family' ? 'family' : 'personal';
        if (balanceOf(ctx, source) < intent.initialLoadInr) {
          err('invalid_request', `Not enough in the ${source} balance for the initial load.`);
        }
        if (!input.newCardId || !input.newLast4 || !input.providerCardId || !input.providerName) {
          err('invalid_request', 'Card issuance results missing.');
        }
        const member = intent.memberId ? getMember(ctx, intent.memberId) : undefined;
        moveBalance(ctx, source, -intent.initialLoadInr);
        ctx.db.cards.insert({
          id: input.newCardId,
          nickname: String(intent.nickname).trim(),
          variant: intent.cardType,
          status: 'active',
          last4: input.newLast4,
          memberId: intent.memberId ?? undefined,
          monthlyCap: intent.monthlyCap ?? undefined,
          spentThisMonth: 0,
          approvalAbove: intent.approvalAbove ?? undefined,
          online: true,
          contactless: true,
          atm: false,
          international: false,
          maxAuthorization: undefined,
          expiryNote: undefined,
          provider: input.providerName,
          providerCardId: input.providerCardId,
        });
        audit(ctx, {
          kind: 'card_event',
          title: `Card created — ${String(intent.nickname).trim()}`,
          subtitle: `${member ? `For ${member.name}` : 'Purpose card'} · loaded ${inr(intent.initialLoadInr)} · ${actor}`,
          amount: intent.initialLoadInr,
          memberId: intent.memberId ?? undefined,
          actor,
        });
        break;
      }
      case 'invite_member': {
        if (!input.inviteMemberId || !input.inviteCode) {
          err('invalid_request', 'Invite identifiers missing.');
        }
        ctx.db.members.insert({
          id: input.inviteMemberId,
          name: String(intent.name).trim(),
          role: intent.role,
          relationship: intent.relationship ?? undefined,
          monthlyLimit: intent.monthlyLimit ?? undefined,
          spentThisMonth: 0,
          tempAllowanceAmount: undefined,
          tempAllowanceExpiresAt: undefined,
          status: 'invited',
        });
        ctx.db.invites.insert({
          code: input.inviteCode,
          memberId: input.inviteMemberId,
          createdBy: input.userId,
          status: 'pending',
          createdAt: at,
          acceptedAt: undefined,
        });
        audit(ctx, {
          kind: 'security_event',
          title: `Member invited — ${String(intent.name).trim()}`,
          subtitle: `${intent.role} · by ${actor}`,
          memberId: input.inviteMemberId,
          actor,
        });
        break;
      }
      case 'withdraw_crypto': {
        if (!input.withdrawalId) err('invalid_request', 'Withdrawal id missing.');
        const pool = getPoolRow(ctx);
        const units = intent.amountInr / pool.rateInrPerUnit;
        if (balanceOf(ctx, 'personal') < intent.amountInr) {
          err('invalid_request', 'Not enough in the personal balance.');
        }
        if (pool.cryptoReserveUnits < units) {
          err('invalid_request', 'The pool cannot cover this withdrawal right now.');
        }
        moveBalance(ctx, 'personal', -intent.amountInr);
        ctx.db.pool.id.update({
          ...pool,
          cryptoReserveUnits: pool.cryptoReserveUnits - units,
          fiatFloatInr: pool.fiatFloatInr + intent.amountInr,
        });
        ctx.db.withdrawals.insert({
          id: input.withdrawalId,
          userId: input.userId,
          toAddress: intent.toAddress,
          amountInr: intent.amountInr,
          amountUnits: units,
          status: 'queued',
          at,
          txHash: undefined,
          error: undefined,
        });
        ctx.db.transactions.insert({
          id: `t-wd-${input.actionId.slice(-12)}`,
          merchant: `Stellar withdrawal · ${units.toFixed(2)} ${pool.assetCode}`,
          memberId: input.sessionMemberId,
          cardId: 'internal',
          amount: intent.amountInr,
          direction: 'debit',
          category: 'Withdrawal',
          status: 'pending',
          declineReason: undefined,
          approvedBy: undefined,
          at,
        });
        audit(ctx, {
          kind: 'transfer',
          title: `Withdrawal queued — ${inr(intent.amountInr)}`,
          subtitle: `${units.toFixed(2)} ${pool.assetCode} → ${String(intent.toAddress).slice(0, 6)}…${String(intent.toAddress).slice(-6)} · ${actor}`,
          amount: intent.amountInr,
          memberId: input.sessionMemberId,
          actor,
        });
        break;
      }
      default:
        err('invalid_request', `Unknown intent kind ${intent.kind}.`);
    }

    ctx.db.prepared_actions.id.update({
      ...row,
      status: 'executed',
      executedAt: at,
      receiptJson: input.receiptJson,
    });
    ctx.db.idempotency.insert({
      key: input.idempotencyKey,
      actionId: input.actionId,
      receiptJson: input.receiptJson,
      createdAt: at,
    });
  },
);

// ------------------------------------------------------- direct actions

/** Direct freeze/unfreeze (reversible, audited; provider call in gateway). */
export const applyFreeze = spacetimedb.reducer(
  { cardId: t.string(), freezing: t.bool(), actor: t.string() },
  (ctx, { cardId, freezing, actor }) => {
    assertGateway(ctx);
    applyFreezeState(ctx, cardId, freezing, actor);
  },
);

export const setChannel = spacetimedb.reducer(
  { cardId: t.string(), channel: t.string(), enabled: t.bool(), actor: t.string() },
  (ctx, { cardId, channel, enabled, actor }) => {
    assertGateway(ctx);
    const c = getCard(ctx, cardId);
    const labels: Record<string, string> = {
      online: 'Online payments',
      contactless: 'Contactless',
      atm: 'ATM withdrawals',
      international: 'International',
    };
    if (!(channel in labels)) err('invalid_request', 'Unknown channel.');
    ctx.db.cards.id.update({ ...c, [channel]: enabled });
    audit(ctx, {
      kind: 'rule_event',
      title: `${labels[channel]} turned ${enabled ? 'on' : 'off'} — ${c.nickname}`,
      subtitle: `By ${actor}`,
      memberId: c.memberId,
      actor,
    });
  },
);

export const setCategory = spacetimedb.reducer(
  { memberId: t.string(), categoryKey: t.string(), enabled: t.bool(), actor: t.string() },
  (ctx, { memberId, categoryKey, enabled, actor }) => {
    assertGateway(ctx);
    const m = getMember(ctx, memberId);
    const cat = ctx.db.member_categories.id.find(`${memberId}:${categoryKey}`);
    if (!cat) err('not_found', 'Category not found.');
    ctx.db.member_categories.id.update({ ...cat, enabled });
    audit(ctx, {
      kind: 'rule_event',
      title: `${cat.label} turned ${enabled ? 'on' : 'off'} — ${m.name}`,
      subtitle: `By ${actor}`,
      memberId,
      actor,
    });
  },
);

// ----------------------------------------------------------- approvals

export const approveOnce = spacetimedb.reducer(
  { approvalId: t.string(), approverName: t.string() },
  (ctx, { approvalId, approverName }) => {
    assertGateway(ctx);
    const a = ctx.db.approvals.id.find(approvalId);
    if (!a) err('not_found', 'Approval not found.');
    if (a.status !== 'pending') err('action_conflict', `Request is already ${a.status}.`);
    if (Date.parse(a.expiresAt) < nowMs(ctx)) {
      err('action_expired', 'This request expired.');
    }
    const requester = getMember(ctx, a.requesterId);
    const at = iso(ctx);

    ctx.db.approvals.id.update({ ...a, status: 'approved', resolvedBy: approverName, resolvedAt: at });
    ctx.db.transactions.insert({
      id: `t-appr-${a.id}`,
      merchant: a.merchant,
      memberId: a.requesterId,
      cardId: a.cardId,
      amount: a.amount,
      direction: 'debit',
      category: a.category,
      status: 'settled',
      declineReason: undefined,
      approvedBy: approverName,
      at,
    });
    ctx.db.members.id.update({ ...requester, spentThisMonth: requester.spentThisMonth + a.amount });
    const card = ctx.db.cards.id.find(a.cardId);
    if (card) ctx.db.cards.id.update({ ...card, spentThisMonth: card.spentThisMonth + a.amount });
    for (const h of [...ctx.db.household.iter()]) {
      ctx.db.household.id.update({ ...h, budgetSpent: h.budgetSpent + a.amount });
    }
    audit(ctx, {
      kind: 'approval_event',
      title: `Approved once — ${a.merchant} ${inr(a.amount)}`,
      subtitle: `${requester.name} · rules unchanged`,
      amount: a.amount,
      memberId: a.requesterId,
      actor: approverName,
    });
  },
);

export const expireApproval = spacetimedb.reducer({ approvalId: t.string() }, (ctx, { approvalId }) => {
  assertGateway(ctx);
  const a = ctx.db.approvals.id.find(approvalId);
  if (a && a.status === 'pending' && Date.parse(a.expiresAt) < nowMs(ctx)) {
    ctx.db.approvals.id.update({ ...a, status: 'expired' });
  }
});

export const declineApproval = spacetimedb.reducer(
  { approvalId: t.string(), approverName: t.string() },
  (ctx, { approvalId, approverName }) => {
    assertGateway(ctx);
    const a = ctx.db.approvals.id.find(approvalId);
    if (!a) err('not_found', 'Approval not found.');
    if (a.status !== 'pending') err('action_conflict', `Request is already ${a.status}.`);
    const requester = getMember(ctx, a.requesterId);
    ctx.db.approvals.id.update({ ...a, status: 'declined', resolvedBy: approverName, resolvedAt: iso(ctx) });
    audit(ctx, {
      kind: 'approval_event',
      title: `Declined — ${a.merchant} ${inr(a.amount)}`,
      subtitle: `${requester.name}'s request`,
      memberId: a.requesterId,
      actor: approverName,
    });
  },
);

// ------------------------------------------------------------- invites

export const acceptInvite = spacetimedb.reducer(
  {
    code: t.string(),
    newUserId: t.string(),
    depositMemo: t.string(),
    did: t.option(t.string()),
  },
  (ctx, { code, newUserId, depositMemo, did }) => {
    assertGateway(ctx);
    const invite = ctx.db.invites.code.find(code.toUpperCase());
    if (!invite) err('not_found', 'Invite not found.');
    if (invite.status !== 'pending') err('action_conflict', 'This invite was already used.');
    if (did) {
      for (const u of [...ctx.db.users.iter()]) {
        if (u.privyDid === did) err('action_conflict', 'This account already belongs to the household.');
      }
    }
    const member = getMember(ctx, invite.memberId);
    if (ctx.db.users.id.find(newUserId)) err('action_conflict', 'User already exists.');
    ctx.db.users.insert({
      id: newUserId,
      name: member.name,
      role: member.role,
      memberId: member.id,
      depositMemo,
      privyDid: did,
      kycStatus: 'none',
      isAdmin: false,
    });
    ctx.db.members.id.update({ ...member, status: 'active' });
    ctx.db.invites.code.update({ ...invite, status: 'accepted', acceptedAt: iso(ctx) });
    audit(ctx, {
      kind: 'security_event',
      title: `${member.name} joined the household`,
      subtitle: did ? 'Signed in with Privy' : 'Dev sign-in',
      memberId: member.id,
      actor: member.name,
    });
  },
);

// ---------------------------------------------------------------- auth

/** `displayName` is the name the person typed at registration. Empty string
 * means "keep the seeded name" — the module has no optional reducer args, and
 * an empty name must never overwrite a real one. It is only accepted here, on
 * the bind, because that is the one moment the account has no owner yet: a
 * rename reducer callable at any time would let a request header rename a
 * bound user. The linked member row is renamed in the same transaction so the
 * household surfaces cannot disagree with the session. */
export const bindPrivyDid = spacetimedb.reducer(
  { userId: t.string(), did: t.string(), displayName: t.string() },
  (ctx, { userId, did, displayName }) => {
    assertGateway(ctx);
    for (const u of [...ctx.db.users.iter()]) {
      if (u.privyDid === did) err('action_conflict', 'This identity is already bound.');
    }
    const user = ctx.db.users.id.find(userId);
    if (!user) err('not_found', 'User not found.');
    if (user.privyDid) err('action_conflict', 'User already bound to an identity.');

    const name = displayName.trim();
    ctx.db.users.id.update({ ...user, privyDid: did, name: name || user.name });
    if (name) {
      const member = ctx.db.members.id.find(user.memberId);
      if (member) ctx.db.members.id.update({ ...member, name });
    }
    audit(ctx, {
      kind: 'security_event',
      title: 'Owner account linked to Privy',
      subtitle: name ? `${name} · ${did}` : did,
      actor: name || user.name,
    });
  },
);

export const linkWallet = spacetimedb.reducer(
  { userId: t.string(), address: t.string(), chainType: t.string(), source: t.string() },
  (ctx, { userId, address, chainType, source }) => {
    assertGateway(ctx);
    const id = `${userId}:${address}`;
    if (ctx.db.user_wallets.id.find(id)) return; // idempotent
    ctx.db.user_wallets.insert({ id, userId, address, chainType, source, linkedAt: iso(ctx) });
  },
);

// ------------------------------------------------------------ KYC

export const submitKyc = spacetimedb.reducer(
  { userId: t.string(), actorName: t.string(), fullName: t.string(), document: t.string() },
  (ctx, { userId, actorName, fullName, document }) => {
    assertGateway(ctx);
    const user = ctx.db.users.id.find(userId);
    if (!user) err('not_found', 'User not found.');
    if (user.kycStatus === 'approved') return;
    ctx.db.users.id.update({ ...user, kycStatus: 'pending' });
    audit(ctx, {
      kind: 'security_event',
      title: `KYC submitted — ${actorName}`,
      subtitle: `${fullName} · ${document.slice(0, 24)}`,
      memberId: user.memberId,
      actor: actorName,
    });
  },
);

export const adminReviewKyc = spacetimedb.reducer(
  { userId: t.string(), approve: t.bool(), adminName: t.string() },
  (ctx, { userId, approve, adminName }) => {
    assertGateway(ctx);
    const user = ctx.db.users.id.find(userId);
    if (!user) err('not_found', 'User not found.');
    ctx.db.users.id.update({ ...user, kycStatus: approve ? 'approved' : 'none' });
    audit(ctx, {
      kind: 'security_event',
      title: `KYC ${approve ? 'approved' : 'rejected'} — ${user.name}`,
      subtitle: `By admin ${adminName}`,
      actor: adminName,
    });
  },
);

// ------------------------------------------------------- card orders

export const createCardOrder = spacetimedb.reducer(
  {
    id: t.string(),
    userId: t.string(),
    memberId: t.string(),
    cardType: t.string(),
    nickname: t.string(),
    priceInr: t.i32(),
    priceUsd: t.f64(),
    expectedUnits: t.f64(),
    memo: t.string(),
    actorName: t.string(),
  },
  (ctx, o) => {
    assertGateway(ctx);
    const user = ctx.db.users.id.find(o.userId);
    if (!user) err('not_found', 'User not found.');
    if (user.kycStatus !== 'approved') err('invalid_request', 'Complete KYC before ordering a card.');
    if (ctx.db.card_orders.memo.find(o.memo)) err('action_conflict', 'Order memo collision — retry.');
    const at = iso(ctx);
    ctx.db.card_orders.insert({
      id: o.id,
      userId: o.userId,
      memberId: o.memberId,
      cardType: o.cardType,
      nickname: o.nickname,
      priceInr: o.priceInr,
      priceUsd: o.priceUsd,
      expectedUnits: o.expectedUnits,
      memo: o.memo,
      status: 'awaiting_payment',
      depositId: undefined,
      providerCardId: undefined,
      reviewedBy: undefined,
      reviewNote: undefined,
      createdAt: at,
      updatedAt: at,
    });
    audit(ctx, {
      kind: 'card_event',
      title: `Card ordered — ${o.nickname}`,
      subtitle: `${inr(o.priceInr)} · awaiting Stellar payment · ${o.actorName}`,
      memberId: o.memberId,
      actor: o.actorName,
    });
  },
);

export const adminApproveOrder = spacetimedb.reducer(
  {
    orderId: t.string(),
    providerCardId: t.string(),
    providerName: t.string(),
    newCardId: t.string(),
    newLast4: t.string(),
    adminName: t.string(),
  },
  (ctx, input) => {
    assertGateway(ctx);
    const order = ctx.db.card_orders.id.find(input.orderId);
    if (!order) err('not_found', 'Order not found.');
    if (order.status === 'issued') err('action_conflict', 'Order already issued.');
    if (order.status === 'rejected') err('action_conflict', 'Order was rejected.');
    if (order.status !== 'paid' || !order.depositId) {
      err('invalid_request', 'Payment has not been received for this order yet.');
    }
    if (!ctx.db.deposits.id.find(order.depositId)) {
      err('invalid_request', 'Linked deposit record is missing.');
    }
    const providerPool = getProviderPoolRow(ctx);
    if (providerPool.balanceUsd < order.priceUsd) {
      err(
        'action_conflict',
        `Provider pool has $${providerPool.balanceUsd} but the card needs $${order.priceUsd}. Top up the ${providerPool.provider} float first.`,
      );
    }
    const at = iso(ctx);
    const variant = order.cardType === 'family' ? 'family' : order.cardType === 'purpose' ? 'purpose' : 'personal';
    ctx.db.cards.insert({
      id: input.newCardId,
      nickname: order.nickname,
      variant,
      status: 'active',
      last4: input.newLast4,
      memberId: order.memberId,
      monthlyCap: undefined,
      spentThisMonth: 0,
      approvalAbove: undefined,
      online: true,
      contactless: true,
      atm: false,
      international: false,
      maxAuthorization: undefined,
      expiryNote: undefined,
      provider: input.providerName,
      providerCardId: input.providerCardId,
    });
    ctx.db.provider_pool.id.update({
      ...providerPool,
      balanceUsd: providerPool.balanceUsd - order.priceUsd,
      updatedAt: at,
    });
    ctx.db.card_orders.id.update({
      ...order,
      status: 'issued',
      providerCardId: input.providerCardId,
      reviewedBy: input.adminName,
      updatedAt: at,
    });
    audit(ctx, {
      kind: 'card_event',
      title: `Card issued — ${order.nickname} •••• ${input.newLast4}`,
      subtitle: `Order ${order.id} approved by admin ${input.adminName} · $${order.priceUsd} from provider pool`,
      amount: order.priceInr,
      memberId: order.memberId,
      actor: input.adminName,
    });
  },
);

export const adminRejectOrder = spacetimedb.reducer(
  { orderId: t.string(), note: t.string(), adminName: t.string() },
  (ctx, { orderId, note, adminName }) => {
    assertGateway(ctx);
    const order = ctx.db.card_orders.id.find(orderId);
    if (!order) err('not_found', 'Order not found.');
    if (order.status === 'issued') err('action_conflict', 'Order already issued.');
    ctx.db.card_orders.id.update({
      ...order,
      status: 'rejected',
      reviewedBy: adminName,
      reviewNote: note.slice(0, 300),
      updatedAt: iso(ctx),
    });
    audit(ctx, {
      kind: 'card_event',
      title: `Card order rejected — ${order.nickname}`,
      subtitle: `${note.slice(0, 80)} · admin ${adminName}${order.depositId ? ' · refund due' : ''}`,
      memberId: order.memberId,
      actor: adminName,
    });
  },
);

export const adminSetProviderPool = spacetimedb.reducer(
  { balanceUsd: t.f64(), adminName: t.string() },
  (ctx, { balanceUsd, adminName }) => {
    assertGateway(ctx);
    if (!Number.isFinite(balanceUsd) || balanceUsd < 0) {
      err('invalid_request', 'Balance must be a non-negative number.');
    }
    const p = getProviderPoolRow(ctx);
    ctx.db.provider_pool.id.update({ ...p, balanceUsd, updatedAt: iso(ctx) });
    audit(ctx, {
      kind: 'security_event',
      title: `Provider pool updated — $${balanceUsd}`,
      subtitle: `By admin ${adminName}`,
      actor: adminName,
    });
  },
);

// -------------------------------------------------------- Stellar rail

export const setSyncCursor = spacetimedb.reducer({ v: t.string() }, (ctx, { v }) => {
  assertGateway(ctx);
  const row = ctx.db.sync_state.k.find('horizon_cursor');
  if (row) ctx.db.sync_state.k.update({ ...row, v });
  else ctx.db.sync_state.insert({ k: 'horizon_cursor', v });
});

/**
 * Record one incoming pool payment. `credited` deposits convert at the
 * pool rate into the target balance scope; unattributed deposits are
 * held. Duplicate op ids abort (the gateway treats that as a skip).
 */
export const recordDeposit = spacetimedb.reducer(
  {
    id: t.string(),
    txHash: t.string(),
    opId: t.string(),
    fromAddress: t.string(),
    assetCode: t.string(),
    amountUnits: t.f64(),
    creditedInr: t.i32(),
    memo: t.option(t.string()),
    userId: t.option(t.string()),
    memberId: t.option(t.string()),
    scope: t.option(t.string()),
    at: t.string(),
    credited: t.bool(),
  },
  (ctx, d) => {
    assertGateway(ctx);
    if (ctx.db.deposits.opId.find(d.opId)) err('action_conflict', 'Deposit already recorded.');
    ctx.db.deposits.insert({
      id: d.id,
      txHash: d.txHash,
      opId: d.opId,
      fromAddress: d.fromAddress,
      assetCode: d.assetCode,
      amountUnits: d.amountUnits,
      creditedInr: d.creditedInr,
      memo: d.memo,
      userId: d.userId,
      status: d.credited ? 'credited' : 'unattributed',
      at: d.at,
    });
    if (!d.credited) return;
    if (!d.scope || !d.memberId) err('invalid_request', 'Credited deposits need a scope and member.');
    const pool = getPoolRow(ctx);
    ctx.db.pool.id.update({
      ...pool,
      cryptoReserveUnits: pool.cryptoReserveUnits + d.amountUnits,
      fiatFloatInr: pool.fiatFloatInr - d.creditedInr,
    });
    moveBalance(ctx, d.scope, d.creditedInr);
    ctx.db.transactions.insert({
      id: `t-dep-${d.opId}`,
      merchant: `Stellar deposit · ${d.amountUnits} ${d.assetCode}`,
      memberId: d.memberId,
      cardId: 'c-personal',
      amount: d.creditedInr,
      direction: 'credit',
      category: 'Deposit',
      status: 'settled',
      declineReason: undefined,
      approvedBy: undefined,
      at: d.at,
    });
    audit(ctx, {
      kind: 'transfer',
      title: `Deposit credited — ${inr(d.creditedInr).slice(1)} INR`,
      subtitle: `${d.amountUnits} ${d.assetCode} on Stellar · memo ${d.memo ?? '—'}`,
      amount: d.creditedInr,
      memberId: d.memberId,
      actor: 'stellar-rail',
    });
  },
);

/** Record an ORD-memo payment: deposit + reserve growth + order transition. */
export const recordOrderPayment = spacetimedb.reducer(
  {
    depositId: t.string(),
    txHash: t.string(),
    opId: t.string(),
    fromAddress: t.string(),
    assetCode: t.string(),
    amountUnits: t.f64(),
    memo: t.string(),
    at: t.string(),
  },
  (ctx, d) => {
    assertGateway(ctx);
    if (ctx.db.deposits.opId.find(d.opId)) err('action_conflict', 'Deposit already recorded.');
    const order = [...ctx.db.card_orders.iter()].find(
      (o) => o.memo === d.memo && o.status === 'awaiting_payment',
    );
    if (!order) err('not_found', 'No awaiting order for this memo.');
    ctx.db.deposits.insert({
      id: d.depositId,
      txHash: d.txHash,
      opId: d.opId,
      fromAddress: d.fromAddress,
      assetCode: d.assetCode,
      amountUnits: d.amountUnits,
      creditedInr: 0,
      memo: d.memo,
      userId: order.userId,
      status: 'order_payment',
      at: d.at,
    });
    const pool = getPoolRow(ctx);
    ctx.db.pool.id.update({ ...pool, cryptoReserveUnits: pool.cryptoReserveUnits + d.amountUnits });

    const paidEnough = d.amountUnits + 1e-7 >= order.expectedUnits;
    ctx.db.card_orders.id.update({
      ...order,
      status: paidEnough ? 'paid' : 'awaiting_payment',
      depositId: d.depositId,
      reviewNote: paidEnough ? undefined : `Underpaid: got ${d.amountUnits}, expected ${order.expectedUnits}`,
      updatedAt: iso(ctx),
    });
    audit(ctx, {
      kind: 'transfer',
      title: paidEnough ? `Order payment received — ${order.nickname}` : `Order underpaid — ${order.nickname}`,
      subtitle: `${d.amountUnits} units · memo ${d.memo}`,
      memberId: order.memberId,
      actor: 'stellar-rail',
    });
  },
);

// ------------------------------------------------------------ treasury

export const bootstrapPoolWallet = spacetimedb.reducer(
  { account: t.string(), privyWalletId: t.string(), rateInrPerUnit: t.f64() },
  (ctx, { account, privyWalletId, rateInrPerUnit }) => {
    assertGateway(ctx);
    const pool = getPoolRow(ctx);
    if (pool.privyWalletId) err('action_conflict', 'Pool wallet already bootstrapped.');
    ctx.db.pool.id.update({
      ...pool,
      account,
      privyWalletId,
      network: 'testnet',
      assetCode: 'XLM',
      assetIssuer: undefined,
      rateInrPerUnit,
    });
    audit(ctx, {
      kind: 'security_event',
      title: 'Stellar pool wallet created',
      subtitle: `${account} · Privy server wallet`,
      actor: 'treasury',
    });
  },
);

export const withdrawalMarkSent = spacetimedb.reducer(
  { id: t.string(), txHash: t.string() },
  (ctx, { id, txHash }) => {
    assertGateway(ctx);
    const w = ctx.db.withdrawals.id.find(id);
    if (!w) err('not_found', 'Withdrawal not found.');
    const pool = getPoolRow(ctx);
    ctx.db.withdrawals.id.update({ ...w, status: 'sent', txHash });
    audit(ctx, {
      kind: 'transfer',
      title: `Withdrawal sent on-chain — ${inr(w.amountInr)}`,
      subtitle: `tx ${txHash.slice(0, 10)}… · ${w.amountUnits.toFixed(2)} ${pool.assetCode}`,
      amount: w.amountInr,
      actor: 'treasury',
    });
  },
);

export const withdrawalMarkFailed = spacetimedb.reducer(
  { id: t.string(), error: t.string() },
  (ctx, { id, error }) => {
    assertGateway(ctx);
    const w = ctx.db.withdrawals.id.find(id);
    if (!w) err('not_found', 'Withdrawal not found.');
    ctx.db.withdrawals.id.update({ ...w, status: 'failed', error: error.slice(0, 300) });
    audit(ctx, {
      kind: 'security_event',
      title: 'Withdrawal payout failed — needs review',
      subtitle: error.slice(0, 120),
      actor: 'treasury',
    });
  },
);
