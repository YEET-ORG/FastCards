# AI-Native Family Crypto Neobank

## Master Product, UX, UI, AI, Security and Delivery Specification

Document purpose: Source-of-truth product and design brief for Claude Code and the implementation team.
Status: Product definition / pre-build specification.
Working product name: TBD (repo name: FastCards).
Primary client: Mobile app, iOS and Android.
Primary visual direction: Dark, minimal, premium, high-trust fintech.
Primary interaction model: AI-first, with deterministic visual controls for money actions.

Important: This specification intentionally contains no implementation code. Product behavior, hierarchy, states, components, requirements, and acceptance criteria are defined here so implementation can be derived from it.

---

## Handoff Summary

The product is an **AI-native family crypto neobank** built around four primary surfaces:

**Ask · Cards · Family · Activity**

The product must feel **dark, minimal, premium, calm, and high-trust**.

The fundamental interaction model is:

**Ask → Understand → Preview → Approve → Execute → Receipt**

The AI is the command layer. Native financial UI is the trust and control layer.

Financial authority must always follow:

**READ → PREPARE → EXECUTE**

The AI may understand requests, read permitted information, and prepare actions. It must never independently become the authority for sending money, changing financial permissions, issuing sensitive cards, or making purchases.

Use **Reacticx** selectively for interaction/motion and build a proprietary financial component system above it.

Use **CopilotKit React Native Headless** for AI interaction, shared context, tools, human-in-the-loop workflows, and structured tool rendering.

Do not begin by building a generic banking dashboard. Prioritize the product-defining experiences:

1. Ask / AI Home
2. Premium Cards Hub
3. Family Dashboard
4. Family Card Rules
5. Approvals
6. AI Action Confirmations
7. Activity / Audit Trail
8. AI Shopping
9. Protected Checkout

When there is ambiguity, prioritize financial safety, clarity, auditability, and user control over automation.

---

## 1. Product Summary

The product is an AI-native crypto neobank designed around individuals and families. It combines a premium payment card, stablecoin/crypto-enabled money infrastructure, household financial controls, programmable family cards, and conversational commerce.

The product must not feel like a crypto wallet with a chatbot added on top. It should feel like a modern household money operating system where users can manage spending, cards, family permissions, transfers, shopping, and financial questions through natural language while always retaining visible control over important actions.

The central product promise is: **Money that understands your family.**

The core interaction loop is: **Ask → Understand → Preview → Approve → Execute → Receipt**

The AI is the command and explanation layer. The conventional financial UI is the control, verification, and trust layer.

## 2. Product Vision

Build the financial application a modern household would want if banking were invented around AI today instead of menus and forms.

A household owner should be able to say:

- Give Maya another ₹2,000, but only until Sunday.
- Create a card for Arjun with a ₹5,000 monthly cap. Food and transport only.
- Freeze Dad's spare card.
- How much did the family spend eating out this month?
- Which member is closest to their limit?
- Show every subscription that increased in price.
- Buy my usual protein powder.
- Find genuine AirPods under ₹20,000 and prepare the cheapest safe option.
- Order dinner for four under ₹1,500.
- Create a travel card with a ₹40,000 cap and disable it after August 30.

The product should convert these requests into structured, auditable financial objects rather than merely responding with text.

## 3. Product Positioning

The product sits at the intersection of five categories:

1. **Premium neobank** — account balances, cards, transfers, activity, card security, payments.
2. **Crypto/stablecoin money infrastructure** — global settlement and asset support without forcing mainstream users to understand chain-level details.
3. **Family banking** — household ownership, member cards, allowances, controls, approvals, visibility.
4. **Programmable cards** — cards with purpose-, merchant-, category-, time-, amount-, and user-specific rules.
5. **AI commerce and financial assistance** — users can search, compare, prepare, and where supported execute purchases from merchant services through conversational interaction.

The competitive differentiation is not simply "crypto card for families." It is: **Programmable household money controlled naturally through AI.**

## 4. Core Product Principles

### 4.1 AI-first, not AI-only
Every important workflow should be available conversationally, but core money operations must remain inspectable and manageable through native screens. The user can say "freeze Maya's card," but they can also open Maya → Card → Freeze.

### 4.2 Crypto is infrastructure, not vocabulary
The default experience should show understandable money balances, local currency equivalents, spending power, and card behavior. Do not expose networks, contract addresses, gas, bridge terminology, seed phrases, or token mechanics unless the user explicitly opens advanced crypto details.

### 4.3 Safety over autonomy
AI should be powerful in interpretation and preparation, conservative in execution. The model may propose an action. A trusted financial service validates and executes it.

### 4.4 Every important action leaves a receipt
Transfers, rule changes, card creation, freezes, approvals, household changes, AI purchases, and security actions must appear in the activity/audit system.

### 4.5 Progressive disclosure
Show the minimum information required for confidence. Reveal advanced controls only when the user requests them.

### 4.6 Household relationships are flexible
Do not hard-code the product around "mother/father/child." A household can contain spouses, children, parents, dependent adults, trusted relatives, or other supported members.

### 4.7 Financial UI should feel calm
Avoid visual noise, aggressive gamification, neon crypto styling, and excessive animations. Money should feel stable, legible, and intentional.

## 5. Primary User Types

### 5.1 Household Owner
The person who creates the household and has full administrative authority where permitted. Typical needs: maintain own primary card and accounts; invite household members; create and fund member cards; set limits and policies; review approvals; track household activity; manage AI permissions; control security.

### 5.2 Household Admin
A trusted adult with delegated authority. Potential permissions: manage selected members; adjust limits within owner-defined boundaries; approve selected transactions; manage household budgets. Admin rights must be granular and revocable.

### 5.3 Adult Member
Has personal access and potentially participates in shared household finances. Visibility into their transactions and balances depends on household policy, account ownership, product structure, and regulatory constraints.

### 5.4 Teen Member
Has a supervised card with age-appropriate independence. Key experiences: see remaining spend; see categories and rules that affect them; request money; request approval; ask simple financial questions; use approved AI shopping features where permitted.

### 5.5 Child / Restricted Member
Receives a simplified card experience with stronger restrictions and a simplified interface.

### 5.6 Dependent / Senior Member
A supervised financial experience for a dependent adult or elderly family member where legally and operationally supported.

## 6. Product Pillars

- **Pillar A — Ask**: The AI assistant is the primary home experience and universal command layer.
- **Pillar B — Cards**: Premium personal, family, purpose, temporary, merchant-locked, and custom physical/virtual cards.
- **Pillar C — Family**: Members, budgets, rules, approvals, allowances, household policies, invitations, and activity.
- **Pillar D — Move Money**: Internal transfers, bank transfers, supported crypto transfers, receive flows, and exchange where available.
- **Pillar E — Commerce**: Search, compare, prepare, approve, pay, track, and manage eligible third-party purchases.
- **Pillar F — Trust**: Authentication, card security, AI permissions, audit trails, fraud controls, dispute flows, privacy, and clear action boundaries.

