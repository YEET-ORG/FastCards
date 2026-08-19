import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { color, font } from '@/design/tokens';
import type { Card, Member } from '@/domain/types';

import { StatusBadge } from './primitives';

// Kast-inspired card materials: the card is the brand object. Owner card
// reads as black metal with a gold signature; family cards are graphite
// with the member's accent; protected/temporary cards carry a mint
// hairline. A diagonal sheen keeps the surface feeling physical.

const CARD_RATIO = 1.586;

interface Material {
  base: [string, string, ...string[]];
  sheen: string;
  label: string;
  labelColor: string;
  numberColor: string;
}

function materialFor(card: Card): Material {
  switch (card.variant) {
    case 'personal':
      return {
        base: ['#2B2B30', '#141416', '#0A0A0C'],
        sheen: 'rgba(255,255,255,0.10)',
        label: 'METAL',
        labelColor: color.gold,
        numberColor: '#D9D9DE',
      };
    case 'family':
      return {
        base: ['#202024', '#111113', '#0A0A0C'],
        sheen: 'rgba(255,255,255,0.07)',
        label: 'FAMILY',
        labelColor: color.textTertiary,
        numberColor: '#C9C9CF',
      };
    case 'subscription':
    case 'purpose':
      return {
        base: ['#1B1D1F', '#0F1011', '#090A0B'],
        sheen: 'rgba(255,255,255,0.06)',
        label: card.variant === 'subscription' ? 'RECURRING' : 'PURPOSE',
        labelColor: color.textTertiary,
        numberColor: '#C9C9CF',
      };
    case 'protected':
    case 'temporary':
      return {
        base: ['#14201B', '#0C1310', '#080B0A'],
        sheen: 'rgba(110,240,182,0.08)',
        label: card.variant === 'protected' ? 'PROTECTED' : 'TEMPORARY',
        labelColor: color.mint,
        numberColor: '#C9C9CF',
      };
  }
}

export function PaymentCardVisual({
  card,
  member,
  width,
}: {
  card: Card;
  member?: Member;
  width: number;
}) {
  const height = width / CARD_RATIO;
  const dimmed = card.status === 'frozen' || card.status === 'closed';
  const protectedEdge = card.variant === 'protected' || card.variant === 'temporary';
  const material = materialFor(card);
  const isOwnerMetal = card.variant === 'personal';

  return (
    <View
      accessibilityLabel={`${card.nickname} card, ending ${card.last4}, ${card.status}`}
      style={[
        styles.frame,
        {
          width,
          height,
          borderColor: protectedEdge
            ? color.mintBorder
            : isOwnerMetal
              ? '#3A3527'
              : color.borderStrong,
        },
      ]}>
      <LinearGradient
        colors={material.base}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.face, dimmed && { opacity: 0.5 }]}>
        {/* Diagonal sheen */}
        <LinearGradient
          colors={['transparent', material.sheen, 'transparent']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          locations={[0.32, 0.5, 0.68]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Top row: wordmark + tier/material tag */}
        <View style={styles.topRow}>
          <AppText
            variant="caption"
            tone={isOwnerMetal ? color.gold : color.textSecondary}
            style={styles.wordmark}>
            FASTCARDS
          </AppText>
          <AppText variant="caption" tone={material.labelColor} style={styles.tierTag}>
            {material.label}
          </AppText>
        </View>

        {/* Middle: chip + contactless */}
        <View style={styles.chipRow}>
          <View style={[styles.chip, isOwnerMetal && { borderColor: '#5A4F33' }]}>
            <View style={styles.chipLine} />
            <View style={[styles.chipLine, { top: 11 }]} />
            <View style={[styles.chipLine, { top: 17 }]} />
          </View>
          <Ionicons name="wifi-outline" size={16} color="rgba(255,255,255,0.35)" style={{ transform: [{ rotate: '90deg' }] }} />
        </View>

        {/* Bottom: name + masked number */}
        <View>
          {protectedEdge && card.expiryNote ? (
            <AppText variant="caption" tone={color.mint} style={{ marginBottom: 6 }}>
              {card.expiryNote}
            </AppText>
          ) : null}
          <View style={styles.bottomRow}>
            <View style={{ flexShrink: 1 }}>
              <AppText
                variant="cardTitle"
                numberOfLines={1}
                style={{ letterSpacing: 0.4, fontSize: 15 }}>
                {card.nickname}
              </AppText>
              {member && card.variant === 'family' ? (
                <AppText variant="caption" tone={color.textTertiary} style={{ marginTop: 2 }}>
                  {member.name} · {member.relationship ?? member.role}
                </AppText>
              ) : null}
            </View>
            <AppText
              tabular
              tone={material.numberColor}
              style={{ fontFamily: font.medium, fontSize: 13, letterSpacing: 2.5 }}>
              ••  {card.last4}
            </AppText>
          </View>
        </View>
      </LinearGradient>

      {card.status !== 'active' ? (
        <View style={styles.statusOverlay}>
          <StatusBadge status={card.status === 'frozen' ? 'frozen' : 'closed'} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: color.surface1,
  },
  face: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    letterSpacing: 3,
    fontFamily: font.semibold,
  },
  tierTag: {
    letterSpacing: 2,
    fontSize: 9,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chip: {
    width: 34,
    height: 25,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  chipLine: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 5,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusOverlay: {
    position: 'absolute',
    top: 14,
    right: 14,
  },
});
