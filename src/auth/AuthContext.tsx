// App auth layer. Two modes, same interface:
//
// - Dev: pick a seeded user on the sign-in screen; requests carry
//   `x-user-id`. Works against the server's dev mode only.
// - Privy (live): email-OTP login via @privy-io/expo. Requests carry
//   `Bearer <access token>` (+ `privy-id-token` for wallet sync); the
//   server resolves the DID to a household user (first login binds the
//   owner, later ones need an invite). The access token is refreshed
//   periodically — Privy rotates it under the hood.

import { getAccessToken, useIdentityToken, usePrivy } from '@privy-io/expo';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, type AuthHeaders } from '@/api/client';

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
  /** Set while a Privy login is being exchanged for a server session. */
  privyError: string | null;
  signInDev: (userId: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_REFRESH_MS = 5 * 60 * 1000;

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<AppSession | null>(null);
  const [headers, setHeaders] = useState<AuthHeaders>({});
  const [mode, setMode] = useState<'dev' | 'privy' | null>(null);
  const [privyError, setPrivyError] = useState<string | null>(null);

  const { user: privyUser, logout: privyLogout } = usePrivy();
  const { getIdentityToken } = useIdentityToken();

  const signInDev = useCallback((userId: string) => {
    const user = DEV_USERS.find((u) => u.userId === userId);
    if (user) {
      setSession(user);
      setHeaders({ 'x-user-id': user.userId });
      setMode('dev');
      setPrivyError(null);
    }
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
    setHeaders({});
    setMode(null);
    setPrivyError(null);
    privyLogout().catch(() => undefined);
  }, [privyLogout]);

  // Privy bridge: when a Privy user appears (login or restored session),
  // exchange the access token for a server-side session. The server is
  // the source of truth for who this DID is inside the household.
  useEffect(() => {
    if (!privyUser || mode === 'dev') return;
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
        setPrivyError(e instanceof Error ? e.message : 'Could not sign in.');
        privyLogout().catch(() => undefined);
      }
    };

    void resolve();
    const timer = setInterval(resolve, TOKEN_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [privyUser, mode, getIdentityToken, privyLogout]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, headers, mode, privyError, signInDev, signOut }),
    [session, headers, mode, privyError, signInDev, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
