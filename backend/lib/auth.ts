import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export type Role = "admin" | "assistant_admin" | "teacher" | "student";

export interface SessionUser {
  id: string;
  uid: string;
  name: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Secret
 * ------------------------------------------------------------------ */

const FALLBACK_SECRET = "dev-only-insecure-secret-change-me";

function resolveSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;

  if (process.env.NODE_ENV === "production") {
    console.error(
      "\n[SECURITY] SESSION_SECRET is missing or shorter than 32 characters.\n" +
        "            Every login token can be forged until you set it.\n" +
        "            Generate one with:  node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"\n"
    );
  } else {
    console.warn("[auth] SESSION_SECRET not set — using the insecure development fallback.");
  }
  return fromEnv || FALLBACK_SECRET;
}

const SECRET = resolveSecret();
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/* ------------------------------------------------------------------ *
 * Password hashing (scrypt, from node:crypto — no extra dependency)
 * ------------------------------------------------------------------ */

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString(
    "base64"
  )}$${derived.toString("base64")}`;
}

export function isHashed(stored: string | undefined | null): boolean {
  return typeof stored === "string" && stored.startsWith("scrypt$");
}

/**
 * Verify a password against the stored value.
 *
 * Accounts created before hashing existed still hold plaintext. Those are
 * accepted once and then transparently upgraded by the login route, so no user
 * is locked out by the migration.
 */
export function verifyPassword(plain: string, stored: string | undefined | null): boolean {
  if (!stored) return false;

  if (!isHashed(stored)) {
    // Legacy plaintext record — constant-time compare, then let the caller upgrade it.
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
      p: Number(p),
    });
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Stateless session tokens (HMAC-SHA256)
 * ------------------------------------------------------------------ */

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function signPayload(body: string): string {
  return b64url(crypto.createHmac("sha256", SECRET).update(body).digest());
}

export function createToken(user: SessionUser): string {
  const payload = {
    sub: user.id,
    uid: user.uid,
    name: user.name,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${signPayload(body)}`;
}

export function verifyToken(token: string | undefined): SessionUser | null {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = signPayload(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { id: payload.sub, uid: payload.uid, name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Middleware
 * ------------------------------------------------------------------ */

function readToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return undefined;
}

/** Populates `req.user` when a valid token is present, but never rejects. */
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  req.user = verifyToken(readToken(req)) || undefined;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "الجلسة منتهية، يرجى تسجيل الدخول مرة أخرى" });
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "الجلسة منتهية، يرجى تسجيل الدخول مرة أخرى" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "ليس لديك صلاحية للقيام بهذا الإجراء" });
    }
    next();
  };
}

/** Admin or assistant admin — the staff who run day-to-day operations. */
export const requireStaff = requireRole("admin", "assistant_admin");

/** Full admin only — user management, deletions, secrets. */
export const requireAdmin = requireRole("admin");

/**
 * Allow the request only if the caller is staff/teacher, or is the student
 * whose own record is being read.
 */
export function requireSelfOrStaff(paramName = "studentId") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "الجلسة منتهية، يرجى تسجيل الدخول مرة أخرى" });
    }
    const target = req.params[paramName];
    const privileged = ["admin", "assistant_admin", "teacher"].includes(req.user.role);
    if (privileged || req.user.id === target) return next();
    return res.status(403).json({ error: "لا يمكنك الاطلاع على بيانات طالب آخر" });
  };
}

/* ------------------------------------------------------------------ *
 * Rate limiting
 * ------------------------------------------------------------------ */

interface Bucket {
  hits: number[];
}
const buckets = new Map<string, Bucket>();

/**
 * Simple sliding-window limiter. On serverless this is per-instance rather
 * than global, which still blunts credential-stuffing considerably.
 */
export function rateLimit(options: { windowMs: number; max: number; keyPrefix: string }) {
  const { windowMs, max, keyPrefix } = options;
  return (req: Request, res: Response, next: NextFunction) => {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "unknown";
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    const bucket = buckets.get(key) || { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

    if (bucket.hits.length >= max) {
      const retryAfter = Math.ceil((windowMs - (now - bucket.hits[0])) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: `محاولات كثيرة جداً. يرجى المحاولة بعد ${retryAfter} ثانية`,
      });
    }

    bucket.hits.push(now);
    buckets.set(key, bucket);

    // Keep the map from growing without bound on long-lived instances.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (v.hits.every((t) => now - t > windowMs)) buckets.delete(k);
      }
    }
    next();
  };
}

/** Strip password material before any user document leaves the server. */
export function sanitizeUser<T extends Record<string, any>>(user: T): Omit<T, "password"> {
  const { password, ...safe } = user as any;
  return safe;
}
