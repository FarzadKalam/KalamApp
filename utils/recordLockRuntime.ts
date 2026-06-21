import { supabase } from '../supabaseClient';
import type { PermissionMap } from './permissions';
import { canUseRecordLockPermission } from './permissions';

export type RecordLockState = {
  isLocked: boolean;
  moduleId?: string | null;
  recordId?: string | null;
  lockedAt?: string | null;
  lockedBy?: string | null;
  lockReason?: string | null;
  sourceType?: string | null;
};

export type RecordLockActionContext = {
  permissions?: PermissionMap | null;
  softwareRole?: string | null;
};

export const EMPTY_RECORD_LOCK_STATE: RecordLockState = {
  isLocked: false,
  moduleId: null,
  recordId: null,
  lockedAt: null,
  lockedBy: null,
  lockReason: null,
  sourceType: null,
};

export const RECORD_LOCKED_ERROR_CODE = 'record_locked';

export const normalizeRecordLockState = (value: any): RecordLockState => {
  if (!value) return EMPTY_RECORD_LOCK_STATE;
  return {
    isLocked: Boolean(value.is_locked ?? value.isLocked ?? value.locked_at ?? value.lockedAt),
    moduleId: value.module_id ?? value.moduleId ?? null,
    recordId: value.record_id ?? value.recordId ?? null,
    lockedAt: value.locked_at ?? value.lockedAt ?? null,
    lockedBy: value.locked_by ?? value.lockedBy ?? null,
    lockReason: value.lock_reason ?? value.lockReason ?? null,
    sourceType: value.source_type ?? value.sourceType ?? null,
  };
};

export const getRecordLockStateFromRecord = (record: any): RecordLockState => {
  if (!record) return EMPTY_RECORD_LOCK_STATE;
  return normalizeRecordLockState({
    is_locked: record.is_locked ?? record.isLocked,
    module_id: record.lock_module_id ?? record.lockModuleId,
    record_id: record.id,
    locked_at: record.locked_at ?? record.lockedAt,
    locked_by: record.locked_by ?? record.lockedBy,
    lock_reason: record.lock_reason ?? record.lockReason,
    source_type: record.lock_source_type ?? record.lockSourceType,
  });
};

export const mergeRecordLockIntoRecord = <T extends Record<string, any>>(
  record: T,
  lock?: RecordLockState | null
): T => {
  const normalized = normalizeRecordLockState(lock);
  return {
    ...record,
    is_locked: normalized.isLocked,
    locked_at: normalized.lockedAt || null,
    locked_by: normalized.lockedBy || null,
    lock_reason: normalized.lockReason || null,
    lock_source_type: normalized.sourceType || null,
    lock_module_id: normalized.moduleId || null,
  };
};

export const canLockRecord = (
  moduleId: string | null | undefined,
  context?: RecordLockActionContext | null
) => canUseRecordLockPermission(context?.permissions, moduleId, 'lock', context?.softwareRole);

export const canUnlockRecord = (
  moduleId: string | null | undefined,
  context?: RecordLockActionContext | null
) => canUseRecordLockPermission(context?.permissions, moduleId, 'unlock', context?.softwareRole);

export const fetchRecordLockMap = async (
  moduleId: string,
  recordIds: Array<string | null | undefined>
): Promise<Map<string, RecordLockState>> => {
  const ids = Array.from(new Set(recordIds.map((id) => String(id || '').trim()).filter(Boolean)));
  const map = new Map<string, RecordLockState>();
  if (!moduleId || ids.length === 0) return map;

  const { data, error } = await supabase.rpc('get_record_lock_map', {
    p_module_id: moduleId,
    p_record_ids: ids,
  });
  if (error) {
    console.warn('Could not load record lock map', error);
    return map;
  }

  (Array.isArray(data) ? data : []).forEach((row: any) => {
    const recordId = String(row?.record_id || '').trim();
    if (!recordId) return;
    map.set(recordId, normalizeRecordLockState({
      ...row,
      is_locked: true,
      module_id: row?.module_id || moduleId,
    }));
  });
  return map;
};

export const fetchRecordLockState = async (
  moduleId: string,
  recordId?: string | null
): Promise<RecordLockState> => {
  const map = await fetchRecordLockMap(moduleId, [recordId]);
  return map.get(String(recordId || '').trim()) || EMPTY_RECORD_LOCK_STATE;
};

export const lockRecord = async (args: {
  moduleId: string;
  recordId: string;
  reason?: string | null;
  sourceType?: 'manual' | 'workflow' | 'process_automation' | 'system';
  sourceId?: string | null;
}): Promise<RecordLockState> => {
  const { data, error } = await supabase.rpc('lock_record', {
    p_module_id: args.moduleId,
    p_record_id: args.recordId,
    p_reason: args.reason || null,
    p_source_type: args.sourceType || 'manual',
    p_source_id: args.sourceId || null,
  });
  if (error) throw error;
  return normalizeRecordLockState({
    ...(Array.isArray(data) ? data[0] : data),
    is_locked: true,
  });
};

export const unlockRecord = async (moduleId: string, recordId: string): Promise<void> => {
  const { error } = await supabase.rpc('unlock_record', {
    p_module_id: moduleId,
    p_record_id: recordId,
  });
  if (error) throw error;
};

export const createRecordLockedError = (message = 'این رکورد قفل شده و قابل تغییر نیست.') => {
  const error = new Error(message) as Error & { code?: string };
  error.code = RECORD_LOCKED_ERROR_CODE;
  return error;
};

export const throwIfRecordLocked = (record: any, message?: string) => {
  if (getRecordLockStateFromRecord(record).isLocked) {
    throw createRecordLockedError(message);
  }
};
