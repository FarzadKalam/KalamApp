import React, { useEffect, useState } from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import AdaptiveSelectField from '../AdaptiveSelectField';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type Customer = { id: string; name: string; code?: string };
export default function SaasSalesCustomerLink({ tenantId }: { tenantId: string }) {
  const [allowed, setAllowed] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [options, setOptions] = useState<Customer[]>([]);
  const [chosen, setChosen] = useState<string>();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState('');
  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const permission = await supabase.rpc('saas_lifecycle_workflows_allowed');
        if (!current || permission.error || permission.data !== true) return;
        const result = await supabase.rpc('admin_saas_sales_customer', { p_tenant: tenantId });
        if (!current) return;
        setAllowed(true);
        if (result.error) throw result.error;
        setCustomer(result.data || null);
      } catch (error) {
        if (current) setErrorText(toFaErrorMessage(error as any, 'دریافت ارتباط مشتری ناموفق بود.'));
      }
    })();
    return () => { current = false; };
  }, [tenantId]);
  useEffect(() => {
    if (!allowed || customer || search.trim().length < 2) return;
    let current = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { data, error } = await supabase.rpc('admin_search_saas_sales_customers', { p_search: search.trim() });
          if (error) throw error;
          if (current) setOptions((previous) => [...previous.filter((item) => item.id === chosen && !(data || []).some((row: Customer) => row.id === chosen)), ...(data || [])]);
        } catch (error) {
          if (current) setErrorText(toFaErrorMessage(error as any, 'جست‌وجوی مشتری ناموفق بود.'));
        }
      })();
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [allowed, chosen, customer, search]);
  const link = async () => {
    setBusy(true);
    setErrorText('');
    try {
      const { data, error } = await supabase.rpc('admin_saas_sales_customer', {
        p_tenant: tenantId, p_mode: 'resolve', p_customer: chosen || null,
      });
      if (error) throw error;
      if (!data) throw new Error('تطبیق قطعی نیست. مشتری موجود را از فهرست انتخاب کنید.');
      setCustomer(data);
    } catch (error) {
      setErrorText(toFaErrorMessage(error as any, 'اتصال مشتری ناموفق بود.'));
    } finally {
      setBusy(false);
    }
  };
  if (!allowed) return null;
  return <div className="space-y-2">
    <Typography.Text strong>مشتری تازه‌سیستم</Typography.Text>
    {customer ? <div><Link to={`/customers/${customer.id}`}>{customer.name}{customer.code ? ` · ${customer.code}` : ''}</Link></div> : <>
      <AdaptiveSelectField aria-label="مشتری تازه‌سیستم" className="w-full" allowClear showSearch filterOption={false}
        value={chosen} onSearch={setSearch} onChange={setChosen} disabled={busy}
        placeholder="جست‌وجوی مشتری موجود با نام یا کد"
        options={options.map((item) => ({ value: item.id, label: item.code ? `${item.name} · ${item.code}` : item.name }))} />
      <Space wrap><Button loading={busy} onClick={() => void link()}>{chosen ? 'اتصال مشتری منتخب' : 'تطبیق یا ایجاد مشتری'}</Button></Space>
    </>}
    {errorText ? <Alert showIcon type="warning" message={errorText} /> : null}
  </div>;
}
