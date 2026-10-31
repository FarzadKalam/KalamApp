import { FieldLocation, FieldNature, FieldType, ModuleNature, ViewMode, type ModuleDefinition } from '../types';
import { toPersianNumber } from './persianNumberFormatter';

export const CASH_BANK_LEDGER_PRINT_ID = 'cash_bank_ledger';
export const CASH_BANK_LEDGER_COLUMNS = [
  { key: 'rowType', label: 'نوع', type: FieldType.SELECT },
  { key: 'sourceLabel', label: 'منبع', type: FieldType.TEXT },
  { key: 'paymentType', label: 'روش', type: FieldType.SELECT },
  { key: 'status', label: 'وضعیت', type: FieldType.SELECT },
  { key: 'date', label: 'تاریخ', type: FieldType.DATE },
  { key: 'amount', label: 'مبلغ', type: FieldType.PRICE },
  { key: 'invoiceLabel', label: 'فاکتور', type: FieldType.TEXT },
  { key: 'personLabel', label: 'طرف حساب', type: FieldType.TEXT },
  { key: 'bankLabel', label: 'حساب / صندوق', type: FieldType.TEXT },
  { key: 'chequeLabel', label: 'چک', type: FieldType.TEXT },
  { key: 'description', label: 'توضیحات', type: FieldType.LONG_TEXT },
];

export const cashBankLedgerPrintModule: ModuleDefinition = {
  id: CASH_BANK_LEDGER_PRINT_ID,
  table: 'cash_bank_unified_ledger',
  titles: { fa: 'گردش نقد و بانک', faSingular: 'گردش نقد و بانک' },
  nature: ModuleNature.FINANCE,
  supportedViewModes: [ViewMode.LIST], defaultViewMode: ViewMode.LIST,
  fields: CASH_BANK_LEDGER_COLUMNS.map((field, index) => ({
    key: field.key, labels: { fa: field.label }, type: field.type,
    location: FieldLocation.HEADER, nature: FieldNature.STANDARD, order: index,
    isTableColumn: true,
  })),
  blocks: [],
};

/** Preserve PostgreSQL numeric precision when showing aggregate amounts. */
export const formatCashBankLedgerTotal = (raw: string) => {
  const match = String(raw).match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return '—';
  const integer = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  const decimal = (match[3] || '').replace(/0+$/, '');
  return toPersianNumber(`${match[1]}${integer}${decimal ? `٫${decimal}` : ''}`);
};

const first = (filters: Record<string, any>, key: string) => String(filters?.[key]?.[0] ?? '').trim();
const json = (value: string) => { try { return JSON.parse(value); } catch { return null; } };
const array = (filters: Record<string, any>, key: string) => {
  const value = json(first(filters, key));
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
};
const range = (filters: Record<string, any>, key: string) => {
  const value = json(first(filters, key));
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
};

/** The page, aggregate and print requests must share exactly the same filter payload. */
export const buildCashBankLedgerFilters = (filters: Record<string, any>) => {
  const dates = range(filters, 'date');
  const amounts = range(filters, 'amount');
  return {
    row_types: array(filters, 'rowType'), payment_types: array(filters, 'paymentType'), statuses: array(filters, 'status'),
    source_query: first(filters, 'sourceLabel'), date_from: dates.from || '', date_to: dates.to || '',
    amount_from: amounts.from ?? '', amount_to: amounts.to ?? '',
    invoice_query: first(filters, 'invoiceLabel'), person_query: first(filters, 'personLabel'),
    bank_query: first(filters, 'bankLabel'), cheque_query: first(filters, 'chequeLabel'), description_query: first(filters, 'description'),
  };
};

/** Explicit print requests stream fixed-size pages; totals never download ledger rows. */
export const fetchCashBankLedgerPrintRows = async (
  client: any,
  options: { filters: Record<string, any>; sortField: string; sortOrder: string; isCurrent: () => boolean },
) => {
  const rows: any[] = [];
  const pageSize = 200;
  for (let page = 1; options.isCurrent(); page += 1) {
    const { data, error } = await client.rpc('get_cash_bank_unified_ledger_page', {
      p_page: page, p_page_size: pageSize, p_sort_field: options.sortField, p_sort_order: options.sortOrder,
      p_filters: buildCashBankLedgerFilters(options.filters),
    });
    if (error) throw error;
    if (!options.isCurrent()) return null;
    const batch = Array.isArray(data?.rows) ? data.rows : [];
    rows.push(...batch);
    if (rows.length >= Number(data?.total || 0) || batch.length < pageSize) return rows;
  }
  return null;
};
