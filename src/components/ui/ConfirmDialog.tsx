import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { radius, space } from '@/design/tokens';

/**
 * Centred confirm modal — the themed replacement for native Alert.alert
 * confirmations (e.g. sign-out). Follows the same layout as the chat
 * DeleteDialog but uses the shared design tokens, so it re-themes with the
 * app's white/black appearance.
 */

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const colors = useColors();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.center}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} onPress={onCancel} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.raised,
              borderColor: colors.lineStrong,
            },
          ]}>
          <AppText variant="section">{title}</AppText>
          <AppText variant="secondary" style={styles.message}>
            {message}
          </AppText>
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
              <AppText variant="label" tone={colors.textSecondary}>
                Cancel
              </AppText>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              accessibilityRole="button"
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
              <AppText variant="label" tone={destructive ? colors.error : colors.accentInk}>
                {confirmLabel}
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.s,
    padding: space.xl,
  },
  message: {
    lineHeight: 20,
    marginBottom: space.s,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.l,
  },
  action: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});