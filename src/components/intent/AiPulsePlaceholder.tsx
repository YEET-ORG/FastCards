import { useEffect } from 'react';
import { StyleSheet, View, type TextStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AiMotion, ChatFonts } from '@/constants/ai-ui';

/**
 * Pulsing label placeholder + blinking streaming cursor (AI_CHAT_UI_UX_SPEC
 * §10.4). Pulse: 0.45 → 1 → 0.45 @ 900ms; cursor: 1 → 0.2 → 1 @ 520ms.
 */

function usePulse(duration: number, low: number, high: number) {
  const progress = useSharedValue(high);
  useEffect(() => {
    progress.value = withRepeat(
      withSequence(withTiming(low, { duration }), withTiming(high, { duration })),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [duration, low, high, progress]);
  return progress;
}

export function AiStreamingCursor({ color, style }: { color: string; style?: TextStyle }) {
  const blink = usePulse(AiMotion.cursorBlinkMs, 0.2, 1);
  const cursorStyle = useAnimatedStyle(() => ({ opacity: blink.value }));
  return (
    <Animated.Text style={[styles.cursor, { color }, cursorStyle, style]}>
      {'\u258C'}
    </Animated.Text>
  );
}


const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontFamily: ChatFonts.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  cursor: {
    fontFamily: ChatFonts.regular,
    fontSize: 15,
    lineHeight: 22,
    marginLeft: 1,
  },
});