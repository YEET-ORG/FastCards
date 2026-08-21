// FastCards API client — the app's only door to the financial backend.
// Sends the auth headers provided by the AuthContext (dev: x-user-id;
// live: Privy bearer token) and maps server rows (snake_case) onto the
// app's domain types.

import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

import type { MemberHueId } from '@/design/tokens';
import type {
  Approval,
  AuditEvent,
  Card,
  CategoryBudget,
  DomainState,
  Member,
  Transaction,
} from '@/domain/types';

/** The gateway's default port — keep in step with server/src/config.ts. */
const API_PORT = 8787;

/** In dev the gateway runs on the same machine as Metro, so whatever host
 * served the bundle is also the API host. Deriving it keeps every device
 * working with no per-machine setup — the old `10.0.2.2` default only ever
 * resolves inside an emulator.
 *
 * `Constants.expoConfig.hostUri` is only populated in Expo Go, so fall back
 * to the packager's script URL, which a dev client always has. On a
 * USB-attached device that URL is `localhost:8081` (React Native sets up
 * `adb reverse` for the packager); `npm run android:reverse` tunnels the
 * API port the same way. Over Wi-Fi it carries the machine's LAN IP. */
function packagerApiUrl(): string | undefined {
  if (!__DEV__) return undefined;
  const scriptUrl = (
    NativeModules as { SourceCode?: { getConstants?: () => { scriptURL?: string } } }
  ).SourceCode?.getConstants?.().scriptURL;
  const host =
    Constants.expoConfig?.hostUri?.split(':')[0] ?? scriptUrl?.match(/^https?:\/\/([^:/]+)/)?.[1];
  return host ? `http://${host}:${API_PORT}` : undefined;
}

export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  packagerApiUrl() ??
  Platform.select({
    android: `http://10.0.2.2:${API_PORT}`,
    default: `http://localhost:${API_PORT}`,
  })!;

if (__DEV__) console.log('[api] base', API_BASE);

/** Bound every request: an unroutable host otherwise sits on the OS TCP
 * timeout and the gate shows a blank loading screen for minutes. */
const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type AuthHeaders = Record<string, string>;

