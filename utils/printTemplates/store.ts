import { MODULES } from '../../moduleRegistry';
import { BlockType } from '../../types';
import { supabase } from '../../supabaseClient';
import { getCachedAuthUser } from '../sessionCache';
import { getResolvedCurrentOrgId } from '../companySettings';
import { loadScopedIntegrationSettings } from '../integrationSettings';
import { attachAbortSignalIfSupported, runWithSupabaseTimeout } from '../supabaseTimeout';
import { buildCatalogFullPageLayout } from './catalogFullPageLayout';
import { DEFAULT_PRINT_IMAGE_DISPLAY_MODE, type PrintImageDisplayMode } from './imageDisplay';
import { buildDefaultPrintFooterTemplate } from './footerLayout';
import { getFieldLabelFa } from '../fieldLabel';
import { getCanonicalModuleFields } from '../recordVariableCatalog';
import { getPrintVariableProviderOptions } from './variableProviders';
import { isPrintableModuleField } from './printableFields';

export const PRINT_TEMPLATES_CONNECTION_TYPE = 'print_templates';
const PRINT_TEMPLATES_LOCAL_KEY = 'kalamapp.print_templates.v1';
const PRINT_TEMPLATES_SAVE_TIMEOUT_MS = 15_000;

export interface StoredPrintTemplate {
  id: string;
  title: string;
  description?: string;
  moduleId: string;
  scope?: 'record' | 'list';
  headerHtml?: string;
  contentHtml: string;
  footerHtml?: string;
  isActive: boolean;
  showHeader?: boolean;
  showFooter?: boolean;
  headerHeight?: number;
  footerHeight?: number;
  pageMarginTop?: number;
  pageMarginRight?: number;
  pageMarginBottom?: number;
  pageMarginLeft?: number;
  paperSize?: 'A4' | 'A5' | 'A6';
  orientation?: 'portrait' | 'landscape';
  isSystem?: boolean;
  selectedFieldKeys?: string[];
  renderMode?: 'standard' | 'org_letterhead';
  backgroundImageUrl?: string | null;
  backgroundSizing?: 'fit';
  sourceTemplateId?: string | null;
  letterheadId?: string | null;
  isVirtual?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrintTemplateVariableOption {
  label: string;
  value: string;
  kind: 'field' | 'block';
  group: string;
  description?: string;
  insertHtml?: string;
  scopes?: Array<'record' | 'list'>;
}

export interface SystemTemplateFieldOption {
  key: string;
  label: string;
  group: string;
  kind: 'record' | 'table';
  blockId?: string;
  columnKey?: string;
}

type PrintTemplatesStore = {
  modules: Record<string, StoredPrintTemplate[]>;
};

const nowIso = () => new Date().toISOString();
const DEFAULT_PAGE_MARGINS = {
  top: 8,
  right: 8,
  bottom: 8,
  left: 8,
} as const;
const PRINT_COLUMN_IGNORE_KEYS = new Set(['id', 'key', 'created_at', 'updated_at']);
const INVOICE_MODULE_IDS = new Set(['invoices', 'purchase_invoices']);
const LONG_TEXT_FIELD_TYPES = new Set(['long_text', 'superlongtext']);
const CATALOG_FULL_PAGE_MODULE_IDS = new Set(['products', 'billboards', 'price_lists', 'product_bundles']);

export const isCatalogFullPageAvailableForModule = (moduleId: string) =>
  CATALOG_FULL_PAGE_MODULE_IDS.has(String(moduleId || '').trim());

export const isCatalogFullPagePrintTemplate = (template: Pick<StoredPrintTemplate, 'id' | 'contentHtml'> | null | undefined) => {
  const templateId = String(template?.id || '').trim();
  const contentHtml = String(template?.contentHtml || '');
  return /_catalog_fullpage_(list_)?landscape$/i.test(templateId) || contentHtml.includes('system.list_catalog_fullpage');
};

export const isPrintTemplateAvailableForModule = (
  moduleId: string,
  template: Pick<StoredPrintTemplate, 'id' | 'contentHtml'> | null | undefined,
) => !isCatalogFullPagePrintTemplate(template) || isCatalogFullPageAvailableForModule(moduleId);

const toRecord = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

const getCompactPrintColumns = (columns: any[] = []) => {
  const filtered = columns.filter((column) => {
    const key = String(column?.key || '').trim();
    const title = String(column?.title || '').trim();
    if (!key || !title) return false;
    if (PRINT_COLUMN_IGNORE_KEYS.has(key)) return false;
    return true;
  });
  const selected = filtered.slice(0, 5);
  const totalPriceColumn = filtered.find((column) => String(column?.key || '').trim() === 'total_price');
  if (totalPriceColumn && !selected.some((column) => String(column?.key || '').trim() === 'total_price')) {
    selected.push(totalPriceColumn);
  }
  return selected;
};

const isInvoiceModule = (moduleId: string) => INVOICE_MODULE_IDS.has(moduleId);
const MULTILINE_PRINT_STYLE = 'white-space:pre-wrap; word-break:break-word; overflow-wrap:anywhere;';
const isLongTextType = (value: unknown) => LONG_TEXT_FIELD_TYPES.has(String(value || '').trim().toLowerCase());
const getReducedPrintFontSize = (baseSize: number) => {
  const nextSize = Math.max(7, baseSize - 3);
  return Number.isInteger(nextSize) ? `${nextSize}px` : `${nextSize.toFixed(1)}px`;
};
const getLongTextPrintStyle = (baseSize: number) => `font-size:${getReducedPrintFontSize(baseSize)}; line-height:1.9; ${MULTILINE_PRINT_STYLE}`;

const getModuleBlockTitleMap = (module: any) =>
  new Map(
    (Array.isArray(module?.blocks) ? module.blocks : [])
      .filter((block: any) => block?.id)
      .map((block: any) => [String(block.id), String(block?.titles?.fa || block.id)])
  );

const getFieldGroupLabel = (module: any, field: any) => {
  const blockId = String(field?.blockId || '').trim();
  const isBlockField = String(field?.location || '').trim().toLowerCase() === 'block' && blockId;
  if (!isBlockField) return 'فیلدهای عمومی';
  const blockTitle = getModuleBlockTitleMap(module).get(blockId) || blockId;
  return `بخش: ${blockTitle}`;
};

const shouldIncludeSystemField = (selectedFieldKeys: string[] = [], fieldKey: string) => {
  if (!selectedFieldKeys.length) return true;
  return selectedFieldKeys.includes(fieldKey);
};

const buildCompactFieldsTemplateForCopy = (moduleId: string, selectedFieldKeys: string[] = []) => {
  const module = MODULES[moduleId];
  if (!module) return '';

  const regularRows: string[] = [];
  const longTextRows: string[] = [];

  (module.fields || [])
    .filter((field: any) => {
      const key = String(field?.key || '').trim();
      if (!key) return false;
      if (PRINT_COLUMN_IGNORE_KEYS.has(key)) return false;
      if (!isPrintableModuleField(module, field)) return false;
      return shouldIncludeSystemField(selectedFieldKeys, `record.${key}`);
    })
    .forEach((field: any) => {
      const key = String(field?.key || '').trim();
      const isImageField = String(field?.type || '').toLowerCase() === 'image';
      const token = isImageField
        ? `<div style="display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--table-border-color, #d1d5db);border-radius:12px;padding:4px;background:#fff;"><img src="{{record.${key}}}" alt="${field.labels?.fa || key}" style="display:block;width:64px;height:64px;max-width:64px;max-height:64px;object-fit:cover;border-radius:8px;" /></div>`
        : `{{record.${key}}}`;
      if (isImageField) {
        regularRows.push(`
        <tr>
          <td style="width:38%; border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">${field.labels?.fa || key}</td>
          <td style="border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px; text-align:center;">${token}</td>
        </tr>
      `);
        return;
      }
      if (isLongTextType(field?.type)) {
        longTextRows.push(`
<div style="margin-top:8px;">
  <div style="margin:0 0 3px 0; font-size:10px; color:#64748b;">${field.labels?.fa || key}</div>
  <div style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 7px; background:#fff; ${getLongTextPrintStyle(11)}">${token}</div>
</div>`.trim());
        return;
      }
      regularRows.push(`
        <tr>
          <td style="width:38%; border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">${field.labels?.fa || key}</td>
          <td style="border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px;">${token}</td>
        </tr>
      `);
    });

  return [
    regularRows.length
      ? `
<table style="width:100%; border-collapse:collapse; font-size:11px;">
  <tbody>${regularRows.join('')}</tbody>
</table>`.trim()
      : '',
    longTextRows.join(''),
  ]
    .filter(Boolean)
    .join('\n');
};

const buildCompactTablesBlocksTemplateForCopy = (moduleId: string, selectedFieldKeys: string[] = []) => {
  const module = MODULES[moduleId];
  if (!module) return '';
  return (module.blocks || [])
    .filter((block: any) => {
      if (!(block?.type === BlockType.TABLE || block?.type === BlockType.GRID_TABLE)) return false;
      const blockKey = `block.${String(block?.id || '').trim()}`;
      if (!selectedFieldKeys.length) return true;
      return selectedFieldKeys.includes(blockKey) || selectedFieldKeys.some((key) => key.startsWith(`${blockKey}.`));
    })
    .map((block: any) => buildBlockSnippetTemplate(moduleId, String(block.id || '').trim()))
    .filter(Boolean)
    .join('\n');
};

const buildPackageSummaryTemplateForCopy = (moduleId: string) => {
  if (moduleId !== 'product_bundles') return '';
  return `
<table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:11px;">
  <tbody>
    <tr>
      <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.36);">جمع قبل از تخفیف</td>
      <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.package_gross_total}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
      <td style="width:25%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.24);">جمع تخفیف</td>
      <td style="width:25%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.package_discount_total}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
    </tr>
    <tr>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:800; background:rgba(var(--brand-500-rgb),0.08);">مبلغ نهایی پکیج</td>
      <td colspan="3" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:800;">{{record.package_final_total}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
    </tr>
  </tbody>
</table>`.trim();
};

const getInvoiceTemplateConfig = (moduleId: string) => {
  const isSales = moduleId === 'invoices';
  return {
    isSales,
    counterpartyRoot: isSales ? 'customer' : 'supplier',
    counterpartyTitle: isSales ? 'خریدار' : 'فروشنده',
    companyTitle: isSales ? 'فروشنده' : 'خریدار',
    paymentsTitle: isSales ? 'دریافت‌ها' : 'پرداخت‌ها',
    paymentTypeTitle: isSales ? 'نوع دریافت' : 'نوع پرداخت',
    paymentTotalTitle: isSales ? 'جمع دریافتی‌ها' : 'جمع پرداختی‌ها',
    remainingTitle: isSales ? 'جمع باقیمانده' : 'مانده بدهی',
    officialTitle: isSales ? 'فاکتور فروش رسمی' : 'فاکتور خرید رسمی',
    unofficialTitle: isSales ? 'فاکتور فروش غیررسمی' : 'فاکتور خرید غیررسمی',
    practicalA5Title: isSales ? 'فاکتور کاربردی A5 فروش' : 'فاکتور کاربردی A5 خرید',
    practicalA4Title: isSales ? 'فاکتور کاربردی A4 فروش' : 'فاکتور کاربردی A4 خرید',
  };
};

const buildInvoiceItemsSummaryRow = () => `
    <tr data-print-optional-field="record.global_discount_amount">
      <td colspan="2" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 7px; font-weight:800; background:rgba(var(--brand-50-rgb),0.52); vertical-align:middle; text-align:center;">تخفیف کل</td>
      <td colspan="5" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 7px; font-weight:700; background:rgba(var(--brand-50-rgb),0.3); vertical-align:middle; text-align:center;">
        <div style="${MULTILINE_PRINT_STYLE}">{{record.global_discount_display}}</div>
      </td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 7px; font-weight:900; background:#fff; text-align:center; vertical-align:middle;">-{{record.global_discount_amount}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
    </tr>
    <tr>
      <td colspan="2" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 7px; font-weight:800; background:rgba(var(--brand-50-rgb),0.68); vertical-align:middle; text-align:center;">جمع کل</td>
      <td colspan="5" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 7px; font-weight:700; background:rgba(var(--brand-50-rgb),0.38); vertical-align:middle; text-align:center;">
        <div style="${MULTILINE_PRINT_STYLE}">{{record.total_invoice_amount_words}}</div>
      </td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 7px; font-weight:900; background:rgba(var(--brand-500-rgb),0.08); text-align:center; vertical-align:middle;">{{record.total_invoice_amount}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
    </tr>
`;

const buildInvoicePaymentsSummaryRow = (paymentSummaryTitle: string, remainingSummaryTitle: string) => `
    <tr>
      <td colspan="2" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 5px; font-weight:800; background:rgba(var(--brand-50-rgb),0.62);">${paymentSummaryTitle}</td>
      <td colspan="2" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 5px; font-weight:800; background:rgba(var(--brand-500-rgb),0.08); text-align:center;">{{record.total_received_amount}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
      <td colspan="2" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 5px; font-weight:800; background:rgba(var(--brand-50-rgb),0.62);">${remainingSummaryTitle}</td>
      <td colspan="3" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 5px; font-weight:800; background:rgba(var(--brand-500-rgb),0.08); text-align:center;">{{record.remaining_balance}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
    </tr>
`;

const readLocalStore = (): PrintTemplatesStore => {
  if (typeof window === 'undefined') return { modules: {} };
  try {
    const raw = window.localStorage.getItem(PRINT_TEMPLATES_LOCAL_KEY);
    if (!raw) return { modules: {} };
    const parsed = JSON.parse(raw);
    return { modules: toRecord(parsed?.modules) };
  } catch {
    return { modules: {} };
  }
};

const writeLocalStore = (templatesByModule: Record<string, StoredPrintTemplate[]>) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    PRINT_TEMPLATES_LOCAL_KEY,
    JSON.stringify({
      modules: templatesByModule,
      updatedAt: nowIso(),
    })
  );
};

