import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ScrollView } from 'react-native';

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
  tabBarHeight: number;
  setTabBarHeight: (h: number) => void;
};

const AskDockContext = createContext<AskDockController | null>(null);

export function AskDockProvider({ children }: React.PropsWithChildren) {
  const [vaultOpen, setVaultOpen] = useState(false);
  const [askHome, setAskHome] = useState(false);
  const [scrollHidden, setScrollHidden] = useState(false);
  const [tabBarHeight, setTabBarHeight] = useState(88);
  const scrollFns = useRef<Record<string, () => void>>({});

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
    }),
    [vaultOpen, askHome, scrollHidden, tabBarHeight, reportScroll, registerScrollToTop, scrollToTop],
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

export function scrollViewToTop(ref: React.RefObject<ScrollView | null>) {
  ref.current?.scrollTo({ y: 0, animated: true });
}
