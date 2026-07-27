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
import { localizeFinancialValue } from '../financialValueLabels';
import { resolvePrintAssigneeLabel } from './assigneeDisplay';
import {
  calculateSalesPackageDiscountTotal,
  calculateSalesPackageGrossTotal,
  calculateSalesPackageTotal,
} from '../salesCatalog';
import {
  buildSystemTemplateFieldOptionsForModule,
  buildDefaultTemplatesForModule,
  buildCatalogFullPageContentHtml,
  getModuleTitle,
  getSystemTemplateFieldOptions,
  isPrintTemplateAvailableForModule,
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
import {
  annotatePrintFlowHtml,
  buildSmartPrintPageOffsets,
  collectPrintPageAnchors,
} from './printPagination';
import { detectRecordFilesTable } from '../recordFilesAvailability';
import { fetchSessionBootstrap } from '../sessionCache';
import { loadScopedCompanySettings } from '../companySettings';
import { buildImagePreviewUrl, buildPrintImageUrl, isPrintImageTransformEnabled } from '../imagePreview';
import {
  canViewPrintTemplateFieldPath,
  filterSystemTemplateFieldOptions,
  sanitizeSelectedPrintFieldKeys,
} from './fieldAccess';
import { hasMeaningfulPrintValue, isPrintFieldKnownToTemplate, isPrintFieldSelected } from './printableFields';
import { loadPrintFieldPreference, savePrintFieldPreference } from './fieldPreferences';
import { hasRenderablePrintFooterHtml } from './footerLayout';
import { DEFAULT_PRINT_IMAGE_DISPLAY_MODE, sanitizePrintImageDisplayMode, type PrintImageDisplayMode } from './imageDisplay';
import { loadPrintRenderPreference, savePrintRenderPreference } from './renderPreferences';
import { parseLocationValue } from '../location';
import { SETTINGS_PERMISSION_KEY } from '../permissions';
import { fetchAssigneeDirectory } from '../referenceData';
import { fetchRelationOptionsForField } from '../relationOptions';
import { buildBillboardInvoiceItemTitle, buildInvoiceAdjustmentDisplay, resolveInvoiceRowBaseAmount } from '../invoicePresentation';
import { sanitizeOutboundDisplay } from '../../shared/recordRuntime';
import {
  buildDefaultPrintSignatureConfigs,
  buildPrintSignatureBandHtml,
  createPrintSignatureRowId,
  getPrintSignatureSectionHeightPx,
  getPrintSignatureQuickAddOptions,
  getSignerModuleLabel,
  materializePrintSignatureStates,
  stripLegacyPrintSignatureTokens,
  sanitizePrintSignatureConfigs,
  type PrintSignatureConfig,
  type PrintSignatureKind,
  type PrintSignatureSignerModule,
} from './signatures';
import {
  buildPrintLetterheadVariants,
  getPrintLetterheadById,
  toPercentStyle,
} from './letterheads';
import {
  buildPrintLetterheadOverlayHtml,
  buildPrintLetterheadPageCounterHtml,
  getPrintLetterheadEffectiveBodyItem,
  getPrintLetterheadSignaturesItem,
} from './letterheadRender';
import {
  resolveCounterpartyNationalCode,
  resolveCounterpartyNationalId,
  resolveCounterpartyNationalIdentifier,
} from './counterpartyIdentity';

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
const MIN_PRINT_BODY_HEIGHT_PX = 80;
const PRINT_SECTION_CONTENT_PADDING = '0 10px';
const PRINT_PAGE_COUNTER_HEIGHT_PX = 18;
const PRINT_BODY_LINE_GUARD_PX = 28;
// The measured line boxes can be fractionally smaller than their final painted
// size after a webfont settles. Keep a tiny overlap between adjacent body
// viewports so a line can never be cut at a page boundary.
const PRINT_BODY_VIEWPORT_OVERSCAN_PX = 2;
const isLongTextType = (value: unknown) => LONG_TEXT_FIELD_TYPES.has(String(value || '').trim().toLowerCase());

const getReducedPrintFontSize = (baseSize: number) => {
  const nextSize = Math.max(7, baseSize - 3);
  return Number.isInteger(nextSize) ? `${nextSize}px` : `${nextSize.toFixed(1)}px`;
};

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
const pxToMm = (value: number) => value / mmToPx(1);
const toCssMm = (value: number) => `${Number(pxToMm(value).toFixed(3))}mm`;
const normalizePrintBodyHeightPx = (value: number) =>
  Math.max(MIN_PRINT_BODY_HEIGHT_PX, Math.floor(Math.max(MIN_PRINT_BODY_HEIGHT_PX, value)));
const getTemplatePageBodyStepPx = (pageBodyHeightPx: number) =>
  normalizePrintBodyHeightPx(pageBodyHeightPx);
const getPrintBodyViewportHeightPx = (pageBodyHeightPx: number, effectiveBodyStepPx: number) =>
  Math.min(
    normalizePrintBodyHeightPx(pageBodyHeightPx),
    Math.max(1, Math.ceil(effectiveBodyStepPx + PRINT_BODY_VIEWPORT_OVERSCAN_PX))
  );

const getMeasuredPrintBlockHeight = (measureNode: HTMLElement) => {
  const rootRect = measureNode.getBoundingClientRect();
  const descendantBottom = Array.from(measureNode.querySelectorAll('*')).reduce((maxBottom, element) => {
    const rect = (element as HTMLElement).getBoundingClientRect();
    if (!rect.height && !rect.width) return maxBottom;
    return Math.max(maxBottom, rect.bottom - rootRect.top);
  }, 0);

  return Math.max(
    measureNode.scrollHeight,
    measureNode.offsetHeight,
    measureNode.clientHeight,
    Math.ceil(rootRect.height || 0),
    Math.ceil(descendantBottom || 0),
    1
  );
};

const getMeasuredPrintPageOffsets = (bodyMeasure: HTMLElement, pageBodyStepPx: number) => {
  const bodyHeight = getMeasuredPrintBlockHeight(bodyMeasure);
  const anchors = collectPrintPageAnchors(bodyMeasure);
  return buildSmartPrintPageOffsets({
    totalHeight: bodyHeight,
    pageBodyStepPx,
    anchors,
  });
};

const getEffectiveMeasuredSectionHeightPx = ({
  enabled,
  configuredHeightPx,
  measuredNode,
  fallbackHeightPx = 0,
}: {
  enabled: boolean;
  configuredHeightPx: number;
  measuredNode?: HTMLElement | null;
  fallbackHeightPx?: number;
}) => {
  if (!enabled) return 0;
  const measuredHeight = measuredNode ? getMeasuredPrintBlockHeight(measuredNode) : fallbackHeightPx;
  if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) {
    return Math.max(0, Math.round(configuredHeightPx));
  }
  return Math.max(0, Math.min(Math.round(configuredHeightPx), Math.ceil(measuredHeight)));
};

