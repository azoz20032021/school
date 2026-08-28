/**
 * Small hand-rolled validation helpers.
 *
 * Every write route ran straight off `req.body` before this existed, which let
 * anything through: empty names, negative grades, objects where strings were
 * expected. These helpers throw `ValidationError`, which `index.ts` turns into
 * a 400 with an Arabic message.
 */

export class ValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function str(value: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
  const { min = 1, max = 500, optional = false } = opts;
  if (value === undefined || value === null || value === "") {
    if (optional) return "";
    throw new ValidationError(`الحقل "${field}" مطلوب`);
  }
  if (typeof value !== "string") throw new ValidationError(`الحقل "${field}" يجب أن يكون نصاً`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw new ValidationError(`الحقل "${field}" قصير جداً`);
  if (trimmed.length > max) throw new ValidationError(`الحقل "${field}" طويل جداً (الحد ${max} حرف)`);
  return trimmed;
}

export function num(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number; optional?: boolean; default?: number } = {}
): number {
  const { min = 0, max = Number.MAX_SAFE_INTEGER, optional = false } = opts;
  if (value === undefined || value === null || value === "") {
    if (optional) return opts.default ?? 0;
    throw new ValidationError(`الحقل "${field}" مطلوب`);
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new ValidationError(`الحقل "${field}" يجب أن يكون رقماً`);
  if (parsed < min) throw new ValidationError(`الحقل "${field}" يجب ألا يقل عن ${min}`);
  if (parsed > max) throw new ValidationError(`الحقل "${field}" يجب ألا يزيد عن ${max}`);
  return parsed;
}

export function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[], fallback?: T): T {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError(`القيمة المدخلة في "${field}" غير صالحة`);
  }
  return value as T;
}

/** ISO date, `YYYY-MM-DD`. */
export function isoDate(value: unknown, field: string, opts: { optional?: boolean } = {}): string {
  if (!value) {
    if (opts.optional) return "";
    throw new ValidationError(`الحقل "${field}" مطلوب`);
  }
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw new ValidationError(`الحقل "${field}" يجب أن يكون تاريخاً صالحاً (YYYY-MM-DD)`);
  }
  return s;
}

export function phone(value: unknown, field: string, opts: { optional?: boolean } = {}): string {
  if (!value) {
    if (opts.optional) return "";
    throw new ValidationError(`الحقل "${field}" مطلوب`);
  }
  const s = String(value).replace(/[\s-]/g, "");
  if (!/^\+?\d{7,15}$/.test(s)) throw new ValidationError(`رقم الهاتف في "${field}" غير صالح`);
  return s;
}

export function email(value: unknown, field: string, opts: { optional?: boolean } = {}): string {
  if (!value) {
    if (opts.optional) return "";
    throw new ValidationError(`الحقل "${field}" مطلوب`);
  }
  const s = String(value).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw new ValidationError(`البريد الإلكتروني غير صالح`);
  return s;
}

export const MIN_PASSWORD_LENGTH = 8;

export function password(value: unknown, field = "كلمة المرور"): string {
  const s = str(value, field, { min: 1, max: 200 });
  if (s.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`يجب أن تكون كلمة المرور ${MIN_PASSWORD_LENGTH} أحرف على الأقل`);
  }
  if (!/[A-Za-z؀-ۿ]/.test(s) || !/\d/.test(s)) {
    throw new ValidationError("يجب أن تحتوي كلمة المرور على حروف وأرقام معاً");
  }
  return s;
}

export function boolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function stringArray(value: unknown, field: string, opts: { max?: number } = {}): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError(`الحقل "${field}" يجب أن يكون قائمة`);
  if (value.length > (opts.max ?? 100)) throw new ValidationError(`عدد العناصر في "${field}" كبير جداً`);
  return value.map((v) => String(v).trim()).filter(Boolean);
}
