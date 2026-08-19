import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';

import { color, radius } from '@/design/tokens';
import BottomInputBar from '@/shared/ui/ai/bottom-input-bar';

// Ask composer on Reacticx's AI bottom-input-bar: multiline input on top,
// accessory row beneath — sparkles + mic left, mint send right.

export function Composer({
  onSubmit,
  placeholder = 'Ask anything about your money…',
  autoFocus,
}: {
  onSubmit: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
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
      placeholderTextColor={color.textTertiary}
      multiline
      minHeight={92}
      maxHeight={170}
      autoFocus={autoFocus}
      onSend={send}
      style={styles.wrapper}
      containerStyle={styles.container}
      inputStyle={styles.input}
      renderLeftAccessory={() => (
        <>
          <Ionicons name="sparkles-outline" size={18} color={color.mint} />
          <Pressable
            onPress={() =>
              Alert.alert('Voice input', 'Voice mode arrives after the MVP. Type your request for now.')
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Voice input, coming later">
            <Ionicons name="mic-outline" size={19} color={color.textTertiary} />
          </Pressable>
        </>
      )}
      renderRightAccessory={() => (
        <Pressable
          onPress={send}
          disabled={!hasText}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={[styles.sendBtn, !hasText && { backgroundColor: color.surface3 }]}>
          <Ionicons name="arrow-up" size={17} color={hasText ? color.onMint : color.textTertiary} />
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
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.card,
    paddingTop: 14,
    paddingBottom: 10,
  },
  input: {
    fontSize: 15,
    color: color.textPrimary,
  },
  sendBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
