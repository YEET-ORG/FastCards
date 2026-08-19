# AI-Native Family Crypto Neobank

## UI Screen, Interaction and Component Contract

Purpose: Detailed UI/UX specification for implementation. This document complements `AI_FAMILY_NEOBANK_PRODUCT_DESIGN_SPEC.md` and `CLAUDE.md`.

Visual direction: Dark minimal / **Obsidian / Quiet Intelligence**.

Important: This document defines behavior and design requirements only. It intentionally contains no implementation code.

---

## 1. Global Mobile Frame

Design against a 390-point-class phone as the baseline, while all layouts remain responsive to safe areas and device width.

**Global page anatomy**: full-screen background uses Obsidian; horizontal screen padding 16–20; header content begins below safe area; header visual height approximately 52–60 excluding safe area; primary scroll content uses 20–24 spacing between major sections; bottom navigation sits above the device safe area; avoid floating elements that overlap financial values.

**Bottom navigation**: tabs Ask · Cards · Family · Activity. Selected icon + label use Mint Primary; unselected items use Text Tertiary; no oversized center FAB; light haptic on tab selection; preserve tab state when switching tabs; if the selected tab is tapped again, scroll that tab to top when sensible. Preferred motion: subtle indicator/morph, never distracting.

## 2. Global Header Standard

Primary-screen header should contain no more than three conceptual zones: left — screen title or greeting; center — generally empty unless title is centered; right — contextual action and/or profile.

Do not put a hamburger menu on primary screens unless product architecture later requires a drawer. Profile avatar is the default settings entry. Notification bell appears only if in-app notifications are a required MVP surface.

## 3. Global Surface Hierarchy

Use three visually distinct depths only: **Base** (page background); **Standard Surface** (grouped information, member rows, transaction groups, AI action renderers); **Elevated Surface** (bottom sheets, approval cards, selected financial object, checkout, security confirmation).

Avoid stacking more than two visible nested card borders.

## 4. Global Money Formatting

Money values are visually dominant where relevant. Rules: use tabular numerals; never show unnecessary precision; negative spend can use leading minus when context needs it; income/deposit can use plus only in transaction contexts; avoid coloring all spending red — normal purchases are neutral text; use Error red for failure/decline, not normal debit activity; use Mint for incoming money, success, remaining progress, and active state selectively.

Example hierarchy: Large balance → Primary text. Supporting limit → Secondary text. Status → Badge.

## 5. Ask Home — Screen Contract

**Purpose**: immediately communicate that the app can understand and act on the user's money.

**Header**: left — contextual greeting on first open of day, otherwise "Ask"; optional one-line subtext "Your money, in one conversation." Right — profile avatar. Do not place a giant app logo in the header.

**Financial Snapshot**: height target roughly 88–112. Content: small label (Total available / Net available); large amount; eye/hide balance control; tiny scope affordance Personal / Family / All; optional mini trend only if data is real and useful. No full analytical graph on the default Ask Home.

**Proactive AI Insight**: one prominent insight card at a time. Anatomy: small AI/spark icon; one-sentence insight; optional supporting value; maximum two actions. Example: "Family dining is at 64% of this month's budget." Actions: View family · Adjust budget. If multiple insights exist, show the most actionable and allow "See insights" rather than stacking six cards.

**Quick Actions**: maximum four chips/buttons visible without scrolling — Send money · Create card · Shop · Family spending. Use icon + concise label.

**Recent Activity**: show 3–5 rows maximum before "View all".

**AI Composer**: sticky above bottom nav. Visual: raised dark rounded input; AI/mint indicator at left only when helpful; placeholder "Ask anything about your money…"; microphone on empty input; send icon when text exists; optional plus button for attachments/features in later phase. Composer expands up to a reasonable multiline limit before internal scrolling.

**Ask Home States**: *New User* — replace proactive insight with four suggestion cards (Create your first card; Add family; Move money; Ask about crypto). *No Funding* — show fund-account action without making the entire screen an error state. *AI Offline* — keep financial snapshot and manual navigation available; composer displays temporary unavailability and retry.

