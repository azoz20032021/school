import { Router } from "express";
import { doc, getDoc, query, where } from "firebase/firestore";
import {
  attendanceRef,
  behaviorRef,
  classesRef,
  db,
  enrollmentsRef,
  fetchAll,
  getDocsByIds,
  gradesRef,
  invoicesRef,
  paymentsRef,
  registrationsRef,
  usersRef,
} from "../lib/db.js";
import { requireAuth, requireRole, requireSelfOrStaff, sanitizeUser } from "../lib/auth.js";
import { notFound, wrap } from "../lib/http.js";
import { netAmount, remainingAmount, CURRENCY } from "./payments.routes.js";
import * as v from "../lib/validate.js";

const router = Router();

function attendanceStats(records: { status: string }[]) {
  const total = records.length;
  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const late = records.filter((r) => r.status === "late").length;
  const excused = records.filter((r) => r.status === "excused").length;
  return {
    total,
    present,
    absent,
    late,
    excused,
    rate: total > 0 ? Math.round(((present + late) / total) * 100) : 100,
  };
}

function gradeStats(grades: { score: number; total: number; subject: string }[]) {
  const bySubject = new Map<string, { earned: number; possible: number; count: number }>();
  let earned = 0;
  let possible = 0;

  for (const g of grades) {
    const s = Number(g.score || 0);
    const t = Number(g.total || 0);
    if (t <= 0) continue;
    earned += s;
    possible += t;
    const entry = bySubject.get(g.subject) || { earned: 0, possible: 0, count: 0 };
    entry.earned += s;
    entry.possible += t;
    entry.count++;
    bySubject.set(g.subject, entry);
  }

  return {
    overall_percentage: possible > 0 ? Math.round((earned / possible) * 100) : null,
    subjects: [...bySubject.entries()]
      .map(([subject, s]) => ({
        subject,
        count: s.count,
        percentage: s.possible > 0 ? Math.round((s.earned / s.possible) * 100) : 0,
        earned: s.earned,
        possible: s.possible,
      }))
      .sort((a, b) => b.percentage - a.percentage),
  };
}

/**
 * Everything about one student on a single page — profile, grades, attendance,
 * finances and conduct. Built for the printable student report.
 */
router.get(
  "/reports/student/:studentId",
  requireAuth,
  requireSelfOrStaff("studentId"),
  wrap(async (req, res) => {
    const studentId = req.params.studentId;

    const studentSnap = await getDoc(doc(db, "users", studentId));
    if (!studentSnap.exists()) throw notFound("الطالب غير موجود");

    const [grades, attendance, invoices, payments, behavior, enrollments] = await Promise.all([
      fetchAll<any>(query(gradesRef, where("student_id", "==", studentId))),
      fetchAll<any>(query(attendanceRef, where("student_id", "==", studentId))),
      fetchAll<any>(query(invoicesRef, where("student_id", "==", studentId))),
      fetchAll<any>(query(paymentsRef, where("student_id", "==", studentId))),
      fetchAll<any>(query(behaviorRef, where("student_id", "==", studentId))),
      fetchAll<any>(query(enrollmentsRef, where("student_id", "==", studentId))),
    ]);

    let className: string | null = null;
    if (enrollments[0]?.class_id) {
      const classSnap = await getDoc(doc(db, "classes", enrollments[0].class_id));
      className = classSnap.exists() ? classSnap.data().name : null;
    }

    const activeInvoices = invoices.filter((i) => i.status !== "cancelled");
    const billed = activeInvoices.reduce((sum, i) => sum + netAmount(i), 0);
    const paid = activeInvoices.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);
    const conductScore = behavior.reduce((sum, b) => sum + Number(b.points || 0), 0);

    grades.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    attendance.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    res.json({
      generated_at: new Date().toISOString(),
      currency: CURRENCY,
      student: { ...sanitizeUser({ id: studentSnap.id, ...(studentSnap.data() as any) }), class_name: className },
      grades: { records: grades, stats: gradeStats(grades) },
      attendance: { records: attendance.slice(0, 60), stats: attendanceStats(attendance) },
      finance: {
        total_billed: billed,
        total_paid: paid,
        outstanding: Math.max(0, billed - paid),
        is_clear: billed - paid <= 0,
        invoices: activeInvoices.map((i) => ({ ...i, net_amount: netAmount(i), remaining: remainingAmount(i) })),
        payments,
      },
      behavior: {
        notes: behavior,
        positive: behavior.filter((b) => b.type === "positive").length,
        negative: behavior.filter((b) => b.type === "negative").length,
        conduct_score: Math.max(0, Math.min(100, 100 + conductScore)),
      },
    });
  })
);

