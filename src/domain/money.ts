// Locale-aware money formatting (spec §62: never concatenate currency
// symbols manually). Demo currency is INR throughout (spec §61: one
// currency per flow).

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function formatMoney(amount: number): string {
  return inrWhole.format(amount);
}

/** Signed amount for transaction contexts: debit "−₹640", credit "+₹41". */
export function formatSigned(amount: number, direction: 'debit' | 'credit'): string {
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
  const time = then.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Exact timestamp for detail screens. */
export function exactTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** Day bucket label for the Activity feed. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (then.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
}