## 6. AI Conversation — Screen Contract

**Header**: back or tab context; thread title generated from first meaningful request, editable later if needed; optional overflow for clear/delete/export according to privacy policy.

**Message Layout**: user message — compact bubble or right-aligned surface; avoid bright accent fill; use Surface 2. Assistant prose — prefer borderless text block or subtle surface; never use giant bubbles for long answers. Tool result — render domain component full available width minus standard padding.

**Streaming**: stream text naturally; do not animate each character with dramatic motion in production; show tool transition states such as "Checking your cards…" only when latency makes it useful.

**Tool UI Placement**: the structured tool component appears directly beneath the assistant sentence that introduces it, or by itself if no prose is needed.

**Pending Action Binding**: when a proposal is awaiting confirmation, the conversation must visually associate future "yes"/"confirm" context with that exact proposal. Only one ambiguous high-risk pending action should be active per thread at a time unless the UI explicitly manages multiple proposals.

## 7. AI Insight Card — Component Contract

Used for spending summaries and observations. Anatomy: eyebrow "AI Insight"; primary statement; optional main value; optional micro visualization; up to three supporting rows; up to two actions.

Avoid unsupported causal language. Preferred: "Dining increased ₹2,340 compared with last month." Not: "You spent too much on food because you were stressed."

## 8. Cards Hub — Screen Contract

**Header**: title "Cards"; right action plus/Create.

**Carousel Area**: selected payment card occupies approximately 76–84% of available width; show partial adjacent card edge to indicate horizontal swiping when more than one card exists; card aspect ratio should visually match a physical payment card.

Card visual content: card nickname; member or purpose only when needed; chip/contactless marks where visually appropriate; last four; network/issuer marks if legally required; status badge outside or subtly on card. Do not overlay monthly progress on card artwork.

**Card Selection Motion**: use Reacticx Material Carousel or a similarly calm carousel; avoid extreme tilt/perspective; light haptic on selection snap.

**Selected Card Summary**: immediately below — label "Available to spend / Remaining this month"; large amount; secondary line "of ₹5,000 monthly limit" when applicable; thin progress bar.

**Quick Actions**: four maximum — Freeze · Fund/Add money · Rules · Details. Circular icon controls with text labels beneath or compact square controls.

**Recent Activity**: 3–5 rows + View all.

## 9. Payment Card Visual — Component Contract

Variants: Personal; Family; Purpose; Temporary; Subscription; Protected Checkout.

- **Personal**: graphite/black, subtle material/line pattern.
- **Family**: may use restrained individual accent while remaining within dark brand system.
- **Purpose**: small purpose icon and name.
- **Temporary/Protected**: visual cue such as fine mint border and explicit "Temporary" or expiry metadata.

Do not use bright gradients that make credential text hard to read.

**Frozen State**: desaturate visual; add clear Frozen badge; slight frosted treatment permitted; do not rely on blur alone.

## 10. Card Detail — Screen Contract

**Header**: back + card nickname; overflow for replacement/terminate actions.

**Hero**: PaymentCardVisual centered; use matched geometry from Cards Hub if stable.

**Primary Status Row**: Active/Frozen badge; available amount; card ownership/purpose.

**Action Row**: Freeze · Show details · Rules · More. Sensitive details require re-authentication before reveal.

**Spending Controls Summary**: show active controls as concise rows/chips — Monthly ₹5,000 · Approval > ₹1,000 · Online enabled · ATM off. Tap opens full Rules.

**Activity**: selected card transaction list.

**Destructive Area**: near bottom — report lost/stolen; replace; close card where allowed. Destructive options should not visually compete with normal card controls.

## 11. Sensitive Card Detail Surface

Must be visually distinct from ordinary card page. Requires recent authentication. Display: cardholder; number; expiry; CVV if product permits; copy affordance per field. Auto-hide after configured timeout or app backgrounding according to security policy. Never place this content inside AI chat.

## 12. Freeze Interaction

