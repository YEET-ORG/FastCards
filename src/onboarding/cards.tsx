// Onboarding cards — all built on the app's tokens and fin components.
// OptionCard mirrors the reference's IntentOptionCard three-tier
// hierarchy (primary inverted / default elevated / accent highlighted)
// using the app's accent + raised + line language.

import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PrimaryButton, TextButton } from '@/components/fin/Buttons';
import { RollingMoney } from '@/components/fin/RollingMoney';
import { AppText } from '@/design/AppText';
import { useReduceMotion } from '@/design/motion';
import { useColors, useDepth } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { formatMoneyINR } from '@/domain/money';

// ── OptionCard ────────────────────────────────────────────────────────────

export type OptionCardVariant = 'primary' | 'default' | 'accent';

type OptionCardProps = {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly title: string;
  readonly subtitle: string;
  readonly variant?: OptionCardVariant;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
};

export function OptionCard({
  icon,
  title,
  subtitle,
  variant = 'default',
  onPress,
  disabled = false,
}: OptionCardProps) {
  const colors = useColors();
  const raise1 = useDepth('raise1');

  const v =
    variant === 'primary'
      ? {
          bg: colors.accent,
          border: colors.accent,
          title: colors.onAccent,
          subtitle: colors.onAccent,
          subtitleOpacity: 0.78,
          iconBg: colors.onAccent,
          icon: colors.accent,
          arrow: colors.onAccent,
          elevated: false,
        }
      : variant === 'accent'
        ? {
            bg: colors.raised,
            border: colors.accent,
            title: colors.textPrimary,
            subtitle: colors.accentInk,
            subtitleOpacity: 1,
            iconBg: colors.accentDim,
            icon: colors.accentInk,
            arrow: colors.accent,
            elevated: true,
          }
        : {
            bg: colors.raised,
            border: colors.line,
            title: colors.textPrimary,
            subtitle: colors.textSecondary,
            subtitleOpacity: 1,
            iconBg: colors.accentDim,
            icon: colors.accentInk,
            arrow: colors.textTertiary,
            elevated: true,
          };

  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={6}
      onPress={onPress ? () => onPress() : undefined}
      style={styles.pressable}>
      {({ pressed }) => (
        <View
          style={[
            styles.card,
            { backgroundColor: v.bg, borderColor: v.border },
            v.elevated ? { boxShadow: raise1 } : null,
            disabled && styles.disabled,
            pressed && !disabled && styles.cardPressed,
          ]}>
          <View style={[styles.iconWrap, { backgroundColor: v.iconBg }]}>
            <Ionicons name={icon} size={17} color={v.icon} />
          </View>
          <View style={styles.copy}>
            <AppText variant="cardTitle" tone={v.title} numberOfLines={2}>
              {title}
            </AppText>
            <AppText
              variant="secondary"
              tone={v.subtitle}
              style={{ opacity: v.subtitleOpacity, marginTop: 3 }}
              numberOfLines={2}>
              {subtitle}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={v.arrow} />
        </View>
      )}
    </Pressable>
  );
}

// ── StatusPill ────────────────────────────────────────────────────────────

export type StatusPillTone = 'neutral' | 'success' | 'warning' | 'error';

type StatusPillProps = {
  readonly label: string;
  readonly meta?: string;
  readonly tone?: StatusPillTone;
  readonly style?: StyleProp<ViewStyle>;
};

export function StatusPill({ label, meta, tone = 'neutral', style }: StatusPillProps) {
  const colors = useColors();
  const t =
    tone === 'success'
      ? { bg: colors.mintDim, border: colors.mintBorder, meta: colors.mintInk }
      : tone === 'warning'
        ? { bg: colors.warningDim, border: colors.warning, meta: colors.warningInk }
        : tone === 'error'
          ? { bg: colors.errorDim, border: colors.error, meta: colors.errorInk }
          : { bg: colors.raised, border: colors.line, meta: colors.textTertiary };

  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }, style]}>
      <AppText variant="secondary" style={styles.pillLabel} numberOfLines={1}>
        {label}
      </AppText>
      {meta ? (
        <AppText variant="label" tone={t.meta} style={styles.pillMeta} numberOfLines={1}>
          {meta}
        </AppText>
      ) : null}
    </View>
  );
}

// ── WorkingPill — the "process step" spinner pill ─────────────────────────

type WorkingPillProps = {
  readonly label: string;
  readonly meta?: string;
};

export function WorkingPill({ label, meta }: WorkingPillProps) {
  const colors = useColors();
  return (
    <View style={[styles.pill, styles.working, { backgroundColor: colors.raised, borderColor: colors.line }]}>
      <ActivityIndicator size="small" color={colors.accent} />
      <AppText variant="body" style={styles.workingLabel} numberOfLines={1}>
        {label}
      </AppText>
      {meta ? (
        <AppText variant="label" tone={colors.accentInk} style={styles.pillMeta} numberOfLines={1}>
          {meta}
        </AppText>
      ) : null}
    </View>
  );
}

// ── ReviewCard — fact-list summary before the finish line ─────────────────

type ReviewCardProps = {
  readonly householdName: string;
  readonly membersCount: number;
  readonly budgetAmount: number;
  readonly totalAvailable: number;
  readonly onStart: () => void;
  readonly onChange: () => void;
};

