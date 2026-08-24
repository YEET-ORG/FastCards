// Onboarding cards — all built on the app's tokens and fin components.
// OptionCard mirrors the reference's IntentOptionCard three-tier
// hierarchy (primary inverted / default elevated / accent highlighted)
// using the app's accent + raised + line language.

import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { api, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { SecondaryButton, TextButton } from '@/components/fin/Buttons';
import { AppText } from '@/design/AppText';
import { useReduceMotion } from '@/design/motion';
import { useColors, useDepth, useTheme } from '@/design/theme';
import { useMoney } from '@/domain/currency';
import { font, space } from '@/design/tokens';
import { useDomain } from '@/domain/store';
import QRCode from '@/shared/ui/base/qr-code';

import { onboardingCopy } from './copy';

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
            bg: colors.surfaceCard,
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
            bg: colors.surfaceCard,
            border: colors.lineStrong,
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
  /** Override the meta text color — the explainer pills ink their stage name
   * in the success tone. Defaults to the tone's own meta color. */
  readonly metaTone?: string;
  /** Soft light-grey reflective shimmer glow around the pill edges. The
   * explainer pills only — off by default, so status pills elsewhere keep
   * today's quiet look. */
  readonly glow?: boolean;
  readonly style?: StyleProp<ViewStyle>;
};

/** One pass of the shimmer breath, ~2.4s round trip. */
const GLOW_BREATH_MS = 1200;

/** Soft, rounded, light-grey — never blue, never a rectangle. */
function glowShadow(black: boolean): string {
  return black
    ? '0px 0px 10px rgba(255,255,255,0.10), 0px 0px 26px rgba(255,255,255,0.06)'
    : '0px 0px 10px rgba(190,200,215,0.55), 0px 0px 26px rgba(190,200,215,0.32)';
}

function glowSheen(black: boolean): readonly [string, string, string] {
  return black
    ? (['rgba(255,255,255,0)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0)'] as const)
    : (['rgba(255,255,255,0)', 'rgba(255,255,255,0.65)', 'rgba(255,255,255,0)'] as const);
}

export function StatusPill({
  label,
  meta,
  tone = 'neutral',
  metaTone,
  glow = false,
  style,
}: StatusPillProps) {
  const colors = useColors();
  const { mode } = useTheme();
  const reduceMotion = useReduceMotion();
  const black = mode === 'black';
  const t =
    tone === 'success'
      ? { bg: colors.mintDim, border: colors.mintBorder, meta: colors.mintInk }
      : tone === 'warning'
        ? { bg: colors.warningDim, border: colors.warning, meta: colors.warningInk }
        : tone === 'error'
          ? { bg: colors.errorDim, border: colors.error, meta: colors.errorInk }
          : { bg: colors.surfaceStrong, border: colors.borderSubtle, meta: colors.textTertiary };

  // The glow breathes and a faint sheen sweeps the pill — slow, organic,
  // and completely still under reduced motion.
  const breath = useSharedValue(reduceMotion ? 1 : 0.55);
  const sweep = useSharedValue(-100);

  useEffect(() => {
    if (reduceMotion) return;
    breath.value = withRepeat(
      withSequence(withTiming(1, { duration: GLOW_BREATH_MS }), withTiming(0.55, { duration: GLOW_BREATH_MS })),
      -1,
      false,
    );
    sweep.value = withRepeat(withTiming(300, { duration: GLOW_BREATH_MS * 2 }), -1, false);
    return () => {
      cancelAnimation(breath);
      cancelAnimation(sweep);
    };
  }, [breath, sweep, reduceMotion]);

  const glowAnim = useAnimatedStyle(() => ({ opacity: breath.value }));
  const sweepAnim = useAnimatedStyle(() => ({
    transform: [{ translateX: `${sweep.value}%` }],
  }));

  return (
    <View style={[styles.glowWrap, glow ? { marginTop: space.xs } : null]}>
      {glow ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: 16, boxShadow: glowShadow(black) }, glowAnim]}
        />
      ) : null}
      <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }, glow ? { marginTop: 0 } : null, style]}>
        <AppText variant="secondary" style={styles.pillLabel} numberOfLines={1}>
          {label}
        </AppText>
        {meta ? (
          <AppText variant="label" tone={metaTone ?? t.meta} style={styles.pillMeta} numberOfLines={1}>
            {meta}
          </AppText>
        ) : null}
        {glow ? (
          <View pointerEvents="none" style={styles.sheenClip}>
            <Animated.View style={[styles.sheenBand, sweepAnim]}>
              <LinearGradient
                colors={glowSheen(black)}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
        ) : null}
      </View>
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
    <View style={[styles.pill, styles.working, { backgroundColor: colors.surfaceStrong, borderColor: colors.borderSubtle }]}>
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
          <View key={i} style={[styles.dot, { backgroundColor: colors.textSecondary, opacity: 0.5 }]} />
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.dots, { columnGap: DOT_GAP }]}>
      <Dot color={colors.textSecondary} delay={0} />
      <Dot color={colors.textSecondary} delay={STAGGER_MS} />
      <Dot color={colors.textSecondary} delay={STAGGER_MS * 2} />
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
  if (!visible) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      pointerEvents="box-none"
      style={[styles.pillOverlay, { bottom: bottomOffset }]}>
      <Pressable
        accessibilityLabel="Scroll to latest"
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.scrollPill,
          {
            backgroundColor: colors.surfaceStrong,
            borderColor: colors.borderSubtle,
            shadowColor: '#000',
          },
          pressed && { opacity: 0.8 },
        ]}>
        <Ionicons name="chevron-down" size={20} color={colors.textPrimary} />
      </Pressable>
    </Animated.View>
  );
}