## 7. Main Navigation

Use four primary bottom navigation destinations: **Ask · Cards · Family · Activity**

Do not dedicate bottom navigation to Profile, Rewards, or Crypto. Profile/settings should be reachable from the upper-right avatar on primary screens. Global actions such as notifications, scan, or support should live in headers or context menus depending on screen.

Why this structure: Ask is the primary interaction source. Cards is a top-level financial object. Family is the product differentiator. Activity is the universal trust/audit layer.

## 8. Primary Product Objects

Claude Code should treat these as first-class domain objects even when the visual implementation changes.

- **8.1 User** — an authenticated account holder. Attributes conceptually include identity status, household memberships, roles, permissions, security status, locale, default currency, notification preferences, AI preferences, and eligible product capabilities.
- **8.2 Household** — a shared administrative financial group. Contains owner, admins, members, policies, shared funding sources, budgets, approvals, audit activity, and settings.
- **8.3 Household Member** — an individual belonging to a household. Concepts: role; relationship label; account ownership; cards; spending rules; visibility rights; approval rights; status; invitation or onboarding state.
- **8.4 Account** — fiat, stablecoin, wallet-backed, or product-defined balance containers. Do not assume one technical balance equals one user-visible account.
- **8.5 Card** — physical or virtual payment credentials and their user-visible state.
- **8.6 Card Rule** — spending restrictions and permissions applied to a card or group of cards.
- **8.7 Budget** — a spending allocation for a user, member, category, purpose, or household.
- **8.8 Approval** — a request that requires another authorized person or explicit owner authentication.
- **8.9 Transaction** — a finalized, pending, reversed, refunded, declined, or disputed financial event.
- **8.10 AI Action** — a structured action proposed, approved, rejected, executed, expired, or failed through AI.
- **8.11 Commerce Cart** — a merchant purchase prepared by the AI or user.
- **8.12 Order** — a merchant-side order lifecycle after checkout.
- **8.13 Household Policy** — a reusable collection of rules that may apply to multiple cards or members.
- **8.14 Notification** — alerts, requests, confirmations, security events, and informational messages.
- **8.15 Security Event** — sign-ins, passkey changes, new device access, sensitive detail views, rule changes, suspicious behavior, and card security actions.

## 9. Card Types

The app should support a flexible card model rather than separate unrelated features.

- **9.1 Personal Card** — primary everyday card. Capabilities may include physical and/or virtual credentials; wallet provisioning where supported; card freeze; online/international/contactless/ATM controls; spending controls; transaction feed; funding source selection if the platform supports it.
- **9.2 Family Member Card** — issued for a household member with owner/admin-defined rules.
- **9.3 Purpose Card** — virtual or physical card created for a purpose. Examples: subscriptions, travel, groceries, business expenses, school lunch, emergency spending, shopping.
- **9.4 Temporary Card** — expires after a specified date/time or after a defined condition.
- **9.5 Merchant-Locked Card** — usable only with the intended merchant or merchant identity group. Primary use case: AI checkout protection.
- **9.6 Single-Use / Agent Card** — temporary virtual card created for a single approved purchase or checkout session. User-facing language should prefer **Protected Checkout** rather than requiring users to understand "agent cards."
- **9.7 Subscription Card** — designed for recurring merchants with a monthly cap and clear subscription visibility.
- **9.8 Custom Physical Card** — customized from approved visual templates and safe personalization options.

## 10. Card Rule System

Card rules are a foundational product capability. Rules should support the following concepts where issuer/network capabilities permit:

### 10.1 Amount Rules
Monthly cap. Weekly cap. Daily cap. Per-transaction maximum. Temporary extra allowance. Category-specific cap. Merchant-specific cap.

### 10.2 Merchant Rules
Allowed merchant. Blocked merchant. Approved merchant list. Merchant category restrictions.

### 10.3 Channel Rules
Online purchases. Contactless. ATM withdrawals. International transactions. Card-present transactions.

### 10.4 Time Rules
Active date range. Day-of-week restrictions. Time-of-day restrictions. Temporary travel period. Rule expiry.

### 10.5 Approval Rules
Require approval above amount. Require approval for new merchants. Require approval for restricted categories. Require approval outside usual geography if supported by risk systems.

### 10.6 Rule Inheritance
Rules can be inherited from: global account policy; household policy; member policy; card-specific policy; temporary override.

The UI must clearly show when a rule is inherited and where it comes from. Conflicting rules should resolve conservatively unless explicit backend policy dictates otherwise.

## 11. Household Policies

Household policies differentiate the product from basic child-card apps. A policy is a reusable bundle of rules applied to multiple members/cards.

Examples:

- **School Days** — Monday to Friday; food allowed; transport allowed; ATM disabled; shopping requires approval.
- **Vacation Mode** — international enabled; increased daily cap; ATM enabled; automatically expires after travel.
- **Weekend Allowance** — additional amount Friday through Sunday; entertainment enabled; one-time approval threshold change.
- **Emergency Mode** — temporarily unlock specified categories or higher limits; high-visibility audit event; automatic expiry.

The AI should be able to translate plain English into a policy proposal, but the user must review structured rules before activation.

## 12. AI Product Model

The AI assistant is not a separate chatbot product. It is the primary interface for navigating and acting across financial functions.

### 12.1 AI Authority Levels

Every AI capability must be classified into exactly one of three levels.

**Level 1 — READ.** Safe informational access within the user's permissions. Examples: get balances; list cards; summarize activity; analyze spending; compare months; explain a decline; search eligible merchant products.

**Level 2 — PREPARE.** AI prepares a structured action but does not execute it. Examples: prepare a transfer; prepare card creation; prepare a temporary allowance; prepare a card rule update; prepare a merchant cart; prepare a card freeze; prepare a household policy.

**Level 3 — EXECUTE.** Execution occurs only after deterministic authorization conditions are met. The model itself must not be treated as the authority for execution. Execution can require: explicit UI confirmation; PIN/passcode; biometric authentication; passkey assertion; household approval; risk checks; backend permission validation.

The AI may narrate that execution succeeded only after receiving a trusted backend result.

## 13. AI Interaction Rules

### 13.1 Structured UI before prose for actionable results
When the agent has a structured financial result, render the appropriate native card or sheet instead of relying on paragraphs. Examples: transfer proposal → Transfer Review Card; family rule proposal → Rule Proposal Card; product search → Product Result Cards; purchase → Protected Checkout Sheet; spending question → Insight Card with relevant figures.

### 13.2 The AI may explain but should not obscure
Important amounts, recipients, dates, funding sources, rules, and consequences must be shown directly in UI.

