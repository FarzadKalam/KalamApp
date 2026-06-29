import { MODULES } from '../moduleRegistry';
import { FieldType, ModuleDefinition } from '../types';
import { supabase } from '../supabaseClient';
import { buildRecordTitleSelectColumns, runSelectWithCompatibleColumns } from './selectCompat';
import { getRecordTitle } from './recordTitle';
import {
  OPERATIONAL_CASH_BANK_SOURCE_MODULES,
  parseCashBankMetadata,
  parseOperationalPayments,
} from './operationalCashBankSources';
import { findModuleRelationReferences } from './moduleListMerge';
import { fetchRelationOptionsForField } from './relationOptions';
import { moveModuleRecordsToRecycleBin } from './recycleBin';

export const KNOWN_PROCESS_DRAFT_FIELD_KEYS = [
  'execution_process_draft',
  'marketing_process_draft',
  'production_stages_draft',
  'process_draft',
  'sub_process_draft',
] as const;

export type DeleteProcessMode = 'all' | 'incomplete' | 'none';

export type DeleteModuleRecordsOptions = {
  deletePayments: boolean;
  processMode: DeleteProcessMode;
  deleteRelatedActivities: boolean;
  deleteFiles: boolean;
  replacementRecordId?: string | null;
};

export type DeleteModuleRecordsPreview = {
  moduleId: string;
  moduleTitle: string;
  recordCount: number;
  recordTitles: string[];
  paymentsCount: number;
  processCount: number;
  incompleteProcessCount: number;
  activityCount: number;
  fileCount: number;
  hasPayments: boolean;
  hasProcesses: boolean;
  hasActivities: boolean;
  hasFiles: boolean;
};

const normalizeText = (value: unknown) => String(value || '').trim();
const COMPLETED_PROCESS_STATUSES = new Set(['completed', 'canceled', 'cancelled']);
const OPERATIONAL_CASH_BANK_SOURCE_BY_MODULE = new Map(
  OPERATIONAL_CASH_BANK_SOURCE_MODULES.map((source) => [source.moduleId, source] as const)
);
let deleteCleanupRpcAvailability: 'unknown' | 'available' | 'missing' = 'unknown';

const toUuidArray = (values: Array<string | number>) => (
  Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)))
);

const getModuleTitleFa = (moduleConfig?: ModuleDefinition | null, options?: { singular?: boolean }) => {
  if (!moduleConfig) return 'ماژول';
  if (options?.singular) {
    return moduleConfig.titles.faSingular || moduleConfig.titles.fa || moduleConfig.id || 'ماژول';
  }
  return moduleConfig.titles.fa || moduleConfig.titles.faSingular || moduleConfig.id || 'ماژول';
};

export const buildDeletedRelationLabel = (title?: string | null) => {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) return 'رکورد حذف شده';
  return `${normalizedTitle} (حذف شده)`;
};

export const getModuleDeleteDraftFieldKeys = (moduleConfig?: ModuleDefinition | null) => {
  const fieldKeys = new Set(
    (moduleConfig?.fields || [])
      .map((field) => normalizeText(field?.key))
      .filter(Boolean)
  );
  return KNOWN_PROCESS_DRAFT_FIELD_KEYS.filter((fieldKey) => fieldKeys.has(fieldKey));
};

export const normalizeDeleteModuleRecordsOptions = (
  options?: Partial<DeleteModuleRecordsOptions> | null,
): DeleteModuleRecordsOptions => {
  const rawProcessMode = normalizeText(options?.processMode).toLowerCase();
  const processMode: DeleteProcessMode = rawProcessMode === 'incomplete'
    ? 'incomplete'
    : rawProcessMode === 'none'
      ? 'none'
      : 'all';
  return {
    deletePayments: options?.deletePayments !== false,
    processMode,
    deleteRelatedActivities: options?.deleteRelatedActivities === true,
    deleteFiles: options?.deleteFiles === true,
    replacementRecordId: normalizeText(options?.replacementRecordId) || null,
  };
};