Freeze tap: immediate action if product/risk policy allows; short progress state; card visual transitions to Frozen; haptic success; toast "Maya's card is frozen."; Activity event generated. If freeze fails, restore active state and show exact retry/error status. Lost/stolen flow must remain separate.

## 13. Create Card — Screen Contract

Use full screen or stacked bottom sheets depending on number of steps. For first implementation prefer a clear multi-step full-screen flow.

**Progress**: small step indicator; do not show ten-step wizard chrome.

- **Step 1 — For whom?** Large selection rows: Me · Family member · Purpose · One-time purchase.
- **Step 2 — Choose member/purpose.** For family: avatar list; add member if none. For purpose: preset tiles — Subscriptions · Travel · Shopping · Groceries · School · Custom.
- **Step 3 — Budget/Funding.** Main amount input; optional cadence: One time · Weekly · Monthly.
- **Step 4 — Rules.** Preset chips and detailed edit. Provide an AI text field: "Describe how this card should work…" Example placeholder: "₹5,000/month, food and transport only, ask me above ₹1,000." AI output becomes visible structured rules.
- **Step 5 — Review.** Show: user/member; card type; amount; funding; rules; expiry; fees if applicable. CTA: Create card.

## 14. Rule Chip — Component Contract

Compact visual representation of a rule. Examples: ₹5k / month · Food ₹3k · Ask > ₹1k · ATM off · Online on · Ends Sun.

States: Active; Inherited; Temporary; Disabled; Conflict/error. Tap opens rule detail/edit. Do not use color alone to indicate "off" — include text/icon.

## 15. Rules Screen — Contract

**Header**: card/member name + "Rules".

**AI Rule Composer**: compact prompt field at top: "Describe a change…" AI-generated rule changes render as a proposal, not directly mutating controls.

**Manual Sections**: Spending Limits (monthly; weekly/daily if supported; per transaction) · Approvals (above amount; category/new merchant where supported) · Categories/Merchants (category control; merchant allow/block) · Channels (online; contactless; ATM; international) · Schedule (date range; days/times; temporary override).

**Inheritance**: inherited rules show source — "From Vacation Mode" — and allow navigation to source policy.

## 16. Rule Proposal Card — Contract

Used in Ask and Rules. Header: "Proposed change". Subject: "Maya's Card". Rows: current value; new value; effective; expires. Actions: Cancel; Review details if complex; Apply change. High-impact changes require authentication according to policy.

## 17. Family Dashboard — Screen Contract

**Header**: title "Family"; right — add member; settings, possibly in overflow if only one action fits.

**Avatar Strip**: horizontal row — owner, members, add button. Selected avatar uses mint ring.

**Household Summary**: one hero card — "₹84,210 spent this month" or "₹35,790 remaining"; budget reference; progress; month selector. Default product language should favor remaining spending power when useful.

**Pending Approval Banner**: only if approvals exist. Example: "2 purchases need approval" — CTA Review.

**Member List**: each MemberBudgetCard shows avatar; name; small purpose/role optional; used or remaining amount; total limit; progress; pending/frozen badge when needed.

**Household Policies**: single entry row near bottom — "Family rules & policies".

## 18. MemberBudgetCard — Contract

Default state: avatar 40–44; name; one-line context; amount row; thin progress; percentage optional.

Pending approval: small warning badge. Frozen: frozen badge; progress remains readable. Near limit: warning color only when threshold is genuinely important.

Do not automatically show red when member spends more; reserve red for breach/blocked/error.

## 19. Family Member Detail — Screen Contract

**Header**: avatar + name or title area.

**Main Amount**: "₹1,680 left" — secondary "of ₹6,000 this month" — progress.

**Quick Actions**: Send money · Adjust limit · Freeze · Rules.

**Category Budget Section**: rows — Food ₹2,130 / ₹3,000 · Transport ₹1,420 / ₹2,000 · Other ₹770 / ₹1,000.

**Recent Activity**: recent member transactions; declined row opens reason surface.

**Ask AI Entry**: small persistent button or action — "Ask about Maya's spending". Opening Ask automatically shares selected member context.

