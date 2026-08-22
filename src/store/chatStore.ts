import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';

/**
 * Chat state store (AI_CHAT_UI_UX_SPEC §16). Conversations are persisted with
 * a throttled, signature-skipping AsyncStorage adapter; streaming patches
 * never touch `updatedAt` so the drawer and header do not re-render 20×/s.
 */

export type CardLifecycle = 'loading' | 'streaming' | 'ready' | 'stale' | 'error' | 'empty';

export interface StoredCard {
  type: 'confirm_preview' | 'receipt';
  /** Defaults to "ready" when absent. */
  lifecycle?: CardLifecycle;
  data: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  /** Visible reply text (think blocks stripped). */
  content: string;
  /** Trace from thinking blocks, if any. */
  reasoning?: string;
  streaming?: boolean;
  /** FastCards: the reply came from the degraded/scripted fallback. */
  degraded?: boolean;
  createdAt: number;
  cards?: StoredCard[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: StoredMessage[];
  /** Kept for spec parity; FastCards has no local models. */
  modelPath?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ExecutionRecord {
  id: string;
  actionId: string;
  status: string;
  at: number;
}

interface ChatStoreState {
  conversations: Conversation[];
  activeId: string | null;
  /** LRU 50. */
  executions: ExecutionRecord[];
  /** ids, NOT a flag on Conversation. */
  pinnedIds: string[];
  archivedIds: string[];
}

interface ChatStoreActions {
  newConversation: (modelPath?: string) => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  togglePinned: (id: string) => void;
  toggleArchived: (id: string) => void;
  addMessage: (convId: string, msg: StoredMessage) => void;
  updateMessage: (convId: string, msgId: string, patch: Partial<StoredMessage>) => void;
  /** In-place patch that does NOT bump `updatedAt` (keeps drawer sort stable). */
  patchMessage: (convId: string, msgId: string, patch: Partial<StoredMessage>) => void;
  patchStreamingMessage: (convId: string, msgId: string, patch: Partial<StoredMessage>) => void;
  setTitle: (convId: string, title: string) => void;
  clearMessages: (convId: string) => void;
  deleteMessagesFrom: (convId: string, msgId: string) => void;
  appendExecution: (record: ExecutionRecord) => void;
}

export type ChatStore = ChatStoreState & ChatStoreActions;

let convSeq = 0;
let msgSeq = 0;
const newConvId = () => `conv_${Date.now()}_${++convSeq}`;
const newMsgId = () => `msg_${Date.now()}_${++msgSeq}`;

export const DEFAULT_CONVERSATION_TITLE = 'New conversation';

const THROTTLE_MS = 1000;
const MAX_PERSISTED_CONVERSATIONS = 25;
const MAX_PERSISTED_MESSAGES_PER_CONVERSATION = 80;
const MAX_PERSISTED_MESSAGE_CHARS = 12_000;
const MAX_PERSISTED_EXECUTIONS = 50;

/** A conversation-sized cap: keep the newest messages up to 80 and 12k chars. */
function capConversationMessages(messages: StoredMessage[]): StoredMessage[] {
  if (messages.length <= MAX_PERSISTED_MESSAGES_PER_CONVERSATION) return messages;
  const trimmed = messages.slice(-MAX_PERSISTED_MESSAGES_PER_CONVERSATION);
  let total = 0;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    total += trimmed[i].content.length;
    if (total > MAX_PERSISTED_MESSAGE_CHARS) return trimmed.slice(i + 1);
  }
  return trimmed;
}

/** Keeps pinned threads over recency when the persisted cap is hit. */
function capPersistedConversations(
  conversations: Conversation[],
  pinnedIds: string[],
): Conversation[] {
  if (conversations.length <= MAX_PERSISTED_CONVERSATIONS) {
    // Already under every cap: return the SAME array. A mapped copy allocates
    // new objects on every mutation and churns the persist signature for no
    // reason.
    let needsTrim = false;
    for (const c of conversations) {
      if (c.messages.length > MAX_PERSISTED_MESSAGES_PER_CONVERSATION) {
        needsTrim = true;
        break;
      }
    }
    if (!needsTrim) return conversations;
    return conversations.map((c) => ({ ...c, messages: capConversationMessages(c.messages) }));
  }
  const pinned = new Set(pinnedIds);
  const pinnedList = conversations.filter((c) => pinned.has(c.id));
  const rest = conversations
    .filter((c) => !pinned.has(c.id))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const kept = [...pinnedList, ...rest.slice(0, Math.max(0, MAX_PERSISTED_CONVERSATIONS - pinnedList.length))];
  return kept.map((c) => ({ ...c, messages: capConversationMessages(c.messages) }));
}

/**
 * Returns the existing array reference when nothing changed — a fresh array
 * would defeat the persist layer's signature skip (every toggle would write).
 */
function prunedFlagLists(list: string[], id: string, present: boolean): string[] {
  const has = list.includes(id);
  if (present && has) return list;
  if (!present && !has) return list;
  return present ? [...list, id] : list.filter((x) => x !== id);
}

// ---------------------------------------------------------------- persist

/**
 * Throttled AsyncStorage adapter. The throttle wraps the STATE OBJECT, not the
 * serialized string: a throttle under `createJSONStorage` would stringify
 * *before* the wrapped storage ran, coalescing only the cheap write while still
 * paying multi-hundred-KB `JSON.stringify` calls twenty times a second.
 *
 * The signature (the serialized state) is computed inside the throttle, so an
 * identical state skips the AsyncStorage write entirely.
 */
type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

function createPersistStorage<S>(
  storage: AsyncStorageLike,
  { throttleMs }: { throttleMs: number },
): PersistStorage<S> {
  let pending: StorageValue<S> | null = null;
  let lastWrittenSignature: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastWriteAt = 0;

  const doWrite = (name: string) => {
    const value = pending;
    pending = null;
    timer = null;
    lastWriteAt = Date.now();
    if (value === null) return;
    // Stringified here, at write time — the store mutates many times a
    // second, and the throttle is the right place to pay the serialize.
    const signature = JSON.stringify(value);
    if (signature === lastWrittenSignature) return;
    lastWrittenSignature = signature;
    void storage
      .setItem(name, JSON.stringify(value))
      .catch((e) => console.warn('[chatStore] persist write failed', e));
  };

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    doWrite(CHAT_STORE_KEY);
  };

