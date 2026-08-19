import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';

import { createVerifier, type AuthVerifier } from './auth/privy.js';
import { createProvider, type CardProvider } from './cards/provider.js';
import { syncDeposits } from './chain/stellar.js';
import { privyClientFromConfig, processWithdrawals } from './chain/treasury.js';
import { loadConfig, type AppConfig } from './config.js';
import { openDb, seed, type DB } from './db.js';
import { registerRoutes } from './routes.js';

export interface BuildOptions {
  db?: DB;
  provider?: CardProvider;
  verifier?: AuthVerifier | null;
  config?: AppConfig;
}

export async function buildApp(opts: BuildOptions = {}) {
  const config = opts.config ?? loadConfig();
  const database = opts.db ?? openDb(config.FASTCARDS_DB);
  seed(database);
  const cardProvider = opts.provider ?? createProvider();
  const verifier = opts.verifier !== undefined ? opts.verifier : createVerifier(config);

  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.NODE_ENV === 'production' ? 'info' : 'debug',
            redact: ['req.headers.authorization', 'req.headers["x-auth-assertion"]'],
          },
    bodyLimit: 64 * 1024,
  });

  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(','),
    allowedHeaders: ['content-type', 'authorization', 'privy-id-token', 'x-user-id', 'x-auth-assertion'],
  });
  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
  });

  const privyApi = privyClientFromConfig(config);
  registerRoutes(
    app,
    database,
    cardProvider,
    { verifier, devAuthAllowed: config.devAuthAllowed },
    privyApi,
  );

  return { app, db: database, provider: cardProvider, config, privyApi };
}

const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMain) {
  const { app, db, config, privyApi } = await buildApp();

  // Poll the Stellar rail: ingest deposits and pay out queued
  // withdrawals. Failures are logged, never fatal.
  if (config.STELLAR_POLL_MS > 0) {
    setInterval(() => {
      syncDeposits(db).catch((e) => app.log.warn({ err: (e as Error).message }, 'stellar sync failed'));
      if (privyApi) {
        processWithdrawals(db, privyApi).catch((e) =>
          app.log.warn({ err: (e as Error).message }, 'withdrawal processing failed'),
        );
      }
    }, config.STELLAR_POLL_MS).unref();
  }

  // Graceful shutdown: stop accepting connections, flush, close the DB.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      db.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info(
      { port: config.PORT, auth: config.privyEnabled ? 'privy' : 'dev', agent: config.QWEN_BASE_URL ? 'qwen' : 'scripted' },
      'fastcards-server up',
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
