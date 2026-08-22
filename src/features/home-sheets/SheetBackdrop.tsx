import { BlurView } from 'expo-blur';
import { Pressable, Platform, StyleSheet } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

/**
 * The backdrop: a blurred scrim behind the sheet, rendered as a SIBLING of the
 * panel — never an ancestor — so no view above the `BlurView` animates its
 * opacity (`UIVisualEffectView` requires `alpha == 1` up its whole superview
 * chain; below that UIKit flattens the subtree offscreen and the effect does
 * not render at all). Port of GhostWallet's `PremiumSheetBackdrop`
 * (TOKEN_DETAIL_SHEET_UI_UX_SPEC.md §12.4).
 *
 * The blur intensity is never animated — animating it rebuilds the blur every
 * frame and janks both platforms.
 */
export const SCRIM_COLOR = '#0A0A0C';
export const SCRIM_MAX_OPACITY = 0.46;
const BLUR_INTENSITY = 56;

export function SheetBackdrop({
  progress,
  onPress,
  accessibilityLabel,
}: {
  /** 0 = sheet fully off-screen (no scrim), 1 = fully open. */
  progress: SharedValue<number>;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const scrimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 1], [0, SCRIM_MAX_OPACITY], Extrapolation.CLAMP);
    return {
      opacity,
      pointerEvents: opacity > 0 ? ('auto' as const) : ('none' as const),
    };
  });

  return (
    <Animated.View style={[styles.fill, scrimStyle]}>
      <BlurView
        style={styles.fill}
        tint="dark"
        intensity={BLUR_INTENSITY}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
      />
      <Animated.View style={[styles.fill, styles.scrim]} />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrim: {
    backgroundColor: SCRIM_COLOR,
  },
});