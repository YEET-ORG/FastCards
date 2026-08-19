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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  FASTCARDS_DB: z.string().default('fastcards.db'),

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

  // KripiCard
  KRIPICARD_API_KEY: z.string().optional(),
  KRIPICARD_BANK_BIN: z.string().optional(),
  KRIPICARD_BASE_URL: z.string().url().default('https://home.kripicard.com/api/premium'),

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
