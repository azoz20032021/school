import { Router } from "express";
import { addDoc, deleteDoc, doc, getDoc, query, serverTimestamp, where } from "firebase/firestore";
import { db, fetchAll, schedulesRef, subjectsRef } from "../lib/db";
import { requireAuth, requireStaff } from "../lib/auth";
import { audit } from "../lib/audit";
import { badRequest, notFound, wrap } from "../lib/http";
import { cached, invalidate } from "../lib/cache";
import * as v from "../lib/validate";

const router = Router();

const SUBJECT_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-rose-500",
  "bg-purple-500",
  "bg-indigo-500",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-teal-500",
];

// Both spellings of Monday are accepted — existing timetable rows use the
// hamza form and rejecting it would orphan them.
const DAYS = ["الأحد", "الإثنين", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "السبت"] as const;

/* ------------------------------ Subjects ------------------------------ */

router.get(
  "/subjects",
  wrap(async (_req, res) => {
    // Read on nearly every page load and changes a few times a year.
    const subjects = await cached("subjects:all", 300_000, () => fetchAll(subjectsRef));
    res.json(subjects);
  })
);

router.post(
  "/admin/subjects",
  requireStaff,
  wrap(async (req, res) => {
    const name = v.str(req.body?.name, "اسم المادة", { min: 2, max: 80 });

    const existing = await fetchAll<{ name: string }>(subjectsRef);
    if (existing.some((s) => s.name === name)) throw badRequest("هذه المادة مضافة بالفعل");

    const created = await addDoc(subjectsRef, {
      name,
      color: SUBJECT_COLORS[existing.length % SUBJECT_COLORS.length],
      createdAt: serverTimestamp(),
    });

    invalidate("subjects");
    audit(req, { action: "create", entity: "subject", entityId: created.id, summary: `إضافة مادة ${name}` });
    res.status(201).json({ success: true, id: created.id });
  })
);

router.delete(
  "/admin/subjects/:id",
  requireStaff,
  wrap(async (req, res) => {
    const snap = await getDoc(doc(db, "subjects", req.params.id));
    if (!snap.exists()) throw notFound("المادة غير موجودة");

    await deleteDoc(doc(db, "subjects", req.params.id));
    invalidate("subjects");

    audit(req, {
      action: "delete",
      entity: "subject",
      entityId: req.params.id,
      summary: `حذف مادة ${snap.data().name}`,
    });
    res.json({ success: true });
  })
);

/* ------------------------------ Timetable ------------------------------ */

router.get(
  "/schedules/:classId",
  requireAuth,
  wrap(async (req, res) => {
    const rows = await fetchAll<Record<string, any>>(
      query(schedulesRef, where("class_id", "==", req.params.classId))
    );
    const order = new Map(DAYS.map((d, i) => [d, i]));
    rows.sort((a, b) => {
      const dayDiff = (order.get(a.day) ?? 99) - (order.get(b.day) ?? 99);
      return dayDiff !== 0 ? dayDiff : String(a.time).localeCompare(String(b.time));
    });
    res.json(rows);
  })
);

router.post(
  "/admin/schedules",
  requireStaff,
  wrap(async (req, res) => {
    const classId = v.str(req.body?.class_id, "الصف", { max: 64 });
    const day = v.oneOf(req.body?.day, "اليوم", DAYS);
    const time = v.str(req.body?.time, "الوقت", { max: 40 });
    const subject = v.str(req.body?.subject, "المادة", { max: 80 });

    const classSnap = await getDoc(doc(db, "classes", classId));
    if (!classSnap.exists()) throw notFound("الصف غير موجود");

    // Reject a second lesson in the same slot for the same class.
    const sameSlot = await fetchAll<Record<string, any>>(
      query(schedulesRef, where("class_id", "==", classId), where("day", "==", day), where("time", "==", time))
    );
    if (sameSlot.length > 0) throw badRequest("يوجد درس مسجل بالفعل في هذا اليوم والوقت لهذا الصف");

    const created = await addDoc(schedulesRef, {
      class_id: classId,
      class_name: classSnap.data().name,
      day,
      time,
      subject,
      teacher: v.str(req.body?.teacher, "المعلم", { max: 120, optional: true }),
      room: v.str(req.body?.room, "القاعة", { max: 60, optional: true }),
      createdAt: serverTimestamp(),
    });

    audit(req, {
      action: "create",
      entity: "schedule",
      entityId: created.id,
      summary: `إضافة حصة ${subject} يوم ${day} ${time} إلى ${classSnap.data().name}`,
    });
    res.status(201).json({ success: true, id: created.id });
  })
);

router.delete(
  "/admin/schedules/:id",
  requireStaff,
  wrap(async (req, res) => {
    const snap = await getDoc(doc(db, "schedules", req.params.id));
    if (!snap.exists()) throw notFound("الحصة غير موجودة");

    await deleteDoc(doc(db, "schedules", req.params.id));
    audit(req, {
      action: "delete",
      entity: "schedule",
      entityId: req.params.id,
      summary: `حذف حصة ${snap.data().subject} من الجدول`,
    });
    res.json({ success: true });
  })
);

export default router;
