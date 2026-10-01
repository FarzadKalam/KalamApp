import { getFieldLabelFa } from '../fieldLabel';

const COMPUTED_ROW_LABELS: Record<string, string> = {
  cheque_serial_no: 'شماره چک',
  cheque_due_date: 'سررسید',
  cheque_bank_name: 'بانک',
  cheque_status: 'وضعیت چک',
  __invoice_item_meta__: 'شرح',
};

/**
 * Resolves a printed table heading from the row token that occupies the same
 * column. This is intentionally schema-driven: a saved template can keep its
 * geometry while field labels and ordering continue to follow the effective
 * tenant module configuration.
 */
export const getPrintRowColumnHeaderLabel = ({
  moduleId,
  block,
  rowKey,
}: {
  moduleId?: string | null;
  block?: any;
  rowKey?: string | null;
}): string => {
  const key = String(rowKey || '').trim();
  if (!key) return '';
  if (key === '__row_index__') return 'ردیف';

  const resolvedKey = key === '__discount_amount__' ? 'discount' : key;
  const column = Array.isArray(block?.tableColumns)
    ? block.tableColumns.find(
      (item: any) => String(item?.key || '').trim() === resolvedKey,
    )
    : null;
  if (column) {
    return getFieldLabelFa(
      {
        ...column,
        labels: column?.labels || { fa: column?.title || resolvedKey },
      },
      { moduleId, fallback: column?.title || resolvedKey },
    );
  }

  return COMPUTED_ROW_LABELS[key] || key;
};