## 20. Add Member — Screen Contract

Flow: member type; basic details; invite/contact; eligibility/verification status; permissions; optional card creation; success.

Do not request unnecessary personal data before eligibility requires it. If a member requires a different onboarding/guardian process, branch based on backend capability.

## 21. Approval Center — Screen Contract

**Header**: "Approvals" + pending count. Filters: Pending · Completed.

**Pending Approval Card**: requester; merchant/action; amount; reason; remaining budget; request time; expiry. Primary action: Approve once. Secondary: Decline. Tertiary: Change rule. Change rule must be visually separate from approval.

## 22. Approval Detail — Contract

Use full-screen or elevated sheet. Required information: requester avatar/name; merchant; amount; item/context when available; rule that triggered approval; current remaining budget; recent merchant/member context if useful.

Actions: Approve once; Decline; Edit future rule. If user chooses Edit future rule, leave approval context intact while opening a distinct rule proposal.

## 23. Activity Feed — Screen Contract

**Header**: title "Activity"; search icon.

**Filter Chips**: All · Mine · Family · AI · Transfers. Security can appear in More/secondary filter if needed.

**Feed Grouping**: group by Today · Yesterday · Date.

**Transaction Row Anatomy**: left — merchant/member icon/avatar; center — title, subtitle/category/member; right — amount/status, time.

Normal purchase amounts use primary text, not red. AI action rows use small AI icon and textual action rather than pretending to be monetary transactions.

## 24. Transaction Detail — Screen Contract

**Hero**: merchant logo/icon; merchant name; large amount; status badge.

**Metadata Section**: date/time; card; member; category; original currency; FX details; fees; location; cashback/reward. Only show fields that exist.

**Rule/Approval Section**: if transaction was approved or restricted, show rule applied and approver.

**Actions**: Ask AI; Get help; Report issue/dispute where eligible; Block merchant where applicable.

## 25. Send Money — Screen Contract

**Recipient Selection**: search field + recent recipients + family avatars. Supported recipient types must be labeled clearly.

**Amount Entry**: large numeric input; currency selector if multi-currency; available balance below.

**Source**: selected account/card/balance source.

**Continue**: disabled until valid.

## 26. Transfer Review — Contract

Trusted financial confirmation surface. Show: recipient; avatar/identifier; amount; currency; source; fees; arrival estimate; network/rail if relevant.

CTA: "Confirm ₹5,000 transfer". Then authentication if required. No AI prose inside the confirmation body except a small informational explanation if needed.

## 27. Transfer Result — Contract

Success: check icon; "₹5,000 sent to Mom."; time; reference/status; Done; View transaction. Pending: pending icon; clear expectation. Failed: failed status; money state explanation when known; retry only if safe/idempotent.

## 28. AI Product Search — Screen Contract

May render inside Ask rather than a separate route.

**Query Summary**: compact line — "AirPods Pro · under ₹20,000 · genuine only".

**Product Result Carousel/List**: each ProductResultCard — 80–120px product image depending layout; product title max 2–3 lines; merchant; price; delivery; trust/seller metadata if verifiable; Select/Buy button. Do not place five tiny action buttons on each result.

**Comparison**: if user asks "which is best?", use a concise comparison surface showing the differences that matter to the user's criteria.

## 29. Food Search / Order — Screen Contract

Restaurant result: restaurant; ETA; delivery/fees; rating only when provided by trusted merchant data; key items.

Prepared Order Card: item names; quantities; modifiers; subtotal; fees; total/max; ETA. Actions: Edit order · Review checkout.

## 30. Protected Checkout — Screen Contract

This should be one of the most polished surfaces in the app.

**Header**: back; title "Purchase Review" or "Protected Checkout"; shield icon.

**Protection Banner**: subtle mint-tinted surface — "Protected Checkout". Supporting facts: merchant locked; maximum amount set; single use where applicable. Do not claim "price verified" or "safe" unless the system actually has verification data.

**Merchant/Product Card**: merchant; product image; product/order title; variant; price.

**Price Breakdown**: items; delivery; tax; fees; discounts; total.

