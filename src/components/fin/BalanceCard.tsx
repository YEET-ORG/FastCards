import { Ionicons } from '@expo/vector-icons';
import { BlurMask, Canvas, RoundedRect } from '@shopify/react-native-skia';
import { useIsFocused } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  SensorType,
  useAnimatedReaction,
  useAnimatedSensor,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import {
  CARD_PAD,
  CARD_RADIUS,
  CardChip,
  cardLast4Style,
  cardNicknameStyle,
  ContactlessMark,
} from '@/components/fin/PaymentCardVisual';
import { RollingMoney } from '@/components/fin/RollingMoney';
import { AppText } from '@/design/AppText';
import { useReduceMotion } from '@/design/motion';
import { useColors, useTheme } from '@/design/theme';
import { font, screenPad } from '@/design/tokens';
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

/** The face height, shared by the clip and the glow canvas so the two can never
 * drift. */
const CARD_HEIGHT = 210;
/** How far the wrapper is pulled in from the right, so the page ground reads
 * around the card. Needed to derive the card width before first layout. */
const WRAPPER_INSET_RIGHT = 8;

// ── Gyro parallax ────────────────────────────────────────────────────────────
// Gravity, not the gyroscope, despite "gyro" being the usual name for this
// effect: the gyroscope reports angular VELOCITY, which is zero whenever the
// phone is held at a steady angle, so it would have to be integrated and would
// drift. Gravity gives a drift-free absolute tilt vector for free.
//
// The card is meant to react to how the phone MOVES and settle flat whenever it
// is held still — at any angle, so it looks right lying on a desk or read in
// bed. That is a high-pass filter, not a raw reading: a fast low-pass kills
// sensor jitter, a slow one tracks an adapting "rest" orientation, and the
// difference between them is the deflection. Hold still and the slow filter
// catches up, so the deflection decays to zero on its own — the filter IS the
// spring return, which is why nothing here is animated frame by frame.
//
// It also fails safe. If the sensor never delivers (no hardware, permission
// oddity), both filters converge on the same constant and the tilt is exactly
// zero. That matters because `AnimatedSensor.isAvailable` lives on a ref that
// is only filled inside an effect and never triggers a re-render, so it cannot
// be branched on.
//
// Everything below runs frame-locked, in real time units. An earlier version
// filtered per SENSOR EVENT with fixed blend factors, which meant the same
// constants produced a ~2× different time constant on Android (8ms ticks)
// versus a 60Hz iPhone (16.6ms) versus ProMotion (8.3ms) — the feel was not
// portable and the numbers meant nothing. Filtering at sensor rate also
// discarded two thirds of the work on Android while keeping whichever sample
// happened to land last before each frame, which is irregular decimation: it
// turns sensor noise into visible micro-stutter instead of averaging it away.

/** Earth gravity, to normalise the sensor's m/s² into a [-1, 1] tilt axis. */
const G = 9.81;
/** Jitter rejection. Short enough that the card never feels laggy. */
const TAU_SMOOTH_MS = 90;
/** How fast the "rest" orientation adapts. This is the settle-back-to-flat
 * time: hold the phone still and the deflection decays over roughly this long,
 * from any holding angle. */
const TAU_NEUTRAL_MS = 850;
/** A stalled frame must not fling the integrator. */
const MAX_FRAME_MS = 64;
/** Gravity carries roughly 0.01–0.02g of noise at rest. Anything under this,
 * in normalised g, resolves to exactly zero rather than a shimmer. */
const TILT_DEADZONE = 0.012;
/** Deflection, in normalised g, that maps to ~76% of full tilt. The response is
 * a tanh through this, so the curve is gentle near zero, progressive in the
 * middle and asymptotic at the ceiling — no corner anywhere, unlike the hard
 * clamp this replaces, which saturated at about a third of a g and then simply
 * stopped responding. */
const TILT_KNEE = 0.34;
/** The output spring, as a damped harmonic oscillator: ω² and 2ζω. ζ ≈ 0.75 —
 * lightly underdamped, so the card leads slightly into a movement, coasts as
 * the phone stops, and settles without ringing. A first-order filter (what this
 * replaces) is critically damped by construction and can do none of that, which
 * is exactly why it read as computed rather than physical. */
const TILT_STIFFNESS = 150;
const TILT_DAMPING = 18.4;
/** Below this, on all of target, position and velocity, the card is at rest and
 * stops writing shared values at all. */
const TILT_EPSILON = 0.0015;
/** Full deflection, in degrees. */
const TILT_MAX_DEG = 8;
/** Companion translation, in points — the part that reads as parallax rather
 * than as rotation. */
