import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Drawer,
  Input,
  Select,
  Spin,
  Table,
  Tag,
  Typography,
  App,
} from 'antd';
import { ReloadOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';

const { Text, Title } = Typography;

type RequestRow = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  mobile: string;
  email: string | null;
  business_name: string | null;
  organization_name: string | null;
  industry: string | null;
  approx_user_count: number | null;
  employee_count_band: string | null;
  discovery_source: string | null;
  requested_slug: string | null;
  status: string;
  org_id: string | null;
  is_demo_request: boolean;
  provision_attempts: number;
  failure_code: string | null;
  failure_message: string | null;
  logo_url: string | null;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: '', label: 'همه وضعیت‌ها' },
  { value: 'draft', label: 'draft' },
  { value: 'started', label: 'در حال پردازش' },
  { value: 'provisioned', label: 'پروویژن‌شده' },
  { value: 'failed', label: 'ناموفق' },
  { value: 'needs_admin_review', label: 'نیاز به بررسی' },
];

const statusColor: Record<string, string> = {
  draft: 'default',
  started: 'processing',
  provisioned: 'success',
  failed: 'error',
  needs_admin_review: 'warning',
};

const SaasAdminRequests: React.FC = () => {
  const { message: messageApi } = App.useApp();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let query = supabase
        .from('saas_onboarding_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (statusFilter) query = query.eq('status', statusFilter);
      const { data, error: qErr } = await query;
      if (qErr) throw qErr;
      setRequests((data as RequestRow[]) || []);
    } catch (err: any) {
      setError(err?.message || 'خطا در بارگذاری');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const filtered = requests.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.full_name?.toLowerCase().includes(q) ||
      r.mobile?.includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.requested_slug?.toLowerCase().includes(q) ||
      r.organization_name?.toLowerCase().includes(q) ||
      r.business_name?.toLowerCase().includes(q)
    );
  });

  const handleManualProvision = async (row: RequestRow) => {
    if (!row.id) return;
    try {
      const { data, error: rpcErr } = await supabase.rpc('admin_convert_demo_request_to_org', {
        p_request_id: row.id,
      });
      if (rpcErr) throw rpcErr;
      if (data?.success === false) {
        throw new Error(String(data?.message || 'پروویژن ناموفق بود.'));
      }
      messageApi.success(String(data?.message || 'سازمان دمو ایجاد شد'));
      void load();
    } catch (err: any) {
      messageApi.error(err?.message || 'خطا در ارسال درخواست');
    }
  };

  const columns = [
    {
      title: 'متقاضی',
      key: 'person',
      render: (_: any, row: RequestRow) => (
        <div>
          <div className="font-bold text-slate-800">{row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim() || '—'}</div>
          <Text type="secondary" className="text-xs">{row.mobile}</Text>
        </div>
      ),
    },
    {
      title: 'سازمان / Slug',
      key: 'org',
      render: (_: any, row: RequestRow) => (
        <div>
          <div className="text-sm">{row.organization_name || row.business_name || '—'}</div>
          {row.requested_slug && (
            <Text type="secondary" className="text-xs ltr-text">{row.requested_slug}.tazesystem.ir</Text>
          )}
        </div>
      ),
    },
    {
      title: 'وضعیت',
      dataIndex: 'status',
      render: (s: string) => <Tag color={statusColor[s] || 'default'}>{s}</Tag>,
    },
    {
      title: 'دمو',
      dataIndex: 'is_demo_request',
      render: (v: boolean) => v ? <Tag color="purple">دمو</Tag> : <Tag>واقعی</Tag>,
    },
    {
      title: 'تلاش',
      dataIndex: 'provision_attempts',
      render: (v: number) => <Text className="text-xs">{v} بار</Text>,
    },
    {
      title: 'تاریخ',
      dataIndex: 'created_at',
      render: (d: string) => d ? new Date(d).toLocaleDateString('fa-IR') : '—',
    },
    {
      title: '',
      key: 'actions',
      render: (_: any, row: RequestRow) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => { setSelected(row); setDrawerOpen(true); }}
        >
          جزئیات
        </Button>
      ),
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Title level={4} className="!mb-0">درخواست‌های دمو</Title>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          بارگذاری مجدد
        </Button>
      </div>

      {error && <Alert type="error" message={error} showIcon />}

      <Card className="rounded-2xl border-0 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-3">
          <Input
            placeholder="جستجو نام، موبایل، slug..."
            prefix={<SearchOutlined className="text-gray-400" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
            allowClear
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            className="w-40"
          />
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center"><Spin /></div>
        ) : (
          <Table
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            size="small"
            scroll={{ x: 700 }}
            pagination={{ pageSize: 20, showSizeChanger: false }}
          />
        )}
      </Card>

      <Drawer
        title="جزئیات درخواست"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={460}
        placement="left"
      >
        {selected && (
          <div className="space-y-4">
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="نام">{selected.full_name || `${selected.first_name || ''} ${selected.last_name || ''}`.trim() || '—'}</Descriptions.Item>
              <Descriptions.Item label="موبایل">{selected.mobile}</Descriptions.Item>
              <Descriptions.Item label="ایمیل">{selected.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="سازمان">{selected.organization_name || selected.business_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="حوزه کاری">{selected.industry || '—'}</Descriptions.Item>
              <Descriptions.Item label="تعداد کاربران">
                {selected.approx_user_count ?? selected.employee_count_band ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="منبع آشنایی">{selected.discovery_source || '—'}</Descriptions.Item>
              <Descriptions.Item label="Subdomain درخواستی">
                {selected.requested_slug ? (
                  <Text className="ltr-text">{selected.requested_slug}.tazesystem.ir</Text>
                ) : '—'}
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="right" plain>وضعیت</Divider>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="وضعیت">
                <Tag color={statusColor[selected.status] || 'default'}>{selected.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="نوع">{selected.is_demo_request ? 'دمو' : 'واقعی'}</Descriptions.Item>
              <Descriptions.Item label="تعداد تلاش">{selected.provision_attempts}</Descriptions.Item>
              <Descriptions.Item label="org_id">{selected.org_id || '—'}</Descriptions.Item>
              {selected.failure_code && (
                <Descriptions.Item label="کد خطا">
                  <Text type="danger">{selected.failure_code}</Text>
                </Descriptions.Item>
              )}
              {selected.failure_message && (
                <Descriptions.Item label="پیام خطا">
                  <Text type="danger" className="text-xs">{selected.failure_message}</Text>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="تاریخ">
                {new Date(selected.created_at).toLocaleDateString('fa-IR')}
              </Descriptions.Item>
            </Descriptions>

            {(selected.status === 'failed' || selected.status === 'needs_admin_review') && (
              <Button
                block
                type="primary"
                onClick={() => handleManualProvision(selected)}
              >
                پروویژن دستی
              </Button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default SaasAdminRequests;
