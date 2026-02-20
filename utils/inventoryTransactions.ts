import type { SupabaseClient } from '@supabase/supabase-js';
import { convertArea, type UnitValue } from './unitConversions';

export interface InventoryDelta {
  productId: string;
  shelfId: string;
  delta: number;
}

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const aggregateInventoryDeltas = (deltas: InventoryDelta[]) => {
  const map = new Map<string, number>();
  deltas.forEach((item) => {
    if (!item?.productId || !item?.shelfId) return;
    const qty = toNumber(item.delta);
    if (!qty) return;
    const key = `${item.productId}:${item.shelfId}`;
    map.set(key, (map.get(key) || 0) + qty);
  });
  return map;
};

export const applyInventoryDeltas = async (supabase: SupabaseClient, deltas: InventoryDelta[]) => {
  const aggregated = aggregateInventoryDeltas(deltas);
  for (const [key, delta] of aggregated.entries()) {
    const [productId, shelfId] = key.split(':');
    if (!productId || !shelfId) continue;

    const { data: existing, error: existingError } = await supabase
      .from('product_inventory')
      .select('id, stock, warehouse_id')
      .eq('product_id', productId)
      .eq('shelf_id', shelfId)
      .maybeSingle();

    if (existingError) throw existingError;

    const currentStock = toNumber(existing?.stock);
    const nextStock = currentStock + delta;
    if (nextStock < 0) {
      throw new Error('موجودی قفسه کافی نیست');
    }

    const payload: any = {
      product_id: productId,
      shelf_id: shelfId,
      stock: nextStock,
    };
    if (existing?.warehouse_id !== undefined) {
      payload.warehouse_id = existing.warehouse_id;
    }

    const { error: upsertError } = await supabase
      .from('product_inventory')
      .upsert(payload, { onConflict: 'product_id,shelf_id' });

    if (upsertError) throw upsertError;
  }
};

export const syncSingleProductStock = async (supabase: SupabaseClient, productId: string) => {
  const { data: rows, error } = await supabase
    .from('product_inventory')
    .select('stock')
    .eq('product_id', productId);
  if (error) throw error;

  const totalStock = (rows || []).reduce((sum: number, row: any) => sum + toNumber(row?.stock), 0);
  const { data: productRow } = await supabase
    .from('products')
    .select('main_unit, sub_unit')
    .eq('id', productId)
    .maybeSingle();
  const mainUnit = productRow?.main_unit as UnitValue | undefined;
  const subUnit = productRow?.sub_unit as UnitValue | undefined;
  const subStock = mainUnit && subUnit ? convertArea(totalStock, mainUnit, subUnit) : 0;
  const { error: updateError } = await supabase
    .from('products')
    .update({ stock: totalStock, sub_stock: subStock })
    .eq('id', productId);
  if (updateError) throw updateError;
};

export const syncMultipleProductsStock = async (supabase: SupabaseClient, productIds: string[]) => {
  const unique = Array.from(new Set((productIds || []).filter(Boolean)));
  for (const productId of unique) {
    await syncSingleProductStock(supabase, productId);
  }
};
