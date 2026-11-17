import React, { useEffect, useState } from 'react';
import { Alert, Button, InputNumber } from 'antd';
import { supabase } from '../../supabaseClient';
import AdaptiveSelectField from '../AdaptiveSelectField';

type Item = {
  product_id?: string;
  source_module_id?: 'products' | 'product_bundles';
  title?: string;
  quantity: number;
  unit_price: number;
};
type CatalogItem = { id: string; name: string; module_id: Item['source_module_id'] };

export default function SaasWorkflowInvoiceItems({ items, disabled, onChange }: {
  items: Item[];
  disabled?: boolean;
  onChange: (items: Item[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [choices, setChoices] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void Promise.resolve(supabase.rpc('admin_search_saas_invoice_items', { p_search: search.trim() || null }))
        .then(({ data, error }) => {
          if (!current) return;
          if (error) throw error;
          setFailed(false);
          setChoices(Array.isArray(data) ? data : []);
        }).catch(() => { if (current) setFailed(true); })
        .finally(() => { if (current) setLoading(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [search]);
  const patch = (position: number, values: Partial<Item>) =>
    onChange(items.map((item, index) => index === position ? { ...item, ...values } : item));
  return <div className="space-y-2">
    <div className="font-medium">اقلام فاکتور فروش</div>
    {items.map((item, index) => {
      const options = choices.map((row) => ({ value: row.id, label: row.module_id === 'product_bundles' ? `${row.name} · پکیج` : row.name }));
      if (item.product_id && !options.some((row) => row.value === item.product_id)) {
        options.push({ value: item.product_id, label: item.title || 'قلم انتخاب‌شده' });
      }
      return <div key={index} className="grid gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700 sm:grid-cols-4">
        <AdaptiveSelectField aria-label="کالا، خدمت یا پکیج" placeholder="کالا، خدمت یا پکیج" className="w-full"
          value={item.product_id} options={options} disabled={disabled} loading={loading}
          showSearch filterOption={false} onSearch={setSearch}
          onChange={(id) => {
            const selected = choices.find((row) => row.id === id);
            if (selected) patch(index, { product_id: selected.id, source_module_id: selected.module_id, title: selected.name });
          }} />
        <label>تعداد<InputNumber aria-label="تعداد" className="w-full" min={0.01} max={10000} value={item.quantity} disabled={disabled} onChange={(value) => patch(index, { quantity: value ?? 1 })} /></label>
        <label>قیمت واحد به تومان<InputNumber aria-label="قیمت واحد به تومان" className="w-full" min={0} value={item.unit_price} disabled={disabled} onChange={(value) => patch(index, { unit_price: value ?? 0 })} /></label>
        <Button danger disabled={disabled} onClick={() => onChange(items.filter((_, position) => position !== index))}>حذف قلم</Button>
      </div>;
    })}
    <Button disabled={disabled || items.length >= 100} onClick={() => onChange([...items, { quantity: 1, unit_price: 0 }])}>افزودن قلم فاکتور</Button>
    {failed ? <Alert showIcon type="error" message="فهرست اقلام دریافت نشد." /> : null}
  </div>;
}
