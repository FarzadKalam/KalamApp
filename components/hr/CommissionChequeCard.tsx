import React, { useEffect, useState } from 'react';
import { Tag } from 'antd';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { getSelectedOrganizationId } from '../../utils/organizationContext';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { useQuery } from '@tanstack/react-query';
import {getCommissionChequeDisplay,resolveCommissionChequePayment} from '../../utils/commissionChequeDisplay';

/** Financial amounts remain the saved snapshot; identification/status come from the cheque register. */
export default function CommissionChequeCard({ cheque, formatMoney, invoiceId }: {
  cheque: any; invoiceId?: string; formatMoney: (amount: number) => React.ReactNode;
}) {
  const [record, setRecord] = useState<any>(null);
  const [lookupState,setLookupState] = useState<'loading'|'complete'|'unavailable'>('loading');
  const orgId = getSelectedOrganizationId();
  const snapshotDisplay = getCommissionChequeDisplay(cheque);
  const invoiceQuery = useQuery({
    queryKey:['commission-cheque-invoice-payments',orgId,invoiceId],
    enabled:!!invoiceId && !snapshotDisplay.id && !snapshotDisplay.number,
    staleTime:60_000,
    queryFn:async()=>{
      let query=supabase.from('invoices').select('payments').eq('id',invoiceId!);
      if(orgId)query=query.eq('org_id',orgId);
      const {data,error}=await query.maybeSingle();
      if(error)throw error;
      return Array.isArray(data?.payments)?data.payments:[];
    },
  });
  const matched=resolveCommissionChequePayment(cheque,invoiceQuery.data||[]);
  const payment=matched?{...cheque,...matched,amount:cheque.amount}:cheque;
  const display=getCommissionChequeDisplay(payment,record);
  const id = payment.cheque_id || payment.spent_cheque_id;
  const number = payment.cheque_number || payment.serial_no || payment.cheque_serial_no;
  useEffect(() => {
    let active = true;
    setRecord(null);
    setLookupState('loading');
    if (!id && !number) {setLookupState('unavailable');return;}
    let query = supabase.from('cheques').select('id, serial_no, status, due_date').limit(2);
    query = id ? query.eq('id', id) : query.eq('serial_no', number);
    if (orgId) query = query.eq('org_id', orgId);
    void Promise.resolve(query).then(({ data, error }) => {
      if (!active)return;
      if (!error && data?.length === 1) {setRecord(data[0]);setLookupState('complete');}
      else setLookupState('unavailable');
    }).catch(()=>{
      if(active)setLookupState('unavailable');
    });
    return () => { active = false; };
  }, [orgId, id, number]);
  const chequeId = display.id;
  const status = display.status;
  const options = (MODULES.cheques?.fields.find(field => field.key === 'status')?.options || []) as {value: string; label: string; color?: string}[];
  const option = options.find(item => item.value === status);
  const dueDate = display.dueDate;
  const resolving=lookupState==='loading'||invoiceQuery.isFetching;
  const label = `چک ${toPersianNumber(display.number || 'بدون شماره')}`;
  return <div className="bg-white dark:bg-gray-900 border border-orange-200 dark:border-orange-700 rounded-md px-3 py-2 text-xs space-y-1 min-w-[180px]">
    {chequeId ? <a className="font-bold hover:underline" href={`/cheques/${encodeURIComponent(chequeId)}`} target="_blank" rel="noopener noreferrer">{label}</a> : <div className="font-bold">{label}</div>}
    {display.bankName && <div>بانک: {display.bankName}</div>}
    <div>مبلغ: <span className="persian-number font-bold">{formatMoney(Number(cheque.amount) || 0)}</span></div>
    <div>سررسید: <span className="persian-number">{dueDate ? toPersianNumber(safeJalaliFormat(dueDate, 'YYYY/MM/DD')) : resolving ? 'در حال دریافت…' : lookupState==='complete' ? 'ثبت نشده' : 'قابل بازیابی نیست'}</span></div>
    <div>وضعیت: <Tag color={option?.color || 'default'}>{option?.label || 'نامشخص'}</Tag></div>
  </div>;
}
