import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useColors } from '@/design/theme';
import { font, radius } from '@/design/tokens';
import BottomInputBar from '@/shared/ui/ai/bottom-input-bar';

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
  const [text, setText] = useState('');
  const hasText = text.trim().length > 0;

  const send = () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    onSubmit(value);
  };

  return (
    <BottomInputBar
      value={text}
      onChangeText={setText}
      placeholder={placeholder}
      placeholderTextColor={colors.textTertiary}
      multiline
      minHeight={92}
      maxHeight={170}
      autoFocus={autoFocus}
      onSend={send}
      style={styles.wrapper}
      containerStyle={[
        styles.container,
        { backgroundColor: colors.raised, borderColor: colors.lineStrong },
      ]}
      inputStyle={[styles.input, { color: colors.textPrimary, fontFamily: font.regular }]}
      renderLeftAccessory={() => <Ionicons name="sparkles-outline" size={16} color={colors.mintInk} />}
      renderRightAccessory={() => (
        <Pressable
          onPress={send}
          disabled={!hasText}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={[styles.sendBtn, { backgroundColor: hasText ? colors.accent : colors.inset }]}>
          <Ionicons name="arrow-up" size={17} color={hasText ? colors.onAccent : colors.textTertiary} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    padding: 0,
  },
  container: {
    borderWidth: 1,
    borderRadius: radius.card,
    paddingTop: 14,
    paddingBottom: 10,
  },
  input: {
    fontSize: 15,
  },
  sendBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
