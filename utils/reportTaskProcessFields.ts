import { FieldNature, type ModuleField } from '../types';
import {
  getProcessTaskCustomFieldValuesFromRecurrence,
  getProcessTaskCustomFieldsFromStage,
  mergeProcessTaskCustomFieldValues,
} from './processTaskCustomFields';
import { normalizeProcessTaskStatusOptions } from './processTaskStatusOptions';
import { PROCESS_NODE_KEY } from './processGraph';
import { getProcessTargetModuleFields, normalizeProcessTargetModuleIds } from './processTargets';
import { getSyntheticWorkflowAssigneeField, getWorkflowConditionFields } from './workflowHelpers';
import { getResolvedCurrentOrgId } from './companySettings';

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
  linkedFields: ModuleField[];
  statusOptions: Array<{ label: string; value: string; color?: string; icon?: string }>;
};

type CatalogCacheEntry = {
  expiresAt: number;
  catalog?: TaskReportProcessRuntimeCatalog;
  pending?: Promise<TaskReportProcessRuntimeCatalog>;
};

// کاتالوگ تنها تعریف الگوهاست، نه مقدار فعالیت‌ها. با این حال cache حتماً با
// org_id کلید می‌خورد تا در جابه‌جایی سازمان، تعریف یک tenant به tenant دیگر
// نرسد. عمر کوتاه، تغییرهای تازهٔ الگو را نیز سریع در گزارش‌ساز نشان می‌دهد.
const RUNTIME_CATALOG_CACHE_TTL_MS = 60_000;
const runtimeCatalogCacheByOrg = new Map<string, CatalogCacheEntry>();

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
        fa: `${text(source.field.labels?.fa) || fieldKey} (فرآیند «${text(source.templateName) || 'فرآیند'}» / مرحله «${text(source.stageName) || 'مرحله'}»)`,
        en: `${text(source.templateName) || 'Process'} / ${text(source.stageName) || 'Stage'} / ${text(source.field.labels?.en) || fieldKey}`,
      },
      nature: FieldNature.STANDARD,
      workflowOptionScopeModuleId: 'tasks',
      __reportTaskProcessField: true,
    } as ModuleField];
  });
};

const fetchTaskReportProcessRuntimeCatalog = async (supabaseClient: any): Promise<TaskReportProcessRuntimeCatalog> => {
  const { data: templates, error: templatesError } = await supabaseClient
    .from('process_templates')
    .select('id, name, module_id, module_ids')
    .eq('is_active', true)
    .order('name');
  if (templatesError) throw templatesError;

  const templatesById = new Map((templates || [])
    .map((template: any) => [text(template?.id), template] as const)
    .filter(([templateId]) => Boolean(templateId)));
  const stagesByTemplateId = new Map<string, any[]>();
  const templateIds = Array.from(templatesById.keys());
  // پیش از این برای هر الگو یک درخواست زده می‌شد. در سازمانی با فرآیندهای زیاد،
  // تنها بازکردن شرط‌ساز گزارش ده‌ها درخواست هم‌زمان می‌ساخت.
  for (let offset = 0; offset < templateIds.length; offset += 100) {
    const { data: stages, error } = await supabaseClient
      .from('process_template_stages')
      .select('id, template_id, stage_name, sort_order, process_node_key, metadata')
      .in('template_id', templateIds.slice(offset, offset + 100))
      .order('sort_order');
    if (error) throw error;
    (stages || []).forEach((stage: any) => {
      const templateId = text(stage?.template_id);
      if (!templateId) return;
      const entries = stagesByTemplateId.get(templateId) || [];
      entries.push(stage);
      stagesByTemplateId.set(templateId, entries);
    });
  }

  const results = Array.from(templatesById.entries()).map(([templateId, template]) => {
    const stages = stagesByTemplateId.get(templateId) || [];
    const fieldSources: TaskReportProcessFieldSource[] = [];
    const statusOptions: TaskReportProcessRuntimeCatalog['statusOptions'] = [];
    const linkedModuleIds = normalizeProcessTargetModuleIds([
      template?.module_id,
      ...(Array.isArray(template?.module_ids) ? template.module_ids : []),
    ]);
    stages.forEach((stage: any) => {
      const metadata = parseObject(stage?.metadata);
      linkedModuleIds.push(...normalizeProcessTargetModuleIds([
        ...(Array.isArray(metadata?.process_target_module_ids) ? metadata.process_target_module_ids : []),
      ]));
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
    return { fieldSources, statusOptions, linkedModuleIds: normalizeProcessTargetModuleIds(linkedModuleIds) };
  });

  const statusOptionMap = new Map<string, TaskReportProcessRuntimeCatalog['statusOptions'][number]>();
  results.flatMap((result) => result.statusOptions).forEach((option) => {
    if (!statusOptionMap.has(option.value)) statusOptionMap.set(option.value, option);
  });
  return {
    fields: buildTaskReportProcessFields(results.flatMap((result) => result.fieldSources)),
    linkedFields: getProcessTargetModuleFields(
      normalizeProcessTargetModuleIds(results.flatMap((result) => result.linkedModuleIds)),
      getWorkflowConditionFields,
      getSyntheticWorkflowAssigneeField,
    ),
    statusOptions: Array.from(statusOptionMap.values()),
  };
};

export const invalidateTaskReportProcessRuntimeCatalog = (orgId?: string | null) => {
  const normalizedOrgId = text(orgId);
  if (normalizedOrgId) runtimeCatalogCacheByOrg.delete(normalizedOrgId);
  else runtimeCatalogCacheByOrg.clear();
};

export const loadTaskReportProcessRuntimeCatalog = async (supabaseClient: any): Promise<TaskReportProcessRuntimeCatalog> => {
  const orgId = await getResolvedCurrentOrgId(supabaseClient);
  // در نشست ناقص هرگز از cache مشترک استفاده نمی‌کنیم؛ fail-closed بودن دادهٔ
  // سازمانی از صرفه‌جویی چند درخواست مهم‌تر است.
  if (!orgId) return fetchTaskReportProcessRuntimeCatalog(supabaseClient);

  const now = Date.now();
  const cached = runtimeCatalogCacheByOrg.get(orgId);
  if (cached?.catalog && cached.expiresAt > now) return cached.catalog;
  if (cached?.pending) return cached.pending;

  const pending = fetchTaskReportProcessRuntimeCatalog(supabaseClient)
    .then((catalog) => {
      runtimeCatalogCacheByOrg.set(orgId, {
        catalog,
        expiresAt: Date.now() + RUNTIME_CATALOG_CACHE_TTL_MS,
      });
      return catalog;
    })
    .catch((error) => {
      runtimeCatalogCacheByOrg.delete(orgId);
      throw error;
    });
  runtimeCatalogCacheByOrg.set(orgId, { expiresAt: now + RUNTIME_CATALOG_CACHE_TTL_MS, pending });
  return pending;
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
