import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  ApiOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  GlobalOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { App as AntdApp } from 'antd';
import { supabase } from '../supabaseClient';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text, Paragraph } = Typography;

type ApiToken = {
  id: string;
  org_id: string;
  token: string;
  name: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
};

type OrgWebhook = {
  id: string;
  org_id: string;
  name: string | null;
  url: string;
  secret: string;
  events: string[];
  tables: string[];
  is_active: boolean;
  created_at: string;
  last_fired_at: string | null;
  last_status: number | null;
};

const WEBHOOK_EVENT_OPTIONS = [
  { label: 'فاکتور فروش — ایجاد', value: 'invoices.created' },
  { label: 'فاکتور فروش — ویرایش', value: 'invoices.updated' },
  { label: 'فاکتور فروش — حذف', value: 'invoices.deleted' },
  { label: 'مشتریان — ایجاد', value: 'customers.created' },
  { label: 'مشتریان — ویرایش', value: 'customers.updated' },
  { label: 'تامین‌کنندگان — ایجاد', value: 'suppliers.created' },
  { label: 'تامین‌کنندگان — ویرایش', value: 'suppliers.updated' },
  { label: 'محصولات — ایجاد', value: 'products.created' },
  { label: 'محصولات — ویرایش', value: 'products.updated' },
  { label: 'وظایف — ایجاد', value: 'tasks.created' },
  { label: 'وظایف — ویرایش', value: 'tasks.updated' },
  { label: 'کارمندان — ایجاد', value: 'employees.created' },
  { label: 'کارمندان — ویرایش', value: 'employees.updated' },
];

const generateToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(20)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

const generateSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fa-IR', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
};

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);
  const { message } = AntdApp.useApp();

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      message.success(label ? `${label} کپی شد` : 'کپی شد');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Tooltip title="کپی">
      <Button
        size="small"
        type="text"
        icon={copied ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
        onClick={handleCopy}
      />
    </Tooltip>
  );
};

// ─── API Tokens Sub-Section ──────────────────────────────────────────────────

