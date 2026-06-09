import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Collapse,
  Empty,
  Form,
  InputNumber,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
} from 'antd';
import { ReloadOutlined, RobotOutlined, SaveOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import AiKnowledgeTab from './AiKnowledgeTab';

type AiCapabilityKey =
  | 'dashboard_chat'
  | 'record_chat'
  | 'customer_reply_suggestion'
  | 'document_analysis'
  | 'workflow_ai_prompt'
  | 'web_search'
  | 'voice_input'
  | 'voice_output'
  | 'image_generation'
  | 'video_generation'
  | 'voip_auto_reply';

const CAPABILITIES: Array<{
  key: AiCapabilityKey;
  label: string;
  description: string;
  phase: 'active' | 'next';
}> = [
  { key: 'dashboard_chat', label: 'گفتگو آزاد در داشبورد', description: 'پرسش و پاسخ عمومی با زمینه سازمان', phase: 'active' },
  { key: 'record_chat', label: 'گفتگو روی رکورد', description: 'تحلیل و پاسخ درباره رکورد فعلی', phase: 'active' },
  { key: 'customer_reply_suggestion', label: 'پیشنهاد پاسخ مشتریان', description: 'متن آماده پاسخ برای پیام‌ها و گروه‌های مشتریان', phase: 'active' },
  { key: 'document_analysis', label: 'تحلیل اسناد', description: 'پرسش و پاسخ روی دانش و اسناد سازمان', phase: 'active' },
  { key: 'workflow_ai_prompt', label: 'پرامپت در گردش کار', description: 'اجرای پرامپت در گردش کارهای معمولی و زمان‌بندی‌شده', phase: 'active' },
  { key: 'web_search', label: 'جستجوی وب', description: 'جستجوی اینترنتی برای سوالات نیازمند اطلاعات جاری', phase: 'active' },
  { key: 'voice_input', label: 'دریافت و تحلیل صدا', description: 'تبدیل ویس به متن و تحلیل آن', phase: 'next' },
  { key: 'voice_output', label: 'تولید صدا', description: 'پاسخگویی با ویس', phase: 'next' },
  { key: 'image_generation', label: 'تولید تصویر', description: 'ساخت تصویر با پرامپت', phase: 'next' },
  { key: 'video_generation', label: 'تولید ویدیو', description: 'ساخت ویدیو با پرامپت', phase: 'next' },
  { key: 'voip_auto_reply', label: 'پاسخگویی خودکار VOIP', description: 'پاسخ صوتی خودکار در تماس‌ها', phase: 'next' },
];

// Mirrors DEFAULT_CAPABILITY_MODELS in the Edge Function
const DEFAULT_MODELS: Record<AiCapabilityKey | 'embedding', string> = {
  // ── Chat / reasoning ──────────────────────────────────────────────────
  dashboard_chat: 'gpt-4.1-mini',            // free on AvalAI, 400K ctx
  record_chat: 'gpt-4.1-mini',               // free, solid analysis
  customer_reply_suggestion: 'gpt-4.1-mini', // free, fluent Persian writing
  document_analysis: 'gpt-4o',              // richer comprehension for long docs
  workflow_ai_prompt: 'gpt-4.1-mini',       // free, reliable structured output
  voip_auto_reply: 'gpt-4.1-mini',          // free, fast
  // ── Web search ─────────────────────────────────────────────────────────
  web_search: 'serper-search',              // $0.001/query — cheapest Google search
  // ── Voice ──────────────────────────────────────────────────────────────
  voice_input: 'gpt-4o-transcribe',         // higher STT accuracy than mini
  voice_output: 'eleven-multilingual-v2',   // ElevenLabs — best multilingual TTS
  // ── Media generation ───────────────────────────────────────────────────
  image_generation: 'gpt-image-1',
  video_generation: 'sora-2',
  // ── Embeddings ─────────────────────────────────────────────────────────
  embedding: 'text-embedding-3-small',      // keep for pgvector compatibility
};

const formatUnit = (value: unknown) =>
  Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 8 });

