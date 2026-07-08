import {
  normalizeProcessAutomationRules,
  PROCESS_AUTOMATION_TARGET_OPTIONS,
  type ProcessAutomationRule,
} from './processAutomationTypes';
import { MODULES } from '../moduleRegistry';
import { WORKFLOW_OPERATORS } from './filterUtils';
import { actionTypeOptions, triggerTypeOptions } from './workflowTypes';
import type { AssigneeDirectory } from './referenceData';

type ProcessGuideStageSummary = {
  id: string | null;
  stage_name: string;
  sort_order: number;
  status: string | null;
  assignee: {
    type: 'user' | 'role' | null;
    id: string | null;
    summary: string | null;
    name?: string | null;
    role_name?: string | null;
  };
  linked_task: {
    exists: boolean;
    id: string | null;
    name: string | null;
    status: string | null;
    status_label: string | null;
    field_values: Array<{
      field: string;
      field_label: string;
      value: any;
      value_label: string | null;
    }>;
    assignee: {
      type: 'user' | 'role' | null;
      id: string | null;
      summary: string | null;
      name?: string | null;
      role_name?: string | null;
    };
  };
  execution_state: 'draft_not_assigned' | 'real_task_role_assigned' | 'real_task_user_assigned' | 'real_task_unassigned';
  duration: {
    value: number | null;
    unit: string | null;
    from: string | null;
  };
  timing: {
    planned_due_at: string | null;
    due_date: string | null;
    started_at: string | null;
    completed_at: string | null;
  };
  automation_count: number;
  automation_rule_ids: string[];
  known_gaps: string[];
};

type ProcessGuideAutomationSummary = {
  id: string;
  name: string | null;
  stage_name: string;
  trigger_type: string | null;
  target_type: string | null;
  target_summary: string | null;
  actions: Array<{
    type: string;
    label: string;
    template: string | null;
    summary: string;
    config_summary: string[];
  }>;
  conditions_all: Array<{
    field: string;
    field_label: string;
    operator: string;
    operator_label: string;
    value: any;
    value_label: string | null;
  }>;
  conditions_any: Array<{
    field: string;
    field_label: string;
    operator: string;
    operator_label: string;
    value: any;
    value_label: string | null;
  }>;
  known_gaps: string[];
};

type ProcessGuideProcessSummary = {
  id: string;
  label: string;
  template_id: string | null;
  template_name: string | null;
  stage_count: number;
  stages: ProcessGuideStageSummary[];
  automation_rules: ProcessGuideAutomationSummary[];
  outcomes_by_stage: Array<{
    stage_name: string;
    outcomes: string[];
  }>;
  known_gaps: string[];
};

export type ProcessGuideContext = {
  intent: 'process_guide';
  process_summary: {
    module_id: string | null;
    record_id: string | null;
    process_field_key: string | null;
    process_count: number;
    source_kind: 'template' | 'run' | 'draft';
    selected_process_id: string | null;
  };
  available_processes: Array<{
    id: string;
    label: string;
    templateId: string | null;
    templateName: string | null;
    stageCount: number;
  }>;
  processes: ProcessGuideProcessSummary[];
  known_gaps: string[];
};

const TARGET_LABEL_MAP = new Map(
  PROCESS_AUTOMATION_TARGET_OPTIONS.map((item) => [item.value, item.label])
);
const ACTION_LABEL_MAP = new Map(actionTypeOptions.map((item) => [item.value, item.label]));
const TRIGGER_LABEL_MAP = new Map(triggerTypeOptions.map((item) => [item.value, item.label]));

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'انجام نشده',
  pending: 'در انتظار',
  in_progress: 'در حال انجام',
  review: 'در انتظار بررسی',
  done: 'انجام شده',
  completed: 'تکمیل شده',
  canceled: 'لغو شده',
};

const normalizeStageName = (value: any, fallbackIndex: number) =>
  String(value || '').trim() || `مرحله ${fallbackIndex + 1}`;

