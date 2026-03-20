import { MODULES } from '../../moduleRegistry';
import { BlockType } from '../../types';
import { supabase } from '../../supabaseClient';

export const PRINT_TEMPLATES_CONNECTION_TYPE = 'print_templates';
const PRINT_TEMPLATES_LOCAL_KEY = 'kalamapp.print_templates.v1';

export interface StoredPrintTemplate {
  id: string;
  title: string;
  description?: string;
  moduleId: string;
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

const toRecord = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

const getCompactPrintColumns = (columns: any[] = []) =>
  columns
    .filter((column) => {
      const key = String(column?.key || '').trim();
      const title = String(column?.title || '').trim();
      if (!key || !title) return false;
      if (PRINT_COLUMN_IGNORE_KEYS.has(key)) return false;
      return true;
    })
    .slice(0, 5);

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
          <div>تاریخ: {{record.invoice_date}}</div>
          <div>شماره: {{record.system_code}}</div>
        </div>
      </td>
    </tr>
  </tbody>
</table>
`;
};

export const buildDefaultFooterTemplateForModule = () => `
<table style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; direction:rtl; color:#111827; font-size:12px; border:1px solid rgba(148,163,184,0.28); border-radius:18px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:50%; border:none; border-left:1px solid rgba(148,163,184,0.28); height:44px; text-align:center; vertical-align:bottom; padding:6px; background:rgba(var(--brand-50-rgb),0.28);">مهر و امضا فروشنده</td>
      <td style="width:50%; border:none; height:44px; text-align:center; vertical-align:bottom; padding:6px; background:rgba(var(--brand-50-rgb),0.16);">مهر و امضا خریدار</td>
    </tr>
  </tbody>
</table>
`;

const buildBlockSnippetTemplate = (moduleId: string, blockId: string) => {
  if (moduleId === 'invoices' && blockId === 'invoiceItems') {
    return `
<table data-print-block="invoiceItems" style="width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; direction:rtl; color:#111827; font-size:10.5px;">
  <thead>
    <tr style="background:rgba(var(--brand-50-rgb),0.7);">
      <th style="width:40%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">کالا / شرح</th>
      <th style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">تعداد</th>
      <th style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">واحد</th>
      <th style="width:15%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">قیمت واحد</th>
      <th style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">تخفیف</th>
      <th style="width:15%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">جمع ردیف</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; vertical-align:top; word-break:break-word; overflow-wrap:anywhere;">
        <div style="font-weight:700;">{{row.product_id}}</div>
        <div style="margin-top:2px; font-size:9px; color:#64748b; line-height:1.6;">{{row.description}}</div>
        <div style="margin-top:2px; font-size:9px; color:#64748b; line-height:1.6;">{{row.__invoice_item_meta__}}</div>
      </td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.quantity}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.main_unit}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.unit_price}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.discount}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.total_price}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
    </tr>
  </tbody>
</table>
`;
  }

  if (moduleId === 'invoices' && blockId === 'payments') {
    return `
