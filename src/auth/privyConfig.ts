// Privy public identifiers (safe to ship in the app bundle — the app
// secret lives only on the server). Override via EXPO_PUBLIC_* env.
//
// clientId is intentionally UNSET by default: the mobile client
// (client-WY6…) has an empty per-client app-identifier allowlist, which
// only the dashboard can edit — sending its id makes every native
// request fail with `invalid_native_app_id`. Without a client id, Privy
// validates against the app-level `allowed_native_app_ids`, which is
// configured (via the management API) to allow `host.exp.Exponent`
// (Expo Go) and `com.fastcards.app` (dev builds). To use the mobile
// client again, add those identifiers to it in Dashboard → App settings
// → Clients, then set EXPO_PUBLIC_PRIVY_CLIENT_ID.

export const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? 'cmt03w2et01nm0bl526rgeiz0';

export const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID; // optional
