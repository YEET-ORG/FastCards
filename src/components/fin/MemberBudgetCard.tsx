import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { color, space } from '@/design/tokens';
import { formatMoney } from '@/domain/money';
import type { Member } from '@/domain/types';

import { Avatar, ProgressBar, RuleChip, StatusBadge } from './primitives';

// MemberBudgetCard (spec UI §18): remaining spending power leads; red is
// reserved for breach/blocked, warning only near the limit.

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
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: color.surface2 }]}>
      <View style={styles.topRow}>
        <Avatar initials={member.initials} accent={member.accentColor} />
        <View style={styles.nameBlock}>
          <AppText variant="cardTitle">{member.name}</AppText>
          <AppText variant="secondary" tone={color.textTertiary}>
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
              <AppText variant="secondary" tone={color.textTertiary}>
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
        <AppText variant="secondary" tone={color.textTertiary}>
          No monthly limit · spent {formatMoney(member.spentThisMonth)} this month
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.borderSoft,
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
