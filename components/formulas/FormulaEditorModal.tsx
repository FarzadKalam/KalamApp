import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Form, Input, List, Modal, Select, Space, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { parseSimpleFormulaExpression } from '../../utils/formulaRuntime';
import { resolveSelectPopupContainer } from '../../utils/popupContainer';

type FormulaEditorModalProps = {
  open: boolean;
  onCancel: () => void;
  onSaved?: (formula: { id: string; name: string }) => void;
  defaultScope?: string;
  defaultContextType?: string;
  defaultOutputType?: string;
  initialFormulaId?: string | null;
};

type FormulaEditorValues = {
  name: string;
  description?: string;
  output_type: string;
  expression_text: string;
};

const OUTPUT_OPTIONS = [
  { label: 'عدد', value: 'number' },
  { label: 'مبلغ', value: 'money' },
  { label: 'امتیاز', value: 'score' },
  { label: 'درصد', value: 'percentage' },
];

const VARIABLE_OPTIONS_BY_CONTEXT: Record<string, Array<{ label: string; token: string }>> = {
  task: [
    { label: 'وزن فعالیت', token: '{{task.weight}}' },
    { label: 'ساعات تعجیل', token: '{{task.early_hours}}' },
    { label: 'ساعات دیرکرد', token: '{{task.late_hours}}' },
    { label: 'تعداد خروجی', token: '{{task.produced_qty}}' },
    { label: 'ساعات صرف‌شده', token: '{{task.spent_hours}}' },
    { label: 'ساعات برآوردی', token: '{{task.estimated_hours}}' },
    { label: 'امتیاز اختصاصی فعالیت', token: '{{task.custom_score}}' },
  ],
  employee: [
    { label: 'حقوق پایه', token: '{{employee.base_salary}}' },
    { label: 'نرخ ساعتی', token: '{{employee.hourly_rate}}' },
    { label: 'درصد پورسانت', token: '{{employee.commission_percentage}}' },
    { label: 'پایه سنوات', token: '{{employee.seniority_base_amount}}' },
  ],
  goal: [
    { label: 'درصد تحقق هدف', token: '{{goal.achieved_percent}}' },
    { label: 'مقدار تحقق', token: '{{goal.achieved_value}}' },
    { label: 'هدف نهایی', token: '{{goal.target_value}}' },
  ],
  invoice: [
    { label: 'مبلغ کل فاکتور', token: '{{invoice.total_invoice_amount}}' },
    { label: 'مبلغ تسویه‌شده', token: '{{invoice.total_received_amount}}' },
    { label: 'مانده فاکتور', token: '{{invoice.remaining_balance}}' },
  ],
  generic: [],
};

const COMMON_FORMULAS = [
  { label: 'وزن فعالیت × عدد', expression: '{{task.weight}} * 1' },
  { label: 'تعجیل × مبلغ ثابت', expression: '{{task.early_hours}} * 1' },
  { label: 'دیرکرد × مبلغ ثابت', expression: '{{task.late_hours}} * 1' },
  { label: 'خروجی × مبلغ ثابت', expression: '{{task.produced_qty}} * 1' },
];

const TOOLBAR_TOKENS = ['+', '-', '*', '/', '(', ')'];

