import {
  PROCESS_TASK_CUSTOM_FIELDS_KEY,
  PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY,
} from './processTaskCustomFields';
import { PROCESS_TASK_STATUS_OPTIONS_KEY } from './processTaskStatusOptions';
import { runSelectWithCompatibleColumns } from './selectCompat';

export const PROCESS_TASK_MODAL_SELECT_COLUMNS = [
  'id',
  'name',
  'status',
  'task_type',
  'description',
  'task_report',
  'tags',
  'image_url',
  'due_date',
  'start_date',
  'wage',
  'weight',
  'sort_order',
  'related_to_module',
  'source_module_id',
  'source_record_id',
  'related_product',
  'related_production_order',
  'project_id',
  'marketing_lead_id',
  'related_customer',
  'related_supplier',
  'related_invoice',
  'purchase_invoice_id',
  'production_line_id',
  'assignee_id',
  'assignee_role_id',
  'assignee_type',
  'source_template_id',
  'process_group_id',
  'process_run_id',
  'process_run_stage_id',
  'recurrence_info',
  'metadata',
  'org_id',
] as const;

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

const normalizeText = (value: unknown) => String(value || '').trim();

const readArrayConfig = (row: any, key: string): any[] => {
  const metadata = parseObject(row?.metadata);
  const direct = row?.[key];
  if (Array.isArray(direct) && direct.length > 0) return direct;
  const nested = metadata?.[key];
  return Array.isArray(nested) ? nested : [];
};

const firstNonEmptyArray = (...values: any[][]) => values.find((value) => Array.isArray(value) && value.length > 0) || [];

export const mergeProcessTaskModalContext = (
  task: Record<string, any>,
  runStage?: Record<string, any> | null,
  templateStage?: Record<string, any> | null,
) => {
  const recurrence = parseObject(task?.recurrence_info);
  const taskMetadata = parseObject(task?.metadata);
  const runStageMetadata = parseObject(runStage?.metadata);
  const templateStageMetadata = parseObject(templateStage?.metadata);
  const customFields = firstNonEmptyArray(
    Array.isArray(recurrence?.[PROCESS_TASK_CUSTOM_FIELDS_KEY]) ? recurrence[PROCESS_TASK_CUSTOM_FIELDS_KEY] : [],
    readArrayConfig(task, PROCESS_TASK_CUSTOM_FIELDS_KEY),
    readArrayConfig(runStage, PROCESS_TASK_CUSTOM_FIELDS_KEY),
    readArrayConfig(templateStage, PROCESS_TASK_CUSTOM_FIELDS_KEY),
  );
  const statusOptions = firstNonEmptyArray(
    Array.isArray(recurrence?.[PROCESS_TASK_STATUS_OPTIONS_KEY]) ? recurrence[PROCESS_TASK_STATUS_OPTIONS_KEY] : [],
    readArrayConfig(task, PROCESS_TASK_STATUS_OPTIONS_KEY),
    readArrayConfig(runStage, PROCESS_TASK_STATUS_OPTIONS_KEY),
    readArrayConfig(templateStage, PROCESS_TASK_STATUS_OPTIONS_KEY),
  );
  const customFieldValues = {
    ...(parseObject(templateStageMetadata?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY])),
    ...(parseObject(runStageMetadata?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY])),
    ...(parseObject(taskMetadata?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY])),
    ...(parseObject(recurrence?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY])),
  };

  return {
    ...task,
    recurrence_info: {
      ...recurrence,
      ...(customFields.length > 0 ? { [PROCESS_TASK_CUSTOM_FIELDS_KEY]: customFields } : {}),
      ...(statusOptions.length > 0 ? { [PROCESS_TASK_STATUS_OPTIONS_KEY]: statusOptions } : {}),
      ...(Object.keys(customFieldValues).length > 0 ? { [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: customFieldValues } : {}),
    },
    metadata: taskMetadata,
    ...(runStage || templateStage ? {
      source_stage: {
        ...(templateStage || {}),
        ...(runStage || {}),
        metadata: {
          ...templateStageMetadata,
          ...runStageMetadata,
        },
      },
    } : {}),
  } as Record<string, any>;
};

export const processTaskModalContextNeedsStage = (task: Record<string, any>) => {
  const recurrence = parseObject(task?.recurrence_info);
  return !Array.isArray(recurrence?.[PROCESS_TASK_CUSTOM_FIELDS_KEY])
    || !Array.isArray(recurrence?.[PROCESS_TASK_STATUS_OPTIONS_KEY]);
};

/**
 * تنها هنگام بازشدن مودال V2، context کامل task/stage را می‌گیرد. این کار
 * عمداً از بار اولیهٔ نمای فشرده و ستونی جداست تا فهرست‌های سنگین نشوند.
 */
export const loadProcessTaskModalContext = async (
  supabaseClient: any,
  task: Record<string, any> | null | undefined,
  options?: {
    taskId?: string | null;
    processRunStageId?: string | null;
  },
) => {
  const suppliedTask = task && typeof task === 'object' ? task : {};
  const hasExplicitTaskId = Boolean(options && Object.prototype.hasOwnProperty.call(options, 'taskId'));
  const taskId = normalizeText(hasExplicitTaskId ? options?.taskId : (suppliedTask?.id || suppliedTask?.task_id));
  let taskRow: Record<string, any> = suppliedTask;

  if (taskId) {
    const result = await runSelectWithCompatibleColumns<any>({
      cacheKey: 'tasks:modal',
      columns: PROCESS_TASK_MODAL_SELECT_COLUMNS,
      execute: (selectExpr) => supabaseClient
        .from('tasks')
        .select(selectExpr)
        .eq('id', taskId)
        .maybeSingle(),
    });
    if (result?.error) throw result.error;
    if (result?.data) {
      taskRow = {
        ...suppliedTask,
        ...result.data,
        recurrence_info: {
          ...parseObject(suppliedTask?.recurrence_info),
          ...parseObject(result.data?.recurrence_info),
        },
        metadata: {
          ...parseObject(suppliedTask?.metadata),
          ...parseObject(result.data?.metadata),
        },
      };
    }
  }

  const runStageId = normalizeText(options?.processRunStageId || taskRow?.process_run_stage_id);
  let runStage: any = null;
  if (runStageId || (taskId && processTaskModalContextNeedsStage(taskRow))) {
    try {
      let query = supabaseClient
        .from('process_run_stages')
        .select('id,process_run_id,template_stage_id,stage_name,sort_order,status,task_id,metadata');
      query = runStageId ? query.eq('id', runStageId) : query.eq('task_id', taskId);
      const result = await query.maybeSingle();
      if (!result.error) runStage = result.data || null;
    } catch {
      runStage = null;
    }
  }

  const templateStageId = normalizeText(runStage?.template_stage_id);
  let templateStage: any = null;
  if (templateStageId) {
    try {
      const result = await supabaseClient
        .from('process_template_stages')
        .select('id,template_id,stage_name,sort_order,metadata')
        .eq('id', templateStageId)
        .maybeSingle();
      if (!result.error) templateStage = result.data || null;
    } catch {
      templateStage = null;
    }
  }

  return mergeProcessTaskModalContext(taskRow, runStage, templateStage);
};
