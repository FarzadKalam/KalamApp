import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { QRCode } from 'antd';
import DOMPurify from 'dompurify';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrintTemplate } from './index';
import { InvoiceCard } from './templates/invoice-card';
import { ProductLabel } from './templates/product-label';
import { ProductionPassport } from './templates/production-passport';
import { toPersianNumber, formatPersianPrice, safeJalaliFormat } from '../../utils/persianNumberFormatter';
import { supabase } from '../../supabaseClient';
import { BlockType } from '../../types';
import { getAssigneeLabel } from '../assigneeLabel';
import { getFieldLabelFa } from '../fieldLabel';
import { getResolvedAssigneeId } from '../assigneeValue';
import {
  calculateSalesPackageDiscountTotal,
  calculateSalesPackageGrossTotal,
  calculateSalesPackageTotal,
} from '../salesCatalog';
import {
  buildSystemTemplateFieldOptionsForModule,
  buildDefaultTemplatesForModule,
  getModuleTitle,
  getSystemTemplateFieldOptions,
  loadPrintTemplatesStore,
  mergeTemplatesWithDefaults,
  normalizeDynamicBlockTablesHtml,
  type StoredPrintTemplate,
} from './store';
import { buildPrintOutputName } from './outputName';
import { generatePdfBlob, prepareGeneratedPdfWindow, printAsPdf, shouldUseGeneratedPdfPrint } from './printAsPdf';
import { normalizeRenderedImages } from './normalizeRenderedImages';
import type { createPrintPerformanceTracker } from './printPerformance';
import { printInIframe } from './printInIframe';
import { detectRecordFilesTable } from '../recordFilesAvailability';
import { getCachedAuthUser } from '../sessionCache';
import {
  canViewPrintTemplateFieldPath,
  filterSystemTemplateFieldOptions,
  sanitizeSelectedPrintFieldKeys,
} from './fieldAccess';
import { loadPrintFieldPreference, savePrintFieldPreference } from './fieldPreferences';

interface UsePrintManagerProps {
  moduleId: string;
  data: any;
  moduleConfig: any;
  printableFields: any[];
  formatPrintValue: (field: any, value: any) => string;
  relationOptions?: Record<string, any[]>;
  canViewField?: (fieldKey: string) => boolean;
}

const DEFAULT_PAGE_MARGINS = { top: 8, right: 8, bottom: 8, left: 8 } as const;
const PRINT_COLUMN_IGNORE_KEYS = new Set(['id', 'key', 'created_at', 'updated_at']);
const PRICE_PATH_PATTERN = /amount|price|total|balance|discount|vat|tax|debt|credit|cost/i;
const LONG_TEXT_FIELD_TYPES = new Set(['long_text', 'superlongtext']);
const MULTILINE_PRINT_STYLE = 'white-space:pre-wrap; word-break:break-word; overflow-wrap:anywhere;';
const PRINT_BODY_FOOTER_SAFETY_PX = 0;
const PRINT_BODY_PAGE_STEP_PX = 28;
const PRINT_BODY_EDGE_GUARD_PX = 28;
const PRINT_BODY_MEASURE_TAIL_BUFFER_PX = 220;
const PRINT_SECTION_CONTENT_PADDING = '2px 10px';
const isLongTextType = (value: unknown) => LONG_TEXT_FIELD_TYPES.has(String(value || '').trim().toLowerCase());

const getReducedPrintFontSize = (baseSize: number) => {
  const nextSize = Math.max(7, baseSize - 3);
  return Number.isInteger(nextSize) ? `${nextSize}px` : `${nextSize.toFixed(1)}px`;
};

const getPathValue = (obj: any, path: string) =>
  path.split('.').reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), obj);

const hasPrintableValue = (value: any) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

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
const pxToMm = (value: number) => value / mmToPx(1);
const toCssMm = (value: number) => `${Number(pxToMm(value).toFixed(3))}mm`;
const snapPrintBodyHeightPx = (value: number) =>
  Math.max(80, Math.floor(Math.max(80, value) / PRINT_BODY_PAGE_STEP_PX) * PRINT_BODY_PAGE_STEP_PX);
const getTemplatePageBodyStepPx = (pageBodyHeightPx: number) =>
  Math.max(80, snapPrintBodyHeightPx(pageBodyHeightPx - PRINT_BODY_EDGE_GUARD_PX));

const getMeasuredPrintBodyHeight = (bodyMeasure: HTMLElement) => {
  const rootRect = bodyMeasure.getBoundingClientRect();
  const descendantBottom = Array.from(bodyMeasure.querySelectorAll('*')).reduce((maxBottom, element) => {
    const rect = (element as HTMLElement).getBoundingClientRect();
    if (!rect.height && !rect.width) return maxBottom;
    return Math.max(maxBottom, rect.bottom - rootRect.top);
  }, 0);

  return Math.max(
    bodyMeasure.scrollHeight,
    bodyMeasure.offsetHeight,
    bodyMeasure.clientHeight,
    Math.ceil(rootRect.height || 0),
    Math.ceil(descendantBottom || 0),
    1
  );
};

const getMeasuredPrintPageCount = (bodyHeight: number, pageBodyStepPx: number) => {
  const safeStep = Math.max(80, pageBodyStepPx || 0);
  const safeHeight = Math.max(1, bodyHeight || 0);
  const bufferedHeight =
    safeHeight > safeStep
      ? safeHeight + PRINT_BODY_MEASURE_TAIL_BUFFER_PX
      : safeHeight;
  return Math.max(1, Math.ceil(bufferedHeight / safeStep));
};

const getTemplatePageBodyHeightPx = ({
  innerHeightMm,
  showHeader,
  showFooter,
  headerHeight,
  footerHeight,
}: {
  innerHeightMm: number;
  showHeader: boolean;
  showFooter: boolean;
  headerHeight: number;
  footerHeight: number;
}) =>
  snapPrintBodyHeightPx(
    mmToPx(innerHeightMm) -
      (showHeader ? headerHeight : 0) -
      (showFooter ? footerHeight : 0) -
      PRINT_BODY_FOOTER_SAFETY_PX
  );

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

