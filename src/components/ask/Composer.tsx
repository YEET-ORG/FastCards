// The AI command bar, on the onboarding thread and the chat screen.
//
// Deliberately the same control as the Home dock's Ask bar (see
// components/fin/HouseholdTabBar): a raised pill with a detached round button
// beside it, both sized from the shared `capsule` token so the two cannot
// drift apart. The one divergence is growth — the dock is single-line, while
// this one lets a long prompt wrap rather than scroll out of sight.
//
// Behavior extensions are opt-in so the shared consumer (card-rules) is
// untouched: `keyboardLift` adds the AI chat bar's Android keyboard
// correction, `focusSignal` adds programmatic focus for onboarding's
// "Custom amount" tap.

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useColors, useDepth } from '@/design/theme';
import { capsule, font, icon, radius } from '@/design/tokens';

/**
 * Android's `adjustPan` stops lifting the window as soon as the caret is on
 * screen, which leaves the bottom of the pill under the keyboard. This is the
 * remaining lift, mirrored from the AI chat bar (CommandBar).
 */
const ANDROID_PAN_CLEARANCE = capsule.height / 2 + 8;
/** Keyboard travel over which the correction above is blended in. */
const ANDROID_PAN_RAMP = 200;

export function Composer({
  onSubmit,
  placeholder = 'Ask anything about your money…',
  autoFocus,
  keyboardLift = false,
  focusSignal,
}: {
  onSubmit: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Onboarding only: lift the pill clear of the keyboard exactly like the AI
   * chat bar. iOS rides the screen's KeyboardAvoidingView, so this is the
   * Android `adjustPan` remainder. Off by default — existing consumers keep
   * their current keyboard layout. */
  keyboardLift?: boolean;
  /** Onboarding only: monotonic counter; each new value focuses the field
   * ("Custom amount" tap). Off by default. */
  focusSignal?: number;
}) {
  const colors = useColors();
  const pillShade = useDepth('raise3');
  const buttonShade = useDepth('orb');
  const inputRef = useRef<TextInput>(null);
  const lastFocusSignal = useRef<number | undefined>(undefined);
  const pressed = useSharedValue(0);
  const keyboard = useAnimatedKeyboard();
  const [text, setText] = useState('');
  const hasText = text.trim().length > 0;

  const send = () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    onSubmit(value);
  };

  // Programmatic focus via a monotonically increasing signal. The frame defer
  // is required — focusing synchronously in the same commit is dropped.
  useEffect(() => {
    if (focusSignal === undefined || focusSignal === lastFocusSignal.current) return;
    lastFocusSignal.current = focusSignal;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusSignal]);

  // The whole row rides the keyboard, not just the pill, so the send button
  // stays beside it. iOS is a no-op: the screen's KeyboardAvoidingView owns
  // the lift there.
  const liftStyle = useAnimatedStyle(() => {
    if (!keyboardLift || Platform.OS === 'ios') return { transform: [{ translateY: 0 }] };
    const kb = keyboard.height.value;
    const lifted = Math.min(kb / ANDROID_PAN_RAMP, 1);
    return { transform: [{ translateY: -ANDROID_PAN_CLEARANCE * lifted }] };
  });

  const buttonScale = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.03 }],
  }));

  return (
    <Animated.View style={[styles.row, liftStyle]}>
      <View style={[styles.pill, { backgroundColor: colors.raised, boxShadow: pillShade }]}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          multiline
          autoFocus={autoFocus}
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={send}
          accessibilityLabel={placeholder}
          style={[styles.input, { color: colors.textPrimary, fontFamily: font.regular }]}
        />
      </View>
      <Animated.View style={buttonScale}>
        <Pressable
          onPress={send}
          onPressIn={() => {
            pressed.value = withTiming(1, { duration: 100 });
          }}
          onPressOut={() => {
            pressed.value = withTiming(0, { duration: 200 });
          }}
          disabled={!hasText}
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !hasText }}
          // `lineStrong` rather than `inset` for the resting disc, for the same
          // reason the dock's button uses it: `inset` sits so close to both the
          // pill and the ground, in either theme, that the button ghosts out.
          style={[
            styles.button,
            { backgroundColor: hasText ? colors.accent : colors.lineStrong, boxShadow: buttonShade },
          ]}>
          <Ionicons
            name="arrow-up"
            size={icon.tab}
            color={hasText ? colors.onAccent : colors.textSecondary}
          />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // flex-end, so the button stays pinned to the bottom as the pill grows.
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    columnGap: capsule.gap,
  },
  pill: {
    flex: 1,
    minHeight: capsule.height,
    borderRadius: radius.pill,
    justifyContent: 'center',
    // 18 is the dock field's inset — the two must share a text baseline.
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  input: {
    fontSize: 15,
    lineHeight: 20,
    maxHeight: 120,
    paddingTop: 0,
    paddingBottom: 0,
    textAlignVertical: 'center',
  },
  button: {
    width: capsule.button,
    height: capsule.button,
    borderRadius: capsule.button / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});