# FastCards Server

Financial Domain Backend for the AI-native family neobank (see
`../AI_FAMILY_NEOBANK_PRODUCT_DESIGN_SPEC.md`). It is the single source of
truth for money state; the AI layer can only **READ** it and **PREPARE**
actions against it — execution happens exclusively through the
deterministic gateway after user confirmation.

## Stack

Node 22+ · Fastify 5 · zod · SQLite via `node:sqlite` (no native deps) ·
hosted Qwen (OpenAI-compatible API, plain fetch — no SDK) · vitest.

```bash
cd server
npm install
npm run dev        # tsx watch, port 8787 (PORT=… to change)
npm test           # 20 financial-safety acceptance tests
npm run typecheck
```

## Architecture

```
mobile app ──► REST (Fastify)
                ├─ READ services        session-scoped queries
                ├─ PREPARE/EXECUTE      actions.ts — the money gateway
                ├─ Approvals            approve-once / decline
                ├─ AI layer             agent.ts (Claude tool loop, READ+PREPARE tools only)
                ├─ Stellar rail         chain/stellar.ts (Horizon poller, deposit pool)
                └─ Card provider        cards/provider.ts (KripiCard adapter | mock)
SQLite: members · cards · transactions · approvals · prepared_actions ·
        idempotency · audit_events · pool · deposits
```

### The PREPARE → EXECUTE gateway

1. `POST /api/actions/prepare` (or an agent PREPARE tool) validates a
   typed intent and stores it with frozen, user-visible **facts** and a
   `factsHash`. Nothing mutates. Actions expire after 15 minutes.
2. `POST /api/actions/:id/execute` requires: the same user; the exact
   `factsHash` the client displayed (confirmation values == execution
   values); a step-up assertion (`x-auth-assertion: passkey-mock-ok` in
   the prototype); and an `idempotencyKey`. Repeated keys replay the
   original receipt — a double tap can never execute twice.
3. Every execution appends an `audit_events` row; agent-prepared actions
   are attributed `"<user> via AI"`.

### Onchain deposits (Stellar, pseudo-onchain)

Custodial pool model: one Stellar account receives all deposits; each
user has a unique **text memo** (`GET /api/deposits/intent` returns
address + memo + asset + rate). A Horizon poller
(`POST /api/deposits/sync`, plus a 30s background loop) attributes
payments by memo, converts at the pool's `rate_inr_per_unit`
(USDC → INR), credits the balance, records the deposit, and audits it.
Unknown memos are held as `unattributed` — never guessed. The pool row
tracks `crypto_reserve_units` (grows on deposit) and `fiat_float_inr`
(shrinks by the credited amount) — the float is what funds card spending.

Env: `STELLAR_HORIZON_URL` (default testnet), `STELLAR_POOL_ACCOUNT`,
`STELLAR_USDC_ISSUER`, `STELLAR_POLL_MS` (0 disables).

### Treasury — the pool is a Privy server wallet (Tier 2 Stellar)

`POST /api/treasury/bootstrap` (owner + step-up) creates a Stellar
server wallet via Privy (`chain_type: 'stellar'`), friendbot-funds it,
and points the pool at it — Privy custodies the ed25519 key; **no
signing key ever enters this process**. Queued withdrawals are paid out
by `POST /api/treasury/process` (and the background poll): the payment
is built with `@stellar/stellar-sdk`, the transaction hash is signed via
Privy `raw_sign`, and the envelope is submitted to Horizon; the record
moves to `sent` with the tx hash, or `failed` with the reason (the app
balance already moved at EXECUTE — failures are flagged for review).

This ran live on testnet: pool wallet
`GAT65LG5…AIR6`, a 100 XLM memo deposit from a second Privy wallet
(tx `335f4e06…`) credited at the pool rate, and a ₹600 → 20 XLM payout
(tx `f50c6a40…`) confirmed on-chain. The demo pool runs on native XLM
(₹30/unit); switching to USDC needs a trustline op in the bootstrap.

`scripts/demo-user-wallet.ts <pool> <memo> [xlm]` plays the user side:
creates a Privy wallet, friendbot-funds it, and sends a memo deposit.

### Card provider — KripiCard

`cards/provider.ts` adapts the documented KripiCard API
(`https://home.kripicard.com/api`, base `…/api/premium`, `api_key` auth,
USD amounts, min $10): `Create_card`, `Fund_Card`, `Get_CardDetails`,
`Freeze_Unfreeze`. Freezes go provider-first — local state only flips
after the provider accepts. Without `KRIPICARD_API_KEY` +
`KRIPICARD_BANK_BIN` the mock provider (same interface) is used.

### AI agent — hosted Qwen

`POST /api/agent/chat {messages, contextMemberId?}` runs a function-
calling tool loop against the team's hosted Qwen through its
OpenAI-compatible endpoint (vLLM/SGLang/Ollama/DashScope all speak it):

```
QWEN_BASE_URL=http://your-qwen-host:8000/v1   # required for live mode
QWEN_MODEL=<served model name>                # default "qwen3"
QWEN_API_KEY=…                                # optional bearer token
```

On this dev machine the model is already hosted: a llama.cpp
`llama-server` (with `--jinja`, so OpenAI-style tool calling works)
serving **`qwen3.8-27b`** (Qwen3.8-27B Q5_K_M) on `127.0.0.1:6402`.
Run against it with:

