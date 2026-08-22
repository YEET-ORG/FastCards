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
      ? `Hi ${name} — welcome to FastCards. What would you like to do first?`
      : 'Welcome to FastCards. What would you like to do first?',
  welcomeAgain: (name: string) =>
    `No problem${name ? `, ${name}` : ''}. What would you like to do first?`,

  choiceOrderTitle: 'Order my first card',
  choiceOrderSubtitle: "Pick a design — it's ready instantly",
  choiceFamilyTitle: 'Invite a family member',
  choiceFamilySubtitle: 'Their own card, budget and approvals',
  choiceTourTitle: 'Just show me around',
  choiceTourSubtitle: 'A quick tour of the household',

  explainerOrder:
    "Your first card gets issued from the Cards tab. Pick a design, set the channels, and it's ready to spend instantly.",
  explainerFamily:
    "Family members get their own cards, budgets and approvals. Open Family and tap Add member whenever you're ready.",
  explainerTour:
    'FastCards runs on one pot of money: personal and family balances live on Home, with Cards, Family and Activity alongside it, and the + button handles everything else in plain language.',

  explainerPills: {
    'order-card': { label: 'Your card is one tap away', meta: 'CARDS' },
    'invite-family': { label: 'Members get their own cards & limits', meta: 'FAMILY' },
    tour: { label: 'Ask is your command center', meta: 'ASK' },
  } as const,

  explainerContinueLabel: 'Continue',
  explainerBackLabel: 'Pick something else',

  budgetQuestion: "Let's set a monthly budget for the household. What feels right?",
  budgetBack: 'Sure — pick an amount.',
  budgetAmounts: [
    { amount: 5000, label: 'Light touch' },
    { amount: 15000, label: 'Comfortable' },
    { amount: 50000, label: 'Generous' },
  ] as const,

  workingLabel: 'Setting your budget',
  workingMeta: 'WORKING',
  workingText: 'Setting your budget…',

  budgetDoneText: 'Your monthly budget is set.',
  budgetDonePill: { label: 'Budget updated', meta: 'DONE' },

  reviewText: "Here's your household at a glance.",
  reviewFactHousehold: 'Household',
  reviewFactMembers: 'Members',
  reviewFactBudget: 'Monthly budget',
  reviewFactTotal: 'Total available',
  reviewStartLabel: 'Start using FastCards',
  reviewChangeLabel: 'Change budget',

  readyText: (name: string) =>
    `All set${name ? `, ${name}` : ''}. Your money, one conversation away.`,
  readyContinueLabel: 'Continue',

  invalidMessage: "Couldn't understand that. Try an option above or rephrase.",
} as const;