// Polyfills first — Privy's crypto stack needs TextEncoder +
// getRandomValues before anything else loads.
import 'fast-text-encoding';
import 'react-native-get-random-values';

import {
  Fraunces_400Regular,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  useFonts,
} from '@expo-google-fonts/fraunces';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { PrivyProvider } from '@privy-io/expo';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Appearance, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enableFreeze } from 'react-native-screens';

import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { PRIVY_APP_ID, PRIVY_CLIENT_ID } from '@/auth/privyConfig';
import { RestoringScreen } from '@/auth/RestoringScreen';
import { SignInScreen } from '@/auth/SignInScreen';
import { ToastProvider } from '@/components/fin/Toast';
import { AiActivityNotifier } from '@/components/fin/AiActivityNotifier';
import { ThemeProvider, useTheme } from '@/design/theme';
import { palettes, type ThemeName } from '@/design/tokens';
import { CurrencyProvider } from '@/domain/currency';
import { DomainProvider } from '@/domain/store';
import {
  hasCompletedOnboarding,
  markOnboardingComplete,
} from '@/onboarding/persistence';
import { OnboardingScreen } from '@/onboarding/OnboardingScreen';
import { flushChatStorage } from '@/store/chatStore';

Appearance.setColorScheme('light');
SplashScreen.preventAutoHideAsync();
// Freeze offscreen screens so the chat shell's gesture and streaming work is
// never paid for twice (AI_CHAT_UI_UX_SPEC §2.3).
enableFreeze(true);

// Chat persistence is throttled to 1/s so streaming does not thrash
// AsyncStorage; flush here so backgrounding never drops the tail (spec §2.4).
AppState.addEventListener('change', (next) => {
  if (next === 'background' || next === 'inactive') flushChatStorage();
});

/**
 * Built once per mode instead of rebuilt inline on every render. The object
 * is handed to `NavigationThemeProvider`, so a fresh identity re-renders
 * every navigator and mounted screen — it must only change when the theme
 * actually does.
 */
const NAV_THEMES: Record<ThemeName, typeof DefaultTheme> = {
  white: buildNavTheme('white'),
  black: buildNavTheme('black'),
};

function buildNavTheme(mode: ThemeName) {
  const base = mode === 'black' ? DarkTheme : DefaultTheme;
  const c = palettes[mode];
  return {
    ...base,
    colors: {
      ...base.colors,
      background: c.bg,
      card: c.raised,
      border: c.line,
      text: c.textPrimary,
      primary: c.accent,
    },
  };
}

function Gate() {
  const { session, restoring, justSignedIn, clearJustSignedIn } = useAuth();
  const { colors } = useTheme();
  const [onboardingDone, setOnboardingDone] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    if (!session) return;
    if (onboardingDone !== null && session.userId in onboardingDone) return;
    let cancelled = false;
    // A rejection here must not leave `onboardingDone` null forever — that
    // renders RestoringScreen permanently, locking the user out of the app.
    // Treat an unreadable flag as "not onboarded" and show the flow.
    void hasCompletedOnboarding(session.userId)
      .catch(() => false)
      .then((done) => {
        if (!cancelled) {
          setOnboardingDone((prev) => ({ ...(prev ?? {}), [session.userId]: done }));
        }
      });
    return () => {
      cancelled = true;
    };
    // Re-check when the signed-in user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId, onboardingDone]);

  // Pinned to the one token it reads, so a palette swap does not hand the
  // navigator a new options identity and re-render every screen under it.
  const stackScreenOptions = useMemo(
    () => ({ headerShown: false, contentStyle: { backgroundColor: colors.bg } }),
    [colors.bg],
  );

  if (restoring) return <RestoringScreen />;
  if (!session) return <SignInScreen />;
  const done = onboardingDone?.[session.userId] ?? null;
  // A sign-in the user just performed always runs the flow, so there is
  // nothing to wait for — only a restored session consults the stored flag.
  if (!justSignedIn && done === null) return <RestoringScreen />;
  if (justSignedIn || !done) {
    return (
      <DomainProvider>
        <OnboardingScreen
          onComplete={() => {
            // Enter the app even if the flag could not be written. Repeating
            // onboarding next launch is a far better failure than a Continue
            // button that silently does nothing.
            void markOnboardingComplete(session.userId)
              .catch(() => undefined)
              .then(() => {
                // Both together: either alone would leave a render where the
                // gate still points at onboarding it has already finished.
                setOnboardingDone((prev) => ({ ...(prev ?? {}), [session.userId]: true }));
                clearJustSignedIn();
              });
          }}
        />
      </DomainProvider>
    );
  }
  return (
    <DomainProvider>
      <Stack screenOptions={stackScreenOptions}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="approvals" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="card/[id]" />
        <Stack.Screen name="card-rules/[id]" />
        <Stack.Screen name="member/[id]" />
        <Stack.Screen name="deposit" />
        <Stack.Screen name="invite-member" />
        <Stack.Screen name="move-money" />
        <Stack.Screen name="order-card" />
        <Stack.Screen name="payments" />
        <Stack.Screen name="transaction/[id]" />
      </Stack>
      <AiActivityNotifier />
    </DomainProvider>
  );
}

function ThemedApp() {
  const { mode, ready } = useTheme();
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded && ready) SplashScreen.hideAsync();
  }, [fontsLoaded, ready]);

  // `colors` is `palettes[mode]`, a stable object per mode, so this only
  // rebuilds on an actual theme change — not on every font/ready re-render.
  const navTheme = NAV_THEMES[mode];

  if (!fontsLoaded || !ready) return null;

  return (
    <NavigationThemeProvider value={navTheme}>
      <PrivyProvider appId={PRIVY_APP_ID} {...(PRIVY_CLIENT_ID ? { clientId: PRIVY_CLIENT_ID } : {})}>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style={mode === 'black' ? 'light' : 'dark'} />
            <Gate />
          </ToastProvider>
        </AuthProvider>
      </PrivyProvider>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <ThemeProvider>
        {/* Above ThemedApp, so onboarding — which mounts its own DomainProvider
            — shares one currency rather than getting a second, divergent copy. */}
        <CurrencyProvider>
          <ThemedApp />
        </CurrencyProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
