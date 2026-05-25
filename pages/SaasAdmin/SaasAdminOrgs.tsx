import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  App,
  Descriptions,
  Divider,
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  StopOutlined,
  CheckCircleOutlined,
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

const statusColor: Record<string, string> = {
  active: 'green',
  trial: 'blue',
  demo: 'purple',
  draft: 'default',
};

const SAAS_ADMIN_ORGS_SELECT =
  'org_id, org_name, slug, status, plan_code, is_demo, is_readonly, trial_ends_at, primary_contact_mobile, provisioning_source, provisioned_at, owner_name, owner_email';

const SaasAdminOrgs: React.FC = () => {
  const { message: messageApi } = App.useApp();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<OrgRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [extendDays, setExtendDays] = useState<number>(30);
  const [extending, setExtending] = useState(false);
  const [settingStatus, setSettingStatus] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let query = supabase
        .from('saas_admin_orgs_view')
        .select(SAAS_ADMIN_ORGS_SELECT)
        .order('provisioned_at', { ascending: false });

      if (statusFilter) query = query.eq('status', statusFilter);

      const { data, error: qErr } = await query;
      if (qErr) throw qErr;
      setOrgs((data as OrgRow[]) || []);
    } catch (err: any) {
      setError(err?.message || 'خطا در بارگذاری');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

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

  const handleExtendTrial = async () => {
    if (!selectedOrg) return;
    setExtending(true);
    try {
      const { data, error } = await supabase.rpc('admin_saas_extend_org_trial', {
        p_org_id: selectedOrg.org_id,
        p_days: extendDays,
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.message || 'تمدید ناموفق بود.');
      messageApi.success(`Trial به مدت ${extendDays} روز تمدید شد.`);
      void load();
      setDrawerOpen(false);
    } catch (err: any) {
      messageApi.error(err?.message || 'خطا در تمدید trial');
    } finally {
      setExtending(false);
    }
  };

  const handleSetStatus = async (newStatus: string) => {
    if (!selectedOrg) return;
    setSettingStatus(true);
    try {
      const { data, error } = await supabase.rpc('admin_saas_set_org_status', {
        p_org_id: selectedOrg.org_id,
        p_status: newStatus,
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.message || 'عملیات ناموفق بود.');
      messageApi.success('وضعیت سازمان به‌روز شد.');
      void load();
      setDrawerOpen(false);
    } catch (err: any) {
      messageApi.error(err?.message || 'خطا در تغییر وضعیت');
    } finally {
      setSettingStatus(false);
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
            scroll={{ x: 600 }}
            pagination={{ pageSize: 20, showSizeChanger: false }}
          />
        )}
      </Card>

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
              <Descriptions.Item label="آدرس">
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

            <Divider orientation="right" plain>عملیات ادمین</Divider>

            <div className="flex items-center gap-2">
              <InputNumber
                min={1}
                max={365}
                value={extendDays}
                onChange={(v) => setExtendDays(Number(v ?? 30))}
                addonAfter="روز"
                className="flex-1"
              />
              <Button
                icon={<ClockCircleOutlined />}
                loading={extending}
                type="primary"
                ghost
                onClick={handleExtendTrial}
              >
                تمدید Trial
              </Button>
            </div>

            <div className="flex gap-2 mt-2">
              {selectedOrg.status !== 'suspended' ? (
                <Popconfirm
                  title="تعلیق سازمان"
                  description="دسترسی کاربران این سازمان مسدود می‌شود. ادامه می‌دهید?"
                  okText="بله، تعلیق شود"
                  cancelText="انصراف"
                  okButtonProps={{ danger: true, loading: settingStatus }}
                  onConfirm={() => handleSetStatus('suspended')}
                >
                  <Button block danger icon={<StopOutlined />} loading={settingStatus}>
                    تعلیق سازمان
                  </Button>
                </Popconfirm>
              ) : (
                <Button
                  block
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={settingStatus}
                  onClick={() => handleSetStatus('active')}
                >
                  رفع تعلیق (فعال)
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default SaasAdminOrgs;
