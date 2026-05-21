import React from 'react';
import { QRCode } from 'antd';
import { renderToStaticMarkup } from 'react-dom/server';
import { FieldType } from '../types';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from './persianNumberFormatter';
import { getAssigneeLabel } from './assigneeLabel';
import { getResolvedAssigneeId } from './assigneeValue';
import { buildCatalogFullPageLayout } from './printTemplates/catalogFullPageLayout';
import { buildImagePreviewUrl } from './imagePreview';

export interface ListFieldDefinition {
  key: string;
  label: string;
  type?: FieldType | string;
  options?: any[];
  group?: string;
  defaultSelected?: boolean;
}

export interface ListPrintSummaryDefinition {
  title?: string;
  fields: ListFieldDefinition[];
  values: Record<string, any>;
}

const ASSIGNEE_DISPLAY_FIELD_KEY = '__assignee_display__';
const LIST_PRINT_EXCLUDED_FIELD_TYPES = new Set([
  FieldType.JSON,
  FieldType.READONLY_LOOKUP,
]);

const escapeHtml = (value: any) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getPrintImageUrl = (value: any, preset: 'card' | 'hero' = 'card') =>
  buildImagePreviewUrl(String(value || '').trim(), preset);

/**
 * For catalog print (PDF via Gotenberg), use the raw storage URL without Supabase Image
 * Transformation API. The render/image endpoint requires Pro plan and may not be reachable
 * from within Gotenberg's network context. The raw /object/public/ URL is always accessible.
 */
