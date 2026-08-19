import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api, type Receipt, type ServerPreparedAction } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { PrimaryButton, TextButton } from '@/components/fin/Buttons';
import { ConfirmSheet } from '@/components/fin/ConfirmSheet';
import { AppText } from '@/design/AppText';
import { color, font, space } from '@/design/tokens';
import LoadingState from '@/shared/ui/ai/thinking-state';

// Known structured renderers for the Ask thread (spec §18). Proposals
// come PREPARED from the server (facts + hash); confirming executes them
// through the trusted gateway — the model never draws financial UI and
// the client never invents facts.

export function UserBubble({ text }: { text: string }) {
  return (
    <View style={styles.userBubble}>
      <AppText variant="body">{text}</AppText>
    </View>
  );
}

export function AssistantText({ text, degraded }: { text: string; degraded?: boolean }) {
  return (
    <View style={{ gap: 4, maxWidth: '92%' }}>
      <AppText variant="body" tone={color.textSecondary}>
        {text}
      </AppText>
      {degraded ? (
        <AppText variant="caption" tone={color.warning}>
          AI is temporarily limited — answered with basic commands.
        </AppText>
      ) : null}
    </View>
  );
}

export function ThinkingIndicator() {
  return (
    <View style={styles.thinking}>
      <Ionicons name="sparkles-outline" size={13} color={color.mint} style={{ marginTop: 4 }} />
      <LoadingState
        lines={['Checking balances…', 'Reading household rules…', 'Preparing a safe answer…']}
        visibleLines={2}
        lineHeight={20}
        scrollSpeed={900}
        showLineNumbers={false}
        containerStyle={{ height: 44, flex: 1 }}
        lineTextStyle={{ color: color.textTertiary, fontSize: 13, fontFamily: font.regular }}
        gradientColors={[color.bg, 'rgba(5,5,6,0)']}
      />
    </View>
  );
}

/**
 * A server-prepared action awaiting the user's decision. "Review &
 * apply" opens the trusted ConfirmSheet showing the server's frozen
 * facts; confirm executes via the gateway (facts hash + step-up +
 * idempotency) and reports the receipt back to the thread.
 */
export function ServerProposalBlock({
  action,
  status,
  onExecuted,
  onCancelled,
}: {
  action: ServerPreparedAction;
  status: 'pending' | 'executed' | 'cancelled' | 'failed';
  onExecuted: (receipt: Receipt) => void;
  onCancelled: () => void;
}) {
  const { headers } = useAuth();
  const [confirming, setConfirming] = useState(false);

  return (
    <View style={[styles.toolCard, styles.proposalCard]}>
      <View style={styles.eyebrow}>
        <Ionicons name="create-outline" size={13} color={color.warning} />
        <AppText variant="label" tone={color.warning}>
          Proposed change
        </AppText>
      </View>
      <AppText variant="cardTitle">{action.subject}</AppText>
      <View style={styles.factList}>
        {action.facts.map((f) => (
          <View key={f.label} style={styles.factRow}>
            <AppText variant="secondary" tone={color.textTertiary}>
              {f.label}
            </AppText>
            <AppText variant="secondary" tabular style={{ flexShrink: 1, textAlign: 'right' }}>
              {f.value}
            </AppText>
          </View>
        ))}
      </View>

      {status === 'pending' ? (
        <View style={styles.proposalActions}>
          <PrimaryButton label="Review & apply" onPress={() => setConfirming(true)} style={{ flex: 1, minHeight: 44 }} />
          <TextButton
            label="Cancel"
            tone={color.textSecondary}
            onPress={() => {
              void api.cancelAction(headers, action.id).catch(() => {});
              onCancelled();
            }}
          />
        </View>
      ) : (
        <AppText
          variant="caption"
          tone={status === 'executed' ? color.mint : status === 'failed' ? color.error : color.textTertiary}>
          {status === 'executed' ? 'Applied' : status === 'failed' ? 'Failed — nothing changed' : 'Cancelled'}
        </AppText>
      )}

      <ConfirmSheet
        visible={confirming}
        title="Review change"
        subject={action.subject}
        facts={action.facts.map((f, i) => ({ ...f, emphasis: i === 0 }))}
        note={action.note}
        cta={action.cta}
        onConfirm={async () => {
          const receipt = await api.executeAction(headers, action.id, action.factsHash, `app-${action.id}`);
          onExecuted(receipt);
        }}
        onClose={() => setConfirming(false)}
      />
    </View>
  );
}

export function ReceiptBlock({ receipt }: { receipt: Receipt }) {
  return (
    <View style={[styles.toolCard, { borderColor: color.mintBorder }]}>
      <View style={styles.eyebrow}>
        <Ionicons name="checkmark-circle-outline" size={14} color={color.mint} />
        <AppText variant="label" tone={color.mint}>
          Done
        </AppText>
      </View>
      <AppText variant="cardTitle">{receipt.title}</AppText>
      <View style={styles.factList}>
        {receipt.rows.map((r) => (
          <View key={r.label} style={styles.factRow}>
            <AppText variant="secondary" tone={color.textTertiary}>
              {r.label}
            </AppText>
            <AppText variant="secondary" tabular>
              {r.value}
            </AppText>
          </View>
        ))}
      </View>
      <AppText variant="caption">{receipt.actor} · recorded in Activity</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.borderSoft,
    borderRadius: 16,
    borderBottomRightRadius: 5,
    paddingHorizontal: space.l,
    paddingVertical: 10,
  },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolCard: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.borderSoft,
    borderRadius: 18,
    padding: space.l,
    gap: space.m,
  },
  proposalCard: {
    backgroundColor: color.surface2,
    borderColor: color.borderStrong,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  factList: {
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: color.borderSoft,
    paddingTop: space.m,
  },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.m,
  },
  proposalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.l,
  },
});