const buildProcessId = (stage: any, sourceKind: 'template' | 'run' | 'draft') => {
  const groupId = String(
    sourceKind === 'run'
      ? (stage?.process_run_id || stage?.process_group_id || stage?.source_template_id || '')
      : (stage?.process_group_id || stage?.source_template_id || '')
  ).trim();
  if (groupId) return groupId;
  if (sourceKind === 'template') return 'current_process_template';
  if (sourceKind === 'run') return 'current_process_run';
  return 'default_process_group';
};

const buildProcessLabel = (stage: any, fallbackIndex: number, sourceKind: 'template' | 'run' | 'draft') =>
  String(stage?.process_group_name || stage?.source_template_name || '').trim()
  || (sourceKind === 'template' ? 'الگوی فرآیند فعلی' : sourceKind === 'run' ? 'اجرای فرآیند فعلی' : `فرآیند ${fallbackIndex + 1}`);

const buildAssigneeLookup = (directory?: AssigneeDirectory | null) => {
  const usersById = new Map((directory?.users || []).map((user) => [String(user?.id || '').trim(), user]));
  const rolesById = new Map((directory?.roles || []).map((role) => [String(role?.id || '').trim(), role]));
  return { usersById, rolesById };
};

const resolveAssigneeSummary = (
  type: 'user' | 'role',
  id: string,
  lookup: ReturnType<typeof buildAssigneeLookup>,
) => {
  if (type === 'role') {
    const role = lookup.rolesById.get(id);
    const title = String(role?.title || '').trim();
    return {
      name: title || null,
      role_name: title || null,
      summary: title ? `نقش/تیم: ${title}` : 'نقش مشخص',
    };
  }
  const user = lookup.usersById.get(id);
  const name = String(user?.display_name || user?.full_name || user?.email || '').trim();
  const roleName = String(user?.role_id ? lookup.rolesById.get(String(user.role_id))?.title || '' : '').trim();
  return {
    name: name || null,
    role_name: roleName || null,
    summary: [name ? `کاربر: ${name}` : 'کاربر مشخص', roleName ? `نقش: ${roleName}` : ''].filter(Boolean).join('، '),
  };
};

const summarizeAssignee = (stage: any, lookup: ReturnType<typeof buildAssigneeLookup>) => {
  const roleId = String(stage?.assignee_role_id || stage?.default_assignee_role_id || '').trim() || null;
  if (roleId) {
    const resolved = resolveAssigneeSummary('role', roleId, lookup);
    return {
      type: 'role' as const,
      id: roleId,
      ...resolved,
    };
  }
  const userId = String(stage?.assignee_id || stage?.default_assignee_id || '').trim() || null;
  if (userId) {
    const resolved = resolveAssigneeSummary('user', userId, lookup);
    return {
      type: 'user' as const,
      id: userId,
      ...resolved,
    };
  }
  return {
    type: null,
    id: null,
    summary: null,
    name: null,
    role_name: null,
  };
};

const getModuleFieldLabel = (moduleId: string | null | undefined, fieldKey: string) => {
  const normalizedKey = String(fieldKey || '').trim();
  if (!normalizedKey) return '';
  const moduleConfig = moduleId ? MODULES[moduleId] : null;
  const field = (moduleConfig?.fields || []).find((item: any) => String(item?.key || '') === normalizedKey);
  return String(field?.labels?.fa || '').trim() || normalizedKey;
};

const getAnyFieldLabel = (fieldKey: string) => {
  const normalizedKey = String(fieldKey || '').trim();
  if (!normalizedKey) return '';
  if (normalizedKey.startsWith('__task__')) {
    const taskKey = normalizedKey.replace(/^__task__/, '');
    return `فعالیت: ${getModuleFieldLabel('tasks', taskKey)}`;
  }
  if (normalizedKey.startsWith('__linked__')) {
    const parts = normalizedKey.split('__').filter(Boolean);
    const moduleId = parts[1] || '';
    const key = parts.slice(2).join('__');
    const moduleTitle = MODULES[moduleId]?.titles?.fa || moduleId;
    return `${moduleTitle}: ${getModuleFieldLabel(moduleId, key)}`;
  }
  return getModuleFieldLabel('tasks', normalizedKey) || normalizedKey;
};

