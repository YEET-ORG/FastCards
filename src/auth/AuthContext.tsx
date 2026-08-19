// App auth layer. Two modes, same interface:
//
// - Dev (current): pick a seeded user on the sign-in screen; requests
//   carry `x-user-id`. Works against the server's dev mode only.
// - Privy (seam ready): @privy-io/expo login provides an access token;
//   `headers` becomes { authorization: `Bearer ${token}` } (+
//   `privy-id-token` for wallet sync). Needs the app's MOBILE CLIENT ID
//   from the Privy dashboard, then swap `signInDev` for Privy's hooks —
//   nothing else in the app changes.

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { AuthHeaders } from '@/api/client';

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
  signInDev: (userId: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<AppSession | null>(null);

  const signInDev = useCallback((userId: string) => {
    const user = DEV_USERS.find((u) => u.userId === userId);
    if (user) setSession(user);
  }, []);

  const signOut = useCallback(() => setSession(null), []);

  const value = useMemo<AuthContextValue>(() => {
    const headers: AuthHeaders = session ? { 'x-user-id': session.userId } : {};
    return { session, headers, signInDev, signOut };
  }, [session, signInDev, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
