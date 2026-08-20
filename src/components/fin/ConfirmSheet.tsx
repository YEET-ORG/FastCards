import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAskDockOptional } from '@/components/ask/AskDockContext';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { radius, space } from '@/design/tokens';

import { PrimaryButton, TextButton } from './Buttons';

export interface ConfirmFact {
  label: string;
  value: string;
  emphasis?: boolean;
}

export function ConfirmSheet({
  visible,
  title,
  subject,
  facts,
  note,
  cta,
  destructive,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  subject?: string;
  facts: ConfirmFact[];
  note?: string;
  cta: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const dock = useAskDockOptional();
  const [phase, setPhase] = useState<'review' | 'working'>('review');

  useEffect(() => {
    if (visible) setPhase('review');
  }, [visible]);

  useEffect(() => {
    dock?.setVaultOpen(visible);
    return () => dock?.setVaultOpen(false);
  }, [visible, dock]);

  const handleConfirm = async () => {
    if (phase !== 'review') return;
    setPhase('working');
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());
      if (enrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: cta,
          cancelLabel: 'Cancel',
        });
        if (!result.success) {
          setPhase('review');
          return;
        }
      }
      await onConfirm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch {
      setPhase('review');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={phase === 'review' ? onClose : undefined}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]} accessibilityViewIsModal>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={phase === 'review' ? onClose : undefined}
          accessibilityLabel="Dismiss"
        />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + space.l,
              backgroundColor: colors.raised,
              borderColor: colors.lineStrong,
            },
          ]}>
          <View style={[styles.grabber, { backgroundColor: colors.inset }]} />
          <AppText variant="section">{title}</AppText>
          {subject ? (
            <AppText variant="secondary" style={{ marginTop: 2 }}>
              {subject}
            </AppText>
          ) : null}

          <View style={[styles.facts, { backgroundColor: colors.cream, borderColor: colors.line }]}>
            {facts.map((f) => (
              <View key={f.label} style={styles.factRow}>
                <AppText variant="secondary" tone={colors.textTertiary}>
                  {f.label}
                </AppText>
                <AppText
                  variant={f.emphasis ? 'cardTitle' : 'body'}
                  tabular
                  style={{ flexShrink: 1, textAlign: 'right' }}>
                  {f.value}
                </AppText>
              </View>
            ))}
          </View>

          {note ? (
            <AppText variant="secondary" tone={colors.textTertiary} style={{ marginBottom: space.l }}>
              {note}
            </AppText>
          ) : null}

          <PrimaryButton
            label={cta}
            loading={phase === 'working'}
            onPress={handleConfirm}
            style={destructive ? { backgroundColor: colors.error } : undefined}
          />
          <TextButton label="Cancel" tone={colors.textSecondary} onPress={phase === 'review' ? onClose : undefined} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.m,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    marginBottom: space.l,
  },
  facts: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: space.l,
    marginVertical: space.l,
  },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.l,
  },
});
