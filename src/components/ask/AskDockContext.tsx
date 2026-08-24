import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

type ScrollDir = 'up' | 'down';

type AskDockController = {
  setVaultOpen: (v: boolean) => void;
  reportScroll: (dir: ScrollDir) => void;
  setAskHome: (v: boolean) => void;
  registerScrollToTop: (route: string, fn: (() => void) | null) => void;
  scrollToTop: (route: string) => void;
  vaultOpen: boolean;
  askHome: boolean;
  scrollHidden: boolean;
  /** Set from `useTabBarHeight()` by `TabBarSpacer`, not measured. */
  tabBarHeight: number;
  setTabBarHeight: (h: number) => void;
  /** The nav bar morphs into the composer in place; this drives the morph. */
  composerOpen: boolean;
  openComposer: () => void;
  closeComposer: () => void;
  /** Chat-first shell mode: the dock stands down so the floating composer and
      the history drawer own the bottom of the screen. */
  chatMode: boolean;
  setChatMode: (v: boolean) => void;
  /** The drawer's single surface translate, owned here so the shell (inside
      the navigator) and the floating nav bar (outside it) can both ride it.
      The shell's `useChatDrawer` writes it; the nav bar reads it. */
  surfaceX: SharedValue<number>;
};

const AskDockContext = createContext<AskDockController | null>(null);

export function AskDockProvider({ children }: React.PropsWithChildren) {
  const [vaultOpen, setVaultOpen] = useState(false);
  const [askHome, setAskHome] = useState(false);
  const [scrollHidden, setScrollHidden] = useState(false);
  // Overwritten on mount by `TabBarSpacer`; this only covers the first frame.
  const [tabBarHeight, setTabBarHeight] = useState(88);
  const [composerOpen, setComposerOpen] = useState(false);
  const [chatMode, setChatMode] = useState(false);
  const scrollFns = useRef<Record<string, () => void>>({});
  // Single shared value — created above the navigator so both the shell and
  // the floating nav bar can animate off it (see ChatFirstShell).
  const surfaceX = useSharedValue(0);

  const openComposer = useCallback(() => setComposerOpen(true), []);
  const closeComposer = useCallback(() => setComposerOpen(false), []);

  const reportScroll = useCallback(
    (dir: ScrollDir) => {
      if (askHome) return;
      setScrollHidden(dir === 'down');
    },
    [askHome],
  );

  const registerScrollToTop = useCallback((route: string, fn: (() => void) | null) => {
    if (fn) scrollFns.current[route] = fn;
    else delete scrollFns.current[route];
  }, []);

  const scrollToTop = useCallback((route: string) => {
    scrollFns.current[route]?.();
  }, []);

  const value = useMemo<AskDockController>(
    () => ({
      setVaultOpen,
      reportScroll,
      setAskHome,
      registerScrollToTop,
      scrollToTop,
      vaultOpen,
      askHome,
      scrollHidden: askHome ? false : scrollHidden,
      tabBarHeight,
      setTabBarHeight,
      composerOpen,
      openComposer,
      closeComposer,
      chatMode,
      setChatMode,
      surfaceX,
    }),
    [
      vaultOpen,
      askHome,
      scrollHidden,
      tabBarHeight,
      composerOpen,
      openComposer,
      closeComposer,
      chatMode,
      setChatMode,
      surfaceX,
      reportScroll,
      registerScrollToTop,
      scrollToTop,
    ],
  );

  return <AskDockContext.Provider value={value}>{children}</AskDockContext.Provider>;
}

export function useAskDock(): AskDockController {
  const ctx = useContext(AskDockContext);
  if (!ctx) throw new Error('useAskDock must be used inside AskDockProvider');
  return ctx;
}

export function useAskDockOptional(): AskDockController | null {
  return useContext(AskDockContext);
}
