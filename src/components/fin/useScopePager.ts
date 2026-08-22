// Owns the balance scope the home screen is showing, and the horizontal swipe
// that changes it.
//
// The gesture lives here rather than on the card because the swipe is
// screen-wide: gesture-handler resolves conflicts innermost-first, so a pan
// mounted on the card would claim every drag that starts there and an outer
// screen-level pan would never activate over it. One pan, at the top.
//
// The pager is CYCLIC: … → Personal → Family → All → Personal → … in both
// directions. That is why `progress` is unbounded rather than living in
// [0, names.length - 1]. It counts scope steps taken since mount, so paging
// past the last scope walks to 3, 4, 5 … and the scope actually shown is that
// position wrapped. Keeping the raw position instead of wrapping it is what
// lets the spring settle carry straight through the seam: wrapping the shared
// value itself would make the card visibly rewind the whole way back.

import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useRef, useState } from 'react';
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

/** True modulo. JS `%` is remainder — `-1 % 3` is `-1`, not `2` — and every
 * backwards wrap in this file would land on a negative index without this. */
function wrap(value: number, n: number): number {
  return ((value % n) + n) % n;
}

export interface ScopePager {
  readonly pan: ReturnType<typeof Gesture.Pan>;
  /** Unbounded position in scope units. Fractional while dragging. */
  readonly progress: SharedValue<number>;
  /** The committed position, in the same unbounded units as `progress`, so
   * `progress - settled` is always a small number even across a wrap. */
  readonly settled: SharedValue<number>;
  /** `progress` wrapped into [0, n) and committed — the scope actually shown. */
  readonly index: number;
  /** Bumped once per commit, INCLUDING a multi-step wrap that happens to land
   * back on the same index. Anything that must fire on every scope change (the
   * card's shine) keys off this rather than off `index`. */
  readonly commitSeq: number;
  readonly setIndex: (next: number) => void;
}

export function useScopePager(
  names: readonly string[],
  opts?: { enabled?: boolean },
): ScopePager {
  const enabled = opts?.enabled ?? true;
  const reduceMotion = useReduceMotion();
  const n = names.length;
  const first = Math.max(0, n - 1);

  // Opens on the last scope ("All") — the widest view of the money.
  const [state, setState] = useState({ index: first, commitSeq: 0 });

  // Scope units, on the UI thread. React state is committed once per settle,
  // never per frame.
  const progress = useSharedValue(first);
  const settled = useSharedValue(first);
  const start = useSharedValue(first);
  // JS-side mirror of `settled`. The commit guard has to compare UNBOUNDED
  // positions: a three-step drag over three scopes wraps onto the index it
  // started from, and guarding on the wrapped index would swallow that commit —
  // no haptic, no shine, and `settled` left behind by a full lap.
  const committed = useRef(first);

  const commit = useCallback(
    (target: number) => {
      if (target === committed.current) return;
      committed.current = target;
      settled.value = target;

      const next = wrap(target, n);
      setState((s) => ({ index: next, commitSeq: s.commitSeq + 1 }));
      Haptics.selectionAsync();
      const name = names[next];
      if (name) {
        AccessibilityInfo.announceForAccessibility(`${name}, ${next + 1} of ${n}`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, names],
  );

  // Shared values are kept out of the dep array on purpose: their identity is
  // stable for the life of the hook, and listing them is what makes the hooks
  // lint treat them as frozen inputs.
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
          // No rubber band and no clamp: there are no ends to resist against.
          progress.value = start.value - e.translationX / DRAG_UNIT;
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
          const target = Math.round(start.value) + steps;

          if (reduceMotion) progress.value = target;
          else progress.value = withSpring(target, spring);

          scheduleOnRN(commit, target);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reduceMotion, commit, enabled],
  );

  // Jump to a scope from outside the gesture (an accessibility action, or a
  // parent resetting the scope). Takes a wrapped index and travels the SHORT
  // way round to it, so setting "Personal" while on "All" steps forward one
  // rather than winding back two.
  //
  // This drives `progress` itself rather than leaving it to an effect keyed on
  // `index`. An effect could not do it correctly: after a wrap the committed
  // position and the index live in different spaces, so springing progress
  // toward the bare index would rewind the card through every scope in between.
  const setIndex = useCallback(
    (next: number) => {
      const base = committed.current;
      let delta = wrap(next, n) - wrap(base, n);
      // Shortest signed path around the ring.
      delta -= n * Math.round(delta / n);
      const target = base + delta;
      if (target === base) return;

      if (reduceMotion) progress.value = target;
      else progress.value = withSpring(target, spring);
      commit(target);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, reduceMotion, commit],
  );

  return {
    pan,
    progress,
    settled,
    index: state.index,
    commitSeq: state.commitSeq,
    setIndex,
  };
}