export const getModuleTitle = (moduleId: string, mode: 'plural' | 'singular' = 'plural') => {
  const module = MODULES[moduleId];
  if (!module) return '';
  if (mode === 'singular') {
    return String((module.titles as any)?.faSingular || module.titles?.fa || '').trim();
  }
  return String(module.titles?.fa || '').trim();
};

const buildInvoiceFooterTemplate = () => buildDefaultFooterTemplateForModule('invoices');

const buildOfficialLetterHeaderTemplate = () => `
<div style="width:100%; direction:rtl; color:#111827; font-size:12px; font-family:inherit;">
  <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:2px 2px 10px 2px; border-bottom:1px solid rgba(17,24,39,0.28);">
    <div style="width:32%; text-align:right; font-size:10.5px; line-height:1.9; color:#374151;">
      <div><span style="font-weight:700;">شماره:</span> {{record.system_code}}</div>
      <div><span style="font-weight:700;">تاریخ:</span> {{record.document_date}}</div>
      <div><span style="font-weight:700;">پیوست:</span> {{record.attachment_count}}</div>
    </div>
    <div style="width:36%; text-align:center; line-height:1.9;">
      <div style="font-weight:800; font-size:13px; margin-bottom:2px;">بسمه تعالی</div>
      <img src="{{company.logo_url}}" alt="لوگو" style="display:block; margin:0 auto 2px auto; width:48px; height:48px; max-width:48px; max-height:48px; object-fit:contain;" />
      <div style="font-weight:900; font-size:14px; color:#111827; overflow-wrap:anywhere;">{{company.company_full_name}}</div>
      <div style="font-size:10px; color:#6b7280; overflow-wrap:anywhere;">{{company.trade_name}}</div>
      <div style="font-size:9px; color:#6b7280; overflow-wrap:anywhere;">زمان چاپ: {{system.print_date}}</div>
    </div>
    <div style="width:32%;"></div>
  </div>
</div>
`.trim();

