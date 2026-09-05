import { Router } from "express";
import {
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  chunk,
  db,
  enrollmentsRef,
  fetchAll,
  fetchPage,
  homeworkRef,
  notificationsRef,
} from "../lib/db.js";
import { requireAuth, requireRole, requireSelfOrStaff } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { forbidden, notFound, wrap } from "../lib/http.js";
import * as v from "../lib/validate.js";

/**
 * Homework set by a teacher for a whole class.
 *
 * A teacher had no way to tell a class what to prepare for tomorrow; the only
 * channel was the admin's broadcast, which reaches the whole school. An
 * assignment belongs to a class, carries a due date, and notifies exactly the
 * students enrolled in that class.
 */

const router = Router();

const BATCH_LIMIT = 450;
const DEFAULT_PAGE_SIZE = 20;

router.post(
  "/homework",
  requireAuth,
  requireRole("teacher", "admin", "assistant_admin"),
  wrap(async (req, res) => {
    const classId = v.str(req.body?.class_id, "الصف", { max: 64 });
    const subject = v.str(req.body?.subject, "المادة", { min: 2, max: 80 });
    const title = v.str(req.body?.title, "عنوان الواجب", { min: 2, max: 120 });
    const description = v.str(req.body?.description, "تفاصيل الواجب", { max: 1500, optional: true });
    const dueDate = v.isoDate(req.body?.due_date, "تاريخ التسليم", { optional: true }) || null;
    const notifyStudents = v.boolean(req.body?.notify_students, true);

    const classSnap = await getDoc(doc(db, "classes", classId));
    if (!classSnap.exists()) throw notFound("الصف غير موجود");
    const className = classSnap.data().name as string;

    const created = await addDoc(homeworkRef, {
      class_id: classId,
      class_name: className,
      subject,
      title,
      description,
      due_date: dueDate,
      created_by: req.user!.id,
      created_by_name: req.user!.name,
      createdAt: serverTimestamp(),
    });

    let notified = 0;
    if (notifyStudents) {
      const enrollments = await fetchAll<{ student_id: string }>(
        query(enrollmentsRef, where("class_id", "==", classId))
      );
      const recipients = [...new Set(enrollments.map((e) => e.student_id))];

      for (const group of chunk(recipients, BATCH_LIMIT)) {
        const batch = writeBatch(db);
        for (const studentId of group) {
          batch.set(doc(notificationsRef), {
            user_id: studentId,
            title: `واجب جديد في ${subject}`,
            message: `${title}${dueDate ? ` — التسليم ${dueDate}` : ""}`,
            type: "homework",
            isRead: false,
            createdAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }
      notified = recipients.length;
    }

    audit(req, {
      action: "create",
      entity: "homework",
      entityId: created.id,
      summary: `واجب "${title}" في ${subject} لصف ${className}`,
    });
    res.status(201).json({ success: true, id: created.id, notified });
  })
);

/** The class's assignments, newest first. */
router.get(
  "/class/:classId/homework",
  requireAuth,
  wrap(async (req, res) => {
    const pageSize = v.num(req.query.limit, "الحد", { min: 1, max: 100, optional: true, default: DEFAULT_PAGE_SIZE });
    const cursor = req.query.after ? String(req.query.after) : null;

    const base = query(homeworkRef, where("class_id", "==", req.params.classId));
    const q = query(base, orderBy("createdAt", "desc"));
    const { data, nextCursor } = await fetchPage<Record<string, any>>(q, pageSize, cursor, homeworkRef, {
      base,
      sortField: "createdAt",
      direction: "desc",
      label: "homework by class, newest first",
    });

    res.json({ data, nextCursor });
  })
);

/** Everything set for the classes this student is enrolled in. */
router.get(
  "/student/:studentId/homework",
  requireAuth,
  requireSelfOrStaff("studentId"),
  wrap(async (req, res) => {
    const enrollments = await fetchAll<{ class_id: string }>(
      query(enrollmentsRef, where("student_id", "==", req.params.studentId))
    );
    const classIds = [...new Set(enrollments.map((e) => e.class_id).filter(Boolean))];
    if (classIds.length === 0) return res.json([]);

    const pages = await Promise.all(
      classIds.map((classId) => fetchAll<Record<string, any>>(query(homeworkRef, where("class_id", "==", classId))))
    );
    const rows = pages.flat();
    rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    res.json(rows);
  })
);

/** The teacher who set it, or an admin, can remove it. */
router.delete(
  "/homework/:id",
  requireAuth,
  requireRole("teacher", "admin", "assistant_admin"),
  wrap(async (req, res) => {
    const target = doc(db, "homework", req.params.id);
    const snap = await getDoc(target);
    if (!snap.exists()) throw notFound("الواجب غير موجود");

    const row = snap.data() as Record<string, any>;
    if (req.user!.role === "teacher" && row.created_by !== req.user!.id) {
      throw forbidden("لا يمكنك حذف واجب أضافه معلم آخر");
    }

    await deleteDoc(target);
    audit(req, {
      action: "delete",
      entity: "homework",
      entityId: req.params.id,
      summary: `حذف واجب "${row.title}" من ${row.class_name}`,
    });
    res.json({ success: true });
  })
);

export default router;
