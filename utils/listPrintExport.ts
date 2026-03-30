import { FieldType } from '../types';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from './persianNumberFormatter';
import { getAssigneeLabel } from './assigneeLabel';
import { getResolvedAssigneeId } from './assigneeValue';

export interface ListFieldDefinition {
  key: string;
  label: string;
  type?: FieldType | string;
  options?: any[];
}

const ASSIGNEE_DISPLAY_FIELD_KEY = '__assignee_display__';

const escapeHtml = (value: any) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const resolveOptionLabel = (options: any[] = [], value: any) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  const match = options.find((item: any) => String(item?.value ?? '').trim() === normalized);
  return String(match?.label || match?.name || match?.title || '').trim();
};

export const buildListPrintableFields = (
  moduleConfig: any,
  canViewField?: (fieldKey: string) => boolean,
  visibleFieldKeys: string[] = [],
): ListFieldDefinition[] => {
  const visibleSet = new Set((visibleFieldKeys || []).map((item) => String(item || '').trim()).filter(Boolean));
  const sourceFields = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [];
  const fieldsForList = sourceFields.some((field: any) => field?.isTableColumn === true)
    ? sourceFields.filter((field: any) => field?.isTableColumn === true)
    : sourceFields.filter((field: any) => !['id', 'created_at', 'updated_at', 'created_by', 'updated_by'].includes(String(field?.key || '')));

  const mappedFields = fieldsForList
    .filter((field: any) => (canViewField ? canViewField(String(field?.key || '')) !== false : true))
    .filter((field: any) => visibleSet.size === 0 || visibleSet.has(String(field?.key || '')))
    .map((field: any) => ({
      key: String(field.key),
      label: String(field?.labels?.fa || field.key),
      type: field?.type,
      options: Array.isArray(field?.options) ? field.options : [],
    }));

  const canShowAssignee = canViewField ? canViewField('assignee_id') !== false : true;
  const hasAssigneeField = mappedFields.some((field: ListFieldDefinition) => field.key === ASSIGNEE_DISPLAY_FIELD_KEY || field.key === 'assignee_id');
  if (canShowAssignee && !hasAssigneeField) {
    mappedFields.push({
      key: ASSIGNEE_DISPLAY_FIELD_KEY,
      label: getAssigneeLabel(moduleConfig?.id),
      type: FieldType.TEXT,
      options: [],
    });
  }

  return mappedFields;
};

export const formatListCellValue = (
  field: ListFieldDefinition,
  row: Record<string, any>,
  relationOptions: Record<string, any[]> = {},
  currencyLabel: string = '',
): string => {
  const key = String(field?.key || '').trim();
  if (key === ASSIGNEE_DISPLAY_FIELD_KEY) {
    const assigneeType = String(row?.assignee_type || '').trim().toLowerCase();
    const resolvedAssigneeId = getResolvedAssigneeId(row);
    if (!resolvedAssigneeId) {
      return String(row?.assignee_name || row?.responsible_name || row?.created_by_name || '-');
    }
    const roleOptions = [
      ...(relationOptions.org_roles || []),
      ...(relationOptions.roles || []),
    ];
    const userOptions = [
      ...(relationOptions.assignee_id || []),
      ...(relationOptions.profiles || []),
    ];
    const label =
      assigneeType === 'role'
        ? resolveOptionLabel(roleOptions, resolvedAssigneeId)
        : resolveOptionLabel(userOptions, resolvedAssigneeId);
    return label || String(row?.assignee_name || row?.responsible_name || row?.created_by_name || resolvedAssigneeId);
  }
  const rawValue = row?.[key];

  if (rawValue === null || rawValue === undefined || rawValue === '') return '-';

  if (field?.type === FieldType.CHECKBOX) {
    return rawValue ? 'بله' : 'خیر';
  }

  if (field?.type === FieldType.PRICE) {
    const formatted = formatPersianPrice(rawValue);
    return currencyLabel ? `${formatted} ${currencyLabel}` : formatted;
  }

  if (field?.type === FieldType.NUMBER || field?.type === FieldType.STOCK || field?.type === FieldType.PERCENTAGE) {
    return toPersianNumber(rawValue);
  }

  if (field?.type === FieldType.DATE) {
    return safeJalaliFormat(rawValue, 'YYYY/MM/DD') ? toPersianNumber(safeJalaliFormat(rawValue, 'YYYY/MM/DD')) : String(rawValue);
  }

  if (field?.type === FieldType.DATETIME) {
    return safeJalaliFormat(rawValue, 'YYYY/MM/DD HH:mm')
      ? toPersianNumber(safeJalaliFormat(rawValue, 'YYYY/MM/DD HH:mm'))
      : String(rawValue);
  }

  if (field?.type === FieldType.TIME) {
    return toPersianNumber(String(rawValue));
  }

  if (field?.type === FieldType.RELATION || field?.type === FieldType.SELECT || field?.type === FieldType.STATUS) {
    const label =
      resolveOptionLabel(field?.options, rawValue) ||
      resolveOptionLabel(relationOptions[key] || [], rawValue) ||
      resolveOptionLabel(Object.values(relationOptions).flat(), rawValue);
    return label || String(rawValue);
  }

  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => formatListCellValue({ ...field, type: FieldType.TEXT }, { [key]: item }, relationOptions, currencyLabel)).join('، ');
  }

  if (typeof rawValue === 'object') {
    return String(rawValue?.name || rawValue?.title || rawValue?.full_name || rawValue?.label || rawValue?.id || '-');
  }

  return toPersianNumber(String(rawValue));
};

export const buildListTableHtml = (
  fields: ListFieldDefinition[],
  rows: Array<Record<string, any>>,
  relationOptions: Record<string, any[]> = {},
  currencyLabel: string = '',
  startIndex: number = 0,
) => {
  const headerHtml = fields
    .map((field) => `<th style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; background:rgba(var(--brand-500-rgb),0.08); font-weight:800;">${escapeHtml(field.label)}</th>`)
    .join('');

  const rowsHtml = rows.length > 0
    ? rows.map((row, index) => {
        const cells = fields
          .map((field) => {
            const value = formatListCellValue(field, row, relationOptions, currencyLabel);
            return `<td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; vertical-align:top; word-break:break-word;">${escapeHtml(value)}</td>`;
          })
          .join('');
        return `<tr><td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; text-align:center; background:rgba(var(--brand-50-rgb),0.18);">${toPersianNumber(startIndex + index + 1)}</td>${cells}</tr>`;
      }).join('')
    : `<tr><td colspan="${fields.length + 1}" style="border:1px solid var(--table-border-color, #d1d5db); padding:12px; text-align:center; color:#64748b;">داده‌ای برای چاپ انتخاب نشده است.</td></tr>`;

  return `
<table style="width:100%; border-collapse:collapse; table-layout:fixed; direction:rtl; color:#111827; font-size:11px;">
  <thead>
    <tr>
      <th style="width:56px; border:1px solid var(--table-border-color, #d1d5db); padding:6px; background:rgba(var(--brand-500-rgb),0.14); font-weight:800;">ردیف</th>
      ${headerHtml}
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>
`.trim();
};

export const escapeCsvCell = (value: any) => {
  const normalized = String(value ?? '').replace(/"/g, '""');
  return `"${normalized}"`;
};
