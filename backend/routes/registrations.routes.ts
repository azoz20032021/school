import { Router } from "express";
import crypto from "node:crypto";
import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  classesRef,
  db,
  enrollmentsRef,
  fetchAll,
  fetchPage,
  invoicesRef,
  notificationsRef,
  registrationsRef,
  usersRef,
} from "../lib/db.js";
import { hashPassword, rateLimit, requireAdmin, requireStaff } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { badRequest, HttpError, notFound, wrap } from "../lib/http.js";
import { invalidate } from "../lib/cache.js";
import { recomputeStudentFees } from "../lib/fees.js";
import * as v from "../lib/validate.js";

const router = Router();

const RELATIONS = ["الأب", "الأم", "الأخ", "العم", "الخال", "الجد", "ولي أمر آخر"] as const;

/**
 * The public form serves two kinds of applicant. A student application needs a
 * guardian and a class; a teacher application needs neither, and instead names
 * the subjects they teach. Everything else — identity, contact, password — is
 * the same, so one queue reviews both.
 */
const APPLICANT_ROLES = ["student", "teacher"] as const;
const STATUSES = ["pending", "approved", "rejected"] as const;

/** Unambiguous alphabet — no O/0 or I/1, since people read these off a screen. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeTrackingCode(): string {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/**
 * Allocate the next student UID atomically.
 *
 * Format `YYNNNN` (two-digit year + sequence), e.g. `260001` — numeric only so
 * it is easy to type on a phone keypad at the login screen.
 */
async function allocateStudentUid(): Promise<string> {
  const yearPrefix = String(new Date().getFullYear() % 100).padStart(2, "0");
  const counterDoc = doc(db, "counters", `student_uid_${yearPrefix}`);

  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterDoc);
    const next = (snap.exists() ? (snap.data().value as number) : 0) + 1;
    tx.set(counterDoc, { value: next, updatedAt: serverTimestamp() }, { merge: true });
    return next;
  });

  let candidate = `${yearPrefix}${String(seq).padStart(4, "0")}`;

  // Defensive: an account may already hold this UID if it was created by hand.
  for (let attempt = 0; attempt < 20; attempt++) {
    const clash = await getDocs(query(usersRef, where("uid", "==", candidate), fsLimit(1)));
    if (clash.empty) return candidate;
    candidate = `${yearPrefix}${String(seq + attempt + 1).padStart(4, "0")}`;
  }
  throw new HttpError(500, "تعذر توليد رقم تعريفي فريد، يرجى المحاولة مرة أخرى");
}

/* ------------------------------------------------------------------ *
 * Public: submit an application
 * ------------------------------------------------------------------ */

