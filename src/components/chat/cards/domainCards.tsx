import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api, type Receipt, type ServerPreparedAction } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { PrimaryButton, TextButton } from '@/components/fin/Buttons';
import { ConfirmSheet } from '@/components/fin/ConfirmSheet';
import { ChatFonts } from '@/constants/ai-ui';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';
import type { StoredCard } from '@/store/chatStore';

/**
 * Domain card bodies (AI_CHAT_UI_UX_SPEC §12.2 — the registry shape carries
 * over; the bodies are FastCards-specific). The confirm lifecycle is ONE
 * morphing card: pending → processing → confirmed | failed | cancelled, patched
 * in place (§12.7). Execution still goes through the trusted gateway
 * (ConfirmSheet with biometry step-up → api.executeAction).
 */

export type ConfirmCardStatus = 'pending' | 'processing' | 'confirmed' | 'failed' | 'cancelled';

export interface ConfirmCardData {
  action: ServerPreparedAction;
  status: ConfirmCardStatus;
  receipt?: Receipt;
}

export interface ReceiptCardData {
  receipt: Receipt;
}

export function ProposalCard({
  card,
  onLifecycleChange,
}: {
  card: StoredCard;
  onLifecycleChange: (status: ConfirmCardStatus, receipt?: Receipt) => void;
}) {
  const colors = useColors();
  const { headers } = useAuth();
  const data = card.data as unknown as ConfirmCardData;
  const [confirming, setConfirming] = useState(false);

  const { action, status } = data;

  const handleConfirm = async () => {
    if (status !== 'pending') return;
    onLifecycleChange('processing');
    setConfirming(false);
    try {
      const receipt = await api.executeAction(headers, action.id, action.factsHash, `app-${action.id}`);
      onLifecycleChange('confirmed', receipt);
    } catch {
      onLifecycleChange('failed');
    }
  };

  const handleCancel = () => {
    if (status !== 'pending') return;
    void api.cancelAction(headers, action.id).catch(() => {});
    onLifecycleChange('cancelled');
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.raised, borderColor: colors.lineStrong }]}>
      <View style={styles.eyebrow}>
        <Ionicons name="create-outline" size={13} color={colors.warningInk} />
        <Text style={[styles.eyebrowText, { color: colors.warningInk }]}>Proposed change</Text>
      </View>

      <Text style={[styles.subject, { color: colors.textPrimary }]}>{action.subject}</Text>

      <View style={[styles.factList, { borderTopColor: colors.line }]}>
        {action.facts.map((f) => (
          <View key={f.label} style={styles.factRow}>
            <Text style={[styles.factLabel, { color: colors.textTertiary }]}>{f.label}</Text>
            <Text style={[styles.factValue, { color: colors.textPrimary }]}>{f.value}</Text>
          </View>
        ))}
      </View>

      {status === 'pending' ? (
        <View style={styles.proposalActions}>
          <PrimaryButton
            label={action.cta}
            onPress={() => setConfirming(true)}
            style={{ flex: 1, minHeight: 50 }}
          />
          <TextButton label="Cancel" tone={colors.textSecondary} onPress={handleCancel} />
        </View>
      ) : (
        <Text
          style={[
            styles.statusLine,
            {
              color:
                status === 'confirmed'
                  ? colors.mintInk
                  : status === 'failed'
                    ? colors.errorInk
                    : status === 'processing'
                      ? colors.textSecondary
                      : colors.textTertiary,
            },
          ]}>
          {status === 'confirmed'
            ? 'Applied'
            : status === 'failed'
              ? 'Failed — nothing changed'
              : status === 'processing'
                ? 'Applying…'
                : 'Cancelled'}
        </Text>
      )}

      <ConfirmSheet
        visible={confirming}
        title="Review change"
        subject={action.subject}
        facts={action.facts.map((f, i) => ({ ...f, emphasis: i === 0 }))}
        note={action.note}
        cta={action.cta}
        onConfirm={handleConfirm}
        onClose={() => setConfirming(false)}
      />
    </View>
  );
}

export function ReceiptCard({ card }: { card: StoredCard }) {
  const colors = useColors();
  const data = card.data as unknown as ReceiptCardData;
  const { receipt } = data;
  return (
    <View style={[styles.card, { backgroundColor: colors.cream, borderColor: colors.mintBorder }]}>
      <View style={styles.eyebrow}>
        <Ionicons name="checkmark-circle-outline" size={14} color={colors.mintInk} />
        <Text style={[styles.eyebrowText, { color: colors.mintInk }]}>Done</Text>
      </View>
      <Text style={[styles.subject, { color: colors.textPrimary }]}>{receipt.title}</Text>
      <View style={[styles.factList, { borderTopColor: colors.line }]}>
        {receipt.rows.map((r) => (
          <View key={r.label} style={styles.factRow}>
            <Text style={[styles.factLabel, { color: colors.textTertiary }]}>{r.label}</Text>
            <Text style={[styles.factValue, { color: colors.textPrimary }]}>{r.value}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.actorLine, { color: colors.textTertiary }]}>
        {receipt.actor} · recorded in Activity
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: space.l,
    gap: space.m,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eyebrowText: {
    fontSize: 11,
    fontFamily: ChatFonts.semiBold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  subject: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: ChatFonts.semiBold,
  },
  factList: {
    gap: 7,
    borderTopWidth: 1,
    paddingTop: space.m,
  },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.m,
  },
  factLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: ChatFonts.regular,
  },
  factValue: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: ChatFonts.medium,
    flexShrink: 1,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  proposalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.l,
  },
  statusLine: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: ChatFonts.medium,
  },
  actorLine: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: ChatFonts.regular,
  },
});