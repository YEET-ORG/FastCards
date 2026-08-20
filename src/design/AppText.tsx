import { PixelRatio, Text, type TextProps, type TextStyle } from 'react-native';

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

function clampSize(fontSize: number): number {
  const scale = PixelRatio.getFontScale();
  const clamped = Math.min(fontSize * scale, fontSize * 1.35);
  return fontSize <= 15 ? Math.max(15, clamped) : clamped;
}

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: string;
  tabular?: boolean;
}

export function AppText({ variant = 'body', tone, tabular, style, ...rest }: AppTextProps) {
  const colors = useColors();
  const base = variants[variant];
  const defaultTone =
    variant === 'secondary'
      ? colors.textSecondary
      : variant === 'caption' || variant === 'label'
        ? colors.textTertiary
        : colors.textPrimary;
  const fontSize = typeof base.fontSize === 'number' ? clampSize(base.fontSize) : 15;
  const lineHeight =
    typeof base.lineHeight === 'number' && typeof base.fontSize === 'number'
      ? Math.round(base.lineHeight * (fontSize / base.fontSize))
      : base.lineHeight;

  return (
    <Text
      {...rest}
      allowFontScaling={false}
      style={[
        base,
        { fontSize, lineHeight, color: tone ?? defaultTone },
        tabular
          ? {
              fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
              fontFamily:
                variant === 'hero' || variant === 'balance' || variant === 'section'
                  ? font.displaySemibold
                  : font.medium,
            }
          : null,
        style,
      ]}
    />
  );
}
