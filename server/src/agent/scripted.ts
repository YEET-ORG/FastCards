// Deterministic fallback interpreter — runs when no Anthropic credentials
// are configured (offline dev, CI). Same authority model as the LLM path:
// it only calls READ services and prepareAction.

import type { DB } from '../db.js';
import { prepareAction } from '../services/actions.js';
import { getMember, getOverview, listApprovals, listCards, listMembers } from '../services/readModel.js';
import { DomainError, type PreparedAction, type Session } from '../types.js';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function upcomingSundayEnd(): Date {
  const d = new Date();
  const add = d.getDay() === 0 ? 7 : (7 - d.getDay()) % 7;
  const s = new Date(d);
  s.setDate(d.getDate() + add);
  s.setHours(23, 59, 0, 0);
  return s;
}

export function interpretScripted(
  db: DB,
  session: Session,
  input: string,
): { text: string; prepared: PreparedAction[] } {
  const text = input.toLowerCase();
  const prepared: PreparedAction[] = [];
  const replies: string[] = [];

  const members = listMembers(db, session);
  const findMember = () => members.find((m) => text.includes(m.name.toLowerCase()));
  const amountMatch = text.replace(/,/g, '').match(/(?:₹|rs\.?\s*)?(\d{2,7})/);
  const amount = amountMatch ? Number(amountMatch[1]) : undefined;

  const tryPrepare = (fn: () => PreparedAction, intro: string) => {
    try {
      const action = fn();
      prepared.push(action);
      replies.push(intro);
    } catch (e) {
      if (e instanceof DomainError) replies.push(e.message);
      else throw e;
    }
  };

  if (/approv/.test(text)) {
    const pending = listApprovals(db, session).filter((a) => a.status === 'pending');
    replies.push(
      pending.length === 0
        ? "You're all caught up — no approvals waiting."
        : `${pending.length} request${pending.length > 1 ? 's' : ''} waiting: ${pending
            .map((a) => `${a.merchant} ${inr(a.amount)}`)
            .join(', ')}. Review them in Approvals.`,
    );
  }

  if (/\b(give|add|extra|more|increase|top ?up)\b/.test(text) && !/approv/.test(text)) {
    const member = findMember();
    if (member && amount) {
      const until = /sunday|weekend/.test(text)
        ? upcomingSundayEnd()
        : new Date(Date.now() + 7 * 24 * 3600_000);
      tryPrepare(
        () =>
          prepareAction(
            db,
            session,
            { kind: 'temp_allowance', memberId: member.id, amount, expiresAt: until.toISOString() },
            'agent',
          ),
        `Prepared a temporary +${inr(amount)} for ${member.name}. Review and confirm to apply — nothing changes until you do.`,
      );
    } else {
      replies.push('Who is it for and how much? Try "Give Maya ₹1,000 more until Sunday".');
    }
  }

  if (/\b(freeze|unfreeze|pause)\b/.test(text)) {
    const member = findMember();
    const cards = listCards(db, session);
    const card = member ? cards.find((c) => c.member_id === member.id && c.variant !== 'personal') : undefined;
    if (card) {
      const freeze = !/unfreeze|resume/.test(text) && card.status !== 'frozen';
      tryPrepare(
        () =>
          prepareAction(db, session, { kind: freeze ? 'freeze_card' : 'unfreeze_card', cardId: card.id }, 'agent'),
        `Prepared ${freeze ? 'freezing' : 'unfreezing'} ${card.nickname}. Confirm in the app to apply.`,
      );
    } else if (replies.length === 0) {
      replies.push('Whose card should I freeze? Try "Freeze Dad\'s card".');
    }
  }

  if (replies.length === 0 && /\b(left|remaining|balance|limit)\b/.test(text)) {
    const member = findMember();
    if (member && member.monthly_limit !== null) {
      const detail = getMember(db, session, member.id);
      replies.push(`${member.name} has ${inr(detail.remaining ?? 0)} left this month of ${inr(member.monthly_limit)}.`);
    } else {
      const overview = getOverview(db, session);
      const total = Object.values(overview.balances).reduce((s: number, v) => s + (v as number), 0);
      replies.push(
        overview.scope === 'household'
          ? `You have ${inr(total)} available (personal ${inr((overview.balances as any).personal ?? 0)}, family ${inr((overview.balances as any).family ?? 0)}).`
          : `You have ${inr((overview as any).self?.remaining ?? 0)} left this month.`,
      );
    }
  }

  if (replies.length === 0 && /\b(spend|spent|spending)\b/.test(text)) {
    const overview = getOverview(db, session);
    if (overview.scope === 'household') {
      replies.push(
        `The household has spent ${inr(overview.household.budget_spent!)} of the ${inr(overview.household.budget_cap!)} monthly budget.`,
      );
    }
  }

  if (replies.length === 0) {
    replies.push(
      'I can check balances, family spending, prepare temporary allowances, and freeze cards. Try "Give Maya ₹1,000 more until Sunday".',
    );
  }

  return { text: replies.join(' '), prepared };
}
