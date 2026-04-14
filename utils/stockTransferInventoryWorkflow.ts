import type { SupabaseClient } from '@supabase/supabase-js';
import { applyInventoryDeltas, syncMultipleProductsStock } from './inventoryTransactions';

const FINAL_STATUSES = new Set(['issued', 'received', 'closed']);
const OPERATIONAL_TRANSFER_TYPES = new Set([
  'issue',
  'receipt',
  'transfer',
  'return',
  'inventory_count',
  'opening_balance',
  'waste',
]);

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalize = (value: any) => String(value || '').trim().toLowerCase();

const getQuantity = (record: any) => {
  const delivered = toNumber(record?.delivered_qty);
  if (delivered) return Math.abs(delivered);
  const required = toNumber(record?.required_qty);
  return required ? Math.abs(required) : 0;
};

const isFinalStatus = (status: any) => FINAL_STATUSES.has(normalize(status));

export const shouldApplyStockTransferInventory = (record: any) => {
  const transferType = normalize(record?.transfer_type);
  if (!OPERATIONAL_TRANSFER_TYPES.has(transferType)) return false;
  if (record?.invoice_id || record?.purchase_invoice_id || record?.production_order_id) return false;
  if (!isFinalStatus(record?.status)) return false;
  if (record?.inventory_applied_at) return false;
  return true;
};

type ApplyStockTransferInventoryParams = {
  supabase: SupabaseClient;
  recordId: string;
  previousStatus?: string | null;
  nextStatus?: string | null;
  recordData?: Record<string, any> | null;
  userId?: string | null;
};

export const applyStockTransferInventory = async ({
  supabase,
  recordId,
  previousStatus,
  nextStatus,
  recordData,
  userId,
}: ApplyStockTransferInventoryParams) => {
  if (!recordId) return { applied: false };
  if (!isFinalStatus(nextStatus)) return { applied: false };
  if (isFinalStatus(previousStatus)) return { applied: false };

  let record = recordData || null;
  if (!record || !record.product_id) {
    const { data, error } = await supabase
      .from('stock_transfers')
      .select('*')
      .eq('id', recordId)
      .maybeSingle();
    if (error) throw error;
    record = data || null;
  }

  if (!record || !shouldApplyStockTransferInventory(record)) return { applied: false };

  const transferType = normalize(record.transfer_type);
  const productId = String(record.product_id || '').trim();
  const fromShelfId = String(record.from_shelf_id || '').trim();
  const toShelfId = String(record.to_shelf_id || '').trim();
  const qty = getQuantity(record);

  if (!productId || qty <= 0) return { applied: false };

  const deltas: Array<{ productId: string; shelfId: string; delta: number }> = [];
  if (transferType === 'issue' || transferType === 'waste') {
    if (!fromShelfId) throw new Error('برای حواله خروج، قفسه برداشت الزامی است');
    deltas.push({ productId, shelfId: fromShelfId, delta: -qty });
  } else if (transferType === 'receipt' || transferType === 'return' || transferType === 'opening_balance') {
    if (!toShelfId) throw new Error('برای رسید ورود، قفسه ورود الزامی است');
    deltas.push({ productId, shelfId: toShelfId, delta: qty });
  } else if (transferType === 'transfer') {
    if (!fromShelfId || !toShelfId) throw new Error('برای انتقال، قفسه برداشت و قفسه ورود الزامی است');
    deltas.push({ productId, shelfId: fromShelfId, delta: -qty });
    deltas.push({ productId, shelfId: toShelfId, delta: qty });
  } else if (transferType === 'inventory_count') {
    const deltaQty = toNumber(record?.metadata?.delta_qty ?? record?.metadata?.adjustment_qty);
    const shelfId = toShelfId || fromShelfId;
    if (!shelfId || !deltaQty) return { applied: false };
    deltas.push({ productId, shelfId, delta: deltaQty });
  }

  if (deltas.length === 0) return { applied: false };

  await applyInventoryDeltas(supabase, deltas, { allowNegative: false });

  const { error: updateError } = await supabase
    .from('stock_transfers')
    .update({
      inventory_applied_at: new Date().toISOString(),
      inventory_applied_by: userId || null,
    })
    .eq('id', recordId);
  if (updateError) throw updateError;

  await syncMultipleProductsStock(supabase, [productId]);
  return { applied: true, affectedProducts: [productId] };
};