const buildPreviewSelectColumns = (moduleConfig?: ModuleDefinition | null) => {
  const draftKeys = getModuleDeleteDraftFieldKeys(moduleConfig);
  return Array.from(new Set([
    ...buildRecordTitleSelectColumns(moduleConfig?.id),
    'payments',
    'process_template_id',
    ...draftKeys,
  ]));
};

const countDraftStages = (record: Record<string, any>, moduleConfig?: ModuleDefinition | null) => (
  getModuleDeleteDraftFieldKeys(moduleConfig).reduce((sum, fieldKey) => {
    const rows = Array.isArray(record?.[fieldKey]) ? record[fieldKey] : [];
    return sum + rows.filter((item: any) => item && typeof item === 'object').length;
  }, 0)
);

const countFileEntriesForRecords = async (moduleId: string, recordIds: string[]) => {
  const { count: fileEntryCount, error: fileEntryError } = await supabase
    .from('file_entries')
    .select('id', { count: 'exact', head: true })
    .eq('module_id', moduleId)
    .in('record_id', recordIds)
    .eq('is_deleted', false);
  if (!fileEntryError && typeof fileEntryCount === 'number' && fileEntryCount > 0) {
    return fileEntryCount;
  }

  const { count: legacyCount } = await supabase
    .from('record_files')
    .select('id', { count: 'exact', head: true })
    .eq('module_id', moduleId)
    .in('record_id', recordIds);
  return Number(legacyCount || 0) || 0;
};

const isMissingDeleteCleanupRpcError = (error: any) => {
  const code = normalizeText(error?.code).toUpperCase();
  const message = `${normalizeText(error?.message)} ${normalizeText(error?.details)} ${normalizeText(error?.hint)}`.toLowerCase();
  return code === 'PGRST202'
    || code === '404'
    || (message.includes('delete_module_records_with_cleanup') && (
      message.includes('not found')
      || message.includes('could not find')
      || message.includes('schema cache')
      || message.includes('404')
    ));
};

const sanitizeRecurrenceInfo = (value: any) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value ?? null;
  const next = { ...value };
  delete next.process_group;
  delete next.process_run_id;
  delete next.process_run_stage_id;
  return next;
};

const patchDetachedCashBankMetadata = (
  metadata: any,
  moduleId: string,
  recordId: string,
  recordTitle?: string | null,
) => {
  const next = {
    ...(parseCashBankMetadata(metadata) || {}),
    is_auto_generated: false,
    detached_source_table: moduleId,
    detached_source_record_id: recordId,
  } as Record<string, any>;
  if (normalizeText(recordTitle)) {
    next.source_record_title = normalizeText(recordTitle);
  }
  delete next.source_table;
  delete next.source_record_id;
  delete next.source_block_id;
  delete next.source_row_key;
  return next;
};

const fetchRecordRowsForDelete = async (
  moduleId: string,
  moduleConfig: ModuleDefinition,
  recordIds: string[],
) => {
  const sourceTable = normalizeText(moduleConfig.table || moduleId);
  const result = await runSelectWithCompatibleColumns<any[]>({
    cacheKey: `module-delete-records:${moduleId}`,
    columns: buildPreviewSelectColumns(moduleConfig),
    execute: (selectExpr) => supabase
      .from(sourceTable)
      .select(selectExpr)
      .in('id', recordIds),
  });
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
};

