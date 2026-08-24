// Kami domain schema — the system of record. Every table is
// PRIVATE: only the Node gateway (the database owner) can subscribe or
// mutate. All mutations go through reducers in index.ts, which enforce
// the PREPARE→EXECUTE invariants transactionally.
//
// Conventions: INR amounts are i32 (integer rupees), crypto units are
// f64, timestamps are ISO-8601 strings (parity with the REST contract).

import { schema, table, t } from 'spacetimedb/server';

/** Set once at init to the publisher — every reducer asserts the caller. */
const module_config = table(
  { name: 'module_config' },
  {
    id: t.u32().primaryKey(),
    owner: t.identity(),
  },
);

const users = table(
  { name: 'users' },
  {
    id: t.string().primaryKey(),
    name: t.string(),
    role: t.string(),
    memberId: t.string(),
    depositMemo: t.string().unique(),
    privyDid: t.option(t.string()),
    kycStatus: t.string(),
    isAdmin: t.bool(),
  },
);

const household = table(
  { name: 'household' },
  {
    id: t.string().primaryKey(),
    name: t.string(),
    budgetCap: t.i32(),
    budgetSpent: t.i32(),
  },
);

const balances = table(
  { name: 'balances' },
  {
    scope: t.string().primaryKey(),
    amount: t.i32(),
  },
);

const members = table(
  { name: 'members' },
  {
    id: t.string().primaryKey(),
    name: t.string(),
    role: t.string(),
    relationship: t.option(t.string()),
    monthlyLimit: t.option(t.i32()),
    spentThisMonth: t.i32(),
    tempAllowanceAmount: t.option(t.i32()),
    tempAllowanceExpiresAt: t.option(t.string()),
    status: t.string(),
  },
);

/** Composite (memberId, key) keyed as `${memberId}:${key}`. */
const member_categories = table(
  { name: 'member_categories' },
  {
    id: t.string().primaryKey(),
    memberId: t.string().index('btree'),
    key: t.string(),
    label: t.string(),
    cap: t.i32(),
    spent: t.i32(),
    enabled: t.bool(),
  },
);

const cards = table(
  { name: 'cards' },
  {
    id: t.string().primaryKey(),
    nickname: t.string(),
    variant: t.string(),
    status: t.string(),
    last4: t.string(),
    memberId: t.option(t.string()),
    monthlyCap: t.option(t.i32()),
    spentThisMonth: t.i32(),
    approvalAbove: t.option(t.i32()),
    online: t.bool(),
    contactless: t.bool(),
    atm: t.bool(),
    international: t.bool(),
    maxAuthorization: t.option(t.i32()),
    expiryNote: t.option(t.string()),
    provider: t.string(),
    providerCardId: t.option(t.string()),
  },
);

/** Stellar rail: one custodial pool account, per-user memo attribution. */
const pool = table(
  { name: 'pool' },
  {
    id: t.string().primaryKey(),
    network: t.string(),
    account: t.string(),
    assetCode: t.string(),
    assetIssuer: t.option(t.string()),
    cryptoReserveUnits: t.f64(),
    fiatFloatInr: t.i32(),
    rateInrPerUnit: t.f64(),
    privyWalletId: t.option(t.string()),
  },
);

const deposits = table(
  { name: 'deposits' },
  {
    id: t.string().primaryKey(),
    txHash: t.string(),
    opId: t.string().unique(),
    fromAddress: t.string(),
    assetCode: t.string(),
    amountUnits: t.f64(),
    creditedInr: t.i32(),
    memo: t.option(t.string()),
    userId: t.option(t.string()),
    status: t.string(),
    at: t.string(),
  },
);

const sync_state = table(
  { name: 'sync_state' },
  {
    k: t.string().primaryKey(),
    v: t.string(),
  },
);

const transactions = table(
  { name: 'transactions' },
  {
    id: t.string().primaryKey(),
    merchant: t.string(),
    memberId: t.string().index('btree'),
    cardId: t.string().index('btree'),
    amount: t.i32(),
    direction: t.string(),
    category: t.string(),
    status: t.string(),
    declineReason: t.option(t.string()),
    approvedBy: t.option(t.string()),
    at: t.string(),
  },
);

