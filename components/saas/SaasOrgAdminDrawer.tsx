import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Collapse,
  Descriptions,
  Divider,
  Drawer,
  InputNumber,
  Popconfirm,
  Space,
  Select,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, RocketOutlined, SaveOutlined, ShoppingOutlined } from '@ant-design/icons';
import { executeSaasModuleAction } from '../../utils/saasAdminModules';
import { supabase } from '../../supabaseClient';
import { SAAS_FEATURE_OPTIONS, SAAS_MODULE_GROUPS } from '../../utils/saasOfferingCatalog';

const { Text } = Typography;

type Props = {
  open: boolean;
  record: Record<string, any>;
  onClose: () => void;
  onChanged: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  active: 'فعال',
  trial: 'آزمایشی',
  suspended: 'تعلیق‌شده',
  draft: 'پیش‌نویس',
  failed: 'ناموفق',
  needs_admin_review: 'نیازمند بررسی',
};

const statusColor = (status: unknown) => {
  switch (String(status || '').trim()) {
    case 'active': return 'green';
    case 'trial': return 'blue';
    case 'suspended': return 'red';
    case 'failed': return 'red';
    case 'needs_admin_review': return 'orange';
    default: return 'default';
  }
};

const displayDate = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fa-IR');
};

const SaasOrgAdminDrawer: React.FC<Props> = ({ open, record, onClose, onChanged }) => {
  const { message } = App.useApp();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [account, setAccount] = useState<any | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [quotas, setQuotas] = useState<Record<string, number>>({});
  const sourceKind = String(record?.source_kind || 'org').trim();
  const isDemoOrg = sourceKind === 'org' && record?.is_demo === true;

  const loadAccount = useCallback(async () => {
    const orgId = String(record?.org_id || record?.source_id || '').trim();
    if (!orgId || sourceKind !== 'org') return;
    setAccountLoading(true);
    try {
      const [accountResult, planResult] = await Promise.all([
        supabase.rpc('admin_get_saas_org_account', { p_org_id: orgId }),
        supabase.from('saas_plans').select('code,title,enabled_modules,enabled_features').eq('is_active', true).order('sort_order'),
      ]);
      if (accountResult.error) throw accountResult.error;
      if (planResult.error) throw planResult.error;
      const next = accountResult.data || null;
      setAccount(next);
      setPlans(planResult.data || []);
      setSelectedPlan(next?.management?.plan_code || null);
      setSelectedModules(Object.entries(next?.access?.modules || {}).filter(([, enabled]) => enabled === true).map(([key]) => key));
      setSelectedFeatures(Object.entries(next?.access?.features || {}).filter(([, enabled]) => enabled === true).map(([key]) => key));
      const rawQuotas = next?.management?.quota_adjustments || {};
      setQuotas({ users: Number(rawQuotas.users || 0), storage_gb: Number(rawQuotas.storage_gb || 0), scheduled_runs: Number(rawQuotas.scheduled_runs || 0), active_workflows: Number(rawQuotas.active_workflows || 0), sms_credit: Number(rawQuotas.sms_credit || 0), instagram_accounts: Number(rawQuotas.instagram_accounts || 0) });
    } catch (error: any) {
      message.error(error?.message || 'دریافت وضعیت حساب سازمان ناموفق بود.');
    } finally {
      setAccountLoading(false);
    }
  }, [message, record?.org_id, record?.source_id, sourceKind]);

  useEffect(() => { void loadAccount(); }, [loadAccount]);

  const choosePlan = (code: string) => {
    const plan = plans.find((item) => item.code === code);
    setSelectedPlan(code || null);
    if (!plan) return;
    setSelectedModules(Object.entries(plan.enabled_modules || {}).filter(([, enabled]) => enabled === true).map(([key]) => key));
    setSelectedFeatures(Object.entries(plan.enabled_features || {}).filter(([, enabled]) => !!enabled).map(([key]) => key));
  };

  const saveAccount = async () => {
    const orgId = String(record?.org_id || record?.source_id || '').trim();
    if (!orgId) return;
    setAccountSaving(true);
    try {
      const toMap = (items: string[]) => Object.fromEntries(items.map((item) => [item, true]));
      const { data, error } = await supabase.rpc('admin_update_saas_org_account', {
        p_org_id: orgId,
        p_plan_code: selectedPlan,
        p_module_overrides: toMap(selectedModules),
        p_feature_overrides: toMap(selectedFeatures),
        p_quota_adjustments: quotas,
      });
      if (error) throw error;
      setAccount(data || null);
      message.success('پلن، دسترسی‌ها و سهمیه‌های سازمان ذخیره شد.');
      onChanged();
    } catch (error: any) {
      message.error(error?.message || 'ذخیره تنظیمات حساب ناموفق بود.');
    } finally {
      setAccountSaving(false);
    }
  };

  const accountSummary = useMemo(() => {
    const quota = account?.quotas || {};
    return `کاربر: ${quota.users_used || 0} / ${Number(quota.users_included || 0) + Number(quota.users_extra || 0) || '—'} · ماژول: ${selectedModules.length} · امکانات: ${selectedFeatures.length}`;
  }, [account, selectedFeatures.length, selectedModules.length]);

  const runAction = async (actionId: 'convert_request_to_org' | 'delete_demo_org') => {
    setActionLoading(actionId);
    try {
      const result = await executeSaasModuleAction('saas_orgs', actionId, record);
      message.success(result.message || 'عملیات انجام شد.');
      onChanged();
    } catch (error: any) {
      message.error(error?.message || 'عملیات سازمان ناموفق بود.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Drawer
      title={record?.org_name || 'جزئیات سازمان'}
      open={open}
      onClose={onClose}
      width="min(520px, 100vw)"
      placement="left"
      destroyOnHidden
    >
      <Space direction="vertical" size={16} className="w-full">
        {sourceKind === 'request' ? (
          <Alert
            type="info"
            showIcon
            message="درخواست در انتظار ایجاد سازمان"
            description="این مورد هنوز سازمان فعال نیست و فقط پس از بررسی مدیر قابل ایجاد است."
          />
        ) : null}

        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="نام سازمان">{record?.org_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="آدرس">
            {record?.resolved_host || record?.slug ? (
              <Text className="ltr-text">{record?.resolved_host || `${record.slug}.tazesystem.ir`}</Text>
            ) : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="وضعیت">
            <Tag color={statusColor(record?.status)}>{STATUS_LABELS[String(record?.status || '')] || record?.status || '—'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="وضعیت ایجاد">{record?.provision_state === 'request_pending' ? 'در انتظار ایجاد' : 'ایجاد شده'}</Descriptions.Item>
          <Descriptions.Item label="پلن">{record?.plan_code || '—'}</Descriptions.Item>
          <Descriptions.Item label="دمو">{record?.is_demo ? 'بله' : 'خیر'}</Descriptions.Item>
          <Descriptions.Item label="فقط خواندن">{record?.is_readonly ? 'بله' : 'خیر'}</Descriptions.Item>
          <Descriptions.Item label="پایان دوره آزمایشی">{displayDate(record?.trial_ends_at)}</Descriptions.Item>
        </Descriptions>

        <Divider orientation="right" plain>مالک و اطلاعات تماس</Divider>
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="نام مالک / متقاضی">{record?.owner_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="ایمیل">{record?.owner_email || '—'}</Descriptions.Item>
          <Descriptions.Item label="موبایل">{record?.primary_contact_mobile || '—'}</Descriptions.Item>
          <Descriptions.Item label="زمان ثبت">{displayDate(record?.provisioned_at)}</Descriptions.Item>
        </Descriptions>

        {sourceKind === 'request' ? (
          <Button
            type="primary"
            icon={<RocketOutlined />}
            loading={actionLoading === 'convert_request_to_org'}
            onClick={() => void runAction('convert_request_to_org')}
          >
            ایجاد سازمان از این درخواست
          </Button>
        ) : null}

        {isDemoOrg ? (
          <div className="rounded-xl border border-red-200 p-3">
            <Text strong type="danger">عملیات خطرناک</Text>
            <div className="mt-3">
              <Popconfirm
                title="حذف کامل نسخه دمو"
                description="تمام داده‌های این نسخه دمو حذف می‌شود و قابل بازگشت نیست."
                okText="حذف کامل"
                cancelText="انصراف"
                okButtonProps={{ danger: true, loading: actionLoading === 'delete_demo_org' }}
                onConfirm={() => runAction('delete_demo_org')}
              >
                <Button danger icon={<DeleteOutlined />} loading={actionLoading === 'delete_demo_org'}>
                  حذف کامل نسخه دمو
                </Button>
              </Popconfirm>
            </div>
          </div>
        ) : null}

        {sourceKind === 'org' ? (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Space><ShoppingOutlined className="text-indigo-600" /><Text strong>حساب، پلن و دسترسی‌ها</Text></Space>
              {accountLoading ? <Spin size="small" /> : <Text type="secondary" className="text-xs">{accountSummary}</Text>}
            </div>
            <div className="space-y-4">
              <div>
                <Text type="secondary" className="mb-1 block text-xs">پلن پایه</Text>
                <Select className="w-full" allowClear placeholder="پلن را انتخاب کنید" value={selectedPlan || undefined} onChange={choosePlan} options={plans.map((plan) => ({ value: plan.code, label: plan.title || plan.code }))} />
              </div>
              <Collapse ghost items={[
                {
                  key: 'modules', label: `ماژول‌ها (${selectedModules.length})`, children: <div className="space-y-3">{SAAS_MODULE_GROUPS.map((group) => <div key={group.label}><Text strong className="text-xs">{group.label}</Text><Checkbox.Group className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2" value={selectedModules} options={group.modules.map((item) => ({ value: item.id, label: item.label }))} onChange={(values) => {
                    const groupIds = new Set(group.modules.map((item) => item.id));
                    setSelectedModules((current) => [...current.filter((item) => !groupIds.has(item)), ...values.map(String)]);
                  }} /></div>)}</div>,
                },
                {
                  key: 'features', label: `امکانات (${selectedFeatures.length})`, children: <Checkbox.Group className="grid grid-cols-1 gap-1 sm:grid-cols-2" value={selectedFeatures} options={SAAS_FEATURE_OPTIONS.map((item) => ({ value: item.id, label: item.label }))} onChange={(values) => setSelectedFeatures(values.map(String))} />,
                },
                {
                  key: 'quotas', label: 'سهمیه‌های دستی', children: <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[
                    ['users', 'کاربر اضافه'], ['storage_gb', 'فضای اضافه (GB)'], ['scheduled_runs', 'زمان‌بندی خودکار اضافه'], ['active_workflows', 'گردش‌کار فعال اضافه'], ['sms_credit', 'اعتبار پیامک'], ['instagram_accounts', 'اکانت اینستاگرام'],
                  ].map(([key, label]) => <div key={key}><Text type="secondary" className="mb-1 block text-xs">{label}</Text><InputNumber className="w-full" min={0} value={quotas[key] || 0} onChange={(value) => setQuotas((current) => ({ ...current, [key]: Number(value || 0) }))} /></div>)}</div>,
                },
              ]} />
              <Button block type="primary" icon={<SaveOutlined />} loading={accountSaving} onClick={() => void saveAccount()}>ذخیره وضعیت حساب</Button>
            </div>
          </div>
        ) : null}
      </Space>
    </Drawer>
  );
};

export default SaasOrgAdminDrawer;