const fetchProcessRunsForRecord = async (moduleId: string, recordId: string) => {
  const runMap = new Map<string, any>();
  const directRunsResult = await supabase
    .from('process_runs')
    .select('id,status,module_id,record_id')
    .eq('module_id', moduleId)
    .eq('record_id', recordId);
  if (directRunsResult.error) throw directRunsResult.error;
  (directRunsResult.data || []).forEach((row: any) => {
    const runId = normalizeText(row?.id);
    if (runId) runMap.set(runId, row);
  });

  const linksResult = await supabase
    .from('process_run_links')
    .select('process_run_id')
    .eq('module_id', moduleId)
    .eq('record_id', recordId);
  if (linksResult.error) throw linksResult.error;
  const linkedRunIds = Array.from(new Set(
    (linksResult.data || [])
      .map((row: any) => normalizeText(row?.process_run_id))
      .filter(Boolean)
  ));
  const missingRunIds = linkedRunIds.filter((runId) => !runMap.has(runId));
  if (missingRunIds.length > 0) {
    const linkedRunsResult = await supabase
      .from('process_runs')
      .select('id,status,module_id,record_id')
      .in('id', missingRunIds);
    if (linkedRunsResult.error) throw linkedRunsResult.error;
    (linkedRunsResult.data || []).forEach((row: any) => {
      const runId = normalizeText(row?.id);
      if (runId) runMap.set(runId, row);
    });
  }
  return Array.from(runMap.values());
};

const fetchDirectTaskRowsForRecord = async (moduleId: string, recordId: string) => {
  const result = await supabase
    .from('tasks')
    .select('id,process_run_id,process_run_stage_id')
    .eq('source_module_id', moduleId)
    .eq('source_record_id', recordId);
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
};

const fetchPaymentOperationIdsForRecord = async (moduleId: string, recordId: string) => {
  const ids = new Set<string>();
  const source = OPERATIONAL_CASH_BANK_SOURCE_BY_MODULE.get(moduleId as any);

  if (source) {
    const directResult = await supabase
      .from('cash_bank_operations')
      .select('id')
      .eq(source.sourceLinkField, recordId);
    if (directResult.error) throw directResult.error;
    (directResult.data || []).forEach((row: any) => {
      const operationId = normalizeText(row?.id);
      if (operationId) ids.add(operationId);
    });
  }

  const metadataResult = await supabase
    .from('cash_bank_operations')
    .select('id')
    .contains('metadata', { source_table: moduleId, source_record_id: recordId });
  if (!metadataResult.error) {
    (metadataResult.data || []).forEach((row: any) => {
      const operationId = normalizeText(row?.id);
      if (operationId) ids.add(operationId);
    });
  }

  return Array.from(ids);
};

const detachCashBankOperationsForRecord = async (
  moduleId: string,
  recordId: string,
  recordTitle?: string | null,
) => {
  const source = OPERATIONAL_CASH_BANK_SOURCE_BY_MODULE.get(moduleId as any);
  const rowsById = new Map<string, any>();

  if (source) {
    const directResult = await supabase
      .from('cash_bank_operations')
      .select(`id,metadata,${source.sourceLinkField}`)
      .eq(source.sourceLinkField, recordId);
    if (directResult.error) throw directResult.error;
    (directResult.data || []).forEach((row: any) => {
      const operationId = normalizeText(row?.id);
      if (operationId) rowsById.set(operationId, row);
    });
  }

  const metadataResult = await supabase
    .from('cash_bank_operations')
    .select('id,metadata')
    .contains('metadata', { source_table: moduleId, source_record_id: recordId });
  if (!metadataResult.error) {
    (metadataResult.data || []).forEach((row: any) => {
      const operationId = normalizeText(row?.id);
      if (operationId && !rowsById.has(operationId)) {
        rowsById.set(operationId, row);
      }
    });
  }

  for (const row of rowsById.values()) {
    const payload: Record<string, any> = {
      metadata: patchDetachedCashBankMetadata(row?.metadata, moduleId, recordId, recordTitle),
    };
    if (source?.sourceLinkField) {
      payload[source.sourceLinkField] = null;
    }
    const { error } = await supabase
      .from('cash_bank_operations')
      .update(payload)
      .eq('id', row.id);
    if (error) throw error;
  }
};

