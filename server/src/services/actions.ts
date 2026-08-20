// The deterministic execution gateway (spec §12, §69, §82). PREPARE
// validates an intent and freezes its user-visible facts; EXECUTE
// re-validates authorization + current state, requires the client to echo
// the exact facts hash it displayed (confirmation values match execution
// values, spec §78), enforces idempotency, applies the mutation, and
// appends the audit event. The AI layer can only ever reach `prepare`.
//
// State lives in SpacetimeDB: this layer validates against the live
// subscription cache, performs provider side effects (card issuance,
// freezes — reducers cannot do HTTP), builds the receipt, and then the
// reducer re-checks every invariant transactionally before mutating.

import { createHash, randomUUID } from 'node:crypto';

import { assertManager, assertStepUp } from '../authz.js';
import type { CardProvider } from '../cards/provider.js';
import { IdempotentReplay, type Stdb } from '../stdb/client.js';
import { mapCard, mapMember, mapPrepared } from '../stdb/rows.js';
import {
  DomainError,
  type ActionIntent,
  type CardRow,
  type Fact,
  type MemberRow,
  type PreparedAction,
  type Receipt,
  type Session,
} from '../types.js';
import { activeTempAllowance, getPool } from './readModel.js';

const ACTION_TTL_MS = 15 * 60 * 1000;
const MAX_AMOUNT = 100_000;

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const exact = (isoDate: string) =>
  new Date(isoDate).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }) + ' IST';

