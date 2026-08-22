import { Ionicons } from '@expo/vector-icons';
import { memo, useRef } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { AppText } from '@/design/AppText';
import { useColors, useDepth } from '@/design/theme';
import { font, icon, radius, space } from '@/design/tokens';
import { useMoney } from '@/domain/currency';
import { relativeTime } from '@/domain/money';
import type { Member, Transaction } from '@/domain/types';
import type { MorphOrigin } from '@/features/home-sheets/sheetMotion';

const categoryIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  Food: 'restaurant-outline',
  Transport: 'bus-outline',
  Shopping: 'bag-handle-outline',
  Entertainment: 'play-outline',
  Groceries: 'cart-outline',
  Health: 'medkit-outline',
  Deposit: 'arrow-down-circle-outline',
};

export const TransactionRow = memo(function TransactionRow({
  txn,
  member,
  onPress,
  showMember = true,
}: {
  txn: Transaction;
  member?: Member;
  /**
   * The sheet the row can open expands out of the row's own rect, so the row
   * measures itself at touch-down and hands the frame over with the press.
   * `measureInWindow` answers on a later tick; the gap between touch-down and
   * the finger lifting is long enough that the rect is already there by the
   * time `onPress` needs it. A tap fast enough to beat it just gets
   * `undefined` and the sheet's older bottom-up rise — a graceful downgrade,
   * never a broken animation.
   */
  onPress?: (event: GestureResponderEvent, rect?: MorphOrigin) => void;
  showMember?: boolean;
}) {
  const { formatSigned } = useMoney();
  const colors = useColors();
  const iconShade = useDepth('raise1');
  const pressShade = useDepth('press');
  const declined = txn.status === 'declined';
  const credit = txn.direction === 'credit';
  const rowRef = useRef<View>(null);
  const rectRef = useRef<MorphOrigin | null>(null);

  // Cleared first: a stale rect from an earlier press on a REUSED row would
  // point at wherever that row used to be.
  const handlePressIn = () => {
    rectRef.current = null;
    rowRef.current?.measureInWindow((x, y, width, height) => {
      rectRef.current = { x, y, width, height };
    });
  };

  const handlePress = (event: GestureResponderEvent) => {
    onPress?.(event, rectRef.current ?? undefined);
  };

  const subtitleParts = [
    showMember && member ? member.name : null,
    txn.category,
    declined ? null : txn.status === 'pending' ? 'Pending' : null,
  ].filter(Boolean);

  return (
    <Pressable
      ref={rowRef}
      onPress={onPress ? handlePress : undefined}
      onPressIn={onPress ? handlePressIn : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${txn.merchant}, ${formatSigned(txn.amount, txn.direction)}${declined ? ', declined' : ''}${credit ? ', received' : ''}`}
      style={({ pressed }) => [
        styles.row,
        // White has no cream/raised contrast to swap between, so the pressed
        // state leans on depth; on Black the `inset` fill does the work.
        pressed && { backgroundColor: colors.inset, boxShadow: pressShade },
      ]}>
      <View style={[styles.icon, { backgroundColor: colors.raised, boxShadow: iconShade }]}>
        <Ionicons
          name={categoryIcons[txn.category] ?? 'card-outline'}
          size={icon.meta}
          color={declined ? colors.textTertiary : colors.iconPrimary}
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
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingVertical: 10,
    paddingHorizontal: space.s,
    marginHorizontal: -space.s,
    borderRadius: radius.control,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