const detachTasksFromProcessRunIds = async (runIds: string[]) => {
  if (runIds.length === 0) return;
  const stageIds = new Set<string>();
  const stageResult = await supabase
    .from('process_run_stages')
    .select('id,process_run_id')
    .in('process_run_id', runIds);
  if (stageResult.error) throw stageResult.error;
  (stageResult.data || []).forEach((row: any) => {
    const stageId = normalizeText(row?.id);
    if (stageId) stageIds.add(stageId);
  });

  const taskMap = new Map<string, any>();
  const directTaskResult = await supabase
    .from('tasks')
    .select('id,recurrence_info')
    .in('process_run_id', runIds);
  if (directTaskResult.error) throw directTaskResult.error;
  (directTaskResult.data || []).forEach((row: any) => {
    const taskId = normalizeText(row?.id);
    if (taskId) taskMap.set(taskId, row);
  });

  const stageIdList = Array.from(stageIds);
  if (stageIdList.length > 0) {
    const stageTaskResult = await supabase
      .from('tasks')
      .select('id,recurrence_info')
      .in('process_run_stage_id', stageIdList);
    if (stageTaskResult.error) throw stageTaskResult.error;
    (stageTaskResult.data || []).forEach((row: any) => {
      const taskId = normalizeText(row?.id);
      if (taskId && !taskMap.has(taskId)) taskMap.set(taskId, row);
    });
  }

  for (const row of taskMap.values()) {
    const { error } = await supabase
      .from('tasks')
      .update({
        process_group_id: null,
        process_group_name: null,
        process_run_id: null,
        process_run_stage_id: null,
        recurrence_info: sanitizeRecurrenceInfo(row?.recurrence_info),
      })
      .eq('id', row.id);
    if (error) throw error;
  }
};

const reassignOrDetachProcessRunLinks = async (args: {
  moduleId: string;
  recordId: string;
  replacementRecordId?: string | null;
  runIds: string[];
}) => {
  const moduleId = normalizeText(args.moduleId);
  const recordId = normalizeText(args.recordId);
  const replacementRecordId = normalizeText(args.replacementRecordId);
  const runIds = toUuidArray(args.runIds);
  if (!moduleId || !recordId || runIds.length === 0) return;

  if (replacementRecordId) {
    const existingReplacementLinksResult = await supabase
      .from('process_run_links')
      .select('id,process_run_id')
      .eq('module_id', moduleId)
      .eq('record_id', replacementRecordId)
      .in('process_run_id', runIds);
    if (existingReplacementLinksResult.error) throw existingReplacementLinksResult.error;
    const replacementRunIds = new Set(
      (existingReplacementLinksResult.data || [])
        .map((row: any) => normalizeText(row?.process_run_id))
        .filter(Boolean)
    );

    const oldLinksToDelete = runIds.filter((runId) => replacementRunIds.has(runId));
    if (oldLinksToDelete.length > 0) {
      const { error } = await supabase
        .from('process_run_links')
        .delete()
        .eq('module_id', moduleId)
        .eq('record_id', recordId)
        .in('process_run_id', oldLinksToDelete);
      if (error) throw error;
    }

    const linksToUpdate = runIds.filter((runId) => !replacementRunIds.has(runId));
    if (linksToUpdate.length > 0) {
      const { error } = await supabase
        .from('process_run_links')
        .update({ record_id: replacementRecordId })
        .eq('module_id', moduleId)
        .eq('record_id', recordId)
        .in('process_run_id', linksToUpdate);
      if (error) throw error;
    }

    const { error: runUpdateError } = await supabase
      .from('process_runs')
      .update({ record_id: replacementRecordId })
      .eq('module_id', moduleId)
      .eq('record_id', recordId)
      .in('id', runIds);
    if (runUpdateError) throw runUpdateError;
    return;
  }

  const linksResult = await supabase
    .from('process_run_links')
    .select('id,process_run_id,module_id,record_id,is_primary,created_at')
    .in('process_run_id', runIds);
  if (linksResult.error) throw linksResult.error;
  const allLinks = Array.isArray(linksResult.data) ? linksResult.data : [];

  const { error: deleteLinksError } = await supabase
    .from('process_run_links')
    .delete()
    .eq('module_id', moduleId)
    .eq('record_id', recordId)
    .in('process_run_id', runIds);
  if (deleteLinksError) throw deleteLinksError;

  const ownedRunsResult = await supabase
    .from('process_runs')
    .select('id,module_id,record_id')
    .eq('module_id', moduleId)
    .eq('record_id', recordId)
    .in('id', runIds);
  if (ownedRunsResult.error) throw ownedRunsResult.error;

  const ownedRuns = Array.isArray(ownedRunsResult.data) ? ownedRunsResult.data : [];
  for (const run of ownedRuns) {
    const remainingLinks = allLinks
      .filter((link: any) => (
        normalizeText(link?.process_run_id) === normalizeText(run?.id)
        && !(
          normalizeText(link?.module_id) === moduleId
          && normalizeText(link?.record_id) === recordId
        )
      ))
      .sort((left: any, right: any) => {
        const leftPrimary = left?.is_primary ? 1 : 0;
        const rightPrimary = right?.is_primary ? 1 : 0;
        if (leftPrimary !== rightPrimary) return rightPrimary - leftPrimary;
        return normalizeText(left?.created_at).localeCompare(normalizeText(right?.created_at));
      });

    const nextLink = remainingLinks[0];
    if (!nextLink) continue;
    const { error } = await supabase
      .from('process_runs')
      .update({
        module_id: normalizeText(nextLink.module_id) || null,
        record_id: normalizeText(nextLink.record_id) || null,
      })
      .eq('id', run.id);
    if (error) throw error;
  }
};

