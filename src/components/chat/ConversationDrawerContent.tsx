import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/fin/primitives';
import { AiDrawer, AiHeader, ChatFonts } from '@/constants/ai-ui';
import { useColors } from '@/design/theme';
import { conversationPreview, useChatStore, type Conversation } from '@/store/chatStore';

import { ConversationContextMenu, type ContextMenuThread, type MenuAnchor } from './ConversationContextMenu';
import { DeleteDialog, RenameDialog } from './ConversationDialogs';

// ------------------------------------------------------------ palette

export interface DrawerColors {
  panelBg: string;
  controlBg: string;
  controlBorder: string;
  inputBg: string;
  inputBorder: string;
  activeBg: string;
  activeBorder: string;
  rowBg: string;
  rowBorder: string;
  rowTitleText: string;
  rowDateText: string;
  sectionText: string;
}

/** Branches on the theme's screen background (spec §6.3). */
export function getDrawerColors(colors: ReturnType<typeof useColors>): DrawerColors {
  const dark = colors.screenBackground === '#000000';
  return {
    panelBg: colors.screenBackground,
    controlBg: dark ? '#111111' : colors.surfaceStrong,
    controlBorder: dark ? '#262626' : colors.lineStrong,
    inputBg: dark ? '#111111' : colors.surfaceStrong,
    inputBorder: dark ? '#242424' : colors.borderSubtle,
    activeBg: dark ? '#171717' : colors.navActiveBg,
    activeBorder: colors.lineStrong,
    rowBg: colors.surfaceCard,
    rowBorder: colors.borderSubtle,
    rowTitleText: dark ? '#D6D6D6' : colors.textPrimary,
    rowDateText: dark ? '#8A8A8F' : colors.textSecondary,
    sectionText: dark ? '#7D858F' : colors.textSecondary,
  };
}

// ------------------------------------------------------------- helpers

function formatRelativeTime(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172_800) return 'Yesterday';
  const d = new Date(ts * 1000);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

// ----------------------------------------- snapshot selector (§13.3)

export interface ConversationListSnapshot {
  id: string;
  title: string;
  preview: string;
  msgCount: number;
  updatedAt: number;
  pinned: boolean;
  archived: boolean;
}

/**
 * WeakMap-backed snapshot selector. The factory must be created inline inside
 * `useMemo` — passing the factory by reference bails the memoization out of the
 * whole component (spec §13.3).
 */
function createConversationListSnapshotSelector() {
  const cache = new WeakMap<Conversation, ConversationListSnapshot>();
  return (
    conversations: Conversation[],
    pinnedIds: string[],
    archivedIds: string[],
  ): ConversationListSnapshot[] =>
    conversations.map((c) => {
      const cached = cache.get(c);
      const pinned = pinnedIds.includes(c.id);
      const archived = archivedIds.includes(c.id);
      if (
        cached &&
        cached.updatedAt === c.updatedAt &&
        cached.msgCount === c.messages.length &&
        cached.pinned === pinned &&
        cached.archived === archived
      ) {
        return cached;
      }
      const snapshot: ConversationListSnapshot = {
        id: c.id,
        title: c.title,
        preview: conversationPreview(c),
        msgCount: c.messages.length,
        updatedAt: c.updatedAt,
        pinned,
        archived,
      };
      cache.set(c, snapshot);
      return snapshot;
    });
}

// ------------------------------------------------------------------ rows

