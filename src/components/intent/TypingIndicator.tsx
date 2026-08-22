import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * Three pulsing dots (AI_CHAT_UI_UX_SPEC §10.3).
 */
const DOT_SIZE = 5;
const DOT_GAP = 5;
const PULSE_MS = 340;
const STAGGER_MS = 150;

function Dot({ delay, color }: { delay: number; color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: PULSE_MS, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(progress);
  }, [delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.value * 0.65,
    transform: [{ translateY: -2 * progress.value }],
  }));

  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

export function TypingIndicator({ color }: { color: string }) {
  return (
    <View style={styles.container} accessibilityLabel="Assistant is typing">
      <Dot delay={0} color={color} />
      <Dot delay={STAGGER_MS} color={color} />
      <Dot delay={STAGGER_MS * 2} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 20,
    columnGap: DOT_GAP,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});