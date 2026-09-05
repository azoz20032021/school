import { query, where } from "firebase/firestore";
import {
  classesRef,
  enrollmentsRef,
  fetchAll,
  usersRef,
  type WithId,
} from "./db.js";
import { sanitizeUser } from "./auth.js";
import { cached } from "./cache.js";

/**
 * The staff directory, read once a minute and served from memory afterwards.
 *
 * The previous version paged the directory straight out of Firestore with
 * `where("role", "==", ...) + orderBy("name")`. That pairing needs a composite
 * index, and Firestore answers a query whose index is missing with an error
 * rather than a slow result — so on a project where
 * `firebase deploy --only firestore:indexes` had not been run, every student
 * list in the app (the dashboard, the report pickers) came back empty with no
 * visible reason. A second, quieter failure came from `orderBy("name")`
 * silently dropping any account that has no `name` field at all.
 *
 * Reading the roster whole and sorting it here needs no index, can't hide
 * accounts, and — because a school has hundreds of students, not millions —
 * costs one cheap read per minute per warm instance instead of one per page
 * view. It also gives every caller search, a correct total, and each student's
 * class without a second round trip.
 */

/**
 * Five minutes. The roster is a full read of the students, their enrolments and
 * the classes — the single largest recurring query in the app — and every write
 * that changes it drops the entry, so the only staleness left is
 * a change made on one serverless instance not being seen by another until the
 * entry expires.
 */
const ROSTER_TTL_MS = 300_000;

export interface RosterStudent extends Record<string, any> {
  id: string;
  name: string;
  uid: string;
  class_id: string | null;
  class_name: string;
}

/**
 * Arabic is written with several interchangeable spellings of the same letter,
 * so a plain `includes` misses "احمد" when the record says "أحمد". Folding the
 * variants (and the diacritics people rarely type) makes the search boxes
 * behave the way a person expects.
 */
export function normalizeArabic(text: unknown): string {
  return String(text ?? "")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[إأآٱا]/g, "ا")
    .replace(/[ىی]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True when `needle` appears in the student's name or identifying number. */
export function matchesStudent(student: { name?: string; uid?: string }, needle: string): boolean {
  if (!needle) return true;
  return (
    normalizeArabic(student.name).includes(needle) ||
    String(student.uid ?? "").toLowerCase().includes(needle)
  );
}

const byName = (a: Record<string, any>, b: Record<string, any>) =>
  String(a.name ?? "").localeCompare(String(b.name ?? ""), "ar");

/** Every student, with their class resolved, sorted by name. */
export async function studentRoster(): Promise<RosterStudent[]> {
  return cached("students:roster", ROSTER_TTL_MS, async () => {
    const [students, enrollments, classes] = await Promise.all([
      fetchAll<Record<string, any>>(query(usersRef, where("role", "==", "student"))),
      fetchAll<{ student_id: string; class_id: string }>(enrollmentsRef),
      fetchAll<{ name: string }>(classesRef),
    ]);

    const classNames = new Map(classes.map((c) => [c.id, c.name]));
    const classByStudent = new Map(enrollments.map((e) => [e.student_id, e.class_id]));

    return students
      .map((s) => {
        const classId = classByStudent.get(s.id) || null;
        return {
          ...sanitizeUser(s),
          class_id: classId,
          class_name: (classId && classNames.get(classId)) || "غير معيّن",
        } as RosterStudent;
      })
      .sort(byName);
  });
}

/** Every teacher, sorted by name. Same reasoning as `studentRoster`. */
export async function teacherRoster(): Promise<WithId<Record<string, any>>[]> {
  return cached("teachers:roster", ROSTER_TTL_MS, async () => {
    const teachers = await fetchAll<Record<string, any>>(
      query(usersRef, where("role", "==", "teacher"))
    );
    return teachers.map((t) => sanitizeUser(t) as WithId<Record<string, any>>).sort(byName);
  });
}

/**
 * Offset pagination over an in-memory list.
 *
 * `nextCursor` is the offset of the following page as a string, so callers keep
 * treating it as an opaque token and pass it straight back as `after`.
 */
export function paginate<T>(
  rows: T[],
  offset: number,
  pageSize: number
): { data: T[]; total: number; nextCursor: string | null } {
  const start = Math.max(0, offset);
  const page = rows.slice(start, start + pageSize);
  const next = start + pageSize;
  return {
    data: page,
    total: rows.length,
    nextCursor: next < rows.length ? String(next) : null,
  };
}
