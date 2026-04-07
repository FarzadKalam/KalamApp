import {
  WorkflowAction,
  WorkflowCondition,
  WorkflowExecutionMode,
  WorkflowIntervalUnit,
  WorkflowTriggerType,
  createWorkflowId,
} from './workflowTypes';

export type LegacyProcessAutomationTriggerType =
  | 'process_started'
  | 'previous_stage_completed'
  | 'current_stage_in_progress'
  | 'current_stage_completed';

export type ProcessAutomationTriggerType = WorkflowTriggerType | 'previous_stage_completed';

export type ProcessAutomationTargetType =
  | 'current_task_assignee'
  | 'previous_stage_assignee'
  | 'next_stage_assignee'
  | 'task_type_assignee'
  | 'specific_user'
  | 'specific_role';

export type ProcessAutomationActionType = 'send_note';

export type ProcessAutomationRule = {
  id: string;
  name?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  trigger_type: ProcessAutomationTriggerType;
  execution_mode?: WorkflowExecutionMode | null;
  interval_value?: number | null;
  interval_unit?: WorkflowIntervalUnit | null;
  interval_at?: string | null;
  batch_size?: number | null;
  conditions_all?: WorkflowCondition[] | null;
  conditions_any?: WorkflowCondition[] | null;
  target_type: ProcessAutomationTargetType;
  target_task_type?: string | null;
  target_user_id?: string | null;
  target_role_id?: string | null;
  note_text?: string | null;
  actions?: WorkflowAction[] | null;
};

export const PROCESS_AUTOMATION_TARGET_OPTIONS: Array<{ label: string; value: ProcessAutomationTargetType }> = [
  { label: 'مسئول همین فعالیت', value: 'current_task_assignee' },
  { label: 'مسئول مرحله قبل', value: 'previous_stage_assignee' },
  { label: 'مسئول مرحله بعد', value: 'next_stage_assignee' },
  { label: 'مسئول فعالیتی از این نوع', value: 'task_type_assignee' },
  { label: 'کاربر مشخص', value: 'specific_user' },
  { label: 'تیم مشخص', value: 'specific_role' },
];

export const PROCESS_AUTOMATION_LEGACY_PREVIOUS_STAGE_TRIGGER_OPTION = {
  label: 'وقتی فعالیت قبلی تکمیل شد',
  value: 'previous_stage_completed' as const,
};

const PROCESS_AUTOMATION_TRIGGER_LABELS: Record<ProcessAutomationTriggerType, string> = {
  on_create: 'وقتی فعالیت جدید ایجاد شد',
  on_upsert: 'وقتی فعالیت ایجاد یا به روز شد',
  interval: 'بر اساس بازه زمانی',
  previous_stage_completed: 'وقتی فعالیت قبلی تکمیل شد',
};

const DEFAULT_NOTE_TEMPLATE = '{{task_name}} وارد وضعیت {{status_label}} شد.';
const DEFAULT_STATUS_FIELD_KEY = '__task__status';

const isWorkflowTriggerType = (value: string): value is WorkflowTriggerType =>
  ['on_create', 'on_upsert', 'interval'].includes(value);

const isProcessAutomationTriggerType = (value: string): value is ProcessAutomationTriggerType =>
  isWorkflowTriggerType(value) || value === 'previous_stage_completed';

const isWorkflowExecutionMode = (value: string): value is WorkflowExecutionMode =>
  ['first_match', 'every_match'].includes(value);

const isWorkflowIntervalUnit = (value: string): value is WorkflowIntervalUnit =>
  ['hour', 'day', 'month'].includes(value);

const createDefaultStatusCondition = (): WorkflowCondition => ({
  id: createWorkflowId(),
  field: DEFAULT_STATUS_FIELD_KEY,
  operator: 'eq',
  value: undefined,
});

const hasTaskStatusCondition = (conditions?: WorkflowCondition[] | null) =>
  (Array.isArray(conditions) ? conditions : []).some(
    (condition) => String(condition?.field || '').trim() === DEFAULT_STATUS_FIELD_KEY
  );

const prependLegacyStatusCondition = (
  conditions: WorkflowCondition[] | null | undefined,
  statusValue: string
) => {
  const normalized = Array.isArray(conditions) ? conditions : [];
  if (hasTaskStatusCondition(normalized)) return normalized;
  return [
    {
      id: `__legacy_status_${statusValue}__`,
      field: DEFAULT_STATUS_FIELD_KEY,
      operator: 'eq',
      value: statusValue,
    },
    ...normalized,
  ];
};

const normalizeLegacyTrigger = (
  rawTriggerType: string,
  currentConditionsAll: WorkflowCondition[] | null | undefined
): {
  triggerType: ProcessAutomationTriggerType;
  executionMode: WorkflowExecutionMode;
  conditionsAll: WorkflowCondition[];
} => {
  if (rawTriggerType === 'previous_stage_completed') {
    return {
      triggerType: 'previous_stage_completed',
      executionMode: 'every_match',
      conditionsAll: Array.isArray(currentConditionsAll) ? currentConditionsAll : [],
    };
  }

  if (rawTriggerType === 'process_started') {
    return {
      triggerType: 'on_upsert',
      executionMode: 'every_match',
      conditionsAll: prependLegacyStatusCondition(currentConditionsAll, 'in_progress'),
    };
  }

  if (rawTriggerType === 'current_stage_in_progress') {
    return {
      triggerType: 'on_upsert',
      executionMode: 'every_match',
      conditionsAll: prependLegacyStatusCondition(currentConditionsAll, 'in_progress'),
    };
  }

  if (rawTriggerType === 'current_stage_completed') {
    return {
      triggerType: 'on_upsert',
      executionMode: 'every_match',
      conditionsAll: prependLegacyStatusCondition(currentConditionsAll, 'done'),
    };
  }

  return {
    triggerType: 'on_upsert',
    executionMode: 'every_match',
    conditionsAll: Array.isArray(currentConditionsAll) ? currentConditionsAll : [],
  };
};

