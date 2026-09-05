import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc as fsDoc,
  documentId,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  startAfter,
  where,
  type CollectionReference,
  type DocumentData,
  type Query,
} from "firebase/firestore";

/**
 * Firebase config.
 *
 * These values are public by design (they identify the project, they are not
 * secrets). What actually protects the data is `firestore.rules` — see that
 * file: direct client access is denied, every read/write goes through this API.
 */
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBmgX4oKMpAQYbkuOha2zv1idpd5qQocak",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "mangment-school.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "mangment-school",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "mangment-school.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "824062335814",
  appId: process.env.FIREBASE_APP_ID || "1:824062335814:web:10e971ee4d76d8ed4aa347",
};

// Reuse the app across hot reloads and warm serverless invocations.
const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(firebaseApp);

/* ------------------------------------------------------------------ *
 * Server identity
 *
 * `firestore.rules` denies every anonymous request, so this process signs in
 * as a dedicated Firebase Auth service account whose credentials live only in
 * environment variables. A browser holding the public config can therefore
 * read nothing directly — every access has to come through this API, where the
 * role checks live.
 *
 * If the variables are absent the app still runs (useful while migrating), but
 * it warns, because that means the rules must still be permissive.
 * ------------------------------------------------------------------ */

const cleanEnv = (val?: string) => (val ? val.trim().replace(/^["']|["']$/g, "") : "");
const serverEmail = cleanEnv(process.env.FIREBASE_SERVER_EMAIL);
const serverPassword = cleanEnv(process.env.FIREBASE_SERVER_PASSWORD);

let signInPromise: Promise<void> | null = null;
let serverUid: string | null = null;

/** UID the server authenticated as — this is what firestore.rules must allow. */
export function getServerUid(): string | null {
  return serverUid;
}

export const dbAuthConfigured = Boolean(serverEmail && serverPassword);

if (!dbAuthConfigured) {
  console.warn(
    "[db] FIREBASE_SERVER_EMAIL / FIREBASE_SERVER_PASSWORD are not set.\n" +
      "     Firestore rules must stay open for this to work, which means anyone\n" +
      "     with the public web config can read the database directly.\n" +
      "     See firestore.rules for the lockdown steps."
  );
}

/**
 * Resolves once the server is authenticated to Firestore. Cheap to await on
 * every request: after the first sign-in the promise is already settled, and a
 * warm serverless instance reuses it.
 */
export function ensureDbAuth(): Promise<void> {
  if (!dbAuthConfigured) return Promise.resolve();

  if (!signInPromise) {
    // Imported lazily rather than at module scope: `firebase/auth` is only
    // needed when a service account is configured, and a bundler that resolves
    // it to the browser build would otherwise crash the whole function at
    // import time — taking down even routes that never touch the database.
    signInPromise = import("firebase/auth")
      .then(({ getAuth, initializeAuth, inMemoryPersistence, signInWithEmailAndPassword }) => {
        let auth: any;
        try {
          auth = getAuth(firebaseApp);
        } catch {
          auth = initializeAuth(firebaseApp, { persistence: inMemoryPersistence });
        }
        return signInWithEmailAndPassword(auth, serverEmail!, serverPassword!);
      })
      .then((credential) => {
        // Record the UID we actually authenticated as. This is the value that
        // has to appear in firestore.rules, and reading it back from the
        // running server removes any doubt about which account is in use.
        serverUid = credential.user.uid;
        console.log(`[db] signed in to Firestore as ${serverUid}`);
      })
      .catch((err) => {
        // Clear it so the next request retries rather than failing forever.
        signInPromise = null;
        console.error("[db] server sign-in failed:", err?.message || err);
        throw err;
      });
  }
  return signInPromise;
}

export const usersRef = collection(db, "users");
export const classesRef = collection(db, "classes");
export const enrollmentsRef = collection(db, "enrollments");
export const attendanceRef = collection(db, "attendance");
export const gradesRef = collection(db, "grades");
export const notificationsRef = collection(db, "notifications");
export const subjectsRef = collection(db, "subjects");
export const validUidsRef = collection(db, "valid_uids");
export const schedulesRef = collection(db, "schedules");
export const registrationsRef = collection(db, "registrations");
export const invoicesRef = collection(db, "invoices");
export const paymentsRef = collection(db, "payments");
export const behaviorRef = collection(db, "behavior_notes");
export const homeworkRef = collection(db, "homework");
export const auditRef = collection(db, "audit_logs");

/** Firestore caps `in` / `array-contains-any` filters at 30 values. */
const IN_QUERY_LIMIT = 30;

export function chunk<T>(items: T[], size = IN_QUERY_LIMIT): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type WithId<T = DocumentData> = T & { id: string };

export function mapSnapshot<T = DocumentData>(
  snapshot: { docs: { id: string; data: () => DocumentData }[] }
): WithId<T>[] {
  return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
}

/**
 * Fetch many documents by id in a handful of round trips instead of one
 * `getDoc` per id. This is the single biggest source of latency removed from
 * the old code, which looped `getDoc` inside `for` loops.
 */
export async function getDocsByIds<T = DocumentData>(
  ref: CollectionReference,
  ids: string[]
): Promise<Map<string, WithId<T>>> {
  const result = new Map<string, WithId<T>>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return result;

  const batches = chunk(unique).map((group) =>
    getDocs(query(ref, where(documentId(), "in", group)))
  );
  const snapshots = await Promise.all(batches);
  for (const snap of snapshots) {
    for (const d of snap.docs) {
      result.set(d.id, { id: d.id, ...(d.data() as T) });
    }
  }
  return result;
}

/** Run a query and return plain `{ id, ...data }` objects. */
export async function fetchAll<T = DocumentData>(q: Query | CollectionReference): Promise<WithId<T>[]> {
  const snap = await getDocs(q as Query);
  return mapSnapshot<T>(snap);
}

/**
 * Run a query that needs a composite index, falling back to an unindexed read
 * if that index has not been deployed yet.
 *
 * Firestore answers a query whose index is missing with `failed-precondition`
 * rather than a slow result, so shipping the code before running
 * `firebase deploy --only firestore:indexes` would otherwise break the page.
 * The fallback is the old behaviour — correct, just expensive — and it logs
 * loudly so the missing index does not go unnoticed.
 */
export async function fetchIndexed<T = DocumentData>(
  indexed: Query,
  fallback: () => Promise<WithId<T>[]>,
  label: string
): Promise<WithId<T>[]> {
  try {
    return await fetchAll<T>(indexed);
  } catch (err: any) {
    if (err?.code !== "failed-precondition") throw err;
    console.warn(
      `[db] no Firestore index for "${label}" — falling back to a full collection read.\n` +
        `     Run: firebase deploy --only firestore:indexes`
    );
    return fallback();
  }
}

/**
 * Describes how to answer a paginated query when its composite index is
 * missing: the same filters without the `orderBy`, plus the field to sort on
 * once the documents are in memory.
 */
export interface PageFallback {
  /** The query with the same `where` clauses but no `orderBy`. */
  base: Query | CollectionReference;
  /** The field the indexed query sorts on. */
  sortField: string;
  direction?: "asc" | "desc";
  /** Human-readable name of the query, for the warning in the log. */
  label: string;
}

/** Marks a cursor produced by the fallback path, where it is an offset. */
const OFFSET_PREFIX = "o:";

/** Timestamps, ISO strings and numbers all have to compare sensibly. */
function sortValue(value: any): number | string {
  if (value === null || value === undefined) return "";
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds;
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

/**
 * Cursor-based pagination.
 *
 * Returns up to `pageSize` documents from `q`. When the caller passes
 * `cursorId` (the `id` of the last document from the previous page), results
 * start *after* that document. The returned `nextCursor` is `null` when there
 * are no more pages.
 *
 * A query that both filters and orders needs a composite index, and Firestore
 * answers one whose index is missing with `failed-precondition` — an outright
 * error, not a slow result. Shipping such a query before running
 * `firebase deploy --only firestore:indexes` therefore turned a whole screen
 * into "server error": that is exactly how the registrations queue came to look
 * broken while the data sat there intact. When the caller supplies a
 * `fallback`, that failure degrades into the old unindexed behaviour — correct,
 * merely more expensive — and logs loudly so the missing index is still fixed.
 */
export async function fetchPage<T = DocumentData>(
  q: Query | CollectionReference,
  pageSize: number,
  cursorId?: string | null,
  /** The collection ref is needed to look up the cursor document by id. */
  collectionRef?: CollectionReference,
  fallback?: PageFallback
): Promise<{ data: WithId<T>[]; nextCursor: string | null }> {
  // A cursor from the fallback path is an offset, meaningless to Firestore.
  const paging = !cursorId?.startsWith(OFFSET_PREFIX);

  if (paging) {
    try {
      let paged = query(q as Query, fsLimit(pageSize + 1));

      if (cursorId && collectionRef) {
        const cursorSnap = await getDoc(fsDoc(collectionRef, cursorId));
        if (cursorSnap.exists()) {
          paged = query(q as Query, startAfter(cursorSnap), fsLimit(pageSize + 1));
        }
      }

      const snap = await getDocs(paged);
      const docs = mapSnapshot<T>(snap);

      const hasMore = docs.length > pageSize;
      if (hasMore) docs.pop();

      return {
        data: docs,
        nextCursor: hasMore ? docs[docs.length - 1]?.id ?? null : null,
      };
    } catch (err: any) {
      if (err?.code !== "failed-precondition" || !fallback) throw err;
      console.warn(
        `[db] no Firestore index for "${fallback.label}" — falling back to a full\n` +
          `     collection read and sorting in memory.\n` +
          `     Run: firebase deploy --only firestore:indexes`
      );
    }
  }

  if (!fallback) {
    throw new Error("fetchPage: an offset cursor was given but no fallback to resolve it");
  }

  const rows = await fetchAll<T>(fallback.base);
  const dir = fallback.direction === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const left = sortValue((a as any)[fallback.sortField]);
    const right = sortValue((b as any)[fallback.sortField]);
    if (left === right) return 0;
    return left > right ? dir : -dir;
  });

  let start = 0;
  if (cursorId?.startsWith(OFFSET_PREFIX)) {
    start = Number(cursorId.slice(OFFSET_PREFIX.length)) || 0;
  } else if (cursorId) {
    // The previous page came from the indexed path before it started failing.
    const index = rows.findIndex((r) => r.id === cursorId);
    start = index >= 0 ? index + 1 : 0;
  }

  const next = start + pageSize;
  return {
    data: rows.slice(start, next),
    nextCursor: next < rows.length ? OFFSET_PREFIX + next : null,
  };
}
