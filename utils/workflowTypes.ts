import { ModuleField } from '../types';

export type WorkflowTriggerType = 'on_create' | 'on_upsert' | 'interval';
export type WorkflowIntervalUnit = 'hour' | 'day' | 'month';
export type WorkflowExecutionMode = 'first_match' | 'every_match';

export type IntervalDayCondition =
  | 'any'
  | 'is_friday'
  | 'not_friday'
  | 'is_friday_or_holiday'
  | 'not_friday_or_holiday'
  | 'is_saturday'
  | 'not_saturday'
  | 'is_sunday'
  | 'not_sunday'
  | 'is_monday'
  | 'not_monday'
  | 'is_tuesday'
  | 'not_tuesday'
  | 'is_wednesday'
  | 'not_wednesday'
  | 'is_thursday'
  | 'not_thursday';

export const INTERVAL_DAY_CONDITION_OPTIONS: Array<{ label: string; value: IntervalDayCondition }> = [
  { label: 'فرقی ندارد چه روزی باشد', value: 'any' },
  { label: 'جمعه باشد', value: 'is_friday' },
  { label: 'جمعه نباشد', value: 'not_friday' },
  { label: 'جمعه یا تعطیل رسمی باشد', value: 'is_friday_or_holiday' },
  { label: 'جمعه یا تعطیل رسمی نباشد', value: 'not_friday_or_holiday' },
  { label: 'شنبه باشد', value: 'is_saturday' },
  { label: 'شنبه نباشد', value: 'not_saturday' },
  { label: 'یکشنبه باشد', value: 'is_sunday' },
  { label: 'یکشنبه نباشد', value: 'not_sunday' },
  { label: 'دوشنبه باشد', value: 'is_monday' },
  { label: 'دوشنبه نباشد', value: 'not_monday' },
  { label: 'سه‌شنبه باشد', value: 'is_tuesday' },
  { label: 'سه‌شنبه نباشد', value: 'not_tuesday' },
  { label: 'چهارشنبه باشد', value: 'is_wednesday' },
  { label: 'چهارشنبه نباشد', value: 'not_wednesday' },
  { label: 'پنجشنبه باشد', value: 'is_thursday' },
  { label: 'پنجشنبه نباشد', value: 'not_thursday' },
];

export type WorkflowActionType =
  | 'send_note'
  | 'send_note_sms'
  | 'send_web_form_link'
  | 'send_sms'
  | 'send_email'
  | 'run_ai_prompt'
  | 'send_bot_message'
  | 'send_telegram_bot'
  | 'send_bale_bot'
  | 'send_rubika_bot'
  | 'update_record'
  | 'send_to_next_stages'
  | 'send_to_specific_stage'
  | 'create_standalone_record'
  | 'create_related_record'
  | 'copy_process_template'
  | 'execute_process'
  | 'activate_next_process_stage'
  | 'activate_specific_process_stage'
  | 'publish_story';

// Config اقدام انتشار استوری
export type PublishStoryActionConfig = {
  slide_type: 'gradient' | 'template';
  gradient_key: string;
  text_template: string;     // متن با متغیر مثل {{field_name}} یا {{creator_name}}
  publisher_token?: string;
  expires_hours: number | null;
  is_org_wide: boolean;
  mention_user_ids: string[];
  viewer_user_ids?: string[];
  viewer_role_ids: string[];
  notify_sms: boolean;
  sms_template: string;
  sms_recipient_role_ids: string[];
};

export const WORKFLOW_ASSIGNEE_FIELD_KEY = '__workflow_assignee';
const WORKFLOW_RELATED_FIELD_PREFIX = '__workflow_related__';
const WORKFLOW_MULTI_RELATION_PREFIX = '__workflow_multi_relation__';
const WORKFLOW_NOTE_RECIPIENT_FIELD_PREFIX = '__workflow_note_recipient__';
const PROCESS_NEXT_STAGE_FIELD_PREFIX = '__process_next_stage__';
export type WorkflowNoteRecipientStrategy = 'user' | 'role';

