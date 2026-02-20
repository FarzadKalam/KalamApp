import type { SupabaseClient } from '@supabase/supabase-js';
import { applyInventoryDeltas, syncMultipleProductsStock } from './inventoryTransactions';

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isFinalStatus = (status: any) => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'final' || normalized === 'completed';
};

const getInvoiceDirection = (moduleId: string) => {
  return moduleId === 'purchase_invoices' ? 'purchase' : 'sale';
};

interface ApplyInvoiceFinalizationParams {
  supabase: SupabaseClient;
  moduleId: string;
  recordId: string;
  previousStatus?: string | null;
  nextStatus?: string | null;
  invoiceItems: any[];
  userId?: string | null;
}

export const applyInvoiceFinalizationInventory = async ({
  supabase,
  moduleId,
  recordId,
  previousStatus,
  nextStatus,
  invoiceItems,
  userId,
}: ApplyInvoiceFinalizationParams) => {
  if (!recordId) return { applied: false };
  if (!isFinalStatus(nextStatus)) return { applied: false };
  if (isFinalStatus(previousStatus)) return { applied: false };

  const direction = getInvoiceDirection(moduleId);
  const transferType = direction === 'purchase' ? 'purchase_invoice' : 'sales_invoice';

  const { data: existingTransfers, error: existingError } = await supabase
    .from('stock_transfers')
    .select('id')
    .eq('invoice_id', recordId)
    .limit(1);
  if (existingError) throw existingError;
  if ((existingTransfers || []).length > 0) {
    return { applied: false, skipped: 'already_applied' as const };
  }

  const rows = Array.isArray(invoiceItems) ? invoiceItems : [];
  if (rows.length === 0) {
    return { applied: false };
  }

  const deltas: Array<{ productId: string; shelfId: string; delta: number }> = [];
  const transfersPayload: any[] = [];
  const affectedProductIds: string[] = [];

  rows.forEach((item: any, index: number) => {
    const productId = item?.product_id ? String(item.product_id) : '';
    const shelfIdRaw = item?.source_shelf_id || item?.shelf_id || item?.selected_shelf_id || null;
    const shelfId = shelfIdRaw ? String(shelfIdRaw) : '';
    const qty = Math.abs(toNumber(item?.quantity ?? item?.qty ?? item?.count));

    if (!productId || qty <= 0) return;
    if (!shelfId) {
      throw new Error(`در ردیف ${index + 1} قفسه انتخاب نشده است.`);
    }

    affectedProductIds.push(productId);

    if (direction === 'purchase') {
      deltas.push({ productId, shelfId, delta: qty });
      transfersPayload.push({
        transfer_type: transferType,
        product_id: productId,
        delivered_qty: qty,
        required_qty: qty,
        invoice_id: recordId,
        production_order_id: null,
        from_shelf_id: null,
        to_shelf_id: shelfId,
        sender_id: userId || null,
        receiver_id: userId || null,
      });
      return;
    }

    deltas.push({ productId, shelfId, delta: -qty });
    transfersPayload.push({
      transfer_type: transferType,
      product_id: productId,
      delivered_qty: qty,
      required_qty: qty,
      invoice_id: recordId,
      production_order_id: null,
      from_shelf_id: shelfId,
      to_shelf_id: null,
      sender_id: userId || null,
      receiver_id: userId || null,
    });
  });

  if (deltas.length === 0) return { applied: false };

  await applyInventoryDeltas(supabase, deltas);

  const { error: insertError } = await supabase
    .from('stock_transfers')
    .insert(transfersPayload);
  if (insertError) throw insertError;

  await syncMultipleProductsStock(supabase, affectedProductIds);
  return { applied: true, affectedProducts: Array.from(new Set(affectedProductIds)) };
};

