import { Ionicons } from '@expo/vector-icons';
import { Canvas, ColorMatrix, Image as SkiaImage, useImage } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { artIdForCard, CARD_ART } from '@/design/cardArt';
import { useColors } from '@/design/theme';
import { font } from '@/design/tokens';
import type { Card, Member } from '@/domain/types';

export const CARD_RATIO = 1.586;

const FROZEN_MATRIX = [
  0.2126 * 0.92, 0.7152 * 0.92, 0.0722 * 0.92, 0, 0,
  0.2126 * 0.92, 0.7152 * 0.92, 0.0722 * 0.92, 0, 0,
  0.2126 * 0.92, 0.7152 * 0.92, 0.0722 * 0.92, 0, 0,
  0, 0, 0, 1, 0,
];

function SkiaFrozenFace({ artId, width, height, cream }: { artId: keyof typeof CARD_ART; width: number; height: number; cream: string }) {
  const skiaImage = useImage(CARD_ART[artId]);
  if (!skiaImage) {
    return <View style={{ width, height, backgroundColor: cream }} />;
  }
  return (
    <Canvas style={{ width, height }}>
      <SkiaImage image={skiaImage} x={0} y={0} width={width} height={height} fit="cover">
        <ColorMatrix matrix={FROZEN_MATRIX} />
      </SkiaImage>
    </Canvas>
  );
}

export function PaymentCardVisual({
  card,
  member: _member,
  width,
}: {
  card: Card;
  member?: Member;
  width: number;
}) {
  const colors = useColors();
  const height = width / CARD_RATIO;
  const frozenOrClosed = card.status === 'frozen' || card.status === 'closed';
  const artId = artIdForCard(card);
  const issuerLabel = undefined as string | undefined;

  return (
    <View
      accessibilityLabel={`${card.nickname} card, ending ${card.last4}, ${card.status}`}
      style={[styles.frame, { width, height, backgroundColor: colors.cream }]}>
      {frozenOrClosed ? (
        <SkiaFrozenFace artId={artId} width={width} height={height} cream={colors.cream} />
      ) : (
        <Image source={CARD_ART[artId]} style={{ width, height }} contentFit="cover" />
      )}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <AppText
          style={{
            color: colors.onCard,
            fontFamily: font.displaySemibold,
            fontSize: 18,
            lineHeight: 22,
            paddingTop: 14,
            paddingHorizontal: 16,
            textShadowColor: 'rgba(28,22,18,0.45)',
            textShadowRadius: 6,
            textShadowOffset: { width: 0, height: 1 },
          }}>
          {card.nickname}
        </AppText>
        <View style={styles.chipRow}>
          <View style={[styles.chip, { backgroundColor: colors.chipGold, borderColor: colors.chipGoldStroke }]}>
            <View style={[styles.chipLine, { backgroundColor: colors.chipGoldStroke }]} />
            <View style={[styles.chipLine, { top: 11, backgroundColor: colors.chipGoldStroke }]} />
            <View style={[styles.chipLine, { top: 17, backgroundColor: colors.chipGoldStroke }]} />
          </View>
          <Ionicons
            name="wifi-outline"
            size={16}
            color={colors.onCard}
            style={{ opacity: 0.85, transform: [{ rotate: '90deg' }] }}
          />
        </View>
        <LinearGradient colors={['transparent', colors.scrim]} style={styles.bottomScrim}>
          {card.expiryNote ? (
            <AppText variant="caption" tone={colors.onCard} style={{ marginBottom: 4 }}>
              {card.expiryNote}
            </AppText>
          ) : null}
          <View style={styles.bottomRow}>
            <AppText
              tabular
              tone={colors.onCard}
              style={{ fontFamily: font.medium, fontSize: 13, letterSpacing: 2.5 }}>
              ••  {card.last4}
            </AppText>
            {issuerLabel ? (
              <AppText variant="caption" tone={colors.onCard}>
                {issuerLabel}
              </AppText>
            ) : null}
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  chipRow: {
    position: 'absolute',
    top: '22%',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chip: {
    width: 34,
    height: 25,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  chipLine: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 5,
    height: 1,
  },
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 28,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
});
