// App auth layer. Live only:
//
// - Privy: email-OTP login via @privy-io/expo. Requests carry
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

import { api, ApiError, type AuthHeaders, resetApiBase } from '@/api/client';

export interface AppSession {
  userId: string;
  name: string;
  role: string;
  isAdmin: boolean;
}

interface AuthContextValue {
  session: AppSession | null;
  headers: AuthHeaders;
  /** True while a stored Privy session is being restored at boot. */
  restoring: boolean;
  /** True from a sign-in the user actually performed — an email OTP login —
   * until onboarding consumes it. False for a session restored silently at
   * launch, which must not re-run onboarding. */
  justSignedIn: boolean;
  /** Called by the onboarding gate once the flow has been completed. */
  clearJustSignedIn: () => void;
  /** Set when a Privy login could not be exchanged for a server session. */
  privyError: string | null;
  /** Re-attempt the Privy token → server session exchange. */
  retryPrivy: () => void;
  /** The name typed at registration, held until the server has taken it. */
  setSignUpName: (name: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_REFRESH_MS = 5 * 60 * 1000;
const SIGNUP_NAME_KEY = 'fc.signUpName';

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<AppSession | null>(null);
  const [headers, setHeaders] = useState<AuthHeaders>({});
  const [restoring, setRestoring] = useState(true);
  const [privyError, setPrivyError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  // Onboarding is gated on the sign-in *event*, not only on the stored
  // completion flag: the flag is per user id, and the server binds the first
  // Privy DID to the household owner. Without this, the second sign-in on a
  // device would silently skip the flow. A restored session leaves it false.
  const [justSignedIn, setJustSignedIn] = useState(false);
  // Set when Privy already had a session the moment it became ready — that is
  // a restore, not a login. Cleared on sign-out so the next login counts.
  const restoredPrivyAtBoot = useRef(false);
  // One raise per Privy login: the token refresh interval re-runs the same
  // exchange every 5 minutes, and must not re-raise the flag after onboarding
  // has cleared it.
  const privySignInRaised = useRef(false);
  // The name typed on the sign-in screen, carried across the OTP round trip
  // and offered to the server on the first session exchange. Persisted because
  // the mail app can push us out of the process mid-login. A ref rather than
  // state on purpose: nothing renders it, and putting it in the exchange
  // effect's deps would restart the refresh interval the moment it clears.
  const signUpNameRef = useRef<string | null>(null);

  const { user: privyUser, isReady: privyReady, logout: privyLogout } = usePrivy();
  const { getIdentityToken } = useIdentityToken();

  const setSignUpName = useCallback((name: string) => {
    const trimmed = name.trim();
    signUpNameRef.current = trimmed || null;
    if (trimmed) SecureStore.setItemAsync(SIGNUP_NAME_KEY, trimmed).catch(() => undefined);
    else SecureStore.deleteItemAsync(SIGNUP_NAME_KEY).catch(() => undefined);
  }, []);

  const clearSignUpName = useCallback(() => {
    signUpNameRef.current = null;
    SecureStore.deleteItemAsync(SIGNUP_NAME_KEY).catch(() => undefined);
  }, []);

  const clearJustSignedIn = useCallback(() => {
    setJustSignedIn(false);
  }, []);

  const signOut = useCallback(() => {
    setSession(null);
    setHeaders({});
    setPrivyError(null);
    setRestoring(false);
    setJustSignedIn(false);
    // The next Privy login is a login, not the boot restore this launch began
    // with — otherwise signing out and back in would skip onboarding.
    restoredPrivyAtBoot.current = false;
    privySignInRaised.current = false;
    clearSignUpName();
    privyLogout().catch(() => undefined);
  }, [privyLogout, clearSignUpName]);

  const retryPrivy = useCallback(() => {
    setPrivyError(null);
    // Same reasoning as the domain gate's Retry: rediscover the gateway, since
    // a failure here usually means we probed before the network was ready.
    resetApiBase();
    setRetryTick((t) => t + 1);
  }, []);

  // A registration interrupted by the mail app resumes with the name intact.
  useEffect(() => {
    SecureStore.getItemAsync(SIGNUP_NAME_KEY)
      .then((stored) => {
        if (stored && signUpNameRef.current === null) signUpNameRef.current = stored;
      })
      .catch(() => undefined);
  }, []);

  // Boot restore: wait for Privy to load its stored session. A restored
  // Privy user takes the exchange path below; with no Privy session the
  // bridge effect below ends the restoring state (sign-in is shown).
  const bootHandled = useRef(false);
  useEffect(() => {
    if (!privyReady || bootHandled.current) return;
    bootHandled.current = true;
    if (privyUser) {
      // A session that was already there when Privy loaded — a restore, so the
      // exchange below must not treat it as a fresh sign-in.
      restoredPrivyAtBoot.current = true;
    }
  }, [privyReady, privyUser]);

  // Privy bridge: when a Privy user appears (fresh login or restored
  // session), exchange the access token for a server-side session. The
  // server is the source of truth for who this DID is in the household.
  useEffect(() => {
    if (!privyUser) {
      if (privyReady && bootHandled.current) setRestoring(false);
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
        // The registration name rides along on the exchange, and only the
        // exchange: the server honours it when this DID first claims an
        // account, and the app's own headers never carry it afterwards.
        const claimed = signUpNameRef.current;
        const s = await api.fetchSession(
          claimed ? { ...h, 'x-display-name': encodeURIComponent(claimed) } : h,
        );
        if (cancelled) return;
        // Cleared only once the server has echoed it back as the session name —
        // an exchange that fell back to the seeded name must keep trying.
        if (claimed && s.name === claimed) clearSignUpName();
        // Guarded writes: the refresh runs every 5 minutes with identical
        // data, and a fresh identity here re-renders all 21 useAuth consumers
        // for nothing.
        setHeaders((prev) => {
          if (
            prev &&
            prev.authorization === h.authorization &&
            prev['privy-id-token'] === h['privy-id-token']
          ) {
            return prev;
          }
          return h;
        });
        setSession((prev) =>
          prev &&
          prev.userId === s.userId &&
          prev.name === s.name &&
          prev.role === s.role &&
          prev.isAdmin === s.isAdmin
            ? prev
            : { userId: s.userId, name: s.name, role: s.role, isAdmin: s.isAdmin },
        );
        setPrivyError(null);
        // Raised once, and only for a login the user just performed: a session
        // Privy restored at boot goes to the app on its stored onboarding flag.
        if (!restoredPrivyAtBoot.current && !privySignInRaised.current) {
          privySignInRaised.current = true;
          setJustSignedIn(true);
        }
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
            e instanceof Error && e.message ? e.message : 'Could not reach the Kami server.',
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
  }, [privyUser, retryTick, privyReady, getIdentityToken, privyLogout, clearSignUpName]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      headers,
      restoring,
      justSignedIn,
      clearJustSignedIn,
      privyError,
      retryPrivy,
      setSignUpName,
      signOut,
    }),
    [
      session,
      headers,
      restoring,
      justSignedIn,
      clearJustSignedIn,
      privyError,
      retryPrivy,
      setSignUpName,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
