import type { ModuleDefinition } from '../types';
import {
  PROCESS_GRAPH_METADATA_KEY,
  attachProcessGraphToStages,
  createEmptyProcessGraph,
  materializeLegacyProcessGraph,
} from './processGraph';
import {
  cloneProcessActivatorWorkflowsForTemplate,
  cloneProcessGraphInto,
} from './processGraphCopy';

const DEFAULT_OMIT_KEYS = new Set([
  'id',
  'system_code',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  'assignee_combo',
  'production_group_order_id',
]);

type BuildCopyPayloadParams = {
  nameField?: string | null;
  copyIndex?: number;
  moduleId?: string | null;
};

const MODULES_WITH_DRAFT_COPY_STATUS = new Set(['price_lists', 'product_bundles']);

const slugifyCopyValue = (value: any, copyIndex: number) => {
  const base = String(value || '').trim();
  if (!base) return base;
  const copyToken = Date.now().toString(36);
  const suffix = copyIndex > 0 ? `-copy-${copyToken}-${copyIndex + 1}` : `-copy-${copyToken}`;
  return `${base}${suffix}`;
};

const cloneCopyValue = (value: any) => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value) || (typeof value === 'object' && value.constructor === Object)) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
  return value;
};

export const detectCopyNameField = (module?: ModuleDefinition | null): string | null => {
  if (!module?.fields?.length) return null;
  const keyField = module.fields.find((field: any) => field?.isKey)?.key;
  if (keyField) return String(keyField);
  const nameField = module.fields.find((field: any) => field?.key === 'name')?.key;
  return nameField ? String(nameField) : null;
};

export const buildCopyPayload = (
  source: Record<string, any>,
  params: BuildCopyPayloadParams = {}
) => {
  const payload: Record<string, any> = {};
  const copyIndex = params.copyIndex ?? 0;

  Object.entries(source || {}).forEach(([key, value]) => {
    if (!key) return;
    if (DEFAULT_OMIT_KEYS.has(key)) return;
    if (key.startsWith('__')) return;
    if (value === undefined) return;
    payload[key] = cloneCopyValue(value);
  });

  const nameField = params.nameField;
  if (nameField && typeof payload[nameField] === 'string') {
    const baseName = String(payload[nameField]).trim();
    if (baseName) {
      const suffix = copyIndex > 0 ? ` (کپی ${copyIndex + 1})` : ' (کپی)';
      payload[nameField] = `${baseName}${suffix}`;
    }
  }

  if (MODULES_WITH_DRAFT_COPY_STATUS.has(String(params.moduleId || '')) && 'status' in payload) {
    payload.status = 'draft';
  }

  if (String(params.moduleId || '') === 'web_forms' && typeof payload.route_slug === 'string') {
    payload.route_slug = slugifyCopyValue(payload.route_slug, copyIndex);
  }

  return payload;
};

const TASK_OMIT_KEYS = new Set([
  'id',
  'system_code',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  'assignee_combo',
]);

const LINE_OMIT_KEYS = new Set([
  'id',
  'created_at',
  'updated_at',
]);

export const copyProductionOrderRelations = async (
  supabaseClient: any,
  sourceOrderId: string,
  targetOrderId: string
) => {
  if (!supabaseClient || !sourceOrderId || !targetOrderId) return;

  const lineIdMap = new Map<string, string>();

  const { data: sourceLines, error: linesError } = await supabaseClient
    .from('production_lines')
    .select('*')
    .eq('production_order_id', sourceOrderId);
  if (linesError) throw linesError;

  const sourceLineRows = sourceLines || [];
  for (const sourceLine of sourceLineRows) {
    const linePayload: Record<string, any> = {};
    Object.entries(sourceLine || {}).forEach(([key, value]) => {
      if (!key || LINE_OMIT_KEYS.has(key) || key.startsWith('__')) return;
      if (value === undefined) return;
      linePayload[key] = value;
    });
    linePayload.production_order_id = targetOrderId;
    const { data: insertedLine, error: insertLineError } = await supabaseClient
      .from('production_lines')
      .insert(linePayload)
      .select('id')
      .single();
    if (insertLineError) throw insertLineError;
    if (sourceLine?.id && insertedLine?.id) {
      lineIdMap.set(String(sourceLine.id), String(insertedLine.id));
    }
  }

  const { data: sourceTasks, error: tasksError } = await supabaseClient
    .from('tasks')
    .select('*')
    .eq('related_to_module', 'production_orders')
    .eq('related_production_order', sourceOrderId);
  if (tasksError) throw tasksError;

  const taskRows = sourceTasks || [];
  if (!taskRows.length) return;

  const taskPayloads = taskRows.map((sourceTask: Record<string, any>) => {
    const payload: Record<string, any> = {};
    Object.entries(sourceTask || {}).forEach(([key, value]) => {
      if (!key || TASK_OMIT_KEYS.has(key) || key.startsWith('__')) return;
      if (value === undefined) return;
      payload[key] = value;
    });
    payload.related_production_order = targetOrderId;
    const sourceLineId = sourceTask?.production_line_id ? String(sourceTask.production_line_id) : '';
    if (sourceLineId && lineIdMap.has(sourceLineId)) {
      payload.production_line_id = lineIdMap.get(sourceLineId);
    }
    return payload;
  });

  const { error: insertTasksError } = await supabaseClient.from('tasks').insert(taskPayloads);
  if (insertTasksError) throw insertTasksError;
};