router.post(
  "/register",
  rateLimit({ windowMs: 60 * 60 * 1000, max: 10, keyPrefix: "register" }),
  wrap(async (req, res) => {
    const b = req.body || {};
    const applicantRole = v.oneOf(b.applicant_role, "نوع الحساب", APPLICANT_ROLES, "student");
    const isTeacher = applicantRole === "teacher";

    const application = {
      applicant_role: applicantRole,

      full_name: v.str(b.full_name, "الاسم الرباعي", { min: 5, max: 120 }),
      // Required for everyone: Iraqi records identify a person by their
      // mother's name, and the school needs it on every official document.
      mother_name: v.str(b.mother_name, "اسم الأم", { min: 2, max: 120 }),
      national_id: v.str(b.national_id, "رقم الهوية / البطاقة الوطنية", { min: 4, max: 40 }),
      birth_date: v.isoDate(b.birth_date, "تاريخ الميلاد"),
      birth_place: v.str(b.birth_place, "محل الولادة", { max: 120, optional: true }),

      phone: v.phone(b.phone, isTeacher ? "رقم الهاتف" : "رقم هاتف الطالب"),
      email: v.email(b.email, "البريد الإلكتروني", { optional: true }),
      address: v.str(b.address, "عنوان السكن", { min: 3, max: 250 }),

      // A teacher has no guardian; the fields stay on the document as empty
      // strings so every application has the same shape.
      guardian_name: isTeacher ? "" : v.str(b.guardian_name, "اسم ولي الأمر", { min: 3, max: 120 }),
      guardian_phone: isTeacher ? "" : v.phone(b.guardian_phone, "هاتف ولي الأمر"),
      guardian_relation: isTeacher ? "" : v.oneOf(b.guardian_relation, "صلة القرابة", RELATIONS, "الأب"),
      guardian_job: isTeacher ? "" : v.str(b.guardian_job, "مهنة ولي الأمر", { max: 120, optional: true }),

      previous_school: v.str(b.previous_school, isTeacher ? "جهة العمل السابقة" : "المدرسة السابقة", {
        max: 160,
        optional: true,
      }),
      last_grade: isTeacher ? "" : v.str(b.last_grade, "آخر صف دراسي", { max: 80, optional: true }),
      last_average: isTeacher ? "" : v.str(b.last_average, "المعدل السابق", { max: 20, optional: true }),
      health_notes: v.str(b.health_notes, "ملاحظات صحية", { max: 600, optional: true }),
      notes: v.str(b.notes, "ملاحظات إضافية", { max: 600, optional: true }),

      // Teacher-only.
      subjects: isTeacher ? v.stringArray(b.subjects, "المواد", { max: 20 }) : [],
      qualification: isTeacher ? v.str(b.qualification, "التحصيل الدراسي", { max: 120, optional: true }) : "",
      experience_years: isTeacher ? v.str(b.experience_years, "سنوات الخبرة", { max: 10, optional: true }) : "",
    };

    const plainPassword = v.password(b.password);
    const requestedClassId = isTeacher
      ? ""
      : v.str(b.requested_class_id, "الصف المطلوب", { max: 64, optional: true });

    // Reject duplicates: same national ID already applied or already enrolled.
    const [dupApplication, dupUser] = await Promise.all([
      getDocs(
        query(registrationsRef, where("national_id", "==", application.national_id), fsLimit(5))
      ),
      getDocs(query(usersRef, where("national_id", "==", application.national_id), fsLimit(1))),
    ]);

    if (!dupUser.empty) {
      throw badRequest("يوجد حساب مسجل مسبقاً بنفس رقم الهوية. يرجى تسجيل الدخول أو مراجعة الإدارة.");
    }
    const pendingDup = dupApplication.docs.find((d) => d.data().status === "pending");
    if (pendingDup) {
      throw badRequest(
        `لديك طلب قيد المراجعة بالفعل. رقم المتابعة الخاص بك: ${pendingDup.data().tracking_code}`
      );
    }

    let requestedClassName = "";
    if (requestedClassId) {
      const classDoc = await getDoc(doc(db, "classes", requestedClassId));
      if (!classDoc.exists()) throw badRequest("الصف المختار غير موجود");
      requestedClassName = classDoc.data().name;
    }

    const trackingCode = makeTrackingCode();

    const created = await addDoc(registrationsRef, {
      ...application,
      requested_class_id: requestedClassId || null,
      requested_class_name: requestedClassName || null,
      password: hashPassword(plainPassword),
      tracking_code: trackingCode,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    audit(req, {
      action: "create",
      entity: "registration",
      entityId: created.id,
      summary: `طلب ${isTeacher ? "تعيين معلم" : "تسجيل طالب"} جديد باسم ${application.full_name}`,
    });

    res.status(201).json({
      success: true,
      tracking_code: trackingCode,
      message:
        "تم استلام طلبك بنجاح. احتفظ برقم المتابعة لمعرفة حالة الطلب. سيتم إشعارك عند موافقة الإدارة.",
    });
  })
);

/* ------------------------------------------------------------------ *
 * Public: check application status by tracking code
 * ------------------------------------------------------------------ */

router.get(
  "/register/status/:code",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 40, keyPrefix: "regstatus" }),
  wrap(async (req, res) => {
    const code = v.str(req.params.code, "رقم المتابعة", { min: 4, max: 32 }).toUpperCase();
    const snapshot = await getDocs(query(registrationsRef, where("tracking_code", "==", code), fsLimit(1)));
    if (snapshot.empty) throw notFound("لا يوجد طلب بهذا الرقم. تأكد من رقم المتابعة.");

    const data = snapshot.docs[0].data();
    // Only the applicant-facing fields — never the password hash or reviewer notes.
    res.json({
      tracking_code: data.tracking_code,
      full_name: data.full_name,
      status: data.status,
      requested_class_name: data.requested_class_name,
      rejection_reason: data.status === "rejected" ? data.rejection_reason || "" : "",
      assigned_uid: data.status === "approved" ? data.assigned_uid || "" : "",
      submitted_at: data.createdAt?.toDate?.()?.toISOString() || null,
      reviewed_at: data.reviewed_at?.toDate?.()?.toISOString() || null,
    });
  })
);

/* ------------------------------------------------------------------ *
 * Staff: review queue
 * ------------------------------------------------------------------ */

const DEFAULT_PAGE_SIZE = 20;

