// index.functions.ts
import { onRequest } from "firebase-functions/v2/https";

// backend/lib/env.ts
import { config } from "dotenv";
config({ path: ".env.local" });
config();

// backend/app.ts
import express from "express";
import { addDoc as addDoc9, getDocs as getDocs10, limit as fsLimit4, query as query13, serverTimestamp as serverTimestamp11, where as where13 } from "firebase/firestore";

// backend/lib/db.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  documentId,
  getDocs,
  query,
  where
} from "firebase/firestore";
var firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBmgX4oKMpAQYbkuOha2zv1idpd5qQocak",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "mangment-school.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "mangment-school",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "mangment-school.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "824062335814",
  appId: process.env.FIREBASE_APP_ID || "1:824062335814:web:10e971ee4d76d8ed4aa347"
};
var firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
var db = getFirestore(firebaseApp);
var cleanEnv = (val) => val ? val.trim().replace(/^["']|["']$/g, "") : "";
var serverEmail = cleanEnv(process.env.FIREBASE_SERVER_EMAIL);
var serverPassword = cleanEnv(process.env.FIREBASE_SERVER_PASSWORD);
var signInPromise = null;
var serverUid = null;
function getServerUid() {
  return serverUid;
}
var dbAuthConfigured = Boolean(serverEmail && serverPassword);
if (!dbAuthConfigured) {
  console.warn(
    "[db] FIREBASE_SERVER_EMAIL / FIREBASE_SERVER_PASSWORD are not set.\n     Firestore rules must stay open for this to work, which means anyone\n     with the public web config can read the database directly.\n     See firestore.rules for the lockdown steps."
  );
}
function ensureDbAuth() {
  if (!dbAuthConfigured) return Promise.resolve();
  if (!signInPromise) {
    signInPromise = import("firebase/auth").then(({ getAuth, initializeAuth, inMemoryPersistence, signInWithEmailAndPassword }) => {
      let auth;
      try {
        auth = getAuth(firebaseApp);
      } catch {
        auth = initializeAuth(firebaseApp, { persistence: inMemoryPersistence });
      }
      return signInWithEmailAndPassword(auth, serverEmail, serverPassword);
    }).then((credential) => {
      serverUid = credential.user.uid;
      console.log(`[db] signed in to Firestore as ${serverUid}`);
    }).catch((err) => {
      signInPromise = null;
      console.error("[db] server sign-in failed:", err?.message || err);
      throw err;
    });
  }
  return signInPromise;
}
var usersRef = collection(db, "users");
var classesRef = collection(db, "classes");
var enrollmentsRef = collection(db, "enrollments");
var attendanceRef = collection(db, "attendance");
var gradesRef = collection(db, "grades");
var notificationsRef = collection(db, "notifications");
var subjectsRef = collection(db, "subjects");
var validUidsRef = collection(db, "valid_uids");
var schedulesRef = collection(db, "schedules");
var registrationsRef = collection(db, "registrations");
var invoicesRef = collection(db, "invoices");
var paymentsRef = collection(db, "payments");
var behaviorRef = collection(db, "behavior_notes");
var auditRef = collection(db, "audit_logs");
var IN_QUERY_LIMIT = 30;
function chunk(items, size = IN_QUERY_LIMIT) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
function mapSnapshot(snapshot) {
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function getDocsByIds(ref, ids) {
  const result = /* @__PURE__ */ new Map();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return result;
  const batches = chunk(unique).map(
    (group) => getDocs(query(ref, where(documentId(), "in", group)))
  );
  const snapshots = await Promise.all(batches);
  for (const snap of snapshots) {
    for (const d of snap.docs) {
      result.set(d.id, { id: d.id, ...d.data() });
    }
  }
  return result;
}
async function fetchAll(q) {
  const snap = await getDocs(q);
  return mapSnapshot(snap);
}
async function fetchIndexed(indexed, fallback, label) {
  try {
    return await fetchAll(indexed);
  } catch (err) {
    if (err?.code !== "failed-precondition") throw err;
    console.warn(
      `[db] no Firestore index for "${label}" \u2014 falling back to a full collection read.
     Run: firebase deploy --only firestore:indexes`
    );
    return fallback();
  }
}

// backend/lib/auth.ts
import crypto from "node:crypto";

// backend/lib/i18n.ts
function langOf(req) {
  const header = String(req.headers["x-lang"] || "").toLowerCase();
  if (header === "en") return "en";
  if (header === "ar") return "ar";
  const accept = String(req.headers["accept-language"] || "").toLowerCase();
  if (accept.startsWith("en")) return "en";
  return "ar";
}
var TEMPLATES = {
  "field.required": {
    ar: '\u0627\u0644\u062D\u0642\u0644 "{field}" \u0645\u0637\u0644\u0648\u0628',
    en: 'The "{field}" field is required'
  },
  "field.mustBeText": {
    ar: '\u0627\u0644\u062D\u0642\u0644 "{field}" \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0646\u0635\u0627\u064B',
    en: 'The "{field}" field must be text'
  },
  "field.tooShort": {
    ar: '\u0627\u0644\u062D\u0642\u0644 "{field}" \u0642\u0635\u064A\u0631 \u062C\u062F\u0627\u064B',
    en: 'The "{field}" field is too short'
  },
  "field.tooLong": {
    ar: '\u0627\u0644\u062D\u0642\u0644 "{field}" \u0637\u0648\u064A\u0644 \u062C\u062F\u0627\u064B (\u0627\u0644\u062D\u062F {max} \u062D\u0631\u0641)',
    en: 'The "{field}" field is too long (maximum {max} characters)'
  },
  "field.mustBeNumber": {
    ar: '\u0627\u0644\u062D\u0642\u0644 "{field}" \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0631\u0642\u0645\u0627\u064B',
    en: 'The "{field}" field must be a number'
  },
  "field.min": {
    ar: '\u0627\u0644\u062D\u0642\u0644 "{field}" \u064A\u062C\u0628 \u0623\u0644\u0627 \u064A\u0642\u0644 \u0639\u0646 {min}',
    en: 'The "{field}" field must be at least {min}'
  },
  "field.max": {
    ar: '\u0627\u0644\u062D\u0642\u0644 "{field}" \u064A\u062C\u0628 \u0623\u0644\u0627 \u064A\u0632\u064A\u062F \u0639\u0646 {max}',
    en: 'The "{field}" field must not exceed {max}'
  },
  "field.invalidChoice": {
    ar: '\u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u062F\u062E\u0644\u0629 \u0641\u064A "{field}" \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629',
    en: 'The value selected for "{field}" is not valid'
  },
  "field.invalidDate": {
    ar: '\u0627\u0644\u062D\u0642\u0644 "{field}" \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u062A\u0627\u0631\u064A\u062E\u0627\u064B \u0635\u0627\u0644\u062D\u0627\u064B (YYYY-MM-DD)',
    en: 'The "{field}" field must be a valid date (YYYY-MM-DD)'
  },
  "field.invalidPhone": {
    ar: '\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u0641\u064A "{field}" \u063A\u064A\u0631 \u0635\u0627\u0644\u062D',
    en: 'The phone number in "{field}" is not valid'
  },
  "field.invalidEmail": {
    ar: "\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D",
    en: "The email address is not valid"
  },
  "field.mustBeList": {
    ar: '\u0627\u0644\u062D\u0642\u0644 "{field}" \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0642\u0627\u0626\u0645\u0629',
    en: 'The "{field}" field must be a list'
  },
  "field.tooManyItems": {
    ar: '\u0639\u062F\u062F \u0627\u0644\u0639\u0646\u0627\u0635\u0631 \u0641\u064A "{field}" \u0643\u0628\u064A\u0631 \u062C\u062F\u0627\u064B',
    en: 'The "{field}" field has too many items'
  },
  "password.tooShort": {
    ar: "\u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 {min} \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644",
    en: "The password must be at least {min} characters"
  },
  "password.needsLettersAndDigits": {
    ar: "\u064A\u062C\u0628 \u0623\u0646 \u062A\u062D\u062A\u0648\u064A \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0639\u0644\u0649 \u062D\u0631\u0648\u0641 \u0648\u0623\u0631\u0642\u0627\u0645 \u0645\u0639\u0627\u064B",
    en: "The password must contain both letters and numbers"
  },
  "rate.tooManyAttempts": {
    ar: "\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0643\u062B\u064A\u0631\u0629 \u062C\u062F\u0627\u064B. \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0628\u0639\u062F {seconds} \u062B\u0627\u0646\u064A\u0629",
    en: "Too many attempts. Please try again in {seconds} seconds"
  }
};
var EN = {
  // --- auth ---
  "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629 (\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0640 UID \u0648\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631)": "Incorrect sign-in details (check your UID and password)",
  "\u0627\u0644\u062C\u0644\u0633\u0629 \u0645\u0646\u062A\u0647\u064A\u0629\u060C \u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649": "Your session has expired. Please sign in again",
  "\u0644\u064A\u0633 \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0644\u0644\u0642\u064A\u0627\u0645 \u0628\u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621": "You do not have permission to perform this action",
  "\u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0647\u0630\u0627 \u0627\u0644\u062D\u0633\u0627\u0628. \u064A\u0631\u062C\u0649 \u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629.": "This account has been suspended. Please contact the administration.",
  "\u062D\u0633\u0627\u0628\u0643 \u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0645\u0646 \u0642\u0628\u0644 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0648\u0644\u0645 \u062A\u062A\u0645 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u064A\u0647 \u0628\u0639\u062F.": "Your account is still under review and has not been approved yet.",
  "\u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0647\u0630\u0627 \u0627\u0644\u062D\u0633\u0627\u0628": "This account has been suspended",
  "\u0627\u0644\u062D\u0633\u0627\u0628 \u0644\u0645 \u064A\u0639\u062F \u0645\u0648\u062C\u0648\u062F\u0627\u064B": "This account no longer exists",
  "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629": "The current password is incorrect",
  "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u062E\u062A\u0644\u0641 \u0639\u0646 \u0627\u0644\u062D\u0627\u0644\u064A\u0629": "The new password must differ from the current one",
  "\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0639\u0631\u0636 \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0645\u0633\u062A\u062E\u062F\u0645 \u0622\u062E\u0631": "You cannot view another user's notifications",
  "\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u062A\u0639\u062F\u064A\u0644 \u0625\u0634\u0639\u0627\u0631 \u0645\u0633\u062A\u062E\u062F\u0645 \u0622\u062E\u0631": "You cannot modify another user's notification",
  "\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u0627\u0637\u0644\u0627\u0639 \u0639\u0644\u0649 \u0628\u064A\u0627\u0646\u0627\u062A \u0637\u0627\u0644\u0628 \u0622\u062E\u0631": "You cannot view another student's data",
  "\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0639\u0631\u0636 \u0635\u0641\u0648\u0641 \u0645\u0639\u0644\u0645 \u0622\u062E\u0631": "You cannot view another teacher's classes",
  "\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0639\u0631\u0636 \u0635\u0641\u0648\u0641 \u0637\u0627\u0644\u0628 \u0622\u062E\u0631": "You cannot view another student's classes",
  // --- generic ---
  "\u0627\u0644\u0639\u0646\u0635\u0631 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F": "The requested item was not found",
  "\u0627\u0644\u0645\u0633\u0627\u0631 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F": "The requested endpoint was not found",
  "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0644\u0627\u062D\u0642\u0627\u064B": "A server error occurred. Please try again later",
  "\u0637\u0644\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D": "Invalid request",
  "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u0644\u0644\u062A\u062D\u062F\u064A\u062B": "There is nothing to update",
  "\u062A\u0639\u0630\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0628\u0639\u062F \u0642\u0644\u064A\u0644": "Could not reach the database. Please try again shortly",
  "\u0627\u0644\u062E\u0627\u062F\u0645 \u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0644\u0647 \u0628\u0627\u0644\u0648\u0635\u0648\u0644 \u0644\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A. \u062A\u0623\u0643\u062F \u0645\u0646 \u0636\u0628\u0637 FIREBASE_SERVER_EMAIL \u0648 FIREBASE_SERVER_PASSWORD\u060C \u0648\u0623\u0646 \u0627\u0644\u0640 UID \u0641\u064A firestore.rules \u064A\u0637\u0627\u0628\u0642 \u062D\u0633\u0627\u0628 \u0627\u0644\u062E\u062F\u0645\u0629.": "The server is not authorised to access the database. Check FIREBASE_SERVER_EMAIL and FIREBASE_SERVER_PASSWORD, and that the UID in firestore.rules matches the service account.",
  // --- setup ---
  "\u062A\u0645 \u062A\u0647\u064A\u0626\u0629 \u0627\u0644\u0646\u0638\u0627\u0645 \u0645\u0633\u0628\u0642\u0627\u064B. \u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u0646\u0634\u0627\u0621 \u0645\u062F\u064A\u0631 \u062C\u062F\u064A\u062F \u0645\u0646 \u0647\u0646\u0627.": "The system has already been set up. A new administrator cannot be created here.",
  "\u0631\u0645\u0632 \u0627\u0644\u062A\u0647\u064A\u0626\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D": "The setup token is incorrect",
  "\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062A\u0639\u0631\u064A\u0641\u064A \u0644\u0644\u0645\u062F\u064A\u0631 \u0645\u0637\u0644\u0648\u0628": "An administrator UID is required",
  "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 8 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644": "The password must be at least 8 characters",
  // --- registration ---
  "\u064A\u0648\u062C\u062F \u062D\u0633\u0627\u0628 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0628\u0646\u0641\u0633 \u0631\u0642\u0645 \u0627\u0644\u0647\u0648\u064A\u0629. \u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0623\u0648 \u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629.": "An account with this national ID already exists. Please sign in or contact the administration.",
  "\u0627\u0644\u0635\u0641 \u0627\u0644\u0645\u062E\u062A\u0627\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F": "The selected class does not exist",
  "\u0644\u0627 \u064A\u0648\u062C\u062F \u0637\u0644\u0628 \u0628\u0647\u0630\u0627 \u0627\u0644\u0631\u0642\u0645. \u062A\u0623\u0643\u062F \u0645\u0646 \u0631\u0642\u0645 \u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629.": "No application found with that code. Please check your tracking number.",
  "\u0637\u0644\u0628 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F": "The application was not found",
  "\u064A\u062C\u0628 \u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0635\u0641 \u0627\u0644\u062F\u0631\u0627\u0633\u064A \u0642\u0628\u0644 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629": "A class must be selected before approving",
  "\u062A\u0639\u0630\u0631 \u062A\u0648\u0644\u064A\u062F \u0631\u0642\u0645 \u062A\u0639\u0631\u064A\u0641\u064A \u0641\u0631\u064A\u062F\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649": "Could not generate a unique UID. Please try again.",
  // --- users ---
  "\u0647\u0630\u0627 \u0627\u0644\u0640 UID \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0641\u0639\u0644\u060C \u064A\u0631\u062C\u0649 \u0627\u062E\u062A\u064A\u0627\u0631 \u0648\u0627\u062D\u062F \u0622\u062E\u0631": "This UID is already taken. Please choose another.",
  "\u0647\u0630\u0627 \u0627\u0644\u0640 UID \u0645\u0648\u062C\u0648\u062F \u0628\u0627\u0644\u0641\u0639\u0644": "This UID already exists",
  "\u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F": "The student was not found",
  "\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F": "The user was not found",
  "\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u062D\u0630\u0641 \u062D\u0633\u0627\u0628\u0643 \u0627\u0644\u062E\u0627\u0635": "You cannot delete your own account",
  // --- classes & schedule ---
  "\u0627\u0644\u0635\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F": "The class was not found",
  "\u064A\u062C\u0628 \u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0639\u0644\u0645 \u0648\u0627\u062D\u062F \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644": "At least one teacher must be selected",
  "\u0627\u0644\u062D\u0635\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629": "The lesson was not found",
  "\u064A\u0648\u062C\u062F \u062F\u0631\u0633 \u0645\u0633\u062C\u0644 \u0628\u0627\u0644\u0641\u0639\u0644 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u064A\u0648\u0645 \u0648\u0627\u0644\u0648\u0642\u062A \u0644\u0647\u0630\u0627 \u0627\u0644\u0635\u0641": "A lesson is already scheduled for this class at that day and time",
  // --- subjects ---
  "\u0627\u0644\u0645\u0627\u062F\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629": "The subject was not found",
  "\u0647\u0630\u0647 \u0627\u0644\u0645\u0627\u062F\u0629 \u0645\u0636\u0627\u0641\u0629 \u0628\u0627\u0644\u0641\u0639\u0644": "This subject has already been added",
  // --- attendance ---
  "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u062D\u0636\u0648\u0631 \u0644\u0644\u062A\u0633\u062C\u064A\u0644": "There is no attendance data to record",
  "\u0639\u062F\u062F \u0627\u0644\u0637\u0644\u0627\u0628 \u0643\u0628\u064A\u0631 \u062C\u062F\u0627\u064B \u0641\u064A \u0637\u0644\u0628 \u0648\u0627\u062D\u062F": "Too many students in a single request",
  "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062D\u0636\u0648\u0631 \u0644\u062A\u0627\u0631\u064A\u062E \u0645\u0633\u062A\u0642\u0628\u0644\u064A": "Attendance cannot be recorded for a future date",
  // --- grades ---
  "\u0627\u0644\u062F\u0631\u062C\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629": "The grade was not found",
  "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0644\u0643 \u0628\u0631\u0635\u062F \u0627\u0644\u062F\u0631\u062C\u0627\u062A": "You are not permitted to record grades",
  "\u0631\u0635\u062F \u0627\u0644\u062F\u0631\u062C\u0627\u062A \u0645\u0642\u062A\u0635\u0631 \u0639\u0644\u0649 \u0627\u0644\u0645\u062F\u064A\u0631 \u0648\u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646": "Recording grades is limited to the admin and teachers",
  // --- behaviour ---
  "\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629": "The note was not found",
  // --- finance ---
  "\u0633\u0646\u062F \u0627\u0644\u0631\u0633\u0648\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F": "The fee record was not found",
  "\u0633\u0646\u062F \u0627\u0644\u0642\u0628\u0636 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F": "The payment receipt was not found",
  "\u0644\u0627 \u064A\u0648\u062C\u062F \u0637\u0644\u0627\u0628 \u0645\u0637\u0627\u0628\u0642\u0648\u0646 \u0644\u0625\u0635\u062F\u0627\u0631 \u0627\u0644\u0631\u0633\u0648\u0645 \u0644\u0647\u0645": "No matching students to issue fees for",
  "\u0627\u0644\u062E\u0635\u0645 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u064A\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0623\u0635\u0644\u064A": "The discount cannot exceed the original amount",
  "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u0644\u063A\u0627\u0621 \u0633\u0646\u062F \u062A\u0645 \u062A\u0633\u062F\u064A\u062F \u062C\u0632\u0621 \u0645\u0646\u0647. \u0642\u0645 \u0628\u0625\u0631\u062C\u0627\u0639 \u0627\u0644\u062F\u0641\u0639\u0627\u062A \u0623\u0648\u0644\u0627\u064B.": "A partially paid record cannot be cancelled. Reverse the payments first.",
  "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0633\u062F\u064A\u062F \u0639\u0644\u0649 \u0633\u0646\u062F \u0645\u0644\u063A\u0649": "Payments cannot be recorded against a cancelled record",
  // --- field labels used by the validators ---
  "\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062A\u0639\u0631\u064A\u0641\u064A": "UID",
  "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631": "Password",
  "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062D\u0627\u0644\u064A\u0629": "Current password",
  "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629": "New password",
  "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0631\u0628\u0627\u0639\u064A": "Full name",
  "\u0627\u0633\u0645 \u0627\u0644\u0623\u0645": "Mother's name",
  "\u0631\u0642\u0645 \u0627\u0644\u0647\u0648\u064A\u0629 / \u0627\u0644\u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0648\u0637\u0646\u064A\u0629": "National ID",
  "\u0631\u0642\u0645 \u0627\u0644\u0647\u0648\u064A\u0629": "National ID",
  "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0645\u064A\u0644\u0627\u062F": "Date of birth",
  "\u0645\u062D\u0644 \u0627\u0644\u0648\u0644\u0627\u062F\u0629": "Place of birth",
  "\u0631\u0642\u0645 \u0647\u0627\u062A\u0641 \u0627\u0644\u0637\u0627\u0644\u0628": "Student phone number",
  "\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A": "Email address",
  "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0633\u0643\u0646": "Home address",
  \u0627\u0644\u0639\u0646\u0648\u0627\u0646: "Address",
  "\u0627\u0633\u0645 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631": "Guardian name",
  "\u0647\u0627\u062A\u0641 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631": "Guardian phone",
  "\u0635\u0644\u0629 \u0627\u0644\u0642\u0631\u0627\u0628\u0629": "Relationship",
  "\u0645\u0647\u0646\u0629 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631": "Guardian occupation",
  "\u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0633\u0627\u0628\u0642\u0629": "Previous school",
  "\u0622\u062E\u0631 \u0635\u0641 \u062F\u0631\u0627\u0633\u064A": "Last grade completed",
  "\u0627\u0644\u0645\u0639\u062F\u0644 \u0627\u0644\u0633\u0627\u0628\u0642": "Previous average",
  "\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0635\u062D\u064A\u0629": "Health notes",
  "\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0625\u0636\u0627\u0641\u064A\u0629": "Additional notes",
  "\u0627\u0644\u0635\u0641 \u0627\u0644\u0645\u0637\u0644\u0648\u0628": "Requested class",
  "\u0631\u0642\u0645 \u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629": "Tracking code",
  "\u0633\u0628\u0628 \u0627\u0644\u0631\u0641\u0636": "Rejection reason",
  "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0642\u0633\u0637": "Instalment title",
  "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642": "Due date",
  \u0627\u0644\u0627\u0633\u0645: "Name",
  "\u0627\u0633\u0645 \u0627\u0644\u0637\u0627\u0644\u0628": "Student name",
  "\u0627\u0633\u0645 \u0627\u0644\u0645\u0639\u0644\u0645": "Teacher name",
  "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645": "Username",
  "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641": "Phone number",
  \u0627\u0644\u0637\u0627\u0644\u0628: "Student",
  \u0627\u0644\u0635\u0641: "Class",
  "\u0627\u0633\u0645 \u0627\u0644\u0635\u0641": "Class name",
  \u0627\u0644\u0633\u0639\u0629: "Capacity",
  \u0627\u0644\u0645\u0648\u0627\u062F: "Subjects",
  \u0627\u0644\u0645\u0627\u062F\u0629: "Subject",
  "\u062D\u0627\u0644\u0629 \u0627\u0644\u062D\u0633\u0627\u0628": "Account status",
  \u0627\u0644\u062A\u0627\u0631\u064A\u062E: "Date",
  \u0627\u0644\u0648\u0642\u062A: "Time",
  \u0627\u0644\u064A\u0648\u0645: "Day",
  \u0627\u0644\u0645\u0639\u0644\u0645: "Teacher",
  \u0627\u0644\u0642\u0627\u0639\u0629: "Room",
  "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0637\u0627\u0644\u0628": "Student ID",
  "\u062D\u0627\u0644\u0629 \u0627\u0644\u062D\u0636\u0648\u0631": "Attendance status",
  \u0645\u0644\u0627\u062D\u0638\u0629: "Note",
  \u0627\u0644\u062F\u0631\u062C\u0629: "Score",
  "\u0627\u0644\u062F\u0631\u062C\u0629 \u0627\u0644\u0643\u0644\u064A\u0629": "Total marks",
  \u0627\u0644\u062D\u0627\u0644\u0629: "Status",
  "\u0646\u0648\u0639 \u0627\u0644\u062A\u0642\u064A\u064A\u0645": "Assessment type",
  "\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062F\u0631\u0627\u0633\u064A": "Term",
  "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0631\u0633\u0648\u0645": "Fee title",
  "\u0646\u0648\u0639 \u0627\u0644\u0631\u0633\u0648\u0645": "Fee type",
  \u0627\u0644\u0645\u0628\u0644\u063A: "Amount",
  \u0627\u0644\u062E\u0635\u0645: "Discount",
  "\u0627\u0644\u0633\u0646\u0629 \u0627\u0644\u062F\u0631\u0627\u0633\u064A\u0629": "Academic year",
  "\u0627\u0644\u0641\u0626\u0629 \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641\u0629": "Target group",
  "\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u062F\u0641\u0648\u0639": "Amount paid",
  "\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u062F\u0641\u0639": "Payment method",
  "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u062F\u0641\u0639": "Payment date",
  "\u0646\u0648\u0639 \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0629": "Note type",
  \u0627\u0644\u062A\u0635\u0646\u064A\u0641: "Category",
  "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0629": "Note title",
  \u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644: "Details",
  \u0627\u0644\u0646\u0642\u0627\u0637: "Points",
  "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0625\u0634\u0639\u0627\u0631": "Notification title",
  "\u0646\u0635 \u0627\u0644\u0625\u0634\u0639\u0627\u0631": "Notification body",
  \u0627\u0644\u062D\u062F: "Limit",
  \u0627\u0644\u0639\u062F\u062F: "Count",
  "\u0645\u0646 \u062A\u0627\u0631\u064A\u062E": "From date",
  "\u0625\u0644\u0649 \u062A\u0627\u0631\u064A\u062E": "To date"
};
function tt(key, lang, params = {}) {
  let out = TEMPLATES[key][lang];
  for (const [name, value] of Object.entries(params)) {
    const rendered = name === "field" ? tr(String(value), lang) : String(value);
    out = out.split(`{${name}}`).join(rendered);
  }
  return out;
}
function tr(text, lang) {
  if (lang === "ar") return text;
  return EN[text] ?? EN[text.trim()] ?? text;
}

// backend/lib/auth.ts
var FALLBACK_SECRET = "dev-only-insecure-secret-change-me";
function resolveSecret() {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    console.error(
      `
[SECURITY] SESSION_SECRET is missing or shorter than 32 characters.
            Every login token can be forged until you set it.
            Generate one with:  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
`
    );
  } else {
    console.warn("[auth] SESSION_SECRET not set \u2014 using the insecure development fallback.");
  }
  return fromEnv || FALLBACK_SECRET;
}
var SECRET = resolveSecret();
var TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
var SCRYPT_KEYLEN = 64;
var SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString(
    "base64"
  )}$${derived.toString("base64")}`;
}
function isHashed(stored) {
  return typeof stored === "string" && stored.startsWith("scrypt$");
}
function verifyPassword(plain, stored) {
  if (!stored) return false;
  if (!isHashed(stored)) {
    const a = Buffer.from(String(stored));
    const b = Buffer.from(plain);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const [, n, r, p, saltB64, hashB64] = stored.split("$");
  try {
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const derived = crypto.scryptSync(plain, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p)
    });
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(input) {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function signPayload(body) {
  return b64url(crypto.createHmac("sha256", SECRET).update(body).digest());
}
function createToken(user) {
  const payload = {
    sub: user.id,
    uid: user.uid,
    name: user.name,
    role: user.role,
    exp: Math.floor(Date.now() / 1e3) + TOKEN_TTL_SECONDS
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${signPayload(body)}`;
}
function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = signPayload(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1e3)) return null;
    return { id: payload.sub, uid: payload.uid, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}
function readToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return void 0;
}
function attachUser(req, _res, next) {
  req.user = verifyToken(readToken(req)) || void 0;
  next();
}
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "\u0627\u0644\u062C\u0644\u0633\u0629 \u0645\u0646\u062A\u0647\u064A\u0629\u060C \u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649" });
  }
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "\u0627\u0644\u062C\u0644\u0633\u0629 \u0645\u0646\u062A\u0647\u064A\u0629\u060C \u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "\u0644\u064A\u0633 \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0644\u0644\u0642\u064A\u0627\u0645 \u0628\u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621" });
    }
    next();
  };
}
var requireStaff = requireRole("admin", "assistant_admin");
var requireAdmin = requireRole("admin");
function requireSelfOrStaff(paramName = "studentId") {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "\u0627\u0644\u062C\u0644\u0633\u0629 \u0645\u0646\u062A\u0647\u064A\u0629\u060C \u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649" });
    }
    const target = req.params[paramName];
    const privileged = ["admin", "assistant_admin", "teacher"].includes(req.user.role);
    if (privileged || req.user.id === target) return next();
    return res.status(403).json({ error: "\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u0627\u0637\u0644\u0627\u0639 \u0639\u0644\u0649 \u0628\u064A\u0627\u0646\u0627\u062A \u0637\u0627\u0644\u0628 \u0622\u062E\u0631" });
  };
}
var buckets = /* @__PURE__ */ new Map();
function rateLimit(options) {
  const { windowMs, max, keyPrefix } = options;
  return (req, res, next) => {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const bucket = buckets.get(key) || { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
    if (bucket.hits.length >= max) {
      const retryAfter = Math.ceil((windowMs - (now - bucket.hits[0])) / 1e3);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: tt("rate.tooManyAttempts", langOf(req), { seconds: retryAfter })
      });
    }
    bucket.hits.push(now);
    buckets.set(key, bucket);
    if (buckets.size > 5e3) {
      for (const [k, v] of buckets) {
        if (v.hits.every((t) => now - t > windowMs)) buckets.delete(k);
      }
    }
    next();
  };
}
function sanitizeUser(user) {
  const { password: password2, ...safe } = user;
  return safe;
}

// backend/lib/http.ts
function wrap(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
var HttpError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
};
var notFound = (message = "\u0627\u0644\u0639\u0646\u0635\u0631 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F") => new HttpError(404, message);
var badRequest = (message) => new HttpError(400, message);
var forbidden = (message = "\u0644\u064A\u0633 \u0644\u062F\u064A\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0644\u0644\u0642\u064A\u0627\u0645 \u0628\u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621") => new HttpError(403, message);

// backend/lib/validate.ts
var ValidationError = class extends Error {
  constructor(key, params = {}) {
    super(tt(key, "ar", params));
    this.status = 400;
    this.name = "ValidationError";
    this.key = key;
    this.params = params;
  }
  render(lang) {
    return tt(this.key, lang, this.params);
  }
};
function str(value, field, opts = {}) {
  const { min = 1, max = 500, optional = false } = opts;
  if (value === void 0 || value === null || value === "") {
    if (optional) return "";
    throw new ValidationError("field.required", { field });
  }
  if (typeof value !== "string") throw new ValidationError("field.mustBeText", { field });
  const trimmed = value.trim();
  if (trimmed.length < min) throw new ValidationError("field.tooShort", { field });
  if (trimmed.length > max) throw new ValidationError("field.tooLong", { field, max });
  return trimmed;
}
function num(value, field, opts = {}) {
  const { min = 0, max = Number.MAX_SAFE_INTEGER, optional = false } = opts;
  if (value === void 0 || value === null || value === "") {
    if (optional) return opts.default ?? 0;
    throw new ValidationError("field.required", { field });
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new ValidationError("field.mustBeNumber", { field });
  if (parsed < min) throw new ValidationError("field.min", { field, min });
  if (parsed > max) throw new ValidationError("field.max", { field, max });
  return parsed;
}
function oneOf(value, field, allowed, fallback) {
  if ((value === void 0 || value === null || value === "") && fallback !== void 0) return fallback;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ValidationError("field.invalidChoice", { field });
  }
  return value;
}
function isoDate(value, field, opts = {}) {
  if (!value) {
    if (opts.optional) return "";
    throw new ValidationError("field.required", { field });
  }
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw new ValidationError("field.invalidDate", { field });
  }
  return s;
}
function phone(value, field, opts = {}) {
  if (!value) {
    if (opts.optional) return "";
    throw new ValidationError("field.required", { field });
  }
  const s = String(value).replace(/[\s-]/g, "");
  if (!/^\+?\d{7,15}$/.test(s)) throw new ValidationError("field.invalidPhone", { field });
  return s;
}
function email(value, field, opts = {}) {
  if (!value) {
    if (opts.optional) return "";
    throw new ValidationError("field.required", { field });
  }
  const s = String(value).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw new ValidationError("field.invalidEmail", { field });
  return s;
}
var MIN_PASSWORD_LENGTH = 8;
function password(value, field = "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631") {
  const s = str(value, field, { min: 1, max: 200 });
  if (s.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError("password.tooShort", { min: MIN_PASSWORD_LENGTH });
  }
  if (!/[A-Za-z؀-ۿ]/.test(s) || !/\d/.test(s)) {
    throw new ValidationError("password.needsLettersAndDigits");
  }
  return s;
}
function boolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}
function stringArray(value, field, opts = {}) {
  if (value === void 0 || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError("field.mustBeList", { field });
  if (value.length > (opts.max ?? 100)) throw new ValidationError("field.tooManyItems", { field });
  return value.map((v) => String(v).trim()).filter(Boolean);
}

// backend/routes/auth.routes.ts
import { Router } from "express";
import { doc, getDocs as getDocs2, query as query2, serverTimestamp as serverTimestamp2, updateDoc, where as where2 } from "firebase/firestore";

// backend/lib/audit.ts
import { addDoc, serverTimestamp } from "firebase/firestore";
function clientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}
function audit(req, input) {
  const actor = req.user;
  void addDoc(auditRef, {
    actor_id: actor?.id || null,
    actor_name: actor?.name || "\u063A\u064A\u0631 \u0645\u0633\u062C\u0644",
    actor_role: actor?.role || "anonymous",
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId || null,
    summary: input.summary,
    meta: input.meta || {},
    ip: clientIp(req),
    createdAt: serverTimestamp()
  }).catch((err) => console.error("[audit] failed to write entry:", err?.message || err));
}

// backend/routes/auth.routes.ts
var router = Router();
var loginLimiter = rateLimit({ windowMs: 10 * 60 * 1e3, max: 15, keyPrefix: "login" });
router.post(
  "/login",
  loginLimiter,
  wrap(async (req, res) => {
    const uid = str(req.body?.uid, "\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062A\u0639\u0631\u064A\u0641\u064A", { max: 64 });
    const plain = str(req.body?.password, "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", { max: 200 });
    const snapshot = await getDocs2(query2(usersRef, where2("uid", "==", uid)));
    const generic = "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629 (\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0640 UID \u0648\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631)";
    if (snapshot.empty) {
      audit(req, { action: "login_failed", entity: "user", summary: `\u0645\u062D\u0627\u0648\u0644\u0629 \u062F\u062E\u0648\u0644 \u0628\u0640 UID \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F: ${uid}` });
      throw new HttpError(401, generic);
    }
    const userDoc = snapshot.docs[0];
    const data = userDoc.data();
    if (!verifyPassword(plain, data.password)) {
      audit(req, {
        action: "login_failed",
        entity: "user",
        entityId: userDoc.id,
        summary: `\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062E\u0627\u0637\u0626\u0629 \u0644\u0644\u062D\u0633\u0627\u0628 ${uid}`
      });
      throw new HttpError(401, generic);
    }
    if (data.status === "suspended") {
      throw new HttpError(403, "\u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0647\u0630\u0627 \u0627\u0644\u062D\u0633\u0627\u0628. \u064A\u0631\u062C\u0649 \u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629.");
    }
    if (data.status === "pending") {
      throw new HttpError(403, "\u062D\u0633\u0627\u0628\u0643 \u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0645\u0646 \u0642\u0628\u0644 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0648\u0644\u0645 \u062A\u062A\u0645 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u064A\u0647 \u0628\u0639\u062F.");
    }
    if (!isHashed(data.password)) {
      void updateDoc(doc(db, "users", userDoc.id), {
        password: hashPassword(plain),
        password_upgraded_at: serverTimestamp2()
      }).catch((err) => console.error("[auth] password upgrade failed:", err));
    }
    void updateDoc(doc(db, "users", userDoc.id), { last_login_at: serverTimestamp2() }).catch(() => {
    });
    const sessionUser = {
      id: userDoc.id,
      uid: data.uid,
      name: data.name,
      role: data.role || "student"
    };
    req.user = sessionUser;
    audit(req, { action: "login", entity: "user", entityId: userDoc.id, summary: `\u062A\u0633\u062C\u064A\u0644 \u062F\u062E\u0648\u0644 \u0646\u0627\u062C\u062D` });
    res.json({
      token: createToken(sessionUser),
      user: sanitizeUser({ id: userDoc.id, ...data })
    });
  })
);
router.get(
  "/me",
  requireAuth,
  wrap(async (req, res) => {
    const snapshot = await getDocs2(query2(usersRef, where2("uid", "==", req.user.uid)));
    if (snapshot.empty) throw new HttpError(401, "\u0627\u0644\u062D\u0633\u0627\u0628 \u0644\u0645 \u064A\u0639\u062F \u0645\u0648\u062C\u0648\u062F\u0627\u064B");
    const userDoc = snapshot.docs[0];
    const data = userDoc.data();
    if (data.status === "suspended") throw new HttpError(403, "\u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0647\u0630\u0627 \u0627\u0644\u062D\u0633\u0627\u0628");
    res.json(sanitizeUser({ id: userDoc.id, ...data }));
  })
);
router.post(
  "/change-password",
  requireAuth,
  rateLimit({ windowMs: 15 * 60 * 1e3, max: 10, keyPrefix: "pwchange" }),
  wrap(async (req, res) => {
    const current = str(req.body?.currentPassword, "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062D\u0627\u0644\u064A\u0629", { max: 200 });
    const next = password(req.body?.newPassword, "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629");
    if (current === next) throw badRequest("\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u062E\u062A\u0644\u0641 \u0639\u0646 \u0627\u0644\u062D\u0627\u0644\u064A\u0629");
    const snapshot = await getDocs2(query2(usersRef, where2("uid", "==", req.user.uid)));
    if (snapshot.empty) throw new HttpError(401, "\u0627\u0644\u062D\u0633\u0627\u0628 \u0644\u0645 \u064A\u0639\u062F \u0645\u0648\u062C\u0648\u062F\u0627\u064B");
    const userDoc = snapshot.docs[0];
    if (!verifyPassword(current, userDoc.data().password)) {
      throw badRequest("\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629");
    }
    await updateDoc(doc(db, "users", userDoc.id), {
      password: hashPassword(next),
      password_changed_at: serverTimestamp2()
    });
    audit(req, {
      action: "password_change",
      entity: "user",
      entityId: userDoc.id,
      summary: "\u063A\u064A\u0651\u0631 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062E\u0627\u0635\u0629 \u0628\u0647"
    });
    res.json({ success: true });
  })
);
var auth_routes_default = router;