const formatConditionValueLabel = (fieldKey: string, value: any) => {
  if (value === null || value === undefined || value === '') return null;
  const normalizedField = String(fieldKey || '').replace(/^__task__/, '');
  const field = (MODULES.tasks?.fields || []).find((item: any) => String(item?.key || '') === normalizedField);
  const options = Array.isArray(field?.options) ? field.options : [];
  if (Array.isArray(value)) {
    return value
      .map((item) => options.find((option: any) => String(option?.value) === String(item))?.label || String(item))
      .join('، ');
  }
  return options.find((option: any) => String(option?.value) === String(value))?.label || String(value);
};

const summarizeCondition = (condition: any) => {
  const field = String(condition?.field || '').trim();
  const operator = String(condition?.operator || 'eq').trim();
  return {
    field,
    field_label: getAnyFieldLabel(field),
    operator,
    operator_label: (WORKFLOW_OPERATORS as Record<string, string>)[operator] || operator,
    value: condition?.value,
    value_label: formatConditionValueLabel(field, condition?.value),
  };
};

const summarizeActionTemplate = (action: any) =>
  String(
    action?.config?.note_text
    || action?.config?.message
    || action?.config?.message_text
    || action?.config?.body
    || action?.config?.text
    || ''
  ).trim() || null;

const summarizeActionConfig = (action: any) => {
  const config = action?.config && typeof action.config === 'object' ? action.config : {};
  const parts: string[] = [];
  const pushPrimitive = (key: string, label: string) => {
    const value = config?.[key];
    if (value === null || value === undefined || value === '') return;
    if (typeof value === 'object') return;
    parts.push(`${label}: ${String(value).slice(0, 180)}`);
  };
  pushPrimitive('field', 'فیلد هدف');
  pushPrimitive('target_field', 'فیلد مقصد');
  pushPrimitive('status', 'وضعیت');
  pushPrimitive('task_status', 'وضعیت فعالیت');
  pushPrimitive('due_days', 'مهلت روز');
  pushPrimitive('delay_days', 'تاخیر روز');
  pushPrimitive('duration_value', 'مدت');
  pushPrimitive('duration_unit', 'واحد مدت');
  pushPrimitive('duration_from', 'مبنای مدت');
  pushPrimitive('module_id', 'ماژول');
  pushPrimitive('message', 'پیام');
  pushPrimitive('message_text', 'متن پیام');
  pushPrimitive('note_text', 'متن یادداشت');
  pushPrimitive('prompt_template', 'قالب پرامپت');

  if (Array.isArray(config?.recipient_fields) && config.recipient_fields.length > 0) {
    parts.push(`فیلدهای گیرنده: ${config.recipient_fields.map((field: any) => getAnyFieldLabel(String(field || ''))).filter(Boolean).join('، ')}`);
  }
  if (Array.isArray(config?.fields) && config.fields.length > 0) {
    parts.push(`فیلدها: ${config.fields.map((field: any) => getAnyFieldLabel(String(field || ''))).filter(Boolean).join('، ')}`);
  }
  if (config?.payload && typeof config.payload === 'object') {
    const keys = Object.keys(config.payload).filter(Boolean).slice(0, 12);
    if (keys.length) parts.push(`کلیدهای داده ارسالی: ${keys.join('، ')}`);
  }
  return parts;
};

const summarizeAction = (action: any) => {
  const type = String(action?.type || '').trim() || 'unknown';
  const label = ACTION_LABEL_MAP.get(type as any) || type;
  const template = summarizeActionTemplate(action);
  const configSummary = summarizeActionConfig(action);
  const recipientFields = Array.isArray(action?.config?.recipient_fields) ? action.config.recipient_fields.length : 0;
  const summaryParts = [label];
  if (recipientFields > 0) summaryParts.push(`گیرنده از ${recipientFields} فیلد`);
  if (action?.config?.field) summaryParts.push(`فیلد: ${getAnyFieldLabel(action.config.field)}`);
  if (template) summaryParts.push(`متن: ${template.slice(0, 180)}`);
  if (configSummary.length) summaryParts.push(configSummary.slice(0, 4).join('؛ '));
  return {
    type,
    label,
    template,
    summary: summaryParts.join(' | '),
    config_summary: configSummary,
  };
};