### 13.3 No hidden execution
A conversational phrase such as "yes do it" may advance an approval flow only if the app can unambiguously bind that response to the exact visible pending action and any required authentication still occurs.

### 13.4 Context awareness
The AI should know safe UI context such as: current screen; selected household member; selected card; selected transaction; user's default currency; current pending approval. This allows requests such as "give her ₹500 more" while Maya's card is open. Context must never override permissions.

### 13.5 Conversation memory
Separate: current thread context; durable user preferences; financial source-of-truth data. The AI's memory is never the authoritative balance, rule, card status, or transaction record.

### 13.6 AI tone
Calm. Concise. Neutral. Non-judgmental. Clear with money. Never guilt users about spending. Avoid "financial wellness" moralizing. Explain risk plainly.

## 14. AI Safety and Prompt-Injection Requirements

Commerce and financial agents will process untrusted external content. This must be treated as a first-class security problem.

Mandatory product requirements:

- Merchant product text, descriptions, reviews, web content, and third-party API fields are untrusted data, never agent instructions.
- External content cannot grant tools, change permissions, bypass approval, or reveal hidden data.
- Financial tool calls must use strict validated structured parameters.
- Backend authorization must independently re-check user, household, card, amount, currency, merchant, limits, and risk state.
- AI cannot access raw card credentials, CVV, private keys, seed phrases, passkeys, or authentication secrets.
- Full PAN/CVV must never be inserted into general AI conversation context.
- Protected checkout must have a maximum authorization amount.
- Merchant identity should be verified server-side where possible.
- Expensive or irreversible actions must be idempotent.
- Every AI action must carry an audit record.
- User-visible confirmation must use trusted app-rendered values, not model-generated amounts alone.
- If AI interpretation is ambiguous about recipient, amount, merchant, currency, card, or rule duration, preparation must stop until the ambiguity is resolved.

## 15. AI Commerce

AI commerce allows the user to search and transact with supported merchant ecosystems. The product must support multiple levels of merchant integration so the UX can remain consistent even when capabilities differ.

### 15.1 Commerce Capability Levels

- **Level A — Discovery.** AI can search and compare products/menu items but cannot construct checkout.
- **Level B — Prepared Cart.** AI can build a cart and send the user to the merchant for final checkout.
- **Level C — Protected Payment Assist.** AI prepares the merchant selection and a scoped card/payment method, then opens merchant checkout.
- **Level D — Full Integrated Checkout.** Where officially supported, AI can prepare and submit the order after explicit user authorization.

Do not imply Level D availability for a merchant unless it actually exists.

### 15.2 Commerce User Flow

1. User asks for a product or food order.
2. AI clarifies only if necessary.
3. Search/merchant adapter returns structured results.
4. App renders products or restaurant/menu results.
5. User selects or asks the AI to select based on criteria.
6. AI creates a prepared cart.
7. App shows price, fees, tax, delivery, merchant, address, refund/cancellation expectations when available.
8. App creates or selects an appropriate protected payment method.
9. User confirms.
10. Required authentication occurs.
11. Backend executes the supported merchant flow.
12. App receives trusted order status.
13. Order is displayed inside the AI thread and Activity.

### 15.3 Product Search UI Requirements
Each result should show: product image; clear title; merchant; total or current price; delivery estimate if available; seller/merchant trust indicator if supportable; important variants; primary "Select" or "Buy" action; optional compare/save action. The AI can explain why one result is recommended but must separate recommendation reasoning from merchant facts.

### 15.4 Food Ordering UI Requirements
Restaurant/order cards should show: restaurant; item summary; quantity; customization status; delivery fee; taxes/fees if available; ETA; delivery address; final or maximum authorization.

### 15.5 Protected Checkout
The checkout protection surface should show: merchant; product/order summary; item subtotal; shipping/delivery; tax/fees; total; payment source; maximum authorization; merchant lock status; number of allowed uses; expiration time if temporary; address; final confirm CTA.

The checkout surface is not an AI bubble. It is a trusted native financial surface.

## 16. Protected Checkout / Agent Card Requirements

A protected card/payment authorization should support as many of the following constraints as infrastructure permits: merchant lock; maximum amount; single transaction; short expiration; currency constraint; order correlation identifier; automatic closure after success; automatic expiry if unused.

The user should see statuses such as: Preparing; Ready for approval; Authorized; Used; Closed; Expired; Refunded; Failed.

Refund processing must remain connected to the original transaction even if a temporary card is closed.

## 17. Ask / AI Home

This is the default landing destination after successful authentication.

### 17.1 Top Header
Left/center area: contextual greeting or "Ask"; optional small subtitle. Right: notification icon if needed; profile avatar.

### 17.2 Financial Snapshot
Keep this compact. Suggested content: total available or selected account balance; small daily/monthly change only if meaningful; account selector or scope chip: Personal / Family / All. Do not turn Ask into a dashboard full of widgets.

### 17.3 Context Card
Show one or two useful proactive observations, for example: family dining is at 64% of budget; two approvals need attention; salary arrived; a subscription increased. Proactive content must be dismissible.

### 17.4 Quick Actions
Recommended initial actions: Send money; Create card; Shop; Family spending. Actions should be context-aware after history exists.

### 17.5 Conversation Composer
Must support: text; voice entry; optional attachment support in later phases; multiline input; send state; loading/stream state; cancel generation state. Placeholder: *Ask anything about your money…*

### 17.6 Empty State
Use meaningful prompts instead of a generic blank chatbot. Examples: Create a family card; Show this month's spending; Shop with AI; Move money.

## 18. AI Conversation Rendering Types

The chat should support typed visual responses. Minimum required renderers:

Plain assistant message. Balance Summary. Spending Insight. Transaction List. Card Summary. Family Member Summary. Rule Proposal. Card Creation Proposal. Transfer Proposal. Approval Request. Product Results. Merchant Cart. Protected Checkout entry. Order Status. Security Warning. Error/Retry. Success Receipt.

Each renderer must look native to the product, not like arbitrary generative UI.

## 19. Voice Mode

Voice is an alternate input mode, not a separate assistant. Requirements: user taps microphone from Ask; interface transitions to a minimal listening state; live transcript becomes visible; user can cancel; AI answers in text and optionally voice depending on settings; financial action proposals always return to a readable confirmation surface; voice alone must not bypass explicit authentication requirements. Avoid keeping a large animated orb on screen when the user is reviewing money details.

## 20. Cards Hub

The Cards screen should be visually memorable and premium.

