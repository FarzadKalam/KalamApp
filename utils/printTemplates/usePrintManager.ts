import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import { PrintTemplate } from './index';
import { InvoiceCard } from './templates/invoice-card';
import { ProductLabel } from './templates/product-label';
import { ProductionPassport } from './templates/production-passport';
import { toPersianNumber, formatPersianPrice, safeJalaliFormat } from '../../utils/persianNumberFormatter';
import { supabase } from '../../supabaseClient';
import {
  buildDefaultTemplatesForModule,
  getModuleTitle,
  getSystemTemplateFieldOptions,
  loadPrintTemplatesStore,
  mergeTemplatesWithDefaults,
  type StoredPrintTemplate,
} from './store';

interface UsePrintManagerProps {
  moduleId: string;
  data: any;
  moduleConfig: any;
  printableFields: any[];
  formatPrintValue: (field: any, value: any) => string;
  relationOptions?: Record<string, any[]>;
}

const DEFAULT_PAGE_MARGINS = { top: 8, right: 8, bottom: 8, left: 8 } as const;
const PRINT_COLUMN_IGNORE_KEYS = new Set(['id', 'key', 'created_at', 'updated_at']);
const PRICE_PATH_PATTERN = /amount|price|total|balance|discount|vat|tax|debt|credit|cost/i;

const getPathValue = (obj: any, path: string) =>
  path.split('.').reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), obj);

const toNumberSafe = (value: any): number => {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = String(value)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/,/g, '')
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toPersianWords = (value: number): string => {
  const ones = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
  const teens = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
  const tens = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
  const hundreds = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
  const scales = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

  const convertHundreds = (num: number) => {
    const parts: string[] = [];
    const h = Math.floor(num / 100);
    const rem = num % 100;
    if (h > 0) parts.push(hundreds[h]);
    if (rem >= 10 && rem < 20) {
      parts.push(teens[rem - 10]);
    } else {
      const t = Math.floor(rem / 10);
      const o = rem % 10;
      if (t > 0) parts.push(tens[t]);
      if (o > 0) parts.push(ones[o]);
    }
    return parts.join(' و ');
  };

  const n = Math.floor(Math.abs(value));
  if (!Number.isFinite(n) || n === 0) return 'صفر';

  const chunks: string[] = [];
  let remaining = n;
  let scaleIndex = 0;
  while (remaining > 0 && scaleIndex < scales.length) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      const chunkWords = convertHundreds(chunk);
      const scale = scales[scaleIndex];
      chunks.unshift(scale ? `${chunkWords} ${scale}` : chunkWords);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIndex += 1;
  }
  return chunks.join(' و ');
};

const mmToPx = (value: number) => (value * 96) / 25.4;

const getPaperSizeMetrics = (
  paperSize?: 'A4' | 'A5' | 'A6',
  orientation: 'portrait' | 'landscape' = 'portrait'
) => {
  const base = paperSize === 'A6'
    ? { w: 105, h: 148 }
    : paperSize === 'A5'
      ? { w: 148, h: 210 }
      : { w: 210, h: 297 };

  const width = orientation === 'landscape' ? base.h : base.w;
  const height = orientation === 'landscape' ? base.w : base.h;
  return { widthMm: width, heightMm: height };
};

const getAttachmentCount = (record: any) => {
  const explicitCount = Number(record?.attachment_count);
  if (Number.isFinite(explicitCount) && explicitCount >= 0) return explicitCount;

  const candidates = [record?.attachments, record?.files, record?.documents, record?.images];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.length;
  }
  return 0;
};

const COMMON_VALUE_LABELS: Record<string, string> = {
  active: 'فعال',
  inactive: 'غیرفعال',
  approved: 'تایید شده',
  rejected: 'رد شده',
  pending: 'در انتظار',
  draft: 'پیش نویس',
  final: 'نهایی',
  received: 'دریافت شده',
  paid: 'پرداخت شده',
  unpaid: 'پرداخت نشده',
  partial: 'جزئی',
  card: 'کارت',
  cash: 'نقد',
  cheque: 'چک',
  bank_transfer: 'انتقال بانکی',
  transfer: 'انتقال',
  legal: 'حقوقی',
  real: 'حقیقی',
  official: 'رسمی',
  unofficial: 'غیررسمی',
};

const localizePlainText = (value: any): string => {
  if (value === null || value === undefined) return '-';
  const raw = String(value).trim();
  if (!raw) return '-';
  if (/^https?:\/\//i.test(raw) || /^data:image\//i.test(raw)) return raw;
  const normalized = raw.toLowerCase();
  if (COMMON_VALUE_LABELS[normalized]) return COMMON_VALUE_LABELS[normalized];
  return toPersianNumber(raw);
};

const getDisplayValue = (value: any): string => {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) return value.map((item) => getDisplayValue(item)).join('، ');
  if (typeof value === 'object') {
    return localizePlainText(value.name || value.title || value.full_name || value.system_code || value.id || '-');
  }
  return localizePlainText(value);
};

const toPersianPlain = (value: any) => toPersianNumber(String(value ?? ''));
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

