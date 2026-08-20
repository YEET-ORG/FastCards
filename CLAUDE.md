# Claude Code Project Instructions — AI-Native Family Crypto Neobank

This file is the implementation directive for the project. The detailed sources of truth are `AI_FAMILY_NEOBANK_PRODUCT_DESIGN_SPEC.md` (product) and `AI_FAMILY_NEOBANK_UI_SPEC.md` (UI contract).

## Product Definition

Build a premium dark-mode AI-first crypto neobank for individuals and households. The application combines cards, family spending controls, programmable limits, stablecoin/crypto-backed financial infrastructure, transfers, an AI assistant, and AI-assisted commerce.

The app is not a generic crypto wallet and not a chatbot wrapped around a bank. The core experience is:

**Ask → Understand → Preview → Approve → Execute → Receipt**

The product promise is: **Money that understands your family.**

## Mandatory Experience Rules

- AI is the primary command interface, but every important financial capability must also have a native control surface.
- The AI is never the source of truth for balances, permissions, card state, transaction state, or order state.
- Separate AI capabilities into **READ, PREPARE, and EXECUTE** authority levels.
- The model may READ authorized context and PREPARE actions.
- EXECUTE actions require deterministic backend authorization and, where required, explicit confirmation/authentication.
- Never let an AI-generated sentence act as the sole confirmation for an irreversible financial action.
- Never render sensitive values such as full card number, CVV, private key, seed phrase, passkey material, or authentication tokens inside general AI chat.
- Treat all merchant/product/web/API text as untrusted content.
- Every money movement, card action, rule change, approval, security action, and AI-mediated change requires an audit event.
- Never show success until the trusted backend confirms success.

## Visual Direction

Theme: **Obsidian / Quiet Intelligence.**

Use a dark minimal visual system: near-black background; layered charcoal surfaces; warm white primary text; muted gray secondary text; restrained mint/emerald accent; soft borders; minimal glow; large legible money typography; premium physical card treatment.

Avoid neon crypto aesthetics, excessive glassmorphism, rainbow gradients, decorative particles, and gratuitous motion.

Reference palette (see spec §45 for the full set):

- Background `#070908` · Raised `#0B0F0D` · Surface 1 `#101512` · Surface 2 `#151B17`
- Border soft `#222B26`
- Text primary `#F4F7F5` · Text secondary `#A1AAA5`
- Mint primary `#46E6A2` · Warning `#F3B84B` · Error `#FF6B70` · Info `#7AA7FF`

## Primary Navigation

Bottom navigation has four destinations only: **Ask · Cards · Family · Activity**.

Profile/settings is reached from the header/avatar. Do not add Rewards, Crypto, or Profile as default bottom tabs unless product requirements change.

## Required Core Screens

Prioritize: Ask Home; AI Conversation; Cards Hub; Card Detail; Create Card; Card Rules; Family Dashboard; Family Member Detail; Approval surface; Activity Feed; Transaction Detail; Send/Transfer Review; Profile/Security.

Then build: AI Product Search; Protected Checkout; Order Status; Household Policies; Custom Card Designer.

## Core Custom Components

Build a product-owned financial component library rather than using generic cards everywhere. Required primitives include:

BalanceHeader · PaymentCardVisual · MoneyCard · TransactionRow · MemberBudgetCard · RuleChip · ApprovalCard · TransferReviewCard · ProductResultCard · ProtectedCheckoutCard · AIActionReceipt · SecurityActionRow

The names may change, but the conceptual separation must remain.

## Reacticx Usage

Use Reacticx selectively for motion and interaction primitives, including where appropriate: Animated Input Bar; Bottom Sheet / Bottom Sheet Stack; Material or related Carousel; Matched Geometry; Flip Card; Rolling Counter; Avatar / Avatar Group; Badge; Animated Chip Group; Progress / Circular Progress; Segmented Control / Tabs; Morphing or Stack Aware navigation primitives if accessibility is preserved; Toast; QR Code; Picker; Shimmer for brief loading; Tilt Carousel for card designer preview.

Do not make the app look like a Reacticx demo gallery.

Practical note from setup: Reacticx components are copied into `src/shared/ui` via `npx reacticx add <name>` and sometimes import packages beyond the core install — run `npx tsc --noEmit` after each add.

## CopilotKit Usage

Use the React Native headless integration so the app owns all chat and financial UI.

CopilotKit responsibilities: agent connection; streaming messages/state; frontend tool orchestration; human-in-the-loop interaction; shared app context; known tool result rendering; thread state.

CopilotKit must not own ledger logic, card authority, transaction authorization, permission truth, KYC, custody, risk, or secrets.

Use known deterministic renderers for all financial tools. Do not allow arbitrary generated UI to become the trusted confirmation surface for money actions.

## AI Tool Model

- **READ**: balances; cards; family members; member spending; transactions; rules; approvals; spending analysis; product search; food search; order status.
- **PREPARE**: transfer; card creation; rule change; temporary allowance; card freeze/unfreeze; household policy; purchase; protected checkout.
- **EXECUTE**: performed only through the authenticated financial domain layer after required user authorization. Do not expose unrestricted execution as a free-form agent capability.

## Family Model