- **20.1 Header** — Title: Cards. Add/Create button. Optional compact filter.
- **20.2 Card Carousel** — Show selected card prominently with portions of adjacent cards visible where appropriate. Card face should show only necessary information: card nickname; member/purpose; last four digits; network mark only when issuer/legal requirements require it; physical/virtual badge when useful; card status. Avoid showing balance directly on the card artwork if it makes the card visually busy; balance can sit immediately below.
- **20.3 Selected Card Summary** — Available/remaining amount; limit if relevant; progress if relevant; active/frozen/locked status.
- **20.4 Quick Actions** — Freeze/Unfreeze; Add money or fund; Rules; Details.
- **20.5 Activity** — Recent transactions for selected card below quick actions.
- **20.6 Card Filters** — Potential filters: Mine; Family; Purpose; Temporary; Frozen. Do not show filter complexity until users have enough cards to need it.

## 21. Card Detail

Card detail is an object control surface, not a settings dump. Sections: card visual; available amount / limit; status; core controls; rules summary; security controls; wallet provisioning where supported; recent activity; card metadata. Sensitive card details require re-authentication.

## 22. Card Security Controls

Required controls where supported: freeze; online payments; contactless; international; ATM; wallet status; replace card; report lost/stolen; regenerate virtual credentials where supported; terminate card.

Each destructive action requires clear consequence copy. Freeze should be immediately reversible unless the card lifecycle prevents it. Lost/stolen must not be presented as identical to temporary freeze.

## 23. Create Card Flow

The card creation flow must support both manual and AI-assisted creation.

- **Step 1 — Who is it for?** Me / Family member / Purpose / One-time purchase.
- **Step 2 — Card type.** Based on eligibility and purpose: virtual; physical; temporary; purpose-specific.
- **Step 3 — Funding / allowance.** Amount or funding source; reset cadence where applicable.
- **Step 4 — Rules.** Suggested presets plus custom rules.
- **Step 5 — Appearance.** For physical/custom cards if applicable.
- **Step 6 — Review.** Show all material terms in one structured summary.
- **Step 7 — Authentication and creation.** No silent creation after AI suggestion.

AI shortcut example: *"Give Maya ₹6,000 each month. ₹3,000 food, ₹2,000 transport, ask me for anything above ₹1,000."* The app converts this into structured rules for review.

## 24. Custom Card Designer

The card designer is a premium feature, not a free-form graphics editor. Allow safe personalization such as: approved base card style; approved material/style where issuer supports it; accent treatment; initials or name; monogram; approved icon; approved pattern; optional family motif.

Potential later feature: user image upload subject to moderation and issuer/card-network requirements.

Preview requirements: front/back preview as relevant; name placement; card color/material representation; physical/virtual distinction. Never allow card art editing to expose or manipulate real credentials.

## 25. Family Dashboard

The Family screen is a primary destination, not a secondary settings page.

- **25.1 Header** — family title/name; settings entry; add member.
- **25.2 Member Avatar Strip** — owner and key members with clear selected state.
- **25.3 Family Spending Summary** — one concise household figure: current household spend versus monthly budget, or remaining household allowance. Use a single progress visualization.
- **25.4 Member Cards** — each member summary shows: avatar; name; role/relationship optional; remaining amount or used amount; budget progress; pending approval state if present; card status if important. Default emphasis should be remaining spending power, because that is more actionable than spend alone.
- **25.5 Family Rules** — entry point to household-wide policies.
- **25.6 Pending Approvals** — if approvals exist, they should be visible near the top without dominating the entire page.

## 26. Family Member Detail

Show: avatar and name; relationship/role; selected card or card list; remaining monthly amount; budget progress; category budgets; quick actions; recent transactions; requests/approvals; rules.

Quick actions: Send money; Adjust allowance; Freeze card; Rules; Ask AI.

For declined transactions, explain the specific rule that caused the decline when reliably available. Example: *"Declined because Shopping is disabled for this card."* Then present safe actions: Allow once; Edit rules; Dismiss.

## 27. Add Family Member

Flow requirements: choose member type/role; enter basic information; determine whether account/card ownership requires identity verification or guardian process; set initial visibility/permissions; invite or create supervised profile as product allows; create card immediately or later; show completion state.

Do not assume every member can legally receive the same product. Eligibility must be driven by backend capability and jurisdiction.

## 28. Family Permissions

Permissions should be granular. Potential capabilities: view household summary; view specific member activity; create cards; freeze cards; edit rules; add funds; approve purchases; change budgets; invite members; manage AI permissions; manage security.

The UI must explain role effects before applying them.

## 29. Approval Center

Approvals can originate from: spending threshold; blocked category override; new merchant; allowance request; card creation; household admin action; AI-prepared purchase.

Each approval card should show: requester; merchant/action; amount; reason approval is required; current relevant remaining budget; expiration if applicable; Approve once; Decline; optional "change future rule" as a separate action.

Never combine Approve once and Change future policy into a single ambiguous control.

## 30. Activity

Activity is a universal event ledger, not just transactions.

Tabs/filters can include: All; Mine; Family; AI; Transfers; Security.

Events include: card transaction; deposit; transfer; refund; decline; card created; card frozen; rule changed; approval requested; approval completed; household member invited; AI action prepared/executed; protected checkout card created/expired; security event.

Each item should use an icon, concise title, amount where relevant, participant/merchant, timestamp, and status.

## 31. Transaction Detail

Show: merchant; amount; status; date/time; card used; member; category; original currency; conversion rate/amount where applicable; fees; cashback/reward if applicable; location where available; rule applied or decline reason where applicable; receipt attachment if available; refund/dispute actions where eligible; "Ask AI about this transaction."

Possible AI shortcuts: Was this unusual? How much have we spent here? Block this merchant. Find similar transactions. Explain the fee.

## 32. Accounts and Crypto

Crypto functionality should be available without overwhelming the mainstream UI.

- **32.1 Default Balance Experience** — show understandable money: total available; currency value; account names.
- **32.2 Asset Detail** — advanced details may show: asset amount; fiat equivalent; price/change where relevant; network; deposit/withdraw capability; transaction history.
- **32.3 Stablecoin UX** — stablecoins can be displayed as money-like balances but must still disclose asset identity where legally/product-relevant.
- **32.4 Network Selection** — only ask a user to choose a network when necessary. Use clear warnings for irreversible crypto transfers.
- **32.5 Private Keys** — if the product is custodial, never expose nonexistent key controls. If the product includes non-custodial capabilities, key management must be designed as a separate high-security product surface and is outside the first MVP unless explicitly approved.

## 33. Send Money

Send should be available from Ask and conventional UI. Recipients can potentially include: household member; internal user; bank account; supported wallet address.

Review screen must show: recipient; amount; currency; source; fees; estimated arrival; network where applicable; warning if irreversible. Authentication must follow risk and product policy.

## 34. Receive Money

Receive surface can show: user handle; QR; bank details where available; wallet address/network where available; share action.

Do not combine bank and wallet receiving details in a way that risks sending funds to the wrong rail.

## 35. Subscriptions

