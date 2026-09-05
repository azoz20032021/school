import { addDoc, serverTimestamp } from "firebase/firestore";
import type { Request } from "express";
import { auditRef } from "./db.js";

export type AuditAction =
  | "login"
  | "login_failed"
  | "password_change"
  | "password_reset"
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "reject"
  | "enroll"
  | "attendance"
  | "broadcast"
  | "reminder"
  | "payment";

interface AuditInput {
  action: AuditAction;
  entity: string;
  entityId?: string;
  summary: string;
  meta?: Record<string, unknown>;
}

function clientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

/**
 * Write an audit entry. Deliberately fire-and-forget: a failure to log must
 * never fail the operation the user actually asked for, and awaiting it would
 * add a round trip to every mutation.
 */
export function audit(req: Request, input: AuditInput): void {
  const actor = req.user;
  void addDoc(auditRef, {
    actor_id: actor?.id || null,
    actor_name: actor?.name || "غير مسجل",
    actor_role: actor?.role || "anonymous",
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId || null,
    summary: input.summary,
    meta: input.meta || {},
    ip: clientIp(req),
    createdAt: serverTimestamp(),
  }).catch((err) => console.error("[audit] failed to write entry:", err?.message || err));
}
