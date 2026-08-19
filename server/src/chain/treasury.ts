// Treasury — the pool account is a Privy server wallet (Tier 2 Stellar):
// Privy custodies the ed25519 key; we build transactions with the
// Stellar SDK, ask Privy to raw-sign the transaction hash, attach the
// decorated signature, and submit to Horizon. No signing key ever
// touches this process.
//
// docs: https://docs.privy.io/recipes/use-tier-2#stellar

import { PrivyClient } from '@privy-io/node';
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
  xdr,
  type Transaction,
} from '@stellar/stellar-sdk';

import { appendAudit } from '../audit.js';
import type { AppConfig } from '../config.js';
import type { DB } from '../db.js';
import { getPool } from '../services/readModel.js';

const HORIZON = () => process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = () =>
  (process.env.STELLAR_NETWORK ?? 'testnet') === 'public' ? Networks.PUBLIC : Networks.TESTNET;

export interface StellarSigner {
  address: string;
  /** Sign a 32-byte transaction hash; returns the 64-byte ed25519 signature. */
  sign(hash: Buffer): Promise<Buffer>;
}

/** Privy-backed signer for a server wallet. */
export function privySigner(client: PrivyClient, walletId: string, address: string): StellarSigner {
  return {
    address,
    async sign(hash: Buffer): Promise<Buffer> {
      const res = await client.wallets().rawSign(walletId, {
        params: { hash: `0x${hash.toString('hex')}` },
      });
      return Buffer.from(res.signature.replace(/^0x/, ''), 'hex');
    },
  };
}

export function privyClientFromConfig(config: AppConfig): PrivyClient | null {
  if (!config.PRIVY_APP_ID || !config.PRIVY_APP_SECRET) return null;
  return new PrivyClient({ appId: config.PRIVY_APP_ID, appSecret: config.PRIVY_APP_SECRET });
}

/** Attach a signer's signature to a built transaction. */
export async function signTransaction(tx: Transaction, signer: StellarSigner): Promise<void> {
  const signature = await signer.sign(tx.hash());
  const hint = Keypair.fromPublicKey(signer.address).signatureHint();
  tx.signatures.push(new xdr.DecoratedSignature({ hint, signature }));
}

async function horizonAccount(address: string, fetchFn: typeof fetch): Promise<Account> {
  const res = await fetchFn(`${HORIZON()}/accounts/${address}`);
  if (!res.ok) throw new Error(`Horizon account lookup failed (${res.status}) for ${address}`);
  const json = (await res.json()) as { sequence: string };
  return new Account(address, json.sequence);
}

export async function submitTransaction(
  tx: Transaction,
  fetchFn: typeof fetch,
): Promise<{ hash: string }> {
  const res = await fetchFn(`${HORIZON()}/transactions`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ tx: tx.toEnvelope().toXDR('base64') }),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json?.hash) {
    const detail = json?.extras?.result_codes ? JSON.stringify(json.extras.result_codes) : res.status;
    throw new Error(`Horizon submit failed: ${detail}`);
  }
  return { hash: json.hash };
}

/** Build + sign + submit a payment from a signer's account. */
export async function sendPayment(
  signer: StellarSigner,
  opts: {
    to: string;
    amount: string; // decimal string, up to 7 dp
    asset?: { code: string; issuer: string | null };
    memoText?: string;
  },
  fetchFn: typeof fetch = fetch,
): Promise<{ hash: string }> {
  const account = await horizonAccount(signer.address, fetchFn);
  const asset =
    !opts.asset || opts.asset.code === 'XLM' || !opts.asset.issuer
      ? Asset.native()
      : new Asset(opts.asset.code, opts.asset.issuer);

  let builder = new TransactionBuilder(account, {
    fee: (Number(BASE_FEE) * 2).toString(),
    networkPassphrase: NETWORK_PASSPHRASE(),
  }).addOperation(Operation.payment({ destination: opts.to, asset, amount: opts.amount }));
  if (opts.memoText) builder = builder.addMemo(Memo.text(opts.memoText));
  const tx = builder.setTimeout(120).build();

  await signTransaction(tx, signer);
  return submitTransaction(tx, fetchFn);
}

