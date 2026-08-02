import React, { useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Switch,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
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
import { loadTaskReportProcessRuntimeCatalog } from '../../utils/reportTaskProcessFields';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { resolveModuleGoalAccessPermissions } from '../../utils/permissions';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import PersianDatePicker from '../PersianDatePicker';
import AdaptiveSelectField from '../AdaptiveSelectField';
import AdaptiveIdentityPicker from '../AdaptiveIdentityPicker';
import FormulaEditorModal from '../formulas/FormulaEditorModal';
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
  result_share_user_ids: string[];
  result_share_role_ids: string[];
  reward_rules?: Array<{
    title?: string;
    trigger_type?: 'touch' | 'achieve' | 'bronze' | 'silver' | 'gold';
    output_type?: 'bonus' | 'wage' | 'penalty' | 'score';
    formula_id?: string | null;
    is_primary?: boolean;
  }>;
  is_active?: boolean;
};

const GOAL_REWARD_TRIGGER_OPTIONS = [
  { label: 'هر بار ورود به کارت هدف', value: 'touch' },
  { label: 'هر بار تحقق هدف', value: 'achieve' },
  { label: 'به ازای هر رکورد', value: 'per_record' },
  { label: 'تحقق سطح برنزی', value: 'bronze' },
  { label: 'تحقق سطح نقره‌ای', value: 'silver' },
  { label: 'تحقق سطح طلایی', value: 'gold' },
];

