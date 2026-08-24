import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

import { AiInsightPill } from '@/components/fin/AiInsightPill';
import { useColors } from '@/design/theme';
import { radius } from '@/design/tokens';
import { useMoney } from '@/domain/currency';
import { memberRemaining, pendingApprovals, useDomain } from '@/domain/store';
import { HOME_HEADER_HEIGHT } from '@/features/home/ChatFirstShell';
import { Toast } from '@/shared/ui/molecules/Toast';

/**
 * Hosts the AI notification pill. Mounted inside the domain provider; watches
 * `newActivity` (emitted by the store's cursor-based activity diff) and
 * presents it as a temporary top toast. Each event is shown at most once per
 * session (id guard) and the persisted cursor prevents repeats across
 * remounts and app restarts.
 */
export function AiActivityNotifier() {
  const router = useRouter();
  const colors = useColors();
  const { formatMoney } = useMoney();
  const { state, newActivity, clearNewActivity } = useDomain();
  const lastShownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!newActivity) return;
    if (lastShownRef.current === newActivity.id) return;
    lastShownRef.current = newActivity.id;
    clearNewActivity();

    const { kind, title, subtitle } = newActivity;
    const pending = pendingApprovals(state);

    let icon: keyof typeof Ionicons.glyphMap = 'sparkles-outline';
    let statement = title;
    let pillSubtitle = subtitle;
    let actions: { label: string; onPress: () => void }[] | undefined;

    if (kind === 'approval_event' && pending.length > 0) {
      icon = 'hand-left-outline';
      const requester = state.members.find((m) => m.id === pending[0].requesterId);
      const remaining = memberRemaining(state, pending[0].requesterId);
      statement = `${requester?.name ?? 'A member'} has ${formatMoney(remaining ?? 0)} left this month. One purchase needs approval.`;
      pillSubtitle = undefined;
      actions = [
        { label: 'Review approval', onPress: () => router.push('/approvals') },
        { label: 'View family', onPress: () => router.push('/(tabs)/family') },
      ];
    } else if (kind === 'ai_action') {
      icon = 'sparkles-outline';
    }

    const pill = (
      <AiInsightPill
        icon={icon}
        title={statement}
        subtitle={pillSubtitle}
        amount={kind === 'ai_action' && newActivity.amount !== undefined ? formatMoney(newActivity.amount) : undefined}
      />
    );

    AccessibilityInfo.announceForAccessibility(statement);
    Toast.show(pill, {
      position: 'top',
      duration: 1800,
      // The viewport pads by `insets.top + 10`, so this lands the pill just
      // below the shell header (which spans `insets.top + HOME_HEADER_HEIGHT`).
      topOffset: HOME_HEADER_HEIGHT - 2,
      dismissible: true,
      backgroundColor: colors.raised,
      actions,
      style: { borderRadius: radius.card },
    });
  }, [newActivity, clearNewActivity, state, router, colors.raised, formatMoney]);

  return null;
}