**Delivery**: address summary; ETA; change action.

**Payment**: selected card/source; protected payment indicator.

**Authorization Rule**: prominently display "Maximum authorization: ₹19,100" with supporting "Charges above this amount will be blocked where supported."

**CTA**: full width mint button — "Confirm & Pay ₹18,999". Authentication follows.

## 31. Protected Checkout Processing — Contract

After confirmation, show discrete progression: Authorizing payment → Submitting order → Waiting for merchant confirmation. Do not use fake progress percentages. If merchant submission takes time, allow the user to leave and notify them when the trusted state changes.

## 32. Order Status — Screen Contract

Show: merchant; product/order summary; amount; current state; timeline; delivery/ETA; payment status; protected card state.

Actions vary by capability: Track; Receipt; Cancel; Return; Get help. Only show actions the merchant integration actually supports.

## 33. Custom Card Designer — Screen Contract

**Main Preview**: large payment-card preview centered; restrained Tilt Carousel/device motion only if it does not compromise accessibility.

**Customization Controls**: tabs or stacked options — Base · Accent · Pattern · Name/Monogram · Icon.

**Preview Rules**: always show design as a mock physical object, never with real full credentials.

**Order CTA**: "Review card order" — then show fees/shipping/terms as a normal financial confirmation.

## 34. Household Policies — Screen Contract

List policies as named cards: School Days · Vacation Mode · Weekend Allowance. Each shows: active/inactive; members affected; rule summary; expiry/schedule. Create button. AI field at top or creation screen: "Describe a household policy…" AI output remains a proposal until reviewed.

## 35. Security Center — Screen Contract

Sections: **Account Protection** (passkey/biometric status; PIN/passcode settings as product requires) · **Devices** (trusted devices; recent sign-ins) · **Cards** (frozen/lost cards shortcut) · **AI Security** (AI permissions; active automations if ever introduced) · **Security Activity** (recent sensitive actions).

Use calm language. Do not use alarming red throughout security settings.

## 36. AI & Automations Settings — Screen Contract

Group capabilities by authority. **AI Can Read**: my accounts/transactions; household data I am permitted to view. **AI Can Prepare**: transfers; card/rule changes; purchases. **AI Can Act Automatically**: keep disabled/absent in MVP unless explicitly approved.

If later enabled, each automation must show: what can happen; maximum amount; merchant/recipient scope; expiry; last run; disable control.

## 37. Profile / Settings — Screen Contract

Dark iOS-quality grouped list style. Top profile card: avatar; name; verification status. Groups: Personal · Household · Security · AI & Automations · Notifications · Appearance · Privacy · Support · Legal. Sign out sits separated at bottom.

Reacticx Settings V1 can inspire grouping but must be restyled to the product's tokens.

## 38. Onboarding — Design Contract

Keep onboarding concise and confidence-building.

**Welcome**: headline "Your money, one conversation away." Supporting line: "Cards, family controls, global money and AI — in one place." Primary: Get started. Secondary: Sign in.

**Account Creation**: minimal fields per step. **Identity**: explain why verification is needed before asking for documents. **Security Setup**: encourage passkey/biometric. **First Funding**: user can skip if product allows, but show benefits of funding. **First Card**: fast virtual card creation. **Family Prompt**: "Want to manage money with family?" — can skip. **AI Intro**: show three examples rather than a long tutorial.

## 39. Design Token Enforcement

All screens must use centralized design tokens for: color; spacing; radius; typography; motion; border widths; icon sizing. No screen-specific custom green shades unless promoted into a semantic/design token.

## 40. Component State Standard

Every reusable interactive component should define: default; pressed; focused where relevant; disabled; loading; error; selected. Financial components may additionally need: pending; frozen; approved; declined; expired.

## 41. Button System

**Primary**: mint fill, dark text — one dominant action per surface. **Secondary**: surface fill + border, primary text. **Tertiary**: text/icon button. **Destructive**: red emphasis only for destructive actions.