export type WorkflowCondition = {
  id: string;
  field: string;
  operator: string;
  value?: any;
};

export type WorkflowAction = {
  id: string;
  type: WorkflowActionType;
  config: Record<string, any>;
};

export type WorkflowRecord = {
  id: string;
  module_id: string;
  module_ids?: string[] | null;
  scope_type?: 'standard' | 'process_activator' | string | null;
  process_template_id?: string | null;
  process_trigger_key?: string | null;
  process_source_node_key?: string | null;
  process_target_lane_keys?: string[] | null;
  manual_enabled?: boolean | null;
  name: string;
  description?: string | null;
  trigger_type: WorkflowTriggerType;
  execution_mode?: WorkflowExecutionMode | null;
  interval_value?: number | null;
  interval_unit?: WorkflowIntervalUnit | null;
  interval_at?: string | null;
  interval_first_run_at?: string | null;
  interval_minute?: number | null;
  interval_allowed_from_hour?: number | null;
  interval_allowed_to_hour?: number | null;
  interval_day_of_month?: number | null;
  interval_day_condition?: IntervalDayCondition | string | null;
  interval_days_after_holiday?: number | null;
  batch_size?: number | null;
  conditions_all?: WorkflowCondition[] | null;
  conditions_any?: WorkflowCondition[] | null;
  actions?: WorkflowAction[] | null;
  is_active?: boolean;
  last_run_at?: string | null;
  server_queued_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type WorkflowModuleOption = {
  label: string;
  value: string;
};

export type WorkflowConditionEditorContext = {
  fields: ModuleField[];
  dynamicOptions: Record<string, Array<{ label: string; value: string }>>;
  relationOptions: Record<string, Array<{ label: string; value: string }>>;
};

export const createWorkflowId = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const triggerTypeOptions: Array<{ label: string; value: WorkflowTriggerType }> = [
  { label: 'وقتی رکورد جدید ایجاد شد', value: 'on_create' },
  { label: 'وقتی رکورد ایجاد یا به‌روز شد', value: 'on_upsert' },
  { label: 'بر اساس بازه زمانی', value: 'interval' },
];

export const workflowExecutionModeOptions: Array<{ label: string; value: WorkflowExecutionMode }> = [
  { label: 'اولین بار که شرایط محقق شد', value: 'first_match' },
  { label: 'هر زمان که شرایط محقق شد', value: 'every_match' },
];

export const intervalUnitOptions: Array<{ label: string; value: WorkflowIntervalUnit }> = [
  { label: 'ساعت', value: 'hour' },
  { label: 'روز', value: 'day' },
  { label: 'ماه', value: 'month' },
];

export const actionTypeOptions: Array<{ label: string; value: WorkflowActionType }> = [
  { label: 'ارسال یادداشت', value: 'send_note' },
  { label: 'ارسال لینک وب‌فرم', value: 'send_web_form_link' },
  { label: 'ارسال پیامک', value: 'send_sms' },
  { label: 'ارسال ایمیل', value: 'send_email' },
  { label: 'اجرای پرامپت هوش مصنوعی', value: 'run_ai_prompt' },
  { label: 'ارسال پیام توسط بات', value: 'send_bot_message' },
  { label: 'به‌روزرسانی رکورد', value: 'update_record' },
  { label: 'ارسال اطلاعات به مراحل بعد', value: 'send_to_next_stages' },
  { label: 'ارسال اطلاعات به مرحله خاص', value: 'send_to_specific_stage' },
  { label: 'ایجاد رکورد مستقل', value: 'create_standalone_record' },
  { label: 'ایجاد رکورد مرتبط', value: 'create_related_record' },
  { label: 'کپی الگوی فرآیند', value: 'copy_process_template' },
  { label: 'اجرای خودکار فرآیند', value: 'execute_process' },
  { label: 'فعال کردن مرحله بعدی', value: 'activate_next_process_stage' },
  { label: 'فعال کردن مرحله خاص', value: 'activate_specific_process_stage' },
  { label: 'انتشار استوری', value: 'publish_story' },
];

// انواع قدیمی بات — برای backward compatibility گردش‌کارهای موجود نگه داشته شده‌اند
// در UI جدید فقط send_bot_message نمایش داده می‌شود
export const legacyBotActionTypes: WorkflowActionType[] = ['send_telegram_bot', 'send_bale_bot', 'send_rubika_bot'];

export const createProcessNextStageFieldKey = (
  offset: 1 | 2,
  fieldKey: string
) => `${PROCESS_NEXT_STAGE_FIELD_PREFIX}${offset}__${String(fieldKey || '').trim()}`;

export const parseProcessNextStageFieldKey = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized.startsWith(PROCESS_NEXT_STAGE_FIELD_PREFIX)) return null;
  const raw = normalized.slice(PROCESS_NEXT_STAGE_FIELD_PREFIX.length);
  const match = raw.match(/^([12])__(.+)$/);
  if (!match) return null;
  const fieldKey = String(match[2] || '').trim();
  if (!fieldKey) return null;
  return { offset: Number(match[1]) as 1 | 2, fieldKey };
};

