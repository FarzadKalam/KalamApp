export type ModuleOptionSnapshot = {
  dynamicOptions: Record<string, any[]>;
  relationOptions: Record<string, any[]>;
  allUsers: any[];
  allRoles: any[];
  cachedAt: number;
};

const MODULE_OPTION_SNAPSHOT_TTL_MS = 10 * 60 * 1000;

const moduleOptionSnapshotCache = new Map<string, ModuleOptionSnapshot>();

const normalizeOptionKey = (item: any) =>
  String(
    item?.value
    ?? item?.id
    ?? item?.key
    ?? item?.label
    ?? item?.name
    ?? ''
  ).trim();

export const mergeOptionLists = <T = any>(...lists: Array<T[] | undefined | null>): T[] => {
  const merged = new Map<string, T>();

  lists.forEach((list) => {
    (list || []).forEach((item: any) => {
      const key = normalizeOptionKey(item);
      if (!key) return;
      if (!merged.has(key)) {
        merged.set(key, item);
        return;
      }
      merged.set(key, { ...(merged.get(key) as any), ...(item || {}) });
    });
  });

  return Array.from(merged.values());
};

export const mergeOptionMaps = (
  ...maps: Array<Record<string, any[]> | undefined | null>
): Record<string, any[]> => {
  const merged: Record<string, any[]> = {};

  maps.forEach((map) => {
    Object.entries(map || {}).forEach(([key, options]) => {
      merged[key] = mergeOptionLists(merged[key], options);
    });
  });

  return merged;
};

export const readModuleOptionSnapshot = (moduleId?: string | null): ModuleOptionSnapshot | null => {
  const key = String(moduleId || '').trim();
  if (!key) return null;

  const snapshot = moduleOptionSnapshotCache.get(key);
  if (!snapshot) return null;

  if ((Date.now() - snapshot.cachedAt) > MODULE_OPTION_SNAPSHOT_TTL_MS) {
    moduleOptionSnapshotCache.delete(key);
    return null;
  }

  return snapshot;
};

export const writeModuleOptionSnapshot = (
  moduleId: string | null | undefined,
  next: Partial<Omit<ModuleOptionSnapshot, 'cachedAt'>>
): ModuleOptionSnapshot | null => {
  const key = String(moduleId || '').trim();
  if (!key) return null;

  const current = readModuleOptionSnapshot(key);
  const snapshot: ModuleOptionSnapshot = {
    dynamicOptions: mergeOptionMaps(current?.dynamicOptions, next.dynamicOptions),
    relationOptions: mergeOptionMaps(current?.relationOptions, next.relationOptions),
    allUsers: mergeOptionLists(current?.allUsers, next.allUsers),
    allRoles: mergeOptionLists(current?.allRoles, next.allRoles),
    cachedAt: Date.now(),
  };

  moduleOptionSnapshotCache.set(key, snapshot);
  return snapshot;
};

export const clearModuleOptionSnapshot = (moduleId?: string | null) => {
  const key = String(moduleId || '').trim();
  if (!key) {
    moduleOptionSnapshotCache.clear();
    return;
  }
  moduleOptionSnapshotCache.delete(key);
};
