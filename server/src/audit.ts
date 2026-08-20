// Append-only audit ledger (spec §4.4, §82 rule 6): every money
// movement, rule change, card action, approval, deposit, and AI-mediated
// change lands here. Most mutations write their audit row atomically
// inside their reducer; this helper covers standalone events (security
// views, treasury bookkeeping).

import type { Stdb } from './stdb/client.js';
import { mapAudit } from './stdb/rows.js';
import type { AuditRow } from './types.js';

export async function appendAudit(
  stdb: Stdb,
  event: {
    kind: AuditRow['kind'];
    title: string;
    subtitle?: string;
    amount?: number;
    memberId?: string;
    actor: string;
  },
): Promise<void> {
  await stdb.call((r) =>
    r.appendAudit({
      kind: event.kind,
      title: event.title,
      subtitle: event.subtitle,
      amount: event.amount,
      memberId: event.memberId,
      actor: event.actor,
    }),
  );
}

export function listAudit(stdb: Stdb, limit = 100): AuditRow[] {
  return [...stdb.db.auditEvents.iter()]
    .sort((a, b) => (a.at === b.at ? Number(b.id - a.id) : a.at < b.at ? 1 : -1))
    .slice(0, limit)
    .map(mapAudit);
}