const summarizeRule = (rule: ProcessAutomationRule, stageName: string): ProcessGuideAutomationSummary => {
  const actions = (Array.isArray(rule?.actions) ? rule.actions : []).map((action) => summarizeAction(action));
  const knownGaps: string[] = [];
  if (!actions.length) knownGaps.push('برای این rule اکشنی ثبت نشده است.');
  if (!String(rule?.target_type || '').trim()) knownGaps.push('مخاطب rule مشخص نیست.');
  return {
    id: String(rule?.id || '').trim() || `${stageName}_${String(rule?.name || '').trim() || 'rule'}`,
    name: String(rule?.name || '').trim() || null,
    stage_name: stageName,
    trigger_type: String(rule?.trigger_type || '').trim() || null,
    target_type: String(rule?.target_type || '').trim() || null,
    target_summary: TARGET_LABEL_MAP.get(String(rule?.target_type || '').trim() as any) || null,
    actions,
    conditions_all: (Array.isArray(rule?.conditions_all) ? rule.conditions_all : []).map(summarizeCondition),
    conditions_any: (Array.isArray(rule?.conditions_any) ? rule.conditions_any : []).map(summarizeCondition),
    known_gaps: knownGaps,
  };
};

const getTaskStatusLabel = (task: any) => {
  const status = String(task?.status || '').trim();
  if (!status) return null;
  return TASK_STATUS_LABELS[status] || formatConditionValueLabel('status', status) || status;
};

const getFieldOptionLabel = (field: any, value: any) => {
  const options = Array.isArray(field?.options) ? field.options : [];
  if (Array.isArray(value)) {
    return value
      .map((item) => options.find((option: any) => String(option?.value) === String(item))?.label || String(item))
      .join('، ');
  }
  return options.find((option: any) => String(option?.value) === String(value))?.label || null;
};

const summarizeTaskFieldValues = (task: any | null | undefined) => {
  if (!task) return [];
  const recurrence = task?.recurrence_info && typeof task.recurrence_info === 'object' ? task.recurrence_info : {};
  const customFields = Array.isArray(recurrence?.process_task_custom_fields) ? recurrence.process_task_custom_fields : [];
  const customValues = recurrence?.process_task_custom_field_values && typeof recurrence.process_task_custom_field_values === 'object'
    ? recurrence.process_task_custom_field_values
    : {};
  const statusOptions = Array.isArray(recurrence?.process_task_status_options) ? recurrence.process_task_status_options : [];
  const entries = [
    ['status', task?.status, getTaskStatusLabel(task) || getFieldOptionLabel({ options: statusOptions }, task?.status)],
    ['task_type', task?.task_type, formatConditionValueLabel('task_type', task?.task_type)],
    ['due_date', task?.due_date, null],
    ['start_date', task?.start_date, null],
    ['completed_at', task?.completed_at, null],
    ['assignee_id', task?.assignee_id || task?.assignee_role_id, task?.assignee_role_id ? 'نقش/تیم' : task?.assignee_id ? 'کاربر مشخص' : null],
  ] as const;
  const baseEntries = entries
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
    .map(([field, value, valueLabel]) => ({
      field,
      field_label: getModuleFieldLabel('tasks', field),
      value,
      value_label: valueLabel,
    }));
  const customEntries = customFields
    .map((field: any) => {
      const key = String(field?.key || '').trim();
      if (!key || customValues[key] === undefined || customValues[key] === null || String(customValues[key]).trim() === '') return null;
      return {
        field: key,
        field_label: String(field?.labels?.fa || field?.labelFa || key).trim() || key,
        value: customValues[key],
        value_label: getFieldOptionLabel(field, customValues[key]),
      };
    })
    .filter(Boolean);
  const statusOptionEntries = statusOptions.length > 0 ? [{
    field: 'status_options',
    field_label: 'وضعیت‌های اختصاصی فعالیت',
    value: statusOptions.map((option: any) => option?.value ?? option?.label).filter((item: any) => item !== undefined && item !== null),
    value_label: statusOptions.map((option: any) => String(option?.label ?? option?.value ?? '').trim()).filter(Boolean).join('، ') || null,
  }] : [];
  const customFieldCatalogEntry = customFields.length > 0 ? [{
    field: 'custom_fields',
    field_label: 'فیلدهای اختصاصی فعالیت',
    value: customFields.map((field: any) => String(field?.key || '').trim()).filter(Boolean),
    value_label: customFields.map((field: any) => String(field?.labels?.fa || field?.labelFa || field?.key || '').trim()).filter(Boolean).join('، ') || null,
  }] : [];
  return [...baseEntries, ...customFieldCatalogEntry, ...statusOptionEntries, ...customEntries];
};