export const copyProcessTemplateStagesRelations = async (
  supabaseClient: any,
  sourceTemplateId: string,
  targetTemplateId: string
) => {
  if (!supabaseClient || !sourceTemplateId || !targetTemplateId) return;

  const { data: sourceStages, error: sourceError } = await supabaseClient
    .from('process_template_stages')
    .select('*')
    .eq('template_id', sourceTemplateId)
    .order('sort_order', { ascending: true });
  if (sourceError) throw sourceError;

  const stageRows = sourceStages || [];
  if (!stageRows.length) return;

  const sourceGraph = materializeLegacyProcessGraph(stageRows);
  const cloneResult = cloneProcessGraphInto({
    sourceStages: sourceGraph.stages,
    targetStages: [],
    targetGraph: createEmptyProcessGraph(),
    includeTriggers: true,
  });
  const graphWithWorkflows = await cloneProcessActivatorWorkflowsForTemplate({
    supabaseClient,
    sourceTemplateId,
    targetTemplateId,
    sourceGraph: sourceGraph.graph,
    cloneResult,
  });
  const clonedStages = attachProcessGraphToStages(cloneResult.stages, graphWithWorkflows);
  const payloads = clonedStages.map((stage: Record<string, any>) => ({
    template_id: targetTemplateId,
    stage_name: String(stage?.stage_name || stage?.name || 'مرحله').trim() || 'مرحله',
    sort_order: Number(stage?.sort_order || 10),
    default_status: stage?.default_status || 'todo',
    default_assignee_id: stage?.default_assignee_id || null,
    default_assignee_role_id: stage?.default_assignee_role_id || null,
    auto_create_task: stage?.auto_create_task !== false,
    wage: Number(stage?.wage || 0),
    metadata: {
      ...(cloneCopyValue(stage?.metadata) || {}),
      [PROCESS_GRAPH_METADATA_KEY]: graphWithWorkflows,
    },
  }));

  const { error: insertError } = await supabaseClient.from('process_template_stages').insert(payloads);
  if (insertError) throw insertError;
};

export const copyWebFormFieldsRelations = async (
  supabaseClient: any,
  sourceWebFormId: string,
  targetWebFormId: string
) => {
  if (!supabaseClient || !sourceWebFormId || !targetWebFormId) return;

  const { data: sourceFields, error: sourceError } = await supabaseClient
    .from('web_form_fields')
    .select('*')
    .eq('web_form_id', sourceWebFormId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (sourceError) throw sourceError;

  const fieldRows = sourceFields || [];
  if (!fieldRows.length) return;

  const payloads = fieldRows.map((sourceField: Record<string, any>) => {
    const payload: Record<string, any> = {};
    Object.entries(sourceField || {}).forEach(([key, value]) => {
      if (!key || LINE_OMIT_KEYS.has(key) || key.startsWith('__')) return;
      if (value === undefined) return;
      payload[key] = cloneCopyValue(value);
    });
    payload.web_form_id = targetWebFormId;
    return payload;
  });

  const { error: insertError } = await supabaseClient.from('web_form_fields').insert(payloads);
  if (insertError) throw insertError;
};
