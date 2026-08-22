import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAskDock } from '@/components/ask/AskDockContext';
import { Avatar } from '@/components/fin/primitives';
import { HeaderIconButton } from '@/components/fin/Screen';
import { ChatHistoryDrawer } from '@/components/chat/ChatHistoryDrawer';
import { ConversationDrawerContent, getDrawerColors } from '@/components/chat/ConversationDrawerContent';
import { HomeDrawerContent } from '@/components/home/HomeDrawerContent';
import { ChatSurface } from '@/components/chat/ChatSurface';
import { AiChatDrawer, ChatFonts, IconSize } from '@/constants/ai-ui';
import { useColors } from '@/design/theme';
import { pendingApprovals, useDomain } from '@/domain/store';
import { useChatStore } from '@/store/chatStore';
import { useChatDrawer, type ChatDrawerMode } from '@/features/home/useChatDrawer';

/**
 * The chat-first shell (AI_CHAT_UI_UX_SPEC §3, §5). The home screen hosts a
 * fixed history-drawer underlay; the entire app surface — header, chat, wallet
 * — is one Animated.View that slides right over it. One Pan drives both the
 * drawer and the chat↔wallet mode switch (see useChatDrawer).
 */

const HEADER_PADDING_TOP = 12;

/** Height of the shell header row below the status bar inset (button +
 * padding). Top-anchored overlays (AI notification pill) clear the header by
 * offsetting from this. */
export const HOME_HEADER_HEIGHT = HEADER_PADDING_TOP + 48 + 14;
const NARROW_HEADER_BREAKPOINT = 360;

const MODE_SPRING = { damping: 24, mass: 0.9, stiffness: 210 };

const DRAWER_EDGE = AiChatDrawer.surfaceEdge;

