import { MODULES } from '../moduleRegistry';
import { FieldType, ModuleField } from '../types';
import { buildResolvedAssigneeCombo, normalizeTaskAssigneeRowsForDirectory, parseAssigneeValue } from './assigneeValue';
import {
  buildTaskSourceInitialValues,
} from './taskMeta';
import { TASK_AUTOMATION_SELECT } from './taskUpdateRuntime';
import { fetchAssigneeDirectory } from './referenceData';
import {
  PROCESS_TASK_CUSTOM_FIELDS_KEY,
  PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY,
  getProcessTaskCustomFieldsFromStage,
  mergeProcessTaskCustomFieldValues,
} from './processTaskCustomFields';
import {
  PROCESS_TASK_STATUS_OPTIONS_KEY,
  getProcessTaskStatusOptionsFromStage,
  getTaskStatusLabel,
} from './processTaskStatusOptions';
import { normalizeProcessAutomationRules } from './processAutomationTypes';
import {
  getProcessStageLaneKey,
  getProcessStageNodeKey,
  materializeLegacyProcessGraph,
} from './processGraph';
import {
  computeProcessStageDueDate,
  normalizeProcessDueAnchor,
} from './processSchedule';
import {
  ensureProcessRunContextsForStageGroups,
  ensureProcessRunForDraftStageGroup,
  getDraftStageProcessGroupMeta,
  resolveProcessRunStageId,
  syncProcessRunStageFromTask,
} from './processRunRuntime';
import {
  assignProcessTemplateModuleAliases,
  resolveProcessTemplateTokenValue,
} from './processTemplateContext';
import {
  createProcessLinkedFieldKey,
  mergeProcessLinkMaps,
  normalizeProcessTargetModuleIds,
  parseProcessLinkMap,
} from './processTargets';
import { WORKFLOW_ASSIGNEE_FIELD_KEY } from './workflowTypes';

type AutoAssignArgs = {
  supabaseClient: any;
  moduleId: string;
  recordId: string;
  recordData?: Record<string, any> | null;
  draftStages: Record<string, any>[];
  targetGroupId?: string | null;
  targetStageId?: string | null;
};

type AutoAssignResult = {
  createdCount: number;
  skippedCount: number;
  groupIds: string[];
  createdTasks?: Record<string, any>[];
  missingAssigneeCount?: number;
};

const TEMPLATE_TOKEN_REGEX = /\{\{\s*([^}]+)\s*\}\}/g;
const EXACT_TEMPLATE_TOKEN_REGEX = /^\s*\{\{\s*([^}]+)\s*\}\}\s*$/;

const normalizeText = (value: unknown) => String(value || '').trim();
const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalizeDbUuid = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return '';
  const stripped = raw.replace(/^(process_run_stage|process_run|process_template_stage|process_template|task|user|role)[_:]/i, '');
  return UUID_LIKE_RE.test(stripped) ? stripped : '';
};

const isMissingColumnError = (error: any, columnName: string) => {
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const normalizedColumn = columnName.toLowerCase();
  return (
    error?.code === '42703'
    || error?.code === 'PGRST204'
    || message.includes(`'${normalizedColumn}'`)
    || message.includes(`"${normalizedColumn}"`)
    || message.includes(`column ${normalizedColumn}`)
    || message.includes(`schema cache`)
  );
};

const extractMissingColumnNames = (error: any) => {
  const text = String(error?.message || error?.details || error?.hint || '');
  const found = new Set<string>();
  [
    /'([^']+)' column/gi,
    /column "([^"]+)"/gi,
    /column ([a-zA-Z0-9_]+) does not exist/gi,
  ].forEach((pattern) => {
    let match = pattern.exec(text);
    while (match) {
      const normalized = normalizeText(match?.[1]);
      if (normalized) found.add(normalized);
      match = pattern.exec(text);
    }
  });
  return Array.from(found);
};

const removeColumnsFromRows = (rows: Record<string, any>[], columns: string[]) => (
  rows.map((row) => {
    const next = { ...row };
    columns.forEach((column) => {
      delete next[column];
    });
    return next;
  })
);

const parseObject = (value: any): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const stringifyTemplateValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(stringifyTemplateValue).filter(Boolean).join('، ');
  if (typeof value === 'object') return normalizeText(value.title || value.name || value.label || value.system_code || value.id);
  return String(value);
};

