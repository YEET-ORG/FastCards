import * as SecureStore from 'expo-secure-store';
import * as SystemUI from 'expo-system-ui';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Appearance, AccessibilityInfo } from 'react-native';

import { depth, palettes, type ColorTokens, type DepthLevel, type ThemeName } from './tokens';

const STORE_KEY = 'fastcards.appearance.mode';

/** The mode a fresh install boots into. */
const DEFAULT_MODE: ThemeName = 'white';

function isThemeName(value: string | null): value is ThemeName {
  return value !== null && value in palettes;
}

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
  Appearance.setColorScheme(mode === 'black' ? 'dark' : 'light');
  void SystemUI.setBackgroundColorAsync(colors.bg);
}

export function ThemeProvider({ children }: React.PropsWithChildren): React.JSX.Element {
  const [mode, setModeState] = useState<ThemeName>(DEFAULT_MODE);
  const [ready, setReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  /** Read inside callbacks that must not re-create themselves per mode. */
  const modeRef = useRef<ThemeName>(DEFAULT_MODE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORE_KEY);
        const next: ThemeName = isThemeName(stored) ? stored : DEFAULT_MODE;
        if (!cancelled) {
          setModeState(next);
          modeRef.current = next;
          applyNativeChrome(next, palettes[next]);
          console.log(`[theme] hydrated mode=${next}`);
        }
      } catch {
        if (!cancelled) applyNativeChrome(DEFAULT_MODE, palettes[DEFAULT_MODE]);
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

  const applyMode = useCallback((next: ThemeName) => {
    setModeState(next);
    modeRef.current = next;
    // Persist before touching native chrome: a throw out of the chrome call
    // must not be able to cost the user their saved preference. Failures are
    // warned rather than swallowed — a silent catch here is why a lost theme
    // preference is invisible until the next cold launch.
    void SecureStore.setItemAsync(STORE_KEY, next).catch((e) =>
      console.warn('[theme] could not persist mode', e),
    );
    // Off the commit frame. `Appearance.setColorScheme` is a synchronous
    // native call that also notifies every RN appearance subscriber, and
    // nothing on screen needs it this frame — the status bar follows `mode`.
    setTimeout(() => {
      try {
        applyNativeChrome(next, palettes[next]);
      } catch (e) {
        console.warn('[theme] could not apply native chrome', e);
      }
    }, 0);
  }, []);

  // The swap is the commit — no cross-fade, no deferred frames. Anything
  // scheduled between the tap and the palette change is latency the user
  // reads as lag, so `setMode` does its whole job synchronously.
  const setMode = useCallback(
    (next: ThemeName) => {
      if (next === modeRef.current) return;
      applyMode(next);
    },
    [applyMode],
  );

  const toggleMode = useCallback(() => {
    setMode(modeRef.current === 'black' ? 'white' : 'black');
  }, [setMode]);

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

/**
 * The `boxShadow` string for a depth level in the active mode. Spread onto
 * a View as `style={{ boxShadow: useDepth('raise2') }}`.
 */
export function useDepth(level: DepthLevel): string {
  return depth[useTheme().mode][level];
}