export function ChatFirstShell({
  walletLayer,
  queuedPrompt,
  onQueuedPromptConsumed,
  contextMemberId,
  onModeChange,
  headerAvatar,
}: {
  walletLayer: ReactNode;
  queuedPrompt?: string | null;
  onQueuedPromptConsumed?: () => void;
  contextMemberId?: string;
  onModeChange?: (mode: ChatDrawerMode) => void;
  /** The member avatar shown in the wallet-mode header slot (replaces the
      generic account glyph). The chat-mode slot keeps its history button. */
  headerAvatar?: { name: string; backgroundColor: string; textColor: string } | null;
}) {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const dock = useAskDock();
  const { width } = useWindowDimensions();
  const { state } = useDomain();

  const [mode, setMode] = useState<ChatDrawerMode>('chat');
  /** One drawer, two openers: the chat history opens from the chat bubble (or
      the chat-mode swipe — see Branch 2 in useChatDrawer), the account menu
      opens ONLY from the header avatar tap. The home kind can never be opened
      by a gesture: Branch 2 is gated on chat mode, and only a chat-mode swipe
      can reach it. */
  const [drawer, setDrawer] = useState<'chat' | 'home' | null>(null);
  const drawerOpen = drawer !== null;
  const [chatHeaderActions, setChatHeaderActions] = useState<{
    openConversationHistory: () => void;
    newConversation: () => void;
  } | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [conversationMenuOpen, setConversationMenuOpen] = useState(false);
  const [headerIconCenterY, setHeaderIconCenterY] = useState<number | null>(null);

  const menuWidth = Math.min(Math.round(width * AiChatDrawer.widthRatio), AiChatDrawer.maxWidth);
  const compactHeader = width < NARROW_HEADER_BREAKPOINT;
  const headerIconSize = compactHeader ? 22 : IconSize.lg;
  const headerButtonSize = compactHeader ? 44 : 48;
  const headerHorizontalPadding = compactHeader ? 10 : 18;
  const switcherGap = compactHeader ? 12 : 24;
  const modeButtonMinWidth = compactHeader ? 58 : 68;

  const drawerColors = useMemo(() => {
    const d = getDrawerColors(colors);
    const dark = colors.screenBackground === '#000000';
    const edge = dark ? DRAWER_EDGE.dark : DRAWER_EDGE.light;
    return { ...d, surfaceShadow: edge.shadow, surfaceEdgeColor: edge.color, surfaceEdgeWidth: edge.width };
  }, [colors]);

  // Mode mirror for stable callbacks (§7.7): the shell keeps selectMode
  // dependency-free and reads the current mode from a ref instead of the
  // render closure.
  const modeRef = useRef<ChatDrawerMode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const selectMode = useCallback((nextMode: ChatDrawerMode) => {
    const currentMode = modeRef.current;
    if (nextMode === currentMode) return;
    if (currentMode === 'chat' && nextMode === 'wallet') Keyboard.dismiss();
    if (nextMode !== 'chat') setDrawer(null);
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);

  // Report mode changes (host mirrors them, e.g. the dock stand-down). Fires
  // on mount too, so hosts start mirrored.
  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  // ── Drawer open/close + settings hand-off (§13.7) ────────────────────────
  const pendingDrawerActionRef = useRef<(() => void) | null>(null);

  const openChatDrawer = useCallback(() => {
    // A settings hand-off is only valid for the close it was queued with.
    pendingDrawerActionRef.current = null;
    Keyboard.dismiss();
    setActionMenuOpen(false);
    dock.closeComposer();
    setDrawer('chat');
  }, [dock]);

  const closeChatDrawer = useCallback(() => {
    Keyboard.dismiss();
    setDrawer(null);
  }, []);

  /** The avatar is the home drawer's ONLY opener — never a gesture. Tapping
      it again while open closes the drawer. */
  const toggleHomeDrawer = useCallback(() => {
    Keyboard.dismiss();
    dock.closeComposer();
    setDrawer((d) => (d === 'home' ? null : 'home'));
  }, [dock]);

  const handleDrawerSettings = useCallback(() => {
    pendingDrawerActionRef.current = () => router.push('/profile');
    closeChatDrawer();
  }, [closeChatDrawer, router]);

  const handleDrawerSettled = useCallback(() => {
    const pending = pendingDrawerActionRef.current;
    pendingDrawerActionRef.current = null;
    pending?.();
  }, []);

  // ── The one gesture (§7) ─────────────────────────────────────────────────
  const { swipeGesture, surfaceAnimatedStyle, surfaceEdgeAnimatedStyle, menuContentAnimatedStyle } = useChatDrawer({
    mode,
    open: drawerOpen,
    menuWidth,
    actionMenuOpen: actionMenuOpen || conversationMenuOpen,
    surfaceX: dock.surfaceX,
    onClose: closeChatDrawer,
    onOpenDrawer: openChatDrawer,
    onSwitchMode: selectMode,
    onSettled: handleDrawerSettled,
  });

  // Mode cross-fade (§5.1).
  const modeProgress = useSharedValue(0);
  useEffect(() => {
    modeProgress.set(withSpring(mode === 'wallet' ? 1 : 0, MODE_SPRING));
    return () => cancelAnimation(modeProgress);
  }, [mode, modeProgress]);

  const chatAnimatedStyle = useAnimatedStyle(() => {
    const progress = modeProgress.get();
    return {
      opacity: interpolate(progress, [0, 1], [1, 0]),
      transform: [{ translateX: interpolate(progress, [0, 1], [0, -18]) }],
    };
  });

  const walletAnimatedStyle = useAnimatedStyle(() => {
    const progress = modeProgress.get();
    return {
      opacity: interpolate(progress, [0, 1], [0, 1]),
      transform: [{ translateX: interpolate(progress, [0, 1], [18, 0]) }],
    };
  });

  // Measured header hand-off (§5.3) — the arithmetic version was 13dp wrong
  // on Android; the drawer wordmark aligns to the measured icon centre.
  const handleLeftHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    const center = y + height / 2;
    setHeaderIconCenterY((previous) => (previous === center ? previous : center));
  }, []);

  const drawerHeaderCenterY = headerIconCenterY ?? insets.top + HEADER_PADDING_TOP + headerButtonSize / 2;

  const pending = pendingApprovals(state);

  const leftHeaderIcon: keyof typeof Ionicons.glyphMap = mode === 'chat' ? 'chatbubble-ellipses' : 'person';
  const leftHeaderLabel = mode === 'chat' ? 'Open chat history' : 'Profile';
  const leftHeaderDisabled = mode === 'chat' && !chatHeaderActions;

  const handleLeftHeaderPress = () => {
    if (mode === 'chat') {
      if (chatHeaderActions) chatHeaderActions.openConversationHistory();
    } else {
      toggleHomeDrawer();
    }
  };

  const headerStyle = {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'space-between',
    paddingBottom: 14,
    // Clear the status bar — the scene is edge-to-edge, and the wallet layer's
    // scroll pads itself by the same inset, so both rows line up.
    paddingTop: insets.top + HEADER_PADDING_TOP,
    paddingHorizontal: headerHorizontalPadding,
    backgroundColor: colors.screenBackground,
    zIndex: 5,
  } as const;

  return (
    <View style={[styles.drawerRoot, { backgroundColor: drawerColors.panelBg }]}>
      <ChatHistoryDrawer
        open={drawerOpen}
        menuWidth={menuWidth}
        headerRowHeight={headerButtonSize}
        headerCenterY={drawerHeaderCenterY}
        colors={{ panelBg: drawerColors.panelBg, surfaceShadow: drawerColors.surfaceShadow }}
        animatedStyle={menuContentAnimatedStyle}
        onClose={closeChatDrawer}>
        {({ visible, headerRowHeight, headerCenterY, onClose }) =>
          drawer === 'chat' ? (
            <ConversationDrawerContent
              visible={visible}
              headerRowHeight={headerRowHeight}
              headerCenterY={headerCenterY}
              onClose={onClose}
              onSelectConversation={(id) => {
                useChatStore.getState().selectConversation(id);
                onClose();
              }}
              onNewConversation={() => {
                if (chatHeaderActions) chatHeaderActions.newConversation();
                onClose();
              }}
              onOpenSettings={handleDrawerSettings}
              onMenuOpenChange={setConversationMenuOpen}
            />
          ) : drawer === 'home' ? (
            <HomeDrawerContent
              headerRowHeight={headerRowHeight}
              headerCenterY={headerCenterY}
              onClose={onClose}
            />
          ) : null
        }
      </ChatHistoryDrawer>

      <GestureDetector gesture={swipeGesture}>
        <Animated.View
          accessibilityElementsHidden={drawerOpen}
          importantForAccessibility={drawerOpen ? 'no-hide-descendants' : 'auto'}
          style={[
            styles.slidingSurface,
            { backgroundColor: colors.screenBackground },
            drawerOpen ? { boxShadow: drawerColors.surfaceShadow } : null,
            surfaceAnimatedStyle,
          ]}>
          {/* Header row */}
          <View style={headerStyle}>
            <Pressable
              accessibilityLabel={leftHeaderLabel}
              accessibilityRole="button"
              disabled={leftHeaderDisabled}
              hitSlop={8}
              onLayout={handleLeftHeaderLayout}
              onPress={handleLeftHeaderPress}
              style={({ pressed }) => [
                styles.iconButton,
                { height: headerButtonSize, width: headerButtonSize },
                { opacity: leftHeaderDisabled ? 0.45 : pressed ? 0.65 : 1 },
              ]}>
              {mode === 'wallet' && headerAvatar ? (
                <Avatar
                  name={headerAvatar.name}
                  size={36}
                  backgroundColor={headerAvatar.backgroundColor}
                  textColor={headerAvatar.textColor}
                />
              ) : (
                <Ionicons name={leftHeaderIcon} color={colors.iconPrimary} size={headerIconSize} />
              )}
            </Pressable>

            {/* Mode switcher (§5.2) */}
            <View style={[styles.switcher, { gap: switcherGap }]}>
              {(['chat', 'wallet'] as const).map((m) => {
                const active = mode === m;
                const label = m === 'chat' ? 'Ask' : 'Home';
                return (
                  <Pressable
                    key={m}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => selectMode(m)}
                    style={({ pressed }) => [
                      styles.modeButton,
                      { minWidth: modeButtonMinWidth },
                      pressed && { opacity: 0.72 },
                    ]}>
                    <Text
                      style={[
                        styles.modeButtonText,
                        { color: active ? colors.textPrimary : colors.textSecondary },
                      ]}>
                      {label}
                    </Text>
                    <View
                      style={[
                        styles.modeIndicator,
                        { backgroundColor: colors.textSecondary, opacity: active ? 1 : 0 },
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>

            {/* Right: approvals bell (domain action) */}
            <View style={styles.rightSlot}>
              <HeaderIconButton
                bare
                icon="notifications"
                size={headerButtonSize}
                label={
                  pending.length > 0
                    ? `Review ${pending.length} pending approval${pending.length > 1 ? 's' : ''}`
                    : 'Approvals'
                }
                onPress={() => router.push('/approvals')}
              />
              {pending.length > 0 ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.badge,
                    {
                      backgroundColor: colors.accent,
                      borderColor: colors.screenBackground,
                      // Anchors the dot to the icon's top-right corner: the
                      // icon is 20pt centered in the `headerButtonSize` box.
                      top: headerButtonSize / 2 - 15,
                      right: headerButtonSize / 2 - 15,
                    },
                  ]}
                />
              ) : null}
            </View>
          </View>

          {/* Layers */}
          <View style={styles.surfaceFrame}>
            <Animated.View
              pointerEvents={mode === 'chat' ? 'auto' : 'none'}
              style={[styles.surfaceLayer, chatAnimatedStyle, { zIndex: mode === 'chat' ? 2 : 1 }]}>
              <ChatSurface
                visible={mode === 'chat'}
                onOpenConversationHistory={openChatDrawer}
                onRegisterHeaderActions={setChatHeaderActions}
                onActionMenuOpenChange={setActionMenuOpen}
                queuedPrompt={queuedPrompt}
                onQueuedPromptConsumed={onQueuedPromptConsumed}
                contextMemberId={contextMemberId}
              />
            </Animated.View>

            <Animated.View
              pointerEvents={mode === 'wallet' ? 'auto' : 'none'}
              style={[styles.surfaceLayer, walletAnimatedStyle, { zIndex: mode === 'wallet' ? 2 : 1 }]}>
              {walletLayer}
            </Animated.View>
          </View>

          {/* Invisible tap-to-close scrim — mounted only while open (§5.5). */}
          {drawerOpen ? (
            <Pressable
              accessibilityLabel="Close drawer"
              accessibilityRole="button"
              onPress={closeChatDrawer}
              style={styles.closeDrawerTap}
            />
          ) : null}

          {/* Surface edge — an absolute overlay, not a border on the surface. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.surfaceEdge,
              {
                borderWidth: drawerColors.surfaceEdgeWidth,
                borderColor: drawerColors.surfaceEdgeColor,
              },
              surfaceEdgeAnimatedStyle,
            ]}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  drawerRoot: { flex: 1 },
  slidingSurface: {
    borderCurve: 'continuous',
    flex: 1,
    overflow: 'hidden',
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 24,
    flexShrink: 0,
    justifyContent: 'center',
  },
  switcher: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    maxWidth: 196,
  },
  modeButton: {
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  modeButtonText: {
    fontFamily: ChatFonts.semiBold,
    fontSize: 16,
    letterSpacing: 0.2,
    lineHeight: 20,
  },
  modeIndicator: {
    alignSelf: 'center',
    borderRadius: 2,
    height: 3,
    marginTop: 2,
    width: 22,
  },
  rightSlot: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  surfaceFrame: { flex: 1, overflow: 'hidden' },
  surfaceLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  closeDrawerTap: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  surfaceEdge: {
    borderCurve: 'continuous',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    position: 'absolute',
    zIndex: 40,
  },
});