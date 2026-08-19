import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { color, font } from '@/design/tokens';
import { RollingCounter } from '@/shared/ui/organisms/rolling-counter';

// Animated money display built on Reacticx RollingCounter: each digit
// rolls when the value changes, while the ₹ symbol and Indian-format
// separators stay static.

export function RollingMoney({
  amount,
  fontSize = 44,
  tone = color.textPrimary,
  hidden,
}: {
  amount: number;
  fontSize?: number;
  tone?: string;
  hidden?: boolean;
}) {
  const height = Math.round(fontSize * 1.18);
  const digitWidth = Math.round(fontSize * 0.62);
  const formatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(
    Math.abs(Math.round(amount)),
  );

  if (hidden) {
    return (
      <AppText
        variant="hero"
        tone={tone}
        style={{ fontSize, lineHeight: height + 6 }}
        accessibilityLabel="Balance hidden">
        ₹ ••••••
      </AppText>
    );
  }

  return (
    <View
      style={styles.row}
      accessibilityLabel={`₹${formatted}`}
      accessible
      accessibilityRole="text">
      <AppText
        variant="hero"
        tone={tone}
        style={{ fontSize: Math.round(fontSize * 0.82), lineHeight: height, marginRight: 2 }}>
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
            color={tone}
            digitStyle={{ fontFamily: font.bold, fontWeight: undefined }}
          />
        ) : (
          <AppText
            key={`s-${i}`}
            tone={tone}
            style={{ fontSize: Math.round(fontSize * 0.9), lineHeight: height, fontFamily: font.bold }}>
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