const reassignFileRelations = async (moduleId: string, recordIds: string[], replacementRecordId: string) => {
  if (!moduleId || recordIds.length === 0 || !replacementRecordId) return;

  await supabase
    .from('file_entries')
    .update({ record_id: replacementRecordId })
    .eq('module_id', moduleId)
    .in('record_id', recordIds);

  await supabase
    .from('file_entries')
    .update({ source_record_id: replacementRecordId })
    .eq('source_module_id', moduleId)
    .in('source_record_id', recordIds);

  await supabase
    .from('file_folders')
    .update({ record_id: replacementRecordId })
    .eq('module_id', moduleId)
    .in('record_id', recordIds);

  await supabase
    .from('record_files')
    .update({ record_id: replacementRecordId })
    .eq('module_id', moduleId)
    .in('record_id', recordIds);

  await supabase
    .from('record_files')
    .update({ source_record_id: replacementRecordId })
    .eq('source_module_id', moduleId)
    .in('source_record_id', recordIds);
};

const deleteFileRelations = async (moduleId: string, recordIds: string[]) => {
  if (!moduleId || recordIds.length === 0) return;

  await supabase
    .from('file_entries')
    .update({ is_deleted: true })
    .eq('module_id', moduleId)
    .in('record_id', recordIds);

  await supabase
    .from('file_entries')
    .update({ is_deleted: true })
    .eq('source_module_id', moduleId)
    .in('source_record_id', recordIds);

  await supabase
    .from('file_folders')
    .delete()
    .eq('module_id', moduleId)
    .in('record_id', recordIds);

  await supabase
    .from('record_files')
    .delete()
    .eq('module_id', moduleId)
    .in('record_id', recordIds);

  await supabase
    .from('record_files')
    .delete()
    .eq('source_module_id', moduleId)
    .in('source_record_id', recordIds);
};

