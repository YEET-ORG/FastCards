import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/design/AppText';
import { useReduceMotion } from '@/design/motion';
import { useColors, useTheme } from '@/design/theme';
import { depth, radius, space, type DepthLevel } from '@/design/tokens';
import type { MorphOrigin } from '@/features/home-sheets/sheetMotion';
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
  // The vendored Badge ships hardcoded pastel fills, which glare on black
  // (and mis-colour Frozen/Expired/Closed green on white). `style` lands
  // after the variant style, so the fill is themed here alongside the ink.
  const cfg: Record<
    BadgeStatus,
    {
      label: string;
      variant: 'default' | 'success' | 'warning' | 'error' | 'pending';
      fg: string;
      bg: string;
      icon: keyof typeof Ionicons.glyphMap;
    }
  > = {
    active: { label: 'Active', variant: 'success', fg: colors.mintInk, bg: colors.mintDim, icon: 'checkmark-circle-outline' },
    frozen: { label: 'Frozen', variant: 'default', fg: colors.infoInk, bg: colors.infoDim, icon: 'snow-outline' },
    pending: { label: 'Pending', variant: 'pending', fg: colors.warningInk, bg: colors.warningDim, icon: 'time-outline' },
    approval: { label: 'Needs approval', variant: 'warning', fg: colors.warningInk, bg: colors.warningDim, icon: 'hand-left-outline' },
    declined: { label: 'Declined', variant: 'error', fg: colors.errorInk, bg: colors.errorDim, icon: 'close-circle-outline' },
    expired: { label: 'Expired', variant: 'default', fg: colors.textTertiary, bg: colors.inset, icon: 'timer-outline' },
    closed: { label: 'Closed', variant: 'default', fg: colors.textTertiary, bg: colors.inset, icon: 'lock-closed-outline' },
    temporary: { label: 'Temporary', variant: 'success', fg: colors.mintInk, bg: colors.mintDim, icon: 'hourglass-outline' },
  };
  const item = cfg[status];
  return (
    <Badge
      label={label ?? item.label}
      variant={item.variant}
      size="sm"
      radius="full"
      icon={<Ionicons name={item.icon} size={12} color={item.fg} />}
      style={{ backgroundColor: item.bg }}
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A raised surface that physically pushes in when touched: the drop shadow
 * collapses to an inset one and the surface scales down a little. This is
 * the single definition of press feedback for the skeuomorphic surfaces —
 * use it instead of hand-rolling opacity or background swaps.
 */
export function PressableSurface({
  level = 'raise2',
  onPress,
  onPressIn,
  disabled,
  style,
  children,
  ...a11y
}: {
  level?: Exclude<DepthLevel, 'press' | 'well'>;
  onPress?: () => void;
  /** Chained AFTER the surface's own press-in scale, so callers can measure. */
  onPressIn?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  accessibilityRole?: 'button' | 'tab' | 'link' | 'switch';
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: { selected?: boolean; disabled?: boolean; checked?: boolean };
}) {
  const { mode } = useTheme();
  const reduceMotion = useReduceMotion();
  const pressed = useSharedValue(0);

  const restShadow = depth[mode][level];
  const pressShadow = depth[mode].press;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 - pressed.value * 0.03 }],
  }));

  const [isDown, setIsDown] = useState(false);

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={(event) => {
        setIsDown(true);
        pressed.value = withTiming(1, { duration: 100 });
        onPressIn?.(event);
      }}
      onPressOut={() => {
        setIsDown(false);
        pressed.value = withTiming(0, { duration: 200 });
      }}
      style={[style, { boxShadow: isDown ? pressShadow : restShadow }, animatedStyle]}
      {...a11y}>
      {children}
    </AnimatedPressable>
  );
}

export function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /**
   * The sheet a quick action opens expands out of the button's own rect, so
   * the button measures itself at touch-down and hands the frame — plus the
   * window Y of the touch — over with the press. `measureInWindow` answers on
   * a later tick; the gap between touch-down and the finger lifting is long
   * enough that the rect is already there by the time `onPress` needs it. A
   * tap fast enough to beat it just gets `undefined` and the sheet's older
   * bottom-up rise — a graceful downgrade, never a broken animation.
   */
  onPress?: (originY?: number, rect?: MorphOrigin) => void;
}) {
  const colors = useColors();
  const wrapperRef = useRef<View>(null);
  const rectRef = useRef<MorphOrigin | null>(null);
  const touchY = useRef<number | undefined>(undefined);

  // Cleared first: a stale rect from an earlier press would point at wherever
  // that row used to be.
  const handlePressIn = () => {
    rectRef.current = null;
    wrapperRef.current?.measureInWindow((x, y, width, height) => {
      rectRef.current = { x, y, width, height };
    });
  };

  const handlePress = () => {
    onPress?.(touchY.current, rectRef.current ?? undefined);
  };

  return (
    <View ref={wrapperRef} style={styles.quickAction}>
      <PressableSurface
        level="raise2"
        onPress={handlePress}
        onPressIn={(event) => {
          touchY.current = event.nativeEvent.pageY;
          handlePressIn();
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.quickActionIcon, { backgroundColor: colors.raised }]}>
        <Ionicons name={icon} size={22} color={colors.iconPrimary} />
      </PressableSurface>
      <AppText variant="caption" tone={colors.textSecondary}>
        {label}
      </AppText>
    </View>
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
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
