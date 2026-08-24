// Shared test harness: one SpacetimeDB connection per test file (the
// gateway identity from the CLI login), reset to the seeded state before
// each test via the dev_reset reducer.

import { afterAll } from 'vitest';

import { MockCardProvider } from '../src/cards/provider.js';
import { loadConfig } from '../src/config.js';
import { buildApp } from '../src/server.js';
import { connectStdb, type Stdb } from '../src/stdb/client.js';
import type { AuthVerifier } from '../src/auth/privy.js';

let shared: Stdb | undefined;

export async function getTestStdb(): Promise<Stdb> {
  if (!shared) {
    const config = loadConfig();
    shared = await connectStdb({
      uri: config.STDB_URI,
      dbName: config.STDB_DB,
      token: config.STDB_TOKEN,
    });
  }
  return shared;
}

afterAll(() => {
  shared?.disconnect();
  shared = undefined;
});

export async function freshApp(verifier: AuthVerifier | null = null) {
  const stdb = await getTestStdb();
  await stdb.call((r) => r.devReset({ confirm: 'RESET-KAMI' }));
  const provider = new MockCardProvider();
  const { app } = await buildApp({ stdb, provider, verifier });
  return { app, stdb, provider };
}
