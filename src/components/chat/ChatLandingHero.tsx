import { useEffect } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AiSpacing, ChatFonts } from '@/constants/ai-ui';
import { useColors } from '@/design/theme';
import { useReduceMotion } from '@/design/motion';

/**
 * Empty-thread landing hero (AI_CHAT_UI_UX_SPEC §10.6). FastCards has no local
 * model, so the hero is always "ready" — the loading pill stays available for
 * future use but is not driven by a model gate.
 */

export function ChatLandingHero({
  visible,
  hidden = false,
  name,
}: {
  visible: boolean;
  hidden?: boolean;
  name?: string;
}) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width - 40, 520);
  const compact = width < 390;
  const titleSize = compact ? 37 : 41;
  const titleLineHeight = compact ? 43 : 47;
  const title = name ? `Hey ${name}, how can I help?` : 'How can I help?';

  // The whole hero steps aside while the input is focused — the keyboard
  // owns the surface, so the hero fades rather than competing with it.
  const heroOpacity = useSharedValue(hidden ? 0 : 1);
  useEffect(() => {
    if (reduceMotion) {
      heroOpacity.set(hidden ? 0 : 1);
      return;
    }
    heroOpacity.set(withTiming(hidden ? 0 : 1, { duration: 160 }));
  }, [hidden, reduceMotion, heroOpacity]);
  const heroStyle = useAnimatedStyle(() => ({ opacity: heroOpacity.value }));

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View
        style={[styles.heroBlock, { maxWidth: contentWidth }, heroStyle]}
        accessible={false}
        accessibilityElementsHidden={!visible || hidden}>
        <Text
          style={[
            styles.title,
            { color: colors.textPrimary, fontSize: titleSize, lineHeight: titleLineHeight },
          ]}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          numberOfLines={2}>
          {title}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingTop: 16,
    width: '100%',
  },
  heroBlock: {
    alignItems: 'flex-start',
    paddingHorizontal: AiSpacing.conversationPaddingH,
    width: '100%',
  },
  title: {
    fontFamily: ChatFonts.bold,
    letterSpacing: -0.55,
    textAlign: 'left',
  },
});