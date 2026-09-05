import { Router } from "express";
import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  chunk,
  classesRef,
  db,
  enrollmentsRef,
  fetchAll,
  fetchPage,
  getDocsByIds,
  invoicesRef,
  notificationsRef,
  paymentsRef,
  usersRef,
} from "../lib/db.js";
import { requireAdmin, requireAuth, requireSelfOrStaff, requireStaff } from "../lib/auth.js";
import { cached, invalidate } from "../lib/cache.js";
import { CURRENCY, netAmount, remainingAmount, type InvoiceShape } from "../lib/money.js";
import { sendDueReminders } from "../lib/dues.js";
import { matchesStudent, normalizeArabic, paginate, studentRoster } from "../lib/roster.js";
import { audit } from "../lib/audit.js";
import { badRequest, notFound, wrap } from "../lib/http.js";
import * as v from "../lib/validate.js";

const router = Router();

export { CURRENCY, netAmount, remainingAmount } from "../lib/money.js";

const CATEGORIES = ["قسط دراسي", "رسوم تسجيل", "كتب وقرطاسية", "نقل مدرسي", "زي مدرسي", "نشاطات", "أخرى"] as const;
const METHODS = ["نقدي", "تحويل بنكي", "محفظة إلكترونية", "شيك"] as const;
const INVOICE_STATUSES = ["unpaid", "partial", "paid", "cancelled"] as const;

const BATCH_LIMIT = 450;
const DEFAULT_PAGE_SIZE = 20;

/** How long the cached invoice scan may be reused; every write drops it. */
const FINANCE_TTL_MS = 30_000;

function deriveStatus(inv: InvoiceShape): string {
  if (inv.status === "cancelled") return "cancelled";
  const paid = Number(inv.paid_amount || 0);
  const net = netAmount(inv);
  if (paid <= 0) return "unpaid";
  if (paid >= net) return "paid";
  return "partial";
}

/* ------------------------------------------------------------------ *
 * Invoices
 * ------------------------------------------------------------------ */

router.get(
  "/admin/invoices",
  requireStaff,
  wrap(async (req, res) => {
    const pageSize = v.num(req.query.limit, "الحد", { min: 1, max: 100, optional: true, default: DEFAULT_PAGE_SIZE });
    const cursor = req.query.after ? String(req.query.after) : null;

    const filters: any[] = [];
    if (req.query.student_id) filters.push(where("student_id", "==", String(req.query.student_id)));
    if (req.query.class_id) filters.push(where("class_id", "==", String(req.query.class_id)));
    if (req.query.status) {
      filters.push(where("status", "==", v.oneOf(req.query.status, "الحالة", INVOICE_STATUSES)));
    }

    const base = filters.length ? query(invoicesRef, ...filters) : invoicesRef;
    const q = query(base as any, orderBy("createdAt", "desc"));
    const { data, nextCursor } = await fetchPage<Record<string, any>>(q, pageSize, cursor, invoicesRef, {
      base,
      sortField: "createdAt",
      direction: "desc",
      label: "invoices by student/class/status, newest first",
    });

    res.json({
      data: data.map((inv) => ({ ...inv, net_amount: netAmount(inv), remaining: remainingAmount(inv) })),
      nextCursor,
    });
  })
);

/**
 * Create one invoice, or the same invoice for a whole class / every student.
 * Bulk creation goes through batched writes rather than a `for` loop of
 * `addDoc`, so issuing 400 tuition invoices is a few round trips, not 400.
 */
