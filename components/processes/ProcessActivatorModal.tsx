import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Form,
  Input,
  Modal,
  Radio,
  Switch,
} from 'antd';
import type { ModuleField } from '../../types';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { isAbortLikeError } from '../../utils/requestErrors';
import {
  createWorkflowId,
  triggerTypeOptions,
  workflowExecutionModeOptions,
  type WorkflowCondition,
  type WorkflowRecord,
} from '../../utils/workflowTypes';
import WorkflowConditionsGroup from '../workflows/WorkflowConditionsGroup';
import WorkflowIntervalScheduleFields from '../workflows/WorkflowIntervalScheduleFields';

type OptionList = Array<{ label: string; value: string }>;

type ProcessActivatorModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: (workflowId: string) => void | Promise<void>;
  workflowId?: string | null;
  templateId: string;
  triggerKey: string;
  sourceNodeKey?: string | null;
  targetLaneKeys: string[];
  targetModuleIds: string[];
  defaultName?: string | null;
  manualEnabled?: boolean;
  conditionFields: ModuleField[];
  dynamicOptions: Record<string, OptionList>;
  relationOptions: Record<string, OptionList>;
};

type FormValues = {
  name: string;
  description?: string;
  trigger_type: 'on_create' | 'on_upsert' | 'interval';
  process_execution_action?: 'copy_process_template' | 'execute_process';
  execution_mode: 'first_match' | 'every_match';
  interval_value?: number | null;
  interval_unit?: 'hour' | 'day' | 'week' | 'month' | null;
  interval_at?: string | null;
  interval_first_run_at?: string | null;
  interval_minute?: number | null;
  interval_allowed_from_hour?: number | null;
  interval_allowed_to_hour?: number | null;
  interval_day_of_month?: number | null;
  interval_day_condition?: string | null;
  interval_days_after_holiday?: number | null;
  batch_size?: number | null;
  is_active?: boolean;
};

const SOURCE_NODE_CONDITION_ID = '__process_activator_source_node__';

