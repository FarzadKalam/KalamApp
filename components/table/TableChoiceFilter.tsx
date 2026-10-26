import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Space } from 'antd';
import AdaptiveSelectField from '../AdaptiveSelectField';
import { supabase } from '../../supabaseClient';
import { fetchRelationOptionsForField } from '../../utils/relationOptions';
import { getFieldLabelFa } from '../../utils/fieldLabel';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

const normalizeSearch = (value: unknown) => String(value ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim().toLowerCase();

export const TableChoiceFilter: React.FC<any> = ({ field, moduleId, options = [], selectedKeys, setSelectedKeys, confirm, clearFilters, close }) => {
  const [search, setSearch] = useState('');
  const [remoteOptions, setRemoteOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(50);
  const request = useRef(0);
  const relationConfig = field.multiRelationConfig || field.relationConfig || (field.type === 'user' ? { targetModule: 'profiles', targetField: 'full_name' } : null);
  const remote = ['relation', 'multi_relation', 'user'].includes(field.type) && !!relationConfig?.targetModule;
  const signature = JSON.stringify(relationConfig);
  useEffect(() => {
    if (!remote) return;
    const current = ++request.current;
    setLoading(true);
    setRemoteOptions([]);
    const timer = window.setTimeout(() => {
      fetchRelationOptionsForField(supabase, { ...field, relationConfig }, { search, limit })
        .then((rows) => { if (request.current === current) { setRemoteOptions(rows || []); setError(''); } })
        .catch((reason) => { if (request.current === current) setError(toFaErrorMessage(reason)); })
        .finally(() => { if (request.current === current) setLoading(false); });
    }, search ? 280 : 0);
    return () => { window.clearTimeout(timer); ++request.current; };
  }, [remote, signature, search, limit]);
  const choices = useMemo(() => {
    const selected = new Set((selectedKeys || []).map(String));
    const seed = options.filter((option: any) => selected.has(String(option.value)) || !search || normalizeSearch(option.label || option.text).includes(normalizeSearch(search)));
    return Array.from(new Map([...seed, ...remoteOptions].map((option: any) => [String(option.value), { ...option, label: option.label || option.text }])).values());
  }, [options, remoteOptions, search, selectedKeys]);
  return <div className="smarttable-choice-filter" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
    <div className="mb-2 text-xs text-gray-500">فیلتر {getFieldLabelFa(field, { moduleId })}</div>
    {error ? <Alert type="error" message={error} className="mb-2" /> : null}
    <AdaptiveSelectField mode="multiple" value={selectedKeys} options={choices} onChange={(values) => setSelectedKeys(values || [])}
      loading={loading} allowClear showSearch placeholder="انتخاب یا جستجو…" className="w-full"
      mobileSearchPlaceholder="جستجو در همهٔ رکوردها…"
      filterOption={remote ? false : undefined}
      onSearch={remote ? (value) => { setSearch(value); setLimit(50); } : undefined}
      notFoundContent={loading ? 'در حال جستجو…' : 'موردی پیدا نشد'} />
    {remote && remoteOptions.length >= limit && limit < 200 ? <Button type="link" size="small" loading={loading} onClick={() => setLimit((previous) => previous + 50)}>نمایش نتایج بیشتر</Button> : null}
    {remote && remoteOptions.length >= 200 ? <div className="mt-2 text-xs text-gray-500">برای محدودکردن نتایج، نام دقیق‌تری بنویسید.</div> : null}
    <Space className="mt-3"><Button type="primary" size="small" onClick={() => confirm()}>اعمال</Button>
      <Button size="small" onClick={() => { clearFilters?.(); confirm(); }}>حذف</Button>
      <Button type="link" size="small" onClick={() => close()}>بستن</Button></Space>
  </div>;
};

export default TableChoiceFilter;
