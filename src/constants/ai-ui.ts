import { Platform } from 'react-native';
import type { EntryExitAnimationFunction } from 'react-native-reanimated';
import { Easing, withTiming } from 'react-native-reanimated';

import { font } from '@/design/tokens';

/**
 * AI chat UI/UX porting contract (AI_CHAT_UI_UX_SPEC §4). Every value here was
 * read out of the source of the reference app. Where a value looks arbitrary,
 * it usually isn't: several were tuned to fix specific shipped bugs.
 */

/** The drawer's entire physics. §4.1 */
export const AiChatDrawer = {
  /** Panel width as a fraction of screen width. */
  widthRatio: 0.78,
  /** Upper bound. Phones never reach it (0.78 × 430 = 335); this only stops the
      panel becoming a half-screen slab on tablets and in landscape. */
  maxWidth: 400,

  gesture: {
    /** Horizontal distance that activates the drag (px). This gesture spans the
        whole shell, so it must stay loose enough not to steal horizontal drags
        from scrollable chat content. */
    activationDistance: 24,
    /** Horizontal distance that counts as directional intent (px). */
    directionDistanceThreshold: 12,
    /** Horizontal velocity that counts as directional intent (px/s). */
    velocityThreshold: 160,
    /** Velocity weighting when projecting drag direction. */
    velocityInfluence: 0.05,
    /** Fraction of panel width that snaps open/closed with no directional intent. */
    positionThreshold: 0.18,
    /** Vertical movement that fails the pan, protecting list scroll (px). */
    verticalTolerance: 20,
    /** Upper bound on the gesture velocity handed to the settle spring (px/s). */
    maxSettleVelocity: 8000,
  },

  spring: { damping: 26, mass: 0.8, stiffness: 220, overshootClamping: true },

  /** Screen-corner fallbacks — no native module, resolved once per open. */
  cornerRadius: { ios: 55, android: 32, web: 28 },

  shadow: '-8px 0 40px rgba(0, 0, 0, 0.14)',

  surfaceEdge: {
    light: { color: 'transparent', width: 0, shadow: '-8px 0 40px rgba(0, 0, 0, 0.14)' },
    dark: { color: 'rgba(255, 255, 255, 0.14)', width: 1, shadow: '-8px 0 40px rgba(0, 0, 0, 0.6)' },
  },

  /** Menu content reveal as the surface slides. */
  reveal: {
    fadeStartProgress: 0.08,
    fadeEndProgress: 0.5,
    startScale: 0.975,
    startVerticalOffset: 8,
  },
} as const;

/** Drawer chrome metrics. §4.2 */
export const AiDrawer = {
  contentPaddingH: 20,
  headerPaddingH: 8,
  headerPaddingV: 16,
  sectionGap: 4,
  brandIconSize: 18,
  brandTitleSize: 20,
  sectionLabelSize: 13,
  sectionLabelMarginBottom: 2,
  emptyTextSize: 15,
  rowTitleSize: 15,
  rowPaddingV: 10,
  settingsIconSize: 20,
  settingsTextSize: 15,
  settingsGap: 10,
  footerPaddingV: 16,
  footerPaddingBottomMin: 20,
  activeRowRadius: 12,
  deleteHitSlop: 12,
  backdropOpacity: 0.72,
  searchBarRadius: 12,
  searchBarPaddingH: 12,
  searchBarPaddingV: 8,
  searchInputSize: 14,
  newChatButtonSize: 36,
  rowDateSize: 11,
  renameInputSize: 15,
  /** Wordmark in the drawer header. */
  titleSize: 26,
  titleLineHeight: 32,
  /** New-chat pill: black on light, white on dark (theme.textPrimary). */
  newChatPillHeight: 46,
  newChatPillRadius: 23,
  newChatPillPaddingH: 18,
  newChatPillGap: 8,
  newChatPillTextSize: 16,
  newChatPillIconSize: 18,
  accountAvatarSize: 40,
  /** Long-press context menu card. */
  contextMenuRadius: 16,
  contextMenuWidth: 244,
  contextMenuRowHeight: 50,
  contextMenuPaddingH: 16,
  contextMenuTextSize: 16,
  contextMenuIconSize: 19,
  contextMenuAnchorGap: 10,
  contextMenuScreenMargin: 12,
} as const;

/** Layout spacing. §4.3 */
export const AiSpacing = {
  headerToContent: 20,
  messageGap: 14,
  conversationPaddingH: 20,
  listPaddingTop: 16,
  listPaddingBottom: 120,
  emptyStatePadding: 48,
  heroBottomWithSurface: 160,
  sectionGap: 32,
  settingsGroupGap: 24,
  heroTop: 120,
  modelsHeroTop: 8,
  modelCardGap: 16,
} as const;

/** Motion timings. §4.3 */
export const AiMotion = {
  pressFeedbackMs: 100,
  transitionMs: 220,
  sheetMs: 280,
  translateY: 8,
  disabledOpacity: 0.45,
  pulseMs: 900,
  cursorBlinkMs: 520,
  composerIconMs: 160,
} as const;

/** Shell header metrics. §4.3 */
export const AiHeader = {
  minHeight: 48,
  menuButtonSize: 40,
  menuIconSize: 24,
  pillMinHeight: 36,
  pillPaddingH: 10,
  pillPaddingV: 6,
  pillGap: 8,
  pillChevronSize: 14,
  pillLabelSize: 14,
  actionButtonSize: 40,
} as const;

/** Font faces the chat uses (Kami: Plus Jakarta Sans + platform mono). */
export const ChatFonts = {
  regular: font.regular,
  medium: font.medium,
  semiBold: font.semibold,
  bold: font.bold,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

export const IconSize = { xs: 12, sm: 16, md: 20, lg: 24, xl: 28 } as const;

/**
 * Calm entrance for new chat messages — subtle upward glide + fade, no bounce.
 * §4.4
 */
export const aiMessageEnter = (): EntryExitAnimationFunction => {
  return () => {
    'worklet';
    const duration = 240;
    const easing = Easing.out(Easing.cubic);
    return {
      initialValues: { opacity: 0, transform: [{ translateY: 6 }] },
      animations: {
        opacity: withTiming(1, { duration, easing }),
        transform: [{ translateY: withTiming(0, { duration, easing }) }],
      },
    };
  };
};