# GhostWallet Onboarding — Chat Flow Spec

A complete, portable description of the chat-style onboarding flow: how it starts, how each message appears, how cards render, how the user progresses, every animation and timing constant, every state, and how it finishes and enters the main app.

Written so you can rebuild it in a different app without the original repo open. Section 11 carries the full source of every file involved.

---

## 1. What this is

**It is not a chatbot.** There is no LLM, no network call, no chat store, no streaming. It is a **local finite state machine rendered as a chat transcript**. Every "assistant message" is a hardcoded string appended to an array by a button handler. The typing indicator is a timer.

That is the whole trick, and it is why the flow is reliable: the conversation is scripted, so it can never go off-rails, but it *feels* conversational because messages arrive with typing delays and the user's own choices render as their own chat bubbles.

Two pieces of React state do all the work:

| State | Type | Role |
|---|---|---|
| `stage` | `Stage` — an 11-case discriminated union | Which interactive card is currently live. The "where am I" pointer. |
| `events` | `readonly ThreadEvent[]` — append-only | The visible transcript. User bubbles + assistant messages. Never mutated, only appended. |

Only the **last assistant event** is "active". It alone renders an interactive card. Every older assistant message is frozen — text only, no buttons. That's what makes the thread read as history.

### Dependencies

```
expo-router                      ~6.0    file-based routing, Stack, useRouter
react-native-reanimated          ~4.1    FadeIn / FadeInDown entering animations, shared values
react-native-safe-area-context   ~5.6    SafeAreaView, useSafeAreaInsets
react-native-gesture-handler     ~2.28   GestureHandlerRootView at the app root
nativewind                       ^4.2    Tailwind className on RN components
zustand                          ^5.0    wallet store (swap for your own state layer)
expo-clipboard                   ^8.0    copy the recovery phrase
bip39                            ^3.1    mnemonic generation (app-specific)
```

Reanimated v4 layout animations (`FadeIn`, `FadeInDown`) are the only animation library used for message/card entry. Everything else is `setTimeout`.

---

## 2. Route map & boot gate

```
app/
  _layout.tsx          root Stack — GestureHandlerRootView, fonts, theme
  index.tsx            BOOT GATE — splash, then redirect
  (auth)/
    _layout.tsx        auth Stack
    index.tsx          landing screen ("Get started")
    onboarding.tsx     the chat thread
  (tabs)/
    home.tsx           the main app
```

### The boot gate — `app/index.tsx`

Cold start shows an animated splash until **both** conditions hold: wallet hydration has resolved *and* the splash has had its minimum screen time. Then it redirects.

```tsx
export default function BootGate() {
  const hasAttempted = useWalletHasAttemptedLoad();
  const hasAccount = useWalletHasAccount();
  const [splashDone, setSplashDone] = useState(false);

  if (!hasAttempted || !splashDone) {
    return <SplashScreen onReady={() => setSplashDone(true)} />;
  }
  if (hasAccount) {
    return <Redirect href="/(tabs)/home" />;
  }
  return <Redirect href="/(auth)" />;
}
```

The `splashDone` latch matters: without it, a fast hydration makes the splash flash for one frame. The splash calls `onReady` when *it* is finished, so the minimum duration lives in the splash component, not the gate.

### The auth stack — `app/(auth)/_layout.tsx`

```tsx
<Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
  <Stack.Screen name="index" />
  <Stack.Screen
    name="onboarding"
    options={{
      animation: "fade",       // cross-fade landing → thread, not a push slide
      gestureEnabled: false,   // no back-swipe out of onboarding
    }}
  />
</Stack>
```

Two deliberate choices:

- `animation: "fade"` — the landing screen cross-dissolves into the thread. A horizontal push would read as "a new page"; the fade reads as "the same surface, transformed".
- `gestureEnabled: false` — you cannot swipe back to the landing screen mid-onboarding. This is load-bearing for the reset variant (below), where the landing screen was never on the stack in the first place.

### The two entry points — `app/(auth)/onboarding.tsx`

```tsx
export default function OnboardingRoute() {
  const router = useRouter();
  // `?mode=reset` arrives from resetToOnboarding() after the last account is
  // deleted. Anything else — including no param, which is how the landing
  // screen pushes this route — stays on the first-run flow.
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return (
    <OnboardingFlow
      onComplete={() => router.replace("/(tabs)/home")}
      variant={mode === "reset" ? "reset" : "fresh"}
    />
  );
}
```

`onComplete` is `router.replace` — **not** `push`. Replacing means the finished onboarding is gone from the stack; the user cannot back-swipe from Home into a completed thread.

### The reset path — `resetToOnboarding.ts`

When the user deletes their last account, there is no wallet left and every authenticated screen behind them is showing an empty account. This unwinds the whole stack first:

```ts
export function resetToOnboarding(router: Router): void {
  // Throws if there is nothing to dismiss (e.g. already at the stack root).
  if (router.canDismiss()) router.dismissAll();
  router.replace("/(auth)/onboarding?mode=reset");
}
```

`dismissAll()` before the replace is the part that matters. Settings is pushed onto the *root* stack, so a bare `replace("/(auth)")` from there swaps only `/settings` and leaves `(tabs)` underneath — a back-swipe would land on an account-less Home.

**Porting note:** if your app has only one entry into onboarding, drop the `variant` prop and `initial-thread.ts` entirely.

---

## 3. Landing screen

`OnboardingLandingScreen` — a static marketing screen with one button. Full-bleed mascot, headline, subtitle, CTA, footer.

**Copy** (`copy.ts`):

```ts
export const onboardingLandingCopy = {
  title: "your money,\nin the dark.",
  subtitle: "handled by local agents that never\nphone home.",
  footer: "leave no trace",
  threadLabel: "agent thread",
} as const;
```

Note the explicit `\n` — the line breaks are authored, not left to text wrapping. Lowercase throughout is a deliberate voice choice.

**Mascot sizing math.** The mascot is sized against both axes, then clamped, so it never overflows a narrow phone or looks lost on a tablet:

```tsx
const HORIZONTAL_PADDING = 24;
const GHOST_MAX = 540;
const GHOST_MIN = 336;
const GHOST_VIEWPORT_RATIO = 0.62;
const GHOST_TEXT_GAP = 24;
const GHOST_OFFSET_Y = 28;

const ghostSize = (() => {
  const widthBound = viewportWidth - HORIZONTAL_PADDING * 2;
  const heightBound = viewportHeight * GHOST_VIEWPORT_RATIO;
  return Math.min(GHOST_MAX, Math.max(GHOST_MIN, Math.min(widthBound, heightBound)));
})();
```

Read it inside-out: take the smaller of the two bounds, then floor at 336 and ceil at 540. The floor can exceed the width bound on a very narrow device — that's intentional, the mascot is allowed to bleed rather than shrink to nothing.

**Layout.** The mascot sits in a `flex: 1` block with `justifyContent: "flex-end"`, so it hugs the text block below regardless of screen height. `translateY: 28` nudges it down optically. Text and CTA are fixed-height blocks at the bottom.

**Entry.** The whole screen fades in over `landingFadeMs: 480`. Nothing staggers — it is one surface.

**CTA.** `OnboardingGetStartedButton` — a 56px pill, `borderRadius: 999`, accent background. Press feedback is two-layer: a Reanimated `scale` to `0.985` over 70 ms in, back to `1` over 110 ms out, plus a plain `opacity: 0.92` from Pressable's `pressed` state. The asymmetric in/out durations (fast press, slower release) are what make it feel physical rather than mechanical.

---

## 4. The two state atoms

### `Stage` — where am I

```ts
export type Stage =
  | { readonly kind: "referral-question" }
  | { readonly kind: "referral-code"; readonly status: "idle" | "valid" }
  | { readonly kind: "welcome" }
  | { readonly kind: "import-choose" }
  | { readonly kind: "warning" }
  | { readonly kind: "generating"; readonly label?: string; readonly meta?: string }
  | { readonly kind: "recovery"; readonly mnemonic: string }
  | {
      readonly kind: "verify";
      readonly mnemonic: string;
      readonly challenge: VerifyChallenge;
      readonly roundIndex: number;
      readonly attempts: readonly string[];
      readonly options: readonly QuizOption[];
      readonly correctId: string;
      readonly selectedId: string | null;
      readonly result: "pending" | "correct" | "incorrect" | "expired";
    }
  | { readonly kind: "import.mnemonic" }
  | { readonly kind: "import.privatekey" }
  | { readonly kind: "ready"; readonly importedBackend: boolean };
```

Everything a stage needs to render lives *in* the stage. `verify` carries the mnemonic, the challenge, the round index, the shuffled options, and the answer state — so `StageInline` is a pure function of `stage` with no side lookups.

### `ThreadEvent` — what's on screen

```ts
export type ThreadEventVariant =
  | "referral" | "referral-applied" | "greet" | "import-choose" | "warning"
  | "generating" | "recovery" | "verify" | "import-mnemonic"
  | "import-privatekey" | "ready";

export type ThreadEvent =
  | { readonly kind: "user"; readonly id: string; readonly label: string }
  | {
      readonly kind: "assistant";
      readonly id: string;
      readonly variant: ThreadEventVariant;
      readonly text?: string;
    };
```

`variant` is *not* the same as `stage.kind`, even though they overlap. `variant` describes the message for **presentation** purposes (mainly: "is this a process step?"), while `stage.kind` drives the card. They're kept separate because a single stage can be reached from several messages.

### Append-only, with stable IDs

```ts
let eventCounter = 0;
function makeEventId(prefix: string): string {
  eventCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${eventCounter}`;
}

function appendEvents(...next: ThreadEvent[]) {
  setEvents((prev) => [...prev, ...next]);
}
```

The counter is module-scope, so IDs stay unique even if two events are created inside the same millisecond. The prefix (`"u"`, `"greet"`, `"verify"`, …) is purely for debugging.

Events are **never** removed or edited. Every transition appends. This is what lets React keep every message mounted with a stable `key` and never re-run an entry animation.

### The "active assistant" rule

```ts
const activeAssistantId = (() => {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!;
    if (ev.kind === "assistant") return ev.id;
  }
  return null;
})();
```

The last assistant message in the array. In the render loop:

```tsx
const isActive = ev.id === activeAssistantId;
const phase = isActive ? presentation.getPhase(ev.id) : "actions";
const showContent = !isActive || shouldShowPresentationContent(phase);
const showActions = isActive && shouldShowStageActions(phase, ev);
```

Non-active messages short-circuit to `phase: "actions"` and `showContent: true` — fully revealed, instantly, no animation, no card. Only `isActive && showContent` renders `<StageInline>`.

**This is the single most important structural idea in the flow.** One card on screen at a time, always at the bottom, always belonging to the newest message.

---

## 5. Full stage-transition table

`fresh` starts at `referral-question`. `reset` starts at `welcome` (`initial-thread.ts`):

```ts
export function initialThreadFor(variant: OnboardingVariant): InitialThread {
  if (variant === "reset") {
    return {
      stage: { kind: "welcome" },
      assistant: { variant: "greet", text: "Ready to start again?" },
    };
  }
  return {
    stage: { kind: "referral-question" },
    assistant: { variant: "referral", text: "Do you have a referral code?" },
  };
}
```

Kept as a pure function rather than a branch inside `OnboardingFlow` so both variants' copy is unit-testable — a change to the reset greeting must not be able to silently alter first-run onboarding.

| From stage | Trigger | Events appended | → To stage |
|---|---|---|---|
| *(mount, fresh)* | — | assistant `referral` "Do you have a referral code?" | `referral-question` |
| *(mount, reset)* | — | assistant `greet` "Ready to start again?" | `welcome` |
| `referral-question` | "I have" button / types `yes`, `have`… | user bubble, assistant `referral` "What's your referral code?" | `referral-code` (idle) |
| `referral-question` | "I don't have" / `no`, `skip`, `none` | user bubble | `welcome` (via `pushWelcome`) |
| `referral-question` | types anything ≥3 chars | *(treated as the code itself)* | → `confirm-referral-code` |
| `referral-code` (idle) | submits code ≥3 chars | user bubble (the code), assistant `referral-applied` `Code "X" applied.` | `referral-code` (valid) |
| `referral-code` (idle) | code <3 chars | *(none — inline error only)* | unchanged |
| `referral-code` (valid) | **700 ms timer** | assistant `greet` "Let's get started" | `welcome` |
| `welcome` | "Create a new wallet" card | user bubble, assistant `warning` "Write these 12 words down once" | `warning` |
| `welcome` | "Import existing wallet" card | user bubble, assistant `import-choose` "How do you want to import?" | `import-choose` |
| `welcome` | "Connect Seeker" card | user bubble | *unchanged* + native alert "not available in this build" |
| `import-choose` | "Recovery phrase" card | user bubble, assistant `import-mnemonic` "Paste your phrase below" | `import.mnemonic` |
| `import-choose` | "Private key" card | user bubble, assistant `import-privatekey` "Paste your private key" | `import.privatekey` |
| `warning` | "Cancel" | user bubble, assistant `greet` "No problem. Pick again when you're ready." | `welcome` |
| `warning` | "I understand" | user bubble, assistant `generating` "Generating your recovery phrase…" | `generating` → then `recovery` |
| `generating` | *(sync — `generateMnemonic()` returns)* | assistant `recovery` "Your recovery phrase" | `recovery` |
| `recovery` | "I've saved it" | user bubble, assistant `verify` `Word #N` | `verify` (round 0) |
| `verify` | taps correct option | user bubble (the word) | after **650 ms** → next round, or `generating` |
| `verify` | taps wrong option | user bubble (the word) | after **1400 ms** → same round, reset to `pending` |
| `verify` | 42 s timer expires | *(none)* | `result: "expired"`, after **850 ms** → advance with `null` |
| `verify` (last round, all correct) | — | assistant `generating` "Securing your wallet…", then assistant `ready` "Confirmed. Your wallet is ready." | `ready` (`importedBackend: false`) |
| `import.mnemonic` | submits phrase | user bubble (masked), assistant `ready` "Imported. Welcome back." | `ready` (`importedBackend: true`) |
| `import.privatekey` | submits key | user bubble `•••••••••••••`, assistant `ready` "Imported. Welcome back." | `ready` (`importedBackend: true`) |
| `ready` | "Continue" button / types `continue`, `go`, `done`… | — | **`onComplete()` → `router.replace("/(tabs)/home")`** |

### Notes on specific transitions

**The referral→welcome delay.** After a code is accepted, the flow does *not* jump straight to the wallet cards. It shows the "applied" confirmation, waits 700 ms, then pushes the greet message. The pause is what makes the confirmation readable:

```ts
referralWelcomeTimerRef.current = setTimeout(() => {
  referralWelcomeTimerRef.current = null;
  if (!mountedRef.current) return;
  pushWelcome();
}, onboardingMotion.referralWelcomeDelayMs);
```

**Masking the user's own input.** A pasted recovery phrase must not sit in the transcript in plaintext:

```ts
function maskMnemonic(phrase: string): string {
  const words = phrase.trim().split(/\s+/u);
  if (words.length === 0) return "";
  if (words.length === 1) return "•••••••";
  return `${words[0]} … ${words[words.length - 1]} · ${words.length} words`;
}
```

First word, last word, count — enough to confirm you pasted the right thing, not enough to be a leak in a screenshot. Private keys get no such courtesy: the bubble is a flat `"•••••••••••••"`.

**Seeker is a stub.** `handlePickConnectSeeker` appends the user bubble, then fires a native alert. The stage does not change, so the `welcome` cards stay live and the user can pick again. This is a good pattern for "coming soon" options — the choice is acknowledged in the transcript, then nothing moves.

---

## 6. Message lifecycle & animation

This is the part that makes it feel like a chat.

### Three phases

```ts
export type PresentationPhase = "typing" | "text" | "actions";
```

Every *active* assistant message walks `typing → text → actions` on timers. `useThreadPresentation` owns this:

```ts
const isProcessStep = isProcessAssistantEvent(activeAssistantEvent);
const isFirst = activeAssistantId === firstAssistantId;

const typingMs = isProcessStep
  ? 0
  : isFirst
    ? onboardingMotion.assistantFirstTypingMs   // 1000
    : onboardingMotion.assistantTypingMs;       // 800

const textHoldMs = isProcessStep
  ? onboardingMotion.processTextRevealMs        // 280
  : onboardingMotion.assistantTextHoldMs;       // 300

schedule("typing", 0);
schedule("text", typingMs);
schedule("actions", typingMs + textHoldMs);
```

So a normal message: dots for 800 ms → text appears → 300 ms beat → card slides up. The **first** message gets 1000 ms instead of 800 — a slightly longer opening pause, because the screen just faded in and there is nothing else to read.

A **process** message (`variant: "generating"`) skips typing entirely (`typingMs: 0`) and shows its spinner pill at 280 ms. You don't want a typing indicator in front of "Generating your recovery phrase…" — the spinner *is* the indicator.

### The render truth table

```ts
export function shouldShowPresentationContent(phase: PresentationPhase): boolean {
  return phase === "typing" || phase === "text" || phase === "actions";
}

export function shouldShowStageActions<V extends string>(
  phase: PresentationPhase,
  event?: ThreadEventLike<V> | null,
): boolean {
  if (isProcessAssistantEvent(event)) {
    return phase === "text" || phase === "actions";
  }
  return phase === "actions";
}
```

`shouldShowPresentationContent` returns `true` for all three phases — it exists as a named seam, not a filter. The real gate is `shouldShowStageActions`, and the process-step branch is why the spinner appears one phase early.

| Phase | Normal message | Process message |
|---|---|---|
| `typing` | `<TypingIndicator/>` | text (no dots) |
| `text` | text | text **+ spinner pill** |
| `actions` | text **+ card** | text + spinner pill |

### What actually renders

```tsx
{isActive && phase === "typing" && ev.variant !== "generating" ? (
  <TypingIndicator />
) : ev.variant === "verify" ? null : ev.text ? (
  <Body className="text-text" style={{ fontSize: 17, lineHeight: 24 }}>
    {ev.text}
  </Body>
) : (
  <TypingIndicator />
)}
```

Three things worth noting:

1. **`verify` messages render no text at all.** The event carries `text: "Word #7"`, but the branch returns `null` — because `VerificationQuizCard` already shows `WORD #07` in its own header. The text is stored anyway so the transcript stays self-describing in logs.
2. **A message with no `text` falls through to a permanent `TypingIndicator`.** That's the "still thinking" state; nothing in this flow uses it, but it's the graceful degradation if you append an assistant event without copy.
3. Body text is `17px / 24` — deliberately larger than the 15px used in cards, so the conversation reads as the primary voice and cards read as attachments.

### Freezing old messages

```ts
useEffect(() => {
  setPhases((prev) => {
    let changed = false;
    const next = { ...prev };
    for (const ev of events) {
      if (ev.kind === "assistant" && ev.id !== activeAssistantId && next[ev.id] !== "actions") {
        next[ev.id] = "actions";
        changed = true;
      }
    }
    return changed ? next : prev;
  });
}, [events, activeAssistantId]);
```

The moment a new assistant message arrives, the previous one is force-set to `actions`. If its typing timer was still mid-flight, the timer cleanup in the other effect kills it. Old messages never animate again.

The `changed` flag returning `prev` unchanged is a real optimization here — this effect runs on every `events` change, and without it every append would produce a new `phases` object and re-render the whole thread.

### Full timing table

```ts
export const onboardingMotion = {
  assistantFirstTypingMs: 1000,
  assistantTypingMs: 800,
  assistantTextHoldMs: 300,
  processMinVisibleMs: 2800,
  processSpinnerMs: 2000,
  processTextRevealMs: 280,
  cardEnterMs: 640,
  staggerCardStepMs: 150,
  threadContentFadeMs: 320,
  errorFadeMs: 220,
  headerEnterMs: 320,
  headerExitMs: 220,
  landingFadeMs: 480,
  scrollToEndDelayMs: 80,
  referralWelcomeDelayMs: 700,
  verifyFeedback: {
    correctAdvanceMs: 650,
    expireAdvanceMs: 850,
    wrongResetMs: 1400,
  },
} as const;
```

| Constant | ms | Controls |
|---|---|---|
| `assistantFirstTypingMs` | 1000 | Typing dots before the **first** assistant message. |
| `assistantTypingMs` | 800 | Typing dots before every subsequent message. |
| `assistantTextHoldMs` | 300 | Beat between text appearing and its card sliding up. |
| `processMinVisibleMs` | 2800 | Minimum time the "Securing wallet" spinner stays up, even if the write finished instantly. |
| `processSpinnerMs` | 2000 | One full rotation of the `GeneratingPill` ring. |
| `processTextRevealMs` | 280 | Delay before a process pill appears (replaces `assistantTextHoldMs` for process steps). |
| `cardEnterMs` | 640 | `FadeInDown` duration for every card. |
| `staggerCardStepMs` | 150 | Gap between stacked cards in a group (`welcome` has 3 → 0 / 150 / 300). |
| `threadContentFadeMs` | 320 | `FadeIn` on the assistant text block itself. |
| `errorFadeMs` | 220 | `FadeIn` on the inline error chip. |
| `headerEnterMs` / `headerExitMs` | 320 / 220 | "Onboarding / agent thread" header appearing once the thread starts. |
| `landingFadeMs` | 480 | Landing screen fade-in. |
| `scrollToEndDelayMs` | 80 | *(declared; auto-scroll is driven by content-size change instead)* |
| `referralWelcomeDelayMs` | 700 | Pause after "code applied" before the welcome message. |
| `verifyFeedback.correctAdvanceMs` | 650 | Green flash on the correct answer before advancing. |
| `verifyFeedback.expireAdvanceMs` | 850 | Pause after the timer runs out before advancing. |
| `verifyFeedback.wrongResetMs` | 1400 | Red flash on a wrong answer before re-enabling the round. |

