import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, ApiError, type Receipt, type ServerPreparedAction } from '@/api/client';
import {
  AssistantText,
  ReceiptBlock,
  ServerProposalBlock,
  ThinkingIndicator,
  UserBubble,
} from '@/components/ask/blocks';
import { Composer } from '@/components/ask/Composer';
import { ScreenHeader } from '@/components/fin/Screen';
import { useToast } from '@/components/fin/Toast';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { screenPad, space } from '@/design/tokens';
import { useAuth } from '@/auth/AuthContext';
import { useDomain } from '@/domain/store';

// AI Conversation — served by the backend agent (hosted Qwen with a
// scripted fallback). The thread renders text plus server-PREPARED
// actions; execution only happens through the gateway via the trusted
// ConfirmSheet, and receipts land back in the thread + Activity.

type ChatItem =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; degraded?: boolean }
  | { id: string; role: 'proposal'; action: ServerPreparedAction; status: 'pending' | 'executed' | 'cancelled' | 'failed' }
  | { id: string; role: 'receipt'; receipt: Receipt }
  | { id: string; role: 'thinking' };

let itemSeq = 0;
const nextId = () => `msg-${++itemSeq}`;

export default function ChatScreen() {
  const params = useLocalSearchParams<{ q?: string; member?: string }>();
  const { headers } = useAuth();
  const { state, refresh } = useDomain();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [contextMemberId, setContextMemberId] = useState<string | undefined>(
    typeof params.member === 'string' && params.member.length > 0 ? params.member : undefined,
  );
  const processedInitial = useRef(false);

  const contextMember = contextMemberId
    ? state.members.find((m) => m.id === contextMemberId)
    : undefined;

  const submit = useCallback(
    async (text: string) => {
      if (busy) return;
      setBusy(true);
      const thinkingId = nextId();
      setItems((prev) => [...prev, { id: nextId(), role: 'user', text }, { id: thinkingId, role: 'thinking' }]);

      // History for the stateless agent endpoint: text turns only.
      const history = [
        ...items
          .filter((i): i is Extract<ChatItem, { role: 'user' | 'assistant' }> => i.role === 'user' || i.role === 'assistant')
          .map((i) => ({ role: i.role, content: i.text })),
        { role: 'user' as const, content: text },
      ];

      try {
        const res = await api.agentChat(headers, history.slice(-16), contextMemberId);
        setItems((prev) => [
          ...prev.filter((i) => i.id !== thinkingId),
          ...(res.text
            ? [{ id: nextId(), role: 'assistant' as const, text: res.text, degraded: res.degraded }]
            : []),
          ...res.prepared.map<ChatItem>((action) => ({
            id: nextId(),
            role: 'proposal',
            action,
            status: 'pending',
          })),
        ]);
      } catch (e) {
        const message =
          e instanceof ApiError && e.code === 'rate_limited'
            ? 'The assistant is rate-limited — try again in a minute.'
            : "The assistant isn't reachable right now. Your money and manual controls still work.";
        setItems((prev) => [
          ...prev.filter((i) => i.id !== thinkingId),
          { id: nextId(), role: 'assistant', text: message, degraded: true },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, items, headers, contextMemberId],
  );

  useEffect(() => {
    if (!processedInitial.current && typeof params.q === 'string' && params.q.length > 0) {
      processedInitial.current = true;
      void submit(params.q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [items.length]);

  const setProposalStatus = (id: string, status: 'executed' | 'cancelled' | 'failed') =>
    setItems((prev) => prev.map((i) => (i.id === id && i.role === 'proposal' ? { ...i, status } : i)));

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + space.s }]}>
      <View style={{ paddingHorizontal: screenPad }}>
        <ScreenHeader title="Ask" back />
        {contextMember ? (
          <View style={styles.contextRow}>
            <View style={[styles.contextChip, { backgroundColor: colors.cream, borderColor: colors.line }]}>
              <Ionicons name="person-outline" size={12} color={colors.textSecondary} />
              <AppText variant="caption" tone={colors.textSecondary}>
                {contextMember.name}
              </AppText>

            </View>
          </View>
        ) : null}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.thread}
          showsVerticalScrollIndicator={false}>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <AppText variant="secondary" tone={colors.textTertiary} style={{ textAlign: 'center' }}>
                Ask about spending, cards, family or shopping.
              </AppText>
              <AppText variant="secondary" tone={colors.textTertiary} style={{ textAlign: 'center' }}>
                Try "Give Maya ₹1,000 more until Sunday" or "Freeze Dad's card".
              </AppText>
            </View>
          ) : null}

          {items.map((item) => {
            switch (item.role) {
              case 'user':
                return <UserBubble key={item.id} text={item.text} />;
              case 'thinking':
                return <ThinkingIndicator key={item.id} />;
              case 'assistant':
                return <AssistantText key={item.id} text={item.text} degraded={item.degraded} />;
              case 'receipt':
                return <ReceiptBlock key={item.id} receipt={item.receipt} />;
              case 'proposal':
                return (
                  <ServerProposalBlock
                    key={item.id}
                    action={item.action}
                    status={item.status}
                    onExecuted={(receipt) => {
                      setProposalStatus(item.id, 'executed');
                      setItems((prev) => [...prev, { id: nextId(), role: 'receipt', receipt }]);
                      toast(`${receipt.title}.`);
                      void refresh();
                    }}
                    onCancelled={() => setProposalStatus(item.id, 'cancelled')}
                  />
                );
            }
          })}
        </ScrollView>

        <View style={[styles.composerWrap, { paddingBottom: insets.bottom + space.m, backgroundColor: colors.bg }]}>
          <Composer onSubmit={(t) => void submit(t)} autoFocus={items.length === 0} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  contextRow: {
    flexDirection: 'row',
    marginBottom: space.s,
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
  thread: {
    paddingHorizontal: screenPad,
    paddingTop: space.s,
    paddingBottom: space.xl,
    gap: space.l,
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    gap: space.s,
    paddingHorizontal: space.xl,
  },
  composerWrap: {
    paddingHorizontal: screenPad,
    paddingTop: space.s,
  },
});