function factsHashOf(facts: Fact[]): string {
  return createHash('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, 32);
}

function getMemberRow(stdb: Stdb, id: string): MemberRow {
  const m = stdb.db.members.id.find(id);
  if (!m) throw new DomainError('not_found', 'Member not found.');
  return mapMember(m);
}

function getCardRow(stdb: Stdb, id: string): CardRow {
  const c = stdb.db.cards.id.find(id);
  if (!c) throw new DomainError('not_found', 'Card not found.');
  return mapCard(c);
}

function balanceOf(stdb: Stdb, scope: 'personal' | 'family'): number {
  return stdb.db.balances.scope.find(scope)?.amount ?? 0;
}

// ----------------------------------------------------------------- PREPARE

/**
 * Validate an intent and store it with frozen facts. Ambiguity or
 * validation failure stops preparation (spec §14) — nothing is stored.
 */
export async function prepareAction(
  stdb: Stdb,
  session: Session,
  intent: ActionIntent,
  source: 'agent' | 'user',
): Promise<PreparedAction> {
  assertManager(session);

  let subject = '';
  let facts: Fact[] = [];
  let cta = '';
  let note = '';

  switch (intent.kind) {
    case 'temp_allowance': {
      const m = getMemberRow(stdb, intent.memberId);
      if (m.monthly_limit === null) {
        throw new DomainError('invalid_request', `${m.name} has no monthly limit to top up.`);
      }
      if (!Number.isInteger(intent.amount) || intent.amount <= 0 || intent.amount > MAX_AMOUNT) {
        throw new DomainError('invalid_request', 'Amount must be between ₹1 and ₹1,00,000.');
      }
      const expiryMs = new Date(intent.expiresAt).getTime();
      if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
        throw new DomainError('invalid_request', 'Expiry must be a future date.');
      }
      const current = m.monthly_limit + activeTempAllowance(m);
      subject = `${m.name}'s monthly allowance`;
      facts = [
        { label: 'Member', value: m.name },
        { label: 'Current', value: `${inr(current)} / month` },
        { label: 'Temporary addition', value: `+${inr(intent.amount)}` },
        { label: 'Effective', value: 'Immediately' },
        { label: 'Expires', value: exact(intent.expiresAt) },
      ];
      cta = `Add ${inr(intent.amount)} until ${exact(intent.expiresAt)}`;
      note = 'Reverts automatically at expiry. Permanent rules stay unchanged.';
      break;
    }
    case 'freeze_card':
    case 'unfreeze_card': {
      const c = getCardRow(stdb, intent.cardId);
      if (c.status === 'closed') throw new DomainError('invalid_request', 'This card is closed.');
      const freezing = intent.kind === 'freeze_card';
      if (freezing && c.status === 'frozen')
        throw new DomainError('action_conflict', `${c.nickname} is already frozen.`);
      if (!freezing && c.status === 'active')
        throw new DomainError('action_conflict', `${c.nickname} is already active.`);
      subject = `${c.nickname} · •••• ${c.last4}`;
      facts = [
        { label: 'Card', value: c.nickname },
        { label: 'Current status', value: c.status === 'frozen' ? 'Frozen' : 'Active' },
        { label: 'New status', value: freezing ? 'Frozen' : 'Active' },
      ];
      cta = freezing ? `Freeze ${c.nickname}` : `Unfreeze ${c.nickname}`;
      note = freezing
        ? 'Freezing is reversible — unfreeze any time. Pending transactions may still settle.'
        : 'The card starts working again immediately.';
      break;
    }
    case 'set_monthly_limit': {
      const m = getMemberRow(stdb, intent.memberId);
      if (!Number.isInteger(intent.amount) || intent.amount <= 0 || intent.amount > MAX_AMOUNT) {
        throw new DomainError('invalid_request', 'Limit must be between ₹1 and ₹1,00,000.');
      }
      subject = `${m.name}'s monthly limit`;
      facts = [
        { label: 'Member', value: m.name },
        { label: 'Current limit', value: m.monthly_limit === null ? 'No limit' : `${inr(m.monthly_limit)} / month` },
        { label: 'New limit', value: `${inr(intent.amount)} / month` },
        { label: 'Effective', value: 'Immediately' },
      ];
      cta = `Set limit to ${inr(intent.amount)}`;
      note = 'This is a permanent rule change, not a temporary allowance.';
      break;
    }
    case 'set_approval_threshold': {
      const c = getCardRow(stdb, intent.cardId);
      if (!Number.isInteger(intent.amount) || intent.amount <= 0 || intent.amount > MAX_AMOUNT) {
        throw new DomainError('invalid_request', 'Threshold must be between ₹1 and ₹1,00,000.');
      }
      subject = `${c.nickname} · approval threshold`;
      facts = [
        { label: 'Card', value: c.nickname },
        { label: 'Current', value: c.approval_above === null ? 'No approval required' : `Ask over ${inr(c.approval_above)}` },
        { label: 'New', value: `Ask over ${inr(intent.amount)}` },
        { label: 'Effective', value: 'Immediately' },
      ];
      cta = `Ask me over ${inr(intent.amount)}`;
      note = 'This is a permanent rule change.';
      break;
    }
    case 'transfer': {
      if (intent.from === intent.to) throw new DomainError('invalid_request', 'Source and destination must differ.');
      if (!Number.isInteger(intent.amount) || intent.amount <= 0 || intent.amount > MAX_AMOUNT) {
        throw new DomainError('invalid_request', 'Amount must be between ₹1 and ₹1,00,000.');
      }
      if (balanceOf(stdb, intent.from) < intent.amount) {
        throw new DomainError('invalid_request', `Not enough in the ${intent.from} balance.`);
      }
      subject = `${intent.from === 'personal' ? 'Personal' : 'Family pool'} → ${intent.to === 'personal' ? 'Personal' : 'Family pool'}`;
      facts = [
        { label: 'From', value: intent.from === 'personal' ? 'Personal balance' : 'Family pool' },
        { label: 'To', value: intent.to === 'personal' ? 'Personal balance' : 'Family pool' },
        { label: 'Amount', value: inr(intent.amount) },
        { label: 'Fee', value: inr(0) },
        { label: 'Arrival', value: 'Instant' },
      ];
      cta = `Confirm ${inr(intent.amount)} transfer`;
      note = 'Internal transfer between your balances.';
      break;
    }
    case 'create_card': {
      const nickname = intent.nickname.trim();
      if (nickname.length < 2 || nickname.length > 40) {
        throw new DomainError('invalid_request', 'Card name must be 2-40 characters.');
      }
      let holder = 'Purpose card';
      if (intent.cardType === 'family') {
        if (!intent.memberId) throw new DomainError('invalid_request', 'Family cards need a member.');
        const m = getMemberRow(stdb, intent.memberId);
        if (m.status !== 'active') throw new DomainError('invalid_request', `${m.name} hasn't joined yet.`);
        holder = m.name;
      }
      for (const [label, v] of [
        ['Monthly limit', intent.monthlyCap],
        ['Approval threshold', intent.approvalAbove],
      ] as const) {
        if (v !== undefined && (!Number.isInteger(v) || v <= 0 || v > MAX_AMOUNT)) {
          throw new DomainError('invalid_request', `${label} must be between ₹1 and ₹1,00,000.`);
        }
      }
      const pool = getPool(stdb);
      const minLoad = Math.ceil(10 * pool.rate_inr_per_unit); // provider minimum is $10
      if (!Number.isInteger(intent.initialLoadInr) || intent.initialLoadInr < minLoad || intent.initialLoadInr > MAX_AMOUNT) {
        throw new DomainError('invalid_request', `Initial load must be between ${inr(minLoad)} and ₹1,00,000.`);
      }
      const source: 'personal' | 'family' = intent.cardType === 'family' ? 'family' : 'personal';
      if (balanceOf(stdb, source) < intent.initialLoadInr) {
        throw new DomainError('invalid_request', `Not enough in the ${source} balance for the initial load.`);
      }
      subject = `New ${intent.cardType} card · ${nickname}`;
      facts = [
        { label: 'For', value: holder },
        { label: 'Card', value: nickname },
        { label: 'Monthly limit', value: intent.monthlyCap ? `${inr(intent.monthlyCap)} / month` : 'No limit' },
        { label: 'Ask before spending over', value: intent.approvalAbove ? inr(intent.approvalAbove) : 'Not required' },
        { label: 'Initial load', value: inr(intent.initialLoadInr) },
        { label: 'Funded from', value: source === 'family' ? 'Family pool' : 'Personal balance' },
      ];
      cta = 'Create card';
      note = 'A virtual card is issued immediately after you confirm.';
      break;
    }
    case 'invite_member': {
      const name = intent.name.trim();
      if (name.length < 2 || name.length > 40) throw new DomainError('invalid_request', 'Name must be 2-40 characters.');
      if (intent.monthlyLimit !== undefined && (!Number.isInteger(intent.monthlyLimit) || intent.monthlyLimit <= 0 || intent.monthlyLimit > MAX_AMOUNT)) {
        throw new DomainError('invalid_request', 'Monthly limit must be between ₹1 and ₹1,00,000.');
      }
      subject = `Invite ${name} to the household`;
      facts = [
        { label: 'Name', value: name },
        { label: 'Role', value: intent.role },
        { label: 'Relationship', value: intent.relationship ?? '—' },
        { label: 'Monthly limit', value: intent.monthlyLimit ? `${inr(intent.monthlyLimit)} / month` : 'Not set yet' },
      ];
      cta = `Invite ${name}`;
      note = 'They join with an invite code and sign in with their own account.';
      break;
    }
    case 'withdraw_crypto': {
      if (!Number.isInteger(intent.amountInr) || intent.amountInr <= 0 || intent.amountInr > MAX_AMOUNT) {
        throw new DomainError('invalid_request', 'Amount must be between ₹1 and ₹1,00,000.');
      }
      if (!/^G[A-Z2-7]{55}$/.test(intent.toAddress)) {
        throw new DomainError('invalid_request', 'That is not a valid Stellar address.');
      }
      if (balanceOf(stdb, 'personal') < intent.amountInr) {
        throw new DomainError('invalid_request', 'Not enough in the personal balance.');
      }
      const pool = getPool(stdb);
      const units = intent.amountInr / pool.rate_inr_per_unit;
      if (pool.crypto_reserve_units < units) {
        throw new DomainError('invalid_request', 'The pool cannot cover this withdrawal right now.');
      }
      subject = 'Withdraw to Stellar wallet';
      facts = [
        { label: 'Amount', value: inr(intent.amountInr) },
        { label: 'You receive', value: `≈ ${units.toFixed(2)} ${pool.asset_code}` },
        { label: 'To', value: `${intent.toAddress.slice(0, 6)}…${intent.toAddress.slice(-6)}` },
        { label: 'Network', value: `Stellar ${pool.network}` },
      ];
      cta = `Withdraw ${inr(intent.amountInr)}`;
      note = 'Crypto transfers are irreversible. The payout is queued and signed by the treasury.';
      break;
    }
  }

  const action: PreparedAction = {
    id: `act-${randomUUID()}`,
    kind: intent.kind,
    source,
    subject,
    facts,
    factsHash: factsHashOf(facts),
    cta,
    note,
    expiresAt: new Date(Date.now() + ACTION_TTL_MS).toISOString(),
    status: 'prepared',
  };

  await stdb.call((r) =>
    r.prepareActionRow({
      id: action.id,
      kind: action.kind,
      source,
      payloadJson: JSON.stringify(intent),
      subject,
      factsJson: JSON.stringify(facts),
      factsHash: action.factsHash,
      cta,
      note,
      createdBy: session.userId,
      expiresAt: action.expiresAt,
    }),
  );

  return action;
}

