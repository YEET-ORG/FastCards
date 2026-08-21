// Two modes: White (default) and Black. Color lives on objects (members,
// cards, chips, active nav, primary buttons, progress). Paper, body copy,
// money amounts, and execute facts stay quiet.
//
// White is the skeuomorphic mode: pure white surfaces on a cool near-white
// ground, where hierarchy is carried by `depth` (multi-layer shadow +
// top-edge highlight) rather than by fill or borders.
//
// Black inverts the *mechanism* without inverting the components. A drop
// shadow carries no information on #000, so hierarchy is carried by real
// fill deltas instead: bg (#000) < inset < cream < raised. A "well" only
// ever appears inside a panel, so `inset` sitting below `cream`/`raised`
// still reads recessed there. `depth.black` keeps black drops for the halo
// under floating elements but leans on a much stronger top-edge highlight.

export type ThemeName = 'white' | 'black';

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

  /** Default tone for non-semantic glyphs (quick actions, nav, row icons). */
  iconPrimary: string;

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

// Retuned cooler and a little less saturated so the warm hues sit calmly on
// a white ground next to a blue accent instead of fighting it.
const whiteMember: Record<MemberHueId, MemberHue> = {
  rohan: { fill: '#D97A2B', ink: '#9C5312', dim: '#FBEBD9' },
  maya: { fill: '#CE4C63', ink: '#A22C43', dim: '#FBE0E5' },
  arjun: { fill: '#218B77', ink: '#146555', dim: '#D8EFE9' },
  dad: { fill: '#B39468', ink: '#75603C', dim: '#F1E9DC' },
  subscriptions: { fill: '#4A4E8A', ink: '#32366A', dim: '#E1E2F0' },
  protected: { fill: '#C99530', ink: '#8A6418', dim: '#FAEDD3' },
  groceries: { fill: '#4F8A55', ink: '#356038', dim: '#DFEDE0' },
  teen: { fill: '#D97F60', ink: '#A04E36', dim: '#FBE3D9' },
  merchant: { fill: '#75486A', ink: '#552E4C', dim: '#EBDCE7' },
  pool: { fill: '#BC7156', ink: '#8A4A32', dim: '#F7E2D9' },
  custom: { fill: '#BE5468', ink: '#8A3044', dim: '#F8DFE4' },
  temporary: { fill: '#B9A63F', ink: '#786A18', dim: '#F4F0D4' },
};

// Same twelve identities on black. `fill` carries the hue at full strength,
// `ink` is a lighter step for text/glyphs on a dark chip, and `dim` is a
// deeply desaturated tint of the hue — dark enough to sit on #000 without
// reading as a warm or brown wash.
const blackMember: Record<MemberHueId, MemberHue> = {
  rohan: { fill: '#F0A04A', ink: '#F5B87A', dim: '#241A0C' },
  maya: { fill: '#F07A90', ink: '#F59DAD', dim: '#28111A' },
  arjun: { fill: '#3DB89A', ink: '#6FD1B8', dim: '#0C221D' },
  dad: { fill: '#DCC09A', ink: '#E8D3B8', dim: '#221C14' },
  subscriptions: { fill: '#6A70B8', ink: '#949AD8', dim: '#14152A' },
  protected: { fill: '#E8B85A', ink: '#F0CC88', dim: '#241D0E' },
  groceries: { fill: '#78B07A', ink: '#9CC99E', dim: '#121F13' },
  teen: { fill: '#F0A488', ink: '#F5BFAB', dim: '#241610' },
  merchant: { fill: '#A06090', ink: '#C88BB8', dim: '#1F1220' },
  pool: { fill: '#E09070', ink: '#EBB098', dim: '#241510' },
  custom: { fill: '#E07890', ink: '#EB9CAF', dim: '#241318' },
  temporary: { fill: '#E0CC66', ink: '#EBDB94', dim: '#221F0E' },
};

export const white: ColorTokens = withAliases({
  bg: '#F7F8FA',
  // cream and raised are both pure white here: under White the difference
  // between a panel and the thing on top of it is expressed by `depth`,
  // never by fill.
  cream: '#FFFFFF',
  raised: '#FFFFFF',
  inset: '#EDEFF3',
  line: '#E4E7EC',
  lineStrong: '#D2D7DF',

  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B6B',
  textTertiary: '#9A9DA3',
  textDisabled: '#C4C7CC',

  iconPrimary: '#2C2C2C',

  accent: '#3B6FD4',
  accentBright: '#4E82E8',
  accentDim: '#E4ECFB',
  accentInk: '#2A55B0',
  onAccent: '#FFFFFF',

  mint: '#0F9D63',
  mintBright: '#17B374',
  mintDim: '#DCF3E8',
  mintBorder: '#8ACFB3',
  mintInk: '#0A7A4C',
  onMint: '#FFFFFF',

  warning: '#C9860F',
  warningDim: '#FBEED2',
  warningInk: '#8F5E06',
  error: '#D33F45',
  errorDim: '#FBDCDE',
  errorInk: '#AE2229',
  info: '#3B6FD4',
  infoDim: '#E4ECFB',
  infoInk: '#2A55B0',

  overlay: 'rgba(16,24,40,0.44)',
  scrim: 'rgba(16,24,40,0.68)',
  onCard: '#FFFFFF',
  chipGold: '#E8C98A',
  chipGoldStroke: '#C9A96A',
  goldDim: '#F5EBD6',

  member: whiteMember,
});