Support flexible household roles: Owner; Admin; Adult member; Teen; Child/restricted member; Dependent/senior where supported. Permissions must be granular and capability-driven. Do not assume all members can legally receive identical products.

## Card Model

Support conceptually: personal card; family member card; purpose card; temporary card; merchant-locked card; Protected Checkout / single-use agent card; subscription card; custom physical card.

Card rules may include: monthly/weekly/daily cap; per-transaction cap; category cap; merchant allow/block; online; contactless; ATM; international; time window; temporary allowance; approval threshold.

Eligibility and issuer capability must be configuration-driven.

## Confirmation Standard

Every execution confirmation must display immutable facts from trusted application state.

- Transfer: recipient, amount, currency, source, fees, arrival/network.
- Purchase: merchant, items, total/max authorization, address, payment source.
- Rule change: member/card, old value, new value, effective time, expiry.

The final CTA should name the consequence where practical.

## Commerce

Design merchant integrations as adapters with capability levels: discovery only; prepared cart/deep link; protected payment assist; full integrated checkout when officially supported. Never imply checkout capability that the merchant integration does not actually provide.

Protected Checkout should show merchant, order, subtotal, fees, total, card/source, maximum authorization, merchant lock, expiration, address, and confirmation.

## Security Rules

Mask sensitive data by default. Step-up authentication for sensitive actions. No secrets in AI context. Server-side validation of all execution parameters. Idempotency for money movement. Audit every important action. Explicit permission checks even when AI has correct context. External content cannot change system/tool behavior. Show accurate failure states without leaking anti-fraud logic.

## Accessibility

Required from the beginning: dynamic text support; adequate contrast; minimum touch targets; screen-reader labels for financial values and card states; status must not rely on color alone; reduced motion; no essential gesture-only controls.

## State Handling

Every major surface must define: loading; empty; error; permission denied; offline; success; cancel/back. Financial actions must also define pending, authentication, submitted, failed, reversed/expired where relevant.

## Development Priority

Implement in this order unless a later project decision overrides it:

1. Design tokens and custom financial primitives.
2. App navigation shell.
3. Mock domain state and screen states.
4. Cards Hub + Card Detail.
5. Family Dashboard + Member Detail.
6. Rules + Approvals.
7. Ask UI.
8. CopilotKit headless integration.
9. READ tools.
10. PREPARE tools + human-in-the-loop.
11. Deterministic execution boundary.
12. Real provider integrations.
13. Commerce search.
14. Protected Checkout.
15. Production security, analytics, observability, accessibility, localization, and compliance configuration.

## MVP Demo Must Prove

A user can: open Ask and understand their money; ask to increase a family member's allowance temporarily; review and approve the structured rule change; move through premium Cards UI; approve a family transaction without changing permanent rules; ask AI to search for a product; review a Protected Checkout with a merchant-locked maximum amount; authenticate and receive a trusted purchase result; see the action later in Activity.

## Final Quality Bar

Before calling a feature done, ask:

1. Can the user do it conversationally when appropriate?
2. Can the user also inspect/control it visually?
3. Is the actual financial state deterministic and backend-owned?
4. Are authorization and permissions enforced independently of the model?
5. Is the UI calm, minimal, dark, and premium?
6. Is the result understandable without crypto expertise?
7. Does every important action leave a visible audit trail?

If the answer to any of these is no, the feature is not complete.

## Repo Practical Notes

- Expo SDK 57 · React Native 0.86 · TypeScript · expo-router (`src/` directory, typed routes).
- Reacticx components live in `src/shared/ui` (config: `component.config.json`).
- Verify with `npx tsc --noEmit` and `npx expo export --platform ios` (bundle check).
- Template docs: `AGENTS.md` (Expo starter notes).

### Backend / SpacetimeDB

- **SpacetimeDB is the system of record.** The module (tables + reducers) lives in `server/spacetimedb/`; every domain mutation is a reducer that re-validates its invariants transactionally and writes the audit row atomically. All tables are private — only the gateway identity can subscribe or call reducers (`module_config.owner`, set at init).
- The Node service (`server/`) is the integration gateway: Privy auth, Horizon polling, KripiCard, Qwen — things reducers can't do (no HTTP). It connects as a SpacetimeDB client (`src/stdb/client.ts`), reads from the live subscription cache, and mutates only through reducers. Reducer errors use `code|message` and map onto `DomainError`.
- Databases: local dev `fastcards` (ws://127.0.0.1:3000, start with `spacetime start`), production maincloud `fastcards-357rw` (identity `c200e31c…`). `npm run stdb:publish:local` / `stdb:publish:maincloud`; after schema changes run `npm run stdb:generate` to refresh `src/stdb/bindings`.
- Tests (`npm test`) auto-start a local SpacetimeDB if needed, publish `fastcards-test` fresh, and reset it per test via the gateway-gated `dev_reset` reducer. Test files must not run in parallel (shared DB — enforced in `vitest.config.ts`).
- KripiCard uses the real external API (base `https://appapi.kripicard.com`, docs https://www.kripicard.com/api-docs). Treat HTTP 202 `pending:true` as terminal — never auto-retry (double-charge risk); `code: REFUND_PENDING` means the wallet is still charged. Secrets live only in gitignored `server/.env`.