// ----------------------------------------------------------------- EXECUTE

export async function executeAction(
  stdb: Stdb,
  session: Session,
  provider: CardProvider,
  input: {
    actionId: string;
    factsHash: string;
    idempotencyKey: string;
    authAssertion?: string;
  },
): Promise<Receipt> {
  // Idempotency first: a repeated confirmation tap or network retry must
  // return the original receipt, never execute twice (spec UI §57). The
  // reducer re-checks this transactionally; this early read also keeps a
  // replay from re-running provider side effects.
  const replayed = stdb.db.idempotency.key.find(input.idempotencyKey);
  if (replayed) {
    return { ...(JSON.parse(replayed.receiptJson) as Receipt), replayed: true };
  }

  const rawRow = stdb.db.preparedActions.id.find(input.actionId);
  if (!rawRow) throw new DomainError('not_found', 'Action not found.');
  const row = mapPrepared(rawRow);
  if (row.created_by !== session.userId) {
    throw new DomainError('permission_denied', 'This action belongs to another session.');
  }
  if (row.status !== 'prepared') {
    throw new DomainError('action_conflict', `Action is already ${row.status}.`);
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await stdb.call((r) => r.expireAction({ actionId: row.id }));
    throw new DomainError('action_expired', 'This proposal expired. Ask again to get a fresh one.');
  }
  // Confirmation binding: the client must echo the hash of the facts it
  // displayed. A mismatch means the user confirmed something different
  // from what would execute.
  if (input.factsHash !== row.facts_hash) {
    throw new DomainError('facts_mismatch', 'The confirmation does not match the prepared action.');
  }
  assertManager(session);
  assertStepUp(input.authAssertion);

  const intent = JSON.parse(row.payload_json) as ActionIntent;
  const actor = row.source === 'agent' ? `${session.name} via AI` : session.name;
  const at = new Date().toISOString();

  // Provider side effects + receipt building happen in the gateway; the
  // reducer then applies (and re-validates) the state change atomically.
  const aux: {
    expiresAtLabel?: string;
    providerCardId?: string;
    providerName?: string;
    newCardId?: string;
    newLast4?: string;
    inviteMemberId?: string;
    inviteCode?: string;
    withdrawalId?: string;
  } = {};
  let receipt: Receipt;

  switch (intent.kind) {
    case 'temp_allowance': {
      const m = getMemberRow(stdb, intent.memberId);
      if (m.monthly_limit === null) throw new DomainError('invalid_request', 'Member has no limit.');
      aux.expiresAtLabel = exact(intent.expiresAt);
      const current = m.monthly_limit + activeTempAllowance(m);
      receipt = {
        actionId: row.id,
        title: 'Temporary allowance added',
        rows: [
          { label: m.name, value: `${inr(current)} → ${inr(current + intent.amount)}` },
          { label: 'Expires', value: exact(intent.expiresAt) },
        ],
        actor,
        at,
      };
      break;
    }
    case 'freeze_card':
    case 'unfreeze_card': {
      const freezing = intent.kind === 'freeze_card';
      const c = getCardRow(stdb, intent.cardId);
      if (c.status === 'closed') throw new DomainError('invalid_request', 'This card is closed.');
      // Provider first — local state only changes if the provider accepted.
      if (c.provider_card_id) {
        await provider.setFrozen(c.provider_card_id, freezing);
      }
      receipt = {
        actionId: row.id,
        title: freezing ? 'Card frozen' : 'Card unfrozen',
        rows: [{ label: c.nickname, value: freezing ? 'Active → Frozen' : 'Frozen → Active' }],
        actor,
        at,
      };
      break;
    }
    case 'set_monthly_limit': {
      const m = getMemberRow(stdb, intent.memberId);
      receipt = {
        actionId: row.id,
        title: 'Monthly limit changed',
        rows: [{ label: m.name, value: `${m.monthly_limit === null ? 'No limit' : inr(m.monthly_limit)} → ${inr(intent.amount)}` }],
        actor,
        at,
      };
      break;
    }
    case 'set_approval_threshold': {
      const c = getCardRow(stdb, intent.cardId);
      receipt = {
        actionId: row.id,
        title: 'Approval threshold changed',
        rows: [{ label: c.nickname, value: `Ask over ${inr(intent.amount)}` }],
        actor,
        at,
      };
      break;
    }
    case 'transfer': {
      if (balanceOf(stdb, intent.from) < intent.amount) {
        throw new DomainError('invalid_request', `Not enough in the ${intent.from} balance.`);
      }
      receipt = {
        actionId: row.id,
        title: 'Transfer complete',
        rows: [
          { label: 'Moved', value: inr(intent.amount) },
          { label: 'From → To', value: `${intent.from} → ${intent.to}` },
        ],
        actor,
        at,
      };
      break;
    }
    case 'create_card': {
      const pool = getPool(stdb);
      const source: 'personal' | 'family' = intent.cardType === 'family' ? 'family' : 'personal';
      if (balanceOf(stdb, source) < intent.initialLoadInr) {
        throw new DomainError('invalid_request', `Not enough in the ${source} balance for the initial load.`);
      }
      const member = intent.memberId ? getMemberRow(stdb, intent.memberId) : undefined;
      const amountUsd = Math.round((intent.initialLoadInr / pool.rate_inr_per_unit) * 100) / 100;
      // Provider first — local state only changes if issuance succeeds.
      const issued = await provider.issueCard({ amountUsd, firstName: member?.name });
      aux.providerCardId = issued.providerCardId;
      aux.providerName = provider.name;
      aux.newCardId = `c-${randomUUID().slice(0, 8)}`;
      aux.newLast4 = issued.last4 ?? String(Math.floor(1000 + Math.random() * 9000));
      receipt = {
        actionId: row.id,
        title: 'Card created',
        rows: [
          { label: intent.nickname.trim(), value: `•••• ${aux.newLast4}` },
          { label: 'Loaded', value: inr(intent.initialLoadInr) },
          ...(member ? [{ label: 'For', value: member.name }] : []),
        ],
        actor,
        at,
      };
      break;
    }
    case 'invite_member': {
      aux.inviteMemberId = `m-${randomUUID().slice(0, 8)}`;
      aux.inviteCode = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
      receipt = {
        actionId: row.id,
        title: 'Invitation created',
        rows: [
          { label: intent.name.trim(), value: intent.role },
          { label: 'Invite code', value: aux.inviteCode },
        ],
        actor,
        at,
      };
      break;
    }
    case 'withdraw_crypto': {
      const pool = getPool(stdb);
      const units = intent.amountInr / pool.rate_inr_per_unit;
      if (balanceOf(stdb, 'personal') < intent.amountInr) {
        throw new DomainError('invalid_request', 'Not enough in the personal balance.');
      }
      if (pool.crypto_reserve_units < units) {
        throw new DomainError('invalid_request', 'The pool cannot cover this withdrawal right now.');
      }
      aux.withdrawalId = `wd-${randomUUID().slice(0, 8)}`;
      receipt = {
        actionId: row.id,
        title: 'Withdrawal queued',
        rows: [
          { label: 'Amount', value: `${inr(intent.amountInr)} (≈ ${units.toFixed(2)} ${pool.asset_code})` },
          { label: 'Status', value: 'Queued for treasury signing' },
        ],
        actor,
        at,
      };
      break;
    }
  }

  try {
    await stdb.call((r) =>
      r.executeAction({
        actionId: row.id,
        factsHash: input.factsHash,
        idempotencyKey: input.idempotencyKey,
        userId: session.userId,
        sessionMemberId: session.memberId,
        actor,
        receiptJson: JSON.stringify(receipt),
        expiresAtLabel: aux.expiresAtLabel,
        providerCardId: aux.providerCardId,
        providerName: aux.providerName,
        newCardId: aux.newCardId,
        newLast4: aux.newLast4,
        inviteMemberId: aux.inviteMemberId,
        inviteCode: aux.inviteCode,
        withdrawalId: aux.withdrawalId,
      }),
    );
  } catch (e) {
    if (e instanceof IdempotentReplay) {
      const stored = stdb.db.idempotency.key.find(input.idempotencyKey);
      if (stored) return { ...(JSON.parse(stored.receiptJson) as Receipt), replayed: true };
    }
    if (e instanceof DomainError && e.code === 'action_expired') {
      await stdb.call((r) => r.expireAction({ actionId: row.id })).catch(() => undefined);
    }
    throw e;
  }
  return receipt;
}

