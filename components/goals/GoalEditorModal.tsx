import React, { useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Switch,
} from 'antd';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
import { fetchAssigneeDirectory } from '../../utils/referenceData';
import {
  GOAL_ALL_USERS_VALUE,
  getGoalUserSelectionValue,
  getGoalDateFieldOptions,
  getGoalModuleOptions,
  getGoalNumericFieldOptions,
  normalizeGoalRecord,
} from '../../utils/goals';
import {
  GOAL_METRIC_TYPE_OPTIONS,
  GOAL_PERIOD_UNIT_OPTIONS,
  GOAL_SCOPE_OPTIONS,
  type GoalRecord,
} from '../../utils/goalTypes';
import { loadWorkflowConditionEditorOptions } from '../../utils/workflowConditionOptions';
import { getWorkflowConditionFields } from '../../utils/workflowHelpers';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import PersianDatePicker from '../PersianDatePicker';
import WorkflowConditionsGroup from '../workflows/WorkflowConditionsGroup';

type GoalEditorModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialModuleId?: string | null;
  record?: GoalRecord | null;
  canEdit?: boolean;
  permissions?: Record<string, { view?: boolean }> | null;
};

type FormValues = {
  module_id: string;
  name: string;
  description?: string;
  goal_scope: 'personal' | 'team';
  period_unit: GoalRecord['period_unit'];
  subperiod_unit: GoalRecord['subperiod_unit'];
  metric_type: GoalRecord['metric_type'];
  goal_start_date?: string | null;
  goal_end_date?: string | null;
  metric_field_key?: string | null;
  date_field_key?: string | null;
  target_value?: number | null;
  levels_enabled?: boolean;
  bronze_value?: number | null;
  silver_value?: number | null;
  gold_value?: number | null;
  assignee_user_ids: string[];
  assignee_role_ids: string[];
  is_active?: boolean;
};

