import { Router } from "express";
import {
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db, fetchAll, gradesRef, notificationsRef, usersRef } from "../lib/db.js";
import { requireAuth, requireRole, requireSelfOrStaff } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { forbidden, notFound, wrap } from "../lib/http.js";
import * as v from "../lib/validate.js";
import type { Request } from "express";

const router = Router();

const CATEGORIES = ["يومي", "شهري", "واجب", "مشاركة", "نصف الفصل", "نهائي", "امتحان"] as const;
const SEMESTERS = ["الفصل الأول", "الفصل الثاني", "الفصل الثالث"] as const;

/**
 * Subject-level authorization.
 *
 * The old code trusted a `performed_by` id sent in the request body, so any
 * caller could name someone else — or simply omit the field — and skip the
 * check entirely. The identity now comes from the verified session, and a
 * missing subject assignment is a denial rather than a pass.
 */
async function assertMaySetGrade(req: Request, subject: string): Promise<void> {
  const role = req.user!.role;
  if (role === "admin" || role === "assistant_admin") return;
  if (role !== "teacher") throw forbidden("غير مصرح لك برصد الدرجات");

  const teacherSnap = await getDoc(doc(db, "users", req.user!.id));
  const subjects: string[] = teacherSnap.exists() ? teacherSnap.data().subjects || [] : [];
  if (!subjects.includes(subject)) {
    throw forbidden(`غير مصرح لك بإدارة درجات مادة "${subject}"`);
  }
}

router.get(
  "/class/:classId/grades",
  requireAuth,
  wrap(async (req, res) => {
    const rows = await fetchAll<Record<string, any>>(
      query(gradesRef, where("class_id", "==", req.params.classId))
    );
    rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    res.json(rows);
  })
);

router.get(
  "/class/grades/student/:studentId",
  requireAuth,
  requireSelfOrStaff("studentId"),
  wrap(async (req, res) => {
    const rows = await fetchAll<Record<string, any>>(
      query(gradesRef, where("student_id", "==", req.params.studentId))
    );
    rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    res.json(rows);
  })
);

router.post(
  "/grades",
  requireAuth,
  requireRole("teacher", "admin", "assistant_admin"),
  wrap(async (req, res) => {
    const b = req.body || {};
    const subject = v.str(b.subject, "المادة", { max: 80 });
    await assertMaySetGrade(req, subject);

    const total = v.num(b.total, "الدرجة الكلية", { min: 1, max: 10000 });
    const score = v.num(b.score, "الدرجة", { min: 0, max: total });
    const studentId = v.str(b.student_id, "الطالب", { max: 64 });

    const studentSnap = await getDoc(doc(db, "users", studentId));
    if (!studentSnap.exists()) throw notFound("الطالب غير موجود");

    const created = await addDoc(gradesRef, {
      student_id: studentId,
      student_name: studentSnap.data().name,
      class_id: v.str(b.class_id, "الصف", { max: 64 }),
      subject,
      score,
      total,
      percentage: Math.round((score / total) * 100),
      status: v.str(b.status, "الحالة", { max: 40, optional: true }),
      category: v.oneOf(b.category, "نوع التقييم", CATEGORIES, "يومي"),
      semester: v.oneOf(b.semester, "الفصل الدراسي", SEMESTERS, "الفصل الأول"),
      recorded_by: req.user!.id,
      recorded_by_name: req.user!.name,
      createdAt: serverTimestamp(),
    });

    await addDoc(notificationsRef, {
      user_id: studentId,
      title: "درجة جديدة",
      message: `تم رصد درجة ${score}/${total} في مادة ${subject}`,
      type: "grade",
      isRead: false,
      createdAt: serverTimestamp(),
    });

    audit(req, {
      action: "create",
      entity: "grade",
      entityId: created.id,
      summary: `رصد ${score}/${total} في ${subject} للطالب ${studentSnap.data().name}`,
    });
    res.status(201).json({ success: true, id: created.id });
  })
);

router.put(
  "/grades/:id",
  requireAuth,
  requireRole("teacher", "admin", "assistant_admin"),
  wrap(async (req, res) => {
    const target = doc(db, "grades", req.params.id);
    const snap = await getDoc(target);
    if (!snap.exists()) throw notFound("الدرجة غير موجودة");

    const current = snap.data() as Record<string, any>;
    await assertMaySetGrade(req, current.subject);

    const b = req.body || {};
    const subject = b.subject !== undefined ? v.str(b.subject, "المادة", { max: 80 }) : current.subject;
    if (subject !== current.subject) await assertMaySetGrade(req, subject);

    const total = b.total !== undefined ? v.num(b.total, "الدرجة الكلية", { min: 1, max: 10000 }) : current.total;
    const score = b.score !== undefined ? v.num(b.score, "الدرجة", { min: 0, max: total }) : current.score;

    await updateDoc(target, {
      subject,
      score,
      total,
      percentage: Math.round((score / total) * 100),
      status: b.status !== undefined ? v.str(b.status, "الحالة", { max: 40, optional: true }) : current.status,
      category: b.category !== undefined ? v.oneOf(b.category, "نوع التقييم", CATEGORIES) : current.category,
      semester: b.semester !== undefined ? v.oneOf(b.semester, "الفصل الدراسي", SEMESTERS) : current.semester,
      updated_by: req.user!.id,
      updatedAt: serverTimestamp(),
    });

    audit(req, {
      action: "update",
      entity: "grade",
      entityId: snap.id,
      summary: `تعديل درجة ${current.subject} للطالب ${current.student_name || current.student_id} إلى ${score}/${total}`,
    });
    res.json({ success: true });
  })
);

router.delete(
  "/grades/:id",
  requireAuth,
  requireRole("teacher", "admin", "assistant_admin"),
  wrap(async (req, res) => {
    const target = doc(db, "grades", req.params.id);
    const snap = await getDoc(target);
    if (!snap.exists()) throw notFound("الدرجة غير موجودة");

    const current = snap.data() as Record<string, any>;
    await assertMaySetGrade(req, current.subject);
    await deleteDoc(target);

    audit(req, {
      action: "delete",
      entity: "grade",
      entityId: snap.id,
      summary: `حذف درجة ${current.subject} (${current.score}/${current.total}) للطالب ${current.student_name || current.student_id}`,
    });
    res.json({ success: true });
  })
);

export default router;