**The shape of this table is the design.** Fast entries (220–320) for things that must not delay the user; medium (640–800) for things being introduced; long (1400–2800) for things being absorbed. If you port one thing from this document, port this file.

### The `processMinVisibleMs` floor

```ts
await importMnemonic(verifyStage.mnemonic);
await wait(walletFinalizeProcess.minVisibleMs);   // 2800
```

The wallet write usually completes in a few ms. Without the floor, the "Securing your wallet…" pill would flash and vanish, which reads as a glitch rather than as work. The floor is applied *after* the await, so slow devices are not penalized twice — total time is `max(actual, 2800)`… well, actually `actual + 2800`. That's a real quirk worth knowing if you copy it: on a slow write you get both durations. If you want a true floor, race the promise against the timer instead.

### The header

```tsx
const threadStarted = events.some((ev) => ev.kind === "user");
```

The "Onboarding / agent thread" header only appears once the user has said something. Before that the thread is a single centered message with generous top padding:

```tsx
const initialThreadTopPadding = Math.round(
  Math.min(56, Math.max(28, viewportHeight * 0.045)),
);
contentContainerStyle={{ paddingTop: threadStarted ? 16 : initialThreadTopPadding }}
```

4.5% of viewport height, clamped to 28–56. Once the conversation starts it collapses to a flat 16 and the header fades in. The first screen breathes; the working screen is dense.

---

## 7. Card rendering

`StageInline` is a pure `stage.kind` switch. It bails immediately if actions aren't due yet:

```tsx
if (!showActions) return null;
```

### The stagger primitive

```tsx
function StaggeredCard({ delay, children }: { delay: number; children: React.ReactNode }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(onboardingMotion.cardEnterMs)}
      style={{ width: "100%" }}
    >
      {children}
    </Animated.View>
  );
}
```

Used with `delay={0}`, `delay={150}`, `delay={300}` — i.e. `staggerCardStepMs * index`. `FadeInDown` means the card fades in *while* translating down from above, so a stack of three cascades.

### Per-stage inventory

| Stage | Renders | Layout |
|---|---|---|
| `referral-question` | 2 × `GhostActionButton` ("I have" primary, "I don't have" secondary) | `flex-row flex-wrap`, `columnGap/rowGap: 10`, `size="comfortable"` (52px) |
| `referral-code` (valid) | `StatusPill` "Referral code applied" / meta `ADDED` / tone success | — |
| `referral-code` (idle, error) | `StatusPill` with the error / meta `TRY AGAIN` / tone error | — |
| `referral-code` (idle, no error) | `null` — the command bar *is* the UI | autofocused input |
| `welcome` | 3 × `IntentOptionCard` in `StaggeredCard` | `rowGap: 16`, variants primary / default / accent |
| `import-choose` | 2 × `IntentOptionCard` in `StaggeredCard` | `rowGap: 16`, variants primary / accent |
| `warning` | `WarningStatusPill` + 2 buttons in a row | `rowGap: 10`, buttons `flex-1` each |
| `generating` | `GeneratingPill` (spinning ring + label + meta) | self-start pill |
| `recovery` | `RecoveryRevealGate` wrapping `SeedPhraseCard` | tap-to-reveal overlay |
| `verify` | `VerificationQuizCard` inside `FadeInDown` | `marginTop: 8` |
| `ready` | `WalletAccountSummaryCard` + "Continue" button | `maxWidth: 342`, `rowGap: 16` |

### `IntentOptionCard` variants

Three visual tiers, all the same 66px-min-height row (icon disc → title/subtitle → chevron):

- **`primary`** — inverted. Background `floatingPillBg` (white in dark mode, near-black in light), text `floatingPillText`. Flat, no shadow. This is the recommended action.
- **`default`** — `surfaceCard` on `borderStrong`, elevated (iOS shadow 0.22/10, Android elevation 3).
- **`accent`** — `surfaceCard` with a purple `onboardingAccentBorder`, purple icon and subtitle. Elevated. Used for the "special" option (Seeker, private key).

The inversion on `primary` is what carries the hierarchy — the eye lands on the high-contrast block before it reads any text.

### `RecoveryRevealGate` — tap to reveal

The seed card renders *underneath* an absolutely-positioned scrim. The card is fully laid out but masked; the overlay carries an eye-off icon, "Tap to reveal", and "Your phrase stays on this device".

```tsx
if (revealed) {
  return <View style={{ marginTop: 8 }}>{children({ revealed: true, maskValues: false })}</View>;
}
return (
  <View style={{ marginTop: 8 }}>
    <View style={{ position: "relative" }}>
      {children({ revealed: false, maskValues: true })}
      <Pressable onPress={() => setRevealed(true)} style={{ position: "absolute", inset..., backgroundColor: colors.backdrop }}>
        …
      </Pressable>
    </View>
  </View>
);
```

Render-prop, not a boolean prop, so the gate owns the reveal state and the card stays presentational. Masked words render as `"•".repeat(clamp(word.length, 4, 8))` — variable-width dots, so the masked grid has the same visual texture as the real one and there's no layout jump on reveal.

One-way: once revealed, there is no re-hide. `SeedPhraseCard` *does* support a mask toggle (`onVisibilityChange`), but onboarding doesn't pass it, so the toggle row never renders.

### `SeedPhraseCard` grid

Always 4 rows × 3 columns = 12 slots, padded with blank chips if fewer words. Each chip is a 30px pill: two-digit mono index (`01`…`12`) at 9px + the word at 11px/500. Two actions below: "Copy" (secondary, becomes "Copied" for 1600 ms) and "I've saved it" (primary, becomes "Saved" for 1600 ms).

The fixed grid means the card's height never depends on content — important, because the thread auto-scrolls on content-size change and a variable-height card would fight it.

---

## 8. The verify quiz

The most intricate part of the flow. Three rounds, a 42-second timer, and a retry loop that will not let you through until every slot is right.

### Building the challenge

```ts
const CHALLENGE_COUNT = 3;

export function pickVerifyChallenge(words: readonly string[]): VerifyChallenge {
  if (words.length !== 12) throw new Error(`… got ${words.length}`);
  const indices = pickDistinctIndices(words.length, CHALLENGE_COUNT);
  return {
    positions: indices.map((i) => i + 1),        // 1-based, for display
    expected: indices.map((i) => normalizeQuizWord(words[i]!)),
  };
}
```

`pickDistinctIndices` does a Fisher-Yates shuffle, takes 3, then **sorts ascending** — so you're always asked for word 2 before word 9, never backwards. Small thing, big effect on how orderly it feels.

### Building one round's options

```ts
export function pickQuizOptions(words: readonly string[], position: number): readonly string[] {
  const correct = normalizeQuizWord(words[position - 1]!);
  const distractorPool = words
    .map((w, i) => ({ word: normalizeQuizWord(w), index: i }))
    .filter((entry) => entry.index !== targetIndex && entry.word !== correct);
  // shuffle, take 3 unique distractors, then shuffle correct+distractors together
}
```

**Distractors come from the user's own phrase.** Not a dictionary. This is the important design decision: it means you can't pass by recognizing "which of these four words looks like a BIP-39 word" — every option is one of *your* twelve. You have to actually know position 7.

The `entry.word !== correct` filter handles duplicate words in a mnemonic (rare but legal). The double shuffle (pool, then final) means the correct answer's index is uniform.

4 options total, rendered 2×2.

### Advancing — the retry loop

```ts
export function advanceVerifyRound(stage, answer: string | null): Stage {
  const slotCount = stage.challenge.expected.length;      // 3
  const wasInitialPass = stage.attempts.length < slotCount;
  const attempts = [...stage.attempts];
  while (attempts.length <= stage.roundIndex) attempts.push("");
  if (answer !== null) attempts[stage.roundIndex] = answer;

  const nextRound = stage.roundIndex + 1;
  if (wasInitialPass && nextRound < slotCount) {
    return buildVerifyRoundStage(stage.mnemonic, stage.challenge, nextRound, attempts);
  }

  if (isVerifyComplete(stage.challenge, attempts)) {
    return { kind: "ready", importedBackend: false };
  }

  const retryIndex = stage.challenge.expected.findIndex(
    (word, i) => attempts[i]?.toLowerCase().trim() !== word,
  );
  return buildVerifyRoundStage(stage.mnemonic, stage.challenge, retryIndex >= 0 ? retryIndex : 0, attempts);
}
```

Two distinct passes:

1. **Initial pass** (`attempts.length < 3`): walk rounds 0 → 1 → 2 in order, recording whatever was answered — including a blank `""` for an expired timer. Never stops early.
2. **Retry pass**: once all three slots have been attempted, check completeness. If any slot is wrong, jump to the *first* wrong slot and re-ask it — with freshly shuffled options, since `buildVerifyRoundStage` re-runs `pickQuizOptions`.

So the user always sees all three questions before being told they failed, then re-answers only the ones they got wrong, one at a time, until `isVerifyComplete` passes. There is no "you failed, start over".

`answer === null` (timer expiry) leaves the slot as `""`, which can never match, so it's guaranteed to come back around in the retry pass.

### The three feedback timings

```ts
// correct
verifyAdvanceTimerRef.current = setTimeout(() => {
  void finishVerifyAdvance(answeredStage, selected.label);
}, VERIFY_CORRECT_ADVANCE_MS);            // 650

// wrong
setError("Wrong word. Try another option.");
verifyAdvanceTimerRef.current = setTimeout(() => {
  setStage((later) =>
    later.kind === "verify" && later.result === "incorrect"
      ? { ...later, selectedId: null, result: "pending" }
      : later,
  );
}, VERIFY_WRONG_RESET_MS);                // 1400

// expired
verifyAdvanceTimerRef.current = setTimeout(() => {
  const current = verifyStageRef.current;
  if (current.kind !== "verify" || current.result !== "expired") return;
  void finishVerifyAdvanceRef.current(current, null);
}, VERIFY_EXPIRE_ADVANCE_MS);             // 850
```

Correct is fastest (650) — you were right, keep moving. Wrong is slowest (1400) — sit with it, look at the red border, then the round unlocks in place with the *same* options so you can pick again without re-reading. Expired sits between (850).

Note the wrong path returns to `pending` on the **same round with the same options** — a wrong tap is not an attempt, it just doesn't advance. Only the timer or a correct answer moves you on.

### The remount key

```tsx
export function verifyQuizResetKey(stage): string {
  return `${stage.roundIndex}-${position}-${stage.correctId}`;
}
```

```tsx
<VerifyStageContent key={`verify-${verifyTimerResetKey}`} … />
```

Changing the `key` **unmounts and remounts** the whole card, which is how the 42-second countdown resets between rounds. Including `correctId` in the key means a retry of the *same* position with reshuffled options also remounts — otherwise the timer would carry over from the first attempt.

### The timer hook

```ts
useEffect(() => {
  if (!enabled) return;
  let remaining = VERIFY_QUIZ_DURATION_SEC;   // 42
  let expired = false;
  setSecondsLeft(remaining);

  const id = setInterval(() => {
    remaining -= 1;
    setSecondsLeft(remaining);
    if (remaining <= 0) {
      clearInterval(id);
      if (!expired) { expired = true; onExpireRef.current(); }
    }
  }, 1000);

  return () => clearInterval(id);
}, [enabled, resetKey]);
```

Two deliberate details:

- **`remaining` is a closure variable, not the React state.** If the countdown read `secondsLeft` from state, a new round could inherit `0` from the previous round's last render and fire `onExpire` immediately. The closure counter is re-initialized every time the effect runs.
- **`onExpire` is held in a ref** (`onExpireRef`, updated in an unconditional effect) so the interval effect doesn't re-subscribe — and restart the countdown — every time the parent re-renders with a new callback identity.

`shouldRunVerifyTimer` keeps it running through `pending` **and** `incorrect`, so a wrong answer doesn't buy you free time.

### Card visuals

`VerificationQuizCard`: `maxWidth: 300`, self-start, `surfaceCard` on `border`. Header row is `WORD #07` in uppercase mono on the left and a timer pill on the right (clock icon + `MM:SS`, both flipping to `accentNegative` when expired). Below, a 2×2 grid of 40px full-radius option pills.

Option states:

| State | Background | Border | Label |
|---|---|---|---|
| unselected | `surfaceFocused` | none | `text`, weight 400 |
| selected, pending | `accent` | none | `textInverse`, weight 600, + check icon |
| selected, correct | `slideFillComplete` | `accentPositive` 1px | `text`, + green check |
| selected, incorrect | `surfaceStrong` | `accentNegative` 1px | `text` |
| disabled, unselected | as unselected | — | `opacity: 0.55` |

Labels use `adjustsFontSizeToFit` with `minimumFontScale: 0.85` and `numberOfLines={1}` — BIP-39 words run up to 8 characters and the pills are fixed-width halves, so long words shrink rather than truncate.

---

## 9. Typed-input routing

Every tap has a typed equivalent. `resolveOnboardingCommandInput(stage, input)` maps free text to the same action kinds the buttons fire.

```ts
export type OnboardingCommandAction =
  | { kind: "referral-have-code" }      | { kind: "referral-skip" }
  | { kind: "confirm-referral-code"; code: string }
  | { kind: "create-wallet" }           | { kind: "import-existing" }
  | { kind: "connect-seeker" }
  | { kind: "import-mnemonic" }         | { kind: "import-private-key" }
  | { kind: "warning-continue" }        | { kind: "warning-cancel" }
  | { kind: "recovery-saved" }
  | { kind: "verify-answer"; optionId: string }
  | { kind: "import-mnemonic-submit"; phrase: string }
  | { kind: "import-private-key-submit"; key: string }
  | { kind: "ready-continue" }          | { kind: "invalid" };
```

### Normalization

```ts
export function normalizeCommandInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gu, " ")   // punctuation → space
    .replace(/\s+/gu, " ")
    .trim();
}
```

Stripping punctuation to spaces is why the synonym sets contain entries like `"i don t have"` and `"i ve saved it"` — the apostrophe in "don't" becomes a space, so `"I don't have"` normalizes to `"i don t have"`. If you copy the sets, keep those apostrophe-split variants.

### Matching strategy, in order of strictness

1. **Exact set membership** — `WARNING_CONTINUE.has(normalized)`. Used where a false positive would be costly.
2. **Exact-or-substring** — `matchesExactOrPhrase(normalized, SET, ["create a new wallet", …])`, which also accepts `normalized.includes(phrase)`.
3. **Semantic predicate** — e.g.

```ts
function mentionsCreateWallet(n: string): boolean {
  return n.includes("create") && (n.includes("wallet") || n.includes("new"));
}
function mentionsImportExisting(n: string): boolean {
  return n.includes("import") || n.includes("restore") ||
         (n.includes("existing") && n.includes("wallet"));
}
```

This catches "can you create a wallet for me" without listing it.

### Stage-specific quirks

- **`referral-question`**: if the input isn't a yes/no synonym but is ≥3 characters, it's assumed to *be* the code — so typing `GHOST99` at the question skips the "what's your code?" step entirely.
- **`referral-code` (idle)**: anything that isn't a skip synonym is the code. No validation beyond length ≥3.
- **`verify`**: matches the typed word against the *current round's option labels* (normalized both sides) and returns that option's `id`. Typing the right word is identical to tapping it. Returns `invalid` unless `result` is `pending` or `incorrect` — you can't type ahead during the feedback pause.
- **`import.mnemonic` / `import.privatekey`**: **no matching at all** — the entire trimmed input is the payload. These stages are pure text entry.
- **`ready`**: exact set only (`continue`, `done`, `enter`, `go`, `home`, `open wallet`, `finish`).

Unmatched input sets an inline error: `"Couldn't understand that. Try an option above or rephrase."` The stage never changes on `invalid`.

### The command bar adapts per stage

```tsx
function resolveCommandPlaceholder(stage: Stage): string {
  if (isReferralCodeEntry(stage)) return "enter referral code...";
  if (stage.kind === "import.mnemonic") return "paste 12 or 24 word phrase...";
  if (stage.kind === "import.privatekey") return "paste private key...";
  return "tap an option above...";
}
```

```tsx
<CommandPrompt
  autoFocus={referralEntry}                          // only the referral input steals focus
  disabled={busy || stage.kind === "generating"}     // locked during async work
  inputProps={
    stage.kind === "import.privatekey"
      ? { secureTextEntry: true, textContentType: "password", autoComplete: "off" }
      : stage.kind === "import.mnemonic"
        ? { multiline: true }
        : referralEntry
          ? { autoCapitalize: "characters" }
          : undefined
  }
  …
/>
```

The private-key branch is a security hardening: `secureTextEntry` + `textContentType: "password"` + `autoComplete: "off"` keeps the key out of the keyboard's learned-words dictionary and off the autofill surface. `CommandPrompt` also defaults `autoCorrect: false` and `autoCapitalize: "none"` for every stage.

The default placeholder — `"tap an option above..."` — is honest: on card stages the bar is a fallback, not the primary path.

---

## 10. Layout shell & keyboard

### `CommandThreadShell`

The frame every stage renders inside: `SafeAreaView` → `ScrollView` (full height) → absolutely-positioned floating command bar → optional overlay.

```tsx
<SafeAreaView edges={edges} className="flex-1 bg-bg">
  <View style={{ flex: 1 }}>
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      bounces={false}
      contentContainerStyle={mergedContentStyle}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...scrollViewProps}
    >
      {children}
    </ScrollView>
    {overlay}
    {/* Absolutely positioned so the scroll view fills the full height behind it. */}
    <Animated.View pointerEvents="box-none" style={[{ position: "absolute", left, right, bottom: restingBottom, alignItems: "center" }, barAnimatedStyle]}>
      {commandBar}
    </Animated.View>
  </View>
</SafeAreaView>
```

- `keyboardShouldPersistTaps="handled"` — you can tap a card while the keyboard is open without a throwaway dismiss tap.
- `keyboardDismissMode="interactive"` — drag down to dismiss.
- `bounces={false}` — the thread is a document, not a feed.
- `pointerEvents="box-none"` on the bar wrapper so the padding around the bar doesn't eat taps meant for the thread.

### The layout math

```ts
export const COMMAND_BAR_HEIGHT = 60;
export const COMMAND_BAR_KEYBOARD_GAP = 16;
export const COMMAND_BAR_MIN_BOTTOM = -16;
export const COMMAND_BAR_SCROLL_EXTRA = 16;
export const COMMAND_BAR_MAX_WIDTH = 520;
export const NARROW_VIEWPORT_BREAKPOINT = 360;

export function resolveHorizontalInset(w: number): number {
  return w <= NARROW_VIEWPORT_BREAKPOINT ? 16 : 20;
}

export function resolveCommandBarRestingBottom(safeAreaBottom: number): number {
  return Math.max(safeAreaBottom + COMMAND_BAR_MIN_BOTTOM, 16);
}

export function resolveThreadScrollPaddingBottom(offset: number): number {
  return offset + COMMAND_BAR_HEIGHT + COMMAND_BAR_SCROLL_EXTRA;
}
```

`resolveCommandBarRestingBottom` reads oddly until you work it: on a notched phone (`safeAreaBottom: 34`) it yields `18`; on a zero-inset device (iPhone SE, Android 3-button nav) the `Math.max` floor gives `16`. So the bar tucks *into* the home-indicator area rather than floating above it, while never falling off a device that has no inset.

`resolveThreadScrollPaddingBottom` = 60 + 16 + wherever the bar is, which is why content can always scroll clear of the bar.

### Keyboard lift

Two hooks, deliberately separate:

- **`useCommandBarKeyboardOffset`** — drives the bar on the **UI thread**. It animates `translateY` off a *static* `bottom`, so the thread behind it never re-layouts while the keyboard slides.
- **`useKeyboardHeight`** — JS-side height, used only for scroll padding, where a frame of lag is invisible.

```ts
const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
```

iOS `will*` events carry the real animation duration (`event.duration`), so the bar slides *exactly* with the keyboard. Android has no `will*` pair, so `did*` plus a 220 ms fallback plays catch-up. Registering only the platform's own pair stops iOS scheduling the animation twice per open.

**Android `adjustResize`.** If the window already shrank to the keyboard top, the parent bottom *is* the keyboard top and you only need the visual gap:

