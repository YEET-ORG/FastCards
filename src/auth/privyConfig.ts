// Privy public identifiers (safe to ship in the app bundle — the app
// secret lives only on the server). Override via EXPO_PUBLIC_* env.

export const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? 'cmt03w2et01nm0bl526rgeiz0';

export const PRIVY_CLIENT_ID =
  process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? 'client-WY6ctYLWms9Sp3cuB9f7tqcZ2JtoYdRnTAFYSuiDyDffe';
