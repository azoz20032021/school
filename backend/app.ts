// Must come first: it populates process.env before the modules below read it.
import "./lib/env.js";

import express, { type NextFunction, type Request, type Response } from "express";
import { addDoc, getDocs, limit as fsLimit, query, serverTimestamp, where } from "firebase/firestore";
import { dbAuthConfigured, ensureDbAuth, getServerUid, subjectsRef, usersRef } from "./lib/db.js";
import { attachUser, hashPassword, rateLimit } from "./lib/auth.js";
import { HttpError } from "./lib/http.js";
import { ValidationError } from "./lib/validate.js";
import { langOf, tr } from "./lib/i18n.js";

import authRoutes from "./routes/auth.routes.js";
import registrationRoutes from "./routes/registrations.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import classesRoutes from "./routes/classes.routes.js";
import attendanceRoutes from "./routes/attendance.routes.js";
import gradesRoutes from "./routes/grades.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import catalogRoutes from "./routes/catalog.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import behaviorRoutes from "./routes/behavior.routes.js";
import reportsRoutes from "./routes/reports.routes.js";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

// A school record is never megabytes; cap the body so a large POST cannot tie
// up a serverless instance.
app.use(express.json({ limit: "128kb" }));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // API responses must never be cached by a shared proxy — they are per-user.
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

/**
 * Health check, deliberately mounted *before* the database gate so it answers
 * even when Firestore is unreachable. That distinction is the whole point of
 * the endpoint: a reply here means the function booted and the problem is the
 * database, while no reply at all means the function itself failed to start.
 */
app.get("/api/health", async (_req, res) => {
  // Wait for the sign-in so `server_uid` is actually populated — a cold
  // serverless instance has not signed in yet when the request arrives. Bounded
  // by a timeout so a hanging or failing sign-in still yields a response.
  let auth_error: string | null = null;
  try {
    await Promise.race([
      ensureDbAuth(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]);
  } catch (err: any) {
    auth_error = err?.code || err?.message || "sign-in failed";
  }

  res.json({
    ok: true,
    time: new Date().toISOString(),
    db_auth_configured: dbAuthConfigured,
    // Not a secret: this is the value that belongs in firestore.rules.
    server_uid: getServerUid(),
    auth_error,
  });
});

// Every route below this point needs the database, so wait for the
// service-account sign-in to finish first.
app.use((req, res, next) => {
  ensureDbAuth().then(
    () => next(),
    () =>
      res.status(503).json({
        error: tr("تعذر الاتصال بقاعدة البيانات، يرجى المحاولة بعد قليل", langOf(req)),
      })
  );
});

/**
 * First-run bootstrap.
 *
 * Replaces the old module-level seeding block, which fired two Firestore
 * queries on every cold start and created an admin with a published default
 * password. This endpoint only works while no admin exists.
 */
app.post(
  "/api/setup",
  rateLimit({ windowMs: 60 * 60 * 1000, max: 5, keyPrefix: "setup" }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existingAdmin = await getDocs(query(usersRef, where("role", "==", "admin"), fsLimit(1)));
      if (!existingAdmin.empty) {
        throw new HttpError(409, "تم تهيئة النظام مسبقاً. لا يمكن إنشاء مدير جديد من هنا.");
      }

      const setupToken = process.env.SETUP_TOKEN;
      if (setupToken && req.body?.setup_token !== setupToken) {
        throw new HttpError(403, "رمز التهيئة غير صحيح");
      }

      const name = String(req.body?.name || "").trim() || "مدير النظام";
      const uid = String(req.body?.uid || "").trim();
      const password = String(req.body?.password || "");
      if (uid.length < 3) throw new HttpError(400, "الرقم التعريفي للمدير مطلوب");
      if (password.length < 8) throw new HttpError(400, "كلمة المرور يجب أن تكون 8 أحرف على الأقل");

      const created = await addDoc(usersRef, {
        name,
        username: uid,
        uid,
        password: hashPassword(password),
        role: "admin",
        status: "active",
        createdAt: serverTimestamp(),
      });

      const subjects = await getDocs(query(subjectsRef, fsLimit(1)));
      if (subjects.empty) {
        const defaults = [
          { name: "الرياضيات", color: "bg-blue-500" },
          { name: "اللغة العربية", color: "bg-emerald-500" },
          { name: "اللغة الإنجليزية", color: "bg-orange-500" },
          { name: "الأحياء", color: "bg-rose-500" },
          { name: "الفيزياء", color: "bg-cyan-500" },
          { name: "الكيمياء", color: "bg-purple-500" },
          { name: "الرياضة", color: "bg-indigo-500" },
        ];
        await Promise.all(defaults.map((s) => addDoc(subjectsRef, { ...s, createdAt: serverTimestamp() })));
      }

      res.status(201).json({ success: true, id: created.id, uid });
    } catch (err) {
      next(err);
    }
  }
);

app.use("/api", authRoutes);
app.use("/api", registrationRoutes);
app.use("/api", adminRoutes);
app.use("/api", classesRoutes);
app.use("/api", attendanceRoutes);
app.use("/api", gradesRoutes);
app.use("/api", notificationsRoutes);
app.use("/api", catalogRoutes);
app.use("/api", paymentsRoutes);
app.use("/api", behaviorRoutes);
app.use("/api", reportsRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({ error: tr("المسار المطلوب غير موجود", langOf(req)) });
});

// Central error handler. Internal details stay in the logs; the client gets an
// Arabic message and nothing about the stack or the database.
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  /**
   * Firestore rejecting us is a configuration problem, not a bug in the
   * request. It happens when the security rules are deployed but the server
   * has no service-account credentials to present — the exact state you land
   * in if the rules go out before the environment variables. Say so plainly
   * instead of returning an opaque 500 that looks like the site is broken.
   */
  if (err?.code === "permission-denied") {
    console.error(
      `\n[config] Firestore refused ${req.method} ${req.url} — "permission-denied".\n` +
        (dbAuthConfigured
          ? "         The service account is configured but its UID does not match the one\n" +
            "         in firestore.rules. Compare them in the Firebase console.\n"
          : "         Security rules are deployed but FIREBASE_SERVER_EMAIL /\n" +
            "         FIREBASE_SERVER_PASSWORD are not set, so the API is connecting\n" +
            "         anonymously. Set them, then redeploy. See DEPLOYMENT.md.\n")
    );
    return res.status(503).json({
      error: tr(
        "الخادم غير مصرح له بالوصول لقاعدة البيانات. " +
          "تأكد من ضبط FIREBASE_SERVER_EMAIL و FIREBASE_SERVER_PASSWORD، " +
          "وأن الـ UID في firestore.rules يطابق حساب الخدمة.",
        langOf(req)
      ),
    });
  }

  const status = err instanceof ValidationError ? 400 : err?.status || err?.statusCode || 500;

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.url}`, err);
  }

  // Validation errors carry a key and parameters; everything else is a fixed
  // Arabic string that doubles as its own translation key.
  const lang = langOf(req);
  const message =
    err instanceof ValidationError
      ? err.render(lang)
      : status >= 500
        ? tr("حدث خطأ في الخادم، يرجى المحاولة لاحقاً", lang)
        : tr(err?.message || "طلب غير صالح", lang);

  res.status(status).json({ error: message });
});

export default app;
