import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { AppText } from '@/design/AppText';
import { color, font, radius } from '@/design/tokens';

// Button system (spec UI §41): one mint primary per surface; loading
// buttons keep their width and label context.

interface ButtonProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function PrimaryButton({ label, onPress, disabled, loading, style }: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles.primary,
        pressed && { backgroundColor: color.mintBright },
        disabled && !loading && { opacity: 0.45 },
        style,
      ]}>
      {loading ? <ActivityIndicator size="small" color={color.onMint} /> : null}
      <AppText variant="cardTitle" tone={color.onMint} style={styles.labelText}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled, loading, style }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles.secondary,
        pressed && { backgroundColor: color.surface3 },
        disabled && { opacity: 0.45 },
        style,
      ]}>
      {loading ? <ActivityIndicator size="small" color={color.textPrimary} /> : null}
      <AppText variant="cardTitle" style={styles.labelText}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function TextButton({
  label,
  onPress,
  tone = color.mint,
  destructive,
}: {
  label: string;
  onPress?: () => void;
  tone?: string;
  destructive?: boolean;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={styles.textBtn}>
      {({ pressed }) => (
        <AppText
          variant="secondary"
          tone={destructive ? color.error : tone}
          style={[{ fontFamily: font.medium }, pressed && { opacity: 0.6 }]}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radius.control + 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
  },
  primary: {
    backgroundColor: color.mint,
  },
  secondary: {
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.borderSoft,
  },
  labelText: {
    textAlign: 'center',
  },
  textBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
});
