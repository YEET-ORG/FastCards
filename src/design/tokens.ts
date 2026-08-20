// Sunlit Household (default) + Night Household. Color lives on objects
// (members, cards, chips, active nav, primary buttons, progress). Paper,
// body copy, money amounts, and execute facts stay quiet.

export type ThemeName = 'sunlit' | 'night';

export type MemberHueId =
  | 'rohan'
  | 'maya'
  | 'arjun'
  | 'dad'
  | 'subscriptions'
  | 'protected'
  | 'groceries'
  | 'teen'
  | 'merchant'
  | 'pool'
  | 'custom'
  | 'temporary';

export interface MemberHue {
  fill: string;
  ink: string;
  dim: string;
}

export interface ColorTokens {
  bg: string;
  cream: string;
  raised: string;
  inset: string;
  line: string;
  lineStrong: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;

  accent: string;
  accentBright: string;
  accentDim: string;
  accentInk: string;
  onAccent: string;

  mint: string;
  mintBright: string;
  mintDim: string;
  mintBorder: string;
  mintInk: string;
  onMint: string;

  warning: string;
  warningDim: string;
  warningInk: string;
  error: string;
  errorDim: string;
  errorInk: string;
  info: string;
  infoDim: string;
  infoInk: string;

  overlay: string;
  scrim: string;
  onCard: string;
  chipGold: string;
  chipGoldStroke: string;

  member: Record<MemberHueId, MemberHue>;

  /** @deprecated alias of cream — keep through post-revamp cleanup */
  surface1: string;
  /** @deprecated alias of raised */
  surface2: string;
  /** @deprecated alias of inset */
  surface3: string;
  /** @deprecated alias of line */
  borderSoft: string;
  /** @deprecated alias of lineStrong */
  borderStrong: string;
  /** @deprecated alias of mint */
  success: string;
  /** @deprecated alias of chipGold */
  gold: string;
  goldDim: string;
}

function withAliases(
  tokens: Omit<
    ColorTokens,
    'surface1' | 'surface2' | 'surface3' | 'borderSoft' | 'borderStrong' | 'success' | 'gold' | 'goldDim'
  > & { goldDim: string },
): ColorTokens {
  return {
    ...tokens,
    surface1: tokens.cream,
    surface2: tokens.raised,
    surface3: tokens.inset,
    borderSoft: tokens.line,
    borderStrong: tokens.lineStrong,
    success: tokens.mint,
    gold: tokens.chipGold,
  };
}

const sunlitMember: Record<MemberHueId, MemberHue> = {
  rohan: { fill: '#E08A2A', ink: '#9A5A10', dim: '#F8E6CC' },
  maya: { fill: '#D4536A', ink: '#A03048', dim: '#F8D6DC' },
  arjun: { fill: '#2A8F7B', ink: '#176A5A', dim: '#D4EDE6' },
  dad: { fill: '#C4A574', ink: '#7A6540', dim: '#F0E6D4' },
  subscriptions: { fill: '#4A4E8A', ink: '#32366A', dim: '#DCDEEE' },
  protected: { fill: '#D4A04A', ink: '#8A6418', dim: '#F8E8CC' },
  groceries: { fill: '#5A8F5E', ink: '#3A6A3E', dim: '#DCEADC' },
  teen: { fill: '#E0896C', ink: '#A05038', dim: '#F8DED4' },
  merchant: { fill: '#7A4A6A', ink: '#5A2E4C', dim: '#E8D6E0' },
  pool: { fill: '#C4785A', ink: '#8A4A32', dim: '#F4DCD0' },
  custom: { fill: '#C45A6E', ink: '#8A3044', dim: '#F4D6DC' },
  temporary: { fill: '#C8B44A', ink: '#7A6A18', dim: '#F4EEC8' },
};

const nightMember: Record<MemberHueId, MemberHue> = {
  rohan: { fill: '#F0A04A', ink: '#F0A04A', dim: '#3A2A14' },
  maya: { fill: '#F07A90', ink: '#F07A90', dim: '#3A1C24' },
  arjun: { fill: '#3DB89A', ink: '#3DB89A', dim: '#14302A' },
  dad: { fill: '#DCC09A', ink: '#DCC09A', dim: '#32281C' },
  subscriptions: { fill: '#6A70B8', ink: '#8A90D0', dim: '#1C1E38' },
  protected: { fill: '#E8B85A', ink: '#E8B85A', dim: '#3A2E14' },
  groceries: { fill: '#78B07A', ink: '#78B07A', dim: '#1C2E1C' },
  teen: { fill: '#F0A488', ink: '#F0A488', dim: '#3A241C' },
  merchant: { fill: '#A06090', ink: '#C080B0', dim: '#2A1824' },
  pool: { fill: '#E09070', ink: '#E09070', dim: '#3A241C' },
  custom: { fill: '#E07890', ink: '#E07890', dim: '#3A1C24' },
  temporary: { fill: '#E0CC66', ink: '#E0CC66', dim: '#322E14' },
};