export const buildDefaultHeaderTemplateForModule = (moduleId: string) => {
  const singularTitle = getModuleTitle(moduleId, 'singular') || 'سند';

  return `
<table style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; direction:rtl; color:#111827; font-size:12px; border:1px solid rgba(148,163,184,0.28); border-radius:18px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:34%; vertical-align:top; text-align:right; border:none; padding:10px; background:rgba(var(--brand-50-rgb),0.42); overflow-wrap:anywhere;">
        <div style="display:flex; align-items:flex-start; gap:8px;">
          <img src="{{company.logo_url}}" alt="لوگو" style="display:block; width:48px; height:48px; max-width:48px; max-height:48px; object-fit:contain;" />
          <div style="min-width:0;">
            <div style="font-weight:700; font-size:13px; line-height:1.8; overflow-wrap:anywhere;">{{company.company_full_name}}</div>
            <div style="font-size:11px; color:#6b7280; line-height:1.8; overflow-wrap:anywhere;">{{company.trade_name}}</div>
          </div>
        </div>
      </td>
      <td style="width:32%; vertical-align:middle; text-align:center; border:none; padding:10px 8px; background:rgba(var(--brand-500-rgb),0.08); overflow-wrap:anywhere;">
        <div style="font-weight:800; font-size:17px; line-height:1.8; color:rgb(var(--brand-500-rgb));">${singularTitle}</div>
      </td>
      <td style="width:34%; vertical-align:top; text-align:right; border:none; padding:10px; background:rgba(var(--brand-50-rgb),0.42); overflow-wrap:anywhere;">
        <div style="display:flex; flex-direction:column; gap:4px; font-size:12px; line-height:1.8;">
          <div>زمان چاپ: {{system.print_date}}</div>
          <div>تاریخ: {{record.invoice_date}}</div>
          <div>شماره: {{record.system_code}}</div>
        </div>
      </td>
    </tr>
  </tbody>
</table>
`;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const buildDefaultFooterTemplateForModule = (_moduleId = '') => `
${buildDefaultPrintFooterTemplate()}
`;

const buildBlockSnippetTemplate = (moduleId: string, blockId: string) => {
  const invoiceConfig = getInvoiceTemplateConfig(moduleId);

  if (blockId === 'invoiceItems') {
    return `
<table data-print-block="invoiceItems" style="width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; direction:rtl; color:#111827; font-size:9.8px;">
  <thead>
    <tr style="background:rgba(var(--brand-500-rgb),0.12);">
      <th style="width:5%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">ردیف</th>
      <th style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">کالا / شرح</th>
      <th style="width:8%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">تعداد</th>
      <th style="width:8%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">واحد</th>
      <th style="width:14%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">قیمت واحد</th>
      <th style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">تخفیف</th>
      <th style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">ارزش افزوده</th>
      <th style="width:15%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">جمع ردیف</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.__row_index__}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; vertical-align:top; word-break:break-word; overflow-wrap:anywhere;">
        <div style="font-weight:700;">{{row.product_id}}</div>
        <div style="margin-top:2px; font-size:${getReducedPrintFontSize(9.8)}; color:#64748b; line-height:1.7; ${MULTILINE_PRINT_STYLE}">{{row.__invoice_item_meta__}}</div>
      </td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.quantity}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.main_unit}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.unit_price}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.__discount_amount__}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.vat}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.total_price}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
    </tr>
    ${buildInvoiceItemsSummaryRow()}
  </tbody>
</table>
`;
  }

  if (blockId === 'payments') {
    const paymentSummaryTitle = invoiceConfig.isSales ? 'جمع دریافت‌شده' : 'جمع پرداخت‌شده';
    return `
<table data-print-block="payments" style="width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; direction:rtl; color:#111827; font-size:9.6px;">
  <thead>
    <tr style="background:rgba(var(--brand-500-rgb),0.12);">
      <th style="width:5%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">ردیف</th>
      <th style="width:13%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">${invoiceConfig.paymentTypeTitle}</th>
      <th style="width:12%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">شماره چک</th>
      <th style="width:12%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">سررسید</th>
      <th style="width:11%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">بانک</th>
      <th style="width:11%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">تاریخ</th>
      <th style="width:14%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">مبلغ</th>
      <th style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">وضعیت</th>
      <th style="width:12%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">توضیحات</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.__row_index__}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.payment_type}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.cheque_serial_no}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.cheque_due_date}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.cheque_bank_name}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.date}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.amount}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.cheque_status}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; word-break:break-word; overflow-wrap:anywhere; ${getLongTextPrintStyle(9.6)}">{{row.description}}</td>
    </tr>
    ${buildInvoicePaymentsSummaryRow(paymentSummaryTitle, 'جمع باقیمانده')}
  </tbody>
</table>
`;
  }

  if (moduleId === 'product_bundles' && blockId === 'products') {
    return `
<table data-print-block="products" style="width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; direction:rtl; color:#111827; font-size:9.8px;">
  <thead>
    <tr style="background:rgba(var(--brand-500-rgb),0.12);">
      <th style="width:6%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">ردیف</th>
      <th style="width:36%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">کالا / شرح</th>
      <th style="width:11%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">تعداد</th>
      <th style="width:11%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">واحد</th>
      <th style="width:14%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">قیمت واحد</th>
      <th style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">تخفیف</th>
      <th style="width:12%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">مبلغ نهایی</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.__row_index__}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; vertical-align:top; word-break:break-word; overflow-wrap:anywhere;">
        <div style="font-weight:700;">{{row.product_id}}</div>
        <div style="margin-top:2px; font-size:${getReducedPrintFontSize(9.8)}; color:#64748b; line-height:1.7; ${MULTILINE_PRINT_STYLE}">{{row.__invoice_item_meta__}}</div>
      </td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.quantity}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.main_unit}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.unit_price}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.discount}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.total_price}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
    </tr>
  </tbody>
</table>
`;
  }

  if (moduleId === 'price_lists' && blockId === 'items') {
    return `
<table data-print-block="items" style="width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; direction:rtl; color:#111827; font-size:9.8px;">
  <thead>
    <tr style="background:rgba(var(--brand-500-rgb),0.12);">
      <th style="width:6%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">ردیف</th>
      <th style="width:34%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">کالا / شرح</th>
      <th style="width:15%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">قیمت خرید</th>
      <th style="width:11%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">درصد سود</th>
      <th style="width:15%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">مبلغ نهایی</th>
      <th style="width:9%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">واحد پول</th>
      <th style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">واحد</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.__row_index__}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; vertical-align:top; word-break:break-word; overflow-wrap:anywhere;">
        <div style="font-weight:700;">{{row.product_id}}</div>
        <div style="margin-top:2px; font-size:${getReducedPrintFontSize(9.8)}; color:#64748b; line-height:1.7; ${MULTILINE_PRINT_STYLE}">{{row.__invoice_item_meta__}}</div>
      </td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.buy_price}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.profit_percentage}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.price}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.currency_label}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.unit_name}}</td>
    </tr>
  </tbody>
</table>
`;
  }

  const module = MODULES[moduleId];
  const block = module?.blocks?.find((item) => item.id === blockId);
  if (!block || !Array.isArray(block.tableColumns) || block.tableColumns.length === 0) return '';
  const columns = getCompactPrintColumns(block.tableColumns);
  if (columns.length === 0) return '';
  const header = columns
    .map((column) => `<th style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; overflow-wrap:anywhere;">${column.title}</th>`)
    .join('');
  const row = columns
    .map((column) => {
      const isLongTextColumn =
        isLongTextType(column?.type) ||
        ['description', 'notes'].includes(String(column?.key || '').trim().toLowerCase());
      return `<td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; overflow-wrap:anywhere; ${isLongTextColumn ? `vertical-align:top; ${getLongTextPrintStyle(10.5)}` : ''}">{{row.${column.key}}}</td>`;
    })
    .join('');
  return `
<table data-print-block="${blockId}" style="width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; direction:rtl; color:#111827; font-size:10.5px;">
  <thead><tr>${header}</tr></thead>
  <tbody><tr>${row}</tr></tbody>
</table>
`;
};

const normalizeTemplate = (raw: any, moduleId: string): StoredPrintTemplate | null => {
  const title = String(raw?.title || '').trim();
  const contentHtml = String(raw?.contentHtml || raw?.content_html || '').trim();
  if (!title || !contentHtml) return null;

  const id = String(raw?.id || '').trim() || `${moduleId}_${Math.random().toString(36).slice(2, 10)}`;
  const createdAt = String(raw?.createdAt || raw?.created_at || nowIso());
  const updatedAt = String(raw?.updatedAt || raw?.updated_at || nowIso());
  const paperSizeRaw = String(raw?.paperSize || raw?.paper_size || 'A4').toUpperCase();
  const paperSize = paperSizeRaw === 'A5' || paperSizeRaw === 'A6' ? paperSizeRaw : 'A4';
  const orientationRaw = String(raw?.orientation || 'portrait').toLowerCase();
  const orientation = orientationRaw === 'landscape' ? 'landscape' : 'portrait';
  const scopeRaw = String(raw?.scope || raw?.templateScope || 'record').toLowerCase();
  const scope = scopeRaw === 'list' ? 'list' : 'record';
  const selectedFieldKeys: string[] = Array.isArray(raw?.selectedFieldKeys)
    ? Array.from(
        new Set<string>(
          raw.selectedFieldKeys
            .map((value: any) => String(value || '').trim())
            .filter(Boolean)
        )
      )
    : [];
  const isSystem =
    raw?.isSystem === true ||
    raw?.is_system === true ||
    String(id).startsWith('default_');
  const footerHtml = String(raw?.footerHtml || raw?.footer_html || '').trim();
  const renderMode = String(raw?.renderMode || raw?.render_mode || 'standard').trim() === 'org_letterhead'
    ? 'org_letterhead'
    : 'standard';
  const backgroundImageUrl = String(raw?.backgroundImageUrl || raw?.background_image_url || '').trim() || null;
  const sourceTemplateId = String(raw?.sourceTemplateId || raw?.source_template_id || '').trim() || null;
  const letterheadId = String(raw?.letterheadId || raw?.letterhead_id || '').trim() || null;

  return {
    id,
    title,
    description: String(raw?.description || ''),
    moduleId,
    scope,
    headerHtml: String(raw?.headerHtml || raw?.header_html || '').trim() || buildDefaultHeaderTemplateForModule(moduleId),
    contentHtml,
    footerHtml: footerHtml || buildDefaultFooterTemplateForModule(moduleId),
    isActive: raw?.isActive !== false,
    showHeader: raw?.showHeader !== false,
    showFooter: raw?.showFooter !== false,
    headerHeight: Number(raw?.headerHeight || raw?.header_height || 84),
    footerHeight: Number(raw?.footerHeight || raw?.footer_height || 62),
    pageMarginTop: Number(raw?.pageMarginTop ?? raw?.page_margin_top ?? DEFAULT_PAGE_MARGINS.top),
    pageMarginRight: Number(raw?.pageMarginRight ?? raw?.page_margin_right ?? DEFAULT_PAGE_MARGINS.right),
    pageMarginBottom: Number(raw?.pageMarginBottom ?? raw?.page_margin_bottom ?? DEFAULT_PAGE_MARGINS.bottom),
    pageMarginLeft: Number(raw?.pageMarginLeft ?? raw?.page_margin_left ?? DEFAULT_PAGE_MARGINS.left),
    paperSize,
    orientation,
    isSystem,
    selectedFieldKeys,
    renderMode,
    backgroundImageUrl,
    backgroundSizing: backgroundImageUrl ? 'fit' : undefined,
    sourceTemplateId,
    letterheadId,
    isVirtual: raw?.isVirtual === true,
    createdAt,
    updatedAt,
  };
};

const normalizeStore = (settings: any): Record<string, StoredPrintTemplate[]> => {
  const store = toRecord(settings) as PrintTemplatesStore;
  const modules = toRecord(store.modules);
  const result: Record<string, StoredPrintTemplate[]> = {};

  Object.entries(modules).forEach(([moduleId, rawList]) => {
    if (!Array.isArray(rawList)) return;
    const normalized = rawList
      .map((item) => normalizeTemplate(item, moduleId))
      .filter((item): item is StoredPrintTemplate => !!item);
    result[moduleId] = normalized;
  });

  return result;
};

/**
 * قالب‌های سیستمی در زمان بارگذاری از تعریف ماژول ساخته می‌شوند. ذخیرهٔ دوبارهٔ آن‌ها
 * برای هر ماژول، اندازهٔ ردیف تنظیمات را بی‌دلیل بزرگ می‌کرد و باعث کندی ذخیره می‌شد.
 */
export const getPersistedPrintTemplatesByModule = (
  templatesByModule: Record<string, StoredPrintTemplate[]>
): Record<string, StoredPrintTemplate[]> => {
  const result: Record<string, StoredPrintTemplate[]> = {};

  Object.entries(templatesByModule || {}).forEach(([moduleId, templates]) => {
    if (!Array.isArray(templates)) return;
    const customTemplates = templates.filter((template) => template?.isSystem !== true);
    if (customTemplates.length > 0) {
      result[moduleId] = customTemplates;
    }
  });

  return result;
};

export const loadPrintTemplatesStore = async () => {
  try {
    const { data, error, scope } = await loadScopedIntegrationSettings(supabase as any, {
      connectionType: PRINT_TEMPLATES_CONNECTION_TYPE,
      columns: 'id, provider, settings',
    });
    const row = data as Record<string, any> | null | undefined;

    if (error) {
      const code = String((error as any)?.code || '').toUpperCase();
      const messageText = String((error as any)?.message || '').toLowerCase();
      const isMissingRow = code === 'PGRST116' || messageText.includes('0 rows');
      if (!isMissingRow) throw error;
    }

    const templatesByModule = normalizeStore(row?.settings || {});
    if (Object.keys(templatesByModule).length > 0) {
      writeLocalStore(templatesByModule);
    }

    return {
      // ردیف fallback عمومی، متعلق به سازمان فعال نیست و نباید در upsert سازمانی
      // به‌عنوان کلید اصلی ارسال شود.
      rowId: scope === 'org' && row?.id ? String(row.id) : null,
      provider: String(row?.provider || 'tiptap'),
      templatesByModule: Object.keys(templatesByModule).length > 0 ? templatesByModule : normalizeStore(readLocalStore()),
      storage: Object.keys(templatesByModule).length > 0 ? 'remote' : 'local',
    };
  } catch {
    const localStore = normalizeStore(readLocalStore());
    return {
      rowId: null,
      provider: 'tiptap',
      templatesByModule: localStore,
      storage: 'local',
    };
  }
};

export const savePrintTemplatesStore = async (params: {
  rowId?: string | null;
  provider?: string;
  templatesByModule: Record<string, StoredPrintTemplate[]>;
}) => {
  const persistedTemplatesByModule = getPersistedPrintTemplatesByModule(params.templatesByModule);
  writeLocalStore(persistedTemplatesByModule);
  const authUser = await getCachedAuthUser(supabase);
  const userId = authUser?.id || null;
  const currentOrgId = await getResolvedCurrentOrgId(supabase as any);

  if (!currentOrgId) {
    return {
      rowId: null,
      storage: 'local' as const,
      errorCode: 'ORG_CONTEXT_MISSING',
      errorMessage: 'سازمان فعال برای ذخیره قالب چاپ مشخص نیست.',
    };
  }

  const payload: Record<string, any> = {
    org_id: currentOrgId,
    connection_type: PRINT_TEMPLATES_CONNECTION_TYPE,
    provider: params.provider || 'tiptap',
    is_active: true,
    updated_by: userId,
    settings: {
      modules: persistedTemplatesByModule,
    },
  };

  try {
    const query = supabase
      .from('integration_settings')
      .upsert(payload, { onConflict: 'org_id,connection_type' })
      .select('id')
      .single();
    const { data, error } = await runWithSupabaseTimeout(
      (signal) => attachAbortSignalIfSupported(query, signal),
      PRINT_TEMPLATES_SAVE_TIMEOUT_MS,
    );

    if (error) throw error;
    return { rowId: data?.id ? String(data.id) : null, storage: 'remote' as const };
  } catch (error) {
    const errorCode = String((error as any)?.code || '');
    console.error('Print template remote save failed; local fallback kept.', error);
    return {
      rowId: params.rowId || null,
      storage: 'local' as const,
      errorCode,
      errorMessage: String((error as any)?.message || error || 'unknown'),
    };
  }
};

export const buildPrintTemplateVariablesForModule = (module: any): PrintTemplateVariableOption[] => {
  if (!module) return [];

  const seen = new Set<string>();
  const sourceFields = module?.id && MODULES[module.id]
    ? getCanonicalModuleFields(module.id)
    : (module.fields || []);
  return sourceFields
    .filter((field: any) => {
      if (!field?.key) return false;
      if (!isPrintableModuleField(module, field)) return false;
      const path = `record.${field.key}`;
      if (seen.has(path)) return false;
      seen.add(path);
      return true;
    })
    .map((field: any) => ({
      label: getFieldLabelFa(field, { moduleId: module?.id, fallback: field.key }),
      value: `record.${field.key}`,
      kind: 'field' as const,
      group: getFieldGroupLabel(module, field),
      description: `فیلد ${field.labels?.fa || field.key}`,
    }));
};

const buildUniqueFieldOptions = (moduleId: string): PrintTemplateVariableOption[] => {
  return buildPrintTemplateVariablesForModule(MODULES[moduleId]);
};

const buildBlockOptions = (moduleId: string): PrintTemplateVariableOption[] => {
  const module = MODULES[moduleId];
  if (!module) return [];

  return module.blocks
    .filter((block) => block.type === BlockType.TABLE || block.type === BlockType.GRID_TABLE)
    .map((block) => ({
      label: block.titles?.fa || block.id,
      value: `block.${block.id}`,
      kind: 'block' as const,
      group: 'بلاک‌ها',
      description: `بلاک کامل ${block.titles?.fa || block.id}`,
      insertHtml: buildBlockSnippetTemplate(moduleId, block.id),
      scopes: ['record'],
    }));
};

const isOperationalFinancialOverviewModule = (moduleId: string) =>
  /^operational_financial_overview_(customer|supplier|employee)$/i.test(String(moduleId || '').trim());

export const getPrintTemplateVariables = (moduleId: string): PrintTemplateVariableOption[] => {
  const commonFields: PrintTemplateVariableOption[] = [
    { label: 'عنوان مفرد ماژول', value: 'module.title', kind: 'field', group: 'سیستم' },
    { label: 'عنوان جمع ماژول', value: 'module.title_plural', kind: 'field', group: 'سیستم' },
    { label: 'عنوان رکورد', value: 'record.name', kind: 'field', group: 'فیلدهای عمومی' },
    { label: 'کد سیستمی', value: 'record.system_code', kind: 'field', group: 'فیلدهای عمومی' },
    { label: 'تعداد پیوست‌های رکورد', value: 'record.attachment_count', kind: 'field', group: 'فیلدهای عمومی' },
    { label: 'تاریخ ایجاد', value: 'record.created_at', kind: 'field', group: 'فیلدهای عمومی' },
    { label: 'تاریخ آخرین ویرایش', value: 'record.updated_at', kind: 'field', group: 'فیلدهای عمومی' },
    { label: 'ایجادکننده', value: 'record.created_by', kind: 'field', group: 'فیلدهای عمومی' },
    { label: 'آخرین ویرایشگر', value: 'record.updated_by', kind: 'field', group: 'فیلدهای عمومی' },
    { label: 'نام کامل سازمان', value: 'company.company_full_name', kind: 'field', group: 'اطلاعات سازمان' },
    { label: 'نام سازمان', value: 'company.company_name', kind: 'field', group: 'اطلاعات سازمان' },
    { label: 'نام تجاری سازمان', value: 'company.trade_name', kind: 'field', group: 'اطلاعات سازمان' },
    { label: 'لوگوی سازمان', value: 'company.logo_url', kind: 'field', group: 'اطلاعات سازمان' },
    { label: 'شناسه ملی سازمان', value: 'company.national_id', kind: 'field', group: 'اطلاعات سازمان' },
    { label: 'شماره ثبت سازمان', value: 'company.registration_number', kind: 'field', group: 'اطلاعات سازمان' },
    { label: 'کد اقتصادی سازمان', value: 'company.economic_code', kind: 'field', group: 'اطلاعات سازمان' },
    { label: 'واحد پول سازمان', value: 'company.currency_label', kind: 'field', group: 'اطلاعات سازمان' },
    { label: 'کد پستی سازمان', value: 'company.postal_code', kind: 'field', group: 'اطلاعات سازمان' },
    { label: 'تلفن سازمان', value: 'company.phone', kind: 'field', group: 'اطلاعات سازمان' },
    { label: 'آدرس سازمان', value: 'company.address', kind: 'field', group: 'اطلاعات سازمان' },
    { label: 'وب‌سایت سازمان', value: 'company.website', kind: 'field', group: 'اطلاعات سازمان' },
    { label: 'نام مسئول', value: 'responsible.name', kind: 'field', group: 'سیستم' },
    { label: 'تاریخ امروز', value: 'system.today_date', kind: 'field', group: 'سیستم' },
    { label: 'تاریخ و زمان امروز', value: 'system.today_datetime', kind: 'field', group: 'سیستم' },
    { label: 'تاریخ و زمان چاپ', value: 'system.print_date', kind: 'field', group: 'سیستم', scopes: ['record', 'list'] },
    { label: 'جدول فیلدهای دارای مقدار', value: 'system.compact_fields_table', kind: 'field', group: 'سیستم' },
    { label: 'فیلدها بصورت خطی (کاتالوگ)', value: 'system.compact_fields_inline', kind: 'field', group: 'سیستم', scopes: ['record'] },
    { label: 'URL تصویر رکورد', value: 'system.record_image_url', kind: 'field', group: 'سیستم', scopes: ['record'] },
    { label: 'جدول‌های دارای مقدار', value: 'system.compact_tables_blocks', kind: 'field', group: 'سیستم' },
    { label: 'تصویر رکورد', value: 'system.record_image', kind: 'field', group: 'سیستم' },
    { label: 'کد QR رکورد', value: 'system.record_qr', kind: 'field', group: 'سیستم' },
    { label: 'QR کاتالوگ (سایدبار)', value: 'system.catalog_qr_section', kind: 'field', group: 'سیستم', scopes: ['record'] },
    { label: 'نقشه کاتالوگ (سایدبار)', value: 'system.catalog_map_section', kind: 'field', group: 'سیستم', scopes: ['record'] },
    { label: 'فیلدهای سایدبار کاتالوگ', value: 'system.compact_fields_sidebar', kind: 'field', group: 'سیستم', scopes: ['record'] },
    { label: 'فیلدهای کد (روی تصویر)', value: 'system.catalog_code_fields', kind: 'field', group: 'سیستم', scopes: ['record'] },
    { label: 'شعار سازمان', value: 'company.slogan', kind: 'field', group: 'اطلاعات سازمان' },
  ];
  const commonListFields: PrintTemplateVariableOption[] = [
    { label: 'عنوان لیست', value: 'system.list_title', kind: 'field', group: 'لیست چاپی', scopes: ['list'] },
    { label: 'تعداد رکوردهای انتخاب‌شده', value: 'system.selected_count', kind: 'field', group: 'لیست چاپی', scopes: ['list'] },
    { label: 'تاریخ چاپ لیست', value: 'system.print_date', kind: 'field', group: 'لیست چاپی', scopes: ['list'] },
    { label: 'شماره صفحه', value: 'system.page_index', kind: 'field', group: 'لیست چاپی', scopes: ['list'] },
    { label: 'تعداد صفحات', value: 'system.page_count', kind: 'field', group: 'لیست چاپی', scopes: ['list'] },
    { label: 'جدول لیست', value: 'system.list_table', kind: 'field', group: 'لیست چاپی', scopes: ['list'] },
    { label: 'کاتالوگ لیست', value: 'system.list_catalog_a4', kind: 'field', group: 'لیست چاپی', scopes: ['list'] },
    { label: 'کاتالوگ تمام‌صفحه لیست', value: 'system.list_catalog_fullpage', kind: 'field', group: 'لیست چاپی', scopes: ['list'] },
    { label: 'جدول جمع‌بندی لیست', value: 'system.list_summary_table', kind: 'field', group: 'لیست چاپی', scopes: ['list'] },
  ];
  const operationalFinancialSummaryFields: PrintTemplateVariableOption[] = isOperationalFinancialOverviewModule(moduleId)
    ? [
        { label: 'جمع بدهکار', value: 'summary.totalDebit', kind: 'field', group: 'جمع‌بندی وضعیت مالی', scopes: ['list'] },
        { label: 'جمع بستانکار', value: 'summary.totalCredit', kind: 'field', group: 'جمع‌بندی وضعیت مالی', scopes: ['list'] },
        { label: 'مانده نهایی', value: 'summary.finalBalance', kind: 'field', group: 'جمع‌بندی وضعیت مالی', scopes: ['list'] },
        { label: 'مقدار مطلق مانده نهایی', value: 'summary.finalBalanceAmount', kind: 'field', group: 'جمع‌بندی وضعیت مالی', scopes: ['list'] },
        { label: 'ماهیت مانده نهایی', value: 'summary.finalBalanceSide', kind: 'field', group: 'جمع‌بندی وضعیت مالی', scopes: ['list'] },
      ]
    : [];

  const moduleFields = buildUniqueFieldOptions(moduleId);
  const moduleBlocks = buildBlockOptions(moduleId);

  const moduleSpecificExtras = getPrintVariableProviderOptions(moduleId);

  const merged = [...commonFields, ...commonListFields, ...moduleFields, ...moduleBlocks, ...moduleSpecificExtras, ...operationalFinancialSummaryFields];
  const seen = new Set<string>();
  return merged.filter((item) => {
    if (seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  });
};

export const getSystemTemplateFieldOptions = (moduleId: string): SystemTemplateFieldOption[] => {
  const module = MODULES[moduleId];
  return buildSystemTemplateFieldOptionsForModule(module);
};

export const buildSystemTemplateFieldOptionsForModule = (module: any): SystemTemplateFieldOption[] => {
  if (!module) return [];

  const recordFields: SystemTemplateFieldOption[] = (module.fields || [])
    .filter((field: any) => field?.key)
    .filter((field: any) => isPrintableModuleField(module, field))
    .map((field: any) => ({
      key: `record.${field.key}`,
      label: field.labels?.fa || field.key,
      group: getFieldGroupLabel(module, field),
      kind: 'record' as const,
    }));

  const tableColumns: SystemTemplateFieldOption[] = (module.blocks || [])
    .filter((block: any) => block?.id && (block.type === BlockType.TABLE || block.type === BlockType.GRID_TABLE))
    .flatMap((block: any) => {
      const blockTitle = block.titles?.fa || block.id;
      const group = `جدول: ${blockTitle}`;
      const baseOption: SystemTemplateFieldOption = {
        key: `block.${block.id}`,
        label: blockTitle,
        group,
        kind: 'table' as const,
        blockId: block.id,
      };
      const columns = (block.tableColumns || [])
        .filter((column: any) => column?.key)
        .map((column: any) => ({
          key: `block.${block.id}.${column.key}`,
          label: `${column.title || column.key}`,
          group,
          kind: 'table' as const,
          blockId: block.id,
          columnKey: column.key,
        }));
      return [baseOption, ...columns];
    });

  const merged = [...recordFields, ...tableColumns];
  const seen = new Set<string>();
  return merged.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
};

export const buildDefaultTemplateForModule = (moduleId: string): string => {
  const singularTitle = getModuleTitle(moduleId, 'singular') || 'قالب چاپ';

  if (isInvoiceModule(moduleId)) {
    const invoiceConfig = getInvoiceTemplateConfig(moduleId);
    const invoiceItemsBlock = buildBlockSnippetTemplate(moduleId, 'invoiceItems');
    const paymentsBlock = buildBlockSnippetTemplate(moduleId, 'payments');
    return `
<div style="padding:0; box-sizing:border-box; direction:rtl; font-family:inherit; color:#111827; line-height:1.9;">
  <h2 style="margin:0 0 8px 0; font-size:18px; color:rgb(var(--brand-500-rgb));">${singularTitle}</h2>
  <div style="margin-top:8px;">${invoiceItemsBlock}</div>
  <table style="width:100%; border-collapse:collapse; margin-top:8px;">
    <tbody>
      <tr>
        <td style="width:54%; border:1px solid var(--table-border-color, #d1d5db); padding:8px; vertical-align:top;">
          <div style="font-weight:700; margin-bottom:6px;">توضیحات</div>
          <div style="min-height:98px; ${getLongTextPrintStyle(12)}">{{record.description}}</div>
        </td>
        <td style="width:46%; border:1px solid var(--table-border-color, #d1d5db); padding:8px; vertical-align:top;">
          <div style="font-weight:700; margin-bottom:6px;">${invoiceConfig.paymentsTitle}</div>
          ${paymentsBlock}
        </td>
      </tr>
    </tbody>
  </table>
</div>
`;
  }

  return `
<div style="padding:0; box-sizing:border-box; direction:rtl; font-family:inherit; color:#111827; line-height:1.9;">
  <div style="margin:0 0 2px 0; font-size:11px; color:#64748b;">${singularTitle}</div>
  <h2 style="margin:0 0 8px 0; font-size:19px; color:rgb(var(--brand-500-rgb));">{{record.name}}</h2>
  <table style="width:100%; border-collapse:collapse; margin-top:8px;">
    <tbody>
      <tr>
        <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.45);">کد</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.system_code}}</td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:8px;">{{system.compact_fields_table}}</div>
  <div style="margin-top:8px;">{{system.compact_tables_blocks}}</div>
  {{system.package_summary_table}}
</div>
`;
};

const buildCompactA6DefaultTemplate = (moduleId: string, now: string): StoredPrintTemplate => {
  const singularTitle = getModuleTitle(moduleId, 'singular') || getModuleTitle(moduleId) || 'سند';
  return {
    id: `default_${moduleId}_compact_a6`,
    moduleId,
    scope: 'record',
    title: `${singularTitle} - خلاصه A6`,
    description: 'قالب خلاصه برای نمایش فیلدهای دارای مقدار',
    paperSize: 'A6',
    orientation: 'portrait',
    isActive: true,
    isSystem: true,
    showHeader: true,
    showFooter: false,
    headerHeight: 78,
    footerHeight: 0,
    pageMarginTop: 8,
    pageMarginRight: 8,
    pageMarginBottom: 8,
    pageMarginLeft: 8,
    headerHtml: `
<table style="width:100%; border-collapse:collapse; direction:rtl; border:1px solid rgba(148,163,184,0.3); border-radius:12px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:24%; border:none; padding:6px; background:rgba(var(--brand-50-rgb),0.45); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:24px; max-height:24px; object-fit:contain;" />
      </td>
      <td style="width:76%; border:none; padding:6px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:10px; color:#64748b; margin-bottom:2px;">${singularTitle}</div>
        <div style="font-size:13px; font-weight:900; color:rgb(var(--brand-500-rgb)); line-height:1.7;">{{record.name}}</div>
        <div style="font-size:10px;">{{record.system_code}}</div>
        <div style="font-size:9px; color:#64748b; margin-top:2px;">زمان چاپ: {{system.print_date}}</div>
      </td>
    </tr>
  </tbody>
</table>
`,
    contentHtml: `
<div style="direction:rtl; color:#111827; font-family:inherit;">
  <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:6px;">
    {{system.record_image}}
    {{system.record_qr}}
  </div>
  {{system.compact_fields_table}}
  <div style="margin-top:6px;">{{system.compact_tables_blocks}}</div>
  {{system.package_summary_table}}
</div>
`,
    footerHtml: '',
    createdAt: now,
    updatedAt: now,
  };
};

const buildCompactA5DefaultTemplate = (moduleId: string, now: string): StoredPrintTemplate => {
  const singularTitle = getModuleTitle(moduleId, 'singular') || getModuleTitle(moduleId) || 'سند';
  return {
    id: `default_${moduleId}_compact_a5`,
    moduleId,
    scope: 'record',
    title: `${singularTitle} - خلاصه A5`,
    description: 'قالب خلاصه A5 برای نمایش فیلدها و جدول‌های دارای مقدار',
    paperSize: 'A5',
    orientation: 'portrait',
    isActive: true,
    isSystem: true,
    showHeader: true,
    showFooter: false,
    headerHeight: 74,
    footerHeight: 0,
    pageMarginTop: 7,
    pageMarginRight: 7,
    pageMarginBottom: 7,
    pageMarginLeft: 7,
    headerHtml: `
<table style="width:100%; border-collapse:collapse; direction:rtl; border:1px solid rgba(148,163,184,0.3); border-radius:12px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:18%; border:none; padding:6px; background:rgba(var(--brand-50-rgb),0.45); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:28px; max-height:28px; object-fit:contain;" />
      </td>
      <td style="width:82%; border:none; padding:6px 8px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:10px; color:#64748b; margin-bottom:2px;">${singularTitle}</div>
        <div style="font-size:15px; font-weight:900; color:rgb(var(--brand-500-rgb)); line-height:1.8;">{{record.name}}</div>
        <div style="font-size:10px;">{{record.system_code}}</div>
        <div style="font-size:9px; color:#64748b; margin-top:2px;">زمان چاپ: {{system.print_date}}</div>
      </td>
    </tr>
  </tbody>
</table>
`,
    contentHtml: `
<div style="direction:rtl; color:#111827; font-family:inherit;">
  <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:8px;">
    {{system.record_image}}
    {{system.record_qr}}
  </div>
  {{system.compact_fields_table}}
  <div style="margin-top:8px;">{{system.compact_tables_blocks}}</div>
  {{system.package_summary_table}}
</div>
`,
    footerHtml: '',
    createdAt: now,
    updatedAt: now,
  };
};

const buildCompactA4DefaultTemplate = (moduleId: string, now: string): StoredPrintTemplate => {
  const singularTitle = getModuleTitle(moduleId, 'singular') || getModuleTitle(moduleId) || 'سند';
  return {
    id: `default_${moduleId}_compact_a4`,
    moduleId,
    scope: 'record',
    title: `${singularTitle} - خلاصه A4`,
    description: 'قالب خلاصه A4 برای نمایش فیلدها و جدول‌های دارای مقدار',
    paperSize: 'A4',
    orientation: 'portrait',
    isActive: true,
    isSystem: true,
    showHeader: true,
    showFooter: false,
    headerHeight: 78,
    footerHeight: 0,
    pageMarginTop: 10,
    pageMarginRight: 10,
    pageMarginBottom: 10,
    pageMarginLeft: 10,
    headerHtml: `
<table style="width:100%; border-collapse:collapse; direction:rtl; border:1px solid rgba(148,163,184,0.3); border-radius:12px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:14%; border:none; padding:7px; background:rgba(var(--brand-50-rgb),0.45); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:34px; max-height:34px; object-fit:contain;" />
      </td>
      <td style="width:86%; border:none; padding:7px 10px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:11px; color:#64748b; margin-bottom:2px;">${singularTitle}</div>
        <div style="font-size:18px; font-weight:900; color:rgb(var(--brand-500-rgb)); line-height:1.8;">{{record.name}}</div>
        <div style="font-size:11px;">{{record.system_code}}</div>
        <div style="font-size:9px; color:#64748b; margin-top:2px;">زمان چاپ: {{system.print_date}}</div>
      </td>
    </tr>
  </tbody>
</table>
`,
    contentHtml: `
<div style="direction:rtl; color:#111827; font-family:inherit;">
  <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:8px;">
    {{system.record_image}}
    {{system.record_qr}}
  </div>
  {{system.compact_fields_table}}
  <div style="margin-top:8px;">{{system.compact_tables_blocks}}</div>
  {{system.package_summary_table}}
</div>
`,
    footerHtml: '',
    createdAt: now,
    updatedAt: now,
  };
};

const buildListA4DefaultTemplate = (
  moduleId: string,
  now: string,
  orientation: 'portrait' | 'landscape'
): StoredPrintTemplate => {
  const moduleTitle = getModuleTitle(moduleId) || 'فهرست';
  const orientationTitle = orientation === 'landscape' ? 'افقی' : 'عمودی';

  return {
    id: `default_${moduleId}_list_a4_${orientation}`,
    moduleId,
    scope: 'list',
    title: `قالب پرینت جدول A4 ${orientationTitle}`,
    description: `قالب سیستمی جدول ${moduleTitle} در قطع A4 ${orientationTitle}`,
    paperSize: 'A4',
    orientation,
    isActive: true,
    isSystem: true,
    showHeader: true,
    showFooter: true,
    headerHeight: 84,
    footerHeight: 44,
    pageMarginTop: 8,
    pageMarginRight: 8,
    pageMarginBottom: 8,
    pageMarginLeft: 8,
    headerHtml: `
<table style="width:100%; border-collapse:collapse; direction:rtl; border:1px solid rgba(148,163,184,0.3); border-radius:14px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:16%; border:none; padding:8px; background:rgba(var(--brand-50-rgb),0.45); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:34px; max-height:34px; object-fit:contain;" />
      </td>
      <td style="width:54%; border:none; padding:8px 10px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:15px; font-weight:800; color:rgb(var(--brand-500-rgb));">{{system.list_title}}</div>
        <div style="font-size:11px; color:#64748b;">{{company.company_full_name}}</div>
      </td>
      <td style="width:30%; border:none; padding:8px 10px; background:rgba(var(--brand-50-rgb),0.22); text-align:right; font-size:11px; line-height:1.8;">
        <div>تاریخ چاپ: {{system.print_date}}</div>
        <div>تعداد رکورد: {{system.selected_count}}</div>
      </td>
    </tr>
  </tbody>
</table>
`.trim(),
    contentHtml: `
<div style="direction:rtl; color:#111827; font-family:inherit;">
  {{system.list_table}}
  {{system.list_summary_table}}
</div>
`.trim(),
    footerHtml: `
<div style="display:flex; align-items:center; gap:8px; font-size:9px; color:#64748b; direction:rtl; overflow:hidden; flex-wrap:nowrap;">
  <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; font-size:8.5px;">{{company.address}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.phone}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.email}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.website}}</span>
  <span style="white-space:nowrap; flex-shrink:0; border-right:1px solid rgba(148,163,184,0.4); padding-right:8px; margin-right:4px;">صفحه {{system.page_index}} از {{system.page_count}}</span>
</div>
`.trim(),
    createdAt: now,
    updatedAt: now,
  };
};

export const normalizeDynamicBlockTablesHtml = (moduleId: string, html?: string) => {
  const rawHtml = String(html || '').trim();
  if (typeof window === 'undefined' || !rawHtml || !/<table/i.test(rawHtml)) return rawHtml;

  try {
    const detectDynamicBlockId = (table: HTMLTableElement): string => {
      const explicit = String(table.getAttribute('data-print-block') || '').trim();
      if (explicit) return explicit;

      const tableHtml = String(table.innerHTML || '');
      const hasInvoiceItemsShape =
        tableHtml.includes('{{row.__row_index__}}') &&
        tableHtml.includes('{{row.product_id}}') &&
        tableHtml.includes('{{row.quantity}}') &&
        tableHtml.includes('{{row.main_unit}}') &&
        tableHtml.includes('{{row.unit_price}}') &&
        tableHtml.includes('{{row.total_price}}');
      if (hasInvoiceItemsShape) return 'invoiceItems';

      const hasPaymentsShape =
        tableHtml.includes('{{row.__row_index__}}') &&
        tableHtml.includes('{{row.payment_type}}') &&
        tableHtml.includes('{{row.amount}}') &&
        tableHtml.includes('{{row.cheque_status}}');
      if (hasPaymentsShape) return 'payments';

      return '';
    };

    const parser = new window.DOMParser();
    const doc = parser.parseFromString(`<div id="print-block-normalize-root">${rawHtml}</div>`, 'text/html');
    const root = doc.getElementById('print-block-normalize-root');
    if (!root) return rawHtml;

    root.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
      const blockId = detectDynamicBlockId(table);
      if (!blockId) return;

      const canonicalHtml = buildBlockSnippetTemplate(moduleId, blockId);
      if (!canonicalHtml) return;

      const canonicalDoc = parser.parseFromString(`<div id="print-block-canonical-root">${canonicalHtml}</div>`, 'text/html');
      const canonicalTable = canonicalDoc.querySelector('table[data-print-block]') as HTMLTableElement | null;
      if (!canonicalTable) return;

      const borderColor =
        table.getAttribute('data-border-color') ||
        table.style.getPropertyValue('--table-border-color') ||
        table.style.borderColor ||
        '';

      if (borderColor) {
        canonicalTable.setAttribute('data-border-color', borderColor);
        const baseStyle = String(canonicalTable.getAttribute('style') || '').trim();
        canonicalTable.setAttribute(
          'style',
          `${baseStyle}${baseStyle ? ';' : ''}--table-border-color:${borderColor};border-color:${borderColor};`
        );
      }

      table.replaceWith(canonicalTable);
    });

    return root.innerHTML;
  } catch {
    return rawHtml;
  }
};

