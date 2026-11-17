import { useEffect, useState } from 'react';
import { Alert } from 'antd';
import { supabase } from '../../supabaseClient';
import AdaptiveSelectField from '../AdaptiveSelectField';

type Option = { value: string; label: string };
const defaultOption = { value: 'default', label: 'مطابق دسترسی کاربران سازمان' };
const ownerOption = { value: 'owner', label: 'مالک سازمان (در زمان اجرا)' };

export default function SaasTicketRecipientPicker({ tenantId, value, onChange, disabled }: {
  tenantId?: string;
  value?: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setOptions([]);
    setFailed(false);
    if (!tenantId) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { data, error } = await supabase.rpc('support_list_outgoing_recipients', {
            p_tenant: tenantId, p_search: search || null,
          });
          if (error) throw error;
          if (!active) return;
          setOptions((Array.isArray(data) ? data : []).map((row) => ({
            value: String(row.user_id),
            label: `${row.display_name} · ${row.is_owner ? 'مالک · ' : ''}${row.role_title}`,
          })));
        } catch {
          if (active) setFailed(true);
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [tenantId, search]);
  const selected = value?.length ? value : ['default'];
  const renderedOptions = [defaultOption, ...options, ownerOption];
  selected.forEach((id) => {
    if (!renderedOptions.some((option) => option.value === id)) renderedOptions.push({ value: id, label: 'گیرندهٔ انتخاب‌شده' });
  });
  return <div className="space-y-2">
    <AdaptiveSelectField aria-label="گیرندگان تیکت" className="w-full" mode="multiple" showSearch filterOption={false}
      loading={loading} disabled={disabled} optionLabelProp="label" maxTagCount="responsive"
      value={selected} options={renderedOptions} onSearch={setSearch}
      onChange={(ids: string[]) => {
        if (ids.length === 0 || (ids.includes('default') && !selected.includes('default'))) onChange(['default']);
        else onChange(ids.length > 1 ? ids.filter((id) => id !== 'default') : ids);
      }} />
    {failed ? <Alert showIcon type="error" message="فهرست گیرندگان دریافت نشد. دوباره جست‌وجو کنید." /> : null}
  </div>;
}