export async function cancelAction(stdb: Stdb, session: Session, actionId: string): Promise<void> {
  await stdb.call((r) => r.cancelAction({ actionId, userId: session.userId }));
}

/** Accept a household invitation: binds the joiner's identity to the invited member. */
export async function acceptInvite(
  stdb: Stdb,
  code: string,
  identity: { did?: string; name?: string },
): Promise<{ userId: string; memberId: string; name: string }> {
  const invite = stdb.db.invites.code.find(code.toUpperCase());
  if (!invite) throw new DomainError('not_found', 'Invite not found.');
  if (invite.status !== 'pending') throw new DomainError('action_conflict', 'This invite was already used.');

  const member = getMemberRow(stdb, invite.memberId);
  const userId = `u-${member.id.slice(2)}`;
  const memoSuffix = String(Math.floor(1000 + Math.random() * 9000));
  const depositMemo = `FC-${member.name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8)}-${memoSuffix}`;

  await stdb.call((r) =>
    r.acceptInvite({
      code: code.toUpperCase(),
      newUserId: userId,
      depositMemo,
      did: identity.did,
    }),
  );
  return { userId, memberId: member.id, name: member.name };
}

/**
 * Freeze/unfreeze — shared by the prepared-action path and the direct
 * manual path (same domain action behind both, spec §82 rule 14). The
 * provider call happens first; local state only changes on success.
 */