export const buildCatalogFullPageContentHtml = (
  moduleId: string,
  imageDisplayMode: PrintImageDisplayMode = DEFAULT_PRINT_IMAGE_DISPLAY_MODE,
): string => {
  const isBillboard = moduleId === 'billboards';
  const primaryTitle = isBillboard ? '{{record.address}}' : '{{record.name}}';
  return buildCatalogFullPageLayout({
    imageUrl: '{{system.record_image_url}}',
    primaryTitle,
    codeFieldsHtml: '{{system.catalog_code_fields}}',
    watermarkText: '{{company.company_name_en}}',
    sidebarFieldsHtml: '{{system.compact_fields_sidebar}}',
    logoUrl: '{{company.logo_url}}',
    companyName: '{{company.company_full_name}}',
    slogan: '{{company.slogan}}',
    phone: '{{company.phone}}',
    email: '{{company.email}}',
    website: '{{company.website}}',
    companyAddress: '{{company.address}}',
    todayDate: '{{system.print_date}}',
    qrSectionHtml: '{{system.catalog_qr_section}}',
    mapSectionHtml: isBillboard ? '{{system.catalog_map_section}}' : '',
    imageDisplayMode,
    isFirstPage: true,
  });
};

const buildCatalogFullPageRecordTemplate = (moduleId: string, now: string): StoredPrintTemplate => ({
  id: `default_${moduleId}_catalog_fullpage_landscape`,
  moduleId,
  scope: 'record',
  title: 'کاتالوگ تمام صفحه',
  description: 'قالب کاتالوگی تک‌برگه A4 افقی با تصویر بزرگ — مناسب ارسال به مشتریان',
  paperSize: 'A4',
  orientation: 'landscape',
  isActive: true,
  isSystem: true,
  showHeader: false,
  showFooter: false,
  pageMarginTop: 0,
  pageMarginRight: 0,
  pageMarginBottom: 0,
  pageMarginLeft: 0,
  headerHtml: '',
  footerHtml: '',
  contentHtml: buildCatalogFullPageContentHtml(moduleId),
  createdAt: now,
  updatedAt: now,
});

