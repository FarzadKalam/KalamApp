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

const toEnglishDigits = (value: any): string =>
  String(value ?? '')
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

const formatDigitsForLocale = (value: any, digitLocale: 'fa' | 'en') =>
  digitLocale === 'fa' ? toPersianNumber(value) : toEnglishDigits(value);

const formatEnglishPrice = (value: any): string => {
  const normalized = toEnglishDigits(value).replace(/,/g, '').trim();
  const number = Number(normalized);
  if (!Number.isFinite(number)) return toEnglishDigits(String(value ?? ''));
  return number.toLocaleString('en-US');
};

const parseArrayLikeValue = (value: any): any[] | null => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const resolveMergedOptionLabel = (
  key: string,
  field: ListFieldDefinition,
  relationOptions: Record<string, any[]>,
  value: any,
) =>
  resolveOptionLabel(field?.options, value) ||
  resolveOptionLabel(relationOptions[key] || [], value) ||
  resolveOptionLabel(Object.values(relationOptions).flat(), value);

const resolveAssigneeComboLabel = (
  rawValue: string,
  relationOptions: Record<string, any[]>,
): string => {
  const match = String(rawValue || '').trim().match(/^(user|role)_(.+)$/i);
  if (!match) return '';
  const assigneeType = String(match[1] || '').toLowerCase();
  const assigneeId = String(match[2] || '').trim();
  if (!assigneeId) return '';

  const roleOptions = [
    ...(relationOptions.org_roles || []),
    ...(relationOptions.roles || []),
  ];
  const userOptions = [
    ...(relationOptions.assignee_id || []),
    ...(relationOptions.profiles || []),
  ];
  const exact = resolveOptionLabel(Object.values(relationOptions).flat(), rawValue);
  if (exact) return exact;

  return assigneeType === 'role'
    ? (resolveOptionLabel(roleOptions, assigneeId) || resolveOptionLabel(Object.values(relationOptions).flat(), assigneeId))
    : (resolveOptionLabel(userOptions, assigneeId) || resolveOptionLabel(Object.values(relationOptions).flat(), assigneeId));
};

const resolveAssigneeRecordLabel = (
  row: Record<string, any>,
  relationOptions: Record<string, any[]>,
): string => {
  const assigneeType = String(row?.assignee_type || '').trim().toLowerCase() === 'role' ? 'role' : 'user';
  const resolvedAssigneeId = getResolvedAssigneeId(row);
  if (!resolvedAssigneeId) {
    return String(row?.assignee_name || row?.responsible_name || row?.created_by_name || '-');
  }

  const roleOptions = [
    ...(relationOptions.org_roles || []),
    ...(relationOptions.roles || []),
    ...(relationOptions.assignee_role_id || []),
  ];
  const userOptions = [
    ...(relationOptions.assignee_id || []),
    ...(relationOptions.profiles || []),
  ];
  const comboLabel = resolveAssigneeComboLabel(`${assigneeType}_${resolvedAssigneeId}`, relationOptions);
  const directLabel = assigneeType === 'role'
    ? resolveOptionLabel(roleOptions, resolvedAssigneeId)
    : resolveOptionLabel(userOptions, resolvedAssigneeId);

  return directLabel
    || comboLabel
    || String(row?.assignee_name || row?.responsible_name || row?.created_by_name || resolvedAssigneeId);
};

const formatArrayItemLabel = (
  item: any,
  field: ListFieldDefinition,
  key: string,
  relationOptions: Record<string, any[]>,
  currencyLabel: string,
  digitLocale: 'fa' | 'en',
): string => {
  if (item === null || item === undefined || item === '') return '';

  if (typeof item === 'object') {
    const objectLabel = String(
      item?.label ||
      item?.title ||
      item?.name ||
      item?.full_name ||
      item?.business_name ||
      item?.value ||
      item?.id ||
      ''
    ).trim();
    if (objectLabel) return formatDigitsForLocale(objectLabel, digitLocale);
  }

  const optionLabel = resolveMergedOptionLabel(key, field, relationOptions, item);
  if (optionLabel) return formatDigitsForLocale(optionLabel, digitLocale);

  return formatListCellValue({ ...field, type: FieldType.TEXT }, { [key]: item }, relationOptions, currencyLabel, digitLocale);
};

