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
import { useEffect } from 'react';
import { Appearance, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { PRIVY_APP_ID, PRIVY_CLIENT_ID } from '@/auth/privyConfig';
import { RestoringScreen } from '@/auth/RestoringScreen';
import { SignInScreen } from '@/auth/SignInScreen';
import { ToastProvider } from '@/components/fin/Toast';
import { ThemeProvider, useTheme } from '@/design/theme';
import { DomainProvider } from '@/domain/store';

Appearance.setColorScheme('light');
SplashScreen.preventAutoHideAsync();

function Gate() {
  const { session, restoring } = useAuth();
  const { colors } = useTheme();
  if (restoring) return <RestoringScreen />;
  if (!session) return <SignInScreen />;
  return (
    <DomainProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}>
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
        <Stack.Screen name="transaction/[id]" />
      </Stack>
    </DomainProvider>
  );
}

function ThemedApp() {
  const { mode, colors, ready } = useTheme();
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

  if (!fontsLoaded || !ready) return null;

  const navTheme = {
    ...(mode === 'night' ? DarkTheme : DefaultTheme),
    colors: {
      ...(mode === 'night' ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.bg,
      card: colors.raised,
      border: colors.line,
      text: colors.textPrimary,
      primary: colors.accent,
    },
  };

  return (
    <NavigationThemeProvider value={navTheme}>
      <PrivyProvider appId={PRIVY_APP_ID} {...(PRIVY_CLIENT_ID ? { clientId: PRIVY_CLIENT_ID } : {})}>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style={mode === 'night' ? 'light' : 'dark'} />
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
        <ThemedApp />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