router.post(
  "/admin/invoices",
  requireStaff,
  wrap(async (req, res) => {
    const b = req.body || {};
    const target = v.oneOf(b.target, "الفئة المستهدفة", ["student", "class", "all"] as const, "student");

    const title = v.str(b.title, "عنوان الرسوم", { min: 2, max: 120 });
    const category = v.oneOf(b.category, "نوع الرسوم", CATEGORIES, "قسط دراسي");
    const amount = v.num(b.amount, "المبلغ", { min: 1, max: 1_000_000_000 });
    const discount = v.num(b.discount, "الخصم", { min: 0, max: amount, optional: true });
    const dueDate = v.isoDate(b.due_date, "تاريخ الاستحقاق", { optional: true }) || null;
    const term = v.str(b.term, "الفصل الدراسي", { max: 60, optional: true }) || null;
    const academicYear = v.num(b.academic_year, "السنة الدراسية", {
      min: 2000,
      max: 2100,
      optional: true,
      default: new Date().getFullYear(),
    });

    // Resolve the target students.
    let studentIds: string[] = [];
    let classId: string | null = null;

    if (target === "student") {
      studentIds = [v.str(b.student_id, "الطالب", { max: 64 })];
    } else if (target === "class") {
      classId = v.str(b.class_id, "الصف", { max: 64 });
      const enrollments = await fetchAll<{ student_id: string }>(
        query(enrollmentsRef, where("class_id", "==", classId))
      );
      studentIds = [...new Set(enrollments.map((e) => e.student_id))];
    } else {
      const students = await fetchAll<Record<string, any>>(query(usersRef, where("role", "==", "student")));
      studentIds = students.filter((s) => s.status !== "suspended").map((s) => s.id);
    }

    if (studentIds.length === 0) throw badRequest("لا يوجد طلاب مطابقون لإصدار الرسوم لهم");

    // Fetch student + class names once, then reuse across every invoice.
    const students = await getDocsByIds<Record<string, any>>(usersRef, studentIds);
    const enrollments = await fetchAll<{ student_id: string; class_id: string }>(enrollmentsRef);
    const enrollmentByStudent = new Map(enrollments.map((e) => [e.student_id, e.class_id]));
    const classNames = new Map(
      (await fetchAll<{ name: string }>(classesRef)).map((c) => [c.id, c.name])
    );

    let created = 0;
    for (const group of chunk(studentIds, BATCH_LIMIT)) {
      const batch = writeBatch(db);
      for (const studentId of group) {
        const student = students.get(studentId);
        if (!student) continue;

        const studentClassId = classId || enrollmentByStudent.get(studentId) || null;

        batch.set(doc(invoicesRef), {
          student_id: studentId,
          student_name: student.name,
          student_uid: student.uid,
          class_id: studentClassId,
          class_name: studentClassId ? classNames.get(studentClassId) || null : null,
          title,
          category,
          amount,
          discount,
          paid_amount: 0,
          currency: CURRENCY,
          due_date: dueDate,
          term,
          academic_year: academicYear,
          status: "unpaid",
          created_by: req.user!.id,
          created_by_name: req.user!.name,
          createdAt: serverTimestamp(),
        });

        batch.set(doc(notificationsRef), {
          user_id: studentId,
          title: "رسوم مالية جديدة",
          message: `تم إصدار "${title}" بمبلغ ${(amount - discount).toLocaleString("en-US")} ${CURRENCY}${
            dueDate ? ` — تاريخ الاستحقاق ${dueDate}` : ""
          }`,
          type: "invoice",
          isRead: false,
          createdAt: serverTimestamp(),
        });
        created++;
      }
      await batch.commit();
    }

    // The cached invoice scan no longer reflects the ledger.
    invalidate("finance");
    audit(req, {
      action: "create",
      entity: "invoice",
      summary: `إصدار "${title}" لعدد ${created} طالب بمبلغ ${amount - discount} ${CURRENCY}`,
      meta: { target, class_id: classId, amount, discount },
    });

    res.status(201).json({ success: true, count: created });
  })
);

router.put(
  "/admin/invoices/:id",
  requireStaff,
  wrap(async (req, res) => {
    const invoiceDoc = doc(db, "invoices", req.params.id);
    const snap = await getDoc(invoiceDoc);
    if (!snap.exists()) throw notFound("سند الرسوم غير موجود");

    const current = snap.data() as Record<string, any>;
    const b = req.body || {};
    const patch: Record<string, any> = {};

    if (b.title !== undefined) patch.title = v.str(b.title, "عنوان الرسوم", { min: 2, max: 120 });
    if (b.category !== undefined) patch.category = v.oneOf(b.category, "نوع الرسوم", CATEGORIES);
    if (b.amount !== undefined) patch.amount = v.num(b.amount, "المبلغ", { min: 1, max: 1_000_000_000 });
    if (b.discount !== undefined) patch.discount = v.num(b.discount, "الخصم", { min: 0, max: 1_000_000_000 });
    if (b.due_date !== undefined) patch.due_date = v.isoDate(b.due_date, "تاريخ الاستحقاق", { optional: true }) || null;
    if (b.term !== undefined) patch.term = v.str(b.term, "الفصل الدراسي", { max: 60, optional: true }) || null;
    if (b.status !== undefined) patch.status = v.oneOf(b.status, "الحالة", INVOICE_STATUSES);

    const merged = { ...current, ...patch };
    if (Number(merged.discount || 0) > Number(merged.amount || 0)) {
      throw badRequest("الخصم لا يمكن أن يتجاوز المبلغ الأصلي");
    }
    patch.status = deriveStatus(merged);
    patch.updatedAt = serverTimestamp();

    await updateDoc(invoiceDoc, patch);

    // The cached invoice scan no longer reflects the ledger.
    invalidate("finance");
    audit(req, {
      action: "update",
      entity: "invoice",
      entityId: snap.id,
      summary: `تعديل رسوم "${merged.title}" للطالب ${current.student_name}`,
      meta: patch,
    });
    res.json({ success: true });
  })
);