export function ReviewCard({
  householdName,
  membersCount,
  budgetAmount,
  totalAvailable,
  onStart,
  onChange,
}: ReviewCardProps) {
  const colors = useColors();
  return (
    <View style={[styles.toolCard, { backgroundColor: colors.raised, borderColor: colors.lineStrong }]}>
      <View style={styles.eyebrow}>
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.mintInk} />
        <AppText variant="label" tone={colors.mintInk}>
          Your household
        </AppText>
      </View>
      <AppText variant="section">{householdName}</AppText>
      <View style={[styles.factList, { borderTopColor: colors.line }]}>
        <FactRow label="Members" value={membersCount === 1 ? 'Just you' : `${membersCount} members`} />
        <FactRow label="Monthly budget" value={formatMoneyINR(budgetAmount)} />
        <FactRow label="Total available" value={formatMoneyINR(totalAvailable)} />
      </View>
      <PrimaryButton label="Start using FastCards" onPress={onStart} />
      <TextButton label="Change budget" onPress={onChange} />
    </View>
  );
}

// ── ReadyCard — the payoff: live balance + Continue ───────────────────────

type ReadyCardProps = {
  readonly householdName: string;
  readonly membersCount: number;
  readonly budgetAmount: number;
  readonly totalAvailable: number;
  readonly onContinue: () => void;
};

export function ReadyCard({
  householdName,
  membersCount,
  budgetAmount,
  totalAvailable,
  onContinue,
}: ReadyCardProps) {
  const colors = useColors();
  return (
    <View style={[styles.toolCard, { backgroundColor: colors.raised, borderColor: colors.lineStrong }]}>
      <View style={styles.eyebrow}>
        <Ionicons name="checkmark-circle-outline" size={14} color={colors.mintInk} />
        <AppText variant="label" tone={colors.mintInk}>
          Ready
        </AppText>
      </View>
      <AppText variant="section">{householdName}</AppText>
      <View style={styles.readyAmount}>
        <AppText variant="label">Total available</AppText>
        <RollingMoney amount={totalAvailable} fontSize={44} />
      </View>
      <View style={[styles.factList, { borderTopColor: colors.line }]}>
        <FactRow label="Members" value={membersCount === 1 ? 'Just you' : `${membersCount} members`} />
        <FactRow label="Monthly budget" value={formatMoneyINR(budgetAmount)} />
      </View>
      <PrimaryButton label="Continue" onPress={onContinue} />
    </View>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.factRow}>
      <AppText variant="secondary" tone={colors.textTertiary}>
        {label}
      </AppText>
      <AppText variant="secondary" tabular style={styles.factValue}>
        {value}
      </AppText>
    </View>
  );
}

// ── TypingIndicator — three dots pulsing left to right ────────────────────

const DOT_SIZE = 5;
const DOT_GAP = 5;
const PULSE_MS = 340;
const STAGGER_MS = 150;

export function TypingIndicator() {
  const colors = useColors();
  const reduceMotion = useReduceMotion();

  if (reduceMotion) {
    return (
      <View style={[styles.dots, { columnGap: DOT_GAP }]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.dot, { backgroundColor: colors.textTertiary, opacity: 0.5 }]} />
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.dots, { columnGap: DOT_GAP }]}>
      <Dot color={colors.textTertiary} delay={0} />
      <Dot color={colors.textTertiary} delay={STAGGER_MS} />
      <Dot color={colors.textTertiary} delay={STAGGER_MS * 2} />
    </View>
  );
}

function Dot({ color, delay }: { readonly color: string; readonly delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: PULSE_MS, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(progress);
  }, [delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.value * 0.65,
    transform: [{ translateY: -2 * progress.value }],
  }));

  return (
    <Animated.View style={[{ width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, backgroundColor: color }, style]} />
  );
}

// ── ScrollToBottomPill — escape hatch when the thread outruns the user ────

type ScrollToBottomPillProps = {
  readonly visible: boolean;
  readonly onPress: () => void;
  readonly bottomOffset: number;
};

export function ScrollToBottomPill({ visible, onPress, bottomOffset }: ScrollToBottomPillProps) {
  const colors = useColors();
  const raise1 = useDepth('raise1');
  if (!visible) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      pointerEvents="box-none"
      style={[styles.pillOverlay, { bottom: bottomOffset }]}>
      <Pressable
        accessibilityLabel="Scroll to latest"
        accessibilityRole="button"
        onPress={onPress}
        style={[styles.scrollPill, { backgroundColor: colors.raised, borderColor: colors.line, boxShadow: raise1 }]}>
        <Ionicons name="arrow-down" size={14} color={colors.textSecondary} />
        <AppText variant="caption" tone={colors.textSecondary}>
          Latest
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pressable: { width: '100%' },
  card: {
    width: '100%',
    minHeight: 66,
    borderRadius: radius.tile,
    borderWidth: 1,
    paddingHorizontal: space.l,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.88 },
  disabled: { opacity: 0.45 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    flexShrink: 0,
  },
  copy: { flex: 1, minWidth: 0, justifyContent: 'center', marginRight: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    columnGap: 10,
    marginTop: space.xs,
    maxWidth: '100%',
  },
  pillLabel: { flexShrink: 1 },
  pillMeta: { flexShrink: 0, letterSpacing: 1 },
  working: {
    minHeight: 56,
    marginTop: space.xs,
  },
  workingLabel: { flex: 1 },
  // A standalone container, deliberately NOT composed with `card` — that is
  // the OptionCard row style (flexDirection: 'row' + overflow: 'hidden'), and
  // inheriting it laid these cards out horizontally and clipped their action
  // buttons off-screen, where they were invisible and could not be tapped.
  toolCard: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'stretch',
    borderRadius: radius.tile,
    borderWidth: 1,
    padding: space.l,
    gap: space.m,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  factList: {
    gap: 7,
    borderTopWidth: 1,
    paddingTop: space.m,
  },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.m,
  },
  factValue: { flexShrink: 1, textAlign: 'right' },
  readyAmount: { gap: 6 },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 20,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  pillOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scrollPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
});