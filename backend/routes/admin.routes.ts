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
import { hashPassword, requireAdmin, requireRole, requireStaff, sanitizeUser } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { badRequest, forbidden, notFound, wrap } from "../lib/http.js";
import { invalidate } from "../lib/cache.js";
import { matchesStudent, normalizeArabic, paginate, studentRoster, teacherRoster } from "../lib/roster.js";
import * as v from "../lib/validate.js";

const router = Router();

const BATCH_LIMIT = 450;
const DEFAULT_PAGE_SIZE = 20;

/* ------------------------------------------------------------------ *
 * Staff directory
 * ------------------------------------------------------------------ */

/**
 * The student list, paginated and searchable.
 *
 * `search` matches the name or the identifying number and tolerates the usual
 * Arabic spelling variants, so a caller never has to load every student just to
 * find one. `total` is the size of the whole filtered list — that, not the
 * length of the current page, is what a counter should show.
 */
router.get(
  "/admin/students",
  requireStaff,
  wrap(async (req, res) => {
    const pageSize = v.num(req.query.limit, "الحد", { min: 1, max: 200, optional: true, default: DEFAULT_PAGE_SIZE });
    const offset = v.num(req.query.after ?? req.query.offset, "الإزاحة", {
      min: 0,
      max: 1_000_000,
      optional: true,
      default: 0,
    });
    const search = normalizeArabic(req.query.search);
    const classId = req.query.class_id ? String(req.query.class_id) : null;

    const roster = await studentRoster();
    const matched = roster.filter(
      (s) => (!classId || s.class_id === classId) && matchesStudent(s, search)
    );

    res.json(paginate(matched, offset, pageSize));
  })
);

/**
 * A light directory for the student pickers: id, name, number, class.
 *
 * Every "pick one student" control used to fill itself from a page of full
 * student records, which both truncated the choices at the page size and
 * shipped fields nobody displayed. A few hundred of these rows are a handful of
 * kilobytes, so a picker can search the whole school in the browser without a
 * request per keystroke.
 *
 * A teacher may open a report for a student they teach, so they get the same
 * control — narrowed to the classes they are actually assigned to rather than
 * the whole school.
 *
 * Declared before `/admin/students/:id` so "lookup" is not read as an id.
 */
