import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Table, Tag, Typography, Spin, Alert } from 'antd';
import {
  CloudServerOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { supabase } from '../../supabaseClient';

const { Title, Text } = Typography;

type Stats = {
  total_orgs: number;
  active_orgs: number;
  demo_orgs: number;
  trial_orgs: number;
  total_requests: number;
  pending_requests: number;
  provisioned_today: number;
  total_plans: number;
};

type RecentOrg = {
  org_id: string;
  org_name: string;
  slug: string;
  status: string;
  is_demo: boolean;
  provisioned_at: string;
  owner_name: string | null;
};

const statusColor: Record<string, string> = {
  active: 'green',
  trial: 'blue',
  demo: 'purple',
  draft: 'default',
  readonly: 'orange',
};

const SaasAdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrgs, setRecentOrgs] = useState<RecentOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const [statsRes, orgsRes] = await Promise.all([
          supabase.rpc('get_saas_admin_stats'),
          supabase
            .from('saas_admin_orgs_view')
            .select('org_id,org_name,slug,status,is_demo,provisioned_at,owner_name')
            .order('provisioned_at', { ascending: false })
            .limit(8),
        ]);
        if (!mounted) return;
        if (statsRes.error) throw statsRes.error;
        if (orgsRes.error) throw orgsRes.error;
        setStats(statsRes.data as Stats);
        setRecentOrgs((orgsRes.data as RecentOrg[]) || []);
      } catch (err: any) {
        if (mounted) setError(err?.message || 'خطا در بارگذاری اطلاعات');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert type="error" message={error} showIcon />
      </div>
    );
  }

  const columns = [
    {
      title: 'سازمان',
      dataIndex: 'org_name',
      render: (name: string, row: RecentOrg) => (
        <div>
          <div className="font-bold text-slate-800">{name}</div>
          <Text type="secondary" className="text-xs">{row.slug}.tazesystem.ir</Text>
        </div>
      ),
    },
    {
      title: 'وضعیت',
      dataIndex: 'status',
      render: (status: string, row: RecentOrg) => (
        <div className="flex flex-col gap-1">
          <Tag color={statusColor[status] || 'default'}>{status}</Tag>
          {row.is_demo && <Tag color="purple" className="text-[10px]">دمو</Tag>}
        </div>
      ),
    },
    {
      title: 'مالک',
      dataIndex: 'owner_name',
      render: (name: string | null) => name || <Text type="secondary">—</Text>,
    },
    {
      title: 'تاریخ',
      dataIndex: 'provisioned_at',
      render: (date: string) =>
        date ? new Date(date).toLocaleDateString('fa-IR') : '—',
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
          <CloudServerOutlined />
        </div>
        <div>
          <Title level={4} className="!mb-0">داشبورد تازه سیستم</Title>
          <Text type="secondary" className="text-xs">مدیریت SaaS — فقط برای تیم داخلی</Text>
        </div>
      </div>

      {/* کارت‌های آماری */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} lg={6}>
          <Card className="rounded-2xl border-0 shadow-sm text-center">
            <Statistic
              title="کل سازمان‌ها"
              value={stats?.total_orgs ?? 0}
              prefix={<TeamOutlined className="text-slate-500" />}
              valueStyle={{ color: '#1e293b', fontWeight: 800 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={6}>
          <Card className="rounded-2xl border-0 shadow-sm text-center">
            <Statistic
              title="فعال"
              value={stats?.active_orgs ?? 0}
              prefix={<CheckCircleOutlined className="text-green-500" />}
              valueStyle={{ color: '#16a34a', fontWeight: 800 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={6}>
          <Card className="rounded-2xl border-0 shadow-sm text-center">
            <Statistic
              title="دمو"
              value={stats?.demo_orgs ?? 0}
              prefix={<RocketOutlined className="text-purple-500" />}
              valueStyle={{ color: '#7c3aed', fontWeight: 800 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={6}>
          <Card className="rounded-2xl border-0 shadow-sm text-center">
            <Statistic
              title="trial"
              value={stats?.trial_orgs ?? 0}
              prefix={<ClockCircleOutlined className="text-blue-500" />}
              valueStyle={{ color: '#2563eb', fontWeight: 800 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={6}>
          <Card className="rounded-2xl border-0 shadow-sm text-center">
            <Statistic
              title="درخواست‌های در انتظار"
              value={stats?.pending_requests ?? 0}
              valueStyle={{ color: '#1e293b', fontWeight: 800 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={6}>
          <Card className="rounded-2xl border-0 shadow-sm text-center">
            <Statistic
              title="پروویژن امروز"
              value={stats?.provisioned_today ?? 0}
              valueStyle={{ color: '#1e293b', fontWeight: 800 }}
            />
          </Card>
        </Col>
      </Row>

      {/* جدول آخرین سازمان‌ها */}
      <Card
        title={<span className="font-black text-slate-800">آخرین سازمان‌های ثبت‌شده</span>}
        className="rounded-2xl border-0 shadow-sm"
        extra={
          <a href="/saas_orgs" className="text-sm text-slate-600 hover:text-slate-900">
            مشاهده همه
          </a>
        }
      >
        <Table
          dataSource={recentOrgs}
          columns={columns}
          rowKey="org_id"
          pagination={false}
          size="small"
          scroll={{ x: 500 }}
        />
      </Card>
    </div>
  );
};

export default SaasAdminDashboard;