export const buildListPrintableFields = (
  moduleConfig: any,
  canViewField?: (fieldKey: string) => boolean,
  visibleFieldKeys: string[] = [],
  dynamicOptions: Record<string, any[]> = {},
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
      options: [
        ...(Array.isArray(field?.options) ? field.options : []),
        ...(field?.dynamicOptionsCategory && Array.isArray(dynamicOptions?.[field.dynamicOptionsCategory])
          ? dynamicOptions[field.dynamicOptionsCategory]
          : []),
      ],
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
  digitLocale: 'fa' | 'en' = 'fa',
): string => {
  const key = String(field?.key || '').trim();
  if (key === ASSIGNEE_DISPLAY_FIELD_KEY) {
    return formatDigitsForLocale(resolveAssigneeRecordLabel(row, relationOptions), digitLocale);
  }

  const rawValue = row?.[key];
  const parsedArrayValue = parseArrayLikeValue(rawValue);

  if (key === 'assignee_id' && (row?.assignee_type || row?.assignee_role_id)) {
    return formatDigitsForLocale(resolveAssigneeRecordLabel(row, relationOptions), digitLocale);
  }

  if (rawValue === null || rawValue === undefined || rawValue === '') return '-';

  if (typeof rawValue === 'string') {
    const assigneeComboLabel = resolveAssigneeComboLabel(rawValue, relationOptions);
    if (assigneeComboLabel) return formatDigitsForLocale(assigneeComboLabel, digitLocale);
  }

  if (field?.type === FieldType.CHECKBOX) {
    return rawValue ? 'بله' : 'خیر';
  }

  if (field?.type === FieldType.PRICE) {
    const formatted = digitLocale === 'fa' ? formatPersianPrice(rawValue) : formatEnglishPrice(rawValue);
    return currencyLabel ? `${formatted} ${currencyLabel}` : formatted;
  }

  if (field?.type === FieldType.NUMBER || field?.type === FieldType.STOCK || field?.type === FieldType.PERCENTAGE) {
    return formatDigitsForLocale(rawValue, digitLocale);
  }

  if (field?.type === FieldType.DATE) {
    return formatDigitsForLocale(safeJalaliFormat(rawValue, 'YYYY/MM/DD') || String(rawValue), digitLocale);
  }

  if (field?.type === FieldType.DATETIME) {
    return formatDigitsForLocale(safeJalaliFormat(rawValue, 'YYYY/MM/DD HH:mm') || String(rawValue), digitLocale);
  }

  if (field?.type === FieldType.TIME) {
    return formatDigitsForLocale(String(rawValue), digitLocale);
  }

  if (
    field?.type === FieldType.RELATION ||
    field?.type === FieldType.SELECT ||
    field?.type === FieldType.STATUS ||
    field?.type === FieldType.USER
  ) {
    const label = resolveMergedOptionLabel(key, field, relationOptions, rawValue);
    return label || String(rawValue);
  }

  if (field?.type === FieldType.MULTI_SELECT || field?.type === FieldType.TAGS) {
    const values = Array.isArray(rawValue) ? rawValue : (parsedArrayValue || [rawValue]);
    const labels = values
      .map((item) => formatArrayItemLabel(item, field, key, relationOptions, currencyLabel, digitLocale))
      .filter(Boolean);
    return labels.length ? labels.join('، ') : '-';
  }

  if (Array.isArray(rawValue) || parsedArrayValue) {
    const values = Array.isArray(rawValue) ? rawValue : (parsedArrayValue || []);
    return values
      .map((item) => formatArrayItemLabel(item, field, key, relationOptions, currencyLabel, digitLocale))
      .join('، ');
  }

  if (typeof rawValue === 'object') {
    return formatDigitsForLocale(
      String(rawValue?.name || rawValue?.title || rawValue?.full_name || rawValue?.label || rawValue?.id || '-'),
      digitLocale
    );
  }

  if (field?.type === FieldType.LINK) {
    return String(rawValue);
  }

  return formatDigitsForLocale(String(rawValue), digitLocale);
};

