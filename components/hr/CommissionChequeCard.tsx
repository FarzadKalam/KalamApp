import React, { useEffect, useState } from 'react';
import { Tag } from 'antd';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { getSelectedOrganizationId } from '../../utils/organizationContext';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';

/** Financial amounts remain the saved snapshot; identification/status come from the cheque register. */
export default function CommissionChequeCard({ cheque, formatMoney }: {
  cheque: any; formatMoney: (amount: number) => React.ReactNode;
}) {
  const [record, setRecord] = useState<any>(null);
  const orgId = getSelectedOrganizationId();
  const id = cheque.cheque_id || cheque.spent_cheque_id;
  const number = cheque.cheque_number || cheque.serial_no;
  useEffect(() => {
    let active = true;
    setRecord(null);
    if (!id && !number) return;
    let query = supabase.from('cheques').select('id, serial_no, status, due_date').limit(2);
    query = id ? query.eq('id', id) : query.eq('serial_no', number);
    if (orgId) query = query.eq('org_id', orgId);
    void query.then(({ data, error }) => {
      if (active && !error && data?.length === 1) setRecord(data[0]);
    });
    return () => { active = false; };
  }, [orgId, id, number]);
  const chequeId = record?.id || id;
  const status = record?.status || cheque.cheque_status || cheque.status;
  const options = (MODULES.cheques?.fields.find(field => field.key === 'status')?.options || []) as {value: string; label: string; color?: string}[];
  const option = options.find(item => item.value === status);
  const dueDate = record?.due_date || cheque.due_date || cheque.maturity_date;
  const label = `چک ${toPersianNumber(record?.serial_no || number || 'بدون شماره')}`;
  return <div className="bg-white dark:bg-gray-900 border border-orange-200 dark:border-orange-700 rounded-md px-3 py-2 text-xs space-y-1 min-w-[180px]">
    {chequeId ? <a className="font-bold hover:underline" href={`/cheques/${encodeURIComponent(chequeId)}`} target="_blank" rel="noopener noreferrer">{label}</a> : <div className="font-bold">{label}</div>}
    {cheque.bank_name && <div>بانک: {cheque.bank_name}</div>}
    <div>مبلغ: <span className="persian-number font-bold">{formatMoney(Number(cheque.amount) || 0)}</span></div>
    <div>سررسید: <span className="persian-number">{dueDate ? toPersianNumber(safeJalaliFormat(dueDate, 'YYYY/MM/DD')) : 'ثبت نشده'}</span></div>
    <div>وضعیت: <Tag color={option?.color || 'default'}>{option?.label || 'نامشخص'}</Tag></div>
  </div>;
}
