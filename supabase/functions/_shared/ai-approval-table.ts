const invoiceModules = new Set(['invoices', 'purchase_invoices', 'sales_return_invoices', 'purchase_return_invoices']);
export const isInvoiceApprovalTable = (moduleId: string, key: string) =>
  invoiceModules.has(moduleId) && (key === 'invoiceItems' || key === 'payments');

export const APPROVAL_ROW = '_approval_row';

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
) => {
  const seen = new Set<number>();
  const rows = submitted.map((row) => {
    const { [APPROVAL_ROW]: index, ...values } = row;
    if (index === undefined || index === 0) {
      validateChanges?.(values);
      return values;
    }
    if (!Number.isInteger(index) || index < 1 || index > current.length || seen.has(index)) {
      throw new Error('یکی از ردیف‌های اصلی فاکتور قابل تطبیق نیست. کارت را دوباره بسازید.');
    }
    seen.add(index);
    validateChanges?.(values, current[index - 1]);
    return { ...current[index - 1], ...values };
  });
  if (!mayDelete && seen.size !== current.length) throw new Error('اجازهٔ حذف ردیف‌های این جدول را ندارید.');
  return rows;
};
