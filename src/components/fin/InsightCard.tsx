import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';

import { TextButton } from './Buttons';

export function InsightCard({
  statement,
  rows,
  actions,
  onDismiss,
}: {
  statement: string;
  rows?: { label: string; value: string }[];
  actions?: { label: string; onPress: () => void }[];
  onDismiss?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.cream, borderColor: colors.line }]}>
      <View style={styles.eyebrowRow}>
        <View style={styles.eyebrow}>
          <Ionicons name="sparkles-outline" size={13} color={colors.mintInk} />
          <AppText variant="label" tone={colors.mintInk}>
            AI Insight
          </AppText>
        </View>
        {onDismiss ? (
          <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss insight">
            <Ionicons name="close" size={16} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      <AppText variant="body">{statement}</AppText>

      {rows && rows.length > 0 ? (
        <View style={[styles.rows, { borderTopColor: colors.line }]}>
          {rows.slice(0, 3).map((r) => (
            <View key={r.label} style={styles.row}>
              <AppText variant="secondary" tone={colors.textTertiary}>
                {r.label}
              </AppText>
              <AppText variant="secondary" tabular>
                {r.value}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      {actions && actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.slice(0, 2).map((a) => (
            <TextButton key={a.label} label={a.label} onPress={a.onPress} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: space.l,
    gap: space.m,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rows: {
    gap: 6,
    borderTopWidth: 1,
    paddingTop: space.m,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.m,
  },
  actions: {
    flexDirection: 'row',
    gap: space.xxl,
  },
});