const coerceResolvedTemplateValue = (value: any, fieldType?: FieldType) => {
  if (!fieldType) return value;
  if (fieldType === FieldType.CHECKBOX) {
    if (typeof value === 'boolean') return value;
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return Boolean(value);
  }
  if ([FieldType.NUMBER, FieldType.PRICE, FieldType.PERCENTAGE, FieldType.STOCK].includes(fieldType)) {
    if (typeof value === 'number') return value;
    const parsed = parseFloat(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  if ([FieldType.MULTI_SELECT, FieldType.TAGS].includes(fieldType)) {
    if (Array.isArray(value)) return value;
    const normalized = normalizeText(value);
    return normalized ? normalized.split(',').map((item) => item.trim()).filter(Boolean) : [];
  }
  return value;
};

export const renderProcessV2TemplateValueFromRecord = (rawValue: any, record: Record<string, any>, fieldType?: FieldType) => {
  if (typeof rawValue !== 'string') return rawValue;
  const exactMatch = rawValue.match(EXACT_TEMPLATE_TOKEN_REGEX);
  if (exactMatch) {
    const tokenKey = normalizeText(exactMatch[1]);
    return coerceResolvedTemplateValue(resolveProcessTemplateTokenValue(record, tokenKey), fieldType);
  }
  return String(rawValue || '').replace(TEMPLATE_TOKEN_REGEX, (_token, key: string) => (
    stringifyTemplateValue(resolveProcessTemplateTokenValue(record, normalizeText(key))) || _token
  ));
};

const resolveProcessTaskCustomFieldsFromRecord = (
  fields: ModuleField[],
  record: Record<string, any>,
) => fields.map((field) => ({
  ...field,
  defaultValue: renderProcessV2TemplateValueFromRecord(field?.defaultValue, record, field.type),
}));

const assignProcessLinkedRecordFields = (
  target: Record<string, any>,
  moduleId: string | null | undefined,
  record: Record<string, any> | null | undefined,
) => {
  const normalizedModuleId = normalizeText(moduleId);
  if (!normalizedModuleId || !record) return;
  Object.entries(record).forEach(([fieldKey, value]) => {
    target[createProcessLinkedFieldKey(normalizedModuleId, fieldKey)] = value;
  });
  assignProcessTemplateModuleAliases(target, normalizedModuleId, record);
  target[createProcessLinkedFieldKey(normalizedModuleId, WORKFLOW_ASSIGNEE_FIELD_KEY)] = buildResolvedAssigneeCombo(record);
};

const getModuleTable = (moduleId: string) => MODULES[moduleId]?.table || moduleId;

const MINIMAL_RECORD_DATA_KEYS = new Set([
  'id',
  'org_id',
  'module_id',
  'module_ids',
  'process_group_id',
  'process_template_id',
  'template_id',
  'template_name',
  'created_at',
  'updated_at',
]);

const hasUsableTemplateRecordData = (provided?: Record<string, any> | null) => {
  if (!provided || typeof provided !== 'object') return false;
  return Object.keys(provided).some((key) => {
    if (!key || MINIMAL_RECORD_DATA_KEYS.has(key)) return false;
    const value = provided[key];
    return value !== undefined && value !== null && String(value).trim() !== '';
  });
};

const loadRecord = async (supabaseClient: any, moduleId: string, recordId: string, provided?: Record<string, any> | null) => {
  if (hasUsableTemplateRecordData(provided)) return provided;
  const { data, error } = await supabaseClient
    .from(getModuleTable(moduleId))
    .select('*')
    .eq('id', recordId)
    .maybeSingle();
  if (error) throw error;
  return data || {};
};

export const buildProcessV2TemplateContext = async ({
  supabaseClient,
  moduleId,
  recordId,
  recordData,
  processLinkMap,
  taskName,
  taskType,
  dueDate,
  previousTask,
}: {
  supabaseClient: any;
  moduleId: string;
  recordId: string;
  recordData?: Record<string, any> | null;
  processLinkMap?: Record<string, any> | null;
  taskName?: string | null;
  taskType?: string | null;
  dueDate?: string | null;
  previousTask?: Record<string, any> | null;
}) => {
  const record: Record<string, any> = {
    task_name: normalizeText(taskName),
    task_type: normalizeText(taskType),
    task_status: 'todo',
    status_label: getTaskStatusLabel('todo'),
    task_status_label: getTaskStatusLabel('todo'),
    task_due_date: dueDate || '',
  };
  const cache = new Map<string, Record<string, any>>();
  const source = await loadRecord(supabaseClient, moduleId, recordId, recordData).catch(() => recordData || {});
  Object.assign(record, source || {});
  record[WORKFLOW_ASSIGNEE_FIELD_KEY] = buildResolvedAssigneeCombo(source);
  assignProcessLinkedRecordFields(record, moduleId, source);

  const effectiveLinks = mergeProcessLinkMaps({ [moduleId]: recordId }, processLinkMap || {});
  await Promise.all(Object.entries(effectiveLinks).map(async ([linkedModuleId, linkedRecordId]) => {
    const normalizedModuleId = normalizeText(linkedModuleId);
    const normalizedRecordId = normalizeText(linkedRecordId);
    if (!normalizedModuleId || !normalizedRecordId) return;
    if (normalizedModuleId === moduleId && normalizedRecordId === recordId) return;
    const cacheKey = `${normalizedModuleId}:${normalizedRecordId}`;
    let linkedRecord = cache.get(cacheKey);
    if (!linkedRecord) {
      const { data, error } = await supabaseClient
        .from(getModuleTable(normalizedModuleId))
        .select('*')
        .eq('id', normalizedRecordId)
        .maybeSingle();
      if (error || !data) return;
      linkedRecord = data as Record<string, any>;
      cache.set(cacheKey, linkedRecord);
    }
    assignProcessLinkedRecordFields(record, normalizedModuleId, linkedRecord);
  }));

  if (previousTask && typeof previousTask === 'object') {
    Object.entries(previousTask).forEach(([key, value]) => {
      record[`previous_task_${key}`] = value;
    });
  }

  return record;
};

const resolveStageAssignee = (stage: Record<string, any>, context: Record<string, any>) => {
  const metadata = parseObject(stage?.metadata);
  const recurrence = parseObject(stage?.recurrence_info);
  const resolveAssigneeReference = (value: any) => {
    const normalized = normalizeText(value);
    if (!normalized.startsWith('field:')) return value;
    const fieldKey = normalized.replace(/^field:/, '').trim();
    return context[fieldKey] || '';
  };
  const roleValue = parseAssigneeValue(
    resolveAssigneeReference(stage?.default_assignee_role_id
      || stage?.assignee_role_id
      || metadata?.default_assignee_role_id
      || metadata?.assignee_role_id
      || recurrence?.default_assignee_role_id
      || recurrence?.assignee_role_id),
    'role',
  );
  if (roleValue.assigneeType === 'role' && roleValue.assigneeId) {
    return { assigneeType: 'role' as const, assigneeId: roleValue.assigneeId };
  }

  const rawUserValue = resolveAssigneeReference(stage?.default_assignee_id
    || stage?.assignee_id
    || stage?.assignee_user_id
    || metadata?.default_assignee_id
    || metadata?.assignee_id
    || metadata?.assignee_user_id
    || recurrence?.default_assignee_id
    || recurrence?.assignee_id
    || recurrence?.assignee_user_id);

  const userValue = parseAssigneeValue(rawUserValue, 'user');
  if (userValue.assigneeType && userValue.assigneeId) {
    return { assigneeType: userValue.assigneeType, assigneeId: userValue.assigneeId };
  }
  const referenceValue = resolveAssigneeReference(stage?.default_assignee_combo
    || metadata?.default_assignee_combo
    || recurrence?.default_assignee_combo
    || stage?.default_assignee_field
    || metadata?.default_assignee_field
    || recurrence?.default_assignee_field);
  const referenceAssignee = parseAssigneeValue(referenceValue, null);
  if (referenceAssignee.assigneeType && referenceAssignee.assigneeId) {
    return { assigneeType: referenceAssignee.assigneeType, assigneeId: referenceAssignee.assigneeId };
  }
  return { assigneeType: null, assigneeId: null };
};

const buildStageIdentity = (stage: Record<string, any>) => {
  const meta = getDraftStageProcessGroupMeta(stage);
  const nodeKey = getProcessStageNodeKey(stage);
  const sortOrder = Number(stage?.sort_order || 0);
  const name = normalizeText(stage?.name || stage?.stage_name || stage?.title).toLowerCase();
  if (sortOrder > 0 && name) return [`${meta.groupId}:sort-name:${sortOrder}:${name}`];
  if (nodeKey) return [`${meta.groupId}:node:${nodeKey}`];
  if (name) return [`${meta.groupId}:name:${name}`];
  return [`${meta.groupId}:stage:${JSON.stringify(stage).slice(0, 120)}`];
};

const loadExistingProcessTasks = async (supabaseClient: any, moduleId: string, recordId: string) => {
  const { data, error } = await supabaseClient
    .from('tasks')
    .select('id, name, status, source_template_id, source_stage_sort_order, process_group_id, process_run_id, process_run_stage_id, process_node_key, process_lane_key, assignee_id, assignee_role_id, due_date, recurrence_info')
    .eq('source_module_id', moduleId)
    .eq('source_record_id', recordId);
  if (error) return [];
  return Array.isArray(data) ? data : [];
};

const getExistingIdentitySet = (tasks: Record<string, any>[]) => {
  const set = new Set<string>();
  tasks.forEach((task) => {
    const recurrence = parseObject(task?.recurrence_info);
    const groupId = normalizeText(task?.process_group_id || recurrence?.process_group?.id);
    if (!groupId) return;
    const nodeKey = normalizeText(task?.process_node_key || recurrence?.process_node_key);
    if (nodeKey) set.add(`${groupId}:node:${nodeKey}`);
    const sortOrder = Number(task?.source_stage_sort_order || 0);
    const name = normalizeText(task?.name).toLowerCase();
    if (sortOrder > 0 && name) set.add(`${groupId}:sort-name:${sortOrder}:${name}`);
    if (!nodeKey && name) set.add(`${groupId}:name:${name}`);
  });
  return set;
};

const insertTasksWithFallback = async (
  supabaseClient: any,
  rows: Record<string, any>[],
  directory: any,
) => {
  let payload = normalizeTaskAssigneeRowsForDirectory(
    (Array.isArray(rows) ? rows : []).map((row) => ({ ...(row || {}) })),
    directory,
  );
  if (payload.length === 0) return [] as Record<string, any>[];

  const optionalColumns = [
    'assignee_id',
    'assignee_type',
    'assignee_role_id',
    'due_date',
    'description',
    'task_type',
    'task_report',
    'wage',
    'weight',
    'sort_order',
    'created_by',
    'produced_qty',
    'related_to_module',
    'related_production_order',
    'related_invoice',
    'related_customer',
    'project_id',
    'purchase_invoice_id',
    'marketing_lead_id',
    'source_module_id',
    'source_record_id',
    'source_template_id',
    'source_stage_sort_order',
    'process_group_id',
    'process_run_id',
    'process_run_stage_id',
    'process_node_key',
    'process_lane_key',
    'blocked_reason',
    'waiting_for_task_type',
    'escalation_level',
    'production_line_id',
    'production_shelf_id',
    'recurrence_info',
  ];
  const fkConstraintColumns: Array<{ constraint: string; column: string }> = [
    { constraint: 'tasks_project_id_fkey', column: 'project_id' },
    { constraint: 'tasks_purchase_invoice_id_fkey', column: 'purchase_invoice_id' },
    { constraint: 'tasks_marketing_lead_id_fkey', column: 'marketing_lead_id' },
    { constraint: 'tasks_assignee_role_id_fkey', column: 'assignee_role_id' },
    { constraint: 'tasks_production_line_id_fkey', column: 'production_line_id' },
    { constraint: 'tasks_production_shelf_id_fkey', column: 'production_shelf_id' },
  ];

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabaseClient
      .from('tasks')
      .insert(payload)
      .select(TASK_AUTOMATION_SELECT);
    if (!error) return Array.isArray(data) ? data : [];

    const payloadColumns = Array.from(new Set(payload.flatMap((row) => Object.keys(row || {}))));
    const removable = optionalColumns.filter((columnName) =>
      payloadColumns.includes(columnName) && isMissingColumnError(error, columnName)
    );
    const missingColumns = extractMissingColumnNames(error)
      .filter((columnName) => payloadColumns.includes(columnName));
    const errorText = String(error?.message || error?.details || error?.hint || '').toLowerCase();
    const fkRemovable = fkConstraintColumns
      .filter((item) => errorText.includes(item.constraint))
      .map((item) => item.column)
      .filter((columnName) => payloadColumns.includes(columnName));
    let merged = Array.from(new Set([...removable, ...missingColumns, ...fkRemovable]));
    if (!merged.length && (errorText.includes('column') || errorText.includes('schema cache'))) {
      const fallbackColumn = optionalColumns.find((columnName) => payloadColumns.includes(columnName));
      if (fallbackColumn) merged = [fallbackColumn];
    }
    if (!merged.length) throw error;
    payload = removeColumnsFromRows(payload, merged);
  }

  return [] as Record<string, any>[];
};

const syncProcessRunLinks = async (
  supabaseClient: any,
  processRunId: string | null | undefined,
  links: Record<string, any>,
  primaryModuleId: string,
  primaryRecordId: string,
) => {
  const normalizedRunId = normalizeDbUuid(processRunId);
  if (!supabaseClient || !normalizedRunId) return;
  const { data: runRow, error: runError } = await supabaseClient
    .from('process_runs')
    .select('org_id')
    .eq('id', normalizedRunId)
    .maybeSingle();
  if (runError || !runRow?.org_id) return;
  const normalizedOrgId = normalizeDbUuid(runRow.org_id);
  const normalizedPrimaryRecordId = normalizeDbUuid(primaryRecordId);
  const rows: Array<{
    org_id: string;
    process_run_id: string;
    module_id: string;
    record_id: string;
    is_primary: boolean;
  }> = [];
  Object.entries(parseProcessLinkMap(links)).forEach(([moduleId, recordId]) => {
    const normalizedLinkedRecordId = normalizeDbUuid(recordId);
    const normalizedLinkedModuleId = normalizeText(moduleId);
    if (!normalizedOrgId || !normalizedLinkedModuleId || !normalizedLinkedRecordId) return;
    rows.push({
      org_id: normalizedOrgId,
      process_run_id: normalizedRunId,
      module_id: normalizedLinkedModuleId,
      record_id: normalizedLinkedRecordId,
      is_primary: normalizedLinkedModuleId === primaryModuleId && normalizedLinkedRecordId === normalizedPrimaryRecordId,
    });
  });
  if (rows.length === 0) return;
  const { error } = await supabaseClient
    .from('process_run_links')
    .upsert(rows, { onConflict: 'process_run_id,module_id,record_id' });
  if (error && !isMissingColumnError(error, 'process_run_links')) {
    throw error;
  }
};

export const autoAssignProcessV2DraftStages = async ({
  supabaseClient,
  moduleId,
  recordId,
  recordData,
  draftStages,
  targetGroupId,
  targetStageId,
}: AutoAssignArgs): Promise<AutoAssignResult> => {
  const normalizedModuleId = normalizeText(moduleId);
  const normalizedRecordId = normalizeDbUuid(recordId);
  if (!supabaseClient || !normalizedModuleId || !normalizedRecordId) {
    return { createdCount: 0, skippedCount: 0, groupIds: [], missingAssigneeCount: 0 };
  }

  const graphSnapshot = materializeLegacyProcessGraph(Array.isArray(draftStages) ? draftStages : []);
  const normalizedTargetGroupId = normalizeText(targetGroupId);
  const normalizedTargetStageId = normalizeText(targetStageId);
  const stageRows = graphSnapshot.stages
    .filter((stage: any) => normalizeText(stage?.name || stage?.stage_name || stage?.title))
    .filter((stage: any) => !normalizedTargetGroupId || getDraftStageProcessGroupMeta(stage).groupId === normalizedTargetGroupId)
    .filter((stage: any) => {
      if (!normalizedTargetStageId) return true;
      return [
        stage?.id,
        stage?.template_stage_id,
        getProcessStageNodeKey(stage),
      ].map(normalizeText).includes(normalizedTargetStageId);
    })
    .sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
  if (stageRows.length === 0) return { createdCount: 0, skippedCount: 0, groupIds: [], missingAssigneeCount: 0 };

  const [{ data: authData }, sourceRecord, directory, existingTasks] = await Promise.all([
    supabaseClient.auth.getUser(),
    loadRecord(supabaseClient, normalizedModuleId, normalizedRecordId, recordData),
    fetchAssigneeDirectory(supabaseClient),
    loadExistingProcessTasks(supabaseClient, normalizedModuleId, normalizedRecordId),
  ]);
  const currentUserId = normalizeDbUuid(authData?.user?.id) || null;
  const existingIdentity = getExistingIdentitySet(existingTasks);
  const creatableStages = stageRows.filter((stage) => {
    const keys = buildStageIdentity(stage);
    if (keys.some((key) => existingIdentity.has(key))) return false;
    keys.forEach((key) => existingIdentity.add(key));
    return true;
  });

  if (creatableStages.length === 0) {
    return {
      createdCount: 0,
      skippedCount: stageRows.length,
      groupIds: Array.from(new Set(stageRows.map((stage) => getDraftStageProcessGroupMeta(stage).groupId))),
      missingAssigneeCount: 0,
    };
  }

  const baseDateValue = sourceRecord?.start_date || sourceRecord?.invoice_date || sourceRecord?.created_at || new Date().toISOString();
  const baseDate = Number.isNaN(new Date(baseDateValue).getTime()) ? new Date() : new Date(baseDateValue);
  const dueByStageKey = new Map<Record<string, any>, string | null>();
  const startByStageKey = new Map<Record<string, any>, string | null>();
  creatableStages.forEach((stage) => {
    const metadata = stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {};
    const manualDue = normalizeText(stage?.due_date || metadata?.due_date) || null;
    const dueAt = computeProcessStageDueDate({
      stage,
      stages: graphSnapshot.stages,
      processStartedAt: baseDate,
      graph: graphSnapshot.graph,
    });
    dueByStageKey.set(stage, manualDue || (dueAt ? dueAt.toISOString() : null));
    const manualStart = normalizeText(stage?.start_date || metadata?.start_date) || null;
    const startAnchorStage = {
      ...stage,
      duration_from: normalizeText(stage?.start_duration_from || metadata?.start_duration_from || metadata?.duration_start_from || 'project_start') || 'project_start',
      duration_value: Number(stage?.start_duration_value ?? metadata?.start_duration_value ?? metadata?.duration_start_value ?? 0) || 0,
      duration_unit: normalizeText(stage?.start_duration_unit || metadata?.start_duration_unit || metadata?.duration_start_unit || 'day') === 'hour' ? 'hour' : 'day',
      due_anchor_stage_node_key: normalizeText(stage?.start_anchor_stage_node_key || metadata?.start_anchor_stage_node_key) || null,
      metadata: {
        ...metadata,
        duration_from: normalizeText(stage?.start_duration_from || metadata?.start_duration_from || metadata?.duration_start_from || 'project_start') || 'project_start',
        duration_value: Number(stage?.start_duration_value ?? metadata?.start_duration_value ?? metadata?.duration_start_value ?? 0) || 0,
        duration_unit: normalizeText(stage?.start_duration_unit || metadata?.start_duration_unit || metadata?.duration_start_unit || 'day') === 'hour' ? 'hour' : 'day',
        due_anchor_stage_node_key: normalizeText(stage?.start_anchor_stage_node_key || metadata?.start_anchor_stage_node_key) || null,
      },
    };
    const startAt = computeProcessStageDueDate({
      stage: startAnchorStage,
      stages: graphSnapshot.stages,
      processStartedAt: baseDate,
      graph: graphSnapshot.graph,
    });
    startByStageKey.set(stage, manualStart || (startAt ? startAt.toISOString() : null));
  });

  const processRunContexts = await ensureProcessRunContextsForStageGroups(
    creatableStages,
    async (firstStage) => ensureProcessRunForDraftStageGroup({
      supabaseClient,
      moduleId: normalizedModuleId,
      recordId: normalizedRecordId,
      stages: graphSnapshot.stages,
      targetStage: firstStage,
      currentUserId,
    })
  );

  const payload: Record<string, any>[] = [];
  let runtimeSkippedCount = 0;
  let missingAssigneeCount = 0;
  let previousResolvedTask: Record<string, any> | null = null;
  for (const [index, stage] of creatableStages.entries()) {
    const stageMeta = getDraftStageProcessGroupMeta(stage);
    const recurrenceBase = parseObject(stage?.recurrence_info);
    const processLinkMap = mergeProcessLinkMaps(
      stage?.process_link_map && typeof stage.process_link_map === 'object' ? stage.process_link_map : {},
      recurrenceBase?.process_links && typeof recurrenceBase.process_links === 'object' ? recurrenceBase.process_links : {},
    );
    const effectiveProcessLinkMap = mergeProcessLinkMaps({ [normalizedModuleId]: normalizedRecordId }, processLinkMap);
    const dueDate = dueByStageKey.get(stage) || null;
    const startDate = startByStageKey.get(stage) || null;
    const stageMetadata = parseObject(stage?.metadata);
    const rawStageName = normalizeText(
      stage?.name
      || stage?.stage_name
      || stage?.title
      || stageMetadata?.name
      || stageMetadata?.stage_name
      || `مرحله ${index + 1}`
    );
    const stageTaskType = normalizeText(stage?.task_type || recurrenceBase?.task_type || stageMetadata?.task_type) || null;
    const stageDescription = normalizeText(stage?.description || recurrenceBase?.description || stageMetadata?.description) || null;
    const templateContext = await buildProcessV2TemplateContext({
      supabaseClient,
      moduleId: normalizedModuleId,
      recordId: normalizedRecordId,
      recordData: sourceRecord,
      processLinkMap: effectiveProcessLinkMap,
      taskName: rawStageName,
      taskType: stageTaskType,
      dueDate,
      previousTask: previousResolvedTask,
    });
    const resolvedStageName = normalizeText(renderProcessV2TemplateValueFromRecord(rawStageName, templateContext, FieldType.TEXT) ?? rawStageName) || rawStageName;
    const resolvedDescription = normalizeText(renderProcessV2TemplateValueFromRecord(stageDescription, {
      ...templateContext,
      task_name: resolvedStageName,
    }, FieldType.LONG_TEXT) ?? stageDescription) || null;
    const stageCustomFields = getProcessTaskCustomFieldsFromStage(stage);
    const resolvedStageCustomFields = resolveProcessTaskCustomFieldsFromRecord(stageCustomFields, {
      ...templateContext,
      task_name: resolvedStageName,
      description: resolvedDescription || '',
    });
    const rawStageCustomFieldValues = {
      ...(recurrenceBase?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] && typeof recurrenceBase[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] === 'object' ? recurrenceBase[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] : {}),
      ...(stageMetadata?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] && typeof stageMetadata[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] === 'object' ? stageMetadata[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] : {}),
      ...(stage?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] && typeof stage[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] === 'object' ? stage[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY] : {}),
    };
    const renderedStageCustomFieldValues = resolvedStageCustomFields.reduce<Record<string, any>>((acc, field) => {
      const key = normalizeText(field?.key);
      if (!key || !Object.prototype.hasOwnProperty.call(rawStageCustomFieldValues, key)) return acc;
      acc[key] = renderProcessV2TemplateValueFromRecord(rawStageCustomFieldValues[key], templateContext, field.type);
      return acc;
    }, {});
    const stageCustomFieldValues = mergeProcessTaskCustomFieldValues(resolvedStageCustomFields, renderedStageCustomFieldValues);
    const assignee = resolveStageAssignee(stage, templateContext);
    if (!assignee.assigneeType || !normalizeDbUuid(assignee.assigneeId)) {
      runtimeSkippedCount += 1;
      missingAssigneeCount += 1;
      continue;
    }
    const stageAutomationRules = normalizeProcessAutomationRules(stage?.automation_rules);
    const stageCustomStatusOptions = getProcessTaskStatusOptionsFromStage(stage);
    const stageTargetModuleIds = normalizeProcessTargetModuleIds(
      stage?.process_target_module_ids || recurrenceBase?.process_target_module_ids,
      normalizedModuleId,
    );
    const processRunContext = processRunContexts.get(stageMeta.groupId) || {
      processRunId: null,
      processRunStageId: null,
      stageMap: new Map<string, string>(),
    };
    const processRunStageId = resolveProcessRunStageId(processRunContext.stageMap, stage);
    if (processRunContext.processRunId && !processRunStageId) {
      runtimeSkippedCount += 1;
      continue;
    }
    await syncProcessRunLinks(
      supabaseClient,
      processRunContext.processRunId,
      effectiveProcessLinkMap,
      normalizedModuleId,
      normalizedRecordId,
    );

    const taskRow = {
      name: resolvedStageName,
      status: 'todo',
      source_template_id: normalizeDbUuid(stageMeta.templateId) || null,
      source_stage_sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
      process_group_id: stageMeta.groupId,
      process_run_id: normalizeDbUuid(processRunContext.processRunId) || null,
      process_run_stage_id: normalizeDbUuid(processRunStageId) || null,
      process_node_key: getProcessStageNodeKey(stage),
      process_lane_key: getProcessStageLaneKey(stage),
      production_line_id: null,
      production_shelf_id: null,
      produced_qty: 0,
      description: resolvedDescription,
      task_type: stageTaskType,
      assignee_type: assignee.assigneeType,
      assignee_id: assignee.assigneeType === 'user' ? (normalizeDbUuid(assignee.assigneeId) || null) : null,
      assignee_role_id: assignee.assigneeType === 'role' ? (normalizeDbUuid(assignee.assigneeId) || null) : null,
      wage: Number(stage?.wage ?? stageMetadata?.wage ?? recurrenceBase?.wage ?? 0),
      weight: Number(stage?.weight ?? stageMetadata?.weight ?? recurrenceBase?.weight ?? 0),
      sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
      due_date: dueDate,
      start_date: startDate,
      created_by: currentUserId,
      recurrence_info: {
        ...recurrenceBase,
        ...(stageTaskType ? { task_type: stageTaskType } : {}),
        process_automation_rules: stageAutomationRules,
        process_target_module_ids: stageTargetModuleIds,
        process_links: effectiveProcessLinkMap,
        process_run_id: normalizeDbUuid(processRunContext.processRunId) || null,
        process_run_stage_id: normalizeDbUuid(processRunStageId) || null,
        process_node_key: getProcessStageNodeKey(stage),
        process_lane_key: getProcessStageLaneKey(stage),
        process_graph: graphSnapshot.graph,
        due_anchor_type: normalizeProcessDueAnchor(stage).type,
        due_anchor_stage_node_key: normalizeProcessDueAnchor(stage).stageNodeKey,
        duration_value: Number(stage?.duration_value || stage?.metadata?.duration_value || 0),
        duration_unit: normalizeText(stage?.duration_unit || stage?.metadata?.duration_unit || 'day') || 'day',
        start_date: startDate,
        start_duration_from: normalizeText(stage?.start_duration_from || stage?.metadata?.start_duration_from || stage?.metadata?.duration_start_from || ''),
        start_duration_value: Number(stage?.start_duration_value ?? stage?.metadata?.start_duration_value ?? stage?.metadata?.duration_start_value ?? 0) || 0,
        start_duration_unit: normalizeText(stage?.start_duration_unit || stage?.metadata?.start_duration_unit || stage?.metadata?.duration_start_unit || 'day') || 'day',
        start_anchor_stage_node_key: normalizeText(stage?.start_anchor_stage_node_key || stage?.metadata?.start_anchor_stage_node_key || ''),
        [PROCESS_TASK_CUSTOM_FIELDS_KEY]: resolvedStageCustomFields,
        [PROCESS_TASK_STATUS_OPTIONS_KEY]: stageCustomStatusOptions,
        [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: stageCustomFieldValues,
        process_group: {
          id: stageMeta.groupId,
          name: stageMeta.groupLabel,
          template_id: stageMeta.templateId,
          template_name: stageMeta.templateName,
        },
      },
      ...buildTaskSourceInitialValues(normalizedModuleId, normalizedRecordId),
    };
    previousResolvedTask = {
      ...taskRow,
      ...stageCustomFieldValues,
    };
    payload.push(taskRow);
  }

  const insertedRows = await insertTasksWithFallback(supabaseClient, payload, directory);
  for (const insertedTask of insertedRows) {
    await syncProcessRunStageFromTask({ supabaseClient, task: insertedTask });
  }

  return {
    createdCount: insertedRows.length,
    skippedCount: (stageRows.length - creatableStages.length) + runtimeSkippedCount,
    groupIds: Array.from(new Set(stageRows.map((stage) => getDraftStageProcessGroupMeta(stage).groupId))),
    createdTasks: insertedRows,
    missingAssigneeCount,
  };
};
