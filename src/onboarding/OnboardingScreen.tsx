// The onboarding screen rendered by the Gate between sign-in and the
// main stack. Sits inside DomainProvider so the ready card shows live
// household data, and the budget step writes through the app's
// PREPARE→EXECUTE gateway (domain/store.tsx).

import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthContext';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';
import { useDomain } from '@/domain/store';

import { OnboardingFlow } from './OnboardingFlow';

type Props = {
  readonly onComplete: () => void;
};

export function OnboardingScreen({ onComplete }: Props) {
  const { session } = useAuth();
  const { state, dispatchOrThrow } = useDomain();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const owner = state.members.find((m) => m.role === 'owner') ?? state.members[0];

  // Throwing variant on purpose: the flow prints "Your monthly budget is
  // set." on resolve, so a failed write must reject and roll the step back
  // rather than resolve quietly into a false confirmation.
  const handleSetBudget = async (amount: number) => {
    if (!owner) throw new Error('No household owner found');
    await dispatchOrThrow({ type: 'set_monthly_limit', memberId: owner.id, amount });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + space.s }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <OnboardingFlow
          householdName={state.household.name}
          membersCount={state.members.length}
          onComplete={onComplete}
          onSetBudget={handleSetBudget}
          totalAvailable={state.balances.personal + state.balances.family}
          userName={session?.name ?? ''}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});