async function request<T>(
  path: string,
  headers: AuthHeaders,
  init: { method?: string; body?: unknown; stepUp?: boolean } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: {
        'content-type': 'application/json',
        ...headers,
        // Mock step-up assertion — replaced by Privy MFA later.
        ...(init.stepUp ? { 'x-auth-assertion': 'passkey-mock-ok' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(
        res.status,
        (json as { error?: string })?.error ?? 'server_error',
        (json as { message?: string })?.message ?? 'Something went wrong.',
      );
    }
    return json as T;
  } finally {
    // A timeout or transport failure stays a plain Error on purpose:
    // DomainProvider branches on `instanceof ApiError` to tell an
    // unreachable server from a server that answered.
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------- mappers

const MEMBER_HUE: Record<string, MemberHueId> = {
  'm-rohan': 'rohan',
  'm-maya': 'maya',
  'm-arjun': 'arjun',
  'm-dad': 'dad',
};
function hueIdFor(memberId: string): MemberHueId {
  return MEMBER_HUE[memberId] ?? 'pool';
}

const labelFor = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

function mapMember(m: any, cards: Card[]): Member {
  const active =
    m.temp_allowance_amount && m.temp_allowance_expires_at &&
    new Date(m.temp_allowance_expires_at).getTime() > Date.now();
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    relationship: m.relationship ?? undefined,
    initials: (m.name as string).slice(0, 1).toUpperCase(),
    hueId: hueIdFor(m.id),
    monthlyLimit: m.monthly_limit ?? undefined,
    spentThisMonth: m.spent_this_month,
    tempAllowance: active
      ? {
          amount: m.temp_allowance_amount,
          expiresAt: m.temp_allowance_expires_at,
          expiresAtLabel: labelFor(m.temp_allowance_expires_at),
        }
      : undefined,
    categories: (m.categories ?? []).map(
      (c: any): CategoryBudget => ({
        key: c.key,
        label: c.label,
        cap: c.cap,
        spent: c.spent,
        enabled: c.enabled === 1 || c.enabled === true,
      }),
    ),
    cardIds: cards.filter((c) => c.memberId === m.id).map((c) => c.id),
  };
}

function mapCard(c: any): Card {
  return {
    id: c.id,
    nickname: c.nickname,
    variant: c.variant,
    status: c.status,
    last4: c.last4,
    network: c.network === 'visa' || c.network === 'mastercard' ? c.network : undefined,
    memberId: c.member_id ?? undefined,
    purpose: c.expiry_note && c.variant === 'protected' ? 'Protected checkout' : undefined,
    monthlyCap: c.monthly_cap ?? undefined,
    spentThisMonth: c.spent_this_month,
    channels: {
      online: c.online === 1,
      contactless: c.contactless === 1,
      atm: c.atm === 1,
      international: c.international === 1,
    },
    approvalAbove: c.approval_above ?? undefined,
    maxAuthorization: c.max_authorization ?? undefined,
    expiryNote: c.expiry_note ?? undefined,
  };
}

function mapTxn(t: any): Transaction {
  return {
    id: t.id,
    merchant: t.merchant,
    memberId: t.member_id,
    cardId: t.card_id,
    amount: t.amount,
    direction: t.direction,
    category: t.category,
    status: t.status,
    declineReason: t.decline_reason ?? undefined,
    approvedBy: t.approved_by ?? undefined,
    at: t.at,
  };
}

function mapApproval(a: any): Approval {
  const hoursLeft = Math.max(0, Math.round((new Date(a.expires_at).getTime() - Date.now()) / 3600_000));
  return {
    id: a.id,
    requesterId: a.requester_id,
    cardId: a.card_id,
    merchant: a.merchant,
    amount: a.amount,
    category: a.category,
    reason: a.reason,
    requestedAt: a.requested_at,
    expiryNote: a.status === 'pending' ? `Expires in ${hoursLeft} hours` : '—',
    status: a.status,
    resolvedBy: a.resolved_by ?? undefined,
    resolvedAt: a.resolved_at ?? undefined,
  };
}

function mapEvent(e: any): AuditEvent {
  return {
    id: String(e.id),
    kind: e.kind,
    title: e.title,
    subtitle: e.subtitle ?? undefined,
    amount: e.amount ?? undefined,
    memberId: e.member_id ?? undefined,
    at: e.at,
  };
}

// ------------------------------------------------------------ endpoints

export interface ServerPreparedAction {
  id: string;
  kind: string;
  source: 'agent' | 'user';
  subject: string;
  facts: { label: string; value: string }[];
  factsHash: string;
  cta: string;
  note: string;
  expiresAt: string;
  status: string;
}

export interface Receipt {
  actionId: string;
  title: string;
  rows: { label: string; value: string }[];
  actor: string;
  at: string;
  replayed?: boolean;
}

export const api = {
  request,

  /** Resolve the caller's server-side session (Privy bearer or dev header). */
  fetchSession: (headers: AuthHeaders) =>
    request<{ userId: string; name: string; role: string; isAdmin: boolean; kycStatus: string }>(
      '/api/session',
      headers,
    ),

  async fetchDomainState(headers: AuthHeaders): Promise<DomainState> {
    const [overview, members, cards, approvals, activity] = await Promise.all([
      request<any>('/api/overview', headers),
      request<any[]>('/api/members', headers),
      request<any[]>('/api/cards', headers),
      request<any[]>('/api/approvals', headers),
      request<{ transactions: any[]; events: any[] }>('/api/activity', headers),
    ]);
    const mappedCards = cards.map(mapCard);
    return {
      balances: {
        personal: overview.balances?.personal ?? 0,
        family: overview.balances?.family ?? 0,
      },
      household: {
        name: overview.household?.name ?? 'Household',
        budgetCap: overview.household?.budget_cap ?? 0,
        budgetSpent: overview.household?.budget_spent ?? 0,
      },
      members: members.map((m) => mapMember(m, mappedCards)),
      cards: mappedCards,
      transactions: activity.transactions.map(mapTxn),
      approvals: approvals.map(mapApproval),
      events: activity.events.map(mapEvent),
    };
  },

  freezeCard: (headers: AuthHeaders, cardId: string, frozen: boolean) =>
    request<Receipt>(`/api/cards/${cardId}/freeze`, headers, { body: { frozen } }),

  setChannel: (headers: AuthHeaders, cardId: string, channel: string, enabled: boolean) =>
    request(`/api/cards/${cardId}/channels`, headers, { body: { channel, enabled } }),

  setCategory: (headers: AuthHeaders, memberId: string, categoryKey: string, enabled: boolean) =>
    request(`/api/members/${memberId}/categories`, headers, { body: { categoryKey, enabled } }),

  approveOnce: (headers: AuthHeaders, approvalId: string) =>
    request<Receipt>(`/api/approvals/${approvalId}/approve-once`, headers, { body: {}, stepUp: true }),

  declineApproval: (headers: AuthHeaders, approvalId: string) =>
    request(`/api/approvals/${approvalId}/decline`, headers, { body: {} }),

  prepareAction: (headers: AuthHeaders, intent: object) =>
    request<ServerPreparedAction>('/api/actions/prepare', headers, { body: intent }),

  executeAction: (headers: AuthHeaders, actionId: string, factsHash: string, idempotencyKey: string) =>
    request<Receipt>(`/api/actions/${actionId}/execute`, headers, {
      body: { factsHash, idempotencyKey },
      stepUp: true,
    }),

  cancelAction: (headers: AuthHeaders, actionId: string) =>
    request(`/api/actions/${actionId}/cancel`, headers, { body: {} }),

  agentChat: (
    headers: AuthHeaders,
    messages: { role: 'user' | 'assistant'; content: string }[],
    contextMemberId?: string,
  ) =>
    request<{ mode: 'llm' | 'scripted'; degraded?: boolean; text: string; prepared: ServerPreparedAction[] }>(
      '/api/agent/chat',
      headers,
      { body: { messages, contextMemberId } },
    ),

  // Sensitive card credentials — step-up gated; never cached client-side.
  cardSensitive: (headers: AuthHeaders, cardId: string) =>
    request<{ available: boolean; reason?: string; cardNumber?: string; expiry?: string; cvv?: string }>(
      `/api/cards/${cardId}/sensitive`,
      { ...headers, 'x-auth-assertion': 'passkey-mock-ok' },
    ),

  // Deposits (Stellar rail)
  depositIntent: (headers: AuthHeaders) =>
    request<{
      network: string;
      address: string;
      memo: string;
      asset: string;
      rateInrPerUnit: number;
      note: string;
    }>('/api/deposits/intent', headers),
  syncDeposits: (headers: AuthHeaders) =>
    request<{ credited: number; unattributed: number; orderPayments: number }>('/api/deposits/sync', headers, {
      body: {},
    }),

  // KYC + card orders
  kycStatus: (headers: AuthHeaders) => request<{ status: 'none' | 'pending' | 'approved' }>('/api/kyc', headers),
  submitKyc: (headers: AuthHeaders, fullName: string, document: string) =>
    request<{ status: string }>('/api/kyc/submit', headers, { body: { fullName, document } }),
  createCardOrder: (headers: AuthHeaders, input: { cardType: string; nickname: string; memberId?: string }) =>
    request<{
      orderId: string;
      status: string;
      priceInr: number;
      priceUsd: number;
      payment: { network: string; address: string; memo: string; asset: string; amountUnits: number; note: string };
    }>('/api/card-orders', headers, { body: input }),
  myOrders: (headers: AuthHeaders) => request<any[]>('/api/card-orders', headers),

  // Admin console
  adminOrders: (headers: AuthHeaders) =>
    request<{ providerPool: { provider: string; balance_usd: number }; orders: any[] }>(
      '/api/admin/orders',
      headers,
    ),
  adminKycQueue: (headers: AuthHeaders) =>
    request<{ id: string; name: string; kyc_status: string }[]>('/api/admin/kyc', headers),
  adminReviewKyc: (headers: AuthHeaders, userId: string, approve: boolean) =>
    request(`/api/admin/kyc/${userId}/review`, headers, { body: { approve } }),
  adminApproveOrder: (headers: AuthHeaders, orderId: string) =>
    request(`/api/admin/orders/${orderId}/approve`, headers, { body: {}, stepUp: true }),
  adminRejectOrder: (headers: AuthHeaders, orderId: string, note: string) =>
    request(`/api/admin/orders/${orderId}/reject`, headers, { body: { note } }),
};
