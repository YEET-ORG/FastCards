import * as Haptics from 'expo-haptics';

/**
 * Haptic wrapper (AI_CHAT_UI_UX_SPEC §16.4). Both platforms use expo-haptics —
 * Android drives the system haptics engine with amplitude control, which reads
 * as the same premium, subtle feel as iOS instead of raw vibration patterns.
 * Everything is wrapped in a swallow-all so a haptic failure can never take
 * down a gesture or generation flow.
 */

function runHaptic(fn: () => Promise<void> | void) {
  try {
    // Async rejections are not caught by the try/catch — swallow them too, so
    // a haptic failure can never surface as an unhandled rejection.
    void Promise.resolve(fn()).catch(() => undefined);
  } catch {
    // swallow
  }
}

export const haptics = {
  tap() {
    runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  select() {
    runHaptic(() => Haptics.selectionAsync());
  },
  confirm() {
    runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  success() {
    runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  warning() {
    runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
  error() {
    runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
};

export const hapticTap = () => haptics.tap();
export const hapticSuccess = () => haptics.success();