/** Cancelling keeps the paper trail; only a full admin may do it. */
router.delete(
  "/admin/invoices/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const invoiceDoc = doc(db, "invoices", req.params.id);
    const snap = await getDoc(invoiceDoc);
    if (!snap.exists()) throw notFound("سند الرسوم غير موجود");

    const data = snap.data() as Record<string, any>;
    if (Number(data.paid_amount || 0) > 0) {
      throw badRequest("لا يمكن إلغاء سند تم تسديد جزء منه. قم بإرجاع الدفعات أولاً.");
    }

    await updateDoc(invoiceDoc, {
      status: "cancelled",
      cancelled_by: req.user!.id,
      cancelled_at: serverTimestamp(),
    });

    // The cached invoice scan no longer reflects the ledger.
    invalidate("finance");
    audit(req, {
      action: "delete",
      entity: "invoice",
      entityId: snap.id,
      summary: `إلغاء رسوم "${data.title}" للطالب ${data.student_name}`,
    });
    res.json({ success: true });
  })
);

/* ------------------------------------------------------------------ *
 * Payments
 * ------------------------------------------------------------------ */

router.post(
  "/admin/invoices/:id/payments",
  requireStaff,
  wrap(async (req, res) => {
    const amount = v.num(req.body?.amount, "المبلغ المدفوع", { min: 1, max: 1_000_000_000 });
    const method = v.oneOf(req.body?.method, "طريقة الدفع", METHODS, "نقدي");
    const paidAt = v.isoDate(req.body?.paid_at, "تاريخ الدفع", { optional: true }) || new Date().toISOString().slice(0, 10);
    const note = v.str(req.body?.note, "ملاحظة", { max: 300, optional: true });

    const invoiceDoc = doc(db, "invoices", req.params.id);

    // A transaction keeps `paid_amount` correct when two clerks record a
    // payment for the same invoice at the same time.
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(invoiceDoc);
      if (!snap.exists()) throw notFound("سند الرسوم غير موجود");

      const data = snap.data() as Record<string, any>;
      if (data.status === "cancelled") throw badRequest("لا يمكن التسديد على سند ملغى");

      const remaining = remainingAmount(data as InvoiceShape);
      if (amount > remaining) {
        throw badRequest(
          `المبلغ المدخل (${amount.toLocaleString("en-US")}) أكبر من المتبقي (${remaining.toLocaleString("en-US")})`
        );
      }

      const newPaid = Number(data.paid_amount || 0) + amount;
      const newStatus = deriveStatus({ ...(data as InvoiceShape), paid_amount: newPaid });

      tx.update(invoiceDoc, { paid_amount: newPaid, status: newStatus, updatedAt: serverTimestamp() });

      const paymentDoc = doc(paymentsRef);
      tx.set(paymentDoc, {
        invoice_id: snap.id,
        invoice_title: data.title,
        student_id: data.student_id,
        student_name: data.student_name,
        student_uid: data.student_uid,
        class_id: data.class_id || null,
        amount,
        currency: CURRENCY,
        method,
        paid_at: paidAt,
        note,
        receipt_no: `R-${Date.now().toString(36).toUpperCase()}`,
        recorded_by: req.user!.id,
        recorded_by_name: req.user!.name,
        createdAt: serverTimestamp(),
      });

      return { paymentId: paymentDoc.id, newPaid, newStatus, data };
    });

    await addDoc(notificationsRef, {
      user_id: result.data.student_id,
      title: "تم تسجيل دفعة",
      message: `تم استلام ${amount.toLocaleString("en-US")} ${CURRENCY} على "${result.data.title}". ${
        result.newStatus === "paid" ? "تم تسديد المبلغ بالكامل." : `المتبقي: ${remainingAmount({ ...(result.data as InvoiceShape), paid_amount: result.newPaid }).toLocaleString("en-US")} ${CURRENCY}`
      }`,
      type: "payment",
      isRead: false,
      createdAt: serverTimestamp(),
    });

    // The cached invoice scan no longer reflects the ledger.
    invalidate("finance");
    audit(req, {
      action: "payment",
      entity: "invoice",
      entityId: req.params.id,
      summary: `تسجيل دفعة ${amount} ${CURRENCY} من ${result.data.student_name}`,
      meta: { method, paid_at: paidAt, payment_id: result.paymentId },
    });

    res.status(201).json({ success: true, payment_id: result.paymentId, status: result.newStatus });
  })
);

