// Server-backed domain store. The financial backend is the source of
// truth; this provider fetches the session-scoped state and exposes the
// same `useDomain()` shape the screens were built on. `dispatch` keeps
// its action-object signature but is now a facade: each action maps to
// an API call (rule changes go through the server's PREPARE→EXECUTE
// gateway) followed by a refresh.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, ApiError, resetApiBase, triedBases } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { PrimaryButton, TextButton } from '@/components/fin/Buttons';
import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';
import { Toast } from '@/shared/ui/molecules/Toast';

import type { AuditEvent, DomainState } from './types';

type DomainAction =
  | { type: 'freeze_card'; cardId: string }
  | { type: 'unfreeze_card'; cardId: string }
  | { type: 'approve_once'; approvalId: string }
  | { type: 'decline_approval'; approvalId: string }
  | { type: 'temp_allowance'; memberId: string; amount: number; expiresAt: string; expiresAtLabel: string }
  | { type: 'set_monthly_limit'; memberId: string; amount: number }
  | { type: 'set_approval_threshold'; cardId: string; amount: number }
  | { type: 'toggle_channel'; cardId: string; channel: 'online' | 'contactless' | 'atm' | 'international' }
  | { type: 'toggle_category'; memberId: string; categoryKey: string };

interface DomainContextValue {
  state: DomainState;
  dispatch: (action: DomainAction) => Promise<void>;
  /** Same as `dispatch` but rethrows, for callers that must not claim
   * success until the backend confirms it. */
  dispatchOrThrow: (action: DomainAction) => Promise<void>;
  refresh: () => Promise<void>;
  /** The newest audit event that arrived since the persisted activity
   * cursor. The AI notification pill keys off this; cleared via
   * `clearNewActivity`. */
  newActivity: AuditEvent | null;
  clearNewActivity: () => void;
}

const DomainContext = createContext<DomainContextValue | null>(null);

const showError = (e: unknown) => {
  const message = e instanceof ApiError ? e.message : 'Network problem — nothing has changed.';
  Toast.show(message, { type: 'default', position: 'bottom' });
};

/** Kinds that surface as an AI notification pill (scope A). */
const NOTIFY_KINDS: ReadonlySet<AuditEvent['kind']> = new Set(['ai_action', 'approval_event']);

/**
 * Activity diffing (spec: true activity-change detection). The audit ledger
 * is append-only and the server returns it sorted `(at DESC, id DESC)`, so a
 * persisted `{ at, id }` cursor is a total order over everything the user has
 * seen. The cursor advances over ALL new events (not just notifiable kinds)
 * so non-AI activity never re-enters the window; only the newest
 * ai_action/approval_event is emitted.
 */
interface ActivityCursor {
  at: string;
  id: number;
}

const cursorKey = (userId: string) => `kami.activity-cursor.${userId}`;

const cmp = (atA: string, idA: number | string, atB: string, idB: number | string): number => {
  if (atA === atB) return Number(idA) - Number(idB);
  return atA < atB ? -1 : 1;
};

const cmpEvent = (a: AuditEvent, b: AuditEvent): number => cmp(a.at, a.id, b.at, b.id);

const cmpCursor = (e: AuditEvent, c: ActivityCursor): number => cmp(e.at, e.id, c.at, c.id);

const cursorOf = (e: AuditEvent): ActivityCursor => ({ at: e.at, id: Number(e.id) });

const maxEvent = (list: AuditEvent[]): AuditEvent =>
  list.reduce((best, e) => (cmpEvent(e, best) > 0 ? e : best));

