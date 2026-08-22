import { useWindowDimensions } from 'react-native';

/**
 * Card width system (AI_CHAT_UI_UX_SPEC §12.3). On phones all hints resolve
 * to roughly the same width; on tablets and foldables they diverge.
 */
export type CardWidthHint = 'compact' | 'comfortable' | 'wide';

export const CARD_WIDTH_MIN = 280;
export const CARD_WIDTH_MAX: Record<CardWidthHint, number> = {
  compact: 340,
  comfortable: 420,
  wide: 560,
};

/** 2 × the chat list horizontal padding (20pt each side) so cards sit flush
 *  with the assistant text column. */
const CARD_WIDTH_DEDUCTION = 40;

export function useCardWidth(hint: CardWidthHint = 'comfortable'): number {
  const { width: screenWidth } = useWindowDimensions();
  return Math.min(CARD_WIDTH_MAX[hint], Math.max(CARD_WIDTH_MIN, screenWidth - CARD_WIDTH_DEDUCTION));
}