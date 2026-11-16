import { supabase } from '../supabaseClient';
import { hydrateCommissionReceiptCheques } from './commissionRuntime';

const pages = async (read: (start: number, end: number) => PromiseLike<{data: any[] | null; error: any}>) => {
  const rows: any[] = [];
  for (;;) {
    const {data, error} = await read(rows.length, rows.length + 249);
    if (error) throw error;
    if (!data?.length) return rows;
    rows.push(...data);
    if (data.length < 250) return rows;
  }
};
const chunks = (ids: string[]) => Array.from({length: Math.ceil(ids.length / 40)}, (_, index) => ids.slice(index * 40, index * 40 + 40));

/** Read all relevant invoice dates: current receipts and cheque maturities may belong to older sales. RLS applies to every query. */
export async function loadCommissionPeriodInvoices(assigneeIds: string[]) {
  const invoices: any[] = [];
  for (const ids of chunks([...new Set(assigneeIds)].filter(Boolean))) {
    invoices.push(...await pages((start, end) => supabase.from('invoices')
      .select('id,name,status,invoice_date,total_invoice_amount,assignee_id,invoiceItems,payments')
      .in('assignee_id', ids).order('id').range(start, end)));
  }
  const operations: any[] = [];
  for (const ids of chunks(invoices.map(invoice => invoice.id))) {
    operations.push(...await pages((start, end) => supabase.from('cash_bank_operations')
      .select('id,sales_invoice_id,operation_type,operation_date,payment_type,status,cheque_id,amount')
      .in('sales_invoice_id', ids).neq('operation_type','payment').neq('operation_type','transfer')
      .order('id').range(start, end)));
  }
  const chequeIds = [...new Set([...invoices.flatMap(invoice => invoice.payments || []), ...operations]
    .map(payment => payment.cheque_id || payment.spent_cheque_id).filter(Boolean))] as string[];
  const cheques: any[] = [];
  for (const ids of chunks(chequeIds)) cheques.push(...await pages((start, end) => supabase.from('cheques')
    .select('id,status,cleared_at,spent_date,due_date,amount,serial_no').in('id',ids).order('id').range(start,end)));
  const productIds = [...new Set(invoices.flatMap(invoice => invoice.invoiceItems || []).map(item => item.product_id)
    .filter(id => typeof id === 'string' && /^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i.test(id)))] as string[];
  const rates = new Map<string, any>();
  for (const ids of chunks(productIds)) {
    for (const table of ['products','billboards']) {
      const rows = await pages((start,end) => supabase.from(table).select('id,commission_percentage').in('id',ids).order('id').range(start,end));
      rows.forEach(row => rates.set(row.id,row));
    }
  }
  return invoices.map(invoice => {
    const hydrated = hydrateCommissionReceiptCheques(invoice.payments || [], operations.filter(op => op.sales_invoice_id === invoice.id)
      .map(op => ({...op, _cash_bank_operation_id:op.id, date:op.operation_date})), cheques);
    if (hydrated.issues.length) throw new Error('اطلاعات برخی چک‌ها برای جمع‌بندی کامل نیست؛ وضعیت و تاریخ وصول را بررسی کنید.');
    return {...invoice, invoiceItems: (invoice.invoiceItems || []).map((item: any) => ({...item,
      commission_percentage: item.commission_percentage ?? rates.get(item.product_id)?.commission_percentage})),
      payments: hydrated.payments.map(payment => {
        const cheque = cheques.find(row => row.id === (payment.cheque_id || payment.spent_cheque_id));
        return cheque ? {...payment, cheque_amount:cheque.amount, due_date:cheque.due_date || payment.cheque_due_date || payment.due_date, cheque_number:cheque.serial_no} : payment;
      })};
  });
}
