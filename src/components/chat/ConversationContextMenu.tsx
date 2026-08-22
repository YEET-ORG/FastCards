import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { AiDrawer, ChatFonts } from '@/constants/ai-ui';
import { useColors } from '@/design/theme';
import { haptics } from '@/utils/haptics';

export interface MenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContextMenuThread {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
}

const MENU_WIDTH = AiDrawer.contextMenuWidth; // 244
const MENU_RADIUS = AiDrawer.contextMenuRadius; // 16
const ROW_HEIGHT = AiDrawer.contextMenuRowHeight; // 50
const PAD_H = AiDrawer.contextMenuPaddingH; // 16
const TEXT_SIZE = AiDrawer.contextMenuTextSize; // 16
const ICON_SIZE = AiDrawer.contextMenuIconSize; // 19
const ANCHOR_GAP = AiDrawer.contextMenuAnchorGap; // 10
const SCREEN_MARGIN = AiDrawer.contextMenuScreenMargin; // 12

const SPRING_ENTER = { damping: 22, stiffness: 400, mass: 0.55 } as const;

/**
 * Prefer below the row; flip above if it would overflow
 * `screenHeight - bottomInset - 12`; otherwise pin to the bottom margin.
 * Pure and exported for unit testing (spec §13.5).
 */
export function resolveMenuPlacement(
  anchor: MenuAnchor,
  panelHeight: number,
  screenHeight: number,
  bottomInset: number,
  screenWidthValue?: number,
): { top?: number; bottom?: number; left: number; width: number } {
  const width = screenWidthValue ?? Dimensions.get('window').width;
  const below = anchor.y + anchor.height + ANCHOR_GAP;
  const fitsBelow = below + panelHeight <= screenHeight - bottomInset - SCREEN_MARGIN;
  const fitsAbove = anchor.y - ANCHOR_GAP - panelHeight >= SCREEN_MARGIN;
  const left = Math.max(SCREEN_MARGIN, Math.min(anchor.x, width - MENU_WIDTH - SCREEN_MARGIN));
  const base = { left, width: MENU_WIDTH };
  if (fitsBelow) return { ...base, top: below };
  if (fitsAbove) return { ...base, top: anchor.y - ANCHOR_GAP - panelHeight };
  return { ...base, bottom: bottomInset + SCREEN_MARGIN };
}

export function ConversationContextMenu({
  visible,
  anchor,
  thread,
  onPin,
  onRename,
  onArchive,
  onDelete,
  onClose,
  onOpenChange,
}: {
  visible: boolean;
  anchor: MenuAnchor | null;
  thread: ContextMenuThread | null;
  onPin: () => void;
  onRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const colors = useColors();
  const progress = useSharedValue(0);
  const [placed, setPlaced] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const placedRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    haptics.select();
    placedRef.current = false;
    progress.set(0);
    // Closing sets progress to 0 instantly; opening springs it in on the next
    // frame, once the modal has committed. State resets ride the same frame.
    const frame = requestAnimationFrame(() => {
      setPlaced(null);
      progress.set(withSpring(1, SPRING_ENTER));
    });
    onOpenChange(true);
    return () => {
      cancelAnimationFrame(frame);
      onOpenChange(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const height = e.nativeEvent.layout.height;
    if (placedRef.current || !anchor || height <= 0) return;
    placedRef.current = true;
    const { height: screenHeight } = Dimensions.get('window');
    setPlaced(resolveMenuPlacement(anchor, height, screenHeight, 0));
  };

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.get() * 0.46,
  }));
  const cardStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: p,
      transform: [{ scale: 0.94 + p * 0.06 }, { translateY: (1 - p) * -8 }],
    };
  });

  if (!thread) return null;

  const rows: {
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    destructive?: boolean;
    onPress: () => void;
  }[] = [
    {
      key: 'pin',
      label: thread.pinned ? 'Unpin' : 'Pin',
      icon: thread.pinned ? 'bookmark' : 'bookmark-outline',
      onPress: onPin,
    },
    { key: 'rename', label: 'Rename', icon: 'pencil-outline', onPress: onRename },
    {
      key: 'archive',
      label: thread.archived ? 'Unarchive' : 'Archive',
      icon: thread.archived ? 'arrow-undo-outline' : 'archive-outline',
      onPress: onArchive,
    },
    { key: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true, onPress: onDelete },
  ];

  const dismiss = () => {
    progress.set(0);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss}>
      {/* Gesture handlers are dead inside an RN Modal without their own root. */}
      <GestureHandlerRootView style={styles.modalRoot}>
        <Pressable style={styles.scrimTouch} onPress={dismiss} accessibilityLabel="Dismiss menu">
          <Animated.View style={[styles.scrim, { backgroundColor: '#0A0A0C' }, scrimStyle]} />
        </Pressable>
        <Animated.View
          onLayout={handleLayout}
          style={[
            styles.card,
            { backgroundColor: colors.surfaceCard, borderColor: colors.borderSubtle },
            // Render off-screen until measured so the entrance spring never
            // flashes at a stale position.
            placed ?? { left: -500, top: 0, width: MENU_WIDTH },
            cardStyle,
          ]}>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              onPress={() => {
                dismiss();
                row.onPress();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.inset }]}>
              <Text
                style={[
                  styles.rowText,
                  { color: row.destructive ? colors.accentNegative : colors.textPrimary },
                ]}>
                {row.label}
              </Text>
              <Ionicons
                name={row.icon}
                size={ICON_SIZE}
                color={row.destructive ? colors.accentNegative : colors.textSecondary}
              />
            </Pressable>
          ))}
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
  } as ViewStyle,
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  } as ViewStyle,
  card: {
    position: 'absolute',
    borderRadius: MENU_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: ROW_HEIGHT,
    paddingHorizontal: PAD_H,
  },
  rowText: { fontSize: TEXT_SIZE, fontFamily: ChatFonts.medium },
});