  flushChatStorageRef.current = flush;

  return {
    getItem: async (name) => {
      try {
        const raw = await storage.getItem(name);
        if (!raw) return null;
        return JSON.parse(raw) as StorageValue<S>;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      // Signature is computed in doWrite at write time — see the comment there.
      pending = value;
      const elapsed = Date.now() - lastWriteAt;
      if (timer === null && elapsed >= throttleMs) {
        doWrite(name);
      } else if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          doWrite(name);
        }, Math.max(0, throttleMs - elapsed));
      }
    },
    removeItem: (name) => {
      pending = null;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      void storage.removeItem(name);
    },
  };
}

const CHAT_STORE_KEY = '@fastcards:chat';

/** The subset of state that crosses the persist boundary. */
type PersistedChatState = Pick<
  ChatStoreState,
  'conversations' | 'executions' | 'pinnedIds' | 'archivedIds'
>;

/**
 * Called from the root layout on AppState background/inactive so backgrounding
 * never drops the tail of a streaming thread (spec §2.4).
 */
export function flushChatStorage() {
  flushChatStorageRef.current();
}

const flushChatStorageRef: { current: () => void } = { current: () => undefined };

const chatPersistStorage = createPersistStorage<PersistedChatState>(AsyncStorage, {
  throttleMs: THROTTLE_MS,
});

