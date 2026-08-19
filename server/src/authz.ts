// Session + permission checks.
//
// Live mode (Privy configured): callers authenticate with
// `Authorization: Bearer <privy access token>`. The token's DID maps to a
// user row; the first authenticated DID binds to the seeded owner
// account (bootstrap), later DIDs must arrive through an invite. Linked
// wallets are synced on login for deposit attribution.
//
// Dev mode (no Privy, never in production): the x-user-id header selects
// a seeded session, exactly like before.

import { appendAudit } from './audit.js';
import type { AuthVerifier } from './auth/privy.js';
import type { DB } from './db.js';
import { DomainError, type Session } from './types.js';

interface UserRow {
  id: string;
  name: string;
  role: Session['role'];
  member_id: string;
  privy_did: string | null;
  kyc_status: Session['kycStatus'];
  is_admin: number;
}

export interface AuthContext {
  verifier: AuthVerifier | null;
  devAuthAllowed: boolean;
}

export async function resolveSession(
  db: DB,
  auth: AuthContext,
  headers: { authorization?: string; 'x-user-id'?: string; 'privy-id-token'?: string },
): Promise<Session> {
  const bearer = headers.authorization?.startsWith('Bearer ')
    ? headers.authorization.slice(7)
    : undefined;

  if (auth.verifier && bearer) {
    return resolvePrivySession(db, auth.verifier, bearer, headers['privy-id-token']);
  }
  if (auth.devAuthAllowed) {
    const userId = headers['x-user-id'] ?? 'u-rohan';
    const row = db.prepare('SELECT id, name, role, member_id, privy_did, kyc_status, is_admin FROM users WHERE id = ?').get(userId) as
      | UserRow
      | undefined;
    if (!row) throw new DomainError('permission_denied', 'Unknown user.');
    return sessionFrom(row);
  }
  throw new DomainError('step_up_required', 'Sign in to continue.');
}

async function resolvePrivySession(
  db: DB,
  verifier: AuthVerifier,
  token: string,
  idToken?: string,
): Promise<Session> {
  let did: string;
  try {
    ({ did } = await verifier.verify(token));
  } catch {
    throw new DomainError('step_up_required', 'Your session has expired. Sign in again.');
  }

  let row = db.prepare('SELECT id, name, role, member_id, privy_did, kyc_status, is_admin FROM users WHERE privy_did = ?').get(did) as
    | UserRow
    | undefined;

  if (!row) {
    // Bootstrap: the first Privy identity claims the seeded owner account.
    const ownerUnbound = db
      .prepare("SELECT id, name, role, member_id, privy_did, kyc_status, is_admin FROM users WHERE role='owner' AND privy_did IS NULL")
      .get() as UserRow | undefined;
    if (ownerUnbound) {
      db.prepare('UPDATE users SET privy_did = ? WHERE id = ?').run(did, ownerUnbound.id);
      appendAudit(db, {
        kind: 'security_event',
        title: 'Owner account linked to Privy',
        subtitle: did,
        actor: ownerUnbound.name,
      });
      row = { ...ownerUnbound, privy_did: did };
    } else {
      throw new DomainError(
        'permission_denied',
        'This account is not part of the household yet. Ask the owner for an invite.',
      );
    }
  }

  await syncWallets(db, verifier, row.id, did, idToken);
  return sessionFrom(row);
}

/** Best-effort sync of Privy linked wallets → user_wallets (for deposit attribution). */
async function syncWallets(
  db: DB,
  verifier: AuthVerifier,
  userId: string,
  did: string,
  idToken?: string,
): Promise<void> {
  const wallets = await verifier.getWallets(did, idToken);
  const insert = db.prepare(
    'INSERT INTO user_wallets (user_id, address, chain_type, source, linked_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id, address) DO NOTHING',
  );
  for (const w of wallets) {
    insert.run(userId, w.address, w.chainType, 'privy', new Date().toISOString());
  }
}

function sessionFrom(row: UserRow): Session {
  return {
    userId: row.id,
    name: row.name,
    memberId: row.member_id,
    role: row.role,
    kycStatus: row.kyc_status,
    isAdmin: row.is_admin === 1,
  };
}

/** Platform-operator authority: card orders, KYC review, provider pool. */
export function assertAdmin(session: Session): void {
  if (!session.isAdmin) {
    throw new DomainError('permission_denied', 'Platform admin access required.');
  }
}

export function isManager(session: Session): boolean {
  return session.role === 'owner' || session.role === 'admin';
}

/** Household-management authority: rules, allowances, approvals, other members' cards. */
export function assertManager(session: Session): void {
  if (!isManager(session)) {
    throw new DomainError('permission_denied', 'Only the household owner or an admin can do this.');
  }
}

/** READ scope: managers see the household; members see themselves. */
export function canReadMember(session: Session, memberId: string): boolean {
  return isManager(session) || session.memberId === memberId;
}

export function assertCanReadMember(session: Session, memberId: string): void {
  if (!canReadMember(session, memberId)) {
    throw new DomainError('permission_denied', 'You can only view your own activity.');
  }
}

/**
 * Step-up authentication (spec §40.2). Prototype accepts the mock
 * assertion; the production path is Privy MFA / a platform passkey
 * assertion bound to the action.
 */
export function assertStepUp(assertion: string | undefined): void {
  if (assertion !== 'passkey-mock-ok') {
    throw new DomainError('step_up_required', 'This action needs passkey confirmation.');
  }
}
