import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';

const normalizeText = (value: unknown) => String(value || '').trim();

const parseObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const getRecycleBinSourceTableForModule = (moduleId?: string | null) => {
  const normalizedModuleId = normalizeText(moduleId);
  return normalizedModuleId ? (MODULES[normalizedModuleId]?.table || normalizedModuleId) : '';
};

export const isDeletedLikeRecord = (record?: Record<string, any> | null) => {
  if (!record || typeof record !== 'object') return false;
  return Boolean(
    record.deleted_at
    || record.deletedAt
    || record.removed_at
    || record.archived_at
    || record.is_deleted === true
    || record.deleted === true
    || record._deleted === true
  );
};

export const isRecordInRecycleBin = async ({
  moduleId,
  sourceTable,
  recordId,
  record,
}: {
  moduleId?: string | null;
  sourceTable?: string | null;
  recordId?: string | null;
  record?: Record<string, any> | null;
}) => {
  const normalizedSourceTable = normalizeText(sourceTable) || getRecycleBinSourceTableForModule(moduleId);
  const normalizedRecordId = normalizeText(recordId || record?.id);
  if (!normalizedSourceTable || !normalizedRecordId) return false;

  try {
    const { data, error } = await supabase
      .from('recycle_bin_records')
      .select('id')
      .eq('source_table', normalizedSourceTable)
      .eq('source_record_id', normalizedRecordId)
      .maybeSingle();
    if (error) return false;
    return Boolean((data as any)?.id);
  } catch {
    return false;
  }
};

const getTaskProcessIds = (task?: Record<string, any> | null) => {
  const recurrence = parseObject(task?.recurrence_info);
  return {
    processRunId: normalizeText(task?.process_run_id || recurrence?.process_run_id),
    processRunStageId: normalizeText(task?.process_run_stage_id || recurrence?.process_run_stage_id),
  };
};

export const shouldSkipRecordForAutomation = async ({
  moduleId,
  sourceTable,
  record,
}: {
  moduleId?: string | null;
  sourceTable?: string | null;
  record?: Record<string, any> | null;
}) => {
  if (!record || typeof record !== 'object') return true;
  if (isDeletedLikeRecord(record)) return true;

  const normalizedModuleId = normalizeText(moduleId);
  const normalizedSourceTable = normalizeText(sourceTable) || getRecycleBinSourceTableForModule(normalizedModuleId);
  if (await isRecordInRecycleBin({ moduleId: normalizedModuleId, sourceTable: normalizedSourceTable, record })) {
    return true;
  }

  if (normalizedModuleId === 'tasks' || normalizedSourceTable === 'tasks') {
    const { processRunId, processRunStageId } = getTaskProcessIds(record);
    if (processRunId && await isRecordInRecycleBin({ sourceTable: 'process_runs', recordId: processRunId })) {
      return true;
    }
    if (processRunStageId && await isRecordInRecycleBin({ sourceTable: 'process_run_stages', recordId: processRunStageId })) {
      return true;
    }
  }

  return false;
};
