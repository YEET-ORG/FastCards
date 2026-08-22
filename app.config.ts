import { networkInterfaces } from 'node:os';

import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dev-only: every LAN address this machine can be reached at. Baked into the
 * manifest so a USB-attached device can find the gateway on its own — Metro's
 * script URL says `localhost` there, which only resolves if `adb reverse` has
 * tunnelled 8787, and that tunnel dies on every replug or adb restart.
 *
 * Returns nothing in a production build: these are private addresses and the
 * client does no discovery outside `__DEV__` anyway.
 */
function devLanHosts(): string[] {
  if (process.env.NODE_ENV === 'production') return [];
  return Object.values(networkInterfaces())
    .flat()
    .filter((n) => n !== undefined && n.family === 'IPv4' && !n.internal)
    .map((n) => n!.address);
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'FastCards',
  slug: config.slug ?? 'FastCards',
  extra: { ...config.extra, devLanHosts: devLanHosts() },
});
