export type ProcessAutomationTriggerType = 'status_changed_to';

export type ProcessAutomationTargetType =
  | 'current_task_assignee'
  | 'next_stage_assignee'
  | 'task_type_assignee'
  | 'specific_user'
  | 'specific_role';

export type ProcessAutomationActionType = 'send_note';

export type ProcessAutomationRule = {
  id: string;
  name?: string | null;
  is_active?: boolean | null;
  trigger_type: ProcessAutomationTriggerType;
  trigger_status?: string | null;
  target_type: ProcessAutomationTargetType;
  target_task_type?: string | null;
  target_user_id?: string | null;
  target_role_id?: string | null;
  note_text?: string | null;
  action_type?: ProcessAutomationActionType | null;
};

export const PROCESS_AUTOMATION_TARGET_OPTIONS: Array<{ label: string; value: ProcessAutomationTargetType }> = [
  { label: 'مسئول همین فعالیت', value: 'current_task_assignee' },
  { label: 'مسئول مرحله بعد', value: 'next_stage_assignee' },
  { label: 'مسئول فعالیتی از این نوع', value: 'task_type_assignee' },
  { label: 'کاربر مشخص', value: 'specific_user' },
  { label: 'تیم مشخص', value: 'specific_role' },
];

export const createProcessAutomationRuleId = () =>
  `proc_auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createDefaultProcessAutomationRule = (): ProcessAutomationRule => ({
  id: createProcessAutomationRuleId(),
  name: '',
  is_active: true,
  trigger_type: 'status_changed_to',
  trigger_status: 'in_progress',
  target_type: 'current_task_assignee',
  target_task_type: null,
  target_user_id: null,
  target_role_id: null,
  note_text: '{{task_name}} وارد وضعیت {{status_label}} شد.',
  action_type: 'send_note',
});

export const normalizeProcessAutomationRule = (value: any): ProcessAutomationRule | null => {
  if (!value || typeof value !== 'object') return null;

  const targetType = String(value?.target_type || '').trim() as ProcessAutomationTargetType;
  if (!targetType) return null;

  return {
    id: String(value?.id || createProcessAutomationRuleId()),
    name: String(value?.name || '').trim() || null,
    is_active: value?.is_active !== false,
    trigger_type: 'status_changed_to',
    trigger_status: String(value?.trigger_status || '').trim() || null,
    target_type: targetType,
    target_task_type: String(value?.target_task_type || '').trim() || null,
    target_user_id: String(value?.target_user_id || '').trim() || null,
    target_role_id: String(value?.target_role_id || '').trim() || null,
    note_text: String(value?.note_text || '').trim() || null,
    action_type: 'send_note',
  };
};

export const normalizeProcessAutomationRules = (value: any): ProcessAutomationRule[] =>
  (Array.isArray(value) ? value : [])
    .map((rule) => normalizeProcessAutomationRule(rule))
    .filter((rule): rule is ProcessAutomationRule => Boolean(rule));

export const getProcessAutomationRuleSummary = (rule: ProcessAutomationRule) => {
  const triggerLabel = String(rule?.trigger_status || '').trim() || 'تغییر وضعیت';
  const targetLabel =
    PROCESS_AUTOMATION_TARGET_OPTIONS.find((item) => item.value === rule?.target_type)?.label
    || 'مقصد نامشخص';
  return `وقتی وضعیت به ${triggerLabel} رسید، برای ${targetLabel}`;
};
