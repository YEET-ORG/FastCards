// Append-only audit ledger (spec §4.4, §82 rule 6): every money
// movement, rule change, card action, approval, deposit, and AI-mediated
// change lands here.

import type { DB } from './db.js';
import type { AuditRow } from './types.js';

export function appendAudit(
  db: DB,
  event: {
    kind: AuditRow['kind'];
    title: string;
    subtitle?: string;
    amount?: number;
    memberId?: string;
    actor: string;
  },
): void {
  db.prepare(
    'INSERT INTO audit_events (kind,title,subtitle,amount,member_id,actor,at) VALUES (?,?,?,?,?,?,?)',
  ).run(
    event.kind,
    event.title,
    event.subtitle ?? null,
    event.amount ?? null,
    event.memberId ?? null,
    event.actor,
    new Date().toISOString(),
  );
}

export function listAudit(db: DB, limit = 100): AuditRow[] {
  return db
    .prepare('SELECT * FROM audit_events ORDER BY at DESC, id DESC LIMIT ?')
    .all(limit) as unknown as AuditRow[];
}
