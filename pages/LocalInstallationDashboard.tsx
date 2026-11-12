import { Alert, App, Button, Card, Descriptions, Empty, Space, Spin, Switch, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { isSelfHostedDeployment, publicRuntimeConfig } from '../utils/runtimeConfig';
import { getSelectedOrganizationId } from '../utils/organizationContext';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { safeDiagnosticReport } from '../utils/localInstallations';
import { PLAN_FEATURE_OPTIONS } from '../utils/planFeatureCatalog';
import { MODULES } from '../moduleRegistry';
import { useState } from 'react';
import { clearAppRuntimeCache } from '../utils/appRuntimeCache';

export default function LocalInstallationDashboard() {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const report = useQuery({ queryKey: ['local-installation-health', getSelectedOrganizationId()], enabled: isSelfHostedDeployment(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_local_installation_status');
      if (error) throw error;
      return data as { code: string; version: string; last_report: unknown; generated_at: string | null; features: Record<string, boolean>; modules: Record<string, boolean> };
    }, refetchInterval: 30_000, retry: false });
  if (!isSelfHostedDeployment()) return <Empty description="این صفحه برای نصب اختصاصی است." />;
  if (report.isLoading) return <Spin />;
  if (report.error) return <Alert type="error" showIcon message={toFaErrorMessage(report.error, 'وضعیت نصب در دسترس نیست.')} />;
  const health = report.data?.last_report ? safeDiagnosticReport(report.data.last_report) : null;
  const availability = async (kind: 'features' | 'modules', key: string, value: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
    const features = { ...report.data?.features, ...(kind === 'features' ? { [key]: value } : {}) };
    const modules = { ...report.data?.modules, ...(kind === 'modules' ? { [key]: value } : {}) };
    const { error } = await supabase.rpc('set_local_installation_availability', { p_features: features, p_modules: modules });
    if (error) message.error(toFaErrorMessage(error));
    else {
      clearAppRuntimeCache(`org-plan-feature:${getSelectedOrganizationId()}:`);
      clearAppRuntimeCache(`org-plan-module:${getSelectedOrganizationId()}:`);
      await report.refetch(); message.success('تنظیم قابلیت‌های این سازمان ذخیره شد.');
    }
    } catch (error) { message.error(toFaErrorMessage(error)); } finally { setSaving(false); }
  };
  return <Card title="وضعیت نصب اختصاصی">
    <Descriptions items={[
      { key: 'code', label: 'کد نصب', children: report.data?.code || publicRuntimeConfig.installationCode },
      { key: 'version', label: 'نسخه', children: report.data?.version },
      { key: 'generated', label: 'زمان بررسی', children: report.data?.generated_at ? new Date(report.data.generated_at).toLocaleString('fa-IR') : 'گزارشی ثبت نشده' },
      { key: 'backup', label: 'آخرین پشتیبان‌گیری', children: health?.last_backup_at ? new Date(health.last_backup_at).toLocaleString('fa-IR') : 'ثبت نشده' },
      { key: 'space', label: 'فضای آزاد', children: health ? `${(health.disk_free_bytes / 1024 ** 3).toFixed(1)} گیگابایت` : 'ثبت نشده' },
    ]} />
    <Alert type="info" showIcon message="این وضعیت روی همین سرور نگهداری می‌شود." description="برای تهیهٔ گزارش تازه یا پشتیبان‌گیری، ابزار نصب را روی سرور اجرا کنید. اتصال‌های بیرونی پس از تنظیم و آزمون فعال می‌شوند." />
    <Typography.Title level={5}>سرویس‌ها</Typography.Title>
    <Table rowKey="name" pagination={false} dataSource={health?.services || []} columns={[{ title: 'سرویس', dataIndex: 'name' }, { title: 'وضعیت', dataIndex: 'status', render: (s: string) => ({ healthy: 'سالم', unhealthy: 'ناسالم', running: 'در حال اجرا', stopped: 'متوقف', unknown: 'نامشخص' })[s] }]} />
    <Typography.Title level={5}>ویژگی‌های نسخهٔ اختصاصی</Typography.Title>
    <Typography.Paragraph type="secondary">در دسترس‌بودن قابلیت از مجوز کاربران و آماده‌بودن اتصال جداست. پس از تغییر، صفحهٔ برنامه را تازه کنید.</Typography.Paragraph>
    <Space direction="vertical" className="w-full">
      {PLAN_FEATURE_OPTIONS.filter(f => Object.hasOwn(report.data?.features || {}, f.id)).map(f => <Space key={f.id}><Switch disabled={saving} aria-label={f.label} checked={report.data?.features[f.id]} onChange={v => void availability('features', f.id, v)} /><span>{f.label}</span></Space>)}
      {Object.keys(report.data?.modules || {}).filter(key => MODULES[key]).map(key => <Space key={key}><Switch disabled={saving} aria-label={MODULES[key].titles.fa} checked={report.data?.modules[key]} onChange={v => void availability('modules', key, v)} /><span>{MODULES[key].titles.fa}</span></Space>)}
      <Button onClick={() => void report.refetch()}>تازه‌سازی وضعیت</Button>
    </Space>
  </Card>;
}
