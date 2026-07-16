import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Tabs,
  Tooltip,
  Typography,
} from 'antd';
import {
  CloudSyncOutlined,
  EditOutlined,
  GiftOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import AiSparkleIcon from '../../components/ai/AiSparkleIcon';

const { Text } = Typography;

const ALL_CAPABILITIES = [
  { key: 'dashboard_chat', label: 'گفتگو داشبورد' },
  { key: 'record_chat', label: 'گفتگو رکورد' },
  { key: 'customer_reply_suggestion', label: 'پیشنهاد پاسخ مشتری' },
  { key: 'document_analysis', label: 'تحلیل اسناد' },
  { key: 'workflow_ai_prompt', label: 'پرامپت گردش کار' },
  { key: 'deep_reasoning', label: 'تفکر عمیق' },
  { key: 'auto_decision', label: 'تصمیم‌گیری خودکار' },
  { key: 'legal_assistant', label: 'دستیار حقوقی' },
  { key: 'voip_auto_reply', label: 'VOIP خودکار' },
  { key: 'web_search', label: 'جستجوی وب' },
  { key: 'voice_input', label: 'ورودی صوتی (STT)' },
  { key: 'voice_output', label: 'خروجی صوتی (TTS)' },
  { key: 'image_generation', label: 'تولید تصویر' },
  { key: 'image_edit', label: 'ویرایش تصویر' },
  { key: 'video_generation', label: 'تولید ویدیو' },
  { key: 'embedding', label: 'Embedding اسناد' },
  { key: 'document_generation', label: 'تولید سند' },
  { key: 'customer_auto_reply', label: 'پاسخگویی خودکار مشتریان' },
];

const MODEL_TABS = [
  { key: 'all', label: 'همه مدل‌ها' },
  { key: 'text', label: 'مدل‌های متنی' },
  { key: 'reasoning', label: 'مدل‌های استدلالی' },
  { key: 'image', label: 'تصویرساز' },
  { key: 'audio', label: 'تولید و دریافت صدا' },
  { key: 'video', label: 'ویدیوساز' },
  { key: 'embedding', label: 'بردارساز' },
];

const PRIMARY_MODEL_DEFAULT_KEY = '__primary_model';
const DEFAULT_CAPABILITY_OPTIONS = [
  { key: PRIMARY_MODEL_DEFAULT_KEY, label: 'مدل اصلی سازمان' },
  ...ALL_CAPABILITIES,
];

const formatIrt = (value: unknown) =>
  `${Math.round(Number(value || 0)).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} تومان`;

const formatUsd = (value: unknown) =>
  `$${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })}`;

const callAi = async (body: Record<string, any>) => {
  const { data, error } = await supabase.functions.invoke('ai-assistant', { body });
  if (error) throw error;
  if (!(data as any)?.success) throw new Error(String((data as any)?.message || 'درخواست ناموفق بود.'));
  return data as any;
};

type AiModel = {
  id: string;
  provider: string;
  display_name_fa: string;
  capability_tags: string[];
  input_usd_per_1m: number;
  output_usd_per_1m: number;
  specific_cost_usd: number | null;
  specific_cost_unit: string | null;
  margin_percent: number;
  exchange_rate_irt: number;
  is_active: boolean;
  is_coming_soon: boolean;
  metadata: Record<string, any>;
};

type ModelFormValues = AiModel;

type ProviderModel = {
  id: string;
  label: string;
  suggested_capability_tags?: string[];
  context_window?: number | null;
  input_usd_per_1m?: number | null;
  output_usd_per_1m?: number | null;
  raw?: Record<string, any>;
};

const modelTabKey = (model: Pick<ProviderModel, 'id' | 'suggested_capability_tags'>) => {
  const id = String(model.id || '').toLowerCase();
  const tags = model.suggested_capability_tags || [];
  if (tags.includes('image_generation') || /(image|imagen|flux|banana)/.test(id)) return 'image';
  if (tags.includes('video_generation') || /(video|sora|veo|kling|runway)/.test(id)) return 'video';
  if (tags.includes('voice_input') || tags.includes('voice_output') || /(tts|speech|eleven|transcrib|whisper)/.test(id)) return 'audio';
  if (tags.includes('embedding') || /embed/.test(id)) return 'embedding';
  if (tags.includes('deep_reasoning') || tags.includes('auto_decision') || /(reason|o1|o3|r1|thinking)/.test(id)) return 'reasoning';
  return 'text';
};

const SaasAdminAiSettings: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Record<string, any> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [providerModelsOpen, setProviderModelsOpen] = useState(false);
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([]);
  const [providerModelsWarning, setProviderModelsWarning] = useState('');
  const [providerModelTab, setProviderModelTab] = useState('all');
  const [providerModelSearch, setProviderModelSearch] = useState('');
  const [catalogCapabilityFilter, setCatalogCapabilityFilter] = useState<string | undefined>();
  const [editModel, setEditModel] = useState<AiModel | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [selectedOrgIds, setSelectedOrgIds] = useState<React.Key[]>([]);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftAmount, setGiftAmount] = useState<number | null>(250000);
  const [giftReason, setGiftReason] = useState('اعتبار هدیه هوش مصنوعی');
  const [giftSaving, setGiftSaving] = useState(false);
  const [form] = Form.useForm<ModelFormValues>();
  const defaultCapabilityTags = Form.useWatch(['metadata', 'default_capability_tags'], form) || [];
  const isDefaultModel = Form.useWatch(['metadata', 'is_default_model'], form) === true;

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callAi({ action: 'saas_ai', sub: 'overview' });
      setOverview(data);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'دریافت اطلاعات هوش مصنوعی ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const models = useMemo<AiModel[]>(() => (overview?.models || []) as AiModel[], [overview]);
  const providerModelRows = useMemo(() => {
    const term = providerModelSearch.trim().toLowerCase();
    return providerModels.filter((model) => {
      const matchesTab = providerModelTab === 'all' || modelTabKey(model) === providerModelTab;
      const searchable = `${model.id} ${model.label} ${(model.suggested_capability_tags || []).join(' ')}`.toLowerCase();
      return matchesTab && (!term || searchable.includes(term));
    });
  }, [providerModels, providerModelSearch, providerModelTab]);
  const filteredCatalogModels = useMemo(() => models.filter((model) =>
    !catalogCapabilityFilter || (model.capability_tags || []).includes(catalogCapabilityFilter)
  ), [catalogCapabilityFilter, models]);
  const catalogModelIds = useMemo(() => new Set(models.map((model) => model.id)), [models]);
  const defaultReplacementPreview = useMemo(() => (Array.isArray(defaultCapabilityTags) ? defaultCapabilityTags : [])
    .map((capability) => ({
      capability,
      label: DEFAULT_CAPABILITY_OPTIONS.find((option) => option.key === capability)?.label || capability,
      current: models.filter((model) => Array.isArray(model.metadata?.default_capability_tags) && model.metadata.default_capability_tags.includes(capability)),
    })), [defaultCapabilityTags, models]);
  const orgSummaries = useMemo(() => (overview?.orgSummaries || []) as any[], [overview]);
  const allUsage = useMemo(() => (overview?.allUsage || []) as any[], [overview]);
  const totals = overview?.totals || {};
  const providerCredit = overview?.providerCredit || {};
  const providerBalance = providerCredit?.credit?.toman
    ?? providerCredit?.credit?.irt
    ?? providerCredit?.credit?.rial
    ?? providerCredit?.credit?.remaining_irt
    ?? providerCredit?.credit?.remaining
    ?? null;
  const providerTokenBalance = providerCredit?.credit?.token
    ?? providerCredit?.credit?.tokens
    ?? providerCredit?.credit?.unit
    ?? providerCredit?.credit?.credit
    ?? null;

  const handleSyncModels = async () => {
    setSyncing(true);
    try {
      const data = await callAi({ action: 'saas_ai', sub: 'sync_models' });
      const list: any[] = data?.models || [];
      message.success(`${list.length} مدل از AvalAI دریافت شد.`);
      setProviderModels(list as ProviderModel[]);
      setProviderModelsWarning(String(data?.warning || ''));
      setProviderModelTab('all');
      setProviderModelSearch('');
      setProviderModelsOpen(true);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'همگام‌سازی مدل‌ها ناموفق بود.'));
    } finally {
      setSyncing(false);
    }
  };

  const openAddProviderModel = (model: ProviderModel) => {
    const existingModel = models.find((catalogModel) => catalogModel.id === model.id);
    if (existingModel) {
      openEdit(existingModel);
      setProviderModelsOpen(false);
      return;
    }
    setEditModel(null);
    form.resetFields();
    form.setFieldsValue({
      id: model.id,
      provider: 'avalai',
      display_name_fa: model.label || model.id,
      capability_tags: model.suggested_capability_tags || [],
      input_usd_per_1m: model.input_usd_per_1m ?? 0,
      output_usd_per_1m: model.output_usd_per_1m ?? 0,
      margin_percent: 30,
      is_active: true,
      is_coming_soon: false,
      metadata: {
        context_window: model.context_window ?? null,
        provider_catalog_id: model.id,
      },
    });
    setProviderModelsOpen(false);
    setEditOpen(true);
  };

  const openEdit = (model: AiModel | null) => {
    setEditModel(model);
    if (model) {
      form.setFieldsValue({
        ...model,
        capability_tags: model.capability_tags || [],
        metadata: {
          ...(model.metadata || {}),
          is_default_model: Array.isArray(model.metadata?.default_capability_tags) && model.metadata.default_capability_tags.length > 0,
        },
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        provider: 'avalai',
        margin_percent: 30,
        is_active: true,
        is_coming_soon: false,
        capability_tags: [],
        metadata: { default_capability_tags: [] },
      });
    }
    setEditOpen(true);
  };

  const saveModel = async () => {
    try {
      const values = await form.validateFields();
      const allValues = form.getFieldsValue(true);
      setEditSaving(true);
      await callAi({
        action: 'saas_ai',
        sub: 'upsert_model',
        model: { ...(editModel || {}), ...allValues, ...values },
      });
      message.success(editModel ? 'مدل ویرایش شد.' : 'مدل جدید اضافه شد.');
      setEditOpen(false);
      await loadOverview();
    } catch (err: any) {
      if (Array.isArray(err?.errorFields)) return;
      message.error(toFaErrorMessage(err, 'ذخیره مدل ناموفق بود.'));
    } finally {
      setEditSaving(false);
    }
  };

  const toggleModel = async (modelId: string, currentActive: boolean) => {
    try {
      await callAi({ action: 'saas_ai', sub: 'toggle_model', modelId, is_active: !currentActive });
      message.success(!currentActive ? 'مدل فعال شد.' : 'مدل غیرفعال شد.');
      setOverview((prev) => prev
        ? {
            ...prev,
            models: (prev.models || []).map((m: AiModel) =>
              m.id === modelId ? { ...m, is_active: !currentActive } : m
            ),
          }
        : prev);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'تغییر وضعیت مدل ناموفق بود.'));
    }
  };

  const grantGiftCredit = async () => {
    const amount = Math.round(Number(giftAmount || 0));
    if (selectedOrgIds.length === 0) {
      message.error('حداقل یک سازمان را انتخاب کنید.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      message.error('مبلغ اعتبار هدیه معتبر نیست.');
      return;
    }
    setGiftSaving(true);
    try {
      const data = await callAi({
        action: 'saas_ai',
        sub: 'gift_credit',
        orgIds: selectedOrgIds.map(String),
        amount_irt: amount,
        reason: giftReason || 'اعتبار هدیه هوش مصنوعی',
      });
      message.success(`برای ${Number(data?.count || selectedOrgIds.length).toLocaleString('fa-IR')} سازمان اعتبار هدیه ثبت شد.`);
      setGiftOpen(false);
      setSelectedOrgIds([]);
      await loadOverview();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'ثبت اعتبار هدیه ناموفق بود.'));
    } finally {
      setGiftSaving(false);
    }
  };

  const modelColumns = [
    {
      title: 'مدل',
      dataIndex: 'id',
      width: 220,
      render: (_: unknown, row: AiModel) => (
        <div>
          <div className="font-semibold text-xs">{row.display_name_fa || row.id}</div>
          <div className="font-mono text-[10px] text-gray-400">{row.id}</div>
          <Tag color={row.provider === 'openai' ? 'blue' : row.provider === 'elevenlabs' ? 'purple' : 'default'} className="mt-1 text-[10px]">
            {row.provider}
          </Tag>
        </div>
      ),
    },
    {
      title: 'ویژگی‌ها',
      dataIndex: 'capability_tags',
      render: (tags: string[] = []) => (
        <Space size={[2, 2]} wrap>
          {tags.map((t) => (
            <Tag key={t} className="text-[9px] m-0">
              {ALL_CAPABILITIES.find((c) => c.key === t)?.label || t}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'ورودی / خروجی',
      width: 130,
      render: (_: unknown, row: AiModel) => (
        <div className="text-xs">
          {row.specific_cost_usd
            ? <span>{formatUsd(row.specific_cost_usd)} / {row.specific_cost_unit || 'unit'}</span>
            : <span>{formatUsd(row.input_usd_per_1m)} / {formatUsd(row.output_usd_per_1m)} per 1M</span>
          }
        </div>
      ),
    },
    {
      title: 'حاشیه',
      dataIndex: 'margin_percent',
      width: 70,
      render: (v: number) => `${Number(v || 0)}٪`,
    },
    {
      title: 'وضعیت',
      width: 90,
      render: (_: unknown, row: AiModel) => (
        <Space direction="vertical" size={2}>
          <Switch
            size="small"
            checked={row.is_active}
            checkedChildren="فعال"
            unCheckedChildren="غیرفعال"
            onChange={() => void toggleModel(row.id, row.is_active)}
          />
          {row.is_coming_soon ? <Tag color="gold" className="text-[10px]">فاز بعد</Tag> : null}
        </Space>
      ),
    },
    {
      title: '',
      width: 40,
      render: (_: unknown, row: AiModel) => (
        <Tooltip title="ویرایش">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
        </Tooltip>
      ),
    },
  ];

  const usageColumns = [
    { title: 'تاریخ', dataIndex: 'created_at', width: 140, render: (v: string) => v ? new Date(v).toLocaleDateString('fa-IR', { dateStyle: 'short' }) : '-' },
    { title: 'سازمان', dataIndex: 'org_name', width: 160, render: (v: string) => <span className="text-xs font-semibold">{v || 'سازمان بدون نام'}</span> },
    { title: 'قابلیت', dataIndex: 'capability' },
    { title: 'مدل', dataIndex: 'model', render: (v: string) => <Text className="font-mono text-xs">{v}</Text> },
    { title: 'وضعیت', dataIndex: 'status', render: (v: string) => <Tag>{v}</Tag> },
    { title: 'هزینه مشتری (تومان)', dataIndex: 'billed_amount_irt', render: (v: number) => formatIrt(v) },
    { title: 'هزینه خام (تومان)', dataIndex: 'raw_cost_irt', render: (v: number) => formatIrt(v) },
  ];

  const orgColumns = [
    { title: 'سازمان', dataIndex: 'org_name', render: (v: string) => <span className="text-xs font-semibold">{v || 'سازمان بدون نام'}</span> },
    { title: 'اعتبار باقی‌مانده', dataIndex: 'wallet_remaining_irt', render: (v: number) => formatIrt(v) },
    { title: 'تعداد درخواست', dataIndex: 'requests' },
    { title: 'هزینه مشتری (تومان)', dataIndex: 'billed_irt', render: (v: number) => formatIrt(v) },
    { title: 'هزینه خام (تومان)', dataIndex: 'raw_irt', render: (v: number) => formatIrt(v) },
    { title: 'آخرین هدیه', dataIndex: 'last_gift_irt', render: (v: number) => v ? formatIrt(v) : '-' },
    { title: 'مدل‌های استفاده‌شده', dataIndex: 'models', render: (v: string[]) => <Space wrap size={2}>{(v || []).slice(0, 4).map((m) => <Tag key={m} className="text-[10px] m-0">{m}</Tag>)}</Space> },
    {
      title: '',
      width: 80,
      render: (_: unknown, row: any) => (
        <Button
          size="small"
          icon={<GiftOutlined />}
          onClick={() => {
            setSelectedOrgIds([row.org_id]);
            setGiftOpen(true);
          }}
        >
          هدیه
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="m-0 text-base font-bold text-gray-800 dark:text-gray-100">تنظیمات مرکزی هوش مصنوعی</h3>
          <p className="m-0 mt-1 text-xs text-gray-500">
            مدیریت مدل‌ها، قیمت‌گذاری، دسترسی‌ها و مصرف همه سازمان‌ها
          </p>
        </div>
        <Space wrap>
          <Button
            icon={<CloudSyncOutlined />}
            loading={syncing}
            onClick={handleSyncModels}
          >
            دریافت مدل‌های AvalAI
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => openEdit(null)}>
            مدل جدید
          </Button>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={loadOverview}>
            بروزرسانی
          </Button>
        </Space>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
          <Statistic title="اعتبار AvalAI" value={providerBalance || 0} formatter={formatIrt} />
          {providerTokenBalance !== null && providerTokenBalance !== undefined ? (
            <div className="mt-1 text-xs text-gray-500">
              واحد/توکن: {Number(providerTokenBalance || 0).toLocaleString('fa-IR')}
            </div>
          ) : null}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
          <Statistic title="کل درآمد ثبت‌شده" value={totals.billed_irt || 0} formatter={formatIrt} />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
          <Statistic title="هزینه خام پرداختی" value={totals.raw_irt || 0} formatter={formatIrt} />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
          <Statistic title="کل درخواست‌ها" value={totals.requests || 0} />
        </div>
      </div>

      {!providerCredit?.available ? (
        <Alert
          type="warning"
          showIcon
          message="اعتبار AvalAI قابل دریافت نیست"
          description={providerCredit?.message || 'secret مرکزی AI_API_KEY را در Edge Function secrets بررسی کنید.'}
        />
      ) : null}

      <Collapse
        defaultActiveKey={['models', 'usage_all']}
        items={[
          {
            key: 'models',
            label: (
              <span className="inline-flex items-center gap-2">
                <AiSparkleIcon className="h-4 w-4" /> مدیریت مدل‌ها و قیمت‌گذاری
              </span>
            ),
            children: (
              <div className="space-y-2">
                <Alert
                  type="info"
                  showIcon
                  className="text-xs"
                  message="برای هر ویژگی (capability)، فقط مدل‌هایی که capability_tags آن‌ها شامل آن ویژگی باشد در انتخاب سازمان‌ها نشان داده می‌شود."
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Text type="secondary" className="text-xs">فیلتر بر اساس عملگر:</Text>
                  <Select
                    allowClear
                    className="min-w-56"
                    value={catalogCapabilityFilter}
                    onChange={setCatalogCapabilityFilter}
                    placeholder="همه عملگرها"
                    options={ALL_CAPABILITIES.map((capability) => ({ value: capability.key, label: capability.label }))}
                  />
                </div>
                <Table
                  rowKey="id"
                  size="small"
                  loading={loading}
                  dataSource={filteredCatalogModels}
                  columns={modelColumns}
                  pagination={{ pageSize: 15, showSizeChanger: false }}
                  locale={{ emptyText: <Empty description="مدلی در کاتالوگ وجود ندارد." /> }}
                  scroll={{ x: 900 }}
                />
              </div>
            ),
          },
          {
            key: 'usage_orgs',
            label: 'خلاصه مصرف هر سازمان',
            children: (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Space wrap>
                    <Button
                      icon={<GiftOutlined />}
                      type="primary"
                      disabled={selectedOrgIds.length === 0}
                      onClick={() => setGiftOpen(true)}
                    >
                      افزودن اعتبار هدیه
                    </Button>
                    <Button onClick={() => setSelectedOrgIds(orgSummaries.map((row) => row.org_id))}>
                      انتخاب همه
                    </Button>
                    <Button onClick={() => setSelectedOrgIds([])}>
                      لغو انتخاب
                    </Button>
                  </Space>
                  <Text type="secondary" className="text-xs">
                    {selectedOrgIds.length.toLocaleString('fa-IR')} سازمان انتخاب شده
                  </Text>
                </div>
                <Table
                  rowKey="org_id"
                  size="small"
                  loading={loading}
                  dataSource={orgSummaries}
                  columns={orgColumns}
                  rowSelection={{
                    selectedRowKeys: selectedOrgIds,
                    onChange: setSelectedOrgIds,
                  }}
                  pagination={{ pageSize: 10 }}
                  locale={{ emptyText: <Empty description="سازمانی پیدا نشد." /> }}
                  scroll={{ x: 980 }}
                />
              </div>
            ),
          },
          {
            key: 'usage_all',
            label: 'ریز تراکنش‌های مصرف (همه سازمان‌ها)',
            children: (
              <Table
                rowKey="id"
                size="small"
                loading={loading}
                dataSource={allUsage}
                columns={usageColumns}
                pagination={{ pageSize: 10 }}
                locale={{ emptyText: <Empty description="تراکنشی ثبت نشده است." /> }}
                scroll={{ x: 900 }}
              />
            ),
          },
        ]}
      />

      <Modal
        open={providerModelsOpen}
        title="مدل‌های AvalAI"
        onCancel={() => setProviderModelsOpen(false)}
        footer={<Button onClick={() => setProviderModelsOpen(false)}>بستن</Button>}
        width={1100}
        destroyOnHidden
      >
        <div className="space-y-3" dir="rtl">
          <Alert
            type="info"
            showIcon
            message={`${providerModels.length.toLocaleString('fa-IR')} مدل از AvalAI دریافت شد؛ برای سرعت، هر بار فقط یک صفحه نمایش داده می‌شود.`}
            description="برچسب‌ها از اطلاعات مدل و نام آن پیشنهاد می‌شوند. پیش از ذخیره می‌توانید آن‌ها و قیمت را در فرم افزودن مدل اصلاح کنید."
          />
          {providerModelsWarning ? <Alert type="warning" showIcon message={providerModelsWarning} /> : null}
          <Tabs
            activeKey={providerModelTab}
            onChange={setProviderModelTab}
            items={MODEL_TABS.map((tab) => ({
              key: tab.key,
              label: `${tab.label} (${(tab.key === 'all' ? providerModels : providerModels.filter((model) => modelTabKey(model) === tab.key)).length.toLocaleString('fa-IR')})`,
            }))}
          />
          <Input.Search
            allowClear
            value={providerModelSearch}
            onChange={(event) => setProviderModelSearch(event.target.value)}
            placeholder="جستجو در نام یا شناسه مدل"
          />
          <Table
            rowKey="id"
            size="small"
            dataSource={providerModelRows}
            pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (total) => `${total.toLocaleString('fa-IR')} مدل` }}
            scroll={{ x: 980, y: 460 }}
            locale={{ emptyText: <Empty description="مدلی در این دسته پیدا نشد." /> }}
            columns={[
              {
                title: 'مدل', width: 250,
                render: (_: unknown, row: ProviderModel) => <div><div className="font-semibold text-xs">{row.label || row.id}</div><div className="font-mono text-[10px] text-gray-400">{row.id}</div></div>,
              },
              {
                title: 'دسته و ویژگی‌ها', width: 260,
                render: (_: unknown, row: ProviderModel) => <Space size={[2, 2]} wrap><Tag color="blue" className="m-0 text-[10px]">{MODEL_TABS.find((tab) => tab.key === modelTabKey(row))?.label || 'متنی'}</Tag>{(row.suggested_capability_tags || []).map((tag) => <Tag key={tag} className="m-0 text-[10px]">{ALL_CAPABILITIES.find((item) => item.key === tag)?.label || tag}</Tag>)}</Space>,
              },
              {
                title: 'ورودی / خروجی', width: 150,
                render: (_: unknown, row: ProviderModel) => row.input_usd_per_1m !== null && row.input_usd_per_1m !== undefined || row.output_usd_per_1m !== null && row.output_usd_per_1m !== undefined
                  ? <span className="text-xs">{formatUsd(row.input_usd_per_1m || 0)} / {formatUsd(row.output_usd_per_1m || 0)} <span className="text-gray-400">برای ۱M</span></span>
                  : <span className="text-xs text-gray-400">اعلام نشده</span>,
              },
              {
                title: 'پنجره توکن', width: 120,
                render: (_: unknown, row: ProviderModel) => row.context_window ? <span className="text-xs">{Number(row.context_window).toLocaleString('fa-IR')}</span> : <span className="text-xs text-gray-400">اعلام نشده</span>,
              },
              {
                title: 'وضعیت', width: 110,
                render: (_: unknown, row: ProviderModel) => catalogModelIds.has(row.id) ? <Tag color="green">انتخاب‌شده در پروژه</Tag> : <Tag>جدید</Tag>,
              },
              {
                title: '', width: 110,
                render: (_: unknown, row: ProviderModel) => <Button size="small" type={catalogModelIds.has(row.id) ? 'default' : 'primary'} icon={<PlusOutlined />} onClick={() => openAddProviderModel(row)}>{catalogModelIds.has(row.id) ? 'ویرایش مدل' : 'افزودن مدل'}</Button>,
              },
            ]}
          />
        </div>
      </Modal>

      <Modal
        open={giftOpen}
        title="افزودن اعتبار هدیه"
        onCancel={() => setGiftOpen(false)}
        onOk={() => void grantGiftCredit()}
        confirmLoading={giftSaving}
        okText="ثبت اعتبار"
        cancelText="انصراف"
      >
        <div className="space-y-3">
          <Alert
            type="info"
            showIcon
            message={`${selectedOrgIds.length.toLocaleString('fa-IR')} سازمان انتخاب شده است.`}
            description="این اعتبار داخلی برای سازمان ثبت می‌شود و پرداخت واقعی از AvalAI انجام نمی‌دهد."
          />
          <div>
            <div className="mb-1 text-xs text-gray-500">مبلغ هدیه برای هر سازمان (تومان)</div>
            <InputNumber
              min={1}
              step={100000}
              className="w-full"
              value={giftAmount}
              formatter={(value) => `${value || ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => Number(String(value || '').replace(/,/g, ''))}
              onChange={(value) => setGiftAmount(Number(value || 0))}
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-gray-500">توضیح</div>
            <Input value={giftReason} onChange={(event) => setGiftReason(event.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Edit/Add model modal */}
      <Modal
        open={editOpen}
        title={editModel ? `ویرایش مدل: ${editModel.id}` : 'افزودن مدل جدید'}
        onCancel={() => setEditOpen(false)}
        onOk={saveModel}
        confirmLoading={editSaving}
        okText="ذخیره"
        cancelText="انصراف"
        width={600}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" size="small">
          <div className="grid grid-cols-2 gap-x-3">
            <Form.Item name="id" label="شناسه مدل (ID)" rules={[{ required: true }]}>
              <Input placeholder="شناسه دریافتی از provider" disabled={!!editModel} />
            </Form.Item>
            <Form.Item name="provider" label="Provider">
              <Input placeholder="نام provider" />
            </Form.Item>
            <Form.Item name="display_name_fa" label="نام فارسی" className="col-span-2">
              <Input placeholder="نام نمایشی مدل" />
            </Form.Item>
            <Form.Item name="capability_tags" label="ویژگی‌ها (Capabilities)" className="col-span-2">
              <Select
                mode="multiple"
                options={ALL_CAPABILITIES.map((c) => ({ value: c.key, label: c.label }))}
                placeholder="انتخاب ویژگی‌های مجاز"
              />
            </Form.Item>
            <Form.Item name="input_usd_per_1m" label="ورودی (USD/1M توکن)">
              <InputNumber min={0} step={0.01} className="w-full" />
            </Form.Item>
            <Form.Item name="output_usd_per_1m" label="خروجی (USD/1M توکن)">
              <InputNumber min={0} step={0.01} className="w-full" />
            </Form.Item>
            <Form.Item name="specific_cost_usd" label="هزینه مستقیم (USD)">
              <InputNumber min={0} step={0.0001} className="w-full" placeholder="اگر per-token نیست" />
            </Form.Item>
            <Form.Item name="specific_cost_unit" label="واحد هزینه مستقیم">
              <Input placeholder="per_query / per_minute / per_image" />
            </Form.Item>
            <Form.Item name="margin_percent" label="حاشیه سود (٪)">
              <InputNumber min={0} max={500} className="w-full" />
            </Form.Item>
            <Form.Item name="exchange_rate_irt" label="نرخ تبدیل (تومان/دلار)">
              <InputNumber min={0} className="w-full" />
            </Form.Item>
            <Form.Item name="is_active" label="فعال" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="is_coming_soon" label="فاز بعد" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item
              name={['metadata', 'is_default_model']}
              label="مدل پیش‌فرض"
              valuePropName="checked"
              className="col-span-2"
            >
              <Switch
                checkedChildren="پیش‌فرض"
                unCheckedChildren="عادی"
                onChange={(checked) => {
                  const metadata = form.getFieldValue('metadata') || {};
                  form.setFieldValue('metadata', {
                    ...metadata,
                    is_default_model: checked,
                    default_capability_tags: checked ? (metadata.default_capability_tags || []) : [],
                  });
                }}
              />
            </Form.Item>
            <Form.Item
              name={['metadata', 'default_capability_tags']}
              label="پیش‌فرض برای عملگرها"
              className="col-span-2"
              dependencies={[['metadata', 'is_default_model']]}
            >
              <Select
                mode="multiple"
                disabled={!isDefaultModel}
                options={DEFAULT_CAPABILITY_OPTIONS.map((capability) => ({ value: capability.key, label: capability.label }))}
                placeholder="عملگرهایی که این مدل باید پیش‌فرض آن‌ها باشد"
              />
            </Form.Item>
            {defaultReplacementPreview.length > 0 ? (
              <div className="col-span-2">
                <Alert
                  type="warning"
                  showIcon
                  message="تغییر پیش‌فرض‌های مرکزی"
                  description={(
                    <div className="space-y-1 text-xs">
                      {defaultReplacementPreview.map((item) => (
                        <div key={item.capability}>
                          <b>{item.label}:</b>{' '}
                          {item.current.length > 0
                            ? `${item.current.map((model) => model.display_name_fa || model.id).join('، ')} از پیش‌فرض خارج می‌شود.`
                            : 'اکنون مدل پیش‌فرضی ندارد.'}
                        </div>
                      ))}
                      <div>پس از ذخیره، این مدل پیش‌فرض مرکزی این عملگرها می‌شود؛ انتخاب ذخیره‌شده هر سازمان تغییر نمی‌کند.</div>
                    </div>
                  )}
                />
              </div>
            ) : null}
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default SaasAdminAiSettings;
