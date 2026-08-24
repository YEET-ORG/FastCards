// Onboarding completion flag, keyed per user id so a second user on the
// same device gets their own first-run thread (same pattern as
// `kami.appearance.mode` in design/theme.tsx).

import * as SecureStore from 'expo-secure-store';

const KEY_PREFIX = 'kami.onboarding.done.v1.';

function onboardingKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  const value = await SecureStore.getItemAsync(onboardingKey(userId));
  return value === '1';
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  await SecureStore.setItemAsync(onboardingKey(userId), '1');
}