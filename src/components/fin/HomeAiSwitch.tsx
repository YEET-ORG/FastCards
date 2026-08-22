import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion } from '@/design/motion';
import { useColors, useDepth } from '@/design/theme';
import { radius, spring } from '@/design/tokens';

/**
 * The Home ↔ AI switch: a small pill whose two sides — Home and AI — keep
 * their icons fixed in place. The active side is bright, the other dimmed,
 * and a raised thumb slides between them. Tap the inactive side to switch,
 * or swipe right for AI / left for Home; switching navigates to the existing
 * chat screen (or back to Home via the tabs root).
 */
const TRACK_H = 32;
const SIDE_W = 44;
const THUMB_MARGIN = 3;
const SWIPE_THRESHOLD = 36;

type Mode = 'home' | 'ai';

export function HomeAiSwitch({ mode }: { mode: Mode }) {
  const router = useRouter();
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const thumbShade = useDepth('raise1');

  const trackW = useSharedValue(0);
  const progress = useSharedValue(mode === 'home' ? 0 : 1);
  const dragStart = useSharedValue(0);

  const goTo = useCallback(
    (target: Mode) => {
      if (target === mode) return;
      Haptics.selectionAsync();
      if (target === 'ai') {
        router.push('/chat');
      } else {
        // Pop every screen above the tabs: chat is reachable from
        // transaction, member and card screens too, and this switch always
        // means Home.
        router.dismissTo('/(tabs)');
      }
    },
    [mode, router],
  );

  // The gesture is built before the effect that syncs the thumb, and the
  // shared values stay out of both dep arrays — the same ordering the scope
  // pager uses so the hooks lint keeps the thumb writable (see
  // useScopePager.ts for the reasoning).
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(8)
        .onBegin(() => {
          'worklet';
          dragStart.value = progress.value;
        })
        .onUpdate((e) => {
          'worklet';
          if (reduceMotion) return;
          const half = Math.max(trackW.value / 2, 1);
          progress.value = Math.min(Math.max(dragStart.value + e.translationX / half, 0), 1);
        })
        .onEnd((e) => {
          'worklet';
          const settle = (target: 0 | 1) => {
            if (reduceMotion) progress.value = target;
            else progress.value = withSpring(target, spring);
          };
          if (e.translationX > SWIPE_THRESHOLD) {
            if (mode !== 'ai') runOnJS(goTo)('ai');
            else settle(1);
          } else if (e.translationX < -SWIPE_THRESHOLD) {
            if (mode !== 'home') runOnJS(goTo)('home');
            else settle(0);
          } else {
            settle(mode === 'home' ? 0 : 1);
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, reduceMotion, goTo],
  );

  // Settle the thumb whenever the active mode changes from outside the
  // gesture (a fresh screen mounting in the other mode).
  useEffect(() => {
    const target = mode === 'home' ? 0 : 1;
    if (reduceMotion) progress.value = withTiming(target, { duration: 120 });
    else progress.value = withSpring(target, spring);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, reduceMotion]);

  const thumbStyle = useAnimatedStyle(() => {
    const half = Math.max(trackW.value / 2, 0);
    return {
      width: Math.max(half - THUMB_MARGIN * 2, 0),
      transform: [{ translateX: THUMB_MARGIN + progress.value * half }],
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={(e) => {
          trackW.value = e.nativeEvent.layout.width;
        }}
        style={[
          styles.track,
          { backgroundColor: colors.raised, borderColor: colors.line, boxShadow: thumbShade },
        ]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            { backgroundColor: colors.cream, boxShadow: thumbShade },
            thumbStyle,
          ]}
        />
        <Pressable
          onPress={() => goTo('home')}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'home' }}
          accessibilityLabel="Home"
          accessibilityHint="Swipe right for AI, left for Home"
          style={styles.side}>
          <Ionicons
            name="home"
            size={16}
            color={mode === 'home' ? colors.iconPrimary : colors.textTertiary}
          />
        </Pressable>
        <Pressable
          onPress={() => goTo('ai')}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'ai' }}
          accessibilityLabel="AI assistant"
          accessibilityHint="Swipe right for AI, left for Home"
          style={styles.side}>
          <Ionicons
            name="sparkles"
            size={16}
            color={mode === 'ai' ? colors.iconPrimary : colors.textTertiary}
          />
        </Pressable>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  track: {
    // Fixed size: the thumb is absolute and the sides are flexless, so an
    // unconstrained row would otherwise collapse to its padding.
    width: SIDE_W * 2 + THUMB_MARGIN * 2,
    height: TRACK_H,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: THUMB_MARGIN,
  },
  thumb: {
    position: 'absolute',
    top: THUMB_MARGIN,
    bottom: THUMB_MARGIN,
    borderRadius: radius.pill,
  },
  side: {
    width: SIDE_W,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
});