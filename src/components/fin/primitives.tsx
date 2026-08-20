import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { Avatar as ReacticxAvatar } from '@/shared/ui/base/avatar';
import Badge from '@/shared/ui/base/badge';
import { AnimatedProgressBar } from '@/shared/ui/organisms/progress';

export function Avatar({
  initials: _initials,
  name,
  accent,
  backgroundColor,
  textColor,
  size = 42,
  selected,
  onPress,
}: {
  initials?: string;
  name?: string;
  accent?: string;
  backgroundColor?: string;
  textColor?: string;
  size?: number;
  selected?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  return (
    <ReacticxAvatar
      image={{ uri: '', name: name ?? _initials ?? '?' }}
      size={size}
      backgroundColor={backgroundColor ?? colors.inset}
      textColor={textColor ?? accent ?? colors.textPrimary}
      showBorder
      borderColor={selected ? (textColor ?? colors.accentInk) : colors.line}
      borderWidth={selected ? 1.5 : 1}
      onPress={onPress ? () => onPress() : undefined}
      disabled={!onPress}
    />
  );
}

export type BadgeStatus =
  | 'active'
  | 'frozen'
  | 'pending'
  | 'approval'
  | 'declined'
  | 'expired'
  | 'closed'
  | 'temporary';

export function StatusBadge({ status, label }: { status: BadgeStatus; label?: string }) {
  const colors = useColors();
  const cfg: Record<
    BadgeStatus,
    { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'pending'; fg: string; icon: keyof typeof Ionicons.glyphMap }
  > = {
    active: { label: 'Active', variant: 'success', fg: colors.mintInk, icon: 'checkmark-circle-outline' },
    frozen: { label: 'Frozen', variant: 'default', fg: colors.infoInk, icon: 'snow-outline' },
    pending: { label: 'Pending', variant: 'pending', fg: colors.warningInk, icon: 'time-outline' },
    approval: { label: 'Needs approval', variant: 'warning', fg: colors.warningInk, icon: 'hand-left-outline' },
    declined: { label: 'Declined', variant: 'error', fg: colors.errorInk, icon: 'close-circle-outline' },
    expired: { label: 'Expired', variant: 'default', fg: colors.textTertiary, icon: 'timer-outline' },
    closed: { label: 'Closed', variant: 'default', fg: colors.textTertiary, icon: 'lock-closed-outline' },
    temporary: { label: 'Temporary', variant: 'success', fg: colors.mintInk, icon: 'hourglass-outline' },
  };
  const item = cfg[status];
  return (
    <Badge
      label={label ?? item.label}
      variant={item.variant}
      size="sm"
      radius="full"
      icon={<Ionicons name={item.icon} size={12} color={item.fg} />}
      textStyle={{ color: item.fg, fontSize: 11 }}
    />
  );
}

export function ProgressBar({
  value,
  warnAt = 0.85,
  style,
}: {
  value: number;
  warnAt?: number;
  style?: ViewStyle;
}) {
  const colors = useColors();
  const [trackWidth, setTrackWidth] = useState(0);
  const clamped = Math.min(Math.max(value, 0), 1);
  const fill = value >= 1 ? colors.error : value >= warnAt ? colors.warning : colors.mint;
  return (
    <View
      style={style}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}>
      {trackWidth > 0 ? (
        <AnimatedProgressBar
          progress={clamped}
          width={trackWidth}
          height={4}
          borderRadius={2}
          progressColor={fill}
          trackColor={colors.inset}
          animationDuration={600}
        />
      ) : (
        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.inset }} />
      )}
    </View>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="section">{title}</AppText>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          {({ pressed }) => (
            <AppText variant="secondary" tone={pressed ? colors.accent : colors.accentInk}>
              {actionLabel}
            </AppText>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

export type RuleChipState = 'active' | 'off' | 'temporary' | 'inherited';

export function RuleChip({
  label,
  state = 'active',
  onPress,
}: {
  label: string;
  state?: RuleChipState;
  onPress?: () => void;
}) {
  const colors = useColors();
  const fg =
    state === 'off' ? colors.textTertiary : state === 'temporary' ? colors.mintInk : colors.textPrimary;
  const border = state === 'temporary' ? colors.mintBorder : colors.line;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`Rule: ${label}${state === 'off' ? ', off' : state === 'temporary' ? ', temporary' : ''}`}
      style={({ pressed }) => [
        styles.ruleChip,
        { borderColor: border, backgroundColor: colors.cream, opacity: pressed ? 0.7 : 1 },
        state === 'temporary' && { backgroundColor: colors.mintDim },
      ]}>
      {state === 'off' ? <Ionicons name="remove-circle-outline" size={13} color={fg} /> : null}
      {state === 'temporary' ? <Ionicons name="hourglass-outline" size={13} color={fg} /> : null}
      <AppText variant="secondary" tone={fg}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.7 }]}>
      <View
        style={[
          styles.quickActionIcon,
          { backgroundColor: colors.cream, borderColor: colors.line },
        ]}>
        <Ionicons name={icon} size={22} color={colors.textPrimary} />
      </View>
      <AppText variant="caption" tone={colors.textSecondary}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.m,
  },
  ruleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  quickAction: {
    alignItems: 'center',
    gap: 8,
    flex: 1,
    paddingVertical: space.s,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
