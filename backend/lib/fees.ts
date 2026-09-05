import {
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { chunk, db, fetchAll, invoicesRef, usersRef } from "./db.js";
import { invalidate } from "./cache.js";
import { netAmount, remainingAmount, todayIso } from "./money.js";

/**
 * Each student's fee position, kept on their own account document.
 *
 * Answering "what does this student owe?" used to mean reading the school's
 * entire invoice collection — several hundred documents — and it was asked on
 * every visit to the finance screen, on every debt report and on every sign-in.
 * The four numbers below are now written to the student's record whenever their
 * invoices change, so the same questions are answered by data the caller has
 * already loaded, at no extra cost.
 *
 * `fees_next_due` is the earliest date still owed. Storing that rather than an
 * "overdue" flag matters: an invoice lapses because the calendar moved, not
 * because anyone wrote to the database, so a stored flag would rot while a
 * stored date stays true.
 */

export interface FeeTotals {
  fees_billed: number;
  fees_paid: number;
  fees_outstanding: number;
  fees_next_due: string | null;
}

const BATCH_LIMIT = 400;

export function computeFees(invoices: Record<string, any>[]): FeeTotals {
  let billed = 0;
  let paid = 0;
  let nextDue: string | null = null;

  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    billed += netAmount(inv);
    paid += Number(inv.paid_amount || 0);

    if (remainingAmount(inv) > 0 && inv.due_date) {
      if (nextDue === null || inv.due_date < nextDue) nextDue = inv.due_date;
    }
  }

  return {
    fees_billed: billed,
    fees_paid: paid,
    fees_outstanding: Math.max(0, billed - paid),
    fees_next_due: nextDue,
  };
}

/** Read one student's invoices — a handful of documents — and store the totals. */
export async function recomputeStudentFees(studentId: string): Promise<FeeTotals> {
  const invoices = await fetchAll<Record<string, any>>(
    query(invoicesRef, where("student_id", "==", studentId))
  );
  const totals = computeFees(invoices);

  await updateDoc(doc(usersRef, studentId), { ...totals, fees_updated_at: serverTimestamp() });
  invalidate("students");
  return totals;
}

/** The same, for the handful of students one action can touch. */
export async function recomputeStudentsFees(studentIds: string[]): Promise<void> {
  const unique = [...new Set(studentIds.filter(Boolean))];
  for (const id of unique) {
    await recomputeStudentFees(id);
  }
}

/**
 * Bulk billing — the same invoice issued to a class or to the whole school.
 *
 * Recomputing each student in turn would cost one query per student, so the
 * amounts are applied as atomic increments instead: no read, and two
 * simultaneous issues cannot lose each other's money. The earliest-due date is
 * advisory, so it is compared against whatever the (cached) roster last saw;
 * if that comparison is ever wrong the figure is corrected by the next
 * recompute, and the amounts are never affected.
 */
export async function applyBulkBilling(
  studentIds: string[],
  amountPerStudent: number,
  dueDate: string | null,
  currentNextDue: Map<string, string | null>
): Promise<void> {
  for (const group of chunk(studentIds, BATCH_LIMIT)) {
    const batch = writeBatch(db);
    for (const studentId of group) {
      const patch: Record<string, any> = {
        fees_billed: increment(amountPerStudent),
        fees_outstanding: increment(amountPerStudent),
        fees_updated_at: serverTimestamp(),
      };

      if (dueDate) {
        const known = currentNextDue.get(studentId) ?? null;
        if (!known || dueDate < known) patch.fees_next_due = dueDate;
      }

      batch.update(doc(usersRef, studentId), patch);
    }
    await batch.commit();
  }
  invalidate("students");
}

/**
 * Recompute every student from scratch.
 *
 * Needed once, to fill in accounts that existed before these fields did, and
 * useful afterwards as a repair if anything is ever suspected of drifting. It
 * reads the whole invoice collection exactly once and writes one document per
 * student, so it is the expensive operation these fields exist to avoid — which
 * is why it is a button somebody presses, not something that runs on its own.
 */
export async function rebuildAllStudentFees(): Promise<{ students: number; invoices: number }> {
  const [students, invoices] = await Promise.all([
    getDocs(query(usersRef, where("role", "==", "student"))),
    fetchAll<Record<string, any>>(invoicesRef),
  ]);

  const byStudent = new Map<string, Record<string, any>[]>();
  for (const inv of invoices) {
    const list = byStudent.get(inv.student_id) || [];
    list.push(inv);
    byStudent.set(inv.student_id, list);
  }

  const rows = students.docs.map((d) => ({ id: d.id, totals: computeFees(byStudent.get(d.id) || []) }));

  for (const group of chunk(rows, BATCH_LIMIT)) {
    const batch = writeBatch(db);
    for (const row of group) {
      batch.update(doc(usersRef, row.id), { ...row.totals, fees_updated_at: serverTimestamp() });
    }
    await batch.commit();
  }

  invalidate("students");
  invalidate("finance");
  return { students: rows.length, invoices: invoices.length };
}

/* ------------------------------------------------------------------ *
 * Reading the stored figures back
 * ------------------------------------------------------------------ */

export interface StudentFeeView extends FeeTotals {
  is_clear: boolean;
  /** A date still owed has passed. */
  is_overdue: boolean;
}

/** Interpret a student record's stored totals against today's date. */
export function feeView(student: Record<string, any>): StudentFeeView {
  const billed = Number(student.fees_billed || 0);
  const paid = Number(student.fees_paid || 0);
  const outstanding = Math.max(0, Number(student.fees_outstanding ?? billed - paid));
  const nextDue = (student.fees_next_due as string) || null;

  return {
    fees_billed: billed,
    fees_paid: paid,
    fees_outstanding: outstanding,
    fees_next_due: nextDue,
    is_clear: outstanding === 0,
    is_overdue: outstanding > 0 && Boolean(nextDue) && nextDue! < todayIso(),
  };
}
