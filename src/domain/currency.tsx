// Display currency. The server stores every amount as integer INR rupees
// (`i32` — see server/spacetimedb/src/schema.ts), so this module never changes
// what is stored: it converts at the very last step, on the way to the screen.
//
// Consequences worth knowing before touching this:
//   · USD cents are DERIVED precision that does not exist in the data. Two
//     rupee amounts one rupee apart render identical cents. Fine for display,
//     wrong as an input — which is why every amount field in the app stays
//     rupee-denominated.
//   · Never add formatted strings together. ₹1 ≈ $0.011, so ~88 distinct rupee
//     values collapse onto the same cent and a column of line items will not
//     visibly sum to a total. Do the arithmetic in rupees, format last.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type CurrencyCode = 'INR' | 'USD';

/**
 * Mirrors the server's `pool.rate_inr_per_unit`, seeded to 88. Held here as a
 * constant so the display toggle needs no backend change — the tradeoff is
 * that it can drift from the live pool rate, which the deposit screen renders
 * straight from the server.
 */
export const INR_PER_USD = 88;

// The locale has to be paired to the currency: `en-IN` + USD renders the
// amount as "US$1,095.57".
const formatters: Record<CurrencyCode, Intl.NumberFormat> = {
  INR: new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }),
  USD: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
};

const SYMBOL: Record<CurrencyCode, string> = { INR: '₹', USD: '$' };

/** `rupees` is always the integer the server stores. */
export function formatIn(code: CurrencyCode, rupees: number): string {
  return code === 'INR'
    ? formatters.INR.format(Math.round(rupees))
    : formatters.USD.format(rupees / INR_PER_USD);
}

/**
 * Splits a formatted amount into its symbol and its digits, so a caller that
 * paints the symbol separately (the rolling odometer) never rolls it.
 * `formatToParts` is the correct tool; the manual split is a fallback in case
 * a given Hermes build ships without it.
 */
export function splitCurrency(
  code: CurrencyCode,
  rupees: number,
): { symbol: string; digits: string } {
  const value = code === 'INR' ? Math.round(rupees) : rupees / INR_PER_USD;
  const fmt = formatters[code];

  if (typeof fmt.formatToParts === 'function') {
    const parts = fmt.formatToParts(Math.abs(value));
    let symbol = '';
    let digits = '';
    for (const p of parts) {
      if (p.type === 'currency') symbol += p.value;
      else if (p.type !== 'literal') digits += p.value;
    }
    if (symbol && digits) return { symbol, digits };
  }

  const whole = fmt.format(Math.abs(value));
  const first = whole.search(/[\d]/);
  return first > 0
    ? { symbol: whole.slice(0, first).trim(), digits: whole.slice(first) }
    : { symbol: SYMBOL[code], digits: whole };
}

interface CurrencyValue {
  readonly code: CurrencyCode;
  readonly symbol: string;
  /** Format an amount held in rupees for display in the active currency. */
  readonly formatMoney: (rupees: number) => string;
  /** Signed amount for transaction contexts: debit "−$7.27", credit "+$1.36". */
  readonly formatSigned: (rupees: number, direction: 'debit' | 'credit') => string;
  /** Cycle USD → INR → USD. */
  readonly toggle: () => void;
}

const CurrencyContext = createContext<CurrencyValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  // Session-only on purpose. Persisting it would need to sit behind the same
  // readiness gate the theme uses, or a USD user gets a ₹ → $ flash on cold
  // boot — and "tap the hero to peek at USD" reads as a session gesture.
  const [code, setCode] = useState<CurrencyCode>('USD');

  const value = useMemo<CurrencyValue>(() => {
    // Memoized on `code` alone so these keep a stable identity per currency:
    // several screens build strings with `formatMoney` inside a `useMemo`, and
    // an unstable function would rebuild those on every render.
    const formatMoney = (rupees: number) => formatIn(code, rupees);
    return {
      code,
      symbol: SYMBOL[code],
      formatMoney,
      formatSigned: (rupees, direction) => {
        const base = formatMoney(Math.abs(rupees));
        return direction === 'credit' ? `+${base}` : `−${base}`;
      },
      toggle: () => setCode((c) => (c === 'USD' ? 'INR' : 'USD')),
    };
  }, [code]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useMoney(): CurrencyValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useMoney must be used inside a CurrencyProvider');
  return ctx;
}