export const usePrintManager = ({
  moduleId,
  data,
  moduleConfig,
  printableFields,
  formatPrintValue,
  relationOptions = {},
}: UsePrintManagerProps) => {
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [printMode, setPrintMode] = useState(false);
  const [selectedPrintFields, setSelectedPrintFields] = useState<Record<string, string[]>>({});
  const [sellerInfo, setSellerInfo] = useState<any>(null);
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [storedTemplates, setStoredTemplates] = useState<StoredPrintTemplate[]>([]);
  const bodyMeasureRef = useRef<HTMLDivElement | null>(null);
  const [renderedPageCount, setRenderedPageCount] = useState(1);
  const [forcedPrintPageCount, setForcedPrintPageCount] = useState<number | null>(null);

  const loadTemplates = useCallback(async (mounted = true) => {
    try {
      const loaded = await loadPrintTemplatesStore();
      if (!mounted) return;
      setStoredTemplates((loaded.templatesByModule[moduleId] || []).filter((tpl) => tpl.isActive !== false));
    } catch (err) {
      console.error('Load print templates failed', err);
      if (mounted) setStoredTemplates([]);
    }
  }, [moduleId]);

  useEffect(() => {
    let mounted = true;
    loadTemplates(mounted);
    return () => {
      mounted = false;
    };
  }, [loadTemplates]);

  const availableTemplates = useMemo<StoredPrintTemplate[]>(() => {
    const merged = mergeTemplatesWithDefaults(moduleId, storedTemplates);
    const activeMerged = merged.filter((tpl) => tpl.isActive !== false);
    if (activeMerged.length > 0) return activeMerged;
    return buildDefaultTemplatesForModule(moduleId).filter((tpl) => tpl.isActive !== false);
  }, [moduleId, storedTemplates]);

  const printTemplates = useMemo<PrintTemplate[]>(() => {
    return availableTemplates.map((tpl) => ({
      id: `custom:${tpl.id}`,
      title: tpl.title,
      description: tpl.description || 'قالب سفارشی',
      isSystem: tpl.isSystem === true,
    }));
  }, [availableTemplates]);

  useEffect(() => {
    if (!printTemplates.length) {
      setSelectedTemplateId('');
      return;
    }
    if (printTemplates.some((tpl) => tpl.id === selectedTemplateId)) return;
    setSelectedTemplateId(printTemplates[0].id);
  }, [printTemplates, selectedTemplateId]);

  const activeTemplate = printTemplates.find((t) => t.id === selectedTemplateId) || printTemplates[0];
  const selectedTemplateMeta = useMemo(
    () => printTemplates.find((tpl) => tpl.id === selectedTemplateId) || null,
    [printTemplates, selectedTemplateId]
  );
  const selectedStoredTemplate = useMemo(() => {
    if (!selectedTemplateId.startsWith('custom:')) return null;
    const id = selectedTemplateId.replace('custom:', '');
    return availableTemplates.find((tpl) => tpl.id === id) || null;
  }, [availableTemplates, selectedTemplateId]);
  const systemTemplateFieldOptions = useMemo(() => {
    return getSystemTemplateFieldOptions(moduleId).map((item) => ({
      key: item.key,
      labels: { fa: item.label },
      value: true,
      group: item.group,
      kind: item.kind,
    }));
  }, [moduleId]);
  const isSelectedTemplateSystem = Boolean(selectedStoredTemplate?.isSystem || selectedTemplateMeta?.isSystem);
  const printableFieldsForTemplate = useMemo(() => {
    if (!isSelectedTemplateSystem) return printableFields;
    return systemTemplateFieldOptions;
  }, [isSelectedTemplateSystem, printableFields, systemTemplateFieldOptions]);
  const templateSelectedKeySet = useMemo(
    () => new Set<string>(selectedPrintFields[selectedTemplateId] || []),
    [selectedPrintFields, selectedTemplateId]
  );
  const knownSystemFieldKeys = useMemo(
    () => new Set<string>((systemTemplateFieldOptions || []).map((item: any) => String(item?.key || '').trim()).filter(Boolean)),
    [systemTemplateFieldOptions]
  );
  const hasTemplateSelectionState = useMemo(
    () => Object.prototype.hasOwnProperty.call(selectedPrintFields, selectedTemplateId),
    [selectedPrintFields, selectedTemplateId]
  );
  const isSystemFieldVisible = useCallback(
    (fieldPath: string) => {
      if (!isSelectedTemplateSystem) return true;
      if (!hasTemplateSelectionState) return true;
      if (!knownSystemFieldKeys.has(fieldPath)) return true;
      return templateSelectedKeySet.has(fieldPath);
    },
    [hasTemplateSelectionState, isSelectedTemplateSystem, knownSystemFieldKeys, templateSelectedKeySet]
  );
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const printQrValue = pageUrl;

  const openPrintModal = useCallback(() => {
    setIsPrintModalOpen(true);
  }, []);

  const closePrintModal = useCallback(() => {
    setIsPrintModalOpen(false);
  }, []);

  const handlePrint = useCallback(() => {
    if (!selectedTemplateId) return;

    let measuredPageCount = renderedPageCount;
    let previewPageCount = 0;
    if (typeof document !== 'undefined') {
      previewPageCount = document.querySelectorAll('.print-preview-scale .print-template-page').length || 0;
    }
    if (selectedTemplateId.startsWith('custom:') && selectedStoredTemplate && bodyMeasureRef.current) {
      const metrics = getPaperSizeMetrics(
        selectedStoredTemplate.paperSize,
        selectedStoredTemplate.orientation || 'portrait'
      );
      const showHeader = selectedStoredTemplate.showHeader !== false;
      const showFooter = selectedStoredTemplate.showFooter !== false;
      const headerHeight = Number(selectedStoredTemplate.headerHeight || 84);
      const footerHeight = Number(selectedStoredTemplate.footerHeight || 62);
      const pageMargins = {
        top: Number(selectedStoredTemplate.pageMarginTop ?? DEFAULT_PAGE_MARGINS.top),
        right: Number(selectedStoredTemplate.pageMarginRight ?? DEFAULT_PAGE_MARGINS.right),
        bottom: Number(selectedStoredTemplate.pageMarginBottom ?? DEFAULT_PAGE_MARGINS.bottom),
        left: Number(selectedStoredTemplate.pageMarginLeft ?? DEFAULT_PAGE_MARGINS.left),
      };
      const innerHeightMm = Math.max(40, metrics.heightMm - pageMargins.top - pageMargins.bottom);
      const pageBodyHeightPx = Math.max(
        80,
        mmToPx(innerHeightMm) - (showHeader ? headerHeight : 0) - (showFooter ? footerHeight : 0)
      );
      const bodyMeasure = bodyMeasureRef.current;
      const bodyRectHeight = Math.ceil(bodyMeasure.getBoundingClientRect().height || 0);
      const bodyHeight = Math.max(
        bodyMeasure.scrollHeight,
        bodyMeasure.offsetHeight,
        bodyMeasure.clientHeight,
        bodyRectHeight,
        1
      );
      measuredPageCount = Math.max(1, Math.ceil(bodyHeight / pageBodyHeightPx));
    }
    if (previewPageCount > measuredPageCount) {
      measuredPageCount = previewPageCount;
    }
    if (measuredPageCount !== renderedPageCount) {
      setRenderedPageCount(measuredPageCount);
    }
    const nextForcedPages = selectedTemplateId.startsWith('custom:')
      ? Math.max(1, measuredPageCount, previewPageCount || 0)
      : null;
    setForcedPrintPageCount(nextForcedPages);

    if (typeof document !== 'undefined') {
      document.body.classList.add('print-mode');
      const currentTpl = selectedTemplateId.startsWith('custom:')
        ? availableTemplates.find((tpl) => tpl.id === selectedTemplateId.replace('custom:', '')) || null
        : null;
      const pageSize = currentTpl
        ? `${currentTpl.paperSize || 'A4'} ${currentTpl.orientation === 'landscape' ? 'landscape' : 'portrait'}`
        : selectedTemplateId === 'product_label'
          ? 'A6 portrait'
          : 'A4 portrait';
      const styleId = 'dynamic-print-page-style';
      let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `@media print { @page { size: ${pageSize}; margin: 0; } }`;
    }
    setPrintMode(true);
    const expectedCustomPages = selectedTemplateId.startsWith('custom:')
      ? Math.max(1, measuredPageCount, previewPageCount || 0)
      : 1;

    let tries = 0;
    const triggerPrint = () => {
      const printRoot = document.getElementById('print-root');
      const hasContent = Boolean(printRoot && String(printRoot.innerHTML || '').trim().length > 0);
      const renderedPages =
        printRoot?.querySelectorAll?.('.print-template-page')?.length || 0;
      const hasExpectedPages =
        expectedCustomPages <= 1 ? hasContent : renderedPages >= expectedCustomPages;

      if ((!hasContent || !hasExpectedPages) && tries < 50) {
        tries += 1;
        setTimeout(triggerPrint, 80);
        return;
      }
      if (!hasContent || !hasExpectedPages) {
        setPrintMode(false);
        if (typeof document !== 'undefined') {
          document.body.classList.remove('print-mode');
        }
        return;
      }

      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      setTimeout(() => {
        window.print();
        // Keep print mode active until afterprint; fallback timeout is only for edge browsers.
        setTimeout(() => setPrintMode(false), 15000);
      }, 180);
    };

    setTimeout(triggerPrint, 180);
  }, [availableTemplates, renderedPageCount, selectedStoredTemplate, selectedTemplateId]);

  useEffect(() => {
    if (printMode) return;
    setForcedPrintPageCount(null);
  }, [printMode]);

  useEffect(() => {
    if (!printMode) return;
    const handleAfterPrint = () => setPrintMode(false);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, [printMode]);

  useEffect(() => {
    if (!selectedTemplateId) return;
    const defaultKeys = isSelectedTemplateSystem
      ? (
          (Array.isArray(selectedStoredTemplate?.selectedFieldKeys) && selectedStoredTemplate?.selectedFieldKeys.length > 0
            ? selectedStoredTemplate.selectedFieldKeys
            : printableFieldsForTemplate.map((field: any) => field.key)) || []
        )
      : (printableFieldsForTemplate || []).map((field: any) => field.key);

    if (!defaultKeys.length) return;

    setSelectedPrintFields((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, selectedTemplateId)) return prev;
      return {
        ...prev,
        [selectedTemplateId]: defaultKeys,
      };
    });
  }, [
    isSelectedTemplateSystem,
    printableFieldsForTemplate,
    selectedStoredTemplate?.selectedFieldKeys,
    selectedTemplateId,
  ]);

  const handleTogglePrintField = useCallback((templateId: string, fieldName: string) => {
    setSelectedPrintFields((prev) => {
      const current = prev[templateId] || [];
      if (current.includes(fieldName)) {
        return { ...prev, [templateId]: current.filter((f) => f !== fieldName) };
      }
      return { ...prev, [templateId]: [...current, fieldName] };
    });
  }, []);

  const invoiceSummary = useMemo(() => {
    const items = Array.isArray(data?.invoiceItems) ? data.invoiceItems : [];
    const payments = Array.isArray(data?.payments) ? data.payments : [];
    const itemsTotal = items.reduce((sum: number, row: any) => {
      const rowTotal = toNumberSafe(row?.total_price);
      if (rowTotal > 0) return sum + rowTotal;
      const qty = toNumberSafe(row?.quantity);
      const unit = toNumberSafe(row?.unit_price);
      return sum + qty * unit;
    }, 0);
    const paymentsTotal = payments.reduce((sum: number, row: any) => {
      const status = String(row?.status || '').toLowerCase();
      const isReceived = !status || status === 'received' || status === 'paid' || status === 'cleared';
      return isReceived ? sum + toNumberSafe(row?.amount) : sum;
    }, 0);

    const rawTotal = toNumberSafe(
      data?.total_invoice_amount ?? data?.total_amount ?? data?.grand_total ?? data?.final_amount
    );
    const rawReceived = toNumberSafe(
      data?.total_received_amount ?? data?.received_amount ?? data?.paid_amount
    );
    const rawRemaining = toNumberSafe(
      data?.remaining_balance ?? data?.remaining_amount ?? data?.due_amount ?? data?.balance
    );

    const hasRawRemaining =
      data?.remaining_balance !== undefined ||
      data?.remaining_amount !== undefined ||
      data?.due_amount !== undefined ||
      data?.balance !== undefined;

    const received = rawReceived > 0 ? rawReceived : paymentsTotal;
    const total =
      rawTotal > 0
        ? rawTotal
        : itemsTotal > 0
          ? itemsTotal
          : rawRemaining > 0 || received > 0
            ? rawRemaining + received
            : 0;
    const remaining = hasRawRemaining ? rawRemaining : Math.max(total - received, 0);

    return { total, received, remaining };
  }, [data]);

  const buildCompactFieldsTableHtml = useCallback(() => {
    const fields = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [];
    const rows = fields
      .filter((field: any) => field?.key && !PRINT_COLUMN_IGNORE_KEYS.has(String(field.key)))
      .map((field: any) => {
        const raw = data?.[field.key];
        if (raw === null || raw === undefined || raw === '') return null;
        let displayValue = '';
        try {
          displayValue = String(formatPrintValue(field, raw) || '').trim();
        } catch {
          displayValue = '';
        }
        if (!displayValue) displayValue = localizePlainText(raw);
        if (!displayValue || displayValue === '-') return null;
        return `
          <tr>
            <td style="width:38%; border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">${field.labels?.fa || field.key}</td>
            <td style="border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px;">${displayValue}</td>
          </tr>
        `;
      })
      .filter(Boolean)
      .slice(0, 24)
      .join('');

    if (!rows) {
      return '<div style="padding:8px;border:1px solid var(--table-border-color, #d1d5db);border-radius:8px;">مقدار قابل چاپی ثبت نشده است.</div>';
    }
    return `
      <table style="width:100%; border-collapse:collapse; font-size:11px;">
        <tbody>${rows}</tbody>
      </table>
    `;
  }, [data, formatPrintValue, moduleConfig?.fields]);

  const buildInvoiceItemsTable = useCallback((items: any[]) => {
    if (!Array.isArray(items) || items.length === 0) {
      return '<div style="padding:8px;border:1px solid #e5e7eb;border-radius:6px;">اقلامی ثبت نشده است.</div>';
    }

    const rows = items
      .map((item: any) => {
        const productName = item?.selected_product_name || item?.product_name || item?.product?.name || item?.name || '-';
        const quantity = toPersianNumber(String(item?.quantity || 0));
        const unitPrice = formatPersianPrice(Number(item?.unit_price || 0));
        const total = formatPersianPrice(Number(item?.quantity || 0) * Number(item?.unit_price || 0));
        return `
          <tr>
            <td style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;">${productName}</td>
            <td style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;text-align:center;">${quantity}</td>
            <td style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;text-align:center;">${unitPrice}</td>
            <td style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;text-align:center;">${total}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr>
            <th style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;">کالا</th>
            <th style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;">تعداد</th>
            <th style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;">قیمت واحد</th>
            <th style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;">جمع</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }, []);

  const getFieldOptionLabel = useCallback(
    (fieldKey: string, rawValue: any, blockId?: string) => {
      if (rawValue === null || rawValue === undefined || rawValue === '') return '';

      if (blockId) {
        const block = Array.isArray(moduleConfig?.blocks) ? moduleConfig.blocks.find((item: any) => item.id === blockId) : null;
        const column = block?.tableColumns?.find((item: any) => item.key === fieldKey);
        const option = Array.isArray(column?.options) ? column.options.find((item: any) => String(item.value) === String(rawValue)) : null;
        if (option?.label) return String(option.label);
      }

      const field = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields.find((item: any) => item.key === fieldKey) : null;
      const option = Array.isArray(field?.options) ? field.options.find((item: any) => String(item.value) === String(rawValue)) : null;
      return option?.label ? String(option.label) : '';
    },
    [moduleConfig?.blocks, moduleConfig?.fields]
  );

  const formatCellValue = useCallback(
    (blockId: string, column: any, row: any): string => {
      if (!column) return '-';
      const key = column.key;
      const rawValue =
        row?.[key] ??
        row?.[`${key}_label`] ??
        row?.[`${key}_name`] ??
        (key === 'product_id' ? row?.selected_product_name : undefined);

      if (key === 'dimensions') {
        const length = row?.length;
        const width = row?.width;
        if (length || width) return `${toPersianPlain(length || 0)} × ${toPersianPlain(width || 0)}`;
        return '-';
      }

      const optionLabel = getFieldOptionLabel(key, rawValue, blockId);
      if (optionLabel) return optionLabel;

      if (column.type === 'date' || key.toLowerCase().includes('date')) {
        return rawValue ? toPersianNumber(safeJalaliFormat(rawValue, 'YYYY/MM/DD')) : '-';
      }

      if (column.type === 'price' || ['amount', 'unit_price', 'total_price', 'discount', 'vat'].includes(key)) {
        return rawValue === null || rawValue === undefined || rawValue === '' ? '-' : formatPersianPrice(rawValue);
      }

      if (column.type === 'number' || ['quantity', 'length', 'width', 'sub_quantity'].includes(key)) {
        return rawValue === null || rawValue === undefined || rawValue === '' ? '-' : toPersianPlain(rawValue);
      }

      try {
        const rendered = formatPrintValue(
          {
            key,
            type: column.type,
            labels: { fa: column.title || key },
            options: column.options,
          },
          rawValue
        );
        if (rendered && rendered !== String(rawValue)) return String(rendered);
      } catch {
        // noop
      }

      return getDisplayValue(rawValue);
    },
    [formatPrintValue, getFieldOptionLabel]
  );

  const buildBlockSummaryMap = useCallback(
    (blockId: string, rows: any[]) => {
      const summary: Record<string, string> = {};
      const block = Array.isArray(moduleConfig?.blocks) ? moduleConfig.blocks.find((item: any) => item.id === blockId) : null;
      const columns = Array.isArray(block?.tableColumns) ? block.tableColumns : [];
      columns
        .filter((column: any) => column.showTotal)
        .forEach((column: any) => {
          const total = (rows || []).reduce((acc: number, row: any) => acc + Number(row?.[column.key] || 0), 0);
          summary[column.key] = formatPersianPrice(total);
        });
      return summary;
    },
    [moduleConfig?.blocks]
  );

  const pruneEmptyTableCells = useCallback((table: HTMLTableElement) => {
    const normalizeCellText = (cell: Element | null) =>
      String(cell?.textContent || '')
        .replace(/\u200c/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
    bodyRows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll('td,th'));
      if (cells.length === 0) return;
      const isEmpty = cells.every((cell) => {
        const text = normalizeCellText(cell);
        return !text || text === '-' || text === '---';
      });
      if (isEmpty) row.remove();
    });
  }, []);

  const renderBlockTemplateHtml = useCallback(
    (templateHtml: string) => {
      if (typeof window === 'undefined' || !templateHtml) return templateHtml;
      const parser = new window.DOMParser();
      const doc = parser.parseFromString(`<div id="print-block-root">${templateHtml}</div>`, 'text/html');
      const root = doc.getElementById('print-block-root');
      if (!root) return templateHtml;

      root.querySelectorAll<HTMLTableElement>('table[data-print-block]').forEach((table) => {
        const blockId = table.getAttribute('data-print-block') || '';
        const tbody = table.querySelector('tbody');
        if (!tbody || !blockId) return;

        const templateRows = Array.from(tbody.querySelectorAll('tr'));
        const templateRow =
          templateRows.find((row) => /{{\s*row\.[a-zA-Z0-9_]+\s*}}/.test(row.innerHTML)) ||
          templateRows.find((row) => row.querySelector('td,th')) ||
          null;
        if (!templateRow) return;

        const rowTemplate = templateRow.outerHTML;
        const templateCells = Array.from(templateRow.querySelectorAll('td,th'));
        const hiddenColumnIndexes: number[] = [];
        templateCells.forEach((cell, index) => {
          const match = String(cell.innerHTML || '').match(/{{\s*row\.([a-zA-Z0-9_]+)\s*}}/);
          if (!match) return;
          const key = String(match[1] || '').trim();
          if (!key) return;
          if (!isSystemFieldVisible(`block.${blockId}.${key}`)) hiddenColumnIndexes.push(index);
        });

        const visibleTokenCount = templateCells.reduce((count, cell) => {
          const match = String(cell.innerHTML || '').match(/{{\s*row\.([a-zA-Z0-9_]+)\s*}}/);
          if (!match) return count;
          return isSystemFieldVisible(`block.${blockId}.${String(match[1] || '').trim()}`) ? count + 1 : count;
        }, 0);
        if (templateCells.length > 0 && visibleTokenCount === 0) {
          table.remove();
          return;
        }

        const rows = Array.isArray(data?.[blockId]) ? data[blockId] : [];

        if (rows.length === 0) {
          const colspan = Math.max(
            table.querySelectorAll('thead th').length,
            templateRow.querySelectorAll('td,th').length,
            1
          );
          tbody.innerHTML = `<tr><td colspan="${colspan}" style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;text-align:center;">موردی ثبت نشده است.</td></tr>`;
        } else {
          tbody.innerHTML = rows
            .map((row: any) =>
              rowTemplate.replace(/{{\s*row\.([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => {
                if (key === 'description') {
                  const value = getDisplayValue(row?.description || row?.notes || '');
                  return value === '-' ? '' : value;
                }
                if (key === '__invoice_item_meta__') {
                  const optionalParts: string[] = [];
                  if (row?.length && row?.width) optionalParts.push(`ابعاد: ${formatCellValue(blockId, { key: 'dimensions', title: 'ابعاد', type: 'text' }, row)}`);
                  if (row?.start_date) optionalParts.push(`شروع: ${formatCellValue(blockId, { key: 'start_date', title: 'تاریخ شروع', type: 'date' }, row)}`);
                  if (row?.end_date) optionalParts.push(`پایان: ${formatCellValue(blockId, { key: 'end_date', title: 'تاریخ پایان', type: 'date' }, row)}`);
                  if (row?.sub_quantity) {
                    const subQty = formatCellValue(blockId, { key: 'sub_quantity', title: 'تعداد فرعی', type: 'number' }, row);
                    const subUnit = formatCellValue(blockId, { key: 'sub_unit', title: 'واحد فرعی', type: 'text' }, row);
                    if (subQty !== '-') optionalParts.push(`فرعی: ${subQty}${subUnit && subUnit !== '-' ? ` ${subUnit}` : ''}`);
                  }
                  return optionalParts.join(' | ');
                }
                if (key === 'cheque_status') {
                  const statusValue = row?.cheque_status || row?.status || '';
                  return statusValue ? getDisplayValue(statusValue) : '';
                }
                if (key === 'cheque_serial_no') {
                  return getDisplayValue(row?.cheque_serial_no || row?.serial_no || '');
                }
                if (key === 'cheque_due_date') {
                  const due = row?.cheque_due_date || row?.due_date || '';
                  return due ? formatCellValue(blockId, { key: 'cheque_due_date', title: 'تاریخ سررسید', type: 'date' }, { cheque_due_date: due }) : '';
                }
                if (key === 'cheque_bank_name') {
                  return getDisplayValue(row?.cheque_bank_name || row?.bank_name || '');
                }
                if (!isSystemFieldVisible(`block.${blockId}.${key}`)) return '';
                if (key === 'product_id') {
                  return formatCellValue(blockId, { key, title: 'محصول', type: 'relation' }, row);
                }
                if (key === 'dimensions') {
                  return formatCellValue(blockId, { key, title: 'ابعاد', type: 'text' }, row);
                }
                const block = Array.isArray(moduleConfig?.blocks) ? moduleConfig.blocks.find((item: any) => item.id === blockId) : null;
                const column = block?.tableColumns?.find((item: any) => item.key === key) || { key, title: key, type: 'text' };
                return formatCellValue(blockId, column, row);
              })
            )
            .join('');
        }

        if (hiddenColumnIndexes.length > 0) {
          const indexes = [...hiddenColumnIndexes].sort((a, b) => b - a);
          Array.from(table.querySelectorAll('tr')).forEach((row) => {
            const cells = Array.from(row.querySelectorAll('td,th'));
            indexes.forEach((index) => {
              if (index < cells.length) cells[index].remove();
            });
          });
        }

        const summaryMap = buildBlockSummaryMap(blockId, rows);
        table.innerHTML = table.innerHTML.replace(/{{\s*summary\.([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => summaryMap[key] || '-');
        pruneEmptyTableCells(table);
        table.setAttribute(
          'style',
          `${table.getAttribute('style') || ''};width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;`
        );
      });

      return root.innerHTML;
    },
    [buildBlockSummaryMap, data, formatCellValue, isSystemFieldVisible, moduleConfig?.blocks, pruneEmptyTableCells]
  );

  const buildBlockTableHtml = useCallback(
    (blockId: string) => {
      const block = Array.isArray(moduleConfig?.blocks) ? moduleConfig.blocks.find((item: any) => item.id === blockId) : null;
      const rows = data?.[blockId];

      if (!block || !Array.isArray(block?.tableColumns)) {
        return `<div style="padding:8px;border:1px dashed #d1d5db;border-radius:8px;">بلاک ${blockId} تعریف نشده است.</div>`;
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        return `<div style="padding:8px;border:1px solid #e5e7eb;border-radius:6px;">${block?.titles?.fa || 'بلاک'} خالی است.</div>`;
      }

      const columns = getCompactPrintColumns(block.tableColumns);
      if (columns.length === 0) {
        return `<div style="padding:8px;border:1px solid #e5e7eb;border-radius:6px;">${block?.titles?.fa || 'بلاک'} ستون قابل چاپی ندارد.</div>`;
      }
      const header = columns
        .map((column: any) => `<th style="border:1px solid var(--table-border-color, #d1d5db);padding:4px 5px;overflow-wrap:anywhere;">${column.title || column.key}</th>`)
        .join('');

      const body = rows
        .map((row: any) => {
          const cells = columns
            .map((column: any) => {
              return `<td style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;">${formatCellValue(blockId, column, row) || '-'}</td>`;
            })
            .join('');

          return `<tr>${cells}</tr>`;
        })
        .join('');

      return `
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr>${header}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      `;
    },
    [data, formatCellValue, moduleConfig?.blocks]
  );

  const resolveVariableValue = useCallback(
    (path: string): string => {
      const now = new Date();
      if (path === 'system.today_date') return toPersianNumber(safeJalaliFormat(now, 'YYYY/MM/DD'));
      if (path === 'system.today_datetime') return `${toPersianNumber(safeJalaliFormat(now, 'YYYY/MM/DD'))} ${now.toLocaleTimeString('fa-IR')}`;
      if (path === 'system.compact_fields_table') return buildCompactFieldsTableHtml();
      if (path === 'invoice.items_table') return buildInvoiceItemsTable(data?.invoiceItems || []);
      if (path.startsWith('block.')) return buildBlockTableHtml(path.replace(/^block\./, ''));
      if (path === 'record.total_invoice_amount') return formatPersianPrice(invoiceSummary.total);
      if (path === 'record.total_received_amount') return formatPersianPrice(invoiceSummary.received);
      if (path === 'record.remaining_balance') return formatPersianPrice(invoiceSummary.remaining);
      if (path === 'record.total_invoice_amount_words') return `${toPersianWords(invoiceSummary.total)} ریال`;
      if (path === 'responsible.name') {
        return localizePlainText(data?.assignee_name || data?.responsible_name || data?.created_by_name || '');
      }
      if (path === 'module.title') return getModuleTitle(moduleId, 'singular') || moduleConfig?.titles?.fa || '';
      if (path === 'module.title_plural') return getModuleTitle(moduleId, 'plural') || moduleConfig?.titles?.fa || '';
      if (path === 'record.attachment_count') return toPersianNumber(String(getAttachmentCount(data)));

      const [root, ...rest] = path.split('.');
      const nestedPath = rest.join('.');
      if (!nestedPath) return '';

      let source: any = null;
      if (root === 'record') source = data || {};
      if (root === 'customer') source = customerInfo || {};
      if (root === 'company') source = sellerInfo || {};

      if (root === 'record' && nestedPath && !isSystemFieldVisible(`record.${nestedPath}`)) {
        return '';
      }

      if (root === 'company' && (nestedPath === 'logo_url' || path === 'company.logo_url')) {
        const logo = source?.logo_url || source?.logo || source?.icon_url || source?.image_url || '';
        return String(logo || '');
      }
      if (root === 'company' && nestedPath === 'currency_label') {
        return localizePlainText(source?.currency_label || source?.currency_code || 'ریال');
      }

      const raw = getPathValue(source, nestedPath);
      if (raw === null || raw === undefined) return '';

      if (root === 'record') {
        const field = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields.find((item: any) => item.key === nestedPath) : null;
        if (field) {
          const option = Array.isArray(field.options) ? field.options.find((item: any) => String(item.value) === String(raw)) : null;
          if (option?.label) return String(option.label);
          try {
            const rendered = formatPrintValue(field, raw);
            if (rendered) return localizePlainText(rendered);
          } catch {
            // noop
          }
        }
      }

      if (root === 'customer' && nestedPath === 'person_type') {
        return String(raw) === 'حقوقی' || String(raw) === 'legal' ? 'حقوقی' : 'حقیقی';
      }
      if (root === 'customer' && nestedPath === 'national_identifier') {
        const identifier = String(source?.person_type || '').includes('حقوق')
          ? String(source?.national_id || source?.company_national_id || raw || '')
          : String(source?.national_code || raw || '');
        return localizePlainText(identifier);
      }

      if (path === 'record.invoice_date' || path === 'record.updated_at' || path === 'record.created_at') {
        return toPersianNumber(safeJalaliFormat(raw, 'YYYY/MM/DD'));
      }
      if (path === 'company.logo_url' || nestedPath.endsWith('logo_url')) {
        const logo = source?.logo_url || source?.logo || source?.icon_url || source?.image_url || raw || '';
        return String(logo || '');
      }
      if (typeof raw === 'number') return toPersianNumber(String(raw));
      if (typeof raw === 'string') {
        const pathKey = nestedPath.toLowerCase();
        if (
          PRICE_PATH_PATTERN.test(pathKey) &&
          /^[۰-۹٠-٩\d\s,.-]+$/.test(raw)
        ) {
          return formatPersianPrice(raw);
        }
      }
      return localizePlainText(raw);
    },
    [
      buildBlockTableHtml,
      buildCompactFieldsTableHtml,
      buildInvoiceItemsTable,
      data,
      customerInfo,
      formatPrintValue,
      invoiceSummary.received,
      invoiceSummary.remaining,
      invoiceSummary.total,
      moduleConfig?.fields,
      moduleConfig?.titles?.fa,
      moduleId,
      sellerInfo,
      isSystemFieldVisible,
    ]
  );

  const localizeHtmlNumbers = useCallback((html: string) => {
    if (typeof window === 'undefined' || !html) return html;
    const parser = new window.DOMParser();
    const doc = parser.parseFromString(`<div id="print-num-root">${html}</div>`, 'text/html');
    const root = doc.getElementById('print-num-root');
    if (!root) return html;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      const textNode = current as Text;
      const parentTag = textNode.parentElement?.tagName?.toLowerCase();
      if (parentTag !== 'script' && parentTag !== 'style') {
        textNode.nodeValue = toPersianNumber(String(textNode.nodeValue || ''));
      }
      current = walker.nextNode();
    }
    return root.innerHTML;
  }, []);

  const refreshTemplates = useCallback(async () => {
    await loadTemplates(true);
  }, [loadTemplates]);

  const previewMeta = useMemo(
    () => ({
      orientation: selectedStoredTemplate?.orientation || 'portrait',
      paperSize: selectedStoredTemplate?.paperSize || 'A4',
    }),
    [selectedStoredTemplate?.orientation, selectedStoredTemplate?.paperSize]
  );

  const fillTemplateHtml = useCallback(
    (templateHtml?: string) => {
      if (!templateHtml) return '';
      const filled = templateHtml.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (match: string, key: string) => {
        if (key.startsWith('row.') || key.startsWith('summary.')) return match;
        return resolveVariableValue(key);
      });
      return DOMPurify.sanitize(filled, {
        ADD_ATTR: [
          'style',
          'data-background-color',
          'data-border-color',
          'data-print-block',
        ],
      });
    },
    [resolveVariableValue]
  );

  const renderedCustomTemplate = useMemo(() => {
    if (!selectedStoredTemplate) return null;

    return {
      headerHtml: localizeHtmlNumbers(renderBlockTemplateHtml(fillTemplateHtml(selectedStoredTemplate.headerHtml))),
      contentHtml: localizeHtmlNumbers(renderBlockTemplateHtml(fillTemplateHtml(selectedStoredTemplate.contentHtml))),
      footerHtml: localizeHtmlNumbers(renderBlockTemplateHtml(fillTemplateHtml(selectedStoredTemplate.footerHtml))),
    };
  }, [fillTemplateHtml, localizeHtmlNumbers, renderBlockTemplateHtml, selectedStoredTemplate]);

  useEffect(() => {
    if (!selectedStoredTemplate) {
      setRenderedPageCount(1);
      return;
    }

    let r1 = 0;
    let r2 = 0;
    const measure = () => {
      const bodyMeasure = bodyMeasureRef.current;
      if (!bodyMeasure) return;

      const metrics = getPaperSizeMetrics(
        selectedStoredTemplate.paperSize,
        selectedStoredTemplate.orientation || 'portrait'
      );
      const showHeader = selectedStoredTemplate.showHeader !== false;
      const showFooter = selectedStoredTemplate.showFooter !== false;
      const headerHeight = Number(selectedStoredTemplate.headerHeight || 84);
      const footerHeight = Number(selectedStoredTemplate.footerHeight || 62);
      const pageMargins = {
        top: Number(selectedStoredTemplate.pageMarginTop ?? DEFAULT_PAGE_MARGINS.top),
        right: Number(selectedStoredTemplate.pageMarginRight ?? DEFAULT_PAGE_MARGINS.right),
        bottom: Number(selectedStoredTemplate.pageMarginBottom ?? DEFAULT_PAGE_MARGINS.bottom),
        left: Number(selectedStoredTemplate.pageMarginLeft ?? DEFAULT_PAGE_MARGINS.left),
      };

      const innerHeightMm = Math.max(40, metrics.heightMm - pageMargins.top - pageMargins.bottom);
      const pageBodyHeightPx = Math.max(
        80,
        mmToPx(innerHeightMm) - (showHeader ? headerHeight : 0) - (showFooter ? footerHeight : 0)
      );

      const bodyRectHeight = Math.ceil(bodyMeasure.getBoundingClientRect().height || 0);
      const bodyHeight = Math.max(
        bodyMeasure.scrollHeight,
        bodyMeasure.offsetHeight,
        bodyMeasure.clientHeight,
        bodyRectHeight,
        1
      );
      const nextPageCount = Math.max(1, Math.ceil(bodyHeight / pageBodyHeightPx));
      setRenderedPageCount((prev) => (prev === nextPageCount ? prev : nextPageCount));
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(r1);
      window.cancelAnimationFrame(r2);
      r1 = window.requestAnimationFrame(() => {
        r2 = window.requestAnimationFrame(measure);
      });
    };

    scheduleMeasure();
    const t1 = window.setTimeout(scheduleMeasure, 160);
    const t2 = window.setTimeout(scheduleMeasure, 480);
    const t3 = window.setTimeout(scheduleMeasure, 960);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && bodyMeasureRef.current) {
      resizeObserver = new ResizeObserver(() => scheduleMeasure());
      resizeObserver.observe(bodyMeasureRef.current);
    }

    let mutationObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined' && bodyMeasureRef.current) {
      mutationObserver = new MutationObserver(() => scheduleMeasure());
      mutationObserver.observe(bodyMeasureRef.current, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    const imageListeners: Array<{ img: HTMLImageElement; onLoad: () => void; onError: () => void }> = [];
    if (bodyMeasureRef.current) {
      const imgs = Array.from(bodyMeasureRef.current.querySelectorAll('img'));
      imgs.forEach((img) => {
        if (img.complete) return;
        const onLoad = () => scheduleMeasure();
        const onError = () => scheduleMeasure();
        img.addEventListener('load', onLoad, { once: true });
        img.addEventListener('error', onError, { once: true });
        imageListeners.push({ img, onLoad, onError });
      });
    }

    window.addEventListener('resize', scheduleMeasure);
    return () => {
      window.cancelAnimationFrame(r1);
      window.cancelAnimationFrame(r2);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.removeEventListener('resize', scheduleMeasure);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      imageListeners.forEach(({ img, onLoad, onError }) => {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
      });
    };
  }, [
    selectedStoredTemplate,
    renderedCustomTemplate?.contentHtml,
    renderedCustomTemplate?.footerHtml,
    renderedCustomTemplate?.headerHtml,
  ]);

  const renderPrintCard = useCallback(() => {
    const fieldsToDisplay = printableFieldsForTemplate.filter((field: any) => {
      const selected = selectedPrintFields[selectedTemplateId] || [];
      return selected.length === 0 || selected.includes(field.key);
    });

    if (selectedTemplateId.startsWith('custom:')) {
      const metrics = getPaperSizeMetrics(selectedStoredTemplate?.paperSize, selectedStoredTemplate?.orientation || 'portrait');
      const paper = { width: `${metrics.widthMm}mm`, minHeight: `${metrics.heightMm}mm` };
      const showHeader = selectedStoredTemplate?.showHeader !== false;
      const showFooter = selectedStoredTemplate?.showFooter !== false;
      const headerHeight = Number(selectedStoredTemplate?.headerHeight || 84);
      const footerHeight = Number(selectedStoredTemplate?.footerHeight || 62);
      const pageSize = `${selectedStoredTemplate?.paperSize || 'A4'} ${selectedStoredTemplate?.orientation === 'landscape' ? 'landscape' : 'portrait'}`;
      const pageMargins = {
        top: Number(selectedStoredTemplate?.pageMarginTop ?? DEFAULT_PAGE_MARGINS.top),
        right: Number(selectedStoredTemplate?.pageMarginRight ?? DEFAULT_PAGE_MARGINS.right),
        bottom: Number(selectedStoredTemplate?.pageMarginBottom ?? DEFAULT_PAGE_MARGINS.bottom),
        left: Number(selectedStoredTemplate?.pageMarginLeft ?? DEFAULT_PAGE_MARGINS.left),
      };
      const innerHeightMm = Math.max(40, metrics.heightMm - pageMargins.top - pageMargins.bottom);
      const pageBodyHeightPx = Math.max(
        80,
        mmToPx(innerHeightMm) - (showHeader ? headerHeight : 0) - (showFooter ? footerHeight : 0)
      );
      const effectivePageCount = Math.max(
        1,
        printMode && forcedPrintPageCount ? forcedPrintPageCount : renderedPageCount
      );
      const pageIndexes = Array.from({ length: effectivePageCount }, (_value, index) => index);

      return React.createElement(
        'div',
        {
          className: 'invoice-custom-print-shell',
          style: {
            ...paper,
            background: '#fff',
            position: 'relative',
            boxSizing: 'border-box',
            overflow: 'visible',
            color: '#111827',
          },
          'data-page-size': pageSize,
        },
        React.createElement(
          'div',
          {
            style: {
              position: 'absolute',
              insetInlineStart: -99999,
              top: 0,
              width: paper.width,
              visibility: 'hidden',
              pointerEvents: 'none',
              zIndex: -1,
            },
            'aria-hidden': true,
          },
          React.createElement('div', {
            ref: bodyMeasureRef,
            className: 'print-template-body-measure',
            dangerouslySetInnerHTML: { __html: renderedCustomTemplate?.contentHtml || '' },
          })
        ),
        ...pageIndexes.map((pageIndex) =>
          React.createElement(
            'div',
            {
              className: 'print-template-page',
              key: `print-page-${pageIndex + 1}`,
              style: {
                position: 'relative',
                width: '100%',
                height: `${metrics.heightMm}mm`,
                minHeight: `${metrics.heightMm}mm`,
                background: '#fff',
                boxSizing: 'border-box',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
                direction: 'rtl',
                padding: `${pageMargins.top}mm ${pageMargins.right}mm ${pageMargins.bottom}mm ${pageMargins.left}mm`,
                pageBreakAfter: pageIndex < effectivePageCount - 1 ? 'always' : 'auto',
                breakAfter: pageIndex < effectivePageCount - 1 ? 'page' : 'auto',
                breakInside: 'avoid',
                pageBreakInside: 'avoid',
              },
            },
            showHeader
              ? React.createElement(
                  'div',
                  {
                    className: 'print-template-header',
                    style: {
                      width: '100%',
                      background: '#fff',
                      boxSizing: 'border-box',
                      height: `${headerHeight}px`,
                      minHeight: `${headerHeight}px`,
                      overflow: 'hidden',
                      padding: 0,
                    },
                  },
                  React.createElement('div', {
                    className: 'print-template-header-inner',
                    style: { padding: '1px 0', boxSizing: 'border-box', minHeight: 0 },
                    dangerouslySetInnerHTML: { __html: renderedCustomTemplate?.headerHtml || '' },
                  })
                )
              : null,
            React.createElement(
              'div',
              {
                className: 'print-template-body',
                style: {
                  width: '100%',
                  boxSizing: 'border-box',
                  flex: '1 1 auto',
                  minHeight: `${pageBodyHeightPx}px`,
                  height: `${pageBodyHeightPx}px`,
                  position: 'relative',
                  overflow: 'hidden',
                },
              },
              React.createElement(
                'div',
                {
                  className: 'print-template-body-segment',
                  style: { width: '100%', boxSizing: 'border-box', transform: `translateY(-${pageIndex * pageBodyHeightPx}px)` },
                },
                React.createElement('div', {
                  className: 'print-template-body-inner',
                  style: { padding: '1px 0', boxSizing: 'border-box' },
                  dangerouslySetInnerHTML: { __html: renderedCustomTemplate?.contentHtml || '' },
                })
              )
            ),
            showFooter
              ? React.createElement(
                  'div',
                  {
                    className: 'print-template-footer',
                    style: {
                      width: '100%',
                      background: '#fff',
                      boxSizing: 'border-box',
                      height: `${footerHeight}px`,
                      minHeight: `${footerHeight}px`,
                      overflow: 'hidden',
                      padding: 0,
                    },
                  },
                  React.createElement(
                    'div',
                    { className: 'print-template-footer-stack', style: { display: 'flex', flexDirection: 'column', gap: 1 } },
                    React.createElement('div', {
                      className: 'print-template-footer-inner',
                      style: { padding: '1px 0', boxSizing: 'border-box', minHeight: 0 },
                      dangerouslySetInnerHTML: { __html: renderedCustomTemplate?.footerHtml || '' },
                    }),
                    effectivePageCount > 1
                      ? React.createElement(
                          'div',
                          { className: 'print-template-page-counter', style: { fontSize: 10, color: '#64748b', textAlign: 'left' } },
                          `صفحه ${toPersianNumber(`${pageIndex + 1} از ${effectivePageCount}`)}`
                        )
                      : null
                  )
                )
              : null
          )
        )
      );
    }

    switch (selectedTemplateId) {
      case 'invoice_sales_official':
      case 'invoice_sales_simple':
        return React.createElement(InvoiceCard, {
          data,
          formatPersianPrice,
          toPersianNumber,
          safeJalaliFormat,
          relationOptions,
          templateId: selectedTemplateId,
          customer: customerInfo,
          seller: sellerInfo,
        });
      case 'product_label':
        return React.createElement(ProductLabel, {
          title: activeTemplate?.title || '',
          subtitle: moduleConfig?.titles.fa || '',
          qrValue: printQrValue,
          fields: fieldsToDisplay,
          formatPrintValue,
        });
      case 'production_passport':
        return React.createElement(ProductionPassport, {
          title: activeTemplate?.title || '',
          subtitle: moduleConfig?.titles.fa || '',
          qrValue: printQrValue,
          fields: fieldsToDisplay,
          formatPrintValue,
        });
      default:
        return null;
    }
  }, [
    selectedTemplateId,
    selectedStoredTemplate?.paperSize,
    selectedStoredTemplate?.orientation,
    renderedCustomTemplate,
    forcedPrintPageCount,
    printMode,
    renderedPageCount,
    printableFieldsForTemplate,
    selectedPrintFields,
    data,
    relationOptions,
    customerInfo,
    sellerInfo,
    activeTemplate,
    moduleConfig,
    printQrValue,
    formatPrintValue,
  ]);

  useEffect(() => {
    let isMounted = true;
    const loadDependencies = async () => {
      try {
        const companyReq = supabase.from('company_settings').select('*').limit(1).maybeSingle();
        const customerReq =
          moduleId === 'invoices' && data?.customer_id
            ? supabase.from('customers').select('*').eq('id', data.customer_id).maybeSingle()
            : Promise.resolve({ data: null, error: null });

        const [{ data: companyData, error: companyError }, { data: customerData, error: customerError }] = await Promise.all([
          companyReq as any,
          customerReq as any,
        ]);
        if (!isMounted) return;
        if (!companyError) setSellerInfo(companyData || null);
        if (!customerError) setCustomerInfo(customerData || null);
      } catch (err) {
        console.error('Load print dependencies failed', err);
      }
    };

    loadDependencies();
    return () => {
      isMounted = false;
    };
  }, [moduleId, data?.customer_id]);

  return {
    isPrintModalOpen,
    selectedTemplateId,
    printMode,
    selectedPrintFields,
    printTemplates,
    activeTemplate,
    printQrValue,
    setIsPrintModalOpen,
    setSelectedTemplateId,
    setPrintMode,
    openPrintModal,
    closePrintModal,
    handlePrint,
    handleTogglePrintField,
    refreshTemplates,
    previewMeta,
    printableFieldsForTemplate,
    isSelectedTemplateSystem,
    allowFieldSelectionTab:
      isSelectedTemplateSystem ||
      selectedTemplateId === 'product_label' ||
      selectedTemplateId === 'production_passport',
    renderPrintCard,
  };
};




