import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { font, radius, type ColorTokens } from '@/design/tokens';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function PrimaryButton({ label, onPress, disabled, loading, style }: ButtonProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
        pressed && { backgroundColor: colors.accentBright },
        disabled && !loading && { opacity: 0.45 },
        style,
      ]}>
      {loading ? <ActivityIndicator size="small" color={colors.onAccent} /> : null}
      <AppText variant="cardTitle" tone={colors.onAccent} style={styles.labelText}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled, loading, style }: ButtonProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles.secondary,
        pressed && { backgroundColor: colors.inset },
        disabled && { opacity: 0.45 },
        style,
      ]}>
      {loading ? <ActivityIndicator size="small" color={colors.textPrimary} /> : null}
      <AppText variant="cardTitle" style={styles.labelText}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function TextButton({
  label,
  onPress,
  tone,
  destructive,
}: {
  label: string;
  onPress?: () => void;
  tone?: string;
  destructive?: boolean;
}) {
  const colors = useColors();
  const resolved = destructive ? colors.errorInk : (tone ?? colors.accentInk);
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={stylesStatic.textBtn}>
      {({ pressed }) => (
        <AppText
          variant="secondary"
          tone={resolved}
          style={[{ fontFamily: font.medium }, pressed && { opacity: 0.6 }]}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
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
      backgroundColor: colors.accent,
    },
    secondary: {
      backgroundColor: colors.raised,
      borderWidth: 1,
      borderColor: colors.line,
    },
    labelText: {
      textAlign: 'center',
      fontSize: 16,
      lineHeight: 22,
      fontFamily: font.medium,
    },
  });
}

const stylesStatic = StyleSheet.create({
  textBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
});
