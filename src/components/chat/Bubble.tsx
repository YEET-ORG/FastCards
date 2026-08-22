import { memo, useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { aiMessageEnter, AiSpacing, ChatFonts } from '@/constants/ai-ui';
import { ChatToolCard } from '@/components/chat/ChatToolCard';
import { MarkdownText } from '@/components/chat/MarkdownText';
import { AiPulsePlaceholder, AiStreamingCursor } from '@/components/intent/AiPulsePlaceholder';
import { TypingIndicator } from '@/components/intent/TypingIndicator';
import { useColors } from '@/design/theme';
import type { StoredMessage } from '@/store/chatStore';

// Read once at module scope: the entrance config is only consumed at mount.
const BUBBLE_ENTER = aiMessageEnter();

/**
 * One message (AI_CHAT_UI_UX_SPEC §9). Column order is fixed:
 * reasoning → cards → text. The memo comparator deliberately ignores theme and
 * callbacks so a 20 Hz streaming flush re-renders exactly one bubble.
 */

function BubbleInner({
  msg,
  generating,
  onLongPress,
  onConfirmLifecycle,
}: {
  msg: StoredMessage;
  generating: boolean;
  onLongPress: (msgId: string, anchor: { x: number; y: number; width: number; height: number }) => void;
  onConfirmLifecycle: (msgId: string, status: 'pending' | 'processing' | 'confirmed' | 'failed' | 'cancelled', receipt?: import('@/api/client').Receipt) => void;
}) {
  const colors = useColors();
  const wrapRef = useRef<View>(null);
  const isUser = msg.role === 'user';

  // Stable per message: ChatToolCard's memo needs a stable callback to hold.
  const handleLifecycleChange = useCallback(
    (status: 'pending' | 'processing' | 'confirmed' | 'failed' | 'cancelled', receipt?: import('@/api/client').Receipt) =>
      onConfirmLifecycle(msg.id, status, receipt),
    [msg.id, onConfirmLifecycle],
  );

  const handleLongPress = () => {
    // Suppressed while generating.
    if (generating) return;
    wrapRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress(msg.id, { x, y, width, height });
    });
  };

  const showStreamingPlaceholder = !isUser && !!msg.streaming && msg.content.trim().length === 0;

  const isShort =
    isUser && (msg.content || '').trim().length < 40 && !(msg.content || '').includes('\n');

  return (
    <Animated.View entering={BUBBLE_ENTER}>
      <Pressable onLongPress={handleLongPress} delayLongPress={400} style={styles.pressable}>
        <View ref={wrapRef} style={[styles.bubbleWrap, isUser ? styles.bubbleWrapUser : styles.bubbleWrapAssistant]}>
          <View style={isUser ? styles.bubbleCol : styles.assistantCol}>
            {msg.reasoning ? (
              <View style={[styles.thinkBlock, { backgroundColor: colors.surfaceStrong, borderColor: colors.borderSubtle }]}>
                <View style={styles.thinkHeader}>
                  <Text style={[styles.thinkLabel, { color: colors.textMuted }]}>Reasoning</Text>
                </View>
                <Text style={[styles.thinkText, { color: colors.textSecondary }]} numberOfLines={3}>
                  {msg.reasoning}
                </Text>
              </View>
            ) : null}

            {msg.cards?.map((card, i) => (
              <ChatToolCard
                key={i}
                card={card}
                onLifecycleChange={handleLifecycleChange}
              />
            ))}

            {isUser ? (
              <View
                style={[
                  styles.bubble,
                  {
                    backgroundColor: colors.textPrimary,
                    borderRadius: isShort ? 24 : 16,
                  },
                ]}>
                <MarkdownText
                  text={msg.content || '(empty)'}
                  theme={colors}
                  invertedSurface
                  style={[styles.bubbleText, { color: colors.textInverse }]}
                />
              </View>
            ) : showStreamingPlaceholder ? (
              <TypingIndicator color={colors.textSecondary} />
            ) : (
              <MarkdownText
                text={msg.content || '(empty)'}
                theme={colors}
                style={[styles.assistantText, { color: colors.textPrimary }]}
                suffix={
                  msg.streaming ? <AiStreamingCursor color={colors.textSecondary} /> : undefined
                }
              />
            )}

            {!isUser && msg.degraded ? (
              <Text style={[styles.degraded, { color: colors.warningInk }]}>
                AI is temporarily limited — answered with basic commands.
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const comparator = (prev: Props, next: Props) =>
  prev.msg.content === next.msg.content &&
  prev.msg.reasoning === next.msg.reasoning &&
  prev.msg.streaming === next.msg.streaming &&
  prev.msg.cards === next.msg.cards &&
  prev.msg.degraded === next.msg.degraded &&
  prev.generating === next.generating;

type Props = React.ComponentProps<typeof BubbleInner>;

export const Bubble = memo(BubbleInner, comparator);

/** Placeholder used by the three-state ladder (exported for reuse). */
export { AiPulsePlaceholder };

const styles = StyleSheet.create({
  pressable: { borderRadius: 16 },
  bubbleWrap: { flexDirection: 'row', marginVertical: 2 },
  bubbleWrapUser: { justifyContent: 'flex-end' },
  bubbleWrapAssistant: { justifyContent: 'flex-start' },
  bubbleCol: { maxWidth: '80%', gap: 8 },
  assistantCol: { maxWidth: '100%', gap: 10 },
  bubble: { paddingHorizontal: 16, paddingVertical: 12 },
  bubbleText: { fontSize: 15, lineHeight: 22, fontFamily: ChatFonts.regular },
  assistantText: { fontSize: 15, lineHeight: 24, fontFamily: ChatFonts.regular, paddingVertical: 2 },
  thinkBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 12,
  },
  thinkHeader: { flexDirection: 'row', alignItems: 'center' },
  thinkLabel: { fontSize: 11, fontFamily: ChatFonts.medium },
  thinkText: { fontSize: 12, lineHeight: 16, marginTop: 6, fontFamily: ChatFonts.regular },
  degraded: { fontSize: 12, lineHeight: 16, fontFamily: ChatFonts.regular },
});

export const bubbleListPaddingH = AiSpacing.conversationPaddingH;