// backend/routes/registrations.routes.ts
import { Router as Router2 } from "express";
import crypto2 from "node:crypto";
import {
  addDoc as addDoc2,
  doc as doc2,
  getDoc,
  getDocs as getDocs3,
  limit as fsLimit,
  query as query3,
  runTransaction,
  serverTimestamp as serverTimestamp3,
  updateDoc as updateDoc2,
  where as where3
} from "firebase/firestore";

// backend/lib/cache.ts
var store = /* @__PURE__ */ new Map();
var inflight = /* @__PURE__ */ new Map();
async function cached(key, ttlMs, loader) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = loader().then((value) => {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}
function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

// backend/routes/registrations.routes.ts
var router2 = Router2();
var RELATIONS = ["\u0627\u0644\u0623\u0628", "\u0627\u0644\u0623\u0645", "\u0627\u0644\u0623\u062E", "\u0627\u0644\u0639\u0645", "\u0627\u0644\u062E\u0627\u0644", "\u0627\u0644\u062C\u062F", "\u0648\u0644\u064A \u0623\u0645\u0631 \u0622\u062E\u0631"];
var STATUSES = ["pending", "approved", "rejected"];
var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeTrackingCode() {
  const bytes = crypto2.randomBytes(8);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
async function allocateStudentUid() {
  const yearPrefix = String((/* @__PURE__ */ new Date()).getFullYear() % 100).padStart(2, "0");
  const counterDoc = doc2(db, "counters", `student_uid_${yearPrefix}`);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterDoc);
    const next = (snap.exists() ? snap.data().value : 0) + 1;
    tx.set(counterDoc, { value: next, updatedAt: serverTimestamp3() }, { merge: true });
    return next;
  });
  let candidate = `${yearPrefix}${String(seq).padStart(4, "0")}`;
  for (let attempt = 0; attempt < 20; attempt++) {
    const clash = await getDocs3(query3(usersRef, where3("uid", "==", candidate), fsLimit(1)));
    if (clash.empty) return candidate;
    candidate = `${yearPrefix}${String(seq + attempt + 1).padStart(4, "0")}`;
  }
  throw new HttpError(500, "\u062A\u0639\u0630\u0631 \u062A\u0648\u0644\u064A\u062F \u0631\u0642\u0645 \u062A\u0639\u0631\u064A\u0641\u064A \u0641\u0631\u064A\u062F\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649");
}
router2.post(
  "/register",
  rateLimit({ windowMs: 60 * 60 * 1e3, max: 10, keyPrefix: "register" }),
  wrap(async (req, res) => {
    const b = req.body || {};
    const application = {
      full_name: str(b.full_name, "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0631\u0628\u0627\u0639\u064A", { min: 5, max: 120 }),
      mother_name: str(b.mother_name, "\u0627\u0633\u0645 \u0627\u0644\u0623\u0645", { min: 2, max: 120, optional: true }),
      national_id: str(b.national_id, "\u0631\u0642\u0645 \u0627\u0644\u0647\u0648\u064A\u0629 / \u0627\u0644\u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0648\u0637\u0646\u064A\u0629", { min: 4, max: 40 }),
      birth_date: isoDate(b.birth_date, "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0645\u064A\u0644\u0627\u062F"),
      birth_place: str(b.birth_place, "\u0645\u062D\u0644 \u0627\u0644\u0648\u0644\u0627\u062F\u0629", { max: 120, optional: true }),
      phone: phone(b.phone, "\u0631\u0642\u0645 \u0647\u0627\u062A\u0641 \u0627\u0644\u0637\u0627\u0644\u0628"),
      email: email(b.email, "\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A", { optional: true }),
      address: str(b.address, "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0633\u0643\u0646", { min: 3, max: 250 }),
      guardian_name: str(b.guardian_name, "\u0627\u0633\u0645 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631", { min: 3, max: 120 }),
      guardian_phone: phone(b.guardian_phone, "\u0647\u0627\u062A\u0641 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631"),
      guardian_relation: oneOf(b.guardian_relation, "\u0635\u0644\u0629 \u0627\u0644\u0642\u0631\u0627\u0628\u0629", RELATIONS, "\u0627\u0644\u0623\u0628"),
      guardian_job: str(b.guardian_job, "\u0645\u0647\u0646\u0629 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631", { max: 120, optional: true }),
      previous_school: str(b.previous_school, "\u0627\u0644\u0645\u062F\u0631\u0633\u0629 \u0627\u0644\u0633\u0627\u0628\u0642\u0629", { max: 160, optional: true }),
      last_grade: str(b.last_grade, "\u0622\u062E\u0631 \u0635\u0641 \u062F\u0631\u0627\u0633\u064A", { max: 80, optional: true }),
      last_average: str(b.last_average, "\u0627\u0644\u0645\u0639\u062F\u0644 \u0627\u0644\u0633\u0627\u0628\u0642", { max: 20, optional: true }),
      health_notes: str(b.health_notes, "\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0635\u062D\u064A\u0629", { max: 600, optional: true }),
      notes: str(b.notes, "\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0625\u0636\u0627\u0641\u064A\u0629", { max: 600, optional: true })
    };
    const plainPassword = password(b.password);
    const requestedClassId = str(b.requested_class_id, "\u0627\u0644\u0635\u0641 \u0627\u0644\u0645\u0637\u0644\u0648\u0628", { max: 64, optional: true });
    const [dupApplication, dupUser] = await Promise.all([
      getDocs3(
        query3(registrationsRef, where3("national_id", "==", application.national_id), fsLimit(5))
      ),
      getDocs3(query3(usersRef, where3("national_id", "==", application.national_id), fsLimit(1)))
    ]);
    if (!dupUser.empty) {
      throw badRequest("\u064A\u0648\u062C\u062F \u062D\u0633\u0627\u0628 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0628\u0646\u0641\u0633 \u0631\u0642\u0645 \u0627\u0644\u0647\u0648\u064A\u0629. \u064A\u0631\u062C\u0649 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0623\u0648 \u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629.");
    }
    const pendingDup = dupApplication.docs.find((d) => d.data().status === "pending");
    if (pendingDup) {
      throw badRequest(
        `\u0644\u062F\u064A\u0643 \u0637\u0644\u0628 \u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0628\u0627\u0644\u0641\u0639\u0644. \u0631\u0642\u0645 \u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629 \u0627\u0644\u062E\u0627\u0635 \u0628\u0643: ${pendingDup.data().tracking_code}`
      );
    }
    let requestedClassName = "";
    if (requestedClassId) {
      const classDoc = await getDoc(doc2(db, "classes", requestedClassId));
      if (!classDoc.exists()) throw badRequest("\u0627\u0644\u0635\u0641 \u0627\u0644\u0645\u062E\u062A\u0627\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
      requestedClassName = classDoc.data().name;
    }
    const trackingCode = makeTrackingCode();
    const created = await addDoc2(registrationsRef, {
      ...application,
      requested_class_id: requestedClassId || null,
      requested_class_name: requestedClassName || null,
      password: hashPassword(plainPassword),
      tracking_code: trackingCode,
      status: "pending",
      createdAt: serverTimestamp3()
    });
    audit(req, {
      action: "create",
      entity: "registration",
      entityId: created.id,
      summary: `\u0637\u0644\u0628 \u062A\u0633\u062C\u064A\u0644 \u062C\u062F\u064A\u062F \u0628\u0627\u0633\u0645 ${application.full_name}`
    });
    res.status(201).json({
      success: true,
      tracking_code: trackingCode,
      message: "\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 \u0637\u0644\u0628\u0643 \u0628\u0646\u062C\u0627\u062D. \u0627\u062D\u062A\u0641\u0638 \u0628\u0631\u0642\u0645 \u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629 \u0644\u0645\u0639\u0631\u0641\u0629 \u062D\u0627\u0644\u0629 \u0627\u0644\u0637\u0644\u0628. \u0633\u064A\u062A\u0645 \u0625\u0634\u0639\u0627\u0631\u0643 \u0639\u0646\u062F \u0645\u0648\u0627\u0641\u0642\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629."
    });
  })
);
router2.get(
  "/register/status/:code",
  rateLimit({ windowMs: 10 * 60 * 1e3, max: 40, keyPrefix: "regstatus" }),
  wrap(async (req, res) => {
    const code = str(req.params.code, "\u0631\u0642\u0645 \u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629", { min: 4, max: 32 }).toUpperCase();
    const snapshot = await getDocs3(query3(registrationsRef, where3("tracking_code", "==", code), fsLimit(1)));
    if (snapshot.empty) throw notFound("\u0644\u0627 \u064A\u0648\u062C\u062F \u0637\u0644\u0628 \u0628\u0647\u0630\u0627 \u0627\u0644\u0631\u0642\u0645. \u062A\u0623\u0643\u062F \u0645\u0646 \u0631\u0642\u0645 \u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629.");
    const data = snapshot.docs[0].data();
    res.json({
      tracking_code: data.tracking_code,
      full_name: data.full_name,
      status: data.status,
      requested_class_name: data.requested_class_name,
      rejection_reason: data.status === "rejected" ? data.rejection_reason || "" : "",
      assigned_uid: data.status === "approved" ? data.assigned_uid || "" : "",
      submitted_at: data.createdAt?.toDate?.()?.toISOString() || null,
      reviewed_at: data.reviewed_at?.toDate?.()?.toISOString() || null
    });
  })
);
router2.get(
  "/admin/registrations",
  requireStaff,
  wrap(async (req, res) => {
    const status = req.query.status ? oneOf(req.query.status, "\u0627\u0644\u062D\u0627\u0644\u0629", STATUSES) : null;
    const q = status ? query3(registrationsRef, where3("status", "==", status)) : registrationsRef;
    const rows = await fetchAll(q);
    rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    res.json(rows.map(({ password: password2, ...safe }) => safe));
  })
);
router2.get(
  "/admin/registrations/:id",
  requireStaff,
  wrap(async (req, res) => {
    const snap = await getDoc(doc2(db, "registrations", req.params.id));
    if (!snap.exists()) throw notFound("\u0637\u0644\u0628 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const { password: password2, ...safe } = snap.data();
    res.json({ id: snap.id, ...safe });
  })
);
router2.post(
  "/admin/registrations/:id/approve",
  requireStaff,
  wrap(async (req, res) => {
    const registrationDoc = doc2(db, "registrations", req.params.id);
    const snap = await getDoc(registrationDoc);
    if (!snap.exists()) throw notFound("\u0637\u0644\u0628 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const data = snap.data();
    if (data.status !== "pending") {
      throw badRequest(`\u062A\u0645\u062A \u0645\u0639\u0627\u0644\u062C\u0629 \u0647\u0630\u0627 \u0627\u0644\u0637\u0644\u0628 \u0645\u0633\u0628\u0642\u0627\u064B (\u0627\u0644\u062D\u0627\u0644\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629: ${data.status})`);
    }
    const classId = str(req.body?.class_id ?? data.requested_class_id, "\u0627\u0644\u0635\u0641", {
      max: 64,
      optional: true
    });
    if (!classId) throw badRequest("\u064A\u062C\u0628 \u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0635\u0641 \u0627\u0644\u062F\u0631\u0627\u0633\u064A \u0642\u0628\u0644 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629");
    const classDoc = await getDoc(doc2(db, "classes", classId));
    if (!classDoc.exists()) throw badRequest("\u0627\u0644\u0635\u0641 \u0627\u0644\u0645\u062E\u062A\u0627\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const uid = await allocateStudentUid();
    const newUser = await addDoc2(usersRef, {
      name: data.full_name,
      username: uid,
      uid,
      password: data.password,
      // already hashed at submission time
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
      approved_by: req.user.id,
      approved_by_name: req.user.name,
      createdAt: serverTimestamp3()
    });
    await addDoc2(enrollmentsRef, {
      student_id: newUser.id,
      class_id: classId,
      createdAt: serverTimestamp3()
    });
    await updateDoc2(registrationDoc, {
      status: "approved",
      assigned_uid: uid,
      created_user_id: newUser.id,
      approved_class_id: classId,
      approved_class_name: classDoc.data().name,
      reviewed_by: req.user.id,
      reviewed_by_name: req.user.name,
      reviewed_at: serverTimestamp3()
    });
    await addDoc2(notificationsRef, {
      user_id: newUser.id,
      title: "\u062A\u0645\u062A \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u062A\u0633\u062C\u064A\u0644\u0643",
      message: `\u0623\u0647\u0644\u0627\u064B \u0628\u0643 ${data.full_name}. \u0631\u0642\u0645\u0643 \u0627\u0644\u062A\u0639\u0631\u064A\u0641\u064A \u0644\u0644\u062F\u062E\u0648\u0644 \u0647\u0648: ${uid}. \u062A\u0645 \u062A\u0633\u062C\u064A\u0644\u0643 \u0641\u064A ${classDoc.data().name}.`,
      type: "registration",
      isRead: false,
      createdAt: serverTimestamp3()
    });
    const feeAmount = Number(req.body?.initial_fee_amount ?? 0);
    if (feeAmount > 0) {
      await addDoc2(invoicesRef, {
        student_id: newUser.id,
        student_name: data.full_name,
        student_uid: uid,
        class_id: classId,
        class_name: classDoc.data().name,
        title: str(req.body?.initial_fee_title, "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0642\u0633\u0637", { max: 120, optional: true }) || "\u0627\u0644\u0642\u0633\u0637 \u0627\u0644\u062F\u0631\u0627\u0633\u064A \u0627\u0644\u0633\u0646\u0648\u064A",
        category: "\u0642\u0633\u0637 \u062F\u0631\u0627\u0633\u064A",
        amount: feeAmount,
        discount: 0,
        paid_amount: 0,
        currency: "IQD",
        due_date: isoDate(req.body?.initial_fee_due_date, "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642", { optional: true }) || null,
        academic_year: (/* @__PURE__ */ new Date()).getFullYear(),
        status: "unpaid",
        created_by: req.user.id,
        created_by_name: req.user.name,
        createdAt: serverTimestamp3()
      });
    }
    invalidate("students");
    audit(req, {
      action: "approve",
      entity: "registration",
      entityId: snap.id,
      summary: `\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u062A\u0633\u062C\u064A\u0644 ${data.full_name} \u0648\u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0628\u0631\u0642\u0645 ${uid}`,
      meta: { uid, class_id: classId, user_id: newUser.id }
    });
    res.json({ success: true, uid, user_id: newUser.id });
  })
);
router2.post(
  "/admin/registrations/:id/reject",
  requireStaff,
  wrap(async (req, res) => {
    const reason = str(req.body?.reason, "\u0633\u0628\u0628 \u0627\u0644\u0631\u0641\u0636", { min: 3, max: 500 });
    const registrationDoc = doc2(db, "registrations", req.params.id);
    const snap = await getDoc(registrationDoc);
    if (!snap.exists()) throw notFound("\u0637\u0644\u0628 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const data = snap.data();
    if (data.status !== "pending") throw badRequest("\u062A\u0645\u062A \u0645\u0639\u0627\u0644\u062C\u0629 \u0647\u0630\u0627 \u0627\u0644\u0637\u0644\u0628 \u0645\u0633\u0628\u0642\u0627\u064B");
    await updateDoc2(registrationDoc, {
      status: "rejected",
      rejection_reason: reason,
      reviewed_by: req.user.id,
      reviewed_by_name: req.user.name,
      reviewed_at: serverTimestamp3()
    });
    audit(req, {
      action: "reject",
      entity: "registration",
      entityId: snap.id,
      summary: `\u0631\u0641\u0636 \u0637\u0644\u0628 \u062A\u0633\u062C\u064A\u0644 ${data.full_name}`,
      meta: { reason }
    });
    res.json({ success: true });
  })
);
router2.delete(
  "/admin/registrations/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const registrationDoc = doc2(db, "registrations", req.params.id);
    const snap = await getDoc(registrationDoc);
    if (!snap.exists()) throw notFound("\u0637\u0644\u0628 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    await updateDoc2(registrationDoc, {
      archived: true,
      archived_at: serverTimestamp3(),
      archived_by: req.user.id
    });
    audit(req, {
      action: "delete",
      entity: "registration",
      entityId: snap.id,
      summary: `\u0623\u0631\u0634\u0641\u0629 \u0637\u0644\u0628 \u062A\u0633\u062C\u064A\u0644 ${snap.data().full_name}`
    });
    res.json({ success: true });
  })
);
var registrations_routes_default = router2;

// backend/routes/admin.routes.ts
import { Router as Router3 } from "express";
import {
  addDoc as addDoc3,
  deleteDoc,
  doc as doc3,
  getDoc as getDoc2,
  getDocs as getDocs4,
  limit as fsLimit2,
  orderBy,
  query as query4,
  serverTimestamp as serverTimestamp4,
  updateDoc as updateDoc3,
  where as where4,
  writeBatch
} from "firebase/firestore";
var router3 = Router3();
var BATCH_LIMIT = 450;
router3.get(
  "/admin/students",
  requireStaff,
  wrap(async (_req, res) => {
    const students = await fetchAll(query4(usersRef, where4("role", "==", "student")));
    res.json(students.map(sanitizeUser).sort((a, b) => String(a.name).localeCompare(String(b.name), "ar")));
  })
);
router3.get(
  "/admin/students/:id",
  requireStaff,
  wrap(async (req, res) => {
    const snap = await getDoc2(doc3(db, "users", req.params.id));
    if (!snap.exists() || snap.data().role !== "student") throw notFound("\u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    res.json(sanitizeUser({ id: snap.id, ...snap.data() }));
  })
);
router3.post(
  "/admin/students",
  requireStaff,
  wrap(async (req, res) => {
    const name = str(req.body?.name, "\u0627\u0633\u0645 \u0627\u0644\u0637\u0627\u0644\u0628", { min: 3, max: 120 });
    const uid = str(req.body?.uid, "\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062A\u0639\u0631\u064A\u0641\u064A", { min: 3, max: 64 });
    const plain = password(req.body?.password);
    const clash = await getDocs4(query4(usersRef, where4("uid", "==", uid), fsLimit2(1)));
    if (!clash.empty) throw badRequest("\u0647\u0630\u0627 \u0627\u0644\u0640 UID \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0641\u0639\u0644\u060C \u064A\u0631\u062C\u0649 \u0627\u062E\u062A\u064A\u0627\u0631 \u0648\u0627\u062D\u062F \u0622\u062E\u0631");
    const created = await addDoc3(usersRef, {
      name,
      username: uid,
      uid,
      password: hashPassword(plain),
      role: "student",
      status: "active",
      phone: phone(req.body?.phone, "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641", { optional: true }),
      guardian_name: str(req.body?.guardian_name, "\u0627\u0633\u0645 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631", { max: 120, optional: true }),
      guardian_phone: phone(req.body?.guardian_phone, "\u0647\u0627\u062A\u0641 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631", { optional: true }),
      national_id: str(req.body?.national_id, "\u0631\u0642\u0645 \u0627\u0644\u0647\u0648\u064A\u0629", { max: 40, optional: true }),
      createdAt: serverTimestamp4()
    });
    const classId = str(req.body?.class_id, "\u0627\u0644\u0635\u0641", { max: 64, optional: true });
    if (classId) {
      await addDoc3(enrollmentsRef, { student_id: created.id, class_id: classId, createdAt: serverTimestamp4() });
    }
    invalidate("students");
    audit(req, { action: "create", entity: "student", entityId: created.id, summary: `\u0625\u0636\u0627\u0641\u0629 \u0637\u0627\u0644\u0628 ${name} (${uid})` });
    res.status(201).json({ success: true, id: created.id });
  })
);
router3.put(
  "/admin/students/:id",
  requireStaff,
  wrap(async (req, res) => {
    const target = doc3(db, "users", req.params.id);
    const snap = await getDoc2(target);
    if (!snap.exists() || snap.data().role !== "student") throw notFound("\u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const b = req.body || {};
    const patch = {};
    const editable = [
      ["name", () => str(b.name, "\u0627\u0644\u0627\u0633\u0645", { min: 3, max: 120 })],
      ["phone", () => phone(b.phone, "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641", { optional: true })],
      ["email", () => email(b.email, "\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A", { optional: true })],
      ["address", () => str(b.address, "\u0627\u0644\u0639\u0646\u0648\u0627\u0646", { max: 250, optional: true })],
      ["guardian_name", () => str(b.guardian_name, "\u0627\u0633\u0645 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631", { max: 120, optional: true })],
      ["guardian_phone", () => phone(b.guardian_phone, "\u0647\u0627\u062A\u0641 \u0648\u0644\u064A \u0627\u0644\u0623\u0645\u0631", { optional: true })],
      ["health_notes", () => str(b.health_notes, "\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0635\u062D\u064A\u0629", { max: 600, optional: true })],
      ["status", () => oneOf(b.status, "\u062D\u0627\u0644\u0629 \u0627\u0644\u062D\u0633\u0627\u0628", ["active", "suspended"])]
    ];
    for (const [key, parse] of editable) {
      if (b[key] !== void 0) patch[key] = parse();
    }
    if (Object.keys(patch).length === 0) throw badRequest("\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u0644\u0644\u062A\u062D\u062F\u064A\u062B");
    patch.updatedAt = serverTimestamp4();
    await updateDoc3(target, patch);
    invalidate("students");
    audit(req, {
      action: "update",
      entity: "student",
      entityId: snap.id,
      summary: `\u062A\u0639\u062F\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0637\u0627\u0644\u0628 ${snap.data().name}`,
      meta: patch
    });
    res.json({ success: true });
  })
);
router3.delete(
  "/admin/students/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const studentId = req.params.id;
    const snap = await getDoc2(doc3(db, "users", studentId));
    if (!snap.exists()) throw notFound("\u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const related = await Promise.all([
      getDocs4(query4(enrollmentsRef, where4("student_id", "==", studentId))),
      getDocs4(query4(notificationsRef, where4("user_id", "==", studentId)))
    ]);
    const refs = related.flatMap((s) => s.docs.map((d) => d.ref));
    for (const group of chunk(refs, BATCH_LIMIT)) {
      const batch = writeBatch(db);
      group.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    await deleteDoc(doc3(db, "users", studentId));
    invalidate("students");
    audit(req, {
      action: "delete",
      entity: "student",
      entityId: studentId,
      summary: `\u062D\u0630\u0641 \u0627\u0644\u0637\u0627\u0644\u0628 ${snap.data().name} \u0645\u0639 ${refs.length} \u0633\u062C\u0644 \u0645\u0631\u062A\u0628\u0637`
    });
    res.json({ success: true });
  })
);
router3.get(
  "/admin/teachers",
  requireStaff,
  wrap(async (_req, res) => {
    const teachers = await fetchAll(query4(usersRef, where4("role", "==", "teacher")));
    res.json(teachers.map(sanitizeUser));
  })
);
router3.post(
  "/admin/teachers",
  requireAdmin,
  wrap(async (req, res) => {
    const name = str(req.body?.name, "\u0627\u0633\u0645 \u0627\u0644\u0645\u0639\u0644\u0645", { min: 3, max: 120 });
    const username = str(req.body?.username, "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645", { min: 3, max: 60 });
    const plain = password(req.body?.password);
    const uid = `TCH${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const created = await addDoc3(usersRef, {
      name,
      username,
      uid,
      password: hashPassword(plain),
      role: "teacher",
      status: "active",
      subjects: stringArray(req.body?.subjects, "\u0627\u0644\u0645\u0648\u0627\u062F", { max: 40 }),
      phone: phone(req.body?.phone, "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641", { optional: true }),
      createdAt: serverTimestamp4()
    });
    audit(req, { action: "create", entity: "teacher", entityId: created.id, summary: `\u0625\u0636\u0627\u0641\u0629 \u0645\u0639\u0644\u0645 ${name} (${uid})` });
    res.status(201).json({ success: true, id: created.id, uid });
  })
);
router3.put(
  "/admin/teachers/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const target = doc3(db, "users", req.params.id);
    const snap = await getDoc2(target);
    if (!snap.exists()) throw notFound("\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const patch = {};
    if (req.body?.name !== void 0) patch.name = str(req.body.name, "\u0627\u0644\u0627\u0633\u0645", { min: 3, max: 120 });
    if (req.body?.subjects !== void 0) patch.subjects = stringArray(req.body.subjects, "\u0627\u0644\u0645\u0648\u0627\u062F", { max: 40 });
    if (req.body?.phone !== void 0) patch.phone = phone(req.body.phone, "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641", { optional: true });
    if (req.body?.status !== void 0) {
      patch.status = oneOf(req.body.status, "\u062D\u0627\u0644\u0629 \u0627\u0644\u062D\u0633\u0627\u0628", ["active", "suspended"]);
    }
    if (Object.keys(patch).length === 0) throw badRequest("\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u0644\u0644\u062A\u062D\u062F\u064A\u062B");
    patch.updatedAt = serverTimestamp4();
    await updateDoc3(target, patch);
    audit(req, {
      action: "update",
      entity: "teacher",
      entityId: snap.id,
      summary: `\u062A\u0639\u062F\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A ${snap.data().name}`,
      meta: patch
    });
    res.json({ success: true });
  })
);
router3.delete(
  "/admin/teachers/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const teacherId = req.params.id;
    if (teacherId === req.user.id) throw badRequest("\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u062D\u0630\u0641 \u062D\u0633\u0627\u0628\u0643 \u0627\u0644\u062E\u0627\u0635");
    const snap = await getDoc2(doc3(db, "users", teacherId));
    if (!snap.exists()) throw notFound("\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const classes = await fetchAll(classesRef);
    const affected = classes.filter(
      (c) => (c.teacher_ids || []).includes(teacherId) || c.teacher_id === teacherId
    );
    for (const group of chunk(affected, BATCH_LIMIT)) {
      const batch = writeBatch(db);
      for (const c of group) {
        const ids = c.teacher_ids || (c.teacher_id ? [c.teacher_id] : []);
        const names = c.teacher_names || (c.teacher_name ? [c.teacher_name] : []);
        const keep = ids.map((id, i) => ({ id, name: names[i] || "\u0645\u0639\u0644\u0645" })).filter((t) => t.id !== teacherId);
        batch.update(doc3(db, "classes", c.id), {
          teacher_ids: keep.map((t) => t.id),
          teacher_names: keep.map((t) => t.name),
          teacher_id: null,
          teacher_name: null,
          updatedAt: serverTimestamp4()
        });
      }
      await batch.commit();
    }
    await deleteDoc(doc3(db, "users", teacherId));
    invalidate("classes");
    audit(req, {
      action: "delete",
      entity: "user",
      entityId: teacherId,
      summary: `\u062D\u0630\u0641 ${snap.data().name} \u0648\u0625\u0632\u0627\u0644\u062A\u0647 \u0645\u0646 ${affected.length} \u0635\u0641`
    });
    res.json({ success: true });
  })
);
router3.get(
  "/admin/assistants",
  requireAdmin,
  wrap(async (_req, res) => {
    const rows = await fetchAll(query4(usersRef, where4("role", "==", "assistant_admin")));
    res.json(rows.map(sanitizeUser));
  })
);
router3.post(
  "/admin/assistants",
  requireAdmin,
  wrap(async (req, res) => {
    const name = str(req.body?.name, "\u0627\u0644\u0627\u0633\u0645", { min: 3, max: 120 });
    const username = str(req.body?.username, "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645", { min: 3, max: 60 });
    const plain = password(req.body?.password);
    const uid = `AST${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const created = await addDoc3(usersRef, {
      name,
      username,
      uid,
      password: hashPassword(plain),
      role: "assistant_admin",
      status: "active",
      createdAt: serverTimestamp4()
    });
    audit(req, {
      action: "create",
      entity: "assistant_admin",
      entityId: created.id,
      summary: `\u0625\u0636\u0627\u0641\u0629 \u0645\u0633\u0627\u0639\u062F \u0625\u062F\u0627\u0631\u0629 ${name} (${uid})`
    });
    res.status(201).json({ success: true, id: created.id, uid });
  })
);
router3.post(
  "/admin/users/:id/reset-password",
  requireAdmin,
  wrap(async (req, res) => {
    const newPassword = password(req.body?.new_password, "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629");
    const target = doc3(db, "users", req.params.id);
    const snap = await getDoc2(target);
    if (!snap.exists()) throw notFound("\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    await updateDoc3(target, {
      password: hashPassword(newPassword),
      password_reset_by: req.user.id,
      password_changed_at: serverTimestamp4()
    });
    await addDoc3(notificationsRef, {
      user_id: snap.id,
      title: "\u062A\u0645 \u062A\u063A\u064A\u064A\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
      message: "\u0642\u0627\u0645\u062A \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0628\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062E\u0627\u0635\u0629 \u0628\u062D\u0633\u0627\u0628\u0643. \u064A\u0631\u062C\u0649 \u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0644\u0627\u0633\u062A\u0644\u0627\u0645\u0647\u0627.",
      type: "security",
      isRead: false,
      createdAt: serverTimestamp4()
    });
    audit(req, {
      action: "password_reset",
      entity: "user",
      entityId: snap.id,
      summary: `\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 ${snap.data().name}`
    });
    res.json({ success: true });
  })
);
router3.post(
  "/admin/broadcast",
  requireStaff,
  wrap(async (req, res) => {
    const title = str(req.body?.title, "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0625\u0634\u0639\u0627\u0631", { max: 120, optional: true }) || "\u062A\u0646\u0628\u064A\u0647 \u0645\u0646 \u0627\u0644\u0625\u062F\u0627\u0631\u0629";
    const message = str(req.body?.message, "\u0646\u0635 \u0627\u0644\u0625\u0634\u0639\u0627\u0631", { min: 2, max: 1e3 });
    const studentId = str(req.body?.studentId, "\u0627\u0644\u0637\u0627\u0644\u0628", { max: 64, optional: true });
    const classId = str(req.body?.classId, "\u0627\u0644\u0635\u0641", { max: 64, optional: true });
    let recipients;
    if (studentId) {
      recipients = [studentId];
    } else if (classId) {
      const enrollments = await fetchAll(
        query4(enrollmentsRef, where4("class_id", "==", classId))
      );
      recipients = [...new Set(enrollments.map((e) => e.student_id))];
    } else {
      const students = await fetchAll(query4(usersRef, where4("role", "==", "student")));
      recipients = students.map((s) => s.id);
    }
    if (recipients.length === 0) return res.json({ success: true, count: 0 });
    for (const group of chunk(recipients, BATCH_LIMIT)) {
      const batch = writeBatch(db);
      for (const id of group) {
        batch.set(doc3(notificationsRef), {
          user_id: id,
          title,
          message,
          type: "broadcast",
          isRead: false,
          createdAt: serverTimestamp4()
        });
      }
      await batch.commit();
    }
    audit(req, {
      action: "broadcast",
      entity: "notification",
      summary: `\u0625\u0631\u0633\u0627\u0644 \u0625\u0634\u0639\u0627\u0631 "${title}" \u0625\u0644\u0649 ${recipients.length} \u0645\u0633\u062A\u062E\u062F\u0645`,
      meta: { classId, studentId }
    });
    res.json({ success: true, count: recipients.length });
  })
);
router3.get(
  "/admin/audit",
  requireAdmin,
  wrap(async (req, res) => {
    const max = num(req.query.limit, "\u0627\u0644\u062D\u062F", { min: 1, max: 500, optional: true, default: 100 });
    const filters = [];
    if (req.query.action) filters.push(where4("action", "==", String(req.query.action)));
    if (req.query.actor_id) filters.push(where4("actor_id", "==", String(req.query.actor_id)));
    const rows = await fetchIndexed(
      query4(auditRef, ...filters, orderBy("createdAt", "desc"), fsLimit2(max)),
      async () => {
        const all = await fetchAll(
          filters.length ? query4(auditRef, ...filters) : auditRef
        );
        all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        return all.slice(0, max);
      },
      "audit log, newest first"
    );
    res.json(rows);
  })
);
router3.get(
  "/admin/uids",
  requireStaff,
  wrap(async (_req, res) => {
    res.json(await fetchAll(validUidsRef));
  })
);
router3.post(
  "/admin/uids/generate",
  requireStaff,
  wrap(async (req, res) => {
    const count = num(req.body?.count, "\u0627\u0644\u0639\u062F\u062F", { min: 1, max: 100, optional: true, default: 10 });
    const existing = await fetchAll(validUidsRef);
    const maxId = existing.reduce((max, row) => {
      const n = parseInt(row.uid, 10);
      return Number.isNaN(n) ? max : Math.max(max, n);
    }, 0);
    const batch = writeBatch(db);
    for (let i = 1; i <= count; i++) {
      batch.set(doc3(validUidsRef), { uid: String(maxId + i), used: false, createdAt: serverTimestamp4() });
    }
    await batch.commit();
    audit(req, { action: "create", entity: "valid_uid", summary: `\u062A\u0648\u0644\u064A\u062F ${count} \u0631\u0642\u0645 \u062A\u0639\u0631\u064A\u0641\u064A` });
    res.json({ success: true, count });
  })
);
router3.post(
  "/admin/uids/add",
  requireStaff,
  wrap(async (req, res) => {
    const uid = str(req.body?.uid, "\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062A\u0639\u0631\u064A\u0641\u064A", { min: 1, max: 64 });
    const clash = await getDocs4(query4(validUidsRef, where4("uid", "==", uid), fsLimit2(1)));
    if (!clash.empty) throw badRequest("\u0647\u0630\u0627 \u0627\u0644\u0640 UID \u0645\u0648\u062C\u0648\u062F \u0628\u0627\u0644\u0641\u0639\u0644");
    await addDoc3(validUidsRef, { uid, used: false, createdAt: serverTimestamp4() });
    audit(req, { action: "create", entity: "valid_uid", summary: `\u0625\u0636\u0627\u0641\u0629 \u0631\u0642\u0645 \u062A\u0639\u0631\u064A\u0641\u064A ${uid}` });
    res.json({ success: true });
  })
);
router3.delete(
  "/admin/uids/:id",
  requireStaff,
  wrap(async (req, res) => {
    await deleteDoc(doc3(db, "valid_uids", req.params.id));
    audit(req, { action: "delete", entity: "valid_uid", entityId: req.params.id, summary: "\u062D\u0630\u0641 \u0631\u0642\u0645 \u062A\u0639\u0631\u064A\u0641\u064A" });
    res.json({ success: true });
  })
);
var admin_routes_default = router3;

// backend/routes/classes.routes.ts
import { Router as Router5 } from "express";
import {
  addDoc as addDoc5,
  deleteDoc as deleteDoc2,
  doc as doc5,
  getDoc as getDoc4,
  getDocs as getDocs6,
  query as query6,
  serverTimestamp as serverTimestamp6,
  updateDoc as updateDoc5,
  where as where6,
  writeBatch as writeBatch3
} from "firebase/firestore";

// backend/routes/payments.routes.ts
import { Router as Router4 } from "express";
import {
  addDoc as addDoc4,
  doc as doc4,
  getDoc as getDoc3,
  query as query5,
  runTransaction as runTransaction2,
  serverTimestamp as serverTimestamp5,
  updateDoc as updateDoc4,
  where as where5,
  writeBatch as writeBatch2
} from "firebase/firestore";
var router4 = Router4();
var CURRENCY = "IQD";
var CATEGORIES = ["\u0642\u0633\u0637 \u062F\u0631\u0627\u0633\u064A", "\u0631\u0633\u0648\u0645 \u062A\u0633\u062C\u064A\u0644", "\u0643\u062A\u0628 \u0648\u0642\u0631\u0637\u0627\u0633\u064A\u0629", "\u0646\u0642\u0644 \u0645\u062F\u0631\u0633\u064A", "\u0632\u064A \u0645\u062F\u0631\u0633\u064A", "\u0646\u0634\u0627\u0637\u0627\u062A", "\u0623\u062E\u0631\u0649"];
var METHODS = ["\u0646\u0642\u062F\u064A", "\u062A\u062D\u0648\u064A\u0644 \u0628\u0646\u0643\u064A", "\u0645\u062D\u0641\u0638\u0629 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0629", "\u0634\u064A\u0643"];
var INVOICE_STATUSES = ["unpaid", "partial", "paid", "cancelled"];
var BATCH_LIMIT2 = 450;
function netAmount(inv) {
  return Math.max(0, Number(inv.amount || 0) - Number(inv.discount || 0));
}
function remainingAmount(inv) {
  if (inv.status === "cancelled") return 0;
  return Math.max(0, netAmount(inv) - Number(inv.paid_amount || 0));
}
function deriveStatus(inv) {
  if (inv.status === "cancelled") return "cancelled";
  const paid = Number(inv.paid_amount || 0);
  const net = netAmount(inv);
  if (paid <= 0) return "unpaid";
  if (paid >= net) return "paid";
  return "partial";
}
router4.get(
  "/admin/invoices",
  requireStaff,
  wrap(async (req, res) => {
    const filters = [];
    if (req.query.student_id) filters.push(where5("student_id", "==", String(req.query.student_id)));
    if (req.query.class_id) filters.push(where5("class_id", "==", String(req.query.class_id)));
    if (req.query.status) {
      filters.push(where5("status", "==", oneOf(req.query.status, "\u0627\u0644\u062D\u0627\u0644\u0629", INVOICE_STATUSES)));
    }
    const rows = await fetchAll(
      filters.length ? query5(invoicesRef, ...filters) : invoicesRef
    );
    rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    res.json(
      rows.map((inv) => ({ ...inv, net_amount: netAmount(inv), remaining: remainingAmount(inv) }))
    );
  })
);
router4.post(
  "/admin/invoices",
  requireStaff,
  wrap(async (req, res) => {
    const b = req.body || {};
    const target = oneOf(b.target, "\u0627\u0644\u0641\u0626\u0629 \u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641\u0629", ["student", "class", "all"], "student");
    const title = str(b.title, "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0631\u0633\u0648\u0645", { min: 2, max: 120 });
    const category = oneOf(b.category, "\u0646\u0648\u0639 \u0627\u0644\u0631\u0633\u0648\u0645", CATEGORIES, "\u0642\u0633\u0637 \u062F\u0631\u0627\u0633\u064A");
    const amount = num(b.amount, "\u0627\u0644\u0645\u0628\u0644\u063A", { min: 1, max: 1e9 });
    const discount = num(b.discount, "\u0627\u0644\u062E\u0635\u0645", { min: 0, max: amount, optional: true });
    const dueDate = isoDate(b.due_date, "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642", { optional: true }) || null;
    const term = str(b.term, "\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062F\u0631\u0627\u0633\u064A", { max: 60, optional: true }) || null;
    const academicYear = num(b.academic_year, "\u0627\u0644\u0633\u0646\u0629 \u0627\u0644\u062F\u0631\u0627\u0633\u064A\u0629", {
      min: 2e3,
      max: 2100,
      optional: true,
      default: (/* @__PURE__ */ new Date()).getFullYear()
    });
    let studentIds = [];
    let classId = null;
    if (target === "student") {
      studentIds = [str(b.student_id, "\u0627\u0644\u0637\u0627\u0644\u0628", { max: 64 })];
    } else if (target === "class") {
      classId = str(b.class_id, "\u0627\u0644\u0635\u0641", { max: 64 });
      const enrollments2 = await fetchAll(
        query5(enrollmentsRef, where5("class_id", "==", classId))
      );
      studentIds = [...new Set(enrollments2.map((e) => e.student_id))];
    } else {
      const students2 = await fetchAll(query5(usersRef, where5("role", "==", "student")));
      studentIds = students2.filter((s) => s.status !== "suspended").map((s) => s.id);
    }
    if (studentIds.length === 0) throw badRequest("\u0644\u0627 \u064A\u0648\u062C\u062F \u0637\u0644\u0627\u0628 \u0645\u0637\u0627\u0628\u0642\u0648\u0646 \u0644\u0625\u0635\u062F\u0627\u0631 \u0627\u0644\u0631\u0633\u0648\u0645 \u0644\u0647\u0645");
    const students = await getDocsByIds(usersRef, studentIds);
    const enrollments = await fetchAll(enrollmentsRef);
    const enrollmentByStudent = new Map(enrollments.map((e) => [e.student_id, e.class_id]));
    const classNames = new Map(
      (await fetchAll(classesRef)).map((c) => [c.id, c.name])
    );
    let created = 0;
    for (const group of chunk(studentIds, BATCH_LIMIT2)) {
      const batch = writeBatch2(db);
      for (const studentId of group) {
        const student = students.get(studentId);
        if (!student) continue;
        const studentClassId = classId || enrollmentByStudent.get(studentId) || null;
        batch.set(doc4(invoicesRef), {
          student_id: studentId,
          student_name: student.name,
          student_uid: student.uid,
          class_id: studentClassId,
          class_name: studentClassId ? classNames.get(studentClassId) || null : null,
          title,
          category,
          amount,
          discount,
          paid_amount: 0,
          currency: CURRENCY,
          due_date: dueDate,
          term,
          academic_year: academicYear,
          status: "unpaid",
          created_by: req.user.id,
          created_by_name: req.user.name,
          createdAt: serverTimestamp5()
        });
        batch.set(doc4(notificationsRef), {
          user_id: studentId,
          title: "\u0631\u0633\u0648\u0645 \u0645\u0627\u0644\u064A\u0629 \u062C\u062F\u064A\u062F\u0629",
          message: `\u062A\u0645 \u0625\u0635\u062F\u0627\u0631 "${title}" \u0628\u0645\u0628\u0644\u063A ${(amount - discount).toLocaleString("en-US")} ${CURRENCY}${dueDate ? ` \u2014 \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642 ${dueDate}` : ""}`,
          type: "invoice",
          isRead: false,
          createdAt: serverTimestamp5()
        });
        created++;
      }
      await batch.commit();
    }
    audit(req, {
      action: "create",
      entity: "invoice",
      summary: `\u0625\u0635\u062F\u0627\u0631 "${title}" \u0644\u0639\u062F\u062F ${created} \u0637\u0627\u0644\u0628 \u0628\u0645\u0628\u0644\u063A ${amount - discount} ${CURRENCY}`,
      meta: { target, class_id: classId, amount, discount }
    });
    res.status(201).json({ success: true, count: created });
  })
);
router4.put(
  "/admin/invoices/:id",
  requireStaff,
  wrap(async (req, res) => {
    const invoiceDoc = doc4(db, "invoices", req.params.id);
    const snap = await getDoc3(invoiceDoc);
    if (!snap.exists()) throw notFound("\u0633\u0646\u062F \u0627\u0644\u0631\u0633\u0648\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const current = snap.data();
    const b = req.body || {};
    const patch = {};
    if (b.title !== void 0) patch.title = str(b.title, "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0631\u0633\u0648\u0645", { min: 2, max: 120 });
    if (b.category !== void 0) patch.category = oneOf(b.category, "\u0646\u0648\u0639 \u0627\u0644\u0631\u0633\u0648\u0645", CATEGORIES);
    if (b.amount !== void 0) patch.amount = num(b.amount, "\u0627\u0644\u0645\u0628\u0644\u063A", { min: 1, max: 1e9 });
    if (b.discount !== void 0) patch.discount = num(b.discount, "\u0627\u0644\u062E\u0635\u0645", { min: 0, max: 1e9 });
    if (b.due_date !== void 0) patch.due_date = isoDate(b.due_date, "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642", { optional: true }) || null;
    if (b.term !== void 0) patch.term = str(b.term, "\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062F\u0631\u0627\u0633\u064A", { max: 60, optional: true }) || null;
    if (b.status !== void 0) patch.status = oneOf(b.status, "\u0627\u0644\u062D\u0627\u0644\u0629", INVOICE_STATUSES);
    const merged = { ...current, ...patch };
    if (Number(merged.discount || 0) > Number(merged.amount || 0)) {
      throw badRequest("\u0627\u0644\u062E\u0635\u0645 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u064A\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0623\u0635\u0644\u064A");
    }
    patch.status = deriveStatus(merged);
    patch.updatedAt = serverTimestamp5();
    await updateDoc4(invoiceDoc, patch);
    audit(req, {
      action: "update",
      entity: "invoice",
      entityId: snap.id,
      summary: `\u062A\u0639\u062F\u064A\u0644 \u0631\u0633\u0648\u0645 "${merged.title}" \u0644\u0644\u0637\u0627\u0644\u0628 ${current.student_name}`,
      meta: patch
    });
    res.json({ success: true });
  })
);
router4.delete(
  "/admin/invoices/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const invoiceDoc = doc4(db, "invoices", req.params.id);
    const snap = await getDoc3(invoiceDoc);
    if (!snap.exists()) throw notFound("\u0633\u0646\u062F \u0627\u0644\u0631\u0633\u0648\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const data = snap.data();
    if (Number(data.paid_amount || 0) > 0) {
      throw badRequest("\u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u0644\u063A\u0627\u0621 \u0633\u0646\u062F \u062A\u0645 \u062A\u0633\u062F\u064A\u062F \u062C\u0632\u0621 \u0645\u0646\u0647. \u0642\u0645 \u0628\u0625\u0631\u062C\u0627\u0639 \u0627\u0644\u062F\u0641\u0639\u0627\u062A \u0623\u0648\u0644\u0627\u064B.");
    }
    await updateDoc4(invoiceDoc, {
      status: "cancelled",
      cancelled_by: req.user.id,
      cancelled_at: serverTimestamp5()
    });
    audit(req, {
      action: "delete",
      entity: "invoice",
      entityId: snap.id,
      summary: `\u0625\u0644\u063A\u0627\u0621 \u0631\u0633\u0648\u0645 "${data.title}" \u0644\u0644\u0637\u0627\u0644\u0628 ${data.student_name}`
    });
    res.json({ success: true });
  })
);
router4.post(
  "/admin/invoices/:id/payments",
  requireStaff,
  wrap(async (req, res) => {
    const amount = num(req.body?.amount, "\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u062F\u0641\u0648\u0639", { min: 1, max: 1e9 });
    const method = oneOf(req.body?.method, "\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u062F\u0641\u0639", METHODS, "\u0646\u0642\u062F\u064A");
    const paidAt = isoDate(req.body?.paid_at, "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u062F\u0641\u0639", { optional: true }) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const note = str(req.body?.note, "\u0645\u0644\u0627\u062D\u0638\u0629", { max: 300, optional: true });
    const invoiceDoc = doc4(db, "invoices", req.params.id);
    const result = await runTransaction2(db, async (tx) => {
      const snap = await tx.get(invoiceDoc);
      if (!snap.exists()) throw notFound("\u0633\u0646\u062F \u0627\u0644\u0631\u0633\u0648\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
      const data = snap.data();
      if (data.status === "cancelled") throw badRequest("\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0633\u062F\u064A\u062F \u0639\u0644\u0649 \u0633\u0646\u062F \u0645\u0644\u063A\u0649");
      const remaining = remainingAmount(data);
      if (amount > remaining) {
        throw badRequest(
          `\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u062F\u062E\u0644 (${amount.toLocaleString("en-US")}) \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u0645\u062A\u0628\u0642\u064A (${remaining.toLocaleString("en-US")})`
        );
      }
      const newPaid = Number(data.paid_amount || 0) + amount;
      const newStatus = deriveStatus({ ...data, paid_amount: newPaid });
      tx.update(invoiceDoc, { paid_amount: newPaid, status: newStatus, updatedAt: serverTimestamp5() });
      const paymentDoc = doc4(paymentsRef);
      tx.set(paymentDoc, {
        invoice_id: snap.id,
        invoice_title: data.title,
        student_id: data.student_id,
        student_name: data.student_name,
        student_uid: data.student_uid,
        class_id: data.class_id || null,
        amount,
        currency: CURRENCY,
        method,
        paid_at: paidAt,
        note,
        receipt_no: `R-${Date.now().toString(36).toUpperCase()}`,
        recorded_by: req.user.id,
        recorded_by_name: req.user.name,
        createdAt: serverTimestamp5()
      });
      return { paymentId: paymentDoc.id, newPaid, newStatus, data };
    });
    await addDoc4(notificationsRef, {
      user_id: result.data.student_id,
      title: "\u062A\u0645 \u062A\u0633\u062C\u064A\u0644 \u062F\u0641\u0639\u0629",
      message: `\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 ${amount.toLocaleString("en-US")} ${CURRENCY} \u0639\u0644\u0649 "${result.data.title}". ${result.newStatus === "paid" ? "\u062A\u0645 \u062A\u0633\u062F\u064A\u062F \u0627\u0644\u0645\u0628\u0644\u063A \u0628\u0627\u0644\u0643\u0627\u0645\u0644." : `\u0627\u0644\u0645\u062A\u0628\u0642\u064A: ${remainingAmount({ ...result.data, paid_amount: result.newPaid }).toLocaleString("en-US")} ${CURRENCY}`}`,
      type: "payment",
      isRead: false,
      createdAt: serverTimestamp5()
    });
    audit(req, {
      action: "payment",
      entity: "invoice",
      entityId: req.params.id,
      summary: `\u062A\u0633\u062C\u064A\u0644 \u062F\u0641\u0639\u0629 ${amount} ${CURRENCY} \u0645\u0646 ${result.data.student_name}`,
      meta: { method, paid_at: paidAt, payment_id: result.paymentId }
    });
    res.status(201).json({ success: true, payment_id: result.paymentId, status: result.newStatus });
  })
);
router4.get(
  "/admin/invoices/:id/payments",
  requireStaff,
  wrap(async (req, res) => {
    const rows = await fetchAll(
      query5(paymentsRef, where5("invoice_id", "==", req.params.id))
    );
    rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    res.json(rows);
  })
);
router4.delete(
  "/admin/payments/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const paymentDoc = doc4(db, "payments", req.params.id);
    const summary = await runTransaction2(db, async (tx) => {
      const snap = await tx.get(paymentDoc);
      if (!snap.exists()) throw notFound("\u0633\u0646\u062F \u0627\u0644\u0642\u0628\u0636 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
      const payment = snap.data();
      const invoiceDoc = doc4(db, "invoices", payment.invoice_id);
      const invoiceSnap = await tx.get(invoiceDoc);
      if (invoiceSnap.exists()) {
        const invoice = invoiceSnap.data();
        const newPaid = Math.max(0, Number(invoice.paid_amount || 0) - Number(payment.amount || 0));
        tx.update(invoiceDoc, {
          paid_amount: newPaid,
          status: deriveStatus({ ...invoice, paid_amount: newPaid }),
          updatedAt: serverTimestamp5()
        });
      }
      tx.delete(paymentDoc);
      return `\u0625\u0631\u062C\u0627\u0639 \u062F\u0641\u0639\u0629 ${payment.amount} ${CURRENCY} \u0644\u0644\u0637\u0627\u0644\u0628 ${payment.student_name}`;
    });
    audit(req, { action: "delete", entity: "payment", entityId: req.params.id, summary });
    res.json({ success: true });
  })
);
router4.get(
  "/student/:studentId/finance",
  requireAuth,
  requireSelfOrStaff("studentId"),
  wrap(async (req, res) => {
    const studentId = req.params.studentId;
    const [invoices, payments] = await Promise.all([
      fetchAll(query5(invoicesRef, where5("student_id", "==", studentId))),
      fetchAll(query5(paymentsRef, where5("student_id", "==", studentId)))
    ]);
    const active = invoices.filter((i) => i.status !== "cancelled");
    const totalBilled = active.reduce((sum, i) => sum + netAmount(i), 0);
    const totalPaid = active.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);
    const outstanding = Math.max(0, totalBilled - totalPaid);
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const overdue = active.filter((i) => i.due_date && i.due_date < today && remainingAmount(i) > 0);
    invoices.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    payments.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    res.json({
      currency: CURRENCY,
      summary: {
        total_billed: totalBilled,
        total_paid: totalPaid,
        outstanding,
        overdue_count: overdue.length,
        overdue_amount: overdue.reduce((sum, i) => sum + remainingAmount(i), 0),
        is_clear: outstanding === 0
      },
      invoices: invoices.map((i) => ({ ...i, net_amount: netAmount(i), remaining: remainingAmount(i) })),
      payments
    });
  })
);
router4.get(
  "/admin/finance/summary",
  requireStaff,
  wrap(async (req, res) => {
    const invoices = await fetchAll(invoicesRef);
    const active = invoices.filter((i) => i.status !== "cancelled");
    const totalBilled = active.reduce((sum, i) => sum + netAmount(i), 0);
    const totalPaid = active.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const perStudent = /* @__PURE__ */ new Map();
    for (const inv of active) {
      const remaining = remainingAmount(inv);
      if (remaining <= 0) continue;
      const entry = perStudent.get(inv.student_id) || {
        name: inv.student_name,
        uid: inv.student_uid,
        remaining: 0
      };
      entry.remaining += remaining;
      perStudent.set(inv.student_id, entry);
    }
    res.json({
      currency: CURRENCY,
      total_billed: totalBilled,
      total_collected: totalPaid,
      outstanding: Math.max(0, totalBilled - totalPaid),
      invoice_count: active.length,
      paid_invoices: active.filter((i) => i.status === "paid").length,
      overdue_invoices: active.filter((i) => i.due_date && i.due_date < today && remainingAmount(i) > 0).length,
      students_with_dues: perStudent.size,
      collection_rate: totalBilled > 0 ? Math.round(totalPaid / totalBilled * 100) : 100
    });
  })
);
router4.get(
  "/admin/finance/students",
  requireStaff,
  wrap(async (req, res) => {
    const classFilter = req.query.class_id ? String(req.query.class_id) : null;
    const [students, invoices, enrollments, classes] = await Promise.all([
      fetchAll(query5(usersRef, where5("role", "==", "student"))),
      fetchAll(invoicesRef),
      fetchAll(enrollmentsRef),
      fetchAll(classesRef)
    ]);
    const classNames = new Map(classes.map((c) => [c.id, c.name]));
    const classByStudent = new Map(enrollments.map((e) => [e.student_id, e.class_id]));
    const totals = /* @__PURE__ */ new Map();
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    for (const inv of invoices) {
      if (inv.status === "cancelled") continue;
      const entry = totals.get(inv.student_id) || { billed: 0, paid: 0, overdue: 0 };
      entry.billed += netAmount(inv);
      entry.paid += Number(inv.paid_amount || 0);
      if (inv.due_date && inv.due_date < today) entry.overdue += remainingAmount(inv);
      totals.set(inv.student_id, entry);
    }
    const rows = students.filter((s) => !classFilter || classByStudent.get(s.id) === classFilter).map((s) => {
      const t = totals.get(s.id) || { billed: 0, paid: 0, overdue: 0 };
      const outstanding = Math.max(0, t.billed - t.paid);
      return {
        student_id: s.id,
        name: s.name,
        uid: s.uid,
        phone: s.phone || "",
        guardian_phone: s.guardian_phone || "",
        class_id: classByStudent.get(s.id) || null,
        class_name: classNames.get(classByStudent.get(s.id) || "") || "\u063A\u064A\u0631 \u0645\u0639\u064A\u0651\u0646",
        total_billed: t.billed,
        total_paid: t.paid,
        outstanding,
        overdue_amount: t.overdue,
        payment_status: outstanding === 0 ? t.billed > 0 ? "\u0645\u0633\u062F\u062F" : "\u0644\u0627 \u062A\u0648\u062C\u062F \u0631\u0633\u0648\u0645" : t.overdue > 0 ? "\u0645\u062A\u0623\u062E\u0631" : "\u0639\u0644\u064A\u0647 \u0645\u0633\u062A\u062D\u0642\u0627\u062A",
        is_clear: outstanding === 0
      };
    });
    rows.sort((a, b) => b.outstanding - a.outstanding);
    res.json({ currency: CURRENCY, students: rows });
  })
);
var payments_routes_default = router4;

// backend/routes/classes.routes.ts
var router5 = Router5();
var BATCH_LIMIT3 = 450;
var CLASSES_TTL_MS = 6e4;
router5.get(
  "/classes",
  wrap(async (_req, res) => {
    const classes = await cached(
      "classes:all",
      CLASSES_TTL_MS,
      () => fetchAll(classesRef)
    );
    res.json(classes);
  })
);
router5.post(
  "/admin/classes",
  requireAdmin,
  wrap(async (req, res) => {
    const name = str(req.body?.name, "\u0627\u0633\u0645 \u0627\u0644\u0635\u0641", { min: 2, max: 120 });
    const teachers = Array.isArray(req.body?.teachers) ? req.body.teachers : [];
    if (teachers.length === 0) throw badRequest("\u064A\u062C\u0628 \u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0639\u0644\u0645 \u0648\u0627\u062D\u062F \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644");
    const created = await addDoc5(classesRef, {
      name,
      teacher_ids: teachers.map((t) => String(t.id)),
      teacher_names: teachers.map((t) => String(t.name || "\u0645\u0639\u0644\u0645")),
      capacity: num(req.body?.capacity, "\u0627\u0644\u0633\u0639\u0629", { min: 0, max: 500, optional: true }),
      createdAt: serverTimestamp6()
    });
    invalidate("classes");
    audit(req, { action: "create", entity: "class", entityId: created.id, summary: `\u0625\u0636\u0627\u0641\u0629 \u0635\u0641 ${name}` });
    res.status(201).json({ success: true, id: created.id });
  })
);
router5.put(
  "/admin/classes/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const target = doc5(db, "classes", req.params.id);
    const snap = await getDoc4(target);
    if (!snap.exists()) throw notFound("\u0627\u0644\u0635\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const patch = {};
    if (req.body?.name !== void 0) patch.name = str(req.body.name, "\u0627\u0633\u0645 \u0627\u0644\u0635\u0641", { min: 2, max: 120 });
    if (req.body?.capacity !== void 0) {
      patch.capacity = num(req.body.capacity, "\u0627\u0644\u0633\u0639\u0629", { min: 0, max: 500, optional: true });
    }
    if (req.body?.teachers !== void 0) {
      const teachers = Array.isArray(req.body.teachers) ? req.body.teachers : [];
      patch.teacher_ids = teachers.map((t) => String(t.id));
      patch.teacher_names = teachers.map((t) => String(t.name || "\u0645\u0639\u0644\u0645"));
    }
    if (Object.keys(patch).length === 0) throw badRequest("\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u0644\u0644\u062A\u062D\u062F\u064A\u062B");
    patch.updatedAt = serverTimestamp6();
    await updateDoc5(target, patch);
    invalidate("classes");
    audit(req, {
      action: "update",
      entity: "class",
      entityId: snap.id,
      summary: `\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0635\u0641 ${snap.data().name}`,
      meta: patch
    });
    res.json({ success: true });
  })
);
router5.delete(
  "/admin/classes/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const classId = req.params.id;
    const snap = await getDoc4(doc5(db, "classes", classId));
    if (!snap.exists()) throw notFound("\u0627\u0644\u0635\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const [enrollments, schedules] = await Promise.all([
      getDocs6(query6(enrollmentsRef, where6("class_id", "==", classId))),
      getDocs6(query6(schedulesRef, where6("class_id", "==", classId)))
    ]);
    const refs = [...enrollments.docs, ...schedules.docs].map((d) => d.ref);
    for (const group of chunk(refs, BATCH_LIMIT3)) {
      const batch = writeBatch3(db);
      group.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    await deleteDoc2(doc5(db, "classes", classId));
    invalidate("classes");
    audit(req, {
      action: "delete",
      entity: "class",
      entityId: classId,
      summary: `\u062D\u0630\u0641 \u0627\u0644\u0635\u0641 ${snap.data().name} \u0648${refs.length} \u0633\u062C\u0644 \u0645\u0631\u062A\u0628\u0637`
    });
    res.json({ success: true });
  })
);
router5.get(
  "/class/:classId/students",
  requireAuth,
  wrap(async (req, res) => {
    const classId = req.params.classId;
    const enrollments = await fetchAll(
      query6(enrollmentsRef, where6("class_id", "==", classId))
    );
    const studentIds = [...new Set(enrollments.map((e) => e.student_id))];
    if (studentIds.length === 0) return res.json([]);
    const [students, absences, invoices] = await Promise.all([
      getDocsByIds(usersRef, studentIds),
      fetchAll(
        query6(attendanceRef, where6("class_id", "==", classId), where6("status", "==", "absent"))
      ),
      fetchAll(query6(invoicesRef, where6("class_id", "==", classId)))
    ]);
    const absenceCount = /* @__PURE__ */ new Map();
    for (const record of absences) {
      absenceCount.set(record.student_id, (absenceCount.get(record.student_id) || 0) + 1);
    }
    const dues = /* @__PURE__ */ new Map();
    for (const inv of invoices) {
      if (inv.status === "cancelled") continue;
      dues.set(inv.student_id, (dues.get(inv.student_id) || 0) + remainingAmount(inv));
    }
    const roster = studentIds.map((id) => students.get(id)).filter(Boolean).map((s) => ({
      id: s.id,
      name: s.name,
      uid: s.uid,
      phone: s.phone || "",
      guardian_phone: s.guardian_phone || "",
      absences: absenceCount.get(s.id) || 0,
      outstanding: dues.get(s.id) || 0,
      is_clear: (dues.get(s.id) || 0) === 0
    }));
    roster.sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));
    res.json(roster);
  })
);
router5.get(
  "/teacher/classes/:teacherId",
  requireAuth,
  wrap(async (req, res) => {
    const teacherId = req.params.teacherId;
    if (req.user.role === "teacher" && req.user.id !== teacherId) {
      throw badRequest("\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0639\u0631\u0636 \u0635\u0641\u0648\u0641 \u0645\u0639\u0644\u0645 \u0622\u062E\u0631");
    }
    const [byArray, bySingle] = await Promise.all([
      fetchAll(query6(classesRef, where6("teacher_ids", "array-contains", teacherId))),
      fetchAll(query6(classesRef, where6("teacher_id", "==", teacherId)))
    ]);
    const merged = /* @__PURE__ */ new Map();
    [...byArray, ...bySingle].forEach((c) => merged.set(c.id, c));
    res.json([...merged.values()]);
  })
);
router5.get(
  "/student/classes/:studentId",
  requireAuth,
  wrap(async (req, res) => {
    const studentId = req.params.studentId;
    if (req.user.role === "student" && req.user.id !== studentId) {
      throw badRequest("\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0639\u0631\u0636 \u0635\u0641\u0648\u0641 \u0637\u0627\u0644\u0628 \u0622\u062E\u0631");
    }
    const enrollments = await fetchAll(
      query6(enrollmentsRef, where6("student_id", "==", studentId))
    );
    const classIds = [...new Set(enrollments.map((e) => e.class_id))];
    if (classIds.length === 0) return res.json([]);
    const classes = await getDocsByIds(classesRef, classIds);
    res.json(classIds.map((id) => classes.get(id)).filter(Boolean));
  })
);
router5.post(
  "/admin/enroll",
  requireStaff,
  wrap(async (req, res) => {
    const studentId = str(req.body?.student_id, "\u0627\u0644\u0637\u0627\u0644\u0628", { max: 64 });
    const classId = str(req.body?.class_id, "\u0627\u0644\u0635\u0641", { max: 64 });
    const [studentSnap, classSnap] = await Promise.all([
      getDoc4(doc5(db, "users", studentId)),
      getDoc4(doc5(db, "classes", classId))
    ]);
    if (!studentSnap.exists()) throw notFound("\u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    if (!classSnap.exists()) throw notFound("\u0627\u0644\u0635\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const existing = await getDocs6(query6(enrollmentsRef, where6("student_id", "==", studentId)));
    const batch = writeBatch3(db);
    existing.forEach((d) => batch.delete(d.ref));
    batch.set(doc5(enrollmentsRef), { student_id: studentId, class_id: classId, createdAt: serverTimestamp6() });
    await batch.commit();
    audit(req, {
      action: "enroll",
      entity: "enrollment",
      entityId: studentId,
      summary: `\u0646\u0642\u0644 \u0627\u0644\u0637\u0627\u0644\u0628 ${studentSnap.data().name} \u0625\u0644\u0649 ${classSnap.data().name}`
    });
    res.json({ success: true });
  })
);
var classes_routes_default = router5;

// backend/routes/attendance.routes.ts
import { Router as Router6 } from "express";
import { doc as doc6, getDoc as getDoc5, getDocs as getDocs7, query as query7, serverTimestamp as serverTimestamp7, where as where7, writeBatch as writeBatch4 } from "firebase/firestore";
var router6 = Router6();
var BATCH_LIMIT4 = 450;
var STATUSES2 = ["present", "absent", "late", "excused"];
var STATUS_LABEL = {
  present: "\u062D\u0627\u0636\u0631",
  absent: "\u063A\u0627\u0626\u0628",
  late: "\u0645\u062A\u0623\u062E\u0631",
  excused: "\u063A\u064A\u0627\u0628 \u0628\u0639\u0630\u0631"
};
router6.post(
  "/attendance",
  requireAuth,
  requireRole("teacher", "admin", "assistant_admin"),
  wrap(async (req, res) => {
    const classId = str(req.body?.classId, "\u0627\u0644\u0635\u0641", { max: 64 });
    const date = isoDate(req.body?.date, "\u0627\u0644\u062A\u0627\u0631\u064A\u062E");
    const rows = Array.isArray(req.body?.attendanceData) ? req.body.attendanceData : [];
    if (rows.length === 0) throw badRequest("\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u062D\u0636\u0648\u0631 \u0644\u0644\u062A\u0633\u062C\u064A\u0644");
    if (rows.length > 500) throw badRequest("\u0639\u062F\u062F \u0627\u0644\u0637\u0644\u0627\u0628 \u0643\u0628\u064A\u0631 \u062C\u062F\u0627\u064B \u0641\u064A \u0637\u0644\u0628 \u0648\u0627\u062D\u062F");
    if (date > (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) {
      throw badRequest("\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062D\u0636\u0648\u0631 \u0644\u062A\u0627\u0631\u064A\u062E \u0645\u0633\u062A\u0642\u0628\u0644\u064A");
    }
    const classSnap = await getDoc5(doc6(db, "classes", classId));
    if (!classSnap.exists()) throw notFound("\u0627\u0644\u0635\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const className = classSnap.data().name;
    const entries = rows.map((row) => ({
      studentId: str(row?.studentId, "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0637\u0627\u0644\u0628", { max: 64 }),
      status: oneOf(row?.status, "\u062D\u0627\u0644\u0629 \u0627\u0644\u062D\u0636\u0648\u0631", STATUSES2),
      note: str(row?.note, "\u0645\u0644\u0627\u062D\u0638\u0629", { max: 200, optional: true })
    }));
    const existing = await getDocs7(
      query7(attendanceRef, where7("class_id", "==", classId), where7("date", "==", date))
    );
    const staleRefs = existing.docs.map((d) => d.ref);
    for (const group of chunk(staleRefs, BATCH_LIMIT4)) {
      const batch = writeBatch4(db);
      group.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    for (const group of chunk(entries, Math.floor(BATCH_LIMIT4 / 2))) {
      const batch = writeBatch4(db);
      for (const entry of group) {
        batch.set(doc6(attendanceRef), {
          student_id: entry.studentId,
          class_id: classId,
          class_name: className,
          date,
          status: entry.status,
          note: entry.note,
          recorded_by: req.user.id,
          recorded_by_name: req.user.name,
          createdAt: serverTimestamp7()
        });
        if (entry.status === "absent" || entry.status === "late") {
          batch.set(doc6(notificationsRef), {
            user_id: entry.studentId,
            title: entry.status === "absent" ? "\u062A\u0646\u0628\u064A\u0647 \u063A\u064A\u0627\u0628" : "\u062A\u0646\u0628\u064A\u0647 \u062A\u0623\u062E\u0631",
            message: `\u062A\u0645 \u062A\u0633\u062C\u064A\u0644\u0643 ${STATUS_LABEL[entry.status]} \u0641\u064A ${className} \u0628\u062A\u0627\u0631\u064A\u062E ${date}`,
            type: "absence",
            isRead: false,
            createdAt: serverTimestamp7()
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
      summary: `\u062A\u0633\u062C\u064A\u0644 \u062D\u0636\u0648\u0631 ${className} \u0628\u062A\u0627\u0631\u064A\u062E ${date} (${absentCount} \u063A\u0627\u0626\u0628 \u0645\u0646 ${entries.length})`,
      meta: { date, replaced: staleRefs.length }
    });
    res.json({ success: true, recorded: entries.length, replaced: staleRefs.length });
  })
);
router6.get(
  "/class/:classId/attendance",
  requireAuth,
  wrap(async (req, res) => {
    const date = isoDate(req.query.date, "\u0627\u0644\u062A\u0627\u0631\u064A\u062E");
    const rows = await fetchAll(
      query7(attendanceRef, where7("class_id", "==", req.params.classId), where7("date", "==", date))
    );
    res.json(rows);
  })
);
router6.get(
  "/student/:studentId/attendance",
  requireAuth,
  requireSelfOrStaff("studentId"),
  wrap(async (req, res) => {
    const rows = await fetchAll(
      query7(attendanceRef, where7("student_id", "==", req.params.studentId))
    );
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    res.json(rows);
  })
);
router6.get(
  "/admin/absences/daily",
  requireAuth,
  requireRole("admin", "assistant_admin", "teacher"),
  wrap(async (req, res) => {
    const date = req.query.date ? isoDate(req.query.date, "\u0627\u0644\u062A\u0627\u0631\u064A\u062E") : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const records = await fetchAll(
      query7(attendanceRef, where7("date", "==", date), where7("status", "==", "absent"))
    );
    if (records.length === 0) return res.json([]);
    const [students, classes] = await Promise.all([
      getDocsByIds(usersRef, records.map((r) => r.student_id)),
      getDocsByIds(classesRef, records.map((r) => r.class_id))
    ]);
    res.json(
      records.map((r) => {
        const student = students.get(r.student_id);
        const klass = classes.get(r.class_id);
        return {
          id: r.id,
          studentId: r.student_id,
          studentName: student?.name || "\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
          studentUid: student?.uid || "N/A",
          guardianPhone: student?.guardian_phone || "",
          className: klass?.name || r.class_name || "\u0635\u0641 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
          date: r.date,
          time: r.createdAt?.toDate?.() || null
        };
      })
    );
  })
);
var attendance_routes_default = router6;

// backend/routes/grades.routes.ts
import { Router as Router7 } from "express";
import {
  addDoc as addDoc6,
  deleteDoc as deleteDoc3,
  doc as doc7,
  getDoc as getDoc6,
  query as query8,
  serverTimestamp as serverTimestamp8,
  updateDoc as updateDoc6,
  where as where8
} from "firebase/firestore";
var router7 = Router7();
var CATEGORIES2 = ["\u064A\u0648\u0645\u064A", "\u0634\u0647\u0631\u064A", "\u0648\u0627\u062C\u0628", "\u0645\u0634\u0627\u0631\u0643\u0629", "\u0646\u0635\u0641 \u0627\u0644\u0641\u0635\u0644", "\u0646\u0647\u0627\u0626\u064A", "\u0627\u0645\u062A\u062D\u0627\u0646"];
var SEMESTERS = ["\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u0623\u0648\u0644", "\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062B\u0627\u0646\u064A", "\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062B\u0627\u0644\u062B"];
async function assertMaySetGrade(req, subject) {
  const role = req.user.role;
  if (role === "admin") return;
  if (role !== "teacher") throw forbidden("\u0631\u0635\u062F \u0627\u0644\u062F\u0631\u062C\u0627\u062A \u0645\u0642\u062A\u0635\u0631 \u0639\u0644\u0649 \u0627\u0644\u0645\u062F\u064A\u0631 \u0648\u0627\u0644\u0645\u0639\u0644\u0645\u064A\u0646");
  const teacherSnap = await getDoc6(doc7(db, "users", req.user.id));
  const subjects = teacherSnap.exists() ? teacherSnap.data().subjects || [] : [];
  if (!subjects.includes(subject)) {
    throw forbidden(`\u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0644\u0643 \u0628\u0625\u062F\u0627\u0631\u0629 \u062F\u0631\u062C\u0627\u062A \u0645\u0627\u062F\u0629 "${subject}"`);
  }
}
router7.get(
  "/class/:classId/grades",
  requireAuth,
  wrap(async (req, res) => {
    const rows = await fetchAll(
      query8(gradesRef, where8("class_id", "==", req.params.classId))
    );
    rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    res.json(rows);
  })
);
router7.get(
  "/class/grades/student/:studentId",
  requireAuth,
  requireSelfOrStaff("studentId"),
  wrap(async (req, res) => {
    const rows = await fetchAll(
      query8(gradesRef, where8("student_id", "==", req.params.studentId))
    );
    rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    res.json(rows);
  })
);
router7.post(
  "/grades",
  requireAuth,
  requireRole("teacher", "admin"),
  wrap(async (req, res) => {
    const b = req.body || {};
    const subject = str(b.subject, "\u0627\u0644\u0645\u0627\u062F\u0629", { max: 80 });
    await assertMaySetGrade(req, subject);
    const total = num(b.total, "\u0627\u0644\u062F\u0631\u062C\u0629 \u0627\u0644\u0643\u0644\u064A\u0629", { min: 1, max: 1e4 });
    const score = num(b.score, "\u0627\u0644\u062F\u0631\u062C\u0629", { min: 0, max: total });
    const studentId = str(b.student_id, "\u0627\u0644\u0637\u0627\u0644\u0628", { max: 64 });
    const studentSnap = await getDoc6(doc7(db, "users", studentId));
    if (!studentSnap.exists()) throw notFound("\u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const created = await addDoc6(gradesRef, {
      student_id: studentId,
      student_name: studentSnap.data().name,
      class_id: str(b.class_id, "\u0627\u0644\u0635\u0641", { max: 64 }),
      subject,
      score,
      total,
      percentage: Math.round(score / total * 100),
      status: str(b.status, "\u0627\u0644\u062D\u0627\u0644\u0629", { max: 40, optional: true }),
      category: oneOf(b.category, "\u0646\u0648\u0639 \u0627\u0644\u062A\u0642\u064A\u064A\u0645", CATEGORIES2, "\u064A\u0648\u0645\u064A"),
      semester: oneOf(b.semester, "\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062F\u0631\u0627\u0633\u064A", SEMESTERS, "\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u0623\u0648\u0644"),
      recorded_by: req.user.id,
      recorded_by_name: req.user.name,
      createdAt: serverTimestamp8()
    });
    await addDoc6(notificationsRef, {
      user_id: studentId,
      title: "\u062F\u0631\u062C\u0629 \u062C\u062F\u064A\u062F\u0629",
      message: `\u062A\u0645 \u0631\u0635\u062F \u062F\u0631\u062C\u0629 ${score}/${total} \u0641\u064A \u0645\u0627\u062F\u0629 ${subject}`,
      type: "grade",
      isRead: false,
      createdAt: serverTimestamp8()
    });
    audit(req, {
      action: "create",
      entity: "grade",
      entityId: created.id,
      summary: `\u0631\u0635\u062F ${score}/${total} \u0641\u064A ${subject} \u0644\u0644\u0637\u0627\u0644\u0628 ${studentSnap.data().name}`
    });
    res.status(201).json({ success: true, id: created.id });
  })
);
router7.put(
  "/grades/:id",
  requireAuth,
  requireRole("teacher", "admin"),
  wrap(async (req, res) => {
    const target = doc7(db, "grades", req.params.id);
    const snap = await getDoc6(target);
    if (!snap.exists()) throw notFound("\u0627\u0644\u062F\u0631\u062C\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
    const current = snap.data();
    await assertMaySetGrade(req, current.subject);
    const b = req.body || {};
    const subject = b.subject !== void 0 ? str(b.subject, "\u0627\u0644\u0645\u0627\u062F\u0629", { max: 80 }) : current.subject;
    if (subject !== current.subject) await assertMaySetGrade(req, subject);
    const total = b.total !== void 0 ? num(b.total, "\u0627\u0644\u062F\u0631\u062C\u0629 \u0627\u0644\u0643\u0644\u064A\u0629", { min: 1, max: 1e4 }) : current.total;
    const score = b.score !== void 0 ? num(b.score, "\u0627\u0644\u062F\u0631\u062C\u0629", { min: 0, max: total }) : current.score;
    await updateDoc6(target, {
      subject,
      score,
      total,
      percentage: Math.round(score / total * 100),
      status: b.status !== void 0 ? str(b.status, "\u0627\u0644\u062D\u0627\u0644\u0629", { max: 40, optional: true }) : current.status,
      category: b.category !== void 0 ? oneOf(b.category, "\u0646\u0648\u0639 \u0627\u0644\u062A\u0642\u064A\u064A\u0645", CATEGORIES2) : current.category,
      semester: b.semester !== void 0 ? oneOf(b.semester, "\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062F\u0631\u0627\u0633\u064A", SEMESTERS) : current.semester,
      updated_by: req.user.id,
      updatedAt: serverTimestamp8()
    });
    audit(req, {
      action: "update",
      entity: "grade",
      entityId: snap.id,
      summary: `\u062A\u0639\u062F\u064A\u0644 \u062F\u0631\u062C\u0629 ${current.subject} \u0644\u0644\u0637\u0627\u0644\u0628 ${current.student_name || current.student_id} \u0625\u0644\u0649 ${score}/${total}`
    });
    res.json({ success: true });
  })
);
router7.delete(
  "/grades/:id",
  requireAuth,
  requireRole("teacher", "admin"),
  wrap(async (req, res) => {
    const target = doc7(db, "grades", req.params.id);
    const snap = await getDoc6(target);
    if (!snap.exists()) throw notFound("\u0627\u0644\u062F\u0631\u062C\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
    const current = snap.data();
    await assertMaySetGrade(req, current.subject);
    await deleteDoc3(target);
    audit(req, {
      action: "delete",
      entity: "grade",
      entityId: snap.id,
      summary: `\u062D\u0630\u0641 \u062F\u0631\u062C\u0629 ${current.subject} (${current.score}/${current.total}) \u0644\u0644\u0637\u0627\u0644\u0628 ${current.student_name || current.student_id}`
    });
    res.json({ success: true });
  })
);
var grades_routes_default = router7;

// backend/routes/notifications.routes.ts
import { Router as Router8 } from "express";
import {
  doc as doc8,
  getDoc as getDoc7,
  getDocs as getDocs9,
  limit as fsLimit3,
  orderBy as orderBy2,
  query as query9,
  updateDoc as updateDoc7,
  where as where9,
  writeBatch as writeBatch5
} from "firebase/firestore";
var router8 = Router8();
var BATCH_LIMIT5 = 450;
router8.get(
  "/notifications/:userId",
  requireAuth,
  wrap(async (req, res) => {
    if (req.user.id !== req.params.userId) throw forbidden("\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0639\u0631\u0636 \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0645\u0633\u062A\u062E\u062F\u0645 \u0622\u062E\u0631");
    const max = num(req.query.limit, "\u0627\u0644\u062D\u062F", { min: 1, max: 100, optional: true, default: 20 });
    const rows = await fetchIndexed(
      query9(
        notificationsRef,
        where9("user_id", "==", req.params.userId),
        orderBy2("createdAt", "desc"),
        fsLimit3(max)
      ),
      async () => {
        const all = await fetchAll(
          query9(notificationsRef, where9("user_id", "==", req.params.userId))
        );
        all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        return all.slice(0, max);
      },
      "notifications by user, newest first"
    );
    res.json(rows);
  })
);
router8.post(
  "/notifications/read/:id",
  requireAuth,
  wrap(async (req, res) => {
    const target = doc8(db, "notifications", req.params.id);
    const snap = await getDoc7(target);
    if (!snap.exists()) throw notFound("\u0627\u0644\u0625\u0634\u0639\u0627\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    if (snap.data().user_id !== req.user.id) throw forbidden("\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u062A\u0639\u062F\u064A\u0644 \u0625\u0634\u0639\u0627\u0631 \u0645\u0633\u062A\u062E\u062F\u0645 \u0622\u062E\u0631");
    await updateDoc7(target, { isRead: true });
    res.json({ success: true });
  })
);
router8.post(
  "/notifications/read-all",
  requireAuth,
  wrap(async (req, res) => {
    const unread = await getDocs9(
      query9(notificationsRef, where9("user_id", "==", req.user.id), where9("isRead", "==", false))
    );
    const refs = unread.docs.map((d) => d.ref);
    for (const group of chunk(refs, BATCH_LIMIT5)) {
      const batch = writeBatch5(db);
      group.forEach((ref) => batch.update(ref, { isRead: true }));
      await batch.commit();
    }
    res.json({ success: true, count: refs.length });
  })
);
var notifications_routes_default = router8;

// backend/routes/catalog.routes.ts
import { Router as Router9 } from "express";
import { addDoc as addDoc7, deleteDoc as deleteDoc4, doc as doc9, getDoc as getDoc8, query as query10, serverTimestamp as serverTimestamp9, where as where10 } from "firebase/firestore";
var router9 = Router9();
var SUBJECT_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-rose-500",
  "bg-purple-500",
  "bg-indigo-500",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-teal-500"
];
var DAYS = ["\u0627\u0644\u0623\u062D\u062F", "\u0627\u0644\u0625\u062B\u0646\u064A\u0646", "\u0627\u0644\u0627\u062B\u0646\u064A\u0646", "\u0627\u0644\u062B\u0644\u0627\u062B\u0627\u0621", "\u0627\u0644\u0623\u0631\u0628\u0639\u0627\u0621", "\u0627\u0644\u062E\u0645\u064A\u0633", "\u0627\u0644\u0633\u0628\u062A"];
router9.get(
  "/subjects",
  wrap(async (_req, res) => {
    const subjects = await cached("subjects:all", 3e5, () => fetchAll(subjectsRef));
    res.json(subjects);
  })
);
router9.post(
  "/admin/subjects",
  requireStaff,
  wrap(async (req, res) => {
    const name = str(req.body?.name, "\u0627\u0633\u0645 \u0627\u0644\u0645\u0627\u062F\u0629", { min: 2, max: 80 });
    const existing = await fetchAll(subjectsRef);
    if (existing.some((s) => s.name === name)) throw badRequest("\u0647\u0630\u0647 \u0627\u0644\u0645\u0627\u062F\u0629 \u0645\u0636\u0627\u0641\u0629 \u0628\u0627\u0644\u0641\u0639\u0644");
    const created = await addDoc7(subjectsRef, {
      name,
      color: SUBJECT_COLORS[existing.length % SUBJECT_COLORS.length],
      createdAt: serverTimestamp9()
    });
    invalidate("subjects");
    audit(req, { action: "create", entity: "subject", entityId: created.id, summary: `\u0625\u0636\u0627\u0641\u0629 \u0645\u0627\u062F\u0629 ${name}` });
    res.status(201).json({ success: true, id: created.id });
  })
);
router9.delete(
  "/admin/subjects/:id",
  requireStaff,
  wrap(async (req, res) => {
    const snap = await getDoc8(doc9(db, "subjects", req.params.id));
    if (!snap.exists()) throw notFound("\u0627\u0644\u0645\u0627\u062F\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
    await deleteDoc4(doc9(db, "subjects", req.params.id));
    invalidate("subjects");
    audit(req, {
      action: "delete",
      entity: "subject",
      entityId: req.params.id,
      summary: `\u062D\u0630\u0641 \u0645\u0627\u062F\u0629 ${snap.data().name}`
    });
    res.json({ success: true });
  })
);
router9.get(
  "/schedules/:classId",
  requireAuth,
  wrap(async (req, res) => {
    const rows = await fetchAll(
      query10(schedulesRef, where10("class_id", "==", req.params.classId))
    );
    const order = new Map(DAYS.map((d, i) => [d, i]));
    rows.sort((a, b) => {
      const dayDiff = (order.get(a.day) ?? 99) - (order.get(b.day) ?? 99);
      return dayDiff !== 0 ? dayDiff : String(a.time).localeCompare(String(b.time));
    });
    res.json(rows);
  })
);
router9.post(
  "/admin/schedules",
  requireStaff,
  wrap(async (req, res) => {
    const classId = str(req.body?.class_id, "\u0627\u0644\u0635\u0641", { max: 64 });
    const day = oneOf(req.body?.day, "\u0627\u0644\u064A\u0648\u0645", DAYS);
    const time = str(req.body?.time, "\u0627\u0644\u0648\u0642\u062A", { max: 40 });
    const subject = str(req.body?.subject, "\u0627\u0644\u0645\u0627\u062F\u0629", { max: 80 });
    const classSnap = await getDoc8(doc9(db, "classes", classId));
    if (!classSnap.exists()) throw notFound("\u0627\u0644\u0635\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const sameSlot = await fetchAll(
      query10(schedulesRef, where10("class_id", "==", classId), where10("day", "==", day), where10("time", "==", time))
    );
    if (sameSlot.length > 0) throw badRequest("\u064A\u0648\u062C\u062F \u062F\u0631\u0633 \u0645\u0633\u062C\u0644 \u0628\u0627\u0644\u0641\u0639\u0644 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u064A\u0648\u0645 \u0648\u0627\u0644\u0648\u0642\u062A \u0644\u0647\u0630\u0627 \u0627\u0644\u0635\u0641");
    const created = await addDoc7(schedulesRef, {
      class_id: classId,
      class_name: classSnap.data().name,
      day,
      time,
      subject,
      teacher: str(req.body?.teacher, "\u0627\u0644\u0645\u0639\u0644\u0645", { max: 120, optional: true }),
      room: str(req.body?.room, "\u0627\u0644\u0642\u0627\u0639\u0629", { max: 60, optional: true }),
      createdAt: serverTimestamp9()
    });
    audit(req, {
      action: "create",
      entity: "schedule",
      entityId: created.id,
      summary: `\u0625\u0636\u0627\u0641\u0629 \u062D\u0635\u0629 ${subject} \u064A\u0648\u0645 ${day} ${time} \u0625\u0644\u0649 ${classSnap.data().name}`
    });
    res.status(201).json({ success: true, id: created.id });
  })
);
router9.delete(
  "/admin/schedules/:id",
  requireStaff,
  wrap(async (req, res) => {
    const snap = await getDoc8(doc9(db, "schedules", req.params.id));
    if (!snap.exists()) throw notFound("\u0627\u0644\u062D\u0635\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
    await deleteDoc4(doc9(db, "schedules", req.params.id));
    audit(req, {
      action: "delete",
      entity: "schedule",
      entityId: req.params.id,
      summary: `\u062D\u0630\u0641 \u062D\u0635\u0629 ${snap.data().subject} \u0645\u0646 \u0627\u0644\u062C\u062F\u0648\u0644`
    });
    res.json({ success: true });
  })
);
var catalog_routes_default = router9;

// backend/routes/behavior.routes.ts
import { Router as Router10 } from "express";
import { addDoc as addDoc8, deleteDoc as deleteDoc5, doc as doc10, getDoc as getDoc9, query as query11, serverTimestamp as serverTimestamp10, where as where11 } from "firebase/firestore";
var router10 = Router10();
var TYPES = ["positive", "negative"];
var CATEGORIES3 = [
  "\u062A\u0641\u0648\u0642 \u062F\u0631\u0627\u0633\u064A",
  "\u0645\u0634\u0627\u0631\u0643\u0629 \u0641\u0639\u0627\u0644\u0629",
  "\u0645\u0633\u0627\u0639\u062F\u0629 \u0627\u0644\u0632\u0645\u0644\u0627\u0621",
  "\u0627\u0644\u062A\u0632\u0627\u0645 \u0628\u0627\u0644\u0632\u064A",
  "\u062A\u0623\u062E\u0631 \u0645\u062A\u0643\u0631\u0631",
  "\u0625\u0632\u0639\u0627\u062C \u062F\u0627\u062E\u0644 \u0627\u0644\u0635\u0641",
  "\u0639\u062F\u0645 \u0623\u062F\u0627\u0621 \u0627\u0644\u0648\u0627\u062C\u0628\u0627\u062A",
  "\u0645\u062E\u0627\u0644\u0641\u0629 \u0633\u0644\u0648\u0643\u064A\u0629",
  "\u0623\u062E\u0631\u0649"
];
router10.post(
  "/behavior",
  requireAuth,
  requireRole("teacher", "admin", "assistant_admin"),
  wrap(async (req, res) => {
    const studentId = str(req.body?.student_id, "\u0627\u0644\u0637\u0627\u0644\u0628", { max: 64 });
    const type = oneOf(req.body?.type, "\u0646\u0648\u0639 \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0629", TYPES);
    const category = oneOf(req.body?.category, "\u0627\u0644\u062A\u0635\u0646\u064A\u0641", CATEGORIES3, "\u0623\u062E\u0631\u0649");
    const title = str(req.body?.title, "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0629", { min: 2, max: 120 });
    const description = str(req.body?.description, "\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644", { max: 800, optional: true });
    const points = num(req.body?.points, "\u0627\u0644\u0646\u0642\u0627\u0637", { min: 0, max: 100, optional: true, default: 5 });
    const date = isoDate(req.body?.date, "\u0627\u0644\u062A\u0627\u0631\u064A\u062E", { optional: true }) || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const notifyStudent = boolean(req.body?.notify_student, true);
    const studentSnap = await getDoc9(doc10(db, "users", studentId));
    if (!studentSnap.exists()) throw notFound("\u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const student = studentSnap.data();
    const created = await addDoc8(behaviorRef, {
      student_id: studentId,
      student_name: student.name,
      student_uid: student.uid,
      class_id: str(req.body?.class_id, "\u0627\u0644\u0635\u0641", { max: 64, optional: true }) || null,
      type,
      category,
      title,
      description,
      points: type === "positive" ? points : -points,
      date,
      guardian_phone: student.guardian_phone || "",
      created_by: req.user.id,
      created_by_name: req.user.name,
      createdAt: serverTimestamp10()
    });
    if (notifyStudent) {
      await addDoc8(notificationsRef, {
        user_id: studentId,
        title: type === "positive" ? "\u0645\u0644\u0627\u062D\u0638\u0629 \u0625\u064A\u062C\u0627\u0628\u064A\u0629 \u{1F31F}" : "\u0645\u0644\u0627\u062D\u0638\u0629 \u0633\u0644\u0648\u0643\u064A\u0629",
        message: `${title}${description ? ` \u2014 ${description}` : ""}`,
        type: "behavior",
        isRead: false,
        createdAt: serverTimestamp10()
      });
    }
    audit(req, {
      action: "create",
      entity: "behavior_note",
      entityId: created.id,
      summary: `${type === "positive" ? "\u0645\u0644\u0627\u062D\u0638\u0629 \u0625\u064A\u062C\u0627\u0628\u064A\u0629" : "\u0645\u0644\u0627\u062D\u0638\u0629 \u0633\u0644\u0648\u0643\u064A\u0629"} \u0644\u0644\u0637\u0627\u0644\u0628 ${student.name}: ${title}`
    });
    res.status(201).json({ success: true, id: created.id });
  })
);
router10.get(
  "/student/:studentId/behavior",
  requireAuth,
  requireSelfOrStaff("studentId"),
  wrap(async (req, res) => {
    const rows = await fetchAll(
      query11(behaviorRef, where11("student_id", "==", req.params.studentId))
    );
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const score = rows.reduce((sum, r) => sum + Number(r.points || 0), 0);
    res.json({
      notes: rows,
      summary: {
        positive: rows.filter((r) => r.type === "positive").length,
        negative: rows.filter((r) => r.type === "negative").length,
        // 100 is the neutral starting point, clamped to a 0–100 display range.
        conduct_score: Math.max(0, Math.min(100, 100 + score))
      }
    });
  })
);
router10.get(
  "/class/:classId/behavior",
  requireAuth,
  requireRole("teacher", "admin", "assistant_admin"),
  wrap(async (req, res) => {
    const rows = await fetchAll(
      query11(behaviorRef, where11("class_id", "==", req.params.classId))
    );
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    res.json(rows);
  })
);
router10.delete(
  "/behavior/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const snap = await getDoc9(doc10(db, "behavior_notes", req.params.id));
    if (!snap.exists()) throw notFound("\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
    await deleteDoc5(doc10(db, "behavior_notes", req.params.id));
    audit(req, {
      action: "delete",
      entity: "behavior_note",
      entityId: req.params.id,
      summary: `\u062D\u0630\u0641 \u0645\u0644\u0627\u062D\u0638\u0629 "${snap.data().title}" \u0639\u0646 ${snap.data().student_name}`
    });
    res.json({ success: true });
  })
);
var behavior_routes_default = router10;

// backend/routes/reports.routes.ts
import { Router as Router11 } from "express";
import { doc as doc11, getDoc as getDoc10, query as query12, where as where12 } from "firebase/firestore";
var router11 = Router11();
function attendanceStats(records) {
  const total = records.length;
  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const late = records.filter((r) => r.status === "late").length;
  const excused = records.filter((r) => r.status === "excused").length;
  return {
    total,
    present,
    absent,
    late,
    excused,
    rate: total > 0 ? Math.round((present + late) / total * 100) : 100
  };
}
function gradeStats(grades) {
  const bySubject = /* @__PURE__ */ new Map();
  let earned = 0;
  let possible = 0;
  for (const g of grades) {
    const s = Number(g.score || 0);
    const t = Number(g.total || 0);
    if (t <= 0) continue;
    earned += s;
    possible += t;
    const entry = bySubject.get(g.subject) || { earned: 0, possible: 0, count: 0 };
    entry.earned += s;
    entry.possible += t;
    entry.count++;
    bySubject.set(g.subject, entry);
  }
  return {
    overall_percentage: possible > 0 ? Math.round(earned / possible * 100) : null,
    subjects: [...bySubject.entries()].map(([subject, s]) => ({
      subject,
      count: s.count,
      percentage: s.possible > 0 ? Math.round(s.earned / s.possible * 100) : 0,
      earned: s.earned,
      possible: s.possible
    })).sort((a, b) => b.percentage - a.percentage)
  };
}
router11.get(
  "/reports/student/:studentId",
  requireAuth,
  requireSelfOrStaff("studentId"),
  wrap(async (req, res) => {
    const studentId = req.params.studentId;
    const studentSnap = await getDoc10(doc11(db, "users", studentId));
    if (!studentSnap.exists()) throw notFound("\u0627\u0644\u0637\u0627\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const [grades, attendance, invoices, payments, behavior, enrollments] = await Promise.all([
      fetchAll(query12(gradesRef, where12("student_id", "==", studentId))),
      fetchAll(query12(attendanceRef, where12("student_id", "==", studentId))),
      fetchAll(query12(invoicesRef, where12("student_id", "==", studentId))),
      fetchAll(query12(paymentsRef, where12("student_id", "==", studentId))),
      fetchAll(query12(behaviorRef, where12("student_id", "==", studentId))),
      fetchAll(query12(enrollmentsRef, where12("student_id", "==", studentId)))
    ]);
    let className = null;
    if (enrollments[0]?.class_id) {
      const classSnap = await getDoc10(doc11(db, "classes", enrollments[0].class_id));
      className = classSnap.exists() ? classSnap.data().name : null;
    }
    const activeInvoices = invoices.filter((i) => i.status !== "cancelled");
    const billed = activeInvoices.reduce((sum, i) => sum + netAmount(i), 0);
    const paid = activeInvoices.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);
    const conductScore = behavior.reduce((sum, b) => sum + Number(b.points || 0), 0);
    grades.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    attendance.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    res.json({
      generated_at: (/* @__PURE__ */ new Date()).toISOString(),
      currency: CURRENCY,
      student: { ...sanitizeUser({ id: studentSnap.id, ...studentSnap.data() }), class_name: className },
      grades: { records: grades, stats: gradeStats(grades) },
      attendance: { records: attendance.slice(0, 60), stats: attendanceStats(attendance) },
      finance: {
        total_billed: billed,
        total_paid: paid,
        outstanding: Math.max(0, billed - paid),
        is_clear: billed - paid <= 0,
        invoices: activeInvoices.map((i) => ({ ...i, net_amount: netAmount(i), remaining: remainingAmount(i) })),
        payments
      },
      behavior: {
        notes: behavior,
        positive: behavior.filter((b) => b.type === "positive").length,
        negative: behavior.filter((b) => b.type === "negative").length,
        conduct_score: Math.max(0, Math.min(100, 100 + conductScore))
      }
    });
  })
);
router11.get(
  "/reports/class/:classId",
  requireAuth,
  requireRole("teacher", "admin", "assistant_admin"),
  wrap(async (req, res) => {
    const classId = req.params.classId;
    const classSnap = await getDoc10(doc11(db, "classes", classId));
    if (!classSnap.exists()) throw notFound("\u0627\u0644\u0635\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
    const enrollments = await fetchAll(
      query12(enrollmentsRef, where12("class_id", "==", classId))
    );
    const studentIds = [...new Set(enrollments.map((e) => e.student_id))];
    const [students, grades, attendance, invoices] = await Promise.all([
      getDocsByIds(usersRef, studentIds),
      fetchAll(query12(gradesRef, where12("class_id", "==", classId))),
      fetchAll(query12(attendanceRef, where12("class_id", "==", classId))),
      fetchAll(query12(invoicesRef, where12("class_id", "==", classId)))
    ]);
    const gradesByStudent = /* @__PURE__ */ new Map();
    grades.forEach((g) => {
      const list = gradesByStudent.get(g.student_id) || [];
      list.push(g);
      gradesByStudent.set(g.student_id, list);
    });
    const attendanceByStudent = /* @__PURE__ */ new Map();
    attendance.forEach((a) => {
      const list = attendanceByStudent.get(a.student_id) || [];
      list.push(a);
      attendanceByStudent.set(a.student_id, list);
    });
    const duesByStudent = /* @__PURE__ */ new Map();
    invoices.forEach((i) => {
      if (i.status === "cancelled") return;
      duesByStudent.set(i.student_id, (duesByStudent.get(i.student_id) || 0) + remainingAmount(i));
    });
    const subjects = [...new Set(grades.map((g) => g.subject))].sort((a, b) => a.localeCompare(b, "ar"));
    const rows = studentIds.map((id) => students.get(id)).filter(Boolean).map((s) => {
      const studentGrades = gradesByStudent.get(s.id) || [];
      const stats = gradeStats(studentGrades);
      const bySubject = new Map(stats.subjects.map((x) => [x.subject, x.percentage]));
      return {
        student_id: s.id,
        name: s.name,
        uid: s.uid,
        overall_percentage: stats.overall_percentage,
        subjects: Object.fromEntries(subjects.map((sub) => [sub, bySubject.get(sub) ?? null])),
        attendance: attendanceStats(attendanceByStudent.get(s.id) || []),
        outstanding: duesByStudent.get(s.id) || 0
      };
    });
    rows.sort((a, b) => (b.overall_percentage ?? -1) - (a.overall_percentage ?? -1));
    res.json({
      generated_at: (/* @__PURE__ */ new Date()).toISOString(),
      currency: CURRENCY,
      class: { id: classSnap.id, ...classSnap.data() },
      subjects,
      students: rows,
      class_average: rows.length > 0 ? Math.round(
        rows.reduce((sum, r) => sum + (r.overall_percentage ?? 0), 0) / rows.filter((r) => r.overall_percentage !== null).length || 0
      ) : null
    });
  })
);
router11.get(
  "/reports/overview",
  requireAuth,
  requireRole("admin", "assistant_admin"),
  wrap(async (_req, res) => {
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const [users, classes, invoices, todayAttendance, registrations] = await Promise.all([
      fetchAll(usersRef),
      fetchAll(classesRef),
      fetchAll(invoicesRef),
      fetchAll(query12(attendanceRef, where12("date", "==", today))),
      fetchAll(query12(registrationsRef, where12("status", "==", "pending")))
    ]);
    const activeInvoices = invoices.filter((i) => i.status !== "cancelled");
    const billed = activeInvoices.reduce((sum, i) => sum + netAmount(i), 0);
    const paid = activeInvoices.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);
    res.json({
      currency: CURRENCY,
      students: users.filter((u) => u.role === "student").length,
      teachers: users.filter((u) => u.role === "teacher").length,
      assistants: users.filter((u) => u.role === "assistant_admin").length,
      classes: classes.length,
      pending_registrations: registrations.length,
      attendance_today: attendanceStats(todayAttendance),
      finance: {
        total_billed: billed,
        total_collected: paid,
        outstanding: Math.max(0, billed - paid),
        collection_rate: billed > 0 ? Math.round(paid / billed * 100) : 100
      }
    });
  })
);
router11.get(
  "/reports/attendance",
  requireAuth,
  requireRole("admin", "assistant_admin", "teacher"),
  wrap(async (req, res) => {
    const from = isoDate(req.query.from, "\u0645\u0646 \u062A\u0627\u0631\u064A\u062E");
    const to = isoDate(req.query.to, "\u0625\u0644\u0649 \u062A\u0627\u0631\u064A\u062E");
    const classId = req.query.class_id ? String(req.query.class_id) : null;
    const records = await fetchAll(
      classId ? query12(attendanceRef, where12("class_id", "==", classId)) : attendanceRef
    );
    const inRange = records.filter((r) => r.date >= from && r.date <= to);
    const byStudent = /* @__PURE__ */ new Map();
    inRange.forEach((r) => {
      const list = byStudent.get(r.student_id) || [];
      list.push(r);
      byStudent.set(r.student_id, list);
    });
    const students = await getDocsByIds(usersRef, [...byStudent.keys()]);
    const rows = [...byStudent.entries()].map(([studentId, list]) => ({
      student_id: studentId,
      name: students.get(studentId)?.name || "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
      uid: students.get(studentId)?.uid || "",
      guardian_phone: students.get(studentId)?.guardian_phone || "",
      ...attendanceStats(list)
    })).sort((a, b) => b.absent - a.absent);
    res.json({ from, to, class_id: classId, generated_at: (/* @__PURE__ */ new Date()).toISOString(), students: rows });
  })
);
var reports_routes_default = router11;

// backend/app.ts
var app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "128kb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store");
  next();
});
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
}
app.use(attachUser);
app.get("/api/health", async (_req, res) => {
  let auth_error = null;
  try {
    await Promise.race([
      ensureDbAuth(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8e3))
    ]);
  } catch (err) {
    auth_error = err?.code || err?.message || "sign-in failed";
  }
  res.json({
    ok: true,
    time: (/* @__PURE__ */ new Date()).toISOString(),
    db_auth_configured: dbAuthConfigured,
    // Not a secret: this is the value that belongs in firestore.rules.
    server_uid: getServerUid(),
    auth_error
  });
});
app.use((req, res, next) => {
  ensureDbAuth().then(
    () => next(),
    () => res.status(503).json({
      error: tr("\u062A\u0639\u0630\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0628\u0639\u062F \u0642\u0644\u064A\u0644", langOf(req))
    })
  );
});
app.post(
  "/api/setup",
  rateLimit({ windowMs: 60 * 60 * 1e3, max: 5, keyPrefix: "setup" }),
  async (req, res, next) => {
    try {
      const existingAdmin = await getDocs10(query13(usersRef, where13("role", "==", "admin"), fsLimit4(1)));
      if (!existingAdmin.empty) {
        throw new HttpError(409, "\u062A\u0645 \u062A\u0647\u064A\u0626\u0629 \u0627\u0644\u0646\u0638\u0627\u0645 \u0645\u0633\u0628\u0642\u0627\u064B. \u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u0646\u0634\u0627\u0621 \u0645\u062F\u064A\u0631 \u062C\u062F\u064A\u062F \u0645\u0646 \u0647\u0646\u0627.");
      }
      const setupToken = process.env.SETUP_TOKEN;
      if (setupToken && req.body?.setup_token !== setupToken) {
        throw new HttpError(403, "\u0631\u0645\u0632 \u0627\u0644\u062A\u0647\u064A\u0626\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
      }
      const name = String(req.body?.name || "").trim() || "\u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645";
      const uid = String(req.body?.uid || "").trim();
      const password2 = String(req.body?.password || "");
      if (uid.length < 3) throw new HttpError(400, "\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u062A\u0639\u0631\u064A\u0641\u064A \u0644\u0644\u0645\u062F\u064A\u0631 \u0645\u0637\u0644\u0648\u0628");
      if (password2.length < 8) throw new HttpError(400, "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 8 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644");
      const created = await addDoc9(usersRef, {
        name,
        username: uid,
        uid,
        password: hashPassword(password2),
        role: "admin",
        status: "active",
        createdAt: serverTimestamp11()
      });
      const subjects = await getDocs10(query13(subjectsRef, fsLimit4(1)));
      if (subjects.empty) {
        const defaults = [
          { name: "\u0627\u0644\u0631\u064A\u0627\u0636\u064A\u0627\u062A", color: "bg-blue-500" },
          { name: "\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629", color: "bg-emerald-500" },
          { name: "\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629", color: "bg-orange-500" },
          { name: "\u0627\u0644\u0623\u062D\u064A\u0627\u0621", color: "bg-rose-500" },
          { name: "\u0627\u0644\u0641\u064A\u0632\u064A\u0627\u0621", color: "bg-cyan-500" },
          { name: "\u0627\u0644\u0643\u064A\u0645\u064A\u0627\u0621", color: "bg-purple-500" },
          { name: "\u0627\u0644\u0631\u064A\u0627\u0636\u0629", color: "bg-indigo-500" }
        ];
        await Promise.all(defaults.map((s) => addDoc9(subjectsRef, { ...s, createdAt: serverTimestamp11() })));
      }
      res.status(201).json({ success: true, id: created.id, uid });
    } catch (err) {
      next(err);
    }
  }
);
app.use("/api", auth_routes_default);
app.use("/api", registrations_routes_default);
app.use("/api", admin_routes_default);
app.use("/api", classes_routes_default);
app.use("/api", attendance_routes_default);
app.use("/api", grades_routes_default);
app.use("/api", notifications_routes_default);
app.use("/api", catalog_routes_default);
app.use("/api", payments_routes_default);
app.use("/api", behavior_routes_default);
app.use("/api", reports_routes_default);
app.use("/api", (req, res) => {
  res.status(404).json({ error: tr("\u0627\u0644\u0645\u0633\u0627\u0631 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F", langOf(req)) });
});
app.use((err, req, res, _next) => {
  if (err?.code === "permission-denied") {
    console.error(
      `
[config] Firestore refused ${req.method} ${req.url} \u2014 "permission-denied".
` + (dbAuthConfigured ? "         The service account is configured but its UID does not match the one\n         in firestore.rules. Compare them in the Firebase console.\n" : "         Security rules are deployed but FIREBASE_SERVER_EMAIL /\n         FIREBASE_SERVER_PASSWORD are not set, so the API is connecting\n         anonymously. Set them, then redeploy. See DEPLOYMENT.md.\n")
    );
    return res.status(503).json({
      error: tr(
        "\u0627\u0644\u062E\u0627\u062F\u0645 \u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0644\u0647 \u0628\u0627\u0644\u0648\u0635\u0648\u0644 \u0644\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A. \u062A\u0623\u0643\u062F \u0645\u0646 \u0636\u0628\u0637 FIREBASE_SERVER_EMAIL \u0648 FIREBASE_SERVER_PASSWORD\u060C \u0648\u0623\u0646 \u0627\u0644\u0640 UID \u0641\u064A firestore.rules \u064A\u0637\u0627\u0628\u0642 \u062D\u0633\u0627\u0628 \u0627\u0644\u062E\u062F\u0645\u0629.",
        langOf(req)
      )
    });
  }
  const status = err instanceof ValidationError ? 400 : err?.status || err?.statusCode || 500;
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.url}`, err);
  }
  const lang = langOf(req);
  const message = err instanceof ValidationError ? err.render(lang) : status >= 500 ? tr("\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0644\u0627\u062D\u0642\u0627\u064B", lang) : tr(err?.message || "\u0637\u0644\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D", lang);
  res.status(status).json({ error: message });
});
var app_default = app;

// index.functions.ts
var api = onRequest(
  {
    region: "europe-west1",
    cors: true,
    invoker: "public",
    maxInstances: 10
  },
  app_default
);
export {
  api
};
