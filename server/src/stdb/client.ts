// SpacetimeDB gateway connection. The Node service is the database
// owner and the ONLY writer: it subscribes to every (private) table,
// keeps a live local cache for reads, and mutates exclusively through
// reducers. Reducer failures arrive as SenderError with a
// `code|message` payload that maps 1:1 onto DomainError.

import { SenderError } from 'spacetimedb';

import { DomainError } from '../types.js';
import { DbConnection } from './bindings/index.js';

export type { DbConnection } from './bindings/index.js';

const ALL_TABLES = [
  'module_config',
  'users',
  'household',
  'balances',
  'members',
  'member_categories',
  'cards',
  'pool',
  'deposits',
  'sync_state',
  'transactions',
  'approvals',
  'prepared_actions',
  'idempotency',
  'audit_events',
  'user_wallets',
  'invites',
  'withdrawals',
  'provider_pool',
  'card_orders',
];

export interface StdbOptions {
  uri: string;
  dbName: string;
  token?: string;
}

/** Thrown when an idempotency key was already consumed — the caller
 * replays the stored receipt instead of failing. */
export class IdempotentReplay extends Error {}

const DOMAIN_CODES = new Set([
  'not_found',
  'permission_denied',
  'invalid_request',
  'step_up_required',
  'action_expired',
  'action_conflict',
  'facts_mismatch',
]);

/** Map a reducer failure onto the domain error contract. */
export function toDomainError(e: unknown): Error {
  if (e instanceof SenderError || (e instanceof Error && e.name === 'SenderError')) {
    const [code, ...rest] = e.message.split('|');
    const message = rest.join('|') || 'Request failed.';
    if (code === 'idempotent_replay') return new IdempotentReplay(message);
    if (DOMAIN_CODES.has(code)) return new DomainError(code as DomainError['code'], message);
    return new DomainError('invalid_request', message);
  }
  return e instanceof Error ? e : new Error(String(e));
}

export class Stdb {
  constructor(public readonly conn: DbConnection) {}

  get db(): DbConnection['db'] {
    return this.conn.db;
  }

  /** Call a reducer, translating module errors into DomainErrors. The
   * promise resolves only after the committed transaction has been
   * applied to the local cache (read-your-writes). */
  async call(fn: (reducers: DbConnection['reducers']) => Promise<void>): Promise<void> {
    try {
      await fn(this.conn.reducers);
    } catch (e) {
      throw toDomainError(e);
    }
  }

  disconnect(): void {
    try {
      this.conn.disconnect();
    } catch {
      /* already closed */
    }
  }
}

export function connectStdb(opts: StdbOptions, timeoutMs = 15_000): Promise<Stdb> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`SpacetimeDB connection to ${opts.uri}/${opts.dbName} timed out`)),
      timeoutMs,
    );
    timer.unref();

    const builder = DbConnection.builder()
      .withUri(opts.uri)
      .withDatabaseName(opts.dbName)
      .onConnect((conn) => {
        conn
          .subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timer);
            resolve(new Stdb(conn));
          })
          .onError((ctx: unknown, ...rest: unknown[]) => {
            clearTimeout(timer);
            const err = rest[0] ?? (ctx as { event?: unknown }).event;
            reject(err instanceof Error ? err : new Error(String(err ?? 'subscription failed')));
          })
          .subscribe(ALL_TABLES.map((t) => `SELECT * FROM ${t}`));
      })
      .onConnectError((_conn, err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    if (opts.token) builder.withToken(opts.token);
    builder.build();
  });
}
