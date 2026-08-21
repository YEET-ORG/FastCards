// A lean rolling number. Only the characters that actually changed animate:
// each of those becomes a two-node column (outgoing slides out, incoming
// slides in) driven by a single shared value on the UI thread. Everything
// else is plain text, so a settled number is one text node per character.
//
// This replaced a Reacticx `RollingCounter` that rendered ten stacked
// Animated.Text plus a blur view per digit — ~60 text nodes and 6 blur views
// for a six-digit balance — started its counter at 0 so it rolled 0 → value
// on every mount, and keyed digits positionally so the roll scrambled
// whenever the digit count changed. Re-addable via `npx reacticx add
// rolling-counter` if it is ever wanted for something else; don't route
// numbers back through it.
//
// Layout stability is the other half of the job:
//   · every branch (animated / reduced-motion / masked) renders the SAME row
//     shell at the same fixed height, so toggling the mask cannot shift a
//     pixel;
//   · `tabular` keeps digit advance widths equal, so a same-length change
//     reflows nothing;
//   · the row is left-anchored, so a change in digit COUNT grows rightward
//     into empty space instead of pushing its neighbours around.

import { useEffect, useMemo, useRef, useState } from 'react';
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
const ROLL_MS = 260;
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

  // `prevLen` is only needed to spot characters that appeared because the
  // number grew a place, so they can enter instead of popping. Each cell
  // tracks its own previous character, so nothing else has to be remembered.
  // On first paint prevLen equals the current length, so no cell enters — the
  // number appears static rather than rolling up from nothing.
  const chars = useMemo(() => glyphs.split(''), [glyphs]);
  const [seen, setSeen] = useState(glyphs);
  const [prevLen, setPrevLen] = useState(glyphs.length);
  if (seen !== glyphs) {
    // React's "adjust state when props change". Deliberately not an effect:
    // an effect would commit one frame built from the previous glyphs, which
    // shows up as a flash of mask characters sitting in digit slots the
    // instant the balance is unhidden. A render-phase update is discarded and
    // re-run before anything reaches the screen.
    setPrevLen(seen.length);
    setSeen(glyphs);
  }

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
            isNew={chars.length - i > prevLen}
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
 * One character slot. Static until its character changes, at which point it
 * mounts a second text node for the length of one roll and drops back to a
 * single node. A slot that appeared because the number grew a place enters on
 * the same curve instead of popping in at full opacity.
 */
function Cell({
  char,
  isNew,
  textStyle,
  lineHeight,
  fontSize,
  digitWidth,
  tabular,
}: {
  char: string;
  isNew: boolean;
  textStyle: TextStyle;
  lineHeight: number;
  fontSize: number;
  digitWidth?: number;
  tabular: boolean;
}) {
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const [entering, setEntering] = useState(isNew);
  const prev = useRef(char);
  const entered = useRef(false);
  const progress = useSharedValue(isNew ? 0 : 1);

  useEffect(() => {
    // First pass: either this slot is brand new and enters, or it was part of
    // the seed and simply exists.
    if (!entered.current) {
      entered.current = true;
      if (!isNew) return;
      progress.value = withTiming(1, { duration: ROLL_MS, easing: ROLL_EASING });
      const t = setTimeout(() => setEntering(false), ROLL_MS + 20);
      return () => clearTimeout(t);
    }

    if (prev.current === char) return;
    const from = prev.current;
    prev.current = char;
    setEntering(false);
    setOutgoing(from);
    progress.value = 0;
    progress.value = withTiming(1, { duration: ROLL_MS, easing: ROLL_EASING });
    // Drop the extra node once the roll is done — a settled number is exactly
    // one text node per character.
    const t = setTimeout(() => setOutgoing(null), ROLL_MS + 20);
    return () => clearTimeout(t);
  }, [char, isNew, progress]);

  const incomingStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * lineHeight * 0.9 }],
    opacity: progress.value,
  }));

  const outgoingStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -progress.value * lineHeight * 0.9 }],
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

  // Settled: one plain node. Separators only ever reach this branch once
  // they have entered — they never roll.
  if (!entering && (outgoing === null || !isDigit(char))) {
    if (digitWidth && isDigit(char)) {
      return (
        <View style={{ width: digitWidth, alignItems: 'center' }}>
          <AppText tabular={tabular} style={glyphStyle}>
            {char}
          </AppText>
        </View>
      );
    }
    return (
      <AppText tabular={tabular} style={glyphStyle}>
        {char}
      </AppText>
    );
  }

  return (
    <View style={box}>
      {/* Reserves the column width without painting. */}
      <AppText tabular={tabular} style={[glyphStyle, styles.spacer]}>
        {char}
      </AppText>
      {outgoing !== null ? (
        <Animated.View style={[StyleSheet.absoluteFill, outgoingStyle]}>
          <AppText tabular={tabular} style={glyphStyle}>
            {outgoing}
          </AppText>
        </Animated.View>
      ) : null}
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
    // Baseline, not centre. The affix and the fraction are smaller than the
    // digits; centring them in the line box floats them off the digits'
    // baseline, which is the single thing that makes a currency mark look
    // stuck on rather than set.
    alignItems: 'baseline',
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
