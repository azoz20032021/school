/**
 * Single entry point for every call to the API.
 *
 * Before this, each component called `fetch` directly and ignored the response
 * status, so a failed save looked exactly like a successful one. Everything now
 * goes through here: the session token is attached automatically, errors become
 * real exceptions carrying the server's Arabic message, and an expired session
 * signs the user out instead of silently returning empty lists.
 */

const TOKEN_KEY = "school_token";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

/** Fired when the server rejects our token; AuthContext listens and logs out. */
export const SESSION_EXPIRED_EVENT = "school:session-expired";

let token: string | null = null;

export function getToken(): string | null {
  if (token === null) {
    try {
      token = localStorage.getItem(TOKEN_KEY);
    } catch {
      token = null;
    }
  }
  return token;
}

export function setToken(value: string | null): void {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing — the in-memory copy still works for this tab */
  }
}

/* ------------------------------------------------------------------ *
 * GET de-duplication
 *
 * Several panels mount at once and ask for the same list. Sharing the in-flight
 * promise turns those into one network request.
 * ------------------------------------------------------------------ */

const inflight = new Map<string, Promise<any>>();

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const current = getToken();
  if (current) headers.Authorization = `Bearer ${current}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  let payload: any = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      setToken(null);
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(res.status, payload?.error || `تعذر إتمام الطلب (${res.status})`);
  }

  return payload as T;
}

export const api = {
  get<T = any>(path: string): Promise<T> {
    const existing = inflight.get(path);
    if (existing) return existing;

    const promise = request<T>("GET", path).finally(() => inflight.delete(path));
    inflight.set(path, promise);
    return promise;
  },
  post: <T = any>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T = any>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  del: <T = any>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};

/* ------------------------------------------------------------------ *
 * Formatting helpers shared by the finance screens
 * ------------------------------------------------------------------ */

export const CURRENCY_LABEL = "د.ع";

export function formatMoney(amount: number | null | undefined): string {
  const value = Number(amount || 0);
  return `${value.toLocaleString("en-US")} ${CURRENCY_LABEL}`;
}

export function formatDate(value: unknown): string {
  if (!value) return "—";
  if (typeof value === "string") return value;
  const seconds = (value as any)?.seconds;
  if (typeof seconds === "number") {
    return new Date(seconds * 1000).toLocaleDateString("ar-EG");
  }
  return "—";
}

export function formatDateTime(value: unknown): string {
  const seconds = (value as any)?.seconds;
  if (typeof seconds !== "number") return typeof value === "string" ? value : "—";
  return new Date(seconds * 1000).toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
