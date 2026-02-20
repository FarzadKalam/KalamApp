import type { ModuleDefinition } from '../types';

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
    payload[key] = value;
  });

  const nameField = params.nameField;
  if (nameField && typeof payload[nameField] === 'string') {
    const baseName = String(payload[nameField]).trim();
    if (baseName) {
      const suffix = copyIndex > 0 ? ` (کپی ${copyIndex + 1})` : ' (کپی)';
      payload[nameField] = `${baseName}${suffix}`;
    }
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
