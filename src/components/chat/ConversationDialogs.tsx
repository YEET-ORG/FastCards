import { useEffect, useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ChatFonts } from '@/constants/ai-ui';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';

/**
 * Rename + delete dialogs for the conversation drawer (AI_CHAT_UI_UX_SPEC
 * §13.6). Rename is bottom-anchored and rides the keyboard; delete is a
 * centred confirm modal.
 */

export function RenameDialog({
  visible,
  initial,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initial: string;
  onCancel: () => void;
  onSave: (title: string) => void;
}) {
  const colors = useColors();
  const [text, setText] = useState(initial);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setText(initial), 0);
    return () => clearTimeout(t);
  }, [visible, initial]);

  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setKeyboardHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible]);

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onSave(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.renameCenter}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Dismiss" />
        <View
          style={[
            styles.renameDialogCard,
            {
              backgroundColor: colors.surfaceOverlay,
              borderColor: colors.borderSubtle,
              // Bottom-anchored above the keyboard; never closer than 96.
              paddingBottom: Math.max(keyboardHeight + 18, 96),
            },
          ]}>
          <Text style={[styles.renameTitle, { color: colors.textPrimary }]}>Rename chat</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            maxLength={80}
            autoFocus
            onSubmitEditing={submit}
            placeholder="Chat name"
            placeholderTextColor={colors.textTertiary}
            selectionColor={colors.textPrimary}
            style={[
              styles.renameInput,
              {
                color: colors.textPrimary,
                backgroundColor: colors.surfaceStrong,
                borderColor: colors.borderSubtle,
              },
            ]}
          />
          <View style={styles.renameActions}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              style={({ pressed }) => [styles.renameDialogBtn, pressed && { opacity: 0.7 }]}>
              <Text style={[styles.renameBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={text.trim().length === 0}
              accessibilityRole="button"
              accessibilityState={{ disabled: text.trim().length === 0 }}
              style={({ pressed }) => [
                styles.renameSaveBtn,
                { borderColor: colors.borderSubtle },
                pressed && { opacity: 0.7 },
                text.trim().length === 0 && { opacity: 0.45 },
              ]}>
              <Text style={[styles.renameBtnText, { color: colors.textPrimary }]}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function DeleteDialog({
  visible,
  title,
  onCancel,
  onDelete,
}: {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogCenter}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Dismiss" />
        <View
          style={[
            styles.dialogCard,
            { backgroundColor: colors.surfaceOverlay, borderColor: colors.borderSubtle },
          ]}>
          <Text style={[styles.dialogTitle, { color: colors.textPrimary }]}>Delete chat?</Text>
          <Text style={[styles.dialogBody, { color: colors.textSecondary }]}>
            Remove “{title}”? This cannot be undone.
          </Text>
          <View style={styles.dialogActions}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              style={({ pressed }) => [styles.dialogBtn, pressed && { opacity: 0.7 }]}>
              <Text style={[styles.dialogBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              style={({ pressed }) => [styles.dialogBtn, pressed && { opacity: 0.7 }]}>
              <Text style={[styles.dialogBtnText, { color: colors.accentNegative }]}>Delete</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  renameCenter: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: space.xl,
  },
  renameDialogCard: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 16,
    paddingBottom: space.l,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  renameTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: ChatFonts.semiBold,
  },
  renameInput: {
    borderRadius: 16,
    borderWidth: 1,
    fontFamily: ChatFonts.regular,
    fontSize: 17,
    minHeight: 50,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.m,
  },
  renameDialogBtn: {
    borderRadius: 16,
    minHeight: 42,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  renameSaveBtn: {
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 42,
    minWidth: 74,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  renameBtnText: {
    fontSize: 15,
    fontFamily: ChatFonts.medium,
  },
  dialogCenter: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  dialogCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 12,
  },
  dialogTitle: {
    fontFamily: ChatFonts.semiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  dialogBody: {
    fontSize: 14,
    fontFamily: ChatFonts.regular,
    lineHeight: 20,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 4,
  },
  dialogBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  dialogBtnText: {
    fontSize: 15,
    fontFamily: ChatFonts.medium,
  },
});