const TILT_SHIFT = 4;
/** The halo shifts less than the card, so it lags behind it. That offset
 * between the layers is what actually sells the depth. */
const HALO_SHIFT = 2;
/** How far the specular band slides across the face, in points. */
const SPECULAR_SHIFT = 26;

/**
 * Halo geometry, derived from the measured card so the light scales with the
 * card rather than being pinned to one phone's points.
 *
 * The bleed is UNIFORM, and that is a correctness constraint rather than a
 * taste one. The Skia canvas clips at its own bounds, so any layer whose
 * gaussian has not decayed to nothing by the edge gets sliced into a hard
 * straight line — the exact artefact the halo exists to avoid, just moved
 * further out. A gaussian is under 1/255 by ~2.5σ, so every layer has to
 * satisfy `inflate + 2.5σ ≤ bleed` on every side. Shortening one side to keep
 * light off a neighbour would cut a line across the falloff; keeping light off
 * neighbours is the alpha's job, not the canvas bounds'.
 */
function haloGeometry(cardWidth: number) {
  const bleed = Math.round(Math.min(120, Math.max(72, cardWidth * 0.26)));
  const ambientInflate = Math.round(bleed * 0.18);
  return {
    bleed,
    ambientInflate,
    // 2.6 rather than 2.5, so the invariant holds with a little margin.
    ambientSigma: (bleed - ambientInflate) / 2.6,
    hugSigma: Math.max(10, Math.round(bleed * 0.16)),
  };
}

/**
 * Owns the sensor subscription and nothing else. It exists as a component
 * rather than as part of the hook because mounting is the only reliable way to
 * stop and restart the hardware.
 *
 * `useAnimatedSensor` registers inside an effect keyed on `[sensorType,
 * config]`, and its `config` identity only changes when `interval`,
 * `adjustToInterfaceOrientation` or `iosReferenceFrame` change. So calling the
 * returned `unregister()` by hand is strictly one-way: the sensor stops and
 * nothing will ever start it again. Doing that on blur — which is what this
 * replaces — killed the tilt permanently the first time the user visited
 * another tab. Unmounting instead lets the hook's own effect cleanup
 * unregister, and a later mount registers cleanly.
 */
function TiltSensor({ onSample }: { onSample: (x: number, y: number) => void }) {
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 'auto' });

  // Hands every reading straight to the owner. The component deliberately knows
  // nothing about what happens to it — the filter state belongs to the hook
  // that survives this component being unmounted and remounted.
  useAnimatedReaction(
    () => gravity.sensor.value,
    (g) => {
      'worklet';
      onSample(g.x / G, g.y / G);
    },
  );

  return null;
}

/**
 * Deflection shaped into the visible response: a smooth deadzone so resting
 * noise is exactly zero, then a tanh so the curve is gentle near zero,
 * progressive through the middle and asymptotic at the ceiling. `Math.tanh`
 * is not reliably present in the worklet runtime, so it is written out.
 */
function shapeTilt(d: number): number {
  'worklet';
  const m = Math.abs(d);
  if (m <= TILT_DEADZONE) return 0;
  // Rescale so the curve leaves the deadzone at zero rather than stepping.
  const t = ((m - TILT_DEADZONE) / (1 - TILT_DEADZONE)) / TILT_KNEE;
  const e = Math.exp(-2 * t);
  const tanh = (1 - e) / (1 + e);
  return d < 0 ? -tanh : tanh;
}

/**
 * Device tilt as two shared values in [-1, 1], filtered and sprung.
 *
 * The chain, all on the UI thread and all frame-locked:
 *
 *   sensor ticks → running mean (averaged, not decimated)
 *                → fast low-pass      (jitter)
 *                → slow low-pass      (adapting rest orientation)
 *                → difference         (the deflection; this is what makes the
 *                                      card settle flat at ANY holding angle)
 *                → deadzone + tanh    (shape, no corners)
 *                → damped oscillator  (inertia: lead, coast, settle)
 *
 * `active` gates the hardware: the sensor stops when the card is off-screen or
 * the user has asked for reduced motion. Returns the element that owns the
 * subscription — render it, and its mount/unmount is what starts and stops the
 * sensor. See `TiltSensor` for why it cannot simply be unregistered in place.
 */