```bash
npm run dev:qwen    # PORT=8991 recommended (8787 is taken on this box)
```

The model emits `reasoning_content` (thinking); the client ignores it.

Ten tools — six READ, four PREPARE — each calling the same
session-scoped services as the REST API, so the model can neither
over-read nor execute. Tool arguments are JSON-parsed and zod-validated
before any service call. The response returns the final text plus any
`prepared` actions for the app to render in its trusted confirmation
surface. With no `QWEN_BASE_URL` (or `AGENT_MODE=scripted`) a
deterministic interpreter handles the demo intents; if Qwen is
configured but unreachable, the turn degrades to that interpreter with
`degraded: true` and cancels anything the failed turn had prepared.

### Card orders — two pools with an admin in between

Buying a card is a reviewed pipeline, not an instant flow (the admin is
the manual bridge between the pools until real bridging lands):

1. User signs in (Privy) and completes **KYC** (`POST /api/kyc/submit`
   → admin reviews at `POST /api/admin/kyc/:userId/review`).
2. `POST /api/card-orders` prices the card ($12 = $10 load + $2 fee,
   `CARD_PRICE_USD`/`USD_INR_RATE` env) and returns Stellar payment
   instructions: pool address + a unique `ORD-…` memo + exact amount.
3. The user pays the **Stellar pool**; deposit sync matches the order
   memo, grows the crypto reserve, and marks the order **paid** (order
   payments never touch spending balances; underpayment blocks review).
4. An **admin** approves (`POST /api/admin/orders/:id/approve`, step-up
   required) — the server verifies payment received **and** that the
   **provider pool** (the USD float we hold at KripiCard, mirrored via
   `GET/POST /api/admin/provider-pool`) covers the card — then issues
   through the provider and debits the float. Reject
   (`…/reject {note}`) flags a refund if payment had landed.

Proven live on testnet: order `ORD-A7390901` paid with 35.2 real XLM
(tx `a83155e8…`), matched by sync, approved, card issued, float $500→$488.

## Auth — Privy

Live mode (set `PRIVY_APP_ID` + `PRIVY_APP_SECRET` in `server/.env` —
already configured on this machine, gitignored; token signatures verify
against the app's public JWKS automatically, or set
`PRIVY_VERIFICATION_KEY` to skip the JWKS fetch): the app sends
`Authorization: Bearer <privy access token>` (and optionally
`privy-id-token` so linked wallets sync for deposit attribution). The
first authenticated DID binds to the seeded owner (audited); everyone
else joins via an invite code, which binds their DID to the invited
member. Production refuses to boot without Privy configured.

Dev mode (no Privy, never in production): `x-user-id` selects a session
(`u-rohan` owner default, `u-maya` teen). Step-up on execution is
`x-auth-assertion: passkey-mock-ok` in both modes for now — the
production path is Privy MFA / a passkey assertion bound to the action.

App side (next frontend pass): `@privy-io/expo` for login + embedded
wallets + connect-wallet; forward the access token on every request.
External Stellar wallets register via `POST /api/wallets`.

## Ops

Helmet security headers · CORS (`CORS_ORIGIN`) · global rate limit
(`RATE_LIMIT_MAX`/min, agent route tighter at 12/min) · 64KB body limit ·
log redaction of auth headers · env validated at boot (fails fast) ·
versioned SQLite migrations (`schema_migrations`) · `/health` +
`/readyz` · graceful shutdown on SIGTERM/SIGINT.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | provider name |
| GET | `/api/overview` · `/api/members` · `/api/members/:id` · `/api/cards` · `/api/cards/:id` · `/api/transactions` · `/api/approvals` · `/api/activity` · `/api/pool` | session-scoped READ |
| GET | `/api/deposits/intent` · `/api/deposits` | Stellar deposit rail |
| POST | `/api/deposits/sync` | poll Horizon now |
| POST | `/api/actions/prepare` | typed intent → prepared action |
| POST | `/api/actions/:id/execute` | factsHash + idempotencyKey + step-up |
| POST | `/api/actions/:id/cancel` | |
| POST | `/api/cards/:id/freeze` | direct reversible freeze `{frozen}` |
| POST | `/api/approvals/:id/approve-once` | step-up required |
| POST | `/api/approvals/:id/decline` | |
| POST | `/api/agent/chat` | AI turn (READ + PREPARE only, 12/min) |
| GET/POST | `/api/wallets` | linked wallets · register a Stellar address |
| GET | `/api/withdrawals` | queued crypto withdrawals |
| POST | `/api/invites/:code/accept` | join the household (binds Privy DID) |
| GET | `/readyz` | DB liveness |

New PREPARE intents (all through the same gateway): `transfer`
(personal ↔ family pool), `create_card` (family/purpose; issues via the
card provider, min load covers the $10 provider minimum ≈ ₹880),
`invite_member` (receipt carries the invite code), `withdraw_crypto`
(INR → USDC to a Stellar address; queued for treasury signing). The
agent can PREPARE transfers and card creation too.

Error codes: `not_found` 404 · `permission_denied` 403 ·
`invalid_request` 400 · `step_up_required` 401 · `action_expired` 410 ·
`action_conflict` / `facts_mismatch` 409.