const GoalEditorModal: React.FC<GoalEditorModalProps> = ({
  open,
  onClose,
  onSaved,
  initialModuleId,
  record,
  canEdit = true,
  permissions,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [moduleId, setModuleId] = useState<string>(initialModuleId || '');
  const [conditionsAll, setConditionsAll] = useState<any[]>([]);
  const [conditionsAny, setConditionsAny] = useState<any[]>([]);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [userOptions, setUserOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [roleOptions, setRoleOptions] = useState<Array<{ label: string; value: string }>>([]);

  const isEditMode = !!record?.id;
  const metricType = Form.useWatch('metric_type', form);
  const levelsEnabled = Form.useWatch('levels_enabled', form);
  const periodUnit = Form.useWatch('period_unit', form);

  const moduleOptions = useMemo(() => getGoalModuleOptions(permissions), [permissions]);
  const numericFieldOptions = useMemo(() => getGoalNumericFieldOptions(moduleId), [moduleId]);
  const dateFieldOptions = useMemo(() => getGoalDateFieldOptions(moduleId), [moduleId]);
  const userSelectOptions = useMemo(
    () => [
      { label: 'همه کاربران', value: GOAL_ALL_USERS_VALUE },
      ...userOptions,
    ],
    [userOptions]
  );
  const availableSubperiodOptions = useMemo(() => {
    const selectedIndex = GOAL_PERIOD_UNIT_OPTIONS.findIndex((item) => item.value === periodUnit);
    if (selectedIndex < 0) return GOAL_PERIOD_UNIT_OPTIONS;
    return GOAL_PERIOD_UNIT_OPTIONS.slice(0, selectedIndex + 1);
  }, [periodUnit]);
  const conditionFields = useMemo(() => getWorkflowConditionFields(moduleId), [moduleId]);
  const popupContainer = (triggerNode: HTMLElement | null) =>
    triggerNode?.parentElement || document.body;

  useEffect(() => {
    if (!open) return;
    const normalized = record ? normalizeGoalRecord(record) : null;
    const nextModuleId = normalized?.module_id || initialModuleId || '';
    setModuleId(nextModuleId);
    form.setFieldsValue({
      module_id: nextModuleId,
      name: normalized?.name || '',
      description: normalized?.description || '',
      goal_scope: normalized?.goal_scope || 'personal',
      period_unit: normalized?.period_unit || 'month',
      subperiod_unit: normalized?.subperiod_unit || 'week',
      metric_type: normalized?.metric_type || 'count',
      goal_start_date: normalized?.config?.goal_start_date || undefined,
      goal_end_date: normalized?.config?.goal_end_date || undefined,
      metric_field_key: normalized?.metric_field_key || undefined,
      date_field_key: normalized?.date_field_key || 'created_at',
      target_value: normalized?.target_value ?? undefined,
      levels_enabled: normalized?.levels_enabled === true,
      bronze_value: normalized?.bronze_value ?? undefined,
      silver_value: normalized?.silver_value ?? undefined,
      gold_value: normalized?.gold_value ?? undefined,
      assignee_user_ids: getGoalUserSelectionValue(normalized),
      assignee_role_ids: Array.isArray(normalized?.assignee_role_ids) ? normalized!.assignee_role_ids! : [],
      is_active: normalized?.is_active !== false,
    });
    setConditionsAll(Array.isArray(normalized?.conditions_all) ? normalized!.conditions_all! : []);
    setConditionsAny(Array.isArray(normalized?.conditions_any) ? normalized!.conditions_any! : []);
  }, [form, initialModuleId, open, record]);

  useEffect(() => {
    if (!open || !moduleId) {
      setDynamicOptions({});
      setRelationOptions({});
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const loaded = await loadWorkflowConditionEditorOptions(moduleId, conditionFields);
        if (cancelled) return;
        setDynamicOptions(loaded.dynamicOptions);
        setRelationOptions(loaded.relationOptions);
      } catch {
        if (!cancelled) {
          setDynamicOptions({});
          setRelationOptions({});
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [conditionFields, moduleId, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const run = async () => {
      try {
        const directory = await fetchAssigneeDirectory(supabase);
        if (cancelled) return;
        setUserOptions(
          (directory.users || [])
            .map((item) => ({
              label: String(item?.display_name || item?.full_name || item?.email || item?.id || '').trim(),
              value: String(item?.id || '').trim(),
            }))
            .filter((item) => item.value)
        );
        setRoleOptions(
          (directory.roles || [])
            .map((item) => ({
              label: String(item?.title || item?.id || '').trim(),
              value: String(item?.id || '').trim(),
            }))
            .filter((item) => item.value)
        );
      } catch {
        if (!cancelled) {
          setUserOptions([]);
          setRoleOptions([]);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (metricType === 'count') {
      form.setFieldValue('metric_field_key', undefined);
    }
  }, [form, metricType]);

  useEffect(() => {
    if (!availableSubperiodOptions.some((item) => item.value === form.getFieldValue('subperiod_unit'))) {
      form.setFieldValue('subperiod_unit', availableSubperiodOptions[availableSubperiodOptions.length - 1]?.value || 'day');
    }
  }, [availableSubperiodOptions, form]);

  const handleSubmit = async () => {
    if (!canEdit) return;
    try {
      const values = await form.validateFields();
      if (!MODULES[values.module_id]) {
        message.error('ماژول هدف معتبر نیست.');
        return;
      }
      if ((values.metric_type === 'sum' || values.metric_type === 'avg') && !values.metric_field_key) {
        message.error('برای جمع یا میانگین باید یک فیلد عددی انتخاب شود.');
        return;
      }
      if (
        values.goal_start_date &&
        values.goal_end_date &&
        values.goal_end_date < values.goal_start_date
      ) {
        message.error('تاریخ پایان نمی‌تواند کوچک‌تر از تاریخ شروع باشد.');
        return;
      }
      if (values.levels_enabled) {
        const hasAnyLevel = [values.bronze_value, values.silver_value, values.gold_value].some((item) => Number(item || 0) > 0);
        if (!hasAnyLevel) {
          message.error('حداقل یک سطح برای هدف سطح‌بندی‌شده وارد کنید.');
          return;
        }
      } else if (Number(values.target_value || 0) <= 0) {
        message.error('مقدار هدف باید بزرگ‌تر از صفر باشد.');
        return;
      }

      setSubmitting(true);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;
      const rawUserSelections = Array.isArray(values.assignee_user_ids) ? values.assignee_user_ids : [];
      const useAllUsers = rawUserSelections.includes(GOAL_ALL_USERS_VALUE);
      const normalizedUserIds = useAllUsers
        ? []
        : rawUserSelections.filter((item) => item !== GOAL_ALL_USERS_VALUE);

      const payload = {
        module_id: values.module_id,
        name: values.name.trim(),
        description: values.description?.trim() || null,
        goal_scope: values.goal_scope,
        period_unit: values.period_unit,
        subperiod_unit: values.subperiod_unit,
        metric_type: values.metric_type,
        metric_field_key: values.metric_type === 'count' ? null : values.metric_field_key || null,
        date_field_key: values.date_field_key || 'created_at',
        target_value: values.levels_enabled ? null : Number(values.target_value || 0),
        levels_enabled: values.levels_enabled === true,
        bronze_value: values.levels_enabled ? Number(values.bronze_value || 0) || null : null,
        silver_value: values.levels_enabled ? Number(values.silver_value || 0) || null : null,
        gold_value: values.levels_enabled ? Number(values.gold_value || 0) || null : null,
        assignee_user_ids: normalizedUserIds,
        assignee_role_ids: values.assignee_role_ids || [],
        conditions_all: conditionsAll,
        conditions_any: conditionsAny,
        config: {
          ...(normalizeGoalRecord(record || {}).config || {}),
          assignment_users_mode: useAllUsers ? 'all' : 'selected',
          goal_start_date: values.goal_start_date || null,
          goal_end_date: values.goal_end_date || null,
        },
        is_active: values.is_active !== false,
        updated_by: userId,
      };

      if (isEditMode && record?.id) {
        const { error } = await supabase.from('goals').update(payload).eq('id', record.id);
        if (error) throw error;
        message.success('هدف بروزرسانی شد.');
      } else {
        const { error } = await supabase.from('goals').insert([{ ...payload, created_by: userId }]);
        if (error) throw error;
        message.success('هدف جدید ثبت شد.');
      }

      onSaved();
      onClose();
    } catch (error: any) {
      if (Array.isArray(error?.errorFields)) return;
      message.error(toFaErrorMessage(error, 'ذخیره هدف ناموفق بود.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={1120}
      zIndex={1401}
      destroyOnHidden
      title={isEditMode ? 'ویرایش هدف' : 'ایجاد هدف جدید'}
      footer={[
        <Button key="cancel" onClick={onClose}>
          انصراف
        </Button>,
        <Button
          key="save"
          type="primary"
          loading={submitting}
          disabled={!canEdit}
          onClick={handleSubmit}
          className="bg-leather-600 hover:!bg-leather-500"
        >
          {isEditMode ? 'ذخیره تغییرات' : 'ثبت هدف'}
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" disabled={!canEdit}>
        <div className="mb-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item label="ماژول" name="module_id" rules={[{ required: true, message: 'ماژول الزامی است.' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                options={moduleOptions}
                onChange={(value) => setModuleId(String(value || ''))}
                getPopupContainer={popupContainer}
                placeholder="انتخاب ماژول"
              />
            </Form.Item>
            <Form.Item label="عنوان هدف" name="name" rules={[{ required: true, message: 'عنوان هدف الزامی است.' }]}>
              <Input placeholder="مثال: جذب سرنخ ماهانه" />
            </Form.Item>
          </div>
          <Form.Item label="توضیحات" name="description">
            <Input.TextArea rows={2} placeholder="توضیح کوتاه درباره این هدف" />
          </Form.Item>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Form.Item label="نوع هدف" name="goal_scope" initialValue="personal">
              <Radio.Group optionType="button" buttonStyle="solid" options={GOAL_SCOPE_OPTIONS} />
            </Form.Item>
            <Form.Item label="فعال" name="is_active" valuePropName="checked" initialValue={true}>
              <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
            </Form.Item>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
          <h4 className="mb-3 font-bold">بازه و معیار محاسبه</h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Form.Item label="بازه اصلی" name="period_unit" initialValue="month">
              <Select options={GOAL_PERIOD_UNIT_OPTIONS} getPopupContainer={popupContainer} />
            </Form.Item>
            <Form.Item label="بازه فرعی پیش‌فرض" name="subperiod_unit" initialValue="week">
              <Select options={availableSubperiodOptions} getPopupContainer={popupContainer} />
            </Form.Item>
            <Form.Item label="فیلد تاریخ" name="date_field_key" initialValue="created_at">
              <Select options={dateFieldOptions} getPopupContainer={popupContainer} />
            </Form.Item>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Form.Item label="نوع سنجش" name="metric_type" initialValue="count">
              <Select options={GOAL_METRIC_TYPE_OPTIONS} getPopupContainer={popupContainer} />
            </Form.Item>
            <Form.Item label="فیلد عددی" name="metric_field_key">
              <Select
                options={numericFieldOptions}
                placeholder={metricType === 'count' ? 'برای تعداد نیاز نیست' : 'انتخاب فیلد عددی'}
                disabled={metricType === 'count'}
                allowClear
                getPopupContainer={popupContainer}
              />
            </Form.Item>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item label="تاریخ شروع بازه اصلی" name="goal_start_date">
              <PersianDatePicker type="DATE" placeholder="اختیاری" />
            </Form.Item>
            <Form.Item label="تاریخ پایان بازه اصلی" name="goal_end_date">
              <PersianDatePicker type="DATE" placeholder="اختیاری" />
            </Form.Item>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="m-0 font-bold">هدف و سطح‌بندی</h4>
            <Form.Item name="levels_enabled" valuePropName="checked" initialValue={false} className="!mb-0">
              <Switch checkedChildren="سطح‌بندی فعال" unCheckedChildren="یک مقدار ثابت" />
            </Form.Item>
          </div>
          {!levelsEnabled ? (
            <Form.Item label="مقدار هدف" name="target_value">
              <InputNumber min={0} className="w-full persian-number" placeholder="مثال: 100" />
            </Form.Item>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Form.Item label="سطح برنزی" name="bronze_value">
                <InputNumber min={0} className="w-full persian-number" />
              </Form.Item>
              <Form.Item label="سطح نقره‌ای" name="silver_value">
                <InputNumber min={0} className="w-full persian-number" />
              </Form.Item>
              <Form.Item label="سطح طلایی" name="gold_value">
                <InputNumber min={0} className="w-full persian-number" />
              </Form.Item>
            </div>
          )}
        </div>

        <div className="mb-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
          <h4 className="mb-3 font-bold">انتساب هدف</h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item label="اشخاص" name="assignee_user_ids" initialValue={[]}>
              <Select
                mode="multiple"
                options={userSelectOptions}
                optionFilterProp="label"
                showSearch
                getPopupContainer={popupContainer}
                placeholder="انتخاب چند کاربر"
              />
            </Form.Item>
            <Form.Item label="نقش‌ها" name="assignee_role_ids" initialValue={[]}>
              <Select
                mode="multiple"
                options={roleOptions}
                optionFilterProp="label"
                showSearch
                getPopupContainer={popupContainer}
                placeholder="انتخاب چند نقش"
              />
            </Form.Item>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
          <h4 className="mb-3 font-bold">شرط‌ها</h4>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-300">همه شرط‌ها</div>
              <WorkflowConditionsGroup
                value={conditionsAll}
                onChange={(next) => setConditionsAll(next as any[])}
                fields={conditionFields}
                dynamicOptions={dynamicOptions}
                relationOptions={relationOptions}
                disabled={!canEdit}
              />
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-300">حداقل یکی از شرط‌ها</div>
              <WorkflowConditionsGroup
                value={conditionsAny}
                onChange={(next) => setConditionsAny(next as any[])}
                fields={conditionFields}
                dynamicOptions={dynamicOptions}
                relationOptions={relationOptions}
                disabled={!canEdit}
              />
            </div>
          </div>
        </div>
      </Form>
    </Modal>
  );
};

export default GoalEditorModal;