const runDeleteModuleRecordsFallback = async (args: {
  moduleId: string;
  moduleConfig: ModuleDefinition;
  recordIds: string[];
  options: DeleteModuleRecordsOptions;
  relationReferences: ReturnType<typeof findModuleRelationReferences>;
}) => {
  const { moduleId, moduleConfig, recordIds, options, relationReferences } = args;
  const recordRows = await fetchRecordRowsForDelete(moduleId, moduleConfig, recordIds);
  const recordById = new Map(
    recordRows
      .map((row) => [normalizeText(row?.id), row] as const)
      .filter(([recordId]) => !!recordId)
  );

  for (const recordId of recordIds) {
    const record = recordById.get(recordId) || { id: recordId };
    const recordTitle = getRecordTitle(record, moduleConfig, { fallback: '' }) || null;
    const processRuns = await fetchProcessRunsForRecord(moduleId, recordId);
    const processRunIds = processRuns
      .map((row: any) => normalizeText(row?.id))
      .filter(Boolean);
    const runsToDelete = processRuns
      .filter((row: any) => {
        if (options.processMode === 'none') return false;
        if (options.processMode === 'all') return true;
        return !COMPLETED_PROCESS_STATUSES.has(normalizeText(row?.status).toLowerCase());
      })
      .map((row: any) => normalizeText(row?.id))
      .filter(Boolean);
    const runIdsToDelete = Array.from(new Set(runsToDelete));
    const runIdsToKeep = processRunIds.filter((runId) => !runIdsToDelete.includes(runId));

    const directTaskRows = await fetchDirectTaskRowsForRecord(moduleId, recordId);
    const directTaskIdsToDelete = directTaskRows
      .filter((row: any) => {
        const processRunId = normalizeText(row?.process_run_id);
        return !processRunId || !runIdsToDelete.includes(processRunId);
      })
      .map((row: any) => normalizeText(row?.id))
      .filter(Boolean);

    if (options.deletePayments) {
      const paymentOperationIds = await fetchPaymentOperationIdsForRecord(moduleId, recordId);
      if (paymentOperationIds.length > 0) {
        await moveModuleRecordsToRecycleBin('cash_bank_operations', paymentOperationIds);
      }
    } else {
      await detachCashBankOperationsForRecord(moduleId, recordId, recordTitle);
    }

    if (runIdsToDelete.length > 0) {
      if (!options.deleteRelatedActivities) {
        await detachTasksFromProcessRunIds(runIdsToDelete);
      }
      await moveModuleRecordsToRecycleBin('process_runs', runIdsToDelete);
    }

    if (runIdsToKeep.length > 0 || options.processMode === 'none') {
      await reassignOrDetachProcessRunLinks({
        moduleId,
        recordId,
        replacementRecordId: options.replacementRecordId,
        runIds: options.processMode === 'none' ? processRunIds : runIdsToKeep,
      });
    }

    if (options.deleteRelatedActivities && directTaskIdsToDelete.length > 0) {
      await moveModuleRecordsToRecycleBin('tasks', directTaskIdsToDelete);
    }
  }

  if (options.replacementRecordId) {
    const { error: relationError } = await supabase.rpc('merge_module_record_references', {
      p_module_id: moduleId,
      p_survivor_id: options.replacementRecordId,
      p_duplicate_ids: recordIds,
      p_relation_fields: relationReferences,
    });
    if (relationError) throw relationError;

    if (!options.deleteRelatedActivities) {
      const { error: taskUpdateError } = await supabase
        .from('tasks')
        .update({ source_record_id: options.replacementRecordId })
        .eq('source_module_id', moduleId)
        .in('source_record_id', recordIds);
      if (taskUpdateError) throw taskUpdateError;
    }

    if (!options.deleteFiles) {
      await reassignFileRelations(moduleId, recordIds, options.replacementRecordId);
    }
  }

  if (options.deleteFiles) {
    await deleteFileRelations(moduleId, recordIds);
  }

  await moveModuleRecordsToRecycleBin(moduleId, recordIds);

  return {
    deleted_count: recordIds.length,
    module_id: moduleId,
    source_table: moduleConfig.table || moduleId,
    used_fallback: true,
  };
};

