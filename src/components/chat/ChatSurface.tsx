import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { api, ApiError, type Receipt, type ServerPreparedAction } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Bubble } from '@/components/chat/Bubble';
import { ChatLandingHero } from '@/components/chat/ChatLandingHero';
import { MessageContextMenu, type MessageMenuAction, type MessageMenuAnchor } from '@/components/chat/MessageContextMenu';
import { PlusMenu } from '@/components/ask/PlusMenu';
import {
  CommandBar,
  resolveCommandBarLift,
  useCommandBarMetrics,
  type CommandBarTrailing,
} from '@/components/ask/CommandBar';
import { AiSpacing, ChatFonts } from '@/constants/ai-ui';
import { ScrollToBottomPill } from '@/components/shared/ScrollToBottomPill';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';
import { useReduceMotion } from '@/design/motion';
import { useToast } from '@/components/fin/Toast';
import { useDomain } from '@/domain/store';
import { hapticSuccess, hapticTap } from '@/utils/haptics';
import {
  DEFAULT_CONVERSATION_TITLE,
  newMsgId,
  useChatStore,
  type StoredCard,
  type StoredMessage,
} from '@/store/chatStore';

/**
 * The chat surface (AI_CHAT_UI_UX_SPEC §9–§10, §14, §17): inverted FlatList
 * thread, bubbles, markdown, the three assistant states, the floating
 * composer with the two-channel keyboard handling, edit/regenerate, the
 * conversation switch + queued-prompt hand-off, and the confirm-card
 * lifecycle. Single-shot backend: `api.agentChat` returns the full reply, so
 * the spec's buffer/flush machinery reduces to one immediate flush.
 */

const STREAM_NEAR_BOTTOM_THRESHOLD = 300;
const MAINTAIN_VISIBLE_POSITION = {
  minIndexForVisible: 0,
  autoscrollToTopThreshold: STREAM_NEAR_BOTTOM_THRESHOLD,
} as const;

const SUGGESTIONS = [
  "What's my balance?",
  'Freeze a family member’s card',
  'Give a family member more this month',
];

/**
 * Single entry, so `AnimatedInput`'s rotation loop settles: the chat field is
 * permanently open above a thread the user is reading, and cycling prompts
 * there would be motion for its own sake. The dock, which is only open while
 * you are looking straight at it, still rotates its four.
 */
const CHAT_PLACEHOLDER = ['Ask anything'];

/**
 * Gaps between the top of the command bar's footprint and each overlay that
 * floats above it. Every one is measured from the bar rather than from the
 * window, so they all follow it up and down with the keyboard.
 */
const GAP_ABOVE_BAR = {
  thread: space.l,
  hero: 72,
  suggestions: space.xl,
  status: space.xs,
  scrollPill: space.s,
  plusMenu: space.xs,
} as const;

const HISTORY_TURNS = 16;

interface ChatHeaderActions {
  openConversationHistory: () => void;
  newConversation: () => void;
}