router.get(
  "/admin/registrations",
  requireStaff,
  wrap(async (req, res) => {
    const pageSize = v.num(req.query.limit, "الحد", { min: 1, max: 100, optional: true, default: DEFAULT_PAGE_SIZE });
    const cursor = req.query.after ? String(req.query.after) : null;
    const status = req.query.status ? v.oneOf(req.query.status, "الحالة", STATUSES) : null;

    const filters: any[] = status ? [where("status", "==", status)] : [];
    const base = filters.length ? query(registrationsRef, ...filters) : registrationsRef;
    const q = query(base as any, orderBy("createdAt", "desc"));
    const { data, nextCursor } = await fetchPage<Record<string, any>>(q, pageSize, cursor, registrationsRef, {
      base,
      sortField: "createdAt",
      direction: "desc",
      label: "registrations by status, newest first",
    });

    res.json({ data: data.map(({ password, ...safe }) => safe), nextCursor });
  })
);

router.get(
  "/admin/registrations/:id",
  requireStaff,
  wrap(async (req, res) => {
    const snap = await getDoc(doc(db, "registrations", req.params.id));
    if (!snap.exists()) throw notFound("طلب التسجيل غير موجود");
    const { password, ...safe } = snap.data() as Record<string, any>;
    res.json({ id: snap.id, ...safe });
  })
);

/* ------------------------------------------------------------------ *
 * Staff: approve
 * ------------------------------------------------------------------ */

