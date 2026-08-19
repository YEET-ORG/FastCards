// Shared constants expected by Reacticx components (e.g. base/badge).
import type { ViewStyle } from 'react-native';

export const borderRadiusStyles = {
  none: { borderRadius: 0 },
  sm: { borderRadius: 4 },
  md: { borderRadius: 8 },
  lg: { borderRadius: 12 },
  xl: { borderRadius: 16 },
  '2xl': { borderRadius: 20 },
  '3xl': { borderRadius: 24 },
  full: { borderRadius: 9999 },
} satisfies Record<string, ViewStyle>;

export type BorderRadiusKey = keyof typeof borderRadiusStyles;
