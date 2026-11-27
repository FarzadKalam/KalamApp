import { calculateInvoiceRowAmount } from './invoice-row-calculation.ts';

const invoiceModules = new Set(['invoices', 'purchase_invoices', 'sales_return_invoices', 'purchase_return_invoices']);
export const isInvoiceApprovalTable = (moduleId: string, key: string) =>
  invoiceModules.has(moduleId) && (key === 'invoiceItems' || key === 'payments');

export const APPROVAL_ROW = '_approval_row';
export const invoiceAmountModeColumns = [
  { key: 'discount_type', amountKey: 'discount' },
  { key: 'vat_type', amountKey: 'vat' },
];
const invoiceAmountFields = ['quantity', 'usage', 'length', 'width', 'qty', 'stock', 'unit_price', 'buy_price', 'price', 'discount', 'discount_type', 'vat', 'vat_type'];

export const finalizeApprovedInvoiceRow = (key: string, row: Record<string, any>, original?: Record<string, any>) => {
  const rowKey = row.row_key || row.id || (!original ? crypto.randomUUID() : null);
  const shouldCalculate = key === 'invoiceItems' && (!original || row.total_price == null
    || invoiceAmountFields.some(field => row[field] !== original[field]));
  return { ...row, ...(rowKey ? { row_key: rowKey } : {}), ...(shouldCalculate ? { total_price: calculateInvoiceRowAmount(row) } : {}) };
};

export const prepareInvoiceApprovalRows = (
  current: any[], proposed: unknown, projectRow: (row: any) => Record<string, unknown>,
): { rows: Record<string, unknown>[]; changed: boolean } => {
  const rows = current.map((row, index) => ({ ...projectRow(row), [APPROVAL_ROW]: index + 1 }));
  let changed = false;
  if (Array.isArray(proposed)) {
    for (const raw of proposed) {
      if (!raw || typeof raw !== 'object') continue;
      const patch = projectRow(raw);
      if (!Object.keys(patch).length) continue;
      const index = raw._existing_row_number;
      if (Number.isInteger(index) && index >= 1 && index <= current.length) {
        rows[index - 1] = { ...rows[index - 1], ...patch };
        changed = true;
      } else if (raw._row_action === 'add' && index === undefined) {
        rows.push({ ...patch, [APPROVAL_ROW]: 0 });
        changed = true;
      } else {
        throw new Error('ردیف پیشنهادی فاکتور قابل تطبیق نیست. شمارهٔ ردیف را مشخص کنید.');
      }
    }
  }
  return { rows, changed };
};

export const mergeInvoiceApprovalRows = (
  current: any[], submitted: any[], mayDelete: boolean,
  validateChanges?: (values: Record<string, unknown>, original?: Record<string, unknown>) => void,
  finalize?: (row: Record<string, any>, original?: Record<string, any>) => Record<string, any>,
) => {
  const seen = new Set<number>();
  const rows = submitted.map((row) => {
    const { [APPROVAL_ROW]: index, ...values } = row;
    if (index === undefined || index === 0) {
      validateChanges?.(values);
      return finalize ? finalize(values) : values;
    }
    if (!Number.isInteger(index) || index < 1 || index > current.length || seen.has(index)) {
      throw new Error('یکی از ردیف‌های اصلی فاکتور قابل تطبیق نیست. کارت را دوباره بسازید.');
    }
    seen.add(index);
    validateChanges?.(values, current[index - 1]);
    const original = current[index - 1];
    const merged = { ...original, ...values };
    return finalize ? finalize(merged, original) : merged;
  });
  if (!mayDelete && seen.size !== current.length) throw new Error('اجازهٔ حذف ردیف‌های این جدول را ندارید.');
  return rows;
};
