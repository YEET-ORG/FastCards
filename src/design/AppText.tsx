import { useSyncExternalStore } from 'react';
import { AppState, PixelRatio, Text, type TextProps, type TextStyle } from 'react-native';

import { useColors } from './theme';
import { font } from './tokens';

export type TextVariant =
  | 'hero'
  | 'balance'
  | 'screenTitle'
  | 'section'
  | 'cardTitle'
  | 'body'
  | 'secondary'
  | 'caption'
  | 'label';

const variants: Record<TextVariant, TextStyle> = {
  hero: { fontSize: 52, lineHeight: 58, fontFamily: font.displaySemibold, letterSpacing: -0.4 },
  balance: { fontSize: 36, lineHeight: 42, fontFamily: font.displaySemibold, letterSpacing: -0.3 },
  screenTitle: { fontSize: 30, lineHeight: 36, fontFamily: font.displaySemibold, letterSpacing: -0.2 },
  section: { fontSize: 18, lineHeight: 24, fontFamily: font.displayMedium },
  cardTitle: { fontSize: 16, lineHeight: 22, fontFamily: font.semibold },
  body: { fontSize: 15, lineHeight: 22, fontFamily: font.regular },
  secondary: { fontSize: 13, lineHeight: 18, fontFamily: font.regular },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: font.medium },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: font.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
};

const VARIANT_KEYS = Object.keys(variants) as TextVariant[];

/** Tabular overrides depend only on the variant, so they are built once. */
const tabularVariants = Object.fromEntries(
  VARIANT_KEYS.map((v) => [
    v,
    {
      fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
      fontFamily:
        v === 'hero' || v === 'balance' || v === 'section' ? font.displaySemibold : font.medium,
    },
  ]),
) as Record<TextVariant, TextStyle>;

function clampSize(fontSize: number, scale: number): number {
  const clamped = Math.min(fontSize * scale, fontSize * 1.35);
  return fontSize <= 15 ? Math.max(15, clamped) : clamped;
}

function scaleVariants(scale: number): Record<TextVariant, TextStyle> {
  const out = {} as Record<TextVariant, TextStyle>;
  for (const key of VARIANT_KEYS) {
    const base = variants[key];
    const fontSize = typeof base.fontSize === 'number' ? clampSize(base.fontSize, scale) : 15;
    const lineHeight =
      typeof base.lineHeight === 'number' && typeof base.fontSize === 'number'
        ? Math.round(base.lineHeight * (fontSize / base.fontSize))
        : base.lineHeight;
    out[key] = { ...base, fontSize, lineHeight };
  }
  return out;
}

/**
 * Scaled metrics are computed once per device font-scale value rather than
 * per render. `PixelRatio.getFontScale()` is a synchronous native read, and
 * AppText has ~230 call sites with 50-80 instances live at a time — calling
 * it in render made every theme swap pay that cost once per text node.
 *
 * The scale is re-read when the app returns to the foreground, which is the
 * only point the user can have changed it, and subscribers are notified so
 * dynamic-text support still holds.
 */
let currentScale = PixelRatio.getFontScale();
let scaledVariants = scaleVariants(currentScale);
const scaleListeners = new Set<() => void>();

AppState.addEventListener('change', (status) => {
  if (status !== 'active') return;
  const next = PixelRatio.getFontScale();
  if (next === currentScale) return;
  currentScale = next;
  scaledVariants = scaleVariants(next);
  scaleListeners.forEach((notify) => notify());
});

function subscribeToScale(notify: () => void): () => void {
  scaleListeners.add(notify);
  return () => {
    scaleListeners.delete(notify);
  };
}

function getScaledVariants(): Record<TextVariant, TextStyle> {
  return scaledVariants;
}

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: string;
  tabular?: boolean;
}

export function AppText({ variant = 'body', tone, tabular, style, ...rest }: AppTextProps) {
  const colors = useColors();
  const base = useSyncExternalStore(subscribeToScale, getScaledVariants)[variant];
  const defaultTone =
    variant === 'secondary'
      ? colors.textSecondary
      : variant === 'caption' || variant === 'label'
        ? colors.textTertiary
        : colors.textPrimary;

  return (
    <Text
      {...rest}
      allowFontScaling={false}
      style={[base, { color: tone ?? defaultTone }, tabular ? tabularVariants[variant] : null, style]}
    />
  );
}
