import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, Share, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { ChatFonts } from '@/constants/ai-ui';
import { useColors } from '@/design/theme';
import { haptics } from '@/utils/haptics';

/**
 * Message long-press context menu (AI_CHAT_UI_UX_SPEC §9.6). A non-interactive
 * replica of the held bubble is drawn at the anchor rect, with a floating
 * action panel. Modal requirements: animationType="none" (a fade would animate
 * ancestor opacity, breaking blurred backdrops on iOS) and its own
 * GestureHandlerRootView (gesture handlers are dead inside an RN Modal).
 */

export interface MessageMenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MENU_WIDTH_CAP = 320;
const GAP = 12;
const EDGE_MARGIN = 16;
const SPRING_ENTER = { damping: 22, stiffness: 400, mass: 0.55 } as const;

function formatMenuTimestamp(createdAt: number): string {
  const date = new Date(createdAt);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMessageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfMessageDay) / 86_400_000);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

export type MessageMenuAction =
  | { key: 'copy' }
  | { key: 'edit' }
  | { key: 'select-text' }
  | { key: 'share' }
  | { key: 'regenerate' };

export function MessageContextMenu({
  visible,
  anchor,
  isUser,
  canEdit,
  canRegenerate,
  content,
  createdAt,
  onAction,
  onClose,
}: {
  visible: boolean;
  anchor: MessageMenuAnchor | null;
  isUser: boolean;
  canEdit: boolean;
  canRegenerate: boolean;
  content: string;
  createdAt: number;
  onAction: (action: MessageMenuAction) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const progress = useSharedValue(0);
  const [placed, setPlaced] = useState<{ top: number; left: number; width: number } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const placedRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    haptics.select();
    placedRef.current = false;
    progress.set(0);
    const frame = requestAnimationFrame(() => {
      setPlaced(null);
      setSelectMode(false);
      progress.set(withSpring(1, SPRING_ENTER));
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const height = e.nativeEvent.layout.height;
    if (placedRef.current || !anchor || height <= 0) return;
    placedRef.current = true;
    const { width: winWidth } = Dimensions.get('window');
    const menuWidth = Math.min(MENU_WIDTH_CAP, winWidth - 64);
    const showAbove = anchor.y - GAP - height >= 8;
    const top = showAbove ? anchor.y - GAP - height : anchor.y + anchor.height + GAP;
    const alignToTrailingEdge = isUser;
    const rawLeft = alignToTrailingEdge ? anchor.x + anchor.width - menuWidth : anchor.x;
    const left = Math.max(EDGE_MARGIN, Math.min(rawLeft, winWidth - menuWidth - EDGE_MARGIN));
    setPlaced({ top, left, width: menuWidth });
  };

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() * 0.46 }));
  const cardStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: p,
      transform: [{ scale: 0.94 + p * 0.06 }, { translateY: (1 - p) * -8 }],
    };
  });

  const dismiss = () => {
    progress.set(0);
    onClose();
  };

  const actions: { key: MessageMenuAction['key']; label: string; icon: keyof typeof Ionicons.glyphMap; shown: boolean }[] = [
    { key: 'copy', label: 'Copy', icon: 'copy-outline', shown: true },
    { key: 'edit', label: 'Edit', icon: 'pencil-outline', shown: isUser && canEdit },
    { key: 'select-text', label: 'Select text', icon: 'text-outline', shown: true },
    { key: 'share', label: isUser ? 'Share prompt' : 'Share', icon: 'share-outline', shown: true },
    { key: 'regenerate', label: 'Regenerate', icon: 'refresh-outline', shown: !isUser && canRegenerate },
  ];

  const runAction = (action: MessageMenuAction) => {
    dismiss();
    if (action.key === 'copy') {
      haptics.tap();
      void Clipboard.setStringAsync(content);
    } else if (action.key === 'share') {
      void Share.share({ message: content });
    } else if (action.key === 'select-text') {
      setSelectMode(true);
      // Re-measure as the panel swaps to the text view.
      placedRef.current = false;
      setPlaced(null);
      requestAnimationFrame(() => progress.set(withSpring(1, SPRING_ENTER)));
      return;
    }
    onAction(action);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss}>
      <GestureHandlerRootView style={styles.modalRoot}>
        <Pressable style={styles.scrimTouch} onPress={dismiss} accessibilityLabel="Dismiss menu">
          <Animated.View style={[styles.scrim, { backgroundColor: '#0A0A0C' }, scrimStyle]} />
        </Pressable>

        {/* Non-interactive replica of the held bubble at the anchor rect. */}
        {anchor ? (
          <View
            pointerEvents="none"
            style={[
              styles.bubbleReplica,
              {
                left: anchor.x,
                top: anchor.y,
                width: anchor.width,
                height: anchor.height,
                backgroundColor: isUser ? colors.textPrimary : 'transparent',
                borderRadius: isUser ? 16 : 0,
              },
            ]}
          />
        ) : null}

        <Animated.View
          onLayout={handleLayout}
          style={[
            styles.card,
            { backgroundColor: colors.surfaceCard, borderColor: colors.borderSubtle },
            placed ?? { left: -500, top: 0, width: MENU_WIDTH_CAP },
            cardStyle,
          ]}>
          {selectMode ? (
            <Text style={[styles.ctxSelectText, { color: colors.textPrimary }]} selectable>
              {content}
            </Text>
          ) : (
            <>
              <Text style={[styles.ctxHeader, { color: colors.textSecondary }]}>
                {formatMenuTimestamp(createdAt)}
              </Text>
              {actions
                .filter((a) => a.shown)
                .map((a) => (
                  <Pressable
                    key={a.key}
                    onPress={() => runAction({ key: a.key })}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.ctxItem, pressed && { backgroundColor: colors.inset }]}>
                    <Text style={[styles.ctxItemText, { color: colors.textPrimary }]}>{a.label}</Text>
                    <Ionicons name={a.icon} size={18} color={colors.textSecondary} />
                  </Pressable>
                ))}
            </>
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  scrimTouch: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  bubbleReplica: { position: 'absolute', opacity: 0.9 },
  card: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  ctxHeader: {
    fontSize: 12,
    fontFamily: ChatFonts.regular,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 6,
  },
  ctxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  ctxItemText: { fontSize: 15, fontFamily: ChatFonts.medium },
  ctxSelectText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: ChatFonts.regular,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 4,
  },
});