import { ModuleField } from '../types';

export type WorkflowTriggerType = 'on_create' | 'on_upsert' | 'interval';
export type WorkflowIntervalUnit = 'hour' | 'day' | 'month';

export type WorkflowActionType =
  | 'send_note'
  | 'send_sms'
  | 'send_email'
  | 'update_record'
  | 'create_related_record';

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
  name: string;
  description?: string | null;
  trigger_type: WorkflowTriggerType;
  interval_value?: number | null;
  interval_unit?: WorkflowIntervalUnit | null;
  interval_at?: string | null;
  batch_size?: number | null;
  conditions_all?: WorkflowCondition[] | null;
  conditions_any?: WorkflowCondition[] | null;
  actions?: WorkflowAction[] | null;
  is_active?: boolean;
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

export const intervalUnitOptions: Array<{ label: string; value: WorkflowIntervalUnit }> = [
  { label: 'ساعت', value: 'hour' },
  { label: 'روز', value: 'day' },
  { label: 'ماه', value: 'month' },
];

export const actionTypeOptions: Array<{ label: string; value: WorkflowActionType }> = [
  { label: 'ارسال یادداشت', value: 'send_note' },
  { label: 'ارسال پیامک', value: 'send_sms' },
  { label: 'ارسال ایمیل', value: 'send_email' },
  { label: 'به‌روزرسانی رکورد', value: 'update_record' },
  { label: 'ایجاد رکورد مرتبط', value: 'create_related_record' },
];

