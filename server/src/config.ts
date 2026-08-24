// Environment configuration — validated once at boot so a misconfigured
// deployment fails fast instead of failing on the first request.
// Secrets live in server/.env (gitignored); values already present in
// the process environment always win.

import fs from 'node:fs';

import { z } from 'zod';

function loadDotEnv(path = '.env'): void {
  let raw: string;
  try {
    raw = fs.readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, value] = match;
    if (process.env[key] === undefined) {
      process.env[key] = value.replace(/^["']|["']$/g, '');
    }
  }
}

loadDotEnv();

/** The spacetime CLI stores the logged-in identity's token in cli.toml —
 * reuse it so the gateway connects as the database owner in dev. */
function spacetimeCliToken(): string | undefined {
  try {
    const home = process.env.HOME ?? '';
    const raw = fs.readFileSync(`${home}/.config/spacetime/cli.toml`, 'utf8');
    return /spacetimedb_token\s*=\s*"([^"]+)"/.exec(raw)?.[1];
  } catch {
    return undefined;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),

  // SpacetimeDB — the system of record. Local instance by default; the
  // production database lives on maincloud (kami-357rw).
  STDB_URI: z.string().default('ws://127.0.0.1:3000'),
  STDB_DB: z.string().default('kami'),
  /** Auth token for the gateway identity (the database owner). Falls
   * back to the spacetime CLI's saved login. */
  STDB_TOKEN: z.string().optional(),

  // Privy auth (live mode when both are set)
  PRIVY_APP_ID: z.string().optional(),
  PRIVY_APP_SECRET: z.string().optional(),
  /** SPKI verification key from the Privy dashboard (avoids a JWKS fetch). */
  PRIVY_VERIFICATION_KEY: z.string().optional(),

  // Hosted Qwen (OpenAI-compatible)
  QWEN_BASE_URL: z.string().url().optional(),
  QWEN_MODEL: z.string().default('qwen3'),
  QWEN_API_KEY: z.string().optional(),

  // Stellar rail
  STELLAR_HORIZON_URL: z.string().url().default('https://horizon-testnet.stellar.org'),
  STELLAR_POOL_ACCOUNT: z.string().optional(),
  STELLAR_USDC_ISSUER: z.string().optional(),
  STELLAR_POLL_MS: z.coerce.number().int().min(0).default(30_000),

  // KripiCard (real external API — https://www.kripicard.com/api-docs)
  KRIPICARD_API_KEY: z.string().optional(),
  /** Card BIN; 539502 (MasterCard HK) needs no dateOfBirth. */
  KRIPICARD_BIN: z.string().default('539502'),
  KRIPICARD_BASE_URL: z.string().url().default('https://appapi.kripicard.com'),

  // Ops
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  AGENT_MODE: z.enum(['scripted', 'llm']).optional(),
});

export type AppConfig = z.infer<typeof envSchema> & {
  privyEnabled: boolean;
  devAuthAllowed: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  const cfg = parsed.data;
  if (!cfg.STDB_TOKEN) cfg.STDB_TOKEN = spacetimeCliToken();
  // Token verification works with a static SPKI key or, failing that,
  // the app's public JWKS endpoint — so app id + secret is enough.
  const privyEnabled = Boolean(cfg.PRIVY_APP_ID && (cfg.PRIVY_VERIFICATION_KEY || cfg.PRIVY_APP_SECRET));
  // The x-user-id dev header only works outside production.
  const devAuthAllowed = cfg.NODE_ENV !== 'production';
  if (cfg.NODE_ENV === 'production' && !privyEnabled) {
    throw new Error('Production requires Privy auth: set PRIVY_APP_ID and PRIVY_APP_SECRET (or PRIVY_VERIFICATION_KEY).');
  }
  return { ...cfg, privyEnabled, devAuthAllowed };
}
