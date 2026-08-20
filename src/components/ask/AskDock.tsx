import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { PlusMenu } from '@/components/ask/PlusMenu';
import { useAskDock } from '@/components/ask/AskDockContext';
import { useToast } from '@/components/fin/Toast';
import { useColors } from '@/design/theme';
import { useReduceMotion } from '@/design/motion';
import { font, radius, screenPad, shadow, spring } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import AnimatedInput from '@/shared/ui/base/animated-input-bar';

const PLACEHOLDERS = [
  'Ask anything…',
  'How much does Maya have left?',
  "Freeze Dad’s card",
  'Add ₹1,000 until Sunday',
];

export function AskDock() {
  const colors = useColors();
  const { mode } = useTheme();
  const reduceMotion = useReduceMotion();
  const router = useRouter();
  const toast = useToast();
  const focused = useIsFocused();
  const { tabBarHeight, scrollHidden, vaultOpen, askHome } = useAskDock();

  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const hasText = text.trim().length > 0;
  const baseWindowH = Dimensions.get('window').height;

  useEffect(() => {
    const show = (e: { endCoordinates: { height: number } }) => {
      const h = e.endCoordinates.height;
      const now = Dimensions.get('window').height;
      const resized = baseWindowH - now > h * 0.4;
      setKeyboardHeight(resized ? 0 : h);
    };
    const hide = () => setKeyboardHeight(0);
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvent, show);
    const b = Keyboard.addListener(hideEvent, hide);
    return () => {
      a.remove();
      b.remove();
    };
  }, [baseWindowH]);

  const hidden = vaultOpen || (!askHome && scrollHidden) || !focused;
  const hideProgress = useSharedValue(0);
  const sendProgress = useSharedValue(hasText ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      hideProgress.value = hidden ? 1 : 0;
    } else {
      hideProgress.value = withSpring(hidden ? 1 : 0, spring);
    }
  }, [hidden, reduceMotion, hideProgress]);

  useEffect(() => {
    sendProgress.value = reduceMotion
      ? hasText
        ? 1
        : 0
      : withSpring(hasText ? 1 : 0, spring);
    if (hasText) setMenuOpen(false);
  }, [hasText, reduceMotion, sendProgress]);

  const dockAnim = useAnimatedStyle(() => ({
    opacity: reduceMotion ? (hideProgress.value ? 0 : 1) : 1 - hideProgress.value,
    transform: [{ translateY: reduceMotion ? 0 : hideProgress.value * 72 }],
  }));

  const plusAnim = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 - sendProgress.value * 0.08 },
      { rotate: `${sendProgress.value * 90}deg` },
    ],
    opacity: 1 - sendProgress.value,
  }));

  const sendAnim = useAnimatedStyle(() => ({
    transform: [{ scale: 0.7 + sendProgress.value * 0.3 }],
    opacity: sendProgress.value,
  }));

  const bottom = keyboardHeight > 0 ? keyboardHeight + 8 : tabBarHeight + 8;
  const shade = mode === 'night' ? shadow.night.dock : shadow.sunlit.dock;

  const send = () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    router.push({ pathname: '/chat', params: { q: value } });
  };

  const onPlus = () => {
    if (hasText) {
      send();
      return;
    }
    setMenuOpen((v) => !v);
  };

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      style={[styles.wrap, { bottom }, dockAnim]}>
      {menuOpen && !hasText ? (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel="Dismiss menu" />
          <View style={styles.menuAnchor}>
            <PlusMenu
              onDismiss={() => setMenuOpen(false)}
              items={[
                {
                  key: 'voice',
                  icon: 'mic-outline',
                  label: 'Voice',
                  onPress: () => toast('Voice arrives after MVP.'),
                },
                {
                  key: 'move',
                  icon: 'swap-horizontal-outline',
                  label: 'Move money',
                  onPress: () => router.push('/move-money'),
                },
                {
                  key: 'card',
                  icon: 'card-outline',
                  label: 'New card',
                  onPress: () => router.push('/order-card'),
                },
                {
                  key: 'photo',
                  icon: 'camera-outline',
                  label: 'Photo',
                  caption: 'Coming later',
                  disabled: true,
                  onPress: () => undefined,
                },
              ]}
            />
          </View>
        </>
      ) : null}

      <View
        style={[
          styles.dock,
          {
            backgroundColor: colors.raised,
            borderColor: colors.line,
            shadowColor: shade.color,
            shadowOffset: shade.offset,
            shadowOpacity: shade.opacity,
            shadowRadius: shade.radius,
            elevation: shade.elevation,
          },
        ]}>
        <AnimatedInput
          placeholders={PLACEHOLDERS}
          animationInterval={3200}
          value={text}
          onChangeText={setText}
          blurIntensityRange={[0, 0, 0]}
          accessibilityLabel="Ask anything"
          accessibilityRole="search"
          placeholderStyle={{ color: colors.textTertiary, fontFamily: font.regular, fontSize: 15 }}
          inputStyle={{ color: colors.textPrimary, fontFamily: font.regular, fontSize: 15 }}
          containerStyle={styles.inputContainer}
          inputWrapperStyle={styles.inputWrapper}
          returnKeyType="send"
          onSubmitEditing={send}
        />
        <Pressable
          onPress={onPlus}
          accessibilityRole="button"
          accessibilityLabel={hasText ? 'Send' : 'More actions'}
          accessibilityHint={
            hasText ? 'Opens a conversation with this request.' : 'Voice, move money, new card.'
          }
          style={[
            styles.morph,
            { backgroundColor: hasText ? colors.accent : menuOpen ? colors.inset : colors.inset },
          ]}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.morphIcon, plusAnim]}>
            <Ionicons name="add" size={22} color={colors.textPrimary} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, styles.morphIcon, sendAnim]}>
            <Ionicons name="arrow-up" size={20} color={colors.onAccent} />
          </Animated.View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: screenPad,
    right: screenPad,
    zIndex: 20,
  },
  menuAnchor: {
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    maxHeight: 96,
    borderRadius: radius.dock,
    borderWidth: 1,
    paddingLeft: 4,
    paddingRight: 6,
    gap: 4,
  },
  inputContainer: {
    flex: 1,
    width: undefined,
    marginVertical: 0,
  },
  inputWrapper: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  morph: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  morphIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