export function DomainProvider({ children }: React.PropsWithChildren) {
  const { headers, session } = useAuth();
  const [state, setState] = useState<DomainState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newActivity, setNewActivity] = useState<AuditEvent | null>(null);
  const headersRef = useRef(headers);
  headersRef.current = headers;

  // Activity cursor: `savedCursorRef` holds the durable value read from
  // AsyncStorage; `cursorRef` is the live cursor the next refresh diffs
  // against. `baselineSetRef` is true once the cursor has been anchored to
  // a fetch — a fresh install anchors silently (no history flood).
  const savedCursorRef = useRef<ActivityCursor | null>(null);
  const cursorRef = useRef<ActivityCursor | null>(null);
  const baselineSetRef = useRef(false);

  const persistCursor = useCallback((userId: string, cursor: ActivityCursor) => {
    AsyncStorage.setItem(cursorKey(userId), JSON.stringify(cursor)).catch(() => {
      // Persistence is best-effort; a failed write only risks re-notifying.
    });
  }, []);

  // Load the durable cursor whenever the signed-in user changes.
  useEffect(() => {
    savedCursorRef.current = null;
    cursorRef.current = null;
    baselineSetRef.current = false;
    const userId = session?.userId;
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(cursorKey(userId))
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          savedCursorRef.current = JSON.parse(raw) as ActivityCursor;
        } catch {
          savedCursorRef.current = null;
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session?.userId]);

  /**
   * Diff the fetched audit events against the live cursor and surface the
   * newest notifiable event. Advances the cursor over everything new and
   * persists it BEFORE emitting, so concurrent refreshes cannot re-emit.
   */
  const diffActivity = useCallback(
    (events: AuditEvent[]) => {
      const userId = session?.userId;
      if (!userId || events.length === 0) return;

      if (!baselineSetRef.current) {
        baselineSetRef.current = true;
        const saved = savedCursorRef.current;
        if (!saved) {
          // First run (or cursor lost): anchor to the latest event silently
          // so seeded history never floods the notification pill.
          cursorRef.current = cursorOf(maxEvent(events));
          return;
        }
        cursorRef.current = saved;
      }

      const cursor = cursorRef.current;
      if (!cursor) return;
      const fresh = events.filter((e) => cmpCursor(e, cursor) > 0);
      if (fresh.length === 0) return;
      cursorRef.current = cursorOf(maxEvent(fresh));
      persistCursor(userId, cursorRef.current);
      const freshNotifiable = fresh.filter((e) => NOTIFY_KINDS.has(e.kind));
      if (freshNotifiable.length > 0) {
        setNewActivity(maxEvent(freshNotifiable));
      }
    },
    [persistCursor, session?.userId],
  );

  const refresh = useCallback(async () => {
    try {
      const next = await api.fetchDomainState(headersRef.current);
      setState(next);
      setError(null);
      diffActivity(next.events);
    } catch (e) {
      if (state === null) {
        setError(e instanceof ApiError ? e.message : 'Could not reach the Kami server.');
      } else {
        showError(e);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state === null, diffActivity]);

  const clearNewActivity = useCallback(() => setNewActivity(null), []);

  useEffect(() => {
    setState(null);
    setError(null);
    setNewActivity(null);
    void refresh();
    // Refetch when the signed-in user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId]);

  /**
   * Rule changes route through the trusted gateway: prepare on the
   * server, then execute echoing the server's facts hash. The screen has
   * already shown its own ConfirmSheet before dispatching.
   */
  const prepareAndExecute = useCallback(async (intent: object) => {
    const action = await api.prepareAction(headersRef.current, intent);
    await api.executeAction(headersRef.current, action.id, action.factsHash, `app-${action.id}`);
  }, []);

  const runAction = useCallback(
    async (action: DomainAction) => {
      const h = headersRef.current;
      {
        switch (action.type) {
          case 'freeze_card':
            await api.freezeCard(h, action.cardId, true);
            break;
          case 'unfreeze_card':
            await api.freezeCard(h, action.cardId, false);
            break;
          case 'approve_once':
            await api.approveOnce(h, action.approvalId);
            break;
          case 'decline_approval':
            await api.declineApproval(h, action.approvalId);
            break;
          case 'temp_allowance':
            await prepareAndExecute({
              kind: 'temp_allowance',
              memberId: action.memberId,
              amount: action.amount,
              expiresAt: action.expiresAt,
            });
            break;
          case 'set_monthly_limit':
            await prepareAndExecute({ kind: 'set_monthly_limit', memberId: action.memberId, amount: action.amount });
            break;
          case 'set_approval_threshold':
            await prepareAndExecute({ kind: 'set_approval_threshold', cardId: action.cardId, amount: action.amount });
            break;
          case 'toggle_channel': {
            const card = state?.cards.find((c) => c.id === action.cardId);
            await api.setChannel(h, action.cardId, action.channel, !(card?.channels[action.channel] ?? false));
            break;
          }
          case 'toggle_category': {
            const member = state?.members.find((m) => m.id === action.memberId);
            const cat = member?.categories.find((c) => c.key === action.categoryKey);
            await api.setCategory(h, action.memberId, action.categoryKey, !(cat?.enabled ?? false));
            break;
          }
        }
      }
    },
    [prepareAndExecute, state],
  );

  /**
   * Like `dispatch`, but rethrows after surfacing the error so a caller can
   * roll its own UI back. Callers that report success to the user must use
   * this — success must never be shown before the backend confirms it.
   */
  const dispatchOrThrow = useCallback(
    async (action: DomainAction) => {
      try {
        await runAction(action);
        await refresh();
      } catch (e) {
        showError(e);
        await refresh();
        throw e;
      }
    },
    [runAction, refresh],
  );

  /** Fire-and-forget: the error is surfaced as a toast and swallowed. */
  const dispatch = useCallback(
    async (action: DomainAction) => {
      try {
        await dispatchOrThrow(action);
      } catch {
        // Already surfaced by dispatchOrThrow.
      }
    },
    [dispatchOrThrow],
  );

  const value = useMemo<DomainContextValue | null>(
    () =>
      state
        ? { state, dispatch, dispatchOrThrow, refresh, newActivity, clearNewActivity }
        : null,
    [state, dispatch, dispatchOrThrow, refresh, newActivity, clearNewActivity],
  );

  if (error) {
    return (
      <DomainGateError
        message={error}
        onRetry={() => {
          // The network may have changed since the failure — rediscover the
          // gateway rather than retrying an address we already know is dead.
          resetApiBase();
          void refresh();
        }}
      />
    );
  }
  if (!value) {
    return <DomainGateLoading />;
  }
  return <DomainContext.Provider value={value}>{children}</DomainContext.Provider>;
}

export function useDomain(): DomainContextValue {
  const ctx = useContext(DomainContext);
  if (!ctx) throw new Error('useDomain must be used inside DomainProvider');
  return ctx;
}

// Derived selectors (unchanged signatures)

export function memberRemaining(state: DomainState, memberId: string): number | undefined {
  const m = state.members.find((x) => x.id === memberId);
  if (!m || m.monthlyLimit === undefined) return undefined;
  return m.monthlyLimit + (m.tempAllowance?.amount ?? 0) - m.spentThisMonth;
}

export function cardForMember(state: DomainState, memberId: string) {
  return (
    state.cards.find((c) => c.memberId === memberId && c.variant !== 'personal') ??
    state.cards.find((c) => c.memberId === memberId)
  );
}

export function pendingApprovals(state: DomainState) {
  return state.approvals.filter((a) => a.status === 'pending');
}

function DomainGateLoading() {
  const colors = useColors();
  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <ActivityIndicator color={colors.accent} />
      <AppText variant="secondary" tone={colors.textTertiary}>
        Loading your money…
      </AppText>
    </View>
  );
}

function DomainGateError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useColors();
  const { signOut } = useAuth();
  const devHint = useDevReverseHint();
  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <AppText variant="section" style={{ textAlign: 'center' }}>
        Can&apos;t reach the server
      </AppText>
      <AppText variant="secondary" tone={colors.textTertiary} style={{ textAlign: 'center' }}>
        {message}
      </AppText>
      {devHint && (
        <AppText variant="caption" tone={colors.textTertiary} style={{ textAlign: 'center' }}>
          {devHint}
        </AppText>
      )}
      <PrimaryButton label="Retry" onPress={onRetry} style={{ minWidth: 160 }} />
      <TextButton label="Sign out" destructive onPress={signOut} />
    </View>
  );
}

/** Dev-only hint. The client probes every plausible gateway address, so if it
 * still came up empty the addresses themselves are the useful diagnostic —
 * either the gateway is down or the device is on another network. */
function useDevReverseHint(): string | null {
  if (!__DEV__) return null;
  const hosts = triedBases().map((b) => b.replace(/^https?:\/\//, ''));
  if (hosts.length === 0) return 'No API address configured — set EXPO_PUBLIC_API_URL.';
  return `Tried ${hosts.join(', ')} — is the gateway up? (bun run server)`;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.l,
    padding: space.x32,
  },
});