function ThreadRow({
  thread,
  active,
  colors,
  onPress,
  onLongPress,
}: {
  thread: ConversationListSnapshot;
  active: boolean;
  colors: DrawerColors;
  onPress: () => void;
  onLongPress: (anchor: MenuAnchor) => void;
}) {
  const wrapRef = useRef<View>(null);

  const handleLongPress = () => {
    wrapRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress({ x, y, width, height });
    });
  };

  return (
    <Pressable
      ref={wrapRef}
      onPress={onPress}
      onLongPress={handleLongPress}
      delayLongPress={320}
      accessibilityRole="button"
      accessibilityLabel={`${thread.title}, ${thread.preview}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: active ? colors.activeBg : colors.rowBg,
          borderColor: active ? colors.activeBorder : colors.rowBorder,
        },
        pressed && { opacity: 0.7 },
      ]}>
      <View style={styles.rowBody}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: colors.rowTitleText }]}>
          {thread.title}
        </Text>
        {thread.msgCount > 0 ? (
          <Text numberOfLines={1} style={[styles.rowDate, { color: colors.rowDateText }]}>
            {thread.preview || formatRelativeTime(Math.floor(thread.updatedAt / 1000))}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowDateCol}>
        <Text style={[styles.rowDateSmall, { color: colors.rowDateText }]}>
          {formatRelativeTime(Math.floor(thread.updatedAt / 1000))}
        </Text>
        {thread.pinned ? <Ionicons name="bookmark" size={12} color={colors.rowDateText} /> : null}
      </View>
    </Pressable>
  );
}

// ------------------------------------------------------------ component

export function ConversationDrawerContent({
  visible,
  headerRowHeight,
  headerCenterY,
  onClose,
  onSelectConversation,
  onNewConversation,
  onOpenSettings,
  onMenuOpenChange,
}: {
  visible: boolean;
  headerRowHeight: number;
  headerCenterY: number;
  onClose: () => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onOpenSettings: () => void;
  onMenuOpenChange: (open: boolean) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const pinnedIds = useChatStore((s) => s.pinnedIds);
  const archivedIds = useChatStore((s) => s.archivedIds);
  const selectConversation = useChatStore((s) => s.selectConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const togglePinned = useChatStore((s) => s.togglePinned);
  const toggleArchived = useChatStore((s) => s.toggleArchived);
  const setTitle = useChatStore((s) => s.setTitle);

  const drawerColors = useMemo(() => getDrawerColors(colors), [colors]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [menuThread, setMenuThread] = useState<ContextMenuThread | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingTitle, setDeletingTitle] = useState('');

  const footerKeyboardOffset = useSharedValue(0);
  const hasBeenVisibleRef = useRef(false);

  // Manual transient-state reset on hide (the content stays mounted forever
  // once opened — see ChatHistoryDrawer). The first mount skips these setStates.
  useEffect(() => {
    if (visible) {
      hasBeenVisibleRef.current = true;
      return;
    }
    if (!hasBeenVisibleRef.current) return;
    setSearchOpen(false);
    setQuery('');
    setArchivedExpanded(false);
    setMenuThread(null);
    setMenuAnchor(null);
    setRenamingId(null);
    setDeletingId(null);
    footerKeyboardOffset.set(0);
  }, [visible, footerKeyboardOffset]);

  // Footer keyboard lift.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const drawerEasing = Easing.out(Easing.cubic);
    const onShow = (e: { duration?: number; endCoordinates: { height: number } }) => {
      const duration = e.duration || (Platform.OS === 'ios' ? 250 : 220);
      footerKeyboardOffset.set(withTiming(e.endCoordinates.height, { duration, easing: drawerEasing }));
    };
    const onHide = () =>
      footerKeyboardOffset.set(withTiming(0, { duration: Platform.OS === 'ios' ? 250 : 220, easing: drawerEasing }));
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [footerKeyboardOffset]);

  const footerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -footerKeyboardOffset.get() }],
  }));

  // §13.1 sorting/filtering pipeline.
  const selector = useMemo(() => createConversationListSnapshotSelector(), []);
  const snapshot = useMemo(
    () => selector(conversations, pinnedIds, archivedIds),
    [selector, conversations, pinnedIds, archivedIds],
  );

  const threadList = useMemo(
    () =>
      [...snapshot]
        // Threads with no messages are filtered out unless this is the active one.
        .filter((t) => t.msgCount > 0 || t.id === activeId)
        // Pinned first, then recency.
        .sort((a, b) => (a.pinned === b.pinned ? b.updatedAt - a.updatedAt : a.pinned ? -1 : 1)),
    [snapshot, activeId],
  );

  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threadList;
    // Case-insensitive substring match against title OR preview.
    return threadList.filter((t) => t.title.toLowerCase().includes(q) || t.preview.toLowerCase().includes(q));
  }, [threadList, query]);

  const pinnedFiltered = useMemo(() => filteredThreads.filter((t) => t.pinned), [filteredThreads]);
  const regularFiltered = useMemo(() => filteredThreads.filter((t) => !t.pinned && !t.archived), [filteredThreads]);
  const archivedFiltered = useMemo(() => filteredThreads.filter((t) => t.archived), [filteredThreads]);

  const footerPaddingBottom = Math.max(insets.bottom, AiDrawer.footerPaddingBottomMin) + AiDrawer.sectionGap * 2;
  const listBottomPadding = AiDrawer.newChatPillHeight + footerPaddingBottom + AiDrawer.footerPaddingV + 16;
  const searchBarHeight = AiHeader.actionButtonSize + AiDrawer.sectionGap * 2; // 48

  const searching = searchOpen && query.trim().length > 0;

  const handleRowPress = (id: string) => {
    selectConversation(id);
    onClose();
  };

  const handleRowLongPress = (thread: ConversationListSnapshot, anchor: MenuAnchor) => {
    setMenuThread({ id: thread.id, title: thread.title, pinned: thread.pinned, archived: thread.archived });
    setMenuAnchor(anchor);
  };

  const renderRow = useCallback(
    ({ item }: { item: ConversationListSnapshot }) => (
      <ThreadRow
        thread={item}
        active={item.id === activeId}
        colors={drawerColors}
        onPress={() => handleRowPress(item.id)}
        onLongPress={(anchor) => handleRowLongPress(item, anchor)}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, drawerColors],
  );

  const renderPinned = useCallback(
    () =>
      pinnedFiltered.length > 0 ? (
        <View style={styles.pinnedSection}>
          <View style={styles.threadGroupHeader}>
            <Text style={[styles.threadGroupLabel, { color: drawerColors.sectionText }]}>Pinned</Text>
          </View>
          {pinnedFiltered.map((t) => (
            <ThreadRow
              key={t.id}
              thread={t}
              active={t.id === activeId}
              colors={drawerColors}
              onPress={() => handleRowPress(t.id)}
              onLongPress={(anchor) => handleRowLongPress(t, anchor)}
            />
          ))}
        </View>
      ) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pinnedFiltered, activeId, drawerColors],
  );

  const renderArchived = useCallback(
    () =>
      archivedFiltered.length > 0 ? (
        <View style={styles.archivedSection}>
          <Pressable
            onPress={() => setArchivedExpanded((v) => !v)}
            accessibilityRole="button"
            style={styles.threadGroupHeader}>
            <Text style={[styles.threadGroupLabel, { color: drawerColors.sectionText }]}>
              Archived ({archivedFiltered.length})
            </Text>
            <Ionicons name={archivedExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={drawerColors.sectionText} />
          </Pressable>
          {archivedExpanded
            ? archivedFiltered.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  active={t.id === activeId}
                  colors={drawerColors}
                  onPress={() => handleRowPress(t.id)}
                  onLongPress={(anchor) => handleRowLongPress(t, anchor)}
                />
              ))
            : null}
        </View>
      ) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [archivedFiltered, archivedExpanded, activeId, drawerColors],
  );

  const empty = pinnedFiltered.length === 0 && regularFiltered.length === 0 && archivedFiltered.length === 0;
  const headerPadTop = Math.max(0, headerCenterY - headerRowHeight / 2);

  return (
    <View style={[styles.root, { backgroundColor: drawerColors.panelBg }]}>
      {/* Header row — aligned to the shell's left icon centre. The pad is part
          of the box, not a subtraction from it: sizing the view to
          `headerRowHeight` alone left the padding eating the row, so the
          wordmark's centre never actually reached `headerCenterY`. */}
      <View
        style={[styles.header, { height: headerPadTop + headerRowHeight, paddingTop: headerPadTop }]}>
        <Text
          numberOfLines={1}
          style={[styles.brandTitle, { color: colors.textPrimary, paddingHorizontal: AiDrawer.contentPaddingH }]}>
          Ask
        </Text>
        <Pressable
          onPress={() => setSearchOpen((v) => !v)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? 'Close search' : 'Search chats'}
          style={({ pressed }) => [styles.headerSearchBtn, pressed && { opacity: 0.6 }]}>
          <Ionicons name={searchOpen ? 'close-outline' : 'search-outline'} size={24} color={colors.textSecondary} />
        </Pressable>
      </View>

      {searchOpen ? (
        <View
          style={[
            styles.headerSearchBar,
            { minHeight: searchBarHeight, borderColor: drawerColors.inputBorder, backgroundColor: drawerColors.inputBg },
          ]}>
          <Ionicons name="search-outline" size={16} color={drawerColors.sectionText} style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="Search chats"
            placeholderTextColor={drawerColors.rowDateText}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            style={[styles.searchInput, { color: drawerColors.rowTitleText }]}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={drawerColors.rowDateText} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {empty ? (
        <View style={styles.empty}>
          <View
            style={[styles.emptyIcon, { backgroundColor: drawerColors.controlBg, borderColor: drawerColors.controlBorder }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={24} color={drawerColors.sectionText} />
          </View>
          <Text style={[styles.emptyTitle, { color: drawerColors.rowTitleText }]}>
            {searching ? 'No matching chats' : 'No chats yet'}
          </Text>
          <Text style={[styles.emptyBody, { color: drawerColors.rowDateText }]}>
            {searching ? 'Try a different search term.' : 'Start a private assistant thread when you are ready.'}
          </Text>
          {!searching ? (
            <Pressable
              onPress={onNewConversation}
              accessibilityRole="button"
              style={({ pressed }) => [styles.emptyButton, { borderColor: drawerColors.controlBorder }, pressed && { opacity: 0.7 }]}>
              <Ionicons name="create-outline" size={16} color={drawerColors.rowTitleText} />
              <Text style={[styles.emptyButtonText, { color: drawerColors.rowTitleText }]}>Start New Chat</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={regularFiltered}
          keyExtractor={(t) => t.id}
          renderItem={renderRow}
          ListHeaderComponent={renderPinned}
          ListFooterComponent={renderArchived}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: listBottomPadding, paddingTop: 2 }}
        />
      )}

      {/* Footer — absolutely positioned, lifted by the keyboard. */}
      <Animated.View
        style={[
          styles.footer,
          {
            paddingHorizontal: 22,
            paddingTop: AiDrawer.footerPaddingV,
            // Float the controls above the home indicator (same 20dp floor
            // the list's clearance already reserves).
            paddingBottom: Math.max(insets.bottom, AiDrawer.footerPaddingBottomMin),
          },
          footerAnimatedStyle,
        ]}>
        <View style={styles.bottomBar}>
          <Pressable
            onPress={onNewConversation}
            accessibilityRole="button"
            accessibilityLabel="Start a new chat"
            style={({ pressed }) => [
              styles.newChatPill,
              { backgroundColor: colors.textPrimary },
              pressed && { opacity: 0.85 },
            ]}>
            <Ionicons name="create-outline" size={AiDrawer.newChatPillIconSize} color={colors.textInverse} />
            <Text style={[styles.newChatPillText, { color: colors.textInverse }]}>New chat</Text>
          </Pressable>
          <View style={styles.footerRight}>
            <Pressable
              onPress={onOpenSettings}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.6 }]}>
              <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
            </Pressable>
            <Avatar name={session?.name ?? '?'} size={AiDrawer.accountAvatarSize} onPress={onOpenSettings} />
          </View>
        </View>
      </Animated.View>

      <ConversationContextMenu
        visible={menuThread !== null}
        anchor={menuAnchor}
        thread={menuThread}
        onPin={() => {
          if (menuThread) togglePinned(menuThread.id);
        }}
        onRename={() => {
          if (menuThread) {
            setRenamingId(menuThread.id);
            setRenameText(menuThread.title);
          }
        }}
        onArchive={() => {
          if (menuThread) toggleArchived(menuThread.id);
        }}
        onDelete={() => {
          if (menuThread) {
            setDeletingId(menuThread.id);
            setDeletingTitle(menuThread.title);
          }
        }}
        onClose={() => {
          setMenuThread(null);
          setMenuAnchor(null);
        }}
        onOpenChange={onMenuOpenChange}
      />

      <RenameDialog
        visible={renamingId !== null}
        initial={renameText}
        onCancel={() => setRenamingId(null)}
        onSave={(title) => {
          if (renamingId) setTitle(renamingId, title);
          setRenamingId(null);
        }}
      />

      <DeleteDialog
        visible={deletingId !== null}
        title={deletingTitle}
        onCancel={() => setDeletingId(null)}
        onDelete={() => {
          if (deletingId) {
            deleteConversation(deletingId);
            if (activeId === deletingId) onClose();
          }
          setDeletingId(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
  },
  brandTitle: {
    flex: 1,
    fontFamily: ChatFonts.bold,
    fontSize: AiDrawer.titleSize,
    includeFontPadding: false,
    lineHeight: AiDrawer.titleLineHeight,
  },
  headerSearchBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: AiHeader.actionButtonSize,
    width: AiHeader.actionButtonSize,
  },
  headerSearchBar: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 4,
    minWidth: 0,
    paddingHorizontal: AiDrawer.searchBarPaddingH,
    paddingVertical: AiDrawer.searchBarPaddingV,
  },
  searchIcon: { marginRight: AiDrawer.sectionGap * 2 },
  searchInput: {
    flex: 1,
    fontFamily: ChatFonts.regular,
    fontSize: AiDrawer.searchInputSize,
    paddingVertical: 0,
  },
  row: {
    alignItems: 'center',
    borderRadius: AiDrawer.activeRowRadius,
    borderWidth: 1,
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 3,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowBody: { flex: 1, gap: 4, minWidth: 0 },
  rowTitle: { fontFamily: ChatFonts.regular, fontSize: 18, lineHeight: 25 },
  rowDate: { fontFamily: ChatFonts.regular, fontSize: 16, lineHeight: 21 },
  rowDateCol: { alignItems: 'flex-end', gap: 4, marginLeft: 10 },
  rowDateSmall: { fontFamily: ChatFonts.regular, fontSize: AiDrawer.rowDateSize, lineHeight: 14 },
  threadGroupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 28,
  },
  threadGroupLabel: { fontFamily: ChatFonts.medium, fontSize: 16, lineHeight: 21 },
  pinnedSection: { marginBottom: 18 },
  archivedSection: { marginTop: 18 },
  footer: {
    bottom: 0,
    left: 0,
    right: 0,
    position: 'absolute',
  },
  bottomBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AiDrawer.settingsGap,
    justifyContent: 'space-between',
  },
  newChatPill: {
    alignItems: 'center',
    borderRadius: AiDrawer.newChatPillRadius,
    flexDirection: 'row',
    gap: AiDrawer.newChatPillGap,
    minHeight: AiDrawer.newChatPillHeight,
    paddingHorizontal: AiDrawer.newChatPillPaddingH,
  },
  newChatPillText: { fontFamily: ChatFonts.semiBold, fontSize: AiDrawer.newChatPillTextSize },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: AiDrawer.settingsGap },
  settingsBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: AiHeader.actionButtonSize,
    width: AiHeader.actionButtonSize,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  emptyIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 8,
  },
  emptyTitle: { fontFamily: ChatFonts.semiBold, fontSize: 16, lineHeight: 22 },
  emptyBody: { fontFamily: ChatFonts.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  emptyButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  emptyButtonText: { fontFamily: ChatFonts.medium, fontSize: 14 },
});