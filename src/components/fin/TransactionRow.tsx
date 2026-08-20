import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { font, space } from '@/design/tokens';
import { formatSigned, relativeTime } from '@/domain/money';
import type { Member, Transaction } from '@/domain/types';

const categoryIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  Food: 'restaurant-outline',
  Transport: 'bus-outline',
  Shopping: 'bag-handle-outline',
  Entertainment: 'play-outline',
  Groceries: 'cart-outline',
  Health: 'medkit-outline',
  Deposit: 'arrow-down-circle-outline',
};

export function TransactionRow({
  txn,
  member,
  onPress,
  showMember = true,
}: {
  txn: Transaction;
  member?: Member;
  onPress?: () => void;
  showMember?: boolean;
}) {
  const colors = useColors();
  const declined = txn.status === 'declined';
  const credit = txn.direction === 'credit';

  const subtitleParts = [
    showMember && member ? member.name : null,
    txn.category,
    declined ? null : txn.status === 'pending' ? 'Pending' : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${txn.merchant}, ${formatSigned(txn.amount, txn.direction)}${declined ? ', declined' : ''}${credit ? ', received' : ''}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.cream }]}>
      <View style={[styles.icon, { backgroundColor: colors.raised, borderColor: colors.line }]}>
        <Ionicons
          name={categoryIcons[txn.category] ?? 'card-outline'}
          size={17}
          color={declined ? colors.textTertiary : colors.textSecondary}
        />
      </View>
      <View style={styles.center}>
        <AppText variant="body" numberOfLines={1} tone={declined ? colors.textSecondary : undefined}>
          {txn.merchant}
        </AppText>
        <AppText variant="secondary" tone={colors.textTertiary} numberOfLines={1}>
          {declined ? (txn.declineReason ?? 'Declined') : subtitleParts.join(' · ')}
        </AppText>
      </View>
      <View style={styles.right}>
        <AppText
          variant="body"
          tabular
          tone={colors.textPrimary}
          style={[{ fontFamily: font.medium }, declined && styles.struck]}>
          {formatSigned(txn.amount, txn.direction)}
        </AppText>
        {declined ? (
          <AppText variant="caption" tone={colors.errorInk}>
            Declined
          </AppText>
        ) : credit ? (
          <AppText variant="caption" tone={colors.mintInk}>
            Received
          </AppText>
        ) : (
          <AppText variant="caption">{relativeTime(txn.at)}</AppText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingVertical: 10,
    paddingHorizontal: space.s,
    marginHorizontal: -space.s,
    borderRadius: 14,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    gap: 1,
  },
  right: {
    alignItems: 'flex-end',
    gap: 1,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
});
