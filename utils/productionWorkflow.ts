import { supabase } from '../supabaseClient';
import { convertArea, type UnitValue } from './unitConversions';

export type ProductionMove = {
  product_id: string;
  from_shelf_id: string;
  to_shelf_id: string;
  quantity: number;
};

const ITEM_TABLES = ['items_leather', 'items_lining', 'items_fitting', 'items_accessory'];

const getRowUsage = (row: any) => {
  const raw = row?.usage ?? row?.quantity ?? row?.qty ?? row?.count ?? row?.stock ?? 0;
  const num = parseFloat(raw);
  return Number.isFinite(num) ? num : 0;
};

export const collectProductionMoves = (order: any, productionShelfId: string) => {
  const quantity = parseFloat(order?.quantity || 0);
  const moves: ProductionMove[] = [];
  const missingProduct = [] as string[];
  const missingShelf = [] as string[];

  ITEM_TABLES.forEach((table) => {
    const rows = Array.isArray(order?.[table]) ? order[table] : [];
    rows.forEach((row: any, idx: number) => {
      const productId = row?.selected_product_id || row?.product_id;
      const fromShelfId = row?.selected_shelf_id || row?.shelf_id;
      const usage = getRowUsage(row);
      if (usage <= 0) return;
      if (!productId) {
        missingProduct.push(`${table}:${idx}`);
        return;
      }
      if (!fromShelfId) {
        missingShelf.push(`${table}:${idx}`);
        return;
      }
      moves.push({
        product_id: productId,
        from_shelf_id: fromShelfId,
        to_shelf_id: productionShelfId,
        quantity: usage * quantity,
      });
    });
  });

  return { moves, missingProduct, missingShelf, quantity };
};

const getShelfWarehouseId = async (shelfId: string) => {
  const { data } = await supabase.from('shelves').select('warehouse_id').eq('id', shelfId).maybeSingle();
  return data?.warehouse_id || null;
};

const adjustStock = async (productId: string, shelfId: string, delta: number, warehouseId?: string | null) => {
  const { data: row, error } = await supabase
    .from('product_inventory')
    .select('id, stock, warehouse_id')
    .eq('product_id', productId)
    .eq('shelf_id', shelfId)
    .maybeSingle();

  if (error) throw error;

  const current = parseFloat(row?.stock) || 0;
  const next = current + delta;
  if (next < 0) {
    throw new Error('موجودی کافی نیست');
  }

  const payload = {
    product_id: productId,
    shelf_id: shelfId,
    warehouse_id: warehouseId ?? row?.warehouse_id ?? null,
    stock: next,
  };

  const { error: upsertError } = await supabase
    .from('product_inventory')
    .upsert(payload, { onConflict: 'product_id,shelf_id' });
  if (upsertError) throw upsertError;
};

export const applyProductionMoves = async (moves: ProductionMove[]) => {
  const grouped = new Map<string, ProductionMove>();
  moves.forEach((move) => {
    const key = `${move.product_id}:${move.from_shelf_id}:${move.to_shelf_id}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += move.quantity;
    } else {
      grouped.set(key, { ...move });
    }
  });

  const groupedMoves = Array.from(grouped.values());
  for (const move of groupedMoves) {
    await adjustStock(move.product_id, move.from_shelf_id, -move.quantity);
    const destWarehouseId = await getShelfWarehouseId(move.to_shelf_id);
    await adjustStock(move.product_id, move.to_shelf_id, move.quantity, destWarehouseId);
  }
};

export const rollbackProductionMoves = async (moves: ProductionMove[]) => {
  const reversed = moves.map((move) => ({
    ...move,
    from_shelf_id: move.to_shelf_id,
    to_shelf_id: move.from_shelf_id,
  }));
  await applyProductionMoves(reversed);
};

export const consumeProductionMaterials = async (moves: ProductionMove[], productionShelfId?: string) => {
  const grouped = new Map<string, number>();
  moves.forEach((move) => {
    const targetShelfId = move?.to_shelf_id || productionShelfId;
    if (!targetShelfId) return;
    const key = `${move.product_id}:${targetShelfId}`;
    grouped.set(key, (grouped.get(key) || 0) + move.quantity);
  });
  for (const [key, qty] of grouped.entries()) {
    const [productId, shelfId] = key.split(':');
    await adjustStock(productId, shelfId, -qty);
  }
};

export const addFinishedGoods = async (productId: string, shelfId: string, quantity: number) => {
  const warehouseId = await getShelfWarehouseId(shelfId);
  await adjustStock(productId, shelfId, quantity, warehouseId);
};

export const syncProductStock = async (productId: string) => {
  const { data, error } = await supabase
    .from('product_inventory')
    .select('stock')
    .eq('product_id', productId);
  if (error) throw error;
  const totalStock = (data || []).reduce((sum: number, row: any) => sum + (parseFloat(row.stock) || 0), 0);
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

