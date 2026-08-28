import { Router } from "express";
import {
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  auditRef,
  chunk,
  classesRef,
  db,
  enrollmentsRef,
  fetchAll,
  fetchIndexed,
  notificationsRef,
  usersRef,
  validUidsRef,
} from "../lib/db.js";
import { hashPassword, requireAdmin, requireStaff, sanitizeUser } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { badRequest, forbidden, notFound, wrap } from "../lib/http.js";
import { invalidate } from "../lib/cache.js";
import * as v from "../lib/validate.js";

const router = Router();

const BATCH_LIMIT = 450;

/* ------------------------------------------------------------------ *
 * Staff directory
 * ------------------------------------------------------------------ */

router.get(
  "/admin/students",
  requireStaff,
  wrap(async (_req, res) => {
    const students = await fetchAll<Record<string, any>>(query(usersRef, where("role", "==", "student")));
    res.json(students.map(sanitizeUser).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), "ar")));
  })
);

router.get(
  "/admin/students/:id",
  requireStaff,
  wrap(async (req, res) => {
    const snap = await getDoc(doc(db, "users", req.params.id));
    if (!snap.exists() || snap.data().role !== "student") throw notFound("الطالب غير موجود");
    res.json(sanitizeUser({ id: snap.id, ...(snap.data() as Record<string, any>) }));
  })
);

router.post(
  "/admin/students",
  requireStaff,
  wrap(async (req, res) => {
    const name = v.str(req.body?.name, "اسم الطالب", { min: 3, max: 120 });
    const uid = v.str(req.body?.uid, "الرقم التعريفي", { min: 3, max: 64 });
    const plain = v.password(req.body?.password);

    const clash = await getDocs(query(usersRef, where("uid", "==", uid), fsLimit(1)));
    if (!clash.empty) throw badRequest("هذا الـ UID مستخدم بالفعل، يرجى اختيار واحد آخر");

    const created = await addDoc(usersRef, {
      name,
      username: uid,
      uid,
      password: hashPassword(plain),
      role: "student",
      status: "active",
      phone: v.phone(req.body?.phone, "رقم الهاتف", { optional: true }),
      guardian_name: v.str(req.body?.guardian_name, "اسم ولي الأمر", { max: 120, optional: true }),
      guardian_phone: v.phone(req.body?.guardian_phone, "هاتف ولي الأمر", { optional: true }),
      national_id: v.str(req.body?.national_id, "رقم الهوية", { max: 40, optional: true }),
      createdAt: serverTimestamp(),
    });

    const classId = v.str(req.body?.class_id, "الصف", { max: 64, optional: true });
    if (classId) {
      await addDoc(enrollmentsRef, { student_id: created.id, class_id: classId, createdAt: serverTimestamp() });
    }

    invalidate("students");
    audit(req, { action: "create", entity: "student", entityId: created.id, summary: `إضافة طالب ${name} (${uid})` });
    res.status(201).json({ success: true, id: created.id });
  })
);

router.put(
  "/admin/students/:id",
  requireStaff,
  wrap(async (req, res) => {
    const target = doc(db, "users", req.params.id);
    const snap = await getDoc(target);
    if (!snap.exists() || snap.data().role !== "student") throw notFound("الطالب غير موجود");

    const b = req.body || {};
    const patch: Record<string, any> = {};
    const editable: [string, () => any][] = [
      ["name", () => v.str(b.name, "الاسم", { min: 3, max: 120 })],
      ["phone", () => v.phone(b.phone, "رقم الهاتف", { optional: true })],
      ["email", () => v.email(b.email, "البريد الإلكتروني", { optional: true })],
      ["address", () => v.str(b.address, "العنوان", { max: 250, optional: true })],
      ["guardian_name", () => v.str(b.guardian_name, "اسم ولي الأمر", { max: 120, optional: true })],
      ["guardian_phone", () => v.phone(b.guardian_phone, "هاتف ولي الأمر", { optional: true })],
      ["health_notes", () => v.str(b.health_notes, "ملاحظات صحية", { max: 600, optional: true })],
      ["status", () => v.oneOf(b.status, "حالة الحساب", ["active", "suspended"] as const)],
    ];
    for (const [key, parse] of editable) {
      if (b[key] !== undefined) patch[key] = parse();
    }
    if (Object.keys(patch).length === 0) throw badRequest("لا توجد بيانات للتحديث");

    patch.updatedAt = serverTimestamp();
    await updateDoc(target, patch);

    invalidate("students");
    audit(req, {
      action: "update",
      entity: "student",
      entityId: snap.id,
      summary: `تعديل بيانات الطالب ${snap.data().name}`,
      meta: patch,
    });
    res.json({ success: true });
  })
);