Subscription visibility is a useful purpose-card and AI feature. The app should be able to show recognized recurring merchants and recurring card transactions.

Potential features: upcoming renewals; monthly total; price increases where detected; subscription card assignment; cancel/deep-link where supported; merchant-specific cap; pause by freezing purpose card, with clear warnings about downstream consequences.

Do not claim a subscription has been cancelled unless a trusted merchant/service result confirms it.

## 36. Notifications

Notifications should communicate meaning, not create transaction spam.

- **Critical** — suspicious sign-in; card compromised; sensitive security change; transfer requires action.
- **Action Required** — family approval request; payment failed; KYC/document request.
- **Financial Awareness** — near budget limit; salary/deposit arrived; large transaction; subscription increase.
- **Informational** — protected checkout completed; temporary card expired; family allowance reset.

Example of preferred wording: *"Maya spent ₹1,299 at Nike. ₹2,440 remains this month."* Instead of: *"Transaction alert: ₹1,299."*

Users need configurable notification preferences and quiet controls, but security-critical alerts should not be fully suppressible where inappropriate.

## 37. Search

Global search should cover: transactions; merchants; cards; members; orders; help content. AI is not a substitute for exact search when users know what they want.

## 38. Settings Structure

Profile/settings should include: personal profile; household settings; security; AI & automations; notifications; cards & wallets; linked accounts / funding sources; appearance; privacy; limits and verification; support; legal/docs; sign out.

## 39. AI & Automations Settings

Provide explicit AI capability toggles or permission levels. Examples: analyze transactions; use household context; prepare transfers; prepare purchases; prepare family limit changes; create temporary checkout cards after confirmation; voice responses; proactive insights.

Any future automatic execution must be separately enabled, narrowly scoped, and clearly distinguishable from preparation. Example future rule: *Auto-pay approved recurring purchase under ₹500 from selected merchant.* This should not exist in MVP unless security/product teams explicitly approve it.

## 40. Security Requirements

Security is a product feature and must be visible in the UX.

- **40.1 Authentication** — support modern secure authentication appropriate to platform and jurisdiction, including device biometrics/passkeys where available.
- **40.2 Step-Up Authentication** — require additional authentication for sensitive actions according to risk policy. Examples: reveal card details; high-value transfer; new recipient; change security settings; add admin; create sensitive AI automation.
- **40.3 Device Security** — track trusted devices and recent sign-ins. Provide: device list; last active; location approximation where safe/available; remove device; alert on new device.
- **40.4 Sensitive Data Handling** — never display or send sensitive credentials into AI conversation context. Mask sensitive values by default.
- **40.5 Risk and Fraud** — the backend should be able to reject an action even after user intent is valid if risk or issuer systems deny it. UI must explain denial without exposing anti-fraud internals.

## 41. Privacy Requirements

The product handles family and potentially minor financial data, so visibility must be explicit.

Requirements: explain what household owner/admin can see; explain what the member can see; explain when transaction visibility is shared; avoid surprising cross-member visibility; allow role/permission inspection; AI must only receive data the current user is authorized to access; export/deletion/privacy controls should follow product/legal requirements.

Do not use sensitive family spending information for promotional experiences without explicit policy/consent design.

## 42. Compliance and Operational Requirements

The implementation must assume financial compliance is market-specific and must not hard-code legal assumptions into UI.

Before launch in any jurisdiction, product/legal/issuer partners must define: user eligibility; minor/dependent eligibility; KYC/KYB requirements; AML/sanctions screening; card issuance rules; crypto custody/transfer requirements; disclosures; transaction limits; data retention; dispute/chargeback handling; tax/reporting obligations where applicable; consumer privacy requirements; merchant/commerce integration permissions.

The UI should consume eligibility/capability information from backend configuration rather than assuming every feature is universally available.

## 43. Support and Disputes

Support should exist as both conventional help and AI-guided assistance. Possible entry points: transaction detail → Get help; card detail → Lost/stolen; profile → Support; Ask → "I don't recognize this charge."

For suspicious transactions: explain immediate safe action; offer card freeze; start dispute workflow where supported; show current card state; record support activity.

The AI may guide but should not fabricate dispute status or resolution.

## 44. Visual Direction

### 44.1 Theme Name

**Obsidian / Quiet Intelligence**

The product should feel: dark; minimal; premium; calm; high-trust; slightly futuristic without looking cyberpunk.

Avoid: rainbow crypto gradients; neon glow everywhere; glassmorphism on every surface; excessive card borders; particle backgrounds; constant animated charts; oversized decorative 3D elements.

## 45. Color System

Recommended starting tokens. These are design targets and may be adjusted for accessibility and device rendering.

**Core**
- Background / Obsidian: `#070908`
- Background Raised: `#0B0F0D`
- Surface 1: `#101512`
- Surface 2: `#151B17`
- Surface 3: `#1A211D`
- Border Soft: `#222B26`
- Border Strong: `#2C3831`

**Typography**
- Text Primary: `#F4F7F5`
- Text Secondary: `#A1AAA5`
- Text Tertiary: `#6F7974`
- Text Disabled: `#4D5551`

**Brand Accent**
- Mint Primary: `#46E6A2`
- Mint Bright: `#6EF0B6`
- Mint Dim Surface: `#123A2B`
- Mint Border: `#245E46`

**Semantic**
- Success: `#46E6A2`
- Warning: `#F3B84B`
- Error: `#FF6B70`
- Info: `#7AA7FF`

Do not use pure black for every surface; layered charcoal creates depth without heavy shadows.

## 46. Typography

Use a clean cross-platform sans serif. Recommended product direction: **Inter** or equivalent licensed/open sans serif. Use native system fallback where needed. Monetary figures must support tabular numerals.

Suggested scale: Hero Balance 48–56; Large Balance 36–44; Screen Title 28–32; Section Title 18–20; Card Title 16–18; Body 15–16; Secondary 13–14; Caption 11–12.

Use tight tracking for large numbers, normal tracking for body text. Do not overuse uppercase; reserve it for very small metadata labels.

## 47. Spacing System

Use a 4-point base grid. Primary spacing tokens: 4 micro; 8 compact; 12 standard inline; 16 standard container; 20 generous; 24 section; 32 large section; 40 hero separation.

Primary screen horizontal padding: 16 or 20 depending on device width. Avoid arbitrary one-off spacing unless needed for visual optical alignment.

## 48. Radius System

Recommended: chips 10–12; small controls 12; list tiles 14–16; cards/panels 18–22; bottom sheets 24–28 top corners; payment cards physical-card-proportional radius.

Do not use pill shapes for every element. Pills should indicate filters, compact status, or actions.

## 49. Borders, Shadows and Depth

Dark theme depth should rely on: surface tone; soft border; very subtle shadow/glow only where useful. Avoid bright white borders. Selected/important surfaces can use a low-opacity mint edge or inner glow, but not every card.

