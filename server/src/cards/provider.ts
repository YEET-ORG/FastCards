// Card Integration Layer (spec §55). Merchant-facing card operations go
// through a provider adapter; the domain layer never talks HTTP directly.
//
// KripiCard adapter targets the documented API
// (https://home.kripicard.com/api): base `…/api/premium`, `api_key`
// auth param, USD amounts (min $10).
//   POST /Create_card      { api_key, amount, bankBin, first_name?, last_name? } → { success, message, card_id }
//   POST /Fund_Card        { api_key, card_id, amount } → { success, data: { …, fee, total_debited, reference } }
//   GET  /Get_CardDetails  ?api_key&card_id → { success, data: { details, Transactions } }
//   POST /Freeze_Unfreeze  { api_key, card_id, action: "freeze"|"unfreeze" } → { success, data: { status } }
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
  issueCard(input: IssueCardInput): Promise<{ providerCardId: string }>;
  fundCard(providerCardId: string, amountUsd: number): Promise<{ reference: string; feeUsd: number }>;
  setFrozen(providerCardId: string, frozen: boolean): Promise<void>;
  getDetails(providerCardId: string): Promise<unknown>;
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
  }
}

// ------------------------------------------------------------- KripiCard

const KRIPI_BASE = process.env.KRIPICARD_BASE_URL ?? 'https://home.kripicard.com/api/premium';

export class KripiCardProvider implements CardProvider {
  readonly name = 'kripicard' as const;

  constructor(
    private apiKey: string,
    private bankBin: string,
    private fetchFn: typeof fetch = fetch,
  ) {}

  private async post(path: string, body: Record<string, string | number>): Promise<any> {
    const res = await this.fetchFn(`${KRIPI_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: this.apiKey, ...body }),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      throw new ProviderError(`KripiCard ${path} failed: ${json?.message ?? res.status}`);
    }
    return json;
  }

  async issueCard(input: IssueCardInput): Promise<{ providerCardId: string }> {
    if (input.amountUsd < 10) throw new ProviderError('KripiCard minimum initial load is $10.');
    const json = await this.post('/Create_card', {
      amount: input.amountUsd,
      bankBin: this.bankBin,
      ...(input.firstName ? { first_name: input.firstName.slice(0, 50) } : {}),
      ...(input.lastName ? { last_name: input.lastName.slice(0, 50) } : {}),
    });
    return { providerCardId: String(json.card_id) };
  }

  async fundCard(providerCardId: string, amountUsd: number) {
    if (amountUsd < 10) throw new ProviderError('KripiCard minimum funding is $10.');
    const json = await this.post('/Fund_Card', { card_id: providerCardId, amount: amountUsd });
    return { reference: String(json.data?.reference ?? ''), feeUsd: Number(json.data?.fee ?? 0) };
  }

  async setFrozen(providerCardId: string, frozen: boolean): Promise<void> {
    await this.post('/Freeze_Unfreeze', {
      card_id: providerCardId,
      action: frozen ? 'freeze' : 'unfreeze',
    });
  }

  async getDetails(providerCardId: string): Promise<unknown> {
    const url = `${KRIPI_BASE}/Get_CardDetails?api_key=${encodeURIComponent(this.apiKey)}&card_id=${encodeURIComponent(providerCardId)}`;
    const res = await this.fetchFn(url);
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      throw new ProviderError(`KripiCard Get_CardDetails failed: ${json?.message ?? res.status}`);
    }
    return json.data;
  }
}

// ------------------------------------------------------------------ Mock

export class MockCardProvider implements CardProvider {
  readonly name = 'mock' as const;
  private seq = 0;
  public frozen = new Map<string, boolean>();
  public funded: { providerCardId: string; amountUsd: number }[] = [];

  async issueCard(input: IssueCardInput): Promise<{ providerCardId: string }> {
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
  const bin = process.env.KRIPICARD_BANK_BIN;
  if (key && bin) return new KripiCardProvider(key, bin);
  return new MockCardProvider();
}