const ApiTokensSection: React.FC = () => {
  const { message, modal } = AntdApp.useApp();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('org_api_tokens')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTokens(data ?? []);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در بارگذاری توکن‌های API'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const token = generateToken();
      const { data, error } = await supabase
        .from('org_api_tokens')
        .insert({ token, name: newTokenName || null })
        .select()
        .single();
      if (error) throw error;
      setNewTokenName('');
      setTokens(prev => [data, ...prev]);
      // نمایش توکن یک‌بار
      modal.info({
        title: 'توکن API ایجاد شد',
        content: (
          <div>
            <Paragraph className="text-sm text-gray-600 mb-2">
              این توکن را کپی کنید — بعد از بستن این پنجره نمایش داده نخواهد شد.
            </Paragraph>
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-3 font-mono text-sm break-all">
              <span>{token}</span>
              <CopyButton text={token} label="توکن" />
            </div>
          </div>
        ),
        okText: 'متوجه شدم، ذخیره کردم',
        icon: <KeyOutlined />,
        width: 520,
      });
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در ایجاد توکن'));
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      const { error } = await supabase
        .from('org_api_tokens')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
      setTokens(prev => prev.map(t => t.id === id ? { ...t, is_active: false } : t));
      message.success('توکن غیرفعال شد');
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در غیرفعال کردن توکن'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('org_api_tokens')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setTokens(prev => prev.filter(t => t.id !== id));
      message.success('توکن حذف شد');
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در حذف توکن'));
    }
  };

  const columns: ColumnsType<ApiToken> = [
    {
      title: 'نام',
      dataIndex: 'name',
      render: (v: string | null) => v ?? <Text type="secondary">بدون نام</Text>,
    },
    {
      title: 'وضعیت',
      dataIndex: 'is_active',
      render: (v: boolean) => v
        ? <Tag color="green">فعال</Tag>
        : <Tag color="default">غیرفعال</Tag>,
      width: 90,
    },
    {
      title: 'تاریخ ایجاد',
      dataIndex: 'created_at',
      render: formatDate,
      width: 130,
    },
    {
      title: 'آخرین استفاده',
      dataIndex: 'last_used_at',
      render: formatDate,
      width: 130,
    },
    {
      title: 'عملیات',
      key: 'actions',
      width: 110,
      render: (_: any, record: ApiToken) => (
        <Space>
          {record.is_active && (
            <Popconfirm
              title="توکن را غیرفعال کنم؟"
              onConfirm={() => handleDeactivate(record.id)}
              okText="بله"
              cancelText="خیر"
            >
              <Tooltip title="غیرفعال کردن">
                <Button size="small" type="text" icon={<StopOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
          <Popconfirm
            title="این توکن حذف شود؟"
            onConfirm={() => handleDelete(record.id)}
            okText="بله"
            cancelText="خیر"
          >
            <Tooltip title="حذف">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <Title level={5} className="!mb-0 flex items-center gap-2">
          <KeyOutlined /> توکن‌های API
        </Title>
        <Button size="small" icon={<ReloadOutlined />} onClick={load} loading={loading} />
      </div>
      <Paragraph className="text-sm text-gray-500 mb-4">
        توکن‌های API برای دسترسی مستقیم نرم‌افزارهای خارجی به داده‌های سازمان شما استفاده می‌شوند.
        هر توکن فقط یک‌بار نمایش داده می‌شود — آن را در جای امنی ذخیره کنید.
      </Paragraph>

      <div className="flex items-center gap-2 mb-3">
        <Input
          placeholder="نام توکن (اختیاری)"
          value={newTokenName}
          onChange={e => setNewTokenName(e.target.value)}
          style={{ maxWidth: 240 }}
          onPressEnter={handleCreate}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          loading={creating}
          onClick={handleCreate}
        >
          ایجاد توکن جدید
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={tokens}
        loading={loading}
        size="small"
        pagination={false}
        locale={{ emptyText: 'توکنی تعریف نشده' }}
      />
    </div>
  );
};

// ─── Webhooks Sub-Section ────────────────────────────────────────────────────

const WebhooksSection: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [webhooks, setWebhooks] = useState<OrgWebhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('org_webhooks')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setWebhooks(data ?? []);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در بارگذاری webhooks'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldValue('secret', generateSecret());
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const { error } = await supabase.from('org_webhooks').insert({
        url: values.url,
        name: values.name || null,
        secret: values.secret,
        events: values.events ?? [],
        tables: [],
        is_active: true,
      });
      if (error) throw error;
      message.success('Webhook ایجاد شد');
      setModalOpen(false);
      load();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(toFaErrorMessage(err, 'خطا در ذخیره webhook'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      const { error } = await supabase
        .from('org_webhooks')
        .update({ is_active: !current })
        .eq('id', id);
      if (error) throw error;
      setWebhooks(prev => prev.map(w => w.id === id ? { ...w, is_active: !current } : w));
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در تغییر وضعیت webhook'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('org_webhooks')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setWebhooks(prev => prev.filter(w => w.id !== id));
      message.success('Webhook حذف شد');
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در حذف webhook'));
    }
  };

  const handleTest = async (webhook: OrgWebhook) => {
    setTestingId(webhook.id);
    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TazeSystem-Event': 'test.ping',
        },
        body: JSON.stringify({
          event: 'test.ping',
          table: 'test',
          record_id: null,
          timestamp: new Date().toISOString(),
          data: { message: 'این یک پیام آزمایشی از TazeSystem است.' },
        }),
      });
      if (res.ok) {
        message.success(`ارسال موفق — وضعیت: ${res.status}`);
      } else {
        message.warning(`دریافت شد اما وضعیت: ${res.status}`);
      }
    } catch (err: any) {
      message.error(`ارسال تست ناموفق: ${err?.message || 'خطا'}`);
    } finally {
      setTestingId(null);
    }
  };

  const statusColor = (status: number | null) => {
    if (!status) return 'default';
    if (status >= 200 && status < 300) return 'green';
    if (status >= 400) return 'red';
    return 'orange';
  };

  const columns: ColumnsType<OrgWebhook> = [
    {
      title: 'نام / URL',
      key: 'identity',
      render: (_: any, record: OrgWebhook) => (
        <div>
          <div className="font-medium">{record.name ?? 'بدون نام'}</div>
          <Text type="secondary" className="text-xs break-all">{record.url}</Text>
        </div>
      ),
    },
    {
      title: 'وضعیت',
      dataIndex: 'is_active',
      width: 90,
      render: (v: boolean) => v
        ? <Tag color="green">فعال</Tag>
        : <Tag>غیرفعال</Tag>,
    },
    {
      title: 'آخرین ارسال',
      key: 'last',
      width: 140,
      render: (_: any, record: OrgWebhook) => (
        <div>
          <div>{formatDate(record.last_fired_at)}</div>
          {record.last_status && (
            <Tag color={statusColor(record.last_status)} className="text-xs">
              {record.last_status}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: 'عملیات',
      key: 'actions',
      width: 140,
      render: (_: any, record: OrgWebhook) => (
        <Space>
          <Tooltip title="ارسال تست">
            <Button
              size="small"
              type="text"
              icon={<GlobalOutlined />}
              loading={testingId === record.id}
              onClick={() => handleTest(record)}
            />
          </Tooltip>
          <Tooltip title={record.is_active ? 'غیرفعال' : 'فعال'}>
            <Button
              size="small"
              type="text"
              icon={record.is_active ? <StopOutlined /> : <CheckCircleOutlined />}
              onClick={() => handleToggleActive(record.id, record.is_active)}
            />
          </Tooltip>
          <Popconfirm
            title="این webhook حذف شود؟"
            onConfirm={() => handleDelete(record.id)}
            okText="بله"
            cancelText="خیر"
          >
            <Tooltip title="حذف">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <Title level={5} className="!mb-0 flex items-center gap-2">
          <GlobalOutlined /> Webhooks خروجی
        </Title>
        <Space>
          <Button size="small" icon={<ReloadOutlined />} onClick={load} loading={loading} />
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
            افزودن Webhook
          </Button>
        </Space>
      </div>
      <Paragraph className="text-sm text-gray-500 mb-4">
        با تعریف webhook، هر بار که داده‌ای در سیستم تغییر کند، به‌صورت خودکار به URL شما اطلاع داده می‌شود.
      </Paragraph>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={webhooks}
        loading={loading}
        size="small"
        pagination={false}
        locale={{ emptyText: 'Webhook تعریف نشده' }}
      />

      <Modal
        title="افزودن Webhook جدید"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText="ذخیره"
        cancelText="انصراف"
        confirmLoading={saving}
        width={560}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item label="نام توضیحی" name="name">
            <Input placeholder="مثال: اتصال نرم‌افزار حسابداری" />
          </Form.Item>
          <Form.Item
            label="URL"
            name="url"
            rules={[
              { required: true, message: 'URL الزامی است' },
              { type: 'url', message: 'URL معتبر وارد کنید' },
            ]}
          >
            <Input placeholder="https://your-app.com/webhooks/taze" dir="ltr" />
          </Form.Item>
          <Form.Item label="Secret (برای تأیید امضا)" name="secret" rules={[{ required: true }]}>
            <Input.Password
              dir="ltr"
              addonAfter={
                <Button
                  size="small"
                  type="text"
                  onClick={() => form.setFieldValue('secret', generateSecret())}
                >
                  تولید
                </Button>
              }
            />
          </Form.Item>
          <Form.Item label="رویدادهای مشترک" name="events">
            <Checkbox.Group
              options={WEBHOOK_EVENT_OPTIONS}
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}
            />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            className="mt-2"
            message="امضای HMAC-SHA256"
            description="هر درخواست با هدر X-TazeSystem-Signature امضا می‌شود. راهنمای تأیید را در مستندات API ببینید."
          />
        </Form>
      </Modal>
    </div>
  );
};

// ─── Main Export ─────────────────────────────────────────────────────────────

const ApiIntegrationSection: React.FC = () => (
  <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
    <div className="flex items-center gap-2 mb-1">
      <ApiOutlined style={{ fontSize: 18, color: '#1677ff' }} />
      <Title level={4} className="!mb-0">یکپارچه‌سازی API</Title>
    </div>
    <Text type="secondary" className="block mb-6 text-sm">
      با استفاده از توکن API و Webhooks می‌توانید ارتباط دوطرفه بین TazeSystem و سایر نرم‌افزارها برقرار کنید.
      {' '}<a href="/tazesystem/developers" target="_blank" rel="noopener noreferrer">مستندات API ↗</a>
    </Text>

    <ApiTokensSection />
    <Divider />
    <WebhooksSection />
  </div>
);

export default ApiIntegrationSection;
