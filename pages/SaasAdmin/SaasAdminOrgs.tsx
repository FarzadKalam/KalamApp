import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Drawer,
  Input,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  App,
  Descriptions,
  Divider,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  EyeOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { supabase } from '../../supabaseClient';

const { Text, Title } = Typography;

type OrgRow = {
  org_id: string;
  org_name: string;
  slug: string;
  status: string;
  plan_code: string | null;
  is_demo: boolean;
  is_readonly: boolean;
  trial_ends_at: string | null;
  resolved_host: string | null;
  dns_status: string;
  dns_last_error: string | null;
  arvan_record_id: string | null;
  dns_attempt_count: number;
  primary_contact_mobile: string | null;
  provisioning_source: string;
  provisioned_at: string;
  owner_name: string | null;
  owner_email: string | null;
};

const STATUS_OPTIONS = [
  { value: '', label: 'همه وضعیت‌ها' },
  { value: 'active', label: 'فعال' },
  { value: 'trial', label: 'trial' },
  { value: 'demo', label: 'دمو' },
  { value: 'draft', label: 'draft' },
];

const DNS_OPTIONS = [
  { value: '', label: 'همه DNS' },
  { value: 'active', label: 'فعال' },
  { value: 'pending', label: 'در انتظار' },
  { value: 'failed', label: 'ناموفق' },
];

const statusColor: Record<string, string> = {
  active: 'green',
  trial: 'blue',
  demo: 'purple',
  draft: 'default',
};