router.get(
  "/admin/invoices/:id/payments",
  requireStaff,
  wrap(async (req, res) => {
    const rows = await fetchAll<Record<string, any>>(
      query(paymentsRef, where("invoice_id", "==", req.params.id))
    );
    rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    res.json(rows);
  })
);

/** Reversing a payment rolls the invoice total back in the same transaction. */
router.delete(
  "/admin/payments/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const paymentDoc = doc(db, "payments", req.params.id);

    const summary = await runTransaction(db, async (tx) => {
      const snap = await tx.get(paymentDoc);
      if (!snap.exists()) throw notFound("سند القبض غير موجود");
      const payment = snap.data() as Record<string, any>;

      const invoiceDoc = doc(db, "invoices", payment.invoice_id);
      const invoiceSnap = await tx.get(invoiceDoc);
      if (invoiceSnap.exists()) {
        const invoice = invoiceSnap.data() as InvoiceShape;
        const newPaid = Math.max(0, Number(invoice.paid_amount || 0) - Number(payment.amount || 0));
        tx.update(invoiceDoc, {
          paid_amount: newPaid,
          status: deriveStatus({ ...invoice, paid_amount: newPaid }),
          updatedAt: serverTimestamp(),
        });
      }
      tx.delete(paymentDoc);
      return `إرجاع دفعة ${payment.amount} ${CURRENCY} للطالب ${payment.student_name}`;
    });

    // The cached invoice scan no longer reflects the ledger.
    invalidate("finance");
    audit(req, { action: "delete", entity: "payment", entityId: req.params.id, summary });
    res.json({ success: true });
  })
);

/* ------------------------------------------------------------------ *
 * Student-facing + summaries
 * ------------------------------------------------------------------ */

/**
 * Per-student billed / paid / overdue totals, computed from one cached read of
 * the invoice collection and shared by every finance screen.
 */
async function invoiceTotalsByStudent(): Promise<Map<string, { billed: number; paid: number; overdue: number }>> {
  const invoices = await cached("finance:invoices", FINANCE_TTL_MS, () =>
    fetchAll<Record<string, any>>(invoicesRef)
  );

  const today = new Date().toISOString().slice(0, 10);
  const totals = new Map<string, { billed: number; paid: number; overdue: number }>();

  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    const entry = totals.get(inv.student_id) || { billed: 0, paid: 0, overdue: 0 };
    entry.billed += netAmount(inv);
    entry.paid += Number(inv.paid_amount || 0);
    if (inv.due_date && inv.due_date < today) entry.overdue += remainingAmount(inv);
    totals.set(inv.student_id, entry);
  }
  return totals;
}

router.get(
  "/student/:studentId/finance",
  requireAuth,
  requireSelfOrStaff("studentId"),
  wrap(async (req, res) => {
    const studentId = req.params.studentId;
    const [invoices, payments] = await Promise.all([
      fetchAll<Record<string, any>>(query(invoicesRef, where("student_id", "==", studentId))),
      fetchAll<Record<string, any>>(query(paymentsRef, where("student_id", "==", studentId))),
    ]);

    const active = invoices.filter((i) => i.status !== "cancelled");
    const totalBilled = active.reduce((sum, i) => sum + netAmount(i), 0);
    const totalPaid = active.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);
    const outstanding = Math.max(0, totalBilled - totalPaid);

    const today = new Date().toISOString().slice(0, 10);
    const overdue = active.filter((i) => i.due_date && i.due_date < today && remainingAmount(i) > 0);

    invoices.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    payments.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    res.json({
      currency: CURRENCY,
      summary: {
        total_billed: totalBilled,
        total_paid: totalPaid,
        outstanding,
        overdue_count: overdue.length,
        overdue_amount: overdue.reduce((sum, i) => sum + remainingAmount(i), 0),
        is_clear: outstanding === 0,
      },
      invoices: invoices.map((i) => ({ ...i, net_amount: netAmount(i), remaining: remainingAmount(i) })),
      payments,
    });
  })
);

/**
 * Push the fee reminders out now rather than waiting for the hourly sweep.
 * Sending is idempotent, so pressing it twice changes nothing.
 */
router.post(
  "/admin/finance/reminders",
  requireStaff,
  wrap(async (req, res) => {
    const result = await sendDueReminders();
    audit(req, {
      action: "reminder",
      entity: "invoice",
      summary: `إرسال ${result.sent} تذكير بمواعيد الأقساط`,
    });
    res.json({ success: true, ...result });
  })
);