const summarizeTaskAssignee = (task: any | null | undefined, lookup: ReturnType<typeof buildAssigneeLookup>) => {
  if (!task) return { type: null, id: null, summary: null, name: null, role_name: null };
  const roleId = String(task?.assignee_role_id || '').trim();
  if (roleId) {
    const resolved = resolveAssigneeSummary('role', roleId, lookup);
    return {
      type: 'role' as const,
      id: roleId,
      ...resolved,
      summary: `${resolved.summary}؛ فعالیت واقعی به نقش/تیم ارجاع شده و هنوز شخص مشخص ندارد.`,
    };
  }
  const userId = String(task?.assignee_id || '').trim();
  if (userId) {
    const resolved = resolveAssigneeSummary('user', userId, lookup);
    return {
      type: 'user' as const,
      id: userId,
      ...resolved,
      summary: `${resolved.summary}؛ فعالیت واقعی به کاربر مشخص ارجاع شده است.`,
    };
  }
  return {
    type: null,
    id: null,
    summary: 'فعالیت واقعی مسئول مشخص ندارد.',
    name: null,
    role_name: null,
  };
};

const normalizeNameForMatch = (value: any) => String(value || '').trim().toLowerCase();

const getStageProcessId = (stage: any, sourceKind: 'template' | 'run' | 'draft') => buildProcessId(stage, sourceKind);

const getTaskProcessId = (task: any, sourceKind: 'template' | 'run' | 'draft') =>
  String(
    sourceKind === 'run'
      ? (task?.process_run_id || task?.process_group_id || task?.source_template_id || '')
      : (task?.process_group_id || task?.source_template_id || '')
  ).trim()
  || (sourceKind === 'template' ? 'current_process_template' : sourceKind === 'run' ? 'current_process_run' : 'default_process_group');

const findLinkedTaskForStage = (stage: any, index: number, tasks: any[], sourceKind: 'template' | 'run' | 'draft') => {
  const explicitTaskId = String(stage?.task_id || '').trim();
  if (explicitTaskId) {
    const byId = tasks.find((task) => String(task?.id || '').trim() === explicitTaskId);
    if (byId) return byId;
  }
  const groupId = getStageProcessId(stage, sourceKind);
  const stageName = normalizeNameForMatch(stage?.name || stage?.stage_name || stage?.title);
  const sortOrder = Number(stage?.sort_order || ((index + 1) * 10));
  return tasks.find((task) => {
    const taskGroupId = getTaskProcessId(task, sourceKind);
    const taskName = normalizeNameForMatch(task?.name || task?.title);
    const taskStageSort = Number(task?.source_stage_sort_order || task?.sort_order || 0);
    return taskGroupId === groupId && (
      (stageName && taskName === stageName)
      || (sortOrder > 0 && taskStageSort === sortOrder)
    );
  }) || null;
};

const hasMatchingStageForTask = (task: any, stages: any[], sourceKind: 'template' | 'run' | 'draft') => {
  const taskId = String(task?.id || '').trim();
  const taskGroupId = getTaskProcessId(task, sourceKind);
  const taskName = normalizeNameForMatch(task?.name || task?.title);
  const taskStageSort = Number(task?.source_stage_sort_order || task?.sort_order || 0);
  return stages.some((stage, index) => {
    if (taskId && String(stage?.task_id || '').trim() === taskId) return true;
    const stageGroupId = getStageProcessId(stage, sourceKind);
    const stageName = normalizeNameForMatch(stage?.name || stage?.stage_name || stage?.title);
    const stageSort = Number(stage?.sort_order || ((index + 1) * 10));
    return stageGroupId === taskGroupId && (
      (stageName && taskName && stageName === taskName)
      || (stageSort > 0 && taskStageSort > 0 && stageSort === taskStageSort)
    );
  });
};

