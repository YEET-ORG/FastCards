import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import {
  CARD_PAD,
  CARD_RADIUS,
  CardChip,
  CardFace,
  cardLast4Style,
  cardNicknameStyle,
  ContactlessMark,
} from '@/components/fin/PaymentCardVisual';
import { RollingMoney } from '@/components/fin/RollingMoney';
import { AppText } from '@/design/AppText';
import { useReduceMotion } from '@/design/motion';
import { useColors, useDepth } from '@/design/theme';
import { font } from '@/design/tokens';
import { useMoney } from '@/domain/currency';
import type { Card } from '@/domain/types';

export interface BalanceScope {
  /** Printed on the card where the nickname goes: Personal · Family · All. */
  readonly name: string;
  readonly amount: number;
  readonly secondary?: string;
}

/** How far the cross-fading words lift per step — a direction cue, not a page turn. */
const LABEL_LIFT = 8;
const SUBLINE_HEIGHT = 20;
const AMOUNT_SIZE = 44;
/** One pass of the shine, fast enough to land inside the spring settle. */
const SHINE_MS = 520;

// The face is a printed object, so its ink does not follow the app theme — a
// physical card looks the same under any lighting. These are tuned against the
// cream artwork: a warm near-black that sits on the paper rather than punching
// a hole in it.
const CARD_INK = '#241A12';
const CARD_INK_SOFT = '#5C4636';

/**
 * The hero: the household's actual card, with the balance printed on its face.
 * Same artwork, chip, contactless mark and credential line as the carousel in
 * the Cards tab — it is meant to read as the same physical object.
 *
 * It does not own the swipe (`useScopePager` does, at screen level) and takes
 * `progress` as a shared value so the drag can drive it per frame without a
 * React render.
 */
export function BalanceCard({
  scopes,
  index,
  progress,
  hidden,
  onToggleHidden,
  card,
}: {
  scopes: readonly BalanceScope[];
  index: number;
  progress: SharedValue<number>;
  hidden: boolean;
  onToggleHidden: () => void;
  card?: Card;
}) {
  const colors = useColors();
  const shade = useDepth('raise3');
  const reduceMotion = useReduceMotion();
  const money = useMoney();

  // Where React has actually committed. The amount keys its dip off this
  // rather than the nearest integer, so it recovers in the same window as the
  // digit roll instead of brightening while still showing the old number.
  const settled = useSharedValue(index);
  const shine = useSharedValue(0);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    settled.value = index;
    if (reduceMotion) return;
    // One pass per scope change. Never a loop — a card that keeps glinting
    // reads as a loading state.
    shine.value = 0;
    shine.value = withTiming(1, { duration: SHINE_MS, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, reduceMotion]);

  const amountStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1, transform: [{ scale: 1 }] };
    const d = Math.min(Math.abs(progress.value - settled.value), 1);
    return {
      opacity: interpolate(d, [0, 1], [1, 0.5], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(d, [0, 1], [1, 0.97], Extrapolation.CLAMP) }],
    };
  });

  const shineStyle = useAnimatedStyle(() => {
    if (reduceMotion || size.width === 0) return { opacity: 0, transform: [{ translateX: 0 }] };
    return {
      // Fades in and out at the edges so the band never appears to pop.
      opacity: interpolate(shine.value, [0, 0.15, 0.85, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(shine.value, [0, 1], [-size.width, size.width * 1.6]) },
        { rotate: '20deg' },
      ],
    };
  });

  const active = scopes[index] ?? scopes[0];

  return (
    // Outer shell carries the shadow and NOTHING else. The clipping that
    // rounds the artwork lives on the child — `overflow: hidden` on a shadowed
    // view drops the drop shadow on Android.
    <View style={[styles.shell, { boxShadow: shade }]}>
      <View
        style={styles.clip}
        onLayout={(e) => setSize(e.nativeEvent.layout)}
        accessibilityRole="adjustable"
        accessibilityValue={{ text: `${active?.name ?? ''}, ${index + 1} of ${scopes.length}` }}>
        {card && size.width > 0 ? (
          <CardFace card={card} width={size.width} height={size.height} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.cream }]} />
        )}

        {/* Calms the field under the numerals without hiding the print. Fades
            out at BOTH ends and stops well short of the bottom: the densest,
            best part of the pattern is down there, and veiling it as well as
            scrimming it turns the whole lower half to grey mud. */}
        <LinearGradient
          pointerEvents="none"
          colors={[
            'rgba(253,250,244,0)',
            'rgba(253,250,244,0.62)',
            'rgba(253,250,244,0.62)',
            'rgba(253,250,244,0)',
          ]}
          locations={[0, 0.28, 0.72, 1]}
          style={styles.veil}
        />

        <View pointerEvents="none" style={styles.shineClip}>
          <Animated.View style={[styles.shineBand, shineStyle]}>
            {/* Warm iridescence — light catching laminate. A blue band would
                read as a foreign object on this cream stock. */}
            <LinearGradient
              colors={[
                'rgba(255,255,255,0)',
                'rgba(255,228,168,0.35)',
                'rgba(255,255,255,0.62)',
                'rgba(255,196,206,0.32)',
                'rgba(255,255,255,0)',
              ]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>

        {/* Nickname slot — the scope, printed where the card's name goes. */}
        <View pointerEvents="none" style={styles.nickname}>
          {scopes.map((scope, i) => (
            <ScopeWord
              key={scope.name}
              text={scope.name}
              index={i}
              progress={progress}
              reduceMotion={reduceMotion}
              tone={colors.onCard}
              textStyle={styles.nicknameText}
            />
          ))}
        </View>

        <View pointerEvents="none" style={styles.chipRow}>
          <CardChip />
          <ContactlessMark color={colors.onCard} />
        </View>

        {/* The balance, printed on the face. */}
        <View style={styles.amountBlock}>
          <Pressable
            onPress={money.toggle}
            accessibilityRole="button"
            accessibilityLabel={`Balance ${money.formatMoney(active?.amount ?? 0)}`}
            accessibilityHint={`Shown in ${money.code}. Double tap to switch currency.`}>
            <Animated.View style={amountStyle}>
              <RollingMoney
                amount={active?.amount ?? 0}
                fontSize={AMOUNT_SIZE}
                hidden={hidden}
                tone={CARD_INK}
                fractionTone={CARD_INK_SOFT}
                fontFamily={font.bold}
              />
            </Animated.View>
          </Pressable>

          <View style={styles.subline}>
            {scopes.map((scope, i) => (
              <ScopeWord
                key={scope.name}
                text={scope.secondary ?? ''}
                index={i}
                progress={progress}
                reduceMotion={reduceMotion}
                tone={CARD_INK_SOFT}
                textStyle={styles.sublineText}
              />
            ))}
          </View>
        </View>

        {/* Three stops rather than two: the credential row sits low on a light,
            busy stretch of the print, so the band has to reach usable density
            before it gets to the text, not only at the very bottom edge. */}
        <LinearGradient
          colors={['transparent', 'rgba(24,16,10,0.34)', 'rgba(24,16,10,0.72)']}
          locations={[0, 0.45, 1]}
          style={styles.bottomScrim}>
          <View style={styles.bottomRow}>
            <AppText tabular tone={colors.onCard} style={[cardLast4Style, styles.onArt]}>
              {card ? `••  ${card.last4}` : ' '}
            </AppText>
            <Pressable
              onPress={onToggleHidden}
              hitSlop={{ top: 14, bottom: 14, left: 16, right: 14 }}
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'}>
              <Ionicons
                name={hidden ? 'eye-off-outline' : 'eye-outline'}
                size={16}
                color={colors.onCard}
              />
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}

