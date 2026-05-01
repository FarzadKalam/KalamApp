import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Collapse, Empty, Form, Input, InputNumber, Popconfirm, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import WorkflowConditionsGroup from '../workflows/WorkflowConditionsGroup';
import AdaptiveSelectField from '../AdaptiveSelectField';
import { loadWorkflowConditionEditorOptions } from '../../utils/workflowConditionOptions';
import { createWorkflowId, type WorkflowCondition } from '../../utils/workflowTypes';
import {
  type ActivityPerformancePayItem,
  type ActivityPerformanceProcessScope,
  type ActivityPerformanceProcessStage,
  type ActivityPerformanceProcessTemplate,
  getActivityPerformanceConditionFields,
  getActivityPerformancePayMetricOptions,
} from '../../utils/activityPerformanceFields';

type ActivityPerformanceRuleRow = {
  id: string;
  name?: string | null;
  output_type?: string | null;
  priority?: number | null;
  is_active?: boolean | null;
  conditions_all?: WorkflowCondition[] | null;
  conditions_any?: WorkflowCondition[] | null;
  config?: Record<string, any> | null;
};

type ActivityPerformanceRulesManagerProps = {
  employeeProfileId?: string | null;
};

type RuleFormValues = {
  name?: string | null;
  output_type: 'wage' | 'bonus' | 'penalty';
  process_scope: ActivityPerformanceProcessScope;
  process_template_ids?: string[];
  pay_items?: ActivityPerformancePayItem[];
};

const outputOptions = [
  { label: 'دستمزد', value: 'wage' },
  { label: 'پاداش', value: 'bonus' },
  { label: 'جریمه', value: 'penalty' },
];

const processScopeOptions = [
  { label: 'همه فرآیندها', value: 'all_processes' },
  { label: 'بدون فرآیند', value: 'no_process' },
  { label: 'فرآیندهای مشخص', value: 'specific_processes' },
];

const HR_RULE_OVERLAY_Z_INDEX = 18000;

const normalizeMissingTableError = (error: any) => {
  const text = String(error?.message || error?.details || error || '').toLowerCase();
  return text.includes('activity_performance_rules') && (text.includes('does not exist') || text.includes('could not find'));
};

const toNumber = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const createDefaultDoneCondition = (): WorkflowCondition => ({
  id: createWorkflowId(),
  field: 'status',
  operator: 'eq',
  value: 'done',
});

const normalizeProcessScope = (value: unknown): ActivityPerformanceProcessScope => {
  const raw = String(value || '').trim();
  return ['all_processes', 'no_process', 'specific_processes'].includes(raw)
    ? raw as ActivityPerformanceProcessScope
    : 'all_processes';
};

const normalizePayItems = (items: unknown, metricOptions: Array<{ label: string; value: string }>) => {
  const labelByKey = new Map(metricOptions.map((item) => [String(item.value), String(item.label)]));
  return (Array.isArray(items) ? items : [])
    .map((item: any) => {
      const metricKey = String(item?.metric_key || '').trim();
      if (!metricKey) return null;
      return {
        id: String(item?.id || '').trim() || createWorkflowId(),
        metric_key: metricKey,
        metric_label: String(item?.metric_label || labelByKey.get(metricKey) || metricKey).trim(),
        amount: toNumber(item?.amount),
      };
    })
    .filter(Boolean)
    .filter((item) => toNumber((item as ActivityPerformancePayItem).amount) !== 0) as ActivityPerformancePayItem[];
};

