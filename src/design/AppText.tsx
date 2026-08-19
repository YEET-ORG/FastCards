import { Text, type TextProps, type TextStyle } from 'react-native';

import { color, font } from './tokens';

// Type scale from spec §46. Money values use tabular numerals via the
// `tabular` prop so columns of amounts always align.
export type TextVariant =
  | 'hero' // hero balance
  | 'balance' // large balance
  | 'screenTitle'
  | 'section'
  | 'cardTitle'
  | 'body'
  | 'secondary'
  | 'caption'
  | 'label'; // tiny uppercase metadata

const variants: Record<TextVariant, TextStyle> = {
  hero: { fontSize: 46, fontFamily: font.bold, letterSpacing: -1.2, color: color.textPrimary },
  balance: { fontSize: 36, fontFamily: font.bold, letterSpacing: -0.8, color: color.textPrimary },
  screenTitle: { fontSize: 28, fontFamily: font.bold, letterSpacing: -0.4, color: color.textPrimary },
  section: { fontSize: 18, fontFamily: font.semibold, color: color.textPrimary },
  cardTitle: { fontSize: 16, fontFamily: font.semibold, color: color.textPrimary },
  body: { fontSize: 15, fontFamily: font.regular, color: color.textPrimary, lineHeight: 21 },
  secondary: { fontSize: 13, fontFamily: font.regular, color: color.textSecondary, lineHeight: 18 },
  caption: { fontSize: 11, fontFamily: font.medium, color: color.textTertiary },
  label: {
    fontSize: 11,
    fontFamily: font.semibold,
    color: color.textTertiary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
};

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: string;
  tabular?: boolean;
}

export function AppText({ variant = 'body', tone, tabular, style, ...rest }: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[
        variants[variant],
        tone ? { color: tone } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    />
  );
}
