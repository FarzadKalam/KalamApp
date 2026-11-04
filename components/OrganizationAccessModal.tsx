import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Modal, Space, Spin, Tag } from 'antd';
import { supabase } from '../supabaseClient';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { getInternalAppUrl } from '../utils/hostRouting';

type OrganizationAccess = { org_id: string; org_name: string; role_name: string; resolved_host?: string | null };

export default function OrganizationAccessModal({ open, onClose, currentOrgId }: {
  open: boolean; onClose: () => void; currentOrgId?: string | null;
}) {
  const [items, setItems] = useState<OrganizationAccess[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setError(''); setItems([]);
    void (async () => {
      try {
        const { data, error: failure } = await supabase.rpc('get_current_user_organization_accesses');
        if (failure) throw failure;
        if (active) setItems(Array.isArray(data) ? data : []);
      } catch (failure) {
        if (active) setError(toFaErrorMessage(failure, 'دریافت سازمان‌های شما ناموفق بود.'));
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [open, attempt]);
  return <Modal title="سازمان‌های من" open={open} onCancel={onClose} footer={null}>
    <Alert className="mb-4" type="info" showIcon message="نقش شما در هر سازمان مستقل است."
      description="سازمان دیگر در تب تازه باز می‌شود. اگر در آن آدرس وارد نشده باشید، شمارهٔ خود را تأیید کنید؛ تب فعلی تغییری نمی‌کند." />
    {loading ? <div className="p-6 text-center"><Spin aria-label="در حال دریافت سازمان‌ها" /></div> : error ?
      <Alert type="error" message={error} action={<Button onClick={() => setAttempt(value => value + 1)}>تلاش دوباره</Button>} /> :
      <Space direction="vertical" className="w-full">{items.map(item => {
        const host = String(item.resolved_host || '').trim().toLowerCase();
        const safeHost = /^[a-z0-9-]+\.tazesystem\.ir$/.test(host);
        const href = host ? (safeHost ? `https://${host}/login` : null) : `${getInternalAppUrl()}/login`;
        return <div key={item.org_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <div><div className="font-bold">{item.org_name}</div><div className="text-sm">نقش شما: {item.role_name}</div></div>
          {item.org_id === currentOrgId ? <Tag color="blue">سازمان فعلی</Tag> :
            <Button href={href || undefined} disabled={!href} target="_blank" rel="noopener noreferrer">ورود به سازمان</Button>}
        </div>;
      })}{!items.length && <Empty description="عضویت فعالی پیدا نشد." />}</Space>}
  </Modal>;
}
