import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { useAskDock } from '@/components/ask/AskDockContext';
import { useAuth } from '@/auth/AuthContext';
import { BalanceCard } from '@/components/fin/BalanceCard';
import { useHeroBalance } from '@/components/fin/useHeroBalance';
import { QuickAction, SectionHeader } from '@/components/fin/primitives';
import { TransactionRow } from '@/components/fin/TransactionRow';
import { ChatFirstShell } from '@/features/home/ChatFirstShell';
import type { ChatDrawerMode } from '@/features/home/useChatDrawer';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { screenPad, space } from '@/design/tokens';
import { useDomain } from '@/domain/store';
import { useHomeSheet } from '@/features/home-sheets/SheetHost';
import type { MorphOrigin } from '@/features/home-sheets/sheetMotion';

function greeting(name: string): string {
  const h = new Date().getHours();
  if (h < 12) return `Good morning, ${name}`;
  if (h < 17) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}

/**
 * The Ask tab — the chat-first shell (AI_CHAT_UI_UX_SPEC §2.4: the chat lives
 * on the home route; the drawer is a shell-level concern). The wallet layer is
 * the former home hero; the shell slides the whole surface over the history
 * drawer and cross-fades between Ask (chat) and Home (wallet) modes.
 */
export default function AskHome() {
  const { state } = useDomain();
  const { session } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const dock = useAskDock();
  const sheet = useHomeSheet();
  const params = useLocalSearchParams<{ q?: string; member?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  // Same hero the last step of onboarding shows. It stands down while the Ask
  // composer is up so the swipe cannot fight the sheet.
  const hero = useHeroBalance({ pagerEnabled: !dock.composerOpen });

  const queuedPrompt =
    typeof params.q === 'string' && params.q.length > 0 ? params.q : null;
  const contextMemberId =
    typeof params.member === 'string' && params.member.length > 0 ? params.member : undefined;

  // Report the shell mode so the dock can stand down in chat mode.
  const handleModeChange = useCallback(
    (mode: ChatDrawerMode) => {
      dock.setChatMode(mode === 'chat');
    },
    [dock],
  );

  useFocusEffect(
    useCallback(() => {
      dock.setAskHome(true);
      dock.registerScrollToTop('index', () => scrollRef.current?.scrollTo({ y: 0, animated: true }));
      return () => {
        dock.setAskHome(false);
        dock.registerScrollToTop('index', null);
      };
    }, [dock]),
  );

  const newUser = state.cards.length === 0 && state.members.length <= 1;

  // Deposit, Transfer and Payments present their detail UI as the sheet
  // rather than as pushed routes, so the wallet stays mounted underneath.
  // The button measures itself at touch-down; the sheet expands out of the
  // button's rect (falling back to a rise from the touch point, or a plain
  // rise from the bottom edge, when no rect is available).
  const openDeposit = useCallback(
    (originY?: number, originRect?: MorphOrigin) =>
      sheet.openSheet({ variant: 'deposit', originY, originRect }),
    [sheet],
  );
  const openTransfer = useCallback(
    (originY?: number, originRect?: MorphOrigin) =>
      sheet.openSheet({ variant: 'transfer', originY, originRect }),
    [sheet],
  );
  const openPayments = useCallback(
    (originY?: number, originRect?: MorphOrigin) =>
      sheet.openSheet({ variant: 'payments', originY, originRect }),
    [sheet],
  );

  const recent = [...state.transactions].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  const hue = colors.member[hero.owner?.hueId ?? 'rohan'];

  // Swiping anywhere on the wallet page changes scope, so the gesture lives
  // here rather than on the card. The shell's drawer pan activates at 24px of
  // horizontal travel while the pager activates at 16px, so inside the wallet
  // layer the pager wins horizontal drags exactly as before; the shell pan
  // owns chat-mode swipes (left = Home, right = history drawer).
  const rootPan = hero.pan;

  const actions: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: (originY?: number, rect?: MorphOrigin) => void;
  }[] = [
    { icon: 'add-outline', label: 'Deposit', onPress: openDeposit },
    { icon: 'swap-horizontal-outline', label: 'Transfer', onPress: openTransfer },
    { icon: 'card-outline', label: 'Payments', onPress: openPayments },
  ];

  const walletLayer = (
    <GestureDetector gesture={rootPan}>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: space.s,
              paddingBottom: dock.tabBarHeight + space.l,
            },
          ]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <AppText variant="body" tone={colors.textSecondary} numberOfLines={1}>
              {greeting(session?.name ?? '')}
            </AppText>
          </View>

          <BalanceCard {...hero.balanceProps} />

          {newUser ? (
            <View style={styles.quickRow}>
              <QuickAction icon="card-outline" label="First card" onPress={() => router.push('/order-card')} />
              <QuickAction icon="person-add-outline" label="Add family" onPress={() => router.push('/invite-member')} />
              <QuickAction icon="swap-horizontal-outline" label="Move money" onPress={() => router.push('/move-money')} />
              <QuickAction icon="sparkles-outline" label="Ask spending" onPress={() => router.push('/(tabs)')} />
            </View>
          ) : (
            <View style={styles.quickRow}>
              {actions.slice(0, 4).map((a) => (
                <QuickAction key={a.label} icon={a.icon} label={a.label} onPress={a.onPress} />
              ))}
            </View>
          )}

          <View>
            <SectionHeader title="Recent" actionLabel="View all" onAction={() => router.push('/(tabs)/activity')} />
            {recent.length === 0 ? (
              <AppText variant="secondary" tone={colors.textTertiary}>
                Your activity will appear here.
              </AppText>
            ) : (
              recent.map((t) => (
                <TransactionRow
                  key={t.id}
                  txn={t}
                  member={state.members.find((m) => m.id === t.memberId)}
                  onPress={(event, rect) =>
                    sheet.openSheet({
                      variant: 'transaction',
                      txnId: t.id,
                      originY: event.nativeEvent.pageY,
                      originRect: rect,
                    })
                  }
                />
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </GestureDetector>
  );

  return (
    <ChatFirstShell
      walletLayer={walletLayer}
      queuedPrompt={queuedPrompt}
      onQueuedPromptConsumed={() => router.setParams({ q: '' })}
      contextMemberId={contextMemberId}
      onModeChange={handleModeChange}
      headerAvatar={{ name: session?.name ?? '?', backgroundColor: hue.dim, textColor: hue.ink }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    paddingHorizontal: screenPad,
    gap: space.xl,
  },
  header: {
    gap: space.m,
  },
  quickRow: {
    flexDirection: 'row',
    gap: space.s,
  },
});