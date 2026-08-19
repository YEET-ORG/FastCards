// Kast-inspired dark system: neutral true-black surfaces, soft white
// type, one mint accent, and a quiet gold reserved for the premium
// (owner) card material. All screens consume these tokens.

export const color = {
  // Core surfaces — neutral blacks, no color cast
  bg: '#050506',
  raised: '#0B0B0D',
  surface1: '#111113',
  surface2: '#161619',
  surface3: '#1D1D21',
  borderSoft: '#232327',
  borderStrong: '#2F2F35',

  // Typography
  textPrimary: '#F7F7F8',
  textSecondary: '#A0A1A8',
  textTertiary: '#6F7077',
  textDisabled: '#4C4D53',

  // Brand accent
  mint: '#46E6A2',
  mintBright: '#6EF0B6',
  mintDim: '#0F2A20',
  mintBorder: '#1F5C43',
  onMint: '#04160F',

  // Premium card material (Kast gold nod — cards only, never chrome)
  gold: '#C9A96A',
  goldDim: '#241E12',

  // Semantic
  success: '#46E6A2',
  warning: '#F3B84B',
  warningDim: '#2E2510',
  error: '#FF6B70',
  errorDim: '#2E1315',
  info: '#7AA7FF',
} as const;

export const space = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 20,
  xxl: 24,
  x32: 32,
  x40: 40,
} as const;

export const screenPad = 20;

export const radius = {
  chip: 10,
  control: 14,
  tile: 18,
  card: 22,
  sheet: 28,
  pill: 999,
} as const;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const duration = {
  state: 160,
  nav: 240,
  sheet: 320,
} as const;

export const icon = {
  default: 21,
  meta: 17,
} as const;