Rules: full-width primary buttons on confirmation screens; avoid two mint buttons side by side; loading buttons retain width and label context.

## 42. Badge System

Status badges: Active; Pending; Frozen; Approval needed; Expired; Failed. Use icon/text and semantic color. Keep badges small; never use badge styling for ordinary categories.

## 43. Progress Visualization

Use thin horizontal progress for budgets by default. Use circular progress sparingly for one high-level household summary if desired.

Threshold behavior: Normal → Mint; Near threshold → Warning; Limit exceeded/blocked → Error. Exact threshold percentages should be product-configurable rather than hard-coded into visual components.

## 44. Loading Visual Language

Use skeletons for lists/cards; spinner/loader for short command execution; shimmer only where short and subtle. Avoid animated gradient backgrounds while loading financial data.

AI may show small textual states: "Checking cards…", "Comparing options…", "Preparing checkout…" Do not expose internal chain-of-thought or agent reasoning.

## 45. Toasts

Use Toast for non-critical reversible/confirmation feedback: card frozen; rule updated; copied; saved. Do not use Toast as the only evidence of a transfer/purchase success — those require a receipt/result surface.

## 46. Dialogs

Reserve dialogs for very short destructive confirmation and session/security interruption. Use bottom sheet/full review for financial actions that need context.

## 47. Haptics

Light selection haptic: card carousel snap; segmented control. Success haptic: card freeze/unfreeze success; approval complete; financial action complete. Warning/error haptic sparingly. Respect accessibility/system preferences where available.

## 48. Copy Style Guide

**Voice**: calm; direct; human; no jargon unless user asks.

**Financial copy**: say "₹1,680 left this month." rather than "Remaining allocated spend capacity: ₹1,680." Say "Ask me before purchases over ₹1,000." rather than "Transaction authorization threshold enabled."

**AI copy**: short answers first; details available below. Avoid "Great question!", "Absolutely!" before every action, overly friendly banking copy during errors, moral judgments.

**Error copy formula**: what happened + money state + next safe action. Example: "Transfer wasn't sent. Your balance hasn't changed. Try again."

## 49. Date and Time Copy

Use relative time in lists when recent: Now · 4m · Today 3:42 PM · Yesterday. Use exact date/time in detail screens. Temporary financial rules must always include exact expiry on review, even if AI initially says "until Sunday."

## 50. Destructive Action Copy

Freeze: "Freeze card" — reversible. Report lost: "Report lost or stolen" — may permanently replace credentials. Close: "Close card" — destructive. Never use vague "Disable" for permanent termination.

## 51. Offline Banner

A subtle persistent banner when offline: "You're offline. Balances may be outdated." Do not block browsing cached content. Financial confirmation controls are disabled with explanation.

## 52. Privacy Indicators

When household context is visible in AI, users should be able to understand scope. Optional scope chip near Ask: Personal · Family. If user lacks family access, do not show Family as a selectable AI scope.

## 53. AI Context Transition

When user taps "Ask AI" from a member/card/transaction, open Ask with a small removable context chip: "Maya" · "Card •••• 8132" · "Swiggy ₹640". This tells the user what the assistant is currently referencing. The context chip is not permission — backend tools still validate access.

## 54. AI Clarification UI

If an action is ambiguous, AI should ask one concise question and preferably render valid options. Example: "Which Maya card?" — options: Everyday •••• 5588 · School •••• 2240. Do not force the user to type data that is already available as safe options.

## 55. Empty State Copy Examples

**Cards**: "No cards yet." "Create a personal, family or purpose card." CTA: Create card. **Family**: "Bring your household into one view." CTA: Add family member. **Activity**: "Your activity will appear here." **Approvals**: "You're all caught up." **Ask**: "Ask about spending, cards, family or shopping."

## 56. AI Failure Behavior

If the model fails but the backend action did not execute: never imply success; preserve the user's drafted intent where safe; offer Retry.

If backend action executed but AI response failed: fetch trusted action state; render the receipt from backend state; do not repeat execution.

## 57. Double-Tap and Retry Safety UX