export const black: ColorTokens = withAliases({
  // The ground is true black. Surfaces ascend from it by fill, because a
  // drop shadow on #000 separates nothing: inset (recessed inside a panel)
  // < cream (the panel) < raised (the thing on the panel).
  bg: '#000000',
  cream: '#121212',
  raised: '#1A1A1A',
  inset: '#0A0A0A',
  line: '#262626',
  lineStrong: '#3A3A3A',

  textPrimary: '#FFFFFF',
  textSecondary: '#A6A6A6',
  textTertiary: '#757575',
  textDisabled: '#4A4A4A',

  iconPrimary: '#FFFFFF',

  accent: '#5B8DEF',
  accentBright: '#7BA5F5',
  accentDim: '#101A2E',
  accentInk: '#9CBCF8',
  onAccent: '#000000',

  mint: '#34D399',
  mintBright: '#5BE3B0',
  mintDim: '#0C2419',
  mintBorder: '#1F6B4C',
  mintInk: '#4FDFA6',
  onMint: '#000000',

  warning: '#F5B544',
  warningDim: '#2A1F0A',
  warningInk: '#F7C468',
  error: '#FF6B70',
  errorDim: '#2A1113',
  errorInk: '#FF8A8E',
  info: '#5B8DEF',
  infoDim: '#101A2E',
  infoInk: '#9CBCF8',

  overlay: 'rgba(0,0,0,0.62)',
  scrim: 'rgba(0,0,0,0.82)',
  onCard: '#FFFFFF',
  chipGold: '#E8C98A',
  chipGoldStroke: '#C9A96A',
  goldDim: '#241D10',

  member: blackMember,
});

export const palettes: Record<ThemeName, ColorTokens> = { white, black };

/** Static default = White, including aliases. Black needs useColors(). */
export const color = white;

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

/**
 * Physical depth, expressed as CSS-style `boxShadow` strings.
 *
 * RN 0.86 on the New Architecture supports comma-separated multi-layer
 * shadows and `inset`, which the legacy `shadow*`/`elevation` props cannot
 * do — one outer layer only, no inner shadow. Skeuomorphism needs both: a
 * soft diffuse drop plus a top-edge highlight that reads as light catching
 * the raised edge.
 *
 * `raise1/2/3` ascend in elevation (rows → cards → hero/nav/FAB), `well` is
 * a recessed track (segmented control, inputs), `press` is the pushed-in
 * state. Apply with the `useDepth()` hook so the mode is picked up.
 */
export type DepthLevel = 'raise1' | 'raise2' | 'raise3' | 'well' | 'press';

export const depth: Record<ThemeName, Record<DepthLevel, string>> = {
  white: {
    raise1:
      '0px 1px 2px rgba(16,24,40,0.04), 0px 4px 10px rgba(16,24,40,0.05), inset 0px 1px 0px rgba(255,255,255,0.9)',
    raise2:
      '0px 2px 4px rgba(16,24,40,0.05), 0px 10px 24px rgba(16,24,40,0.07), inset 0px 1px 0px rgba(255,255,255,1)',
    raise3:
      '0px 4px 8px rgba(16,24,40,0.06), 0px 18px 40px rgba(16,24,40,0.10), inset 0px 1px 0px rgba(255,255,255,1)',
    well: 'inset 0px 2px 4px rgba(16,24,40,0.08), inset 0px -1px 0px rgba(255,255,255,0.8)',
    press: 'inset 0px 2px 6px rgba(16,24,40,0.12)',
  },
  // On black a drop shadow is almost pure information loss, so the drops
  // only supply a halo under floating elements and the real edge is the
  // top-lit inset highlight, pushed far harder than a light theme needs.
  black: {
    raise1:
      '0px 1px 2px rgba(0,0,0,0.60), 0px 4px 10px rgba(0,0,0,0.50), inset 0px 1px 0px rgba(255,255,255,0.06)',
    raise2:
      '0px 2px 4px rgba(0,0,0,0.60), 0px 10px 24px rgba(0,0,0,0.55), inset 0px 1px 0px rgba(255,255,255,0.08)',
    raise3:
      '0px 4px 8px rgba(0,0,0,0.65), 0px 18px 40px rgba(0,0,0,0.70), inset 0px 1px 0px rgba(255,255,255,0.10)',
    well: 'inset 0px 2px 6px rgba(0,0,0,0.80), inset 0px -1px 0px rgba(255,255,255,0.05)',
    press: 'inset 0px 2px 8px rgba(0,0,0,0.85)',
  },
};

export const icon = { default: 21, meta: 17, tab: 22 } as const;

export const spring = { damping: 22, stiffness: 280, mass: 0.8 };
export const springSheet = { damping: 26, stiffness: 240, mass: 0.9 };