/**
 * Deleting a student used to leave their enrollments, grades, attendance and
 * notifications behind as orphans. Everything tied to the account goes with it.
 */
router.delete(
  "/admin/students/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const studentId = req.params.id;
    const snap = await getDoc(doc(db, "users", studentId));
    if (!snap.exists()) throw notFound("الطالب غير موجود");

    const related = await Promise.all([
      getDocs(query(enrollmentsRef, where("student_id", "==", studentId))),
      getDocs(query(notificationsRef, where("user_id", "==", studentId))),
    ]);

    const refs = related.flatMap((s) => s.docs.map((d) => d.ref));
    for (const group of chunk(refs, BATCH_LIMIT)) {
      const batch = writeBatch(db);
      group.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, "users", studentId));

    invalidate("students");
    audit(req, {
      action: "delete",
      entity: "student",
      entityId: studentId,
      summary: `حذف الطالب ${snap.data().name} مع ${refs.length} سجل مرتبط`,
    });
    res.json({ success: true });
  })
);

/* ------------------------------------------------------------------ *
 * Teachers & assistants
 * ------------------------------------------------------------------ */

router.get(
  "/admin/teachers",
  requireStaff,
  wrap(async (_req, res) => {
    const teachers = await fetchAll<Record<string, any>>(query(usersRef, where("role", "==", "teacher")));
    res.json(teachers.map(sanitizeUser));
  })
);

router.post(
  "/admin/teachers",
  requireAdmin,
  wrap(async (req, res) => {
    const name = v.str(req.body?.name, "اسم المعلم", { min: 3, max: 120 });
    const username = v.str(req.body?.username, "اسم المستخدم", { min: 3, max: 60 });
    const plain = v.password(req.body?.password);
    const uid = `TCH${Date.now().toString(36).toUpperCase().slice(-6)}`;

    const created = await addDoc(usersRef, {
      name,
      username,
      uid,
      password: hashPassword(plain),
      role: "teacher",
      status: "active",
      subjects: v.stringArray(req.body?.subjects, "المواد", { max: 40 }),
      phone: v.phone(req.body?.phone, "رقم الهاتف", { optional: true }),
      createdAt: serverTimestamp(),
    });

    audit(req, { action: "create", entity: "teacher", entityId: created.id, summary: `إضافة معلم ${name} (${uid})` });
    res.status(201).json({ success: true, id: created.id, uid });
  })
);

router.put(
  "/admin/teachers/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const target = doc(db, "users", req.params.id);
    const snap = await getDoc(target);
    if (!snap.exists()) throw notFound("المستخدم غير موجود");

    const patch: Record<string, any> = {};
    if (req.body?.name !== undefined) patch.name = v.str(req.body.name, "الاسم", { min: 3, max: 120 });
    if (req.body?.subjects !== undefined) patch.subjects = v.stringArray(req.body.subjects, "المواد", { max: 40 });
    if (req.body?.phone !== undefined) patch.phone = v.phone(req.body.phone, "رقم الهاتف", { optional: true });
    if (req.body?.status !== undefined) {
      patch.status = v.oneOf(req.body.status, "حالة الحساب", ["active", "suspended"] as const);
    }
    if (Object.keys(patch).length === 0) throw badRequest("لا توجد بيانات للتحديث");

    patch.updatedAt = serverTimestamp();
    await updateDoc(target, patch);

    audit(req, {
      action: "update",
      entity: "teacher",
      entityId: snap.id,
      summary: `تعديل بيانات ${snap.data().name}`,
      meta: patch,
    });
    res.json({ success: true });
  })
);

/**
 * Removing a teacher also removes them from every class they were assigned to,
 * which the previous version left dangling.
 */