```ts
const keyboardLayoutResized =
  Platform.OS === "android" &&
  windowHeightRef.current < restingWindowHeightRef.current - KEYBOARD_RESIZE_THRESHOLD;  // 24

if (keyboardLayoutResized) return COMMAND_BAR_KEYBOARD_GAP;      // 16
return keyboardHeight + COMMAND_BAR_KEYBOARD_GAP + (includeSafeAreaWhenLifted ? safeAreaBottom : 0);
```

Getting this wrong produces the classic bug where the Android bar sits behind the keyboard or floats a nav-bar's height above it.

### Auto-scroll

Not driven by `events.length`. Driven by **content size**, which is the only signal that fires after layout has actually grown:

```ts
const ONBOARDING_SCROLL_THRESHOLD = 300;

const handleOnboardingContentSizeChange = (_w: number, h: number) => {
  const { layoutHeight, offset, contentHeight: prevH } = onboardingScrollMetrics.current;
  if (h > prevH && prevH > 0 && h - layoutHeight - offset <= ONBOARDING_SCROLL_THRESHOLD) {
    scrollRef.current?.scrollToEnd({ animated: true });
  }
  onboardingScrollMetrics.current.contentHeight = h;
};
```

Four guards, each doing real work:

- `h > prevH` — only on growth, never on shrink.
- `prevH > 0` — skip the very first measurement, so the thread doesn't jump on mount.
- `h - layoutHeight - offset <= 300` — **only if the user is already near the bottom.** If they've scrolled up to re-read the recovery phrase, a new message will not yank them down.
- Metrics live in a `useRef`, so tracking scroll position costs no re-renders.

The same 300px threshold drives `onboardingIsNearBottom`, which shows a `ScrollToBottomPill` overlay (90px above the bottom) when the user has scrolled away.

`onKeyboardShow={scrollToEnd}` on the shell handles the other case: opening the keyboard scrolls the newest content into the now-shorter viewport.

### Error display

Two separate surfaces:

```tsx
const referralError = stage.kind === "referral-code" && stage.status === "idle" ? error : null;
```

Referral errors go *into* the card as a `StatusPill`. Everything else renders as a chip below the thread:

```tsx
{error && stage.kind !== "referral-code" ? (
  <Animated.View className="self-start mt-2" entering={FadeIn.duration(220)}>
    <View className="rounded-2xl border border-accentNegative bg-surface px-4 py-2">
      <Meta className="text-accentNegative">{error}</Meta>
    </View>
  </Animated.View>
) : null}
```

A single `error: string | null` backs both — the render splits it, not the state.

---

## 11. Full source

Everything below is copy-pasteable. Import paths use `@/` → project root. App-specific dependencies are called out in §12.

### 11.1 `types.ts`

```ts
import type { VerifyChallenge } from "./helpers/verify-mnemonic";

export type QuizOption = {
  readonly id: string;
  readonly label: string;
};

export type Stage =
  | { readonly kind: "referral-question" }
  | { readonly kind: "referral-code"; readonly status: "idle" | "valid" }
  | { readonly kind: "welcome" }
  | { readonly kind: "import-choose" }
  | { readonly kind: "warning" }
  | {
      readonly kind: "generating";
      readonly label?: string;
      readonly meta?: string;
    }
  | { readonly kind: "recovery"; readonly mnemonic: string }
  | {
      readonly kind: "verify";
      readonly mnemonic: string;
      readonly challenge: VerifyChallenge;
      readonly roundIndex: number;
      readonly attempts: readonly string[];
      readonly options: readonly QuizOption[];
      readonly correctId: string;
      readonly selectedId: string | null;
      readonly result: "pending" | "correct" | "incorrect" | "expired";
    }
  | { readonly kind: "import.mnemonic" }
  | { readonly kind: "import.privatekey" }
  | { readonly kind: "ready"; readonly importedBackend: boolean };

export type ThreadEventVariant =
  | "referral"
  | "referral-applied"
  | "greet"
  | "import-choose"
  | "warning"
  | "generating"
  | "recovery"
  | "verify"
  | "import-mnemonic"
  | "import-privatekey"
  | "ready";

export type ThreadEvent =
  | { readonly kind: "user"; readonly id: string; readonly label: string }
  | {
      readonly kind: "assistant";
      readonly id: string;
      readonly variant: ThreadEventVariant;
      readonly text?: string;
    };
```

### 11.2 `onboardingMotion.ts`

```ts
export const onboardingMotion = {
  assistantFirstTypingMs: 1000,
  assistantTypingMs: 800,
  assistantTextHoldMs: 300,
  processMinVisibleMs: 2800,
  processSpinnerMs: 2000,
  processTextRevealMs: 280,
  cardEnterMs: 640,
  staggerCardStepMs: 150,
  threadContentFadeMs: 320,
  errorFadeMs: 220,
  headerEnterMs: 320,
  headerExitMs: 220,
  landingFadeMs: 480,
  scrollToEndDelayMs: 80,
  referralWelcomeDelayMs: 700,
  verifyFeedback: {
    correctAdvanceMs: 650,
    expireAdvanceMs: 850,
    wrongResetMs: 1400,
  },
} as const;

export type OnboardingMotion = typeof onboardingMotion;
```

### 11.3 `onboardingProcess.ts`

```ts
import { onboardingMotion } from "./onboardingMotion";

export const walletFinalizeProcess = {
  assistantText: "Securing your wallet…",
  label: "Securing wallet on this device",
  meta: "SAVING",
  minVisibleMs: onboardingMotion.processMinVisibleMs,
} as const;

export const keypairGenerateProcess = {
  assistantText: "Generating your recovery phrase…",
  label: "Generating secure keypair",
  meta: "WORKING",
} as const;
```

### 11.4 `copy.ts`

```ts
export const onboardingLandingCopy = {
  title: "your money,\nin the dark.",
  subtitle: "handled by local agents that never\nphone home.",
  footer: "leave no trace",
  threadLabel: "agent thread",
} as const;
```

### 11.5 `helpers/initial-thread.ts`

```ts
/**
 * Where the onboarding thread starts.
 *
 *   "fresh" — first run. Opens on the referral question, and only reaches
 *             the wallet-setup cards after the user answers it.
 *   "reset" — the user just deleted their last account, which wipes the
 *             wallet. They are not a new user and have no referral code
 *             to enter, so the thread opens directly on the setup cards.
 *
 * Kept as a pure function rather than a branch inside `OnboardingFlow`
 * so the copy for both variants is unit-testable.
 */

import type { Stage, ThreadEventVariant } from "../types";

export type OnboardingVariant = "fresh" | "reset";

export type InitialThread = {
  readonly stage: Stage;
  readonly assistant: {
    readonly variant: ThreadEventVariant;
    readonly text: string;
  };
};

export function initialThreadFor(variant: OnboardingVariant): InitialThread {
  if (variant === "reset") {
    return {
      stage: { kind: "welcome" },
      assistant: { variant: "greet", text: "Ready to start again?" },
    };
  }
  return {
    stage: { kind: "referral-question" },
    assistant: { variant: "referral", text: "Do you have a referral code?" },
  };
}
```

### 11.6 `helpers/thread-user-label.ts`

```ts
/**
 * Thread user bubbles must only show plain strings. Pressable forwards a
 * SyntheticEvent when a handler is wired as `onPress={handler}`; ignore
 * non-string overrides so defaults still apply.
 */
export function resolveThreadUserLabel(
  override: unknown,
  defaultLabel: string,
): string {
  return typeof override === "string" ? override : defaultLabel;
}
```

### 11.7 `helpers/verify-mnemonic.ts`

```ts
export type VerifyChallenge = {
  readonly positions: readonly number[];
  readonly expected: readonly string[];
};

const CHALLENGE_COUNT = 3;

export function pickVerifyChallenge(words: readonly string[]): VerifyChallenge {
  if (words.length !== 12) {
    throw new Error(
      `pickVerifyChallenge expects a 12-word mnemonic, got ${words.length}`,
    );
  }
  const indices = pickDistinctIndices(words.length, CHALLENGE_COUNT);
  return {
    positions: indices.map((i) => i + 1),
    expected: indices.map((i) => normalizeQuizWord(words[i]!)),
  };
}

export function isVerifyComplete(
  challenge: VerifyChallenge,
  attempts: readonly string[],
): boolean {
  if (attempts.length !== challenge.expected.length) return false;
  return challenge.expected.every(
    (word, i) => normalizeQuizWord(attempts[i] ?? "") === word,
  );
}

export function normalizeQuizWord(word: string): string {
  return word.toLowerCase().trim();
}

export function isQuizAnswerCorrect(
  challenge: VerifyChallenge,
  roundIndex: number,
  selectedLabel: string,
): boolean {
  const expected = challenge.expected[roundIndex];
  if (expected === undefined) return false;
  return normalizeQuizWord(selectedLabel) === expected;
}

export function pickQuizOptions(
  words: readonly string[],
  position: number,
): readonly string[] {
  const targetIndex = position - 1;
  if (targetIndex < 0 || targetIndex >= words.length) {
    throw new Error(`pickQuizOptions position ${position} out of range`);
  }
  const correct = normalizeQuizWord(words[targetIndex]!);
  const distractorPool = words
    .map((w, i) => ({ word: normalizeQuizWord(w), index: i }))
    .filter((entry) => entry.index !== targetIndex && entry.word !== correct);
  const shuffled = [...distractorPool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const seen = new Set<string>([correct]);
  const distractors: string[] = [];
  for (const entry of shuffled) {
    if (distractors.length >= 3) break;
    if (seen.has(entry.word)) continue;
    seen.add(entry.word);
    distractors.push(entry.word);
  }
  const all = [correct, ...distractors];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all;
}

export const VERIFY_CHALLENGE_COUNT = CHALLENGE_COUNT;
export const VERIFY_QUIZ_DURATION_SEC = 42;

export type VerifyQuizRound = {
  readonly position: number;
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly correctId: string;
};

export function buildVerifyQuizRound(
  words: readonly string[],
  challenge: VerifyChallenge,
  roundIndex: number,
): VerifyQuizRound {
  if (roundIndex < 0 || roundIndex >= challenge.positions.length) {
    throw new Error(`buildVerifyQuizRound roundIndex ${roundIndex} out of range`);
  }
  const position = challenge.positions[roundIndex]!;
  const labels = pickQuizOptions(words, position);
  const correctLabel = challenge.expected[roundIndex]!;
  const options = labels.map((label, index) => ({
    id: `opt-${roundIndex}-${index}`,
    label,
  }));
  const correct = options.find(
    (o) => normalizeQuizWord(o.label) === correctLabel,
  );
  if (!correct) throw new Error("Quiz missing correct answer");
  return { position, options, correctId: correct.id };
}

export function formatVerifyTimerLabel(seconds: number): string {
  const clamped = Math.max(0, seconds);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(
    clamped % 60,
  ).padStart(2, "0")}`;
}

