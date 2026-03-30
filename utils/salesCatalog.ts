import { RowCalculationType } from '../types';
import { calculateRow } from './calculations';

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface PriceListItem {
  product_id?: string | null;
  price?: number | string | null;
  unit_name?: string | null;
}

export interface SalesPackageItemSnapshot {
  product_id: string | null;
  product_name: string;
  product_type: string;
  quantity: number;
  main_unit: string;
  unit_price: number;
  discount: number;
  discount_type: 'amount' | 'percent';
  total_price: number;
}

export const findPriceListItemByProduct = (items: any, productId: string | null | undefined): PriceListItem | null => {
  const normalizedId = String(productId || '').trim();
  if (!normalizedId || !Array.isArray(items)) return null;
  const match = items.find((item: any) => String(item?.product_id || '').trim() === normalizedId);
  return match || null;
};

export const normalizeSalesPackageItems = (items: any): SalesPackageItemSnapshot[] => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item: any) => {
      const productId = String(item?.product_id || '').trim() || null;
      const productName = String(item?.product_name || item?.name || item?.title || productId || '').trim();
      const productType = String(item?.product_type || 'goods').trim().toLowerCase() || 'goods';
      const quantity = Math.abs(toNumber(item?.quantity));
      const mainUnit = String(item?.main_unit || item?.unit_name || item?.unit || 'عدد').trim() || 'عدد';
      const unitPrice = toNumber(item?.unit_price);
      const discount = Math.abs(toNumber(item?.discount));
      const discountType: SalesPackageItemSnapshot['discount_type'] =
        String(item?.discount_type || 'amount').trim().toLowerCase() === 'percent'
        ? 'percent'
        : 'amount';
      const computedTotal = calculateRow(
        {
          quantity,
          unit_price: unitPrice,
          discount,
          discount_type: discountType,
        },
        RowCalculationType.INVOICE_ROW,
      );

      return {
        product_id: productId,
        product_name: productName || productId || '-',
        product_type: productType,
        quantity,
        main_unit: mainUnit,
        unit_price: unitPrice,
        discount,
        discount_type: discountType,
        total_price: toNumber(item?.total_price) || computedTotal,
      };
    })
    .filter((item) => item.product_id && item.quantity > 0);
};

export const calculateSalesPackageTotal = (items: any): number => {
  return normalizeSalesPackageItems(items).reduce((sum, item) => sum + toNumber(item.total_price), 0);
};

export const calculateSalesPackageGrossTotal = (items: any): number => {
  return normalizeSalesPackageItems(items).reduce((sum, item) => sum + (toNumber(item.quantity) * toNumber(item.unit_price)), 0);
};

export const calculateSalesPackageDiscountTotal = (items: any): number => {
  return normalizeSalesPackageItems(items).reduce((sum, item) => {
    const gross = toNumber(item.quantity) * toNumber(item.unit_price);
    const net = toNumber(item.total_price);
    return sum + Math.max(gross - net, 0);
  }, 0);
};

export const buildSalesPackageDescription = (items: any, packageQuantity: number = 1): string => {
  const normalized = normalizeSalesPackageItems(items);
  if (normalized.length === 0) return '';
  const multiplier = Math.max(1, toNumber(packageQuantity) || 1);
  const body = normalized
    .map((item) => `${item.quantity * multiplier} ${item.main_unit} ${item.product_name}`.trim())
    .join(' و ');
  return body ? `شامل: ${body}` : '';
};
