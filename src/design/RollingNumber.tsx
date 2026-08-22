// A lean rolling number. Each character is a slot holding two text nodes — the
// outgoing glyph and the incoming one — and a slot only animates when its own
// character actually changes. A single shared value per slot drives both nodes
// on the UI thread.
//
// This replaced a Reacticx `RollingCounter` that rendered ten stacked
// Animated.Text plus a blur view per digit — ~60 text nodes and 6 blur views
// for a six-digit balance — started its counter at 0 so it rolled 0 → value
// on every mount, and keyed digits positionally so the roll scrambled
// whenever the digit count changed. Re-addable via `npx reacticx add
// rolling-counter` if it is ever wanted for something else; don't route
// numbers back through it.
//
// The slot deliberately holds NO React state and NO timers. An earlier version
// tracked `entering` / `outgoing` in state and tore them down with
// `setTimeout(ROLL_MS + 20)`, which produced four distinct defects:
//   · a slot could be left permanently in its animating branch, because the
//     effect's cleanup cleared the teardown timer and the re-run then hit an
//     early return before rescheduling it;
//   · the shared value reset landed a frame before the state update, so the
//     new glyph appeared instantly at full opacity and then rolled in a second
//     time — the flicker;
//   · the same orphaning left transparent third nodes mounted forever;
//   · a slot changing class (digit → thousands separator) short-circuited on
//     the incoming character and dropped the outgoing glyph unanimated.
// All four were consequences of splitting one animation across two schedulers.
// Everything here is driven by `progress` alone.
//
// Layout stability is the other half of the job:
//   · every slot renders the SAME structure whether it is rolling or settled,
//     so nothing reflows at either end of a roll;
//   · the row bottom-aligns rather than baseline-aligns — every text style
//     here shares one `lineHeight`, which makes the two identical, and unlike
//     baseline it also works for the slot's wrapper View;
//   · `tabular` keeps digit advance widths equal, so a same-length change
//     reflows nothing;
//   · the row is left-anchored, so a change in digit COUNT grows rightward
//     into empty space instead of pushing its neighbours around.

import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from './AppText';
import { useReduceMotion } from './motion';
import { useColors } from './theme';
import { font } from './tokens';

/** Fast enough to land while a surrounding spring is still settling, so the
 * roll and whatever moved around it read as a single motion. */
const ROLL_MS = 220;
const ROLL_EASING = Easing.out(Easing.cubic);

const isDigit = (ch: string) => /\d/.test(ch);

const defaultFormat = (value: number): string => String(Math.round(value));

export interface RollingNumberProps {
  /** The number to render. Rounding and sign handling belong to `format`. */
  value: number;
  /** Turns `value` into the exact glyphs painted. Need not be referentially
   * stable — the diff keys off the returned string, not the function. */
  format?: (value: number) => string;
  /** Painted before/after the digits at `affixScale`× size. Never animates.
   * Sits on the digits' baseline and takes their ink by default — a currency
   * mark reads as part of the number, not as a label stuck beside it. */
  prefix?: string;
  suffix?: string;
  affixScale?: number;
  affixTone?: string;
  /** How many trailing digits are the fractional part. Those render smaller
   * and muted, so "$1,095.57" leads with the dollars. */
  fractionDigits?: number;
  fractionScale?: number;
  fractionTone?: string;
  fontSize?: number;
  fontFamily?: string;
  lineHeightRatio?: number;
  tone?: string;
  /** Fixed per-digit column width. Leave undefined to rely on tabular figures;
   * set it only if the face turns out to lack a `tnum` table. */
  digitWidth?: number;
  tabular?: boolean;
  /** Swaps the digits for `maskText` at the same height, keeping the affixes
   * and the row shell so nothing moves. */
  hidden?: boolean;
  maskText?: string;
  accessibilityLabel?: string;
  /** Per-instance opt-out. The global reduce-motion setting always wins. */
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function RollingNumber({
  value,
  format = defaultFormat,
  prefix,
  suffix,
  affixScale = 0.88,
  affixTone,
  fractionDigits = 0,
  fractionScale = 0.62,
  fractionTone,
  fontSize = 32,
  fontFamily = font.displaySemibold,
  lineHeightRatio = 1.18,
  tone,
  digitWidth,
  tabular = true,
  hidden,
  maskText = '••••••',
  accessibilityLabel,
  animate = true,
  style,
  testID,
}: RollingNumberProps) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();

  const ink = tone ?? colors.textPrimary;
  // The currency mark shares the digits' ink on purpose. Muting it while the
  // digits stay full-strength makes it read as a weak label glued to the
  // number rather than part of it.
  const affixInk = affixTone ?? ink;
  const fractionInk = fractionTone ?? colors.textSecondary;
  const formatted = format(value);
  const glyphs = hidden ? maskText : formatted;
  const still = hidden || reduceMotion || !animate;

  const lineHeight = Math.round(fontSize * lineHeightRatio);

  const chars = useMemo(() => glyphs.split(''), [glyphs]);

  // Revealing a masked balance, or switching currency, changes almost every
  // glyph at once — but neither is a change in VALUE, and rolling them is what
  // used to read as the balance "animating up from zero". Detect those and
  // commit them without animation.
  const presentation = `${hidden ? 1 : 0}|${prefix ?? ''}|${suffix ?? ''}`;
  const seenPresentation = useRef(presentation);
  const presentationChanged = seenPresentation.current !== presentation;
  useEffect(() => {
    seenPresentation.current = presentation;
  });

