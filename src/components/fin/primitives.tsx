import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from '@/design/AppText';
import { color, radius, space } from '@/design/tokens';
import { Avatar as ReacticxAvatar } from '@/shared/ui/base/avatar';
import Badge from '@/shared/ui/base/badge';
import { AnimatedProgressBar } from '@/shared/ui/organisms/progress';

// Thin product wrappers over Reacticx primitives so screens keep one
// consistent API while the underlying components carry the motion.

// ---------------------------------------------------------------- Avatar

export function Avatar({
  initials: _initials,
  name,
  accent,
  size = 42,
  selected,
  onPress,
}: {
  initials?: string;
  name?: string;
  accent?: string;
  size?: number;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <ReacticxAvatar
      image={{ uri: '', name: name ?? _initials ?? '?' }}
      size={size}
      backgroundColor={color.surface3}
      textColor={accent ?? color.textPrimary}
      showBorder
      borderColor={selected ? color.mint : color.borderSoft}
      borderWidth={selected ? 1.5 : 1}
      onPress={onPress ? () => onPress() : undefined}
      disabled={!onPress}
    />
  );
}

// ------------------------------------------------------------ StatusBadge

export type BadgeStatus =
  | 'active'
  | 'frozen'
  | 'pending'
  | 'approval'
  | 'declined'
  | 'expired'
  | 'closed'
  | 'temporary';

const badgeConfig: Record<
  BadgeStatus,
  { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'pending'; fg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  active: { label: 'Active', variant: 'success', fg: color.mint, icon: 'checkmark-circle-outline' },
  frozen: { label: 'Frozen', variant: 'default', fg: color.info, icon: 'snow-outline' },
  pending: { label: 'Pending', variant: 'pending', fg: color.warning, icon: 'time-outline' },
  approval: { label: 'Needs approval', variant: 'warning', fg: color.warning, icon: 'hand-left-outline' },
  declined: { label: 'Declined', variant: 'error', fg: color.error, icon: 'close-circle-outline' },
  expired: { label: 'Expired', variant: 'default', fg: color.textTertiary, icon: 'timer-outline' },
  closed: { label: 'Closed', variant: 'default', fg: color.textTertiary, icon: 'lock-closed-outline' },
  temporary: { label: 'Temporary', variant: 'success', fg: color.mint, icon: 'hourglass-outline' },
};

export function StatusBadge({ status, label }: { status: BadgeStatus; label?: string }) {
  const cfg = badgeConfig[status];
  return (
    <Badge
      label={label ?? cfg.label}
      variant={cfg.variant}
      size="sm"
      radius="full"
      icon={<Ionicons name={cfg.icon} size={12} color={cfg.fg} />}
      textStyle={{ color: cfg.fg, fontSize: 11 }}
    />
  );
}

// ------------------------------------------------------------ ProgressBar

export function ProgressBar({
  value,
  warnAt = 0.85,
  style,
}: {
  value: number;
  warnAt?: number;
  style?: ViewStyle;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const clamped = Math.min(Math.max(value, 0), 1);
  const fill = value >= 1 ? color.error : value >= warnAt ? color.warning : color.mint;
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
          trackColor={color.surface3}
          animationDuration={600}
        />
      ) : (
        <View style={{ height: 4, borderRadius: 2, backgroundColor: color.surface3 }} />
      )}
    </View>
  );
}

// ---------------------------------------------------------- SectionHeader

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="section">{title}</AppText>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          {({ pressed }) => (
            <AppText variant="secondary" tone={pressed ? color.mintBright : color.mint}>
              {actionLabel}
            </AppText>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

// -------------------------------------------------------------- RuleChip

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
  const fg =
    state === 'off' ? color.textTertiary : state === 'temporary' ? color.mint : color.textPrimary;
  const border = state === 'temporary' ? color.mintBorder : color.borderSoft;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`Rule: ${label}${state === 'off' ? ', off' : state === 'temporary' ? ', temporary' : ''}`}
      style={({ pressed }) => [
        styles.ruleChip,
        { borderColor: border, opacity: pressed ? 0.7 : 1 },
        state === 'temporary' && { backgroundColor: color.mintDim },
      ]}>
      {state === 'off' ? <Ionicons name="remove-circle-outline" size={13} color={fg} /> : null}
      {state === 'temporary' ? <Ionicons name="hourglass-outline" size={13} color={fg} /> : null}
      <AppText variant="secondary" tone={fg}>
        {label}
      </AppText>
    </Pressable>
  );
}

// ------------------------------------------------------------ QuickAction
// Kast-style circular action buttons.

export function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.7 }]}>
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon} size={22} color={color.textPrimary} />
      </View>
      <AppText variant="caption" tone={color.textSecondary}>
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
    borderColor: color.borderSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: color.surface1,
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
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
