import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Collapse, Form, Input, InputNumber, Modal, Radio, Select, Switch } from 'antd';
import { FieldType, ModuleField } from '../../types';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
import WorkflowConditionsGroup from './WorkflowConditionsGroup';
import WorkflowActionsBuilder from './WorkflowActionsBuilder';
import {
  WorkflowAction,
  WorkflowCondition,
  WorkflowModuleOption,
  WorkflowRecord,
  intervalUnitOptions,
  triggerTypeOptions,
} from '../../utils/workflowTypes';
import PersianDatePicker from '../PersianDatePicker';

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
  interval_value?: number;
  interval_unit?: 'hour' | 'day' | 'month';
  interval_at?: string | null;
  batch_size?: number;
  is_active?: boolean;
};

const loadDynamicAndRelationOptions = async (
  moduleId: string
): Promise<{
  dynamicOptions: Record<string, Array<{ label: string; value: string }>>;
  relationOptions: Record<string, Array<{ label: string; value: string }>>;
}> => {
  const moduleConfig = MODULES[moduleId];
  if (!moduleConfig) {
    return { dynamicOptions: {}, relationOptions: {} };
  }

  const dynamicOptions: Record<string, Array<{ label: string; value: string }>> = {};
  const relationOptions: Record<string, Array<{ label: string; value: string }>> = {};

  const dynamicCategories = Array.from(
    new Set(
      moduleConfig.fields
        .map((f) => f.dynamicOptionsCategory)
        .filter((cat): cat is string => !!cat)
    )
  );

  await Promise.all(
    dynamicCategories.map(async (category) => {
      const { data } = await supabase
        .from('dynamic_options')
        .select('label, value')
        .eq('category', category)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      dynamicOptions[category] = (data || []).map((item: any) => ({
        label: String(item?.label ?? item?.value ?? ''),
        value: String(item?.value ?? ''),
      }));
    })
  );

  const relationFields = moduleConfig.fields.filter(
    (f) => f.type === FieldType.RELATION || f.type === FieldType.USER
  );

  await Promise.all(
    relationFields.map(async (field) => {
      if (field.type === FieldType.USER) {
        const { data } = await supabase.from('profiles').select('id, full_name').limit(300);
        relationOptions[field.key] = (data || []).map((row: any) => ({
          label: row?.full_name || row?.id,
          value: row?.id,
        }));
        return;
      }

      const targetModule = field?.relationConfig?.targetModule;
      if (!targetModule) {
        relationOptions[field.key] = [];
        return;
      }

      const targetField = field?.relationConfig?.targetField || 'name';
      const selectColumns = Array.from(
        new Set(['id', targetField, 'system_code', 'name', 'title', 'business_name', 'shelf_number'])
      )
        .filter(Boolean)
        .join(', ');

      const { data } = await supabase.from(targetModule).select(selectColumns).limit(300);
      relationOptions[field.key] = (data || []).map((row: any) => {
        const label =
          row?.[targetField] ||
          row?.name ||
          row?.title ||
          row?.business_name ||
          row?.shelf_number ||
          row?.system_code ||
          row?.id;
        const code = row?.system_code ? ` (${row.system_code})` : '';
        return {
          label: `${label}${code}`,
          value: row?.id,
        };
      });
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

  const isEditMode = !!record?.id;

  useEffect(() => {
    if (!open) return;
    const nextModuleId = record?.module_id || initialModuleId || '';
    setModuleId(nextModuleId);
    form.setFieldsValue({
      module_id: nextModuleId,
      name: record?.name || '',
      description: record?.description || '',
      trigger_type: (record?.trigger_type as any) || 'on_create',
      interval_value: record?.interval_value || undefined,
      interval_unit: (record?.interval_unit as any) || 'day',
      interval_at: record?.interval_at || null,
      batch_size: record?.batch_size || undefined,
      is_active: record?.is_active ?? true,
    });
    setConditionsAll(Array.isArray(record?.conditions_all) ? (record?.conditions_all as any) : []);
    setConditionsAny(Array.isArray(record?.conditions_any) ? (record?.conditions_any as any) : []);
    setActions(Array.isArray(record?.actions) ? (record?.actions as any) : []);
  }, [open, record, initialModuleId, form]);

  useEffect(() => {
    if (!open || !moduleId) return;
    let cancelled = false;
    const run = async () => {
      const loaded = await loadDynamicAndRelationOptions(moduleId);
      if (cancelled) return;
      setDynamicOptions(loaded.dynamicOptions);
      setRelationOptions(loaded.relationOptions);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [open, moduleId]);

  const triggerType = Form.useWatch('trigger_type', form);

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

      const payload: Record<string, any> = {
        module_id: values.module_id,
        name: values.name?.trim(),
        description: values.description?.trim() || null,
        trigger_type: values.trigger_type,
        interval_value: values.trigger_type === 'interval' ? values.interval_value || null : null,
        interval_unit: values.trigger_type === 'interval' ? values.interval_unit || null : null,
        interval_at: values.trigger_type === 'interval' ? values.interval_at || null : null,
        batch_size: values.trigger_type === 'interval' ? values.batch_size || null : null,
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
      message.error(`خطا در ذخیره گردش کار: ${err?.message || 'نامشخص'}`);
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
      destroyOnClose
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
              <Select
                showSearch
                optionFilterProp="label"
                options={moduleOptions}
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
          {triggerType === 'interval' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-4">
                <Alert
                  type="info"
                  showIcon
                  message="اجرای زمان‌بندی نیاز به Runner دارد (Cron Job یا Edge Function زمان‌بندی‌شده)."
                />
              </div>
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
                <Select options={intervalUnitOptions} />
              </Form.Item>
              <Form.Item label="در ساعت" name="interval_at">
                <PersianDatePicker type="TIME" value={form.getFieldValue('interval_at') || null} onChange={(nextVal) => form.setFieldValue('interval_at', nextVal)} />
              </Form.Item>
              <Form.Item label="چه تعداد رکورد بررسی شود؟" name="batch_size">
                <InputNumber min={1} className="w-full persian-number" placeholder="پیش‌فرض: همه" />
              </Form.Item>
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
                    fields={selectedModuleFields}
                    dynamicOptions={dynamicOptions}
                    relationOptions={relationOptions}
                    disabled={!canEdit}
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
                    fields={selectedModuleFields}
                    dynamicOptions={dynamicOptions}
                    relationOptions={relationOptions}
                    disabled={!canEdit}
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
            moduleOptions={moduleOptions}
            dynamicOptions={dynamicOptions}
            relationOptions={relationOptions}
            disabled={!canEdit}
          />
        </div>
      </Form>
    </Modal>
  );
};

export default WorkflowEditorModal;
