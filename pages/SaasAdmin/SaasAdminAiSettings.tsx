import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Collapse,
  Descriptions,
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
  Tooltip,
  Typography,
} from 'antd';
import {
  CloudSyncOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

const { Text } = Typography;

const ALL_CAPABILITIES = [
  { key: 'dashboard_chat', label: 'گفتگو داشبورد' },
  { key: 'record_chat', label: 'گفتگو رکورد' },
  { key: 'customer_reply_suggestion', label: 'پیشنهاد پاسخ مشتری' },
  { key: 'document_analysis', label: 'تحلیل اسناد' },
  { key: 'workflow_ai_prompt', label: 'پرامپت گردش کار' },
  { key: 'voip_auto_reply', label: 'VOIP خودکار' },
  { key: 'web_search', label: 'جستجوی وب' },
  { key: 'voice_input', label: 'ورودی صوتی (STT)' },
  { key: 'voice_output', label: 'خروجی صوتی (TTS)' },
  { key: 'image_generation', label: 'تولید تصویر' },
  { key: 'video_generation', label: 'تولید ویدیو' },
  { key: 'embedding', label: 'Embedding اسناد' },
];

const formatIrt = (value: unknown) =>
  `${Number(value || 0).toLocaleString('fa-IR')} تومان`;

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

type ModelFormValues = Omit<AiModel, 'metadata'>;

const SaasAdminAiSettings: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Record<string, any> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [editModel, setEditModel] = useState<AiModel | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [form] = Form.useForm<ModelFormValues>();

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
  const orgSummaries = useMemo(() => (overview?.orgSummaries || []) as any[], [overview]);
  const allUsage = useMemo(() => (overview?.allUsage || []) as any[], [overview]);
  const totals = overview?.totals || {};
  const providerCredit = overview?.providerCredit || {};
  const providerBalance = providerCredit?.credit?.toman
    ?? providerCredit?.credit?.remaining_irt
    ?? providerCredit?.credit?.remaining
    ?? null;

  const handleSyncModels = async () => {
    setSyncing(true);
    try {
      const data = await callAi({ action: 'saas_ai', sub: 'sync_models' });
      const list: any[] = data?.models || [];
      message.success(`${list.length} مدل از AvalAI دریافت شد.`);
      // Show list for review (not auto-save)
      Modal.info({
        title: 'مدل‌های AvalAI',
        width: 700,
        content: (
          <div className="max-h-80 overflow-auto text-xs">
            {list.slice(0, 60).map((item) => (
              <div key={item.id} className="py-0.5">{item.id} — {item.label}</div>
            ))}
            {list.length > 60 ? <div>…و {list.length - 60} مدل دیگر</div> : null}
          </div>
        ),
      });
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'همگام‌سازی مدل‌ها ناموفق بود.'));
    } finally {
      setSyncing(false);
    }
  };

  const openEdit = (model: AiModel | null) => {
    setEditModel(model);
    if (model) {
      form.setFieldsValue({
        ...model,
        capability_tags: model.capability_tags || [],
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        provider: 'avalai',
        margin_percent: 30,
        is_active: true,
        is_coming_soon: false,
        capability_tags: [],
      });
    }
    setEditOpen(true);
  };

  const saveModel = async () => {
    try {
      const values = await form.validateFields();
      setEditSaving(true);
      await callAi({
        action: 'saas_ai',
        sub: 'upsert_model',
        model: { ...(editModel || {}), ...values },
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
    { title: 'سازمان', dataIndex: 'org_id', width: 120, render: (v: string) => <Text className="font-mono text-[10px]">{String(v || '').slice(0, 8)}…</Text> },
    { title: 'قابلیت', dataIndex: 'capability' },
    { title: 'مدل', dataIndex: 'model', render: (v: string) => <Text className="font-mono text-xs">{v}</Text> },
    { title: 'وضعیت', dataIndex: 'status', render: (v: string) => <Tag>{v}</Tag> },
    { title: 'هزینه مشتری (تومان)', dataIndex: 'billed_amount_irt', render: (v: number) => Number(v || 0).toLocaleString('fa-IR') },
    { title: 'هزینه خام (تومان)', dataIndex: 'raw_cost_irt', render: (v: number) => Number(v || 0).toLocaleString('fa-IR') },
  ];

  const orgColumns = [
    { title: 'سازمان', dataIndex: 'org_id', render: (v: string) => <Text className="font-mono text-xs">{String(v || '').slice(0, 8)}…</Text> },
    { title: 'تعداد درخواست', dataIndex: 'requests' },
    { title: 'هزینه مشتری (تومان)', dataIndex: 'billed_irt', render: (v: number) => Number(v || 0).toLocaleString('fa-IR') },
    { title: 'هزینه خام (تومان)', dataIndex: 'raw_irt', render: (v: number) => Number(v || 0).toLocaleString('fa-IR') },
    { title: 'مدل‌های استفاده‌شده', dataIndex: 'models', render: (v: string[]) => <Space wrap size={2}>{(v || []).slice(0, 4).map((m) => <Tag key={m} className="text-[10px] m-0">{m}</Tag>)}</Space> },
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
            key: 'provider',
            label: (
              <span className="inline-flex items-center gap-2">
                <ThunderboltOutlined /> اطلاعات Provider مرکزی
              </span>
            ),
            children: (
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="Provider">AvalAI (مرکزی TazeSystem)</Descriptions.Item>
                <Descriptions.Item label="کلید API">از طریق secret «AI_API_KEY» در Edge Function تنظیم می‌شود</Descriptions.Item>
                <Descriptions.Item label="آدرس پایه">https://api.avalai.ir/v1</Descriptions.Item>
                <Descriptions.Item label="آدرس Fallback">https://api.avalapis.ir/v1</Descriptions.Item>
                <Descriptions.Item label="مدل مالی">
                  محاسبه هزینه بر اساس usage از AvalAI + حاشیه سود — دفتر مصرف داخلی TazeSystem منبع حقیقت است
                </Descriptions.Item>
                <Descriptions.Item label="منبع حقیقت مالی">جدول org_ai_usage_ledger — AvalAI User API برای Reconciliation</Descriptions.Item>
                <Descriptions.Item label="وضعیت اعتبار">
                  {providerCredit?.available
                    ? <Tag color="green">متصل — {formatIrt(providerBalance)}</Tag>
                    : <Tag color="red">قابل دریافت نیست</Tag>}
                </Descriptions.Item>
              </Descriptions>
            ),
          },
          {
            key: 'models',
            label: (
              <span className="inline-flex items-center gap-2">
                <RobotOutlined /> مدیریت مدل‌ها و قیمت‌گذاری
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
                <Table
                  rowKey="id"
                  size="small"
                  loading={loading}
                  dataSource={models}
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
              <Table
                rowKey="org_id"
                size="small"
                loading={loading}
                dataSource={orgSummaries}
                columns={orgColumns}
                pagination={{ pageSize: 10 }}
                locale={{ emptyText: <Empty description="مصرفی ثبت نشده است." /> }}
                scroll={{ x: 700 }}
              />
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
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="small">
          <div className="grid grid-cols-2 gap-x-3">
            <Form.Item name="id" label="شناسه مدل (ID)" rules={[{ required: true }]}>
              <Input placeholder="gpt-4o" disabled={!!editModel} />
            </Form.Item>
            <Form.Item name="provider" label="Provider">
              <Input placeholder="openai / elevenlabs / serper" />
            </Form.Item>
            <Form.Item name="display_name_fa" label="نام فارسی" className="col-span-2">
              <Input placeholder="GPT-4o پیشرفته" />
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
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default SaasAdminAiSettings;