const GOAL_REWARD_OUTPUT_OPTIONS = [
  { label: 'پاداش', value: 'bonus' },
  { label: 'دستمزد', value: 'wage' },
  { label: 'جریمه', value: 'penalty' },
  { label: 'امتیاز', value: 'score' },
];

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
  const [formulaOptions, setFormulaOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [formulaModalOpen, setFormulaModalOpen] = useState(false);
  const [formulaTargetIndex, setFormulaTargetIndex] = useState<number | null>(null);
  const [editingFormulaId, setEditingFormulaId] = useState<string | null>(null);
  const [taskProcessFields, setTaskProcessFields] = useState<any[]>([]);
  const [taskProcessStatusOptions, setTaskProcessStatusOptions] = useState<any[]>([]);

  const isEditMode = !!record?.id;
  const metricType = Form.useWatch('metric_type', form);
  const metricFieldKey = Form.useWatch('metric_field_key', form);
  const levelsEnabled = Form.useWatch('levels_enabled', form);
  const periodUnit = Form.useWatch('period_unit', form);

  const moduleOptions = useMemo(() => getGoalModuleOptions(permissions), [permissions]);
  const numericFieldOptions = useMemo(
    () => getGoalNumericFieldOptions(moduleId, moduleId === 'tasks' ? taskProcessFields : []),
    [moduleId, taskProcessFields],
  );
  const dateFieldOptions = useMemo(() => getGoalDateFieldOptions(moduleId), [moduleId]);
  const formulaVariableOptions = useMemo(() => {
    const metricLabel = numericFieldOptions.find((item) => item.value === metricFieldKey)?.label;
    return [
      { label: metricLabel ? `مقدار تحقق‌یافته (${metricLabel})` : 'مقدار تحقق‌یافته', token: '{{goal.achieved_value}}' },
      { label: 'درصد تحقق هدف', token: '{{goal.achieved_percent}}' },
      { label: 'هدف نهایی', token: '{{goal.target_value}}' },
    ];
  }, [metricFieldKey, numericFieldOptions]);
  const allUsersIdentityOption = useMemo(() => ({
    kind: 'user' as const,
    id: GOAL_ALL_USERS_VALUE,
    token: `user:${GOAL_ALL_USERS_VALUE}` as const,
    label: 'همه کاربران',
    subtitle: 'تمام اعضای فعال سازمان',
    active: true,
  }), []);
  const availableSubperiodOptions = useMemo(() => {
    const selectedIndex = GOAL_PERIOD_UNIT_OPTIONS.findIndex((item) => item.value === periodUnit);
    if (selectedIndex < 0) return GOAL_PERIOD_UNIT_OPTIONS;
    return GOAL_PERIOD_UNIT_OPTIONS.slice(0, selectedIndex + 1);
  }, [periodUnit]);
  const conditionFields = useMemo(() => {
    const baseFields = getWorkflowConditionFields(moduleId);
    const fields = moduleId === 'tasks' ? [...baseFields, ...taskProcessFields] : baseFields;
    return fields.map((field: any) => (
      field?.key === 'status'
        ? { ...field, options: [...(field.options || []), ...taskProcessStatusOptions] }
        : field
    ));
  }, [moduleId, taskProcessFields, taskProcessStatusOptions]);
  const popupContainer = (triggerNode?: HTMLElement | null) => {
    const modalBodyHost = triggerNode?.closest?.('.ant-modal-body, .ant-modal-content, .ant-modal') as HTMLElement | null;
    return modalBodyHost || resolveOverlayPopupContainer(triggerNode);
  };
  const overlayZIndexBase = 1400;
  const rewardTriggerOptions = useMemo(
    () => {
      let options = levelsEnabled
        ? GOAL_REWARD_TRIGGER_OPTIONS
        : GOAL_REWARD_TRIGGER_OPTIONS.filter((item) => item.value === 'touch' || item.value === 'achieve' || item.value === 'per_record');
      if (metricType !== 'count') {
        options = options.filter((item) => item.value !== 'per_record');
      }
      return options;
    },
    [levelsEnabled, metricType]
  );

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
      result_share_user_ids: Array.isArray(normalized?.config?.result_share_user_ids) ? normalized!.config!.result_share_user_ids! : [],
      result_share_role_ids: Array.isArray(normalized?.config?.result_share_role_ids) ? normalized!.config!.result_share_role_ids! : [],
      reward_rules: Array.isArray(normalized?.config?.goal_reward_rules)
        ? normalized!.config!.goal_reward_rules!.map((item: any) => ({
          title: String(item?.title || '').trim() || undefined,
          trigger_type: item?.trigger_type || 'achieve',
          output_type: item?.output_type || 'bonus',
          formula_id: item?.formula_id || undefined,
          is_primary: item?.is_primary === true,
        }))
        : [],
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
    if (!open || moduleId !== 'tasks') {
      setTaskProcessFields([]);
      setTaskProcessStatusOptions([]);
      return;
    }
    let cancelled = false;
    void loadTaskReportProcessRuntimeCatalog(supabase)
      .then((catalog) => {
        if (cancelled) return;
        setTaskProcessFields([...catalog.fields, ...catalog.linkedFields]);
        setTaskProcessStatusOptions(catalog.statusOptions);
      })
      .catch(() => {
        if (cancelled) return;
        setTaskProcessFields([]);
        setTaskProcessStatusOptions([]);
      });
    return () => { cancelled = true; };
  }, [moduleId, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const run = async () => {
      try {
        const { data, error } = await supabase
          .from('calculation_formulas')
          .select('id, name')
          .eq('context_type', 'goal')
          .eq('is_active', true)
          .order('updated_at', { ascending: false });
        if (error) throw error;
        if (!cancelled) {
          setFormulaOptions(
            (data || [])
              .map((item: any) => ({
                label: String(item?.name || item?.id || '').trim(),
                value: String(item?.id || '').trim(),
              }))
              .filter((item) => item.label && item.value)
          );
        }
      } catch {
        if (!cancelled) setFormulaOptions([]);
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
      const moduleGoalAccess = resolveModuleGoalAccessPermissions(permissions as any, values.module_id);
      if (isEditMode ? !moduleGoalAccess.canEditGoal : !moduleGoalAccess.canCreateGoal) {
        message.error(isEditMode ? 'دسترسی ویرایش هدف برای این ماژول را ندارید.' : 'دسترسی ایجاد هدف برای این ماژول را ندارید.');
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
          result_share_user_ids: Array.isArray(values.result_share_user_ids) ? values.result_share_user_ids : [],
          result_share_role_ids: Array.isArray(values.result_share_role_ids) ? values.result_share_role_ids : [],
          goal_reward_rules: (Array.isArray(values.reward_rules) ? values.reward_rules : [])
            .map((item) => ({
              title: String(item?.title || '').trim() || null,
              trigger_type: item?.trigger_type || 'achieve',
              output_type: item?.output_type || 'bonus',
              formula_id: item?.formula_id || null,
              is_primary: item?.is_primary === true,
            }))
            .filter((item) => item.formula_id),
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
              <AdaptiveSelectField
                showSearch
                optionFilterProp="label"
                options={moduleOptions}
                onChange={(value) => setModuleId(String(value || ''))}
                getPopupContainer={popupContainer as any}
                modalContainer={popupContainer}
                preferLocalPopupContainer
                overlayZIndexBase={overlayZIndexBase}
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
            <Form.Item label="بازه اصلی نمایش و محاسبه" name="period_unit" initialValue="month">
              <AdaptiveSelectField options={GOAL_PERIOD_UNIT_OPTIONS} getPopupContainer={popupContainer as any} modalContainer={popupContainer} preferLocalPopupContainer overlayZIndexBase={overlayZIndexBase} />
            </Form.Item>
            <Form.Item label="بازه فرعی پیش‌فرض" name="subperiod_unit" initialValue="week">
              <AdaptiveSelectField options={availableSubperiodOptions} getPopupContainer={popupContainer as any} modalContainer={popupContainer} preferLocalPopupContainer overlayZIndexBase={overlayZIndexBase} />
            </Form.Item>
            <Form.Item label="فیلد تاریخ" name="date_field_key" initialValue="created_at">
              <AdaptiveSelectField options={dateFieldOptions} getPopupContainer={popupContainer as any} modalContainer={popupContainer} preferLocalPopupContainer overlayZIndexBase={overlayZIndexBase} />
            </Form.Item>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Form.Item label="نوع سنجش" name="metric_type" initialValue="count">
              <AdaptiveSelectField options={GOAL_METRIC_TYPE_OPTIONS} getPopupContainer={popupContainer as any} modalContainer={popupContainer} preferLocalPopupContainer overlayZIndexBase={overlayZIndexBase} />
            </Form.Item>
            <Form.Item label="فیلد عددی" name="metric_field_key">
              <AdaptiveSelectField
                options={numericFieldOptions}
                placeholder={metricType === 'count' ? 'برای تعداد نیاز نیست' : 'انتخاب فیلد عددی'}
                disabled={metricType === 'count'}
                allowClear
                getPopupContainer={popupContainer as any}
                modalContainer={popupContainer}
                preferLocalPopupContainer
                overlayZIndexBase={overlayZIndexBase}
              />
            </Form.Item>
          </div>
          <div className="mt-2 text-xs leading-6 text-gray-500">
            اگر تاریخ شروع و پایان هدف را خالی بگذارید، هدف دائمی در نظر گرفته می‌شود. در غیر این صورت، کارت‌ها فقط در بازه عمر هدف و بر اساس بازه اصلی انتخاب‌شده نمایش داده می‌شوند.
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item label="تاریخ شروع هدف" name="goal_start_date">
              <PersianDatePicker type="DATE" placeholder="اختیاری" modalContainer={popupContainer} overlayZIndexBase={overlayZIndexBase} />
            </Form.Item>
            <Form.Item label="تاریخ پایان هدف" name="goal_end_date">
              <PersianDatePicker type="DATE" placeholder="اختیاری" modalContainer={popupContainer} overlayZIndexBase={overlayZIndexBase} />
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
              <AdaptiveIdentityPicker
                mode="multiple"
                scopes={['user']}
                valueMode="raw"
                additionalOptions={[allUsersIdentityOption]}
                overlayZIndexBase={overlayZIndexBase}
                placeholder="انتخاب چند کاربر"
              />
            </Form.Item>
            <Form.Item label="نقش‌ها" name="assignee_role_ids" initialValue={[]}>
              <AdaptiveIdentityPicker
                mode="multiple"
                scopes={['role']}
                valueMode="raw"
                overlayZIndexBase={overlayZIndexBase}
                placeholder="انتخاب چند نقش"
              />
            </Form.Item>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
          <h4 className="mb-3 font-bold">اشتراک‌گذاری نتایج هدف</h4>
          <div className="mb-2 text-xs leading-6 text-gray-500">
            افراد یا نقش‌های انتخاب‌شده می‌توانند مودال تحقق این هدف را ببینند. اگر به هدف منتسب نباشند، روی کارت بیشترین تحقق اعضای هدف را خواهند دید.
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item label="کاربران مجاز" name="result_share_user_ids" initialValue={[]}>
              <AdaptiveIdentityPicker
                mode="multiple"
                scopes={['user']}
                valueMode="raw"
                overlayZIndexBase={overlayZIndexBase}
                placeholder="انتخاب چند کاربر"
              />
            </Form.Item>
            <Form.Item label="نقش‌های مجاز" name="result_share_role_ids" initialValue={[]}>
              <AdaptiveIdentityPicker
                mode="multiple"
                scopes={['role']}
                valueMode="raw"
                overlayZIndexBase={overlayZIndexBase}
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
                overlayZIndexBase={overlayZIndexBase}
                popupContainer={popupContainer}
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
                overlayZIndexBase={overlayZIndexBase}
                popupContainer={popupContainer}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="m-0 font-bold">پاداش و محاسبه هدف</h4>
              <div className="mt-1 text-xs leading-6 text-gray-500">
                فرمول‌ها و محاسبه‌های پیچیده هر هدف از همین‌جا تعریف می‌شوند.
              </div>
            </div>
          </div>

          <Form.List name="reward_rules">
            {(fields, { add, remove }) => (
              <div className="space-y-3">
                {fields.map((field) => (
                  <div key={field.key} className="rounded-2xl border border-gray-200 p-3 dark:border-gray-800">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Form.Item label="عنوان" name={[field.name, 'title']}>
                        <Input placeholder="مثال: پاداش تحقق سطح طلایی" />
                      </Form.Item>
                      <Form.Item
                        label="نوع خروجی"
                        name={[field.name, 'output_type']}
                        initialValue="bonus"
                        rules={[{ required: true, message: 'نوع خروجی را انتخاب کنید.' }]}
                      >
                        <AdaptiveSelectField options={GOAL_REWARD_OUTPUT_OPTIONS} getPopupContainer={popupContainer as any} modalContainer={popupContainer} preferLocalPopupContainer overlayZIndexBase={overlayZIndexBase} />
                      </Form.Item>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[240px_minmax(0,1fr)_auto]">
                      <Form.Item
                        label="رویداد"
                        name={[field.name, 'trigger_type']}
                        initialValue="achieve"
                        rules={[{ required: true, message: 'رویداد را انتخاب کنید.' }]}
                      >
                        <AdaptiveSelectField options={rewardTriggerOptions} getPopupContainer={popupContainer as any} modalContainer={popupContainer} preferLocalPopupContainer overlayZIndexBase={overlayZIndexBase} />
                      </Form.Item>
                      <Form.Item
                        label="فرمول محاسبه"
                        name={[field.name, 'formula_id']}
                        rules={[{ required: true, message: 'فرمول را انتخاب کنید.' }]}
                      >
                        <AdaptiveSelectField
                          showSearch
                          allowClear
                          optionFilterProp="label"
                          options={formulaOptions}
                          getPopupContainer={popupContainer as any}
                          modalContainer={popupContainer}
                          preferLocalPopupContainer
                          overlayZIndexBase={overlayZIndexBase}
                          placeholder="انتخاب فرمول پاداش هدف"
                        />
                      </Form.Item>
                      <div className="flex items-end gap-2">
                        <Button
                          icon={<PlusOutlined />}
                          onClick={() => {
                            setFormulaTargetIndex(field.name);
                            setEditingFormulaId(null);
                            setFormulaModalOpen(true);
                          }}
                        >
                          فرمول
                        </Button>
                        <Form.Item shouldUpdate noStyle>
                          {() => {
                            const selectedFormulaId = String(form.getFieldValue(['reward_rules', field.name, 'formula_id']) || '').trim();
                            return (
                              <Button
                                disabled={!selectedFormulaId}
                                onClick={() => {
                                  if (!selectedFormulaId) return;
                                  setFormulaTargetIndex(field.name);
                                  setEditingFormulaId(selectedFormulaId);
                                  setFormulaModalOpen(true);
                                }}
                              >
                                ویرایش فرمول
                              </Button>
                            );
                          }}
                        </Form.Item>
                        <Button danger onClick={() => remove(field.name)}>
                          حذف
                        </Button>
                      </div>
                    </div>

                    <Form.Item
                      shouldUpdate={(prev, next) => prev.reward_rules !== next.reward_rules}
                      noStyle
                    >
                      {() => (
                        <Checkbox
                          checked={form.getFieldValue(['reward_rules', field.name, 'is_primary']) === true}
                          onChange={(event) => {
                            const current = Array.isArray(form.getFieldValue('reward_rules'))
                              ? [...form.getFieldValue('reward_rules')]
                              : [];
                            current.forEach((item, index) => {
                              current[index] = {
                                ...(item || {}),
                                is_primary: index === field.name ? event.target.checked : false,
                              };
                            });
                            form.setFieldValue('reward_rules', current);
                          }}
                        >
                          این ردیف پاداش/جریمه اصلی هدف باشد
                        </Checkbox>
                      )}
                    </Form.Item>
                  </div>
                ))}

                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add({ output_type: 'bonus', trigger_type: levelsEnabled ? 'bronze' : 'achieve' })}
                >
                  افزودن ردیف پاداش هدف
                </Button>
              </div>
            )}
          </Form.List>
        </div>
      </Form>

      <FormulaEditorModal
        open={formulaModalOpen}
        onCancel={() => {
          setFormulaModalOpen(false);
          setFormulaTargetIndex(null);
          setEditingFormulaId(null);
        }}
        defaultScope="goal_reward"
        defaultContextType="goal"
        defaultOutputType="money"
        variableOptions={formulaVariableOptions}
        initialFormulaId={editingFormulaId}
        onSaved={(formula) => {
          setFormulaOptions((current) => {
            const existing = current.find((item) => item.value === formula.id);
            if (existing) {
              return current
                .map((item) => item.value === formula.id ? { ...item, label: formula.name } : item)
                .sort((a, b) => a.label.localeCompare(b.label, 'fa'));
            }
            return [...current, { label: formula.name, value: formula.id }].sort((a, b) => a.label.localeCompare(b.label, 'fa'));
          });
          if (formulaTargetIndex !== null) {
            form.setFieldValue(['reward_rules', formulaTargetIndex, 'formula_id'], formula.id);
          }
          setFormulaModalOpen(false);
          setFormulaTargetIndex(null);
          setEditingFormulaId(null);
        }}
      />
    </Modal>
  );
};

export default GoalEditorModal;
