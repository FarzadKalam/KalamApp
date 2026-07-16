type CacheEntry<T> = {
  value?: T;
  expiresAt: number;
  promise: Promise<T> | null;
  generation: number;
};

type RuntimeCacheStore = {
  entries: Map<string, CacheEntry<any>>;
};

const globalRuntimeCache = globalThis as typeof globalThis & {
  __kalamAppRuntimeCacheStore?: RuntimeCacheStore;
};

const runtimeCacheStore = globalRuntimeCache.__kalamAppRuntimeCacheStore || {
  entries: new Map<string, CacheEntry<any>>(),
};

globalRuntimeCache.__kalamAppRuntimeCacheStore = runtimeCacheStore;

const { entries } = runtimeCacheStore;

const getOrCreateEntry = <T>(key: string): CacheEntry<T> => {
  const existing = entries.get(key);
  if (existing) return existing as CacheEntry<T>;
  const created: CacheEntry<T> = { expiresAt: 0, promise: null, generation: 0 };
  entries.set(key, created);
  return created;
};

export const clearAppRuntimeCache = (prefix?: string) => {
  const normalizedPrefix = String(prefix || '').trim();
  if (!normalizedPrefix) {
    entries.clear();
    return;
  }

  Array.from(entries.keys()).forEach((key) => {
    if (key.startsWith(normalizedPrefix)) {
      entries.delete(key);
    }
  });
};

export const readAppRuntimeCache = <T>(key: string): T | null => {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return null;
  const entry = entries.get(normalizedKey) as CacheEntry<T> | undefined;
  if (!entry || entry.expiresAt <= Date.now() || entry.value === undefined) {
    return null;
  }
  return entry.value;
};

export const getAppRuntimeCached = async <T>({
  key,
  ttlMs,
  force = false,
  loader,
}: {
  key: string;
  ttlMs: number;
  force?: boolean;
  loader: () => Promise<T>;
}): Promise<T> => {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) {
    return loader();
  }

  const entry = getOrCreateEntry<T>(normalizedKey);
  const now = Date.now();

  if (!force && entry.value !== undefined && entry.expiresAt > now) {
    return entry.value;
  }

  if (!force && entry.promise) {
    return entry.promise;
  }

  const generation = entry.generation + 1;
  entry.generation = generation;
  const pending = loader()
    .then((value) => {
      if (entry.generation === generation) {
        entry.value = value;
        entry.expiresAt = Date.now() + Math.max(0, Number(ttlMs) || 0);
        entry.promise = null;
      }
      return value;
    })
    .catch((error) => {
      if (entry.generation === generation) entry.promise = null;
      throw error;
    });

  entry.promise = pending;
  return pending;
};