const buildCatalogGridRecordTemplate = (moduleId: string, now: string): StoredPrintTemplate => ({
  id: `default_${moduleId}_catalog_grid`,
  moduleId,
  scope: 'record',
  title: 'کاتالوگ شبکه‌ای',
  description: 'قالب کارت شبکه‌ای برای چاپ یک رکورد با تصویر و فیلدهای انتخاب‌شده',
  paperSize: 'A4',
  orientation: 'portrait',
  isActive: true,
  isSystem: true,
  showHeader: true,
  showFooter: true,
  pageMarginTop: 10,
  pageMarginRight: 10,
  pageMarginBottom: 10,
  pageMarginLeft: 10,
  headerHtml: '<div style="direction:rtl;text-align:right;font-size:15px;font-weight:800;color:rgb(var(--brand-500-rgb));">{{company.company_full_name}}</div>',
  footerHtml: '<div style="direction:rtl;text-align:center;color:#64748b;font-size:9px;">{{company.phone}} · {{company.website}}</div>',
  contentHtml: `<div style="direction:rtl;border:1px solid rgba(148,163,184,.45);border-radius:18px;padding:18px;background:linear-gradient(135deg,rgba(var(--brand-50-rgb),.8),#fff);font-family:inherit;">
  <div style="display:flex;gap:16px;align-items:flex-start;">
    <div style="width:42%;min-height:180px;border-radius:14px;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;overflow:hidden;"><img src="{{system.record_image_url}}" alt="تصویر رکورد" style="max-width:100%;max-height:240px;object-fit:contain;" /></div>
    <div style="flex:1;"><h1 style="margin:0 0 8px;font-size:23px;color:rgb(var(--brand-500-rgb));">{{record.name}}</h1><div style="font-size:11px;color:#64748b;line-height:1.9;">{{system.compact_fields_inline}}</div></div>
  </div>
  <div style="margin-top:16px;">{{system.compact_fields_sidebar}}</div>
</div>`,
  createdAt: now,
  updatedAt: now,
});