<table data-print-block="payments" style="width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; direction:rtl; color:#111827; font-size:10.5px;">
  <thead>
    <tr style="background:rgba(var(--brand-50-rgb),0.7);">
      <th style="width:14%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">نوع پرداخت</th>
      <th style="width:13%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">شماره چک</th>
      <th style="width:13%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">سررسید</th>
      <th style="width:12%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">بانک</th>
      <th style="width:12%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">تاریخ</th>
      <th style="width:14%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">مبلغ</th>
      <th style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">وضعیت</th>
      <th style="width:12%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">توضیحات</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.payment_type}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.cheque_serial_no}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.cheque_due_date}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.cheque_bank_name}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.date}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.amount}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.cheque_status}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; word-break:break-word; overflow-wrap:anywhere;">{{row.description}}</td>
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
    .map((column) => `<td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; overflow-wrap:anywhere;">{{row.${column.key}}}</td>`)
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

  return {
    id,
    title,
    description: String(raw?.description || ''),
    moduleId,
    headerHtml: String(raw?.headerHtml || raw?.header_html || '').trim() || buildDefaultHeaderTemplateForModule(moduleId),
    contentHtml,
    footerHtml: String(raw?.footerHtml || raw?.footer_html || '').trim() || buildDefaultFooterTemplateForModule(),
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

export const loadPrintTemplatesStore = async () => {
  try {
    const { data, error } = await supabase
      .from('integration_settings')
      .select('id, provider, settings')
      .eq('connection_type', PRINT_TEMPLATES_CONNECTION_TYPE)
      .maybeSingle();

    if (error) {
      const code = String((error as any)?.code || '').toUpperCase();
      const messageText = String((error as any)?.message || '').toLowerCase();
      const isMissingRow = code === 'PGRST116' || messageText.includes('0 rows');
      if (!isMissingRow) throw error;
    }

    const templatesByModule = normalizeStore(data?.settings || {});
    if (Object.keys(templatesByModule).length > 0) {
      writeLocalStore(templatesByModule);
    }

    return {
      rowId: data?.id ? String(data.id) : null,
      provider: String(data?.provider || 'tiptap'),
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
  writeLocalStore(params.templatesByModule);
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id || null;

  const payload: Record<string, any> = {
    connection_type: PRINT_TEMPLATES_CONNECTION_TYPE,
    provider: params.provider || 'tiptap',
    is_active: true,
    updated_by: userId,
    settings: {
      modules: params.templatesByModule,
    },
  };
  if (params.rowId) payload.id = params.rowId;

  try {
    const { data, error } = await supabase
      .from('integration_settings')
      .upsert([payload], { onConflict: 'org_id,connection_type' })
      .select('id')
      .single();

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

const buildUniqueFieldOptions = (moduleId: string): PrintTemplateVariableOption[] => {
  const module = MODULES[moduleId];
  if (!module) return [];

  const seen = new Set<string>();
  return module.fields
    .filter((field) => {
      if (!field?.key) return false;
      const path = `record.${field.key}`;
      if (seen.has(path)) return false;
      seen.add(path);
      return true;
    })
    .map((field) => ({
      label: field.labels?.fa || field.key,
      value: `record.${field.key}`,
      kind: 'field' as const,
      group: 'فیلدهای رکورد',
      description: `فیلد ${field.labels?.fa || field.key}`,
    }));
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
    }));
};

export const getPrintTemplateVariables = (moduleId: string): PrintTemplateVariableOption[] => {
  const commonFields: PrintTemplateVariableOption[] = [
    { label: 'عنوان مفرد ماژول', value: 'module.title', kind: 'field', group: 'سیستم' },
    { label: 'عنوان جمع ماژول', value: 'module.title_plural', kind: 'field', group: 'سیستم' },
    { label: 'عنوان رکورد', value: 'record.name', kind: 'field', group: 'فیلدهای رکورد' },
    { label: 'کد سیستمی', value: 'record.system_code', kind: 'field', group: 'فیلدهای رکورد' },
    { label: 'تاریخ ایجاد', value: 'record.created_at', kind: 'field', group: 'فیلدهای رکورد' },
    { label: 'تاریخ آخرین ویرایش', value: 'record.updated_at', kind: 'field', group: 'فیلدهای رکورد' },
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
    { label: 'نام مسئول', value: 'responsible.name', kind: 'field', group: 'سیستم' },
    { label: 'تاریخ امروز', value: 'system.today_date', kind: 'field', group: 'سیستم' },
    { label: 'تاریخ و زمان امروز', value: 'system.today_datetime', kind: 'field', group: 'سیستم' },
    { label: 'جدول فیلدهای دارای مقدار', value: 'system.compact_fields_table', kind: 'field', group: 'سیستم' },
  ];

  const moduleFields = buildUniqueFieldOptions(moduleId);
  const moduleBlocks = buildBlockOptions(moduleId);

  const invoiceExtras: PrintTemplateVariableOption[] =
    moduleId === 'invoices'
      ? [
          { label: 'تاریخ فاکتور', value: 'record.invoice_date', kind: 'field', group: 'فیلدهای رکورد' },
          { label: 'وضعیت فاکتور', value: 'record.status', kind: 'field', group: 'فیلدهای رکورد' },
          { label: 'جمع کل فاکتور', value: 'record.total_invoice_amount', kind: 'field', group: 'فیلدهای رکورد' },
          { label: 'جمع کل به حروف', value: 'record.total_invoice_amount_words', kind: 'field', group: 'فیلدهای رکورد' },
          { label: 'جمع دریافت‌شده', value: 'record.total_received_amount', kind: 'field', group: 'فیلدهای رکورد' },
          { label: 'مانده فاکتور', value: 'record.remaining_balance', kind: 'field', group: 'فیلدهای رکورد' },
          { label: 'نام مشتری', value: 'customer.full_name', kind: 'field', group: 'طرف حساب' },
          { label: 'نام کسب و کار مشتری', value: 'customer.business_name', kind: 'field', group: 'طرف حساب' },
          { label: 'نوع شخص مشتری', value: 'customer.person_type', kind: 'field', group: 'طرف حساب' },
          { label: 'شناسه ملی / کد ملی مشتری', value: 'customer.national_identifier', kind: 'field', group: 'طرف حساب' },
          { label: 'شماره ثبت مشتری', value: 'customer.registration_number', kind: 'field', group: 'طرف حساب' },
          { label: 'کد اقتصادی مشتری', value: 'customer.economic_code', kind: 'field', group: 'طرف حساب' },
          { label: 'کد پستی مشتری', value: 'customer.postal_code', kind: 'field', group: 'طرف حساب' },
          { label: 'تلفن مشتری', value: 'customer.mobile_1', kind: 'field', group: 'طرف حساب' },
          { label: 'آدرس مشتری', value: 'customer.address', kind: 'field', group: 'طرف حساب' },
        ]
      : [];

  const merged = [...commonFields, ...moduleFields, ...moduleBlocks, ...invoiceExtras];
  const seen = new Set<string>();
  return merged.filter((item) => {
    if (seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  });
};

export const getSystemTemplateFieldOptions = (moduleId: string): SystemTemplateFieldOption[] => {
  const module = MODULES[moduleId];
  if (!module) return [];

  const recordFields: SystemTemplateFieldOption[] = (module.fields || [])
    .filter((field: any) => field?.key)
    .map((field: any) => ({
      key: `record.${field.key}`,
      label: field.labels?.fa || field.key,
      group: 'فیلدهای رکورد',
      kind: 'record' as const,
    }));

  const tableColumns: SystemTemplateFieldOption[] = (module.blocks || [])
    .filter((block: any) => block?.id && (block.type === BlockType.TABLE || block.type === BlockType.GRID_TABLE))
    .flatMap((block: any) =>
      (block.tableColumns || [])
        .filter((column: any) => column?.key)
        .map((column: any) => ({
          key: `block.${block.id}.${column.key}`,
          label: `${column.title || column.key}`,
          group: `جدول: ${block.titles?.fa || block.id}`,
          kind: 'table' as const,
          blockId: block.id,
          columnKey: column.key,
        }))
    );

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

  if (moduleId === 'invoices') {
    return `
<div style="padding:0; box-sizing:border-box; direction:rtl; font-family:inherit; color:#111827; line-height:1.9;">
  <h2 style="margin:0 0 8px 0; font-size:18px; color:rgb(var(--brand-500-rgb));">${singularTitle}</h2>
  <div style="margin-top:8px;">{{block.invoiceItems}}</div>
  <table style="width:100%; border-collapse:collapse; margin-top:8px;">
    <tbody>
      <tr>
        <td style="width:24%; border:1px solid var(--table-border-color, #d1d5db); padding:7px; font-weight:800; background:rgba(var(--brand-50-rgb),0.62);">جمع کل فاکتور</td>
        <td style="width:26%; border:1px solid var(--table-border-color, #d1d5db); padding:7px; font-weight:700;">{{record.total_invoice_amount}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:7px; font-weight:700; background:rgba(var(--brand-50-rgb),0.44);">جمع به حروف</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:7px;">{{record.total_invoice_amount_words}}</td>
      </tr>
    </tbody>
  </table>
  <table style="width:100%; border-collapse:collapse; margin-top:8px;">
    <tbody>
      <tr>
        <td style="width:54%; border:1px solid var(--table-border-color, #d1d5db); padding:8px; vertical-align:top;">
          <div style="font-weight:700; margin-bottom:6px;">توضیحات</div>
          <div style="min-height:98px;">{{record.description}}</div>
        </td>
        <td style="width:46%; border:1px solid var(--table-border-color, #d1d5db); padding:8px; vertical-align:top;">
          <div style="font-weight:700; margin-bottom:6px;">دریافت / پرداخت</div>
          {{block.payments}}
          <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:11px;">
            <tbody>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700;">جمع پرداختی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.total_received_amount}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700;">مانده</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.remaining_balance}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
</div>
`;
  }

  return `
<div style="padding:0; box-sizing:border-box; direction:rtl; font-family:inherit; color:#111827; line-height:1.9;">
  <h2 style="margin:0 0 8px 0; font-size:19px; color:rgb(var(--brand-500-rgb));">${singularTitle}</h2>
  <table style="width:100%; border-collapse:collapse; margin-top:8px;">
    <tbody>
      <tr>
        <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.6);">عنوان</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.name}}</td>
      </tr>
      <tr>
        <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.45);">کد</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.system_code}}</td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:8px;">{{system.compact_fields_table}}</div>
</div>
`;
};

const buildCompactA6DefaultTemplate = (moduleId: string, now: string): StoredPrintTemplate => {
  const singularTitle = getModuleTitle(moduleId, 'singular') || getModuleTitle(moduleId) || 'سند';
  return {
    id: `default_${moduleId}_compact_a6`,
    moduleId,
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
        <div style="font-size:12px; font-weight:800; color:rgb(var(--brand-500-rgb));">${singularTitle}</div>
        <div style="font-size:10px;">{{record.system_code}}</div>
      </td>
    </tr>
  </tbody>
</table>
`,
    contentHtml: `
<div style="direction:rtl; color:#111827; font-family:inherit;">
  <div style="font-size:11px; font-weight:700; margin-bottom:4px;">نمایش فیلدهای دارای مقدار</div>
  {{system.compact_fields_table}}
</div>
`,
    footerHtml: '',
    createdAt: now,
    updatedAt: now,
  };
};

export const buildDefaultTemplatesForModule = (moduleId: string): StoredPrintTemplate[] => {
  const now = nowIso();
  const compactA6Template = buildCompactA6DefaultTemplate(moduleId, now);

  if (moduleId !== 'invoices') {
    return [compactA6Template];
  }

  const invoiceItemsBlock = buildBlockSnippetTemplate(moduleId, 'invoiceItems');
  const paymentsBlock = buildBlockSnippetTemplate(moduleId, 'payments');

  return [
    {
      id: 'default_invoice_unofficial',
      moduleId,
      title: 'فاکتور فروش غیررسمی',
      description: 'نسخه پیش‌فرض A4 افقی برای چاپ غیررسمی',
      paperSize: 'A4',
      orientation: 'landscape',
      isActive: true,
      isSystem: true,
      showHeader: true,
      showFooter: true,
      headerHeight: 84,
      footerHeight: 62,
      pageMarginTop: DEFAULT_PAGE_MARGINS.top,
      pageMarginRight: DEFAULT_PAGE_MARGINS.right,
      pageMarginBottom: DEFAULT_PAGE_MARGINS.bottom,
      pageMarginLeft: DEFAULT_PAGE_MARGINS.left,
      headerHtml: buildDefaultHeaderTemplateForModule(moduleId).trim(),
      contentHtml: `<div style="direction:rtl; color:#111827; font-family:inherit;">
  <table style="width:100%; border-collapse:collapse; font-size:12px; line-height:1.9;">
    <tbody>
      <tr>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; background:rgba(var(--brand-50-rgb),0.18); vertical-align:top;">
          <div style="font-weight:800; margin-bottom:4px; color:rgb(var(--brand-500-rgb));">مشخصات فروشنده</div>
          <table style="width:100%; border-collapse:collapse; font-size:11px;">
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
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:4px; color:rgb(var(--brand-500-rgb));">مشخصات خریدار</div>
          <table style="width:100%; border-collapse:collapse; font-size:11px;">
            <tbody>
              <tr>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">نام</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{customer.full_name}}</td>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">تلفن</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{customer.mobile_1}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کسب‌وکار</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{customer.business_name}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">نشانی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{customer.address}}</td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:8px;">${invoiceItemsBlock}</div>
  <table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:12px;">
    <tbody>
      <tr>
        <td style="width:24%; border:1px solid var(--table-border-color, #d1d5db); padding:7px; font-weight:800; background:rgba(var(--brand-50-rgb),0.62);">جمع کل فاکتور</td>
        <td style="width:26%; border:1px solid var(--table-border-color, #d1d5db); padding:7px; font-weight:700;">{{record.total_invoice_amount}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:7px; font-weight:700; background:rgba(var(--brand-50-rgb),0.44);">جمع به حروف</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:7px;">{{record.total_invoice_amount_words}}</td>
      </tr>
    </tbody>
  </table>
  <table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:12px;">
    <tbody>
      <tr>
        <td style="width:54%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:6px; color:rgb(var(--brand-500-rgb));">توضیحات</div>
          <div style="min-height:64px;">{{record.description}}</div>
        </td>
        <td style="width:46%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:6px; color:rgb(var(--brand-500-rgb));">دریافت / پرداخت</div>
          ${paymentsBlock}
          <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:11px;">
            <tbody>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700;">جمع پرداختی‌ها</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.total_received_amount}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700;">جمع باقیمانده</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.remaining_balance}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
</div>`.trim(),
      footerHtml: buildDefaultFooterTemplateForModule().trim(),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'default_invoice_official',
      moduleId,
      title: 'فاکتور فروش رسمی',
      description: 'نسخه پیش‌فرض A4 افقی با فیلدهای رسمی فروشنده و خریدار',
      paperSize: 'A4',
      orientation: 'landscape',
      isActive: true,
      isSystem: true,
      showHeader: true,
      showFooter: true,
      headerHeight: 84,
      footerHeight: 62,
      pageMarginTop: DEFAULT_PAGE_MARGINS.top,
      pageMarginRight: DEFAULT_PAGE_MARGINS.right,
      pageMarginBottom: DEFAULT_PAGE_MARGINS.bottom,
      pageMarginLeft: DEFAULT_PAGE_MARGINS.left,
      headerHtml: buildDefaultHeaderTemplateForModule(moduleId).trim(),
      contentHtml: `<div style="direction:rtl; color:#111827; font-family:inherit;">
  <table style="width:100%; border-collapse:collapse; font-size:12px; line-height:1.9;">
    <tbody>
      <tr>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; vertical-align:top; background:rgba(var(--brand-50-rgb),0.18);">
          <div style="font-weight:800; margin-bottom:6px; color:rgb(var(--brand-500-rgb));">مشخصات فروشنده</div>
          <table style="width:100%; border-collapse:collapse; font-size:11px;">
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
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:6px; color:rgb(var(--brand-500-rgb));">مشخصات خریدار</div>
          <table style="width:100%; border-collapse:collapse; font-size:11px;">
            <tbody>
              <tr>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">نوع</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{customer.person_type}}</td>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">نام</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{customer.full_name}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کسب‌وکار</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{customer.business_name}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">شناسه/ملی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{customer.national_identifier}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">شماره ثبت</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{customer.registration_number}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کد اقتصادی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{customer.economic_code}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کد پستی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{customer.postal_code}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">تلفن</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{customer.mobile_1}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">نشانی</td>
                <td colspan="3" style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{customer.address}}</td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:8px;">${invoiceItemsBlock}</div>
  <table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:12px;">
    <tbody>
      <tr>
        <td style="width:24%; border:1px solid var(--table-border-color, #d1d5db); padding:7px; font-weight:800; background:rgba(var(--brand-50-rgb),0.62);">جمع کل فاکتور</td>
        <td style="width:26%; border:1px solid var(--table-border-color, #d1d5db); padding:7px; font-weight:700;">{{record.total_invoice_amount}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:7px; font-weight:700; background:rgba(var(--brand-50-rgb),0.44);">جمع به حروف</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:7px;">{{record.total_invoice_amount_words}}</td>
      </tr>
    </tbody>
  </table>
  <table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:12px;">
    <tbody>
      <tr>
        <td style="width:54%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:6px; color:rgb(var(--brand-500-rgb));">شرح / توضیحات</div>
          <div style="min-height:64px;">{{record.description}}</div>
        </td>
        <td style="width:46%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:6px; color:rgb(var(--brand-500-rgb));">پرداخت‌ها</div>
          ${paymentsBlock}
          <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:11px;">
            <tbody>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700;">جمع پرداختی‌ها</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.total_received_amount}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700;">جمع باقیمانده</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.remaining_balance}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
</div>`.trim(),
      footerHtml: buildDefaultFooterTemplateForModule().trim(),
      createdAt: now,
      updatedAt: now,
    },
    compactA6Template,
  ];
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
        isSystem: true,
        createdAt: existing.createdAt || defaultTemplate.createdAt,
        updatedAt: existing.updatedAt || defaultTemplate.updatedAt,
      };
    }
  });

  return next;
};



