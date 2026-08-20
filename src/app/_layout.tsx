// Polyfills first — Privy's crypto stack needs TextEncoder +
// getRandomValues before anything else loads.
import 'fast-text-encoding';
import 'react-native-get-random-values';

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { PrivyProvider } from '@privy-io/expo';
import { DarkTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { PRIVY_APP_ID, PRIVY_CLIENT_ID } from '@/auth/privyConfig';
import { SignInScreen } from '@/auth/SignInScreen';
import { ToastProvider } from '@/components/fin/Toast';
import { color } from '@/design/tokens';
import { DomainProvider } from '@/domain/store';

SplashScreen.preventAutoHideAsync();

const obsidianTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: color.bg,
    card: color.raised,
    border: color.borderSoft,
    text: color.textPrimary,
    primary: color.mint,
  },
};

function Gate() {
  const { session } = useAuth();
  if (!session) return <SignInScreen />;
  return (
    <DomainProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bg },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="approvals" />
        <Stack.Screen name="admin" />
      </Stack>
    </DomainProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <ThemeProvider value={obsidianTheme}>
        <PrivyProvider appId={PRIVY_APP_ID} clientId={PRIVY_CLIENT_ID}>
          <AuthProvider>
            <ToastProvider>
              <StatusBar style="light" />
              <Gate />
            </ToastProvider>
          </AuthProvider>
        </PrivyProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
