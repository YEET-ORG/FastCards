import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { font, space } from '@/design/tokens';

/**
 * The notification pill's content node. Rendered inside the toast viewport
 * (a sibling of the domain provider), so it must be purely presentational —
 * the host derives every string and passes plain values.
 */
export function AiInsightPill({
  icon,
  title,
  subtitle,
  amount,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  amount?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <View style={[styles.iconChip, { backgroundColor: colors.accentDim }]}>
        <Ionicons name={icon} size={14} color={colors.accentInk} />
      </View>
      <View style={styles.texts}>
        <AppText variant="body" tone={colors.textPrimary} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" tone={colors.textTertiary} numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {amount ? (
        <AppText
          variant="secondary"
          tabular
          tone={colors.textSecondary}
          style={{ fontFamily: font.medium }}>
          {amount}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    flex: 1,
  },
  iconChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 1,
  },
});