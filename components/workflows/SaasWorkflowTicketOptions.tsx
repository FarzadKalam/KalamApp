import { useEffect, useState } from 'react';
import { Alert } from 'antd';
import { supabase } from '../../supabaseClient';
import AdaptiveSelectField from '../AdaptiveSelectField';
import SaasTicketRecipientPicker from '../saas/SaasTicketRecipientPicker';

type Option = { value: string; label: string };
export default function SaasWorkflowTicketOptions({ config, disabled, onChange }: {
  config: Record<string, any>;
  disabled?: boolean;
  onChange: (patch: Record<string, any>) => void;
}) {
  const [search, setSearch] = useState('');
  const [organizations, setOrganizations] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.resolve(supabase.rpc('support_list_categories')).then(({ data, error }) => {
      if (!active) return;
      if (error) setFailed(true);
      else setCategories((Array.isArray(data) ? data : []).map((row) => ({ value: row.code, label: row.title })));
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void Promise.resolve(supabase.rpc('saas_workflow_customer_organizations', { p_search: search || null })).then(({ data, error }) => {
        if (!active) return;
        if (error) setFailed(true);
        else setOrganizations((Array.isArray(data) ? data : []).map((row) => ({ value: row.id, label: row.name })));
      }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);
  const fixedTenant = config.ticket_picker_tenant;
  const organizationOptions = fixedTenant && !organizations.some((option) => option.value === fixedTenant)
    ? [...organizations, { value: fixedTenant, label: 'سازمان انتخاب‌شده' }] : organizations;
  return <div className="space-y-2">
    <label className="block">دسته‌بندی تیکت
      <AdaptiveSelectField aria-label="دسته‌بندی تیکت" className="w-full" options={categories}
        value={config.ticket_category || undefined} disabled={disabled} placeholder="انتخاب دسته‌بندی"
        onChange={(value) => onChange({ ticket_category: value })} />
    </label>
    <label className="block">سازمان برای انتخاب کاربران مشخص
      <AdaptiveSelectField aria-label="سازمان برای انتخاب کاربران مشخص" className="w-full" options={organizationOptions}
        allowClear showSearch filterOption={false} loading={loading} value={fixedTenant} disabled={disabled}
        placeholder="برای گردش کار عمومی خالی بگذارید" onSearch={setSearch}
        onChange={(value) => onChange({ ticket_picker_tenant: value || null, ticket_recipients: ['default'] })} />
    </label>
    <SaasTicketRecipientPicker tenantId={fixedTenant} value={config.ticket_recipients} disabled={disabled}
      onChange={(value) => onChange({ ticket_recipients: value })} />
    {failed ? <Alert showIcon type="error" message="دریافت تنظیمات تیکت ناموفق بود." /> : null}
  </div>;
}
