import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every test file shares one local SpacetimeDB database and resets it
    // between tests, so files must not run concurrently.
    fileParallelism: false,
    globalSetup: ['./test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      AGENT_MODE: 'scripted',
      STDB_DB: 'fastcards-test',
      STDB_URI: 'ws://127.0.0.1:3000',
    },
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
