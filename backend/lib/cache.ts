/**
 * In-memory TTL cache for collections that change rarely but are read on
 * almost every page load (subjects, classes, the class list in the register
 * form). A warm instance answers those from memory instead of hitting
 * Firestore, which is where a large share of the perceived slowness came from.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const DEFAULT_TTL_MS = 60_000;

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  // Collapse concurrent misses so a cold cache triggers one query, not N.
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = loader()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

/** Drop cache entries whose key starts with `prefix` (call after a write). */
export function invalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function invalidateAll(): void {
  store.clear();
}
