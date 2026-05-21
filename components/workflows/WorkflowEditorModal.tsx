import React, { useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Collapse,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Switch,
} from 'antd';
import { FieldType, ModuleField } from '../../types';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
import { supportsGlobalRoleAssignee } from '../../utils/assigneeSupport';
import {
  fetchAssigneeDirectory,
  fetchDynamicOptionsMap,
  fetchProcessTemplateOptions,
  fetchTagOptions,
} from '../../utils/referenceData';
import { fetchRelationOptionsForField } from '../../utils/relationOptions';
import {
  getWorkflowConditionFields,
} from '../../utils/workflowHelpers';
import {
  INTERVAL_DAY_CONDITION_OPTIONS,
  WORKFLOW_ASSIGNEE_FIELD_KEY,
  WorkflowAction,
  WorkflowCondition,
  WorkflowModuleOption,
  WorkflowRecord,
  intervalUnitOptions,
  triggerTypeOptions,
  workflowExecutionModeOptions,
} from '../../utils/workflowTypes';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import {
  resolveOverlayPopupContainer,
} from '../../utils/popupContainer';
import AdaptiveSelectField from '../AdaptiveSelectField';
import PersianDatePicker from '../PersianDatePicker';
import WorkflowActionsBuilder from './WorkflowActionsBuilder';
import WorkflowConditionsGroup from './WorkflowConditionsGroup';

type WorkflowEditorModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialModuleId?: string | null;
  record?: WorkflowRecord | null;
  canEdit?: boolean;
  moduleOptions: WorkflowModuleOption[];
};

type FormValues = {
  module_id: string;
  name: string;
  description?: string;
  trigger_type: 'on_create' | 'on_upsert' | 'interval';
  execution_mode: 'first_match' | 'every_match';
  interval_value?: number;
  interval_unit?: 'hour' | 'day' | 'month';
  interval_at?: string | null;
  interval_first_run_at?: string | null;
  interval_minute?: number | null;
  interval_allowed_from_hour?: number | null;
  interval_allowed_to_hour?: number | null;
  interval_day_of_month?: number | null;
  interval_day_condition?: string | null;
  interval_days_after_holiday?: number | null;
  batch_size?: number;
  is_active?: boolean;
};

const loadWorkflowFieldOptions = async (
  field: ModuleField,
  moduleScopeId: string
): Promise<Array<{ label: string; value: string }>> => {
  const scopeModuleId = String((field as any)?.workflowOptionScopeModuleId || moduleScopeId || '').trim();

  if (field.key === WORKFLOW_ASSIGNEE_FIELD_KEY) {
    const directory = await fetchAssigneeDirectory(supabase);
    const userOptions = (directory.users || []).map((user) => ({
      label: String(user?.display_name || user?.full_name || user?.id || '').trim(),
      value: `user_${String(user?.id || '').trim()}`,
    })).filter((item) => item.value !== 'user_');

    const roleOptions = supportsGlobalRoleAssignee(scopeModuleId)
      ? (directory.roles || []).map((role) => ({
          label: String(role?.title || role?.id || '').trim(),
          value: `role_${String(role?.id || '').trim()}`,
        })).filter((item) => item.value !== 'role_')
      : [];

    return [...userOptions, ...roleOptions];
  }

  if (field.type === FieldType.TAGS) {
    return fetchTagOptions(supabase);
  }

  if (field.type === FieldType.USER) {
    const directory = await fetchAssigneeDirectory(supabase);

    return (directory.users || []).map((user) => ({
      label: String(user?.display_name || user?.full_name || 'بدون عنوان').trim(),
      value: String(user?.id || '').trim(),
    })).filter((item) => item.value);
  }

  const relationConfig = field.type === FieldType.MULTI_RELATION
    ? field?.multiRelationConfig
    : field?.relationConfig;
  const targetModule = String(relationConfig?.targetModule || '').trim();
  if (!targetModule) {
    return [];
  }

  if (targetModule === 'process_templates') {
    return fetchProcessTemplateOptions(supabase, scopeModuleId);
  }

  const effectiveField = field.type === FieldType.MULTI_RELATION
    ? {
        ...field,
        relationConfig,
      }
    : field;

  return fetchRelationOptionsForField(supabase, effectiveField, { limit: 300 });
};