const buildCatalogFullPageListTemplate = (moduleId: string, now: string): StoredPrintTemplate => ({
  id: `default_${moduleId}_catalog_fullpage_list_landscape`,
  moduleId,
  scope: 'list',
  title: 'کاتالوگ تمام صفحه — لیست',
  description: 'هر رکورد یک صفحه کامل A4 افقی کاتالوگی — مناسب ارسال فهرست محصولات/تابلوها به مشتریان',
  paperSize: 'A4',
  orientation: 'landscape',
  isActive: true,
  isSystem: true,
  showHeader: false,
  showFooter: false,
  pageMarginTop: 0,
  pageMarginRight: 0,
  pageMarginBottom: 0,
  pageMarginLeft: 0,
  headerHtml: '',
  footerHtml: '',
  contentHtml: '{{system.list_catalog_fullpage}}',
  createdAt: now,
  updatedAt: now,
});

const buildListCatalogA4PortraitDefaultTemplate = (
  moduleId: string,
  now: string,
): StoredPrintTemplate => {
  const moduleTitle = getModuleTitle(moduleId) || 'فهرست';

  return {
    id: `default_${moduleId}_catalog_a4_portrait`,
    moduleId,
    scope: 'list',
    title: 'کاتالوگ A4 عمودی',
    description: `قالب سیستمی کاتالوگی ${moduleTitle} در قطع A4 عمودی با ۶ کارت در هر صفحه`,
    paperSize: 'A4',
    orientation: 'portrait',
    isActive: true,
    isSystem: true,
    showHeader: true,
    showFooter: true,
    headerHeight: 84,
    footerHeight: 40,
    pageMarginTop: 8,
    pageMarginRight: 8,
    pageMarginBottom: 8,
    pageMarginLeft: 8,
    headerHtml: `
<table style="width:100%; border-collapse:collapse; direction:rtl; border:1px solid rgba(148,163,184,0.3); border-radius:14px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:16%; border:none; padding:8px; background:rgba(var(--brand-50-rgb),0.45); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:34px; max-height:34px; object-fit:contain;" />
      </td>
      <td style="width:54%; border:none; padding:8px 10px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:15px; font-weight:800; color:rgb(var(--brand-500-rgb));">{{system.list_title}}</div>
        <div style="font-size:11px; color:#64748b;">{{company.company_full_name}}</div>
      </td>
      <td style="width:30%; border:none; padding:8px 10px; background:rgba(var(--brand-50-rgb),0.22); text-align:right; font-size:11px; line-height:1.8;">
        <div>تاریخ چاپ: {{system.print_date}}</div>
        <div>تعداد رکورد: {{system.selected_count}}</div>
      </td>
    </tr>
  </tbody>
</table>
`.trim(),
    contentHtml: `
<div style="direction:rtl; color:#111827; font-family:inherit;">
  {{system.list_catalog_a4}}
  {{system.list_summary_table}}
</div>
`.trim(),
    footerHtml: `
<div style="display:flex; align-items:center; gap:8px; font-size:9px; color:#64748b; direction:rtl; overflow:hidden; flex-wrap:nowrap;">
  <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; font-size:8.5px;">{{company.address}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.phone}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.email}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.website}}</span>
  <span style="white-space:nowrap; flex-shrink:0; border-right:1px solid rgba(148,163,184,0.4); padding-right:8px; margin-right:4px;">صفحه {{system.page_index}} از {{system.page_count}}</span>
</div>
`.trim(),
    createdAt: now,
    updatedAt: now,
  };
};

const buildSecretariatOfficialTemplate = (now: string): StoredPrintTemplate => ({
  id: 'default_secretariat_official_letter_a4',
  moduleId: 'secretariat_documents',
  scope: 'record',
  title: 'نامه رسمی اداری A4',
  description: 'سربرگ رسمی دبیرخانه با تاریخ، شماره و پیوست',
  paperSize: 'A4',
  orientation: 'portrait',
  isActive: true,
  isSystem: true,
  showHeader: true,
  showFooter: true,
  headerHeight: 112,
  footerHeight: 30,
  pageMarginTop: 14,
  pageMarginRight: 16,
  pageMarginBottom: 10,
  pageMarginLeft: 16,
  headerHtml: buildOfficialLetterHeaderTemplate().trim(),
  contentHtml: `
<div style="direction:rtl; color:#111827; font-family:inherit; font-size:12.5px; line-height:2.25; padding:4px 4px 0 4px;">
  <div style="text-align:right; margin-bottom:16px;">
    <div><span style="font-weight:800;">موضوع:</span> <span style="font-weight:700;">{{record.name}}</span></div>
    <div><span style="font-weight:800;">از:</span> {{system.letter_sender_display}}</div>
    <div><span style="font-weight:800;">به:</span> {{system.letter_recipient_display}}</div>
  </div>
  <div style="min-height:470px; text-align:right; padding:0 2px; ${getLongTextPrintStyle(13)}">{{record.body}}</div>
</div>
`.trim(),
  footerHtml: `
<div style="direction:rtl; width:100%; border-top:1px solid rgba(17,24,39,0.22); padding-top:5px; color:#4b5563; font-size:9px; line-height:1.7; text-align:center; overflow-wrap:anywhere;">
  <span>آدرس: {{company.address}}</span>
  <span style="margin:0 8px;">|</span>
  <span>تلفن: {{company.phone}}</span>
  <span style="margin:0 8px;">|</span>
  <span>سایت: {{company.website}}</span>
</div>
`.trim(),
  createdAt: now,
  updatedAt: now,
});

const buildDeliveryFormPrintTemplate = (now: string): StoredPrintTemplate => ({
  id: 'default_delivery_form_operational_a4',
  moduleId: 'delivery_forms',
  scope: 'record',
  title: 'فرم تحویل عملیاتی A4',
  description: 'قالب چاپ رسمی برای فرم‌های تحویل با امضا و اقلام',
  paperSize: 'A4',
  orientation: 'portrait',
  isActive: true,
  isSystem: true,
  showHeader: true,
  showFooter: true,
  headerHeight: 84,
  footerHeight: 84,
  pageMarginTop: 10,
  pageMarginRight: 10,
  pageMarginBottom: 10,
  pageMarginLeft: 10,
  headerHtml: `
<table style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; direction:rtl; color:#111827; font-size:12px; border:1px solid rgba(148,163,184,0.28); border-radius:18px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:18%; border:none; padding:8px; background:rgba(var(--brand-50-rgb),0.42); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:42px; max-height:42px; object-fit:contain;" />
      </td>
      <td style="width:50%; border:none; padding:8px 10px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:14px; font-weight:900; color:rgb(var(--brand-500-rgb));">فرم تحویل / رسید</div>
        <div style="font-size:11px; color:#64748b;">{{company.company_full_name}}</div>
      </td>
      <td style="width:32%; border:none; padding:8px 10px; background:rgba(var(--brand-50-rgb),0.24); line-height:1.9;">
        <div>زمان تحویل: {{record.delivery_date}}</div>
        <div>شماره: {{record.system_code}}</div>
        <div>وضعیت: {{record.status}}</div>
      </td>
    </tr>
  </tbody>
</table>
`.trim(),
  contentHtml: `
<div style="direction:rtl; color:#111827; font-family:inherit; font-size:11px; line-height:1.9;">
  <table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
    <tbody>
      <tr>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">عنوان فرم</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.name}}</td>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">نوع فرم</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.form_type}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">تحویل‌دهنده</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.delivered_by_employee_id}} {{record.delivered_by_customer_id}} {{record.delivered_by_supplier_id}} {{record.external_delivered_by}} {{record.delivered_by_id}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">تحویل‌گیرنده</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.received_by_employee_id}} {{record.received_by_customer_id}} {{record.received_by_supplier_id}} {{record.external_received_by}} {{record.received_by_id}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">محل تحویل</td>
        <td colspan="3" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.location_text}}</td>
      </tr>
    </tbody>
  </table>
  ${buildBlockSnippetTemplate('delivery_forms', 'items')}
  <div style="margin-top:8px; border:1px solid var(--table-border-color, #d1d5db); background:rgba(var(--brand-50-rgb),0.12); padding:8px;">
    <div style="font-weight:800; color:rgb(var(--brand-500-rgb)); margin-bottom:4px;">یادداشت‌ها و شرایط تحویل</div>
    <div style="${getLongTextPrintStyle(11)}">{{record.notes}}</div>
  </div>
</div>
`.trim(),
  footerHtml: buildDefaultFooterTemplateForModule('stock_transfers').trim(),
  createdAt: now,
  updatedAt: now,
});

