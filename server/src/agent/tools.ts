// AI tool registry (spec §54) — provider-neutral. Strictly READ +
// PREPARE: every tool calls the same session-scoped services the REST
// API uses, so the model can never read wider than the caller or execute
// anything. Prepared actions are collected per-request and returned to
// the client for rendering in its trusted confirmation surface.

import { z } from 'zod';

import type { Stdb } from '../stdb/client.js';
import { prepareAction } from '../services/actions.js';
import {
  getMember,
  getOverview,
  listApprovals,
  listCards,
  listMembers,
  listTransactions,
} from '../services/readModel.js';
import { DomainError, type PreparedAction, type Session } from '../types.js';

export interface AgentContext {
  stdb: Stdb;
  session: Session;
  /** PREPARE results collected during the turn, for client rendering. */
  prepared: PreparedAction[];
}

export interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodType;
  run: (input: unknown) => string | Promise<string>;
}

async function asResult(fn: () => unknown | Promise<unknown>): Promise<string> {
  try {
    return JSON.stringify(await fn());
  } catch (e) {
    if (e instanceof DomainError) return JSON.stringify({ error: e.code, message: e.message });
    throw e;
  }
}

const prepareNote = (what: string) =>
  `${what} This PREPARES the change only — the user must confirm it in the app before anything executes. Never tell the user it is done.`;

export function buildTools(ctx: AgentContext): ToolDef[] {
  const { stdb, session } = ctx;

  const collect = (action: PreparedAction) => {
    ctx.prepared.push(action);
    return { prepared: true, actionId: action.id, facts: action.facts };
  };

  return [
    {
      name: 'get_household_overview',
      description:
        'Balances and household budget visible to the current user. Managers see the household; members see only themselves.',
      schema: z.object({}),
      run: () => asResult(() => getOverview(stdb, session)),
    },
    {
      name: 'get_family_members',
      description: 'List family members visible to the current user, with ids, roles and monthly limits.',
      schema: z.object({}),
      run: () => asResult(() => listMembers(stdb, session)),
    },
    {
      name: 'get_member_spending',
      description:
        'One member: monthly limit, spent, remaining (including any active temporary allowance) and category budgets.',
      schema: z.object({ memberId: z.string().describe('Member id, e.g. m-maya') }),
      run: (input) =>
        asResult(() => getMember(stdb, session, (input as { memberId: string }).memberId)),
    },
    {
      name: 'get_cards',
      description: 'List cards visible to the current user with status, caps and rules.',
      schema: z.object({}),
      run: () => asResult(() => listCards(stdb, session)),
    },
    {
      name: 'get_transactions',
      description: 'Recent transactions, optionally filtered by member or card.',
      schema: z.object({
        memberId: z.string().optional(),
        cardId: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      run: (input) => asResult(() => listTransactions(stdb, session, input as object)),
    },
    {
      name: 'get_pending_approvals',
      description: 'Pending purchase approvals visible to the current user.',
      schema: z.object({}),
      run: () => asResult(() => listApprovals(stdb, session).filter((a) => a.status === 'pending')),
    },
    {
      name: 'prepare_temp_allowance',
      description: prepareNote(
        'Prepare a temporary allowance top-up for a family member (extra spending room until an exact expiry).',
      ),
      schema: z.object({
        memberId: z.string(),
        amountInr: z.number().int().positive(),
        expiresAtIso: z.string().describe('Exact ISO 8601 expiry, e.g. next Sunday 23:59 local time'),
      }),
      run: (input) =>
        asResult(async () => {
          const i = input as { memberId: string; amountInr: number; expiresAtIso: string };
          return collect(
            await prepareAction(
              stdb,
              session,
              { kind: 'temp_allowance', memberId: i.memberId, amount: i.amountInr, expiresAt: i.expiresAtIso },
              'agent',
            ),
          );
        }),
    },
    {
      name: 'prepare_card_freeze',
      description: prepareNote('Prepare freezing or unfreezing a card.'),
      schema: z.object({
        cardId: z.string(),
        freeze: z.boolean().describe('true to freeze, false to unfreeze'),
      }),
      run: (input) =>
        asResult(async () => {
          const i = input as { cardId: string; freeze: boolean };
          return collect(
            await prepareAction(stdb, session, { kind: i.freeze ? 'freeze_card' : 'unfreeze_card', cardId: i.cardId }, 'agent'),
          );
        }),
    },
    {
      name: 'prepare_monthly_limit_change',
      description: prepareNote("Prepare a permanent change to a member's monthly limit."),
      schema: z.object({ memberId: z.string(), amountInr: z.number().int().positive() }),
      run: (input) =>
        asResult(async () => {
          const i = input as { memberId: string; amountInr: number };
          return collect(
            await prepareAction(stdb, session, { kind: 'set_monthly_limit', memberId: i.memberId, amount: i.amountInr }, 'agent'),
          );
        }),
    },
    {
      name: 'prepare_transfer',
      description: prepareNote('Prepare an internal transfer between the personal balance and the family pool.'),
      schema: z.object({
        from: z.enum(['personal', 'family']),
        to: z.enum(['personal', 'family']),
        amountInr: z.number().int().positive(),
      }),
      run: (input) =>
        asResult(async () => {
          const i = input as { from: 'personal' | 'family'; to: 'personal' | 'family'; amountInr: number };
          return collect(
            await prepareAction(stdb, session, { kind: 'transfer', from: i.from, to: i.to, amount: i.amountInr }, 'agent'),
          );
        }),
    },
    {
      name: 'prepare_create_card',
      description: prepareNote(
        'Prepare creating a new virtual card — a family card for a member, or a purpose card (subscriptions, travel…).',
      ),
      schema: z.object({
        cardType: z.enum(['family', 'purpose']),
        memberId: z.string().optional().describe('Required for family cards'),
        nickname: z.string(),
        monthlyCapInr: z.number().int().positive().optional(),
        approvalAboveInr: z.number().int().positive().optional(),
        initialLoadInr: z.number().int().positive().describe('At least the provider minimum (about ₹880)'),
      }),
      run: (input) =>
        asResult(async () => {
          const i = input as {
            cardType: 'family' | 'purpose';
            memberId?: string;
            nickname: string;
            monthlyCapInr?: number;
            approvalAboveInr?: number;
            initialLoadInr: number;
          };
          return collect(
            await prepareAction(
              stdb,
              session,
              {
                kind: 'create_card',
                cardType: i.cardType,
                memberId: i.memberId,
                nickname: i.nickname,
                monthlyCap: i.monthlyCapInr,
                approvalAbove: i.approvalAboveInr,
                initialLoadInr: i.initialLoadInr,
              },
              'agent',
            ),
          );
        }),
    },
    {
      name: 'prepare_approval_threshold_change',
      description: prepareNote("Prepare a permanent change to a card's ask-before-spending threshold."),
      schema: z.object({ cardId: z.string(), amountInr: z.number().int().positive() }),
      run: (input) =>
        asResult(async () => {
          const i = input as { cardId: string; amountInr: number };
          return collect(
            await prepareAction(
              stdb,
              session,
              { kind: 'set_approval_threshold', cardId: i.cardId, amount: i.amountInr },
              'agent',
            ),
          );
        }),
    },
  ];
}
