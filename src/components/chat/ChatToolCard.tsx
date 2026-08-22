import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { type Receipt } from '@/api/client';
import { useCardWidth } from '@/components/chat/cards/useCardWidth';
import { CardEmpty, CardShell, CardSkeleton } from '@/components/chat/cards/CardShell';
import { ProposalCard, ReceiptCard, type ConfirmCardStatus } from '@/components/chat/cards/domainCards';
import { useColors } from '@/design/theme';
import type { StoredCard } from '@/store/chatStore';

/**
 * Card registry (AI_CHAT_UI_UX_SPEC §12.2). Lifecycle short-circuits run
 * BEFORE the type switch; then the type dispatch. The concrete bodies are
 * FastCards-domain-specific; the registry shape, width system, lifecycle
 * states, entrance and action dispatch are the ported contract.
 */

export type CardAction = { type: 'copy'; value: string } | { type: 'open_url'; url: string };
export type CardActionHandler = (action: CardAction) => void;

const CARD_WIDTH_HINT = { confirm_preview: 'compact', receipt: 'compact' } as const;

export function ChatToolCard({
  card,
  onLifecycleChange,
}: {
  card: StoredCard;
  onLifecycleChange?: (status: ConfirmCardStatus, receipt?: Receipt) => void;
}) {
  const colors = useColors();
  const lifecycle = card.lifecycle ?? 'ready';
  const cardWidth = useCardWidth(CARD_WIDTH_HINT[card.type] ?? 'comfortable');

  if (lifecycle === 'loading') {
    return (
      <CardShell lifecycle="loading" cardWidth={cardWidth}>
        <CardSkeleton rows={4} />
      </CardShell>
    );
  }
  if (lifecycle === 'error') {
    return (
      <CardShell lifecycle="error" cardWidth={cardWidth}>
        <CardEmpty
          icon={<Ionicons name="alert-circle-outline" size={22} color={colors.errorInk} />}
          title="Couldn't load result"
          message="Something went wrong while fetching this result."
        />
      </CardShell>
    );
  }
  if (lifecycle === 'empty') {
    return (
      <CardShell lifecycle="empty" cardWidth={cardWidth}>
        <CardEmpty title="No data" message="Nothing to show for this request." />
      </CardShell>
    );
  }

  const wrapped = (content: React.ReactNode) => (
    <View style={{ width: cardWidth, maxWidth: '100%', alignSelf: 'flex-start' }}>{content}</View>
  );

  switch (card.type) {
    case 'confirm_preview':
      return wrapped(
        <CardShell lifecycle={lifecycle} cardWidth={cardWidth}>
          <ProposalCard
            card={card}
            onLifecycleChange={(status, receipt) => onLifecycleChange?.(status, receipt)}
          />
        </CardShell>,
      );
    case 'receipt':
      return wrapped(
        <CardShell lifecycle={lifecycle} cardWidth={cardWidth}>
          <ReceiptCard card={card} />
        </CardShell>,
      );
    default:
      return wrapped(
        <CardShell lifecycle={lifecycle} cardWidth={cardWidth}>
          <CardEmpty title="Unsupported card" />
        </CardShell>,
      );
  }
}