const buildStockTransferVoucherPrintTemplate = (now: string): StoredPrintTemplate => ({
  id: 'default_stock_transfer_voucher_a4',
  moduleId: 'stock_transfers',
  scope: 'record',
  title: 'حواله انبار A4',
  description: 'قالب چاپ عملیاتی حواله و تردد کالا با تمرکز روی ورود/خروج و مسئولیت تحویل',
  paperSize: 'A4',
  orientation: 'portrait',
  isActive: true,
  isSystem: true,
  showHeader: true,
  showFooter: true,
  headerHeight: 82,
  footerHeight: 84,
  pageMarginTop: 10,
  pageMarginRight: 10,
  pageMarginBottom: 10,
  pageMarginLeft: 10,
  headerHtml: `
<table style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; direction:rtl; color:#111827; font-size:12px; border:1px solid rgba(148,163,184,0.28); border-radius:18px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:16%; border:none; padding:8px; background:rgba(var(--brand-50-rgb),0.42); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:38px; max-height:38px; object-fit:contain;" />
      </td>
      <td style="width:52%; border:none; padding:8px 10px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:14px; font-weight:900; color:rgb(var(--brand-500-rgb));">حواله / تردد کالا</div>
        <div style="font-size:11px; color:#64748b;">{{company.company_full_name}}</div>
      </td>
      <td style="width:32%; border:none; padding:8px 10px; background:rgba(var(--brand-50-rgb),0.24); line-height:1.9;">
        <div>تاریخ: {{record.transfer_date}}</div>
        <div>شماره: {{record.system_code}}</div>
        <div>نوع: {{record.transfer_type}}</div>
      </td>
    </tr>
  </tbody>
</table>
`.trim(),
  contentHtml: `
<div style="direction:rtl; color:#111827; font-family:inherit; font-size:11px; line-height:1.9;">
  <table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
    <tbody>
      <tr>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">عنوان حواله</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.name}}</td>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">وضعیت</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.status}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">کالا</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.product_id}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">مقدار</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.delivered_qty}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">مبدا</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.source_warehouse_id}} / {{record.from_shelf_id}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">مقصد</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.target_warehouse_id}} / {{record.to_shelf_id}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">تحویل‌دهنده</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.sender_id}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">تحویل‌گیرنده</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.receiver_id}}</td>
      </tr>
    </tbody>
  </table>
  <div style="border:1px solid var(--table-border-color, #d1d5db); padding:8px; background:rgba(var(--brand-50-rgb),0.12);">
    <div style="font-weight:800; color:rgb(var(--brand-500-rgb)); margin-bottom:4px;">یادداشت‌ها</div>
    <div style="${getLongTextPrintStyle(11)}">{{record.notes}}</div>
  </div>
</div>
`.trim(),
  footerHtml: buildDefaultFooterTemplateForModule('stock_transfers').trim(),
  createdAt: now,
  updatedAt: now,
});

const buildEmployeeContractPrintTemplate = (now: string): StoredPrintTemplate => ({
  id: 'default_employee_contract_formal_a4',
  moduleId: 'employee_contracts',
  scope: 'record',
  title: 'قرارداد کارمند A4',
  description: 'قالب رسمی قرارداد کارکنان با مشخصات طرفین',
  paperSize: 'A4',
  orientation: 'portrait',
  isActive: true,
  isSystem: true,
  showHeader: true,
  showFooter: true,
  headerHeight: 84,
  footerHeight: 84,
  pageMarginTop: 10,
  pageMarginRight: 10,
  pageMarginBottom: 10,
  pageMarginLeft: 10,
  headerHtml: `
<table style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; direction:rtl; color:#111827; font-size:12px; border:1px solid rgba(148,163,184,0.28); border-radius:18px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:18%; border:none; padding:8px; background:rgba(var(--brand-50-rgb),0.42); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:40px; max-height:40px; object-fit:contain;" />
      </td>
      <td style="width:52%; border:none; padding:8px 10px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:14px; font-weight:900; color:rgb(var(--brand-500-rgb));">قرارداد کارمند</div>
        <div style="font-size:11px; color:#64748b;">{{company.company_full_name}}</div>
      </td>
      <td style="width:30%; border:none; padding:8px 10px; background:rgba(var(--brand-50-rgb),0.24); line-height:1.9;">
        <div>شماره: {{record.system_code}}</div>
        <div>شروع: {{record.start_date}}</div>
        <div>پایان: {{record.end_date}}</div>
      </td>
    </tr>
  </tbody>
</table>
`.trim(),
  contentHtml: `
<div style="direction:rtl; color:#111827; font-family:inherit; font-size:11px; line-height:2;">
  <table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
    <tbody>
      <tr>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">عنوان قرارداد</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.name}}</td>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">نوع قرارداد</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.contract_type}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">کارمند</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.employee_id}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">سمت</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.title}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">محل کار</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.work_location}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">مبلغ پایه</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.base_salary}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
      </tr>
    </tbody>
  </table>
  <div style="min-height:430px; padding:8px 4px; ${getLongTextPrintStyle(12)}">{{record.body}}</div>
</div>
`.trim(),
  footerHtml: buildDefaultFooterTemplateForModule('employee_contracts').trim(),
  createdAt: now,
  updatedAt: now,
});

const buildPayrollSlipPrintTemplate = (now: string): StoredPrintTemplate => ({
  id: 'default_payroll_slip_formal_a4',
  moduleId: 'payroll_slips',
  scope: 'record',
  title: 'فیش حقوقی رسمی A4',
  description: 'قالب رسمی فیش حقوقی با ردیف‌ها و پرداخت‌ها',
  paperSize: 'A4',
  orientation: 'portrait',
  isActive: true,
  isSystem: true,
  showHeader: true,
  showFooter: true,
  headerHeight: 84,
  footerHeight: 84,
  pageMarginTop: 10,
  pageMarginRight: 10,
  pageMarginBottom: 10,
  pageMarginLeft: 10,
  headerHtml: `
<table style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; direction:rtl; color:#111827; font-size:12px; border:1px solid rgba(148,163,184,0.28); border-radius:18px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:18%; border:none; padding:8px; background:rgba(var(--brand-50-rgb),0.42); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:40px; max-height:40px; object-fit:contain;" />
      </td>
      <td style="width:52%; border:none; padding:8px 10px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:14px; font-weight:900; color:rgb(var(--brand-500-rgb));">فیش حقوقی</div>
        <div style="font-size:11px; color:#64748b;">{{company.company_full_name}}</div>
      </td>
      <td style="width:30%; border:none; padding:8px 10px; background:rgba(var(--brand-50-rgb),0.24); line-height:1.9;">
        <div>شماره: {{record.system_code}}</div>
        <div>از: {{record.period_start}}</div>
        <div>تا: {{record.period_end}}</div>
      </td>
    </tr>
  </tbody>
</table>
`.trim(),
  contentHtml: `
<div style="direction:rtl; color:#111827; font-family:inherit; font-size:11px; line-height:1.9;">
  <table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
    <tbody>
      <tr>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">کارمند</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.employee_id}}</td>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">وضعیت</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.status}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">ناخالص</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.gross_amount}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">خالص پرداختی</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.net_amount}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
      </tr>
    </tbody>
  </table>
  ${buildBlockSnippetTemplate('payroll_slips', 'lines')}
  <div style="margin-top:8px;">${buildBlockSnippetTemplate('payroll_slips', 'payments')}</div>
  <div style="margin-top:8px; border:1px solid var(--table-border-color, #d1d5db); background:rgba(var(--brand-50-rgb),0.12); padding:8px;">
    <div style="font-weight:800; color:rgb(var(--brand-500-rgb)); margin-bottom:4px;">توضیحات</div>
    <div style="${getLongTextPrintStyle(11)}">{{record.notes}}</div>
  </div>
</div>
`.trim(),
  footerHtml: buildDefaultFooterTemplateForModule('payroll_slips').trim(),
  createdAt: now,
  updatedAt: now,
});

