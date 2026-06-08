import { SupabaseClient } from '@supabase/supabase-js';
import {
  expandInvoiceAllocationRows,
  InvoiceAllocationAmount,
  InvoicePaymentAllocationModule,
  InvoicePaymentOverflowPlan,
} from './invoicePaymentAllocation';
import { syncInvoicePaymentOperations } from './invoicePaymentOperationSync';
import { runWorkflowsForEvent } from './workflowRuntime';

export const applyInvoicePaymentAllocation = async (args: {
  supabase: SupabaseClient;
  moduleId: InvoicePaymentAllocationModule;
  sourceInvoiceId: string;
  sourceRowKey: string;
  sourcePayments: Record<string, any>[];
  allocationGroupKey: string;
  allocations: InvoiceAllocationAmount[];
  plan: InvoicePaymentOverflowPlan;
}) => {
  const allocationRows = expandInvoiceAllocationRows(
    args.allocations,
    args.plan.segments,
    args.allocationGroupKey
  );
  const { data, error } = await args.supabase.rpc('allocate_invoice_payment_excess', {
    p_module_id: args.moduleId,
    p_source_invoice_id: args.sourceInvoiceId,
    p_source_row_key: args.sourceRowKey,
    p_source_payments: args.sourcePayments,
    p_allocations: allocationRows,
  });
  if (error) throw error;
  const changedRows = Array.isArray(data) ? data : [];
  const invoiceIds = changedRows
    .map((row: any) => String(row?.invoice_id || '').trim())
    .filter(Boolean);
  await syncInvoicePaymentOperations({
    supabase: args.supabase,
    moduleId: args.moduleId,
    invoiceIds,
  });
  for (const invoiceId of invoiceIds.filter((id) => id !== args.sourceInvoiceId)) {
    const { data: targetInvoice, error: targetError } = await args.supabase
      .from(args.moduleId)
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (targetInvoice) {
      await runWorkflowsForEvent({
        moduleId: args.moduleId,
        event: 'upsert',
        currentRecord: targetInvoice as Record<string, any>,
      });
    }
  }
  return changedRows;
};