On financial confirmation tap: immediately enter locked loading state; disable repeated submission; keep user-visible action details on screen. If network times out, query status before offering retry. User should never have to wonder whether tapping twice sent money twice.

## 58. Reacticx Mapping by Screen

**Ask**: Animated Input Bar; Chat V1 interaction ideas; Shimmer only for short tool loading; Bottom Sheet for contextual selectors.
**Cards**: Material Carousel; Matched Geometry; Rolling Counter; Flip Card selectively.
**Family**: Avatar Group; Progress; Animated Chip Group.
**Approvals**: Bottom Sheet Stack; Dialog only for simple destructive confirmation.
**Activity**: Tabs / Segmented Control; Animated Header ScrollView if it improves hierarchy without reducing performance.
**Receive**: QR Code.
**Card Designer**: Tilt Carousel / Scale Carousel selectively.
**Global**: Toast; Badge; Picker; Bottom Sheet; Squircle View if adopted consistently.

## 59. Motion Budget

Each screen should have at most one noticeable motion motif. Examples: Cards — carousel; Ask — composer/streaming; Family — progress updates; Checkout — sheet transition. Do not combine carousel tilt + particle glow + rolling counters + animated background on a single screen.

## 60. Dark Theme Rendering Rules

Avoid large flat pure-black empty areas by using slight tone layers. Do not place gray text below accessible contrast. Mint should occupy a small fraction of the screen. White text should be slightly softened rather than pure #FFFFFF everywhere. Product photos in commerce should sit on neutral/dark image containers with clear boundaries. Payment cards may use richer materials while the surrounding UI stays quiet.

## 61. Suggested First Prototype Data

Use realistic but fictional demo data.

Household: Owner Rohan · Maya · Arjun · Dad.
Cards: Personal · Maya Everyday · Subscriptions · Amazon Temporary.
Balance: total available equivalent (demo currency).
Family monthly budget: localized equivalent depending on demo currency.

Use one currency consistently within each individual flow unless demonstrating FX. Do not mix ₹ and $ randomly on the same screen without a clear reason.

## 62. Investor Demo Interaction Script

**Scene 1**: open Ask. AI insight: "Maya has ₹1,680 left this month. One purchase needs approval."

**Scene 2**: user types: "Approve it and give her another ₹1,000 for this weekend." AI shows two separate structured proposals: Approve Nike ₹1,420 once; Temporary +₹1,000 allowance until Sunday 11:59 PM. User confirms them distinctly.

**Scene 3**: switch to Cards. Temporary allowance reflected in Maya's card summary.

**Scene 4**: user returns to Ask: "Find genuine AirPods Pro under ₹20,000." Product result cards render.

**Scene 5**: select preferred product. Protected Checkout opens. Merchant lock + maximum authorization visible. User authenticates.

**Scene 6**: order succeeds. Temporary checkout card appears in Cards with Completed/Closed state. Activity shows both the family rule action and purchase.

This script should be usable as the first high-fidelity prototype acceptance flow.

## 63. Final UI Acceptance Checklist

A screen is not complete until all relevant answers are yes:

1. Does it have one clear purpose?
2. Is the primary action obvious?
3. Is money readable at a glance?
4. Is state understandable without relying on color?
5. Does it have loading, empty, error and offline behavior?
6. Are destructive actions separated?
7. Is AI output structured when action-oriented?
8. Does the user see exactly what will happen before execution?
9. Does the design feel calm rather than gamified?
10. Is it consistent with dark Obsidian tokens?
11. Does it use Reacticx only where interaction quality improves?
12. Does it remain functional with reduced motion?
13. Does it avoid exposing unnecessary crypto complexity?
14. Does it preserve user control even when AI is unavailable?

## 64. Final Design Statement

The UI should feel like a premium black payment card became an entire operating system: quiet black and graphite surfaces, unusually clear money typography, just enough mint to indicate intelligence and control, highly legible family spending states, and an AI composer that always feels one gesture away. The AI should make complicated financial workflows dramatically shorter, while trusted native review surfaces make every action more understandable than in a conventional neobank.
