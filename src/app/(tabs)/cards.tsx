import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { useAskDock } from '@/components/ask/AskDockContext';
import { PaymentCardVisual } from '@/components/fin/PaymentCardVisual';
import { ProgressBar, QuickAction, SectionHeader, StatusBadge } from '@/components/fin/primitives';
import { RollingMoney } from '@/components/fin/RollingMoney';
import { HeaderIconButton, Screen, ScreenHeader } from '@/components/fin/Screen';
import { useToast } from '@/components/fin/Toast';
import { TransactionRow } from '@/components/fin/TransactionRow';
import { AppText } from '@/design/AppText';
import { useReduceMotion } from '@/design/motion';
import { useColors } from '@/design/theme';
import { screenPad, space } from '@/design/tokens';
import { useMoney } from '@/domain/currency';
import { useDomain } from '@/domain/store';
import type { Card, Member } from '@/domain/types';

function CarouselCard({
  card,
  member,
  index,
  scrollX,
  cardWidth,
  gap,
  reduceMotion,
}: {
  card: Card;
  member?: Member;
  index: number;
  scrollX: SharedValue<number>;
  cardWidth: number;
  gap: number;
  reduceMotion: boolean;
}) {
  const stride = cardWidth + gap;
  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { transform: [{ scale: 1 }], opacity: 1 };
    const pos = index * stride;
    return {
      transform: [
        {
          scale: interpolate(scrollX.value, [pos - stride, pos, pos + stride], [0.92, 1, 0.92], Extrapolation.CLAMP),
        },
      ],
    };
  });
  return (
    <Animated.View style={animatedStyle}>
      <PaymentCardVisual card={card} member={member} width={cardWidth} />
    </Animated.View>
  );
}

