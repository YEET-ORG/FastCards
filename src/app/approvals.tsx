import { useState } from 'react';
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

  const pending = state.approvals.filter((a) => a.status === 'pending');
  const completed = state.approvals.filter((a) => a.status !== 'pending');
  const shown = filter === 'pending' ? pending : completed;

  return (
    <Screen>
      <ScreenHeader title="Approvals" back />

      {/* The pending count rides on the segment it describes, now that the
          header carries no subtitle. */}
      <Segments
        labels={[pending.length > 0 ? `Pending (${pending.length})` : 'Pending', 'Completed']}
        index={filter === 'pending' ? 0 : 1}
        onChange={(i) => setFilter(i === 0 ? 'pending' : 'completed')}
      />

      {shown.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="body" tone={colors.textSecondary}>
            {filter === 'pending' ? "You're all caught up." : 'No completed approvals yet.'}
          </AppText>
        </View>
      ) : (
        <View style={{ gap: space.l }}>
          {shown.map((a) =>
            a.status === 'pending' ? (
              <ApprovalFlow key={a.id} approvalId={a.id} />
            ) : (
              <ApprovalCard
                key={a.id}
                approval={a}
                requester={state.members.find((m) => m.id === a.requesterId)}
                remainingBudget={memberRemaining(state, a.requesterId)}
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
