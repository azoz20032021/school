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
  writeBatch,
} from "firebase/firestore";
import {
  attendanceRef,
  chunk,
  classesRef,
  db,
  enrollmentsRef,
  fetchAll,
  getDocsByIds,
  invoicesRef,
  schedulesRef,
  usersRef,
} from "../lib/db.js";
import { requireAdmin, requireAuth, requireStaff } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { badRequest, notFound, wrap } from "../lib/http.js";
import { cached, invalidate } from "../lib/cache.js";
import { remainingAmount } from "./payments.routes.js";
import * as v from "../lib/validate.js";

const router = Router();

const BATCH_LIMIT = 450;
const CLASSES_TTL_MS = 60_000;

/** Public — the registration form needs the class list before anyone logs in. */
router.get(
  "/classes",
  wrap(async (_req, res) => {
    const classes = await cached("classes:all", CLASSES_TTL_MS, () =>
      fetchAll<Record<string, any>>(classesRef)
    );
    res.json(classes);
  })
);

router.post(
  "/admin/classes",
  requireAdmin,
  wrap(async (req, res) => {
    const name = v.str(req.body?.name, "اسم الصف", { min: 2, max: 120 });
    const teachers = Array.isArray(req.body?.teachers) ? req.body.teachers : [];
    if (teachers.length === 0) throw badRequest("يجب اختيار معلم واحد على الأقل");

    const created = await addDoc(classesRef, {
      name,
      teacher_ids: teachers.map((t: any) => String(t.id)),
      teacher_names: teachers.map((t: any) => String(t.name || "معلم")),
      capacity: v.num(req.body?.capacity, "السعة", { min: 0, max: 500, optional: true }),
      createdAt: serverTimestamp(),
    });

    invalidate("classes");
    audit(req, { action: "create", entity: "class", entityId: created.id, summary: `إضافة صف ${name}` });
    res.status(201).json({ success: true, id: created.id });
  })
);

router.put(
  "/admin/classes/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const target = doc(db, "classes", req.params.id);
    const snap = await getDoc(target);
    if (!snap.exists()) throw notFound("الصف غير موجود");

    const patch: Record<string, any> = {};
    if (req.body?.name !== undefined) patch.name = v.str(req.body.name, "اسم الصف", { min: 2, max: 120 });
    if (req.body?.capacity !== undefined) {
      patch.capacity = v.num(req.body.capacity, "السعة", { min: 0, max: 500, optional: true });
    }
    if (req.body?.teachers !== undefined) {
      const teachers = Array.isArray(req.body.teachers) ? req.body.teachers : [];
      patch.teacher_ids = teachers.map((t: any) => String(t.id));
      patch.teacher_names = teachers.map((t: any) => String(t.name || "معلم"));
    }
    if (Object.keys(patch).length === 0) throw badRequest("لا توجد بيانات للتحديث");

    patch.updatedAt = serverTimestamp();
    await updateDoc(target, patch);

    invalidate("classes");
    audit(req, {
      action: "update",
      entity: "class",
      entityId: snap.id,
      summary: `تعديل الصف ${snap.data().name}`,
      meta: patch,
    });
    res.json({ success: true });
  })
);

/** Deleting a class also clears its enrollments and timetable entries. */
router.delete(
  "/admin/classes/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const classId = req.params.id;
    const snap = await getDoc(doc(db, "classes", classId));
    if (!snap.exists()) throw notFound("الصف غير موجود");

    const [enrollments, schedules] = await Promise.all([
      getDocs(query(enrollmentsRef, where("class_id", "==", classId))),
      getDocs(query(schedulesRef, where("class_id", "==", classId))),
    ]);

    const refs = [...enrollments.docs, ...schedules.docs].map((d) => d.ref);
    for (const group of chunk(refs, BATCH_LIMIT)) {
      const batch = writeBatch(db);
      group.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, "classes", classId));

    invalidate("classes");
    audit(req, {
      action: "delete",
      entity: "class",
      entityId: classId,
      summary: `حذف الصف ${snap.data().name} و${refs.length} سجل مرتبط`,
    });
    res.json({ success: true });
  })
);

/* ------------------------------------------------------------------ *
 * Class rosters
 * ------------------------------------------------------------------ */

/**
 * Roster with absence counts and financial standing.
 *
 * The old implementation ran one `getDoc` plus one full attendance query *per
 * student* — a 30-student class meant ~61 sequential round trips, which is
 * where most of the "the site is slow" feeling came from. This version is four
 * queries regardless of class size, three of them in parallel.
 */
