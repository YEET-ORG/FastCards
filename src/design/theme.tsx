import * as SecureStore from 'expo-secure-store';
import * as SystemUI from 'expo-system-ui';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, AccessibilityInfo } from 'react-native';

import { palettes, type ColorTokens, type ThemeName } from './tokens';

const STORE_KEY = 'fastcards.appearance.mode';

type ThemeContextValue = {
  mode: ThemeName;
  colors: ColorTokens;
  setMode: (mode: ThemeName) => void;
  toggleMode: () => void;
  reduceMotion: boolean;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyNativeChrome(mode: ThemeName, colors: ColorTokens) {
  Appearance.setColorScheme(mode === 'night' ? 'dark' : 'light');
  void SystemUI.setBackgroundColorAsync(colors.bg);
}

export function ThemeProvider({ children }: React.PropsWithChildren): React.JSX.Element {
  const [mode, setModeState] = useState<ThemeName>('sunlit');
  const [ready, setReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORE_KEY);
        const next: ThemeName = stored === 'night' ? 'night' : 'sunlit';
        if (!cancelled) {
          setModeState(next);
          applyNativeChrome(next, palettes[next]);
          console.log(`[theme] hydrated mode=${next}`);
        }
      } catch {
        if (!cancelled) applyNativeChrome('sunlit', palettes.sunlit);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      setReduceMotion(v);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const setMode = useCallback((next: ThemeName) => {
    setModeState(next);
    applyNativeChrome(next, palettes[next]);
    void SecureStore.setItemAsync(STORE_KEY, next).catch(() => undefined);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeName = prev === 'night' ? 'sunlit' : 'night';
      applyNativeChrome(next, palettes[next]);
      void SecureStore.setItemAsync(STORE_KEY, next).catch(() => undefined);
      return next;
    });
  }, []);

  const colors = palettes[mode];

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, colors, setMode, toggleMode, reduceMotion, ready }),
    [mode, colors, setMode, toggleMode, reduceMotion, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

export function useColors(): ColorTokens {
  return useTheme().colors;
}