/** Grade sheet for a whole class: one row per student, one column per subject. */
router.get(
  "/reports/class/:classId",
  requireAuth,
  requireRole("teacher", "admin", "assistant_admin"),
  wrap(async (req, res) => {
    const classId = req.params.classId;

    const classSnap = await getDoc(doc(db, "classes", classId));
    if (!classSnap.exists()) throw notFound("الصف غير موجود");

    const enrollments = await fetchAll<{ student_id: string }>(
      query(enrollmentsRef, where("class_id", "==", classId))
    );
    const studentIds = [...new Set(enrollments.map((e) => e.student_id))];

    const [students, grades, attendance, invoices] = await Promise.all([
      getDocsByIds<any>(usersRef, studentIds),
      fetchAll<any>(query(gradesRef, where("class_id", "==", classId))),
      fetchAll<any>(query(attendanceRef, where("class_id", "==", classId))),
      fetchAll<any>(query(invoicesRef, where("class_id", "==", classId))),
    ]);

    const gradesByStudent = new Map<string, any[]>();
    grades.forEach((g) => {
      const list = gradesByStudent.get(g.student_id) || [];
      list.push(g);
      gradesByStudent.set(g.student_id, list);
    });

    const attendanceByStudent = new Map<string, any[]>();
    attendance.forEach((a) => {
      const list = attendanceByStudent.get(a.student_id) || [];
      list.push(a);
      attendanceByStudent.set(a.student_id, list);
    });

    const duesByStudent = new Map<string, number>();
    invoices.forEach((i) => {
      if (i.status === "cancelled") return;
      duesByStudent.set(i.student_id, (duesByStudent.get(i.student_id) || 0) + remainingAmount(i));
    });

    const subjects = [...new Set(grades.map((g) => g.subject))].sort((a, b) => a.localeCompare(b, "ar"));

    const rows = studentIds
      .map((id) => students.get(id))
      .filter(Boolean)
      .map((s) => {
        const studentGrades = gradesByStudent.get(s!.id) || [];
        const stats = gradeStats(studentGrades);
        const bySubject = new Map(stats.subjects.map((x) => [x.subject, x.percentage]));
        return {
          student_id: s!.id,
          name: s!.name,
          uid: s!.uid,
          overall_percentage: stats.overall_percentage,
          subjects: Object.fromEntries(subjects.map((sub) => [sub, bySubject.get(sub) ?? null])),
          attendance: attendanceStats(attendanceByStudent.get(s!.id) || []),
          outstanding: duesByStudent.get(s!.id) || 0,
        };
      });

    rows.sort((a, b) => (b.overall_percentage ?? -1) - (a.overall_percentage ?? -1));

    res.json({
      generated_at: new Date().toISOString(),
      currency: CURRENCY,
      class: { id: classSnap.id, ...classSnap.data() },
      subjects,
      students: rows,
      class_average:
        rows.length > 0
          ? Math.round(
              rows.reduce((sum, r) => sum + (r.overall_percentage ?? 0), 0) /
                rows.filter((r) => r.overall_percentage !== null).length || 0
            )
          : null,
    });
  })
);

/** School-wide numbers for the admin landing page. */
router.get(
  "/reports/overview",
  requireAuth,
  requireRole("admin", "assistant_admin"),
  wrap(async (_req, res) => {
    const today = new Date().toISOString().slice(0, 10);

    const [users, classes, invoices, todayAttendance, registrations] = await Promise.all([
      fetchAll<any>(usersRef),
      fetchAll<any>(classesRef),
      fetchAll<any>(invoicesRef),
      fetchAll<any>(query(attendanceRef, where("date", "==", today))),
      fetchAll<any>(query(registrationsRef, where("status", "==", "pending"))),
    ]);

    const activeInvoices = invoices.filter((i) => i.status !== "cancelled");
    const billed = activeInvoices.reduce((sum, i) => sum + netAmount(i), 0);
    const paid = activeInvoices.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);

    res.json({
      currency: CURRENCY,
      students: users.filter((u) => u.role === "student").length,
      teachers: users.filter((u) => u.role === "teacher").length,
      assistants: users.filter((u) => u.role === "assistant_admin").length,
      classes: classes.length,
      pending_registrations: registrations.length,
      attendance_today: attendanceStats(todayAttendance),
      finance: {
        total_billed: billed,
        total_collected: paid,
        outstanding: Math.max(0, billed - paid),
        collection_rate: billed > 0 ? Math.round((paid / billed) * 100) : 100,
      },
    });
  })
);

/** Attendance across a date range, for the printable attendance sheet. */
router.get(
  "/reports/attendance",
  requireAuth,
  requireRole("admin", "assistant_admin", "teacher"),
  wrap(async (req, res) => {
    const from = v.isoDate(req.query.from, "من تاريخ");
    const to = v.isoDate(req.query.to, "إلى تاريخ");
    const classId = req.query.class_id ? String(req.query.class_id) : null;

    const records = await fetchAll<any>(
      classId ? query(attendanceRef, where("class_id", "==", classId)) : attendanceRef
    );
    const inRange = records.filter((r) => r.date >= from && r.date <= to);

    const byStudent = new Map<string, any[]>();
    inRange.forEach((r) => {
      const list = byStudent.get(r.student_id) || [];
      list.push(r);
      byStudent.set(r.student_id, list);
    });

    const students = await getDocsByIds<any>(usersRef, [...byStudent.keys()]);

    const rows = [...byStudent.entries()]
      .map(([studentId, list]) => ({
        student_id: studentId,
        name: students.get(studentId)?.name || "غير معروف",
        uid: students.get(studentId)?.uid || "",
        guardian_phone: students.get(studentId)?.guardian_phone || "",
        ...attendanceStats(list),
      }))
      .sort((a, b) => b.absent - a.absent);

    res.json({ from, to, class_id: classId, generated_at: new Date().toISOString(), students: rows });
  })
);

export default router;
