import type { SupabaseClient } from '@supabase/supabase-js';
import { convertArea, type UnitValue } from '../../utils/unitConversions';

const SHELF_OPTIONS_TTL_MS = 2 * 60_000;

type ShelfOption = { value: string; label: string };
type ShelfOptionsCacheEntry = {
  data: ShelfOption[];
  expiresAt: number;
  promise: Promise<ShelfOption[]> | null;
};

const shelfOptionsCache = new Map<string, ShelfOptionsCacheEntry>();

const clearShelfOptionsCache = (productId?: string) => {
  const normalizedId = String(productId || '').trim();
  if (!normalizedId) {
    shelfOptionsCache.clear();
    return;
  }
  shelfOptionsCache.delete(normalizedId);
};

export const updateProductStock = async (supabase: SupabaseClient, productId: string) => {
  try {
    const { data: rows, error } = await supabase
      .from('product_inventory')
      .select('stock')
      .eq('product_id', productId);
    if (error) throw error;

    const totalStock = (rows || []).reduce((sum: number, row: any) => sum + (parseFloat(row.stock) || 0), 0);
    const { data: productRow } = await supabase
      .from('products')
      .select('main_unit, sub_unit')
      .eq('id', productId)
      .maybeSingle();
    const mainUnit = productRow?.main_unit as UnitValue | undefined;
    const subUnit = productRow?.sub_unit as UnitValue | undefined;
    const subStock = mainUnit && subUnit ? convertArea(totalStock, mainUnit, subUnit) : 0;
    await supabase.from('products').update({ stock: totalStock, sub_stock: subStock }).eq('id', productId);
    clearShelfOptionsCache(productId);
  } catch (e) {
    console.error(e);
  }
};

export const fetchShelfOptions = async (supabase: SupabaseClient, productId: string) => {
  const normalizedId = String(productId || '').trim();
  if (!normalizedId) return [];

  const cached = shelfOptionsCache.get(normalizedId);
  const now = Date.now();

  if (cached?.data && cached.expiresAt > now) {
    return cached.data;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const pending = (async () => {
    const { data: rows, error } = await supabase
      .from('product_inventory')
      .select('product_id, shelf_id, stock, shelves(system_code, shelf_number, name, warehouses(name))')
      .eq('product_id', normalizedId)
      .gt('stock', 0)
      .order('stock', { ascending: false });
    if (error) throw error;

    const options = (rows || []).map((row: any) => {
      const shelfNumber = row?.shelves?.shelf_number || row?.shelves?.name || row.shelf_id;
      const systemCode = row?.shelves?.system_code || '';
      const warehouseName = row?.shelves?.warehouses?.name || '';
      const shelfLabel = [systemCode, shelfNumber, warehouseName].filter(Boolean).join(' - ');
      const stockLabel = typeof row.stock === 'number' ? row.stock : parseFloat(row.stock) || 0;
      return {
        value: row.shelf_id,
        label: `${shelfLabel} (\u0645\u0648\u062c\u0648\u062f\u06cc: ${stockLabel})`,
      };
    });

    shelfOptionsCache.set(normalizedId, {
      data: options,
      expiresAt: Date.now() + SHELF_OPTIONS_TTL_MS,
      promise: null,
    });

    return options;
  })().catch((error) => {
    const existing = shelfOptionsCache.get(normalizedId);
    if (existing) {
      shelfOptionsCache.set(normalizedId, {
        ...existing,
        expiresAt: 0,
        promise: null,
      });
    }
    throw error;
  });

  shelfOptionsCache.set(normalizedId, {
    data: cached?.data || [],
    expiresAt: cached?.expiresAt || 0,
    promise: pending,
  });

  return pending;
};