export function ChatSurface({
  visible,
  onOpenConversationHistory,
  onRegisterHeaderActions,
  onActionMenuOpenChange,
  queuedPrompt,
  onQueuedPromptConsumed,
  contextMemberId,
}: {
  visible: boolean;
  onOpenConversationHistory: () => void;
  onRegisterHeaderActions: (actions: ChatHeaderActions | null) => void;
  onActionMenuOpenChange: (open: boolean) => void;
  queuedPrompt?: string | null;
  onQueuedPromptConsumed?: () => void;
  contextMemberId?: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session, headers } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { state, refresh } = useDomain();

  const contextMember = contextMemberId ? state.members.find((m) => m.id === contextMemberId) : undefined;

  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const deleteMessagesFrom = useChatStore((s) => s.deleteMessagesFrom);
  const newConversation = useChatStore((s) => s.newConversation);

  const activeConv = conversations.find((c) => c.id === activeId);
  const messages = useMemo(() => activeConv?.messages ?? [], [activeConv]);

  const listRef = useRef<FlatList<StoredMessage>>(null);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [editingMsg, setEditingMsg] = useState<StoredMessage | null>(null);
  // Monotonic: each bump focuses the field. `autoFocus` cannot do this job —
  // the composer is mounted for the surface's whole life, so it never fires.
  const [editFocusSignal, setEditFocusSignal] = useState(0);
  const [ctxMsg, setCtxMsg] = useState<StoredMessage | null>(null);
  const [ctxAnchor, setCtxAnchor] = useState<MessageMenuAnchor | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  // Drives the composer's `+` → `✕` rotation while the actions menu is up.
  // The mark is drawn from two bars, so a 45° turn *is* the ✕ — one value,
  // sprung on the UI thread, owns the whole transition.
  const markMorph = useSharedValue(0);
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (reduceMotion) {
      markMorph.set(actionMenuOpen ? 1 : 0);
      return;
    }
    markMorph.set(withSpring(actionMenuOpen ? 1 : 0, { damping: 26, mass: 0.8, stiffness: 220, overshootClamping: true }));
  }, [actionMenuOpen, reduceMotion, markMorph]);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const [isNearBottom, setIsNearBottom] = useState(true);
  const isNearBottomRef = useRef(true);
  const scrollOffsetRef = useRef(0);
  const userScrollingRef = useRef(false);
  const scrollPending = useRef(false);

  const generatingRef = useRef(false);
  useEffect(() => {
    generatingRef.current = generating;
  }, [generating]);
  const abortedRef = useRef(false);
  const processedQueuedRef = useRef<string | null>(null);

  // Follow-intent (§14.2): follow changes only on user gestures.
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = e.nativeEvent.contentOffset.y;
    scrollOffsetRef.current = offset;
    if (!userScrollingRef.current) return;
    const nearBottom = offset <= STREAM_NEAR_BOTTOM_THRESHOLD;
    isNearBottomRef.current = nearBottom;
    setIsNearBottom(nearBottom);
  }, []);

  const handleScrollBeginDrag = useCallback(() => {
    userScrollingRef.current = true;
  }, []);

  const handleScrollEndDrag = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // A fling keeps firing onScroll after the drag ends — hold the flag until
    // momentum settles so the fling can still disengage/re-engage follow.
    const velocityY = e.nativeEvent.velocity?.y ?? 0;
    if (Math.abs(velocityY) < 0.1) userScrollingRef.current = false;
  }, []);

  const handleMomentumScrollEnd = useCallback(() => {
    // iOS fires onMomentumScrollEnd for programmatic animated scrolls too;
    // those carry stale metrics. Only genuine user flings (always preceded by
    // onScrollBeginDrag) may settle follow intent.
    if (!userScrollingRef.current) return;
    userScrollingRef.current = false;
    const nearBottom = scrollOffsetRef.current <= STREAM_NEAR_BOTTOM_THRESHOLD;
    isNearBottomRef.current = nearBottom;
    setIsNearBottom(nearBottom);
  }, []);

  // Three scroll helpers, three different jobs (§14.2).
  const scrollToBottom = useCallback(() => {
    isNearBottomRef.current = true;
    setIsNearBottom(true);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const forceScrollToBottom = useCallback(() => {
    isNearBottomRef.current = true;
    setIsNearBottom(true);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const scheduleScroll = useCallback(() => {
    if (!isNearBottomRef.current) return;
    if (scrollPending.current) return;
    scrollPending.current = true;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      scrollPending.current = false;
    });
  }, []);

  // Keyboard — Channel B (JS thread, thread inset): native events so the
  // list's padding reaches its final value immediately, before the UI-thread
  // bar animation finishes.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      setIsKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // When the keyboard opens, re-pin so the newest message stays visible.
  useEffect(() => {
    if (!isKeyboardVisible) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, [isKeyboardVisible]);

  // Abort generation on AppState background/inactive.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') abortedRef.current = true;
    });
    return () => sub.remove();
  }, []);

  // Abort on unmount / conversation switch.
  useEffect(() => {
    abortedRef.current = true;
    return () => {
      abortedRef.current = true;
    };
  }, [activeId]);

  // Re-pin on conversation switch.
  useEffect(() => {
    const frame = requestAnimationFrame(forceScrollToBottom);
    return () => cancelAnimationFrame(frame);
  }, [activeId, forceScrollToBottom]);

  // The landing chat always starts fresh (rehydrate resets activeId to null):
  // ensure an empty conversation exists to write into.
  useEffect(() => {
    if (!useChatStore.getState().activeId) newConversation();
  }, [newConversation]);

  const sendText = useCallback(
    async (text: string) => {
      if (!text || generatingRef.current || !activeId) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      const replyId = newMsgId();
      addMessage(activeId, { id: newMsgId(), role: 'user', content: trimmed, createdAt: Date.now() });
      addMessage(activeId, { id: replyId, role: 'assistant', content: '', streaming: true, createdAt: Date.now() });
      setGenerating(true);
      setStopping(false);
      abortedRef.current = false;
      setToolActivity(null);
      setFetching(true);
      forceScrollToBottom();

      const history = useChatStore
        .getState()
        .conversations.find((c) => c.id === activeId)
        ?.messages.filter((m) => m.role === 'user' || m.role === 'assistant')
        .filter((m) => !m.streaming)
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role, content: m.content })) ?? [];

      try {
        const res = await api.agentChat(headers, history, contextMemberId);
        if (abortedRef.current) return;
        const cards: StoredCard[] | undefined =
          res.prepared.length > 0
            ? res.prepared.map((action: ServerPreparedAction) => ({
                type: 'confirm_preview' as const,
                data: { action, status: 'pending' },
              }))
            : undefined;
        useChatStore.getState().updateMessage(activeId, replyId, {
          content: res.text.trim() || '(no reply)',
          streaming: false,
          degraded: res.degraded,
          cards,
        });
        hapticSuccess();
        scheduleScroll();
      } catch (e) {
        if (abortedRef.current) return;
        const message =
          e instanceof ApiError && e.code === 'rate_limited'
            ? 'The assistant is rate-limited — try again in a minute.'
            : "The assistant isn't reachable right now. Your money and manual controls still work.";
        useChatStore.getState().updateMessage(activeId, replyId, {
          content: message,
          streaming: false,
          degraded: true,
        });
      } finally {
        if (useChatStore.getState().activeId === activeId || abortedRef.current) {
          setGenerating(false);
          setStopping(false);
          setFetching(false);
          setToolActivity(null);
          abortedRef.current = false;
        }
      }
    },
    [activeId, headers, contextMemberId, addMessage, forceScrollToBottom, scheduleScroll],
  );

  const submitEdit = useCallback(
    async (newText: string) => {
      if (!editingMsg || !activeId) return;
      const id = editingMsg.id;
      const trimmed = newText.trim();
      if (!trimmed) return;
      updateMessage(activeId, id, { content: trimmed });
      const conv = useChatStore.getState().conversations.find((c) => c.id === activeId);
      const index = conv?.messages.findIndex((m) => m.id === id) ?? -1;
      const next = conv?.messages[index + 1];
      if (next) deleteMessagesFrom(activeId, next.id);
      setEditingMsg(null);
      await sendText(trimmed);
    },
    [activeId, editingMsg, updateMessage, deleteMessagesFrom, sendText],
  );

  const handleCommandSend = useCallback(
    (text: string) => {
      if (editingMsg) {
        void submitEdit(text);
        return;
      }
      sendText(text);
    },
    [editingMsg, submitEdit, sendText],
  );

  const handleRegenerate = useCallback(
    async (assistantMsgId: string) => {
      if (!activeId) return;
      const conv = useChatStore.getState().conversations.find((c) => c.id === activeId);
      const index = conv?.messages.findIndex((m) => m.id === assistantMsgId) ?? -1;
      const userMsg = conv?.messages[index - 1];
      if (!userMsg || userMsg.role !== 'user') return;
      deleteMessagesFrom(activeId, userMsg.id);
      await sendText(userMsg.content);
    },
    [activeId, deleteMessagesFrom, sendText],
  );

  const handleNewConversation = useCallback(() => {
    const conv = useChatStore.getState().conversations.find((c) => c.id === useChatStore.getState().activeId);
    // No-op when the active conversation is already empty and still untitled.
    if (conv && conv.messages.length === 0 && conv.title === DEFAULT_CONVERSATION_TITLE) return;
    abortedRef.current = true;
    setGenerating(false);
    setStopping(false);
    setFetching(false);
    setToolActivity(null);
    setEditingMsg(null);
    setCtxMsg(null);
    setCtxAnchor(null);
    setInput('');
    newConversation();
    forceScrollToBottom();
  }, [newConversation, forceScrollToBottom]);

  // Register header actions with the shell.
  useEffect(() => {
    onRegisterHeaderActions({
      openConversationHistory: onOpenConversationHistory,
      newConversation: handleNewConversation,
    });
    return () => onRegisterHeaderActions(null);
  }, [onRegisterHeaderActions, onOpenConversationHistory, handleNewConversation]);

  // Queued prompt hand-off (from /chat deep links and other screens).
  useEffect(() => {
    if (!visible || !queuedPrompt) return;
    if (processedQueuedRef.current === queuedPrompt) return;
    processedQueuedRef.current = queuedPrompt;
    if (!generatingRef.current && activeId) {
      sendText(queuedPrompt);
    } else {
      setInput(queuedPrompt);
    }
    onQueuedPromptConsumed?.();
  }, [visible, queuedPrompt, sendText, activeId, onQueuedPromptConsumed]);

  // Report the action menu state up so the shell's pan can stand down.
  useEffect(() => {
    onActionMenuOpenChange(actionMenuOpen);
  }, [actionMenuOpen, onActionMenuOpenChange]);

  const handleStop = useCallback(() => {
    if (!generating || stopping) return;
    setStopping(true);
    hapticTap();
    abortedRef.current = true;
  }, [generating, stopping]);

  const handleMessageAction = useCallback(
    (action: MessageMenuAction) => {
      if (action.key === 'edit' && ctxMsg && ctxMsg.role === 'user') {
        setEditingMsg(ctxMsg);
        setInput(ctxMsg.content);
        setEditFocusSignal((n) => n + 1);
      } else if (action.key === 'regenerate' && ctxMsg && ctxMsg.role === 'assistant') {
        void handleRegenerate(ctxMsg.id);
      }
      setCtxMsg(null);
      setCtxAnchor(null);
    },
    [ctxMsg, handleRegenerate],
  );

  // Confirm lifecycle — the one morphing card (§12.7), patched in place.
  const handleConfirmLifecycle = useCallback(
    (msgId: string, status: 'pending' | 'processing' | 'confirmed' | 'failed' | 'cancelled', receipt?: Receipt) => {
      if (!activeId) return;
      const conv = useChatStore.getState().conversations.find((c) => c.id === activeId);
      const msg = conv?.messages.find((m) => m.id === msgId);
      const cards = msg?.cards?.map((card) => {
        if (card.type !== 'confirm_preview') return card;
        return {
          ...card,
          data: { ...(card.data as Record<string, unknown>), status, ...(receipt ? { receipt } : {}) },
        };
      });
      if (!cards) return;
      // patched in place: a lifecycle change is not a new activity, so the
      // conversation's recency (updatedAt) and the drawer sort stay put.
      useChatStore.getState().patchMessage(activeId, msgId, { cards });
      if (status === 'confirmed' && receipt) {
        toast(`${receipt.title}.`);
        void refresh();
      }
    },
    [activeId, toast, refresh],
  );

  // ---- Layout offsets ----------------------------------------------------
  // Channel A (the bar's own position, on the UI thread) belongs to
  // `CommandBar`. What is left here is Channel B: the JS-side offsets for
  // everything that floats above the bar. `resolveCommandBarLift` is the exact
  // JS mirror of the bar's translate — including the Android `adjustPan`
  // correction — so the two can never disagree about where the bar is.
  const barMetrics = useCommandBarMetrics();
  const commandBarTop =
    barMetrics.footprint +
    resolveCommandBarLift({ keyboardHeight, safeAreaBottom: insets.bottom });

  const threadListPaddingBottom = useMemo(() => {
    let padding = commandBarTop + GAP_ABOVE_BAR.thread;
    if (fetching) padding += 36;
    return padding;
  }, [commandBarTop, fetching]);

  const listContentStyle = useMemo(
    () => [styles.listContent, { paddingTop: threadListPaddingBottom }],
    [threadListPaddingBottom],
  );

  // ---- Derived -----------------------------------------------------------
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const messageCount = messages.length;
  const showHero = messageCount === 0 && !editingMsg;
  const showSuggestions = showHero && !isKeyboardVisible && !generating;
  // §10.5: the floating status bar only when there is no empty streaming
  // bubble available to host the status.
  const hasEmptyStreamingMsg = messages.some((m) => m.streaming && m.content.trim().length === 0);
  const showFloatingStatus = fetching && !hasEmptyStreamingMsg;
  const heroBottomInset = commandBarTop + GAP_ABOVE_BAR.hero;
  const suggestionsBottom = commandBarTop + GAP_ABOVE_BAR.suggestions;
  const statusBarBottom = commandBarTop + GAP_ABOVE_BAR.status;

  // ---- Composer state ----------------------------------------------------
  const trimmedInput = input.trim();
  const trailing: CommandBarTrailing = generating
    ? 'stop'
    : trimmedInput.length > 0
      ? 'send'
      : 'plus';

  const submitInput = useCallback(() => {
    const text = input.trim();
    if (!text || generatingRef.current) return;
    setInput('');
    handleCommandSend(text);
  }, [input, handleCommandSend]);

  const handleTrailingPress = useCallback(() => {
    hapticTap();
    if (generatingRef.current) {
      handleStop();
      return;
    }
    if (input.trim().length > 0) {
      submitInput();
      return;
    }
    // The menu has no scrim of its own, so the `+` has to be able to take it
    // back down — otherwise it is only dismissable by choosing something.
    setActionMenuOpen((openNow) => !openNow);
  }, [input, handleStop, submitInput]);

  const trailingAccessibility =
    trailing === 'stop'
      ? { label: stopping ? 'Stopping' : 'Stop generation', hint: 'Cancels the reply in progress.', disabled: stopping }
      : trailing === 'send'
        ? { label: 'Send', hint: 'Sends this message to the assistant.' }
        : { label: 'Open actions', hint: 'Shows quick things to ask.' };

  const handleBubbleLongPress = useCallback(
    (msgId: string, anchor: { x: number; y: number; width: number; height: number }) => {
      const active = useChatStore.getState().activeId;
      const conv = useChatStore.getState().conversations.find((c) => c.id === active);
      const msg = conv?.messages.find((m) => m.id === msgId);
      if (!msg) return;
      setCtxMsg(msg);
      setCtxAnchor(anchor);
    },
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: StoredMessage }) => (
      <Bubble
        msg={item}
        generating={generatingRef.current}
        onLongPress={handleBubbleLongPress}
        onConfirmLifecycle={handleConfirmLifecycle}
      />
    ),
    [handleBubbleLongPress, handleConfirmLifecycle],
  );

  const suggestionDock = showSuggestions ? (
    <View style={[styles.suggestionsDock, { bottom: suggestionsBottom }]} pointerEvents="box-none">
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        style={styles.suggestionsScroll}
        contentContainerStyle={styles.suggestionsContent}>
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s}
            onPress={() => {
              hapticTap();
              handleCommandSend(s);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.suggestionPillSurface,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.lineStrong,
              },
              { opacity: pressed ? 0.72 : 1 },
            ]}>
            <View style={styles.suggestionChip}>
              <Text style={[styles.suggestionText, { color: colors.textPrimary }]}>{s}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  ) : null;

  return (
    <View style={styles.root}>
      <View style={styles.surfaceFrame}>
        {contextMember ? (
          <View style={[styles.contextRow, { paddingHorizontal: AiSpacing.conversationPaddingH }]}>
            <View style={[styles.contextChip, { backgroundColor: colors.cream, borderColor: colors.line }]}>
              <Ionicons name="person-outline" size={12} color={colors.textSecondary} />
              <Text style={[styles.contextChipText, { color: colors.textSecondary }]}>
                {contextMember.name}
              </Text>
            </View>
          </View>
        ) : null}

        {showHero ? (
          <View style={[styles.heroWrap, { paddingBottom: heroBottomInset }]} pointerEvents="box-none">
            <ChatLandingHero visible={visible} hidden={isKeyboardVisible} name={session?.name} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={reversedMessages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            inverted
            maintainVisibleContentPosition={MAINTAIN_VISIBLE_POSITION}
            removeClippedSubviews
            initialNumToRender={8}
            maxToRenderPerBatch={6}
            windowSize={7}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={listContentStyle}
            onScroll={handleScroll}
            onScrollBeginDrag={handleScrollBeginDrag}
            onScrollEndDrag={handleScrollEndDrag}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            scrollEventThrottle={16}
          />
        )}

        {showFloatingStatus ? (
          <View style={[styles.statusBar, { bottom: statusBarBottom }]} pointerEvents="none">
            <View style={styles.statusBarRow}>
              <Text style={[styles.fetchingText, { color: colors.textMuted }]}>
                {toolActivity ?? 'Thinking…'}
              </Text>
            </View>
          </View>
        ) : null}

        {suggestionDock}

        <ScrollToBottomPill
          visible={!isNearBottom && messageCount > 0}
          bottomOffset={commandBarTop + GAP_ABOVE_BAR.scrollPill}
          onPress={scrollToBottom}
        />

        {actionMenuOpen ? (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(180)}
            exiting={reduceMotion ? undefined : FadeOutDown.duration(140)}
            style={[
              styles.plusMenuWrap,
              { bottom: commandBarTop + GAP_ABOVE_BAR.plusMenu, right: space.l },
            ]}>
            <PlusMenu
              items={[
                { key: 'balance', icon: 'wallet-outline', label: "What's my balance?", onPress: () => handleCommandSend("What's my balance?") },
                { key: 'freeze', icon: 'snow-outline', label: 'Freeze a family member’s card', onPress: () => handleCommandSend('Freeze a family member’s card') },
                { key: 'allowance', icon: 'gift-outline', label: 'Give a family member more', caption: 'Until Sunday', onPress: () => handleCommandSend('Give a family member more this month') },
                { key: 'swiggy', icon: 'restaurant-outline', label: 'Order on Swiggy', caption: 'Food delivery', onPress: () => handleCommandSend('Order dinner on Swiggy') },
                { key: 'zomato', icon: 'fast-food-outline', label: 'Order on Zomato', caption: 'Food delivery', onPress: () => handleCommandSend('Order lunch on Zomato') },
                { key: 'blinkit', icon: 'basket-outline', label: 'Order on Blinkit', caption: 'Groceries', onPress: () => handleCommandSend('Order groceries on Blinkit') },
                { key: 'approvals', icon: 'hand-left-outline', label: 'Review approvals', onPress: () => router.push('/approvals') },
              ]}
              onDismiss={() => setActionMenuOpen(false)}
            />
          </Animated.View>
        ) : null}

        {/* The same control the Home dock morphs into — not a copy of it. It
            owns its own position, safe-area inset and both keyboard channels. */}
        <CommandBar
          open
          value={input}
          onChangeText={setInput}
          onSubmit={submitInput}
          placeholders={CHAT_PLACEHOLDER}
          editable={!generating}
          multiline
          inputMaxHeight={44}
          focusSignal={editingMsg ? editFocusSignal : undefined}
          trailing={trailing}
          markMorph={markMorph}
          onTrailingPress={handleTrailingPress}
          trailingAccessibility={trailingAccessibility}
          accessory={
            editingMsg ? (
              <View style={styles.editBarHeader}>
                <Text style={[styles.editBarLabel, { color: colors.textSecondary }]}>
                  Editing message
                </Text>
                <Pressable
                  onPress={() => setEditingMsg(null)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing"
                  style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}>
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </Pressable>
              </View>
            ) : null
          }
        />

        <MessageContextMenu
          visible={ctxMsg !== null}
          anchor={ctxAnchor}
          isUser={ctxMsg?.role === 'user'}
          canEdit={ctxMsg?.role === 'user'}
          canRegenerate={ctxMsg?.role === 'assistant' && !generating}
          content={ctxMsg?.content ?? ''}
          createdAt={ctxMsg?.createdAt ?? 0}
          onAction={handleMessageAction}
          onClose={() => {
            setCtxMsg(null);
            setCtxAnchor(null);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  surfaceFrame: { flex: 1, overflow: 'hidden' },
  heroWrap: { flex: 1 },
  contextRow: {
    flexDirection: 'row',
    paddingTop: 4,
  },
  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  contextChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: ChatFonts.medium,
  },
  listContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: AiSpacing.conversationPaddingH,
    paddingBottom: AiSpacing.listPaddingTop,
    gap: AiSpacing.messageGap,
  },
  statusBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    zIndex: 8,
  },
  statusBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  fetchingText: { fontSize: 12, fontFamily: ChatFonts.regular },
  suggestionsDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 56,
    zIndex: 20,
    elevation: 20,
  },
  suggestionsScroll: { flexGrow: 0, height: 56 },
  suggestionsContent: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  suggestionPillSurface: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    marginRight: 12,
    minWidth: 188,
    overflow: 'hidden',
  },
  suggestionChip: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  suggestionText: {
    fontFamily: ChatFonts.medium,
    fontSize: 14.5,
    letterSpacing: -0.1,
    lineHeight: 36,
    textAlign: 'center',
    includeFontPadding: false,
    transform: [{ translateY: 1 }],
  },
  plusMenuWrap: {
    position: 'absolute',
    zIndex: 30,
    elevation: 30,
  },
  editBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: space.xs,
  },
  editBarLabel: {
    fontSize: 11,
    fontFamily: ChatFonts.medium,
  },
});