function pickDistinctIndices(range: number, count: number): number[] {
  const pool = Array.from({ length: range }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}
```

### 11.8 `helpers/verify-stage.ts`

```ts
import { onboardingMotion } from "../onboardingMotion";
import type { QuizOption, Stage } from "../types";
import {
  buildVerifyQuizRound,
  isVerifyComplete,
  pickVerifyChallenge,
  type VerifyChallenge,
} from "./verify-mnemonic";

export const VERIFY_EXPIRE_ADVANCE_MS =
  onboardingMotion.verifyFeedback.expireAdvanceMs;
export const VERIFY_CORRECT_ADVANCE_MS =
  onboardingMotion.verifyFeedback.correctAdvanceMs;
export const VERIFY_WRONG_RESET_MS =
  onboardingMotion.verifyFeedback.wrongResetMs;

export function buildVerifyRoundStage(
  mnemonic: string,
  challenge: VerifyChallenge,
  roundIndex: number,
  attempts: readonly string[],
): Extract<Stage, { kind: "verify" }> {
  const words = mnemonic.trim().split(/\s+/u);
  const round = buildVerifyQuizRound(words, challenge, roundIndex);
  return {
    kind: "verify",
    mnemonic,
    challenge,
    roundIndex,
    attempts,
    options: round.options as QuizOption[],
    correctId: round.correctId,
    selectedId: null,
    result: "pending",
  };
}

export function buildVerifyStage(
  mnemonic: string,
): Extract<Stage, { kind: "verify" }> {
  const words = mnemonic.trim().split(/\s+/u);
  const challenge = pickVerifyChallenge(words);
  return buildVerifyRoundStage(mnemonic, challenge, 0, []);
}

export function advanceVerifyRound(
  stage: Extract<Stage, { kind: "verify" }>,
  answer: string | null,
): Stage {
  const slotCount = stage.challenge.expected.length;
  const wasInitialPass = stage.attempts.length < slotCount;
  const attempts = [...stage.attempts];
  while (attempts.length <= stage.roundIndex) attempts.push("");

  if (answer !== null) {
    attempts[stage.roundIndex] = answer;
  }

  const nextRound = stage.roundIndex + 1;
  if (wasInitialPass && nextRound < slotCount) {
    return buildVerifyRoundStage(
      stage.mnemonic,
      stage.challenge,
      nextRound,
      attempts,
    );
  }

  if (isVerifyComplete(stage.challenge, attempts)) {
    return { kind: "ready", importedBackend: false };
  }

  const retryIndex = stage.challenge.expected.findIndex(
    (word, i) => attempts[i]?.toLowerCase().trim() !== word,
  );
  return buildVerifyRoundStage(
    stage.mnemonic,
    stage.challenge,
    retryIndex >= 0 ? retryIndex : 0,
    attempts,
  );
}

export function verifyQuizResetKey(stage: Extract<Stage, { kind: "verify" }>): string {
  const position = stage.challenge.positions[stage.roundIndex] ?? 0;
  return `${stage.roundIndex}-${position}-${stage.correctId}`;
}

export function shouldRunVerifyTimer(stage: Extract<Stage, { kind: "verify" }>): boolean {
  return stage.result === "pending" || stage.result === "incorrect";
}
```

### 11.9 `helpers/route-command-input.ts`

```ts
import type { QuizOption, Stage } from "../types";

export type OnboardingCommandAction =
  | { readonly kind: "referral-have-code" }
  | { readonly kind: "referral-skip" }
  | { readonly kind: "confirm-referral-code"; readonly code: string }
  | { readonly kind: "create-wallet" }
  | { readonly kind: "import-existing" }
  | { readonly kind: "connect-seeker" }
  | { readonly kind: "import-mnemonic" }
  | { readonly kind: "import-private-key" }
  | { readonly kind: "warning-continue" }
  | { readonly kind: "warning-cancel" }
  | { readonly kind: "recovery-saved" }
  | { readonly kind: "verify-answer"; readonly optionId: string }
  | { readonly kind: "import-mnemonic-submit"; readonly phrase: string }
  | { readonly kind: "import-private-key-submit"; readonly key: string }
  | { readonly kind: "ready-continue" }
  | { readonly kind: "invalid" };

const REFERRAL_HAVE = new Set([
  "i have", "have", "yes", "yes i have", "have code",
  "i have a code", "i have code",
]);

const REFERRAL_SKIP = new Set([
  "i don t have", "i dont have", "dont have", "don t have",
  "no", "skip", "continue without code", "none",
]);

const CREATE_WALLET = new Set([
  "create", "create wallet", "create a wallet", "create new wallet",
  "create a new wallet", "make a wallet", "make wallet", "make new wallet",
  "make a new wallet", "new wallet", "new", "start",
]);

const IMPORT_EXISTING = new Set([
  "import", "import wallet", "import existing", "import existing wallet",
  "import an existing wallet", "restore", "restore wallet",
  "existing", "existing wallet",
]);

const CONNECT_SEEKER = new Set([
  "connect seeker", "connect saga", "seeker", "saga", "hardware",
]);

const IMPORT_MNEMONIC = new Set([
  "phrase", "mnemonic", "recovery", "recovery phrase",
  "seed", "12 words", "24 words",
]);

const IMPORT_PRIVATE_KEY = new Set([
  "key", "private key", "private", "secret key",
]);

const WARNING_CONTINUE = new Set([
  "continue", "understand", "i understand", "yes", "ok", "got it",
]);

const WARNING_CANCEL = new Set(["cancel", "back", "no", "stop", "exit"]);

const RECOVERY_SAVED = new Set([
  "saved", "done", "next", "continue", "i saved", "i saved it",
  "ive saved", "ive saved it", "i ve saved", "i ve saved it",
  "saved it", "got it",
]);

function mentionsRecoverySaved(normalized: string): boolean {
  return normalized.includes("saved");
}

const READY_CONTINUE = new Set([
  "continue", "done", "enter", "go", "home", "open wallet", "finish",
]);

export function normalizeCommandInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function matchesExactOrPhrase(
  normalized: string,
  exact: ReadonlySet<string>,
  phrases: readonly string[],
): boolean {
  if (exact.has(normalized)) return true;
  return phrases.some(
    (phrase) => normalized === phrase || normalized.includes(phrase),
  );
}

function mentionsCreateWallet(normalized: string): boolean {
  return (
    normalized.includes("create") &&
    (normalized.includes("wallet") || normalized.includes("new"))
  );
}

function mentionsImportExisting(normalized: string): boolean {
  return (
    normalized.includes("import") ||
    normalized.includes("restore") ||
    (normalized.includes("existing") && normalized.includes("wallet"))
  );
}

function matchVerifyOption(
  normalized: string,
  options: readonly QuizOption[],
): string | null {
  const byLabel = options.find(
    (option) => normalizeCommandInput(option.label) === normalized,
  );
  return byLabel?.id ?? null;
}

export function resolveOnboardingCommandInput(
  stage: Stage,
  rawValue: string,
): OnboardingCommandAction {
  const trimmed = rawValue.trim();
  const normalized = normalizeCommandInput(trimmed);
  if (!normalized) {
    return { kind: "invalid" };
  }

  switch (stage.kind) {
    case "referral-question": {
      if (REFERRAL_HAVE.has(normalized)) return { kind: "referral-have-code" };
      if (REFERRAL_SKIP.has(normalized)) return { kind: "referral-skip" };
      if (trimmed.length >= 3) {
        return { kind: "confirm-referral-code", code: trimmed };
      }
      return { kind: "invalid" };
    }
    case "referral-code": {
      if (stage.status !== "idle") return { kind: "invalid" };
      if (REFERRAL_SKIP.has(normalized)) return { kind: "referral-skip" };
      return { kind: "confirm-referral-code", code: trimmed };
    }
    case "welcome": {
      if (
        matchesExactOrPhrase(normalized, CREATE_WALLET, [
          "create a new wallet",
          "create new wallet",
        ]) ||
        mentionsCreateWallet(normalized)
      ) {
        return { kind: "create-wallet" };
      }
      if (
        matchesExactOrPhrase(normalized, IMPORT_EXISTING, [
          "import existing wallet",
        ]) ||
        mentionsImportExisting(normalized)
      ) {
        return { kind: "import-existing" };
      }
      if (matchesExactOrPhrase(normalized, CONNECT_SEEKER, ["connect seeker"])) {
        return { kind: "connect-seeker" };
      }
      return { kind: "invalid" };
    }
    case "import-choose": {
      if (
        matchesExactOrPhrase(normalized, IMPORT_MNEMONIC, [
          "recovery phrase",
          "seed phrase",
        ])
      ) {
        return { kind: "import-mnemonic" };
      }
      if (matchesExactOrPhrase(normalized, IMPORT_PRIVATE_KEY, ["private key"])) {
        return { kind: "import-private-key" };
      }
      return { kind: "invalid" };
    }
    case "warning": {
      if (WARNING_CONTINUE.has(normalized)) return { kind: "warning-continue" };
      if (WARNING_CANCEL.has(normalized)) return { kind: "warning-cancel" };
      return { kind: "invalid" };
    }
    case "recovery": {
      if (
        matchesExactOrPhrase(normalized, RECOVERY_SAVED, [
          "i ve saved it",
          "ive saved it",
        ]) ||
        mentionsRecoverySaved(normalized)
      ) {
        return { kind: "recovery-saved" };
      }
      return { kind: "invalid" };
    }
    case "verify": {
      if (stage.result !== "pending" && stage.result !== "incorrect") {
        return { kind: "invalid" };
      }
      const optionId = matchVerifyOption(normalized, stage.options);
      if (optionId) return { kind: "verify-answer", optionId };
      return { kind: "invalid" };
    }
    case "import.mnemonic":
      return { kind: "import-mnemonic-submit", phrase: trimmed };
    case "import.privatekey":
      return { kind: "import-private-key-submit", key: trimmed };
    case "ready":
      if (READY_CONTINUE.has(normalized)) return { kind: "ready-continue" };
      return { kind: "invalid" };
    default:
      return { kind: "invalid" };
  }
}
```

### 11.10 `hooks/useThreadPresentation.ts`

Generic over the variant type, so it's reusable across any scripted thread — not just onboarding.

```ts
import { useEffect, useRef, useState } from "react";

import { onboardingMotion } from "../onboardingMotion";

export type PresentationPhase = "typing" | "text" | "actions";

/**
 * Shared thread event shapes so the presentation hook stays usable across
 * feature flows. Any thread is a list of user bubbles and assistant
 * messages carrying a variant label.
 */
export type AssistantThreadEvent<Variant extends string> = {
  readonly kind: "assistant";
  readonly id: string;
  readonly variant: Variant;
  readonly text?: string;
};

export type ThreadEventLike<Variant extends string> =
  | { readonly kind: "user"; readonly id: string; readonly label: string }
  | AssistantThreadEvent<Variant>;

const PROCESS_ASSISTANT_VARIANTS: ReadonlySet<string> = new Set(["generating"]);

export function isProcessAssistantEvent<Variant extends string>(
  event: ThreadEventLike<Variant> | null | undefined,
): boolean {
  return (
    event?.kind === "assistant" &&
    PROCESS_ASSISTANT_VARIANTS.has(event.variant)
  );
}

export type ThreadPresentation = {
  readonly getPhase: (eventId: string) => PresentationPhase;
  readonly isFirstAssistant: (eventId: string) => boolean;
};

export function useThreadPresentation<Variant extends string>(
  events: readonly ThreadEventLike<Variant>[],
  activeAssistantId: string | null,
): ThreadPresentation {
  const [phases, setPhases] = useState<Record<string, PresentationPhase>>({});
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const firstAssistantId = (() => {
    for (const ev of events) {
      if (ev.kind === "assistant") return ev.id;
    }
    return null;
  })();

  const activeAssistantEvent = (() => {
    if (!activeAssistantId) return null;
    for (const ev of events) {
      if (ev.kind === "assistant" && ev.id === activeAssistantId) return ev;
    }
    return null;
  })();

  // Freeze every non-active assistant message at "actions".
  useEffect(() => {
    setPhases((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const ev of events) {
        if (
          ev.kind === "assistant" &&
          ev.id !== activeAssistantId &&
          next[ev.id] !== "actions"
        ) {
          next[ev.id] = "actions";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [events, activeAssistantId]);

  // Drive the active message through typing → text → actions.
  useEffect(() => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];

    if (!activeAssistantId) return;

    const isProcessStep = isProcessAssistantEvent(activeAssistantEvent);
    const isFirst = activeAssistantId === firstAssistantId;
    const typingMs = isProcessStep
      ? 0
      : isFirst
        ? onboardingMotion.assistantFirstTypingMs
        : onboardingMotion.assistantTypingMs;
    const textHoldMs = isProcessStep
      ? onboardingMotion.processTextRevealMs
      : onboardingMotion.assistantTextHoldMs;

    setPhases((prev) => {
      if (prev[activeAssistantId] === "typing") return prev;
      return { ...prev, [activeAssistantId]: "typing" };
    });

    const schedule = (phase: PresentationPhase, delayMs: number) => {
      const id = setTimeout(() => {
        setPhases((prev) => ({ ...prev, [activeAssistantId]: phase }));
      }, delayMs);
      timersRef.current.push(id);
    };

    schedule("typing", 0);
    schedule("text", typingMs);
    schedule("actions", typingMs + textHoldMs);

    return () => {
      for (const id of timersRef.current) clearTimeout(id);
      timersRef.current = [];
    };
  }, [activeAssistantEvent, activeAssistantId, firstAssistantId]);

  const getPhase = (eventId: string): PresentationPhase =>
    phases[eventId] ?? (eventId === activeAssistantId ? "typing" : "actions");

  const isFirstAssistant = (eventId: string): boolean =>
    eventId === firstAssistantId;

  return { getPhase, isFirstAssistant };
}

export function shouldShowPresentationContent(
  phase: PresentationPhase,
): boolean {
  return phase === "typing" || phase === "text" || phase === "actions";
}

export function shouldShowStageActions<Variant extends string>(
  phase: PresentationPhase,
  event?: ThreadEventLike<Variant> | null,
): boolean {
  if (isProcessAssistantEvent(event)) {
    return phase === "text" || phase === "actions";
  }
  return phase === "actions";
}
```

### 11.11 `hooks/useVerifyQuizTimer.ts`

```ts
/**
 * Countdown for a single verify-quiz round. Resets when `resetKey` changes.
 * Calls `onExpire` once when the timer reaches zero while enabled.
 *
 * Uses a closure-scoped counter inside the effect so a new round never
 * inherits `secondsLeft === 0` from the previous round's React state.
 */

import { useEffect, useRef, useState } from "react";

import {
  formatVerifyTimerLabel,
  VERIFY_QUIZ_DURATION_SEC,
} from "../helpers/verify-mnemonic";

export { VERIFY_QUIZ_DURATION_SEC, formatVerifyTimerLabel };

type UseVerifyQuizTimerParams = {
  readonly enabled: boolean;
  readonly resetKey: string;
  readonly onExpire: () => void;
};

export function useVerifyQuizTimer({
  enabled,
  resetKey,
  onExpire,
}: UseVerifyQuizTimerParams) {
  const [secondsLeft, setSecondsLeft] = useState(VERIFY_QUIZ_DURATION_SEC);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    if (!enabled) return;

    let remaining = VERIFY_QUIZ_DURATION_SEC;
    let expired = false;

    setSecondsLeft(remaining);

    const id = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);

      if (remaining <= 0) {
        clearInterval(id);
        if (!expired) {
          expired = true;
          onExpireRef.current();
        }
      }
    }, 1000);

    return () => clearInterval(id);
  }, [enabled, resetKey]);

  return {
    label: formatVerifyTimerLabel(enabled ? secondsLeft : 0),
    secondsLeft: enabled ? secondsLeft : 0,
    expired: enabled ? secondsLeft <= 0 : false,
  };
}
```

### 11.12 `OnboardingFlow.tsx` — the orchestrator

The whole state machine. ~830 lines.

```tsx
import { useEffect, useRef, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import {
  AssistantBlock,
  CommandPrompt,
  CommandThreadShell,
  TypingIndicator,
  UserBubble,
} from "@/components/intent";
import { Body, Meta } from "@/design/typography";
import { useImportMnemonic, useImportPrivateKey } from "@/hooks/use-wallet";
import { generateMnemonic } from "@/domain/wallet/keypair";
import { ScrollToBottomPill } from "@/components/shared/ScrollToBottomPill";
import { useWalletTheme } from "@/hooks/use-wallet-theme";
import { appAlert } from "@/utils/appAlert";

import { OnboardingHeader } from "./components/OnboardingHeader";
import { StageInline } from "./components/StageInline";
import {
  shouldShowPresentationContent,
  shouldShowStageActions,
  useThreadPresentation,
} from "./hooks/useThreadPresentation";
import {
  advanceVerifyRound,
  buildVerifyStage,
  VERIFY_CORRECT_ADVANCE_MS,
  VERIFY_EXPIRE_ADVANCE_MS,
  VERIFY_WRONG_RESET_MS,
  verifyQuizResetKey,
} from "./helpers/verify-stage";
import { isQuizAnswerCorrect } from "./helpers/verify-mnemonic";
import {
  initialThreadFor,
  type OnboardingVariant,
} from "./helpers/initial-thread";
import { resolveOnboardingCommandInput } from "./helpers/route-command-input";
import { resolveThreadUserLabel } from "./helpers/thread-user-label";
import { onboardingMotion } from "./onboardingMotion";
import {
  keypairGenerateProcess,
  walletFinalizeProcess,
} from "./onboardingProcess";
import type { Stage, ThreadEvent } from "./types";

type Props = {
  readonly onComplete: () => void;
  /**
   * "reset" opens straight on the wallet-setup cards, skipping the
   * referral question. Defaults to the first-run flow.
   */
  readonly variant?: OnboardingVariant;
};

let eventCounter = 0;
function makeEventId(prefix: string): string {
  eventCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${eventCounter}`;
}

function maskMnemonic(phrase: string): string {
  const words = phrase.trim().split(/\s+/u);
  if (words.length === 0) return "";
  if (words.length === 1) return "•••••••";
  return `${words[0]} … ${words[words.length - 1]} · ${words.length} words`;
}

function isReferralCodeEntry(stage: Stage): boolean {
  return stage.kind === "referral-code" && stage.status === "idle";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveCommandPlaceholder(stage: Stage): string {
  if (isReferralCodeEntry(stage)) return "enter referral code...";
  if (stage.kind === "import.mnemonic") return "paste 12 or 24 word phrase...";
  if (stage.kind === "import.privatekey") return "paste private key...";
  return "tap an option above...";
}

export function OnboardingFlow({ onComplete, variant = "fresh" }: Props) {
  const importMnemonic = useImportMnemonic();
  const importPrivateKey = useImportPrivateKey();
  const theme = useWalletTheme();

  const initialThread = initialThreadFor(variant);
  const [stage, setStage] = useState<Stage>(initialThread.stage);
  const [events, setEvents] = useState<readonly ThreadEvent[]>(() => [
    {
      kind: "assistant",
      id: makeEventId("intro"),
      variant: initialThread.assistant.variant,
      text: initialThread.assistant.text,
    },
  ]);
  const { height: viewportHeight } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  const verifyStageRef = useRef(stage);
  const verifyAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const referralWelcomeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishVerifyAdvanceRef = useRef<
    (
      verifyStage: Extract<Stage, { kind: "verify" }>,
      answer: string | null,
    ) => Promise<void>
  >(async () => {});

  useEffect(() => {
    verifyStageRef.current = stage;
  });

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (verifyAdvanceTimerRef.current) clearTimeout(verifyAdvanceTimerRef.current);
      if (referralWelcomeTimerRef.current) clearTimeout(referralWelcomeTimerRef.current);
    },
    [],
  );

  async function finishVerifyAdvance(
    verifyStage: Extract<Stage, { kind: "verify" }>,
    answer: string | null,
  ) {
    const next = advanceVerifyRound(verifyStage, answer);
    if (next.kind === "ready") {
      setBusy(true);
      setError(null);
      try {
        appendEvents({
          kind: "assistant",
          id: makeEventId("saving"),
          variant: "generating",
          text: walletFinalizeProcess.assistantText,
        });
        setStage({
          kind: "generating",
          label: walletFinalizeProcess.label,
          meta: walletFinalizeProcess.meta,
        });
        await importMnemonic(verifyStage.mnemonic);
        await wait(walletFinalizeProcess.minVisibleMs);
        if (!mountedRef.current) return;
        appendEvents({
          kind: "assistant",
          id: makeEventId("ready"),
          variant: "ready",
          text: "Confirmed. Your wallet is ready.",
        });
        setStage({ kind: "ready", importedBackend: false });
      } catch (e) {
        if (!mountedRef.current) return;
        setError(
          e instanceof Error ? e.message : "Could not save wallet after verification",
        );
        setStage({ ...verifyStage, selectedId: null, result: "pending" });
      } finally {
        // Unguarded on purpose: mountedRef is a one-way latch, so guarding this
        // reset can strand the flow with Continue disabled. A state update after
        // unmount is a no-op, which is why the other handlers reset it plainly.
        setBusy(false);
      }
      return;
    }
    setStage(next);
  }

  useEffect(() => {
    finishVerifyAdvanceRef.current = finishVerifyAdvance;
  });

  const verifyTimerResetKey =
    stage.kind === "verify" ? verifyQuizResetKey(stage) : "idle";

  const handleQuizExpire = () => {
    if (verifyAdvanceTimerRef.current) {
      clearTimeout(verifyAdvanceTimerRef.current);
      verifyAdvanceTimerRef.current = null;
    }

    setStage((current) => {
      if (current.kind !== "verify") return current;
      if (current.result !== "pending" && current.result !== "incorrect") {
        return current;
      }
      return { ...current, result: "expired", selectedId: null };
    });

    verifyAdvanceTimerRef.current = setTimeout(() => {
      const current = verifyStageRef.current;
      if (current.kind !== "verify" || current.result !== "expired") return;
      void finishVerifyAdvanceRef.current(current, null);
    }, VERIFY_EXPIRE_ADVANCE_MS);
  };

  const threadStarted = events.some((ev) => ev.kind === "user");

  // ── Reliable auto-scroll via content size changes ───────────────────────
  const onboardingScrollMetrics = useRef({
    offset: 0,
    contentHeight: 0,
    layoutHeight: 0,
  });
  const [onboardingIsNearBottom, setOnboardingIsNearBottom] = useState(true);
  const ONBOARDING_SCROLL_THRESHOLD = 300;

  const scrollToEnd = () => {
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  const handleOnboardingScroll = (e: {
    nativeEvent: {
      contentOffset: { y: number };
      contentSize: { height: number };
      layoutMeasurement: { height: number };
    };
  }) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    onboardingScrollMetrics.current = {
      offset: contentOffset.y,
      contentHeight: contentSize.height,
      layoutHeight: layoutMeasurement.height,
    };
    const dist = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setOnboardingIsNearBottom(dist <= ONBOARDING_SCROLL_THRESHOLD);
  };

  const handleOnboardingContentSizeChange = (_w: number, h: number) => {
    const {
      layoutHeight,
      offset,
      contentHeight: prevH,
    } = onboardingScrollMetrics.current;
    // Auto-scroll when content grows and user is near bottom
    if (
      h > prevH &&
      prevH > 0 &&
      h - layoutHeight - offset <= ONBOARDING_SCROLL_THRESHOLD
    ) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
    onboardingScrollMetrics.current.contentHeight = h;
  };

  function appendEvents(...next: ThreadEvent[]) {
    setEvents((prev) => [...prev, ...next]);
  }

  const activeAssistantId = (() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]!;
      if (ev.kind === "assistant") return ev.id;
    }
    return null;
  })();

  const presentation = useThreadPresentation(events, activeAssistantId);

  function pushWelcome() {
    appendEvents({
      kind: "assistant",
      id: makeEventId("greet"),
      variant: "greet",
      text: "Let's get started",
    });
    setStage({ kind: "welcome" });
  }

  function handleReferralHaveCode(userLabel?: unknown) {
    const label = resolveThreadUserLabel(userLabel, "I have a code");
    appendEvents(
      { kind: "user", id: makeEventId("u"), label },
      {
        kind: "assistant",
        id: makeEventId("ref-code"),
        variant: "referral",
        text: "What's your referral code?",
      },
    );
    setStage({ kind: "referral-code", status: "idle" });
  }

  function handleReferralSkip(userLabel?: unknown) {
    appendEvents({
      kind: "user",
      id: makeEventId("u"),
      label: resolveThreadUserLabel(userLabel, "I don't have a code"),
    });
    pushWelcome();
  }

  function handleReferralCodeSubmit(codeOverride?: string) {
    const code = (codeOverride ?? promptValue).trim();
    if (code.length < 3) {
      setError("Code must be at least 3 characters");
      return;
    }
    setError(null);
    appendEvents(
      { kind: "user", id: makeEventId("u"), label: code },
      {
        kind: "assistant",
        id: makeEventId("ref-ok"),
        variant: "referral-applied",
        text: `Code "${code}" applied.`,
      },
    );
    setStage({ kind: "referral-code", status: "valid" });
    setPromptValue("");
    if (referralWelcomeTimerRef.current) {
      clearTimeout(referralWelcomeTimerRef.current);
    }
    referralWelcomeTimerRef.current = setTimeout(() => {
      referralWelcomeTimerRef.current = null;
      if (!mountedRef.current) return;
      pushWelcome();
    }, onboardingMotion.referralWelcomeDelayMs);
  }

  function handlePickCreate(userLabel?: unknown) {
    appendEvents(
      {
        kind: "user",
        id: makeEventId("u"),
        label: resolveThreadUserLabel(userLabel, "Create a new wallet"),
      },
      {
        kind: "assistant",
        id: makeEventId("warn"),
        variant: "warning",
        text: "Write these 12 words down once",
      },
    );
    setStage({ kind: "warning" });
  }

  function handlePickImportExisting(userLabel?: unknown) {
    appendEvents(
      {
        kind: "user",
        id: makeEventId("u"),
        label: resolveThreadUserLabel(userLabel, "Import existing wallet"),
      },
      {
        kind: "assistant",
        id: makeEventId("imp-choose"),
        variant: "import-choose",
        text: "How do you want to import?",
      },
    );
    setStage({ kind: "import-choose" });
  }

  function handlePickConnectSeeker(userLabel?: unknown) {
    appendEvents({
      kind: "user",
      id: makeEventId("u"),
      label: resolveThreadUserLabel(userLabel, "Connect Seeker"),
    });
    appAlert(
      "Seeker Unavailable",
      "Connect Seeker is not available in this build yet.",
    );
  }

  function handlePickImportMnemonic(userLabel?: unknown) {
    appendEvents(
      {
        kind: "user",
        id: makeEventId("u"),
        label: resolveThreadUserLabel(userLabel, "Recovery phrase"),
      },
      {
        kind: "assistant",
        id: makeEventId("imp-m"),
        variant: "import-mnemonic",
        text: "Paste your phrase below",
      },
    );
    setStage({ kind: "import.mnemonic" });
  }

  function handlePickImportPrivateKey(userLabel?: unknown) {
    appendEvents(
      {
        kind: "user",
        id: makeEventId("u"),
        label: resolveThreadUserLabel(userLabel, "Private key"),
      },
      {
        kind: "assistant",
        id: makeEventId("imp-k"),
        variant: "import-privatekey",
        text: "Paste your private key",
      },
    );
    setStage({ kind: "import.privatekey" });
  }

  function handleWarningCancel(userLabel?: unknown) {
    appendEvents(
      {
        kind: "user",
        id: makeEventId("u"),
        label: resolveThreadUserLabel(userLabel, "Cancel"),
      },
      {
        kind: "assistant",
        id: makeEventId("back"),
        variant: "greet",
        text: "No problem. Pick again when you're ready.",
      },
    );
    setStage({ kind: "welcome" });
  }

  async function handleWarningContinue(userLabel?: unknown) {
    if (busy) return;
    setBusy(true);
    setError(null);
    appendEvents(
      {
        kind: "user",
        id: makeEventId("u"),
        label: resolveThreadUserLabel(userLabel, "I understand"),
      },
      {
        kind: "assistant",
        id: makeEventId("gen"),
        variant: "generating",
        text: keypairGenerateProcess.assistantText,
      },
    );
    setStage({
      kind: "generating",
      label: keypairGenerateProcess.label,
      meta: keypairGenerateProcess.meta,
    });
    try {
      const mnemonic = generateMnemonic();
      appendEvents({
        kind: "assistant",
        id: makeEventId("recovery"),
        variant: "recovery",
        text: "Your recovery phrase",
      });
      setStage({ kind: "recovery", mnemonic });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create wallet");
      setStage({ kind: "warning" });
    } finally {
      setBusy(false);
    }
  }

  function handleSavedRecovery(userLabel?: unknown) {
    if (stage.kind !== "recovery") return;
    const next = buildVerifyStage(stage.mnemonic);
    appendEvents(
      {
        kind: "user",
        id: makeEventId("u"),
        label: resolveThreadUserLabel(userLabel, "I've saved it"),
      },
      {
        kind: "assistant",
        id: makeEventId("verify"),
        variant: "verify",
        text: `Word #${next.challenge.positions[next.roundIndex]}`,
      },
    );
    setStage(next);
  }

  function handleQuizSelect(optionId: string) {
    const current = verifyStageRef.current;
    if (current.kind !== "verify" || current.result !== "pending") return;

    const selected = current.options.find((o) => o.id === optionId);
    if (!selected) return;

    const isCorrect = isQuizAnswerCorrect(
      current.challenge,
      current.roundIndex,
      selected.label,
    );
    const answeredStage: Extract<Stage, { kind: "verify" }> = {
      ...current,
      selectedId: optionId,
      result: isCorrect ? "correct" : "incorrect",
    };

    setStage(answeredStage);
    appendEvents({ kind: "user", id: makeEventId("u"), label: selected.label });

    if (verifyAdvanceTimerRef.current) {
      clearTimeout(verifyAdvanceTimerRef.current);
      verifyAdvanceTimerRef.current = null;
    }

    if (isCorrect) {
      setError(null);
      verifyAdvanceTimerRef.current = setTimeout(() => {
        void finishVerifyAdvance(answeredStage, selected.label);
      }, VERIFY_CORRECT_ADVANCE_MS);
      return;
    }

    setError("Wrong word. Try another option.");
    verifyAdvanceTimerRef.current = setTimeout(() => {
      setStage((later) =>
        later.kind === "verify" && later.result === "incorrect"
          ? { ...later, selectedId: null, result: "pending" }
          : later,
      );
    }, VERIFY_WRONG_RESET_MS);
  }

  async function handlePromptSend(value: string) {
    if (busy) return;
    const trimmed = value.trim();
    if (!trimmed) return;

    const action = resolveOnboardingCommandInput(stage, trimmed);

    switch (action.kind) {
      case "referral-have-code":
        setPromptValue(""); setError(null); handleReferralHaveCode(trimmed); return;
      case "referral-skip":
        setPromptValue(""); setError(null); handleReferralSkip(trimmed); return;
      case "confirm-referral-code":
        handleReferralCodeSubmit(action.code); return;
      case "create-wallet":
        setPromptValue(""); setError(null); handlePickCreate(trimmed); return;
      case "import-existing":
        setPromptValue(""); setError(null); handlePickImportExisting(trimmed); return;
      case "connect-seeker":
        setPromptValue(""); setError(null); handlePickConnectSeeker(trimmed); return;
      case "import-mnemonic":
        setPromptValue(""); setError(null); handlePickImportMnemonic(trimmed); return;
      case "import-private-key":
        setPromptValue(""); setError(null); handlePickImportPrivateKey(trimmed); return;
      case "warning-continue":
        setPromptValue(""); setError(null); await handleWarningContinue(trimmed); return;
      case "warning-cancel":
        setPromptValue(""); setError(null); handleWarningCancel(trimmed); return;
      case "recovery-saved":
        setPromptValue(""); setError(null); handleSavedRecovery(trimmed); return;
      case "verify-answer":
        setPromptValue(""); setError(null); handleQuizSelect(action.optionId); return;
      case "import-mnemonic-submit":
        await handleImportMnemonicSubmit(action.phrase); return;
      case "import-private-key-submit":
        await handleImportPrivateKeySubmit(action.key); return;
      case "ready-continue":
        setPromptValue(""); setError(null); onComplete(); return;
      case "invalid":
        setError("Couldn't understand that. Try an option above or rephrase."); return;
    }
  }

  async function handleImportMnemonicSubmit(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const phrase = value.trim();
    appendEvents({
      kind: "user",
      id: makeEventId("u"),
      label: maskMnemonic(phrase),
    });
    try {
      await importMnemonic(phrase);
      appendEvents({
        kind: "assistant",
        id: makeEventId("ready"),
        variant: "ready",
        text: "Imported. Welcome back.",
      });
      setStage({ kind: "ready", importedBackend: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import");
    } finally {
      setBusy(false);
      setPromptValue("");
    }
  }

  async function handleImportPrivateKeySubmit(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    appendEvents({
      kind: "user",
      id: makeEventId("u"),
      label: "•••••••••••••",
    });
    try {
      await importPrivateKey(value.trim());
      appendEvents({
        kind: "assistant",
        id: makeEventId("ready"),
        variant: "ready",
        text: "Imported. Welcome back.",
      });
      setStage({ kind: "ready", importedBackend: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import");
    } finally {
      setBusy(false);
      setPromptValue("");
    }
  }

  const seedChips =
    stage.kind === "recovery"
      ? stage.mnemonic.trim().split(/\s+/u).map((label) => ({ label }))
      : [];

  const initialThreadTopPadding = Math.round(
    Math.min(56, Math.max(28, viewportHeight * 0.045)),
  );

  const referralError =
    stage.kind === "referral-code" && stage.status === "idle" ? error : null;

  const referralEntry = isReferralCodeEntry(stage);

  const commandBar = (
    <CommandPrompt
      autoFocus={referralEntry}
      disabled={busy || stage.kind === "generating"}
      inputProps={
        stage.kind === "import.privatekey"
          ? {
              secureTextEntry: true,
              textContentType: "password",
              autoComplete: "off",
            }
          : stage.kind === "import.mnemonic"
            ? { multiline: true }
            : referralEntry
              ? { autoCapitalize: "characters" }
              : undefined
      }
      onChangeText={setPromptValue}
      onSend={(value) => void handlePromptSend(value)}
      placeholder={resolveCommandPlaceholder(stage)}
      value={promptValue}
    />
  );

  return (
    <CommandThreadShell
      commandBar={commandBar}
      contentContainerStyle={{
        paddingTop: threadStarted ? 16 : initialThreadTopPadding,
      }}
      onKeyboardShow={scrollToEnd}
      scrollRef={scrollRef}
      scrollViewProps={{
        onScroll: handleOnboardingScroll,
        onContentSizeChange: handleOnboardingContentSizeChange,
        scrollEventThrottle: 16,
      }}
      overlay={
        <ScrollToBottomPill
          visible={!onboardingIsNearBottom}
          onPress={scrollToEnd}
          theme={theme}
          bottomOffset={90}
        />
      }
    >
      <OnboardingHeader threadStarted={threadStarted} />

      {events.map((ev) => {
        if (ev.kind === "user") {
          return <UserBubble key={ev.id} label={ev.label} />;
        }
        const isActive = ev.id === activeAssistantId;
        const phase = isActive ? presentation.getPhase(ev.id) : "actions";
        const showContent = !isActive || shouldShowPresentationContent(phase);
        const showActions = isActive && shouldShowStageActions(phase, ev);

        return (
          <AssistantBlock key={ev.id}>
            {showContent ? (
              <Animated.View
                entering={FadeIn.duration(onboardingMotion.threadContentFadeMs)}
              >
                {isActive && phase === "typing" && ev.variant !== "generating" ? (
                  <TypingIndicator />
                ) : ev.variant === "verify" ? null : ev.text ? (
                  <Body className="text-text" style={{ fontSize: 17, lineHeight: 24 }}>
                    {ev.text}
                  </Body>
                ) : (
                  <TypingIndicator />
                )}
              </Animated.View>
            ) : null}

            {isActive && showContent ? (
              <StageInline
                busy={busy}
                onComplete={onComplete}
                onPickConnectSeeker={handlePickConnectSeeker}
                onPickCreate={handlePickCreate}
                onPickImportExisting={handlePickImportExisting}
                onPickImportMnemonic={handlePickImportMnemonic}
                onPickImportPrivateKey={handlePickImportPrivateKey}
                onQuizExpire={handleQuizExpire}
                onQuizSelect={handleQuizSelect}
                onReferralHaveCode={handleReferralHaveCode}
                onReferralSkip={handleReferralSkip}
                onSavedRecovery={handleSavedRecovery}
                onWarningCancel={handleWarningCancel}
                onWarningContinue={() => void handleWarningContinue()}
                referralError={referralError}
                seedChips={seedChips}
                showActions={showActions}
                stage={stage}
                verifyTimerResetKey={verifyTimerResetKey}
              />
            ) : null}
          </AssistantBlock>
        );
      })}

      {error && stage.kind !== "referral-code" ? (
        <Animated.View
          className="self-start mt-2"
          entering={FadeIn.duration(onboardingMotion.errorFadeMs)}
        >
          <View className="rounded-2xl border border-accentNegative bg-surface px-4 py-2">
            <Meta className="text-accentNegative">{error}</Meta>
          </View>
        </Animated.View>
      ) : null}
    </CommandThreadShell>
  );
}
```

### 11.13 `components/StageInline.tsx` — the card switch

```tsx
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { GhostActionButton, IntentOptionCard } from "@/components/intent";
import { SeedPhraseCard } from "@/components/intent/cards/SeedPhraseCard";
import { VerificationQuizCard } from "@/components/intent/cards/VerificationQuizCard";

import type { Stage } from "../types";
import { shouldRunVerifyTimer } from "../helpers/verify-stage";
import { onboardingMotion } from "../onboardingMotion";
import { useVerifyQuizTimer } from "../hooks/useVerifyQuizTimer";
import { GeneratingPill } from "./GeneratingPill";
import { OnboardingReadyCard } from "./OnboardingReadyCard";
import { RecoveryRevealGate } from "./RecoveryRevealGate";
import { StatusPill } from "./StatusPill";
import { WarningStatusPill } from "./WarningStatusPill";

export type StageInlineProps = {
  readonly stage: Stage;
  readonly seedChips: readonly { label: string }[];
  readonly busy: boolean;
  readonly showActions: boolean;
  readonly referralError?: string | null;
  readonly onComplete: () => void;
  readonly onReferralHaveCode: () => void;
  readonly onReferralSkip: () => void;
  readonly onPickCreate: () => void;
  readonly onPickConnectSeeker: () => void;
  readonly onPickImportExisting: () => void;
  readonly onPickImportMnemonic: () => void;
  readonly onPickImportPrivateKey: () => void;
  readonly onWarningCancel: () => void;
  readonly onWarningContinue: () => void;
  readonly onSavedRecovery: () => void;
  readonly onQuizSelect: (id: string) => void;
  readonly onQuizExpire: () => void;
  readonly verifyTimerResetKey: string;
};

function StaggeredCard({
  delay,
  children,
}: {
  readonly delay: number;
  readonly children: React.ReactNode;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(onboardingMotion.cardEnterMs)}
      style={{ width: "100%" }}
    >
      {children}
    </Animated.View>
  );
}

function VerifyStageContent({
  stage,
  onQuizSelect,
  onQuizExpire,
  verifyTimerResetKey,
}: {
  readonly stage: Extract<Stage, { kind: "verify" }>;
  readonly onQuizSelect: (id: string) => void;
  readonly onQuizExpire: () => void;
  readonly verifyTimerResetKey: string;
}) {
  const position = stage.challenge.positions[stage.roundIndex] ?? 1;
  const locked = stage.result !== "pending";
  const verifyTimer = useVerifyQuizTimer({
    enabled: shouldRunVerifyTimer(stage),
    resetKey: verifyTimerResetKey,
    onExpire: onQuizExpire,
  });

  return (
    <Animated.View
      entering={FadeInDown.duration(onboardingMotion.cardEnterMs)}
      style={{ marginTop: 8 }}
    >
      <VerificationQuizCard
        disabled={locked}
        onSelectOption={onQuizSelect}
        options={stage.options}
        promptLabel={`WORD #${String(position).padStart(2, "0")}`}
        question="Pick the correct word"
        result={stage.result}
        selectedOptionId={stage.selectedId ?? undefined}
        timerExpired={verifyTimer.expired || stage.result === "expired"}
        timerLabel={verifyTimer.label}
      />
    </Animated.View>
  );
}

export const StageInline = function StageInline({
  stage,
  seedChips,
  busy,
  showActions,
  referralError,
  onComplete,
  onReferralHaveCode,
  onReferralSkip,
  onPickCreate,
  onPickConnectSeeker,
  onPickImportExisting,
  onPickImportMnemonic,
  onPickImportPrivateKey,
  onWarningCancel,
  onWarningContinue,
  onSavedRecovery,
  onQuizSelect,
  onQuizExpire,
  verifyTimerResetKey,
}: StageInlineProps) {
  if (!showActions) return null;

  if (stage.kind === "referral-question") {
    return (
      <Animated.View
        entering={FadeInDown.duration(onboardingMotion.cardEnterMs)}
        className="flex-row flex-wrap"
        style={{
          columnGap: 10,
          rowGap: 10,
          marginTop: 8,
          alignSelf: "flex-start",
          maxWidth: "100%",
        }}
      >
        <GhostActionButton
          label="I have"
          onPress={onReferralHaveCode}
          size="comfortable"
          style={{ flexShrink: 1 }}
        />
        <GhostActionButton
          label="I don't have"
          onPress={onReferralSkip}
          size="comfortable"
          style={{ flexShrink: 1 }}
          variant="secondary"
        />
      </Animated.View>
    );
  }

  if (stage.kind === "referral-code") {
    if (stage.status === "valid") {
      return <StatusPill label="Referral code applied" meta="ADDED" tone="success" />;
    }
    if (referralError) {
      return <StatusPill label={referralError} meta="TRY AGAIN" tone="error" />;
    }
    return null;
  }

  if (stage.kind === "welcome") {
    return (
      <View style={{ rowGap: 16, marginTop: 8, width: "100%" }}>
        <StaggeredCard delay={0}>
          <IntentOptionCard
            icon="plus"
            onPress={onPickCreate}
            subtitle="Generate a fresh 12-word recovery phrase"
            title="Create a new wallet"
            variant="primary"
          />
        </StaggeredCard>
        <StaggeredCard delay={onboardingMotion.staggerCardStepMs}>
          <IntentOptionCard
            icon="download"
            onPress={onPickImportExisting}
            subtitle="Restore from a phrase or a private key"
            title="Import existing wallet"
          />
        </StaggeredCard>
        <StaggeredCard delay={onboardingMotion.staggerCardStepMs * 2}>
          <IntentOptionCard
            accessibilityHint="Starts the Solana Mobile hardware wallet flow."
            icon="smartphone"
            onPress={onPickConnectSeeker}
            subtitle="Solana Mobile hardware wallet"
            title="Connect Seeker"
            variant="accent"
          />
        </StaggeredCard>
      </View>
    );
  }

  if (stage.kind === "import-choose") {
    return (
      <View style={{ rowGap: 16, marginTop: 8, width: "100%" }}>
        <StaggeredCard delay={0}>
          <IntentOptionCard
            icon="file-text"
            onPress={onPickImportMnemonic}
            subtitle="12 or 24 words"
            title="Recovery phrase"
            variant="primary"
          />
        </StaggeredCard>
        <StaggeredCard delay={onboardingMotion.staggerCardStepMs}>
          <IntentOptionCard
            icon="key"
            onPress={onPickImportPrivateKey}
            subtitle="Base58 or JSON array"
            title="Private key"
            variant="accent"
          />
        </StaggeredCard>
      </View>
    );
  }

  if (stage.kind === "warning") {
    return (
      <View style={{ rowGap: 10, marginTop: 4 }}>
        <WarningStatusPill />
        <View className="flex-row" style={{ columnGap: 10 }}>
          <View className="flex-1">
            <GhostActionButton
              disabled={busy}
              label="Cancel"
              onPress={onWarningCancel}
              variant="secondary"
            />
          </View>
          <View className="flex-1">
            <GhostActionButton
              disabled={busy}
              label="I understand"
              onPress={onWarningContinue}
            />
          </View>
        </View>
      </View>
    );
  }

  if (stage.kind === "generating") {
    return <GeneratingPill label={stage.label} meta={stage.meta} />;
  }

  if (stage.kind === "recovery") {
    return (
      <RecoveryRevealGate>
        {({ maskValues }) => (
          <SeedPhraseCard
            chips={seedChips}
            maskValues={maskValues}
            onPrimaryActionPress={onSavedRecovery}
            primaryActionLabel="I've saved it"
            secondaryActionLabel="Copy"
            subtitle="12 words • Write them down somewhere safe"
            title="RECOVERY PHRASE"
          />
        )}
      </RecoveryRevealGate>
    );
  }

  if (stage.kind === "verify") {
    return (
      <VerifyStageContent
        key={`verify-${verifyTimerResetKey}`}
        onQuizExpire={onQuizExpire}
        onQuizSelect={onQuizSelect}
        stage={stage}
        verifyTimerResetKey={verifyTimerResetKey}
      />
    );
  }

  if (stage.kind === "ready") {
    return (
      <OnboardingReadyCard
        imported={stage.importedBackend}
        onContinue={onComplete}
      />
    );
  }

  return null;
};
```

### 11.14 `components/GeneratingPill.tsx`

Spinning ring + key icon + label + meta. The ring is a bordered circle with three different border colors — rotating it makes the color arc travel.

```tsx
import { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Icon, IconSize } from "@/design/icons";
import { Body, Meta } from "@/design/typography";
import { useDesignColors } from "@/hooks/use-design-colors";

import { keypairGenerateProcess } from "../onboardingProcess";
import { onboardingMotion } from "../onboardingMotion";

const ICON_WRAP = 28;
const INNER_DISC = 22;
const RING_WIDTH = 2;

export type GeneratingPillProps = {
  readonly label?: string;
  readonly meta?: string;
};

export const GeneratingPill = function GeneratingPill({
  label = keypairGenerateProcess.label,
  meta = keypairGenerateProcess.meta,
}: GeneratingPillProps) {
  const colors = useDesignColors();
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, {
        duration: onboardingMotion.processSpinnerMs,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
    return () => cancelAnimation(spin);
  }, [spin]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${spin.value * 360}deg` }],
  }));

  return (
    <View
      className="flex-row items-center self-start rounded-full bg-surface border border-border"
      style={[
        styles.pill,
        Platform.select({
          ios: {
            shadowColor: colors.text,
            shadowOpacity: 0.08,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
          },
          android: { elevation: 2 },
          default: {},
        }),
      ]}
    >
      <View style={styles.iconStage}>
        <Animated.View
          style={[
            ringStyle,
            styles.ring,
            {
              borderColor: colors.accentSubtle,
              borderTopColor: colors.onboardingAccent,
              borderRightColor: colors.onboardingAccentSoft,
            },
          ]}
        />
        <View style={[styles.innerDisc, { backgroundColor: colors.accentSubtle }]}>
          <Icon color={colors.text} name="key" size={IconSize.sm} />
        </View>
      </View>
      <Body className="flex-1">{label}</Body>
      <Meta style={{ color: colors.onboardingAccent, letterSpacing: 1.4 }}>
        {meta}
      </Meta>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    minHeight: 56,
    paddingHorizontal: 14,
    columnGap: 10,
    marginTop: 4,
  },
  iconStage: {
    width: ICON_WRAP,
    height: ICON_WRAP,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: ICON_WRAP,
    height: ICON_WRAP,
    borderRadius: ICON_WRAP / 2,
    borderWidth: RING_WIDTH,
  },
  innerDisc: {
    width: INNER_DISC,
    height: INNER_DISC,
    borderRadius: INNER_DISC / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
```

### 11.15 `components/StatusPill.tsx` + `WarningStatusPill.tsx`

```tsx
import { View, type StyleProp, type ViewStyle } from "react-native";

import type { ColorMap } from "@/design/tokens";
import { Body, Mono } from "@/design/typography";
import { useDesignColors } from "@/hooks/use-design-colors";

export type StatusPillTone = "neutral" | "working" | "success" | "warning" | "error";

export type StatusPillProps = {
  readonly label: string;
  readonly meta?: string;
  readonly tone?: StatusPillTone;
  readonly style?: StyleProp<ViewStyle>;
};

function toneStyles(
  colors: ColorMap,
  tone: StatusPillTone,
): { bg: string; border: string; metaColor: string } {
  switch (tone) {
    case "working":
      return { bg: colors.surface, border: colors.border, metaColor: colors.onboardingAccent };
    case "success":
      return {
        bg: colors.onboardingSuccessSoft,
        border: colors.onboardingSuccessBorder,
        metaColor: colors.accentPositive,
      };
    case "warning":
    case "error":
      return {
        bg: colors.onboardingWarnSoft,
        border: colors.onboardingWarnBorder,
        metaColor: colors.onboardingWarn,
      };
    default:
      return { bg: colors.surface, border: colors.border, metaColor: colors.textMuted };
  }
}

export const StatusPill = function StatusPill({
  label,
  meta,
  tone = "neutral",
  style,
}: StatusPillProps) {
  const colors = useDesignColors();
  const t = toneStyles(colors, tone);

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          minHeight: 44,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: t.bg,
          paddingHorizontal: 14,
          paddingVertical: 10,
          columnGap: 10,
          marginTop: 4,
        },
        style,
      ]}
    >
      <Body className="flex-shrink text-text" style={{ fontSize: 13 }}>
        {label}
      </Body>
      {meta ? (
        <Mono style={{ color: t.metaColor, fontSize: 10, letterSpacing: 1.4, flexShrink: 0 }}>
          {meta}
        </Mono>
      ) : null}
    </View>
  );
};
```

```tsx
import { StatusPill } from "./StatusPill";

export type WarningStatusPillProps = {
  readonly label?: string;
  readonly meta?: string;
};

export const WarningStatusPill = function WarningStatusPill({
  label = "Write these 12 words down",
  meta = "ONCE",
}: WarningStatusPillProps) {
  return <StatusPill label={label} meta={meta} tone="warning" />;
};
```

Note `warning` and `error` share a tone style — the difference is the `meta` word (`ONCE` vs `TRY AGAIN`), not the color.

### 11.16 `components/RecoveryRevealGate.tsx`

```tsx
import { useState, ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Icon, IconSize } from "@/design/icons";
import { Body, Meta } from "@/design/typography";
import { useDesignColors } from "@/hooks/use-design-colors";

export type RecoveryRevealGateProps = {
  readonly children: (props: {
    readonly revealed: boolean;
    readonly maskValues: boolean;
  }) => ReactNode;
};

export const RecoveryRevealGate = function RecoveryRevealGate({
  children,
}: RecoveryRevealGateProps) {
  const colors = useDesignColors();
  const [revealed, setRevealed] = useState(false);

  if (revealed) {
    return (
      <View style={{ marginTop: 8 }}>
        {children({ revealed: true, maskValues: false })}
      </View>
    );
  }

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ position: "relative" }}>
        {children({ revealed: false, maskValues: true })}
        <Pressable
          accessibilityLabel="Tap to reveal recovery phrase"
          accessibilityRole="button"
          onPress={() => setRevealed(true)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 16,
            backgroundColor: colors.backdrop,
            alignItems: "center",
            justifyContent: "center",
            rowGap: 8,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.surfaceStrong,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon color={colors.text} name="eye-off" size={IconSize.sm} />
          </View>
          <Body className="text-text" style={{ fontWeight: "500" }}>
            Tap to reveal
          </Body>
          <Meta className="text-textSecondary">Your phrase stays on this device</Meta>
        </Pressable>
      </View>
    </View>
  );
};
```

### 11.17 `components/OnboardingHeader.tsx`

```tsx
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { Body, Meta } from "@/design/typography";

import { onboardingLandingCopy } from "../copy";
import { onboardingMotion } from "../onboardingMotion";

export type OnboardingHeaderProps = {
  readonly threadStarted: boolean;
};

export const OnboardingHeader = function OnboardingHeader({
  threadStarted,
}: OnboardingHeaderProps) {
  if (!threadStarted) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(onboardingMotion.headerEnterMs)}
      exiting={FadeOut.duration(onboardingMotion.headerExitMs)}
      style={{ marginBottom: 20, rowGap: 2 }}
    >
      <Body className="text-text" style={{ fontSize: 18, fontWeight: "600" }}>
        Onboarding
      </Body>
      <Meta className="text-textMuted" style={{ letterSpacing: 1.2 }}>
        {onboardingLandingCopy.threadLabel}
      </Meta>
    </Animated.View>
  );
};
```

### 11.18 `components/OnboardingReadyCard.tsx` — the finish line

```tsx
import { useEffect } from "react";
import { View } from "react-native";

import { GhostActionButton } from "@/components/intent";
import { WalletAccountSummaryCard } from "@/components/wallet/WalletAccountSummaryCard";
import {
  useActiveAccountName,
  useActiveAddress,
  useRefreshBalance,
  useWalletBalanceLamports,
  useWalletStatus,
} from "@/hooks/use-wallet";
import { formatAmountDisplay } from "@/utils/amount";

const LAMPORTS_PER_SOL = 1_000_000_000;

export type OnboardingReadyCardProps = {
  readonly onContinue: () => void;
  readonly imported?: boolean;
};

function formatSummaryBalance(balanceSol: number | null): string {
  if (balanceSol === null) return "0";
  if (balanceSol === 0) return "0";
  return formatAmountDisplay(balanceSol, 4);
}

export const OnboardingReadyCard = function OnboardingReadyCard({
  onContinue,
  imported = false,
}: OnboardingReadyCardProps) {
  const address = useActiveAddress();
  const accountName = useActiveAccountName();
  const balanceLamports = useWalletBalanceLamports();
  const status = useWalletStatus();
  const refreshBalance = useRefreshBalance();

  useEffect(() => {
    // useRefreshBalance selects a stable Zustand action; this effect refreshes once on mount.
    void refreshBalance();
  }, [refreshBalance]);

  const balanceSol =
    balanceLamports !== null ? balanceLamports / LAMPORTS_PER_SOL : null;
  const isLoading = status.kind === "loading";

  return (
    <View style={{ marginTop: 8, rowGap: 16, width: "100%", maxWidth: 342 }}>
      <WalletAccountSummaryCard
        accountLabel={accountName ?? "Account 1"}
        address={address}
        balanceLabel={formatSummaryBalance(balanceSol)}
        loading={isLoading}
        statusMessage={imported ? "Wallet restored" : "Ready to receive"}
      />

      <GhostActionButton label="Continue" onPress={onContinue} />
    </View>
  );
};
```

This is the payoff card: it shows the *real* account — name, address, live balance — before the user has left onboarding. The `refreshBalance()` on mount means an imported wallet shows its actual balance here rather than a zero that corrects itself on Home. `statusMessage` is the only copy that differs between create ("Ready to receive") and import ("Wallet restored").

### 11.19 `components/OnboardingGetStartedButton.tsx`

```tsx
import { useEffect } from "react";
import { Pressable, Text, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useDesignColors } from "@/hooks/use-design-colors";

const HEIGHT = 56;

export type OnboardingGetStartedButtonProps = {
  readonly onPress: () => void;
  readonly label?: string;
  readonly style?: StyleProp<ViewStyle>;
};

export const OnboardingGetStartedButton = function OnboardingGetStartedButton({
  onPress,
  label = "Get started",
  style,
}: OnboardingGetStartedButtonProps) {
  const colors = useDesignColors();
  const pressScale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  useEffect(() => () => cancelAnimation(pressScale), [pressScale]);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => {
        pressScale.value = withTiming(0.985, { duration: 70 });
      }}
      onPressOut={() => {
        pressScale.value = withTiming(1, { duration: 110 });
      }}
      style={[{ width: "100%" }, style]}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            {
              height: HEIGHT,
              borderRadius: 999,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
            },
            scaleStyle,
          ]}
        >
          <Text
            style={{
              color: colors.textInverse,
              fontSize: 16,
              lineHeight: 20,
              fontWeight: "600",
            }}
          >
            {label}
          </Text>
        </Animated.View>
      )}
    </Pressable>
  );
};
```

### 11.20 `OnboardingLandingScreen.tsx`

```tsx
import { View, useWindowDimensions } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { GhostBlinkSvg } from "@/components/ghostBlinkSvg";
import { Body, HeadlineHero, Meta } from "@/design/typography";
import { useDesignColors } from "@/hooks/use-design-colors";

import { OnboardingGetStartedButton } from "./components/OnboardingGetStartedButton";
import { onboardingLandingCopy } from "./copy";
import { onboardingMotion } from "./onboardingMotion";

const HORIZONTAL_PADDING = 24;
const GHOST_MAX = 540;
const GHOST_MIN = 336;
const GHOST_VIEWPORT_RATIO = 0.62;
const GHOST_TEXT_GAP = 24;
const GHOST_OFFSET_Y = 28;

export type OnboardingLandingScreenProps = {
  readonly onGetStarted: () => void;
};

export const OnboardingLandingScreen = function OnboardingLandingScreen({
  onGetStarted,
}: OnboardingLandingScreenProps) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colors = useDesignColors();

  const ghostSize = (() => {
    const widthBound = viewportWidth - HORIZONTAL_PADDING * 2;
    const heightBound = viewportHeight * GHOST_VIEWPORT_RATIO;
    return Math.min(GHOST_MAX, Math.max(GHOST_MIN, Math.min(widthBound, heightBound)));
  })();

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Animated.View
        entering={FadeIn.duration(onboardingMotion.landingFadeMs)}
        style={{
          flex: 1,
          paddingHorizontal: HORIZONTAL_PADDING,
          paddingBottom: Math.max(insets.bottom, 12),
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            alignItems: "center",
            paddingTop: 72,
            paddingBottom: GHOST_TEXT_GAP,
          }}
        >
          <View style={{ transform: [{ translateY: GHOST_OFFSET_Y }] }}>
            <GhostBlinkSvg
              backgroundColor="transparent"
              bodyColor={colors.text}
              expression="default"
              eyeColor={colors.bg}
              height={ghostSize}
              width={ghostSize}
            />
          </View>
        </View>

        <View style={{ rowGap: 14, marginBottom: 28 }}>
          <HeadlineHero className="text-text" style={{ fontSize: 34, lineHeight: 38 }}>
            {onboardingLandingCopy.title}
          </HeadlineHero>
          <Body className="text-textSecondary" style={{ fontSize: 15, lineHeight: 22 }}>
            {onboardingLandingCopy.subtitle}
          </Body>
        </View>

        <View style={{ rowGap: 18 }}>
          <OnboardingGetStartedButton onPress={onGetStarted} />
          <Meta className="text-textMuted" style={{ textAlign: "center", opacity: 0.75 }}>
            {onboardingLandingCopy.footer}
          </Meta>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
};
```

`GhostBlinkSvg` is the app's mascot — replace with your own art. It takes `width`/`height`/`bodyColor`/`eyeColor` and blinks on a timer.

---

## 11b. Shared chat primitives (`components/intent/`)

These are generic — nothing wallet-specific. Lift the whole folder.

### 11.21 `AssistantBlock.tsx`

```tsx
import { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

export type AssistantBlockProps = {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly className?: string;
};

export const AssistantBlock = function AssistantBlock({
  children,
  style,
  className,
}: AssistantBlockProps) {
  return (
    <View className={`w-full mb-5 ${className ?? ""}`} style={[{ rowGap: 10 }, style]}>
      {children}
    </View>
  );
};
```

Full-width, left-aligned, `rowGap: 10` between the text and its card, `mb-5` (20px) between messages.

### 11.22 `UserBubble.tsx`

```tsx
import { View, type StyleProp, type ViewStyle } from "react-native";

import { Body } from "@/design/typography";

export type UserBubbleProps = {
  readonly label: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly className?: string;
};

export const UserBubble = function UserBubble({
  label,
  style,
  className,
}: UserBubbleProps) {
  return (
    <View className={`w-full items-end mb-3 ${className ?? ""}`} style={style}>
      <View
        className="flex-row items-center rounded-full bg-accent"
        style={{
          maxWidth: "82%",
          minHeight: 48,
          paddingHorizontal: 22,
          paddingVertical: 12,
        }}
      >
        <Body
          className="flex-shrink text-textInverse"
          numberOfLines={2}
          style={{ fontWeight: "500", lineHeight: 20 }}
        >
          {label}
        </Body>
      </View>
    </View>
  );
};
```

Right-aligned accent pill, `maxWidth: 82%`, `numberOfLines={2}`. The 2-line cap is why long pasted input is masked before it becomes a label — a truncated seed phrase would look like a bug.

Asymmetry is deliberate: user messages are **pills** (`borderRadius: 999`, filled accent), assistant messages are **bare text** on the background. Only one side gets a bubble. It reads as "you are talking to the surface", not two peers.

### 11.23 `TypingIndicator.tsx`

```tsx
/**
 * TypingIndicator — three small dots that pulse opacity + lift slightly.
 */

import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { Colors } from "@/design/tokens";

const DOT_SIZE = 5;
const DOT_GAP = 5;
const PULSE_MS = 340;
const STAGGER_MS = 150;

export const TypingIndicator = function TypingIndicator({
  color = Colors.text,
}: {
  readonly color?: string;
} = {}) {
  return (
    <View className="flex-row items-center" style={{ minHeight: 20, columnGap: DOT_GAP }}>
      <Dot color={color} delay={0} />
      <Dot color={color} delay={STAGGER_MS} />
      <Dot color={color} delay={STAGGER_MS * 2} />
    </View>
  );
};

function Dot({ color, delay }: { readonly color: string; readonly delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: PULSE_MS, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(progress);
  }, [delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.value * 0.65,
    transform: [{ translateY: -2 * progress.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: DOT_SIZE / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}
```

Each dot runs the same 340 ms up / 340 ms down sine loop, offset 150 ms apart, so the pulse travels left to right. Opacity spans `0.35 → 1.0` and the dot lifts 2px at peak — both channels moving together is what stops it looking like a blinking LED. `minHeight: 20` reserves the row so text replacing the dots doesn't shift layout.

`cancelAnimation` on unmount is mandatory: `withRepeat(…, -1)` never ends on its own.

### 11.24 `GhostActionButton.tsx`

```tsx
import { useEffect, ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import type { ColorMap } from "@/design/tokens";
import { useDesignColors } from "@/hooks/use-design-colors";

const RADIUS = 999;
const ICON_SIZE = 14;
const CONTENT_GAP = 8;

type Size = "default" | "compact" | "comfortable";

const SIZES: Record<
  Size,
  {
    readonly height: number;
    readonly fontSize: number;
    readonly lineHeight: number;
    readonly paddingHorizontal: number;
  }
> = {
  default:     { height: 48, fontSize: 15, lineHeight: 18, paddingHorizontal: 20 },
  comfortable: { height: 52, fontSize: 16, lineHeight: 20, paddingHorizontal: 22 },
  compact:     { height: 40, fontSize: 14, lineHeight: 17, paddingHorizontal: 16 },
};

type Variant = "primary" | "secondary";

type VariantStyle = {
  readonly backgroundColor: string;
  readonly borderColor: string;
  readonly borderWidth: number;
  readonly labelColor: string;
  readonly labelWeight: TextStyle["fontWeight"];
};

function buildVariantStyle(colors: ColorMap, variant: Variant): VariantStyle {
  if (variant === "primary") {
    return {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
      borderWidth: 1,
      labelColor: colors.textInverse,
      labelWeight: "600",
    };
  }
  return {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderWidth: 1,
    labelColor: colors.text,
    labelWeight: "500",
  };
}

export type GhostActionButtonProps = Omit<
  PressableProps,
  "children" | "onPress" | "style"
> & {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly iconPosition?: "left" | "right";
  readonly variant?: Variant;
  readonly size?: Size;
  readonly disabled?: boolean;
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly textStyle?: StyleProp<TextStyle>;
  readonly className?: string;
};

export const GhostActionButton = function GhostActionButton({
  label,
  icon,
  iconPosition = "left",
  variant = "primary",
  size = "default",
  disabled = false,
  onPress,
  style,
  textStyle,
  className,
  onPressIn,
  onPressOut,
  ...pressableProps
}: GhostActionButtonProps) {
  const colors = useDesignColors();
  const v = buildVariantStyle(colors, variant);
  const s = SIZES[size];
  const pressScale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  useEffect(() => () => cancelAnimation(pressScale), [pressScale]);

  return (
    <Pressable
      {...pressableProps}
      accessibilityRole="button"
      className={className}
      disabled={disabled}
      onPress={onPress ? () => onPress() : undefined}
      onPressIn={(event) => {
        pressScale.value = withTiming(0.985, { duration: 70 });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressScale.value = withTiming(1, { duration: 110 });
        onPressOut?.(event);
      }}
      style={style}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            {
              height: s.height,
              paddingHorizontal: s.paddingHorizontal,
              borderRadius: RADIUS,
              borderWidth: v.borderWidth,
              borderColor: v.borderColor,
              backgroundColor: v.backgroundColor,
              alignItems: "center",
              justifyContent: "center",
              opacity: disabled ? 0.45 : pressed ? 0.92 : 1,
            },
            scaleStyle,
          ]}
        >
          <View
            style={{
              flexDirection: iconPosition === "right" ? "row-reverse" : "row",
              alignItems: "center",
              justifyContent: "center",
              columnGap: CONTENT_GAP,
            }}
          >
            {icon ? (
              <View
                style={{
                  width: ICON_SIZE,
                  height: ICON_SIZE,
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {icon}
              </View>
            ) : null}
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={[
                {
                  color: v.labelColor,
                  fontSize: s.fontSize,
                  lineHeight: s.lineHeight,
                  fontWeight: v.labelWeight,
                  flexShrink: 1,
                },
                textStyle,
              ]}
            >
              {label}
            </Text>
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
};
```

Note `onPress={onPress ? () => onPress() : undefined}` — the arrow wrapper **swallows the press event**, so a handler declared as `handler(userLabel?: unknown)` never receives a SyntheticEvent. `IntentOptionCard` does the same. `resolveThreadUserLabel` exists as a second line of defense for the paths that don't wrap.

### 11.25 `IntentOptionCard.tsx`

```tsx
import { ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Fonts } from "@/constants/theme";
import { Icon, type IconName } from "@/design/icons";
import type { ColorMap } from "@/design/tokens";
import { px, Radii, Spacing } from "@/design/tokens";
import { useDesignColors } from "@/hooks/use-design-colors";

const CARD_MIN_HEIGHT = 66;
const CARD_RADIUS = px(Radii["2xl"]!);
const ICON_WRAP_SIZE = 36;
const ICON_GLYPH_SIZE = 17;
const ARROW_GLYPH_SIZE = 18;
const HORIZONTAL_PAD = px(Spacing["4"]!);
const VERTICAL_PAD = 14;
const COPY_GAP = 14;

const CARD_ELEVATION = Platform.select({
  ios: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  android: { elevation: 3 },
  default: {},
});

export type IntentOptionVariant = "primary" | "default" | "accent";

export type IntentOptionCardProps = {
  readonly icon: IconName;
  readonly title: string;
  readonly subtitle: string;
  readonly variant?: IntentOptionVariant;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly accessibilityHint?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly className?: string;
  readonly trailing?: ReactNode;
};

type VariantStyle = {
  readonly backgroundColor: string;
  readonly borderColor: string;
  readonly titleColor: string;
  readonly subtitleColor: string;
  readonly subtitleOpacity: number;
  readonly iconWrapBackground: string;
  readonly iconColor: string;
  readonly arrowColor: string;
  readonly elevated: boolean;
};

function buildVariantStyle(
  colors: ColorMap,
  variant: IntentOptionVariant,
): VariantStyle {
  switch (variant) {
    case "primary":
      return {
        backgroundColor: colors.floatingPillBg,
        borderColor: colors.floatingPillBg,
        titleColor: colors.floatingPillText,
        subtitleColor: colors.floatingPillText,
        subtitleOpacity: 0.58,
        iconWrapBackground: colors.floatingPillText,
        iconColor: colors.floatingPillBg,
        arrowColor: colors.floatingPillText,
        elevated: false,
      };
    case "accent":
      return {
        backgroundColor: colors.surfaceCard,
        borderColor: colors.onboardingAccentBorder,
        titleColor: colors.text,
        subtitleColor: colors.onboardingAccent,
        subtitleOpacity: 1,
        iconWrapBackground: colors.onboardingAccentSoft,
        iconColor: colors.onboardingAccent,
        arrowColor: colors.onboardingAccent,
        elevated: true,
      };
    default:
      return {
        backgroundColor: colors.surfaceCard,
        borderColor: colors.borderStrong,
        titleColor: colors.text,
        subtitleColor: colors.textSecondary,
        subtitleOpacity: 1,
        iconWrapBackground: colors.accentSubtle,
        iconColor: colors.text,
        arrowColor: colors.textSecondary,
        elevated: true,
      };
  }
}

export const IntentOptionCard = function IntentOptionCard({
  icon,
  title,
  subtitle,
  variant = "default",
  onPress,
  disabled = false,
  accessibilityHint,
  style,
  className,
  trailing,
}: IntentOptionCardProps) {
  const colors = useDesignColors();
  const v = buildVariantStyle(colors, variant);

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={title}
      accessibilityRole="button"
      className={className}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress ? () => onPress() : undefined}
      style={[styles.pressable, style]}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.card,
            { backgroundColor: v.backgroundColor, borderColor: v.borderColor },
            v.elevated ? CARD_ELEVATION : null,
            disabled && styles.disabled,
            pressed && !disabled && styles.cardPressed,
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: v.iconWrapBackground }]}>
            <Icon color={v.iconColor} name={icon} size={ICON_GLYPH_SIZE} />
          </View>

          <View style={styles.copy}>
            <Text numberOfLines={2} style={[styles.title, { color: v.titleColor }]}>
              {title}
            </Text>
            <Text
              numberOfLines={2}
              style={[
                styles.subtitle,
                { color: v.subtitleColor, opacity: v.subtitleOpacity },
              ]}
            >
              {subtitle}
            </Text>
          </View>

          <View style={styles.trailing}>
            {trailing ?? (
              <Icon color={v.arrowColor} name="arrow-right" size={ARROW_GLYPH_SIZE} />
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pressable: { width: "100%" },
  card: {
    width: "100%",
    minHeight: CARD_MIN_HEIGHT,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    paddingHorizontal: HORIZONTAL_PAD,
    paddingVertical: VERTICAL_PAD,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  cardPressed: { opacity: 0.88, transform: [{ scale: 0.992 }] },
  disabled: { opacity: 0.45 },
  iconWrap: {
    width: ICON_WRAP_SIZE,
    height: ICON_WRAP_SIZE,
    borderRadius: ICON_WRAP_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: COPY_GAP,
    flexShrink: 0,
  },
  copy: { flex: 1, minWidth: 0, justifyContent: "center" },
  title: { fontFamily: Fonts.bold, fontSize: 15, lineHeight: 18 },
  subtitle: { fontFamily: Fonts.regular, fontSize: 11, lineHeight: 13, marginTop: 3 },
  trailing: { marginLeft: COPY_GAP, flexShrink: 0, alignItems: "center", justifyContent: "center" },
});
```

`minWidth: 0` on the copy column is the RN equivalent of the CSS flex-min-width fix — without it a long title refuses to wrap and pushes the chevron off the card.

### 11.26 `commandBarLayout.ts`

```ts
export const COMMAND_BAR_HEIGHT = 60;
export const COMMAND_BAR_KEYBOARD_GAP = 16;
export const COMMAND_BAR_MIN_BOTTOM = -16;
export const COMMAND_BAR_SCROLL_EXTRA = 16;
export const COMMAND_BAR_MAX_WIDTH = 520;

/**
 * The narrow-phone width class (small Androids, and Galaxy A/S at their default
 * density, which land on exactly 360). Single source of truth.
 */
export const NARROW_VIEWPORT_BREAKPOINT = 360;
const DEFAULT_HORIZONTAL_INSET = 20;
const NARROW_HORIZONTAL_INSET = 16;

export function resolveHorizontalInset(viewportWidth: number): number {
  return viewportWidth <= NARROW_VIEWPORT_BREAKPOINT
    ? NARROW_HORIZONTAL_INSET
    : DEFAULT_HORIZONTAL_INSET;
}

/**
 * Where the bar rests when the keyboard is closed. Floored at 16 so the bar
 * stays fully on-screen on zero-bottom-inset devices (iPhone SE, Android
 * 3-button nav); on notched phones (inset 34) this yields the tuned 18.
 */
export function resolveCommandBarRestingBottom(safeAreaBottom: number): number {
  return Math.max(safeAreaBottom + COMMAND_BAR_MIN_BOTTOM, 16);
}

export function resolveCommandBarBottomOffset({
  keyboardHeight,
  keyboardLayoutResized = false,
  safeAreaBottom,
  includeSafeAreaWhenLifted = false,
}: {
  readonly keyboardHeight: number;
  readonly keyboardLayoutResized?: boolean;
  readonly safeAreaBottom: number;
  /**
   * Android edge-to-edge inside a Modal reports the keyboard height from above
   * the navigation bar, so a bar anchored to the screen bottom needs the extra
   * inset to clear it. Callers that anchor to the window bottom leave this off.
   */
  readonly includeSafeAreaWhenLifted?: boolean;
}): number {
  if (keyboardHeight > 0) {
    // On Android with adjustResize the window already shrank to the keyboard top;
    // just add the visual gap. Otherwise offset from the screen bottom.
    if (keyboardLayoutResized) {
      return COMMAND_BAR_KEYBOARD_GAP;
    }
    return (
      keyboardHeight +
      COMMAND_BAR_KEYBOARD_GAP +
      (includeSafeAreaWhenLifted ? safeAreaBottom : 0)
    );
  }

  return resolveCommandBarRestingBottom(safeAreaBottom);
}

export function resolveThreadScrollPaddingBottom(
  commandBarBottomOffset: number,
): number {
  return commandBarBottomOffset + COMMAND_BAR_HEIGHT + COMMAND_BAR_SCROLL_EXTRA;
}
```

### 11.27 `CommandThreadShell.tsx`

```tsx
import { ReactNode, RefObject } from "react";
import {
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
  type ScrollViewProps,
} from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  resolveCommandBarBottomOffset,
  resolveHorizontalInset,
  resolveThreadScrollPaddingBottom,
} from "@/components/intent/commandBarLayout";
import { useCommandBarKeyboardOffset } from "@/hooks/useCommandBarKeyboardOffset";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";

export type CommandThreadShellProps = {
  readonly children: ReactNode;
  readonly commandBar: ReactNode;
  readonly scrollRef?: RefObject<ScrollView | null>;
  readonly contentContainerStyle?: ScrollViewProps["contentContainerStyle"];
  readonly onKeyboardShow?: () => void;
  readonly scrollViewProps?: Omit<
    ScrollViewProps,
    "ref" | "contentContainerStyle" | "children"
  >;
  readonly overlay?: ReactNode;
  /** SafeArea edges for the shell. Defaults to top-only (full-screen use). */
  readonly edges?: readonly ("top" | "bottom")[];
};

export const CommandThreadShell = function CommandThreadShell({
  children,
  commandBar,
  scrollRef,
  contentContainerStyle,
  onKeyboardShow,
  scrollViewProps,
  overlay,
  edges = ["top"],
}: CommandThreadShellProps) {
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();

  // JS-side keyboard height for scroll padding (doesn't need frame-perfect accuracy).
  const { keyboardHeight, keyboardLayoutResized } = useKeyboardHeight({ onKeyboardShow });

  const horizontalInset = resolveHorizontalInset(viewportWidth);

  // Bar lift is driven on the UI thread straight from keyboard events.
  const { barAnimatedStyle, restingBottom } = useCommandBarKeyboardOffset(insets.bottom);

  // Scroll padding: computed on JS side; slightly lags behind the animation
  // but that's fine — we just need content to be scrollable above the bar.
  const scrollPaddingBottom = resolveThreadScrollPaddingBottom(
    resolveCommandBarBottomOffset({
      keyboardHeight,
      keyboardLayoutResized,
      safeAreaBottom: insets.bottom,
      includeSafeAreaWhenLifted: Platform.OS === "android",
    }),
  );

  const mergedContentStyle = [
    { paddingHorizontal: horizontalInset, paddingBottom: scrollPaddingBottom },
    contentContainerStyle,
  ];

  return (
    <SafeAreaView edges={edges} className="flex-1 bg-bg">
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          bounces={false}
          contentContainerStyle={mergedContentStyle}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...scrollViewProps}
        >
          {children}
        </ScrollView>

        {overlay}

        {/* Absolutely positioned so the scroll view fills the full height behind it. */}
        <Animated.View
          pointerEvents="box-none"
          style={[
            {
              position: "absolute",
              left: horizontalInset,
              right: horizontalInset,
              bottom: restingBottom,
              alignItems: "center",
            },
            barAnimatedStyle,
          ]}
        >
          {commandBar}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
};
```

### 11.28 `hooks/useCommandBarKeyboardOffset.ts`

```ts
import { useEffect, useRef } from "react";
import { Keyboard, Platform, useWindowDimensions } from "react-native";
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
} from "react-native-reanimated";
import type { ViewStyle } from "react-native";

import {
  resolveCommandBarBottomOffset,
  resolveCommandBarRestingBottom,
} from "@/components/intent/commandBarLayout";
import { KEYBOARD_RESIZE_THRESHOLD } from "@/hooks/useKeyboardHeight";

/** Fallback when the platform does not report a keyboard animation duration. */
const FALLBACK_DURATION_MS = 220;

export type UseCommandBarKeyboardOffsetResult = {
  /** Apply to the bar wrapper alongside a static `bottom: restingBottom`. */
  readonly barAnimatedStyle: AnimatedStyle<ViewStyle>;
  /** Static resting offset the animated style translates away from. */
  readonly restingBottom: number;
};

/**
 * Lifts a floating command bar with the keyboard, driven straight from keyboard
 * events on the UI thread.
 *
 * iOS `keyboardWillShow`/`WillHide` carry the real animation duration, so the
 * bar slides exactly with the keyboard. Android has no `will*` events, so the
 * `did*` pair falls back to a fast catch-up. Registering only the platform's own
 * pair keeps iOS from scheduling the animation twice per keyboard open.
 *
 * The bar animates with `translateY` off a static `bottom` so the thread behind
 * it never relayouts while the keyboard slides.
 */
export function useCommandBarKeyboardOffset(
  safeAreaBottom: number,
): UseCommandBarKeyboardOffsetResult {
  const { height: windowHeight } = useWindowDimensions();

  const restingBottom = resolveCommandBarRestingBottom(safeAreaBottom);
  const animatedBottomOffset = useSharedValue(restingBottom);

  // Window height while the keyboard is closed, plus the latest height. Both
  // are refs so the listener effect below does not re-subscribe on every
  // resize; `windowHeightRef` is written from an effect rather than during
  // render, which would otherwise bail React Compiler out of this hook.
  const restingWindowHeightRef = useRef(windowHeight);
  const windowHeightRef = useRef(windowHeight);

  useEffect(() => {
    windowHeightRef.current = windowHeight;
  }, [windowHeight]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      // When the window already shrank, adjustResize is active and the parent
      // bottom sits at the keyboard top, so only the visual gap is needed.
      const keyboardLayoutResized =
        Platform.OS === "android" &&
        windowHeightRef.current <
          restingWindowHeightRef.current - KEYBOARD_RESIZE_THRESHOLD;

      animatedBottomOffset.value = withTiming(
        resolveCommandBarBottomOffset({
          keyboardHeight: event.endCoordinates.height,
          keyboardLayoutResized,
          safeAreaBottom,
          includeSafeAreaWhenLifted: Platform.OS === "android",
        }),
        {
          duration: event.duration || FALLBACK_DURATION_MS,
          easing: Easing.out(Easing.cubic),
        },
      );
    });

    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      restingWindowHeightRef.current = windowHeightRef.current;
      animatedBottomOffset.value = withTiming(restingBottom, {
        duration: event?.duration || FALLBACK_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [animatedBottomOffset, restingBottom, safeAreaBottom]);

  const barAnimatedStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateY: restingBottom - animatedBottomOffset.value }],
    }),
    [restingBottom],
  );

  return { barAnimatedStyle, restingBottom };
}
```

### 11.29 `hooks/useKeyboardHeight.ts`

```ts
import { useEffect, useRef, useState } from "react";
import { Dimensions, Keyboard, Platform } from "react-native";

export type UseKeyboardHeightOptions = {
  readonly onKeyboardShow?: () => void;
};

/**
 * If the window shrinks more than this, adjustResize is active and the window
 * bottom already sits at the keyboard top.
 */
export const KEYBOARD_RESIZE_THRESHOLD = 24;

export function useKeyboardHeight(options?: UseKeyboardHeightOptions) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardLayoutResized, setKeyboardLayoutResized] = useState(false);
  const onShowRef = useRef(options?.onKeyboardShow);
  const restingWindowHeightRef = useRef(Dimensions.get("window").height);

  useEffect(() => {
    onShowRef.current = options?.onKeyboardShow;
  });

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    let animationFrame: ReturnType<typeof requestAnimationFrame> | null = null;

    const applyKeyboardLayout = (event: { endCoordinates: { height: number } }) => {
      const currentWindowHeight = Dimensions.get("window").height;
      const layoutResized =
        Platform.OS === "android" &&
        currentWindowHeight <
          restingWindowHeightRef.current - KEYBOARD_RESIZE_THRESHOLD;
      setKeyboardLayoutResized(layoutResized);
      setKeyboardHeight(event.endCoordinates.height);
    };

    const showSub = Keyboard.addListener(showEvent, (event) => {
      applyKeyboardLayout(event);
      // Re-check after layout pass on Android — adjustResize may not have settled yet
      if (Platform.OS === "android") {
        if (animationFrame !== null) cancelAnimationFrame(animationFrame);
        animationFrame = requestAnimationFrame(() => {
          animationFrame = null;
          applyKeyboardLayout(event);
          onShowRef.current?.();
        });
      } else {
        if (animationFrame !== null) cancelAnimationFrame(animationFrame);
        animationFrame = requestAnimationFrame(() => {
          animationFrame = null;
          onShowRef.current?.();
        });
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      setKeyboardHeight(0);
      setKeyboardLayoutResized(false);
      restingWindowHeightRef.current = Dimensions.get("window").height;
    });

    return () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return {
    keyboardHeight,
    keyboardLayoutResized,
    isKeyboardVisible: keyboardHeight > 0,
  };
}
```

### 11.30 `CommandPrompt.tsx`

The floating input bar. Terminal-styled: a `>` prompt glyph, mono font, and a `>_` cursor that swaps for a send button once you type.

Onboarding never passes `generating`/`onStop`, so the `StopButton` branch is dead in this flow — omitted below. Everything else is verbatim.

```tsx
import { memo, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  Text,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { tap } from "@/utils/haptics";
import Animated, {
  cancelAnimation,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { AiPressable } from "@/components/chat/AiPressable";
import {
  COMMAND_BAR_HEIGHT,
  COMMAND_BAR_MAX_WIDTH,
} from "@/components/intent/commandBarLayout";
import { AiMotion } from "@/constants/ai-ui";
import { Icon, IconSize } from "@/design/icons";
import { useDesignColors } from "@/hooks/use-design-colors";

const SUBMIT_BUTTON_SIZE = 32;
const SHELL_PADDING_LEFT = 16;
const SHELL_PADDING_RIGHT = 14;
const PROMPT_GAP = 6;
const TRAILING_GAP = 8;
const PRESS_SCALE_IN = 0.98;
const MONO_FONT_FAMILY = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

const SPRING_CONFIG = { damping: 18, stiffness: 320, mass: 0.35 } as const;

const monoTextStyle = {
  fontFamily: MONO_FONT_FAMILY,
  fontSize: 14,
  lineHeight: 18,
} as const;

export type CommandPromptProps = {
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly generating?: boolean;
  readonly onStop?: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly className?: string;
  readonly value?: string;
  readonly onChangeText?: (text: string) => void;
  readonly onSend?: (value: string) => void;
  readonly autoFocus?: boolean;
  readonly inputProps?: Omit<
    TextInputProps,
    "value" | "onChangeText" | "onSubmitEditing" | "placeholder" | "editable"
  >;
};

function stripLeadingPromptGlyph(placeholder: string): string {
  return placeholder.replace(/^>\s*/, "");
}

function triggerSendHaptic(): void {
  tap();
}

type ComposerActionProps = {
  readonly accessibilityLabel: string;
  readonly backgroundColor: string;
  readonly iconColor: string;
  readonly iconName: "arrow-up-right" | "square";
  readonly onPress: () => void;
};

const ComposerActionButton = memo(function ComposerActionButton({
  accessibilityLabel,
  backgroundColor,
  iconColor,
  iconName,
  onPress,
}: ComposerActionProps) {
  return (
    <AiPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      pressScale="icon"
      style={{
        width: SUBMIT_BUTTON_SIZE,
        height: SUBMIT_BUTTON_SIZE,
        borderRadius: SUBMIT_BUTTON_SIZE / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor,
        marginLeft: TRAILING_GAP,
      }}
    >
      <Animated.View
        entering={FadeIn.duration(AiMotion.composerIconMs)}
        exiting={FadeOut.duration(AiMotion.composerIconMs)}
      >
        <Icon color={iconColor} name={iconName} size={IconSize.sm} />
      </Animated.View>
    </AiPressable>
  );
});

export const CommandPrompt = memo(function CommandPrompt({
  placeholder = "tap an option above...",
  disabled = false,
  readOnly = false,
  generating = false,
  onStop,
  style,
  className,
  value,
  onChangeText,
  onSend,
  autoFocus = false,
  inputProps,
}: CommandPromptProps) {
  const colors = useDesignColors();
  const inputRef = useRef<TextInput>(null);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(value ?? "");
  const [isFocused, setIsFocused] = useState(autoFocus);
  const pressScale = useSharedValue(1);
  const resolvedValue = isControlled ? (value ?? "") : internalValue;
  const trimmed = resolvedValue.trim();
  const isInteractive = !disabled && !readOnly && !generating;
  const canSend = isInteractive && trimmed.length > 0;
  const placeholderText = stripLeadingPromptGlyph(placeholder);

  useEffect(() => {
    if (isControlled) setInternalValue(value ?? "");
  }, [isControlled, value]);

  useEffect(() => () => cancelAnimation(pressScale), [pressScale]);

  const shellStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  function submit() {
    if (!canSend) return;
    triggerSendHaptic();
    onSend?.(trimmed);
  }

  function handleShellPress() {
    if (!isInteractive) return;
    inputRef.current?.focus();
  }

  const shellBackground =
    isFocused && isInteractive ? colors.surfaceFocused : colors.surface;

  return (
    <Pressable
      accessible={false}
      className={className}
      disabled={disabled}
      onPress={handleShellPress}
      onPressIn={() => {
        if (!isInteractive) return;
        pressScale.value = withSpring(PRESS_SCALE_IN, SPRING_CONFIG);
      }}
      onPressOut={() => {
        pressScale.value = withSpring(1, SPRING_CONFIG);
      }}
      style={[{ alignSelf: "stretch" }, style]}
    >
      <Animated.View
        style={[
          {
            alignSelf: "center",
            width: "100%",
            maxWidth: COMMAND_BAR_MAX_WIDTH,
            minHeight: COMMAND_BAR_HEIGHT,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: shellBackground,
            paddingLeft: SHELL_PADDING_LEFT,
            paddingRight: SHELL_PADDING_RIGHT,
            flexDirection: "row",
            alignItems: "center",
            opacity: disabled ? AiMotion.disabledOpacity : 1,
          },
          shellStyle,
        ]}
      >
        <Text
          style={[monoTextStyle, { color: colors.textSecondary, marginRight: PROMPT_GAP }]}
        >
          {">"}
        </Text>

        <TextInput
          {...inputProps}
          ref={inputRef}
          accessibilityLabel={placeholderText}
          autoCapitalize={inputProps?.autoCapitalize ?? "none"}
          autoCorrect={inputProps?.autoCorrect ?? false}
          autoFocus={autoFocus && isInteractive}
          blurOnSubmit={inputProps?.blurOnSubmit ?? false}
          editable={isInteractive}
          onBlur={(event) => {
            setIsFocused(false);
            inputProps?.onBlur?.(event);
          }}
          onChangeText={(text) => {
            if (!isControlled) setInternalValue(text);
            onChangeText?.(text);
          }}
          onFocus={(event) => {
            if (!isInteractive) return;
            setIsFocused(true);
            inputProps?.onFocus?.(event);
          }}
          onSubmitEditing={submit}
          placeholder={placeholderText}
          placeholderTextColor={colors.textMuted}
          returnKeyType={inputProps?.returnKeyType ?? "send"}
          selectionColor={colors.text}
          style={[
            monoTextStyle,
            {
              flex: 1,
              paddingVertical: 12,
              paddingRight: TRAILING_GAP,
              color: colors.text,
            },
            inputProps?.style,
          ]}
          textAlignVertical="center"
          value={resolvedValue}
        />

        {canSend ? (
          <ComposerActionButton
            accessibilityLabel="Send"
            backgroundColor={colors.accentSubtle}
            iconColor={colors.text}
            iconName="arrow-up-right"
            onPress={submit}
          />
        ) : (
          <Text
            style={[
              monoTextStyle,
              { color: colors.text, marginLeft: TRAILING_GAP, letterSpacing: 0.5 },
            ]}
          >
            {">_"}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
});
```

Details worth keeping:

- **Controlled/uncontrolled dual mode.** `isControlled = value !== undefined`. Onboarding drives it controlled; the internal state is the fallback.
- **`blurOnSubmit: false`** — submitting keeps the keyboard up, so a wrong verify answer can be retyped immediately.
- **`returnKeyType: "send"`**, and `onSubmitEditing` submits, so the keyboard's own key works.
- **Whole shell is pressable** and focuses the input — the tap target is 60px tall, not just the text.
- **`>_` cursor ↔ send button.** With empty input you see a terminal cursor; typing swaps it for a circular send button that fades in. That swap is the bar's only state change and it does a lot of work.
- **Haptic on send** (`tap()`), not on every keystroke.

### 11.31 `cards/SeedPhraseCard.tsx`

```tsx
/**
 * SeedPhraseCard — 12-word recovery phrase display with mask toggle,
 * copy + primary actions, and an optional slide-to-confirm rail.
 *
 * The grid is always 4 rows × 3 cols. Short word lists pad with blank
 * chips so the card maintains its visual rhythm. Copy uses
 * `expo-clipboard`; the host should bring its own success haptic / toast.
 *
 * Presentational only: word generation, persistence, and any haptics
 * live in the caller.
 */

import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

import { Icon } from "@/design/icons";
import { Colors } from "@/design/tokens";
import { LabelCap, Mono, Subtitle } from "@/design/typography";

import { GhostActionButton } from "../GhostActionButton";
import { GhostSlideConfirm } from "../GhostSlideConfirm";
import { GhostToggle } from "../GhostToggle";

const GRID_ROWS = 4;
const GRID_COLS = 3;
const GRID_SIZE = GRID_ROWS * GRID_COLS;
const DEFAULT_FEEDBACK_MS = 1600;
const ACTION_ICON_SIZE = 14;

export type SeedPhraseChip = {
  readonly label: string;
  readonly hiddenLabel?: string;
};

export type SeedPhraseCardProps = Omit<ViewProps, "children" | "style"> & {
  readonly title: string;
  readonly subtitle?: string;
  readonly chips: readonly SeedPhraseChip[];
  readonly maskValues?: boolean;
  readonly visibilityLabel?: string;
  readonly visibilityEnabled?: boolean;
  readonly onVisibilityChange?: (next: boolean) => void;
  readonly primaryActionLabel: string;
  readonly secondaryActionLabel: string;
  readonly onPrimaryActionPress?: () => void;
  readonly onSecondaryActionPress?: () => void;
  readonly slideConfirmLabel?: string;
  readonly showSlideConfirm?: boolean;
  readonly onSlideConfirm?: () => void;
  readonly feedbackMs?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly className?: string;
};

function defaultMaskWord(word: string): string {
  const trimmed = word.trim();
  if (!trimmed) return "";
  return "•".repeat(Math.max(4, Math.min(trimmed.length, 8)));
}

export const SeedPhraseCard = function SeedPhraseCard({
  title,
  subtitle,
  chips,
  maskValues = false,
  visibilityLabel = "Mask recovery phrase",
  visibilityEnabled = false,
  onVisibilityChange,
  primaryActionLabel,
  secondaryActionLabel,
  onPrimaryActionPress,
  onSecondaryActionPress,
  slideConfirmLabel = "Slide to continue",
  showSlideConfirm = false,
  onSlideConfirm,
  feedbackMs = DEFAULT_FEEDBACK_MS,
  style,
  className,
  ...viewProps
}: SeedPhraseCardProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToggle = typeof onVisibilityChange === "function";

  const gridRows = (() => {
    const padded = Array.from(
      { length: GRID_SIZE },
      (_, index): SeedPhraseChip => chips[index] ?? { label: "" },
    );
    return Array.from({ length: GRID_ROWS }, (_, rowIndex) =>
      padded.slice(rowIndex * GRID_COLS, rowIndex * GRID_COLS + GRID_COLS),
    );
  })();

  const recoveryPhrase = chips
    .map((chip) => chip.label.trim())
    .filter((label) => label.length > 0)
    .join(" ");

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  async function handleCopy() {
    setIsCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setIsCopied(false), feedbackMs);
    try {
      await Clipboard.setStringAsync(recoveryPhrase);
    } catch {
      setIsCopied(false);
    }
    onSecondaryActionPress?.();
  }

  function handlePrimary() {
    setIsSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setIsSaved(false), feedbackMs);
    onPrimaryActionPress?.();
  }

  return (
    <View
      {...viewProps}
      className={`w-full max-w-[342px] rounded-2xl border border-border bg-surface px-4 pt-4 pb-4 ${className ?? ""}`}
      style={[{ rowGap: 11 }, style]}
    >
      <View style={{ rowGap: 4 }}>
        <LabelCap numberOfLines={1}>{title}</LabelCap>
        {subtitle ? <Subtitle>{subtitle}</Subtitle> : null}
      </View>

      {showToggle ? (
        <View className="flex-row items-center justify-between" style={{ columnGap: 10 }}>
          <LabelCap className="flex-shrink" numberOfLines={1}>
            {visibilityLabel}
          </LabelCap>
          <GhostToggle onChange={onVisibilityChange} value={visibilityEnabled} />
        </View>
      ) : null}

      <View style={{ rowGap: 9 }}>
        {gridRows.map((row, rowIndex) => (
          <View className="flex-row" key={`row-${rowIndex}`} style={{ columnGap: 9 }}>
            {row.map((chip, chipIndex) => {
              const slot = rowIndex * GRID_COLS + chipIndex + 1;
              const value = maskValues
                ? chip.hiddenLabel ?? defaultMaskWord(chip.label)
                : chip.label;
              return <SeedChip key={`chip-${slot}`} label={value} number={slot} />;
            })}
          </View>
        ))}
      </View>

      <View className="flex-row pt-1" style={{ columnGap: 10 }}>
        <GhostActionButton
          icon={<Icon color={Colors.text} name="copy" size={ACTION_ICON_SIZE} />}
          label={isCopied ? "Copied" : secondaryActionLabel}
          onPress={handleCopy}
          style={{ flex: 1, height: 40, borderRadius: 11 }}
          variant="secondary"
        />
        <GhostActionButton
          icon={
            <Icon color={Colors.textInverse} name="arrow-up-right" size={ACTION_ICON_SIZE} />
          }
          iconPosition="right"
          label={isSaved ? "Saved" : primaryActionLabel}
          onPress={handlePrimary}
          style={{ flex: 1, height: 40, borderRadius: 11 }}
          variant="primary"
        />
      </View>

      {showSlideConfirm ? (
        <GhostSlideConfirm
          label={slideConfirmLabel}
          onComplete={onSlideConfirm}
          style={{ height: 44 }}
        />
      ) : null}
    </View>
  );
};

type SeedChipProps = {
  readonly number: number;
  readonly label: string;
};

function SeedChip({ number, label }: SeedChipProps) {
  return (
    <View
      className="flex-1 flex-row items-center rounded-md border border-border bg-bg px-2"
      style={{ height: 30, columnGap: 6 }}
    >
      <Mono className="text-textMuted" style={{ fontSize: 9, minWidth: 14 }}>
        {number.toString().padStart(2, "0")}
      </Mono>
      <Mono
        className="text-text flex-shrink"
        numberOfLines={1}
        style={{ fontSize: 11, fontWeight: "500" }}
      >
        {label}
      </Mono>
    </View>
  );
}
```

`GhostToggle` and `GhostSlideConfirm` are only reachable via `onVisibilityChange` / `showSlideConfirm`, neither of which onboarding passes — you can stub both imports out when porting.

### 11.32 `cards/VerificationQuizCard.tsx`

```tsx
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Fonts } from "@/constants/theme";
import { Icon, IconSize } from "@/design/icons";
import type { ColorMap } from "@/design/tokens";
import { px, Radii, Spacing } from "@/design/tokens";
import { Mono, Subtitle } from "@/design/typography";
import { useDesignColors } from "@/hooks/use-design-colors";

const CARD_PAD = px(Spacing["3"]!);
const SECTION_GAP = px(Spacing["3"]!);
const HEADER_GAP = px(Spacing["1"]!);
const GRID_GAP = px(Spacing["2"]!);
const OPTION_HEIGHT = 40;
const OPTION_RADIUS = px(Radii.full!);
const OPTION_PAD_H = px(Spacing["3"]!);

export type VerificationQuizOption = {
  readonly id: string;
  readonly label: string;
};

export type VerificationResult = "pending" | "correct" | "incorrect" | "expired";

export type VerificationQuizCardProps = {
  readonly promptLabel: string;
  readonly question: string;
  readonly options: readonly VerificationQuizOption[];
  readonly selectedOptionId?: string;
  readonly onSelectOption?: (id: string) => void;
  readonly timerLabel?: string;
  readonly timerExpired?: boolean;
  readonly result?: VerificationResult;
  readonly disabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly className?: string;
};

export const VerificationQuizCard = function VerificationQuizCard({
  promptLabel,
  question,
  options,
  selectedOptionId,
  onSelectOption,
  timerLabel,
  timerExpired = false,
  result = "pending",
  disabled = false,
  style,
  className,
}: VerificationQuizCardProps) {
  const colors = useDesignColors();
  const optionRows = (() => {
    const rows: VerificationQuizOption[][] = [];
    for (let i = 0; i < options.length; i += 2) {
      rows.push([...options.slice(i, i + 2)]);
    }
    return rows;
  })();

  return (
    <View
      className={`self-start rounded-xl border border-border bg-surfaceCard ${className ?? ""}`}
      style={[styles.card, { padding: CARD_PAD, rowGap: SECTION_GAP }, style]}
    >
      <View style={{ rowGap: HEADER_GAP }}>
        <View style={styles.headerRow}>
          <Mono
            className="text-label-cap text-textMuted font-medium uppercase"
            numberOfLines={1}
          >
            {promptLabel}
          </Mono>
          {timerLabel ? (
            <View
              className="rounded-full border border-border bg-surfaceFocused"
              style={[
                styles.timerPill,
                timerExpired ? { borderColor: colors.accentNegative } : null,
              ]}
            >
              <Icon
                color={timerExpired ? colors.accentNegative : colors.textMuted}
                name="clock"
                size={IconSize.xs}
              />
              <Mono
                className={timerExpired ? "text-accentNegative" : "text-textSecondary"}
                style={styles.timerText}
              >
                {timerLabel}
              </Mono>
            </View>
          ) : null}
        </View>
        <Subtitle className="font-semibold text-text" numberOfLines={2}>
          {question}
        </Subtitle>
      </View>

      <View style={styles.grid}>
        {optionRows.map((row, rowIndex) => (
          <View key={`quiz-row-${rowIndex}`} style={styles.gridRow}>
            {row.map((option) => {
              const isSelected = option.id === selectedOptionId;
              const showCorrect = isSelected && result === "correct";
              const showWrong = isSelected && result === "incorrect";
              return (
                <QuizOptionButton
                  colors={colors}
                  disabled={disabled || result !== "pending"}
                  key={option.id}
                  label={option.label}
                  onPress={() => onSelectOption?.(option.id)}
                  selected={isSelected}
                  tone={showCorrect ? "correct" : showWrong ? "incorrect" : "neutral"}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
};

type QuizTone = "neutral" | "correct" | "incorrect";

type QuizOptionButtonProps = {
  readonly label: string;
  readonly selected: boolean;
  readonly tone: QuizTone;
  readonly disabled: boolean;
  readonly colors: ColorMap;
  readonly onPress?: () => void;
};

function toneBorder(colors: ColorMap, tone: QuizTone): string {
  switch (tone) {
    case "correct":   return colors.accentPositive;
    case "incorrect": return colors.accentNegative;
    default:          return colors.border;
  }
}

function optionBackground(colors: ColorMap, selected: boolean, tone: QuizTone): string {
  if (!selected) return colors.surfaceFocused;
  if (tone === "correct") return colors.slideFillComplete;
  if (tone === "incorrect") return colors.surfaceStrong;
  return colors.accent;
}

function optionLabelColor(colors: ColorMap, selected: boolean, tone: QuizTone): string {
  return selected && tone === "neutral" ? colors.textInverse : colors.text;
}

function QuizOptionButton({
  label,
  selected,
  tone,
  disabled,
  colors,
  onPress,
}: QuizOptionButtonProps) {
  const showBorder = selected && tone !== "neutral";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={styles.optionCell}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.optionPill,
            {
              height: OPTION_HEIGHT,
              borderRadius: OPTION_RADIUS,
              paddingHorizontal: OPTION_PAD_H,
              borderWidth: showBorder ? 1 : 0,
              borderColor: showBorder ? toneBorder(colors, tone) : "transparent",
              backgroundColor: optionBackground(colors, selected, tone),
              opacity: disabled && !selected ? 0.55 : pressed ? 0.92 : 1,
            },
          ]}
        >
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            numberOfLines={1}
            style={[
              styles.optionLabel,
              {
                color: optionLabelColor(colors, selected, tone),
                fontWeight: selected ? "600" : "400",
              },
            ]}
          >
            {label}
          </Text>
          {selected && tone === "neutral" ? (
            <Icon color={colors.textInverse} name="check" size={IconSize.xs} />
          ) : null}
          {selected && tone === "correct" ? (
            <Icon color={colors.accentPositive} name="check" size={IconSize.xs} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: "100%", maxWidth: 300, alignSelf: "flex-start" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: GRID_GAP,
  },
  timerPill: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    columnGap: px(Spacing["1"]!),
    paddingHorizontal: px(Spacing["2"]!),
    paddingVertical: 3,
  },
  timerText: { fontSize: 10 },
  grid: { width: "100%", rowGap: GRID_GAP },
  gridRow: { width: "100%", flexDirection: "row", columnGap: GRID_GAP },
  optionCell: { flex: 1, flexBasis: 0, minWidth: 0 },
  optionPill: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: px(Spacing["1"]!),
  },
  optionLabel: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 16,
    flexShrink: 1,
    textAlign: "center",
  },
});
```

---

## 12. Porting notes

### 12.1 What is generic vs. wallet-specific

**Lift as-is** — nothing wallet-related:

```
types.ts                      onboardingMotion.ts       onboardingProcess.ts
helpers/initial-thread.ts     helpers/thread-user-label.ts
hooks/useThreadPresentation.ts
components/intent/AssistantBlock  UserBubble  TypingIndicator
components/intent/GhostActionButton  IntentOptionCard
components/intent/CommandPrompt  CommandThreadShell  commandBarLayout
hooks/useCommandBarKeyboardOffset  useKeyboardHeight
components/StatusPill  GeneratingPill  OnboardingHeader  OnboardingGetStartedButton
```

**Rewrite for your domain:**

| File | What's app-specific | What to do |
|---|---|---|
| `OnboardingFlow.tsx` | `useImportMnemonic`, `useImportPrivateKey`, `generateMnemonic` | Replace the three async calls with your own side effects. The state machine around them is domain-agnostic. |
| `types.ts` `Stage` | the `recovery` / `verify` / `import.*` cases | Keep `referral-*`, `welcome`, `generating`, `ready`. Swap the middle for your steps. |
| `route-command-input.ts` | synonym sets | Same structure, your vocabulary. |
| `StageInline.tsx` | the card switch | Same shape, your cards. |
| `verify-*.ts`, `useVerifyQuizTimer` | mnemonic quiz | Delete unless you need a "prove you wrote it down" gate. |
| `SeedPhraseCard`, `VerificationQuizCard`, `RecoveryRevealGate` | crypto-specific | Delete unless you keep the quiz. |
| `OnboardingReadyCard` | wallet balance/address | Replace with whatever your "you're set up" summary is. |
| `OnboardingLandingScreen` | `GhostBlinkSvg` mascot, copy | Your art, your words. Keep the sizing math. |

### 12.2 Design tokens you must supply

`useDesignColors()` returns a `ColorMap`. The onboarding path reads exactly these keys:

```
bg  surface  surfaceStrong  surfaceFocused  surfaceCard
border  borderStrong
text  textSecondary  textMuted  textInverse
accent  accentSubtle  accentPositive  accentNegative
backdrop
floatingPillBg  floatingPillText          (IntentOptionCard "primary")
slideFillComplete                          (correct-answer pill background)
onboardingAccent  onboardingAccentSoft  onboardingAccentBorder
onboardingWarn    onboardingWarnSoft    onboardingWarnBorder
onboardingSuccessSoft  onboardingSuccessBorder
```

The eight `onboarding*` tokens, verbatim from this app:

```js
// dark
onboardingAccent:        "#9945FF",
onboardingAccentSoft:    "rgba(153, 69, 255, 0.16)",
onboardingAccentBorder:  "rgba(153, 69, 255, 0.36)",
onboardingWarn:          "#FACC15",
onboardingWarnSoft:      "rgba(250, 204, 21, 0.12)",
onboardingWarnBorder:    "rgba(250, 204, 21, 0.30)",
onboardingSuccessSoft:   "rgba(34, 197, 94, 0.14)",
onboardingSuccessBorder: "rgba(34, 197, 94, 0.32)",

// light
onboardingAccent:        "#7C3AED",
onboardingAccentSoft:    "rgba(124, 58, 237, 0.10)",
onboardingAccentBorder:  "rgba(124, 58, 237, 0.28)",
onboardingWarn:          "#CA8A04",
onboardingWarnSoft:      "rgba(202, 138, 4, 0.12)",
onboardingWarnBorder:    "rgba(202, 138, 4, 0.28)",
onboardingSuccessSoft:   "rgba(31, 164, 90, 0.12)",
onboardingSuccessBorder: "rgba(31, 164, 90, 0.28)",
```

The pattern: a saturated base, a ~12–16% alpha fill, a ~28–36% alpha border. Light mode darkens the base (purple `#9945FF → #7C3AED`, yellow `#FACC15 → #CA8A04`) and drops the alphas slightly, because the same alpha reads heavier on white.

**`floatingPillBg`/`floatingPillText` invert per theme** — white-on-black in dark mode, near-black-on-white in light. That's what makes the `primary` option card pop in both themes.

### 12.3 Other cross-cutting dependencies

| Import | What it is | Porting |
|---|---|---|
| `@/design/typography` | `Body` / `Meta` / `Mono` / `Subtitle` / `LabelCap` / `HeadlineHero` — `Text` wrappers with preset Tailwind classes | Swap for your own text components or plain `<Text>` with inline styles. |
| `@/design/icons` | `Icon` (Feather-backed), `IconName`, `IconSize` | Any icon set. Names used: `plus`, `download`, `smartphone`, `file-text`, `key`, `arrow-right`, `arrow-up-right`, `copy`, `check`, `clock`, `eye-off`, `square`. |
| `@/design/tokens` | `px()`, `Radii`, `Spacing`, `Colors` | Or hardcode: `Radii["2xl"] ≈ 16`, `Radii.full = 999`, `Spacing[1..4] ≈ 4/8/12/16`. |
| `@/constants/theme` `Fonts` | `Fonts.regular` / `.bold` — Inter | Your font family. |
| `@/utils/appAlert` | wrapper over `Alert.alert` | `Alert.alert`. |
| `@/utils/haptics` `tap()` | light impact on send | `expo-haptics`, or drop. |
| `@/components/chat/AiPressable` | Pressable with a built-in press-scale | Plain `Pressable`. |
| `@/constants/ai-ui` `AiMotion` | `composerIconMs`, `disabledOpacity` | Inline `160` and `0.5`. |
| `@/components/shared/ScrollToBottomPill` | floating "jump to latest" chip | Optional — delete the `overlay` prop. |
| `@/hooks/use-wallet-theme` | theme object for that pill | Goes away with the pill. |

### 12.4 NativeWind

Class names like `bg-bg`, `text-text`, `border-accentNegative`, `bg-surfaceCard` map 1:1 to the token names via `tailwind.config.js`. If you're not on NativeWind, replace every `className` with the equivalent `style={{ backgroundColor: colors.bg }}` — the components already receive `colors` from `useDesignColors()`.

### 12.5 A note on `StyleSheet.create`

This repo bans `StyleSheet.create` via ESLint (`no-restricted-syntax`) and prefers inline `as const` style objects. The two files that do use it (`IntentOptionCard`, `VerificationQuizCard`) carry an explicit disable comment because their layout metrics are dense enough to justify it. If your project has no such rule, delete the comments; the code is unaffected either way.

### 12.6 Minimum viable port

If you want the *feel* without the wallet:

1. `types.ts` — trim `Stage` to your steps, keep `ThreadEvent` verbatim.
2. `onboardingMotion.ts` — copy verbatim.
3. `useThreadPresentation.ts` — copy verbatim.
4. `AssistantBlock` + `UserBubble` + `TypingIndicator` — copy verbatim.
5. `CommandThreadShell` + `commandBarLayout` + the two keyboard hooks — copy verbatim (or replace with a plain `ScrollView` + `KeyboardAvoidingView` if you skip the command bar).
6. Write your own `StageInline` switch and your own handlers in a `Flow` component.

That's roughly 600 lines and gives you the full typing-indicator chat illusion with staggered card entry.

---

## 13. Gotchas worth carrying over

**1. Pressable passes a SyntheticEvent as the first argument.**
Handlers are declared `handleReferralSkip(userLabel?: unknown)` so they can be called either from a button or from typed input. Wire them as `onPress={handler}` and React hands the event in as `userLabel` — which then renders as `[object Object]` in a chat bubble. Two defenses: `GhostActionButton`/`IntentOptionCard` wrap as `onPress={() => onPress()}`, **and** every handler runs its label through `resolveThreadUserLabel(override, default)`. Keep both.

**2. `setBusy(false)` in `finally` is deliberately unguarded.**

```ts
} finally {
  // Unguarded on purpose: mountedRef is a one-way latch, so guarding this
  // reset can strand the flow with Continue disabled.
  setBusy(false);
}
```

`mountedRef` never flips back to `true`, so `if (!mountedRef.current) return` before a `setBusy(false)` can permanently disable the UI on a re-mount. A state update after unmount is a harmless no-op in modern React — let it run.

**3. Mirror `stage` into a ref for timer callbacks.**

```ts
const verifyStageRef = useRef(stage);
useEffect(() => { verifyStageRef.current = stage; });
```

An effect with **no dependency array** — it runs after every render, so the ref is always current. Timer callbacks fired 850 ms later read `verifyStageRef.current`, not the stale `stage` closed over when the timer was scheduled. Same pattern for `finishVerifyAdvanceRef` and `onExpireRef`.

**4. Every timer must be cleaned up.**

```ts
useEffect(
  () => () => {
    mountedRef.current = false;
    if (verifyAdvanceTimerRef.current) clearTimeout(verifyAdvanceTimerRef.current);
    if (referralWelcomeTimerRef.current) clearTimeout(referralWelcomeTimerRef.current);
  },
  [],
);
```

Plus `useThreadPresentation` clearing its `timersRef` array, `useVerifyQuizTimer` clearing its interval, and every Reanimated loop calling `cancelAnimation` on unmount. `withRepeat(…, -1)` never stops on its own.

**5. Clear the previous timer before setting a new one.** `handleQuizSelect` and `handleQuizExpire` both null out `verifyAdvanceTimerRef` before scheduling. Without it, a fast tap during the feedback window leaves two timers racing to advance the same round.

**6. `verifyQuizResetKey` must include everything that should reset the timer.** `${roundIndex}-${position}-${correctId}` — dropping `correctId` means a retry of the same position reuses the mounted card and inherits the old countdown.

**7. Don't auto-scroll on `events.length`.** The array grows *before* layout does. Use `onContentSizeChange`, and guard on `prevH > 0` so mount doesn't jump.

**8. Don't auto-scroll if the user scrolled away.** The `<= 300` distance check. Yanking someone back down while they're re-reading their recovery phrase is the single most annoying thing a chat UI can do.

**9. Only the last assistant message gets a card.** If you let every message keep its buttons, users tap stale options and the state machine goes sideways. `activeAssistantId` is the whole guard.

**10. Keep the presentation hook generic.** `useThreadPresentation<Variant extends string>` is parameterized so a second scripted thread (this app has one for account management) reuses it without copy-paste. Worth doing from day one.

**11. Mask user input before it becomes a chat bubble.** Recovery phrases → first/last/count. Private keys → flat dots. The transcript is screenshot-able and stays on screen for the rest of the flow.

**12. Distractors from the user's own data.** If you build any "prove you saved it" quiz, draw the wrong answers from the same set as the right one. Dictionary distractors are guessable by elimination.

---

*Traced from GhostWallet at branch `feature/wallet-experience-polish`. Every code block above is verbatim from the working app except where explicitly noted (the `StopButton` branch omitted from `CommandPrompt`, and formatting compaction in `route-command-input.ts` synonym sets and `OnboardingFlow`'s send switch).*


---
