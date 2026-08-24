// Card Integration Layer (spec §55). Merchant-facing card operations go
// through a provider adapter; the domain layer never talks HTTP directly.
//
// KripiCard adapter targets the real external API
// (https://www.kripicard.com/api-docs — base https://appapi.kripicard.com):
//   POST /api/external/cards/createcard    { api_key, bin, amount(≥$10), name_on_card, email?, dateOfBirth? }
//                                          → { success, card_id, last_4, fee, total_charged }
//   POST /api/external/cards/fundcard      { api_key, card_id, amount(≥$10) } → fee $1 + 4%
//   POST /api/external/cards/carddetails   { api_key, card_id } → { card_number, expiry, cvv, balance, status }
//   POST /api/external/premium/Freeze_Unfreeze { api_key, card_id, action: "freeze"|"unfreeze" }
//
// The 202 contract: any purchase endpoint may answer HTTP 202 with
// pending:true — NEVER a success and NEVER safe to auto-retry (retrying
// is the one path that can double-charge). No `code` → already refunded;
// code REFUND_PENDING → still charged, support is on it. A clean 4xx
// (success:false, no pending) means nothing was charged.
//
// BINs: 539502/525847/… (MasterCard HK, no DOB); 537872 US, 533171 SG and
// 246001 UK require dateOfBirth. Default BIN is HK to avoid the DOB
// requirement.
//
// The mock provider (default when KRIPICARD_API_KEY is unset) keeps the
// same interface so every domain flow works offline and in tests.

export interface IssueCardInput {
  amountUsd: number;
  firstName?: string;
  lastName?: string;
}

export interface CardProvider {
  readonly name: 'kripicard' | 'mock';
  issueCard(input: IssueCardInput): Promise<{ providerCardId: string; last4?: string }>;
  fundCard(providerCardId: string, amountUsd: number): Promise<{ reference: string; feeUsd: number }>;
  setFrozen(providerCardId: string, frozen: boolean): Promise<void>;
  getDetails(providerCardId: string): Promise<unknown>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    /** True for the 202 contract — the outcome is unresolved upstream and
     * the call must NOT be retried (double-charge risk). */
    public readonly pending = false,
  ) {
    super(message);
  }
}

// ------------------------------------------------------------- KripiCard

const KRIPI_BASE = process.env.KRIPICARD_BASE_URL ?? 'https://appapi.kripicard.com';

export class KripiCardProvider implements CardProvider {
  readonly name = 'kripicard' as const;

  constructor(
    private apiKey: string,
    private bin: string,
    private fetchFn: typeof fetch = fetch,
  ) {}

  private async post(path: string, body: Record<string, string | number>): Promise<any> {
    const res = await this.fetchFn(`${KRIPI_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: this.apiKey, ...body }),
    });
    const json: any = await res.json().catch(() => null);

    // 202 = unresolved purchase. Refunded unless code says otherwise; in
    // both cases retrying could double-charge, so surface and stop.
    if (res.status === 202 || json?.pending === true) {
      const message =
        json?.code === 'REFUND_PENDING'
          ? 'KripiCard could not complete the order and the automatic refund is pending — the wallet is still charged. Contact KripiCard support; do not retry.'
          : 'KripiCard could not confirm the order — the wallet was not charged. Do not retry automatically.';
      throw new ProviderError(message, true);
    }
    if (res.status === 429) {
      throw new ProviderError(
        `KripiCard rate limit (${json?.scope ?? 'unknown'}) — retry after ${json?.retry_after_seconds ?? '?'}s.`,
      );
    }
    if (!res.ok || !json?.success) {
      throw new ProviderError(`KripiCard ${path} failed: ${json?.message ?? res.status}`);
    }
    return json;
  }

  async issueCard(input: IssueCardInput): Promise<{ providerCardId: string; last4?: string }> {
    if (input.amountUsd < 10) throw new ProviderError('KripiCard minimum initial load is $10.');
    const name = [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || 'Kami Member';
    const json = await this.post('/api/external/cards/createcard', {
      bin: this.bin,
      amount: input.amountUsd,
      name_on_card: name.slice(0, 50),
    });
    return {
      providerCardId: String(json.card_id),
      last4: json.last_4 ? String(json.last_4) : undefined,
    };
  }

  async fundCard(providerCardId: string, amountUsd: number) {
    if (amountUsd < 10) throw new ProviderError('KripiCard minimum funding is $10.');
    const json = await this.post('/api/external/cards/fundcard', {
      card_id: providerCardId,
      amount: amountUsd,
    });
    return {
      reference: String(json.data?.card_id ?? providerCardId),
      feeUsd: Number(json.data?.fee ?? 0),
    };
  }

  async setFrozen(providerCardId: string, frozen: boolean): Promise<void> {
    await this.post('/api/external/premium/Freeze_Unfreeze', {
      card_id: providerCardId,
      action: frozen ? 'freeze' : 'unfreeze',
    });
  }

  async getDetails(providerCardId: string): Promise<unknown> {
    const json = await this.post('/api/external/cards/carddetails', { card_id: providerCardId });
    // Flat shape: { card_number, expiry, cvv, balance, status }
    return {
      card_number: json.card_number,
      expiry: json.expiry,
      cvv: json.cvv,
      balance: json.balance,
      status: json.status,
    };
  }
}

// ------------------------------------------------------------------ Mock

export class MockCardProvider implements CardProvider {
  readonly name = 'mock' as const;
  private seq = 0;
  public frozen = new Map<string, boolean>();
  public funded: { providerCardId: string; amountUsd: number }[] = [];

  async issueCard(input: IssueCardInput): Promise<{ providerCardId: string; last4?: string }> {
    if (input.amountUsd < 10) throw new ProviderError('Minimum initial load is $10.');
    this.seq += 1;
    return { providerCardId: `mock-card-${this.seq}` };
  }

  async fundCard(providerCardId: string, amountUsd: number) {
    if (amountUsd < 10) throw new ProviderError('Minimum funding is $10.');
    this.funded.push({ providerCardId, amountUsd });
    return { reference: `mock-ref-${this.funded.length}`, feeUsd: Math.round(amountUsd * 0.02 * 100) / 100 };
  }

  async setFrozen(providerCardId: string, frozen: boolean): Promise<void> {
    this.frozen.set(providerCardId, frozen);
  }

  async getDetails(providerCardId: string): Promise<unknown> {
    // Standard test-card credentials so the reveal flow works end-to-end
    // in dev; replaced by real KripiCard data when keys are configured.
    return {
      details: {
        card_id: providerCardId,
        card_number: '4242 4242 4242 4242',
        expiration: '12/29',
        cvv: '000',
        status: this.frozen.get(providerCardId) ? 'frozen' : 'active',
      },
      Transactions: [],
    };
  }
}

export function createProvider(): CardProvider {
  const key = process.env.KRIPICARD_API_KEY;
  if (key) {
    const bin = process.env.KRIPICARD_BIN ?? process.env.KRIPICARD_BANK_BIN ?? '539502';
    return new KripiCardProvider(key, bin);
  }
  return new MockCardProvider();
}
