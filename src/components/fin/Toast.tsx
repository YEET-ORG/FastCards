import React, { useCallback } from 'react';
import { AccessibilityInfo } from 'react-native';

import { color } from '@/design/tokens';
import { Toast as ReacticxToast, ToastProviderWithViewport } from '@/shared/ui/molecules/Toast';

// Product adapter over the Reacticx Toast system. Keeps the app-wide
// `useToast()(message)` API; used for reversible confirmations only —
// never as the sole evidence of a transfer or purchase.

const Provider = ToastProviderWithViewport as unknown as React.FC<React.PropsWithChildren>;

export function ToastProvider({ children }: React.PropsWithChildren) {
  return <Provider>{children}</Provider>;
}

export function useToast() {
  return useCallback((message: string) => {
    AccessibilityInfo.announceForAccessibility(message);
    ReacticxToast.show(message, {
      type: 'default',
      position: 'bottom',
      duration: 2600,
      backgroundColor: color.surface3,
    });
  }, []);
}