const loadDynamicAndRelationOptions = async (
  moduleId: string,
  fields: ModuleField[]
): Promise<{
  dynamicOptions: Record<string, Array<{ label: string; value: string }>>;
  relationOptions: Record<string, Array<{ label: string; value: string }>>;
}> => {
  if (!moduleId || !MODULES[moduleId]) {
    return { dynamicOptions: {}, relationOptions: {} };
  }

  const dynamicOptions: Record<string, Array<{ label: string; value: string }>> = {};
  const relationOptions: Record<string, Array<{ label: string; value: string }>> = {};

  const dynamicCategories = Array.from(
    new Set(
      (fields || [])
        .map((field) => field.dynamicOptionsCategory)
        .filter((category): category is string => !!category)
    )
  );

  Object.assign(dynamicOptions, await fetchDynamicOptionsMap(supabase, dynamicCategories));

  const optionFields = (fields || []).filter(
    (field) =>
      field.key === WORKFLOW_ASSIGNEE_FIELD_KEY ||
      String(field.key || '').endsWith(`__${WORKFLOW_ASSIGNEE_FIELD_KEY}`) ||
      field.type === FieldType.RELATION ||
      field.type === FieldType.MULTI_RELATION ||
      field.type === FieldType.USER ||
      field.type === FieldType.TAGS
  );

  await Promise.allSettled(
    optionFields.map(async (field) => {
      relationOptions[field.key] = await loadWorkflowFieldOptions(field, moduleId);
    })
  );

  return { dynamicOptions, relationOptions };
};