## 50. Iconography

Use a consistent outline icon family. Rules: default 20–22px; 16–18px for metadata; filled icon only for selected navigation or important status; avoid mixing multiple icon styles; financial semantics should not rely on icon alone.

## 51. Motion Principles

Motion should communicate hierarchy/state, not entertain.

Recommended timings: simple state change 140–180ms; navigation/expansion 200–280ms; bottom sheet spring-based, visually about 280–380ms; card carousel controlled spring; success feedback short and subtle.

Use haptics for: card freeze/unfreeze; confirmation; approval success; important selection. Do not use haptics for every tap. Respect reduced-motion settings.

## 52. Reacticx Component Strategy

Reacticx should supply motion and interaction primitives while the product maintains its own financial component language.

Use Reacticx selectively for: Animated Input Bar (Ask composer); Chat V1 concepts (starting point for chat behavior, not final visual identity); Bottom Sheet / Bottom Sheet Stack (approval and creation flows); Material/Parallax/Scale Carousel (card selection where appropriate); Matched Geometry (opening a card into detail); Flip Card (sensitive details reveal or card preview only if it remains clear); Rolling Counter (balance transitions); Avatar / Avatar Group (family); Badge (states); Animated Chip Group (filters and rule chips); Progress / Circular Progress (budgets); Segmented Control / Tabs (filters); Morphing Tab Bar or Stack Aware Tabs (navigation exploration if accessibility remains strong); Dynamic Island (transient in-app event state only, not persistent financial UI); Toast (lightweight success/error confirmation); QR Code (receive flows); Squircle View (premium containers if used consistently); Picker (controlled selection flows); Shimmer / Shimmer Wave Text (short loading states only); Tilt Carousel (optional custom-card preview).

Do not implement every Reacticx component just because it exists.

The app must define proprietary components such as: MoneyCard; PaymentCardVisual; TransactionRow; MemberBudgetCard; RuleChip; ApprovalCard; TransferReviewCard; ProductResultCard; ProtectedCheckoutCard; AIActionReceipt; BalanceHeader; SecurityActionRow. These should share Reacticx primitives underneath where useful but preserve a coherent product identity.

## 53. CopilotKit Role

Use CopilotKit as the AI interaction/orchestration layer rather than the banking backend. The desired approach is a headless React Native integration so the product owns the full UI while the AI layer provides agent connection, frontend tools, shared context, human-in-the-loop workflows, thread state, and tool rendering support.

Responsibilities of CopilotKit layer: connect mobile UI to agent runtime; stream agent messages/state; register safe frontend tool interactions; support human-in-the-loop pauses; share current app context with the agent; render known tool outputs into approved product components; maintain thread interaction state.

Responsibilities it must NOT own: ledger; card authority; transaction authorization; household permission source of truth; KYC; custody; risk engine; merchant settlement; authentication secrets.

Use deterministic known tool renderers for money actions rather than arbitrary agent-generated financial layouts.

## 54. AI Tool Taxonomy

No implementation signatures are specified here; this is a behavior taxonomy.

**Read Tools**: get balances; get accounts; get cards; get card state; get family members; get member spending; get rules; get approvals; get transactions; analyze spending; search transactions; search products; search food/restaurants; get order status; get subscription activity.

**Prepare Tools**: prepare transfer; prepare card creation; prepare rule change; prepare temporary allowance; prepare freeze/unfreeze; prepare household policy; prepare purchase; prepare protected checkout; prepare family invitation.

**Execution Services**: these are not free-form agent actions. They are invoked only after approved application authorization: execute transfer; create card; apply rule change; apply freeze/unfreeze; execute merchant purchase; add household member/admin; change sensitive security state.

## 55. Application Architecture — Conceptual

The product should be separated into clear trust domains.

- **Mobile Presentation Layer** — owns navigation; visual components; local interaction state; trusted confirmation surfaces; device authentication prompts.
- **AI Interaction Layer** — owns conversation; context handoff; agent state; tool proposal rendering; human-in-the-loop orchestration.
- **Financial Domain Backend** — owns accounts; balances; cards; rules; households; permissions; approvals; transactions; audit events.
- **Payment/Card Integration Layer** — owns issuer/processor-specific actions.
- **Wallet/Crypto Layer** — owns custody/wallet interactions, supported asset rails, and network validation.
- **Commerce Adapter Layer** — owns merchant-specific search, cart, order, and status capabilities.
- **Risk/Security Layer** — owns fraud checks, authorization policy, device risk, action limits, and security eventing.
- **Notification/Event Layer** — owns push/in-app notification fanout and lifecycle events.

The AI layer must never bypass the financial domain backend.

## 56. State Machines

- **56.1 Card State** — Pending creation; Active; Frozen; Temporarily locked; Expired; Replaced; Cancelled; Failed provisioning.
- **56.2 Approval State** — Pending; Approved; Declined; Expired; Cancelled; Superseded.
- **56.3 Transfer State** — Draft/prepared; Awaiting confirmation; Authenticating; Submitted; Pending; Completed; Failed; Reversed/returned.
- **56.4 AI Action State** — Interpreting; Prepared; Awaiting user; Awaiting secondary approver; Authenticating; Executing; Completed; Failed; Cancelled; Expired.
- **56.5 Commerce Order State** — Searching; Selected; Cart prepared; Awaiting confirmation; Payment authorized; Order submitted; Confirmed; Preparing; In transit; Delivered; Cancelled; Refunded; Failed.

UI must not jump straight from "AI thinking" to "success" without trusted intermediate state where required.

## 57. Loading and Skeleton States

Every network-backed screen requires a defined loading state. Use skeletons for: cards; activity list; family list; product search. Use compact progress/loading indicators for: AI tool execution; checkout preparation; authentication wait. Never use indefinite full-screen spinners when cached content can remain visible.

## 58. Empty States

Required empty states: no cards; no family members; no transactions; no approvals; no AI conversation history; no product search results; no subscriptions; no notifications. Each empty state should provide one relevant next action.

## 59. Error States

Errors must distinguish: network unavailable; authentication required; permission denied; insufficient funds; card limit reached; merchant unavailable; AI unavailable; issuer unavailable; unsupported feature; compliance/eligibility restriction; risk rejection; unknown server error.

Error messages should explain what the user can do next without exposing sensitive internals.

## 60. Offline Behavior

When offline: app can show cached balances/activity with a clear stale/offline indicator; do not execute financial actions; user can draft a request but must be told execution requires connectivity; AI requests that require backend context should not invent responses; sensitive cached data must follow device security policy.

## 61. Accessibility

