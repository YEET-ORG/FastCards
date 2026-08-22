// Locale-aware money formatting (spec §62: never concatenate currency
// symbols manually). Amounts are stored as integer INR rupees throughout.
//
// These two are the *unconditional rupee* formatters. Screens should almost
// always use `useMoney()` from `@/domain/currency` instead, which honours the
// user's display-currency choice — the `INR` suffix here is deliberate, so
// that reaching for the always-rupees version is a visible decision rather
// than an accident.

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

// Hoisted like `inrWhole`: these are called per feed row, and building an Intl
// formatter per call is the avoidable cost (Hermes constructs one each time).
const timeShort = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const dayMonthLong = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long' });
const dayMonthYear = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatMoneyINR(amount: number): string {
  return inrWhole.format(amount);
}

/** Signed amount for transaction contexts: debit "−₹640", credit "+₹41". */
export function formatSignedINR(amount: number, direction: 'debit' | 'credit'): string {
  const base = inrWhole.format(Math.abs(amount));
  return direction === 'credit' ? `+${base}` : `−${base}`;
}

/** Relative time for feed rows (spec §49); exact dates belong on detail screens. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}m`;
  const sameDay = then.toDateString() === now.toDateString();
  const time = timeShort.format(then);
  if (sameDay) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return dayMonth.format(then);
}

/** Exact timestamp for detail screens. */
export function exactTime(iso: string): string {
  const d = new Date(iso);
  return dayMonthYear.format(d) + ', ' + timeShort.format(d);
}

/** Day bucket label for the Activity feed. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (then.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return dayMonthLong.format(then);
}
