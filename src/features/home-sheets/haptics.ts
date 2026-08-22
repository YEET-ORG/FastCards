import * as Haptics from 'expo-haptics';

/**
 * The sheet's three haptic firing points (TOKEN_DETAIL_SHEET_UI_UX_SPEC.md
 * §18.4): open, detent crossing, committed dismiss. All are best-effort —
 * failures are swallowed, never surfaced.
 */
export function tap() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function select() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}