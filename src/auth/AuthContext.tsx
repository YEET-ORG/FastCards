// App auth layer. Two modes, same interface:
//
// - Dev: pick a seeded user on the sign-in screen; requests carry
//   `x-user-id`. Persisted in SecureStore so restarts land back in the
//   same session. Works against the server's dev mode only.
// - Privy (live): email-OTP login via @privy-io/expo. Requests carry
//   `Bearer <access token>` (+ `privy-id-token` for wallet sync); the
//   server resolves the DID to a household user (first login binds the
//   owner, later ones need an invite). Privy persists its own session,
//   so a restart restores it silently — the app shows a restoring state
//   until the token→session exchange settles instead of flashing the
//   sign-in screen. Only an explicit 401/403 from the server ends the
//   Privy session; network/server errors keep it and retry.

import { getAccessToken, useIdentityToken, usePrivy } from '@privy-io/expo';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api, ApiError, type AuthHeaders } from '@/api/client';

export interface AppSession {
  userId: string;
  name: string;
  role: string;
  isAdmin: boolean;
}

export const DEV_USERS: AppSession[] = [
  { userId: 'u-rohan', name: 'Rohan', role: 'owner', isAdmin: true },
  { userId: 'u-maya', name: 'Maya', role: 'teen', isAdmin: false },
];

interface AuthContextValue {
  session: AppSession | null;
  headers: AuthHeaders;
  /** 'dev' | 'privy' — how the current session authenticates. */
  mode: 'dev' | 'privy' | null;
  /** True while a stored session (Privy or dev) is being restored at boot. */
  restoring: boolean;
  /** Set when a Privy login could not be exchanged for a server session. */
  privyError: string | null;
  /** Re-attempt the Privy token → server session exchange. */
  retryPrivy: () => void;
  signInDev: (userId: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_REFRESH_MS = 5 * 60 * 1000;
const DEV_USER_KEY = 'fc.devUserId';

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<AppSession | null>(null);
  const [headers, setHeaders] = useState<AuthHeaders>({});
  const [mode, setMode] = useState<'dev' | 'privy' | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [privyError, setPrivyError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const { user: privyUser, isReady: privyReady, logout: privyLogout } = usePrivy();
  const { getIdentityToken } = useIdentityToken();

  const signInDev = useCallback((userId: string) => {
    const user = DEV_USERS.find((u) => u.userId === userId);
    if (user) {
      setSession(user);
      setHeaders({ 'x-user-id': user.userId });
      setMode('dev');
      setPrivyError(null);
      setRestoring(false);
      SecureStore.setItemAsync(DEV_USER_KEY, user.userId).catch(() => undefined);
    }
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
    setHeaders({});
    setMode(null);
    setPrivyError(null);
    setRestoring(false);
    SecureStore.deleteItemAsync(DEV_USER_KEY).catch(() => undefined);
    privyLogout().catch(() => undefined);
  }, [privyLogout]);

  const retryPrivy = useCallback(() => {
    setPrivyError(null);
    setRetryTick((t) => t + 1);
  }, []);

  // Boot restore: wait for Privy to load its stored session. A restored
  // Privy user takes the exchange path below; otherwise fall back to the
  // persisted dev session; otherwise show sign-in.
  const bootHandled = useRef(false);
  useEffect(() => {
    if (!privyReady || bootHandled.current) return;
    bootHandled.current = true;
    if (privyUser) return; // exchange effect takes over (keeps restoring=true)
    SecureStore.getItemAsync(DEV_USER_KEY)
      .then((stored) => {
        if (stored && DEV_USERS.some((u) => u.userId === stored)) signInDev(stored);
        else setRestoring(false);
      })
      .catch(() => setRestoring(false));
  }, [privyReady, privyUser, signInDev]);

  // Privy bridge: when a Privy user appears (fresh login or restored
  // session), exchange the access token for a server-side session. The
  // server is the source of truth for who this DID is in the household.
  useEffect(() => {
    if (!privyUser || mode === 'dev') {
      if (privyReady && !privyUser && mode !== 'dev' && bootHandled.current) setRestoring(false);
      return;
    }
    let cancelled = false;

    const resolve = async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('No Privy access token.');
        const idToken = await getIdentityToken().catch(() => null);
        const h: AuthHeaders = {
          authorization: `Bearer ${token}`,
          ...(idToken ? { 'privy-id-token': idToken } : {}),
        };
        const s = await api.fetchSession(h);
        if (cancelled) return;
        setHeaders(h);
        setSession({ userId: s.userId, name: s.name, role: s.role, isAdmin: s.isAdmin });
        setMode('privy');
        setPrivyError(null);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          // The server rejected this identity — end the Privy session.
          setPrivyError(e.message);
          privyLogout().catch(() => undefined);
        } else {
          // Network/server trouble: keep the Privy session, surface a
          // retryable error. The refresh interval keeps trying too.
          setPrivyError(
            e instanceof Error && e.message ? e.message : 'Could not reach the FastCards server.',
          );
        }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    };

    void resolve();
    const timer = setInterval(resolve, TOKEN_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [privyUser, mode, retryTick, privyReady, getIdentityToken, privyLogout]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, headers, mode, restoring, privyError, retryPrivy, signInDev, signOut }),
    [session, headers, mode, restoring, privyError, retryPrivy, signInDev, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
