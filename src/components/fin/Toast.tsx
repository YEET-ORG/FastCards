import React, { useCallback } from 'react';
import { AccessibilityInfo } from 'react-native';

import { useColors } from '@/design/theme';
import { Toast as ReacticxToast, ToastProviderWithViewport } from '@/shared/ui/molecules/Toast';

const Provider = ToastProviderWithViewport as unknown as React.FC<React.PropsWithChildren>;

export function ToastProvider({ children }: React.PropsWithChildren) {
  return <Provider>{children}</Provider>;
}

export function useToast() {
  const colors = useColors();
  return useCallback(
    (message: string) => {
      AccessibilityInfo.announceForAccessibility(message);
      ReacticxToast.show(message, {
        type: 'default',
        position: 'bottom',
        duration: 2600,
        backgroundColor: colors.raised,
      });
    },
    [colors.raised],
  );
}