const buildSyntheticStageFromTask = (task: any) => ({
  id: `task_stage_${String(task?.id || '').trim()}`,
  name: String(task?.name || task?.title || 'فعالیت واقعی').trim() || 'فعالیت واقعی',
  sort_order: Number(task?.source_stage_sort_order || task?.sort_order || 0),
  status: String(task?.status || '').trim() || null,
  task_id: String(task?.id || '').trim() || null,
  task_type: String(task?.task_type || '').trim() || null,
  assignee_id: String(task?.assignee_id || '').trim() || null,
  assignee_role_id: String(task?.assignee_role_id || '').trim() || null,
  process_group_id: String(task?.process_group_id || task?.source_template_id || '').trim() || null,
  process_run_id: String(task?.process_run_id || '').trim() || null,
  source_template_id: String(task?.source_template_id || '').trim() || null,
  automation_rules: Array.isArray(task?.recurrence_info?.process_automation_rules)
    ? task.recurrence_info.process_automation_rules
    : [],
  _synthetic_from_task: true,
});

const summarizeStage = (
  stage: any,
  index: number,
  linkedTask: any | null,
  lookup: ReturnType<typeof buildAssigneeLookup>,
): ProcessGuideStageSummary => {
  const automationRules = normalizeProcessAutomationRules(
    Array.isArray(stage?.automation_rules)
      ? stage.automation_rules
      : stage?.metadata?.automation_rules
  );
  const knownGaps: string[] = [];
  const assignee = summarizeAssignee(stage, lookup);
  const taskAssignee = summarizeTaskAssignee(linkedTask, lookup);
  if (!assignee.id) knownGaps.push('مسئول این مرحله مشخص نشده است.');
  if (!linkedTask) knownGaps.push('برای این مرحله هنوز فعالیت واقعی ساخته/ارجاع نشده است.');
  if (linkedTask && taskAssignee.type === 'role') knownGaps.push('فعالیت واقعی به نام نقش/تیم است و هنوز به شخص مشخص اختصاص داده نشده است.');
  return {
    id: String(stage?.id || stage?.template_stage_id || stage?.process_run_stage_id || '').trim() || null,
    stage_name: normalizeStageName(stage?.name || stage?.stage_name || stage?.title, index),
    sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
    status: String(stage?.status || '').trim() || null,
    assignee,
    linked_task: {
      exists: Boolean(linkedTask),
      id: String(linkedTask?.id || '').trim() || null,
      name: String(linkedTask?.name || linkedTask?.title || '').trim() || null,
      status: String(linkedTask?.status || '').trim() || null,
      status_label: getTaskStatusLabel(linkedTask),
      field_values: summarizeTaskFieldValues(linkedTask),
      assignee: taskAssignee,
    },
    execution_state: linkedTask
      ? taskAssignee.type === 'user'
        ? 'real_task_user_assigned'
        : taskAssignee.type === 'role'
          ? 'real_task_role_assigned'
          : 'real_task_unassigned'
      : 'draft_not_assigned',
    duration: {
      value: Number.isFinite(Number(stage?.duration_value)) ? Number(stage?.duration_value) : null,
      unit: String(stage?.duration_unit || '').trim() || null,
      from: String(stage?.duration_from || '').trim() || null,
    },
    timing: {
      planned_due_at: String(stage?.planned_due_at || stage?.metadata?.planned_due_at || '').trim() || null,
      due_date: String(linkedTask?.due_date || stage?.due_date || stage?.metadata?.due_date || '').trim() || null,
      started_at: String(stage?.started_at || linkedTask?.start_date || linkedTask?.started_at || '').trim() || null,
      completed_at: String(stage?.completed_at || linkedTask?.completed_at || '').trim() || null,
    },
    automation_count: automationRules.length,
    automation_rule_ids: automationRules.map((rule) => String(rule?.id || '').trim()).filter(Boolean),
    known_gaps: knownGaps,
  };
};

