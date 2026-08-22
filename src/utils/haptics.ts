import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

/**
 * Haptic wrapper (AI_CHAT_UI_UX_SPEC §16.4). iOS uses expo-haptics; Android
 * falls back to Vibration patterns. Everything is wrapped in a swallow-all so a
 * haptic failure can never take down a gesture or generation flow.
 */

function runHaptic(fn: () => Promise<void> | void) {
  try {
    void fn();
  } catch {
    // swallow
  }
}

function vibrate(pattern: number | number[]) {
  if (Platform.OS === 'android') runHaptic(() => Vibration.vibrate(pattern));
}

export const haptics = {
  tap() {
    if (Platform.OS === 'ios') runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    else vibrate(8);
  },
  select() {
    if (Platform.OS === 'ios') runHaptic(() => Haptics.selectionAsync());
    else vibrate(8);
  },
  confirm() {
    if (Platform.OS === 'ios') runHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    else vibrate(12);
  },
  success() {
    if (Platform.OS === 'ios')
      runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    else vibrate(10);
  },
  warning() {
    if (Platform.OS === 'ios')
      runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
    else vibrate([0, 10, 40, 10]);
  },
  error() {
    if (Platform.OS === 'ios')
      runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
    else vibrate([0, 15, 30, 15, 30, 15]);
  },
};

export const hapticTap = () => haptics.tap();
export const hapticSelect = () => haptics.select();
export const hapticConfirm = () => haptics.confirm();
export const hapticSuccess = () => haptics.success();