Mandatory requirements: support dynamic text sizing within reasonable layouts; minimum touch targets appropriate to platform; do not communicate status with color alone; screen-reader labels for balances, controls, card states, progress, and transaction amounts; reduced-motion support; sufficient contrast in dark mode; visible focus states for supported accessibility workflows; avoid inaccessible horizontal carousels without alternative selection controls; card freeze cannot exist only as a gesture.

## 62. Localization and Currency

The architecture must support: multiple display currencies; local number formatting; different decimal precision by asset/currency; right-to-left readiness if future markets require it; local date/time formats; timezone-aware rule expiry; multi-currency transaction details.

Never concatenate currency symbols manually in UI logic; formatting must be locale-aware.

## 63. Performance Targets

These are product targets, not guarantees: main navigation transitions should feel 60fps on supported devices; cached primary surfaces should render immediately while refreshing; balance/card loading should avoid layout jumps; AI streaming should show progress quickly rather than waiting for the full answer; product search should support incremental results; large activity lists must remain responsive; heavy Skia/Reanimated effects must be avoided on low-value surfaces.

## 64. Analytics and Product Metrics

Track user behavior with privacy-aware analytics.

**Core product KPIs**: weekly active households; AI-assisted action rate; AI prepared → approved conversion; card activation rate; cards per household; family member activation; approval response time; rule creation rate; protected checkout usage; purchase success rate; transfer success rate; retained funded users; support/dispute rate.

**AI quality metrics**: clarification rate; tool failure rate; wrong-tool correction rate; user cancellation rate; AI action reversal rate; unsupported request rate; latency to first meaningful UI.

**Security metrics**: failed authentication rate; suspicious login rate; fraud/risk rejection rate; unauthorized-action attempts blocked.

Do not log secrets, PAN/CVV, private keys, raw authentication tokens, or sensitive prompt content beyond approved privacy policy.

## 65. Suggested Analytics Events

Event naming can be finalized later. At minimum instrument: app opened; Ask submitted; AI response completed; AI tool proposed; AI proposal viewed; AI proposal approved; AI proposal declined; card carousel changed; card created; card frozen/unfrozen; rule created/changed; family member invited/activated; approval opened/approved/declined; transfer prepared/confirmed/completed/failed; product searched; product selected; checkout prepared; checkout confirmed; order completed/failed; transaction detail opened; security setting changed.

## 66. Screen Inventory

Minimum product screen/surface inventory:

**Authentication / Onboarding**: Launch/Splash; Welcome; Sign in; Create account; Phone/email verification; Identity verification status; Secure device/passkey setup; Fund account; Create first card; AI introduction/preferences.

**Ask**: Ask Home; Conversation thread; Voice mode; AI action proposal; AI action receipt; AI error/retry.

**Commerce**: Product search results; Product detail/compare surface; Food/restaurant results; Cart review; Protected Checkout; Order status; Order history/detail.

**Cards**: Cards Hub; Card Detail; Card Security Controls; Sensitive Card Details; Create Card; Card Rules; Custom Card Designer; Replace/Lost/Stolen flow.

**Family**: Family Dashboard; Member Detail; Add Member; Invite Status; Member Permissions; Member Rules; Household Policies; Create/Edit Policy; Approval Center; Approval Detail.

**Money**: Accounts/Assets summary; Asset detail; Send Money; Receive Money; Transfer Review; Transfer Status.

**Activity**: Activity Feed; Transaction Detail; AI Action Detail; Security Event Detail.

**Settings / Support**: Profile; Household Settings; AI & Automations; Notifications Settings; Security Center; Trusted Devices; Appearance; Privacy; Support Home; Dispute flow; Legal/Documents.

Not every screen needs to exist as a full route; many can be bottom sheets or nested surfaces.

## 67. Detailed Screen Layout Standards

Every major screen should follow this pattern where applicable: safe-area aware header; one clear primary purpose; at most one dominant hero metric/object; content grouped into visually quiet sections; primary action reachable without excessive scroll; sensitive/destructive actions visually separated; loading/empty/error state defined.

Avoid screen titles plus redundant hero titles repeating the same phrase.

## 68. Bottom Sheet Standards

Use bottom sheets for: short confirmations; quick card creation steps; rule editing; account/card selection; approval details; merchant options.

Use full screens for: complex multi-step onboarding; full card details; family dashboard; activity; long forms; security center.

Bottom sheets must support keyboard-safe behavior and accessible dismissal.

## 69. Financial Confirmation Standard

Every financial confirmation must show the essential immutable facts immediately before execution.

For transfers: recipient; amount; currency; source; fee; arrival/network.
For purchases: merchant; items; total/max authorization; delivery address; payment source.
For card/rule changes: card/member; existing value; new value; effective time; expiry if temporary.

The confirm CTA should contain the main consequence where practical, such as: *Confirm ₹5,000 transfer* · *Pay ₹18,999* · *Create card* · *Freeze Maya's card*.

## 70. AI Action Receipt Standard

After a successful AI-mediated action show: Done/Completed status; what changed; old → new value where relevant; effective time; actor: "You via AI" or approved household member; undo where technically and safely possible; view details.

AI receipts must also appear in Activity.

## 71. Design of Family Member Experience

The supervised member app should not feel like a disabled version of the owner's app. A teen/member home can emphasize: remaining amount; next allowance/reset; spending by category; request money; Ask AI; savings/goals in later phase.

The AI can say: *"You have ₹1,680 left this month. Your food budget has ₹870 remaining."* Avoid language such as: *"You're overspending badly."*

## 72. Proactive AI Insights

AI Home may surface contextual insights, but limit frequency. Good examples: two approvals are waiting; dining is near limit; a subscription increased; international spending is off while traveling; salary arrived; a temporary card expires soon.

Each insight should include either: Dismiss; relevant action; "Ask why" or details. Do not fill the app with generic financial advice.

## 73. Rewards and Cashback

Rewards can be supported but should not become a primary navigation destination initially. Potential placements: card detail; transaction detail; profile/benefits. If rewards vary by merchant/card/product, display terms clearly. Avoid building the brand around speculative token incentives.

## 74. Savings / Goals — Later Phase

Potential family feature: member savings goal; owner match; allowance split; goal progress. AI examples: *"Move 20% of Arjun's weekly allowance to his laptop goal."* · *"How long until Maya reaches ₹10,000 at this rate?"*

Do not include goals in MVP unless card/family core flows are stable.

## 75. Business Model Options

The product may support a combination of: free base tier; premium household subscription; premium physical card/customization fees; FX/revenue share where lawful and disclosed; interchange economics; merchant affiliate/commerce revenue where allowed and transparently handled; premium AI capabilities.

Do not bias AI product recommendations solely toward higher affiliate revenue without disclosure and user-aligned ranking.

## 76. MVP Scope

The MVP should prove the product thesis, not replicate a full bank.

**P0 — Must Build**