/** Turns an approved teacher application into a staff account. */
async function approveTeacher(
  req: any,
  res: any,
  registrationDoc: any,
  registrationId: string,
  data: Record<string, any>
) {
  const uid = `TCH${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const subjects: string[] = Array.isArray(data.subjects) ? data.subjects : [];

  const newUser = await addDoc(usersRef, {
    name: data.full_name,
    username: uid,
    uid,
    password: data.password, // already hashed at submission time
    role: "teacher",
    status: "active",

    mother_name: data.mother_name || "",
    national_id: data.national_id,
    birth_date: data.birth_date,
    birth_place: data.birth_place || "",
    phone: data.phone,
    email: data.email || "",
    address: data.address,
    subjects,
    qualification: data.qualification || "",
    experience_years: data.experience_years || "",
    previous_school: data.previous_school || "",

    registration_id: registrationId,
    approved_by: req.user!.id,
    approved_by_name: req.user!.name,
    createdAt: serverTimestamp(),
  });

  await updateDoc(registrationDoc, {
    status: "approved",
    assigned_uid: uid,
    created_user_id: newUser.id,
    reviewed_by: req.user!.id,
    reviewed_by_name: req.user!.name,
    reviewed_at: serverTimestamp(),
  });

  await addDoc(notificationsRef, {
    user_id: newUser.id,
    title: "تمت الموافقة على طلبك",
    message: `أهلاً بك ${data.full_name}. رقمك التعريفي للدخول هو: ${uid}.`,
    type: "registration",
    isRead: false,
    createdAt: serverTimestamp(),
  });

  invalidate("teachers");
  audit(req, {
    action: "approve",
    entity: "registration",
    entityId: registrationId,
    summary: `قبول المعلم ${data.full_name} برقم ${uid}`,
  });

  return res.json({ success: true, uid, user_id: newUser.id, role: "teacher" });
}

router.post(
  "/admin/registrations/:id/approve",
  requireStaff,
  wrap(async (req, res) => {
    const registrationDoc = doc(db, "registrations", req.params.id);
    const snap = await getDoc(registrationDoc);
    if (!snap.exists()) throw notFound("طلب التسجيل غير موجود");

    const data = snap.data() as Record<string, any>;
    if (data.status !== "pending") {
      throw badRequest(`تمت معالجة هذا الطلب مسبقاً (الحالة الحالية: ${data.status})`);
    }

    /**
     * A teacher application creates a staff account instead of a student one:
     * no class, no enrolment, no fees — and a `TCH` identifier rather than a
     * sequential student number.
     */
    if (data.applicant_role === "teacher") {
      return approveTeacher(req, res, registrationDoc, snap.id, data);
    }

    const classId = v.str(req.body?.class_id ?? data.requested_class_id, "الصف", {
      max: 64,
      optional: true,
    });
    if (!classId) throw badRequest("يجب تحديد الصف الدراسي قبل الموافقة");

    const classDoc = await getDoc(doc(db, "classes", classId));
    if (!classDoc.exists()) throw badRequest("الصف المختار غير موجود");

    const uid = await allocateStudentUid();

    const newUser = await addDoc(usersRef, {
      name: data.full_name,
      username: uid,
      uid,
      password: data.password, // already hashed at submission time
      role: "student",
      status: "active",

      mother_name: data.mother_name || "",
      national_id: data.national_id,
      birth_date: data.birth_date,
      birth_place: data.birth_place || "",
      phone: data.phone,
      email: data.email || "",
      address: data.address,
      guardian_name: data.guardian_name,
      guardian_phone: data.guardian_phone,
      guardian_relation: data.guardian_relation,
      guardian_job: data.guardian_job || "",
      previous_school: data.previous_school || "",
      health_notes: data.health_notes || "",

      registration_id: snap.id,
      approved_by: req.user!.id,
      approved_by_name: req.user!.name,
      createdAt: serverTimestamp(),
    });

    await addDoc(enrollmentsRef, {
      student_id: newUser.id,
      class_id: classId,
      createdAt: serverTimestamp(),
    });

    await updateDoc(registrationDoc, {
      status: "approved",
      assigned_uid: uid,
      created_user_id: newUser.id,
      approved_class_id: classId,
      approved_class_name: classDoc.data().name,
      reviewed_by: req.user!.id,
      reviewed_by_name: req.user!.name,
      reviewed_at: serverTimestamp(),
    });

    await addDoc(notificationsRef, {
      user_id: newUser.id,
      title: "تمت الموافقة على تسجيلك",
      message: `أهلاً بك ${data.full_name}. رقمك التعريفي للدخول هو: ${uid}. تم تسجيلك في ${classDoc.data().name}.`,
      type: "registration",
      isRead: false,
      createdAt: serverTimestamp(),
    });

    // Optional opening invoice, so the finance record starts with the student.
    const feeAmount = Number(req.body?.initial_fee_amount ?? 0);
    if (feeAmount > 0) {
      await addDoc(invoicesRef, {
        student_id: newUser.id,
        student_name: data.full_name,
        student_uid: uid,
        class_id: classId,
        class_name: classDoc.data().name,
        title: v.str(req.body?.initial_fee_title, "عنوان القسط", { max: 120, optional: true }) || "القسط الدراسي السنوي",
        category: "قسط دراسي",
        amount: feeAmount,
        discount: 0,
        paid_amount: 0,
        currency: "IQD",
        due_date: v.isoDate(req.body?.initial_fee_due_date, "تاريخ الاستحقاق", { optional: true }) || null,
        academic_year: new Date().getFullYear(),
        status: "unpaid",
        created_by: req.user!.id,
        created_by_name: req.user!.name,
        createdAt: serverTimestamp(),
      });
    }

    // The opening instalment has to appear in the student's stored totals.
    if (feeAmount > 0) await recomputeStudentFees(newUser.id);

    invalidate("students");
    invalidate("finance");
    audit(req, {
      action: "approve",
      entity: "registration",
      entityId: snap.id,
      summary: `الموافقة على تسجيل ${data.full_name} وإنشاء حساب برقم ${uid}`,
      meta: { uid, class_id: classId, user_id: newUser.id },
    });

    res.json({ success: true, uid, user_id: newUser.id });
  })
);

/* ------------------------------------------------------------------ *
 * Staff: reject
 * ------------------------------------------------------------------ */

router.post(
  "/admin/registrations/:id/reject",
  requireStaff,
  wrap(async (req, res) => {
    const reason = v.str(req.body?.reason, "سبب الرفض", { min: 3, max: 500 });
    const registrationDoc = doc(db, "registrations", req.params.id);
    const snap = await getDoc(registrationDoc);
    if (!snap.exists()) throw notFound("طلب التسجيل غير موجود");

    const data = snap.data() as Record<string, any>;
    if (data.status !== "pending") throw badRequest("تمت معالجة هذا الطلب مسبقاً");

    await updateDoc(registrationDoc, {
      status: "rejected",
      rejection_reason: reason,
      reviewed_by: req.user!.id,
      reviewed_by_name: req.user!.name,
      reviewed_at: serverTimestamp(),
    });

    audit(req, {
      action: "reject",
      entity: "registration",
      entityId: snap.id,
      summary: `رفض طلب تسجيل ${data.full_name}`,
      meta: { reason },
    });

    res.json({ success: true });
  })
);

router.delete(
  "/admin/registrations/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const registrationDoc = doc(db, "registrations", req.params.id);
    const snap = await getDoc(registrationDoc);
    if (!snap.exists()) throw notFound("طلب التسجيل غير موجود");

    await updateDoc(registrationDoc, {
      archived: true,
      archived_at: serverTimestamp(),
      archived_by: req.user!.id,
    });

    audit(req, {
      action: "delete",
      entity: "registration",
      entityId: snap.id,
      summary: `أرشفة طلب تسجيل ${snap.data().full_name}`,
    });
    res.json({ success: true });
  })
);

export default router;
