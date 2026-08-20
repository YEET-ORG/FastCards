import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { useReduceMotion } from '@/design/motion';
import { useColors } from '@/design/theme';
import { font } from '@/design/tokens';
import { RollingCounter } from '@/shared/ui/organisms/rolling-counter';

export function RollingMoney({
  amount,
  fontSize = 44,
  tone,
  hidden,
  variant = 'display',
}: {
  amount: number;
  fontSize?: number;
  tone?: string;
  hidden?: boolean;
  variant?: 'display' | 'ui';
}) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const resolvedTone = tone ?? colors.textPrimary;
  const family = variant === 'display' || variant === 'ui' ? font.displaySemibold : font.medium;
  const height = Math.round(fontSize * 1.18);
  const digitWidth = Math.round(fontSize * (variant === 'display' ? 0.58 : 0.62));
  const formatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(
    Math.abs(Math.round(amount)),
  );

  if (hidden) {
    return (
      <AppText
        variant="hero"
        tone={resolvedTone}
        style={{ fontSize, lineHeight: height + 6, fontFamily: family }}
        accessibilityLabel="Balance hidden">
        ₹ ••••••
      </AppText>
    );
  }

  if (reduceMotion) {
    return (
      <AppText
        variant="hero"
        tone={resolvedTone}
        tabular
        style={{ fontSize, lineHeight: height, fontFamily: family }}
        accessibilityLabel={`₹${formatted}`}>
        ₹{formatted}
      </AppText>
    );
  }

  return (
    <View style={styles.row} accessibilityLabel={`₹${formatted}`} accessible accessibilityRole="text">
      <AppText
        variant="hero"
        tone={resolvedTone}
        style={{ fontSize: Math.round(fontSize * 0.82), lineHeight: height, marginRight: 2, fontFamily: family }}>
        ₹
      </AppText>
      {formatted.split('').map((ch, i) =>
        /\d/.test(ch) ? (
          <RollingCounter
            key={`d-${i}`}
            value={Number(ch)}
            fontSize={fontSize}
            height={height}
            width={digitWidth}
            color={resolvedTone}
            digitStyle={{ fontFamily: family, fontWeight: undefined }}
          />
        ) : (
          <AppText
            key={`s-${i}`}
            tone={resolvedTone}
            style={{ fontSize: Math.round(fontSize * 0.9), lineHeight: height, fontFamily: family }}>
            {ch}
          </AppText>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
});
