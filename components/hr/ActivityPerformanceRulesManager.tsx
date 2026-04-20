import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Empty, Form, InputNumber, Popconfirm, Select, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import DynamicSelectField from '../DynamicSelectField';
import { resolveSelectPopupContainer } from '../../utils/popupContainer';
import { fetchDynamicOptionsByCategory } from '../../utils/referenceData';

type ActivityPerformanceRuleRow = {
  id: string;
  task_type?: string | null;
  output_type?: string | null;
  priority?: number | null;
  is_active?: boolean | null;
  config?: Record<string, any> | null;
};

type ActivityPerformanceRulesManagerProps = {
  employeeProfileId?: string | null;
};

type RuleFormValues = {
  task_type?: string;
  output_type: 'wage' | 'bonus' | 'penalty';
  fixed_amount?: number;
  weight_amount?: number;
  late_minute_amount?: number;
  early_minute_amount?: number;
  activity_minute_amount?: number;
};

const outputOptions = [
  { label: 'دستمزد', value: 'wage' },
  { label: 'پاداش', value: 'bonus' },
  { label: 'جریمه', value: 'penalty' },
];

const normalizeMissingTableError = (error: any) => {
  const text = String(error?.message || error?.details || error || '').toLowerCase();
  return text.includes('activity_performance_rules') && (text.includes('does not exist') || text.includes('could not find'));
};

const toNumber = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
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
  const [taskTypeOptions, setTaskTypeOptions] = useState<Array<{ label: string; value: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const taskTypeField = (MODULES.tasks?.fields || []).find((field) => String(field.key || '') === 'task_type');
        const options = taskTypeField?.dynamicOptionsCategory
          ? await fetchDynamicOptionsByCategory(supabase, taskTypeField.dynamicOptionsCategory)
          : [];
        if (!cancelled) setTaskTypeOptions(options);
      } catch {
        if (!cancelled) setTaskTypeOptions([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetForm = React.useCallback(() => {
    form.setFieldsValue({
      task_type: undefined,
      output_type: 'bonus',
      fixed_amount: 0,
      weight_amount: 0,
      late_minute_amount: 0,
      early_minute_amount: 0,
      activity_minute_amount: 0,
    });
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
        .select('id, task_type, output_type, priority, is_active, config')
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
      setSaving(true);
      const config = {
        assignee_profile_ids: [employeeProfileId],
        fixed_amount: toNumber(values.fixed_amount),
        weight_amount: toNumber(values.weight_amount),
        late_minute_amount: toNumber(values.late_minute_amount),
        early_minute_amount: toNumber(values.early_minute_amount),
        activity_minute_amount: toNumber(values.activity_minute_amount),
      };
      const payload = {
        name: null,
        employee_id: null,
        task_type: values.task_type || null,
        formula_id: null,
        output_type: values.output_type || 'bonus',
        priority: 100,
        conditions_all: [],
        conditions_any: [],
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
    form.setFieldsValue({
      task_type: row.task_type || undefined,
      output_type: (row.output_type as RuleFormValues['output_type']) || 'bonus',
      fixed_amount: toNumber(row.config?.fixed_amount),
      weight_amount: toNumber(row.config?.weight_amount),
      late_minute_amount: toNumber(row.config?.late_minute_amount),
      early_minute_amount: toNumber(row.config?.early_minute_amount),
      activity_minute_amount: toNumber(row.config?.activity_minute_amount),
    });
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
      title: 'نوع خروجی',
      dataIndex: 'output_type',
      key: 'output_type',
      render: (value) => <Tag>{outputOptions.find((item) => item.value === value)?.label || value || '-'}</Tag>,
    },
    {
      title: 'نوع فعالیت',
      dataIndex: 'task_type',
      key: 'task_type',
      render: (value) => value || 'همه فعالیت‌ها',
    },
    {
      title: 'جزئیات محاسبه',
      key: 'details',
      render: (_, row) => {
        const parts = [
          toNumber(row.config?.fixed_amount) > 0 ? `هر فعالیت: ${row.config?.fixed_amount}` : null,
          toNumber(row.config?.weight_amount) > 0 ? `هر واحد وزن: ${row.config?.weight_amount}` : null,
          toNumber(row.config?.late_minute_amount) > 0 ? `هر دقیقه تاخیر: ${row.config?.late_minute_amount}` : null,
          toNumber(row.config?.early_minute_amount) > 0 ? `هر دقیقه تعجیل: ${row.config?.early_minute_amount}` : null,
          toNumber(row.config?.activity_minute_amount) > 0 ? `هر دقیقه فعالیت: ${row.config?.activity_minute_amount}` : null,
        ].filter(Boolean);
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
  ], []);

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
      <div className="rounded-2xl border border-gray-200 p-3 dark:border-gray-800">
        <Form form={form} layout="vertical">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item name="output_type" label="نوع خروجی" rules={[{ required: true, message: 'نوع خروجی را انتخاب کنید.' }]}>
              <Select options={outputOptions} getPopupContainer={resolveSelectPopupContainer} />
            </Form.Item>
            <Form.Item name="task_type" label="اگر نوع فعالیت برابر با">
              <DynamicSelectField
                options={taskTypeOptions}
                category="task_type"
                placeholder="همه فعالیت‌ها"
                allowClear
                getPopupContainer={resolveSelectPopupContainer as any}
                value={form.getFieldValue('task_type')}
                onChange={(value) => form.setFieldValue('task_type', value || undefined)}
              />
            </Form.Item>
            <Form.Item name="fixed_amount" label="به ازای هر فعالیت">
              <InputNumber min={0} className="w-full" />
            </Form.Item>
            <Form.Item name="weight_amount" label="به ازای هر واحد وزن">
              <InputNumber min={0} className="w-full" />
            </Form.Item>
            <Form.Item name="late_minute_amount" label="به ازای هر دقیقه تاخیر">
              <InputNumber min={0} className="w-full" />
            </Form.Item>
            <Form.Item name="early_minute_amount" label="به ازای هر دقیقه تعجیل">
              <InputNumber min={0} className="w-full" />
            </Form.Item>
            <Form.Item name="activity_minute_amount" label="به ازای هر دقیقه فعالیت">
              <InputNumber min={0} className="w-full" />
            </Form.Item>
          </div>
          <Space>
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
