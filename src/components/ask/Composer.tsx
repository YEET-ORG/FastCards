// The AI command bar, on the onboarding thread and the chat screen.
//
// Deliberately the same control as the Home dock's Ask bar (see
// components/fin/HouseholdTabBar): a raised pill with a detached round button
// beside it, both sized from the shared `capsule` token so the two cannot
// drift apart. The one divergence is growth — the dock is single-line, while
// this one lets a long prompt wrap rather than scroll out of sight.

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useColors, useDepth } from '@/design/theme';
import { capsule, font, icon, radius } from '@/design/tokens';

export function Composer({
  onSubmit,
  placeholder = 'Ask anything about your money…',
  autoFocus,
}: {
  onSubmit: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const colors = useColors();
  const pillShade = useDepth('raise3');
  const buttonShade = useDepth('orb');
  const [text, setText] = useState('');
  const hasText = text.trim().length > 0;

  const send = () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    onSubmit(value);
  };

  return (
    <View style={styles.row}>
      <View style={[styles.pill, { backgroundColor: colors.raised, boxShadow: pillShade }]}>
        <TextInput
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
      <Pressable
        onPress={send}
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
    </View>
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
