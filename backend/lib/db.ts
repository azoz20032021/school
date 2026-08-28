import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  documentId,
  getDocs,
  query,
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

const serverEmail = process.env.FIREBASE_SERVER_EMAIL;
const serverPassword = process.env.FIREBASE_SERVER_PASSWORD;

let signInPromise: Promise<void> | null = null;

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
      .then(({ getAuth, signInWithEmailAndPassword }) =>
        signInWithEmailAndPassword(getAuth(firebaseApp), serverEmail!, serverPassword!)
      )
      .then(() => {
        console.log("[db] signed in to Firestore as the server service account");
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
