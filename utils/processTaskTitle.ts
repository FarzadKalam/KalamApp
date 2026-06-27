import { parseProcessLinkMap } from './processTargets';
import {
  buildProcessV2TemplateContext,
  renderProcessV2TemplateValueFromRecord,
} from './processV2AutoAssign';
import { resolveTaskSourceLink } from './taskMeta';
import { MODULES } from '../moduleRegistry';
import { FieldType } from '../types';
import { runSelectWithCompatibleColumns } from './selectCompat';

const TEMPLATE_TOKEN_REGEX = /\{\{\s*[^}]+?\s*\}\}/;

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

const TASK_TITLE_CONTEXT_COLUMNS = [
  'id',
  'name',
  'task_type',
  'due_date',
  'related_to_module',
  'related_product',
  'related_customer',
  'related_supplier',
  'related_production_order',
  'related_invoice',
  'purchase_invoice_id',
  'project_id',
  'marketing_lead_id',
  'source_module_id',
  'source_record_id',
  'process_group_id',
  'process_run_id',
  'process_run_stage_id',
  'source_template_id',
  'source_stage_sort_order',
  'recurrence_info',
  'metadata',
] as const;

const collectTaskRelationLinks = (task: Record<string, any>) => {
  const links: Record<string, string> = {};
  (MODULES.tasks?.fields || [])
    .filter((field: any) => field?.type === FieldType.RELATION && field?.relationConfig?.targetModule)
    .forEach((field: any) => {
      const fieldKey = normalizeText(field?.key);
      const targetModule = normalizeText(field?.relationConfig?.targetModule);
      const recordId = normalizeText(task?.[fieldKey]);
      if (fieldKey && targetModule && recordId) links[targetModule] = recordId;
    });
  return links;
};

const taskHasTitleContext = (task: Record<string, any>) => (
  Boolean(task?.metadata)
  || Boolean(task?.recurrence_info)
  || Boolean(task?.process_run_stage_id)
  || Boolean(task?.process_run_id)
  || Boolean(task?.source_template_id)
);

const loadTaskTitleContext = async (
  supabaseClient: any,
  task: Record<string, any>,
) => {
  const taskId = normalizeText(task?.id);
  if (!taskId || taskHasTitleContext(task)) return task;
  const { data, error } = await runSelectWithCompatibleColumns<Record<string, any> | null>({
    cacheKey: 'process-task-title:task-context',
    columns: TASK_TITLE_CONTEXT_COLUMNS,
    execute: (selectExpr) => supabaseClient
      .from('tasks')
      .select(selectExpr)
      .eq('id', taskId)
      .maybeSingle(),
  });
  if (error || !data) return task;
  return {
    ...task,
    ...data,
  };
};

export const hasProcessTaskTitleTokens = (value: unknown) => (
  typeof value === 'string' && TEMPLATE_TOKEN_REGEX.test(value)
);

export const resolveProcessTaskTitle = async (
  supabaseClient: any,
  task: Record<string, any>,
  fallbackTitle?: string | null,
) => {
  const hydratedTask = await loadTaskTitleContext(supabaseClient, task || {});
  const rawTitle = normalizeText(hydratedTask?.name || fallbackTitle);
  if (!hasProcessTaskTitleTokens(rawTitle)) return rawTitle;

  const sourceLink = resolveTaskSourceLink(hydratedTask);
  const moduleId = normalizeText(sourceLink.moduleId);
  const recordId = normalizeText(sourceLink.recordId);
  if (!moduleId || !recordId) return rawTitle;

  const recurrence = parseObject(hydratedTask?.recurrence_info);
  const metadata = parseObject(hydratedTask?.metadata);
  const processLinkMap = {
    ...collectTaskRelationLinks(hydratedTask),
    ...parseProcessLinkMap(metadata?.process_links),
    ...parseProcessLinkMap(metadata?.process_link_map),
    ...parseProcessLinkMap(recurrence?.process_links),
  };

  const context = await buildProcessV2TemplateContext({
    supabaseClient,
    moduleId,
    recordId,
    recordData: null,
    processLinkMap,
    taskName: rawTitle,
    taskType: hydratedTask?.task_type,
    dueDate: hydratedTask?.due_date,
    previousTask: hydratedTask,
  });

  const resolved = normalizeText(renderProcessV2TemplateValueFromRecord(rawTitle, context));
  return resolved || rawTitle;
};