const normalizePrintableNumber = (value: any) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? '');
  const rounded = Math.round((numeric + Number.EPSILON) * 1000) / 1000;
  return String(rounded);
};
const toPersianPlain = (value: any) => toPersianNumber(normalizePrintableNumber(value));
const getAddressDisplay = (source: any) => {
  const province = String(source?.province || source?.province_name || source?.state || source?.state_name || '').trim();
  const city = String(source?.city || source?.city_name || '').trim();
  const address = String(source?.address || '').trim();
  const parts = [
    province ? `\u0627\u0633\u062A\u0627\u0646 ${localizePlainText(province)}` : '',
    city ? `\u0634\u0647\u0631 ${localizePlainText(city)}` : '',
    address ? localizePlainText(address) : '',
  ].filter(Boolean);
  return parts.join('، ');
};
const getRecordImageUrl = (record: any, fields: any[] = []) => {
  const imageField = (fields || []).find((field: any) =>
    String(field?.type || '').toLowerCase() === 'image' || /(^|_)(image|photo|logo|avatar)(_url)?$/i.test(String(field?.key || ''))
  );
  const candidateKeys = Array.from(
    new Set(
      [imageField?.key, 'image_url', 'logo_url', 'avatar_url', 'photo_url', 'attachment']
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
  const value = candidateKeys
    .map((key) => String(record?.[key] || '').trim())
    .find((item) => /^https?:\/\//i.test(item) || /^data:image\//i.test(item));
  return value || '';
};
const extractAnyRelationLabel = (relationOptions: Record<string, any[]>, value: any) => {
  const targetValue = String(value || '').trim();
  if (!targetValue) return '';
  for (const options of Object.values(relationOptions || {})) {
    const match = Array.isArray(options)
      ? options.find((item: any) => String(item?.value || '').trim() === targetValue)
      : null;
    const label = String(match?.name || match?.label || '').trim();
    if (label) return label;
  }
  return '';
};
const extractBillboardRelationLabel = (relationOptions: Record<string, any[]>, value: any) => {
  const targetValue = String(value || '').trim();
  if (!targetValue) return '';
  for (const options of Object.values(relationOptions || {})) {
    const match = Array.isArray(options)
      ? options.find((item: any) =>
          String(item?.value || '').trim() === targetValue &&
          (String(item?.module || '').trim() === 'billboards' || String(item?.tagLabel || '').trim() === 'محیطی')
        )
      : null;
    const label = String(match?.label || match?.name || '').trim();
    if (label) return label;
  }
  return '';
};
const getInvoiceItemTitle = (
  row: any,
  resolveBillboardLabel: (row: any) => string = () => ''
) =>
  String(
    row?.package_name ||
    row?.package?.name ||
    row?.selected_package_name ||
    row?.selected_package_label ||
    row?.package_title ||
    resolveBillboardLabel(row) ||
    row?.selected_product_name ||
    row?.selectedProductName ||
    row?.selected_product_label ||
    row?.billboard?.address ||
    row?.billboard_address ||
    row?.address ||
    row?.billboard?.name ||
    row?.billboard?.title ||
    row?.selected_billboard_name ||
    row?.billboard_name ||
    row?.billboard_title ||
    row?.service_title ||
    row?.name ||
    row?.title ||
    row?.product_name ||
    row?.product?.name ||
    row?.service_name ||
    row?.system_code ||
    row?.package_id ||
    row?.product_id ||
    '-'
  ).trim() || '-';
const hasMeaningfulCellValue = (cell: Element | null) => {
  if (!cell) return false;
  if (cell.querySelector('img,svg,canvas,video,iframe')) return true;
  const text = String(cell.textContent || '')
    .replace(/\u200c/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Boolean(text && text !== '-' && text !== '---');
};

const applyHiddenColumnIndexes = (table: HTMLTableElement, indexesToHide: number[]) => {
  if (!indexesToHide.length) return;
  const hiddenSet = new Set(indexesToHide);

  Array.from(table.rows || []).forEach((row) => {
    let virtualColumnIndex = 0;
    Array.from(row.cells || []).forEach((cell) => {
      const originalColSpan = Math.max(1, Number(cell.colSpan || 1));
      let visibleSpan = 0;
      for (let offset = 0; offset < originalColSpan; offset += 1) {
        if (!hiddenSet.has(virtualColumnIndex + offset)) {
          visibleSpan += 1;
        }
      }
      virtualColumnIndex += originalColSpan;

      if (visibleSpan <= 0) {
        cell.remove();
        return;
      }

      if (visibleSpan !== originalColSpan) {
        cell.colSpan = visibleSpan;
      }
    });
  });
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

export const usePrintManager = ({
  moduleId,
  data,
  moduleConfig,
  printableFields,
  formatPrintValue,
  relationOptions = {},
  canViewField,
}: UsePrintManagerProps) => {
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [printMode, setPrintMode] = useState(false);
  const [selectedPrintFields, setSelectedPrintFields] = useState<Record<string, string[]>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userPreferencesReady, setUserPreferencesReady] = useState(false);
  const [sellerInfo, setSellerInfo] = useState<any>(null);
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [supplierInfo, setSupplierInfo] = useState<any>(null);
  const [billboardPrintLabelsById, setBillboardPrintLabelsById] = useState<Record<string, string>>({});
  const [linkedAttachmentCount, setLinkedAttachmentCount] = useState<number | null>(null);
  const [storedTemplates, setStoredTemplates] = useState<StoredPrintTemplate[]>([]);
  const [templatesByModuleStore, setTemplatesByModuleStore] = useState<Record<string, StoredPrintTemplate[]>>({});
  const [, setTemplatesStoreMeta] = useState<{ rowId: string | null; provider: string }>({
    rowId: null,
    provider: 'tiptap',
  });
  const [savingPrintFields, setSavingPrintFields] = useState(false);
  const bodyMeasureRef = useRef<HTMLDivElement | null>(null);
  const buildPrintCardRef = useRef<(pageCountOverride?: number | null) => React.ReactNode>(() => null);
  const reservedPrintWindowRef = useRef<Window | null>(null);
  const templatesLoadedRef = useRef(false);
  const dependenciesLoadedKeyRef = useRef<string | null>(null);
  const [renderedPageCount, setRenderedPageCount] = useState(1);
  const [forcedPrintPageCount, setForcedPrintPageCount] = useState<number | null>(null);

  const loadTemplates = useCallback(async (mounted = true) => {
    try {
      const loaded = await loadPrintTemplatesStore();
      if (!mounted) return;
      setTemplatesStoreMeta({
        rowId: loaded.rowId || null,
        provider: loaded.provider || 'tiptap',
      });
      setTemplatesByModuleStore(loaded.templatesByModule || {});
      setStoredTemplates((loaded.templatesByModule[moduleId] || []).filter((tpl) => tpl.isActive !== false));
      return true;
    } catch (err) {
      console.error('Load print templates failed', err);
      if (mounted) {
        setTemplatesByModuleStore({});
        setStoredTemplates([]);
      }
      return false;
    }
  }, [moduleId]);

  useEffect(() => {
    if (!isPrintModalOpen && !printMode) return;
    if (templatesLoadedRef.current) return;
    let mounted = true;
    loadTemplates(mounted).then((loaded) => {
      if (mounted && loaded) templatesLoadedRef.current = true;
    });
    return () => {
      mounted = false;
    };
  }, [isPrintModalOpen, loadTemplates, printMode]);

  const billboardPrintCandidateIds = useMemo(() => {
    const ids = new Set<string>();
    const collectFromItems = (items: any) => {
      if (!Array.isArray(items)) return;
      items.forEach((item: any) => {
        const productId = String(item?.product_id || '').trim();
        if (productId) ids.add(productId);
        const selectedProductId = String(item?.selected_product_id || '').trim();
        if (selectedProductId) ids.add(selectedProductId);
        if (Array.isArray(item?.package_items)) collectFromItems(item.package_items);
      });
    };

    collectFromItems(data?.invoiceItems);
    collectFromItems(data?.products);
    return Array.from(ids).sort();
  }, [data?.invoiceItems, data?.products]);

  useEffect(() => {
    if (!billboardPrintCandidateIds.length) {
      setBillboardPrintLabelsById({});
      return;
    }

    let mounted = true;
    supabase
      .from('billboards')
      .select('id, address, name, system_code')
      .in('id', billboardPrintCandidateIds)
      .then(({ data: rows, error }) => {
        if (!mounted) return;
        if (error) {
          console.error('Load billboard print labels failed', error);
          return;
        }
        const nextLabels: Record<string, string> = {};
        (rows || []).forEach((row: any) => {
          const id = String(row?.id || '').trim();
          const label = String(row?.address || row?.name || row?.system_code || '').trim();
          if (id && label) nextLabels[id] = label;
        });
        setBillboardPrintLabelsById(nextLabels);
      });

    return () => {
      mounted = false;
    };
  }, [billboardPrintCandidateIds]);

  const availableTemplates = useMemo<StoredPrintTemplate[]>(() => {
    const merged = mergeTemplatesWithDefaults(moduleId, templatesByModuleStore[moduleId] || storedTemplates);
    const scopedTemplates = merged.filter((tpl) => (tpl.scope || 'record') !== 'list');
    const activeMerged = scopedTemplates.filter((tpl) => tpl.isActive !== false);
    if (activeMerged.length > 0) return activeMerged;
    return buildDefaultTemplatesForModule(moduleId, 'record').filter((tpl) => tpl.isActive !== false);
  }, [moduleId, storedTemplates, templatesByModuleStore]);

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

  useEffect(() => {
    let mounted = true;
    getCachedAuthUser(supabase)
      .then((user) => {
        if (!mounted) return;
        setCurrentUserId(String(user?.id || '').trim() || null);
        setUserPreferencesReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setCurrentUserId(null);
        setUserPreferencesReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);
  const isSystemRecordTemplate = useMemo(
    () =>
      Boolean(
        selectedStoredTemplate?.isSystem &&
        String(selectedStoredTemplate?.scope || 'record') === 'record'
      ),
    [selectedStoredTemplate?.isSystem, selectedStoredTemplate?.scope]
  );
  const isNonInvoiceSystemSummaryTemplate = useMemo(
    () =>
      Boolean(
        selectedStoredTemplate?.isSystem &&
        String(selectedStoredTemplate?.scope || 'record') === 'record' &&
        !String(selectedStoredTemplate?.id || '').includes('_list_') &&
        moduleId !== 'invoices' &&
        moduleId !== 'purchase_invoices'
      ),
    [moduleId, selectedStoredTemplate?.id, selectedStoredTemplate?.isSystem, selectedStoredTemplate?.scope]
  );
  const recordImageField = useMemo(() => {
    const fields = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [];
    return (
      fields.find(
        (field: any) =>
          (String(field?.type || '').toLowerCase() === 'image' || /(^|_)(image|photo|logo|avatar)(_url)?$/i.test(String(field?.key || ''))) &&
          (canViewField ? canViewField(String(field?.key || '')) : true)
      ) || null
    );
  }, [canViewField, moduleConfig?.fields]);
  const canViewPrintFieldPath = useCallback(
    (fieldPath: string) => canViewPrintTemplateFieldPath(fieldPath, canViewField),
    [canViewField]
  );
  const systemTemplateFieldOptions = useMemo(() => {
    const resolveSystemFieldHasValue = (fieldKey: string) => {
      const normalizedKey = String(fieldKey || '').trim();
      if (!normalizedKey) return false;
      if (!normalizedKey.startsWith('record.')) return true;
      const recordPath = normalizedKey.replace(/^record\./, '');
      return hasPrintableValue(getPathValue(data, recordPath));
    };

    const baseOptions = filterSystemTemplateFieldOptions(
      moduleConfig
        ? buildSystemTemplateFieldOptionsForModule(moduleConfig)
        : getSystemTemplateFieldOptions(moduleId),
      canViewField
    )
      .map((item) => ({
        key: item.key,
        labels: { fa: item.label },
        value: item.key.startsWith('record.')
          ? getPathValue(data, String(item.key || '').replace(/^record\./, ''))
          : true,
        hasValue: resolveSystemFieldHasValue(item.key),
        group: item.group,
        kind: item.kind,
      }));

    const commonSystemOptions = [
      {
        key: 'record.attachment_count',
        labels: { fa: 'تعداد پیوست‌ها' },
        value: true,
        hasValue: true,
        group: 'فیلدهای رکورد',
        kind: 'record',
      },
      {
        key: 'company.logo_url',
        labels: { fa: 'لوگوی سازمان' },
        value: true,
        hasValue: true,
        group: 'اطلاعات سازمان',
        kind: 'record',
      },
      {
        key: 'company.company_full_name',
        labels: { fa: 'نام کامل سازمان' },
        value: true,
        hasValue: true,
        group: 'اطلاعات سازمان',
        kind: 'record',
      },
      {
        key: 'company.trade_name',
        labels: { fa: 'نام تجاری سازمان' },
        value: true,
        hasValue: true,
        group: 'اطلاعات سازمان',
        kind: 'record',
      },
      {
        key: 'company.phone',
        labels: { fa: 'تلفن سازمان' },
        value: true,
        hasValue: true,
        group: 'اطلاعات سازمان',
        kind: 'record',
      },
      {
        key: 'company.address',
        labels: { fa: 'آدرس سازمان' },
        value: true,
        hasValue: true,
        group: 'اطلاعات سازمان',
        kind: 'record',
      },
      {
        key: 'system.company_signatory_name',
        labels: { fa: 'نام امضاکننده' },
        value: true,
        hasValue: true,
        group: 'سیستم',
        kind: 'record',
      },
      {
        key: 'system.company_signatory_title',
        labels: { fa: 'سمت امضاکننده' },
        value: true,
        hasValue: true,
        group: 'سیستم',
        kind: 'record',
      },
      {
        key: 'system.company_signature_image',
        labels: { fa: 'تصویر امضا' },
        value: true,
        hasValue: true,
        group: 'سیستم',
        kind: 'record',
      },
      {
        key: 'system.company_stamp_image',
        labels: { fa: 'تصویر مهر' },
        value: true,
        hasValue: true,
        group: 'سیستم',
        kind: 'record',
      },
    ];

    const mediaOptions = [
      ...(recordImageField
        ? [
            {
              key: 'system.record_image',
              labels: { fa: '\u062A\u0635\u0648\u06CC\u0631 \u0631\u06A9\u0648\u0631\u062F' },
              value: true,
              hasValue: true,
              group: '\u0633\u06CC\u0633\u062A\u0645',
              kind: 'record',
            },
          ]
        : []),
      {
        key: 'system.record_qr',
        labels: { fa: '\u06A9\u062F QR \u0631\u06A9\u0648\u0631\u062F' },
        value: true,
        hasValue: true,
        group: '\u0633\u06CC\u0633\u062A\u0645',
        kind: 'record',
      },
    ];

    return [...baseOptions, ...commonSystemOptions, ...mediaOptions];
  }, [canViewField, data, moduleConfig, moduleId, recordImageField]);
  const isSelectedTemplateSystem = Boolean(selectedStoredTemplate?.isSystem || selectedTemplateMeta?.isSystem);
  const printableFieldsForTemplate = useMemo(() => {
    if (!isSelectedTemplateSystem) return printableFields;
    if (!isSystemRecordTemplate) return printableFields;
    return systemTemplateFieldOptions;
  }, [isSelectedTemplateSystem, isSystemRecordTemplate, printableFields, systemTemplateFieldOptions]);
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
      if (!canViewPrintFieldPath(fieldPath)) return false;
      if (!isSelectedTemplateSystem || !isSystemRecordTemplate) return true;
      if (!hasTemplateSelectionState) return true;
      if (!knownSystemFieldKeys.has(fieldPath)) return true;
      return templateSelectedKeySet.has(fieldPath);
    },
    [
      canViewPrintFieldPath,
      hasTemplateSelectionState,
      isSelectedTemplateSystem,
      isSystemRecordTemplate,
      knownSystemFieldKeys,
      templateSelectedKeySet,
    ]
  );
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const printQrValue = pageUrl;
  const recordImageUrl = useMemo(
    () => (recordImageField ? getRecordImageUrl(data, [recordImageField]) : ''),
    [data, recordImageField]
  );
  const recordQrSvgMarkup = useMemo(() => {
    if (!printQrValue) return '';
    try {
      return renderToStaticMarkup(
        React.createElement(QRCode, {
          value: printQrValue,
          bordered: false,
          type: 'svg',
          size: 72,
        })
      );
    } catch {
      return '';
    }
  }, [printQrValue]);

  const openPrintModal = useCallback(() => {
    setIsPrintModalOpen(true);
  }, []);

  const closePrintModal = useCallback(() => {
    setIsPrintModalOpen(false);
  }, []);

  const getPrintOutputName = useCallback(
    () =>
      buildPrintOutputName({
        record: data,
        fallbackLabel: getModuleTitle(moduleId, 'singular') || moduleConfig?.titles?.fa || 'چاپ',
      }),
    [data, moduleConfig, moduleId]
  );

  const preparePrint = useCallback(() => {
    if (!shouldUseGeneratedPdfPrint()) return;
    const printTitle = getPrintOutputName();
    reservedPrintWindowRef.current = prepareGeneratedPdfWindow(printTitle);
  }, [getPrintOutputName]);

  const handlePrint = useCallback(() => {
    if (!selectedTemplateId) return;
    const printTitle = getPrintOutputName();

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
      const pageBodyHeightPx = getTemplatePageBodyHeightPx({
        innerHeightMm,
        showHeader,
        showFooter,
        headerHeight,
        footerHeight,
      });
      const pageBodyStepPx = getTemplatePageBodyStepPx(pageBodyHeightPx);
      const bodyMeasure = bodyMeasureRef.current;
      const bodyHeight = getMeasuredPrintBodyHeight(bodyMeasure);
      measuredPageCount = getMeasuredPrintPageCount(bodyHeight, pageBodyStepPx);
    }
    if (!bodyMeasureRef.current && previewPageCount > measuredPageCount) {
      measuredPageCount = previewPageCount;
    }
    if (measuredPageCount !== renderedPageCount) {
      setRenderedPageCount(measuredPageCount);
    }

    const currentTpl = selectedTemplateId.startsWith('custom:')
      ? availableTemplates.find((tpl) => tpl.id === selectedTemplateId.replace('custom:', '')) || null
      : null;
    const currentPaperSize = currentTpl?.paperSize || (selectedTemplateId === 'product_label' ? 'A6' : 'A4');
    const currentOrientation = currentTpl?.orientation === 'landscape' ? 'landscape' : 'portrait';
    const pageSize = currentTpl
      ? `${currentPaperSize} ${currentOrientation}`
      : selectedTemplateId === 'product_label'
        ? 'A6 portrait'
        : 'A4 portrait';
    const staticPrintHtml = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        buildPrintCardRef.current(selectedTemplateId.startsWith('custom:') ? Math.max(1, measuredPageCount) : null)
      )
    );

    if (shouldUseGeneratedPdfPrint()) {
      const targetWindow = reservedPrintWindowRef.current;
      reservedPrintWindowRef.current = null;

      void printAsPdf({
        pageSize,
        sourceHtml: staticPrintHtml,
        title: printTitle,
        filename: printTitle,
        targetWindow,
      }).catch((error) => {
        console.error('Generated PDF print failed', error);
      });
      return;
    }

    void printInIframe({
      pageSize,
      sourceHtml: staticPrintHtml,
      title: printTitle,
    }).catch((error) => {
      console.error('Print dialog failed to open', error);
    });
  }, [
    activeTemplate,
    availableTemplates,
    getPrintOutputName,
    moduleConfig,
    renderedPageCount,
    selectedStoredTemplate,
    selectedTemplateId,
  ]);

  const generateCurrentPdfBlob = useCallback(async (options?: {
    tracker?: ReturnType<typeof createPrintPerformanceTracker>;
    pageCountOverride?: number | null;
  }) => {
    if (!selectedTemplateId) {
      throw new Error('print_template_missing');
    }

    const tracker = options?.tracker;
    const printTitle = getPrintOutputName();
    const currentTpl = selectedTemplateId.startsWith('custom:')
      ? availableTemplates.find((tpl) => tpl.id === selectedTemplateId.replace('custom:', '')) || null
      : null;
    const currentPaperSize = currentTpl?.paperSize || (selectedTemplateId === 'product_label' ? 'A6' : 'A4');
    const currentOrientation = currentTpl?.orientation === 'landscape' ? 'landscape' : 'portrait';
    const pageSize = currentTpl
      ? `${currentPaperSize} ${currentOrientation}`
      : selectedTemplateId === 'product_label'
        ? 'A6 portrait'
        : 'A4 portrait';
    const resolvedPageCount = selectedTemplateId.startsWith('custom:')
      ? Math.max(1, options?.pageCountOverride ?? renderedPageCount)
      : null;
    tracker?.addMetadata({
      templateId: selectedTemplateId,
      printTitle,
      pageSize,
      renderedPageCount: renderedPageCount || 1,
      pageCountOverride: resolvedPageCount,
    });
    const staticPrintHtml = tracker
      ? await tracker.step(
          'render_static_print_html',
          () => Promise.resolve(renderToStaticMarkup(
            React.createElement(
              React.Fragment,
              null,
              buildPrintCardRef.current(resolvedPageCount)
            )
          )),
          (html) => ({ staticHtmlLength: String(html || '').length })
        )
      : renderToStaticMarkup(
          React.createElement(
            React.Fragment,
            null,
            buildPrintCardRef.current(resolvedPageCount)
          )
        );

    return {
      blob: await generatePdfBlob({
        pageSize,
        sourceHtml: staticPrintHtml,
        title: printTitle,
        filename: printTitle,
        tracker,
      }),
      filename: `${printTitle}.pdf`,
      title: printTitle,
    };
  }, [availableTemplates, getPrintOutputName, renderedPageCount, selectedTemplateId]);

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
    if (!selectedTemplateId || !userPreferencesReady) return;
    const allowedKeySet = new Set(
      (printableFieldsForTemplate || [])
        .map((field: any) => String(field?.key || '').trim())
        .filter(Boolean)
    );
    const preferenceKeys = loadPrintFieldPreference({
      userId: currentUserId,
      moduleId,
      templateId: selectedStoredTemplate?.id || selectedTemplateId,
      scope: 'record',
    });
    const defaultKeys = isSelectedTemplateSystem
      ? (
          sanitizeSelectedPrintFieldKeys(
            Array.isArray(preferenceKeys) && preferenceKeys.length > 0
              ? preferenceKeys
              : Array.isArray(selectedStoredTemplate?.selectedFieldKeys) && selectedStoredTemplate?.selectedFieldKeys.length > 0
                ? selectedStoredTemplate.selectedFieldKeys
              : printableFieldsForTemplate
                  .filter((field: any) => field?.hasValue !== false)
                  .map((field: any) => field.key),
            allowedKeySet
          ) || []
        )
      : sanitizeSelectedPrintFieldKeys(
          Array.isArray(preferenceKeys) && preferenceKeys.length > 0
            ? preferenceKeys
            : (printableFieldsForTemplate || [])
                .filter((field: any) => field?.hasValue !== false)
                .map((field: any) => field.key),
          allowedKeySet
        );

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
    currentUserId,
    printableFieldsForTemplate,
    selectedStoredTemplate?.selectedFieldKeys,
    selectedStoredTemplate?.id,
    selectedTemplateId,
    moduleId,
    userPreferencesReady,
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

  const handleTogglePrintFieldGroup = useCallback((templateId: string, groupName: string) => {
    setSelectedPrintFields((prev) => {
      const current = prev[templateId] || [];
      const currentSet = new Set(current);
      const groupKeys = (printableFieldsForTemplate || [])
        .filter((field: any) => String(field?.group || '').trim() === String(groupName || '').trim())
        .map((field: any) => String(field?.key || '').trim())
        .filter(Boolean);
      if (!groupKeys.length) return prev;
      const allSelected = groupKeys.every((key) => currentSet.has(key));
      const next = allSelected
        ? current.filter((key) => !groupKeys.includes(String(key || '').trim()))
        : [...current, ...groupKeys.filter((key) => !currentSet.has(key))];
      return { ...prev, [templateId]: next };
    });
  }, [printableFieldsForTemplate]);

  const handleMovePrintField = useCallback((templateId: string, fieldName: string, direction: 'up' | 'down') => {
    setSelectedPrintFields((prev) => {
      const current = [...(prev[templateId] || [])];
      const index = current.indexOf(fieldName);
      if (index < 0) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return prev;
      [current[index], current[targetIndex]] = [current[targetIndex], current[index]];
      return { ...prev, [templateId]: current };
    });
  }, []);

  const handleSavePrintFields = useCallback(async () => {
    setSavingPrintFields(true);
    try {
      const allowedKeySet = new Set(
        (printableFieldsForTemplate || [])
          .map((field: any) => String(field?.key || '').trim())
          .filter(Boolean)
      );
      const selectedKeys = sanitizeSelectedPrintFieldKeys(
        selectedPrintFields[selectedTemplateId] || [],
        allowedKeySet
      );
      savePrintFieldPreference({
        userId: currentUserId,
        moduleId,
        templateId: selectedStoredTemplate?.id || selectedTemplateId,
        scope: 'record',
        selectedFieldKeys: selectedKeys,
      });
      return true;
    } catch (error) {
      console.error('Save print field selection failed', error);
      return false;
    } finally {
      setSavingPrintFields(false);
    }
  }, [
    currentUserId,
    moduleId,
    printableFieldsForTemplate,
    selectedPrintFields,
    selectedStoredTemplate?.id,
    selectedTemplateId,
  ]);

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
      const isReceived = !status || status === 'received' || status === 'paid' || status === 'approved' || status === 'cleared';
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
  const packageSummary = useMemo(() => {
    if (moduleId !== 'product_bundles') {
      return { gross: 0, discount: 0, final: 0 };
    }
    const items = Array.isArray(data?.products) ? data.products : [];
    return {
      gross: calculateSalesPackageGrossTotal(items),
      discount: calculateSalesPackageDiscountTotal(items),
      final: calculateSalesPackageTotal(items),
    };
  }, [data?.products, moduleId]);
  const resolvedCurrencyLabel = useMemo(
    () => localizePlainText(sellerInfo?.currency_label || sellerInfo?.currency_code || 'ریال'),
    [sellerInfo?.currency_code, sellerInfo?.currency_label]
  );
  const resolveBillboardPrintLabel = useCallback((row: any) => {
    const directLabel = String(
      row?.billboard?.address ||
      row?.billboard_address ||
      row?.address ||
      row?.selected_billboard_address ||
      ''
    ).trim();
    if (directLabel) return directLabel;

    const candidateIds = [
      row?.product_id,
      row?.selected_product_id,
      row?.billboard_id,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    for (const candidateId of candidateIds) {
      const fetchedLabel = String(billboardPrintLabelsById[candidateId] || '').trim();
      if (fetchedLabel) return fetchedLabel;
      const relationLabel = extractBillboardRelationLabel(relationOptions, candidateId);
      if (relationLabel) return relationLabel;
    }

    return '';
  }, [billboardPrintLabelsById, relationOptions]);
  const dataWithResolvedPrintLabels = useMemo(() => {
    if (!Array.isArray(data?.invoiceItems) || data.invoiceItems.length === 0) return data;
    return {
      ...data,
      invoiceItems: data.invoiceItems.map((item: any) => {
        const billboardLabel = resolveBillboardPrintLabel(item);
        return billboardLabel
          ? { ...item, selected_product_name: billboardLabel, product_name: billboardLabel }
          : item;
      }),
    };
  }, [data, resolveBillboardPrintLabel]);
  const buildPackageSummaryTableHtml = useCallback(() => {
    if (moduleId !== 'product_bundles') return '';
    const hasAnyValue = packageSummary.gross > 0 || packageSummary.discount > 0 || packageSummary.final > 0;
    if (!hasAnyValue) return '';
    return `
      <table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:11px;">
        <tbody>
          <tr>
            <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.36);">جمع قبل از تخفیف</td>
            <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">${formatPersianPrice(packageSummary.gross)} <span style="font-size:9px; color:#64748b;">${resolvedCurrencyLabel}</span></td>
            <td style="width:25%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.24);">جمع تخفیف</td>
            <td style="width:25%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">${formatPersianPrice(packageSummary.discount)} <span style="font-size:9px; color:#64748b;">${resolvedCurrencyLabel}</span></td>
          </tr>
          <tr>
            <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:800; background:rgba(var(--brand-500-rgb),0.08);">مبلغ نهایی پکیج</td>
            <td colspan="3" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:800;">${formatPersianPrice(packageSummary.final)} <span style="font-size:9px; color:#64748b;">${resolvedCurrencyLabel}</span></td>
          </tr>
        </tbody>
      </table>
    `;
  }, [moduleId, packageSummary.discount, packageSummary.final, packageSummary.gross, resolvedCurrencyLabel]);

  const buildCompactFieldsTableHtml = useCallback(() => {
    const fields = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [];
    const collectRows = (ignoreTemplateSelection = false) => {
      const regularRows: string[] = [];
      const longTextRows: string[] = [];
      const canUseField = (fieldKey: string) =>
        ignoreTemplateSelection
          ? canViewPrintFieldPath(`record.${fieldKey}`)
          : isSystemFieldVisible(`record.${fieldKey}`);

      fields
        .filter(
          (field: any) =>
            field?.key &&
            !PRINT_COLUMN_IGNORE_KEYS.has(String(field.key)) &&
            !(isNonInvoiceSystemSummaryTemplate && String(field.key) === 'name') &&
            String(field?.type || '').toLowerCase() !== 'image' &&
            canUseField(String(field.key))
        )
        .forEach((field: any) => {
          const raw = data?.[field.key];
          if (raw === null || raw === undefined || raw === '') return;
          let displayValue = '';
          try {
            displayValue = String(formatPrintValue(field, raw) || '').trim();
          } catch {
            displayValue = '';
          }
          if (!displayValue) displayValue = localizePlainText(raw);
          if (!displayValue || displayValue === '-') return;
          if (isLongTextType(field?.type)) {
            longTextRows.push(`
          <div style="margin-top:8px;">
            <div style="margin:0 0 3px 0; font-size:10px; color:#64748b;">${getFieldLabelFa(field, { moduleId, fallback: field.key })}</div>
            <div style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 7px; background:#fff; font-size:${getReducedPrintFontSize(11)}; line-height:1.9; ${MULTILINE_PRINT_STYLE}">${displayValue}</div>
          </div>
        `);
            return;
          }
          regularRows.push(`
          <tr>
            <td style="width:38%; border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">${getFieldLabelFa(field, { moduleId, fallback: field.key })}</td>
            <td style="border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px;">${displayValue}</td>
          </tr>
        `);
        });

      return { regularRows, longTextRows };
    };

    let { regularRows, longTextRows } = collectRows(false);

    const hasAssigneeField = fields.some((field: any) => String(field?.key || '').trim() === 'assignee_id');
    const resolvedAssigneeId = getResolvedAssigneeId(data);
    const responsibleValue = String(
      data?.assignee_name ||
      data?.responsible_name ||
      data?.created_by_name ||
      extractAnyRelationLabel(relationOptions || {}, resolvedAssigneeId) ||
      ''
    ).trim();

    if (!hasAssigneeField && responsibleValue && isSystemFieldVisible('record.assignee_id')) {
      regularRows.unshift(`
          <tr>
            <td style="width:38%; border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">${getAssigneeLabel(moduleId)}</td>
            <td style="border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px;">${localizePlainText(responsibleValue)}</td>
          </tr>
        `);
    }

    if (!regularRows.length && !longTextRows.length && hasTemplateSelectionState && isNonInvoiceSystemSummaryTemplate) {
      const fallbackRows = collectRows(true);
      regularRows = fallbackRows.regularRows;
      longTextRows = fallbackRows.longTextRows;
      if (!hasAssigneeField && responsibleValue && canViewPrintFieldPath('record.assignee_id')) {
        regularRows.unshift(`
          <tr>
            <td style="width:38%; border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">${getAssigneeLabel(moduleId)}</td>
            <td style="border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px;">${localizePlainText(responsibleValue)}</td>
          </tr>
        `);
      }
    }

    const rowsHtml = regularRows.slice(0, 24).join('');
    const longTextRowsHtml = longTextRows.join('');
    if (!rowsHtml && !longTextRowsHtml) {
      return '<div style="padding:8px;border:1px solid var(--table-border-color, #d1d5db);border-radius:8px;">مقدار قابل چاپی ثبت نشده است.</div>';
    }
    return [
      rowsHtml
        ? `
      <table style="width:100%; border-collapse:collapse; font-size:11px;">
        <tbody>${rowsHtml}</tbody>
      </table>
    `
        : '',
      longTextRowsHtml,
    ]
      .filter(Boolean)
      .join('');
  }, [canViewPrintFieldPath, data, formatPrintValue, hasTemplateSelectionState, isNonInvoiceSystemSummaryTemplate, isSystemFieldVisible, moduleConfig?.fields, moduleId, relationOptions]);

  const buildInvoiceItemsTable = useCallback((items: any[]) => {
    if (!Array.isArray(items) || items.length === 0) {
      return '<div style="padding:8px;border:1px solid #e5e7eb;border-radius:6px;">اقلامی ثبت نشده است.</div>';
    }

    const rows = items
      .map((item: any) => {
        const productName = getInvoiceItemTitle(item, resolveBillboardPrintLabel);
        const deliveryTime = String(item?.delivery_time || '').trim();
        const quantity = toPersianNumber(String(item?.quantity || 0));
        const unitPrice = formatPersianPrice(Number(item?.unit_price || 0));
        const vat = item?.vat === null || item?.vat === undefined || item?.vat === '' ? '' : getDisplayValue(item.vat);
        const total = formatPersianPrice(Number(item?.quantity || 0) * Number(item?.unit_price || 0));
        return `
          <tr>
            <td style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;vertical-align:top;"><div style="font-weight:700;">${productName}</div>${deliveryTime ? `<div style="margin-top:2px;font-size:${getReducedPrintFontSize(11)};color:#64748b;line-height:1.7;${MULTILINE_PRINT_STYLE}">زمان تحویل: ${deliveryTime}</div>` : ''}</td>
            <td style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;text-align:center;">${quantity}</td>
            <td style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;text-align:center;">${unitPrice}</td>
            <td style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;text-align:center;">${vat || '-'}</td>
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
            <th style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;">ارزش افزوده</th>
            <th style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;">جمع</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }, [resolveBillboardPrintLabel]);

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
      let rawValue =
        key === 'product_id'
          ? (
              getInvoiceItemTitle(row, resolveBillboardPrintLabel) !== '-'
                ? getInvoiceItemTitle(row, resolveBillboardPrintLabel)
                : extractAnyRelationLabel(relationOptions, row?.product_id)
            )
          : key === 'package_id'
            ? (
                getInvoiceItemTitle(row, resolveBillboardPrintLabel) !== '-'
                  ? getInvoiceItemTitle(row, resolveBillboardPrintLabel)
                  : extractAnyRelationLabel(relationOptions, row?.package_id)
              )
          : row?.[key] ??
            row?.[`${key}_label`] ??
            row?.[`${key}_name`];

      if ((rawValue === null || rawValue === undefined || rawValue === '') && key === 'total_price' && row?.price !== undefined) {
        rawValue = row.price;
      }

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
    [formatPrintValue, getFieldOptionLabel, relationOptions, resolveBillboardPrintLabel]
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
  const buildRowMetaText = useCallback(
    (blockId: string, row: any) => {
      const optionalParts: string[] = [];
      const descriptionValue = getDisplayValue(row?.description || row?.notes || '');
      if (descriptionValue && descriptionValue !== '-') optionalParts.push(descriptionValue);
      const deliveryTimeValue = getDisplayValue(row?.delivery_time || '');
      if (deliveryTimeValue && deliveryTimeValue !== '-') optionalParts.push(`زمان تحویل: ${deliveryTimeValue}`);
      if (row?.length || row?.width) {
        const countValue = Number(row?.dimension_count || 0) > 0
          ? formatCellValue(blockId, { key: 'dimension_count', title: 'تعداد', type: 'number' }, row)
          : '-';
        optionalParts.push(`ابعاد: ${formatCellValue(blockId, { key: 'dimensions', title: 'ابعاد', type: 'text' }, row)}${countValue !== '-' ? ` | تعداد: ${countValue}` : ''}`);
      }
      if (row?.start_date) optionalParts.push(`شروع: ${formatCellValue(blockId, { key: 'start_date', title: 'تاریخ شروع', type: 'date' }, row)}`);
      if (row?.end_date) optionalParts.push(`پایان: ${formatCellValue(blockId, { key: 'end_date', title: 'تاریخ پایان', type: 'date' }, row)}`);
      if (Number(row?.sub_quantity || 0) !== 0) {
        const subQty = formatCellValue(blockId, { key: 'sub_quantity', title: 'تعداد فرعی', type: 'number' }, row);
        const subUnit = formatCellValue(blockId, { key: 'sub_unit', title: 'واحد فرعی', type: 'text' }, row);
        if (subQty !== '-') optionalParts.push(`${subQty}${subUnit && subUnit !== '-' ? ` ${subUnit}` : ''}`);
      }
      return optionalParts.join(' | ');
    },
    [formatCellValue, getDisplayValue]
  );

  const pruneEmptyTableCells = useCallback((table: HTMLTableElement) => {
    const normalizeCellText = (cell: Element | null) =>
      String(cell?.textContent || '')
        .replace(/\u200c/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const bodyRows = Array.from(table.tBodies).flatMap((section) => Array.from(section.rows || []));
    bodyRows.forEach((row) => {
      const cells = Array.from(row.cells || []);
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
        if (!isSystemFieldVisible(`block.${blockId}`)) {
          table.remove();
          return;
        }

        const templateRows = Array.from(tbody.rows || []);
        const templateRow =
          templateRows.find((row) => /{{\s*row\.[a-zA-Z0-9_]+\s*}}/.test(row.innerHTML)) ||
          templateRows.find((row) => Array.from(row.cells || []).length > 0) ||
          null;
        if (!templateRow) return;
        const templateRowIndex = templateRows.indexOf(templateRow);
        const staticRowsBefore = templateRows.slice(0, templateRowIndex).map((row) => row.outerHTML).join('');
        const staticRowsAfter = templateRows.slice(templateRowIndex + 1).map((row) => row.outerHTML).join('');

        const rowTemplate = templateRow.outerHTML;
        const templateCells = Array.from(templateRow.cells || []);
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
            Array.from(table.tHead?.rows || []).reduce(
              (max, row) => Math.max(max, Array.from(row.cells || []).length),
              0
            ),
            Array.from(templateRow.cells || []).length,
            1
          );
          tbody.innerHTML = `<tr><td colspan="${colspan}" style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;text-align:center;">موردی ثبت نشده است.</td></tr>`;
        } else {
          const renderedRows = rows
            .map((row: any, rowIndex: number) =>
              rowTemplate.replace(/{{\s*row\.([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => {
                if (key === '__row_index__') {
                  return toPersianNumber(String(rowIndex + 1));
                }
                if (key === 'description') {
                  const value = getDisplayValue(row?.description || row?.notes || '');
                  return value === '-' ? '' : value;
                }
                if (key === '__invoice_item_meta__') {
                  return buildRowMetaText(blockId, row);
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
                if (['product_id', 'product_name', 'selected_product_name'].includes(key)) {
                  const billboardLabel = resolveBillboardPrintLabel(row);
                  if (billboardLabel) return billboardLabel;
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
          tbody.innerHTML = `${staticRowsBefore}${renderedRows}${staticRowsAfter}`;
        }

        const autoHiddenIndexes: number[] = [];
        if (rows.length > 0) {
          const liveRows = Array.from(tbody.rows || []);
          const maxColumnCount = Math.max(
            ...Array.from(table.rows || []).map((row) => Array.from(row.cells || []).length),
            0
          );
          for (let index = 0; index < maxColumnCount; index += 1) {
            const hasAnyMeaningfulValue = liveRows.some((row) => {
              const cells = Array.from(row.cells || []);
              return hasMeaningfulCellValue(cells[index] || null);
            });
            if (!hasAnyMeaningfulValue) autoHiddenIndexes.push(index);
          }
        }

        const allHiddenIndexes = Array.from(new Set([...hiddenColumnIndexes, ...autoHiddenIndexes]));
        if (allHiddenIndexes.length > 0) {
          applyHiddenColumnIndexes(table, allHiddenIndexes);
        }

        const summaryMap = buildBlockSummaryMap(blockId, rows);
        table.innerHTML = table.innerHTML.replace(/{{\s*summary\.([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => summaryMap[key] || '-');
        pruneEmptyTableCells(table);
        const tableStyle = table.getAttribute('style') || '';
        const hasExplicitColumnLayout =
          table.querySelector('colgroup') !== null || /table-layout\s*:/i.test(tableStyle);
        table.setAttribute(
          'style',
          `${tableStyle};width:100%;max-width:100%;${hasExplicitColumnLayout ? '' : 'table-layout:fixed;'}border-collapse:collapse;`
        );
      });

      return root.innerHTML;
    },
    [buildBlockSummaryMap, buildRowMetaText, data, formatCellValue, isSystemFieldVisible, moduleConfig?.blocks, pruneEmptyTableCells, resolveBillboardPrintLabel]
  );

  const buildBlockTableHtml = useCallback(
    (blockId: string) => {
      const block = Array.isArray(moduleConfig?.blocks) ? moduleConfig.blocks.find((item: any) => item.id === blockId) : null;
      const rows = data?.[blockId];

      if (!isSystemFieldVisible(`block.${blockId}`)) {
        return '';
      }

      if (!block || !Array.isArray(block?.tableColumns)) {
        return `<div style="padding:8px;border:1px dashed #d1d5db;border-radius:8px;">بلاک ${blockId} تعریف نشده است.</div>`;
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        return '';
      }

      let columns = getCompactPrintColumns(block.tableColumns);
      if (moduleId === 'price_lists' && blockId === 'items') {
        columns = columns.map((column: any) => (
          String(column?.key || '').trim() === 'price'
            ? { ...column, title: 'مبلغ نهایی' }
            : column
        ));
      }
      if (moduleId === 'product_bundles' && blockId === 'products') {
        columns = columns.map((column: any) => (
          String(column?.key || '').trim() === 'total_price'
            ? { ...column, title: 'مبلغ نهایی' }
            : column
        ));
      }
      columns = columns.filter((column: any) => {
        if (!isSystemFieldVisible(`block.${blockId}.${String(column.key)}`)) return false;
        return rows.some((row: any) => {
          const renderedValue = formatCellValue(blockId, column, row);
          return renderedValue && renderedValue !== '-';
        });
      });
      if (columns.length === 0) {
        return '';
      }
      const header = columns
        .map((column: any) => `<th style="border:1px solid var(--table-border-color, #d1d5db);padding:4px 5px;overflow-wrap:anywhere;">${column.title || column.key}</th>`)
        .join('');

      const body = rows
        .map((row: any, rowIndex: number) => {
          const cells = columns
            .map((column: any) => {
              const isLongTextColumn =
                isLongTextType(column?.type) ||
                ['description', 'notes'].includes(String(column?.key || '').trim().toLowerCase());
              const shouldShowMetaUnderProduct =
                (
                  (moduleId === 'product_bundles' && blockId === 'products') ||
                  (moduleId === 'price_lists' && blockId === 'items')
                ) &&
                String(column?.key || '').trim() === 'product_id';
              if (shouldShowMetaUnderProduct) {
                const title = formatCellValue(blockId, column, row) || '-';
                const meta = buildRowMetaText(blockId, row);
                return `<td style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;vertical-align:top;"><div style="font-weight:700;">${title}</div>${meta ? `<div style="margin-top:2px;font-size:${getReducedPrintFontSize(11)};color:#64748b;line-height:1.7;${MULTILINE_PRINT_STYLE}">${meta}</div>` : ''}</td>`;
              }
              return `<td style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;${isLongTextColumn ? `vertical-align:top;font-size:${getReducedPrintFontSize(11)};line-height:1.9;${MULTILINE_PRINT_STYLE}` : ''}">${formatCellValue(blockId, column, row) || '-'}</td>`;
            })
            .join('');

          return `<tr><td style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;text-align:center;">${toPersianNumber(
            String(rowIndex + 1)
          )}</td>${cells}</tr>`;
        })
        .join('');

      return `
        <div style="margin-top:8px;">
          <div style="font-size:11px;font-weight:800;margin-bottom:4px;color:rgb(var(--brand-500-rgb));">${block?.titles?.fa || 'جدول'}</div>
          <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead><tr><th style="border:1px solid var(--table-border-color, #d1d5db);padding:4px 5px;width:44px;">ردیف</th>${header}</tr></thead>
          <tbody>${body}</tbody>
          </table>
        </div>
      `;
    },
    [buildRowMetaText, data, formatCellValue, isSystemFieldVisible, moduleConfig?.blocks, moduleId]
  );

  const buildCompactTablesBlocksHtml = useCallback(() => {
    const blocks = Array.isArray(moduleConfig?.blocks)
      ? moduleConfig.blocks.filter(
          (item: any) => item?.id && (item.type === BlockType.TABLE || item.type === BlockType.GRID_TABLE)
        )
      : [];
    const html = blocks
      .map((block: any) => buildBlockTableHtml(block.id))
      .filter((value: string) => String(value || '').trim().length > 0)
      .join('');
    return html || '';
  }, [buildBlockTableHtml, moduleConfig?.blocks]);

  const resolveVariableValue = useCallback(
    (path: string): string => {
      const normalizeOptionalDisplay = (value: any) => {
        const text = String(value ?? '').trim();
        return text && text !== '-' ? text : '';
      };

      const resolveRecordFieldDisplay = (fieldKey: string) => {
        const raw = data?.[fieldKey];
        if (raw === null || raw === undefined || raw === '') return '';
        const field = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields.find((item: any) => item.key === fieldKey) : null;
        if (field) {
          const option = Array.isArray(field.options) ? field.options.find((item: any) => String(item.value) === String(raw)) : null;
          if (option?.label) return normalizeOptionalDisplay(option.label);
          try {
            const rendered = formatPrintValue(field, raw);
            if (rendered) return normalizeOptionalDisplay(localizePlainText(rendered));
          } catch {
            // noop
          }
        }
        return normalizeOptionalDisplay(localizePlainText(raw));
      };

      const now = new Date();
      if (
        (path.startsWith('record.') || path.startsWith('block.') || path === 'responsible.name') &&
        !canViewPrintFieldPath(path)
      ) {
        return '';
      }
      if (path === 'system.today_date') return toPersianNumber(safeJalaliFormat(now, 'YYYY/MM/DD'));
      if (path === 'system.today_datetime') return `${toPersianNumber(safeJalaliFormat(now, 'YYYY/MM/DD'))} ${now.toLocaleTimeString('fa-IR')}`;
      if (path === 'system.letter_sender_display') {
        return resolveRecordFieldDisplay('sender_manual') || resolveRecordFieldDisplay('sender_profile_id');
      }
      if (path === 'system.letter_recipient_display') {
        return resolveRecordFieldDisplay('recipient_manual') || resolveRecordFieldDisplay('recipient_profile_id');
      }
      if (path === 'system.compact_fields_table') return buildCompactFieldsTableHtml();
      if (path === 'system.compact_tables_blocks') return buildCompactTablesBlocksHtml();
      if (path === 'system.package_summary_table') return buildPackageSummaryTableHtml();
      if (path === 'system.record_image') {
        if (!isSystemFieldVisible('system.record_image') || !recordImageUrl) return '';
        return `<div style="display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--table-border-color, #d1d5db);border-radius:12px;padding:6px;background:#fff;"><img src="${recordImageUrl}" alt="\u062A\u0635\u0648\u06CC\u0631 \u0631\u06A9\u0648\u0631\u062F" style="display:block;max-width:92px;max-height:92px;object-fit:contain;" /></div>`;
      }
      if (path === 'system.record_qr') {
        if (!isSystemFieldVisible('system.record_qr') || !recordQrSvgMarkup) return '';
        return `<div style="display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--table-border-color, #d1d5db);border-radius:12px;padding:6px;background:#fff;">${recordQrSvgMarkup}</div>`;
      }
      if (path === 'system.company_signature_image') {
        if (!isSystemFieldVisible('system.company_signature_image')) return '';
        const src = String(sellerInfo?.signature_image_url || '').trim();
        if (!src) return '';
        return `<img src="${src}" alt="امضا" style="display:block; max-width:120px; max-height:56px; object-fit:contain;" />`;
      }
      if (path === 'system.company_stamp_image') {
        if (!isSystemFieldVisible('system.company_stamp_image')) return '';
        const src = String(sellerInfo?.stamp_image_url || '').trim();
        if (!src) return '';
        return `<img src="${src}" alt="مهر" style="display:block; max-width:92px; max-height:92px; object-fit:contain; opacity:0.88;" />`;
      }
      if (path === 'system.company_signatory_name') {
        if (!isSystemFieldVisible('system.company_signatory_name')) return '';
        return localizePlainText(sellerInfo?.official_signatory_name || sellerInfo?.ceo_name || '');
      }
      if (path === 'system.company_signatory_title') {
        if (!isSystemFieldVisible('system.company_signatory_title')) return '';
        return localizePlainText(sellerInfo?.official_signatory_title || 'مدیرعامل');
      }
      if (path === 'invoice.items_table') return buildInvoiceItemsTable(data?.invoiceItems || []);
      if (path.startsWith('block.')) return buildBlockTableHtml(path.replace(/^block\./, ''));
      if (path === 'record.total_invoice_amount') {
        const rawTotal = data?.total_invoice_amount;
        return rawTotal === null || rawTotal === undefined || rawTotal === '' ? '' : formatPersianPrice(rawTotal);
      }
      if (path === 'record.total_received_amount') {
        const rawReceived = data?.total_received_amount;
        return rawReceived === null || rawReceived === undefined || rawReceived === '' ? formatPersianPrice(invoiceSummary.received) : formatPersianPrice(rawReceived);
      }
      if (path === 'record.remaining_balance') {
        const rawRemaining = data?.remaining_balance;
        return rawRemaining === null || rawRemaining === undefined || rawRemaining === '' ? formatPersianPrice(invoiceSummary.remaining) : formatPersianPrice(rawRemaining);
      }
      if (path === 'record.package_gross_total') return formatPersianPrice(packageSummary.gross);
      if (path === 'record.package_discount_total') return formatPersianPrice(packageSummary.discount);
      if (path === 'record.package_final_total') return formatPersianPrice(packageSummary.final);
      if (path === 'record.total_invoice_amount_words') {
        const rawWords = String(data?.total_invoice_amount_words || '').trim();
        if (rawWords) return localizePlainText(rawWords);
        const totalAmount = Number(invoiceSummary.total || 0);
        if (!Number.isFinite(totalAmount) || totalAmount <= 0) return '';
        const words = toPersianWords(totalAmount);
        return words ? `${words} ${resolvedCurrencyLabel}`.trim() : '';
      }
      if (path === 'responsible.name') {
        return localizePlainText(data?.assignee_name || data?.responsible_name || data?.created_by_name || '');
      }
      if (path === 'module.title') return getModuleTitle(moduleId, 'singular') || moduleConfig?.titles?.fa || '';
      if (path === 'module.title_plural') return getModuleTitle(moduleId, 'plural') || moduleConfig?.titles?.fa || '';
      if (path === 'record.attachment_count') {
        const count = linkedAttachmentCount !== null ? linkedAttachmentCount : getAttachmentCount(data);
        return toPersianNumber(String(count));
      }

      const [root, ...rest] = path.split('.');
      const nestedPath = rest.join('.');
      if (!nestedPath) return '';

      let source: any = null;
      if (root === 'record') source = data || {};
      if (root === 'customer') source = customerInfo || {};
      if (root === 'supplier') source = supplierInfo || {};
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
      if ((root === 'company' || root === 'customer' || root === 'supplier') && nestedPath === 'address') {
        return getAddressDisplay(source);
      }
      if ((root === 'customer' || root === 'supplier') && nestedPath === 'full_name') {
        const fullName = String(source?.full_name || '').trim();
        if (fullName) return localizePlainText(fullName);
        return localizePlainText(
          [source?.prefix, source?.first_name, source?.last_name]
            .map((part) => String(part || '').trim())
            .filter(Boolean)
            .join(' ')
        );
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
      if (root === 'supplier' && nestedPath === 'national_identifier') {
        return localizePlainText(
          String(source?.national_id || source?.company_national_id || source?.national_code || raw || '')
        );
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
      buildCompactTablesBlocksHtml,
      buildCompactFieldsTableHtml,
      buildInvoiceItemsTable,
      buildPackageSummaryTableHtml,
      data,
      customerInfo,
      formatPrintValue,
      invoiceSummary.received,
      invoiceSummary.remaining,
      invoiceSummary.total,
      moduleConfig?.fields,
      moduleConfig?.titles?.fa,
      moduleId,
      packageSummary.discount,
      packageSummary.final,
      packageSummary.gross,
      recordImageUrl,
      recordQrSvgMarkup,
      sellerInfo,
      linkedAttachmentCount,
      supplierInfo,
      canViewPrintFieldPath,
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
        ADD_TAGS: ['colgroup', 'col'],
        ADD_ATTR: [
          'style',
          'width',
          'height',
          'span',
          'colspan',
          'rowspan',
          'colwidth',
          'data-colwidth',
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

    const normalizedHeaderHtml = normalizeDynamicBlockTablesHtml(moduleId, selectedStoredTemplate.headerHtml);
    const normalizedContentHtml = normalizeDynamicBlockTablesHtml(moduleId, selectedStoredTemplate.contentHtml);
    const normalizedFooterHtml = normalizeDynamicBlockTablesHtml(moduleId, selectedStoredTemplate.footerHtml);

    return {
      headerHtml: localizeHtmlNumbers(normalizeRenderedImages(renderBlockTemplateHtml(fillTemplateHtml(normalizedHeaderHtml)))),
      contentHtml: localizeHtmlNumbers(normalizeRenderedImages(renderBlockTemplateHtml(fillTemplateHtml(normalizedContentHtml)))),
      footerHtml: localizeHtmlNumbers(normalizeRenderedImages(renderBlockTemplateHtml(fillTemplateHtml(normalizedFooterHtml)))),
    };
  }, [fillTemplateHtml, localizeHtmlNumbers, moduleId, normalizeRenderedImages, renderBlockTemplateHtml, selectedStoredTemplate]);

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
      const pageBodyHeightPx = getTemplatePageBodyHeightPx({
        innerHeightMm,
        showHeader,
        showFooter,
        headerHeight,
        footerHeight,
      });
      const pageBodyStepPx = getTemplatePageBodyStepPx(pageBodyHeightPx);

      const bodyHeight = getMeasuredPrintBodyHeight(bodyMeasure);
      const nextPageCount = getMeasuredPrintPageCount(bodyHeight, pageBodyStepPx);
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

  const buildPrintCard = useCallback((pageCountOverride?: number | null) => {
    const selected = selectedPrintFields[selectedTemplateId] || [];
    const fieldMap = new Map(
      printableFieldsForTemplate.map((field: any) => [String(field?.key || '').trim(), field])
    );
    const fieldsToDisplay = selected.length === 0
      ? printableFieldsForTemplate.filter((field: any) => field?.hasValue !== false)
      : selected
          .map((key) => fieldMap.get(String(key || '').trim()))
          .filter(Boolean);

    if (selectedTemplateId.startsWith('custom:')) {
      const metrics = getPaperSizeMetrics(selectedStoredTemplate?.paperSize, selectedStoredTemplate?.orientation || 'portrait');
      const paper = { width: `${metrics.widthMm}mm`, minHeight: `${metrics.heightMm}mm` };
      const showHeader = selectedStoredTemplate?.showHeader !== false;
      const showFooter = selectedStoredTemplate?.showFooter !== false;
      const headerHeight = Number(selectedStoredTemplate?.headerHeight || 84);
      const footerHeight = Number(selectedStoredTemplate?.footerHeight || 62);
      const headerHeightCss = toCssMm(headerHeight);
      const footerHeightCss = toCssMm(footerHeight);
      const pageSize = `${selectedStoredTemplate?.paperSize || 'A4'} ${selectedStoredTemplate?.orientation === 'landscape' ? 'landscape' : 'portrait'}`;
      const pageMargins = {
        top: Number(selectedStoredTemplate?.pageMarginTop ?? DEFAULT_PAGE_MARGINS.top),
        right: Number(selectedStoredTemplate?.pageMarginRight ?? DEFAULT_PAGE_MARGINS.right),
        bottom: Number(selectedStoredTemplate?.pageMarginBottom ?? DEFAULT_PAGE_MARGINS.bottom),
        left: Number(selectedStoredTemplate?.pageMarginLeft ?? DEFAULT_PAGE_MARGINS.left),
      };
      const innerWidthMm = Math.max(20, metrics.widthMm - pageMargins.left - pageMargins.right);
      const innerHeightMm = Math.max(40, metrics.heightMm - pageMargins.top - pageMargins.bottom);
      const pageBodyHeightPx = getTemplatePageBodyHeightPx({
        innerHeightMm,
        showHeader,
        showFooter,
        headerHeight,
        footerHeight,
      });
      const pageBodyStepPx = getTemplatePageBodyStepPx(pageBodyHeightPx);
      const pageBodyHeightCss = toCssMm(pageBodyHeightPx);
      const measuredCurrentPageCount = bodyMeasureRef.current
        ? getMeasuredPrintPageCount(getMeasuredPrintBodyHeight(bodyMeasureRef.current), pageBodyStepPx)
        : 0;
      const effectivePageCount = Math.max(
        1,
        measuredCurrentPageCount,
        typeof pageCountOverride === 'number'
          ? pageCountOverride
          : printMode && forcedPrintPageCount
            ? forcedPrintPageCount
            : renderedPageCount
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
              width: `${innerWidthMm}mm`,
              boxSizing: 'border-box',
              visibility: 'hidden',
              pointerEvents: 'none',
              zIndex: -1,
            },
            'aria-hidden': true,
          },
          React.createElement('div', {
            ref: bodyMeasureRef,
            className: 'print-template-body-measure',
            style: { padding: PRINT_SECTION_CONTENT_PADDING, boxSizing: 'border-box' },
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
                width: `${metrics.widthMm}mm`,
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
                '--print-header-height': showHeader ? headerHeightCss : '0px',
                '--print-footer-height': showFooter ? footerHeightCss : '0px',
                '--print-margin-top': `${pageMargins.top}mm`,
                '--print-margin-bottom': `${pageMargins.bottom}mm`,
                '--print-margin-left': `${pageMargins.left}mm`,
                '--print-margin-right': `${pageMargins.right}mm`,
              } as unknown as React.CSSProperties,
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
                      flex: `0 0 ${headerHeightCss}`,
                      height: headerHeightCss,
                      minHeight: headerHeightCss,
                      maxHeight: headerHeightCss,
                      overflow: 'hidden',
                      padding: 0,
                    },
                  },
                  React.createElement('div', {
                    className: 'print-template-header-inner',
                    style: { padding: PRINT_SECTION_CONTENT_PADDING, boxSizing: 'border-box', minHeight: 0, maxHeight: '100%', overflow: 'hidden' },
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
                  flex: `0 0 ${pageBodyHeightCss}`,
                  minHeight: pageBodyHeightCss,
                  height: pageBodyHeightCss,
                  maxHeight: pageBodyHeightCss,
                  position: 'relative',
                  overflow: 'hidden',
                },
              },
              React.createElement(
                'div',
                {
                  className: 'print-template-body-segment',
                  style: { width: '100%', boxSizing: 'border-box', transform: `translateY(-${pageIndex * pageBodyStepPx}px)` },
                },
                React.createElement('div', {
                  className: 'print-template-body-inner',
                  style: { padding: PRINT_SECTION_CONTENT_PADDING, boxSizing: 'border-box' },
                  dangerouslySetInnerHTML: { __html: renderedCustomTemplate?.contentHtml || '' },
                })
              ),
              React.createElement('div', {
                'aria-hidden': true,
                className: 'print-template-body-edge-guard',
                style: {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: toCssMm(PRINT_BODY_EDGE_GUARD_PX),
                  background: '#fff',
                  pointerEvents: 'none',
                  zIndex: 2,
                },
              })
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
                      flex: `0 0 ${footerHeightCss}`,
                      height: footerHeightCss,
                      minHeight: footerHeightCss,
                      maxHeight: footerHeightCss,
                      marginTop: 'auto',
                      overflow: 'hidden',
                      padding: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                    },
                  },
                  React.createElement(
                    'div',
                    { className: 'print-template-footer-stack', style: { display: 'flex', flexDirection: 'column', gap: 1, width: '100%' } },
                    React.createElement('div', {
                      className: 'print-template-footer-inner',
                      style: { padding: PRINT_SECTION_CONTENT_PADDING, boxSizing: 'border-box', minHeight: 0, maxHeight: '100%', overflow: 'hidden' },
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
          data: dataWithResolvedPrintLabels,
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
    dataWithResolvedPrintLabels,
    relationOptions,
    customerInfo,
    sellerInfo,
    activeTemplate,
    moduleConfig,
    printQrValue,
    formatPrintValue,
  ]);

  const renderPrintCard = useCallback(() => buildPrintCard(), [buildPrintCard]);
  buildPrintCardRef.current = buildPrintCard;

  useEffect(() => {
    if (!isPrintModalOpen && !printMode) return;
    const dependencyKey = `${moduleId}:${String(data?.id || '')}:${String(data?.customer_id || '')}:${String(data?.supplier_id || '')}`;
    if (dependenciesLoadedKeyRef.current === dependencyKey) return;
    let isMounted = true;
    const loadDependencies = async () => {
      try {
        const companyReq = supabase.from('company_settings').select('*').limit(1).maybeSingle();
        const filesCountReq =
          moduleId && data?.id
            ? (async () => {
                const tableExists = await detectRecordFilesTable(supabase).catch(() => true);
                if (!tableExists) return { count: null, error: null };
                return supabase
                  .from('record_files')
                  .select('id', { count: 'exact', head: true })
                  .eq('module_id', moduleId)
                  .eq('record_id', data.id);
              })()
            : Promise.resolve({ count: null, error: null });
        const customerReq =
          moduleId === 'invoices' && data?.customer_id
            ? supabase.from('customers').select('*').eq('id', data.customer_id).maybeSingle()
            : Promise.resolve({ data: null, error: null });
        const supplierReq =
          moduleId === 'purchase_invoices' && data?.supplier_id
            ? supabase.from('suppliers').select('*').eq('id', data.supplier_id).maybeSingle()
            : Promise.resolve({ data: null, error: null });

        const [
          { data: companyData, error: companyError },
          { count: filesCount, error: filesCountError },
          { data: customerData, error: customerError },
          { data: supplierData, error: supplierError },
        ] = await Promise.all([
          companyReq as any,
          filesCountReq as any,
          customerReq as any,
          supplierReq as any,
        ]);
        if (!isMounted) return;
        if (!companyError) setSellerInfo(companyData || null);
        if (!filesCountError) setLinkedAttachmentCount(Number.isFinite(filesCount) ? Number(filesCount) : 0);
        if (!customerError) setCustomerInfo(customerData || null);
        if (!supplierError) setSupplierInfo(supplierData || null);
        if (!companyError && !customerError && !supplierError) {
          dependenciesLoadedKeyRef.current = dependencyKey;
        }
      } catch (err) {
        console.error('Load print dependencies failed', err);
      }
    };

    loadDependencies();
    return () => {
      isMounted = false;
    };
  }, [data?.customer_id, data?.id, data?.supplier_id, isPrintModalOpen, moduleId, printMode]);

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
    generateCurrentPdfBlob,
    preparePrint,
    handleTogglePrintField,
    handleTogglePrintFieldGroup,
    handleMovePrintField,
    handleSavePrintFields,
    refreshTemplates,
    previewMeta,
    printableFieldsForTemplate,
    isSelectedTemplateSystem,
    savingPrintFields,
    allowFieldSelectionTab: isSystemRecordTemplate,
    renderPrintCard,
  };
};






