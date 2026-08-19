// The deterministic execution gateway (spec §12, §69, §82). PREPARE
// validates an intent and freezes its user-visible facts; EXECUTE
// re-validates authorization + current state, requires the client to echo
// the exact facts hash it displayed (confirmation values match execution
// values, spec §78), enforces idempotency, applies the mutation, and
// appends the audit event. The AI layer can only ever reach `prepare`.

import { createHash, randomUUID } from 'node:crypto';

import { appendAudit } from '../audit.js';
import { assertManager, assertStepUp } from '../authz.js';
import type { CardProvider } from '../cards/provider.js';
import type { DB } from '../db.js';
import {
  DomainError,
  type ActionIntent,
  type ApprovalRow,
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

function getMemberRow(db: DB, id: string): MemberRow {
  const m = db.prepare('SELECT * FROM members WHERE id = ?').get(id) as MemberRow | undefined;
  if (!m) throw new DomainError('not_found', 'Member not found.');
  return m;
}

function getCardRow(db: DB, id: string): CardRow {
  const c = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as CardRow | undefined;
  if (!c) throw new DomainError('not_found', 'Card not found.');
  return c;
}

// ----------------------------------------------------------------- PREPARE

/**
 * Validate an intent and store it with frozen facts. Ambiguity or
 * validation failure stops preparation (spec §14) — nothing is stored.
 */
export function prepareAction(
  db: DB,
  session: Session,
  intent: ActionIntent,
  source: 'agent' | 'user',
): PreparedAction {
  assertManager(session);

  let subject = '';
  let facts: Fact[] = [];
  let cta = '';
  let note = '';

  switch (intent.kind) {
    case 'temp_allowance': {
      const m = getMemberRow(db, intent.memberId);
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
      const c = getCardRow(db, intent.cardId);
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
      const m = getMemberRow(db, intent.memberId);
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
      const c = getCardRow(db, intent.cardId);
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
      if (balanceOf(db, intent.from) < intent.amount) {
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
        const m = getMemberRow(db, intent.memberId);
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
      const pool = getPool(db);
      const minLoad = Math.ceil(10 * pool.rate_inr_per_unit); // provider minimum is $10
      if (!Number.isInteger(intent.initialLoadInr) || intent.initialLoadInr < minLoad || intent.initialLoadInr > MAX_AMOUNT) {
        throw new DomainError('invalid_request', `Initial load must be between ${inr(minLoad)} and ₹1,00,000.`);
      }
      const source: 'personal' | 'family' = intent.cardType === 'family' ? 'family' : 'personal';
      if (balanceOf(db, source) < intent.initialLoadInr) {
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
      if (balanceOf(db, 'personal') < intent.amountInr) {
        throw new DomainError('invalid_request', 'Not enough in the personal balance.');
      }
      const pool = getPool(db);
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

  db.prepare(
    'INSERT INTO prepared_actions (id,kind,source,payload_json,subject,facts_json,facts_hash,cta,note,status,created_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(
    action.id,
    action.kind,
    source,
    JSON.stringify(intent),
    subject,
    JSON.stringify(facts),
    action.factsHash,
    cta,
    note,
    'prepared',
    session.userId,
    new Date().toISOString(),
    action.expiresAt,
  );

  return action;
}

// ----------------------------------------------------------------- EXECUTE

export async function executeAction(
  db: DB,
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
  // return the original receipt, never execute twice (spec UI §57).
  const existing = db
    .prepare('SELECT receipt_json FROM idempotency WHERE key = ?')
    .get(input.idempotencyKey) as { receipt_json: string } | undefined;
  if (existing) {
    return { ...(JSON.parse(existing.receipt_json) as Receipt), replayed: true };
  }

  const row = db.prepare('SELECT * FROM prepared_actions WHERE id = ?').get(input.actionId) as
    | {
        id: string;
        kind: ActionIntent['kind'];
        source: 'agent' | 'user';
        payload_json: string;
        facts_hash: string;
        status: string;
        created_by: string;
        expires_at: string;
      }
    | undefined;
  if (!row) throw new DomainError('not_found', 'Action not found.');
  if (row.created_by !== session.userId) {
    throw new DomainError('permission_denied', 'This action belongs to another session.');
  }
  if (row.status !== 'prepared') {
    throw new DomainError('action_conflict', `Action is already ${row.status}.`);
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("UPDATE prepared_actions SET status='expired' WHERE id = ?").run(row.id);
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
  const receipt = await applyIntent(db, session, provider, intent, actor, row.id);

  db.prepare("UPDATE prepared_actions SET status='executed', executed_at=?, receipt_json=? WHERE id = ?").run(
    new Date().toISOString(),
    JSON.stringify(receipt),
    row.id,
  );
  db.prepare('INSERT INTO idempotency (key, action_id, receipt_json, created_at) VALUES (?,?,?,?)').run(
    input.idempotencyKey,
    row.id,
    JSON.stringify(receipt),
    new Date().toISOString(),
  );
  return receipt;
}

export function cancelAction(db: DB, session: Session, actionId: string): void {
  const row = db.prepare('SELECT created_by, status FROM prepared_actions WHERE id = ?').get(actionId) as
    | { created_by: string; status: string }
    | undefined;
  if (!row) throw new DomainError('not_found', 'Action not found.');
  if (row.created_by !== session.userId) throw new DomainError('permission_denied', 'Not your action.');
  if (row.status === 'prepared') {
    db.prepare("UPDATE prepared_actions SET status='cancelled' WHERE id = ?").run(actionId);
  }
}

/** The only code path that mutates money state from prepared intents. */
async function applyIntent(
  db: DB,
  session: Session,
  provider: CardProvider,
  intent: ActionIntent,
  actor: string,
  actionId: string,
): Promise<Receipt> {
  const at = new Date().toISOString();

  switch (intent.kind) {
    case 'temp_allowance': {
      const m = getMemberRow(db, intent.memberId);
      if (m.monthly_limit === null) throw new DomainError('invalid_request', 'Member has no limit.');
      db.prepare('UPDATE members SET temp_allowance_amount=?, temp_allowance_expires_at=? WHERE id=?').run(
        intent.amount,
        intent.expiresAt,
        m.id,
      );
      appendAudit(db, {
        kind: 'ai_action',
        title: `Temporary allowance — ${m.name} +${inr(intent.amount)}`,
        subtitle: `Until ${exact(intent.expiresAt)} · ${actor}`,
        amount: intent.amount,
        memberId: m.id,
        actor,
      });
      const current = m.monthly_limit + activeTempAllowance(m);
      return {
        actionId,
        title: 'Temporary allowance added',
        rows: [
          { label: m.name, value: `${inr(current)} → ${inr(current + intent.amount)}` },
          { label: 'Expires', value: exact(intent.expiresAt) },
        ],
        actor,
        at,
      };
    }
    case 'freeze_card':
    case 'unfreeze_card': {
      const freezing = intent.kind === 'freeze_card';
      return applyFreeze(db, provider, intent.cardId, freezing, actor, actionId);
    }
    case 'set_monthly_limit': {
      const m = getMemberRow(db, intent.memberId);
      db.prepare('UPDATE members SET monthly_limit=? WHERE id=?').run(intent.amount, m.id);
      db.prepare("UPDATE cards SET monthly_cap=? WHERE member_id=? AND variant='family'").run(
        intent.amount,
        m.id,
      );
      appendAudit(db, {
        kind: 'rule_event',
        title: `Monthly limit changed — ${m.name}`,
        subtitle: `${m.monthly_limit === null ? 'No limit' : inr(m.monthly_limit)} → ${inr(intent.amount)} · ${actor}`,
        memberId: m.id,
        actor,
      });
      return {
        actionId,
        title: 'Monthly limit changed',
        rows: [{ label: m.name, value: `${m.monthly_limit === null ? 'No limit' : inr(m.monthly_limit)} → ${inr(intent.amount)}` }],
        actor,
        at,
      };
    }
    case 'set_approval_threshold': {
      const c = getCardRow(db, intent.cardId);
      db.prepare('UPDATE cards SET approval_above=? WHERE id=?').run(intent.amount, c.id);
      appendAudit(db, {
        kind: 'rule_event',
        title: `Approval threshold changed — ${c.nickname}`,
        subtitle: `Ask before purchases over ${inr(intent.amount)} · ${actor}`,
        memberId: c.member_id ?? undefined,
        actor,
      });
      return {
        actionId,
        title: 'Approval threshold changed',
        rows: [{ label: c.nickname, value: `Ask over ${inr(intent.amount)}` }],
        actor,
        at,
      };
    }

    case 'transfer': {
      if (balanceOf(db, intent.from) < intent.amount) {
        throw new DomainError('invalid_request', `Not enough in the ${intent.from} balance.`);
      }
      db.prepare('UPDATE balances SET amount = amount - ? WHERE scope = ?').run(intent.amount, intent.from);
      db.prepare('UPDATE balances SET amount = amount + ? WHERE scope = ?').run(intent.amount, intent.to);
      db.prepare(
        'INSERT INTO transactions (id,merchant,member_id,card_id,amount,direction,category,status,at) VALUES (?,?,?,?,?,?,?,?,?)',
      ).run(
        `t-tr-${actionId.slice(-12)}`,
        `Internal transfer · ${intent.from} → ${intent.to}`,
        session.memberId,
        'internal',
        intent.amount,
        intent.to === 'personal' ? 'credit' : 'debit',
        'Transfer',
        'settled',
        at,
      );
      appendAudit(db, {
        kind: 'transfer',
        title: `Transfer — ${inr(intent.amount)} ${intent.from} → ${intent.to}`,
        subtitle: `By ${actor}`,
        amount: intent.amount,
        memberId: session.memberId,
        actor,
      });
      return {
        actionId,
        title: 'Transfer complete',
        rows: [
          { label: 'Moved', value: inr(intent.amount) },
          { label: 'From → To', value: `${intent.from} → ${intent.to}` },
        ],
        actor,
        at,
      };
    }

    case 'create_card': {
      const pool = getPool(db);
      const source: 'personal' | 'family' = intent.cardType === 'family' ? 'family' : 'personal';
      if (balanceOf(db, source) < intent.initialLoadInr) {
        throw new DomainError('invalid_request', `Not enough in the ${source} balance for the initial load.`);
      }
      const member = intent.memberId ? getMemberRow(db, intent.memberId) : undefined;
      const amountUsd = Math.round((intent.initialLoadInr / pool.rate_inr_per_unit) * 100) / 100;
      // Provider first — local state only changes if issuance succeeds.
      const issued = await provider.issueCard({ amountUsd, firstName: member?.name });
      const cardId = `c-${randomUUID().slice(0, 8)}`;
      const last4 = String(Math.floor(1000 + Math.random() * 9000));
      db.prepare('UPDATE balances SET amount = amount - ? WHERE scope = ?').run(intent.initialLoadInr, source);
      db.prepare(
        `INSERT INTO cards (id,nickname,variant,status,last4,member_id,monthly_cap,spent_this_month,approval_above,online,contactless,atm,international,max_authorization,expiry_note,provider,provider_card_id)
         VALUES (?,?,?,?,?,?,?,0,?,1,1,0,0,NULL,NULL,?,?)`,
      ).run(
        cardId,
        intent.nickname.trim(),
        intent.cardType,
        'active',
        last4,
        intent.memberId ?? null,
        intent.monthlyCap ?? null,
        intent.approvalAbove ?? null,
        provider.name,
        issued.providerCardId,
      );
      appendAudit(db, {
        kind: 'card_event',
        title: `Card created — ${intent.nickname.trim()}`,
        subtitle: `${member ? `For ${member.name}` : 'Purpose card'} · loaded ${inr(intent.initialLoadInr)} · ${actor}`,
        amount: intent.initialLoadInr,
        memberId: intent.memberId,
        actor,
      });
      return {
        actionId,
        title: 'Card created',
        rows: [
          { label: intent.nickname.trim(), value: `•••• ${last4}` },
          { label: 'Loaded', value: inr(intent.initialLoadInr) },
          ...(member ? [{ label: 'For', value: member.name }] : []),
        ],
        actor,
        at,
      };
    }

    case 'invite_member': {
      const memberId = `m-${randomUUID().slice(0, 8)}`;
      const code = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
      db.prepare(
        'INSERT INTO members (id,name,role,relationship,monthly_limit,spent_this_month,status) VALUES (?,?,?,?,?,0,?)',
      ).run(memberId, intent.name.trim(), intent.role, intent.relationship ?? null, intent.monthlyLimit ?? null, 'invited');
      db.prepare('INSERT INTO invites (code,member_id,created_by,status,created_at) VALUES (?,?,?,?,?)').run(
        code,
        memberId,
        session.userId,
        'pending',
        at,
      );
      appendAudit(db, {
        kind: 'security_event',
        title: `Member invited — ${intent.name.trim()}`,
        subtitle: `${intent.role} · by ${actor}`,
        memberId,
        actor,
      });
      return {
        actionId,
        title: 'Invitation created',
        rows: [
          { label: intent.name.trim(), value: intent.role },
          { label: 'Invite code', value: code },
        ],
        actor,
        at,
      };
    }

    case 'withdraw_crypto': {
      const pool = getPool(db);
      const units = intent.amountInr / pool.rate_inr_per_unit;
      if (balanceOf(db, 'personal') < intent.amountInr) {
        throw new DomainError('invalid_request', 'Not enough in the personal balance.');
      }
      if (pool.crypto_reserve_units < units) {
        throw new DomainError('invalid_request', 'The pool cannot cover this withdrawal right now.');
      }
      db.prepare('UPDATE balances SET amount = amount - ? WHERE scope = ?').run(intent.amountInr, 'personal');
      db.prepare('UPDATE pool SET crypto_reserve_units = crypto_reserve_units - ?, fiat_float_inr = fiat_float_inr + ?').run(
        units,
        intent.amountInr,
      );
      db.prepare('INSERT INTO withdrawals (id,user_id,to_address,amount_inr,amount_units,status,at) VALUES (?,?,?,?,?,?,?)').run(
        `wd-${randomUUID().slice(0, 8)}`,
        session.userId,
        intent.toAddress,
        intent.amountInr,
        units,
        'queued',
        at,
      );
      db.prepare(
        'INSERT INTO transactions (id,merchant,member_id,card_id,amount,direction,category,status,at) VALUES (?,?,?,?,?,?,?,?,?)',
      ).run(
        `t-wd-${actionId.slice(-12)}`,
        `Stellar withdrawal · ${units.toFixed(2)} ${pool.asset_code}`,
        session.memberId,
        'internal',
        intent.amountInr,
        'debit',
        'Withdrawal',
        'pending',
        at,
      );
      appendAudit(db, {
        kind: 'transfer',
        title: `Withdrawal queued — ${inr(intent.amountInr)}`,
        subtitle: `${units.toFixed(2)} ${pool.asset_code} → ${intent.toAddress.slice(0, 6)}…${intent.toAddress.slice(-6)} · ${actor}`,
        amount: intent.amountInr,
        memberId: session.memberId,
        actor,
      });
      return {
        actionId,
        title: 'Withdrawal queued',
        rows: [
          { label: 'Amount', value: `${inr(intent.amountInr)} (≈ ${units.toFixed(2)} ${pool.asset_code})` },
          { label: 'Status', value: 'Queued for treasury signing' },
        ],
        actor,
        at,
      };
    }
  }
}

function balanceOf(db: DB, scope: 'personal' | 'family'): number {
  const row = db.prepare('SELECT amount FROM balances WHERE scope = ?').get(scope) as { amount: number } | undefined;
  return row?.amount ?? 0;
}

/** Accept a household invitation: binds the joiner's identity to the invited member. */
export function acceptInvite(
  db: DB,
  code: string,
  identity: { did?: string; name?: string },
): { userId: string; memberId: string; name: string } {
  const invite = db.prepare('SELECT * FROM invites WHERE code = ?').get(code.toUpperCase()) as
    | { code: string; member_id: string; status: string }
    | undefined;
  if (!invite) throw new DomainError('not_found', 'Invite not found.');
  if (invite.status !== 'pending') throw new DomainError('action_conflict', 'This invite was already used.');
  if (identity.did) {
    const existing = db.prepare('SELECT id FROM users WHERE privy_did = ?').get(identity.did);
    if (existing) throw new DomainError('action_conflict', 'This account already belongs to the household.');
  }

  const member = getMemberRow(db, invite.member_id);
  const userId = `u-${member.id.slice(2)}`;
  const memoSuffix = String(Math.floor(1000 + Math.random() * 9000));
  db.prepare('INSERT INTO users (id,name,role,member_id,deposit_memo,privy_did) VALUES (?,?,?,?,?,?)').run(
    userId,
    member.name,
    member.role,
    member.id,
    `FC-${member.name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8)}-${memoSuffix}`,
    identity.did ?? null,
  );
  db.prepare("UPDATE members SET status='active' WHERE id = ?").run(member.id);
  db.prepare("UPDATE invites SET status='accepted', accepted_at=? WHERE code = ?").run(
    new Date().toISOString(),
    invite.code,
  );
  appendAudit(db, {
    kind: 'security_event',
    title: `${member.name} joined the household`,
    subtitle: identity.did ? 'Signed in with Privy' : 'Dev sign-in',
    memberId: member.id,
    actor: member.name,
  });
  return { userId, memberId: member.id, name: member.name };
}

/**
 * Freeze/unfreeze — shared by the prepared-action path and the direct
 * manual path (same domain action behind both, spec §82 rule 14). The
 * provider call happens first; local state only changes on success.
 */
export async function applyFreeze(
  db: DB,
  provider: CardProvider,
  cardId: string,
  freezing: boolean,
  actor: string,
  actionId = '',
): Promise<Receipt> {
  const c = getCardRow(db, cardId);
  if (c.status === 'closed') throw new DomainError('invalid_request', 'This card is closed.');

  if (c.provider_card_id) {
    await provider.setFrozen(c.provider_card_id, freezing);
  }
  db.prepare('UPDATE cards SET status=? WHERE id=?').run(freezing ? 'frozen' : 'active', cardId);
  appendAudit(db, {
    kind: 'card_event',
    title: `${c.nickname} ${freezing ? 'frozen' : 'unfrozen'}`,
    subtitle: `By ${actor}`,
    memberId: c.member_id ?? undefined,
    actor,
  });
  return {
    actionId,
    title: freezing ? 'Card frozen' : 'Card unfrozen',
    rows: [{ label: c.nickname, value: freezing ? 'Active → Frozen' : 'Frozen → Active' }],
    actor,
    at: new Date().toISOString(),
  };
}

/** Direct rule toggles (reversible, audited): card channels and member categories. */
export function setChannel(
  db: DB,
  session: Session,
  cardId: string,
  channel: 'online' | 'contactless' | 'atm' | 'international',
  enabled: boolean,
): void {
  assertManager(session);
  const c = getCardRow(db, cardId);
  db.prepare(`UPDATE cards SET ${channel}=? WHERE id=?`).run(enabled ? 1 : 0, cardId);
  const labels = { online: 'Online payments', contactless: 'Contactless', atm: 'ATM withdrawals', international: 'International' };
  appendAudit(db, {
    kind: 'rule_event',
    title: `${labels[channel]} turned ${enabled ? 'on' : 'off'} — ${c.nickname}`,
    subtitle: `By ${session.name}`,
    memberId: c.member_id ?? undefined,
    actor: session.name,
  });
}

export function setCategory(
  db: DB,
  session: Session,
  memberId: string,
  categoryKey: string,
  enabled: boolean,
): void {
  assertManager(session);
  const m = getMemberRow(db, memberId);
  const cat = db
    .prepare('SELECT label FROM member_categories WHERE member_id=? AND key=?')
    .get(memberId, categoryKey) as { label: string } | undefined;
  if (!cat) throw new DomainError('not_found', 'Category not found.');
  db.prepare('UPDATE member_categories SET enabled=? WHERE member_id=? AND key=?').run(
    enabled ? 1 : 0,
    memberId,
    categoryKey,
  );
  appendAudit(db, {
    kind: 'rule_event',
    title: `${cat.label} turned ${enabled ? 'on' : 'off'} — ${m.name}`,
    subtitle: `By ${session.name}`,
    memberId,
    actor: session.name,
  });
}

/** Direct (non-AI) freeze: reversible, so no prepared action required (spec UI §12). */
export async function directFreeze(
  db: DB,
  session: Session,
  provider: CardProvider,
  cardId: string,
  freezing: boolean,
): Promise<Receipt> {
  const c = getCardRow(db, cardId);
  const ownCard = c.member_id === session.memberId;
  if (!ownCard) assertManager(session);
  return applyFreeze(db, provider, cardId, freezing, session.name);
}

// ---------------------------------------------------------------- APPROVALS

export function approveOnce(
  db: DB,
  session: Session,
  approvalId: string,
  authAssertion: string | undefined,
): Receipt {
  assertManager(session);
  assertStepUp(authAssertion);

  const a = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId) as ApprovalRow | undefined;
  if (!a) throw new DomainError('not_found', 'Approval not found.');
  if (a.status !== 'pending') throw new DomainError('action_conflict', `Request is already ${a.status}.`);
  if (new Date(a.expires_at).getTime() < Date.now()) {
    db.prepare("UPDATE approvals SET status='expired' WHERE id=?").run(a.id);
    throw new DomainError('action_expired', 'This request expired.');
  }

  const at = new Date().toISOString();
  const requester = getMemberRow(db, a.requester_id);
  const txnId = `t-appr-${a.id}`;

  db.prepare("UPDATE approvals SET status='approved', resolved_by=?, resolved_at=? WHERE id=?").run(
    session.name,
    at,
    a.id,
  );
  db.prepare(
    'INSERT INTO transactions (id,merchant,member_id,card_id,amount,direction,category,status,approved_by,at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(txnId, a.merchant, a.requester_id, a.card_id, a.amount, 'debit', a.category, 'settled', session.name, at);
  db.prepare('UPDATE members SET spent_this_month = spent_this_month + ? WHERE id=?').run(a.amount, a.requester_id);
  db.prepare('UPDATE cards SET spent_this_month = spent_this_month + ? WHERE id=?').run(a.amount, a.card_id);
  db.prepare('UPDATE household SET budget_spent = budget_spent + ?').run(a.amount);
  appendAudit(db, {
    kind: 'approval_event',
    title: `Approved once — ${a.merchant} ${inr(a.amount)}`,
    subtitle: `${requester.name} · rules unchanged`,
    amount: a.amount,
    memberId: a.requester_id,
    actor: session.name,
  });

  return {
    actionId: a.id,
    title: 'Approved once',
    rows: [
      { label: 'Merchant', value: a.merchant },
      { label: 'Amount', value: inr(a.amount) },
      { label: `${requester.name}'s rules`, value: 'Unchanged' },
    ],
    actor: session.name,
    at,
  };
}

export function declineApproval(db: DB, session: Session, approvalId: string): void {
  assertManager(session);
  const a = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId) as ApprovalRow | undefined;
  if (!a) throw new DomainError('not_found', 'Approval not found.');
  if (a.status !== 'pending') throw new DomainError('action_conflict', `Request is already ${a.status}.`);
  const requester = getMemberRow(db, a.requester_id);
  db.prepare("UPDATE approvals SET status='declined', resolved_by=?, resolved_at=? WHERE id=?").run(
    session.name,
    new Date().toISOString(),
    a.id,
  );
  appendAudit(db, {
    kind: 'approval_event',
    title: `Declined — ${a.merchant} ${inr(a.amount)}`,
    subtitle: `${requester.name}'s request`,
    memberId: a.requester_id,
    actor: session.name,
  });
}