const approvals = table(
  { name: 'approvals' },
  {
    id: t.string().primaryKey(),
    requesterId: t.string(),
    cardId: t.string(),
    merchant: t.string(),
    amount: t.i32(),
    category: t.string(),
    reason: t.string(),
    requestedAt: t.string(),
    expiresAt: t.string(),
    status: t.string(),
    resolvedBy: t.option(t.string()),
    resolvedAt: t.option(t.string()),
  },
);

const prepared_actions = table(
  { name: 'prepared_actions' },
  {
    id: t.string().primaryKey(),
    kind: t.string(),
    source: t.string(),
    payloadJson: t.string(),
    subject: t.string(),
    factsJson: t.string(),
    factsHash: t.string(),
    cta: t.string(),
    note: t.string(),
    status: t.string(),
    createdBy: t.string(),
    createdAt: t.string(),
    expiresAt: t.string(),
    executedAt: t.option(t.string()),
    receiptJson: t.option(t.string()),
  },
);

const idempotency = table(
  { name: 'idempotency' },
  {
    key: t.string().primaryKey(),
    actionId: t.string(),
    receiptJson: t.string(),
    createdAt: t.string(),
  },
);

const audit_events = table(
  { name: 'audit_events' },
  {
    id: t.u64().primaryKey().autoInc(),
    kind: t.string(),
    title: t.string(),
    subtitle: t.option(t.string()),
    amount: t.option(t.i32()),
    memberId: t.option(t.string()),
    actor: t.string(),
    at: t.string(),
  },
);

/** Composite (userId, address) keyed as `${userId}:${address}`. */
const user_wallets = table(
  { name: 'user_wallets' },
  {
    id: t.string().primaryKey(),
    userId: t.string().index('btree'),
    address: t.string().index('btree'),
    chainType: t.string(),
    source: t.string(),
    linkedAt: t.string(),
  },
);

const invites = table(
  { name: 'invites' },
  {
    code: t.string().primaryKey(),
    memberId: t.string(),
    createdBy: t.string(),
    status: t.string(),
    createdAt: t.string(),
    acceptedAt: t.option(t.string()),
  },
);

const withdrawals = table(
  { name: 'withdrawals' },
  {
    id: t.string().primaryKey(),
    userId: t.string(),
    toAddress: t.string(),
    amountInr: t.i32(),
    amountUnits: t.f64(),
    status: t.string(),
    at: t.string(),
    txHash: t.option(t.string()),
    error: t.option(t.string()),
  },
);

/** USD float held at the card provider (KripiCard) — the second pool. */
const provider_pool = table(
  { name: 'provider_pool' },
  {
    id: t.string().primaryKey(),
    provider: t.string(),
    balanceUsd: t.f64(),
    updatedAt: t.string(),
  },
);

/** Card purchases paid in Stellar, issued after admin review. */
const card_orders = table(
  { name: 'card_orders' },
  {
    id: t.string().primaryKey(),
    userId: t.string().index('btree'),
    memberId: t.string(),
    cardType: t.string(),
    nickname: t.string(),
    priceInr: t.i32(),
    priceUsd: t.f64(),
    expectedUnits: t.f64(),
    memo: t.string().unique(),
    status: t.string(),
    depositId: t.option(t.string()),
    providerCardId: t.option(t.string()),
    reviewedBy: t.option(t.string()),
    reviewNote: t.option(t.string()),
    createdAt: t.string(),
    updatedAt: t.string(),
  },
);

const spacetimedb = schema({
  module_config,
  users,
  household,
  balances,
  members,
  member_categories,
  cards,
  pool,
  deposits,
  sync_state,
  transactions,
  approvals,
  prepared_actions,
  idempotency,
  audit_events,
  user_wallets,
  invites,
  withdrawals,
  provider_pool,
  card_orders,
});

export default spacetimedb;