router.get(
  "/class/:classId/students",
  requireAuth,
  wrap(async (req, res) => {
    const classId = req.params.classId;

    const enrollments = await fetchAll<{ student_id: string }>(
      query(enrollmentsRef, where("class_id", "==", classId))
    );
    const studentIds = [...new Set(enrollments.map((e) => e.student_id))];
    if (studentIds.length === 0) return res.json([]);

    const [students, absences, invoices] = await Promise.all([
      getDocsByIds<Record<string, any>>(usersRef, studentIds),
      fetchAll<{ student_id: string }>(
        query(attendanceRef, where("class_id", "==", classId), where("status", "==", "absent"))
      ),
      fetchAll<Record<string, any>>(query(invoicesRef, where("class_id", "==", classId))),
    ]);

    const absenceCount = new Map<string, number>();
    for (const record of absences) {
      absenceCount.set(record.student_id, (absenceCount.get(record.student_id) || 0) + 1);
    }

    const dues = new Map<string, number>();
    for (const inv of invoices) {
      if (inv.status === "cancelled") continue;
      dues.set(inv.student_id, (dues.get(inv.student_id) || 0) + remainingAmount(inv));
    }

    const roster = studentIds
      .map((id) => students.get(id))
      .filter(Boolean)
      .map((s) => ({
        id: s!.id,
        name: s!.name,
        uid: s!.uid,
        phone: s!.phone || "",
        guardian_phone: s!.guardian_phone || "",
        absences: absenceCount.get(s!.id) || 0,
        outstanding: dues.get(s!.id) || 0,
        is_clear: (dues.get(s!.id) || 0) === 0,
      }));

    roster.sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));
    res.json(roster);
  })
);

router.get(
  "/teacher/classes/:teacherId",
  requireAuth,
  wrap(async (req, res) => {
    const teacherId = req.params.teacherId;
    if (req.user!.role === "teacher" && req.user!.id !== teacherId) {
      throw badRequest("لا يمكنك عرض صفوف معلم آخر");
    }

    // Two shapes exist in the data: `teacher_ids` (current) and `teacher_id`
    // (older records). Query both and merge.
    const [byArray, bySingle] = await Promise.all([
      fetchAll<Record<string, any>>(query(classesRef, where("teacher_ids", "array-contains", teacherId))),
      fetchAll<Record<string, any>>(query(classesRef, where("teacher_id", "==", teacherId))),
    ]);

    const merged = new Map<string, Record<string, any>>();
    [...byArray, ...bySingle].forEach((c) => merged.set(c.id, c));
    res.json([...merged.values()]);
  })
);

router.get(
  "/student/classes/:studentId",
  requireAuth,
  wrap(async (req, res) => {
    const studentId = req.params.studentId;
    if (req.user!.role === "student" && req.user!.id !== studentId) {
      throw badRequest("لا يمكنك عرض صفوف طالب آخر");
    }

    const enrollments = await fetchAll<{ class_id: string }>(
      query(enrollmentsRef, where("student_id", "==", studentId))
    );
    const classIds = [...new Set(enrollments.map((e) => e.class_id))];
    if (classIds.length === 0) return res.json([]);

    const classes = await getDocsByIds<Record<string, any>>(classesRef, classIds);
    res.json(classIds.map((id) => classes.get(id)).filter(Boolean));
  })
);

/** Move a student to a class; a student belongs to exactly one class. */
router.post(
  "/admin/enroll",
  requireStaff,
  wrap(async (req, res) => {
    const studentId = v.str(req.body?.student_id, "الطالب", { max: 64 });
    const classId = v.str(req.body?.class_id, "الصف", { max: 64 });

    const [studentSnap, classSnap] = await Promise.all([
      getDoc(doc(db, "users", studentId)),
      getDoc(doc(db, "classes", classId)),
    ]);
    if (!studentSnap.exists()) throw notFound("الطالب غير موجود");
    if (!classSnap.exists()) throw notFound("الصف غير موجود");

    const existing = await getDocs(query(enrollmentsRef, where("student_id", "==", studentId)));
    const batch = writeBatch(db);
    existing.forEach((d) => batch.delete(d.ref));
    batch.set(doc(enrollmentsRef), { student_id: studentId, class_id: classId, createdAt: serverTimestamp() });
    await batch.commit();

    // The cached roster carries each student's class, so it is now stale.
    invalidate("students");
    audit(req, {
      action: "enroll",
      entity: "enrollment",
      entityId: studentId,
      summary: `نقل الطالب ${studentSnap.data().name} إلى ${classSnap.data().name}`,
    });
    res.json({ success: true });
  })
);

export default router;
