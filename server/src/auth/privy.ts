// Privy authentication (live mode) — verifies access tokens from the
// mobile app's Privy session and syncs the user's linked wallets
// (embedded EVM/Solana wallets and connected external wallets) so the
// Stellar rail can attribute deposits by sender address as well as memo.
//
// Wallet sync uses Privy's identity token (`privy-id-token` header,
// forwarded by the app) — it carries linked_accounts, so no extra API
// round-trip is needed. The verifier is an interface so tests inject a
// fake; the real one uses @privy-io/node.

import { PrivyClient, verifyAccessToken } from '@privy-io/node';
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

import type { AppConfig } from '../config.js';

export interface LinkedWallet {
  address: string;
  chainType: string;
}

export interface AuthVerifier {
  /** Verify an access token; returns the Privy DID. Throws on invalid. */
  verify(token: string): Promise<{ did: string }>;
  /** Linked wallet accounts for a verified user. Best-effort. */
  getWallets(did: string, idToken?: string): Promise<LinkedWallet[]>;
}

export class PrivyVerifier implements AuthVerifier {
  private client: PrivyClient | null;
  private key: string | JWTVerifyGetKey;

  constructor(
    private appId: string,
    verificationKey: string | undefined,
    appSecret: string | undefined,
  ) {
    this.client = appSecret ? new PrivyClient({ appId, appSecret }) : null;
    // Prefer the static SPKI key (no network dependency); otherwise use
    // the app's public JWKS endpoint — keys are cached by jose.
    this.key =
      verificationKey ??
      createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
  }

  async verify(token: string): Promise<{ did: string }> {
    const claims = await verifyAccessToken({
      access_token: token,
      app_id: this.appId,
      verification_key: this.key,
    });
    return { did: claims.user_id };
  }

  async getWallets(_did: string, idToken?: string): Promise<LinkedWallet[]> {
    if (!this.client || !idToken) return [];
    try {
      const user = await this.client.users().get({ id_token: idToken });
      const accounts = (user as { linked_accounts?: unknown[] }).linked_accounts ?? [];
      return accounts
        .map((a) => a as { type?: string; address?: string; chain_type?: string })
        .filter((a) => typeof a.address === 'string' && (a.type ?? '').includes('wallet'))
        .map((a) => ({ address: a.address as string, chainType: a.chain_type ?? a.type ?? 'unknown' }));
    } catch {
      return []; // wallet sync is best-effort; auth already succeeded
    }
  }
}

export function createVerifier(config: AppConfig): AuthVerifier | null {
  if (!config.privyEnabled || !config.PRIVY_APP_ID) return null;
  return new PrivyVerifier(config.PRIVY_APP_ID, config.PRIVY_VERIFICATION_KEY, config.PRIVY_APP_SECRET);
}