const WorkflowEditorModal: React.FC<WorkflowEditorModalProps> = ({
  open,
  onClose,
  onSaved,
  initialModuleId,
  record,
  canEdit = true,
  moduleOptions,
}) => {
  const overlayZIndexBase = 13080;
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [moduleId, setModuleId] = useState<string>(initialModuleId || '');
  const [dynamicOptions, setDynamicOptions] = useState<
    Record<string, Array<{ label: string; value: string }>>
  >({});
  const [relationOptions, setRelationOptions] = useState<
    Record<string, Array<{ label: string; value: string }>>
  >({});
  const [conditionsAll, setConditionsAll] = useState<WorkflowCondition[]>([]);
  const [conditionsAny, setConditionsAny] = useState<WorkflowCondition[]>([]);
  const [actions, setActions] = useState<WorkflowAction[]>([]);

  const selectedModuleFields: ModuleField[] = useMemo(
    () => MODULES[moduleId]?.fields || [],
    [moduleId]
  );

  const conditionFields: ModuleField[] = useMemo(
    () => getWorkflowConditionFields(moduleId),
    [moduleId]
  );
  const conditionFieldKeySet = useMemo(
    () =>
      new Set(
        conditionFields
          .map((field) => String(field?.key || '').trim())
          .filter(Boolean)
      ),
    [conditionFields]
  );

  const isEditMode = !!record?.id;
  const triggerType = Form.useWatch('trigger_type', form);
  const intervalUnit = Form.useWatch('interval_unit', form);
  const intervalDayCondition = Form.useWatch('interval_day_condition', form);

  const showDaysAfterHoliday = intervalDayCondition === 'not_friday' || intervalDayCondition === 'not_friday_or_holiday';

  useEffect(() => {
    if (!open) return;
    const nextModuleId = record?.module_id || initialModuleId || '';
    setModuleId(nextModuleId);
    form.setFieldsValue({
      module_id: nextModuleId,
      name: record?.name || '',
      description: record?.description || '',
      trigger_type: (record?.trigger_type as any) || 'on_create',
      execution_mode: (record?.execution_mode as any) || 'first_match',
      interval_value: record?.interval_value || undefined,
      interval_unit: (record?.interval_unit as any) || 'day',
      interval_at: record?.interval_at || null,
      interval_first_run_at: record?.interval_first_run_at || null,
      interval_minute: record?.interval_minute ?? null,
      interval_allowed_from_hour: record?.interval_allowed_from_hour ?? null,
      interval_allowed_to_hour: record?.interval_allowed_to_hour ?? null,
      interval_day_of_month: record?.interval_day_of_month ?? null,
      interval_day_condition: record?.interval_day_condition || 'any',
      interval_days_after_holiday: record?.interval_days_after_holiday ?? null,
      batch_size: record?.batch_size || undefined,
      is_active: record?.is_active ?? true,
    });
    setConditionsAll(Array.isArray(record?.conditions_all) ? (record.conditions_all as any) : []);
    setConditionsAny(Array.isArray(record?.conditions_any) ? (record.conditions_any as any) : []);
    setActions(Array.isArray(record?.actions) ? (record.actions as any) : []);
  }, [open, record, initialModuleId, form]);

  useEffect(() => {
    if (!open || !moduleId) return;
    let cancelled = false;

    const run = async () => {
      const loaded = await loadDynamicAndRelationOptions(moduleId, conditionFields).catch(() => ({
        dynamicOptions: {},
        relationOptions: {},
      }));
      if (cancelled) return;
      setDynamicOptions(loaded.dynamicOptions);
      setRelationOptions(loaded.relationOptions);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [open, moduleId, conditionFields]);

  useEffect(() => {
    if (!open) return;

    const pruneInvalidConditions = (items: WorkflowCondition[]) => {
      if (conditionFieldKeySet.size === 0) {
        return items.length > 0 ? [] : items;
      }
      return items.filter((condition) =>
        conditionFieldKeySet.has(String(condition?.field || '').trim())
      );
    };

    setConditionsAll((prev) => {
      const next = pruneInvalidConditions(prev);
      return next.length === prev.length ? prev : next;
    });
    setConditionsAny((prev) => {
      const next = pruneInvalidConditions(prev);
      return next.length === prev.length ? prev : next;
    });
  }, [conditionFieldKeySet, open]);

  const handleSubmit = async () => {
    if (!canEdit) return;
    try {
      const values = await form.validateFields();
      if (!values.module_id) {
        message.error('ماژول مرتبط را انتخاب کنید.');
        return;
      }
      if (actions.length === 0) {
        message.error('حداقل یک اقدام برای گردش کار اضافه کنید.');
        return;
      }

      setSubmitting(true);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;

      const isInterval = values.trigger_type === 'interval';
      const payload: Record<string, any> = {
        module_id: values.module_id,
        name: values.name?.trim(),
        description: values.description?.trim() || null,
        trigger_type: values.trigger_type,
        execution_mode: values.execution_mode || 'first_match',
        interval_value: isInterval ? values.interval_value || null : null,
        interval_unit: isInterval ? values.interval_unit || null : null,
        interval_at: isInterval ? values.interval_at || null : null,
        interval_first_run_at: isInterval ? values.interval_first_run_at || null : null,
        interval_minute: isInterval ? values.interval_minute ?? null : null,
        interval_allowed_from_hour: isInterval ? values.interval_allowed_from_hour ?? null : null,
        interval_allowed_to_hour: isInterval ? values.interval_allowed_to_hour ?? null : null,
        interval_day_of_month: isInterval ? values.interval_day_of_month ?? null : null,
        interval_day_condition: isInterval ? values.interval_day_condition || null : null,
        interval_days_after_holiday: isInterval ? values.interval_days_after_holiday ?? null : null,
        batch_size: isInterval ? values.batch_size || null : null,
        conditions_all: conditionsAll,
        conditions_any: conditionsAny,
        actions,
        is_active: values.is_active !== false,
        updated_by: userId,
      };

      if (isEditMode) {
        const { error } = await supabase.from('workflows').update(payload).eq('id', record!.id);
        if (error) throw error;
        message.success('گردش کار به‌روزرسانی شد.');
      } else {
        const { error } = await supabase.from('workflows').insert([
          {
            ...payload,
            created_by: userId,
          },
        ]);
        if (error) throw error;
        message.success('گردش کار جدید ثبت شد.');
      }

      onSaved();
      onClose();
    } catch (err: any) {
      if (Array.isArray(err?.errorFields)) return;
      message.error(toFaErrorMessage(err, 'خطا در ذخیره گردش کار'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={isEditMode ? 'ویرایش گردش کار' : 'ایجاد گردش کار جدید'}
      width={1120}
      zIndex={13000}
      destroyOnHidden
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
          {isEditMode ? 'ذخیره تغییرات' : 'ثبت گردش کار'}
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" disabled={!canEdit}>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Form.Item label="ماژول مرتبط" name="module_id" rules={[{ required: true }]}>
              <AdaptiveSelectField
                className="w-full"
                showSearch
                optionFilterProp="label"
                optionLabelProp="label"
                options={moduleOptions}
                getPopupContainer={resolveOverlayPopupContainer}
                modalContainer={resolveOverlayPopupContainer}
                overlayZIndexBase={overlayZIndexBase}
                onChange={(nextVal) => setModuleId(String(nextVal || ''))}
                placeholder="انتخاب ماژول"
              />
            </Form.Item>
            <Form.Item
              label="نام گردش کار"
              name="name"
              rules={[{ required: true, message: 'نام گردش کار الزامی است.' }]}
            >
              <Input placeholder="مثال: اعلان سفارش‌های معوق" />
            </Form.Item>
          </div>
          <Form.Item label="توضیحات" name="description">
            <Input.TextArea rows={2} placeholder="توضیح کوتاه درباره هدف این گردش کار" />
          </Form.Item>
          <Form.Item name="is_active" valuePropName="checked" initialValue={true}>
            <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" />
          </Form.Item>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <h4 className="font-bold mb-3">شرایط اجرا</h4>
          <Form.Item name="trigger_type" initialValue="on_create">
            <Radio.Group options={triggerTypeOptions} optionType="button" buttonStyle="solid" />
          </Form.Item>
          <Form.Item label="زمان اجرا" name="execution_mode" initialValue="first_match">
            <Radio.Group options={workflowExecutionModeOptions} />
          </Form.Item>
          {triggerType === 'interval' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Form.Item
                  label="هر"
                  name="interval_value"
                  rules={[{ required: true, message: 'مقدار بازه الزامی است.' }]}
                >
                  <InputNumber min={1} className="w-full persian-number" placeholder="عدد" />
                </Form.Item>
                <Form.Item
                  label="واحد زمان"
                  name="interval_unit"
                  rules={[{ required: true, message: 'واحد بازه را انتخاب کنید.' }]}
                >
                  <AdaptiveSelectField
                    options={intervalUnitOptions}
                    getPopupContainer={resolveOverlayPopupContainer}
                    modalContainer={resolveOverlayPopupContainer}
                    overlayZIndexBase={overlayZIndexBase}
                  />
                </Form.Item>
                <Form.Item label="اولین زمان اجرا" name="interval_first_run_at">
                  <PersianDatePicker
                    type="DATETIME"
                    overlayZIndexBase={overlayZIndexBase}
                    modalContainer={resolveOverlayPopupContainer}
                    pickerTitle="اولین زمان اجرا"
                  />
                </Form.Item>
                <Form.Item label="چه تعداد رکورد بررسی شود؟" name="batch_size">
                  <InputNumber min={1} className="w-full persian-number" placeholder="پیش‌فرض: همه" />
                </Form.Item>
              </div>

              {intervalUnit === 'hour' && (
                <div className="rounded-lg border border-blue-100 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-950/20 p-3">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-3">تنظیمات اجرای ساعتی</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Form.Item label="در دقیقه" name="interval_minute" className="mb-0">
                      <InputNumber
                        min={0}
                        max={59}
                        className="w-full persian-number"
                        placeholder="۰ تا ۵۹"
                      />
                    </Form.Item>
                    <Form.Item label="از ساعت" name="interval_allowed_from_hour" className="mb-0">
                      <InputNumber
                        min={0}
                        max={23}
                        className="w-full persian-number"
                        placeholder="مثال: ۸"
                        addonAfter="زمان مجاز اجرا"
                      />
                    </Form.Item>
                    <Form.Item label="الی ساعت" name="interval_allowed_to_hour" className="mb-0">
                      <InputNumber
                        min={0}
                        max={23}
                        className="w-full persian-number"
                        placeholder="مثال: ۱۸"
                      />
                    </Form.Item>
                  </div>
                </div>
              )}

              {intervalUnit === 'day' && (
                <div className="rounded-lg border border-orange-100 dark:border-orange-900/30 bg-orange-50/40 dark:bg-orange-950/20 p-3">
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-3">تنظیمات اجرای روزانه</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Form.Item label="اگر آن روز" name="interval_day_condition" className="mb-0" initialValue="any">
                      <AdaptiveSelectField
                        options={INTERVAL_DAY_CONDITION_OPTIONS}
                        getPopupContainer={resolveOverlayPopupContainer}
                        modalContainer={resolveOverlayPopupContainer}
                        overlayZIndexBase={overlayZIndexBase}
                      />
                    </Form.Item>
                    {showDaysAfterHoliday && (
                      <Form.Item
                        label="چند روز پس از آخرین جمعه/تعطیلی اجرا شود؟"
                        name="interval_days_after_holiday"
                        className="mb-0"
                      >
                        <InputNumber min={0} className="w-full persian-number" placeholder="مثال: ۱" />
                      </Form.Item>
                    )}
                  </div>
                </div>
              )}

              {intervalUnit === 'month' && (
                <div className="rounded-lg border border-purple-100 dark:border-purple-900/30 bg-purple-50/40 dark:bg-purple-950/20 p-3">
                  <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-3">تنظیمات اجرای ماهانه</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Form.Item label="در ساعت" name="interval_at" className="mb-0">
                      <PersianDatePicker
                        type="TIME"
                        overlayZIndexBase={overlayZIndexBase}
                        modalContainer={resolveOverlayPopupContainer}
                        pickerTitle="ساعت اجرا"
                      />
                    </Form.Item>
                    <Form.Item label="چندمین روز ماه؟" name="interval_day_of_month" className="mb-0">
                      <InputNumber
                        min={1}
                        max={31}
                        className="w-full persian-number"
                        placeholder="۱ تا ۳۱"
                      />
                    </Form.Item>
                    <Form.Item label="اگر آن روز" name="interval_day_condition" className="mb-0" initialValue="any">
                      <AdaptiveSelectField
                        options={INTERVAL_DAY_CONDITION_OPTIONS}
                        getPopupContainer={resolveOverlayPopupContainer}
                        modalContainer={resolveOverlayPopupContainer}
                        overlayZIndexBase={overlayZIndexBase}
                      />
                    </Form.Item>
                  </div>
                  {showDaysAfterHoliday && (
                    <div className="mt-3">
                      <Form.Item
                        label="چند روز پس از آخرین جمعه/تعطیلی اجرا شود؟"
                        name="interval_days_after_holiday"
                        className="mb-0"
                      >
                        <InputNumber min={0} className="w-full persian-number" placeholder="مثال: ۱" />
                      </Form.Item>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <h4 className="font-bold mb-3">شرط‌ها</h4>
          <Collapse
            defaultActiveKey={['all_conditions']}
            items={[
              {
                key: 'all_conditions',
                label: 'حتما همه این شرط‌ها باید برقرار باشند',
                children: (
                  <WorkflowConditionsGroup
                    value={conditionsAll}
                    onChange={setConditionsAll}
                    fields={conditionFields}
                    dynamicOptions={dynamicOptions}
                    relationOptions={relationOptions}
                    disabled={!canEdit}
                    overlayZIndexBase={overlayZIndexBase}
                    popupContainer={resolveOverlayPopupContainer}
                    adaptiveMode="desktop"
                  />
                ),
              },
              {
                key: 'any_conditions',
                label: 'کافی است فقط یکی از این شرط‌ها برقرار باشد',
                children: (
                  <WorkflowConditionsGroup
                    value={conditionsAny}
                    onChange={setConditionsAny}
                    fields={conditionFields}
                    dynamicOptions={dynamicOptions}
                    relationOptions={relationOptions}
                    disabled={!canEdit}
                    overlayZIndexBase={overlayZIndexBase}
                    popupContainer={resolveOverlayPopupContainer}
                    adaptiveMode="desktop"
                  />
                ),
              },
            ]}
          />
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h4 className="font-bold mb-3">افزودن اقدام</h4>
          <WorkflowActionsBuilder
            value={actions}
            onChange={setActions}
            currentModuleId={moduleId}
            currentModuleFields={selectedModuleFields}
            variableFields={conditionFields}
            moduleOptions={moduleOptions}
            dynamicOptions={dynamicOptions}
            relationOptions={relationOptions}
            disabled={!canEdit}
            overlayZIndexBase={overlayZIndexBase}
            popupContainer={resolveOverlayPopupContainer}
          />
        </div>
      </Form>
    </Modal>
  );
};

export default WorkflowEditorModal;