export const fetchModuleDeletePreview = async (args: {
  moduleId: string;
  moduleConfig?: ModuleDefinition | null;
  recordIds: Array<string | number>;
  seededRecords?: Record<string, any>[];
}) => {
  const moduleId = normalizeText(args.moduleId);
  const moduleConfig = args.moduleConfig || MODULES[moduleId] || null;
  const recordIds = toUuidArray(args.recordIds);
  const sourceTable = normalizeText(moduleConfig?.table || moduleId);
  if (!moduleId || !moduleConfig || !sourceTable || recordIds.length === 0) {
    return {
      moduleId,
      moduleTitle: getModuleTitleFa(moduleConfig),
      recordCount: recordIds.length,
      recordTitles: [],
      paymentsCount: 0,
      processCount: 0,
      incompleteProcessCount: 0,
      activityCount: 0,
      fileCount: 0,
      hasPayments: false,
      hasProcesses: false,
      hasActivities: false,
      hasFiles: false,
    } satisfies DeleteModuleRecordsPreview;
  }

  const selectedColumns = buildPreviewSelectColumns(moduleConfig);
  const seededEntries = (Array.isArray(args.seededRecords) ? args.seededRecords : [])
    .map((row): [string, Record<string, any>] => [normalizeText(row?.id), row])
    .filter(([id]) => !!id);
  const seededById = new Map<string, Record<string, any>>(
    seededEntries
  );

  let records = recordIds
    .map((recordId) => seededById.get(recordId))
    .filter(Boolean) as Record<string, any>[];

  if (records.length !== recordIds.length) {
    const result = await runSelectWithCompatibleColumns<any[]>({
      cacheKey: `module-delete-preview:${moduleId}`,
      columns: selectedColumns,
      execute: (selectExpr) => supabase
        .from(sourceTable)
        .select(selectExpr)
        .in('id', recordIds),
    });
    if (result.error) throw result.error;
    records = Array.isArray(result.data) ? result.data : [];
  }

  const recordTitles = records
    .map((record) => getRecordTitle(record, moduleConfig, { fallback: '' }))
    .map((title) => normalizeText(title))
    .filter(Boolean);

  const paymentsCount = records.reduce((sum, record) => (
    sum + parseOperationalPayments(record?.payments).length
  ), 0);
  const draftStageCount = records.reduce((sum, record) => sum + countDraftStages(record, moduleConfig), 0);

  const processRunIds = new Set<string>();
  const directRunsResult = await supabase
    .from('process_runs')
    .select('id,status')
    .eq('module_id', moduleId)
    .in('record_id', recordIds);
  if (!directRunsResult.error) {
    (directRunsResult.data || []).forEach((row: any) => {
      const runId = normalizeText(row?.id);
      if (runId) processRunIds.add(runId);
    });
  }

  const linkRunsResult = await supabase
    .from('process_run_links')
    .select('process_run_id')
    .eq('module_id', moduleId)
    .in('record_id', recordIds);
  if (!linkRunsResult.error) {
    (linkRunsResult.data || []).forEach((row: any) => {
      const runId = normalizeText(row?.process_run_id);
      if (runId) processRunIds.add(runId);
    });
  }

  const runIds = Array.from(processRunIds);
  let incompleteProcessCount = 0;
  if (runIds.length > 0) {
    const { data: runRows } = await supabase
      .from('process_runs')
      .select('id,status')
      .in('id', runIds);
    incompleteProcessCount = (runRows || []).filter((row: any) => {
      const status = normalizeText(row?.status).toLowerCase();
      return status !== 'completed' && status !== 'canceled' && status !== 'cancelled';
    }).length;
  }

  const relatedTaskIds = new Set<string>();
  const directTasksResult = await supabase
    .from('tasks')
    .select('id')
    .eq('source_module_id', moduleId)
    .in('source_record_id', recordIds);
  if (!directTasksResult.error) {
    (directTasksResult.data || []).forEach((row: any) => {
      const taskId = normalizeText(row?.id);
      if (taskId) relatedTaskIds.add(taskId);
    });
  }
  if (runIds.length > 0) {
    const processTasksResult = await supabase
      .from('tasks')
      .select('id')
      .in('process_run_id', runIds);
    if (!processTasksResult.error) {
      (processTasksResult.data || []).forEach((row: any) => {
        const taskId = normalizeText(row?.id);
        if (taskId) relatedTaskIds.add(taskId);
      });
    }
  }

  const fileCount = await countFileEntriesForRecords(moduleId, recordIds);
  const processCount = runIds.length + draftStageCount;

  return {
    moduleId,
    moduleTitle: getModuleTitleFa(moduleConfig),
    recordCount: recordIds.length,
    recordTitles,
    paymentsCount,
    processCount,
    incompleteProcessCount,
    activityCount: relatedTaskIds.size,
    fileCount,
    hasPayments: paymentsCount > 0,
    hasProcesses: processCount > 0,
    hasActivities: relatedTaskIds.size > 0,
    hasFiles: fileCount > 0,
  } satisfies DeleteModuleRecordsPreview;
};