// ------------------------------------------------------------------ store

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeId: null,
      executions: [],
      pinnedIds: [],
      archivedIds: [],

      newConversation: (modelPath) => {
        // Discard existing empty conversations so rapid "new chat" taps cannot
        // pile up blanks.
        const id = newConvId();
        const now = Date.now();
        set((s) => ({
          conversations: [
            ...s.conversations.filter((c) => c.messages.length > 0),
            {
              id,
              title: DEFAULT_CONVERSATION_TITLE,
              messages: [],
              modelPath,
              createdAt: now,
              updatedAt: now,
            },
          ],
          activeId: id,
        }));
        return id;
      },

      selectConversation: (id) => set({ activeId: id }),

      deleteConversation: (id) =>
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
        })),

      togglePinned: (id) =>
        set((s) => ({
          // Pin and archive are mutually exclusive.
          pinnedIds: prunedFlagLists(s.pinnedIds, id, !s.pinnedIds.includes(id)),
          archivedIds: s.pinnedIds.includes(id) ? s.archivedIds : prunedFlagLists(s.archivedIds, id, false),
        })),

      toggleArchived: (id) =>
        set((s) => ({
          archivedIds: prunedFlagLists(s.archivedIds, id, !s.archivedIds.includes(id)),
          pinnedIds: s.archivedIds.includes(id) ? s.pinnedIds : prunedFlagLists(s.pinnedIds, id, false),
        })),

      addMessage: (convId, msg) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== convId) return c;
            let title = c.title;
            if (title === DEFAULT_CONVERSATION_TITLE && msg.role === 'user') {
              const t = msg.content.trim();
              title = t.length > 50 ? `${t.slice(0, 50)}…` : t;
            }
            return { ...c, title, messages: [...c.messages, msg], updatedAt: Date.now() };
          }),
        })),

      updateMessage: (convId, msgId, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id !== convId
              ? c
              : {
                  ...c,
                  messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
                  updatedAt: Date.now(),
                },
          ),
        })),

      patchMessage: (convId, msgId, patch) =>
        // Does NOT touch updatedAt — used for in-place patches (card lifecycle)
        // so the drawer's recency sort and the header stay put.
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id !== convId
              ? c
              : {
                  ...c,
                  messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
                },
          ),
        })),

      patchStreamingMessage: (convId, msgId, patch) =>
        // Does NOT touch updatedAt and does not re-sort — that is what keeps the
        // drawer and header from re-rendering at every flush.
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id !== convId
              ? c
              : {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === msgId ? { ...m, ...patch, streaming: true } : m,
                  ),
                },
          ),
        })),

      setTitle: (convId, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId ? { ...c, title, updatedAt: Date.now() } : c,
          ),
        })),

      clearMessages: (convId) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId ? { ...c, messages: [], updatedAt: Date.now() } : c,
          ),
        })),

      deleteMessagesFrom: (convId, msgId) =>
        set((s) => ({
          conversations: s.conversations.map((c) => {
            if (c.id !== convId) return c;
            const index = c.messages.findIndex((m) => m.id === msgId);
            if (index === -1) return c;
            return { ...c, messages: c.messages.slice(0, index), updatedAt: Date.now() };
          }),
        })),

      appendExecution: (record) =>
        set((s) => ({
          executions: [record, ...s.executions].slice(0, MAX_PERSISTED_EXECUTIONS),
        })),
    }),
    {
      name: CHAT_STORE_KEY,
      storage: chatPersistStorage,
      partialize: (state) => ({
        conversations: capPersistedConversations(state.conversations, state.pinnedIds),
        executions: state.executions.slice(0, MAX_PERSISTED_EXECUTIONS),
        pinnedIds: state.pinnedIds,
        archivedIds: state.archivedIds,
      }),
      onRehydrateStorage: () => (state) => {
        // The landing chat always starts fresh.
        if (state) state.activeId = null;
      },
    },
  ),
);

export function activeConversation(state: ChatStoreState): Conversation | undefined {
  return state.conversations.find((c) => c.id === state.activeId);
}

export { newMsgId };

/** Preview used by the drawer's snapshot selector (first assistant text line). */
export function conversationPreview(conv: Conversation): string {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const m = conv.messages[i];
    if (m.role === 'assistant' && m.content.trim().length > 0) {
      const text = m.content.trim().replace(/\s+/g, ' ');
      return text.length > 56 ? `${text.slice(0, 56)}…` : text;
    }
  }
  return '';
}