import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { PaymentCardVisual } from '@/components/fin/PaymentCardVisual';
import { ProgressBar, QuickAction, SectionHeader } from '@/components/fin/primitives';
import { RollingMoney } from '@/components/fin/RollingMoney';
import { HeaderIconButton, Screen, ScreenHeader } from '@/components/fin/Screen';
import { useToast } from '@/components/fin/Toast';
import { TransactionRow } from '@/components/fin/TransactionRow';
import { AppText } from '@/design/AppText';
import { color, screenPad, space } from '@/design/tokens';
import { formatMoney } from '@/domain/money';
import { useDomain } from '@/domain/store';
import type { Card, Member } from '@/domain/types';
import { AnimatedMeshGradient } from '@/shared/ui/organisms/mesh-gradient';

// Cards Hub — the Kast-style hero: a subtle animated mesh behind a
// scaling card carousel, rolling remaining balance beneath, circular
// quick actions, then the selected card's activity.

function CarouselCard({
  card,
  member,
  index,
  scrollX,
  cardWidth,
  gap,
}: {
  card: Card;
  member?: Member;
  index: number;
  scrollX: SharedValue<number>;
  cardWidth: number;
  gap: number;
}) {
  const stride = cardWidth + gap;
  const animatedStyle = useAnimatedStyle(() => {
    const pos = index * stride;
    return {
      transform: [
        {
          scale: interpolate(
            scrollX.value,
            [pos - stride, pos, pos + stride],
            [0.9, 1, 0.9],
            Extrapolation.CLAMP,
          ),
        },
      ],
      opacity: interpolate(
        scrollX.value,
        [pos - stride, pos, pos + stride],
        [0.5, 1, 0.5],
        Extrapolation.CLAMP,
      ),
    };
  });
  return (
    <Animated.View style={animatedStyle}>
      <PaymentCardVisual card={card} member={member} width={cardWidth} />
    </Animated.View>
  );
}

export default function CardsHub() {
  const { state, dispatch } = useDomain();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scrollX = useSharedValue(0);

  const cardWidth = Math.round(width * 0.78);
  const gap = space.m;
  const sidePad = (width - cardWidth) / 2;

  const cards = state.cards;
  const selected = cards[Math.min(selectedIndex, cards.length - 1)];
  const member = selected.memberId
    ? state.members.find((m) => m.id === selected.memberId)
    : undefined;

  const effectiveCap =
    selected.monthlyCap !== undefined
      ? selected.monthlyCap + (member?.tempAllowance?.amount ?? 0)
      : undefined;
  const remaining = effectiveCap !== undefined ? effectiveCap - selected.spentThisMonth : undefined;
  const cardTxns = state.transactions.filter((t) => t.cardId === selected.id).slice(0, 4);

  const frozen = selected.status === 'frozen';
  const closed = selected.status === 'closed';

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  const toggleFreeze = () => {
    if (closed) {
      Alert.alert('Card closed', `${selected.nickname} closed automatically after use and can't be reactivated.`);
      return;
    }
    dispatch({ type: frozen ? 'unfreeze_card' : 'freeze_card', cardId: selected.id });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast(`${selected.nickname} is ${frozen ? 'active again' : 'frozen'}.`);
  };

  return (
    <Screen scroll style={{ paddingHorizontal: 0 }}>
      {/* Ambient mesh behind the hero */}
      <View style={styles.meshWrap} pointerEvents="none">
        <AnimatedMeshGradient
          width={width}
          height={320}
          animated
          speed={0.12}
          noise={0.06}
          blur={0.55}
          performance={{ undersampling: 0.4, fpsLock: 30 }}
          colors={[
            { r: 0.02, g: 0.02, b: 0.025 },
            { r: 0.045, g: 0.085, b: 0.065 },
            { r: 0.075, g: 0.065, b: 0.038 },
            { r: 0.028, g: 0.028, b: 0.04 },
          ]}
          style={{ width, height: 320 }}
        />
        <LinearGradient
          colors={['rgba(5,5,6,0)', color.bg]}
          style={styles.meshFade}
        />
      </View>

      <View style={{ paddingHorizontal: screenPad }}>
        <ScreenHeader
          title="Cards"
          right={
            <HeaderIconButton
              icon="add"
              label="Create card"
              onPress={() => router.push('/order-card')}
            />
          }
        />
      </View>

      {/* Card carousel */}
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
          />
        )}
      />

      <View style={{ paddingHorizontal: screenPad, gap: space.xl }}>
        {/* Selected card summary */}
        <View style={styles.summary}>
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
            fontSize={34}
          />
          {effectiveCap !== undefined && !closed ? (
            <>
              <AppText variant="secondary" tone={color.textTertiary}>
                of {formatMoney(effectiveCap)} monthly limit
                {member?.tempAllowance ? ` (includes +${formatMoney(member.tempAllowance.amount)} temporary)` : ''}
              </AppText>
              <ProgressBar value={selected.spentThisMonth / effectiveCap} style={{ marginTop: space.s }} />
            </>
          ) : closed && selected.maxAuthorization ? (
            <AppText variant="secondary" tone={color.textTertiary}>
              Protected checkout · max authorization was {formatMoney(selected.maxAuthorization)}
            </AppText>
          ) : (
            <AppText variant="secondary" tone={color.textTertiary}>
              No monthly limit on this card
            </AppText>
          )}
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <QuickAction
            icon={frozen ? 'sunny-outline' : 'snow-outline'}
            label={frozen ? 'Unfreeze' : 'Freeze'}
            onPress={toggleFreeze}
          />
          <QuickAction
            icon="add-outline"
            label="Fund"
            onPress={() => router.push('/deposit')}
          />
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

        {/* Recent activity for the selected card */}
        <View>
          <SectionHeader
            title="Recent"
            actionLabel="View all"
            onAction={() => router.push('/(tabs)/activity')}
          />
          {cardTxns.length === 0 ? (
            <AppText variant="secondary" tone={color.textTertiary}>
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
  meshWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
    opacity: 0.6,
  },
  meshFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
  },
  summary: {
    gap: 3,
  },
  quickRow: {
    flexDirection: 'row',
    gap: space.s,
  },
});
