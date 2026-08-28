import { Router } from "express";
import { addDoc, deleteDoc, doc, getDoc, query, serverTimestamp, where } from "firebase/firestore";
import { behaviorRef, db, fetchAll, notificationsRef } from "../lib/db";
import { requireAdmin, requireAuth, requireRole, requireSelfOrStaff } from "../lib/auth";
import { audit } from "../lib/audit";
import { notFound, wrap } from "../lib/http";
import * as v from "../lib/validate";

const router = Router();

const TYPES = ["positive", "negative"] as const;

const CATEGORIES = [
  "تفوق دراسي",
  "مشاركة فعالة",
  "مساعدة الزملاء",
  "التزام بالزي",
  "تأخر متكرر",
  "إزعاج داخل الصف",
  "عدم أداء الواجبات",
  "مخالفة سلوكية",
  "أخرى",
] as const;

/** Positive notes add points, negative ones subtract — a simple conduct score. */
router.post(
  "/behavior",
  requireAuth,
  requireRole("teacher", "admin", "assistant_admin"),
  wrap(async (req, res) => {
    const studentId = v.str(req.body?.student_id, "الطالب", { max: 64 });
    const type = v.oneOf(req.body?.type, "نوع الملاحظة", TYPES);
    const category = v.oneOf(req.body?.category, "التصنيف", CATEGORIES, "أخرى");
    const title = v.str(req.body?.title, "عنوان الملاحظة", { min: 2, max: 120 });
    const description = v.str(req.body?.description, "التفاصيل", { max: 800, optional: true });
    const points = v.num(req.body?.points, "النقاط", { min: 0, max: 100, optional: true, default: 5 });
    const date = v.isoDate(req.body?.date, "التاريخ", { optional: true }) || new Date().toISOString().slice(0, 10);
    const notifyStudent = v.boolean(req.body?.notify_student, true);

    const studentSnap = await getDoc(doc(db, "users", studentId));
    if (!studentSnap.exists()) throw notFound("الطالب غير موجود");
    const student = studentSnap.data() as Record<string, any>;

    const created = await addDoc(behaviorRef, {
      student_id: studentId,
      student_name: student.name,
      student_uid: student.uid,
      class_id: v.str(req.body?.class_id, "الصف", { max: 64, optional: true }) || null,
      type,
      category,
      title,
      description,
      points: type === "positive" ? points : -points,
      date,
      guardian_phone: student.guardian_phone || "",
      created_by: req.user!.id,
      created_by_name: req.user!.name,
      createdAt: serverTimestamp(),
    });

    if (notifyStudent) {
      await addDoc(notificationsRef, {
        user_id: studentId,
        title: type === "positive" ? "ملاحظة إيجابية 🌟" : "ملاحظة سلوكية",
        message: `${title}${description ? ` — ${description}` : ""}`,
        type: "behavior",
        isRead: false,
        createdAt: serverTimestamp(),
      });
    }

    audit(req, {
      action: "create",
      entity: "behavior_note",
      entityId: created.id,
      summary: `${type === "positive" ? "ملاحظة إيجابية" : "ملاحظة سلوكية"} للطالب ${student.name}: ${title}`,
    });
    res.status(201).json({ success: true, id: created.id });
  })
);

router.get(
  "/student/:studentId/behavior",
  requireAuth,
  requireSelfOrStaff("studentId"),
  wrap(async (req, res) => {
    const rows = await fetchAll<Record<string, any>>(
      query(behaviorRef, where("student_id", "==", req.params.studentId))
    );
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const score = rows.reduce((sum, r) => sum + Number(r.points || 0), 0);
    res.json({
      notes: rows,
      summary: {
        positive: rows.filter((r) => r.type === "positive").length,
        negative: rows.filter((r) => r.type === "negative").length,
        // 100 is the neutral starting point, clamped to a 0–100 display range.
        conduct_score: Math.max(0, Math.min(100, 100 + score)),
      },
    });
  })
);

router.get(
  "/class/:classId/behavior",
  requireAuth,
  requireRole("teacher", "admin", "assistant_admin"),
  wrap(async (req, res) => {
    const rows = await fetchAll<Record<string, any>>(
      query(behaviorRef, where("class_id", "==", req.params.classId))
    );
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    res.json(rows);
  })
);

router.delete(
  "/behavior/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const snap = await getDoc(doc(db, "behavior_notes", req.params.id));
    if (!snap.exists()) throw notFound("الملاحظة غير موجودة");

    await deleteDoc(doc(db, "behavior_notes", req.params.id));
    audit(req, {
      action: "delete",
      entity: "behavior_note",
      entityId: req.params.id,
      summary: `حذف ملاحظة "${snap.data().title}" عن ${snap.data().student_name}`,
    });
    res.json({ success: true });
  })
);

export default router;