const getCatalogPrintImageUrl = (value: any): string => String(value || '').trim();

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
  const blocks = Array.isArray(moduleConfig?.blocks) ? moduleConfig.blocks : [];
  const blockTitleMap = new Map(
    blocks
      .filter((block: any) => block?.id)
      .map((block: any) => [String(block.id), String(block?.titles?.fa || block.id)])
  );
  const printableBlockMap = new Map(
    blocks
      .filter((block: any) => block?.id)
      .map((block: any) => [String(block.id), block?.printable !== false])
  );
  const fieldsForDefaultSelection = sourceFields.some((field: any) => field?.isTableColumn === true)
    ? sourceFields.filter((field: any) => field?.isTableColumn === true)
    : sourceFields.filter((field: any) => !['id', 'created_at', 'updated_at', 'created_by', 'updated_by'].includes(String(field?.key || '')));

  const defaultSelectionKeySet = new Set(
    (visibleSet.size > 0 ? Array.from(visibleSet) : fieldsForDefaultSelection.map((field: any) => String(field?.key || '').trim()))
      .filter(Boolean)
  );

  const mappedFields = sourceFields
    .filter((field: any) => (canViewField ? canViewField(String(field?.key || '')) !== false : true))
    .filter((field: any) => {
      const normalizedKey = String(field?.key || '').trim();
      if (!normalizedKey) return false;
      if (['id', 'created_at', 'updated_at', 'created_by', 'updated_by'].includes(normalizedKey)) return false;
      if (LIST_PRINT_EXCLUDED_FIELD_TYPES.has(field?.type)) return false;
      if (String(field?.location || '').trim().toLowerCase() === 'block' && String(field?.blockId || '').trim()) {
        return printableBlockMap.get(String(field.blockId).trim()) !== false;
      }
      return true;
    })
    .map((field: any) => ({
      key: String(field.key),
      label: String(field?.labels?.fa || field.key),
      type: field?.type,
      group:
        String(field?.location || '').trim().toLowerCase() === 'block' && String(field?.blockId || '').trim()
          ? `بخش: ${blockTitleMap.get(String(field.blockId).trim()) || String(field.blockId).trim()}`
          : 'فیلدهای عمومی',
      defaultSelected: defaultSelectionKeySet.has(String(field?.key || '').trim()),
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
      group: 'فیلدهای عمومی',
      defaultSelected: defaultSelectionKeySet.has(ASSIGNEE_DISPLAY_FIELD_KEY),
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
    const imageUrl = getPrintImageUrl(rawValue, 'card');
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

export const buildListSummaryTableHtml = (
  summary: ListPrintSummaryDefinition | null | undefined,
  relationOptions: Record<string, any[]> = {},
  currencyLabel: string = '',
) => {
  if (!summary || !Array.isArray(summary.fields) || summary.fields.length === 0) return '';
  const values = summary.values || {};
  const title = String(summary.title || '').trim();
  const rowsHtml = summary.fields
    .map((field) => {
      const valueHtml = formatListCellHtml(field, values, relationOptions, currencyLabel);
      return `
<tr>
  <td style="width:34%; border:1px solid var(--table-border-color, #d1d5db); padding:7px 8px; background:rgba(var(--brand-50-rgb),0.32); font-weight:800;">${escapeHtml(field.label)}</td>
  <td style="border:1px solid var(--table-border-color, #d1d5db); padding:7px 8px; vertical-align:top; word-break:break-word;">${valueHtml}</td>
</tr>`.trim();
    })
    .join('');

  return `
<div style="margin-top:10px; border:1px solid rgba(148,163,184,0.28); border-radius:14px; overflow:hidden; direction:rtl;">
  ${title ? `<div style="padding:8px 10px; background:rgba(var(--brand-500-rgb),0.08); font-size:11px; font-weight:800; color:#0f172a;">${escapeHtml(title)}</div>` : ''}
  <table style="width:100%; border-collapse:collapse; color:#111827; font-size:11px;">
    <tbody>${rowsHtml}</tbody>
  </table>
</div>
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
              const imageUrl = getCatalogPrintImageUrl(row?.[imageField.key]);
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

export interface CatalogFullPageCompanyInfo {
  logo_url?: string;
  company_full_name?: string;
  company_name_en?: string;
  slogan?: string;
  trade_name?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
}

export const buildListCatalogFullPageHtml = (
  fields: ListFieldDefinition[],
  rows: Array<Record<string, any>>,
  relationOptions: Record<string, any[]> = {},
  currencyLabel: string = '',
  companyInfo?: CatalogFullPageCompanyInfo | null,
  _moduleLabel: string = '',
): string => {
  const today = toPersianNumber(safeJalaliFormat(new Date().toISOString(), 'YYYY/MM/DD'));
  const imageField = fields.find((f) => String(f?.type || '').toLowerCase() === 'image') || null;
  const titleField =
    fields.find((f) => ['address', 'name', 'title', 'business_name'].includes(String(f?.key || ''))) ||
    fields.find((f) => f !== imageField) ||
    null;
  const detailFields = fields.filter((f) => f !== imageField && f !== titleField);

  const companyLogoUrl = escapeHtml(companyInfo?.logo_url || '');
  const companyName = escapeHtml(companyInfo?.company_full_name || '');
  const slogan = escapeHtml(companyInfo?.slogan || companyInfo?.trade_name || '');
  const companyPhone = escapeHtml(companyInfo?.phone || '');
  const companyEmail = escapeHtml(companyInfo?.email || '');
  const companyWebsite = escapeHtml(companyInfo?.website || '');
  const companyAddress = escapeHtml(companyInfo?.address || '');
  const watermarkText = escapeHtml(companyInfo?.company_name_en || companyInfo?.trade_name || companyInfo?.company_full_name || '');

  if (!rows.length) {
    return `<div style="direction:rtl; padding:18px; text-align:center; color:#64748b; font-family:inherit;">داده‌ای برای چاپ انتخاب نشده است.</div>`;
  }

  return rows
    .map((row, index) => {
      const imageUrl = imageField ? escapeHtml(getCatalogPrintImageUrl(row?.[imageField.key])) : '';
      const titleValue = titleField
        ? escapeHtml(formatListCellValue(titleField, row, relationOptions, currencyLabel))
        : '';

      // Sidebar fields: key-value rows (exclude image, title, code fields, long text)
      let sidebarRowIdx = 0;
      const sidebarRows = detailFields
        .filter((f) => !/code/i.test(String(f?.key || '')))
        .map((f) => {
          let val = formatListCellValue(f, row, relationOptions, currencyLabel);
          if (!String(val || '').trim() || val === '-') return '';
          // Move currency unit from start to end ("تومان ۱,۰۰۰" → "۱,۰۰۰ تومان")
          for (const unit of ['تومان', 'ریال']) {
            if (val.startsWith(unit + ' ') || val.startsWith(unit + '\u00a0')) {
              val = val.slice(unit.length + 1).trim() + ' ' + unit;
              break;
            }
          }
          const rowBg = sidebarRowIdx++ % 2 === 0 ? 'background:rgba(var(--brand-50-rgb,239,246,255),0.55);' : 'background:#fff;';
          return `<div style="display:flex; justify-content:space-between; align-items:center; gap:2mm; padding:1.5mm 2mm; border-radius:4px; margin-bottom:0.8mm; ${rowBg} min-width:0;"><span style="font-size:7.5px; color:#64748b; flex-shrink:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:45%;">${escapeHtml(f.label)}</span><span style="font-size:9px; color:#1e293b; font-weight:800; text-align:left; direction:ltr; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(val)}</span></div>`;
        })
        .filter(Boolean);
      const sidebarFieldsHtml = sidebarRows.join('');

      // Code fields: "Label: Value · Label2: Value2" for image overlay
      const codeParts = detailFields
        .filter((f) => /code/i.test(String(f?.key || '')))
        .map((f) => {
          const val = formatListCellValue(f, row, relationOptions, currencyLabel);
          if (!String(val || '').trim() || val === '-') return '';
          return `<span style="display:inline-flex; align-items:baseline; gap:4px; direction:rtl; unicode-bidi:isolate;"><span>${escapeHtml(f.label)}:</span><span style="direction:ltr; unicode-bidi:isolate; font-family:monospace;">${escapeHtml(val)}</span></span>`;
        })
        .filter(Boolean);
      const codeFieldsHtml = codeParts.join(' <span style="color:rgba(255,255,255,0.38); margin:0 4px;">·</span> ');
      const publicLink = String(row?.catalog_link || '').trim();
      const qrSectionHtml = publicLink
        ? `<div style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:2mm; gap:1mm; background:#fff; box-sizing:border-box; overflow:hidden;"><div style="font-size:6px; font-weight:800; color:rgb(var(--brand-600-rgb,37,99,235)); letter-spacing:0.4px; text-align:center; flex-shrink:0;">QR کاتالوگ</div><div style="background:#fff; border:1.5px solid rgb(var(--brand-200-rgb,191,219,254)); border-radius:8px; padding:3px; box-shadow:0 1px 6px rgba(59,130,246,0.1); flex-shrink:0;">${renderToStaticMarkup(React.createElement(QRCode, { value: publicLink, type: 'svg', size: 56, bordered: false }))}</div><a href="${escapeHtml(publicLink)}" target="_blank" style="display:block; font-size:5px; color:rgb(var(--brand-500-rgb,59,130,246)); text-decoration:none; text-align:center; direction:ltr; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; border:1px solid rgb(var(--brand-100-rgb,219,234,254)); border-radius:4px; padding:1px 3px; background:rgb(var(--brand-50-rgb,239,246,255)); box-sizing:border-box; flex-shrink:0;">${escapeHtml(publicLink.length > 32 ? `${publicLink.slice(0, 30)}…` : publicLink)}</a></div>`
        : '';
      const mapImageUrl = getCatalogPrintImageUrl(row?.location_image);
      let mapSectionHtml = '';
      if (mapImageUrl) {
        let googleUrl = '#';
        let locationText = '';
        const locationRaw = row?.location;
        let parsedLocation: any = null;
        if (locationRaw && typeof locationRaw === 'object') parsedLocation = locationRaw;
        if (locationRaw && typeof locationRaw === 'string') {
          try {
            parsedLocation = JSON.parse(locationRaw);
          } catch {
            parsedLocation = null;
          }
        }
        if (parsedLocation && typeof parsedLocation.lat === 'number' && typeof parsedLocation.lng === 'number') {
          googleUrl = `https://www.google.com/maps?q=${parsedLocation.lat},${parsedLocation.lng}`;
          locationText = `${parsedLocation.lat.toFixed(4)}, ${parsedLocation.lng.toFixed(4)}`;
        }
        mapSectionHtml = `<a href="${escapeHtml(googleUrl)}" target="_blank" style="display:block; width:100%; height:100%; position:relative; overflow:hidden; text-decoration:none;"><div style="position:absolute; inset:0; background-image:url('${escapeHtml(mapImageUrl)}'); background-size:cover; background-position:center;"></div><div style="position:absolute; inset:0; background:linear-gradient(to top,rgba(0,0,0,0.65) 0%,transparent 55%);"></div><div style="position:absolute; bottom:0; left:0; right:0; padding:1.5mm 2mm;"><div style="color:#fff; font-size:6px; font-weight:800; text-align:center; text-shadow:0 1px 4px rgba(0,0,0,0.8);">📍 موقعیت مکانی</div>${locationText ? `<div style="color:rgba(255,255,255,0.75); font-size:5px; direction:ltr; font-family:monospace; text-align:center; margin-top:0.5mm;">${escapeHtml(locationText)}</div>` : ''}</div></a>`;
      }

      return buildCatalogFullPageLayout({
        imageUrl,
        primaryTitle: titleValue,
        codeFieldsHtml,
        watermarkText,
        sidebarFieldsHtml,
        logoUrl: companyLogoUrl,
        companyName,
        slogan,
        phone: companyPhone,
        email: companyEmail,
        website: companyWebsite,
        companyAddress,
        todayDate: today,
        qrSectionHtml,
        mapSectionHtml,
        isFirstPage: index === 0,
      });
    })
    .join('\n');
};

export const escapeCsvCell = (value: any) => {
  const normalized = String(value ?? '').replace(/"/g, '""');
  return `"${normalized}"`;
};