const getTemplatePageBodyHeightPx = ({
  innerHeightMm,
  showHeader,
  showFooter,
  headerHeight,
  footerHeight,
  signatureHeight,
}: {
  innerHeightMm: number;
  showHeader: boolean;
  showFooter: boolean;
  headerHeight: number;
  footerHeight: number;
  signatureHeight: number;
}) =>
  normalizePrintBodyHeightPx(
    mmToPx(innerHeightMm) -
      (showHeader ? headerHeight : 0) -
      (showFooter ? footerHeight : 0) -
      signatureHeight -
      PRINT_BODY_LINE_GUARD_PX
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

const isCatalogFullPageTemplateId = (templateId: string) => /_catalog_fullpage_(list_)?landscape$/i.test(String(templateId || '').trim());
const getResolvedTemplatePageMargins = (template?: Pick<StoredPrintTemplate, 'id' | 'pageMarginTop' | 'pageMarginRight' | 'pageMarginBottom' | 'pageMarginLeft'> | null) => {
  if (isCatalogFullPageTemplateId(template?.id || '')) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  return {
    top: Number(template?.pageMarginTop ?? DEFAULT_PAGE_MARGINS.top),
    right: Number(template?.pageMarginRight ?? DEFAULT_PAGE_MARGINS.right),
    bottom: Number(template?.pageMarginBottom ?? DEFAULT_PAGE_MARGINS.bottom),
    left: Number(template?.pageMarginLeft ?? DEFAULT_PAGE_MARGINS.left),
  };
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
  const financialLabel = localizeFinancialValue(raw);
  if (financialLabel) return financialLabel;
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
  const [imageDisplayModes, setImageDisplayModes] = useState<Record<string, PrintImageDisplayMode>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [currentUserRoleTitle, setCurrentUserRoleTitle] = useState('');
  const [currentUserPermissions, setCurrentUserPermissions] = useState<Record<string, any> | null>(null);
  const [userPreferencesReady, setUserPreferencesReady] = useState(false);
  const [sellerInfo, setSellerInfo] = useState<any>(null);
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [supplierInfo, setSupplierInfo] = useState<any>(null);
  const [assigneeDirectory, setAssigneeDirectory] = useState<any>(null);
  const [printSignatureConfigs, setPrintSignatureConfigs] = useState<Record<string, PrintSignatureConfig[]>>({});
  const [signatureOptionsByRow, setSignatureOptionsByRow] = useState<Record<string, any[]>>({});
  const [signatureLabelByKey, setSignatureLabelByKey] = useState<Record<string, string>>({});
  const [billboardPrintLabelsById, setBillboardPrintLabelsById] = useState<Record<string, string>>({});
  const [linkedAttachmentCount, setLinkedAttachmentCount] = useState<number | null>(null);
  const [storedTemplates, setStoredTemplates] = useState<StoredPrintTemplate[]>([]);
  const [templatesByModuleStore, setTemplatesByModuleStore] = useState<Record<string, StoredPrintTemplate[]>>({});
  const [, setTemplatesStoreMeta] = useState<{ rowId: string | null; provider: string }>({
    rowId: null,
    provider: 'tiptap',
  });
  const [savingPrintFields, setSavingPrintFields] = useState(false);
  const [measuredSectionHeights, setMeasuredSectionHeights] = useState({ header: 0, footer: 0 });
  const headerMeasureRef = useRef<HTMLDivElement | null>(null);
  const footerMeasureRef = useRef<HTMLDivElement | null>(null);
  const bodyMeasureRef = useRef<HTMLDivElement | null>(null);
  const buildPrintCardRef = useRef<(pageCountOverride?: number | null) => React.ReactNode>(() => null);
  const reservedPrintWindowRef = useRef<Window | null>(null);
  const preparedPrintPageCountRef = useRef<number | null>(null);
  const renderedCustomTemplateRef = useRef<{ headerHtml: string; contentHtml: string; footerHtml: string } | null>(null);
  const printSignatureSectionHeightPxRef = useRef(0);
  const templatesLoadedRef = useRef(false);
  const dependenciesLoadedKeyRef = useRef<string | null>(null);
  const [renderedPageCount, setRenderedPageCount] = useState(1);
  const renderedPageOffsetsRef = useRef<number[]>([0]);
  const [renderedPageOffsets, setRenderedPageOffsets] = useState<number[]>([0]);
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
      .select('id, address, city_name, category, name, system_code')
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
          const label = buildBillboardInvoiceItemTitle(row)
            || String(row?.address || row?.name || row?.system_code || '').trim();
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
    const scopedTemplates = merged.filter((tpl) =>
      (tpl.scope || 'record') !== 'list' &&
      isPrintTemplateAvailableForModule(moduleId, tpl)
    );
    const activeMerged = scopedTemplates.filter((tpl) => tpl.isActive !== false);
    const baseTemplates =
      activeMerged.length > 0
        ? activeMerged
        : buildDefaultTemplatesForModule(moduleId, 'record').filter((tpl) => tpl.isActive !== false);
    return buildPrintLetterheadVariants(baseTemplates, sellerInfo?.print_letterheads || []);
  }, [moduleId, sellerInfo?.print_letterheads, storedTemplates, templatesByModuleStore]);

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
  const selectedOrgLetterhead = useMemo(
    () => getPrintLetterheadById(sellerInfo?.print_letterheads || [], selectedStoredTemplate?.letterheadId),
    [selectedStoredTemplate?.letterheadId, sellerInfo?.print_letterheads],
  );

  useEffect(() => {
    let mounted = true;
    fetchSessionBootstrap(supabase)
      .then((snapshot) => {
        if (!mounted) return;
        setCurrentUserId(String(snapshot?.user?.id || '').trim() || null);
        setCurrentUserProfile(snapshot?.profile || null);
        setCurrentUserPermissions((snapshot?.permissions || null) as Record<string, any> | null);
        setUserPreferencesReady(true);
        const roleId = String(snapshot?.profile?.role_id || '').trim();
        if (roleId) {
          fetchAssigneeDirectory(supabase)
            .then((directory) => {
              if (!mounted) return;
              setAssigneeDirectory(directory || null);
              const matchedRole = (directory?.roles || []).find((role: any) => String(role?.id || '').trim() === roleId);
              setCurrentUserRoleTitle(String(matchedRole?.title || '').trim());
            })
            .catch(() => {
              if (!mounted) return;
              setCurrentUserRoleTitle('');
            });
        } else {
          setCurrentUserRoleTitle('');
        }
      })
      .catch(() => {
        if (!mounted) return;
        setCurrentUserId(null);
        setCurrentUserProfile(null);
        setCurrentUserPermissions(null);
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
  const templateUsesSystemBlocks = useMemo(() => {
    const templateHtml = [
      selectedStoredTemplate?.headerHtml,
      selectedStoredTemplate?.contentHtml,
      selectedStoredTemplate?.footerHtml,
    ]
      .map((value) => String(value || ''))
      .join(' ');
    return /data-print-block\s*=|{{\s*block\./i.test(templateHtml);
  }, [selectedStoredTemplate?.contentHtml, selectedStoredTemplate?.footerHtml, selectedStoredTemplate?.headerHtml]);
  const templateUsesSystemFieldCollections = useMemo(() => {
    const templateHtml = [
      selectedStoredTemplate?.headerHtml,
      selectedStoredTemplate?.contentHtml,
      selectedStoredTemplate?.footerHtml,
    ]
      .map((value) => String(value || ''))
      .join(' ');
    return /system\.(?:compact_fields_table|compact_fields_inline|compact_tables_blocks)/i.test(templateHtml);
  }, [selectedStoredTemplate?.contentHtml, selectedStoredTemplate?.footerHtml, selectedStoredTemplate?.headerHtml]);
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
  const showImageDisplayModeControl = useMemo(() => {
    const templateId = String(selectedStoredTemplate?.id || '').trim();
    const templateHtml = [
      selectedStoredTemplate?.headerHtml,
      selectedStoredTemplate?.contentHtml,
      selectedStoredTemplate?.footerHtml,
    ]
      .map((value) => String(value || ''))
      .join(' ');

    return Boolean(
      isSystemRecordTemplate && (
        recordImageField ||
        templateId.includes('_catalog_') ||
        templateHtml.includes('system.record_image') ||
        templateHtml.includes('system.record_image_url') ||
        templateHtml.includes('system.catalog_map_section')
      )
    );
  }, [isSystemRecordTemplate, recordImageField, selectedStoredTemplate?.contentHtml, selectedStoredTemplate?.footerHtml, selectedStoredTemplate?.headerHtml, selectedStoredTemplate?.id]);
  const canViewPrintFieldPath = useCallback(
    (fieldPath: string) => canViewPrintTemplateFieldPath(fieldPath, canViewField),
    [canViewField]
  );
  const systemTemplateFieldOptions = useMemo(() => {
    const resolveSystemFieldHasValue = (fieldKey: string) => {
      const normalizedKey = String(fieldKey || '').trim();
      if (!normalizedKey) return false;
      if (normalizedKey.startsWith('record.')) {
        const recordPath = normalizedKey.replace(/^record\./, '');
        return hasMeaningfulPrintValue(getPathValue(data, recordPath), recordPath);
      }
      if (normalizedKey.startsWith('block.')) {
        const [, blockId, ...columnPath] = normalizedKey.split('.');
        const rows = Array.isArray(data?.[blockId]) ? data[blockId] : [];
        if (!rows.length) return false;
        const columnKey = String(columnPath.join('.') || '').trim();
        return !columnKey || rows.some((row: any) => hasMeaningfulPrintValue(row?.[columnKey], columnKey));
      }
      return true;
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

    const invoiceComputedSystemOptions =
      moduleId === 'invoices' || moduleId === 'purchase_invoices'
        ? [
            {
              key: 'record.global_discount_amount',
              labels: { fa: 'تخفیف کل' },
              value: data?.global_discount_value ?? data?.invoice_discount_amount ?? data?.invoice_discount_percent,
              hasValue: hasMeaningfulPrintValue(
                data?.global_discount_value ?? data?.invoice_discount_amount ?? data?.invoice_discount_percent,
                'global_discount_amount'
              ),
              group: 'فیلدهای عمومی',
              kind: 'record',
            },
          ]
        : [];

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
        key: 'company.slogan',
        labels: { fa: 'شعار سازمان' },
        value: true,
        hasValue: true,
        group: 'اطلاعات سازمان',
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
        labels: { fa: 'کد QR رکورد' },
        value: true,
        hasValue: true,
        group: 'سیستم',
        kind: 'record',
      },
      {
        key: 'system.catalog_qr_section',
        labels: { fa: 'QR کاتالوگ (سایدبار)' },
        value: true,
        hasValue: !!data?.catalog_link,
        group: 'سیستم',
        kind: 'record',
      },
      ...(moduleId === 'billboards' ? [{
        key: 'system.catalog_map_section',
        labels: { fa: 'نقشه کاتالوگ (سایدبار)' },
        value: true,
        hasValue: !!data?.location_image,
        group: 'سیستم',
        kind: 'record',
      }] : []),
    ];

    return [...baseOptions, ...invoiceComputedSystemOptions, ...commonSystemOptions, ...mediaOptions];
  }, [canViewField, data, moduleConfig, moduleId, recordImageField]);
  const isSelectedTemplateSystem = Boolean(selectedStoredTemplate?.isSystem || selectedTemplateMeta?.isSystem);
  const printableFieldsForTemplate = useMemo(() => {
    if (!isSystemRecordTemplate && !templateUsesSystemBlocks && !templateUsesSystemFieldCollections) return printableFields;
    return systemTemplateFieldOptions;
  }, [isSystemRecordTemplate, printableFields, systemTemplateFieldOptions, templateUsesSystemBlocks, templateUsesSystemFieldCollections]);
  const templateSelectedKeySet = useMemo(
    () => new Set<string>(selectedPrintFields[selectedTemplateId] || []),
    [selectedPrintFields, selectedTemplateId]
  );
  const knownTemplateFieldKeys = useMemo(
    () => new Set<string>(
      [...(printableFieldsForTemplate || []), ...(systemTemplateFieldOptions || [])]
        .map((item: any) => String(item?.key || '').trim())
        .filter(Boolean)
    ),
    [printableFieldsForTemplate, systemTemplateFieldOptions]
  );
  const hasTemplateSelectionState = useMemo(
    () => Object.prototype.hasOwnProperty.call(selectedPrintFields, selectedTemplateId),
    [selectedPrintFields, selectedTemplateId]
  );
  const isSystemFieldVisible = useCallback(
    (fieldPath: string, forceSelection = false) => {
      if (!canViewPrintFieldPath(fieldPath)) return false;
      // Manual templates express their field selection through the placeholders
      // placed by their editor. Selection still controls system blocks and
      // system field collections embedded in a manual template.
      const controlsThisPath =
        forceSelection ||
        isSelectedTemplateSystem ||
        String(fieldPath || '').startsWith('block.');
      if (!controlsThisPath) return true;
      if (!hasTemplateSelectionState) return true;
      if (!isPrintFieldKnownToTemplate(fieldPath, knownTemplateFieldKeys)) return true;
      return isPrintFieldSelected(fieldPath, templateSelectedKeySet);
    },
    [
      canViewPrintFieldPath,
      hasTemplateSelectionState,
      isSelectedTemplateSystem,
      knownTemplateFieldKeys,
      templateSelectedKeySet,
    ]
  );
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const printQrValue = pageUrl;
  const recordImageUrl = useMemo(
    () => (recordImageField ? getRecordImageUrl(data, [recordImageField]) : ''),
    [data, recordImageField]
  );
  const recordCardImageUrl = useMemo(
    () => buildImagePreviewUrl(recordImageUrl, 'card', { forceTransform: isPrintImageTransformEnabled() }),
    [recordImageUrl]
  );
  const recordHeroImageUrl = useMemo(
    () => buildPrintImageUrl(recordImageUrl, 'printHero'),
    [recordImageUrl]
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

  const measureCurrentCustomTemplatePages = useCallback(() => {
    if (!selectedTemplateId.startsWith('custom:') || !selectedStoredTemplate || !bodyMeasureRef.current) {
      return null;
    }

    const metrics = getPaperSizeMetrics(
      selectedStoredTemplate.paperSize,
      selectedStoredTemplate.orientation || 'portrait'
    );
    const isOrgLetterhead =
      selectedStoredTemplate.renderMode === 'org_letterhead' &&
      Boolean(selectedOrgLetterhead?.imageUrl);
    const pageBodyHeightPx = isOrgLetterhead
      ? (() => {
          const bodyItem = getPrintLetterheadEffectiveBodyItem(
            selectedOrgLetterhead,
            printSignatureSectionHeightPxRef.current > 0
          );
          return bodyItem ? mmToPx(metrics.heightMm * (bodyItem.height / 100)) : mmToPx(metrics.heightMm);
        })()
      : (() => {
          const showHeader = selectedStoredTemplate.showHeader !== false;
          const rawFooterHtml = String(renderedCustomTemplateRef.current?.footerHtml || '').trim();
          const showFooter =
            printSignatureSectionHeightPxRef.current > 0 ||
            (selectedStoredTemplate.showFooter !== false &&
              (hasRenderablePrintFooterHtml(rawFooterHtml) || PRINT_PAGE_COUNTER_HEIGHT_PX > 0));
          const configuredHeaderHeight = Number(selectedStoredTemplate.headerHeight || 84);
          const configuredFooterHeight = Number(selectedStoredTemplate.footerHeight || 62);
          const headerHeight = getEffectiveMeasuredSectionHeightPx({
            enabled: showHeader,
            configuredHeightPx: configuredHeaderHeight,
            measuredNode: headerMeasureRef.current,
            fallbackHeightPx: measuredSectionHeights.header,
          });
          const measuredFooterHeight = getEffectiveMeasuredSectionHeightPx({
            enabled: showFooter,
            configuredHeightPx: configuredFooterHeight,
            measuredNode: footerMeasureRef.current,
            fallbackHeightPx: measuredSectionHeights.footer,
          });
          const footerHeight = showFooter
            ? measuredFooterHeight + printSignatureSectionHeightPxRef.current + PRINT_PAGE_COUNTER_HEIGHT_PX
            : 0;
          setMeasuredSectionHeights((prev) =>
            prev.header === headerHeight && prev.footer === measuredFooterHeight
              ? prev
              : { header: headerHeight, footer: measuredFooterHeight }
          );
          const pageMargins = getResolvedTemplatePageMargins(selectedStoredTemplate);
          const innerHeightMm = Math.max(40, metrics.heightMm - pageMargins.top - pageMargins.bottom);
          return getTemplatePageBodyHeightPx({
            innerHeightMm,
            showHeader,
            showFooter,
            headerHeight,
            footerHeight,
            signatureHeight: 0,
          });
        })();
    const pageBodyStepPx = getTemplatePageBodyStepPx(pageBodyHeightPx);
    const pageOffsets = getMeasuredPrintPageOffsets(bodyMeasureRef.current, pageBodyStepPx);
    const pageCount = Math.max(1, pageOffsets.length);

    renderedPageOffsetsRef.current = pageOffsets;
    preparedPrintPageCountRef.current = pageCount;
    setRenderedPageOffsets((prev) =>
      prev.length === pageOffsets.length &&
      prev.every((value, index) => value === pageOffsets[index])
        ? prev
        : pageOffsets
    );
    setRenderedPageCount((prev) => (prev === pageCount ? prev : pageCount));

    return { pageOffsets, pageCount };
  }, [
    measuredSectionHeights.footer,
    measuredSectionHeights.header,
    selectedTemplateId,
    selectedStoredTemplate,
    selectedOrgLetterhead,
  ]);

  const preparePrint = useCallback(() => {
    measureCurrentCustomTemplatePages();
    if (!shouldUseGeneratedPdfPrint()) return;
    const printTitle = getPrintOutputName();
    reservedPrintWindowRef.current = prepareGeneratedPdfWindow(printTitle);
  }, [getPrintOutputName, measureCurrentCustomTemplatePages]);

  const handlePrint = useCallback(() => {
    if (!selectedTemplateId) return;
    const printTitle = getPrintOutputName();

    const preparedMeasurement = measureCurrentCustomTemplatePages();
    let measuredPageCount =
      preparedMeasurement?.pageCount ??
      preparedPrintPageCountRef.current ??
      renderedPageCount;
    let previewPageCount = 0;
    if (typeof document !== 'undefined') {
      previewPageCount = document.querySelectorAll('.print-preview-scale .print-template-page').length || 0;
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
    availableTemplates,
    getPrintOutputName,
    measureCurrentCustomTemplatePages,
    renderedPageCount,
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
      ? Math.max(1, options?.pageCountOverride ?? preparedPrintPageCountRef.current ?? renderedPageCount)
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
    preparedPrintPageCountRef.current = null;
  }, [printMode]);

  useEffect(() => {
    if (!printMode) return;
    const handleAfterPrint = () => setPrintMode(false);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, [printMode]);

  useEffect(() => {
    if (!selectedTemplateId || !userPreferencesReady) return;
    // Do not persist an empty selection while templates or runtime fields are
    // still loading. Otherwise that transient state hides every system block.
    if (!printableFieldsForTemplate.length) return;
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
            Array.isArray(preferenceKeys)
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
          Array.isArray(preferenceKeys)
            ? preferenceKeys
            : (printableFieldsForTemplate || [])
                .filter((field: any) => field?.hasValue !== false)
                .map((field: any) => field.key),
          allowedKeySet
        );

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

  const canUseCeoSignature = useMemo(
    () => currentUserPermissions?.[SETTINGS_PERMISSION_KEY]?.fields?.ceo_signature === true,
    [currentUserPermissions]
  );

  useEffect(() => {
    if (!selectedTemplateId || !userPreferencesReady) return;
    const preference = loadPrintRenderPreference({
      userId: currentUserId,
      moduleId,
      templateId: selectedStoredTemplate?.id || selectedTemplateId,
      scope: 'record',
    });
    setImageDisplayModes((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, selectedTemplateId)) return prev;
      return {
        ...prev,
        [selectedTemplateId]: sanitizePrintImageDisplayMode(preference.imageDisplayMode),
      };
    });
    const defaultSignatureConfigs = buildDefaultPrintSignatureConfigs({
      scope: 'record',
      moduleConfig,
      record: data,
      currentUserId,
      companyInfo: sellerInfo,
      canUseCeoSignature,
    });
    setPrintSignatureConfigs((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, selectedTemplateId)) return prev;
      const nextConfigs = sanitizePrintSignatureConfigs(preference.signatureConfigs || []);
      return {
        ...prev,
        [selectedTemplateId]: nextConfigs.length > 0 ? nextConfigs : defaultSignatureConfigs,
      };
    });
  }, [
    canUseCeoSignature,
    currentUserId,
    data,
    moduleConfig,
    moduleId,
    relationOptions,
    selectedStoredTemplate?.id,
    selectedTemplateId,
    sellerInfo,
    userPreferencesReady,
  ]);

  const imageDisplayMode = sanitizePrintImageDisplayMode(
    imageDisplayModes[selectedTemplateId] || DEFAULT_PRINT_IMAGE_DISPLAY_MODE
  );
  const selectedPrintSignatureConfigs = useMemo(
    () => sanitizePrintSignatureConfigs(printSignatureConfigs[selectedTemplateId] || []),
    [printSignatureConfigs, selectedTemplateId]
  );
  const printSignatureStates = useMemo(
    () =>
      materializePrintSignatureStates({
        configs: selectedPrintSignatureConfigs,
        scope: 'record',
        moduleConfig,
        record: data,
        relationOptions,
        signerLabelByKey: signatureLabelByKey,
        companyInfo: sellerInfo,
        currentUser: currentUserProfile,
        currentUserRoleTitle,
        assigneeDirectory,
        canUseCeoSignature,
      }),
    [
      assigneeDirectory,
      canUseCeoSignature,
      currentUserProfile,
      currentUserRoleTitle,
      data,
      moduleConfig,
      relationOptions,
      selectedPrintSignatureConfigs,
      sellerInfo,
      signatureLabelByKey,
    ]
  );
  const printSignatureBandHtml = useMemo(
    () => buildPrintSignatureBandHtml(printSignatureStates),
    [printSignatureStates]
  );
  const printSignatureSectionHeightPx = useMemo(
    () => (printSignatureBandHtml ? getPrintSignatureSectionHeightPx(printSignatureStates) : 0),
    [printSignatureBandHtml, printSignatureStates]
  );
  printSignatureSectionHeightPxRef.current = printSignatureSectionHeightPx;

  useEffect(() => {
    if (currentUserRoleTitle) return;
    const roleId = String(currentUserProfile?.role_id || '').trim();
    if (!roleId) return;
    const matchedRole = (assigneeDirectory?.roles || []).find((role: any) => String(role?.id || '').trim() === roleId);
    const nextTitle = String(matchedRole?.title || '').trim();
    if (nextTitle) setCurrentUserRoleTitle(nextTitle);
  }, [assigneeDirectory, currentUserProfile?.role_id, currentUserRoleTitle]);

  const loadSignatureSignerOptions = useCallback(
    async (
      rowId: string,
      signerModule: PrintSignatureSignerModule,
      search = '',
      exactId?: string | null
    ) => {
      const normalizedModule = String(signerModule || '').trim() as PrintSignatureSignerModule;
      if (!normalizedModule) return;
      const options = await fetchRelationOptionsForField(
        supabase,
        { relationConfig: { targetModule: normalizedModule } },
        {
          search,
          exactId: exactId || null,
          limit: search ? 50 : 30,
        }
      ).catch(() => []);

      if (Array.isArray(options) && options.length > 0) {
        setSignatureOptionsByRow((prev) => ({ ...prev, [rowId]: options }));
        setSignatureLabelByKey((prev) => {
          const next = { ...prev };
          options.forEach((option: any) => {
            const optionKey = `${normalizedModule}:${String(option?.value || '').trim()}`;
            const label = String(option?.label || option?.name || '').trim();
            if (optionKey && label) next[optionKey] = label;
          });
          return next;
        });
      }
    },
    []
  );

  useEffect(() => {
    printSignatureStates.forEach((row) => {
      const signerModule = row.signerModule as PrintSignatureSignerModule | null;
      const signerId = String(row.signerId || '').trim();
      if (!signerModule || !signerId) return;
      const signerKey = `${signerModule}:${signerId}`;
      if (signatureLabelByKey[signerKey]) return;
      void loadSignatureSignerOptions(row.id, signerModule, '', signerId);
    });
  }, [loadSignatureSignerOptions, printSignatureStates, signatureLabelByKey]);

  const updatePrintSignatureConfig = useCallback((rowId: string, updater: (row: PrintSignatureConfig) => PrintSignatureConfig) => {
    setPrintSignatureConfigs((prev) => {
      const current = sanitizePrintSignatureConfigs(prev[selectedTemplateId] || []);
      return {
        ...prev,
        [selectedTemplateId]: current.map((row) => (row.id === rowId ? updater(row) : row)),
      };
    });
  }, [selectedTemplateId]);

  const handleAddPrintSignatureRow = useCallback((kind: PrintSignatureKind) => {
    setPrintSignatureConfigs((prev) => {
      const current = sanitizePrintSignatureConfigs(prev[selectedTemplateId] || []);
      const nextRow: PrintSignatureConfig =
        kind === 'manual'
          ? { id: createPrintSignatureRowId(), kind: 'manual', enabled: true, automatic: false, nameOverride: '', subtitleOverride: '' }
          : kind === 'selected_signer'
            ? {
                id: createPrintSignatureRowId(),
                kind: 'selected_signer',
                enabled: true,
                automatic: true,
                signerModule: 'customers',
                signerId: null,
                sourceFieldLabel: 'مشتری',
              }
            : { id: createPrintSignatureRowId(), kind, enabled: true, automatic: true };
      return {
        ...prev,
        [selectedTemplateId]: [...current, nextRow],
      };
    });
  }, [selectedTemplateId]);

  const handleRemovePrintSignatureRow = useCallback((rowId: string) => {
    setPrintSignatureConfigs((prev) => {
      const current = sanitizePrintSignatureConfigs(prev[selectedTemplateId] || []);
      return {
        ...prev,
        [selectedTemplateId]: current.filter((row) => row.id !== rowId),
      };
    });
  }, [selectedTemplateId]);

  const handleMovePrintSignatureRow = useCallback((rowId: string, direction: 'up' | 'down') => {
    setPrintSignatureConfigs((prev) => {
      const current = [...sanitizePrintSignatureConfigs(prev[selectedTemplateId] || [])];
      const index = current.findIndex((row) => row.id === rowId);
      if (index < 0) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return prev;
      [current[index], current[targetIndex]] = [current[targetIndex], current[index]];
      return {
        ...prev,
        [selectedTemplateId]: current,
      };
    });
  }, [selectedTemplateId]);

  const handleTogglePrintSignatureAutomatic = useCallback((rowId: string, automatic: boolean) => {
    updatePrintSignatureConfig(rowId, (row) => ({ ...row, automatic }));
  }, [updatePrintSignatureConfig]);

  const handleTogglePrintSignatureEnabled = useCallback((rowId: string, enabled: boolean) => {
    updatePrintSignatureConfig(rowId, (row) => ({ ...row, enabled }));
  }, [updatePrintSignatureConfig]);

  const handleChangePrintSignatureName = useCallback((rowId: string, value: string) => {
    updatePrintSignatureConfig(rowId, (row) => ({ ...row, nameOverride: value }));
  }, [updatePrintSignatureConfig]);

  const handleChangePrintSignatureSubtitle = useCallback((rowId: string, value: string) => {
    updatePrintSignatureConfig(rowId, (row) => ({ ...row, subtitleOverride: value }));
  }, [updatePrintSignatureConfig]);

  const handleChangePrintSignatureSignerModule = useCallback((rowId: string, signerModule: PrintSignatureSignerModule) => {
    updatePrintSignatureConfig(rowId, (row) => ({
      ...row,
      kind: 'selected_signer',
      automatic: true,
      signerModule,
      signerId: null,
      sourceFieldLabel: getSignerModuleLabel(signerModule),
    }));
    void loadSignatureSignerOptions(rowId, signerModule);
  }, [loadSignatureSignerOptions, updatePrintSignatureConfig]);

  const handleChangePrintSignatureSignerId = useCallback((rowId: string, signerId: string | null) => {
    updatePrintSignatureConfig(rowId, (row) => ({ ...row, signerId }));
  }, [updatePrintSignatureConfig]);

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

  const handleChangeImageDisplayMode = useCallback((templateId: string, mode: PrintImageDisplayMode) => {
    setImageDisplayModes((prev) => ({
      ...prev,
      [templateId]: sanitizePrintImageDisplayMode(mode),
    }));
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
      if (showImageDisplayModeControl) {
        savePrintRenderPreference({
          userId: currentUserId,
          moduleId,
          templateId: selectedStoredTemplate?.id || selectedTemplateId,
          scope: 'record',
          imageDisplayMode,
          signatureConfigs: selectedPrintSignatureConfigs,
        });
      } else {
        savePrintRenderPreference({
          userId: currentUserId,
          moduleId,
          templateId: selectedStoredTemplate?.id || selectedTemplateId,
          scope: 'record',
          imageDisplayMode,
          signatureConfigs: selectedPrintSignatureConfigs,
        });
      }
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
    imageDisplayMode,
    selectedStoredTemplate?.id,
    selectedTemplateId,
    selectedPrintSignatureConfigs,
    showImageDisplayModeControl,
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
    const hasLegacyDiscountPercent = data?.invoice_discount_percent !== null
      && data?.invoice_discount_percent !== undefined
      && String(data?.invoice_discount_percent).trim() !== '';
    const globalDiscountType = String(
      data?.global_discount_type
      ?? (hasLegacyDiscountPercent ? 'percent' : 'amount')
    )
      .trim()
      .toLowerCase() === 'percent'
      ? 'percent'
      : 'amount';
    const globalDiscountValue = Math.max(
      0,
      toNumberSafe(
        data?.global_discount_value
        ?? (globalDiscountType === 'percent' ? data?.invoice_discount_percent : data?.invoice_discount_amount)
      )
    );

    const hasRawRemaining =
      data?.remaining_balance !== undefined ||
      data?.remaining_amount !== undefined ||
      data?.due_amount !== undefined ||
      data?.balance !== undefined;

    const received = rawReceived > 0 ? rawReceived : paymentsTotal;
    const computedGlobalDiscountAmount = Math.min(
      Math.max(itemsTotal, 0),
      globalDiscountType === 'percent'
        ? (Math.max(itemsTotal, 0) * Math.min(globalDiscountValue, 100)) / 100
        : globalDiscountValue
    );
    const total =
      rawTotal > 0
        ? rawTotal
        : itemsTotal > 0
          ? Math.max(itemsTotal - computedGlobalDiscountAmount, 0)
          : rawRemaining > 0 || received > 0
            ? rawRemaining + received
            : 0;
    const remaining = hasRawRemaining ? rawRemaining : Math.max(total - received, 0);

    const globalDiscountAmount = Math.min(
      Math.max(total > 0 && rawTotal > 0 ? itemsTotal : Math.max(itemsTotal, total), 0),
      globalDiscountType === 'percent'
        ? (Math.max(total > 0 && rawTotal > 0 ? itemsTotal : Math.max(itemsTotal, total), 0) * Math.min(globalDiscountValue, 100)) / 100
        : globalDiscountValue
    );

    return {
      total,
      received,
      remaining,
      globalDiscountType,
      globalDiscountValue,
      globalDiscountAmount,
    };
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
    const directLabel = buildBillboardInvoiceItemTitle(row?.billboard || {
      address: row?.billboard_address || row?.selected_billboard_address || row?.address,
      city_name: row?.billboard_city_name || row?.city_name,
      category: row?.billboard_category || row?.category,
      name: row?.selected_billboard_name || row?.billboard_name,
    });
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
          : isSystemFieldVisible(`record.${fieldKey}`, true);

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
    const responsibleValue = resolvePrintAssigneeLabel(data, relationOptions || {});

    if (!hasAssigneeField && responsibleValue && isSystemFieldVisible('record.assignee_id', true)) {
      regularRows.unshift(`
          <tr>
            <td style="width:38%; border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">${getAssigneeLabel(moduleId)}</td>
            <td style="border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px;">${localizePlainText(responsibleValue)}</td>
          </tr>
        `);
    }

    const rowsHtml = regularRows.slice(0, 24).join('');
    const longTextRowsHtml = longTextRows.join('');
    if (!rowsHtml && !longTextRowsHtml) {
      // وقتی هیچ فیلد قابل چاپی وجود ندارد، کل جدول حذف می‌شود (نه نمایش متن جایگزین).
      // wrapper خالی باقی‌مانده توسط pruneEmptyPrintContainers پاک می‌شود.
      return '';
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
  }, [data, formatPrintValue, isSystemFieldVisible, moduleConfig?.fields, moduleId, relationOptions]);

  const buildInvoiceItemsTable = useCallback((items: any[]) => {
    if (!Array.isArray(items) || items.length === 0) {
      return '<div style="padding:8px;border:1px solid #e5e7eb;border-radius:6px;">اقلامی ثبت نشده است.</div>';
    }

    const itemsSubtotal = items.reduce((sum: number, item: any) => {
      const rowTotal = toNumberSafe(item?.total_price);
      if (rowTotal > 0) return sum + rowTotal;
      return sum + (toNumberSafe(item?.quantity) * toNumberSafe(item?.unit_price));
    }, 0);
    const rows = items
      .map((item: any) => {
        const productName = getInvoiceItemTitle(item, resolveBillboardPrintLabel);
        const deliveryTime = String(item?.delivery_time || '').trim();
        const quantity = toPersianNumber(String(item?.quantity || 0));
        const unitPrice = formatPersianPrice(Number(item?.unit_price || 0));
        const vat = item?.vat === null || item?.vat === undefined || item?.vat === '' ? '' : getDisplayValue(item.vat);
        const total = formatPersianPrice(
          toNumberSafe(item?.total_price) > 0
            ? toNumberSafe(item?.total_price)
            : (toNumberSafe(item?.quantity) * toNumberSafe(item?.unit_price))
        );
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
    const discountSummaryRow = invoiceSummary.globalDiscountAmount > 0
      ? `
        <tr>
          <td colspan="4" style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;font-weight:700;background:rgba(var(--brand-50-rgb),0.32);">تخفیف کل (${invoiceSummary.globalDiscountType === 'percent' ? `${toPersianNumber(String(invoiceSummary.globalDiscountValue))}%` : `${formatPersianPrice(invoiceSummary.globalDiscountValue)} ${resolvedCurrencyLabel}`})</td>
          <td style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;text-align:center;background:#fff;">-${formatPersianPrice(invoiceSummary.globalDiscountAmount)}</td>
        </tr>
      `
      : '';
    const finalTotal = Math.max(itemsSubtotal - invoiceSummary.globalDiscountAmount, 0);
    const finalSummaryRow = `
      <tr>
        <td colspan="4" style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;font-weight:800;background:rgba(var(--brand-500-rgb),0.08);">جمع کل نهایی</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db);padding:6px;text-align:center;font-weight:800;">${formatPersianPrice(finalTotal)}</td>
      </tr>
    `;

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
        <tbody>${rows}${discountSummaryRow}${finalSummaryRow}</tbody>
      </table>
    `;
  }, [invoiceSummary.globalDiscountAmount, invoiceSummary.globalDiscountType, invoiceSummary.globalDiscountValue, resolveBillboardPrintLabel, resolvedCurrencyLabel, toPersianNumber]);

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
      const rowAdjustmentDisplay = (() => {
        if (key !== 'discount' && key !== 'vat') return null;
        const rowBaseAmount = resolveInvoiceRowBaseAmount(row);
        if (key === 'discount') {
          return buildInvoiceAdjustmentDisplay({
            value: row?.discount,
            type: row?.discount_type,
            baseAmount: rowBaseAmount,
            currencyLabel: resolvedCurrencyLabel,
          });
        }
        const discountAmount = buildInvoiceAdjustmentDisplay({
          value: row?.discount,
          type: row?.discount_type,
          baseAmount: rowBaseAmount,
          currencyLabel: resolvedCurrencyLabel,
        }).amount;
        return buildInvoiceAdjustmentDisplay({
          value: row?.vat,
          type: row?.vat_type,
          baseAmount: Math.max(0, rowBaseAmount - discountAmount),
          currencyLabel: resolvedCurrencyLabel,
        });
      })();
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

      if (rowAdjustmentDisplay) {
        if (!rowAdjustmentDisplay.hasValue) return '-';
        return rowAdjustmentDisplay.secondaryText
          ? `<div>${rowAdjustmentDisplay.primaryText}</div><div style="font-size:9px;color:#64748b;margin-top:2px;">${rowAdjustmentDisplay.secondaryText}</div>`
          : rowAdjustmentDisplay.primaryText;
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
      const canShowDescription =
        isSystemFieldVisible(`block.${blockId}.description`) ||
        isSystemFieldVisible(`block.${blockId}.notes`);
      if (canShowDescription) {
        const descriptionValue = getDisplayValue(row?.description || row?.notes || '');
        if (descriptionValue && descriptionValue !== '-') optionalParts.push(descriptionValue);
      }
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
    [formatCellValue, getDisplayValue, isSystemFieldVisible]
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

  // پاک‌سازی سراسری wrapper های خالی بعد از جایگزینی توکن‌ها.
  // وقتی همه فیلدهای یک جدول/بخش غیرفعال یا بی‌مقدار باشند، توکن‌ها به رشته خالی resolve می‌شوند و
  // کادر/فاصلهٔ خالی باقی می‌ماند؛ این پاس آن container ها را حذف می‌کند تا اصلاً نمایش داده نشوند.
  const pruneEmptyPrintContainers = useCallback((rootEl: Element) => {
    // عناصری که نشان‌دهندهٔ محتوای واقعی هستند و نباید container شامل آن‌ها حذف شود.
    const MEANINGFUL_SELECTOR = 'img,svg,table,hr,canvas,input,textarea,iframe,video,object,picture,source,br';
    const hasVisualStyle = (el: Element) => {
      const style = String(el.getAttribute('style') || '');
      // container هایی که ارتفاع ثابت یا پس‌زمینه دارند ممکن است عمداً به‌عنوان spacer/کادر تصویری باشند.
      return /(?:^|;)\s*(?:min-)?height\s*:/i.test(style) || /background(?:-color|-image)?\s*:/i.test(style);
    };

    let changed = true;
    let guard = 0;
    while (changed && guard < 6) {
      changed = false;
      guard += 1;
      rootEl.querySelectorAll('div, section').forEach((el) => {
        if (!el.isConnected) return;
        if (el.querySelector(MEANINGFUL_SELECTOR)) return;
        if (hasVisualStyle(el)) return;
        const text = String(el.textContent || '')
          .replace(/‌/g, '')
          .replace(/ /g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (text) return;
        el.remove();
        changed = true;
      });
    }
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
                if (key === '__discount_amount__') {
                  const baseAmount = Math.max(0, toNumberSafe(row?.quantity) * toNumberSafe(row?.unit_price));
                  const discountInput = Math.max(0, toNumberSafe(row?.discount));
                  const isPercentDiscount = String(row?.discount_type || '').trim().toLowerCase() === 'percent';
                  const discountAmount = isPercentDiscount
                    ? Math.min(baseAmount, (baseAmount * Math.min(discountInput, 100)) / 100)
                    : discountInput;
                  return formatPersianPrice(discountAmount);
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

      root.querySelectorAll<HTMLElement>('[data-print-optional-field]').forEach((element) => {
        const fieldPath = String(element.getAttribute('data-print-optional-field') || '').trim();
        if (fieldPath && !isSystemFieldVisible(fieldPath, true)) element.remove();
      });

      // حذف سراسری wrapper های خالی‌مانده (مثلاً وقتی جدول فیلدها یا تصویر/QR بی‌مقدار حذف شده‌اند).
      pruneEmptyPrintContainers(root);

      return root.innerHTML;
    },
    [buildBlockSummaryMap, buildRowMetaText, data, formatCellValue, isSystemFieldVisible, moduleConfig?.blocks, pruneEmptyPrintContainers, pruneEmptyTableCells, resolveBillboardPrintLabel]
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

  // Ordered sidebar fields: record fields in user-selected order (templateSelectedKeySet preserves insertion order)
  // Used by compact_fields_sidebar resolver to respect both selection AND ordering.
  const orderedSidebarFieldDefs = useMemo(() => {
    const fields = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [];
    const fieldByKey = new Map<string, any>(fields.map((f: any) => [String(f?.key || ''), f]));
    // Sort fallback: use module config order by field.order property
    const sortedFields = [...fields].sort((a: any, b: any) => (Number(a?.order ?? 999) - Number(b?.order ?? 999)));
    // If we have a user-defined order (templateSelectedKeySet), use that; else use sorted module order
    const orderedKeys = templateSelectedKeySet.size > 0
      ? [...templateSelectedKeySet].filter(k => k.startsWith('record.')).map(k => k.replace(/^record\./, ''))
      : sortedFields.map((f: any) => String(f?.key || '')).filter(Boolean);
    return orderedKeys
      .map(key => fieldByKey.get(key))
      .filter((f: any): f is any =>
        Boolean(f?.key) &&
        !PRINT_COLUMN_IGNORE_KEYS.has(String(f.key)) &&
        String(f?.type || '').toLowerCase() !== 'image' &&
        !isLongTextType(f?.type) &&
        !/code/i.test(String(f.key))
      );
  }, [moduleConfig?.fields, templateSelectedKeySet]);

  // Ordered code fields: fields whose key contains "code", sorted by order property
  const orderedCodeFieldDefs = useMemo(() => {
    const fields = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [];
    const fieldByKey = new Map<string, any>(fields.map((f: any) => [String(f?.key || ''), f]));
    const selectedRecordKeys = templateSelectedKeySet.size > 0
      ? [...templateSelectedKeySet]
          .filter((key) => key.startsWith('record.'))
          .map((key) => key.replace(/^record\./, ''))
      : [];
    const sourceFields = selectedRecordKeys.length > 0
      ? selectedRecordKeys.map((key) => fieldByKey.get(key)).filter(Boolean)
      : [...fields].sort((a: any, b: any) => (Number(a?.order ?? 999) - Number(b?.order ?? 999)));
    return sourceFields.filter((f: any) =>
      f?.key &&
      /code/i.test(String(f.key)) &&
      isSystemFieldVisible(`record.${String(f.key)}`)
    );
  }, [isSystemFieldVisible, moduleConfig?.fields, templateSelectedKeySet]);

  const resolveVariableValue = useCallback(
    (path: string): string => {
      const normalizeOptionalDisplay = (value: any) => {
        const text = String(value ?? '').trim();
        return text && text !== '-' ? text : '';
      };

      const resolveRecordFieldDisplay = (fieldKey: string) => {
        const raw = data?.[fieldKey];
        if (raw === null || raw === undefined || raw === '') return '';
        if (fieldKey === 'created_by' || fieldKey === 'updated_by') {
          const user = (assigneeDirectory?.users || []).find((item: any) => String(item?.id || '').trim() === String(raw).trim());
          const userLabel = String(user?.display_name || user?.full_name || user?.email || user?.mobile_1 || '').trim();
          return userLabel || '[کاربر سازمان]';
        }
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
        return normalizeOptionalDisplay(sanitizeOutboundDisplay(localizePlainText(raw)));
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
      if (path === 'system.print_date') return `${toPersianNumber(safeJalaliFormat(now, 'YYYY/MM/DD'))} ${now.toLocaleTimeString('fa-IR')}`;
      if (path === 'system.letter_sender_display') {
        return resolveRecordFieldDisplay('sender_manual') || resolveRecordFieldDisplay('sender_profile_id');
      }
      if (path === 'system.letter_recipient_display') {
        return resolveRecordFieldDisplay('recipient_manual') || resolveRecordFieldDisplay('recipient_profile_id');
      }
      if (path === 'system.compact_fields_table') return buildCompactFieldsTableHtml();
      if (path === 'system.compact_fields_inline') {
        // Renders selected fields as inline text: "ابعاد: ۴×۳ · اجاره: ۵ م · وضعیت: آزاد"
        const fields = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [];
        const parts: string[] = [];
        fields
          .filter(
            (field: any) =>
              field?.key &&
              !PRINT_COLUMN_IGNORE_KEYS.has(String(field.key)) &&
              String(field?.type || '').toLowerCase() !== 'image' &&
              !isLongTextType(field?.type) &&
              isSystemFieldVisible(`record.${field.key}`, true)
          )
          .forEach((field: any) => {
            const raw = data?.[field.key];
            if (raw === null || raw === undefined || raw === '') return;
            let displayValue = '';
            try { displayValue = String(formatPrintValue(field, raw) || '').trim(); } catch { displayValue = ''; }
            if (!displayValue) displayValue = localizePlainText(raw);
            if (!displayValue || displayValue === '-') return;
            const label = getFieldLabelFa(field, { moduleId, fallback: field.key });
            parts.push(`<span style="white-space:nowrap;">${label}: ${displayValue}</span>`);
          });
        return parts.join(' <span style="color:rgba(255,255,255,0.35); margin:0 2px;">·</span> ');
      }
      if (path === 'system.record_image_url') {
        // Returns just the image URL (no HTML wrapper) — for use in src="" attributes
        return recordHeroImageUrl || '';
      }
      if (path === 'system.compact_tables_blocks') return buildCompactTablesBlocksHtml();
      if (path === 'system.package_summary_table') return buildPackageSummaryTableHtml();
      if (path === 'system.record_image') {
        if (!isSystemFieldVisible('system.record_image') || !recordCardImageUrl) return '';
        return `<div style="display:inline-block;border:1px solid var(--table-border-color, #d1d5db);border-radius:10px;padding:3px;background:#fff;line-height:0;"><img src="${recordCardImageUrl}" alt="\u062A\u0635\u0648\u06CC\u0631 \u0631\u06A9\u0648\u0631\u062F" style="display:block;width:320px;height:auto;object-fit:contain;border-radius:7px;" /></div>`;
      }
      if (path === 'system.record_qr') {
        if (!isSystemFieldVisible('system.record_qr') || !recordQrSvgMarkup) return '';
        return `<div style="display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--table-border-color, #d1d5db);border-radius:12px;padding:6px;background:#fff;">${recordQrSvgMarkup}</div>`;
      }
      if (path === 'system.catalog_qr_section') {
        // Compact square QR box — designed for side-by-side placement in catalogFullPageLayout
        const publicLink = String(data?.catalog_link || '').trim();
        if (!publicLink) return '';
        try {
          const qrSvg = renderToStaticMarkup(
            React.createElement(QRCode, { value: publicLink, type: 'svg', size: 56, bordered: false })
          );
          const safeLink = publicLink.replace(/"/g, '&quot;');
          const displayLink = publicLink.length > 32 ? publicLink.slice(0, 30) + '…' : publicLink;
          return `<div style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:2mm; gap:1mm; background:#fff; box-sizing:border-box; overflow:hidden;"><div style="font-size:6px; font-weight:800; color:rgb(var(--brand-600-rgb,37,99,235)); letter-spacing:0.4px; text-align:center; flex-shrink:0;">QR کاتالوگ</div><div style="background:#fff; border:1.5px solid rgb(var(--brand-200-rgb,191,219,254)); border-radius:8px; padding:3px; box-shadow:0 1px 6px rgba(59,130,246,0.1); flex-shrink:0;">${qrSvg}</div><a href="${safeLink}" target="_blank" style="display:block; font-size:5px; color:rgb(var(--brand-500-rgb,59,130,246)); text-decoration:none; text-align:center; direction:ltr; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%; border:1px solid rgb(var(--brand-100-rgb,219,234,254)); border-radius:4px; padding:1px 3px; background:rgb(var(--brand-50-rgb,239,246,255)); box-sizing:border-box; flex-shrink:0;">${displayLink}</a></div>`;
        } catch {
          return '';
        }
      }
      if (path === 'system.catalog_map_section') {
        // Compact square map box — full-cover image, designed for side-by-side placement
        const mapImageUrl = buildPrintImageUrl(String(data?.location_image || '').trim(), 'printMap');
        if (!mapImageUrl) return '';
        const locationRaw = data?.location;
        let googleUrl = '#';
        let locationText = '';
        try {
          const parsed = locationRaw ? parseLocationValue(String(locationRaw)) : null;
          if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
            googleUrl = `https://www.google.com/maps?q=${parsed.lat},${parsed.lng}`;
            locationText = `${parsed.lat.toFixed(4)}, ${parsed.lng.toFixed(4)}`;
          }
        } catch { /* ignore */ }
        const safeImg = mapImageUrl.replace(/"/g, '&quot;');
        return `<a href="${googleUrl}" target="_blank" style="display:block; width:100%; height:100%; position:relative; overflow:hidden; text-decoration:none;"><img src="${safeImg}" alt="نقشه موقعیت" loading="eager" decoding="sync" style="${imageDisplayMode === 'actual' ? 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:auto;height:auto;max-width:none;max-height:none;object-fit:none;object-position:center center;display:block;' : 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center center;display:block;'}" /><div style="position:absolute; inset:0; background:linear-gradient(to top,rgba(0,0,0,0.65) 0%,transparent 55%);"></div><div style="position:absolute; bottom:0; left:0; right:0; padding:1.5mm 2mm;"><div style="color:#fff; font-size:6px; font-weight:800; text-align:center; text-shadow:0 1px 4px rgba(0,0,0,0.8);">📍 موقعیت مکانی</div>${locationText ? `<div style="color:rgba(255,255,255,0.75); font-size:5px; direction:ltr; font-family:monospace; text-align:center; margin-top:0.5mm;">${locationText}</div>` : ''}</div></a>`;
      }
      if (path === 'system.compact_fields_sidebar') {
        // Renders fields in user-selected order (orderedSidebarFieldDefs respects templateSelectedKeySet order)
        const rows: string[] = [];
        orderedSidebarFieldDefs.forEach((field: any, idx: number) => {
            const raw = data?.[field.key];
            if (raw === null || raw === undefined || raw === '') return;
            let displayValue = '';
            try { displayValue = String(formatPrintValue(field, raw) || '').trim(); } catch { displayValue = ''; }
            if (!displayValue) displayValue = localizePlainText(raw);
            if (!displayValue || displayValue === '-') return;
            // Move currency label from start to end (e.g. "تومان ۱,۰۰۰" → "۱,۰۰۰ تومان")
            for (const unit of ['تومان', 'ریال', 'IRR', 'IRT']) {
              if (displayValue.startsWith(unit + ' ') || displayValue.startsWith(unit + '\u00a0')) {
                displayValue = displayValue.slice(unit.length + 1).trim() + ' ' + unit;
                break;
              }
            }
            const label = getFieldLabelFa(field, { moduleId, fallback: field.key });
            const rowBg = idx % 2 === 0 ? 'background:rgba(var(--brand-50-rgb,239,246,255),0.55);' : 'background:#fff;';
            rows.push(`<div style="display:flex; justify-content:space-between; align-items:center; gap:2mm; padding:1.5mm 2mm; border-radius:4px; margin-bottom:0.8mm; ${rowBg}"><span style="font-size:7.5px; color:#64748b; white-space:nowrap; flex-shrink:0; max-width:45%; overflow:hidden; text-overflow:ellipsis;">${label}</span><span style="font-size:9px; color:#1e293b; font-weight:800; text-align:left; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayValue}</span></div>`);
          });
        return rows.join('');
      }
      if (path === 'system.catalog_code_fields') {
        // Returns only selected visible code fields for image overlay, with stable RTL label ordering.
        const parts: string[] = [];
        orderedCodeFieldDefs.forEach((field: any) => {
            const raw = data?.[field.key];
            if (!raw) return;
            const label = getFieldLabelFa(field, { moduleId, fallback: field.key });
            parts.push(
              `<span style="display:inline-flex; align-items:baseline; gap:4px; direction:rtl; unicode-bidi:isolate;"><span>${label}:</span><span style="direction:ltr; unicode-bidi:isolate; font-family:monospace;">${String(raw)}</span></span>`
            );
          });
        return parts.join(' <span style="color:rgba(255,255,255,0.38); margin:0 4px;">·</span> ');
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
      if (path === 'record.global_discount_type') {
        return invoiceSummary.globalDiscountType === 'percent' ? 'درصد' : 'مبلغ';
      }
      if (path === 'record.global_discount_value') {
        return invoiceSummary.globalDiscountType === 'percent'
          ? `${toPersianNumber(String(invoiceSummary.globalDiscountValue))}%`
          : formatPersianPrice(invoiceSummary.globalDiscountValue);
      }
      if (path === 'record.global_discount_amount') {
        return formatPersianPrice(invoiceSummary.globalDiscountAmount);
      }
      if (path === 'record.global_discount_display') {
        if (invoiceSummary.globalDiscountType === 'percent') {
          return `${toPersianNumber(String(invoiceSummary.globalDiscountValue))}%`;
        }
        return `${formatPersianPrice(invoiceSummary.globalDiscountValue)} ${resolvedCurrencyLabel}`.trim();
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
        return localizePlainText(resolvePrintAssigneeLabel(data, relationOptions || {}) || '');
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
          return buildPrintImageUrl(String(logo || ''), 'printLogo');
      }
      if (root === 'company' && nestedPath === 'currency_label') {
        return localizePlainText(source?.currency_label || source?.currency_code || 'ریال');
      }
      if (root === 'company' && nestedPath === 'company_name_en') {
        return String(source?.company_name_en || source?.trade_name || source?.company_full_name || source?.company_name || '').trim();
      }
      if (root === 'company' && nestedPath === 'slogan') {
        return String(source?.slogan || source?.trade_name || '').trim();
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

      if (root === 'record' && nestedPath === 'assignee_id') {
        return localizePlainText(resolvePrintAssigneeLabel(data, relationOptions || {}) || '');
      }

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
      if (root === 'customer' || root === 'supplier') {
        if (nestedPath === 'national_code') {
          return localizePlainText(resolveCounterpartyNationalCode(source));
        }
        if (nestedPath === 'national_id') {
          return localizePlainText(resolveCounterpartyNationalId(source));
        }
        if (nestedPath === 'national_identifier') {
          return localizePlainText(resolveCounterpartyNationalIdentifier(source));
        }
      }

      if (path === 'record.invoice_date' || path === 'record.updated_at' || path === 'record.created_at') {
        return toPersianNumber(safeJalaliFormat(raw, 'YYYY/MM/DD'));
      }
      if (path === 'company.logo_url' || nestedPath.endsWith('logo_url')) {
          const logo = source?.logo_url || source?.logo || source?.icon_url || source?.image_url || raw || '';
          return buildPrintImageUrl(String(logo || ''), 'printLogo');
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
      imageDisplayMode,
      recordCardImageUrl,
      recordHeroImageUrl,
      recordQrSvgMarkup,
      relationOptions,
      sellerInfo,
      linkedAttachmentCount,
      supplierInfo,
      canViewPrintFieldPath,
      isSystemFieldVisible,
      orderedSidebarFieldDefs,
      orderedCodeFieldDefs,
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
    // Rebuild the active preview from current record data and the latest
    // template definition. Removing only this template's transient selection
    // lets the normal preference/default resolver run again without touching
    // saved choices for other templates.
    setSelectedPrintFields((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, selectedTemplateId)) return prev;
      const next = { ...prev };
      delete next[selectedTemplateId];
      return next;
    });
    setForcedPrintPageCount(null);
    preparedPrintPageCountRef.current = null;
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }, [loadTemplates, selectedTemplateId]);

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
        const value = resolveVariableValue(key);
        return key === 'system.record_image' ? value : sanitizeOutboundDisplay(value);
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

    const normalizedHeaderHtml = stripLegacyPrintSignatureTokens(
      normalizeDynamicBlockTablesHtml(moduleId, selectedStoredTemplate.headerHtml)
    );
    const normalizedContentHtml = normalizeDynamicBlockTablesHtml(
      moduleId,
      isCatalogFullPageTemplateId(selectedStoredTemplate.id || '') && isSystemRecordTemplate
        ? buildCatalogFullPageContentHtml(moduleId, imageDisplayMode)
        : selectedStoredTemplate.contentHtml
    );
    const normalizedFooterHtml = stripLegacyPrintSignatureTokens(
      normalizeDynamicBlockTablesHtml(moduleId, selectedStoredTemplate.footerHtml)
    );

    return {
      headerHtml: localizeHtmlNumbers(normalizeRenderedImages(renderBlockTemplateHtml(fillTemplateHtml(normalizedHeaderHtml)))),
      contentHtml: annotatePrintFlowHtml(
        localizeHtmlNumbers(normalizeRenderedImages(renderBlockTemplateHtml(fillTemplateHtml(stripLegacyPrintSignatureTokens(normalizedContentHtml)))))
      ),
      footerHtml: localizeHtmlNumbers(normalizeRenderedImages(renderBlockTemplateHtml(fillTemplateHtml(normalizedFooterHtml)))),
    };
  }, [fillTemplateHtml, imageDisplayMode, isSystemRecordTemplate, localizeHtmlNumbers, moduleId, normalizeRenderedImages, renderBlockTemplateHtml, selectedStoredTemplate]);
  renderedCustomTemplateRef.current = renderedCustomTemplate;

  useEffect(() => {
    if (!selectedStoredTemplate) {
      preparedPrintPageCountRef.current = null;
      setMeasuredSectionHeights((prev) => (prev.header === 0 && prev.footer === 0 ? prev : { header: 0, footer: 0 }));
      setRenderedPageCount(1);
      renderedPageOffsetsRef.current = [0];
      setRenderedPageOffsets([0]);
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
      const isOrgLetterheadTemplate =
        selectedStoredTemplate.renderMode === 'org_letterhead' &&
        Boolean(selectedOrgLetterhead?.imageUrl);
      const pageBodyHeightPx = isOrgLetterheadTemplate
        ? (() => {
            const bodyItem = getPrintLetterheadEffectiveBodyItem(selectedOrgLetterhead, Boolean(printSignatureBandHtml));
            return bodyItem ? mmToPx(metrics.heightMm * (bodyItem.height / 100)) : mmToPx(metrics.heightMm);
          })()
        : (() => {
            const showHeader = selectedStoredTemplate.showHeader !== false;
            const rawFooterHtml = String(renderedCustomTemplate?.footerHtml || '').trim();
            const showFooter =
              printSignatureSectionHeightPx > 0 ||
              (selectedStoredTemplate.showFooter !== false &&
                (hasRenderablePrintFooterHtml(rawFooterHtml) || PRINT_PAGE_COUNTER_HEIGHT_PX > 0));
            const configuredHeaderHeight = Number(selectedStoredTemplate.headerHeight || 84);
            const configuredFooterHeight = Number(selectedStoredTemplate.footerHeight || 62);
            const headerHeight = getEffectiveMeasuredSectionHeightPx({
              enabled: showHeader,
              configuredHeightPx: configuredHeaderHeight,
              measuredNode: headerMeasureRef.current,
              fallbackHeightPx: measuredSectionHeights.header,
            });
            const measuredFooterHeight = getEffectiveMeasuredSectionHeightPx({
              enabled: showFooter,
              configuredHeightPx: configuredFooterHeight,
              measuredNode: footerMeasureRef.current,
              fallbackHeightPx: measuredSectionHeights.footer,
            });
            const footerHeight = showFooter
              ? measuredFooterHeight + printSignatureSectionHeightPx + PRINT_PAGE_COUNTER_HEIGHT_PX
              : 0;
            setMeasuredSectionHeights((prev) =>
              prev.header === headerHeight && prev.footer === measuredFooterHeight
                ? prev
                : { header: headerHeight, footer: measuredFooterHeight }
            );
            const pageMargins = getResolvedTemplatePageMargins(selectedStoredTemplate);
            const innerHeightMm = Math.max(40, metrics.heightMm - pageMargins.top - pageMargins.bottom);
            return getTemplatePageBodyHeightPx({
              innerHeightMm,
              showHeader,
              showFooter,
              headerHeight,
              footerHeight,
              signatureHeight: 0,
            });
          })();
      const pageBodyStepPx = getTemplatePageBodyStepPx(pageBodyHeightPx);

      const nextPageOffsets = getMeasuredPrintPageOffsets(bodyMeasure, pageBodyStepPx);
      renderedPageOffsetsRef.current = nextPageOffsets;
      preparedPrintPageCountRef.current = Math.max(1, nextPageOffsets.length);
      setRenderedPageOffsets((prev) =>
        prev.length === nextPageOffsets.length &&
        prev.every((value, index) => value === nextPageOffsets[index])
          ? prev
          : nextPageOffsets
      );
      const nextPageCount = Math.max(1, nextPageOffsets.length);
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
    let fontMeasurementCancelled = false;
    // System tables can use a font different from the surrounding template.
    // Re-measure after every currently pending font has settled, rather than
    // relying only on timing guesses that can leave the final line clipped.
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (!fontMeasurementCancelled) scheduleMeasure();
      });
    }

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
      fontMeasurementCancelled = true;
      window.removeEventListener('resize', scheduleMeasure);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      imageListeners.forEach(({ img, onLoad, onError }) => {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
      });
    };
  }, [
    measuredSectionHeights.footer,
    measuredSectionHeights.header,
    selectedStoredTemplate,
    renderedCustomTemplate?.contentHtml,
    renderedCustomTemplate?.footerHtml,
    renderedCustomTemplate?.headerHtml,
    printSignatureSectionHeightPx,
    printSignatureBandHtml,
    selectedOrgLetterhead?.imageUrl,
  ]);

  const buildPrintCard = useCallback((pageCountOverride?: number | null) => {
    const shouldRenderMeasurementNodes = pageCountOverride == null;
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
      const backgroundImageUrl = String(selectedStoredTemplate?.backgroundImageUrl || '').trim();
      const isOrgLetterheadTemplate =
        selectedStoredTemplate?.renderMode === 'org_letterhead' && Boolean(selectedOrgLetterhead?.imageUrl);
      if (isOrgLetterheadTemplate && selectedOrgLetterhead) {
        const bodyItem = getPrintLetterheadEffectiveBodyItem(selectedOrgLetterhead, Boolean(printSignatureBandHtml));
        const signaturesItem = getPrintLetterheadSignaturesItem(selectedOrgLetterhead);
        if (!bodyItem) return null;
        const bodyWidthMm = metrics.widthMm * (bodyItem.width / 100);
        const bodyHeightPx = mmToPx(metrics.heightMm * (bodyItem.height / 100));
        const pageBodyStepPx = getTemplatePageBodyStepPx(bodyHeightPx);
        const overlayHtml = buildPrintLetterheadOverlayHtml(selectedOrgLetterhead, {
          title: getModuleTitle(moduleId, 'singular') || moduleConfig?.titles?.fa || selectedStoredTemplate?.title,
          date: (() => {
            const rawValue =
              data?.date ||
              data?.document_date ||
              data?.invoice_date ||
              data?.issue_date ||
              data?.created_at ||
              '';
            const formatted = safeJalaliFormat(rawValue, 'YYYY/MM/DD');
            return String(formatted || '').trim() ? `تاریخ: ${formatted}` : '';
          })(),
          number: (() => {
            const rawValue = data?.system_code || data?.manual_code || data?.number || data?.document_number || '';
            return String(rawValue || '').trim() ? `شماره: ${rawValue}` : '';
          })(),
          attachment: Number(linkedAttachmentCount || 0) > 0 ? `پیوست: ${toPersianNumber(Number(linkedAttachmentCount || 0))}` : '',
          qrValue: printQrValue,
        });
        const measuredCurrentPageOffsets = bodyMeasureRef.current
          ? getMeasuredPrintPageOffsets(bodyMeasureRef.current, pageBodyStepPx)
          : [];
        const measuredCurrentPageCount = measuredCurrentPageOffsets.length;
        const effectivePageCount = Math.max(
          1,
          measuredCurrentPageCount,
          typeof pageCountOverride === 'number'
            ? pageCountOverride
            : printMode && forcedPrintPageCount
              ? forcedPrintPageCount
              : renderedPageCount
        );
        const effectivePageOffsets = measuredCurrentPageOffsets.length > 0
          ? measuredCurrentPageOffsets
          : renderedPageOffsetsRef.current.length > 0
            ? renderedPageOffsetsRef.current
            : renderedPageOffsets;
        const pageStartOffsets = Array.from({ length: effectivePageCount }, (_value, index) =>
          effectivePageOffsets[index] ?? index * pageBodyStepPx
        );

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
          },
          shouldRenderMeasurementNodes
            ? React.createElement(
                'div',
                {
                  style: {
                    position: 'absolute',
                    insetInlineStart: -99999,
                    top: 0,
                    width: `${bodyWidthMm}mm`,
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
                }),
              )
            : null,
          ...pageStartOffsets.map((pageStartOffset, pageIndex) => {
            const nextPageStartOffset = pageStartOffsets[pageIndex + 1];
            const effectiveBodyStepPx = nextPageStartOffset !== undefined
              ? Math.min(pageBodyStepPx, Math.max(1, nextPageStartOffset - pageStartOffset))
              : pageBodyStepPx;
            const bodyViewportHeightCss = toCssMm(getPrintBodyViewportHeightPx(bodyHeightPx, effectiveBodyStepPx));

            return React.createElement(
              'div',
              {
                key: `print-letterhead-page-${pageIndex + 1}`,
                className: 'print-template-page',
                style: {
                  position: 'relative',
                  width: `${metrics.widthMm}mm`,
                  height: `${metrics.heightMm}mm`,
                  minHeight: `${metrics.heightMm}mm`,
                  background: '#fff',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  isolation: 'isolate',
                  pageBreakAfter: pageIndex < effectivePageCount - 1 ? 'always' : 'auto',
                  breakAfter: pageIndex < effectivePageCount - 1 ? 'page' : 'auto',
                },
              },
              React.createElement('img', {
                src: selectedOrgLetterhead.imageUrl || '',
                alt: selectedOrgLetterhead.title,
                style: {
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'fill',
                  zIndex: 0,
                  pointerEvents: 'none',
                  userSelect: 'none',
                },
              }),
              overlayHtml
                ? React.createElement('div', {
                    style: { position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' },
                    dangerouslySetInnerHTML: { __html: overlayHtml },
                  })
                : null,
              React.createElement(
                'div',
                {
                  className: 'print-template-body',
                  style: {
                    ...toPercentStyle(bodyItem),
                    zIndex: 4,
                    overflow: 'hidden',
                    direction: 'rtl',
                    display: 'flex',
                    flexDirection: 'column',
                  },
                },
                React.createElement(
                  'div',
                  {
                    className: 'print-template-body-viewport',
                    style: {
                      width: '100%',
                      flex: `0 0 ${bodyViewportHeightCss}`,
                      height: bodyViewportHeightCss,
                      maxHeight: bodyViewportHeightCss,
                      minHeight: 0,
                      overflow: 'hidden',
                      position: 'relative',
                      boxSizing: 'border-box',
                    },
                  },
                  React.createElement(
                    'div',
                    {
                      className: 'print-template-body-segment',
                      style: { width: '100%', boxSizing: 'border-box', transform: `translateY(-${pageStartOffset}px)` },
                    },
                    React.createElement('div', {
                      className: 'print-template-body-inner',
                      style: { padding: PRINT_SECTION_CONTENT_PADDING, boxSizing: 'border-box' },
                      dangerouslySetInnerHTML: { __html: renderedCustomTemplate?.contentHtml || '' },
                    }),
                  ),
                ),
                React.createElement('div', {
                  'aria-hidden': true,
                  className: 'print-template-body-page-remainder',
                  style: {
                    flex: '1 1 auto',
                    minHeight: 0,
                    background: '#fff',
                    pointerEvents: 'none',
                  },
                }),
              ),
              signaturesItem && printSignatureBandHtml
                ? React.createElement('div', {
                    style: {
                      ...toPercentStyle(signaturesItem),
                      zIndex: 5,
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    },
                    dangerouslySetInnerHTML: { __html: printSignatureBandHtml },
                  })
                : null,
              React.createElement('div', {
                style: { position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none' },
                dangerouslySetInnerHTML: { __html: buildPrintLetterheadPageCounterHtml(pageIndex, effectivePageCount) },
              }),
            );
          }),
        );
      }
      const showHeader = selectedStoredTemplate?.showHeader !== false;
      const hasSignatureBand = Boolean(printSignatureBandHtml);
      const rawFooterHtml = String(renderedCustomTemplate?.footerHtml || '').trim();
      const hasFooterHtml = hasRenderablePrintFooterHtml(rawFooterHtml);
      const showFooter =
        hasSignatureBand ||
        (selectedStoredTemplate?.showFooter !== false &&
          (hasFooterHtml || PRINT_PAGE_COUNTER_HEIGHT_PX > 0));
      const configuredHeaderHeight = Number(selectedStoredTemplate?.headerHeight || 84);
      const configuredFooterHeight = Number(selectedStoredTemplate?.footerHeight || 62);
      const signatureHeightPx = hasSignatureBand ? printSignatureSectionHeightPx : 0;
      const signatureHeightCss = toCssMm(signatureHeightPx);
      const headerHeight = getEffectiveMeasuredSectionHeightPx({
        enabled: showHeader,
        configuredHeightPx: configuredHeaderHeight,
        measuredNode: headerMeasureRef.current,
        fallbackHeightPx: measuredSectionHeights.header,
      });
      const measuredFooterHeight = getEffectiveMeasuredSectionHeightPx({
        enabled: showFooter,
        configuredHeightPx: configuredFooterHeight,
        measuredNode: footerMeasureRef.current,
        fallbackHeightPx: measuredSectionHeights.footer,
      });
      const footerHeight = showFooter
        ? measuredFooterHeight + signatureHeightPx + PRINT_PAGE_COUNTER_HEIGHT_PX
        : 0;
      const headerHeightCss = toCssMm(headerHeight);
      const footerHeightCss = toCssMm(footerHeight);
      const pageSize = `${selectedStoredTemplate?.paperSize || 'A4'} ${selectedStoredTemplate?.orientation === 'landscape' ? 'landscape' : 'portrait'}`;
      const pageMargins = getResolvedTemplatePageMargins(selectedStoredTemplate);
      const innerWidthMm = Math.max(20, metrics.widthMm - pageMargins.left - pageMargins.right);
      const innerHeightMm = Math.max(40, metrics.heightMm - pageMargins.top - pageMargins.bottom);
      const pageBodyHeightPx = getTemplatePageBodyHeightPx({
        innerHeightMm,
        showHeader,
        showFooter,
        headerHeight,
        footerHeight,
        signatureHeight: 0,
      });
      const pageBodyStepPx = getTemplatePageBodyStepPx(pageBodyHeightPx);
      const isCatalogFullPageTemplate = isCatalogFullPageTemplateId(selectedStoredTemplate?.id || '');
      const sectionPadding = isCatalogFullPageTemplate ? '0' : PRINT_SECTION_CONTENT_PADDING;

      if (isCatalogFullPageTemplate) {
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
            backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined,
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: backgroundImageUrl ? 'contain' : undefined,
          },
          'data-page-size': pageSize,
          'data-native-single-page': 'true',
          },
          React.createElement(
            'div',
            {
              className: 'print-template-page',
              style: {
                position: 'relative',
                width: `${metrics.widthMm}mm`,
                height: `${metrics.heightMm}mm`,
                minHeight: `${metrics.heightMm}mm`,
                maxHeight: `${metrics.heightMm}mm`,
                background: '#fff',
                backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: backgroundImageUrl ? 'contain' : undefined,
                boxSizing: 'border-box',
                overflow: 'hidden',
                display: 'block',
                direction: 'rtl',
                padding: `${pageMargins.top}mm ${pageMargins.right}mm ${pageMargins.bottom}mm ${pageMargins.left}mm`,
                '--print-native-page-height': `${metrics.heightMm}mm`,
              } as unknown as React.CSSProperties,
              dangerouslySetInnerHTML: { __html: renderedCustomTemplate?.contentHtml || '' },
            }
          ),
          hasSignatureBand
            ? React.createElement('div', {
                style: {
                  position: 'absolute',
                  insetInlineStart: `${pageMargins.left}mm`,
                  insetInlineEnd: `${pageMargins.right}mm`,
                  bottom: `${pageMargins.bottom}mm`,
                },
                dangerouslySetInnerHTML: { __html: printSignatureBandHtml },
              })
            : null
        );
      }

      const measuredCurrentPageOffsets = bodyMeasureRef.current
        ? getMeasuredPrintPageOffsets(bodyMeasureRef.current, pageBodyStepPx)
        : [];
      const measuredCurrentPageCount = measuredCurrentPageOffsets.length;
      const effectivePageCount = Math.max(
        1,
        measuredCurrentPageCount,
        typeof pageCountOverride === 'number'
          ? pageCountOverride
          : printMode && forcedPrintPageCount
            ? forcedPrintPageCount
            : renderedPageCount
      );
      const effectivePageOffsets = measuredCurrentPageOffsets.length > 0
        ? measuredCurrentPageOffsets
        : renderedPageOffsetsRef.current.length > 0
          ? renderedPageOffsetsRef.current
          : renderedPageOffsets;
      const pageStartOffsets = Array.from({ length: effectivePageCount }, (_value, index) =>
        effectivePageOffsets[index] ?? index * pageBodyStepPx
      );

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
            backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined,
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: backgroundImageUrl ? 'contain' : undefined,
          },
          'data-page-size': pageSize,
          'data-native-single-page': isCatalogFullPageTemplate ? 'true' : 'false',
        },
          shouldRenderMeasurementNodes
            ? React.createElement(
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
                showHeader
                  ? React.createElement('div', {
                      ref: headerMeasureRef,
                      className: 'print-template-header-inner print-template-header-measure',
                      style: {
                        width: '100%',
                        padding: sectionPadding,
                        boxSizing: 'border-box',
                        overflow: 'visible',
                      },
                      dangerouslySetInnerHTML: { __html: renderedCustomTemplate?.headerHtml || '' },
                    })
                  : null,
                showFooter
                  ? React.createElement('div', {
                      ref: footerMeasureRef,
                      className: 'print-template-footer-inner print-template-footer-measure',
                      style: {
                        width: '100%',
                        padding: sectionPadding,
                        boxSizing: 'border-box',
                        overflow: 'visible',
                      },
                      dangerouslySetInnerHTML: { __html: rawFooterHtml },
                    })
                  : null,
                React.createElement('div', {
                  ref: bodyMeasureRef,
                  className: 'print-template-body-measure',
                  style: { padding: sectionPadding, boxSizing: 'border-box' },
                  dangerouslySetInnerHTML: { __html: renderedCustomTemplate?.contentHtml || '' },
                })
              )
            : null,
        ...pageStartOffsets.map((pageStartOffset, pageIndex) => {
          // Per-page effective body step: exactly the number of content pixels
          // this page should display. For all pages except the last this equals
          // (nextPageStartOffset - pageStartOffset), so the guard begins right
          // where the next page begins - no overlap, no partial lines.
          const pageBodyHeightCss = toCssMm(pageBodyHeightPx);
          const pageCounterHeightCss = toCssMm(PRINT_PAGE_COUNTER_HEIGHT_PX);
          const nextPageStartOffset = pageStartOffsets[pageIndex + 1];
          const effectiveBodyStepPx = nextPageStartOffset !== undefined
            ? Math.min(pageBodyStepPx, Math.max(1, nextPageStartOffset - pageStartOffset))
            : pageBodyStepPx;
          const bodyViewportHeightCss = toCssMm(getPrintBodyViewportHeightPx(pageBodyHeightPx, effectiveBodyStepPx));

          return React.createElement(
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
                backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: backgroundImageUrl ? 'contain' : undefined,
                boxSizing: 'border-box',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
                  direction: 'rtl',
                  padding: `${pageMargins.top}mm ${pageMargins.right}mm ${pageMargins.bottom}mm ${pageMargins.left}mm`,
                  isolation: 'isolate',
                  pageBreakAfter: pageIndex < effectivePageCount - 1 ? 'always' : 'auto',
                  breakAfter: pageIndex < effectivePageCount - 1 ? 'page' : 'auto',
                breakInside: 'avoid',
                pageBreakInside: 'avoid',
                '--print-header-height': showHeader ? headerHeightCss : '0px',
                '--print-footer-height': showFooter ? footerHeightCss : '0px',
                '--print-signature-height': hasSignatureBand ? signatureHeightCss : '0px',
                '--print-margin-top': `${pageMargins.top}mm`,
                '--print-margin-bottom': `${pageMargins.bottom}mm`,
                '--print-margin-left': `${pageMargins.left}mm`,
                '--print-margin-right': `${pageMargins.right}mm`,
                '--print-native-page-height': `${metrics.heightMm}mm`,
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
                      position: 'relative',
                      zIndex: 1,
                    },
                  },
                  React.createElement('div', {
                    className: 'print-template-header-inner',
                    style: { padding: sectionPadding, boxSizing: 'border-box', minHeight: 0, maxHeight: '100%', overflow: 'hidden' },
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
                  zIndex: 2,
                  background: '#fff',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                },
              },
              React.createElement(
                'div',
                {
                  className: 'print-template-body-viewport',
                  style: {
                    width: '100%',
                    flex: `0 0 ${bodyViewportHeightCss}`,
                    height: bodyViewportHeightCss,
                    maxHeight: bodyViewportHeightCss,
                    minHeight: 0,
                    overflow: 'hidden',
                    position: 'relative',
                    boxSizing: 'border-box',
                  },
                },
                React.createElement(
                  'div',
                  {
                    className: 'print-template-body-segment',
                    style: { width: '100%', boxSizing: 'border-box', transform: `translateY(-${pageStartOffset}px)` },
                  },
                  React.createElement('div', {
                    className: 'print-template-body-inner',
                    style: { padding: sectionPadding, boxSizing: 'border-box' },
                    dangerouslySetInnerHTML: { __html: renderedCustomTemplate?.contentHtml || '' },
                  })
                )
              ),
              React.createElement('div', {
                'aria-hidden': true,
                className: 'print-template-body-page-remainder',
                style: {
                  flex: '1 1 auto',
                  minHeight: 0,
                  background: '#fff',
                  pointerEvents: 'none',
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
                      position: 'relative',
                      zIndex: 1,
                    },
                  },
                  React.createElement(
                    'div',
                    {
                      className: 'print-template-footer-stack',
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        width: '100%',
                        boxSizing: 'border-box',
                        paddingBottom: effectivePageCount > 1 ? pageCounterHeightCss : 0,
                      },
                    },
                    hasSignatureBand
                      ? React.createElement('div', {
                          className: 'print-template-signatures',
                          style: {
                            width: '100%',
                            flex: `0 0 ${signatureHeightCss}`,
                            minHeight: signatureHeightCss,
                            height: signatureHeightCss,
                            maxHeight: signatureHeightCss,
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'center',
                          },
                          dangerouslySetInnerHTML: { __html: printSignatureBandHtml },
                        })
                      : null,
                    hasFooterHtml
                      ? React.createElement('div', {
                          className: 'print-template-footer-inner',
                          style: { padding: sectionPadding, boxSizing: 'border-box', minHeight: 0, maxHeight: '100%', overflow: 'hidden' },
                          dangerouslySetInnerHTML: { __html: rawFooterHtml },
                        })
                      : null
                  ),
                  effectivePageCount > 1
                    ? React.createElement(
                        'div',
                        {
                          className: 'print-template-page-counter',
                          style: {
                            position: 'absolute',
                            insetInlineStart: 0,
                            insetInlineEnd: 0,
                            bottom: 0,
                            height: pageCounterHeightCss,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            padding: '0 10px',
                            boxSizing: 'border-box',
                            fontSize: 10,
                            color: '#64748b',
                            textAlign: 'left',
                            pointerEvents: 'none',
                            zIndex: 2,
                          },
                        },
                        `صفحه ${toPersianNumber(`${pageIndex + 1} از ${effectivePageCount}`)}`
                      )
                    : null
                )
              : null
          );
        })
      );
    }

    let systemTemplateNode: React.ReactNode = null;
    switch (selectedTemplateId) {
      case 'invoice_sales_official':
      case 'invoice_sales_simple':
        systemTemplateNode = React.createElement(InvoiceCard, {
          data: dataWithResolvedPrintLabels,
          formatPersianPrice,
          toPersianNumber,
          safeJalaliFormat,
          relationOptions,
          templateId: selectedTemplateId,
          customer: customerInfo,
          seller: sellerInfo,
        });
        break;
      case 'product_label':
        systemTemplateNode = React.createElement(ProductLabel, {
          title: activeTemplate?.title || '',
          subtitle: moduleConfig?.titles.fa || '',
          qrValue: printQrValue,
          fields: fieldsToDisplay,
          formatPrintValue,
        });
        break;
      case 'production_passport':
        systemTemplateNode = React.createElement(ProductionPassport, {
          title: activeTemplate?.title || '',
          subtitle: moduleConfig?.titles.fa || '',
          qrValue: printQrValue,
          fields: fieldsToDisplay,
          formatPrintValue,
        });
        break;
      default:
        systemTemplateNode = null;
        break;
    }

    if (!systemTemplateNode || !printSignatureBandHtml) {
      return systemTemplateNode;
    }

    return React.createElement(
      'div',
      {
        style: {
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        },
      },
      React.createElement('div', { style: { flex: '1 1 auto' } }, systemTemplateNode),
      React.createElement('div', {
        style: { width: '100%' },
        dangerouslySetInnerHTML: { __html: printSignatureBandHtml },
      })
    );
  }, [
    selectedTemplateId,
    selectedStoredTemplate?.paperSize,
    selectedStoredTemplate?.orientation,
    selectedStoredTemplate?.backgroundImageUrl,
    selectedStoredTemplate?.renderMode,
    renderedCustomTemplate,
    forcedPrintPageCount,
    printMode,
    renderedPageOffsets,
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
    linkedAttachmentCount,
    printQrValue,
    printSignatureBandHtml,
    printSignatureSectionHeightPx,
    selectedOrgLetterhead,
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
        const companyReq = loadScopedCompanySettings(supabase);
        const assigneeDirectoryReq = fetchAssigneeDirectory(supabase).catch(() => null);
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
          assigneeDirectoryData,
          { count: filesCount, error: filesCountError },
          { data: customerData, error: customerError },
          { data: supplierData, error: supplierError },
        ] = await Promise.all([
          companyReq as any,
          assigneeDirectoryReq as any,
          filesCountReq as any,
          customerReq as any,
          supplierReq as any,
        ]);
        if (!isMounted) return;
        if (!companyError) setSellerInfo(companyData || null);
        if (assigneeDirectoryData) setAssigneeDirectory(assigneeDirectoryData);
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

  const printSignatureQuickAddOptions = useMemo(
    () => getPrintSignatureQuickAddOptions({ canUseCeoSignature, companyInfo: sellerInfo }),
    [canUseCeoSignature, sellerInfo?.manager_title]
  );

  return {
    isPrintModalOpen,
    selectedTemplateId,
    printMode,
    selectedPrintFields,
    imageDisplayMode,
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
    handleChangeImageDisplayMode,
    handleSavePrintFields,
    printSignatureStates,
    printSignatureQuickAddOptions,
    signatureOptionsByRow,
    handleAddPrintSignatureRow,
    handleRemovePrintSignatureRow,
    handleMovePrintSignatureRow,
    handleTogglePrintSignatureEnabled,
    handleTogglePrintSignatureAutomatic,
    handleChangePrintSignatureName,
    handleChangePrintSignatureSubtitle,
    handleChangePrintSignatureSignerModule,
    handleChangePrintSignatureSignerId,
    loadSignatureSignerOptions,
    refreshTemplates,
    previewMeta,
    printableFieldsForTemplate,
    isSelectedTemplateSystem,
    savingPrintFields,
    allowFieldSelectionTab: isSystemRecordTemplate || templateUsesSystemBlocks || templateUsesSystemFieldCollections,
    showImageDisplayModeControl,
    renderPrintCard,
  };
};
