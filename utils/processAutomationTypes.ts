import { WorkflowAction, WorkflowCondition, createWorkflowId } from './workflowTypes';

export type ProcessAutomationTriggerType =
  | 'process_started'
  | 'previous_stage_completed'
  | 'current_stage_in_progress'
  | 'current_stage_completed';

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

export const PROCESS_AUTOMATION_TRIGGER_OPTIONS: Array<{ label: string; value: ProcessAutomationTriggerType }> = [
  { label: 'وقتی فرآیند شروع شد', value: 'process_started' },
  { label: 'وقتی این فعالیت در حال انجام شد', value: 'current_stage_in_progress' },
  { label: 'وقتی این فعالیت تکمیل شد', value: 'current_stage_completed' },
];

const PROCESS_AUTOMATION_TRIGGER_LABELS: Record<ProcessAutomationTriggerType, string> = {
  process_started: 'وقتی فرآیند شروع شد',
  previous_stage_completed: 'وقتی فعالیت قبلی تکمیل شد',
  current_stage_in_progress: 'وقتی این فعالیت در حال انجام شد',
  current_stage_completed: 'وقتی این فعالیت تکمیل شد',
};

export const createProcessAutomationRuleId = () =>
  `proc_auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createDefaultProcessAutomationRule = (): ProcessAutomationRule => ({
  id: createProcessAutomationRuleId(),
  name: 'اتوماسیون جدید',
  description: '',
  is_active: true,
  trigger_type: 'current_stage_completed',
  conditions_all: [],
  conditions_any: [],
  target_type: 'current_task_assignee',
  target_task_type: null,
  target_user_id: null,
  target_role_id: null,
  note_text: '{{task_name}} وارد وضعیت {{status_label}} شد.',
  actions: [
    {
      id: createWorkflowId(),
      type: 'send_note',
      config: {
        note_text: '{{task_name}} وارد وضعیت {{status_label}} شد.',
      },
    },
  ],
});

export const normalizeProcessAutomationRule = (value: any): ProcessAutomationRule | null => {
  if (!value || typeof value !== 'object') return null;

  const targetType = String(value?.target_type || '').trim() as ProcessAutomationTargetType;
  if (!targetType) return null;

  return {
    id: String(value?.id || createProcessAutomationRuleId()),
    name: String(value?.name || '').trim() || null,
    description: String(value?.description || '').trim() || null,
    is_active: value?.is_active !== false,
    trigger_type: (
      ['process_started', 'previous_stage_completed', 'current_stage_in_progress', 'current_stage_completed'].includes(String(value?.trigger_type || ''))
        ? value.trigger_type
        : 'current_stage_completed'
    ) as ProcessAutomationTriggerType,
    conditions_all: Array.isArray(value?.conditions_all) ? value.conditions_all : [],
    conditions_any: Array.isArray(value?.conditions_any) ? value.conditions_any : [],
    target_type: targetType,
    target_task_type: String(value?.target_task_type || '').trim() || null,
    target_user_id: String(value?.target_user_id || '').trim() || null,
    target_role_id: String(value?.target_role_id || '').trim() || null,
    note_text: String(
      value?.note_text
      || value?.actions?.[0]?.config?.note_text
      || ''
    ).trim() || null,
    actions: Array.isArray(value?.actions) ? value.actions : [
      {
        id: createWorkflowId(),
        type: 'send_note',
        config: {
          note_text: String(
            value?.note_text
            || value?.actions?.[0]?.config?.note_text
            || ''
          ).trim() || '{{task_name}} وارد وضعیت {{status_label}} شد.',
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
  const triggerLabel = PROCESS_AUTOMATION_TRIGGER_LABELS[rule?.trigger_type || 'current_stage_completed'] || 'اجرای نامشخص';
  const targetLabel =
    PROCESS_AUTOMATION_TARGET_OPTIONS.find((item) => item.value === rule?.target_type)?.label
    || 'مقصد نامشخص';
  return `${triggerLabel}، برای ${targetLabel}`;
};