export async function applyFreeze(
  stdb: Stdb,
  provider: CardProvider,
  cardId: string,
  freezing: boolean,
  actor: string,
  actionId = '',
): Promise<Receipt> {
  const c = getCardRow(stdb, cardId);
  if (c.status === 'closed') throw new DomainError('invalid_request', 'This card is closed.');

  if (c.provider_card_id) {
    await provider.setFrozen(c.provider_card_id, freezing);
  }
  await stdb.call((r) => r.applyFreeze({ cardId, freezing, actor }));
  return {
    actionId,
    title: freezing ? 'Card frozen' : 'Card unfrozen',
    rows: [{ label: c.nickname, value: freezing ? 'Active → Frozen' : 'Frozen → Active' }],
    actor,
    at: new Date().toISOString(),
  };
}

/** Direct rule toggles (reversible, audited): card channels and member categories. */
export async function setChannel(
  stdb: Stdb,
  session: Session,
  cardId: string,
  channel: 'online' | 'contactless' | 'atm' | 'international',
  enabled: boolean,
): Promise<void> {
  assertManager(session);
  getCardRow(stdb, cardId);
  await stdb.call((r) => r.setChannel({ cardId, channel, enabled, actor: session.name }));
}

export async function setCategory(
  stdb: Stdb,
  session: Session,
  memberId: string,
  categoryKey: string,
  enabled: boolean,
): Promise<void> {
  assertManager(session);
  getMemberRow(stdb, memberId);
  await stdb.call((r) => r.setCategory({ memberId, categoryKey, enabled, actor: session.name }));
}