const ProcessActivatorModal: React.FC<ProcessActivatorModalProps> = ({
  open,
  onClose,
  onSaved,
  workflowId,
  templateId,
  triggerKey,
  sourceNodeKey,
  targetLaneKeys,
  targetModuleIds,
  defaultName,
  manualEnabled = true,
  conditionFields,
  dynamicOptions,
  relationOptions,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [record, setRecord] = useState<WorkflowRecord | null>(null);
  const [conditionsAll, setConditionsAll] = useState<WorkflowCondition[]>([]);
  const [conditionsAny, setConditionsAny] = useState<WorkflowCondition[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const triggerType = Form.useWatch('trigger_type', form);
  const isActive = Form.useWatch('is_active', form);

  const editableConditionsAll = useMemo(
    () => conditionsAll.filter((condition) => condition.id !== SOURCE_NODE_CONDITION_ID),
    [conditionsAll],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('workflows')
          .select('*')
          .eq('scope_type', 'process_activator')
          .eq('process_template_id', templateId)
          .eq('process_trigger_key', triggerKey)
          .limit(1);
        if (workflowId) query = query.eq('id', workflowId);
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        const nextRecord = (data || null) as WorkflowRecord | null;
        const recordActions = Array.isArray(nextRecord?.actions) ? nextRecord.actions : [];
        const processAction = recordActions.find((action: any) => (
          action?.type === 'copy_process_template' || action?.type === 'execute_process'
        ));
        const hasLegacyStageActivationAction = recordActions.some((action: any) => action?.type === 'activate_specific_process_stage');
        setRecord(nextRecord);
        form.setFieldsValue({
          name: nextRecord?.name || defaultName || 'فعال‌کننده فرآیند',
          description: nextRecord?.description || '',
          trigger_type: (nextRecord?.trigger_type as FormValues['trigger_type']) || 'on_upsert',
          execution_mode: (nextRecord?.execution_mode as FormValues['execution_mode']) || 'first_match',
          interval_value: nextRecord?.interval_value || 1,
          interval_unit: nextRecord?.interval_unit || 'day',
          interval_at: nextRecord?.interval_at || null,
          interval_first_run_at: nextRecord?.interval_first_run_at || null,
          interval_minute: nextRecord?.interval_minute ?? null,
          interval_allowed_from_hour: nextRecord?.interval_allowed_from_hour ?? null,
          interval_allowed_to_hour: nextRecord?.interval_allowed_to_hour ?? null,
          interval_day_of_month: nextRecord?.interval_day_of_month ?? null,
          interval_day_condition: nextRecord?.interval_day_condition || 'any',
          interval_days_after_holiday: nextRecord?.interval_days_after_holiday ?? null,
          batch_size: nextRecord?.batch_size || null,
          is_active: nextRecord?.is_active !== false,
          process_execution_action: processAction?.type === 'execute_process'
            ? 'execute_process'
            : (hasLegacyStageActivationAction ? 'execute_process' : 'copy_process_template'),
        });
        setConditionsAll(Array.isArray(nextRecord?.conditions_all) ? nextRecord.conditions_all : []);
        setConditionsAny(Array.isArray(nextRecord?.conditions_any) ? nextRecord.conditions_any : []);
      } catch (error) {
        if (isAbortLikeError(error)) return;
        if (!cancelled) {
          message.error(toFaErrorMessage(error as Error, 'بارگذاری تنظیمات فعال‌کننده ناموفق بود'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [defaultName, form, message, open, templateId, triggerKey, workflowId]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;
      const isInterval = values.trigger_type === 'interval';
      const lockedConditions = sourceNodeKey
        ? [{
            id: SOURCE_NODE_CONDITION_ID,
            field: 'process_node_key',
            operator: 'eq',
            value: sourceNodeKey,
          }]
        : [];
      const selectedProcessActionType = values.process_execution_action === 'execute_process'
        ? 'execute_process'
        : 'copy_process_template';
      const existingActivationAction = record?.actions?.find((action) => (
        action?.type === selectedProcessActionType
        || action?.type === 'copy_process_template'
        || action?.type === 'execute_process'
        || action?.type === 'activate_specific_process_stage'
      ));
      const activationAction = {
        id: String(existingActivationAction?.id || createWorkflowId()),
        type: selectedProcessActionType,
        config: {
          template_id: templateId,
          process_trigger_key: triggerKey,
          target_lane_keys: targetLaneKeys,
        },
      };
      const payload: Record<string, any> = {
        module_id: sourceNodeKey ? 'tasks' : (targetModuleIds[0] || 'tasks'),
        module_ids: targetModuleIds,
        scope_type: 'process_activator',
        process_template_id: templateId,
        process_trigger_key: triggerKey,
        process_source_node_key: sourceNodeKey || null,
        process_target_lane_keys: targetLaneKeys,
        manual_enabled: manualEnabled,
        name: values.name.trim(),
        description: values.description?.trim() || null,
        trigger_type: values.trigger_type,
        execution_mode: values.execution_mode || 'first_match',
        interval_value: isInterval ? Math.max(1, Number(values.interval_value || 1)) : null,
        interval_unit: isInterval ? values.interval_unit || 'day' : null,
        interval_at: isInterval ? values.interval_at || null : null,
        interval_first_run_at: isInterval ? values.interval_first_run_at || null : null,
        interval_minute: isInterval ? values.interval_minute ?? null : null,
        interval_allowed_from_hour: isInterval ? values.interval_allowed_from_hour ?? null : null,
        interval_allowed_to_hour: isInterval ? values.interval_allowed_to_hour ?? null : null,
        interval_day_of_month: isInterval ? values.interval_day_of_month ?? null : null,
        interval_day_condition: isInterval ? values.interval_day_condition || null : null,
        interval_days_after_holiday: isInterval ? values.interval_days_after_holiday ?? null : null,
        batch_size: isInterval && values.batch_size ? Math.max(1, Number(values.batch_size)) : null,
        conditions_all: [...lockedConditions, ...editableConditionsAll],
        conditions_any: conditionsAny,
        actions: [activationAction],
        is_active: values.is_active !== false,
        updated_by: userId,
      };

      let savedId = String(record?.id || '').trim();
      if (savedId) {
        const { error } = await supabase.from('workflows').update(payload).eq('id', savedId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('workflows')
          .insert({ ...payload, created_by: userId })
          .select('id')
          .single();
        if (error) throw error;
        savedId = String(data?.id || '').trim();
      }
      if (!savedId) throw new Error('شناسه گردش‌کار فعال‌کننده دریافت نشد.');
      await onSaved(savedId);
      message.success('شرط‌ها و زمان‌بندی فعال‌کننده ذخیره شد');
      onClose();
    } catch (error: any) {
      if (Array.isArray(error?.errorFields)) return;
      if (isAbortLikeError(error)) return;
      message.error(toFaErrorMessage(error, 'ذخیره فعال‌کننده ناموفق بود'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="شرط‌ها و زمان‌بندی فعال‌کننده فرآیند"
      open={open}
      onCancel={onClose}
      onOk={() => { void handleSubmit(); }}
      confirmLoading={submitting}
      okText="ذخیره"
      cancelText="انصراف"
      width={880}
      zIndex={10120}
      destroyOnHidden
      loading={loading}
    >
      <Form form={form} layout="vertical">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Form.Item name="name" label="نام گردش‌کار فعال‌کننده" rules={[{ required: true, message: 'نام را وارد کنید.' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="is_active" label="وضعیت اجرای خودکار" valuePropName="checked">
            <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
          </Form.Item>
        </div>
        <Form.Item name="description" label="توضیحات">
          <Input.TextArea rows={2} />
        </Form.Item>
        {isActive !== false ? (
          <Form.Item name="process_execution_action" label="نوع اجرای خودکار">
            <Radio.Group
              options={[
                { label: 'کپی کردن الگوی فرآیند', value: 'copy_process_template' },
                { label: 'اجرای فرآیند و ارجاع خودکار مراحل', value: 'execute_process' },
              ]}
              optionType="button"
              buttonStyle="solid"
            />
          </Form.Item>
        ) : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Form.Item name="trigger_type" label="نوع اجرا">
            <Radio.Group options={triggerTypeOptions} optionType="button" buttonStyle="solid" />
          </Form.Item>
          <Form.Item name="execution_mode" label="تکرار اجرا">
            <Radio.Group options={workflowExecutionModeOptions} />
          </Form.Item>
        </div>
        {triggerType === 'interval' ? (
          <WorkflowIntervalScheduleFields
            form={form}
            overlayZIndexBase={10150}
          />
        ) : null}
        {sourceNodeKey ? (
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message="این گردش‌کار فقط برای فعالیت مرحله متصل به همین فعال‌کننده اجرا می‌شود."
          />
        ) : null}
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-sm font-semibold">همه شرط‌ها</div>
            <WorkflowConditionsGroup
              value={editableConditionsAll}
              onChange={setConditionsAll}
              fields={conditionFields}
              dynamicOptions={dynamicOptions}
              relationOptions={relationOptions}
              overlayZIndexBase={10150}
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold">یا یکی از شرط‌ها</div>
            <WorkflowConditionsGroup
              value={conditionsAny}
              onChange={setConditionsAny}
              fields={conditionFields}
              dynamicOptions={dynamicOptions}
              relationOptions={relationOptions}
              overlayZIndexBase={10150}
            />
          </div>
        </div>
        <Alert
          className="mt-4"
          type="success"
          showIcon
          message="اقدام فعال‌سازی ردیف‌های مقصد به‌صورت سیستمی و idempotent اجرا می‌شود."
        />
      </Form>
    </Modal>
  );
};

export default ProcessActivatorModal;
