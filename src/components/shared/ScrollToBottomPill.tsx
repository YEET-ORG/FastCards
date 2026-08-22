import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useColors } from '@/design/theme';

/**
 * Scroll-to-bottom pill (AI_CHAT_UI_UX_SPEC §14.4).
 */
const PILL_SIZE = 40;

export function ScrollToBottomPill({ visible, bottomOffset, onPress }: { visible: boolean; bottomOffset: number; onPress: () => void }) {
  const colors = useColors();
  if (!visible) return null;
  return (
    <View style={[styles.container, { bottom: bottomOffset }]} pointerEvents="box-none">
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Scroll to bottom"
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: colors.surfaceStrong,
              borderColor: colors.borderSubtle,
              shadowColor: '#000',
            },
            pressed && { opacity: 0.8 },
          ]}>
          <Ionicons name="chevron-down" size={20} color={colors.textPrimary} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  button: {
    width: PILL_SIZE,
    height: PILL_SIZE,
    borderRadius: PILL_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
});