function useCardTilt(active: boolean) {
  // What the card is driven by.
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  // Oscillator velocity.
  const velX = useSharedValue(0);
  const velY = useSharedValue(0);
  // Filter state.
  const smoothX = useSharedValue(0);
  const smoothY = useSharedValue(0);
  const neutralX = useSharedValue(0);
  const neutralY = useSharedValue(0);
  const seeded = useSharedValue(false);
  // The sensor accumulator. Monotonic — the sensor only ever adds, and the
  // frame only ever reads and records where it got to. Each of these six has
  // exactly ONE writer, which is what keeps a sensor tick landing between two
  // frames from ever being counted twice or dropped.
  const sumX = useSharedValue(0);
  const sumY = useSharedValue(0);
  const samples = useSharedValue(0);
  const takenX = useSharedValue(0);
  const takenY = useSharedValue(0);
  const takenCount = useSharedValue(0);
  // Mean of the samples this frame drained, held when a frame catches none.
  const lastX = useSharedValue(0);
  const lastY = useSharedValue(0);

  // Averaging rather than keeping the most recent sample is what actually
  // rejects noise — on Android the sensor ticks about twice per frame, and
  // throwing one of those away is what used to shimmer. Stable identity, so
  // the sensor's reaction is never rebound.
  const onSample = useCallback(
    (x: number, y: number) => {
      'worklet';
      sumX.value += x;
      sumY.value += y;
      samples.value += 1;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrameCallback((frame) => {
    'worklet';
    const raw = frame.timeSincePreviousFrame;
    if (raw === null) return;
    // Seconds, and never long enough to fling the integrator after a stall.
    const dt = Math.min(raw, MAX_FRAME_MS) / 1000;

    let targetX = 0;
    let targetY = 0;

    if (active) {
      // Mean of whatever arrived since the last frame.
      const n = samples.value - takenCount.value;
      if (n > 0) {
        lastX.value = (sumX.value - takenX.value) / n;
        lastY.value = (sumY.value - takenY.value) / n;
        takenX.value = sumX.value;
        takenY.value = sumY.value;
        takenCount.value = samples.value;
      }

      if (!seeded.value && takenCount.value > 0) {
        // The first real reading is the rest orientation, not a deflection from
        // zero. Guarded on having actually received a sample — seeding from the
        // initial zeros would make the phone's true resting angle read as a
        // full deflection the instant the first tick landed.
        seeded.value = true;
        smoothX.value = lastX.value;
        smoothY.value = lastY.value;
        neutralX.value = lastX.value;
        neutralY.value = lastY.value;
      }

      // Frame-rate independent: the same time constants at 60Hz, 120Hz, on
      // either platform. This is the whole reason for filtering per frame.
      const aFast = 1 - Math.exp(-(dt * 1000) / TAU_SMOOTH_MS);
      const aSlow = 1 - Math.exp(-(dt * 1000) / TAU_NEUTRAL_MS);

      smoothX.value += (lastX.value - smoothX.value) * aFast;
      smoothY.value += (lastY.value - smoothY.value) * aFast;
      neutralX.value += (smoothX.value - neutralX.value) * aSlow;
      neutralY.value += (smoothY.value - neutralY.value) * aSlow;

      targetX = shapeTilt(smoothX.value - neutralX.value);
      targetY = shapeTilt(smoothY.value - neutralY.value);
    } else if (seeded.value) {
      // Just went inactive. Drop the seed and re-baseline onto whatever the
      // accumulator reached, so the next activation reads the phone's current
      // rest orientation instead of lurching away from a stale one.
      seeded.value = false;
      takenX.value = sumX.value;
      takenY.value = sumY.value;
      takenCount.value = samples.value;
    }
    // When inactive the target stays 0 and the spring below carries the card
    // home. Doing it here rather than off the sensor stream matters: the sensor
    // is unmounted when `active` goes false, so a decay driven by sensor ticks
    // would simply never run and the card would freeze at its last angle.

    // Semi-implicit Euler. Stable at these coefficients for any dt this
    // clamped, and unlike `withSpring` it can chase a target that moves every
    // frame without being restarted.
    const ax = TILT_STIFFNESS * (targetX - tiltX.value) - TILT_DAMPING * velX.value;
    const ay = TILT_STIFFNESS * (targetY - tiltY.value) - TILT_DAMPING * velY.value;
    velX.value += ax * dt;
    velY.value += ay * dt;

    const nextX = tiltX.value + velX.value * dt;
    const nextY = tiltY.value + velY.value * dt;

    // At rest, write nothing. Shared-value writes are what wake the dependent
    // animated styles, so an idle card costs a few float ops and no layout.
    const restingX =
      Math.abs(nextX - tiltX.value) < TILT_EPSILON &&
      Math.abs(velX.value) < TILT_EPSILON &&
      Math.abs(targetX - tiltX.value) < TILT_EPSILON;
    const restingY =
      Math.abs(nextY - tiltY.value) < TILT_EPSILON &&
      Math.abs(velY.value) < TILT_EPSILON &&
      Math.abs(targetY - tiltY.value) < TILT_EPSILON;

    if (restingX && restingY) {
      velX.value = 0;
      velY.value = 0;
      return;
    }
    tiltX.value = nextX;
    tiltY.value = nextY;
  });

  // No teardown effect: the hardware stops by unmounting `TiltSensor`, and the
  // filter state is reset by the frame callback's own inactive branch. Keeping
  // it there means every write to the filter state happens in one place, on the
  // UI thread, in frame order.

  return {
    tiltX,
    tiltY,
    sensor: active ? <TiltSensor onSample={onSample} /> : null,
  };
}

/** Both layers ride a little low, so the light pools under the card the way it
 * would if the card were floating above the page. */
const HALO_DY = 4;
/** Added to the ambient layer's corner radius. A radius this large turns the
 * silhouette into a lozenge, so its falloff can never resolve into straight
 * edges — this is what keeps the halo from reading as a rectangle. */
const AMBIENT_ROUNDING = 40;

// The face is a physical card that follows the app theme: a white card on
// White, a deep-black card on Black. The ink is tuned against each surface —
// a warm near-black that sits on the white paper rather than punching a hole
// in it, pure white on the black laminate.
const CARD_INK = '#241A12';
const CARD_INK_SOFT = '#5C4636';
const CARD_FACE_BLACK = '#060606';

/** Multi-layer drop shadow for the hero shell — one theme per surface. Kept to
 * the tight contact layers: the shell paints AFTER the halo canvas, so a wide
 * diffuse dark layer here lands straight on top of the glow and greys it out.
 * On black that is fatal — an 80%-opaque shadow erases a 0.34-alpha blue field
 * entirely — so the black card keeps only its contact shadow and lets the halo
 * be the separation cue. */
function shellShadow(black: boolean): string {
  return black
    ? '0px 1px 2px rgba(0,0,0,0.55), 0px 6px 14px rgba(0,0,0,0.45), inset 0px 1px 0px rgba(255,255,255,0.12)'
    : '0px 1px 2px rgba(16,24,40,0.07), 0px 5px 12px rgba(16,24,40,0.07), 0px 16px 32px rgba(16,24,40,0.05), inset 0px 1px 0px rgba(255,255,255,1)';
}

/**
 * The halo behind the hero: dimmed ambient light, not a lit panel.
 *
 * Two passes, both deliberately wide. An earlier version put a tight, bright
 * pass (σ 12 at 0.46) directly on the card's silhouette, which is precisely
 * what made the glow read as a rectangle — a gaussian that narrow relative to a
 * 345×210 shape does not dissolve an outline, it traces it. Nothing here may be
 * narrow enough to reveal a straight edge.
 *
 * `blur` is a Skia *sigma*, not a CSS radius — visible reach is roughly 3× — so
 * these numbers are much smaller than the equivalent `box-shadow` values.
 *
 * The colours are deliberately NOT `colors.accent`. That token is tuned for
 * text and fills against the page; spread across a large soft field it reads as
 * a grey-lavender bruise on White and stays stubbornly flat on Black.
 */
function haloTheme(black: boolean) {
  return black
    ? {
        // Against #000000 the composite is exactly alpha × colour, so these
        // land near #0D192F / #08101F: still unmistakably blue rather than
        // grey, but well down from where they were — a halo on black needs far
        // less than it looks like it does on paper, because it has nothing to
        // compete with.
        hug: '#3E72D8',
        hugOpacity: 0.22,
        ambient: '#3466C4',
        ambientOpacity: 0.16,
        // Normal compositing, not `plus`. On pure black srcOver of a chromatic
        // colour is already effectively additive against the ground, so `plus`
        // was only buying extra brightness where the two layers overlap — which
        // is exactly the dense core that made the glow read as heavy.
        hugBlend: 'srcOver' as const,
      }
    : {
        // Pale and near-white, so it composites over #F7F8FA into a soft tint
        // rather than a saturated ring.
        hug: '#BFD6F5',
        hugOpacity: 0.42,
        ambient: '#CBDFFA',
        ambientOpacity: 0.3,
        // `plus` over a light ground pushes the overlap toward saturation and
        // reads synthetic. Normal compositing on White.
        hugBlend: 'srcOver' as const,
      };
}

/** Inset emboss rim on the face: light catches the raised top edge, shade
 * settles into the bottom — the card reads as a thick, pressed object. */
function faceEdge(black: boolean): string {
  return black
    ? 'inset 0px 1px 0px rgba(255,255,255,0.18), inset 0px -3px 8px rgba(0,0,0,0.85), inset 1px 0px 0px rgba(255,255,255,0.05), inset -1px 0px 0px rgba(0,0,0,0.9)'
    : 'inset 0px 1px 0px rgba(255,255,255,0.95), inset 0px -2px 5px rgba(16,24,40,0.05), inset 1px 0px 0px rgba(255,255,255,0.6), inset -1px 0px 0px rgba(16,24,40,0.04)';
}

/**
 * The hero: the household's actual card, with the balance printed on its face.
 * A physical card that follows the theme — white laminate on White, deep
 * black on Black — with the chip, contactless mark and credential line shared
 * with the carousel in the Cards tab.
 *
 * It does not own the swipe (`useScopePager` does, at screen level) and takes
 * `progress` as a shared value so the drag can drive it per frame without a
 * React render.
 */
export function BalanceCard({
  scopes,
  index,
  progress,
  settled,
  commitSeq,
  hidden,
  onToggleHidden,
  card,
}: {
  scopes: readonly BalanceScope[];
  index: number;
  progress: SharedValue<number>;
  /** The pager's committed position, in the same unbounded units as
   * `progress`. Comparing against this rather than against `index` is what
   * keeps the amount's dip correct across a cyclic wrap. */
  settled: SharedValue<number>;
  /** Bumped once per scope commit, including a wrap that lands on the same
   * index. The shine keys off this so a full lap still glints. */
  commitSeq: number;
  hidden: boolean;
  onToggleHidden: () => void;
  card?: Card;
}) {
  const colors = useColors();
  const { mode } = useTheme();
  const black = mode === 'black';
  const reduceMotion = useReduceMotion();
  const money = useMoney();
  const focused = useIsFocused();
  const { tiltX, tiltY, sensor } = useCardTilt(focused && !reduceMotion);

  // Physical-card materials, per theme.
  const face = black ? CARD_FACE_BLACK : colors.cream;
  const ink = black ? '#FFFFFF' : CARD_INK;
  const inkSoft = black ? 'rgba(255,255,255,0.72)' : CARD_INK_SOFT;
  // Seats the numerals on each surface without veiling the emboss. The black
  // laminate needs it; the white one does not — dark ink on white already has
  // all the contrast it wants, and the warm tint the veil used to carry laid a
  // visible cream band across the middle of an otherwise clean white face.
  const veil = black
    ? (['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0)'] as const)
    : (['rgba(255,255,255,0)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0)'] as const);
  // A whisper of shade under the credential row; the emboss owns the rest. Same
  // reasoning: on white it only greys the bottom third.
  const scrim = black
    ? (['transparent', 'rgba(0,0,0,0.30)', 'rgba(0,0,0,0.55)'] as const)
    : (['transparent', 'transparent', 'transparent'] as const);
  // The metallic pass that sweeps the laminate when the scope changes. One
  // ramp for both themes, so the glint is equally bright on either face.
  //
  // It cannot be a plain white highlight: white on a white card is invisible.
  // A real specular sweep darkens on one side of its peak and brightens on the
  // other, and that leading shade is what makes the highlight read on a light
  // surface. The black card gets the same shape for free — the shade simply
  // disappears into the laminate and the peak does all the work.
  const shineColors = [
    'rgba(255,255,255,0)',
    black ? 'rgba(120,140,170,0.10)' : 'rgba(120,132,150,0.16)',
    'rgba(255,255,255,0.78)',
    black ? 'rgba(170,200,255,0.14)' : 'rgba(190,205,230,0.24)',
    'rgba(255,255,255,0)',
  ] as const;
  const catchLight = black
    ? (['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)'] as const)
    : (['rgba(255,255,255,0.65)', 'rgba(255,255,255,0)'] as const);
  // The tilt-driven specular band. Softer and wider than the sweep, and always
  // present — it slides rather than passing.
  //
  // The black card is held far lower than the white one. Anything that lifts a
  // near-black laminate is immediately legible, so at rest the sheen has to be
  // effectively absent for the face to read as one solid black; it earns its
  // brightness only as the phone actually tilts. On white, white-on-white is
  // invisible either way, so it can afford to be generous.
  const specularColors = black
    ? (['rgba(255,255,255,0)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] as const)
    : (['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)'] as const);
  /** Opacity with the phone perfectly still. On black this lands at 0.009 white
   * over #060606 — below the point where a flat field reads as anything. */
  const specularFloor = black ? 0.15 : 0.35;

  const shine = useSharedValue(0);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // The halo canvas needs pixels, and `size` is 0 for exactly one frame. The
  // card's width is fully determined by the page geometry, so derive it and let
  // `onLayout` correct it — the first frame is already right, and no fade-in is
  // needed to hide a pop. Deliberately NOT folded into `size` itself: the shine
  // keys off `size.width === 0` to know layout has not happened yet.
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = size.width || Math.max(0, windowWidth - screenPad * 2 - WRAPPER_INSET_RIGHT);
  const halo = haloTheme(black);
  const geo = useMemo(() => haloGeometry(cardWidth), [cardWidth]);
  const glowStyle = useMemo(
    () => ({ position: 'absolute' as const, top: -geo.bleed, left: -geo.bleed }),
    [geo.bleed],
  );
  const canvasSize = useMemo(
    () => ({ width: cardWidth + geo.bleed * 2, height: CARD_HEIGHT + geo.bleed * 2 }),
    [cardWidth, geo.bleed],
  );

  // Keyed on the commit counter, not on `index`: paging a full lap around the
  // ring lands back on the scope it started from, and keying on `index` would
  // silently skip the glint for exactly that swipe.
  useEffect(() => {
    if (reduceMotion) return;
    // One pass per scope change. Never a loop — a card that keeps glinting
    // reads as a loading state.
    shine.value = 0;
    shine.value = withTiming(1, { duration: SHINE_MS, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitSeq, reduceMotion]);

  const amountStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1, transform: [{ scale: 1 }] };
    // `settled` is the pager's own committed position, in the same unbounded
    // units as `progress`, so this difference stays small even when the ring
    // wraps. Comparing against the wrapped index instead would leave the
    // amount stuck dim forever after the first lap.
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

  // The card itself. `perspective` must lead the transform array — without it
  // the rotations are flat shears rather than a tilt in depth.
  const tiltStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { transform: [{ perspective: 1000 }] };
    return {
      transform: [
        { perspective: 1000 },
        // Tilting the top of the phone away should drop the top of the card
        // away too, hence the sign on rotateX.
        { rotateX: `${-tiltY.value * TILT_MAX_DEG}deg` },
        { rotateY: `${tiltX.value * TILT_MAX_DEG}deg` },
        { translateX: tiltX.value * TILT_SHIFT },
        { translateY: tiltY.value * TILT_SHIFT },
      ],
    };
  });

  // The halo travels a shorter distance than the card, so it lags behind it.
  const haloStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { transform: [{ translateX: 0 }, { translateY: 0 }] };
    return {
      transform: [
        { translateX: tiltX.value * HALO_SHIFT },
        { translateY: tiltY.value * HALO_SHIFT },
      ],
    };
  });

  // The light on the face slides against the tilt, the way a highlight stays
  // put in the world while the card turns under it.
  const specularStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 0, transform: [{ translateX: 0 }] };
    return {
      opacity: interpolate(
        Math.abs(tiltX.value),
        [0, 1],
        [specularFloor, 1],
        Extrapolation.CLAMP,
      ),
      transform: [{ translateX: -tiltX.value * SPECULAR_SHIFT }],
    };
  });

  const active = scopes[index] ?? scopes[0];

  return (
    // Wrapper owns the page geometry; the glow and the shell hang off it.
    <View style={styles.wrapper}>
      {/* Renders nothing. Its mount/unmount IS the sensor's on/off switch. */}
      {sensor}

      {/* The halo. Two blurred copies of the card's OWN silhouette rather than
          a radial disc: a gaussian mask on a rounded rect falls off parallel to
          the outline, corner radius included, so the light reads as leaking out
          from behind this card instead of as a circle that happens to sit near
          it. Both layers are solid in the middle, which never shows — the
          opaque face covers them exactly. Nothing here is animated or driven by
          `progress`, so the scene re-records only on theme or layout change and
          costs nothing during the swipe. */}
      <Animated.View pointerEvents="none" style={[glowStyle, haloStyle]}>
        <Canvas
          pointerEvents="none"
          // Canvas defaults to Display P3; the halo has to composite against
          // sRGB views, so an unconverted P3 blue reads over-saturated.
          colorSpace="srgb"
          style={canvasSize}>
          {/* The ambient spread. Inflated and given a much rounder corner than
              the card, so what fades into the page is a lozenge of light rather
              than the card's outline at low opacity. */}
          <RoundedRect
            x={geo.bleed - geo.ambientInflate}
            y={geo.bleed - geo.ambientInflate + HALO_DY}
            width={cardWidth + geo.ambientInflate * 2}
            height={CARD_HEIGHT + geo.ambientInflate * 2}
            r={CARD_RADIUS + geo.ambientInflate + AMBIENT_ROUNDING}
            color={halo.ambient}
            opacity={halo.ambientOpacity}>
            <BlurMask blur={geo.ambientSigma} style="normal" />
          </RoundedRect>

          {/* The close hug, on the card's own silhouette — still soft enough
              that its corners stay corners and its sides never become lines. */}
          <RoundedRect
            x={geo.bleed}
            y={geo.bleed + HALO_DY}
            width={cardWidth}
            height={CARD_HEIGHT}
            r={CARD_RADIUS}
            color={halo.hug}
            opacity={halo.hugOpacity}
            blendMode={halo.hugBlend}>
            <BlurMask blur={geo.hugSigma} style="normal" />
          </RoundedRect>
        </Canvas>
      </Animated.View>

      {/* Outer shell carries the drop shadow, the tilt and NOTHING else. The
          clipping that rounds the face lives on the child — `overflow: hidden`
          on a shadowed view drops the drop shadow on Android. */}
      <Animated.View style={[styles.shell, { boxShadow: shellShadow(black) }, tiltStyle]}>
        <View
          style={[styles.clip, { boxShadow: faceEdge(black) }]}
          onLayout={(e) => setSize(e.nativeEvent.layout)}
          accessibilityRole="adjustable"
          accessibilityValue={{ text: `${active?.name ?? ''}, ${index + 1} of ${scopes.length}` }}>
          {/* The physical card: one themed surface, embossed by the inset rim.
              Frozen or closed cards dim the laminate slightly. */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: face }]} />
          {card && (card.status === 'frozen' || card.status === 'closed') ? (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: black ? 'rgba(255,255,255,0.05)' : 'rgba(28,22,18,0.08)' },
              ]}
            />
          ) : null}

          {/* Light catching the raised top edge of the laminate. */}
          <LinearGradient pointerEvents="none" colors={catchLight} style={styles.catchLight} />

          {/* Seats the numerals on the surface without hiding the emboss.
              Fades out at BOTH ends and stops well short of the bottom edge. */}
          <LinearGradient
            pointerEvents="none"
            colors={veil}
            locations={[0, 0.28, 0.72, 1]}
            style={styles.veil}
          />

          {/* The standing highlight, slid by the tilt. Lives under the sweep so
              a scope change still reads as the brighter of the two. */}
          <View pointerEvents="none" style={styles.shineClip}>
            <Animated.View style={[styles.specularBand, specularStyle]}>
              {/* Horizontal, not diagonal. The band slides on `translateX`, so a
                  ramp along x is what it actually wants — and with a diagonal
                  the value at the band's own left and right edges depends on y,
                  which is what let a truncated edge become a visible seam. */}
              <LinearGradient
                colors={specularColors}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>

          <View pointerEvents="none" style={styles.shineClip}>
            <Animated.View style={[styles.shineBand, shineStyle]}>
              {/* The metallic pass. Shade on the leading edge, bright peak,
                  cooler trail — the shade is what lets it read on a white
                  laminate, where a plain white highlight would be invisible. */}
              <LinearGradient
                colors={shineColors}
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
                count={scopes.length}
                progress={progress}
                reduceMotion={reduceMotion}
                tone={ink}
                // The shared nickname style carries a dark text shadow for the
                // photographic card faces in the carousel. On clean white
                // laminate it just smudges the word.
                textStyle={[styles.nicknameText, black ? null : styles.nicknameFlat]}
              />
            ))}
          </View>

          <View pointerEvents="none" style={styles.chipRow}>
            <CardChip />
            <ContactlessMark color={ink} />
          </View>

          {/* The balance, printed on the face. */}
          <View style={styles.amountBlock}>
            <View style={styles.amountRow}>
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
                    tone={ink}
                    fractionTone={inkSoft}
                    fontFamily={font.bold}
                  />
                </Animated.View>
              </Pressable>

              {/* Rides just above and right of the cents. Deliberately OUTSIDE
                  the animated wrapper: it is a control, not part of the number,
                  so it must not dip and scale as the scopes page past. */}
              <Pressable
                onPress={onToggleHidden}
                style={styles.eye}
                hitSlop={{ top: 16, bottom: 16, left: 12, right: 16 }}
                accessibilityRole="button"
                accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'}>
                <Ionicons
                  name={hidden ? 'eye-off-outline' : 'eye-outline'}
                  size={16}
                  color={inkSoft}
                />
              </Pressable>
            </View>

            <View style={styles.subline}>
              {scopes.map((scope, i) => (
                <ScopeWord
                  key={scope.name}
                  text={scope.secondary ?? ''}
                  index={i}
                  count={scopes.length}
                  progress={progress}
                  reduceMotion={reduceMotion}
                  tone={inkSoft}
                  textStyle={styles.sublineText}
                />
              ))}
            </View>
          </View>

          {/* A whisper of shade under the credential row; the emboss owns the
              rest of the edge. */}
          <LinearGradient
            colors={scrim}
            locations={[0, 0.45, 1]}
            style={styles.bottomScrim}>
            <View style={styles.bottomRow}>
              <AppText tabular tone={inkSoft} style={cardLast4Style}>
                {card ? `••  ${card.last4}` : ' '}
              </AppText>
              {/* The network mark's slot on a real card. A brand mark, not
                  information, so it stays out of the accessibility tree. */}
              <AppText
                accessibilityElementsHidden
                importantForAccessibility="no"
                tone={black ? colors.accentBright : colors.accentInk}
                style={styles.wordmark}>
                FASTCARD
              </AppText>
            </View>
          </LinearGradient>
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * One scope's word, stacked absolutely with its siblings. Fades linearly so
 * the two neighbours sit at half each at the midpoint and the pair never
 * blanks out, and lifts slightly to give the cross-fade a direction.
 *
 * The distance to `progress` is measured AROUND THE RING, not along the number
 * line. `progress` is unbounded, so paging from the last scope to the first
 * runs it to 3 while this word sits at 0 — a plain subtraction would call that
 * three steps away, fade the incoming word to nothing and lift it three times
 * too far, leaving a blank card at exactly the moment of the wrap.
 */