export const fetchModuleDeleteReplacementOptions = async (args: {
  moduleId: string;
  excludedRecordIds?: Array<string | number>;
  search?: string;
  limit?: number;
}) => {
  const moduleId = normalizeText(args.moduleId);
  if (!moduleId) return [];
  const excludedIds = new Set(toUuidArray(args.excludedRecordIds || []));
  const field = {
    key: '__delete_replacement__',
    type: FieldType.RELATION,
    relationConfig: {
      targetModule: moduleId,
      targetField: 'name',
    },
  };
  const options = await fetchRelationOptionsForField(supabase, field, {
    search: args.search || '',
    limit: Math.max(10, Math.min(Number(args.limit || 25), 50)),
  });
  return (Array.isArray(options) ? options : []).filter((item: any) => !excludedIds.has(normalizeText(item?.value)));
};

export const deleteModuleRecordsWithOptions = async (args: {
  moduleId: string;
  moduleConfig?: ModuleDefinition | null;
  recordIds: Array<string | number>;
  options?: Partial<DeleteModuleRecordsOptions> | null;
}) => {
  const moduleId = normalizeText(args.moduleId);
  const moduleConfig = args.moduleConfig || MODULES[moduleId] || null;
  const recordIds = toUuidArray(args.recordIds);
  const sourceTable = normalizeText(moduleConfig?.table || moduleId);
  if (!moduleId || !moduleConfig || !sourceTable || recordIds.length === 0) return null;

  const normalizedOptions = normalizeDeleteModuleRecordsOptions(args.options);
  const relationReferences = findModuleRelationReferences(moduleId);
  if (deleteCleanupRpcAvailability === 'missing') {
    return runDeleteModuleRecordsFallback({
      moduleId,
      moduleConfig,
      recordIds,
      options: normalizedOptions,
      relationReferences,
    });
  }
  const { data, error } = await supabase.rpc('delete_module_records_with_cleanup', {
    p_module_id: moduleId,
    p_source_table: sourceTable,
    p_record_ids: recordIds,
    p_relation_fields: relationReferences,
    p_options: normalizedOptions,
  });
  if (error) {
    if (!isMissingDeleteCleanupRpcError(error)) throw error;
    deleteCleanupRpcAvailability = 'missing';
    return runDeleteModuleRecordsFallback({
      moduleId,
      moduleConfig,
      recordIds,
      options: normalizedOptions,
      relationReferences,
    });
  }
  deleteCleanupRpcAvailability = 'available';
  return data;
};
