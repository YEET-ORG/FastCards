// SQLite persistence via Node's built-in driver. One database per
// process; tests pass ':memory:'. All amounts are integer rupees.

import { DatabaseSync } from 'node:sqlite';

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, member_id TEXT NOT NULL,
  deposit_memo TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS household (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, budget_cap INTEGER NOT NULL, budget_spent INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS balances (scope TEXT PRIMARY KEY, amount INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, relationship TEXT,
  monthly_limit INTEGER, spent_this_month INTEGER NOT NULL DEFAULT 0,
  temp_allowance_amount INTEGER, temp_allowance_expires_at TEXT
);
CREATE TABLE IF NOT EXISTS member_categories (
  member_id TEXT NOT NULL, key TEXT NOT NULL, label TEXT NOT NULL,
  cap INTEGER NOT NULL, spent INTEGER NOT NULL, enabled INTEGER NOT NULL,
  PRIMARY KEY (member_id, key)
);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY, nickname TEXT NOT NULL, variant TEXT NOT NULL, status TEXT NOT NULL,
  last4 TEXT NOT NULL, member_id TEXT, monthly_cap INTEGER, spent_this_month INTEGER NOT NULL DEFAULT 0,
  approval_above INTEGER, online INTEGER NOT NULL, contactless INTEGER NOT NULL,
  atm INTEGER NOT NULL, international INTEGER NOT NULL,
  max_authorization INTEGER, expiry_note TEXT,
  provider TEXT NOT NULL DEFAULT 'mock', provider_card_id TEXT
);
-- Stellar rail: one custodial pool account, per-user memo attribution.
CREATE TABLE IF NOT EXISTS pool (
  id TEXT PRIMARY KEY, network TEXT NOT NULL, account TEXT NOT NULL,
  asset_code TEXT NOT NULL, asset_issuer TEXT,
  crypto_reserve_units REAL NOT NULL DEFAULT 0,
  fiat_float_inr INTEGER NOT NULL DEFAULT 0,
  rate_inr_per_unit REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY, tx_hash TEXT NOT NULL UNIQUE, op_id TEXT NOT NULL UNIQUE,
  from_address TEXT NOT NULL, asset_code TEXT NOT NULL, amount_units REAL NOT NULL,
  credited_inr INTEGER NOT NULL, memo TEXT, user_id TEXT, status TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_state (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY, merchant TEXT NOT NULL, member_id TEXT NOT NULL, card_id TEXT NOT NULL,
  amount INTEGER NOT NULL, direction TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL,
  decline_reason TEXT, approved_by TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, requester_id TEXT NOT NULL, card_id TEXT NOT NULL, merchant TEXT NOT NULL,
  amount INTEGER NOT NULL, category TEXT NOT NULL, reason TEXT NOT NULL,
  requested_at TEXT NOT NULL, expires_at TEXT NOT NULL, status TEXT NOT NULL,
  resolved_by TEXT, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS prepared_actions (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, source TEXT NOT NULL, payload_json TEXT NOT NULL,
  subject TEXT NOT NULL, facts_json TEXT NOT NULL, facts_hash TEXT NOT NULL,
  cta TEXT NOT NULL, note TEXT NOT NULL,
  status TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL, executed_at TEXT, receipt_json TEXT
);
CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT PRIMARY KEY, action_id TEXT NOT NULL, receipt_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, title TEXT NOT NULL,
  subtitle TEXT, amount INTEGER, member_id TEXT, actor TEXT NOT NULL, at TEXT NOT NULL
);
`;

// Versioned migrations: v1 is the base schema above; later versions are
// additive. Applied in order, recorded in schema_migrations, so existing
// databases upgrade in place and fresh ones build from scratch.
const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: SCHEMA },
  {
    version: 2,
    sql: `
ALTER TABLE users ADD COLUMN privy_did TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_privy ON users(privy_did) WHERE privy_did IS NOT NULL;
ALTER TABLE members ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
CREATE TABLE IF NOT EXISTS user_wallets (
  user_id TEXT NOT NULL, address TEXT NOT NULL, chain_type TEXT NOT NULL,
  source TEXT NOT NULL, linked_at TEXT NOT NULL,
  PRIMARY KEY (user_id, address)
);
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY, member_id TEXT NOT NULL, created_by TEXT NOT NULL,
  status TEXT NOT NULL, created_at TEXT NOT NULL, accepted_at TEXT
);
CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, to_address TEXT NOT NULL,
  amount_inr INTEGER NOT NULL, amount_units REAL NOT NULL,
  status TEXT NOT NULL, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_txn_at ON transactions(at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_events(at DESC);
`,
  },
  {
    version: 3,
    sql: `
ALTER TABLE pool ADD COLUMN privy_wallet_id TEXT;
ALTER TABLE withdrawals ADD COLUMN tx_hash TEXT;
ALTER TABLE withdrawals ADD COLUMN error TEXT;
`,
  },
  {
    version: 4,
    sql: `
ALTER TABLE users ADD COLUMN kyc_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
-- Second pool: the USD float we hold at the card provider (KripiCard).
-- Mirrored manually by the admin until bridging automates it.
CREATE TABLE IF NOT EXISTS provider_pool (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL, balance_usd REAL NOT NULL, updated_at TEXT NOT NULL
);
-- Card purchases paid in Stellar, issued after admin review.
CREATE TABLE IF NOT EXISTS card_orders (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, member_id TEXT NOT NULL,
  card_type TEXT NOT NULL, nickname TEXT NOT NULL,
  price_inr INTEGER NOT NULL, price_usd REAL NOT NULL, expected_units REAL NOT NULL,
  memo TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
  deposit_id TEXT, provider_card_id TEXT, reviewed_by TEXT, review_note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
`,
  },
];

export function runMigrations(db: DB): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null };
  const current = row.v ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.exec(m.sql);
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      m.version,
      new Date().toISOString(),
    );
  }
}

const iso = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString();
const min = 60_000;
const hour = 60 * min;
const day = 24 * hour;

export function openDb(path: string = process.env.FASTCARDS_DB ?? 'fastcards.db'): DB {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  runMigrations(db);
  return db;
}

/** Idempotent demo seed — the same Sharma household the app ships with. */
export function seed(db: DB): void {
  const has = db.prepare('SELECT count(*) AS c FROM members').get() as { c: number };
  if (has.c > 0) return;

  const run = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).run(...args);

  run(
    "INSERT INTO users (id,name,role,member_id,deposit_memo,kyc_status,is_admin) VALUES ('u-rohan','Rohan','owner','m-rohan','FC-ROHAN-7431','approved',1)",
  );
  run(
    "INSERT INTO users (id,name,role,member_id,deposit_memo,kyc_status,is_admin) VALUES ('u-maya','Maya','teen','m-maya','FC-MAYA-2209','none',0)",
  );
  run(
    "INSERT INTO provider_pool (id,provider,balance_usd,updated_at) VALUES ('kripicard','kripicard',500,?)",
    new Date().toISOString(),
  );
  // Demo pool: USDC on Stellar testnet, ₹88 per USDC. The account is a
  // placeholder until STELLAR_POOL_ACCOUNT is configured.
  run(
    "INSERT INTO pool (id,network,account,asset_code,asset_issuer,crypto_reserve_units,fiat_float_inr,rate_inr_per_unit) VALUES ('pool-1','testnet',?, 'USDC', ?, 1240.5, 250000, 88)",
    process.env.STELLAR_POOL_ACCOUNT ?? 'GBVYYQ7XXRZW6ZCNNCL2X2THNPQ6IM4O47HAA25JTAG7Z3CXJCQ3W7CD',
    process.env.STELLAR_USDC_ISSUER ?? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  );
  run("INSERT INTO household VALUES ('h-1','Sharma household',120000,84210)");
  run("INSERT INTO balances VALUES ('personal',96410)");
  run("INSERT INTO balances VALUES ('family',87810)");

  const member = db.prepare('INSERT INTO members (id,name,role,relationship,monthly_limit,spent_this_month,temp_allowance_amount,temp_allowance_expires_at) VALUES (?,?,?,?,?,?,?,?)');
  member.run('m-rohan', 'Rohan', 'owner', null, null, 12240, null, null);
  member.run('m-maya', 'Maya', 'teen', 'Daughter', 6000, 4320, null, null);
  member.run('m-arjun', 'Arjun', 'child', 'Son', 4000, 1240, null, null);
  member.run('m-dad', 'Dad', 'dependent', 'Father', 10000, 3410, null, null);

  const cat = db.prepare('INSERT INTO member_categories VALUES (?,?,?,?,?,?)');
  cat.run('m-maya', 'food', 'Food', 3000, 2130, 1);
  cat.run('m-maya', 'transport', 'Transport', 2000, 1420, 1);
  cat.run('m-maya', 'other', 'Other', 1000, 770, 1);
  cat.run('m-arjun', 'food', 'Food', 2000, 840, 1);
  cat.run('m-arjun', 'transport', 'Transport', 1000, 240, 1);
  cat.run('m-arjun', 'shopping', 'Shopping', 1000, 160, 0);
  cat.run('m-dad', 'groceries', 'Groceries', 6000, 2960, 1);
  cat.run('m-dad', 'health', 'Health', 2000, 450, 1);
  cat.run('m-dad', 'other', 'Other', 2000, 0, 1);

  const card = db.prepare(
    'INSERT INTO cards (id,nickname,variant,status,last4,member_id,monthly_cap,spent_this_month,approval_above,online,contactless,atm,international,max_authorization,expiry_note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  );
  card.run('c-personal', 'Personal', 'personal', 'active', '8132', 'm-rohan', null, 12240, null, 1, 1, 1, 0, null, null);
  card.run('c-maya', 'Maya Everyday', 'family', 'active', '5588', 'm-maya', 6000, 4320, 1000, 1, 1, 0, 0, null, null);
  card.run('c-arjun', 'Arjun School', 'family', 'active', '2240', 'm-arjun', 4000, 1240, 500, 0, 1, 0, 0, null, null);
  card.run('c-dad', "Dad's Card", 'family', 'active', '7031', 'm-dad', 10000, 3410, null, 1, 1, 1, 0, null, null);
  card.run('c-subs', 'Subscriptions', 'subscription', 'active', '4470', null, 3000, 2140, null, 1, 0, 0, 1, null, null);
  card.run('c-amzn', 'Amazon Temporary', 'protected', 'closed', '9917', null, null, 18999, null, 1, 0, 0, 0, 19100, 'Closed automatically after use');

  const txn = db.prepare('INSERT INTO transactions VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  txn.run('t-swiggy', 'Swiggy', 'm-maya', 'c-maya', 640, 'debit', 'Food', 'settled', null, null, iso(2 * hour));
  txn.run('t-amazon', 'Amazon', 'm-rohan', 'c-personal', 1299, 'debit', 'Shopping', 'settled', null, null, iso(5 * hour));
  txn.run('t-bmtc', 'BMTC Transit', 'm-arjun', 'c-arjun', 35, 'debit', 'Transport', 'settled', null, null, iso(7 * hour));
  txn.run('t-netflix', 'Netflix', 'm-rohan', 'c-subs', 649, 'debit', 'Entertainment', 'settled', null, null, iso(day + 3 * hour));
  txn.run('t-steam', 'Steam', 'm-arjun', 'c-arjun', 899, 'debit', 'Shopping', 'declined', 'Shopping is off for this card', null, iso(day + 6 * hour));
  txn.run('t-blinkit', 'Blinkit', 'm-dad', 'c-dad', 412, 'debit', 'Groceries', 'settled', null, null, iso(day + 8 * hour));
  txn.run('t-zara', 'Zara', 'm-maya', 'c-maya', 1850, 'debit', 'Shopping', 'settled', null, 'Rohan', iso(4 * day + 6 * hour));
  txn.run('t-salary', 'Salary · HDFC Bank', 'm-rohan', 'c-personal', 120000, 'credit', 'Deposit', 'settled', null, null, iso(6 * day + 5 * hour));

  run(
    "INSERT INTO approvals VALUES ('a-nike','m-maya','c-maya','Nike',1420,'Shopping','Above ₹1,000 approval threshold',?,?,'pending',NULL,NULL)",
    iso(24 * min),
    new Date(Date.now() + 24 * hour).toISOString(),
  );

  const ev = db.prepare(
    'INSERT INTO audit_events (kind,title,subtitle,amount,member_id,actor,at) VALUES (?,?,?,?,?,?,?)',
  );
  ev.run('approval_event', 'Approved once — Zara ₹1,850', 'Maya · rules unchanged', 1850, 'm-maya', 'Rohan', iso(4 * day + 6 * hour));
  ev.run('ai_action', 'Protected checkout completed', 'Sony WH-CH720N · max authorization ₹19,100', 18999, 'm-rohan', 'Rohan via AI', iso(5 * day + 2 * hour));
  ev.run('security_event', 'New sign-in', 'iPhone 15 · Bengaluru', null, null, 'system', iso(6 * day + 8 * hour));
}
