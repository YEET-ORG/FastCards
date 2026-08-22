// All onboarding copy in the app's voice ("Your money, one conversation
// away."). Explicit \n where the break is authored, not left to wrapping.

export const onboardingCopy = {
  headerTitle: 'Set up',
  headerMeta: 'getting started',

  // The name is threaded through every place the flow speaks to the person
  // directly, and every one of them has to survive not having it: a session
  // can resolve without a name, and "Hi  —" is worse than no name at all.
  greeting: (name: string) =>
    name
      ? `Hi ${name} — welcome to FastCards. Want to order your first card, add a family member, or take a quick tour?`
      : 'Welcome to FastCards. Want to order your first card, add a family member, or take a quick tour?',
  welcomeAgain: (name: string) =>
    `No problem${name ? `, ${name}` : ''} — what's next?`,

  choiceOrderTitle: 'Order my first card',
  choiceOrderSubtitle: "Pick a design — it's ready instantly",
  choiceFamilyTitle: 'Invite a family member',
  choiceFamilySubtitle: 'Their own card, budget and approvals',
  choiceTourTitle: 'Just show me around',
  choiceTourSubtitle: 'A quick tour of the household',

  explainerOrder:
    "Your first card lives in the Cards tab. Pick a design, set your channels, and it's ready to spend instantly.",
  explainerFamily:
    "Everyone gets their own card, budget and approvals. Open Family and tap Add member whenever you're ready.",
  explainerTour:
    'FastCards runs on one pot of money — personal and family balances on Home, with Cards, Family and Activity alongside it, and the + button handles everything else in plain language.',

  explainerPills: {
    'order-card': { label: 'Your card is one tap away', meta: 'CARDS' },
    'invite-family': { label: 'Members get their own cards & limits', meta: 'FAMILY' },
    tour: { label: 'Ask is your command center', meta: 'ASK' },
  } as const,

  explainerContinueLabel: 'Continue',
  explainerBackLabel: 'Pick something else',

  // "your" on purpose: the step writes the owner's monthly limit (there is no
  // server intent for a household-budget write), while Home reads the seeded
  // household budgetCap — so the copy must not claim it sets the household.
  budgetQuestion: "Let's set your monthly budget. How much feels right?",
  budgetBack: 'Sure — how much feels right?',
  budgetAmounts: [
    { amount: 5000, label: 'Light touch' },
    { amount: 15000, label: 'Comfortable' },
    { amount: 50000, label: 'Generous' },
  ] as const,
  budgetCustomTitle: 'Custom amount',
  budgetCustomSubtitle: 'Type any amount',

  workingLabel: 'Setting your budget',
  workingMeta: 'WORKING',
  workingText: 'Setting your budget…',

  budgetDoneText: 'Your monthly budget is set.',
  budgetDonePill: { label: 'Budget updated', meta: 'DONE' },

  reviewText: 'Ready to add funds? Do it now, or later.',
  reviewStartLabel: 'Continue',
  reviewChangeLabel: 'Change budget',
  fundNowLabel: 'Add fund now',
  fundLaterLabel: 'Later',
  receiveTitle: 'Receive funds',
  receiveCheckLabel: 'Check for deposits',
  receiveDetected: 'Deposit received',
  receiveSkipLabel: 'Later',

  readyText: (name: string) =>
    `All set${name ? `, ${name}` : ''}. Your money, one conversation away.`,
  readyContinueLabel: 'Continue',

  invalidMessage: "I didn't quite catch that. Try an option above, or just type it out.",
} as const;