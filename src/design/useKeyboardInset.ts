// How much of the window the on-screen keyboard covers, in points. 0 when it
// is closed.
//
// Android runs `adjustPan` (app.json → android.softwareKeyboardLayoutMode,
// locked deliberately so the tab dock is not double-offset — see
// docs/SUNLIT_HOUSEHOLD_UI_REVAMP.md). Under `pan` the window is never
// resized: the OS slides it up far enough to expose the focused field's own
// rect and everything else goes off screen. Screens therefore have to reserve
// the keyboard's space themselves, and this is the one number they need.
//
// Deliberately plain `Keyboard` listeners rather than Reanimated's
// `useAnimatedKeyboard` (which HouseholdTabBar uses): that one flips
// `setDecorFitsSystemWindows(false)` and re-pads the activity root on mount,
// reverting on unmount. Inside the tabs that is already in effect, but a
// screen mounted before them would toggle window decor on and off around the
// transition. A form does not need per-frame precision anyway.

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useKeyboardInset(): number {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // iOS animates the keyboard in, so the `will` events land on the system's
    // own curve. Android has no such curve to join, and under `adjustPan` only
    // the `did` events carry settled IME insets.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (height === 0) return 0;
  // The two platforms measure from different edges. RN's Android payload is
  // `imeInsets.bottom - barInsets.bottom` (ReactRootView.checkForKeyboardEvents),
  // i.e. measured from above the system bars; iOS measures from the true window
  // bottom. Normalise to "points of the window covered" so callers never branch.
  return Platform.OS === 'android' ? height + insets.bottom : height;
}