const AiSettingsTab: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overview, setOverview] = useState<Record<string, any> | null>(null);

  const callAssistant = async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('ai-assistant', { body });
    if (error) throw error;
    if (!data?.success) throw new Error(String(data?.message || 'درخواست هوش مصنوعی ناموفق بود.'));
    return data;
  };

  const loadOverview = async () => {
    setLoading(true);
    try {
      const data = await callAssistant({ action: 'get_ai_overview' });
      setOverview(data);
      const selectedModels = {
        ...DEFAULT_MODELS,
        ...(data?.settings?.selected_models || {}),
      };
      form.setFieldsValue({
        selected_models: selectedModels,
        feature_flags: {
          ...Object.fromEntries(CAPABILITIES.map((item) => [item.key, item.phase === 'active'])),
          ...(data?.settings?.feature_flags || {}),
        },
        daily_limit_irt: data?.settings?.daily_limit_irt ?? null,
        monthly_limit_irt: data?.settings?.monthly_limit_irt ?? null,
        require_human_approval: data?.settings?.require_human_approval !== false,
      });
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'دریافت تنظیمات هوش مصنوعی ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  const models = useMemo(() => (overview?.models || []) as any[], [overview]);
  const modelOptionsByCapability = useMemo(() => {
    const result: Record<string, Array<{ label: string; value: string }>> = {};
    CAPABILITIES.forEach((capability) => {
      const options = models
        .filter((model) => {
          const tags = Array.isArray(model?.capability_tags) ? model.capability_tags : [];
          return tags.includes(capability.key) || String(model?.id || '') === DEFAULT_MODELS[capability.key];
        })
        .map((model) => ({
          label: String(model?.display_name_fa || model?.label || model?.id || '').trim(),
          value: String(model?.id || '').trim(),
        }))
        .filter((item) => item.value);
      const fallback = DEFAULT_MODELS[capability.key];
      if (fallback && !options.some((item) => item.value === fallback)) {
        options.unshift({ label: fallback, value: fallback });
      }
      result[capability.key] = options;
    });
    return result;
  }, [models]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await callAssistant({
        action: 'save_ai_settings',
        settings: {
          selected_models: {
            ...DEFAULT_MODELS,
            ...(values.selected_models || {}),
          },
          feature_flags: values.feature_flags || {},
          daily_limit_irt: values.daily_limit_irt ?? null,
          monthly_limit_irt: values.monthly_limit_irt ?? null,
          require_human_approval: values.require_human_approval !== false,
        },
      });
      message.success('تنظیمات هوش مصنوعی ذخیره شد.');
      await loadOverview();
    } catch (error: any) {
      if (Array.isArray(error?.errorFields)) return;
      message.error(toFaErrorMessage(error, 'ذخیره تنظیمات هوش مصنوعی ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  const totals = overview?.usage?.totals || {};

  const currencyCode = String(overview?.company?.currency_code || 'IRT').toUpperCase();
  const currencyLabel = String(overview?.company?.currency_label || 'تومان');
  const currencyMultiplier = currencyCode === 'IRR' ? 10 : 1;
  const formatCurrency = (value: unknown) =>
    `${(Number(value || 0) * currencyMultiplier).toLocaleString('fa-IR')} ${currencyLabel}`;

  const modelColumns = [
    {
      title: 'مدل',
      dataIndex: 'display_name_fa',
      render: (_: unknown, row: any) => (
        <div>
          <div className="font-semibold">{row.display_name_fa || row.id}</div>
          <div className="text-xs text-gray-400">{row.id}</div>
        </div>
      ),
    },
    {
      title: 'قابلیت‌ها',
      dataIndex: 'capability_tags',
      render: (value: string[] = [], row: any) => (
        <Space size={[4, 4]} wrap>
          {(value || []).slice(0, 4).map((tag) => <Tag key={tag}>{tag}</Tag>)}
          {row.is_coming_soon ? <Tag color="gold">فاز بعد</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'هزینه ورودی',
      dataIndex: 'input_usd_per_1m',
      render: (value: unknown) => `$${formatUnit(value)} / ۱M`,
    },
    {
      title: 'هزینه خروجی',
      dataIndex: 'output_usd_per_1m',
      render: (value: unknown) => `$${formatUnit(value)} / ۱M`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="m-0 text-base font-bold text-gray-800 dark:text-gray-100">تنظیمات هوش مصنوعی</h3>
          <p className="m-0 mt-1 text-xs text-gray-500">
            کلید سرویس‌دهنده به‌صورت مرکزی توسط تازه سیستم مدیریت می‌شود؛ اینجا فقط مدل، مصرف و سیاست‌های هر سازمان تنظیم می‌شود.
          </p>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => void loadOverview()} loading={loading}>
            بروزرسانی
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            ذخیره تنظیمات
          </Button>
        </Space>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
          <Statistic title="مصرف ثبت‌شده" value={totals.billed_amount_irt || 0} formatter={formatCurrency} />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
          <Statistic title="تعداد درخواست‌ها" value={totals.requests || 0} />
        </div>
      </div>

      <Form form={form} layout="vertical">
        <Collapse
          defaultActiveKey={['models', 'policy']}
          items={[
            {
              key: 'models',
              label: (
                <span className="inline-flex items-center gap-2">
                  <RobotOutlined />
                  مدل هر عملکرد
                </span>
              ),
              children: (
                <div className="space-y-3">
                  {CAPABILITIES.map((capability) => (
                    <div
                      key={capability.key}
                      className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 p-3 dark:border-white/10 md:grid-cols-12 md:items-center"
                    >
                      <div className="md:col-span-4">
                        <div className="font-semibold">{capability.label}</div>
                        <div className="text-xs text-gray-500">{capability.description}</div>
                      </div>
                      <Form.Item name={['selected_models', capability.key]} className="m-0 md:col-span-5">
                        <Select
                          showSearch
                          optionFilterProp="label"
                          options={modelOptionsByCapability[capability.key] || []}
                          placeholder="انتخاب مدل"
                        />
                      </Form.Item>
                      <Form.Item name={['feature_flags', capability.key]} valuePropName="checked" className="m-0 md:col-span-2">
                        <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" disabled={capability.phase === 'next'} />
                      </Form.Item>
                      <div className="md:col-span-1">
                        {capability.phase === 'next' ? <Tag color="gold">فاز بعد</Tag> : <Tag color="green">فعال</Tag>}
                      </div>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              key: 'policy',
              label: (
                <span className="inline-flex items-center gap-2">
                  <ThunderboltOutlined />
                  اعتبار و سیاست مصرف
                </span>
              ),
              children: (
                <>
                  <Alert
                    type="info"
                    showIcon
                    className="mb-3"
                    message="اقدام‌های واقعی هوش مصنوعی نیازمند تایید انسانی هستند."
                    description="در فاز اول، ساخت رکورد یا ارسال پیام توسط AI به‌صورت پیشنهاد ثبت می‌شود و قبل از اجرا باید تایید شود."
                  />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Form.Item label="سقف روزانه مصرف" name="daily_limit_irt">
                      <InputNumber min={0} className="w-full" formatter={(value) => `${value || ''}`} />
                    </Form.Item>
                    <Form.Item label="سقف ماهانه مصرف" name="monthly_limit_irt">
                      <InputNumber min={0} className="w-full" formatter={(value) => `${value || ''}`} />
                    </Form.Item>
                    <Form.Item label="تایید انسانی" name="require_human_approval" valuePropName="checked">
                      <Switch checkedChildren="لازم است" unCheckedChildren="لازم نیست" />
                    </Form.Item>
                  </div>
                </>
              ),
            },
            {
              key: 'usage',
              label: 'مصرف اخیر',
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={overview?.usage?.recent || []}
                  locale={{ emptyText: <Empty description="هنوز مصرفی ثبت نشده است." /> }}
                  columns={[
                    { title: 'قابلیت', dataIndex: 'capability' },
                    { title: 'مدل', dataIndex: 'model' },
                    { title: 'وضعیت', dataIndex: 'status', render: (value) => <Tag>{String(value || '-')}</Tag> },
                    { title: 'هزینه', dataIndex: 'billed_amount_irt', render: formatCurrency },
                  ]}
                  pagination={{ pageSize: 8 }}
                />
              ),
            },
            {
              key: 'catalog',
              label: 'لیست مدل‌ها و قیمت',
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={models}
                  loading={loading}
                  columns={modelColumns}
                  pagination={{ pageSize: 8 }}
                />
              ),
            },
            {
              key: 'knowledge',
              label: 'دانش و اسناد هوش مصنوعی',
              children: <AiKnowledgeTab />,
            },
          ]}
        />
      </Form>
    </div>
  );
};

export default AiSettingsTab;