export default function CardsHub() {
  const { formatMoney } = useMoney();
  const { state, dispatch } = useDomain();
  const router = useRouter();
  const toast = useToast();
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const dock = useAskDock();
  const { width } = useWindowDimensions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scrollX = useSharedValue(0);
  const scrollRef = useRef<ScrollView>(null);
  const cardWidth = Math.round(width * 0.78);
  const gap = space.m;
  const sidePad = (width - cardWidth) / 2;

  useFocusEffect(
    useCallback(() => {
      dock.registerScrollToTop('cards', () => scrollRef.current?.scrollTo({ y: 0, animated: true }));
      return () => dock.registerScrollToTop('cards', null);
    }, [dock]),
  );

  const cards = state.cards;
  const selected = cards[Math.min(selectedIndex, Math.max(cards.length - 1, 0))];
  const member = selected?.memberId ? state.members.find((m) => m.id === selected.memberId) : undefined;

  const effectiveCap =
    selected && selected.monthlyCap !== undefined
      ? selected.monthlyCap + (member?.tempAllowance?.amount ?? 0)
      : undefined;
  const remaining = selected && effectiveCap !== undefined ? effectiveCap - selected.spentThisMonth : undefined;
  const cardTxns = selected ? state.transactions.filter((t) => t.cardId === selected.id).slice(0, 4) : [];

  const frozen = selected?.status === 'frozen';
  const closed = selected?.status === 'closed';

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const toggleFreeze = () => {
    if (!selected) return;
    if (closed) {
      Alert.alert('Card closed', `${selected.nickname} closed automatically after use and can't be reactivated.`);
      return;
    }
    dispatch({ type: frozen ? 'unfreeze_card' : 'freeze_card', cardId: selected.id });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast(`${selected.nickname} is ${frozen ? 'active again' : 'frozen'}.`);
  };

  if (cards.length === 0) {
    return (
      <Screen scrollToTopRef={scrollRef} onScrollDirection={dock.reportScroll}>
        <ScreenHeader
          title="Cards"
          right={<HeaderIconButton icon="add" label="Create card" onPress={() => router.push('/order-card')} />}
        />
        <AppText variant="secondary" tone={colors.textTertiary}>
          No cards yet.
        </AppText>
        <QuickAction icon="add-outline" label="Create card" onPress={() => router.push('/order-card')} />
      </Screen>
    );
  }

  return (
    <Screen scrollToTopRef={scrollRef} onScrollDirection={dock.reportScroll} style={{ paddingHorizontal: 0 }}>
      <View style={{ paddingHorizontal: screenPad }}>
        <ScreenHeader
          title="Cards"
          right={<HeaderIconButton icon="add" label="Create card" onPress={() => router.push('/order-card')} />}
        />
      </View>

      <Animated.FlatList
        horizontal
        data={cards}
        keyExtractor={(c) => c.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + gap}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: sidePad, gap, paddingVertical: 6 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + gap));
          const clamped = Math.max(0, Math.min(idx, cards.length - 1));
          if (clamped !== selectedIndex) {
            setSelectedIndex(clamped);
            Haptics.selectionAsync();
            const c = cards[clamped];
            AccessibilityInfo.announceForAccessibility(
              `${c.nickname}, ending ${c.last4}, ${clamped + 1} of ${cards.length}`,
            );
          }
        }}
        renderItem={({ item, index }) => (
          <CarouselCard
            card={item}
            member={item.memberId ? state.members.find((m) => m.id === item.memberId) : undefined}
            index={index}
            scrollX={scrollX}
            cardWidth={cardWidth}
            gap={gap}
            reduceMotion={reduceMotion}
          />
        )}
      />

      <View style={{ paddingHorizontal: screenPad, gap: space.xl }}>
        <View style={styles.summary}>
          <View style={styles.statusRow}>
            <StatusBadge status={closed ? 'closed' : frozen ? 'frozen' : selected.status === 'pending' ? 'pending' : 'active'} />
          </View>
          <AppText variant="label">
            {closed ? 'Closed' : remaining !== undefined ? 'Remaining this month' : 'Spent this month'}
          </AppText>
          <RollingMoney
            amount={
              closed
                ? selected.spentThisMonth
                : remaining !== undefined
                  ? Math.max(remaining, 0)
                  : selected.spentThisMonth
            }
            fontSize={36}
          />
          {effectiveCap !== undefined && !closed ? (
            <>
              <AppText variant="secondary" tone={colors.textTertiary}>
                of {formatMoney(effectiveCap)} monthly limit
                {member?.tempAllowance ? ` (includes +${formatMoney(member.tempAllowance.amount)} temporary)` : ''}
              </AppText>
              <ProgressBar value={selected.spentThisMonth / effectiveCap} style={{ marginTop: space.s }} />
            </>
          ) : closed && selected.maxAuthorization ? (
            <AppText variant="secondary" tone={colors.textTertiary}>
              Protected checkout · max authorization was {formatMoney(selected.maxAuthorization)}
            </AppText>
          ) : (
            <AppText variant="secondary" tone={colors.textTertiary}>
              No monthly limit on this card
            </AppText>
          )}
        </View>

        <View style={styles.quickRow}>
          <QuickAction icon={frozen ? 'sunny-outline' : 'snow-outline'} label={frozen ? 'Unfreeze' : 'Freeze'} onPress={toggleFreeze} />
          <QuickAction icon="add-outline" label="Fund" onPress={() => router.push('/deposit')} />
          <QuickAction
            icon="options-outline"
            label="Rules"
            onPress={() => router.push({ pathname: '/card-rules/[id]', params: { id: selected.id } })}
          />
          <QuickAction
            icon="ellipsis-horizontal"
            label="Details"
            onPress={() => router.push({ pathname: '/card/[id]', params: { id: selected.id } })}
          />
        </View>

        <View>
          <SectionHeader title="Recent" actionLabel="View all" onAction={() => router.push('/(tabs)/activity')} />
          {cardTxns.length === 0 ? (
            <AppText variant="secondary" tone={colors.textTertiary}>
              No activity on this card yet.
            </AppText>
          ) : (
            cardTxns.map((t) => (
              <TransactionRow
                key={t.id}
                txn={t}
                member={state.members.find((m) => m.id === t.memberId)}
                showMember={false}
                onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.id } })}
              />
            ))
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 3 },
  statusRow: { flexDirection: 'row', marginBottom: 4 },
  quickRow: { flexDirection: 'row', gap: space.s },
});
