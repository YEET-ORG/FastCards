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

import type { AuthVerifier } from './auth/privy.js';
import type { Stdb } from './stdb/client.js';
import { mapUser, type UserRowShape } from './stdb/rows.js';
import { DomainError, type Session } from './types.js';

export interface AuthContext {
  verifier: AuthVerifier | null;
  devAuthAllowed: boolean;
}

/** Cap on the name a caller may claim at bind time — long enough for a real
 * name, short enough that it cannot be used as a storage channel. */
const MAX_DISPLAY_NAME = 60;

/** `x-display-name` is URI-encoded by the app: header values must be
 * latin-1, and names are not. A malformed value is dropped, never fatal. */
function readDisplayName(raw: string | undefined): string {
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).trim().slice(0, MAX_DISPLAY_NAME);
  } catch {
    return '';
  }
}

export async function resolveSession(
  stdb: Stdb,
  auth: AuthContext,
  headers: {
    authorization?: string;
    'x-user-id'?: string;
    'privy-id-token'?: string;
    'x-display-name'?: string;
  },
): Promise<Session> {
  const bearer = headers.authorization?.startsWith('Bearer ')
    ? headers.authorization.slice(7)
    : undefined;

  if (auth.verifier && bearer) {
    return resolvePrivySession(
      stdb,
      auth.verifier,
      bearer,
      headers['privy-id-token'],
      readDisplayName(headers['x-display-name']),
    );
  }
  if (auth.devAuthAllowed) {
    const userId = headers['x-user-id'] ?? 'u-rohan';
    const raw = stdb.db.users.id.find(userId);
    if (!raw) throw new DomainError('permission_denied', 'Unknown user.');
    return sessionFrom(mapUser(raw));
  }
  throw new DomainError('step_up_required', 'Sign in to continue.');
}

async function resolvePrivySession(
  stdb: Stdb,
  verifier: AuthVerifier,
  token: string,
  idToken?: string,
  displayName = '',
): Promise<Session> {
  let did: string;
  try {
    ({ did } = await verifier.verify(token));
  } catch {
    throw new DomainError('step_up_required', 'Your session has expired. Sign in again.');
  }

  let row = [...stdb.db.users.iter()].map(mapUser).find((u) => u.privy_did === did);

  if (!row) {
    // Bootstrap: the first Privy identity claims the seeded owner account.
    const ownerUnbound = [...stdb.db.users.iter()]
      .map(mapUser)
      .find((u) => u.role === 'owner' && u.privy_did === null);
    if (ownerUnbound) {
      // The name is only honoured here, on the claim. An already-bound row is
      // never renamed from a request header.
      await stdb.call((r) => r.bindPrivyDid({ userId: ownerUnbound.id, did, displayName }));
      row = { ...ownerUnbound, privy_did: did, name: displayName || ownerUnbound.name };
    } else {
      throw new DomainError(
        'permission_denied',
        'This account is not part of the household yet. Ask the owner for an invite.',
      );
    }
  }

  await syncWallets(stdb, verifier, row.id, did, idToken);
  return sessionFrom(row);
}

/** Best-effort sync of Privy linked wallets → user_wallets (for deposit attribution). */
async function syncWallets(
  stdb: Stdb,
  verifier: AuthVerifier,
  userId: string,
  did: string,
  idToken?: string,
): Promise<void> {
  const wallets = await verifier.getWallets(did, idToken);
  for (const w of wallets) {
    await stdb.call((r) =>
      r.linkWallet({ userId, address: w.address, chainType: w.chainType, source: 'privy' }),
    );
  }
}

function sessionFrom(row: UserRowShape): Session {
  return {
    userId: row.id,
    name: row.name,
    memberId: row.member_id,
    role: row.role as Session['role'],
    kycStatus: row.kyc_status as Session['kycStatus'],
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
