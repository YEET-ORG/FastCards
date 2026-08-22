import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApprovalCard } from '@/components/fin/ApprovalCard';
import { ApprovalFlow } from '@/components/fin/ApprovalFlow';
import { Screen, ScreenHeader } from '@/components/fin/Screen';
import { Segments } from '@/components/fin/Segments';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';
import { memberRemaining, useDomain } from '@/domain/store';

// Approval Center (spec §29, UI §21): pending requests with Approve
// once / Decline / Change rule kept strictly separate.

type Filter = 'pending' | 'completed';

export default function ApprovalCenter() {
  const { state } = useDomain();
  const colors = useColors();
  const [filter, setFilter] = useState<Filter>('pending');

  const pending = useMemo(() => state.approvals.filter((a) => a.status === 'pending'), [state.approvals]);
  const completed = useMemo(() => state.approvals.filter((a) => a.status !== 'pending'), [state.approvals]);
  const shown = filter === 'pending' ? pending : completed;

  // Stable identities so the memoized SegmentedControl skips re-renders.
  const segmentLabels = useMemo(
    () => [pending.length > 0 ? `Pending (${pending.length})` : 'Pending', 'Completed'],
    [pending.length],
  );
  const onSegmentChange = useCallback(
    (i: number) => setFilter(i === 0 ? 'pending' : 'completed'),
    [],
  );

  // Memoized rows so the memoized ApprovalCard/ApprovalFlow only re-render
  // when their own approval or member actually changes.
  const rows = useMemo(
    () =>
      shown.map((a) => ({
        key: a.id,
        approval: a,
        requester: state.members.find((m) => m.id === a.requesterId),
        remainingBudget: memberRemaining(state, a.requesterId),
      })),
    [shown, state],
  );

  return (
    <Screen>
      <ScreenHeader title="Approvals" back />

      {/* The pending count rides on the segment it describes, now that the
          header carries no subtitle. */}
      <Segments
        dense
        labels={segmentLabels}
        index={filter === 'pending' ? 0 : 1}
        onChange={onSegmentChange}
      />

      {shown.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="body" tone={colors.textSecondary}>
            {filter === 'pending' ? "You're all caught up." : 'No completed approvals yet.'}
          </AppText>
        </View>
      ) : (
        <View style={{ gap: space.l }}>
          {rows.map((row) =>
            row.approval.status === 'pending' ? (
              <ApprovalFlow key={row.key} approvalId={row.approval.id} />
            ) : (
              <ApprovalCard
                key={row.key}
                approval={row.approval}
                requester={row.requester}
                remainingBudget={row.remainingBudget}
              />
            ),
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: space.x40,
    alignItems: 'center',
  },
});