export const formatListCellHtml = (
  field: ListFieldDefinition,
  row: Record<string, any>,
  relationOptions: Record<string, any[]> = {},
  currencyLabel: string = '',
): string => {
  const key = String(field?.key || '').trim();
  const rawValue = row?.[key];

  if (field?.type === FieldType.IMAGE) {
    const imageUrl = String(rawValue || '').trim();
    if (!imageUrl) return '-';
    return `<div style="display:flex;justify-content:center;align-items:center;"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(field.label || key)}" style="display:block;width:52px;height:52px;max-width:52px;max-height:52px;border-radius:10px;object-fit:cover;border:1px solid rgba(148,163,184,0.35);background:#fff;" /></div>`;
  }

  return escapeHtml(formatListCellValue(field, row, relationOptions, currencyLabel));
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
            const valueHtml = formatListCellHtml(field, row, relationOptions, currencyLabel);
            return `<td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; vertical-align:top; word-break:break-word;">${valueHtml}</td>`;
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

export const buildListCatalogHtml = (
  fields: ListFieldDefinition[],
  rows: Array<Record<string, any>>,
  relationOptions: Record<string, any[]> = {},
  currencyLabel: string = '',
) => {
  const imageField = fields.find((field) => String(field?.type || '').toLowerCase() === String(FieldType.IMAGE).toLowerCase()) || null;
  const contentFields = fields.filter((field) => field.key !== imageField?.key);
  const titleField =
    contentFields.find((field) => ['name', 'title', 'business_name'].includes(String(field?.key || '').trim())) ||
    contentFields[0] ||
    null;
  const detailFields = contentFields.filter((field) => field.key !== titleField?.key).slice(0, 4);

  const cardsHtml = rows.length > 0
    ? rows.map((row) => {
        const imageHtml = imageField
          ? (() => {
              const imageUrl = String(row?.[imageField.key] || '').trim();
              if (!imageUrl) {
                return `
<div style="height:118px; border:1px dashed rgba(148,163,184,0.45); border-radius:14px; background:rgba(248,250,252,0.95); display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:10px;">
  بدون تصویر
</div>`.trim();
              }
              return `
<div style="height:118px; border:1px solid rgba(148,163,184,0.28); border-radius:14px; background:#fff; overflow:hidden; display:flex; align-items:center; justify-content:center;">
  <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageField.label || '')}" style="display:block; width:100%; height:100%; object-fit:cover;" />
</div>`.trim();
            })()
          : '';

        const titleHtml = titleField
          ? `<div style="font-size:13px; font-weight:800; color:#111827; line-height:1.9; min-height:24px;">${escapeHtml(formatListCellValue(titleField, row, relationOptions, currencyLabel))}</div>`
          : '';

        const detailRows = detailFields
          .map((field) => {
            const value = formatListCellValue(field, row, relationOptions, currencyLabel);
            if (!String(value || '').trim() || value === '-') return '';
            return `
<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px; border-top:1px solid rgba(226,232,240,0.9); padding-top:5px;">
  <span style="font-size:10px; color:#64748b; flex:0 0 42%;">${escapeHtml(field.label)}</span>
  <span style="font-size:10.5px; color:#0f172a; text-align:left; flex:1 1 auto; word-break:break-word;">${escapeHtml(value)}</span>
</div>`.trim();
          })
          .filter(Boolean)
          .join('');

        return `
<div style="break-inside:avoid; border:1px solid rgba(148,163,184,0.28); border-radius:18px; background:#fff; padding:10px; display:flex; flex-direction:column; gap:8px; box-shadow:0 4px 14px rgba(15,23,42,0.05); min-height:0;">
  ${imageHtml}
  ${titleHtml}
  <div style="display:flex; flex-direction:column; gap:5px;">
    ${detailRows || '<div style="font-size:10px; color:#94a3b8;">&nbsp;</div>'}
  </div>
</div>`.trim();
      }).join('')
    : `<div style="border:1px solid rgba(148,163,184,0.28); border-radius:18px; padding:18px; text-align:center; color:#64748b;">داده‌ای برای چاپ انتخاب نشده است.</div>`;

  return `
<div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; direction:rtl;">
  ${cardsHtml}
</div>
`.trim();
};

export const escapeCsvCell = (value: any) => {
  const normalized = String(value ?? '').replace(/"/g, '""');
  return `"${normalized}"`;
};
