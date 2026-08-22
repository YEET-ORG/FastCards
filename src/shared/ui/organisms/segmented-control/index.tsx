import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useAnimatedProps,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { SegmentedControlPresets, SHADOW } from "./presets";
import type { ISegmentedControl } from "./types";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { BlurView, type BlurViewProps } from "expo-blur";
import { impactAsync, ImpactFeedbackStyle } from "expo-haptics";
import { scheduleOnRN } from "react-native-worklets";

const AnimatedBlurView =
  Animated.createAnimatedComponent(BlurView);

const width = Dimensions.get("screen").width - 40;

const SegmentedControl: React.FC<ISegmentedControl> &
  React.FunctionComponent<ISegmentedControl> = ({
  children,
  onChange,
  currentIndex,
  preset = "ios",
  segmentedControlBackgroundColor,
  activeSegmentBackgroundColor,
  paddingVertical = 12,
  dividerColor,
  borderRadius = 8,
  disableScaleEffect = false,
  marginVertical = 20,
}: ISegmentedControl):
  | (React.ReactNode & React.JSX.Element & React.ReactElement)
  | null => {
  const theme = SegmentedControlPresets[preset];
  const finalSegmentedControlBackgroundColor =
    segmentedControlBackgroundColor ?? theme.segmentedControlBackgroundColor;
  const finalActiveSegmentBackgroundColor =
    activeSegmentBackgroundColor ?? theme.activeSegmentBackgroundColor;
  const finalDividerColor = dividerColor ?? theme.dividerColor;

  const childrenArray = React.Children.toArray(children);
  const tabsCount = childrenArray.length;

  const translateValue = (width - 4) / tabsCount;

  const tabTranslate = useSharedValue<number>(currentIndex * translateValue);
  const blurAmount = useSharedValue<number>(0);
  const isDragging = useSharedValue<boolean>(false);
  const dragStartIndex = useRef<number>(currentIndex);

  const activeScale = useSharedValue(1);

  const triggerBlur = useCallback(() => {
    blurAmount.value = withSequence<number>(
      withTiming<number>(3, {
        duration: 80,
        easing: Easing.inOut(Easing.ease),
      }),
      withTiming<number>(0, {
        duration: 80,
        easing: Easing.inOut(Easing.ease),
      }),
    );
  }, []);

  const triggerTapScale = useCallback(() => {
    if (disableScaleEffect) return;
    activeScale.value = withSequence<number>(
      withTiming<number>(1.08, { duration: 60 }),
      withSpring<number>(1, { stiffness: 260, damping: 20, mass: 0.5 }),
    );
  }, [disableScaleEffect]);
  const memoizedTabPressCallback = useCallback(
    (index: number) => {
      tabTranslate.value = withSpring<number>(index * translateValue, {
        stiffness: 420,
        damping: 32,
        mass: 0.5,
      });
      onChange(index);
      if (!isDragging.value) {
        triggerBlur();
        triggerTapScale();
        impactAsync(ImpactFeedbackStyle.Medium);
      }
    },
    [onChange, triggerBlur, triggerTapScale, translateValue],
  );

  useEffect(() => {
    tabTranslate.value = withSpring<number>(currentIndex * translateValue, {
      stiffness: 420,
      damping: 32,
      mass: 0.5,
    });
  }, [currentIndex, translateValue]);

  const animatedTabStyle = useAnimatedStyle<
    Partial<Pick<ViewStyle, "transform">>
  >(() => {
    return {
      transform: [
        { translateX: tabTranslate.value },
        { scale: activeScale.value },
      ],
    };
  });

  const animatedBlurViewProps = useAnimatedProps<
    Required<Pick<BlurViewProps, "intensity">>
  >(() => {
    return {
      intensity: blurAmount.value,
    };
  });

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(10)

        .onStart(() => {
          isDragging.value = true;
          dragStartIndex.current = currentIndex;
          if (disableScaleEffect) return;
          activeScale.value = withSpring<number>(1.2, {
            stiffness: 300,
            damping: 15,
          });
          scheduleOnRN(impactAsync, ImpactFeedbackStyle.Medium);
        })
        .onUpdate((event) => {
          const tabWidth = (width - 4) / tabsCount;
          const rawIndex = Math.floor(event.x / tabWidth);
          const newIndex = Math.max(0, Math.min(tabsCount - 1, rawIndex));

          if (newIndex !== currentIndex && newIndex >= 0 && newIndex < tabsCount) {
            scheduleOnRN(onChange, newIndex);
            scheduleOnRN(impactAsync, ImpactFeedbackStyle.Rigid);
          }
        })
        .onEnd(() => {
          isDragging.value = false;
          activeScale.value = withSpring<number>(1, {
            stiffness: 200,
            damping: 20,
          });
          if (currentIndex !== dragStartIndex.current) {
            scheduleOnRN(triggerBlur);
            scheduleOnRN(impactAsync, ImpactFeedbackStyle.Medium);
          }
        })
        .onFinalize(() => {
          isDragging.value = false;
          activeScale.value = withSpring(1, { stiffness: 200, damping: 20 });
        }),
    // The gesture is rebuilt only when the values it closes over change.
    [onChange, triggerBlur, disableScaleEffect, currentIndex, tabsCount],
  );

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.segmentedControlWrapper,
          {
            backgroundColor: finalSegmentedControlBackgroundColor,
            paddingVertical: paddingVertical,
            borderRadius,
            marginVertical,
          },
        ]}
      >
        <Animated.View
          style={[
            {
              ...StyleSheet.absoluteFill,
              position: "absolute",
              width: (width - 4) / tabsCount,
              top: 0,
              marginVertical: 2,
              marginHorizontal: 2,
              backgroundColor: finalActiveSegmentBackgroundColor,
              borderRadius,
              ...SHADOW,
            },
            animatedTabStyle,
          ]}
          pointerEvents="none"
        />

        {childrenArray.map<React.ReactNode>((child, index) => {
          const showDivider = index < tabsCount - 1;

          return (
            <React.Fragment key={index}>
              <TouchableOpacity
                style={[styles.textWrapper]}
                onPress={() => memoizedTabPressCallback(index)}
                activeOpacity={0.7}
              >
                {child}
              </TouchableOpacity>

              {showDivider && (
                <AnimatedDivider
                  currentIndex={currentIndex}
                  dividerIndex={index}
                  color={finalDividerColor}
                />
              )}
            </React.Fragment>
          );
        })}

        <AnimatedBlurView
          style={[
            {
              overflow: "hidden",
              borderRadius,
              ...StyleSheet.absoluteFill,
            },
          ]}
          animatedProps={animatedBlurViewProps}
          tint="default"
          pointerEvents="none"
        />
      </Animated.View>
    </GestureDetector>
  );
};

const AnimatedDivider: React.FC<{
  currentIndex: number;
  dividerIndex: number;
  color: string;
}> = ({ currentIndex, dividerIndex, color }) => {
  const opacity = useSharedValue(1);

  useEffect(() => {
    const shouldFadeOut =
      dividerIndex === currentIndex || dividerIndex === currentIndex - 1;

    opacity.value = withTiming(shouldFadeOut ? 0 : 1, {
      duration: 120,
    });
  }, [currentIndex, dividerIndex]);

  const animatedDividerStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  return (
    <Animated.View
      style={[styles.divider, { backgroundColor: color }, animatedDividerStyle]}
    />
  );
};

const styles = StyleSheet.create({
  segmentedControlWrapper: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    width: width,
    marginVertical: 20,
  },
  textWrapper: {
    flex: 1,
    elevation: 9,
    paddingHorizontal: 5,
  },
  divider: {
    width: 1,
    height: "60%",
    alignSelf: "center",
  },
});

export default memo(SegmentedControl);
