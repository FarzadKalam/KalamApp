import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../supabaseClient';
import { fetchCurrentUserRoleContext } from '../../utils/permissions';
import { getCommissionInvoiceFinancials, hydrateCommissionReceiptCheques } from '../../utils/commissionRuntime';
import { getSelectedOrganizationId } from '../../utils/organizationContext';

export default function CommissionInvoiceFinancials({ row, formatMoney, field }: {
  row: Record<string, any>; formatMoney: (value: number) => string;
  field?: 'invoice_total_amount' | 'invoice_verified_received_amount' | 'invoice_future_base_amount';
}) {
  const needsRecovery = row.invoice_verified_received_amount == null || row.invoice_total_amount == null;
  const context = useQuery(['commission-financial-org', getSelectedOrganizationId()], () => fetchCurrentUserRoleContext(supabase), { enabled: needsRecovery });
  const orgId = context.data?.orgId;
  const recovered = useQuery(['commission-invoice-financials', orgId, row.invoice_id, row.source_period_end], async () => {
    const { data: invoice, error } = await supabase.from('invoices').select('id,total_invoice_amount,invoiceItems,payments')
      .eq('org_id', orgId!).eq('id', row.invoice_id).single();
    if (error) throw error;
    const operations: any[] = [];
    if (!invoice.payments?.length) {
      for (let start = 0; ; start += 250) {
        const result = await supabase.from('cash_bank_operations')
          .select('id,operation_date,payment_type,status,cheque_id,amount')
          .eq('org_id', orgId!).eq('sales_invoice_id', row.invoice_id).neq('operation_type', 'payment').neq('operation_type', 'transfer')
          .order('id').range(start, start + 249);
        if (result.error) throw result.error;
        operations.push(...(result.data || []).map(op => ({ ...op, date: op.operation_date })));
        if ((result.data || []).length < 250) break;
      }
    }
    const ids = [...new Set([...(invoice.payments || []), ...operations].map((p: any) => p.cheque_id || p.spent_cheque_id).filter(Boolean))] as string[];
    const cheques: any[] = [];
    for (let index = 0; index < ids.length; index += 100) {
      const result = await supabase.from('cheques').select('id,status,cleared_at,spent_date')
        .eq('org_id', orgId!).in('id', ids.slice(index, index + 100));
      if (result.error) throw result.error;
      cheques.push(...(result.data || []));
    }
    const hydrated = hydrateCommissionReceiptCheques(invoice.payments, operations, cheques);
    if (hydrated.issues.length) throw new Error('اطلاعات وصول کامل نیست.');
    return getCommissionInvoiceFinancials({ ...invoice, payments: hydrated.payments }, row.source_period_end);
  }, { enabled: Boolean(needsRecovery && orgId && row.invoice_id && row.source_period_end), staleTime: 60000 });
  const values: Record<string, any> | undefined = needsRecovery ? recovered.data : row;
  const renderValue = (key: string) => values?.[key] == null
    ? recovered.isError || context.isError ? 'بازیابی ناموفق' : recovered.isFetching || context.isFetching ? 'در حال دریافت…' : 'در سابقه ثبت نشده'
    : formatMoney(Number(values[key]));
  if (field) return <span className="persian-number" title={needsRecovery ? 'بازسازی از اطلاعات فعلی فاکتور و وصول‌ها تا پایان دوره' : undefined}>{renderValue(field)}</span>;
  return <div className="flex flex-wrap gap-x-5 gap-y-2 px-4 py-2 text-xs border-t border-gray-200 dark:border-gray-700">
    {[
      ['جمع مبلغ فاکتور', 'invoice_total_amount'],
      ['جمع وصول‌شده تا پایان دوره', 'invoice_verified_received_amount'],
      ['ماندهٔ مبلغ برای ماه‌های بعد', 'invoice_future_base_amount'],
    ].map(([label, key]) => <span key={label}>{label}: <strong className="persian-number">
      {renderValue(key)}
    </strong></span>)}
    {needsRecovery && recovered.data && <span className="text-gray-500">بازسازی از اطلاعات فعلی تا پایان دوره</span>}
  </div>;
}
