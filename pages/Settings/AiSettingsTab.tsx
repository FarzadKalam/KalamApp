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
import { ReloadOutlined, SaveOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import AiKnowledgeTab from './AiKnowledgeTab';
import AiSparkleIcon from '../../components/ai/AiSparkleIcon';

type AiCapabilityKey =
  | 'dashboard_chat'
  | 'record_chat'
  | 'customer_reply_suggestion'
  | 'document_analysis'
  | 'workflow_ai_prompt'
  | 'deep_reasoning'
  | 'legal_assistant'
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
  { key: 'deep_reasoning', label: 'تفکر عمیق', description: 'استفاده از مدل‌های reasoning برای سوالات پیچیده', phase: 'active' },
  { key: 'legal_assistant', label: 'دستیار حقوقی', description: 'پاسخ حقوقی با تکیه بر اسناد سازمان و جستجوی وب', phase: 'active' },
  { key: 'web_search', label: 'جستجوی وب', description: 'جستجوی اینترنتی برای سوالات نیازمند اطلاعات جاری', phase: 'active' },
  { key: 'voice_input', label: 'دریافت و تحلیل صدا', description: 'تبدیل ویس به متن و تحلیل آن', phase: 'active' },
  { key: 'voice_output', label: 'تولید صدا', description: 'پاسخگویی با ویس', phase: 'active' },
  { key: 'image_generation', label: 'تولید تصویر', description: 'ساخت تصویر با پرامپت', phase: 'active' },
  { key: 'video_generation', label: 'تولید ویدیو', description: 'ساخت ویدیو با پرامپت', phase: 'next' },
  { key: 'voip_auto_reply', label: 'پاسخگویی خودکار VOIP', description: 'پاسخ صوتی خودکار در تماس‌ها', phase: 'next' },
];

const PRIMARY_MODEL_KEY = '__primary_model';
const PRIMARY_MODEL_CAPABILITIES = new Set([
  'dashboard_chat',
  'record_chat',
  'customer_reply_suggestion',
  'document_analysis',
  'workflow_ai_prompt',
  'deep_reasoning',
  'legal_assistant',
  'web_search',
]);

const PRIMARY_MODEL_PREFERRED_IDS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gpt-5.4-mini',
  'grok-4.3',
  'gpt-5.5',
  'qwen3.7-max',
  'kimi-k2.6',
];
const PRIMARY_MODEL_ALLOWED_IDS = new Set(PRIMARY_MODEL_PREFERRED_IDS);

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
      const selectedModels = data?.settings?.selected_models || {};
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
  const capabilityAvailability = useMemo(() => (overview?.capabilityAvailability || {}) as Record<string, any>, [overview]);
  const modelOptionsByCapability = useMemo(() => {
    const result: Record<string, Array<{ label: string; value: string }>> = {};
    CAPABILITIES.forEach((capability) => {
      const options = models
        .filter((model) => {
          const tags = Array.isArray(model?.capability_tags) ? model.capability_tags : [];
          return model?.is_coming_soon !== true && tags.includes(capability.key);
        })
        .map((model) => ({
          label: String(model?.display_name_fa || model?.label || model?.id || '').trim(),
          value: String(model?.id || '').trim(),
        }))
        .filter((item) => item.value);
      result[capability.key] = options;
    });
    return result;
  }, [models]);
  const primaryModelOptions = useMemo(() => models
    .filter((model) => {
      const tags = Array.isArray(model?.capability_tags) ? model.capability_tags : [];
      return model?.is_coming_soon !== true && tags.some((tag: string) => PRIMARY_MODEL_CAPABILITIES.has(String(tag || '').trim()));
    })
    .filter((model) => PRIMARY_MODEL_ALLOWED_IDS.has(String(model?.id || '').trim()))
    .sort((a, b) => {
      const aIndex = PRIMARY_MODEL_PREFERRED_IDS.indexOf(String(a?.id || ''));
      const bIndex = PRIMARY_MODEL_PREFERRED_IDS.indexOf(String(b?.id || ''));
      if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      const aTags = Array.isArray(a?.capability_tags) ? a.capability_tags : [];
      const bTags = Array.isArray(b?.capability_tags) ? b.capability_tags : [];
      const aCoverage = aTags.filter((tag: string) => PRIMARY_MODEL_CAPABILITIES.has(String(tag || '').trim())).length;
      const bCoverage = bTags.filter((tag: string) => PRIMARY_MODEL_CAPABILITIES.has(String(tag || '').trim())).length;
      return bCoverage - aCoverage;
    })
    .map((model) => ({
      label: String(model?.display_name_fa || model?.label || model?.id || '').trim(),
      value: String(model?.id || '').trim(),
    }))
    .filter((item) => item.value), [models]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await callAssistant({
        action: 'save_ai_settings',
        settings: {
          selected_models: {
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
                  <AiSparkleIcon className="h-4 w-4" />
                  مدل هر عملکرد
                </span>
              ),
              children: (
                <div className="space-y-3">
                  <div className="rounded-lg border border-[rgba(var(--brand-200-rgb),0.75)] bg-[rgba(var(--brand-50-rgb),0.65)] p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="mb-2">
                      <div className="font-semibold text-gray-800 dark:text-gray-100">مدل اصلی سازمان</div>
                      <div className="text-xs leading-5 text-gray-500">
                        برای گفتگو، تحلیل اسناد، ساخت رکورد و عملگرهای متنی استفاده می‌شود؛ موتورهای تخصصی مثل تصویر، ویدیو، صدا و ساخت فایل جدا تنظیم می‌شوند.
                      </div>
                    </div>
                    <Form.Item name={['selected_models', PRIMARY_MODEL_KEY]} className="m-0 max-w-xl">
                      <Select
                        showSearch
                        optionFilterProp="label"
                        options={primaryModelOptions}
                        placeholder="انتخاب مدل اصلی"
                      />
                    </Form.Item>
                  </div>
                  {CAPABILITIES.map((capability) => (
                    (() => {
                      const availability = capabilityAvailability[capability.key] || {};
                      const disabledByPlan = availability.planAvailable === false;
                      const disabledByReadiness = capability.phase === 'next' || availability.tenantReady === false || availability.hasReadyModel === false;
                      const switchDisabled = disabledByPlan || disabledByReadiness;
                      return (
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
                        <Switch checkedChildren="فعال" unCheckedChildren="غیرفعال" disabled={switchDisabled} />
                      </Form.Item>
                      <div className="md:col-span-1">
                        {disabledByPlan ? <Tag color="red">خارج از پلن</Tag> : disabledByReadiness ? <Tag color="gold">فاز بعد</Tag> : <Tag color="green">آماده</Tag>}
                      </div>
                    </div>
                      );
                    })()
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