const ActivityPerformanceRulesManager: React.FC<ActivityPerformanceRulesManagerProps> = ({
  employeeProfileId,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<RuleFormValues>();
  const [rows, setRows] = useState<ActivityPerformanceRuleRow[]>([]);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [setupMissing, setSetupMissing] = useState(false);
  const [templates, setTemplates] = useState<ActivityPerformanceProcessTemplate[]>([]);
  const [stages, setStages] = useState<ActivityPerformanceProcessStage[]>([]);
  const [conditionsAll, setConditionsAll] = useState<WorkflowCondition[]>(() => [createDefaultDoneCondition()]);
  const [conditionsAny, setConditionsAny] = useState<WorkflowCondition[]>([]);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});

  const processScope = normalizeProcessScope(Form.useWatch('process_scope', form));
  const selectedTemplateIds = Form.useWatch('process_template_ids', form) || [];

  const templateOptions = useMemo(
    () => templates.map((template) => ({
      label: template.name || template.id,
      value: template.id,
    })),
    [templates],
  );

  const conditionFields = useMemo(
    () => getActivityPerformanceConditionFields({
      templates,
      stages,
      processScope,
      selectedTemplateIds,
    }),
    [processScope, selectedTemplateIds, stages, templates],
  );

  const payMetricOptions = useMemo(
    () => getActivityPerformancePayMetricOptions({
      templates,
      stages,
      processScope,
      selectedTemplateIds,
    }),
    [processScope, selectedTemplateIds, stages, templates],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [templatesResult, stagesResult] = await Promise.all([
          supabase
            .from('process_templates')
            .select('id, name, module_id, module_ids, is_active')
            .eq('is_active', true)
            .order('name', { ascending: true }),
          supabase
            .from('process_template_stages')
            .select('id, template_id, stage_name, metadata')
            .order('sort_order', { ascending: true }),
        ]);
        if (templatesResult.error) throw templatesResult.error;
        if (stagesResult.error) throw stagesResult.error;
        if (cancelled) return;
        setTemplates((templatesResult.data || []).map((row: any) => ({
          id: String(row.id),
          name: row.name || null,
          module_id: row.module_id || null,
          module_ids: Array.isArray(row.module_ids) ? row.module_ids : [],
        })));
        setStages((stagesResult.data || []) as ActivityPerformanceProcessStage[]);
      } catch (error) {
        if (!cancelled) {
          console.warn('Could not load process templates for HR rules.', error);
          setTemplates([]);
          setStages([]);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const loaded = await loadWorkflowConditionEditorOptions('tasks', conditionFields).catch(() => ({
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
  }, [conditionFields]);

  const resetForm = React.useCallback(() => {
    form.setFieldsValue({
      name: '',
      output_type: 'bonus',
      process_scope: 'all_processes',
      process_template_ids: [],
      pay_items: [{ id: createWorkflowId(), metric_key: 'activity_count', metric_label: 'فعالیت', amount: 0 }],
    });
    setConditionsAll([createDefaultDoneCondition()]);
    setConditionsAny([]);
    setEditingRuleId(null);
  }, [form]);

  useEffect(() => {
    resetForm();
  }, [employeeProfileId, resetForm]);

  const loadRules = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('activity_performance_rules')
        .select('id, name, output_type, priority, is_active, conditions_all, conditions_any, config')
        .eq('is_active', true)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;

      const filtered = ((data || []) as ActivityPerformanceRuleRow[]).filter((row) => {
        const profileIds = Array.isArray(row.config?.assignee_profile_ids) ? row.config!.assignee_profile_ids : [];
        return employeeProfileId ? profileIds.includes(employeeProfileId) : false;
      });

      setRows(filtered);
      setSetupMissing(false);
    } catch (error) {
      if (normalizeMissingTableError(error)) {
        setSetupMissing(true);
        setRows([]);
      } else {
        message.error(toFaErrorMessage(error as any, 'خواندن محاسبه عملکرد ناموفق بود.'));
      }
    } finally {
      setLoading(false);
    }
  }, [employeeProfileId, message]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const handleCreateOrUpdate = async () => {
    if (!employeeProfileId) {
      message.error('کاربر این کارمند برای ثبت محاسبه عملکرد مشخص نیست.');
      return;
    }
    try {
      const values = await form.validateFields();
      const normalizedScope = normalizeProcessScope(values.process_scope);
      if (normalizedScope === 'specific_processes' && (!values.process_template_ids || values.process_template_ids.length === 0)) {
        message.error('حداقل یک فرآیند را انتخاب کنید.');
        return;
      }
      const payItems = normalizePayItems(values.pay_items, payMetricOptions);
      if (payItems.length === 0) {
        message.error('حداقل یک معیار دستمزد با مبلغ معتبر اضافه کنید.');
        return;
      }

      setSaving(true);
      const config = {
        assignee_profile_ids: [employeeProfileId],
        process_scope: normalizedScope,
        process_template_ids: normalizedScope === 'specific_processes'
          ? (values.process_template_ids || []).map(String)
          : [],
        pay_items: payItems,
      };
      const payload = {
        name: String(values.name || '').trim() || 'محاسبه عملکرد',
        employee_id: null,
        task_type: null,
        formula_id: null,
        output_type: values.output_type || 'bonus',
        priority: 100,
        conditions_all: conditionsAll,
        conditions_any: conditionsAny,
        is_active: true,
        config,
      };

      const { error } = editingRuleId
        ? await supabase.from('activity_performance_rules').update(payload).eq('id', editingRuleId)
        : await supabase.from('activity_performance_rules').insert([payload]);
      if (error) throw error;

      message.success(editingRuleId ? 'ردیف محاسبه عملکرد ویرایش شد.' : 'ردیف محاسبه عملکرد ثبت شد.');
      resetForm();
      await loadRules();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(toFaErrorMessage(error, editingRuleId ? 'ویرایش محاسبه عملکرد ناموفق بود.' : 'ثبت محاسبه عملکرد ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (row: ActivityPerformanceRuleRow) => {
    const normalizedScope = normalizeProcessScope(row.config?.process_scope);
    const payItems = Array.isArray(row.config?.pay_items) && row.config?.pay_items.length > 0
      ? row.config.pay_items
      : [
        { metric_key: 'activity_count', metric_label: 'فعالیت', amount: row.config?.fixed_amount },
        { metric_key: 'weight', metric_label: 'هر واحد وزن', amount: row.config?.weight_amount },
        { metric_key: 'late_minutes', metric_label: 'هر دقیقه تاخیر', amount: row.config?.late_minute_amount },
        { metric_key: 'early_minutes', metric_label: 'هر دقیقه تعجیل', amount: row.config?.early_minute_amount },
        { metric_key: 'activity_minutes', metric_label: 'هر دقیقه فعالیت', amount: row.config?.activity_minute_amount },
      ].filter((item) => toNumber(item.amount) !== 0);
    form.setFieldsValue({
      name: row.name || '',
      output_type: (row.output_type as RuleFormValues['output_type']) || 'bonus',
      process_scope: normalizedScope,
      process_template_ids: Array.isArray(row.config?.process_template_ids) ? row.config?.process_template_ids : [],
      pay_items: payItems.length > 0 ? payItems.map((item: any) => ({
        id: String(item?.id || '').trim() || createWorkflowId(),
        metric_key: item.metric_key,
        metric_label: item.metric_label,
        amount: toNumber(item.amount),
      })) : [{ id: createWorkflowId(), metric_key: 'activity_count', metric_label: 'فعالیت', amount: 0 }],
    });
    setConditionsAll(Array.isArray(row.conditions_all) && row.conditions_all.length > 0 ? row.conditions_all : [createDefaultDoneCondition()]);
    setConditionsAny(Array.isArray(row.conditions_any) ? row.conditions_any : []);
    setEditingRuleId(String(row.id));
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('activity_performance_rules').delete().eq('id', id);
    if (error) {
      message.error(toFaErrorMessage(error, 'حذف محاسبه عملکرد ناموفق بود.'));
      return;
    }
    message.success('ردیف محاسبه عملکرد حذف شد.');
    await loadRules();
  };

  const columns: ColumnsType<ActivityPerformanceRuleRow> = useMemo(() => [
    {
      title: 'عنوان',
      dataIndex: 'name',
      key: 'name',
      render: (value) => value || 'محاسبه عملکرد',
    },
    {
      title: 'نوع خروجی',
      dataIndex: 'output_type',
      key: 'output_type',
      render: (value) => <Tag>{outputOptions.find((item) => item.value === value)?.label || value || '-'}</Tag>,
    },
    {
      title: 'فرآیند',
      key: 'process_scope',
      render: (_, row) => {
        const scope = normalizeProcessScope(row.config?.process_scope);
        if (scope === 'no_process') return 'بدون فرآیند';
        if (scope === 'specific_processes') {
          const ids = Array.isArray(row.config?.process_template_ids) ? row.config?.process_template_ids : [];
          return ids
            .map((id: string) => templates.find((template) => String(template.id) === String(id))?.name || id)
            .join('، ') || 'فرآیندهای مشخص';
        }
        return 'همه فرآیندها';
      },
    },
    {
      title: 'معیارها',
      key: 'details',
      render: (_, row) => {
        const items = Array.isArray(row.config?.pay_items) ? row.config?.pay_items : [];
        const parts = items.map((item: any) => `${item.metric_label || item.metric_key}: ${item.amount}`).filter(Boolean);
        return <span className="text-xs leading-7">{parts.length > 0 ? parts.join(' | ') : 'بدون مقدار'}</span>;
      },
    },
    {
      title: 'عملیات',
      key: 'actions',
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => handleEdit(row)}>
            ویرایش
          </Button>
          <Popconfirm title="این ردیف حذف شود؟" okText="حذف" cancelText="انصراف" onConfirm={() => handleDelete(row.id)}>
            <Button size="small" danger>
              حذف
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ], [templates]);

  if (setupMissing) {
    return (
      <Alert
        type="warning"
        showIcon
        message="زیرساخت محاسبه عملکرد هنوز روی دیتابیس اجرا نشده است"
        description="ابتدا migration مرحله 113 را اجرا کنید."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
        <Form form={form} layout="vertical">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item name="name" label="عنوان محاسبه">
              <Input placeholder="مثلا: پاداش نصب کامل" />
            </Form.Item>
            <Form.Item name="output_type" label="نوع خروجی" rules={[{ required: true, message: 'نوع خروجی را انتخاب کنید.' }]}>
              <AdaptiveSelectField
                options={outputOptions}
                getPopupContainer={resolveOverlayPopupContainer}
                modalContainer={resolveOverlayPopupContainer}
                overlayZIndexBase={HR_RULE_OVERLAY_Z_INDEX}
              />
            </Form.Item>
            <Form.Item name="process_scope" label="وضعیت فرآیند" rules={[{ required: true, message: 'وضعیت فرآیند را انتخاب کنید.' }]}>
              <AdaptiveSelectField
                options={processScopeOptions}
                getPopupContainer={resolveOverlayPopupContainer}
                modalContainer={resolveOverlayPopupContainer}
                overlayZIndexBase={HR_RULE_OVERLAY_Z_INDEX}
              />
            </Form.Item>
            {processScope === 'specific_processes' ? (
              <Form.Item name="process_template_ids" label="الگوهای فرآیند" rules={[{ required: true, message: 'فرآیند را انتخاب کنید.' }]}>
                <AdaptiveSelectField
                  mode="multiple"
                  options={templateOptions}
                  placeholder="انتخاب فرآیند"
                  getPopupContainer={resolveOverlayPopupContainer}
                  modalContainer={resolveOverlayPopupContainer}
                  overlayZIndexBase={HR_RULE_OVERLAY_Z_INDEX}
                  maxTagCount="responsive"
                />
              </Form.Item>
            ) : null}
          </div>

          <div className="mt-2 rounded-xl border border-gray-200 p-3 dark:border-gray-800">
            <div className="mb-3 font-bold">شرط‌ها</div>
            <Collapse
              defaultActiveKey={['all_conditions']}
              items={[
                {
                  key: 'all_conditions',
                  label: 'همه شرط‌ها',
                  children: (
                    <WorkflowConditionsGroup
                      value={conditionsAll}
                      onChange={setConditionsAll}
                      fields={conditionFields}
                      dynamicOptions={dynamicOptions}
                      relationOptions={relationOptions}
                      overlayZIndexBase={HR_RULE_OVERLAY_Z_INDEX}
                      popupContainer={resolveOverlayPopupContainer}
                    />
                  ),
                },
                {
                  key: 'any_conditions',
                  label: 'یکی از شرط‌ها',
                  children: (
                    <WorkflowConditionsGroup
                      value={conditionsAny}
                      onChange={setConditionsAny}
                      fields={conditionFields}
                      dynamicOptions={dynamicOptions}
                      relationOptions={relationOptions}
                      overlayZIndexBase={HR_RULE_OVERLAY_Z_INDEX}
                      popupContainer={resolveOverlayPopupContainer}
                    />
                  ),
                },
              ]}
            />
          </div>

          <div className="mt-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800">
            <div className="mb-3 font-bold">معیارهای دستمزد</div>
            <Form.List name="pay_items">
              {(fields, { add, remove }) => (
                <div className="space-y-2">
                  {fields.map((field) => (
                    <div key={field.key} className="grid grid-cols-1 gap-2 rounded-xl border border-gray-100 p-2 md:grid-cols-12 dark:border-gray-800">
                      <Form.Item {...field} name={[field.name, 'metric_key']} className="mb-0 md:col-span-6" rules={[{ required: true, message: 'معیار را انتخاب کنید.' }]}>
                        <AdaptiveSelectField
                          options={payMetricOptions}
                          placeholder="معیار"
                          getPopupContainer={resolveOverlayPopupContainer}
                          modalContainer={resolveOverlayPopupContainer}
                          overlayZIndexBase={HR_RULE_OVERLAY_Z_INDEX}
                          onChange={(value) => {
                            const metric = payMetricOptions.find((item) => String(item.value) === String(value));
                            const current = form.getFieldValue('pay_items') || [];
                            current[field.name] = {
                              ...(current[field.name] || {}),
                              metric_key: value,
                              metric_label: metric?.label || value,
                            };
                            form.setFieldValue('pay_items', current);
                          }}
                        />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'amount']} className="mb-0 md:col-span-5" rules={[{ required: true, message: 'مبلغ را وارد کنید.' }]}>
                        <InputNumber min={0} className="w-full" placeholder="مبلغ" />
                      </Form.Item>
                      <div className="flex justify-end md:col-span-1">
                        <Button danger type="text" onClick={() => remove(field.name)}>
                          حذف
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => add({ id: createWorkflowId(), metric_key: 'activity_count', metric_label: 'فعالیت', amount: 0 })}
                  >
                    افزودن معیار
                  </Button>
                </div>
              )}
            </Form.List>
          </div>

          <Space className="mt-3">
            <Button type="primary" loading={saving} onClick={handleCreateOrUpdate}>
              {editingRuleId ? 'ذخیره تغییرات' : 'افزودن ردیف'}
            </Button>
            {editingRuleId ? (
              <Button onClick={resetForm}>
                انصراف از ویرایش
              </Button>
            ) : null}
            <Button onClick={() => void loadRules()} loading={loading}>
              بروزرسانی
            </Button>
          </Space>
        </Form>
      </div>

      {rows.length === 0 ? (
        <Empty description="ردیف محاسبه عملکردی ثبت نشده است." image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 5, showSizeChanger: false }}
          scroll={{ x: 1100 }}
        />
      )}
    </div>
  );
};

export default ActivityPerformanceRulesManager;