router.delete(
  "/admin/teachers/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const teacherId = req.params.id;
    if (teacherId === req.user!.id) throw badRequest("لا يمكنك حذف حسابك الخاص");

    const snap = await getDoc(doc(db, "users", teacherId));
    if (!snap.exists()) throw notFound("المستخدم غير موجود");

    const classes = await fetchAll<Record<string, any>>(classesRef);
    const affected = classes.filter(
      (c) => (c.teacher_ids || []).includes(teacherId) || c.teacher_id === teacherId
    );

    for (const group of chunk(affected, BATCH_LIMIT)) {
      const batch = writeBatch(db);
      for (const c of group) {
        const ids: string[] = c.teacher_ids || (c.teacher_id ? [c.teacher_id] : []);
        const names: string[] = c.teacher_names || (c.teacher_name ? [c.teacher_name] : []);
        const keep = ids.map((id, i) => ({ id, name: names[i] || "معلم" })).filter((t) => t.id !== teacherId);
        batch.update(doc(db, "classes", c.id), {
          teacher_ids: keep.map((t) => t.id),
          teacher_names: keep.map((t) => t.name),
          teacher_id: null,
          teacher_name: null,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    await deleteDoc(doc(db, "users", teacherId));
    invalidate("classes");

    audit(req, {
      action: "delete",
      entity: "user",
      entityId: teacherId,
      summary: `حذف ${snap.data().name} وإزالته من ${affected.length} صف`,
    });
    res.json({ success: true });
  })
);

router.get(
  "/admin/assistants",
  requireAdmin,
  wrap(async (_req, res) => {
    const rows = await fetchAll<Record<string, any>>(query(usersRef, where("role", "==", "assistant_admin")));
    res.json(rows.map(sanitizeUser));
  })
);

router.post(
  "/admin/assistants",
  requireAdmin,
  wrap(async (req, res) => {
    const name = v.str(req.body?.name, "الاسم", { min: 3, max: 120 });
    const username = v.str(req.body?.username, "اسم المستخدم", { min: 3, max: 60 });
    const plain = v.password(req.body?.password);
    const uid = `AST${Date.now().toString(36).toUpperCase().slice(-6)}`;

    const created = await addDoc(usersRef, {
      name,
      username,
      uid,
      password: hashPassword(plain),
      role: "assistant_admin",
      status: "active",
      createdAt: serverTimestamp(),
    });

    audit(req, {
      action: "create",
      entity: "assistant_admin",
      entityId: created.id,
      summary: `إضافة مساعد إدارة ${name} (${uid})`,
    });
    res.status(201).json({ success: true, id: created.id, uid });
  })
);

/* ------------------------------------------------------------------ *
 * Password reset (admin-initiated)
 * ------------------------------------------------------------------ */

router.post(
  "/admin/users/:id/reset-password",
  requireAdmin,
  wrap(async (req, res) => {
    const newPassword = v.password(req.body?.new_password, "كلمة المرور الجديدة");
    const target = doc(db, "users", req.params.id);
    const snap = await getDoc(target);
    if (!snap.exists()) throw notFound("المستخدم غير موجود");

    await updateDoc(target, {
      password: hashPassword(newPassword),
      password_reset_by: req.user!.id,
      password_changed_at: serverTimestamp(),
    });

    await addDoc(notificationsRef, {
      user_id: snap.id,
      title: "تم تغيير كلمة المرور",
      message: "قامت الإدارة بإعادة تعيين كلمة المرور الخاصة بحسابك. يرجى مراجعة الإدارة لاستلامها.",
      type: "security",
      isRead: false,
      createdAt: serverTimestamp(),
    });

    audit(req, {
      action: "password_reset",
      entity: "user",
      entityId: snap.id,
      summary: `إعادة تعيين كلمة مرور ${snap.data().name}`,
    });
    res.json({ success: true });
  })
);

/* ------------------------------------------------------------------ *
 * Broadcast
 * ------------------------------------------------------------------ */

router.post(
  "/admin/broadcast",
  requireStaff,
  wrap(async (req, res) => {
    const title = v.str(req.body?.title, "عنوان الإشعار", { max: 120, optional: true }) || "تنبيه من الإدارة";
    const message = v.str(req.body?.message, "نص الإشعار", { min: 2, max: 1000 });
    const studentId = v.str(req.body?.studentId, "الطالب", { max: 64, optional: true });
    const classId = v.str(req.body?.classId, "الصف", { max: 64, optional: true });

    let recipients: string[];
    if (studentId) {
      recipients = [studentId];
    } else if (classId) {
      const enrollments = await fetchAll<{ student_id: string }>(
        query(enrollmentsRef, where("class_id", "==", classId))
      );
      recipients = [...new Set(enrollments.map((e) => e.student_id))];
    } else {
      const students = await fetchAll<Record<string, any>>(query(usersRef, where("role", "==", "student")));
      recipients = students.map((s) => s.id);
    }

    if (recipients.length === 0) return res.json({ success: true, count: 0 });

    for (const group of chunk(recipients, BATCH_LIMIT)) {
      const batch = writeBatch(db);
      for (const id of group) {
        batch.set(doc(notificationsRef), {
          user_id: id,
          title,
          message,
          type: "broadcast",
          isRead: false,
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    audit(req, {
      action: "broadcast",
      entity: "notification",
      summary: `إرسال إشعار "${title}" إلى ${recipients.length} مستخدم`,
      meta: { classId, studentId },
    });
    res.json({ success: true, count: recipients.length });
  })
);

/* ------------------------------------------------------------------ *
 * Audit log
 * ------------------------------------------------------------------ */

router.get(
  "/admin/audit",
  requireAdmin,
  wrap(async (req, res) => {
    const max = v.num(req.query.limit, "الحد", { min: 1, max: 500, optional: true, default: 100 });
    const filters = [];
    if (req.query.action) filters.push(where("action", "==", String(req.query.action)));
    if (req.query.actor_id) filters.push(where("actor_id", "==", String(req.query.actor_id)));

    /**
     * The audit log only ever grows — every login and every mutation appends a
     * row. Reading the whole collection to display the newest hundred meant a
     * single page view cost as many document reads as there were entries, which
     * after a term is tens of thousands. Firestore now does the ordering and
     * the cut, so the cost is fixed at `max` regardless of history size.
     */
    const rows = await fetchIndexed<Record<string, any>>(
      query(auditRef, ...filters, orderBy("createdAt", "desc"), fsLimit(max)),
      async () => {
        const all = await fetchAll<Record<string, any>>(
          filters.length ? query(auditRef, ...filters) : auditRef
        );
        all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        return all.slice(0, max);
      },
      "audit log, newest first"
    );

    res.json(rows);
  })
);

/* ------------------------------------------------------------------ *
 * Legacy pre-issued UID pool
 *
 * Kept so existing UID cards stay usable, but self-registration + approval is
 * now the primary path.
 * ------------------------------------------------------------------ */

router.get(
  "/admin/uids",
  requireStaff,
  wrap(async (_req, res) => {
    res.json(await fetchAll(validUidsRef));
  })
);

router.post(
  "/admin/uids/generate",
  requireStaff,
  wrap(async (req, res) => {
    const count = v.num(req.body?.count, "العدد", { min: 1, max: 100, optional: true, default: 10 });
    const existing = await fetchAll<{ uid: string }>(validUidsRef);
    const maxId = existing.reduce((max, row) => {
      const n = parseInt(row.uid, 10);
      return Number.isNaN(n) ? max : Math.max(max, n);
    }, 0);

    const batch = writeBatch(db);
    for (let i = 1; i <= count; i++) {
      batch.set(doc(validUidsRef), { uid: String(maxId + i), used: false, createdAt: serverTimestamp() });
    }
    await batch.commit();

    audit(req, { action: "create", entity: "valid_uid", summary: `توليد ${count} رقم تعريفي` });
    res.json({ success: true, count });
  })
);

router.post(
  "/admin/uids/add",
  requireStaff,
  wrap(async (req, res) => {
    const uid = v.str(req.body?.uid, "الرقم التعريفي", { min: 1, max: 64 });
    const clash = await getDocs(query(validUidsRef, where("uid", "==", uid), fsLimit(1)));
    if (!clash.empty) throw badRequest("هذا الـ UID موجود بالفعل");

    await addDoc(validUidsRef, { uid, used: false, createdAt: serverTimestamp() });
    audit(req, { action: "create", entity: "valid_uid", summary: `إضافة رقم تعريفي ${uid}` });
    res.json({ success: true });
  })
);

router.delete(
  "/admin/uids/:id",
  requireStaff,
  wrap(async (req, res) => {
    await deleteDoc(doc(db, "valid_uids", req.params.id));
    audit(req, { action: "delete", entity: "valid_uid", entityId: req.params.id, summary: "حذف رقم تعريفي" });
    res.json({ success: true });
  })
);

export default router;
