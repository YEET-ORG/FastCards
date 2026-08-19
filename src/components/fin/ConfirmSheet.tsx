import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/design/AppText';
import { color, radius, space } from '@/design/tokens';

import { PrimaryButton, TextButton } from './Buttons';

// Trusted confirmation surface (spec §69, UI §57). Immutable facts come
// from domain state, the CTA names the consequence, and the button locks
// on first tap so a double-tap can never execute twice.

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
  const [phase, setPhase] = useState<'review' | 'working'>('review');

  useEffect(() => {
    if (visible) setPhase('review');
  }, [visible]);

  const handleConfirm = async () => {
    if (phase !== 'review') return; // double-tap safety
    setPhase('working');
    try {
      // Step-up: real device biometric/passcode, bound to this exact
      // action by the prompt. Skipped only when the device has no
      // enrolled auth (e.g. simulators). Privy MFA replaces this later.
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
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={phase === 'review' ? onClose : undefined}
          accessibilityLabel="Dismiss"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.l }]}>
          <View style={styles.grabber} />
          <AppText variant="section">{title}</AppText>
          {subject ? (
            <AppText variant="secondary" style={{ marginTop: 2 }}>
              {subject}
            </AppText>
          ) : null}

          <View style={styles.facts}>
            {facts.map((f) => (
              <View key={f.label} style={styles.factRow}>
                <AppText variant="secondary" tone={color.textTertiary}>
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
            <AppText variant="secondary" tone={color.textTertiary} style={{ marginBottom: space.l }}>
              {note}
            </AppText>
          ) : null}

          <PrimaryButton
            label={cta}
            loading={phase === 'working'}
            onPress={handleConfirm}
            style={destructive ? { backgroundColor: color.error } : undefined}
          />
          <TextButton label="Cancel" tone={color.textSecondary} onPress={phase === 'review' ? onClose : undefined} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 4, 3, 0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: color.surface2,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space.xl,
    paddingTop: space.m,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.borderStrong,
    marginBottom: space.l,
  },
  facts: {
    gap: 10,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.borderSoft,
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
