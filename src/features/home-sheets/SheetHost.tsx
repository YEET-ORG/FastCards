import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { HomeDetailSheet, type HomeSheetTarget } from './HomeDetailSheet';

type SheetController = {
  openSheet: (target: HomeSheetTarget) => void;
  dismissSheet: () => void;
  sheetTarget: HomeSheetTarget | null;
  sheetVisible: boolean;
};

const SheetContext = createContext<SheetController | null>(null);

/**
 * Hosts the detail sheet as a SIBLING of the tab shell and hands Home an
 * `openSheet`/`dismissSheet` pair. The sheet mounts here — not inside Home —
 * so it covers the whole window including the floating tab bar, and the
 * shell's own pan gestures cannot fire from touches on it.
 *
 * The target is deliberately NEVER cleared on dismiss: the sheet stays mounted
 * through its closing animation, and nulling it would flip the content for the
 * whole close of any other variant. Holding the last target is free — it is a
 * plain descriptor, and the next open overwrites it.
 */
export function SheetHostProvider({ children }: React.PropsWithChildren) {
  const [sheetTarget, setSheetTarget] = useState<HomeSheetTarget | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const openSheet = useCallback((target: HomeSheetTarget) => {
    setSheetTarget(target);
    setSheetVisible(true);
  }, []);

  const dismissSheet = useCallback(() => {
    setSheetVisible(false);
  }, []);

  const value = useMemo<SheetController>(
    () => ({ openSheet, dismissSheet, sheetTarget, sheetVisible }),
    [openSheet, dismissSheet, sheetTarget, sheetVisible],
  );

  return (
    <SheetContext.Provider value={value}>
      {children}
      <HomeDetailSheet target={sheetTarget} visible={sheetVisible} onDismiss={dismissSheet} />
    </SheetContext.Provider>
  );
}

export function useHomeSheet(): SheetController {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useHomeSheet must be used inside SheetHostProvider');
  return ctx;
}