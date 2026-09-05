/**
 * Invoice arithmetic, in one place.
 *
 * These three lines are the definition of what a student owes, and they are now
 * needed by the routes, by the reminder job and by the sign-in check. Keeping
 * them here rather than in a route file means there is exactly one answer to
 * "how much is left on this invoice".
 */

export const CURRENCY = "IQD";

export interface InvoiceShape {
  amount?: number;
  discount?: number;
  paid_amount?: number;
  status?: string;
  [key: string]: unknown;
}

/** The amount actually charged: the price less any discount. */
export function netAmount(inv: InvoiceShape): number {
  return Math.max(0, Number(inv.amount || 0) - Number(inv.discount || 0));
}

/** What is still unpaid. A cancelled invoice is owed nothing. */
export function remainingAmount(inv: InvoiceShape): number {
  if (inv.status === "cancelled") return 0;
  return Math.max(0, netAmount(inv) - Number(inv.paid_amount || 0));
}

/** Today as an ISO date, the form every `due_date` is stored in. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Whole days from today until `date`; negative once it has passed. */
export function daysUntil(date: string): number {
  const due = Date.parse(date + "T00:00:00Z");
  const now = Date.parse(todayIso() + "T00:00:00Z");
  if (Number.isNaN(due)) return Number.POSITIVE_INFINITY;
  return Math.round((due - now) / 86_400_000);
}