/** Direct (non-AI) freeze: reversible, so no prepared action required (spec UI §12). */
export async function directFreeze(
  stdb: Stdb,
  session: Session,
  provider: CardProvider,
  cardId: string,
  freezing: boolean,
): Promise<Receipt> {
  const c = getCardRow(stdb, cardId);
  const ownCard = c.member_id === session.memberId;
  if (!ownCard) assertManager(session);
  return applyFreeze(stdb, provider, cardId, freezing, session.name);
}

// ---------------------------------------------------------------- APPROVALS

export async function approveOnce(
  stdb: Stdb,
  session: Session,
  approvalId: string,
  authAssertion: string | undefined,
): Promise<Receipt> {
  assertManager(session);
  assertStepUp(authAssertion);

  const a = stdb.db.approvals.id.find(approvalId);
  if (!a) throw new DomainError('not_found', 'Approval not found.');
  if (a.status !== 'pending') throw new DomainError('action_conflict', `Request is already ${a.status}.`);
  const requester = getMemberRow(stdb, a.requesterId);

  try {
    await stdb.call((r) => r.approveOnce({ approvalId, approverName: session.name }));
  } catch (e) {
    if (e instanceof DomainError && e.code === 'action_expired') {
      await stdb.call((r) => r.expireApproval({ approvalId })).catch(() => undefined);
    }
    throw e;
  }

  return {
    actionId: a.id,
    title: 'Approved once',
    rows: [
      { label: 'Merchant', value: a.merchant },
      { label: 'Amount', value: inr(a.amount) },
      { label: `${requester.name}'s rules`, value: 'Unchanged' },
    ],
    actor: session.name,
    at: new Date().toISOString(),
  };
}

export async function declineApproval(stdb: Stdb, session: Session, approvalId: string): Promise<void> {
  assertManager(session);
  await stdb.call((r) => r.declineApproval({ approvalId, approverName: session.name }));
}
