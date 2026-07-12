import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Collapse,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
} from 'antd';
import { CreditCardOutlined, ReloadOutlined, SaveOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons';
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
  | 'document_generation'
  | 'voip_auto_reply'
  | 'auto_decision'
  | 'customer_auto_reply';

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
  { key: 'auto_decision', label: 'تصمیم‌گیری خودکار', description: 'انتخاب و ارزیابی هوشمند گزینه‌ها در عملگرهای خودکار', phase: 'active' },
  { key: 'legal_assistant', label: 'دستیار حقوقی', description: 'پاسخ حقوقی با تکیه بر اسناد سازمان و جستجوی وب', phase: 'active' },
  { key: 'web_search', label: 'جستجوی وب', description: 'جستجوی اینترنتی برای سوالات نیازمند اطلاعات جاری', phase: 'active' },
  { key: 'voice_input', label: 'دریافت و تحلیل صدا', description: 'تبدیل ویس به متن و تحلیل آن', phase: 'active' },
  { key: 'voice_output', label: 'تولید صدا', description: 'پاسخگویی با ویس', phase: 'active' },
  { key: 'image_generation', label: 'تولید تصویر', description: 'ساخت تصویر با پرامپت', phase: 'active' },
  { key: 'video_generation', label: 'تولید ویدیو', description: 'ساخت ویدیو با پرامپت', phase: 'next' },
  { key: 'document_generation', label: 'ساخت فایل', description: 'تولید فایل Word، Excel، PDF یا CSV', phase: 'active' },
  { key: 'voip_auto_reply', label: 'پاسخگویی خودکار VOIP', description: 'پاسخ صوتی خودکار در تماس‌ها', phase: 'next' },
  { key: 'customer_auto_reply', label: 'پاسخگویی خودکار مشتریان', description: 'مدل پاسخ خودکار بات‌ها و گفتگوهای مشتریان', phase: 'active' },
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

const formatUnit = (value: unknown) =>
  Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 8 });

const DEFAULT_DAILY_TOKEN_LIMIT = 80000;

const normalizePolicyDraft = (policy?: any) => ({
  ai_enabled: policy?.ai_enabled !== false && policy?.aiEnabled !== false,
  daily_token_limit: Number(policy?.daily_token_limit ?? policy?.dailyTokenLimit ?? DEFAULT_DAILY_TOKEN_LIMIT),
  daily_irt_limit: policy?.daily_irt_limit ?? policy?.dailyIrtLimit ?? null,
});