  const textStyle: TextStyle = { fontSize, lineHeight, fontFamily, color: ink };
  const affixStyle: TextStyle = {
    fontSize: Math.round(fontSize * affixScale),
    lineHeight,
    fontFamily,
    color: affixInk,
    // Proportional, not a flat 2px: the glyph's own sidebearing scales with
    // the type, so a fixed gap reads differently at 32px and at 44px.
    marginRight: Math.round(fontSize * 0.06),
  };
  const fractionStyle: TextStyle = {
    fontSize: Math.round(fontSize * fractionScale),
    lineHeight,
    fontFamily,
    color: fractionInk,
  };

  // Index of the first fractional glyph, counted from the right so it survives
  // the number changing length. `fractionDigits + 1` accounts for the
  // separator, which is styled with the fraction rather than the whole part.
  const fractionFrom =
    fractionDigits > 0 && !hidden ? chars.length - (fractionDigits + 1) : Infinity;

  const label =
    accessibilityLabel ??
    (hidden ? 'Value hidden' : `${prefix ?? ''}${formatted}${suffix ?? ''}`);

  return (
    <View
      testID={testID}
      style={[styles.row, { height: lineHeight }, style]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}>
      {prefix ? <AppText style={affixStyle}>{prefix}</AppText> : null}

      {still ? (
        <>
          <AppText tabular={tabular} numberOfLines={1} style={textStyle}>
            {fractionFrom === Infinity ? glyphs : glyphs.slice(0, fractionFrom)}
          </AppText>
          {fractionFrom === Infinity ? null : (
            <AppText tabular={tabular} numberOfLines={1} style={fractionStyle}>
              {glyphs.slice(fractionFrom)}
            </AppText>
          )}
        </>
      ) : (
        chars.map((ch, i) => (
          <Cell
            // Keyed from the right so a character keeps its identity when the
            // number gains or loses a place.
            key={`c-${chars.length - i}`}
            char={ch}
            animate={!presentationChanged}
            textStyle={i >= fractionFrom ? fractionStyle : textStyle}
            lineHeight={lineHeight}
            fontSize={i >= fractionFrom ? Math.round(fontSize * fractionScale) : fontSize}
            digitWidth={digitWidth}
            tabular={tabular}
          />
        ))
      )}

      {suffix ? <AppText style={[affixStyle, styles.suffix]}>{suffix}</AppText> : null}
    </View>
  );
}

/**
 * One character slot: a fixed-height box holding an invisible in-flow spacer
 * that sets the column width, plus the outgoing and incoming glyphs stacked on
 * top of it. The structure never changes, so a slot cannot reflow when it
 * starts or stops rolling — and there is no React state or timer to fall out of
 * sync with the animation.
 *
 * A slot that has just appeared (the number grew a place) does not roll. Only a
 * slot whose character CHANGED does. That is what keeps a longer number from
 * looking like it counted up from nothing.
 */
function Cell({
  char,
  animate,
  textStyle,
  lineHeight,
  fontSize,
  digitWidth,
  tabular,
}: {
  char: string;
  animate: boolean;
  textStyle: TextStyle;
  lineHeight: number;
  fontSize: number;
  digitWidth?: number;
  tabular: boolean;
}) {
  // Both refs are maintained during render so the two text nodes always have
  // their glyphs before the effect starts the roll — the incoming node can
  // never be a frame behind the shared value.
  const current = useRef(char);
  const outgoing = useRef(char);
  if (current.current !== char) {
    outgoing.current = current.current;
    current.current = char;
  }

  const progress = useSharedValue(1);
  const mounted = useRef(false);

  useEffect(() => {
    // The first pass is the seed: whatever the number already reads, it reads
    // statically. Nothing rolls on mount.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!animate) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, { duration: ROLL_MS, easing: ROLL_EASING });
  }, [char, animate, progress]);

  const incomingStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * lineHeight * 0.9 }],
    opacity: progress.value,
  }));

  const outgoingStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -progress.value * lineHeight * 0.9 }],
    // Settled, the outgoing node is fully transparent and costs nothing.
    opacity: 1 - progress.value,
  }));

  // Separators stay full size. Shrinking them put a third type size into a
  // single number (affix, digits, commas), which is what made the amount read
  // as assembled rather than set.
  const glyphStyle: TextStyle = { ...textStyle, fontSize };

  const box: ViewStyle = {
    height: lineHeight,
    overflow: 'hidden',
    ...(digitWidth && isDigit(char) ? { width: digitWidth, alignItems: 'center' } : null),
  };

  return (
    <View style={box}>
      {/* Reserves the column width without painting. */}
      <AppText tabular={tabular} style={[glyphStyle, styles.spacer]}>
        {char}
      </AppText>
      <Animated.View style={[StyleSheet.absoluteFill, outgoingStyle]}>
        <AppText tabular={tabular} style={glyphStyle}>
          {outgoing.current}
        </AppText>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, incomingStyle]}>
        <AppText tabular={tabular} style={glyphStyle}>
          {char}
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // Bottom, not baseline. The affix and the fraction are smaller than the
    // digits, and every text style in this file shares one `lineHeight` — so
    // bottom alignment puts them on exactly the same baseline that `baseline`
    // would. The difference is that a View has no text baseline: under
    // `alignItems: 'baseline'` Yoga silently falls back to the bottom edge for
    // the character slots, and mixing that with true baseline alignment for the
    // affixes is what used to shift glyphs a point or two mid-roll.
    alignItems: 'flex-end',
    // Left-anchored on purpose: when the number gains a place the row grows
    // rightward into empty space instead of shunting its neighbours.
    alignSelf: 'flex-start',
  },
  suffix: {
    marginLeft: 2,
  },
  spacer: {
    opacity: 0,
  },
});