function ScopeWord({
  text,
  index,
  count,
  progress,
  reduceMotion,
  tone,
  textStyle,
}: {
  text: string;
  index: number;
  /** How many scopes are on the ring, i.e. the wrap period. */
  count: number;
  progress: SharedValue<number>;
  reduceMotion: boolean;
  tone?: string;
  textStyle?: StyleProp<TextStyle>;
}) {
  const style = useAnimatedStyle(() => {
    let d = progress.value - index;
    // Shortest signed path around the ring, into [-count/2, count/2].
    d -= count * Math.round(d / count);
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
  wrapper: {
    // Pulled in from the right so the page's ground reads around the card.
    marginRight: WRAPPER_INSET_RIGHT,
    marginBottom: 4,
  },
  // The halo's own anchor is built inline (`glowStyle`) rather than living
  // here: its offsets are the derived bleed, which depends on the measured
  // card width. The canvas carries its own explicit width and height, so the
  // anchor only needs `top`/`left`.
  shell: {
    borderRadius: CARD_RADIUS,
  },
  clip: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    height: CARD_HEIGHT,
  },
  /** The thin glossy strip along the top edge — light catching the laminate. */
  catchLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 14,
  },
  veil: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 78,
    height: 100,
  },
  shineClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  /** The standing highlight. Much wider and softer than the sweep — it is meant
   * to be a sheen that slides, not a band that passes.
   *
   * The overhang is a correctness constraint, not padding. This band used to be
   * `left: -15%, width: 90%`, so its right edge fell at 75% of the card — inside
   * the clip — and the gradient still had roughly a tenth of its white left at
   * that point. `overflow: hidden` then cut it dead, which put a hard vertical
   * seam down the face: grey to the left of 75%, pure black to the right,
   * invisible on the white card and glaring on the black one. The band now
   * overhangs by 40% a side, far more than the 26pt it ever translates, so its
   * own edges can never be inside the clip at any point in its travel. */
  specularBand: {
    position: 'absolute',
    top: '-30%',
    bottom: '-30%',
    left: '-40%',
    width: '180%',
  },
  shineBand: {
    position: 'absolute',
    top: '-40%',
    bottom: '-40%',
    width: '45%',
  },
  nickname: {
    position: 'absolute',
    top: 16,
    left: CARD_PAD,
    right: CARD_PAD,
    height: 22,
  },
  nicknameText: {
    ...cardNicknameStyle,
  },
  nicknameFlat: {
    textShadowColor: 'transparent',
    textShadowRadius: 0,
  },
  // Measured, not a percentage. The face's vertical rhythm is a set of fixed
  // gaps between blocks, so anchoring one of them to a fraction of the height
  // made it drift against the others the moment the card was resized.
  chipRow: {
    position: 'absolute',
    top: 50,
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
    // The whole budget on a 210pt face: nickname 16→38, chip 50→75, amount
    // 88 + 52 line + 22 subline = 162, credential row from 176. Every gap is
    // 12pt or more, which is the breathing room the 193pt face did not have.
    top: 88,
  },
  /** Top-aligned, so the eye hangs off the cap height of the numerals rather
   * than sitting on their baseline. */
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  /** Drops the glyph from the top of the 52pt number row down to roughly the
   * cap line, which lands it just above and right of the cents. */
  eye: {
    marginLeft: 3,
    marginTop: 10,
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
    paddingBottom: 16,
    paddingTop: 26,
  },
  /** The network mark. A grotesque, not one of the Fraunces display faces — a
   * serif logotype in this slot reads as a masthead rather than a card brand. */
  wordmark: {
    fontFamily: font.bold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
});
