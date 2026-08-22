import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, StyleSheet, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

/**
 * The chat history drawer underlay (AI_CHAT_UI_UX_SPEC §6.2). A fixed panel
 * pinned to the left edge of the window; the whole shell slides over it. The
 * content is lazily mounted on first open, then stays mounted — it owns a
 * FlatList and three Modals, so reopening must never pay a remount cost.
 */
export function ChatHistoryDrawer({
  open,
  menuWidth,
  headerRowHeight,
  headerCenterY,
  colors,
  animatedStyle,
  onClose,
  children,
}: {
  open: boolean;
  menuWidth: number;
  headerRowHeight: number;
  headerCenterY: number;
  colors: {
    panelBg: string;
    surfaceShadow: string;
  };
  animatedStyle: AnimatedStyle<ViewStyle>;
  onClose: () => void;
  children: (props: {
    visible: boolean;
    headerRowHeight: number;
    headerCenterY: number;
    onClose: () => void;
  }) => ReactNode;
}) {
  const [hasOpened, setHasOpened] = useState(open);
  useEffect(() => {
    if (!open) return;
    // Deferred so the content mounts on the frame the drawer starts opening —
    // never synchronously inside the effect (compiler rule).
    const t = setTimeout(() => setHasOpened(true), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Hardware back closes the drawer while it is open.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.underlay,
        { width: menuWidth, backgroundColor: colors.panelBg, boxShadow: colors.surfaceShadow },
        animatedStyle,
      ]}>
      {hasOpened
        ? children({ visible: open, headerRowHeight, headerCenterY, onClose })
        : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  underlay: {
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
  },
});