const SaasAdminOrgs: React.FC = () => {
  const { message: messageApi } = App.useApp();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dnsFilter, setDnsFilter] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<OrgRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let query = supabase
        .from('saas_admin_orgs_view')
        .select('*')
        .order('provisioned_at', { ascending: false });

      if (statusFilter) query = query.eq('status', statusFilter);
      if (dnsFilter) query = query.eq('dns_status', dnsFilter);

      const { data, error: qErr } = await query;
      if (qErr) throw qErr;
      setOrgs((data as OrgRow[]) || []);
    } catch (err: any) {
      setError(err?.message || 'خطا در بارگذاری');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dnsFilter]);

  useEffect(() => { void load(); }, [load]);

  const filtered = orgs.filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      o.org_name?.toLowerCase().includes(q) ||
      o.slug?.toLowerCase().includes(q) ||
      o.owner_name?.toLowerCase().includes(q) ||
      o.primary_contact_mobile?.includes(q)
    );
  });

  const handleRetryDns = async (org: OrgRow) => {
    setRetrying(org.org_id);
    try {
      const { error: fnErr } = await supabase.functions.invoke('provision-saas-dns', {
        body: { org_id: org.org_id, slug: org.slug },
      });
      if (fnErr) throw fnErr;
      messageApi.success('درخواست retry DNS ارسال شد');
      void load();
    } catch (err: any) {
      messageApi.error(err?.message || 'خطا در retry DNS');
    } finally {
      setRetrying(null);
    }
  };

  const columns = [
    {
      title: 'سازمان',
      key: 'org',
      render: (_: any, row: OrgRow) => (
        <div>
          <div className="font-bold text-slate-800">{row.org_name}</div>
          <Text type="secondary" className="text-xs ltr-text">{row.slug}.tazesystem.ir</Text>
        </div>
      ),
    },
    {
      title: 'وضعیت',
      key: 'status',
      render: (_: any, row: OrgRow) => (
        <Space size={4} direction="vertical">
          <Tag color={statusColor[row.status] || 'default'}>{row.status}</Tag>
          {row.is_demo && <Tag color="purple" className="text-[10px]">دمو</Tag>}
          {row.is_readonly && <Tag color="orange" className="text-[10px]">فقط خواندن</Tag>}
        </Space>
      ),
    },
    {
      title: 'پلن',
      dataIndex: 'plan_code',
      render: (v: string | null) => v ? <Tag>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'DNS',
      key: 'dns',
      render: (_: any, row: OrgRow) => (
        <div className="flex items-center gap-2">
          <Badge
            status={row.dns_status === 'active' ? 'success' : row.dns_status === 'failed' ? 'error' : 'processing'}
            text={<Text className="text-xs">{row.dns_status}</Text>}
          />
          {row.dns_status === 'failed' && (
            <Tooltip title="retry DNS">
              <Button
                size="small"
                icon={<WifiOutlined />}
                loading={retrying === row.org_id}
                onClick={() => handleRetryDns(row)}
                className="!h-6 !text-xs"
              />
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: 'تماس',
      dataIndex: 'primary_contact_mobile',
      render: (v: string | null) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'تاریخ',
      dataIndex: 'provisioned_at',
      render: (d: string) => d ? new Date(d).toLocaleDateString('fa-IR') : '—',
    },
    {
      title: '',
      key: 'actions',
      render: (_: any, row: OrgRow) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => { setSelectedOrg(row); setDrawerOpen(true); }}
        >
          جزئیات
        </Button>
      ),
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Title level={4} className="!mb-0">سازمان‌های SaaS</Title>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          بارگذاری مجدد
        </Button>
      </div>

      {error && <Alert type="error" message={error} showIcon />}

      <Card className="rounded-2xl border-0 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-3">
          <Input
            placeholder="جستجو نام، slug، موبایل..."
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
            className="w-36"
          />
          <Select
            value={dnsFilter}
            onChange={setDnsFilter}
            options={DNS_OPTIONS}
            className="w-32"
          />
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spin />
          </div>
        ) : (
          <Table
            dataSource={filtered}
            columns={columns}
            rowKey="org_id"
            size="small"
            scroll={{ x: 700 }}
            pagination={{ pageSize: 20, showSizeChanger: false }}
          />
        )}
      </Card>

      {/* Drawer جزئیات سازمان */}
      <Drawer
        title={selectedOrg?.org_name || 'جزئیات سازمان'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
        placement="left"
      >
        {selectedOrg && (
          <div className="space-y-4">
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="نام سازمان">{selectedOrg.org_name}</Descriptions.Item>
              <Descriptions.Item label="Slug">
                <Text className="ltr-text">{selectedOrg.slug}.tazesystem.ir</Text>
              </Descriptions.Item>
              <Descriptions.Item label="وضعیت">
                <Tag color={statusColor[selectedOrg.status] || 'default'}>{selectedOrg.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="پلن">{selectedOrg.plan_code || '—'}</Descriptions.Item>
              <Descriptions.Item label="دمو">{selectedOrg.is_demo ? 'بله' : 'خیر'}</Descriptions.Item>
              <Descriptions.Item label="فقط خواندن">{selectedOrg.is_readonly ? 'بله' : 'خیر'}</Descriptions.Item>
              <Descriptions.Item label="پایان Trial">
                {selectedOrg.trial_ends_at
                  ? new Date(selectedOrg.trial_ends_at).toLocaleDateString('fa-IR')
                  : '—'}
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="right" plain>DNS</Divider>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="وضعیت DNS">
                <Badge
                  status={selectedOrg.dns_status === 'active' ? 'success' : selectedOrg.dns_status === 'failed' ? 'error' : 'processing'}
                  text={selectedOrg.dns_status}
                />
              </Descriptions.Item>
              <Descriptions.Item label="Resolved Host">
                <Text className="ltr-text text-xs">{selectedOrg.resolved_host || '—'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Arvan Record ID">
                <Text className="ltr-text text-xs">{selectedOrg.arvan_record_id || '—'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="تعداد تلاش">{selectedOrg.dns_attempt_count}</Descriptions.Item>
              {selectedOrg.dns_last_error && (
                <Descriptions.Item label="آخرین خطا">
                  <Text type="danger" className="text-xs">{selectedOrg.dns_last_error}</Text>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Divider orientation="right" plain>مالک</Divider>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="نام">{selectedOrg.owner_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="ایمیل">{selectedOrg.owner_email || '—'}</Descriptions.Item>
              <Descriptions.Item label="موبایل">{selectedOrg.primary_contact_mobile || '—'}</Descriptions.Item>
              <Descriptions.Item label="منبع">{selectedOrg.provisioning_source}</Descriptions.Item>
              <Descriptions.Item label="تاریخ ثبت">
                {new Date(selectedOrg.provisioned_at).toLocaleDateString('fa-IR')}
              </Descriptions.Item>
            </Descriptions>

            {selectedOrg.dns_status === 'failed' && (
              <Button
                block
                icon={<WifiOutlined />}
                loading={retrying === selectedOrg.org_id}
                onClick={() => handleRetryDns(selectedOrg)}
              >
                retry DNS
              </Button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default SaasAdminOrgs;
