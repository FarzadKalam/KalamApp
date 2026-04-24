const FILE_MANAGER_QUERY_TTL_MS = 10_000;

type TimedCacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const timedCache = new Map<string, TimedCacheEntry<unknown>>();

export const FILE_MANAGER_CACHE_PREFIXES = {
  accessibleRows: 'file-manager:accessible-rows:',
  moduleFolders: 'file-manager:module-folders',
  recordEntries: 'file-manager:record-entries:',
  recordFolders: 'file-manager:record-folders:',
  recordItems: 'file-manager:record-items:',
  recordTags: 'file-manager:record-tags:',
  scopedFolders: 'file-manager:scoped-folders:',
} as const;

export const getTimedFileManagerCache = <T,>(key: string): T | null => {
  const hit = timedCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    timedCache.delete(key);
    return null;
  }
  return hit.value as T;
};

export const setTimedFileManagerCache = <T,>(key: string, value: T, ttlMs = FILE_MANAGER_QUERY_TTL_MS) => {
  timedCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
};

export const getOrSetTimedFileManagerCache = async <T,>(key: string, loader: () => Promise<T>, ttlMs = FILE_MANAGER_QUERY_TTL_MS) => {
  const cached = getTimedFileManagerCache<T>(key);
  if (cached !== null) return cached;
  const value = await loader();
  return setTimedFileManagerCache(key, value, ttlMs);
};

const invalidateByPrefixes = (prefixes: string[]) => {
  if (prefixes.length === 0) {
    timedCache.clear();
    return;
  }
  const normalizedPrefixes = prefixes.filter(Boolean);
  for (const key of Array.from(timedCache.keys())) {
    if (normalizedPrefixes.some((prefix) => key.startsWith(prefix))) {
      timedCache.delete(key);
    }
  }
};

export const invalidateFileManagerQueryCache = (keys?: string[]) => {
  invalidateByPrefixes(keys || []);
};

export const invalidateFileManagerFolderCaches = (moduleId?: string | null, recordId?: string | null) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  const prefixes: string[] = [
    FILE_MANAGER_CACHE_PREFIXES.moduleFolders,
  ];

  if (normalizedModuleId) {
    prefixes.push(
      `${FILE_MANAGER_CACHE_PREFIXES.recordFolders}${normalizedModuleId}`,
      `${FILE_MANAGER_CACHE_PREFIXES.recordItems}${normalizedModuleId}:`,
      `${FILE_MANAGER_CACHE_PREFIXES.recordEntries}${normalizedModuleId}:`,
      `${FILE_MANAGER_CACHE_PREFIXES.recordTags}${normalizedModuleId}:`,
      `${FILE_MANAGER_CACHE_PREFIXES.accessibleRows}${normalizedModuleId}:`,
    );
  }

  if (normalizedModuleId && normalizedRecordId) {
    prefixes.push(`${FILE_MANAGER_CACHE_PREFIXES.scopedFolders}${normalizedModuleId}:${normalizedRecordId}`);
  }

  invalidateByPrefixes(prefixes);
};