export const buildDefaultTemplatesForModule = (
  moduleId: string,
  scope: 'all' | 'record' | 'list' = 'all'
): StoredPrintTemplate[] => {
  const now = nowIso();
  const compactA4Template = buildCompactA4DefaultTemplate(moduleId, now);
  const compactA5Template = buildCompactA5DefaultTemplate(moduleId, now);
  const compactA6Template = buildCompactA6DefaultTemplate(moduleId, now);
  const listPortraitTemplate = buildListA4DefaultTemplate(moduleId, now, 'portrait');
  const listLandscapeTemplate = buildListA4DefaultTemplate(moduleId, now, 'landscape');
  const listCatalogPortraitTemplate = buildListCatalogA4PortraitDefaultTemplate(moduleId, now);
  const catalogFullPageDefaults = isCatalogFullPageAvailableForModule(moduleId)
    ? [
        buildCatalogGridRecordTemplate(moduleId, now),
        buildCatalogFullPageRecordTemplate(moduleId, now),
        buildCatalogFullPageListTemplate(moduleId, now),
      ]
    : [];
  const domainSpecificDefaults: StoredPrintTemplate[] = (
    moduleId === 'secretariat_documents'
      ? [buildSecretariatOfficialTemplate(now)]
      : moduleId === 'delivery_forms'
        ? [buildDeliveryFormPrintTemplate(now)]
        : moduleId === 'stock_transfers'
          ? [buildStockTransferVoucherPrintTemplate(now)]
          : moduleId === 'employee_contracts'
            ? [buildEmployeeContractPrintTemplate(now)]
            : moduleId === 'payroll_slips'
              ? [buildPayrollSlipPrintTemplate(now)]
              : []
  );

  if (!isInvoiceModule(moduleId)) {
    const defaults: StoredPrintTemplate[] = [...domainSpecificDefaults, ...catalogFullPageDefaults, compactA4Template, compactA5Template, compactA6Template, listPortraitTemplate, listLandscapeTemplate, listCatalogPortraitTemplate];
    return scope === 'all' ? defaults : defaults.filter((item) => item.scope === scope);
  }

  const invoiceItemsBlock = buildBlockSnippetTemplate(moduleId, 'invoiceItems');
  const paymentsBlock = buildBlockSnippetTemplate(moduleId, 'payments');
  const counterpartyRoot = moduleId === 'purchase_invoices' ? 'supplier' : 'customer';
  const counterpartyTitle = moduleId === 'purchase_invoices' ? 'فروشنده' : 'خریدار';
  const companyPartyTitle = moduleId === 'purchase_invoices' ? 'خریدار' : 'فروشنده';
  const paymentsPanelTitle = moduleId === 'purchase_invoices' ? 'پرداخت‌ها' : 'دریافت‌ها';

  const defaults: StoredPrintTemplate[] = [
    {
      id: 'default_invoice_unofficial',
      moduleId,
      scope: 'record',
      title: moduleId === 'purchase_invoices' ? 'فاکتور خرید غیررسمی' : 'فاکتور فروش غیررسمی',
      description: 'نسخه پیش‌فرض A4 افقی برای چاپ غیررسمی',
      paperSize: 'A4',
      orientation: 'landscape',
      isActive: true,
      isSystem: true,
      showHeader: true,
      showFooter: true,
      headerHeight: 74,
      footerHeight: 50,
      pageMarginTop: 8,
      pageMarginRight: 8,
      pageMarginBottom: 8,
      pageMarginLeft: 8,
      headerHtml: buildDefaultHeaderTemplateForModule(moduleId).trim(),
      contentHtml: `<div style="direction:rtl; color:#111827; font-family:inherit;">
  <table style="width:100%; border-collapse:collapse; font-size:11px; line-height:1.8;">
    <tbody>
      <tr>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; background:rgba(var(--brand-50-rgb),0.18); vertical-align:top;">
          <div style="font-weight:800; margin-bottom:3px; color:rgb(var(--brand-500-rgb));">مشخصات ${companyPartyTitle}</div>
          <table style="width:100%; border-collapse:collapse; font-size:10px;">
            <tbody>
              <tr>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">نام</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.company_full_name}}</td>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">تلفن</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.phone}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">نشانی</td>
                <td colspan="3" style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.address}}</td>
              </tr>
            </tbody>
          </table>
        </td>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:3px; color:rgb(var(--brand-500-rgb));">مشخصات ${counterpartyTitle}</div>
          <table style="width:100%; border-collapse:collapse; font-size:10px;">
            <tbody>
              <tr>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">نام</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${counterpartyRoot}.full_name}}</td>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">تلفن</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${counterpartyRoot}.mobile_1}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کسب‌وکار</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${counterpartyRoot}.business_name}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">نشانی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${counterpartyRoot}.address}}</td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:6px;">${invoiceItemsBlock}</div>
  <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:11px;">
    <tbody>
      <tr>
        <td style="width:54%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:4px; color:rgb(var(--brand-500-rgb));">توضیحات</div>
          <div style="min-height:52px; ${getLongTextPrintStyle(11)}">{{record.description}}</div>
        </td>
        <td style="width:46%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:4px; color:rgb(var(--brand-500-rgb));">${paymentsPanelTitle}</div>
          ${paymentsBlock}
        </td>
      </tr>
    </tbody>
  </table>
</div>`.trim(),
      footerHtml: buildInvoiceFooterTemplate().trim(),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'default_invoice_official',
      moduleId,
      scope: 'record',
      title: moduleId === 'purchase_invoices' ? 'فاکتور خرید رسمی' : 'فاکتور فروش رسمی',
      description: 'نسخه پیش‌فرض A4 افقی با فیلدهای رسمی فروشنده و خریدار',
      paperSize: 'A4',
      orientation: 'landscape',
      isActive: true,
      isSystem: true,
      showHeader: true,
      showFooter: true,
      headerHeight: 74,
      footerHeight: 50,
      pageMarginTop: 8,
      pageMarginRight: 8,
      pageMarginBottom: 8,
      pageMarginLeft: 8,
      headerHtml: buildDefaultHeaderTemplateForModule(moduleId).trim(),
      contentHtml: `<div style="direction:rtl; color:#111827; font-family:inherit;">
  <table style="width:100%; border-collapse:collapse; font-size:11px; line-height:1.8;">
    <tbody>
      <tr>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; vertical-align:top; background:rgba(var(--brand-50-rgb),0.18);">
          <div style="font-weight:800; margin-bottom:4px; color:rgb(var(--brand-500-rgb));">مشخصات ${companyPartyTitle}</div>
          <table style="width:100%; border-collapse:collapse; font-size:10px;">
            <tbody>
              <tr>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">نام</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.company_full_name}}</td>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">شناسه ملی</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.national_id}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">شماره ثبت</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.registration_number}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کد اقتصادی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.economic_code}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کد پستی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.postal_code}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">تلفن</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.phone}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">نشانی</td>
                <td colspan="3" style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.address}}</td>
              </tr>
            </tbody>
          </table>
        </td>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:4px; color:rgb(var(--brand-500-rgb));">مشخصات ${counterpartyTitle}</div>
          <table style="width:100%; border-collapse:collapse; font-size:10px;">
            <tbody>
              <tr>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">نوع</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${counterpartyRoot}.person_type}}</td>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">نام</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${counterpartyRoot}.full_name}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کسب‌وکار</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${counterpartyRoot}.business_name}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">شناسه/ملی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${counterpartyRoot}.national_identifier}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">شماره ثبت</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${counterpartyRoot}.registration_number}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کد اقتصادی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${counterpartyRoot}.economic_code}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کد پستی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${counterpartyRoot}.postal_code}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">تلفن</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${counterpartyRoot}.mobile_1}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">نشانی</td>
                <td colspan="3" style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${counterpartyRoot}.address}}</td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:6px;">${invoiceItemsBlock}</div>
  <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:11px;">
    <tbody>
      <tr>
        <td style="width:54%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:4px; color:rgb(var(--brand-500-rgb));">شرح / توضیحات</div>
          <div style="min-height:52px; ${getLongTextPrintStyle(11)}">{{record.description}}</div>
        </td>
        <td style="width:46%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:4px; color:rgb(var(--brand-500-rgb));">${paymentsPanelTitle}</div>
          ${paymentsBlock}
        </td>
      </tr>
    </tbody>
  </table>
</div>`.trim(),
      footerHtml: buildInvoiceFooterTemplate().trim(),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'default_invoice_practical_a5',
      moduleId,
      scope: 'record',
      title: moduleId === 'purchase_invoices' ? 'فاکتور کاربردی A5 خرید' : 'فاکتور کاربردی A5 فروش',
      description: 'نسخه فشرده A5 عمودی برای جا دادن اقلام بیشتر',
      paperSize: 'A5',
      orientation: 'portrait',
      isActive: true,
      isSystem: true,
      showHeader: true,
      showFooter: true,
      headerHeight: 78,
      footerHeight: 54,
      pageMarginTop: 7,
      pageMarginRight: 7,
      pageMarginBottom: 7,
      pageMarginLeft: 7,
      headerHtml: buildDefaultHeaderTemplateForModule(moduleId).trim(),
      contentHtml: `<div style="direction:rtl; color:#111827; font-family:inherit; font-size:11px; line-height:1.75;">
  <table style="width:100%; border-collapse:collapse; font-size:10px;">
    <tbody>
      <tr>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.16); vertical-align:top;">
          <div style="font-weight:800; margin-bottom:3px; color:rgb(var(--brand-500-rgb));">مشخصات ${companyPartyTitle}</div>
          <div>{{company.company_full_name}}</div>
          <div style="font-size:9px; color:#64748b;">{{company.address}}</div>
          <div style="font-size:9px; color:#64748b;">{{company.phone}}</div>
        </td>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:3px; color:rgb(var(--brand-500-rgb));">مشخصات ${counterpartyTitle}</div>
          <div>{{${counterpartyRoot}.full_name}}</div>
          <div style="font-size:9px; color:#64748b;">{{${counterpartyRoot}.business_name}}</div>
          <div style="font-size:9px; color:#64748b;">{{${counterpartyRoot}.address}}</div>
          <div style="font-size:9px; color:#64748b;">{{${counterpartyRoot}.mobile_1}} {{${counterpartyRoot}.mobile_2}}</div>
        </td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:6px;">${invoiceItemsBlock}</div>
  <div style="margin-top:6px;">${paymentsBlock}</div>
  <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:10px;">
    <tbody>
      <tr>
        <td style="width:26%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; font-weight:800; background:rgba(var(--brand-50-rgb),0.32);">توضیحات</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:5px; ${getLongTextPrintStyle(10)}">{{record.description}}</td>
      </tr>
    </tbody>
  </table>
</div>`.trim(),
      footerHtml: buildInvoiceFooterTemplate().trim(),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'default_invoice_practical_a4',
      moduleId,
      scope: 'record',
      title: moduleId === 'purchase_invoices' ? 'فاکتور کاربردی A4 خرید' : 'فاکتور کاربردی A4 فروش',
      description: 'نسخه کاربردی A4 با چیدمان فشرده',
      paperSize: 'A4',
      orientation: 'portrait',
      isActive: true,
      isSystem: true,
      showHeader: true,
      showFooter: true,
      headerHeight: 78,
      footerHeight: 54,
      pageMarginTop: 7,
      pageMarginRight: 7,
      pageMarginBottom: 7,
      pageMarginLeft: 7,
      headerHtml: buildDefaultHeaderTemplateForModule(moduleId).trim(),
      contentHtml: `<div style="direction:rtl; color:#111827; font-family:inherit; font-size:11px; line-height:1.75;">
  <table style="width:100%; border-collapse:collapse; font-size:10px;">
    <tbody>
      <tr>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.16); vertical-align:top;">
          <div style="font-weight:800; margin-bottom:3px; color:rgb(var(--brand-500-rgb));">مشخصات ${companyPartyTitle}</div>
          <div>{{company.company_full_name}}</div>
          <div style="font-size:9px; color:#64748b;">{{company.address}}</div>
          <div style="font-size:9px; color:#64748b;">{{company.phone}}</div>
        </td>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:3px; color:rgb(var(--brand-500-rgb));">مشخصات ${counterpartyTitle}</div>
          <div>{{${counterpartyRoot}.full_name}}</div>
          <div style="font-size:9px; color:#64748b;">{{${counterpartyRoot}.address}}</div>
          <div style="font-size:9px; color:#64748b;">{{${counterpartyRoot}.mobile_1}} {{${counterpartyRoot}.mobile_2}}</div>
        </td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:6px;">${invoiceItemsBlock}</div>
  <div style="margin-top:6px;">${paymentsBlock}</div>
  <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:10px;">
    <tbody>
      <tr>
        <td style="width:22%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; font-weight:800; background:rgba(var(--brand-50-rgb),0.32);">توضیحات</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:5px; ${getLongTextPrintStyle(10)}">{{record.description}}</td>
      </tr>
    </tbody>
  </table>
</div>`.trim(),
      footerHtml: buildInvoiceFooterTemplate().trim(),
      createdAt: now,
      updatedAt: now,
    },
    compactA4Template,
    compactA5Template,
    compactA6Template,
    listPortraitTemplate,
    listLandscapeTemplate,
    listCatalogPortraitTemplate,
  ];

  return scope === 'all' ? defaults : defaults.filter((item) => item.scope === scope);
};

export const mergeTemplatesWithDefaults = (
  moduleId: string,
  storedTemplates: StoredPrintTemplate[] = []
): StoredPrintTemplate[] => {
  const defaults = buildDefaultTemplatesForModule(moduleId);
  if (defaults.length === 0) return storedTemplates;

  const next = [...storedTemplates];
  const indexById = new Map(next.map((item, index) => [item.id, index]));

  defaults.forEach((defaultTemplate) => {
    const existingIndex = indexById.get(defaultTemplate.id);
    if (existingIndex === undefined) {
      next.push(defaultTemplate);
      indexById.set(defaultTemplate.id, next.length - 1);
      return;
    }

    const existing = next[existingIndex];
    const isDefaultTemplate = String(existing.id || '').startsWith('default_');

    if (isDefaultTemplate) {
      next[existingIndex] = {
        ...defaultTemplate,
        isActive: existing.isActive,
        selectedFieldKeys:
          Array.isArray(existing.selectedFieldKeys) && existing.selectedFieldKeys.length > 0
            ? existing.selectedFieldKeys
            : defaultTemplate.selectedFieldKeys,
        backgroundImageUrl: existing.backgroundImageUrl || defaultTemplate.backgroundImageUrl || null,
        backgroundSizing: existing.backgroundSizing || defaultTemplate.backgroundSizing,
        isSystem: true,
        createdAt: existing.createdAt || defaultTemplate.createdAt,
        updatedAt: existing.updatedAt || defaultTemplate.updatedAt,
      };
    }
  });

  return next;
};

export const materializeSystemTemplateForCopy = (
  moduleId: string,
  template: StoredPrintTemplate
): StoredPrintTemplate => {
  if (!template?.isSystem) return template;

  const selectedFieldKeys = Array.isArray(template.selectedFieldKeys)
    ? template.selectedFieldKeys.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  const replaceSystemPlaceholders = (html?: string) =>
    String(html || '')
      .replace(/{{\s*system\.compact_fields_table\s*}}/g, buildCompactFieldsTemplateForCopy(moduleId, selectedFieldKeys))
      .replace(/{{\s*system\.compact_tables_blocks\s*}}/g, buildCompactTablesBlocksTemplateForCopy(moduleId, selectedFieldKeys))
      .replace(/{{\s*system\.package_summary_table\s*}}/g, buildPackageSummaryTemplateForCopy(moduleId));

  return {
    ...template,
    headerHtml: replaceSystemPlaceholders(template.headerHtml),
    contentHtml: replaceSystemPlaceholders(template.contentHtml),
    footerHtml: replaceSystemPlaceholders(template.footerHtml),
  };
};
