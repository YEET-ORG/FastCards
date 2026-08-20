import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';
import { formatMoney } from '@/domain/money';
import type { Member } from '@/domain/types';

import { Avatar, ProgressBar, RuleChip, StatusBadge } from './primitives';

export function MemberBudgetCard({
  member,
  cardFrozen,
  hasPendingApproval,
  onPress,
}: {
  member: Member;
  cardFrozen?: boolean;
  hasPendingApproval?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  const hue = colors.member[member.hueId] ?? colors.member.pool;
  const limit = member.monthlyLimit;
  const effectiveLimit = limit !== undefined ? limit + (member.tempAllowance?.amount ?? 0) : undefined;
  const remaining = effectiveLimit !== undefined ? effectiveLimit - member.spentThisMonth : undefined;
  const usage = effectiveLimit ? member.spentThisMonth / effectiveLimit : 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        remaining !== undefined
          ? `${member.name}, ${formatMoney(remaining)} left of ${formatMoney(effectiveLimit ?? 0)}`
          : member.name
      }
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.cream, borderColor: colors.line },
        pressed && { backgroundColor: colors.raised },
      ]}>
      <View style={styles.topRow}>
        <Avatar
          initials={member.initials}
          name={member.name}
          backgroundColor={hue.dim}
          textColor={hue.ink}
        />
        <View style={styles.nameBlock}>
          <AppText variant="cardTitle">{member.name}</AppText>
          <AppText variant="secondary" tone={colors.textTertiary}>
            {member.relationship ?? (member.role === 'owner' ? 'Owner' : member.role)}
          </AppText>
        </View>
        <View style={styles.badges}>
          {hasPendingApproval ? <StatusBadge status="approval" /> : null}
          {cardFrozen ? <StatusBadge status="frozen" /> : null}
        </View>
      </View>

      {remaining !== undefined && effectiveLimit !== undefined ? (
        <View style={{ gap: space.s }}>
          <View style={styles.amountRow}>
            <AppText variant="body" tabular>
              {formatMoney(Math.max(remaining, 0))}{' '}
              <AppText variant="secondary" tone={colors.textTertiary}>
                left of {formatMoney(effectiveLimit)}
              </AppText>
            </AppText>
            {member.tempAllowance ? (
              <RuleChip
                state="temporary"
                label={`+${formatMoney(member.tempAllowance.amount)} until ${member.tempAllowance.expiresAtLabel.split(',')[0]}`}
              />
            ) : null}
          </View>
          <ProgressBar value={usage} />
        </View>
      ) : (
        <AppText variant="secondary" tone={colors.textTertiary}>
          No monthly limit · spent {formatMoney(member.spentThisMonth)} this month
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: space.l,
    gap: space.m,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  nameBlock: {
    flex: 1,
    gap: 1,
  },
  badges: {
    gap: 4,
    alignItems: 'flex-end',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s,
    flexWrap: 'wrap',
  },
});