- Core Platform: authentication and secure session; basic identity/eligibility integration surface; primary balance/account summary; personal card; card freeze/security basics; activity feed.
- AI: Ask Home; streaming conversation; context-aware read tools; structured AI renderers; human-in-the-loop action proposals; AI action receipts.
- Family: household creation; add/invite member; family dashboard; member card; monthly limit; per-transaction approval threshold; category controls where infrastructure allows; approval flow.
- Cards: Card Hub; card detail; create family/purpose virtual card; rules.
- Money: internal or supported transfer flow; review/authentication/receipt.
- Trust: security center basics; audit events; notifications for approvals/security.

**P1 — Differentiation Layer**

AI product search; merchant adapters; Protected Checkout; temporary/merchant-locked cards; order tracking; household policies; custom card designer; subscription card.

**P2 — Expansion**

Voice assistant; advanced crypto assets/networks; savings/goals; advanced automations; more commerce merchants; travel policy automation; rewards sophistication.

## 77. Recommended Demo Build

For an investor/demo-quality first release, make these six flows flawless:

- **Demo 1 — Ask Home**: user sees balance, one household insight, activity, and AI composer.
- **Demo 2 — Family Allowance by AI**: user: "Give Maya ₹1,000 more until Sunday." AI renders structured temporary allowance. User confirms. Receipt appears.
- **Demo 3 — Cards Hub**: user swipes between Personal, Maya, Subscriptions, and a temporary card.
- **Demo 4 — Approval**: Maya requests a purchase above threshold. Owner approves once without changing permanent policy.
- **Demo 5 — AI Shopping**: user asks for headphones under a budget. App renders product cards.
- **Demo 6 — Protected Checkout**: user selects product, reviews merchant-locked maximum amount, authenticates, purchase succeeds, and the temporary card closes.

These six flows demonstrate the entire product thesis.

## 78. QA / Acceptance Requirements

Before a feature is considered complete, it must satisfy:

**Functional**: happy path; loading path; empty path; error path; permission denied path; retry behavior; back/cancel behavior.

**Financial Safety**: correct values come from trusted backend state; no duplicate execution on repeated tap/network retry; confirmation values match execution values; authentication result is bound to the intended action; audit event is created.

**AI**: tool result maps to known UI; AI cannot bypass approval; context does not grant extra permissions; untrusted merchant content cannot issue tool instructions; failed tool execution is reported accurately.

**UI**: dark theme correct; accessible contrast; dynamic text reasonable; haptics appropriate; reduced motion supported; keyboard behavior correct; safe-area behavior correct.

## 79. Product Non-Goals for Initial Version

Do not prioritize: full trading terminal; advanced DeFi; NFT features; social feed; public crypto profiles; speculative token gamification; AI autonomous investing; AI autonomous high-value spending; complex budgeting spreadsheets; desktop-first experience; every merchant integration at launch. These dilute the core proposition.

## 80. Decisions That Must Remain Configurable

Do not hard-code the following into presentation logic: supported countries; supported currencies; supported assets; card network/issuer; maximum household size; minor eligibility; card fees; ATM limits; transfer limits; merchant capabilities; commerce checkout level; AI permissions; KYC requirements; card customization eligibility; reward rates. These should be capability/configuration-driven.

## 81. Open Product Decisions

These decisions should be made before production launch but should not block prototyping: product name and brand identity; custodial versus hybrid wallet architecture; primary card issuer/processor; initial launch country/countries; supported base currency and stablecoins; whether family cards are legally separate accounts, sub-ledger cards, authorized users, or another issuer-specific model; exact minor onboarding model; Amazon/commerce partnership capabilities; Swiggy/food integration capabilities; subscription pricing; physical card manufacturing/customization options; default household transaction visibility model; default AI data retention and personalization policy; whether voice ships in MVP.

Claude Code should build these as abstractions/capabilities where practical rather than baking in assumptions.

## 82. Final Product Rulebook

These are non-negotiable product rules:

1. AI is the command layer; trusted UI is the control layer.
2. The model never becomes the source of truth for money.
3. No financial execution without backend authorization.
4. Sensitive financial values are not hidden inside prose.
5. Every irreversible action has an explicit, deterministic confirmation.
6. Every important action creates an audit trail.
7. External merchant content is always untrusted.
8. Family permissions are explicit and inspectable.
9. Crypto complexity stays hidden until needed.
10. Dark minimal design must remain calm and readable.
11. Reacticx is an interaction toolkit, not the product identity.
12. CopilotKit is the AI UX/orchestration layer, not the financial backend.
13. Use known structured renderers for money actions.
14. Build the AI and manual path to the same underlying financial domain actions.
15. Never claim an action succeeded until a trusted service confirms it.

## 83. Definition of the Product in One Paragraph

This application is a premium dark-mode AI-native neobank that uses crypto/stablecoin infrastructure to power simple global money experiences while letting households create programmable personal, family, purpose, and temporary cards. The Ask interface lets users control money, understand spending, create card rules, manage allowances, send funds, and shop conversationally. CopilotKit handles the agentic interaction layer, Reacticx provides selected React Native interaction primitives, and the product's own financial UI renders all balances, cards, approvals, actions, and receipts. Every action that moves money or changes authority is validated by deterministic backend policy and explicit user authorization. The result should feel less like a crypto wallet and more like an intelligent financial operating system for a household.

## 84. Build Priority for Claude Code

When implementation begins, the preferred order is:

1. Establish dark design tokens and core financial components.
2. Build navigation shell: Ask, Cards, Family, Activity.
3. Build mocked domain data layer sufficient to render all core states.
4. Build Cards Hub and Card Detail.
5. Build Family Dashboard and Member Detail.
6. Build Approval Card and Rule surfaces.
7. Build Ask UI using product-owned components.
8. Integrate CopilotKit headless conversation and known tool renderers.
9. Connect READ tools first.
10. Add PREPARE tools and human-in-the-loop surfaces.
11. Add deterministic authenticated execution gateway.
12. Connect real financial provider APIs only after domain states and safety flows are stable.
13. Add commerce discovery.
14. Add Protected Checkout.
15. Add production-grade observability, risk, accessibility, localization, and compliance configuration.

The implementation should prefer coherent, reusable domain components over one-off screen styling.

## 85. End State

The finished product should allow a new user to understand the proposition within one minute:

1. I can ask this app to do things with my money.
2. I can create cards for myself and family.
3. I can control exactly how those cards are used.
4. I can see what everyone is allowed to spend and what remains.
5. I can approve exceptional purchases without permanently changing rules.
6. I can shop through AI without handing it unrestricted spending authority.
7. I can understand every action the AI took.
8. I do not need to understand crypto to use the product.
9. I still have direct control if I do not want to use AI.

If the product achieves those nine things with an exceptionally clean dark interface, it has a clear and differentiated identity.
