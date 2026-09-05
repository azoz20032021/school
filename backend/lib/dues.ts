import { doc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { chunk, db, invoicesRef, notificationsRef } from "./db.js";
import { CURRENCY, daysUntil, netAmount, remainingAmount, todayIso } from "./money.js";
import { feeView } from "./fees.js";

/**
 * Fee reminders and the overdue lock.
 *
 * The school's problem was that nobody was told a payment was coming until it
 * was late. An invoice now warns the student twice — a fortnight out and again
 * a week out — and says so once more the day after it lapses. Once an invoice
 * is past its due date and still unpaid, the student's account is locked to a
 * single screen telling them to settle it at the office.
 *
 * There is no scheduler on either host, so the sweep runs opportunistically:
 * any signed-in request may trigger it, and it does real work at most once an
 * hour per warm instance. Each stage is marked on the invoice, so a reminder is
 * sent once no matter how many times the sweep runs.
 */

/** Days before the due date at which a reminder goes out. */
const STAGES = [
  { days: 14, flag: "reminder_14_sent", title: "تذكير: موعد قسط بعد أسبوعين" },
  { days: 7, flag: "reminder_7_sent", title: "تذكير: موعد قسط بعد أسبوع" },
] as const;

const OVERDUE_FLAG = "reminder_overdue_sent";
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const BATCH_LIMIT = 200;

export interface StudentDues {
  outstanding: number;
  /** The earliest date still owed. */
  next_due_date: string | null;
  /** True when that date has passed with money still owed. */
  blocked: boolean;
}

/**
 * What a student owes, read straight off their own account record.
 *
 * This is checked on every sign-in and on every app start, so it used to be a
 * query per boot against that student's invoices. The figures now live on the
 * student document, which the caller has already loaded to authenticate them —
 * so the check costs nothing at all.
 */
export function duesFromUser(student: Record<string, any>): StudentDues {
  const fees = feeView(student);
  return {
    outstanding: fees.fees_outstanding,
    next_due_date: fees.fees_next_due,
    blocked: fees.is_overdue,
  };
}

function money(amount: number): string {
  return `${amount.toLocaleString("en-US")} ${CURRENCY}`;
}

let lastSweep = 0;
let sweepInFlight: Promise<void> | null = null;

/**
 * Send any reminder that has come due. Safe to call from anywhere; it returns
 * immediately when it ran recently.
 */
export function maybeSendDueReminders(): void {
  const now = Date.now();
  if (sweepInFlight || now - lastSweep < SWEEP_INTERVAL_MS) return;

  lastSweep = now;
  sweepInFlight = sendDueReminders()
    .then(() => undefined)
    .catch((err) => console.error("[dues] reminder sweep failed:", err?.message || err))
    .finally(() => { sweepInFlight = null; });
}

/** The sweep itself, exported so it can also be triggered deliberately. */
export async function sendDueReminders(): Promise<{ sent: number }> {
  // Only unpaid invoices can carry a reminder, and only those with a due date.
  const snapshot = await getDocs(query(invoicesRef, where("status", "in", ["unpaid", "partial"])));

  const pending: { id: string; flag: string; studentId: string; title: string; message: string }[] = [];

  for (const d of snapshot.docs) {
    const inv: Record<string, any> = { id: d.id, ...(d.data() as Record<string, any>) };
    if (!inv.due_date || !inv.student_id) continue;

    const remaining = remainingAmount(inv);
    if (remaining <= 0) continue;

    const left = daysUntil(inv.due_date);

    if (left < 0) {
      if (inv[OVERDUE_FLAG]) continue;
      pending.push({
        id: inv.id,
        flag: OVERDUE_FLAG,
        studentId: inv.student_id,
        title: "تأخر في تسديد القسط",
        message:
          `انتهى موعد تسديد "${inv.title}" بتاريخ ${inv.due_date} والمبلغ المتبقي ${money(remaining)}. ` +
          `يرجى مراجعة إدارة المدرسة للتسديد.`,
      });
      continue;
    }

    // The nearest stage that has been reached and not yet announced.
    const stage = STAGES.find((s) => left <= s.days && !inv[s.flag]);
    if (!stage) continue;

    pending.push({
      id: inv.id,
      flag: stage.flag,
      studentId: inv.student_id,
      title: stage.title,
      message:
        `يستحق "${inv.title}" بتاريخ ${inv.due_date} (بعد ${left} يوم) والمبلغ المتبقي ${money(remaining)}.`,
    });
  }

  for (const group of chunk(pending, BATCH_LIMIT)) {
    const batch = writeBatch(db);
    for (const item of group) {
      batch.set(doc(notificationsRef), {
        user_id: item.studentId,
        title: item.title,
        message: item.message,
        type: "finance",
        isRead: false,
        createdAt: serverTimestamp(),
      });
      // Marking the invoice is what makes the sweep idempotent.
      batch.update(doc(invoicesRef, item.id), { [item.flag]: true, [`${item.flag}_at`]: serverTimestamp() });
    }
    await batch.commit();
  }

  if (pending.length > 0) console.log(`[dues] sent ${pending.length} fee reminder(s)`);
  return { sent: pending.length };
}

/** Re-exported so callers need only this module. */
export { netAmount, remainingAmount, todayIso };