/**
 * Whole-school finance overview for the admin dashboard.
 *
 * Totalling every invoice in the school is a full collection read, and the
 * finance screen asks for it on every visit. The numbers only move when
 * somebody issues a bill or records a payment, and both of those drop this
 * cache, so a stale answer is never served for longer than the TTL.
 */
router.get(
  "/admin/finance/summary",
  requireStaff,
  wrap(async (req, res) => {
    const invoices = await cached("finance:invoices", FINANCE_TTL_MS, () =>
      fetchAll<Record<string, any>>(invoicesRef)
    );
    const active = invoices.filter((i) => i.status !== "cancelled");

    const totalBilled = active.reduce((sum, i) => sum + netAmount(i), 0);
    const totalPaid = active.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);
    const today = new Date().toISOString().slice(0, 10);

    const perStudent = new Map<string, { name: string; uid: string; remaining: number }>();
    for (const inv of active) {
      const remaining = remainingAmount(inv);
      if (remaining <= 0) continue;
      const entry = perStudent.get(inv.student_id) || {
        name: inv.student_name,
        uid: inv.student_uid,
        remaining: 0,
      };
      entry.remaining += remaining;
      perStudent.set(inv.student_id, entry);
    }

    res.json({
      currency: CURRENCY,
      total_billed: totalBilled,
      total_collected: totalPaid,
      outstanding: Math.max(0, totalBilled - totalPaid),
      invoice_count: active.length,
      paid_invoices: active.filter((i) => i.status === "paid").length,
      overdue_invoices: active.filter((i) => i.due_date && i.due_date < today && remainingAmount(i) > 0).length,
      students_with_dues: perStudent.size,
      collection_rate: totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 100,
    });
  })
);

/**
 * One row per student with their financial standing — this is what answers
 * "does this student owe anything?" at a glance.
 */
/**
 * One row per student with their financial standing — this is what answers
 * "does this student owe anything?" at a glance.
 *
 * Filtering, searching and paging all happen here rather than in the browser.
 * A school of a few hundred students would otherwise ship every row on every
 * visit and then ask React to paint all of them, which is what made this
 * screen crawl. `limit` is optional: the printable debt statement still asks
 * for the whole list in one request.
 */
router.get(
  "/admin/finance/students",
  requireStaff,
  wrap(async (req, res) => {
    const classFilter = req.query.class_id ? String(req.query.class_id) : null;
    const studentFilter = req.query.student_id ? String(req.query.student_id) : null;
    const onlyDebtors = req.query.only_debtors === "1" || req.query.only_debtors === "true";
    const search = normalizeArabic(req.query.search);
    const offset = v.num(req.query.after ?? req.query.offset, "الإزاحة", {
      min: 0,
      max: 1_000_000,
      optional: true,
      default: 0,
    });
    const pageSize = v.num(req.query.limit, "الحد", { min: 1, max: 500, optional: true, default: 0 });

    const [roster, totals] = await Promise.all([studentRoster(), invoiceTotalsByStudent()]);

    const rows = roster.map((s) => {
      const t = totals.get(s.id) || { billed: 0, paid: 0, overdue: 0 };
      const outstanding = Math.max(0, t.billed - t.paid);
      return {
        student_id: s.id,
        name: s.name,
        uid: s.uid,
        national_id: s.national_id || "",
        phone: s.phone || "",
        guardian_phone: s.guardian_phone || "",
        class_id: s.class_id,
        class_name: s.class_name,
        total_billed: t.billed,
        total_paid: t.paid,
        outstanding,
        overdue_amount: t.overdue,
        payment_status:
          outstanding === 0 ? (t.billed > 0 ? "مسدد" : "لا توجد رسوم") : t.overdue > 0 ? "متأخر" : "عليه مستحقات",
        is_clear: outstanding === 0,
      };
    });

    const matched = rows.filter((r) => {
      if (studentFilter && r.student_id !== studentFilter) return false;
      if (classFilter && r.class_id !== classFilter) return false;
      if (onlyDebtors && r.is_clear) return false;
      return matchesStudent(r, search);
    });

    matched.sort((a, b) => b.outstanding - a.outstanding);

    const page =
      pageSize > 0
        ? paginate(matched, offset, pageSize)
        : { data: matched, total: matched.length, nextCursor: null };

    res.json({
      currency: CURRENCY,
      students: page.data,
      total: page.total,
      nextCursor: page.nextCursor,
      totals: {
        outstanding: matched.reduce((sum, r) => sum + r.outstanding, 0),
        debtors: matched.filter((r) => !r.is_clear).length,
      },
    });
  })
);

export default router;
