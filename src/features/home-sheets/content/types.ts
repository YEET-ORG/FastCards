import type { RefObject } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/**
 * The host contract for whatever screen goes inside the sheet
 * (TOKEN_DETAIL_SHEET_UI_UX_SPEC.md §15):
 *
 * - `presentation`: `"screen"` for the route version, `"sheet"` for the hosted
 *   one. Presentation only, with one exception: pull-to-refresh is dropped in
 *   `"sheet"` — a sheet host owns pull-down-at-the-top as its dismissal
 *   gesture, and the two cannot share that anchor.
 * - `openSettled`: the opening transition finished (spring completion, or the
 *   400 ms fallback timer). Defer anything that is not first paint until then.
 * - `scrollOffsetOut`: a shared value, not a callback, so reading it costs no
 *   render. Written from a plain JS `onScroll` (not
 *   `useAnimatedScrollHandler`, which returns a handler object only usable
 *   with reanimated's `Animated.ScrollView`) so the gesture-handler ScrollView
 *   keeps `RefreshControl`.
 * - `scrollRef`: so a host gesture can name it in `blocksExternalGesture`.
 */
export type SheetScreenProps = {
  readonly presentation?: 'screen' | 'sheet';
  readonly openSettled?: boolean;
  readonly scrollOffsetOut?: SharedValue<number>;
  readonly scrollRef?: RefObject<unknown>;
};