const FormulaEditorModal: React.FC<FormulaEditorModalProps> = ({
  open,
  onCancel,
  onSaved,
  defaultScope = 'activity_performance',
  defaultContextType = 'task',
  defaultOutputType = 'money',
  initialFormulaId = null,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormulaEditorValues>();
  const [saving, setSaving] = useState(false);
  const [loadingFormula, setLoadingFormula] = useState(false);
  const [savedFormulas, setSavedFormulas] = useState<Array<{ id: string; name: string; formula?: string | null; expression_config?: any; config?: any }>>([]);
  const isEditMode = !!String(initialFormulaId || '').trim();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: '',
      output_type: defaultOutputType,
      expression_text: '',
      description: '',
    });
  }, [defaultOutputType, form, open, initialFormulaId]);

  useEffect(() => {
    if (!open || !isEditMode) return;
    let cancelled = false;
    const run = async () => {
      try {
        setLoadingFormula(true);
        const { data, error } = await supabase
          .from('calculation_formulas')
          .select('id, name, description, output_type, formula, config')
          .eq('id', String(initialFormulaId))
          .single();
        if (error) throw error;
        if (cancelled) return;
        form.setFieldsValue({
          name: String(data?.name || ''),
          description: String(data?.description || ''),
          output_type: String(data?.output_type || defaultOutputType),
          expression_text: String(data?.config?.expression_text || data?.formula || ''),
        });
      } catch (error: any) {
        if (!cancelled) {
          message.error(toFaErrorMessage(error, 'دریافت فرمول ناموفق بود.'));
        }
      } finally {
        if (!cancelled) setLoadingFormula(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [defaultOutputType, form, initialFormulaId, isEditMode, message, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const run = async () => {
      try {
        const { data, error } = await supabase
          .from('calculation_formulas')
          .select('id, name, formula, expression_config, config')
          .eq('context_type', defaultContextType)
          .order('updated_at', { ascending: false })
          .limit(30);
        if (error) throw error;
        if (!cancelled) {
          setSavedFormulas((data || []) as any[]);
        }
      } catch {
        if (!cancelled) setSavedFormulas([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [defaultContextType, open]);

  const variables = useMemo(
    () => VARIABLE_OPTIONS_BY_CONTEXT[defaultContextType] || VARIABLE_OPTIONS_BY_CONTEXT.generic,
    [defaultContextType],
  );

  const insertText = (token: string) => {
    const current = String(form.getFieldValue('expression_text') || '');
    form.setFieldValue('expression_text', `${current}${current ? ' ' : ''}${token}`);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const expressionText = String(values.expression_text || '').trim();
      const expression = parseSimpleFormulaExpression(expressionText);
      const payload = {
        name: values.name.trim(),
        description: values.description?.trim() || null,
        scope: defaultScope,
        context_type: defaultContextType,
        output_type: values.output_type,
        formula: expressionText,
        expression_config: expression,
        is_active: true,
        config: {
          editor_mode: 'expression_text',
          expression_text: expressionText,
        },
      };

      setSaving(true);
      const query = isEditMode
        ? supabase
            .from('calculation_formulas')
            .update(payload)
            .eq('id', String(initialFormulaId))
            .select('id, name')
            .single()
        : supabase
            .from('calculation_formulas')
            .insert([payload])
            .select('id, name')
            .single();
      const { data, error } = await query;
      if (error) throw error;

      message.success(isEditMode ? 'فرمول محاسباتی بروزرسانی شد.' : 'فرمول محاسباتی ثبت شد.');
      onSaved?.({ id: String(data.id), name: String(data.name || values.name) });
      onCancel();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(toFaErrorMessage(error, 'ذخیره فرمول ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEditMode ? 'ویرایش فرمول' : 'مدیریت و ساخت فرمول'}
      open={open}
      onCancel={onCancel}
      onOk={handleSave}
      confirmLoading={saving || loadingFormula}
      okText={isEditMode ? 'ذخیره تغییرات' : 'ذخیره فرمول'}
      cancelText="انصراف"
      destroyOnHidden
      width={1120}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-gray-200 p-3 dark:border-gray-800">
          <div className="mb-3 font-black text-gray-800 dark:text-gray-100">فرمول‌های ذخیره‌شده</div>
          <List
            size="small"
            dataSource={savedFormulas}
            locale={{ emptyText: 'هنوز فرمولی در این زمینه ذخیره نشده است.' }}
            renderItem={(item) => (
              <List.Item
                className="cursor-pointer rounded-xl px-2 hover:bg-gray-50 dark:hover:bg-white/5"
                onClick={() => {
                  form.setFieldsValue({
                    name: item.name,
                    expression_text: String(item?.config?.expression_text || item?.formula || ''),
                  } as any);
                }}
              >
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-gray-500">{String(item?.config?.expression_text || '').trim() || 'فرمول ذخیره‌شده'}</div>
                </div>
              </List.Item>
            )}
          />
          <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
            <div className="mb-2 text-xs font-bold text-gray-500">فرمول‌های رایج</div>
            <Space wrap>
              {COMMON_FORMULAS.map((item) => (
                <Button key={item.label} size="small" onClick={() => form.setFieldValue('expression_text', item.expression)}>
                  {item.label}
                </Button>
              ))}
            </Space>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 p-3 dark:border-gray-800">
          <Form form={form} layout="vertical">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <Form.Item name="name" label="نام فرمول" rules={[{ required: true, message: 'نام فرمول الزامی است.' }]}>
                <Input placeholder="مثال: پاداش تعجیل فعالیت" />
              </Form.Item>
              <Form.Item name="output_type" label="نوع خروجی" rules={[{ required: true }]}>
                <Select options={OUTPUT_OPTIONS} getPopupContainer={resolveSelectPopupContainer} />
              </Form.Item>
            </div>

            <div className="mb-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
              <div className="mb-2 text-xs font-bold text-gray-500">متغیرها</div>
              <Space wrap>
                {variables.map((item) => (
                  <Button key={item.token} size="small" icon={<PlusOutlined />} onClick={() => insertText(item.token)}>
                    {item.label}
                  </Button>
                ))}
              </Space>
            </div>

            <div className="mb-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
              <div className="mb-2 text-xs font-bold text-gray-500">عملگرها</div>
              <Space wrap>
                {TOOLBAR_TOKENS.map((token) => (
                  <Button key={token} size="small" onClick={() => insertText(token)}>
                    {token}
                  </Button>
                ))}
              </Space>
            </div>

            <Form.Item
              name="expression_text"
              label="متن فرمول"
              rules={[{ required: true, message: 'فرمول را وارد کنید.' }]}
              extra="برای متغیرها از همین دکمه‌ها استفاده کنید. نمونه: {{task.weight}} * 2500"
            >
              <Input.TextArea rows={8} placeholder="{{task.weight}} * 2500" />
            </Form.Item>

            <Form.Item name="description" label="توضیح برای همکاران">
              <Input.TextArea rows={3} placeholder="مثلا: این فرمول وزن فعالیت را در مبلغ ثابت ضرب می‌کند." />
            </Form.Item>

            <Typography.Text type="secondary" className="text-xs leading-7">
              زمینه این فرمول از محلی که دکمه «افزودن فرمول» را زده‌اید تعیین می‌شود. اینجا فقط نام، خروجی و متن فرمول را می‌سازید.
            </Typography.Text>
          </Form>
        </div>
      </div>
    </Modal>
  );
};

export default FormulaEditorModal;
