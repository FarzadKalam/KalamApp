import { FieldType } from '../../types';
import { normalizeFilterValue } from './tableUtils';
import type { SupabaseClient } from '@supabase/supabase-js';

type ProductFilter = {
  filterKey: string;
  value: any;
  colType: FieldType;
  dynamicOptionsCategory?: string;
  dynamicOptions?: any[];
};

export const buildProductFilters = (
  tableColumns: any[],
  rowData: any,
  dynamicOptions: Record<string, any[]>,
  localDynamicOptions: Record<string, any[]>
) => {
  return (tableColumns || [])
    .filter((col: any) => col.filterable)
    .map((col: any) => {
      const rawValue = rowData?.[col.key];
      const value = normalizeFilterValue(col, rawValue, dynamicOptions, localDynamicOptions);
      if (value === undefined || value === null || value === '') return null;
      if (Array.isArray(value) && value.length === 0) return null;
      const options = col.dynamicOptionsCategory
        ? (dynamicOptions[col.dynamicOptionsCategory] || localDynamicOptions[col.dynamicOptionsCategory] || [])
        : [];
      return {
        filterKey: col.filterKey || col.key,
        value,
        colType: col.type,
        dynamicOptionsCategory: col.dynamicOptionsCategory,
        dynamicOptions: options,
      };
    })
    .filter(Boolean) as ProductFilter[];
};

const parsePotentialJsonArray = (value: any) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const resolveDynamicLabel = (val: any, options: any[] = []) => {
  if (val === undefined || val === null || val === '') return null;
  if (val && typeof val === 'object') {
    if ('label' in val && (val as any).label) return (val as any).label;
    if ('value' in val) {
      const byObjValue = options.find((o: any) => o.value === (val as any).value);
      if (byObjValue?.label) return byObjValue.label;
      return (val as any).value;
    }
  }
  if (typeof val === 'string') {
    const byValue = options.find((o: any) => o.value === val);
    if (byValue?.label) return byValue.label;
    const byLabel = options.find((o: any) => o.label === val);
    if (byLabel?.label) return byLabel.label;
  }
  return val;
};

const normalizeRecordValue = (rawValue: any, filter: ProductFilter) => {
  const parsed = parsePotentialJsonArray(rawValue);
  const isArrayType = filter.colType === FieldType.MULTI_SELECT || filter.colType === FieldType.TAGS;
  const isDynamic = !!filter.dynamicOptionsCategory;
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => (isDynamic ? resolveDynamicLabel(item, filter.dynamicOptions) : item))
      .filter((item) => item !== undefined && item !== null && item !== '');
  }
  if (isArrayType && typeof parsed === 'string') {
    return [isDynamic ? resolveDynamicLabel(parsed, filter.dynamicOptions) : parsed].filter(
      (item) => item !== undefined && item !== null && item !== ''
    );
  }
  if (isDynamic) return resolveDynamicLabel(parsed, filter.dynamicOptions);
  return parsed;
};

const normalizeFilterValueForCompare = (value: any) => {
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v.trim() : v));
  return typeof value === 'string' ? value.trim() : value;
};

const expandCategoryValues = (values: any[]) => {
  const categoryMap: Record<string, string> = {
    leather: 'چرم',
    lining: 'آستر',
    accessory: 'خرجکار',
    fitting: 'یراق',
    'چرم': 'leather',
    'آستر': 'lining',
    'خرجکار': 'accessory',
    'یراق': 'fitting',
  };
  const expanded: any[] = [];
  values.forEach((value) => {
    expanded.push(value);
    if (typeof value === 'string') {
      const mapped = categoryMap[value.trim()];
      if (mapped) expanded.push(mapped);
    }
  });
  return Array.from(new Set(expanded.filter((v) => v !== undefined && v !== null && v !== '')));
};

const matchesFilter = (recordRawValue: any, filter: ProductFilter) => {
  const filterValue = normalizeFilterValueForCompare(filter.value);
  const recordValue = normalizeRecordValue(recordRawValue, filter);

  if (Array.isArray(filterValue)) {
    if (Array.isArray(recordValue)) {
      return filterValue.some((v) => recordValue.includes(v));
    }
    return filterValue.includes(recordValue);
  }

  if (Array.isArray(recordValue)) {
    return recordValue.includes(filterValue);
  }

  return recordValue === filterValue;
};

export const runProductsQuery = async (
  supabase: SupabaseClient,
  activeFilters: ProductFilter[]
) => {
  const safeServerFilterKeys = new Set(['product_type', 'category']);
  const serverFilters = activeFilters.filter((f) => safeServerFilterKeys.has(f.filterKey));
  const clientFilters = activeFilters.filter((f) => !safeServerFilterKeys.has(f.filterKey));

  let query: any = supabase
    .from('products')
    .select('*');

  serverFilters.forEach((f) => {
    let values = Array.isArray(f.value) ? f.value : [f.value];
    if (f.filterKey === 'category') {
      values = expandCategoryValues(values);
    }
    const needsContains = f.colType === FieldType.MULTI_SELECT || f.colType === FieldType.TAGS;
    if (needsContains) {
      if (values.length === 1) {
        query = query.contains(f.filterKey, values);
        return;
      }
      const orFilters = values
        .map((val) => `${f.filterKey}.cs.${JSON.stringify([val])}`)
        .join(',');
      query = query.or(orFilters);
      return;
    }
    if (values.length > 1) {
      query = query.in(f.filterKey, values);
      return;
    }
    query = query.eq(f.filterKey, values[0]);
  });

  const { data, error } = await query.limit(2000);
  if (error) return { data: null, error };

  if (clientFilters.length === 0) {
    return { data: data || [], error: null };
  }

  const filtered = (data || []).filter((row: any) =>
    clientFilters.every((filter) => matchesFilter(row?.[filter.filterKey], filter))
  );

  return { data: filtered, error: null };
};
