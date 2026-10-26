import type { ModuleListLocalInvalidationMarker } from './moduleListLive';

// Successful same-tab writes survive route unmounts, without copying whole lists
// or persisting record contents. A newer server response supersedes these patches.
const changes = new Map<string, ModuleListLocalInvalidationMarker[]>();
const TTL = 30 * 60_000;
const scopeKey = (orgId?: string | null, moduleId?: string | null, userId?: string | null) => orgId && moduleId && userId ? `${orgId}:${userId}:${moduleId}` : null;

export const rememberModuleListLocalChange = (marker: ModuleListLocalInvalidationMarker) => {
  const key = scopeKey(marker.org_id, marker.module_id, marker.user_id);
  if (!key || !marker.record_id || (marker.record_patch?.org_id && marker.record_patch.org_id !== marker.org_id)) return;
  if (marker.action !== 'delete' && (!marker.record_patch || Object.keys(marker.record_patch).length === 0)) return;
  const current = (changes.get(key) || []).filter((item) => item.sequence > Date.now() - TTL);
  changes.set(key, [...current, marker].slice(-250));
};

export const hasModuleListLocalChange = (marker?: ModuleListLocalInvalidationMarker | null) => {
  if (!marker) return false;
  const key = scopeKey(marker.org_id, marker.module_id, marker.user_id);
  return !!key && (changes.get(key) || []).some((item) => item.sequence === marker.sequence && item.record_id === marker.record_id);
};

export const applyModuleListLocalChanges = <T extends Record<string, any>>(rows: T[], orgId?: string | null, moduleId?: string | null, fetchedAt = 0, userId?: string | null): T[] => {
  const key = scopeKey(orgId, moduleId, userId);
  if (!key) return rows;
  const pending = (changes.get(key) || []).filter((item) => item.sequence > fetchedAt && item.sequence > Date.now() - TTL);
  if (!pending.length) return rows;
  const byId = new Map<string, ModuleListLocalInvalidationMarker[]>();
  pending.forEach((marker) => { const id = String(marker.record_id); byId.set(id, [...(byId.get(id) || []), marker]); });
  let changed = false;
  const next = rows.flatMap((row) => {
    const markers = byId.get(String(row.id));
    if (!markers || (row.org_id && row.org_id !== orgId)) return [row];
    changed = true;
    let patched = row;
    for (const marker of markers) {
      if (marker.action === 'delete') return [];
      patched = { ...patched, ...marker.record_patch, id: row.id };
    }
    return [patched];
  });
  return changed ? next : rows;
};

export const clearModuleListLocalChanges = () => changes.clear();
