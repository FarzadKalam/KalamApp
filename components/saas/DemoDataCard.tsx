import { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Modal, Space, Spin, Typography } from 'antd';
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { clearCurrentOrgDemoData, getCurrentOrgDemoSeedStatus, seedCurrentOrgDemoData, getDemoDataAdminErrorMessage, type DemoDataAdminStatus } from '../../utils/demoDataAdmin';
import { fetchSessionBootstrap } from '../../utils/sessionCache';
import { supabase } from '../../supabaseClient';

export default function DemoDataCard() {
  const { message } = App.useApp();
  const [status, setStatus] = useState<DemoDataAdminStatus>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setStatus(undefined); setAllowed(false);
    void (async () => {
      try {
        const context = await fetchSessionBootstrap(supabase);
        const accountPermission = context.permissions?.__settings_tabs || {};
        const canManage = ['super_admin', 'admin', 'manager'].includes(String(context.profile?.role || '').toLowerCase())
          && accountPermission.view !== false && accountPermission.edit !== false && accountPermission.fields?.account !== false;
        if (!active) return;
        setActiveOrgId(context.orgId);
        setAllowed(canManage);
        if (!canManage) return;
        const result = await getCurrentOrgDemoSeedStatus({ orgId: context.orgId });
        if (active) setStatus(result);
      } catch (err) {
        if (active) setError(getDemoDataAdminErrorMessage(err, 'دریافت وضعیت داده‌های نمونه ناموفق بود.'));
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [attempt]);

  const run = async (clear: boolean) => {
    setBusy(true);
    try {
      const options = { orgId: activeOrgId };
      const result = clear ? await clearCurrentOrgDemoData(options) : await seedCurrentOrgDemoData(options);
      if (result.status === 'seed_failed' || result.status === 'failed') throw new Error(result.warning || 'ساخت داده‌های نمونه کامل نشد.');
      if (result.warning) message.warning(result.warning);
      message.success(clear ? 'داده‌های نمونه حذف شد.' : 'داده‌های نمونه آماده شد.');
      setConfirm(false);
      // Clears every module's record/runtime cache, including data in open drawers.
      window.location.reload();
    } catch (err) {
      message.error(getDemoDataAdminErrorMessage(err, 'مدیریت داده‌های نمونه ناموفق بود.'));
      setAttempt(value => value + 1);
    } finally { setBusy(false); }
  };
  if (!loading && !allowed && !error) return null;
  if (!loading && status && !status.is_demo && !status.has_seeded_batch) return null;
  return <Card title="داده‌های نمونه برای شروع کار">
    {loading ? <Spin /> : error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => setAttempt(value => value + 1)}>تلاش دوباره</Button>} /> : <Space direction="vertical" size="middle" className="w-full">
      <Typography.Paragraph className="!mb-0">نمونه‌های مرتبط فروش، مشتریان، کالا و خدمات، پروژه و منابع انسانی کمک می‌کنند مسیر کار در برنامه را تجربه کنید.</Typography.Paragraph>
      {status?.has_seeded_batch ? <>
        <Typography.Text>داده‌های نمونه در این حساب وجود دارد؛ ویرایش آن‌ها باعث خروج از مجموعهٔ نمونه نمی‌شود.</Typography.Text>
        {status.status !== 'seeded' && <Alert type="warning" showIcon message="ساخت داده‌های نمونه کامل نشده است. پس از پایان عملیات می‌توانید داده‌های قبلی را حذف و دوباره بسازید." />}
        <Button danger icon={<DeleteOutlined />} loading={busy} onClick={() => setConfirm(true)}>حذف داده‌های دمو</Button>
      </> : <Button icon={<ReloadOutlined />} loading={busy} onClick={() => void run(false)}>افزودن داده‌های نمونه</Button>}
    </Space>}
    <Modal title="حذف داده‌های دمو" open={confirm} onCancel={() => !busy && setConfirm(false)} onOk={() => void run(true)} okText="حذف همه داده‌های نمونه" cancelText="انصراف" okButtonProps={{ danger: true, loading: busy }} cancelButtonProps={{ disabled: busy }} closable={!busy} maskClosable={!busy}>
      <p className="leading-8">همهٔ رکوردهایی که ابتدا به‌عنوان نمونه ساخته شده‌اند حذف می‌شوند، حتی اگر آن‌ها را ویرایش کرده باشید. این کار قابل بازگشت نیست.</p>
      <p className="leading-8">اطلاعاتی که خودتان ساخته‌اید جزو این مجموعه نیست. اگر حذف نمونه باعث حذف اطلاعات جدید شما شود، عملیات متوقف می‌شود تا ابتدا ارتباط آن‌ها را جدا کنید.</p>
    </Modal>
  </Card>;
}