/**
 * One scope's word, stacked absolutely with its siblings. Fades linearly so
 * the two neighbours sit at half each at the midpoint and the pair never
 * blanks out, and lifts slightly to give the cross-fade a direction.
 */
function ScopeWord({
  text,
  index,
  progress,
  reduceMotion,
  tone,
  textStyle,
}: {
  text: string;
  index: number;
  progress: SharedValue<number>;
  reduceMotion: boolean;
  tone?: string;
  textStyle?: StyleProp<TextStyle>;
}) {
  const style = useAnimatedStyle(() => {
    const d = progress.value - index;
    const a = Math.min(Math.abs(d), 1);
    if (reduceMotion) return { opacity: a < 0.5 ? 1 : 0, transform: [{ translateY: 0 }] };
    return {
      opacity: interpolate(a, [0, 1], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateY: -d * LABEL_LIFT }],
    };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <AppText tone={tone} numberOfLines={1} style={textStyle}>
        {text}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: CARD_RADIUS,
    // Pulled in from the right so the page's ground reads around the card.
    marginRight: 8,
    marginBottom: 4,
  },
  clip: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    // Matches the height the card had as a plain surface, so the page below
    // does not shift.
    height: 193,
  },
  veil: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 62,
    height: 96,
  },
  shineClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  shineBand: {
    position: 'absolute',
    top: '-40%',
    bottom: '-40%',
    width: '45%',
  },
  nickname: {
    position: 'absolute',
    top: 14,
    left: CARD_PAD,
    right: CARD_PAD,
    height: 22,
  },
  nicknameText: {
    ...cardNicknameStyle,
  },
  chipRow: {
    position: 'absolute',
    top: '22%',
    left: CARD_PAD,
    right: CARD_PAD,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amountBlock: {
    position: 'absolute',
    left: CARD_PAD,
    right: CARD_PAD,
    // Sits below the chip row (which ends at ~67) and clear of the credential
    // line. The 193pt face has almost no slack, so this is measured, not eyeballed.
    top: 72,
  },
  subline: {
    height: SUBLINE_HEIGHT,
    marginTop: 2,
  },
  sublineText: {
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: CARD_PAD,
    paddingBottom: 14,
    paddingTop: 26,
  },
  /** Keeps light text readable where it crosses a pale part of the print. */
  onArt: {
    textShadowColor: 'rgba(28,22,18,0.55)',
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
});