const detectSourceKind = (
  moduleId?: string | null,
  fieldKey?: string | null,
  stages: any[] = [],
  tasks: any[] = [],
): 'template' | 'run' | 'draft' => {
  if (moduleId === 'process_templates' || fieldKey === 'template_stages_preview') return 'template';
  if (moduleId === 'process_runs' || fieldKey === 'run_stages_preview') return 'run';
  if (
    (Array.isArray(stages) && stages.some((stage) => String(stage?.process_run_id || stage?.process_run_stage_id || stage?.task_id || '').trim()))
    || (Array.isArray(tasks) && tasks.some((task) => String(task?.process_run_id || task?.process_run_stage_id || '').trim()))
  ) {
    return 'run';
  }
  return 'draft';
};

export const buildProcessGuideContext = ({
  moduleId,
  recordId,
  fieldKey,
  stages,
  tasks = [],
  selectedProcessId = null,
  assigneeDirectory = null,
}: {
  moduleId?: string | null;
  recordId?: string | null;
  fieldKey?: string | null;
  stages: any[];
  tasks?: any[];
  selectedProcessId?: string | null;
  assigneeDirectory?: AssigneeDirectory | null;
}): ProcessGuideContext => {
  const grouped = new Map<string, { label: string; templateId: string | null; templateName: string | null; stages: any[] }>();
  const sourceKind = detectSourceKind(moduleId, fieldKey, stages, tasks);
  const assigneeLookup = buildAssigneeLookup(assigneeDirectory);

  (Array.isArray(stages) ? stages : [])
    .slice()
    .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))
    .forEach((stage: any, index: number) => {
      const processId = buildProcessId(stage, sourceKind);
      const current = grouped.get(processId) || {
        label: buildProcessLabel(stage, index, sourceKind),
        templateId: String(stage?.source_template_id || '').trim() || null,
        templateName: String(stage?.source_template_name || '').trim() || null,
        stages: [],
      };
      current.stages.push(stage);
      if (!current.templateId) current.templateId = String(stage?.source_template_id || '').trim() || null;
      if (!current.templateName) current.templateName = String(stage?.source_template_name || '').trim() || null;
      grouped.set(processId, current);
    });

  const sourceStages = Array.isArray(stages) ? stages : [];
  (Array.isArray(tasks) ? tasks : []).forEach((task: any, index: number) => {
    if (hasMatchingStageForTask(task, sourceStages, sourceKind)) return;
    const syntheticStage = buildSyntheticStageFromTask(task);
    const processId = getTaskProcessId(task, sourceKind);
    const current = grouped.get(processId) || {
      label: String(task?.recurrence_info?.process_group?.name || task?.recurrence_info?.process_group?.template_name || '').trim()
        || (sourceKind === 'template' ? 'الگوی فرآیند فعلی' : sourceKind === 'run' ? 'اجرای فرآیند فعلی' : `فرآیند ${index + 1}`),
      templateId: String(task?.source_template_id || task?.recurrence_info?.process_group?.template_id || '').trim() || null,
      templateName: String(task?.recurrence_info?.process_group?.template_name || '').trim() || null,
      stages: [],
    };
    current.stages.push(syntheticStage);
    grouped.set(processId, current);
  });

  if (grouped.size === 0) {
    const id = sourceKind === 'template' ? 'current_process_template' : sourceKind === 'run' ? 'current_process_run' : 'default_process_group';
    grouped.set(id, {
      label: sourceKind === 'template' ? 'الگوی فرآیند فعلی' : sourceKind === 'run' ? 'اجرای فرآیند فعلی' : 'فرآیند فعلی',
      templateId: null,
      templateName: null,
      stages: [],
    });
  }

  const processes: ProcessGuideProcessSummary[] = Array.from(grouped.entries()).map(([id, group]) => {
    const stageSummaries = group.stages.map((stage, index) => summarizeStage(
      stage,
      index,
      findLinkedTaskForStage(stage, index, Array.isArray(tasks) ? tasks : [], sourceKind),
      assigneeLookup,
    ));
    const automationRules = group.stages.flatMap((stage, index) => {
      const stageName = normalizeStageName(stage?.name || stage?.stage_name || stage?.title, index);
      return normalizeProcessAutomationRules(
        Array.isArray(stage?.automation_rules)
          ? stage.automation_rules
          : stage?.metadata?.automation_rules
      ).map((rule) => summarizeRule(rule, stageName));
    });
    const knownGaps = Array.from(new Set([
      ...stageSummaries.flatMap((stage) => stage.known_gaps),
      ...automationRules.flatMap((rule) => rule.known_gaps),
      ...(automationRules.length === 0 ? ['برای این فرآیند اتوماسیون مشخصی پیدا نشد.'] : []),
      ...(stageSummaries.length === 0 ? ['برای این فرآیند هنوز مرحله‌ای ثبت نشده است.'] : []),
    ]));
    return {
      id,
      label: group.label,
      template_id: group.templateId,
      template_name: group.templateName,
      stage_count: stageSummaries.length,
      stages: stageSummaries,
      automation_rules: automationRules,
      outcomes_by_stage: stageSummaries.map((stage) => {
        const stageRules = automationRules.filter((rule) => rule.stage_name === stage.stage_name);
        return {
          stage_name: stage.stage_name,
          outcomes: stageRules.length > 0
            ? stageRules.map((rule) => {
                const actionTypes = rule.actions.map((action) => action.label || action.type).filter(Boolean).join('، ');
                const triggerLabel = TRIGGER_LABEL_MAP.get(rule.trigger_type as any) || rule.trigger_type || 'نامشخص';
                const conditions = [...rule.conditions_all, ...rule.conditions_any]
                  .map((condition) => `${condition.field_label} ${condition.operator_label}${condition.value_label ? ` ${condition.value_label}` : ''}`)
                  .join('؛ ');
                return `trigger: ${triggerLabel} | شرط‌ها: ${conditions || 'بدون شرط مشخص'} | مخاطب: ${rule.target_summary || rule.target_type || 'نامشخص'} | اقدام‌ها: ${actionTypes || 'نامشخص'}`;
              })
            : ['برای این مرحله اتوماسیون مستقیمی ثبت نشده است.'],
        };
      }),
      known_gaps: knownGaps,
    };
  });

  const filteredProcesses = selectedProcessId
    ? processes.filter((process) => process.id === selectedProcessId)
    : processes;

  return {
    intent: 'process_guide',
    process_summary: {
      module_id: moduleId || null,
      record_id: recordId || null,
      process_field_key: fieldKey || null,
      process_count: filteredProcesses.length,
      source_kind: sourceKind,
      selected_process_id: selectedProcessId,
    },
    available_processes: processes.map((process) => ({
      id: process.id,
      label: process.label,
      templateId: process.template_id,
      templateName: process.template_name,
      stageCount: process.stage_count,
    })),
    processes: filteredProcesses,
    known_gaps: Array.from(new Set(filteredProcesses.flatMap((process) => process.known_gaps))),
  };
};

export const narrowProcessGuideContext = (
  context: ProcessGuideContext | Record<string, any> | null | undefined,
  selectedProcessId?: string | null,
) => {
  if (!context || typeof context !== 'object') return null;
  const normalizedSelectedId = String(selectedProcessId || '').trim() || null;
  if (!normalizedSelectedId) return context as ProcessGuideContext;
  const base = context as ProcessGuideContext;
  const filteredProcesses = (Array.isArray(base.processes) ? base.processes : [])
    .filter((process) => String(process?.id || '').trim() === normalizedSelectedId);
  return {
    ...base,
    process_summary: {
      ...(base.process_summary || {}),
      process_count: filteredProcesses.length,
      selected_process_id: normalizedSelectedId,
    },
    processes: filteredProcesses,
    known_gaps: Array.from(new Set(filteredProcesses.flatMap((process) => process.known_gaps || []))),
  } as ProcessGuideContext;
};