export const createWorkflowRelatedFieldKey = (
  relationFieldKey: string,
  targetModuleId: string,
  targetFieldKey: string
) => `${WORKFLOW_RELATED_FIELD_PREFIX}${relationFieldKey}::${targetModuleId}::${targetFieldKey}`;

export const parseWorkflowRelatedFieldKey = (value: string) => {
  const normalized = String(value || '');
  if (!normalized.startsWith(WORKFLOW_RELATED_FIELD_PREFIX)) return null;
  const raw = normalized.slice(WORKFLOW_RELATED_FIELD_PREFIX.length);
  const [relationFieldKey, targetModuleId, targetFieldKey] = raw.split('::');
  if (!relationFieldKey || !targetModuleId || !targetFieldKey) return null;
  return { relationFieldKey, targetModuleId, targetFieldKey };
};

export const createWorkflowMultiRelationFieldKey = (
  fieldKey: string,
  targetModuleId: string,
  targetPhoneFieldKey: string
) => `${WORKFLOW_MULTI_RELATION_PREFIX}${fieldKey}::${targetModuleId}::${targetPhoneFieldKey}`;

export const parseWorkflowMultiRelationFieldKey = (value: string) => {
  const normalized = String(value || '');
  if (!normalized.startsWith(WORKFLOW_MULTI_RELATION_PREFIX)) return null;
  const raw = normalized.slice(WORKFLOW_MULTI_RELATION_PREFIX.length);
  const [fieldKey, targetModuleId, targetPhoneFieldKey] = raw.split('::');
  if (!fieldKey || !targetModuleId || !targetPhoneFieldKey) return null;
  return { fieldKey, targetModuleId, targetPhoneFieldKey };
};

export const createWorkflowNoteRecipientFieldKey = (
  fieldKey: string,
  strategy: WorkflowNoteRecipientStrategy
) => `${WORKFLOW_NOTE_RECIPIENT_FIELD_PREFIX}${strategy}::${String(fieldKey || '').trim()}`;

export const parseWorkflowNoteRecipientFieldKey = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized.startsWith(WORKFLOW_NOTE_RECIPIENT_FIELD_PREFIX)) return null;
  const raw = normalized.slice(WORKFLOW_NOTE_RECIPIENT_FIELD_PREFIX.length);
  const separatorIndex = raw.indexOf('::');
  if (separatorIndex <= 0) return null;
  const strategy = raw.slice(0, separatorIndex) as WorkflowNoteRecipientStrategy;
  const fieldKey = raw.slice(separatorIndex + 2).trim();
  if (!fieldKey || (strategy !== 'user' && strategy !== 'role')) return null;
  return { strategy, fieldKey };
};