router.get(
  "/admin/students/lookup",
  requireRole("admin", "assistant_admin", "teacher"),
  wrap(async (req, res) => {
    const roster = await studentRoster();

    let visible = roster;
    if (req.user!.role === "teacher") {
      const teacherId = req.user!.id;
      const [assigned, legacy] = await Promise.all([
        fetchAll<Record<string, any>>(query(classesRef, where("teacher_ids", "array-contains", teacherId))),
        fetchAll<Record<string, any>>(query(classesRef, where("teacher_id", "==", teacherId))),
      ]);
      const classIds = new Set([...assigned, ...legacy].map((c) => c.id));
      visible = roster.filter((s) => s.class_id && classIds.has(s.class_id));
    }

    res.json(
      visible.map((s) => ({
        id: s.id,
        name: s.name,
        uid: s.uid,
        class_id: s.class_id,
        class_name: s.class_name,
        guardian_phone: s.guardian_phone || "",
      }))
    );
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

    /**
     * Contact details are day-to-day corrections, so any staff member may make
     * them. Identity — the national ID, the date of birth, the login number —
     * is what the school's paperwork is built on, so only a full admin can
     * touch it. The admin can change anything on the record; that is the point
     * of the role.
     */
    const editable: [string, () => any][] = [
      ["name", () => v.str(b.name, "الاسم", { min: 3, max: 120 })],
      ["phone", () => v.phone(b.phone, "رقم الهاتف", { optional: true })],
      ["email", () => v.email(b.email, "البريد الإلكتروني", { optional: true })],
      ["address", () => v.str(b.address, "العنوان", { max: 250, optional: true })],
      ["guardian_name", () => v.str(b.guardian_name, "اسم ولي الأمر", { max: 120, optional: true })],
      ["guardian_phone", () => v.phone(b.guardian_phone, "هاتف ولي الأمر", { optional: true })],
      ["guardian_relation", () => v.str(b.guardian_relation, "صلة القرابة", { max: 60, optional: true })],
      ["guardian_job", () => v.str(b.guardian_job, "مهنة ولي الأمر", { max: 120, optional: true })],
      ["health_notes", () => v.str(b.health_notes, "ملاحظات صحية", { max: 600, optional: true })],
      ["status", () => v.oneOf(b.status, "حالة الحساب", ["active", "suspended"] as const)],
    ];

    const adminOnly: [string, () => any][] = [
      ["mother_name", () => v.str(b.mother_name, "اسم الأم", { max: 120, optional: true })],
      ["national_id", () => v.str(b.national_id, "الرقم الوطني", { max: 40, optional: true })],
      ["birth_date", () => v.isoDate(b.birth_date, "تاريخ الميلاد", { optional: true })],
      ["birth_place", () => v.str(b.birth_place, "محل الولادة", { max: 120, optional: true })],
      ["previous_school", () => v.str(b.previous_school, "المدرسة السابقة", { max: 160, optional: true })],
      ["notes", () => v.str(b.notes, "ملاحظات", { max: 600, optional: true })],
    ];

    const isFullAdmin = req.user!.role === "admin";
    for (const [key, parse] of [...editable, ...(isFullAdmin ? adminOnly : [])]) {
      if (b[key] !== undefined) patch[key] = parse();
    }

    // The identifying number doubles as the username, so it has to stay unique.
    if (isFullAdmin && b.uid !== undefined) {
      const uid = v.str(b.uid, "الرقم التعريفي", { min: 3, max: 64 });
      if (uid !== snap.data().uid) {
        const clash = await getDocs(query(usersRef, where("uid", "==", uid), fsLimit(1)));
        if (!clash.empty) throw badRequest("هذا الرقم التعريفي مستخدم بالفعل");
        patch.uid = uid;
        patch.username = uid;
      }
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
  wrap(async (req, res) => {
    const pageSize = v.num(req.query.limit, "الحد", { min: 1, max: 200, optional: true, default: DEFAULT_PAGE_SIZE });
    const offset = v.num(req.query.after ?? req.query.offset, "الإزاحة", {
      min: 0,
      max: 1_000_000,
      optional: true,
      default: 0,
    });
    const search = normalizeArabic(req.query.search);

    const roster = await teacherRoster();
    const matched = search
      ? roster.filter((teacher) => normalizeArabic(teacher.name).includes(search))
      : roster;

    res.json(paginate(matched, offset, pageSize));
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

    invalidate("teachers");
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

    const b = req.body || {};
    const patch: Record<string, any> = {};

    const editable: [string, () => any][] = [
      ["name", () => v.str(b.name, "الاسم", { min: 3, max: 120 })],
      ["subjects", () => v.stringArray(b.subjects, "المواد", { max: 40 })],
      ["phone", () => v.phone(b.phone, "رقم الهاتف", { optional: true })],
      ["email", () => v.email(b.email, "البريد الإلكتروني", { optional: true })],
      ["address", () => v.str(b.address, "العنوان", { max: 250, optional: true })],
      ["mother_name", () => v.str(b.mother_name, "اسم الأم", { max: 120, optional: true })],
      ["national_id", () => v.str(b.national_id, "الرقم الوطني", { max: 40, optional: true })],
      ["birth_date", () => v.isoDate(b.birth_date, "تاريخ الميلاد", { optional: true })],
      ["qualification", () => v.str(b.qualification, "التحصيل الدراسي", { max: 120, optional: true })],
      ["experience_years", () => v.str(b.experience_years, "سنوات الخبرة", { max: 10, optional: true })],
      ["status", () => v.oneOf(b.status, "حالة الحساب", ["active", "suspended"] as const)],
    ];
    for (const [key, parse] of editable) {
      if (b[key] !== undefined) patch[key] = parse();
    }

    if (b.uid !== undefined) {
      const uid = v.str(b.uid, "الرقم التعريفي", { min: 3, max: 64 });
      if (uid !== snap.data().uid) {
        const clash = await getDocs(query(usersRef, where("uid", "==", uid), fsLimit(1)));
        if (!clash.empty) throw badRequest("هذا الرقم التعريفي مستخدم بالفعل");
        patch.uid = uid;
        patch.username = uid;
      }
    }

    if (Object.keys(patch).length === 0) throw badRequest("لا توجد بيانات للتحديث");

    patch.updatedAt = serverTimestamp();
    await updateDoc(target, patch);

    invalidate("teachers");
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
    invalidate("teachers");

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
 *
 * The admin sets any account's password directly — theirs is the account that
 * answers when a parent turns up at the office having forgotten it.
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
