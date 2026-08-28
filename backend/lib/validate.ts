import { tt, type Lang, type TemplateKey } from "./i18n.js";

/**
 * Small hand-rolled validation helpers.
 *
 * Every write route ran straight off `req.body` before this existed, which let
 * anything through: empty names, negative grades, objects where strings were
 * expected. These throw `ValidationError`, which `app.ts` turns into a 400.
 *
 * The error carries a message *key* and its parameters rather than finished
 * text, so the same failure can be rendered in Arabic or English at the
 * response boundary.
 */

export class ValidationError extends Error {
  status = 400;
  key: TemplateKey;
  params: Record<string, string | number>;

  constructor(key: TemplateKey, params: Record<string, string | number> = {}) {
    // The Arabic rendering is the `message`, so logs and any code reading
    // `err.message` still see something readable.
    super(tt(key, "ar", params));
    this.name = "ValidationError";
    this.key = key;
    this.params = params;
  }

  render(lang: Lang): string {
    return tt(this.key, lang, this.params);
  }
}

export function str(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number; optional?: boolean } = {}
): string {
  const { min = 1, max = 500, optional = false } = opts;
  if (value === undefined || value === null || value === "") {
    if (optional) return "";
    throw new ValidationError("field.required", { field });
  }
  if (typeof value !== "string") throw new ValidationError("field.mustBeText", { field });
  const trimmed = value.trim();
  if (trimmed.length < min) throw new ValidationError("field.tooShort", { field });
  if (trimmed.length > max) throw new ValidationError("field.tooLong", { field, max });
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
    throw new ValidationError("field.required", { field });
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new ValidationError("field.mustBeNumber", { field });
  if (parsed < min) throw new ValidationError("field.min", { field, min });
  if (parsed > max) throw new ValidationError("field.max", { field, max });
  return parsed;
}

export function oneOf<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  fallback?: T
): T {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError("field.invalidChoice", { field });
  }
  return value as T;
}

/** ISO date, `YYYY-MM-DD`. */
export function isoDate(value: unknown, field: string, opts: { optional?: boolean } = {}): string {
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

export function phone(value: unknown, field: string, opts: { optional?: boolean } = {}): string {
  if (!value) {
    if (opts.optional) return "";
    throw new ValidationError("field.required", { field });
  }
  const s = String(value).replace(/[\s-]/g, "");
  if (!/^\+?\d{7,15}$/.test(s)) throw new ValidationError("field.invalidPhone", { field });
  return s;
}

export function email(value: unknown, field: string, opts: { optional?: boolean } = {}): string {
  if (!value) {
    if (opts.optional) return "";
    throw new ValidationError("field.required", { field });
  }
  const s = String(value).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw new ValidationError("field.invalidEmail", { field });
  return s;
}

export const MIN_PASSWORD_LENGTH = 8;

export function password(value: unknown, field = "كلمة المرور"): string {
  const s = str(value, field, { min: 1, max: 200 });
  if (s.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError("password.tooShort", { min: MIN_PASSWORD_LENGTH });
  }
  if (!/[A-Za-z؀-ۿ]/.test(s) || !/\d/.test(s)) {
    throw new ValidationError("password.needsLettersAndDigits");
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
  if (!Array.isArray(value)) throw new ValidationError("field.mustBeList", { field });
  if (value.length > (opts.max ?? 100)) throw new ValidationError("field.tooManyItems", { field });
  return value.map((v) => String(v).trim()).filter(Boolean);
}
