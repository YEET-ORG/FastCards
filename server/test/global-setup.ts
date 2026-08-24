// Vitest global setup: make sure a local SpacetimeDB instance is running
// and (re)publish the module to the dedicated test database with a clean
// slate. Runs once per `vitest` invocation.

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const BIN = process.env.SPACETIME_BIN ?? `${process.env.HOME}/.local/bin/spacetime`;
const SERVER_ROOT = new URL('..', import.meta.url).pathname;

async function pingLocal(): Promise<boolean> {
  try {
    await execFileP(BIN, ['server', 'ping', 'local']);
    return true;
  } catch {
    return false;
  }
}

export default async function setup(): Promise<() => void> {
  let spawned: ChildProcess | undefined;

  if (!(await pingLocal())) {
    spawned = spawn(
      BIN,
      ['start', '--listen-addr', '127.0.0.1:3000', '--data-dir', `${SERVER_ROOT}.spacetimedb-test-data`],
      { stdio: 'ignore' },
    );
    const deadline = Date.now() + 30_000;
    while (!(await pingLocal())) {
      if (Date.now() > deadline) throw new Error('local SpacetimeDB did not come up on 127.0.0.1:3000');
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  await execFileP(
    BIN,
    ['publish', 'kami-test', '--server', 'local', '--delete-data=always', '--yes'],
    { cwd: SERVER_ROOT },
  );

  return () => {
    if (spawned && !spawned.killed) spawned.kill('SIGTERM');
  };
}
