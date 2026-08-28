import { Router } from "express";
import { doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import {
  attendanceRef,
  chunk,
  classesRef,
  db,
  fetchAll,
  getDocsByIds,
  notificationsRef,
  usersRef,
} from "../lib/db.js";
import { requireAuth, requireRole, requireSelfOrStaff } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { badRequest, notFound, wrap } from "../lib/http.js";
import * as v from "../lib/validate.js";

const router = Router();

const BATCH_LIMIT = 450;
const STATUSES = ["present", "absent", "late", "excused"] as const;

const STATUS_LABEL: Record<string, string> = {
  present: "حاضر",
  absent: "غائب",
  late: "متأخر",
  excused: "غياب بعذر",
};

/**
 * Record attendance for a class on a date.
 *
 * Re-submitting the same day now *replaces* the previous records instead of
 * appending a second set. The old behaviour silently doubled every absence
 * count each time a teacher corrected a mistake.
 */
router.post(
  "/attendance",
  requireAuth,
  requireRole("teacher", "admin", "assistant_admin"),
  wrap(async (req, res) => {
    const classId = v.str(req.body?.classId, "الصف", { max: 64 });
    const date = v.isoDate(req.body?.date, "التاريخ");
    const rows: any[] = Array.isArray(req.body?.attendanceData) ? req.body.attendanceData : [];
    if (rows.length === 0) throw badRequest("لا توجد بيانات حضور للتسجيل");
    if (rows.length > 500) throw badRequest("عدد الطلاب كبير جداً في طلب واحد");

    if (date > new Date().toISOString().slice(0, 10)) {
      throw badRequest("لا يمكن تسجيل الحضور لتاريخ مستقبلي");
    }

    const classSnap = await getDoc(doc(db, "classes", classId));
    if (!classSnap.exists()) throw notFound("الصف غير موجود");
    const className = classSnap.data().name;

    const entries = rows.map((row: any) => ({
      studentId: v.str(row?.studentId, "معرّف الطالب", { max: 64 }),
      status: v.oneOf(row?.status, "حالة الحضور", STATUSES),
      note: v.str(row?.note, "ملاحظة", { max: 200, optional: true }),
    }));

    // Clear any earlier submission for this class/date.
    const existing = await getDocs(
      query(attendanceRef, where("class_id", "==", classId), where("date", "==", date))
    );
    const staleRefs = existing.docs.map((d) => d.ref);
    for (const group of chunk(staleRefs, BATCH_LIMIT)) {
      const batch = writeBatch(db);
      group.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    for (const group of chunk(entries, Math.floor(BATCH_LIMIT / 2))) {
      const batch = writeBatch(db);
      for (const entry of group) {
        batch.set(doc(attendanceRef), {
          student_id: entry.studentId,
          class_id: classId,
          class_name: className,
          date,
          status: entry.status,
          note: entry.note,
          recorded_by: req.user!.id,
          recorded_by_name: req.user!.name,
          createdAt: serverTimestamp(),
        });

        if (entry.status === "absent" || entry.status === "late") {
          batch.set(doc(notificationsRef), {
            user_id: entry.studentId,
            title: entry.status === "absent" ? "تنبيه غياب" : "تنبيه تأخر",
            message: `تم تسجيلك ${STATUS_LABEL[entry.status]} في ${className} بتاريخ ${date}`,
            type: "absence",
            isRead: false,
            createdAt: serverTimestamp(),
          });
        }
      }
      await batch.commit();
    }

    const absentCount = entries.filter((e) => e.status === "absent").length;
    audit(req, {
      action: "attendance",
      entity: "class",
      entityId: classId,
      summary: `تسجيل حضور ${className} بتاريخ ${date} (${absentCount} غائب من ${entries.length})`,
      meta: { date, replaced: staleRefs.length },
    });

    res.json({ success: true, recorded: entries.length, replaced: staleRefs.length });
  })
);

/** Existing records for a class/date, so the roster loads pre-filled. */
router.get(
  "/class/:classId/attendance",
  requireAuth,
  wrap(async (req, res) => {
    const date = v.isoDate(req.query.date, "التاريخ");
    const rows = await fetchAll<Record<string, any>>(
      query(attendanceRef, where("class_id", "==", req.params.classId), where("date", "==", date))
    );
    res.json(rows);
  })
);

router.get(
  "/student/:studentId/attendance",
  requireAuth,
  requireSelfOrStaff("studentId"),
  wrap(async (req, res) => {
    const rows = await fetchAll<Record<string, any>>(
      query(attendanceRef, where("student_id", "==", req.params.studentId))
    );
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    res.json(rows);
  })
);

/**
 * Today's absences across the school. Previously two `getDoc` calls per absent
 * student; now two batched lookups for the whole list.
 */
router.get(
  "/admin/absences/daily",
  requireAuth,
  requireRole("admin", "assistant_admin", "teacher"),
  wrap(async (req, res) => {
    const date = req.query.date
      ? v.isoDate(req.query.date, "التاريخ")
      : new Date().toISOString().slice(0, 10);

    const records = await fetchAll<Record<string, any>>(
      query(attendanceRef, where("date", "==", date), where("status", "==", "absent"))
    );
    if (records.length === 0) return res.json([]);

    const [students, classes] = await Promise.all([
      getDocsByIds<Record<string, any>>(usersRef, records.map((r) => r.student_id)),
      getDocsByIds<Record<string, any>>(classesRef, records.map((r) => r.class_id)),
    ]);

    res.json(
      records.map((r) => {
        const student = students.get(r.student_id);
        const klass = classes.get(r.class_id);
        return {
          id: r.id,
          studentId: r.student_id,
          studentName: student?.name || "طالب غير معروف",
          studentUid: student?.uid || "N/A",
          guardianPhone: student?.guardian_phone || "",
          className: klass?.name || r.class_name || "صف غير معروف",
          date: r.date,
          time: r.createdAt?.toDate?.() || null,
        };
      })
    );
  })
);

export default router;
