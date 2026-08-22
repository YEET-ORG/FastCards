import { Ionicons } from '@expo/vector-icons';
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
const HERO_TITLE = 'How can I help today?';

export function ChatLandingHero({ visible, hidden = false }: { visible: boolean; hidden?: boolean }) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width - 40, 520);
  const compact = width < 390;
  const titleSize = compact ? 31 : 34;
  const titleLineHeight = compact ? 37 : 40;

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
        <View
          style={[styles.logoDisc, { backgroundColor: colors.inset, borderColor: colors.line }]}>
          <Ionicons name="sparkles" size={44} color={colors.accentInk} />
        </View>
        <Text
          style={[
            styles.title,
            { color: colors.textPrimary, fontSize: titleSize, lineHeight: titleLineHeight },
          ]}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          numberOfLines={2}>
          {HERO_TITLE}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Ask about spending, cards, family or shopping.
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  heroBlock: {
    alignItems: 'center',
    gap: 28,
    width: '100%',
  },
  logoDisc: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
  },
  title: {
    fontFamily: ChatFonts.medium,
    letterSpacing: -0.55,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: ChatFonts.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: AiSpacing.conversationPaddingH,
  },
});