export const sunlit: ColorTokens = withAliases({
  bg: '#FFF8F1',
  cream: '#FFF1E4',
  raised: '#FFFFFF',
  inset: '#F4E6D8',
  line: '#E8D5C4',
  lineStrong: '#D4B8A2',

  textPrimary: '#1C1612',
  textSecondary: '#6B5E55',
  textTertiary: '#8F8278',
  textDisabled: '#C4B6AA',

  accent: '#E06A3A',
  accentBright: '#EC7A4C',
  accentDim: '#F8E0D4',
  accentInk: '#C24E28',
  onAccent: '#FFF8F1',

  mint: '#1B9A6C',
  mintBright: '#22B37D',
  mintDim: '#D7F0E4',
  mintBorder: '#8FCFB0',
  mintInk: '#0F7A54',
  onMint: '#FFF8F1',

  warning: '#D8902A',
  warningDim: '#F8E9CC',
  warningInk: '#9A6410',
  error: '#D6454A',
  errorDim: '#F8D6D7',
  errorInk: '#B42328',
  info: '#3D6FDB',
  infoDim: '#D9E4FA',
  infoInk: '#2A54B8',

  overlay: 'rgba(28,22,18,0.46)',
  scrim: 'rgba(28,22,18,0.70)',
  onCard: '#F4EDE4',
  chipGold: '#E8C98A',
  chipGoldStroke: '#C9A96A',
  goldDim: '#F8E6CC',

  member: sunlitMember,
});

export const night: ColorTokens = withAliases({
  bg: '#1C1612',
  cream: '#221C17',
  raised: '#261E18',
  inset: '#1A1511',
  line: '#3A3028',
  lineStrong: '#4A3E34',

  textPrimary: '#F4EDE4',
  textSecondary: '#C4B6AA',
  textTertiary: '#8F8278',
  textDisabled: '#5C524A',

  accent: '#F07A4A',
  accentBright: '#F58B60',
  accentDim: '#3A241C',
  accentInk: '#F07A4A',
  onAccent: '#1C1612',

  mint: '#3DD68C',
  mintBright: '#5EE4A4',
  mintDim: '#1A3A2C',
  mintBorder: '#2A6A4C',
  mintInk: '#3DD68C',
  onMint: '#1C1612',

  warning: '#E8B44A',
  warningDim: '#3A2E14',
  warningInk: '#E8B44A',
  error: '#FF7A7E',
  errorDim: '#3A1C1E',
  errorInk: '#FF7A7E',
  info: '#8AB0FF',
  infoDim: '#1C2840',
  infoInk: '#8AB0FF',

  overlay: 'rgba(8,6,4,0.72)',
  scrim: 'rgba(12,8,6,0.78)',
  onCard: '#F4EDE4',
  chipGold: '#E8C98A',
  chipGoldStroke: '#C9A96A',
  goldDim: '#3A2A14',

  member: nightMember,
});

export const palettes: Record<ThemeName, ColorTokens> = { sunlit, night };

/** Static default = Sunlit, including aliases. Night requires useColors(). */
export const color = sunlit;

export const space = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 20,
  xxl: 24,
  x32: 32,
  x40: 40,
  /** Scene paddingBottom above an occupying tab bar so content clears the overlay dock. */
  dockClearance: 72,
} as const;

export const screenPad = 20;

export const radius = {
  chip: 10,
  control: 14,
  tile: 18,
  card: 22,
  dock: 24,
  sheet: 28,
  pill: 999,
} as const;

export const font = {
  displayRegular: 'Fraunces_400Regular',
  displayMedium: 'Fraunces_500Medium',
  displaySemibold: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export const duration = {
  state: 180,
  nav: 240,
  sheet: 280,
} as const;

export const shadow = {
  sunlit: {
    dock: { color: 'rgba(28,22,18,0.10)', offset: { width: 0, height: 8 }, opacity: 1, radius: 20, elevation: 8 },
    tile: { color: 'rgba(28,22,18,0.06)', offset: { width: 0, height: 4 }, opacity: 1, radius: 12, elevation: 3 },
    sheet: { color: 'rgba(28,22,18,0.18)', offset: { width: 0, height: -8 }, opacity: 1, radius: 24, elevation: 16 },
  },
  night: {
    dock: { color: 'rgba(0,0,0,0.40)', offset: { width: 0, height: 8 }, opacity: 1, radius: 20, elevation: 8 },
    tile: { color: 'rgba(0,0,0,0.28)', offset: { width: 0, height: 4 }, opacity: 1, radius: 12, elevation: 3 },
    sheet: { color: 'rgba(0,0,0,0.50)', offset: { width: 0, height: -8 }, opacity: 1, radius: 24, elevation: 16 },
  },
} as const;

export const icon = { default: 21, meta: 17, tab: 22 } as const;

export const spring = { damping: 22, stiffness: 280, mass: 0.8 };
export const springSheet = { damping: 26, stiffness: 240, mass: 0.9 };