const AiSettingsTab: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overview, setOverview] = useState<Record<string, any> | null>(null);
  const [usagePolicyDraft, setUsagePolicyDraft] = useState<Record<string, any>>({ default: normalizePolicyDraft() });
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState<number | null>(500000);
  const [topupLoading, setTopupLoading] = useState(false);

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
      setUsagePolicyDraft({
        default: normalizePolicyDraft(data?.usagePolicies?.default),
        users: Object.fromEntries((data?.usagePolicies?.users || []).flatMap((user: any) => {
          const id = String(user?.id || '');
          return id && user?.policy ? [[id, normalizePolicyDraft(user.policy)]] : [];
        })),
        roles: Object.fromEntries((data?.usagePolicies?.roles || []).flatMap((role: any) => {
          const id = String(role?.id || '');
          return id && role?.policy ? [[id, normalizePolicyDraft(role.policy)]] : [];
        })),
      });
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
    .sort((a, b) => {
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
        usage_policies: usagePolicyDraft,
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
  const usagePolicies = overview?.usagePolicies || {};
  const wallet = overview?.wallet || {};

  const currencyCode = String(overview?.company?.currency_code || 'IRT').toUpperCase();
  const currencyLabel = String(overview?.company?.currency_label || 'تومان');
  const currencyMultiplier = currencyCode === 'IRR' ? 10 : 1;
  const formatCurrency = (value: unknown) =>
    `${Math.round(Number(value || 0) * currencyMultiplier).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} ${currencyLabel}`;

  const updateDefaultPolicy = (patch: Record<string, any>) => {
    setUsagePolicyDraft((current) => ({
      ...current,
      default: { ...normalizePolicyDraft(current.default), ...patch },
    }));
  };

  const updateUserPolicy = (userId: string, patch: Record<string, any>) => {
    setUsagePolicyDraft((current) => ({
      ...current,
      users: {
        ...(current.users || {}),
        [userId]: { ...normalizePolicyDraft(current.users?.[userId] || current.default), ...patch },
      },
    }));
  };

  const updateRolePolicy = (roleId: string, patch: Record<string, any>) => {
    setUsagePolicyDraft((current) => ({
      ...current,
      roles: {
        ...(current.roles || {}),
        [roleId]: { ...normalizePolicyDraft(current.roles?.[roleId] || current.default), ...patch },
      },
    }));
  };

  const handleTopup = async () => {
    const amount = Math.round(Number(topupAmount || 0));
    if (!Number.isFinite(amount) || amount < 10000) {
      message.error('حداقل مبلغ شارژ اعتبار هوش مصنوعی ۱۰٬۰۰۰ تومان است.');
      return;
    }
    setTopupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('payment-gateway', {
        body: {
          action: 'create_ai_credit_topup',
          amount_irt: amount,
          return_origin: window.location.origin,
        },
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error(String((data as any)?.message || 'ایجاد پرداخت شارژ هوش مصنوعی ناموفق بود.'));
      const paymentUrl = String((data as any)?.payment_url || '').trim();
      if (paymentUrl) window.location.href = paymentUrl;
      else message.success('درخواست شارژ اعتبار ثبت شد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ایجاد پرداخت شارژ هوش مصنوعی ناموفق بود.'));
    } finally {
      setTopupLoading(false);
    }
  };

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

  const userUsageColumns = [
    {
      title: 'کاربر',
      dataIndex: 'full_name',
      render: (_: unknown, row: any) => (
        <div>
          <div className="font-semibold">{row.full_name || row.email || row.mobile_1 || 'کاربر بدون نام'}</div>
          <div className="text-xs text-gray-400">{row.email || row.mobile_1 || ''}</div>
        </div>
      ),
    },
    {
      title: 'دسترسی به AI',
      width: 130,
      render: (_: unknown, row: any) => {
        const userId = String(row?.id || '');
        const policy = normalizePolicyDraft(usagePolicyDraft.users?.[userId] || row?.policy || usagePolicyDraft.default);
        return (
          <Switch
            checked={policy.ai_enabled}
            checkedChildren="دارد"
            unCheckedChildren="ندارد"
            onChange={(checked) => updateUserPolicy(userId, { ai_enabled: checked })}
          />
        );
      },
    },
    {
      title: 'سقف روزانه توکن',
      width: 180,
      render: (_: unknown, row: any) => {
        const userId = String(row?.id || '');
        const policy = normalizePolicyDraft(usagePolicyDraft.users?.[userId] || row?.policy || usagePolicyDraft.default);
        return (
          <InputNumber
            min={1000}
            step={5000}
            className="w-full"
            value={policy.daily_token_limit}
            onChange={(value) => updateUserPolicy(userId, { daily_token_limit: Number(value || DEFAULT_DAILY_TOKEN_LIMIT) })}
          />
        );
      },
    },
    {
      title: 'مصرف اخیر',
      width: 130,
      render: (_: unknown, row: any) => `${Number(row?.recentUsage?.usedTokens || 0).toLocaleString('fa-IR')} توکن`,
    },
  ];

  const roleUsageColumns = [
    { title: 'نقش', dataIndex: 'title', render: (value: string) => <span className="font-semibold">{value || 'نقش بدون نام'}</span> },
    {
      title: 'دسترسی به AI',
      width: 130,
      render: (_: unknown, row: any) => {
        const roleId = String(row?.id || '');
        const policy = normalizePolicyDraft(usagePolicyDraft.roles?.[roleId] || row?.policy || usagePolicyDraft.default);
        return (
          <Switch
            checked={policy.ai_enabled}
            checkedChildren="دارد"
            unCheckedChildren="ندارد"
            onChange={(checked) => updateRolePolicy(roleId, { ai_enabled: checked })}
          />
        );
      },
    },
    {
      title: 'سقف روزانه توکن',
      width: 180,
      render: (_: unknown, row: any) => {
        const roleId = String(row?.id || '');
        const policy = normalizePolicyDraft(usagePolicyDraft.roles?.[roleId] || row?.policy || usagePolicyDraft.default);
        return (
          <InputNumber
            min={1000}
            step={5000}
            className="w-full"
            value={policy.daily_token_limit}
            onChange={(value) => updateRolePolicy(roleId, { daily_token_limit: Number(value || DEFAULT_DAILY_TOKEN_LIMIT) })}
          />
        );
      },
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
          <Statistic title="مصرف ثبت‌شده" value={totals.billed_amount_irt || 0} formatter={formatCurrency} />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
          <Statistic title="تعداد درخواست‌ها" value={totals.requests || 0} />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-start justify-between gap-2">
            <Statistic title="اعتبار سازمان" value={Number(wallet?.balance_irt || 0) + Number(wallet?.included_quota_irt || 0) - Number(wallet?.reserved_irt || 0)} formatter={formatCurrency} />
            <Button size="small" icon={<CreditCardOutlined />} onClick={() => setTopupOpen(true)}>
              شارژ اعتبار
            </Button>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical">
        <Collapse
          defaultActiveKey={['models', 'policy', 'user_usage']}
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
              key: 'user_usage',
              label: (
                <span className="inline-flex items-center gap-2">
                  <UserOutlined />
                  مدیریت مصرف کاربران
                </span>
              ),
              children: (
                <div className="space-y-4">
                  <Alert
                    type="info"
                    showIcon
                    message="سقف مصرف روزانه بر اساس توکن مدیریت می‌شود؛ پرداخت و شارژ اعتبار سازمان با تومان انجام می‌شود."
                    description="مقدار پیش‌فرض ۸۰٬۰۰۰ توکن در روز برای هر کاربر است. سیاست اختصاصی کاربر از نقش و سپس پیش‌فرض سازمان دقیق‌تر است."
                  />
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-white/10">
                    <div className="mb-2 font-semibold text-gray-800 dark:text-gray-100">پیش‌فرض سازمان</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:items-end">
                      <div>
                        <div className="mb-1 text-xs text-gray-500">دسترسی عمومی</div>
                        <Switch
                          checked={normalizePolicyDraft(usagePolicyDraft.default).ai_enabled}
                          checkedChildren="فعال"
                          unCheckedChildren="غیرفعال"
                          onChange={(checked) => updateDefaultPolicy({ ai_enabled: checked })}
                        />
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-gray-500">سقف روزانه توکن</div>
                        <InputNumber
                          min={1000}
                          step={5000}
                          className="w-full"
                          value={normalizePolicyDraft(usagePolicyDraft.default).daily_token_limit}
                          onChange={(value) => updateDefaultPolicy({ daily_token_limit: Number(value || DEFAULT_DAILY_TOKEN_LIMIT) })}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 font-semibold text-gray-800 dark:text-gray-100">کاربران</div>
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={usagePolicies.users || []}
                      columns={userUsageColumns}
                      pagination={{ pageSize: 8 }}
                      locale={{ emptyText: <Empty description="کاربری پیدا نشد." /> }}
                    />
                  </div>
                  <div>
                    <div className="mb-2 font-semibold text-gray-800 dark:text-gray-100">نقش‌ها</div>
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={usagePolicies.roles || []}
                      columns={roleUsageColumns}
                      pagination={{ pageSize: 8 }}
                      locale={{ emptyText: <Empty description="نقشی پیدا نشد." /> }}
                    />
                  </div>
                </div>
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
      <Modal
        title="شارژ اعتبار هوش مصنوعی"
        open={topupOpen}
        onCancel={() => setTopupOpen(false)}
        onOk={() => void handleTopup()}
        okText="پرداخت و شارژ"
        cancelText="انصراف"
        confirmLoading={topupLoading}
      >
        <div className="space-y-3">
          <Alert
            type="info"
            showIcon
            message="پرداخت از درگاه مرکزی تازه سیستم انجام می‌شود."
            description="اعتبار هوش مصنوعی سازمان با تومان شارژ می‌شود؛ هزینه هر درخواست پس از محاسبه واقعی AvalAI و حاشیه مصوب از همین اعتبار کم می‌شود."
          />
          <div>
            <div className="mb-1 text-xs text-gray-500">مبلغ شارژ (تومان)</div>
            <InputNumber
              min={10000}
              step={100000}
              className="w-full"
              value={topupAmount}
              formatter={(value) => `${value || ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => Number(String(value || '').replace(/,/g, ''))}
              onChange={(value) => setTopupAmount(Number(value || 0))}
            />
          </div>
          <Input.TextArea
            value="شارژ اعتبار هوش مصنوعی سازمان"
            readOnly
            rows={2}
          />
        </div>
      </Modal>
    </div>
  );
};

export default AiSettingsTab;
