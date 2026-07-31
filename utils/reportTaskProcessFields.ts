import { FieldNature, type ModuleField } from '../types';
import {
  getProcessTaskCustomFieldValuesFromRecurrence,
  getProcessTaskCustomFieldsFromStage,
  mergeProcessTaskCustomFieldValues,
} from './processTaskCustomFields';
import { normalizeProcessTaskStatusOptions } from './processTaskStatusOptions';
import { PROCESS_NODE_KEY } from './processGraph';

export const REPORT_TASK_PROCESS_FIELD_PREFIX = '__report_task_process_field__';

export type TaskReportProcessFieldSource = {
  templateId: string;
  templateName: string;
  stageId: string;
  stageName: string;
  processNodeKey: string;
  field: ModuleField;
};

export type TaskReportProcessRuntimeCatalog = {
  fields: ModuleField[];
  statusOptions: Array<{ label: string; value: string; color?: string; icon?: string }>;
};

const text = (value: unknown) => String(value || '').trim();

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

export const buildReportTaskProcessFieldKey = (templateId: string, processNodeKey: string, fieldKey: string) =>
  `${REPORT_TASK_PROCESS_FIELD_PREFIX}${text(templateId)}::${text(processNodeKey)}::${text(fieldKey)}`;

export const parseReportTaskProcessFieldKey = (value?: string | null) => {
  const raw = text(value);
  if (!raw.startsWith(REPORT_TASK_PROCESS_FIELD_PREFIX)) return null;
  const [templateId, processNodeKey, fieldKey] = raw.slice(REPORT_TASK_PROCESS_FIELD_PREFIX.length).split('::');
  if (!templateId || !processNodeKey || !fieldKey) return null;
  return { templateId, processNodeKey, fieldKey };
};

export const isReportTaskProcessFieldKey = (value?: string | null) => !!parseReportTaskProcessFieldKey(value);

export const buildTaskReportProcessFields = (sources: TaskReportProcessFieldSource[]): ModuleField[] => {
  const seen = new Set<string>();
  return (sources || []).flatMap((source) => {
    const fieldKey = text(source?.field?.key);
    const templateId = text(source?.templateId);
    const processNodeKey = text(source?.processNodeKey);
    if (!fieldKey || !templateId || !processNodeKey) return [];
    const key = buildReportTaskProcessFieldKey(templateId, processNodeKey, fieldKey);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      ...source.field,
      key,
      labels: {
        fa: `${text(source.templateName) || 'فرآیند'} / ${text(source.stageName) || 'مرحله'} / ${text(source.field.labels?.fa) || fieldKey}`,
        en: `${text(source.templateName) || 'Process'} / ${text(source.stageName) || 'Stage'} / ${text(source.field.labels?.en) || fieldKey}`,
      },
      nature: FieldNature.STANDARD,
      __reportTaskProcessField: true,
    } as ModuleField];
  });
};

export const loadTaskReportProcessRuntimeCatalog = async (supabaseClient: any): Promise<TaskReportProcessRuntimeCatalog> => {
  const { data: templates, error: templatesError } = await supabaseClient
    .from('process_templates')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  if (templatesError) throw templatesError;

  const results = await Promise.all((templates || []).map(async (template: any) => {
    const templateId = text(template?.id);
    if (!templateId) return { fieldSources: [] as TaskReportProcessFieldSource[], statusOptions: [] as TaskReportProcessRuntimeCatalog['statusOptions'] };
    const { data: stages, error } = await supabaseClient
      .from('process_template_stages')
      .select('id, stage_name, sort_order, process_node_key, metadata')
      .eq('template_id', templateId)
      .order('sort_order');
    if (error) throw error;
    const fieldSources: TaskReportProcessFieldSource[] = [];
    const statusOptions: TaskReportProcessRuntimeCatalog['statusOptions'] = [];
    (stages || []).forEach((stage: any) => {
      const metadata = parseObject(stage?.metadata);
      const processNodeKey = text(stage?.process_node_key || metadata?.[PROCESS_NODE_KEY] || stage?.id);
      if (!processNodeKey) return;
      getProcessTaskCustomFieldsFromStage({ ...stage, metadata }).forEach((field) => fieldSources.push({
        templateId,
        templateName: text(template?.name) || 'فرآیند',
        stageId: text(stage?.id),
        stageName: text(stage?.stage_name) || 'مرحله',
        processNodeKey,
        field,
      }));
      normalizeProcessTaskStatusOptions(metadata?.process_task_status_options).forEach((option) => {
        const value = text(option?.value);
        const label = text(option?.label);
        if (value && label) statusOptions.push({ value, label, color: text(option?.color) || undefined, icon: text((option as any)?.icon) || undefined });
      });
    });
    return { fieldSources, statusOptions };
  }));

  const statusOptionMap = new Map<string, TaskReportProcessRuntimeCatalog['statusOptions'][number]>();
  results.flatMap((result) => result.statusOptions).forEach((option) => {
    if (!statusOptionMap.has(option.value)) statusOptionMap.set(option.value, option);
  });
  return {
    fields: buildTaskReportProcessFields(results.flatMap((result) => result.fieldSources)),
    statusOptions: Array.from(statusOptionMap.values()),
  };
};

export const loadTaskReportProcessFields = async (supabaseClient: any): Promise<ModuleField[]> =>
  (await loadTaskReportProcessRuntimeCatalog(supabaseClient)).fields;

export const resolveTaskReportProcessFieldValue = (row: Record<string, any>, reportFieldKey: string) => {
  const meta = parseReportTaskProcessFieldKey(reportFieldKey);
  if (!meta) return null;
  const recurrence = parseObject(row?.recurrence_info);
  const processGroup = parseObject(recurrence?.process_group);
  const templateId = text(row?.source_template_id || processGroup?.template_id);
  const processNodeKey = text(row?.process_node_key || recurrence?.[PROCESS_NODE_KEY]);
  if (templateId !== meta.templateId || processNodeKey !== meta.processNodeKey) return null;

  const customFields = getProcessTaskCustomFieldsFromStage({
    process_task_custom_fields: recurrence?.process_task_custom_fields,
  });
  const field = customFields.find((item) => text(item?.key) === meta.fieldKey);
  if (!field) return null;
  const values = mergeProcessTaskCustomFieldValues(field ? [field] : [], getProcessTaskCustomFieldValuesFromRecurrence(recurrence));
  return values[meta.fieldKey] ?? null;
};
