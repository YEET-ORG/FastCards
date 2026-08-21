import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Canvas, ColorMatrix, Image as SkiaImage, useImage } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { AppText } from '@/design/AppText';
import { artIdForCard, CARD_ART } from '@/design/cardArt';
import { useColors } from '@/design/theme';
import { font } from '@/design/tokens';
import type { Card, Member } from '@/domain/types';

export const CARD_RATIO = 1.586;

/** The EMV contact plate. Shared with the balance hero so both card
 * surfaces carry the same physical detail. */
export function CardChip({ small = false }: { small?: boolean }) {
  const colors = useColors();
  const lineTops = small ? [4, 9, 14] : [5, 11, 17];
  return (
    <View
      style={[
        small ? styles.chipSmall : styles.chip,
        { backgroundColor: colors.chipGold, borderColor: colors.chipGoldStroke },
      ]}>
      {lineTops.map((top) => (
        <View
          key={top}
          style={[styles.chipLine, { top, backgroundColor: colors.chipGoldStroke }]}
        />
      ))}
    </View>
  );
}

/**
 * The contactless-payment arcs. A real glyph rather than a WiFi icon turned on
 * its side, so the arc weights and spacing are the ones the symbol actually
 * specifies. Shared with the balance hero.
 */
export function ContactlessMark({ size = 20, color, style }: { size?: number; color: string; style?: StyleProp<TextStyle> }) {
  // MaterialCommunityIcons' variant is the bare arcs. MaterialIcons'
  // `contactless` is the filled style and paints a solid disc, which reads as
  // a white blob on the card face.
  return (
    <MaterialCommunityIcons
      name="contactless-payment"
      size={size}
      color={color}
      style={[styles.contactless, style]}
    />
  );
}

/** The card's nickname, set the way it is set on the physical face. Shared so
 * the hero and the carousel can never drift apart. */
export const cardNicknameStyle = {
  fontFamily: font.displaySemibold,
  fontSize: 18,
  lineHeight: 22,
  textShadowColor: 'rgba(28,22,18,0.45)',
  textShadowRadius: 6,
  textShadowOffset: { width: 0, height: 1 },
} as const;

/** The `••  1234` credential line. */
export const cardLast4Style = {
  fontFamily: font.medium,
  fontSize: 13,
  letterSpacing: 2.5,
} as const;

/** Inset the card face uses for all of its overlay content. */
export const CARD_PAD = 16;
/** Corner radius of a card face. */
export const CARD_RADIUS = 20;

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

/**
 * The card's printed face — artwork only, no overlay content. Desaturates
 * itself when the card is frozen or closed. Both the carousel card and the
 * balance hero paint this, so the two always show the same physical object.
 *
 * Callers are responsible for clipping: this fills its parent, and the parent
 * that rounds the corners must NOT be the one carrying the drop shadow
 * (`overflow: hidden` on a shadowed view drops the shadow on Android).
 */
export function CardFace({ card, width, height }: { card: Card; width: number; height: number }) {
  const colors = useColors();
  const artId = artIdForCard(card);
  const frozenOrClosed = card.status === 'frozen' || card.status === 'closed';

  if (frozenOrClosed) {
    return <SkiaFrozenFace artId={artId} width={width} height={height} cream={colors.cream} />;
  }
  return <Image source={CARD_ART[artId]} style={{ width, height }} contentFit="cover" />;
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
  const issuerLabel = undefined as string | undefined;

  return (
    <View
      accessibilityLabel={`${card.nickname} card, ending ${card.last4}, ${card.status}`}
      style={[styles.frame, { width, height, backgroundColor: colors.cream }]}>
      <CardFace card={card} width={width} height={height} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <AppText
          style={{
            ...cardNicknameStyle,
            color: colors.onCard,
            paddingTop: 14,
            paddingHorizontal: CARD_PAD,
          }}>
          {card.nickname}
        </AppText>
        <View style={styles.chipRow}>
          <CardChip />
          <ContactlessMark color={colors.onCard} />
        </View>
        <LinearGradient colors={['transparent', colors.scrim]} style={styles.bottomScrim}>
          {card.expiryNote ? (
            <AppText variant="caption" tone={colors.onCard} style={{ marginBottom: 4 }}>
              {card.expiryNote}
            </AppText>
          ) : null}
          <View style={styles.bottomRow}>
            <AppText tabular tone={colors.onCard} style={cardLast4Style}>
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
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  contactless: {
    opacity: 0.9,
  },
  chipRow: {
    position: 'absolute',
    top: '22%',
    left: CARD_PAD,
    right: CARD_PAD,
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
  chipSmall: {
    width: 28,
    height: 21,
    borderRadius: 5,
    borderWidth: 1,
    overflow: 'hidden',
  },
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: CARD_PAD,
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
