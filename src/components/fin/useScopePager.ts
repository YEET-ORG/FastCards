// Owns the balance scope the home screen is showing, and the horizontal swipe
// that changes it.
//
// The gesture lives here rather than on the card because the swipe is
// screen-wide: gesture-handler resolves conflicts innermost-first, so a pan
// mounted on the card would claim every drag that starts there and an outer
// screen-level pan would never activate over it. One pan, at the top.

import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useReduceMotion } from '@/design/motion';
import { spring } from '@/design/tokens';

/** Finger travel that equals one scope step. Deliberately not the card's
 * width — the card no longer pages, and a fixed unit behaves the same on a
 * tablet as on a phone. */
const DRAG_UNIT = 96;
/** Past this fraction of a drag unit, or this flick speed, the swipe commits. */
const COMMIT_FRACTION = 0.35;
const COMMIT_VELOCITY = 450;
/** How far past the ends the content can be dragged before it resists. */
const RUBBER_BAND = 0.35;

export interface ScopePager {
  readonly pan: ReturnType<typeof Gesture.Pan>;
  readonly progress: SharedValue<number>;
  readonly index: number;
  readonly setIndex: (next: number) => void;
}

export function useScopePager(
  names: readonly string[],
  opts?: { enabled?: boolean },
): ScopePager {
  const enabled = opts?.enabled ?? true;
  const reduceMotion = useReduceMotion();
  const last = names.length - 1;

  // Opens on the last scope ("All") — the widest view of the money.
  const [index, setIndex] = useState(last);

  // Scope units: 0 = first scope, 1 = second, … Lives on the UI thread; React
  // state is committed once per settle, never per frame.
  const progress = useSharedValue(index);
  const start = useSharedValue(index);

  const commit = useCallback(
    (next: number) => {
      if (next === index) return;
      setIndex(next);
      Haptics.selectionAsync();
      const name = names[next];
      if (name) {
        AccessibilityInfo.announceForAccessibility(
          `${name}, ${next + 1} of ${names.length}`,
        );
      }
    },
    [index, names],
  );

  // Note the ordering: the gesture is built before the effect that syncs the
  // index. Both write `progress`, and the hooks lint freezes a shared value
  // once an effect has captured it — so the writer that isn't an effect has to
  // come first. Shared values are also kept out of both dep arrays: their
  // identity is stable for the life of the hook, and listing them is what
  // makes the lint treat them as frozen inputs.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        // Wider horizontal commitment and an earlier vertical bail-out than
        // the card-only version used: this pan now covers the whole screen,
        // so every vertical scroll is a candidate for both recognizers and a
        // diagonal flick must go to the ScrollView, not here.
        .activeOffsetX([-16, 16])
        .failOffsetY([-6, 6])
        .onStart(() => {
          'worklet';
          start.value = progress.value;
        })
        .onUpdate((e) => {
          'worklet';
          const raw = start.value - e.translationX / DRAG_UNIT;
          // Resist past the ends instead of stopping dead.
          if (raw < 0) progress.value = raw * RUBBER_BAND;
          else if (raw > last) progress.value = last + (raw - last) * RUBBER_BAND;
          else progress.value = raw;
        })
        .onEnd((e) => {
          'worklet';
          const moved = -e.translationX / DRAG_UNIT;
          const flicked = Math.abs(e.velocityX) > COMMIT_VELOCITY;
          const dir = moved > 0 ? 1 : -1;
          const steps =
            Math.abs(moved) > COMMIT_FRACTION || flicked
              ? dir * Math.max(1, Math.round(Math.abs(moved)))
              : 0;
          const target = Math.max(0, Math.min(last, Math.round(start.value) + steps));

          if (reduceMotion) progress.value = target;
          else progress.value = withSpring(target, spring);

          scheduleOnRN(commit, target);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [last, reduceMotion, commit, enabled],
  );

  // Follow the index when it changes from outside the gesture (an
  // accessibility action, or a parent resetting the scope).
  useEffect(() => {
    if (reduceMotion) progress.value = index;
    else progress.value = withSpring(index, spring);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, reduceMotion]);

  return { pan, progress, index, setIndex: commit };
}
