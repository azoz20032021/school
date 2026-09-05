import { Router } from "express";
import { doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db, usersRef } from "../lib/db.js";
import {
  createToken,
  hashPassword,
  isHashed,
  rateLimit,
  requireAuth,
  sanitizeUser,
  verifyPassword,
  type Role,
} from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { maybeSendDueReminders, studentDues } from "../lib/dues.js";
import { badRequest, HttpError, wrap } from "../lib/http.js";
import * as v from "../lib/validate.js";

const router = Router();

const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 15, keyPrefix: "login" });

/**
 * POST /api/login
 *
 * Looks the account up by UID alone and then verifies the password in the
 * application. The old version queried Firestore for `uid == x AND password ==
 * y`, which required storing the password in plaintext and turned the database
 * into a credential dump.
 */
router.post(
  "/login",
  loginLimiter,
  wrap(async (req, res) => {
    const uid = v.str(req.body?.uid, "الرقم التعريفي", { max: 64 });
    const plain = v.str(req.body?.password, "كلمة المرور", { max: 200 });

    const snapshot = await getDocs(query(usersRef, where("uid", "==", uid)));
    const generic = "بيانات الدخول غير صحيحة (تحقق من الـ UID وكلمة المرور)";

    if (snapshot.empty) {
      audit(req, { action: "login_failed", entity: "user", summary: `محاولة دخول بـ UID غير موجود: ${uid}` });
      throw new HttpError(401, generic);
    }

    const userDoc = snapshot.docs[0];
    const data = userDoc.data() as Record<string, any>;

    if (!verifyPassword(plain, data.password)) {
      audit(req, {
        action: "login_failed",
        entity: "user",
        entityId: userDoc.id,
        summary: `كلمة مرور خاطئة للحساب ${uid}`,
      });
      throw new HttpError(401, generic);
    }

    if (data.status === "suspended") {
      throw new HttpError(403, "تم إيقاف هذا الحساب. يرجى مراجعة الإدارة.");
    }
    if (data.status === "pending") {
      throw new HttpError(403, "حسابك قيد المراجعة من قبل الإدارة ولم تتم الموافقة عليه بعد.");
    }

    // Transparently upgrade legacy plaintext passwords on first successful login.
    if (!isHashed(data.password)) {
      void updateDoc(doc(db, "users", userDoc.id), {
        password: hashPassword(plain),
        password_upgraded_at: serverTimestamp(),
      }).catch((err) => console.error("[auth] password upgrade failed:", err));
    }

    void updateDoc(doc(db, "users", userDoc.id), { last_login_at: serverTimestamp() }).catch(() => {});

    const sessionUser = {
      id: userDoc.id,
      uid: data.uid,
      name: data.name,
      role: (data.role || "student") as Role,
    };

    req.user = sessionUser;
    audit(req, { action: "login", entity: "user", entityId: userDoc.id, summary: `تسجيل دخول ناجح` });

    /**
     * A student's outstanding fees travel with their account: the app locks
     * itself to a "settle your fees" screen while an invoice is past its due
     * date, and it must learn that from the server rather than from the client.
     */
    const dues = sessionUser.role === "student" ? await studentDues(userDoc.id) : undefined;

    res.json({
      token: createToken(sessionUser),
      user: { ...sanitizeUser({ id: userDoc.id, ...data }), dues },
    });
  })
);

/** Returns the caller's own record — used to revalidate a stored token on boot. */
router.get(
  "/me",
  requireAuth,
  wrap(async (req, res) => {
    const snapshot = await getDocs(query(usersRef, where("uid", "==", req.user!.uid)));
    if (snapshot.empty) throw new HttpError(401, "الحساب لم يعد موجوداً");
    const userDoc = snapshot.docs[0];
    const data = userDoc.data() as Record<string, any>;
    if (data.status === "suspended") throw new HttpError(403, "تم إيقاف هذا الحساب");

    // Neither host runs a scheduler, so the fee reminders ride along with the
    // ordinary traffic. This does real work at most once an hour.
    maybeSendDueReminders();

    const dues = data.role === "student" ? await studentDues(userDoc.id) : undefined;
    res.json({ ...sanitizeUser({ id: userDoc.id, ...data }), dues });
  })
);

/** Any signed-in user changes their own password. */
router.post(
  "/change-password",
  requireAuth,
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: "pwchange" }),
  wrap(async (req, res) => {
    const current = v.str(req.body?.currentPassword, "كلمة المرور الحالية", { max: 200 });
    const next = v.password(req.body?.newPassword, "كلمة المرور الجديدة");
    if (current === next) throw badRequest("كلمة المرور الجديدة يجب أن تختلف عن الحالية");

    const snapshot = await getDocs(query(usersRef, where("uid", "==", req.user!.uid)));
    if (snapshot.empty) throw new HttpError(401, "الحساب لم يعد موجوداً");

    const userDoc = snapshot.docs[0];
    if (!verifyPassword(current, userDoc.data().password)) {
      throw badRequest("كلمة المرور الحالية غير صحيحة");
    }

    await updateDoc(doc(db, "users", userDoc.id), {
      password: hashPassword(next),
      password_changed_at: serverTimestamp(),
    });

    audit(req, {
      action: "password_change",
      entity: "user",
      entityId: userDoc.id,
      summary: "غيّر المستخدم كلمة المرور الخاصة به",
    });
    res.json({ success: true });
  })
);

export default router;
