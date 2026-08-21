import { useRouter } from 'expo-router';
import { useState } from 'react';

import { formatMoneyINR } from '@/domain/money';
import { memberRemaining, useDomain } from '@/domain/store';

import { ApprovalCard } from './ApprovalCard';
import { ConfirmSheet } from './ConfirmSheet';
import { useToast } from './Toast';

// Wires an ApprovalCard to the trusted confirm surface and the domain
// store. Used from both the Approval Center and the Ask thread so the AI
// path and the manual path execute through the same domain action
// (spec §82 rule 14).

export function ApprovalFlow({ approvalId }: { approvalId: string }) {
  const { state, dispatch } = useDomain();
  const toast = useToast();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  const approval = state.approvals.find((a) => a.id === approvalId);
  if (!approval) return null;
  const requester = state.members.find((m) => m.id === approval.requesterId);
  const remaining = memberRemaining(state, approval.requesterId);

  return (
    <>
      <ApprovalCard
        approval={approval}
        requester={requester}
        remainingBudget={remaining}
        onApprove={() => setConfirming(true)}
        onDecline={() => {
          dispatch({ type: 'decline_approval', approvalId: approval.id });
          toast(`Declined ${requester?.name ?? 'member'}'s ${approval.merchant} request.`);
        }}
        onChangeRule={() => router.push({ pathname: '/card-rules/[id]', params: { id: approval.cardId } })}
      />
      <ConfirmSheet
        visible={confirming}
        title="Approve once"
        subject={`${requester?.name ?? 'Member'} · ${approval.merchant}`}
        facts={[
          { label: 'Amount', value: formatMoneyINR(approval.amount), emphasis: true },
          { label: 'Merchant', value: approval.merchant },
          { label: 'Category', value: approval.category },
          {
            label: 'After this purchase',
            value:
              remaining !== undefined
                ? `${formatMoneyINR(Math.max(remaining - approval.amount, 0))} left this month`
                : '—',
          },
        ]}
        note={`One-time approval. ${requester?.name ?? 'The member'}'s rules stay unchanged.`}
        cta={`Approve ${formatMoneyINR(approval.amount)} once`}
        onConfirm={() => {
          dispatch({ type: 'approve_once', approvalId: approval.id });
          toast(`Approved ${approval.merchant} ${formatMoneyINR(approval.amount)} once.`);
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