/**
 * Create the pool as a Privy Stellar server wallet, fund it via
 * friendbot (testnet), and point the pool row at it. Demo runs on
 * native XLM; a USDC trustline is a later step.
 */
export async function bootstrapPool(
  db: DB,
  client: PrivyClient,
  opts: { rateInrPerUnit?: number } = {},
  fetchFn: typeof fetch = fetch,
): Promise<{ address: string; walletId: string }> {
  const existing = getPool(db) as { privy_wallet_id?: string | null; account: string };
  if (existing.privy_wallet_id) {
    return { address: existing.account, walletId: existing.privy_wallet_id };
  }

  const wallet = await client.wallets().create({
    chain_type: 'stellar',
    display_name: 'fastcards-pool',
  });

  const fb = await fetchFn(`https://friendbot.stellar.org/?addr=${wallet.address}`);
  if (!fb.ok) throw new Error(`friendbot funding failed (${fb.status})`);

  db.prepare(
    "UPDATE pool SET account=?, privy_wallet_id=?, network='testnet', asset_code='XLM', asset_issuer=NULL, rate_inr_per_unit=?",
  ).run(wallet.address, wallet.id, opts.rateInrPerUnit ?? 30);
  appendAudit(db, {
    kind: 'security_event',
    title: 'Stellar pool wallet created',
    subtitle: `${wallet.address} · Privy server wallet`,
    actor: 'treasury',
  });
  return { address: wallet.address, walletId: wallet.id };
}

/**
 * Process queued withdrawals: sign the payout with the pool's Privy
 * wallet and submit on-chain. Success → 'sent' with the tx hash;
 * failure → 'failed' with the reason (money already left the app
 * balance at EXECUTE; a failed payout is surfaced for manual review).
 */
export async function processWithdrawals(
  db: DB,
  client: PrivyClient,
  fetchFn: typeof fetch = fetch,
): Promise<{ sent: number; failed: number }> {
  const pool = getPool(db) as ReturnType<typeof getPool> & { privy_wallet_id?: string | null };
  if (!pool.privy_wallet_id) return { sent: 0, failed: 0 };
  const signer = privySigner(client, pool.privy_wallet_id, pool.account);

  const queued = db.prepare("SELECT * FROM withdrawals WHERE status='queued' ORDER BY at ASC LIMIT 5").all() as {
    id: string;
    to_address: string;
    amount_units: number;
    amount_inr: number;
  }[];

  let sent = 0;
  let failed = 0;
  for (const w of queued) {
    try {
      const { hash } = await sendPayment(
        signer,
        {
          to: w.to_address,
          amount: w.amount_units.toFixed(7),
          asset: { code: pool.asset_code, issuer: pool.asset_issuer },
        },
        fetchFn,
      );
      db.prepare("UPDATE withdrawals SET status='sent', tx_hash=? WHERE id=?").run(hash, w.id);
      appendAudit(db, {
        kind: 'transfer',
        title: `Withdrawal sent on-chain — ₹${w.amount_inr.toLocaleString('en-IN')}`,
        subtitle: `tx ${hash.slice(0, 10)}… · ${w.amount_units.toFixed(2)} ${pool.asset_code}`,
        amount: w.amount_inr,
        actor: 'treasury',
      });
      sent += 1;
    } catch (e) {
      db.prepare("UPDATE withdrawals SET status='failed', error=? WHERE id=?").run(
        String((e as Error).message).slice(0, 300),
        w.id,
      );
      appendAudit(db, {
        kind: 'security_event',
        title: `Withdrawal payout failed — needs review`,
        subtitle: String((e as Error).message).slice(0, 120),
        actor: 'treasury',
      });
      failed += 1;
    }
  }
  return { sent, failed };
}