// ── FundingReceiveCard — the funding step's receive surface ───────────────
//
// The same receive flow the deposit screen/sheet uses, presented in-thread:
// deposit intent (pool address + memo + asset + rate + note) with the same
// QRCode component and copy-to-clipboard values. Success is detected through
// the existing deposit sync, polled so the step returns to the card
// automatically; a manual "Check for deposits" and a "Later" escape keep the
// step from ever blocking onboarding.

interface DepositIntent {
  network: string;
  address: string;
  memo: string;
  asset: string;
  rateInrPerUnit: number;
  note: string;
}

/** How often the receive card asks the gateway whether the deposit landed. */
const DEPOSIT_POLL_MS = 5000;
/** How long the confirmed state holds before the step returns. */
const DEPOSIT_CONFIRMED_MS = 900;

function CopyValue({ value, label }: { value: string; label: string }) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onPress = useCallback(async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <Pressable
      onPress={() => void onPress()}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Double tap to copy.`}
      style={({ pressed }) => [styles.copyValue, pressed && { opacity: 0.6 }]}>
      <AppText variant="secondary" tabular style={styles.copyValueText}>
        {value}
      </AppText>
      {copied ? (
        <View style={styles.copiedSlot} pointerEvents="none">
          <View style={[styles.copiedPill, { backgroundColor: colors.mintDim }]}>
            <Ionicons name="checkmark" size={12} color={colors.mintInk} />
            <AppText variant="caption" tone={colors.mintInk}>
              Copied
            </AppText>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

export function FundingReceiveCard({
  onSuccess,
  onSkip,
}: {
  /** Called once a deposit is confirmed (or the user confirms the manual check). */
  onSuccess: () => void;
  /** Escape hatch — the user can always skip and reach the card step. */
  onSkip: () => void;
}) {
  const { headers } = useAuth();
  const { refresh } = useDomain();
  const colors = useColors();
  const { formatMoney } = useMoney();
  const [intent, setIntent] = useState<DepositIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const doneRef = useRef(false);
  const checkingRef = useRef(false);

  // Load the deposit intent once (same endpoint the deposit screen uses).
  useEffect(() => {
    let cancelled = false;
    const load = api.depositIntent(headers);
    load
      .then((next) => {
        if (!cancelled) setIntent(next);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'Could not load deposit details.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setConfirmed(true);
    setTimeout(onSuccess, DEPOSIT_CONFIRMED_MS);
  }, [onSuccess]);

  const check = useCallback(async () => {
    // Ref guard: `checking` (the button state) must not be a dependency —
    // every flip would rebuild `check` and restart the 5s poll interval.
    if (checkingRef.current || doneRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const res = await api.syncDeposits(headers);
      if (res.credited > 0) {
        await refresh();
        settle();
      }
    } catch {
      // Poll failures are silent — the manual check surfaces nothing extra.
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [headers, refresh, settle]);

  // Poll the gateway so a completed deposit returns to the card automatically.
  useEffect(() => {
    if (doneRef.current) return;
    const timer = setInterval(() => void check(), DEPOSIT_POLL_MS);
    return () => clearInterval(timer);
  }, [check]);

  const qrValue = intent
    ? `web+stellar:pay?destination=${intent.address}&memo=${encodeURIComponent(intent.memo)}&memo_type=MEMO_TEXT`
    : '';

  if (confirmed) {
    return (
      <View style={styles.receiveCard}>
        <View style={[styles.receiveConfirmed, { backgroundColor: colors.mintDim, borderColor: colors.mintBorder }]}>
          <Ionicons name="checkmark-circle-outline" size={18} color={colors.mintInk} />
          <AppText variant="body" tone={colors.mintInk} style={{ flex: 1 }}>
            {onboardingCopy.receiveDetected}
          </AppText>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.receiveCard, { rowGap: space.m }]}>
        <AppText variant="secondary" tone={colors.textTertiary}>
          {error}
        </AppText>
        <SecondaryButton
          label="Try again"
          onPress={() => {
            setError(null);
            setIntent(null);
            const load = api.depositIntent(headers);
            load
              .then(setIntent)
              .catch((e) =>
                setError(e instanceof ApiError ? e.message : 'Could not load deposit details.'),
              );
          }}
        />
      </View>
    );
  }

  if (!intent) {
    return (
      <View style={[styles.receiveCard, styles.receiveLoading]}>
        <ActivityIndicator size="small" color={colors.accent} />
        <AppText variant="secondary" tone={colors.textTertiary}>
          Loading deposit details…
        </AppText>
      </View>
    );
  }

  return (
    <View style={[styles.receiveCard, { backgroundColor: colors.raised, borderColor: colors.lineStrong }]}>
      <View style={styles.eyebrow}>
        <Ionicons name="arrow-down-outline" size={14} color={colors.accentInk} />
        <AppText variant="label" tone={colors.accentInk}>
          {onboardingCopy.receiveTitle}
        </AppText>
      </View>

      <View style={styles.receiveQrWrap}>
        <QRCode QRCodevalue={qrValue} />
      </View>

      <View style={[styles.receiveFactList, { borderTopColor: colors.line }]}>
        <CopyValue value={intent.memo} label={`Memo ${intent.memo}`} />
        <CopyValue value={intent.address} label={`Deposit address ${intent.address}`} />
        <View style={styles.receiveRow}>
          <AppText variant="secondary" tone={colors.textTertiary}>
            Asset
          </AppText>
          <AppText variant="secondary" tabular>
            {intent.asset} · Stellar {intent.network}
          </AppText>
        </View>
        <View style={styles.receiveRow}>
          <AppText variant="secondary" tone={colors.textTertiary}>
            Rate
          </AppText>
          <AppText variant="secondary" tabular>
            {formatMoney(intent.rateInrPerUnit)} per {intent.asset}
          </AppText>
        </View>
      </View>

      <AppText variant="secondary" tone={colors.textTertiary}>
        {intent.note}
      </AppText>

      <SecondaryButton label={checking ? 'Checking…' : onboardingCopy.receiveCheckLabel} loading={checking} onPress={() => void check()} />
      <TextButton label={onboardingCopy.receiveSkipLabel} tone={colors.textSecondary} onPress={onSkip} />
    </View>
  );
}

const styles = StyleSheet.create({
  pressable: { width: '100%' },
  card: {
    width: '100%',
    minHeight: 66,
    // The AI chat card radius — onboarding cards sit in the same thread
    // language as chat cards.
    borderRadius: 16,
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
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    columnGap: 10,
    marginTop: space.xs,
    maxWidth: '100%',
  },
  // Holds the halo: hugs the pill exactly (the glow is rounded with the pill)
  // and carries the spacing when the glow is on, since the pill's own margin
  // would otherwise sit inside the wrapper and square off the shadow.
  glowWrap: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  sheenClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 15,
    overflow: 'hidden',
  },
  sheenBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '45%',
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
    borderRadius: 16,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  // ── FundingReceiveCard ────────────────────────────────────────────────────
  receiveCard: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'stretch',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: space.l,
    gap: space.m,
  },
  receiveLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.m,
    minHeight: 120,
  },
  receiveQrWrap: { alignItems: 'center', paddingVertical: space.xs },
  receiveFactList: {
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: 'transparent',
    paddingTop: space.m,
  },
  receiveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.m,
  },
  receiveConfirmed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
  },
  copyValue: { position: 'relative' },
  copyValueText: { fontFamily: font.medium, flexShrink: 1 },
  copiedSlot: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  copiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.s,
    paddingVertical: 3,
    borderRadius: 999,
  },
});