export const createProcessAutomationRuleId = () =>
  `proc_auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createDefaultProcessAutomationRule = (): ProcessAutomationRule => ({
  id: createProcessAutomationRuleId(),
  name: 'اتوماسیون جدید',
  description: '',
  is_active: true,
  trigger_type: 'on_upsert',
  execution_mode: 'every_match',
  interval_value: null,
  interval_unit: null,
  interval_at: null,
  batch_size: null,
  conditions_all: [createDefaultStatusCondition()],
  conditions_any: [],
  target_type: 'current_task_assignee',
  target_task_type: null,
  target_user_id: null,
  target_role_id: null,
  note_text: DEFAULT_NOTE_TEMPLATE,
  actions: [
    {
      id: createWorkflowId(),
      type: 'send_note',
      config: {
        recipient_fields: [],
        note_text: DEFAULT_NOTE_TEMPLATE,
      },
    },
  ],
});

export const normalizeProcessAutomationRule = (value: any): ProcessAutomationRule | null => {
  if (!value || typeof value !== 'object') return null;

  const targetType = String(value?.target_type || '').trim() as ProcessAutomationTargetType;
  if (!targetType) return null;

  const rawTriggerType = String(value?.trigger_type || '').trim();
  const baseConditionsAll = Array.isArray(value?.conditions_all) ? value.conditions_all : [];
  const baseConditionsAny = Array.isArray(value?.conditions_any) ? value.conditions_any : [];
  const legacyNormalized = normalizeLegacyTrigger(rawTriggerType, baseConditionsAll);
  const normalizedTriggerType = isProcessAutomationTriggerType(rawTriggerType)
    ? rawTriggerType
    : legacyNormalized.triggerType;
  const normalizedExecutionMode = isWorkflowExecutionMode(String(value?.execution_mode || '').trim())
    ? value.execution_mode
    : legacyNormalized.executionMode;

  return {
    id: String(value?.id || createProcessAutomationRuleId()),
    name: String(value?.name || '').trim() || null,
    description: String(value?.description || '').trim() || null,
    is_active: value?.is_active !== false,
    trigger_type: normalizedTriggerType,
    execution_mode: normalizedExecutionMode,
    interval_value: normalizedTriggerType === 'interval'
      ? Math.max(1, Number.parseInt(String(value?.interval_value || '1'), 10) || 1)
      : null,
    interval_unit: normalizedTriggerType === 'interval' && isWorkflowIntervalUnit(String(value?.interval_unit || '').trim())
      ? value.interval_unit
      : (normalizedTriggerType === 'interval' ? 'day' : null),
    interval_at: normalizedTriggerType === 'interval'
      ? (String(value?.interval_at || '').trim() || null)
      : null,
    batch_size: normalizedTriggerType === 'interval'
      ? Math.max(1, Number.parseInt(String(value?.batch_size || '0'), 10) || 0) || null
      : null,
    conditions_all: normalizedTriggerType === rawTriggerType ? baseConditionsAll : legacyNormalized.conditionsAll,
    conditions_any: baseConditionsAny,
    target_type: targetType,
    target_task_type: String(value?.target_task_type || '').trim() || null,
    target_user_id: String(value?.target_user_id || '').trim() || null,
    target_role_id: String(value?.target_role_id || '').trim() || null,
    note_text: String(
      value?.note_text
      || value?.actions?.[0]?.config?.note_text
      || ''
    ).trim() || null,
    actions: Array.isArray(value?.actions)
      ? value.actions.map((action: any) => (
          String(action?.type || '') === 'send_note'
            ? {
                ...action,
                config: {
                  ...(action?.config || {}),
                  recipient_fields: Array.isArray(action?.config?.recipient_fields)
                    ? action.config.recipient_fields
                    : [],
                },
              }
            : action
        ))
      : [
          {
            id: createWorkflowId(),
            type: 'send_note',
            config: {
              recipient_fields: [],
              note_text: String(
                value?.note_text
                || value?.actions?.[0]?.config?.note_text
                || ''
              ).trim() || DEFAULT_NOTE_TEMPLATE,
            },
          },
        ],
  };
};

export const normalizeProcessAutomationRules = (value: any): ProcessAutomationRule[] =>
  (Array.isArray(value) ? value : [])
    .map((rule) => normalizeProcessAutomationRule(rule))
    .filter((rule): rule is ProcessAutomationRule => Boolean(rule));

export const getProcessAutomationRuleSummary = (rule: ProcessAutomationRule) => {
  const triggerLabel = PROCESS_AUTOMATION_TRIGGER_LABELS[rule?.trigger_type || 'on_upsert'] || 'اجرای نامشخص';
  const actionRecipientFields = (rule?.actions || []).flatMap((action: any) =>
    String(action?.type || '') === 'send_note' && Array.isArray(action?.config?.recipient_fields)
      ? action.config.recipient_fields
      : []
  );
  if (actionRecipientFields.length > 0) {
    return `${triggerLabel}، گیرنده از داخل اقدام ها`;
  }
  const targetLabel =
    PROCESS_AUTOMATION_TARGET_OPTIONS.find((item) => item.value === rule?.target_type)?.label
    || 'مقصد نامشخص';
  return `${triggerLabel}، برای ${targetLabel}`;
};
