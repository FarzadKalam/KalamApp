import React, { useEffect, useRef, useState } from 'react';
import { Table, Button, Space, App, Empty, Typography, Spin, Select, InputNumber, Popover, Input, Modal, Checkbox } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, CloseOutlined, CloseCircleOutlined, RightOutlined, CopyOutlined, FileTextOutlined, EnvironmentOutlined, CalendarOutlined, AppstoreOutlined, CheckOutlined, EyeOutlined, DownloadOutlined, ShareAltOutlined, PrinterOutlined, UpOutlined, DownOutlined, ClockCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { FieldType, ModuleField, RowCalculationType } from '../types';
import { calculateRow } from '../utils/calculations';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import { convertArea } from '../utils/unitConversions';
import { applyInventoryDeltas, syncMultipleProductsStock } from '../utils/inventoryTransactions';
import SmartFieldRenderer from './SmartFieldRenderer';
import SmartTableRenderer from './SmartTableRenderer';
import QrScanPopover from './QrScanPopover';
import { dedupeOptionsByLabel } from './editableTable/tableUtils';
import { insertChangelog } from './editableTable/changelogHelpers';
import { getInvoiceAmounts } from './editableTable/invoiceHelpers';
import { fetchShelfOptions, updateProductStock } from './editableTable/inventoryHelpers';
import { buildProductFilters, runProductsQuery } from './editableTable/productionOrderHelpers';
import { MODULES } from '../moduleRegistry';
import { syncCustomerLevelsByInvoiceCustomers } from '../utils/customerLeveling';
import { syncInvoiceAccountingEntries } from '../utils/accountingAutoPosting';
import { hasIssuedInvoiceAccountingEntries, shouldAutoSyncInvoiceAccounting } from '../utils/invoiceAccountingPolicy';
import { useCurrencyConfig } from '../utils/currency';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { normalizeCashBankPaymentType } from '../utils/cashBankPaymentType';
import { fetchDynamicOptionsByCategory } from '../utils/referenceData';
import { runWorkflowsForEvent } from '../utils/workflowRuntime';
import { syncDefaultPriceListItemsToProducts } from '../utils/priceListDefaults';
import { getCachedAuthUser } from '../utils/sessionCache';
import { syncRecordTags } from '../utils/recordTags';
import { runWriteWithCompatiblePayload } from '../utils/writeCompat';
import { transformModulePayloadForSave } from '../utils/moduleFormRuntime';
import { resolveOperationalPaymentRowKey } from '../utils/operationalCashBankSources';
import {
  buildSalesPackageDescription,
  calculateSalesPackageDiscountTotal,
  calculateSalesPackageGrossTotal,
  calculateSalesPackageTotal,
  findPriceListItemByProduct,
  normalizeSalesPackageItems,
} from '../utils/salesCatalog';
import PersianDatePicker from './PersianDatePicker';
import { getImplicitCreateDefaultValue, getTodayLocalDateValue } from '../utils/defaultValues';
import ResilientImage from './common/ResilientImage';
import InvoicePaymentAllocationModal from './invoices/InvoicePaymentAllocationModal';
import {
  buildInvoicePaymentOverflowPlan,
  InvoiceAllocationAmount,
  InvoicePaymentOverflowPlan,
} from '../utils/invoicePaymentAllocation';
import { applyInvoicePaymentAllocation } from '../utils/invoicePaymentAllocationRuntime';

const { Text } = Typography;

const normalizeDigitsToEnglish = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
};

const normalizeNumericString = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  const englishDigits = normalizeDigitsToEnglish(raw)
    .replace(/[\u066C\u060C]/g, ',')
    .replace(/\s+/g, '')
    .replace(/,/g, '');
  const sign = englishDigits.startsWith('-') ? '-' : '';
  const unsigned = englishDigits.replace(/-/g, '');
  const cleaned = unsigned.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const integerPart = parts[0] ?? '';
  const decimalPart = parts.slice(1).join('');
  const hasDot = cleaned.includes('.');
  return `${sign}${integerPart}${hasDot ? `.${decimalPart}` : ''}`;
};

const toSafeNumber = (raw: any): number => {
  const normalized = normalizeNumericString(raw);
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return 0;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeRowTags = (value: any) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch {
        return [];
      }
    }
  }
  return [];
};

const roundMoney = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
};

const normalizeInvoiceGlobalDiscountType = (value: any): 'percent' | 'amount' =>
  String(value || '').trim().toLowerCase() === 'percent' ? 'percent' : 'amount';

const resolveInvoiceGlobalDiscountAmount = (
  subtotal: number,
  type: 'percent' | 'amount',
  rawValue: any
) => {
  const safeSubtotal = Math.max(0, roundMoney(subtotal));
  if (safeSubtotal <= 0) return 0;
  const value = Math.max(0, toSafeNumber(rawValue));
  const rawAmount = type === 'percent'
    ? (safeSubtotal * Math.min(100, value)) / 100
    : value;
  return Math.min(safeSubtotal, roundMoney(rawAmount));
};

const calculatePriceWithProfit = (buyPrice: any, profitPercentage: any) => {
  const base = toSafeNumber(buyPrice);
  const profit = toSafeNumber(profitPercentage);
  return roundMoney(base + (base * profit / 100));
};

const calculateProfitPercentage = (buyPrice: any, sellPrice: any) => {
  const base = toSafeNumber(buyPrice);
  if (base <= 0) return 0;
  return roundMoney(((toSafeNumber(sellPrice) - base) / base) * 100);
};

const CHEQUE_STATUS_LABELS: Record<string, string> = {
  new: 'جدید',
  in_bank: 'در بانک',
  cleared: 'وصول شده',
  bounced: 'برگشتی',
  returned: 'عودت شده',
  canceled: 'ابطال شده',
};

const isServiceProduct = (productType: any) => String(productType || '').trim().toLowerCase() === 'service';
const isManualSubUnit = (subUnit: any) => String(subUnit || '').trim() === 'عدد';
const isAbortLikeError = (error: any) =>
  String(error?.name || '').toLowerCase() === 'aborterror'
  || String(error?.message || '').toLowerCase().includes('signal is aborted');

interface EditableTableProps {
  block: any;
  initialData: any[];
  moduleId?: string;
  recordId?: string;
  parentValues?: Record<string, any> | null;
  relationOptions: Record<string, any[]>;
  onSaveSuccess?: (newData: any[]) => void;
  onChange?: (newData: any[]) => void;
  mode?: 'db' | 'local' | 'external_view';
  dynamicOptions?: Record<string, any[]>;
  externalSource?: { moduleId?: string; recordId?: string; column?: string };
  populateSource?: { moduleId?: string; recordId?: string; column?: string };
  canEditModule?: boolean;
  canViewField?: (fieldKey: string) => boolean;
  isMobile?: boolean;
  readOnly?: boolean;
  focusRowKey?: string | null;
  invoiceGlobalDiscountType?: string | null;
  invoiceGlobalDiscountValue?: number | string | null;
  onInvoiceGlobalDiscountChange?: (value: { type: 'percent' | 'amount'; amount: number }) => void;
}

type PendingInvoicePaymentAllocation = {
  plan: InvoicePaymentOverflowPlan;
  allocationGroupKey: string;
  partyId: string;
};

const EditableTable: React.FC<EditableTableProps> = ({
  block,
  initialData,
  moduleId,
  recordId,
  parentValues,
  relationOptions,
  onSaveSuccess,
  onChange,
  mode = 'db',
  dynamicOptions = {},
  externalSource,
  populateSource,
  canEditModule,
  canViewField,
  readOnly,
  focusRowKey,
  invoiceGlobalDiscountType,
  invoiceGlobalDiscountValue,
  onInvoiceGlobalDiscountChange,
}) => {
  const { message: msg } = App.useApp();
  const isReadOnly = block?.readonly === true || readOnly === true || canEditModule === false;
  const isProductInventory = moduleId === 'products' && block?.id === 'product_inventory';
  const isProductStockMovements = moduleId === 'products' && block?.id === 'product_stock_movements';
  const isShelfInventory = moduleId === 'shelves' && block?.id === 'shelf_inventory';
  const isProductionOrder = moduleId === 'production_orders';
  const isBomItemBlock = ['items_leather', 'items_lining', 'items_fitting', 'items_accessory'].includes(block?.id);
  const isInvoiceItems = moduleId === 'invoices' && block?.id === 'invoiceItems';
  const isPurchaseInvoiceItems = moduleId === 'purchase_invoices' && block?.id === 'invoiceItems';
  const isAnyInvoiceItems = isInvoiceItems || isPurchaseInvoiceItems;
  const isInvoicePayments = moduleId === 'invoices' && block?.id === 'payments';
  const isPurchaseInvoicePayments = moduleId === 'purchase_invoices' && block?.id === 'payments';
  const isExpenseItems = moduleId === 'expense_documents' && block?.id === 'items';
  const isExpensePayments = moduleId === 'expense_documents' && block?.id === 'payments';
  const isEmployeeAdvancePayments = moduleId === 'employee_advances' && block?.id === 'payments';
  const isPayrollPayments = moduleId === 'payroll_slips' && block?.id === 'payments';
  const isAnyInvoicePayments = isInvoicePayments || isPurchaseInvoicePayments;
  const isAnyDocumentPayments = isAnyInvoicePayments || isExpensePayments;
  const isOperationalPayments = isAnyDocumentPayments || isEmployeeAdvancePayments || isPayrollPayments;
  const useStackedInvoiceRows = isAnyInvoicePayments;
  const isShelfInventoryBlock = block?.id === 'product_inventory' || block?.id === 'shelf_inventory';
  const isPriceListItems = moduleId === 'price_lists' && block?.id === 'items';
  const isSalesPackageItems = moduleId === 'product_bundles' && block?.id === 'products';
  const isBulkProductsTable = moduleId === 'products' && block?.id === 'bulk_products_table';
  const isCatalogProductItems = isPriceListItems || isSalesPackageItems;

  const [isEditing, setIsEditing] = useState(mode === 'local' && !isReadOnly);
  const [data, setData] = useState<any[]>(() => (Array.isArray(initialData) ? initialData : []));
  const [tempData, setTempData] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<Record<string, { loading: boolean; data: any[] }>>({});
  const [shelfOptionsByRow, setShelfOptionsByRow] = useState<Record<string, { loading: boolean; options: { label: string; value: string }[] }>>({});
  const [localDynamicOptions, setLocalDynamicOptions] = useState<Record<string, any[]>>({});
  const [invoicePriceLists, setInvoicePriceLists] = useState<Array<{ id: string; name: string; items: any[] }>>([]);
  const [priceRefreshLoading, setPriceRefreshLoading] = useState(false);
  const [eligibleReceivedChequeOptions, setEligibleReceivedChequeOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [rowReloadVersion, setRowReloadVersion] = useState<Record<string, number>>({});
  const [notePopoverRowKey, setNotePopoverRowKey] = useState<string | null>(null);
  const [deliveryTimePopoverRowKey, setDeliveryTimePopoverRowKey] = useState<string | null>(null);
  const [shelfPopoverRowKey, setShelfPopoverRowKey] = useState<string | null>(null);
  const [dimensionsPopoverRowKey, setDimensionsPopoverRowKey] = useState<string | null>(null);
  const [calendarPopoverRowKey, setCalendarPopoverRowKey] = useState<string | null>(null);
  const [previewAttachmentUrl, setPreviewAttachmentUrl] = useState<string | null>(null);
  const [currentInvoiceGlobalDiscountType, setCurrentInvoiceGlobalDiscountType] = useState<'percent' | 'amount'>(
    () => normalizeInvoiceGlobalDiscountType(invoiceGlobalDiscountType)
  );
  const [currentInvoiceGlobalDiscountValue, setCurrentInvoiceGlobalDiscountValue] = useState<number>(
    () => Math.max(0, toSafeNumber(invoiceGlobalDiscountValue))
  );
  const shelfAutoLoadRef = useRef<Record<string, string>>({});
  const dataRef = useRef<any[]>(Array.isArray(initialData) ? initialData : []);
  const tempDataRef = useRef<any[]>([]);
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [currentProductUnits, setCurrentProductUnits] = useState<{ mainUnit: string | null; subUnit: string | null }>({ mainUnit: null, subUnit: null });
  const [currentProductStock, setCurrentProductStock] = useState<number>(0);
  const [highlightedFocusRowKey, setHighlightedFocusRowKey] = useState<string | null>(null);
  const [pendingInvoicePaymentAllocation, setPendingInvoicePaymentAllocation] =
    useState<PendingInvoicePaymentAllocation | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const empty = !Array.isArray(initialData) || initialData.length === 0;
    if (isAnyInvoiceItems || isShelfInventoryBlock || isProductStockMovements) return false;
    return empty;
  });
  const [userToggledCollapse, setUserToggledCollapse] = useState(false);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    tempDataRef.current = tempData;
  }, [tempData]);

  useEffect(() => {
    if (userToggledCollapse) return;
    const source = isEditing ? tempData : data;
    const empty = !Array.isArray(source) || source.length === 0;
    if (isAnyInvoiceItems || isShelfInventoryBlock || isProductStockMovements) {
      setIsCollapsed(false);
      return;
    }
    setIsCollapsed(empty);
  }, [data, tempData, isEditing, isAnyInvoiceItems, isShelfInventoryBlock, isProductStockMovements, userToggledCollapse]);

  useEffect(() => {
    const updateViewportFlag = () => setIsMobileViewport(window.innerWidth < 768);
    updateViewportFlag();
    window.addEventListener('resize', updateViewportFlag);
    return () => window.removeEventListener('resize', updateViewportFlag);
  }, []);

  useEffect(() => {
    if (!isAnyInvoiceItems) return;
    setCurrentInvoiceGlobalDiscountType(normalizeInvoiceGlobalDiscountType(invoiceGlobalDiscountType));
    setCurrentInvoiceGlobalDiscountValue(Math.max(0, toSafeNumber(invoiceGlobalDiscountValue)));
  }, [invoiceGlobalDiscountType, invoiceGlobalDiscountValue, isAnyInvoiceItems]);

  const productsModule = MODULES['products'];
  const { label: currencyLabel } = useCurrencyConfig();
  const editableAfterSelection = new Set(['buy_price', 'length', 'width', 'usage', 'waste_rate', 'main_unit']);
  const productFieldMap: Record<string, string> = {
    leather_colors: 'colors',
    fitting_colors: 'colors',
    lining_width: 'lining_dims',
  };
  const createLocalRowKey = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `row_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  };
  const ensureStableTableRowKey = (record: any) => {
    const directKey = getRowKey(record);
    if (directKey) return String(directKey);
    const candidates = [
      record?.row_key,
      record?.id,
      record?._cash_bank_operation_id,
      record?.asset_id,
      record?.entry_id,
      record?.system_code,
      record?.file_url,
      record?.created_at,
    ];
    for (const candidate of candidates) {
      const normalized = String(candidate || '').trim();
      if (!normalized) continue;
      const resolvedKey = `${block.id || 'row'}_${normalized}`;
      if (record && typeof record === 'object' && !String(record?.key || '').trim()) {
        record.key = resolvedKey;
      }
      return resolvedKey;
    }
    const generatedKey = createLocalRowKey();
    if (record && typeof record === 'object') {
      record.key = generatedKey;
    }
    return generatedKey;
  };
  const shouldDisableInvoicePaymentAccount = (row: any) => {
    if (!isInvoicePayments) return false;
    const paymentType = normalizeCashBankPaymentType(row?.payment_type) || '';
    return paymentType === 'barter' || paymentType === 'credit';
  };
  const sanitizeOperationalPaymentRow = (row: any) => {
    if (!row || typeof row !== 'object' || !isOperationalPayments) return row;
    const nextRow = { ...row };
    if (shouldDisableInvoicePaymentAccount(nextRow)) {
      nextRow.target_account = null;
    }
    return nextRow;
  };
  const ensurePaymentRowKey = (row: any) => {
    const existingKey = resolveOperationalPaymentRowKey(row);
    if (existingKey) return existingKey;
    return createLocalRowKey();
  };
  const normalizePaymentRows = (rows: any[]) => (
    (Array.isArray(rows) ? rows : []).map((row: any) => {
      if (!row || typeof row !== 'object' || !isOperationalPayments) return row;
      const normalizedRow = sanitizeOperationalPaymentRow(row);
      const rowKey = ensurePaymentRowKey(normalizedRow);
      if (String(normalizedRow?.row_key || '').trim() === rowKey) return normalizedRow;
      return {
        ...normalizedRow,
        row_key: rowKey,
      };
    })
  );
  const mergeOptionsByValue = (primary: any[] = [], extra: any[] = []) => {
    const map = new Map<string, any>();
    [...primary, ...extra].forEach((item: any) => {
      const value = String(item?.value || '').trim();
      if (!value || map.has(value)) return;
      map.set(value, item);
    });
    return Array.from(map.values());
  };
  const getGenericShelfOptions = (colKey = 'source_shelf_id') => {
    const specificKey = `${block.id}_${colKey}`;
    return relationOptions[specificKey] || relationOptions[colKey] || [];
  };
  const isPackageInvoiceRow = (row: any) => {
    if (!row) return false;
    if (String(row?.product_type || '').trim().toLowerCase() === 'package') return true;
    if (String(row?.item_kind || '').trim().toLowerCase() === 'package') return true;
    if (normalizeSalesPackageItems(row?.package_items).length > 0) return true;
    return Boolean(row?.package_id);
  };
  const applyPackageInvoicePricing = (row: any, packageItems: any, packageQuantity: any) => {
    const quantity = Math.max(0, toSafeNumber(packageQuantity));
    const grossUnitPrice = roundMoney(calculateSalesPackageGrossTotal(packageItems));
    const netUnitPrice = roundMoney(calculateSalesPackageTotal(packageItems));
    const discountPerPackage = roundMoney(calculateSalesPackageDiscountTotal(packageItems));

    row.unit_price = grossUnitPrice > 0 ? grossUnitPrice : netUnitPrice;
    row.discount = roundMoney(discountPerPackage * quantity);
    row.discount_type = 'amount';
    row.discount_percent = grossUnitPrice > 0
      ? roundMoney((discountPerPackage / grossUnitPrice) * 100)
      : 0;
  };
  const clearPackageInvoicePricing = (row: any) => {
    if (!isPackageInvoiceRow(row)) return;
    row.discount = 0;
    row.discount_type = 'amount';
    row.discount_percent = 0;
  };
  const getBillboardDisplayName = (record: any) =>
    String(record?.address || record?.name || record?.title || record?.system_code || record?.id || '').trim();
  const getInvoiceProductRelationOptions = (record?: any) => {
    const specificKey = `${block.id}_product_id`;
    let options = relationOptions[specificKey] || relationOptions.product_id || [];
    const selectedId = String(record?.product_id || '').trim();
    if (selectedId && !options.some((opt: any) => String(opt?.value || '').trim() === selectedId)) {
      const fallbackLabel = String(record?.package_name || record?.selected_product_name || record?.product_name || 'کالای مرتبط').trim();
      options = [...options, { value: selectedId, label: fallbackLabel || 'کالای مرتبط' }];
    }
    return options;
  };
  const getCatalogProductRelationOptions = (record?: any) => {
    const specificKey = `${block.id}_product_id`;
    let options = relationOptions[specificKey] || relationOptions.product_id || [];
    const selectedId = String(record?.product_id || '').trim();
    if (selectedId && !options.some((opt: any) => String(opt?.value || '').trim() === selectedId)) {
      const fallbackLabel = String(record?.selected_product_name || record?.product_name || 'کالای مرتبط').trim();
      options = [...options, { value: selectedId, label: fallbackLabel || 'کالای مرتبط' }];
    }
    return options;
  };
  const loadRelationRecordFromConfig = async (relationConfig: any, value: any) => {
    const normalizedValue = String(value || '').trim();
    if (!relationConfig?.targetModule || !normalizedValue) {
      return {
        targetModule: String(relationConfig?.targetModule || '').trim(),
        record: null,
        error: null,
      };
    }

    const sources = (
      Array.isArray(relationConfig?.sourceModules) && relationConfig.sourceModules.length > 0
        ? relationConfig.sourceModules
        : [relationConfig]
    )
      .map((source: any) => String(source?.targetModule || relationConfig?.targetModule || '').trim())
      .filter(Boolean);

    let lastError: any = null;
    for (const sourceModule of sources) {
      try {
        if (sourceModule === 'product_bundles') {
          const packageSnapshot = await loadPackageSnapshot(normalizedValue);
          if (packageSnapshot) {
            return { targetModule: sourceModule, record: packageSnapshot, error: null };
          }
          continue;
        }

        const { data: relatedRecord, error } = await supabase
          .from(sourceModule)
          .select('*')
          .eq('id', normalizedValue)
          .maybeSingle();
        if (error) throw error;
        if (relatedRecord) {
          return { targetModule: sourceModule, record: relatedRecord, error: null };
        }
      } catch (error: any) {
        lastError = error;
      }
    }

    return {
      targetModule: sources[0] || String(relationConfig?.targetModule || '').trim(),
      record: null,
      error: lastError,
    };
  };
  const getPriceListOptionsForProduct = (productId: any, selectedPriceListId?: any) => {
    const normalizedProductId = String(productId || '').trim();
    const normalizedSelectedId = String(selectedPriceListId || '').trim();
    const options = invoicePriceLists
      .filter((item) => {
        if (!normalizedProductId) return String(item?.id || '').trim() === normalizedSelectedId;
        return !!findPriceListItemByProduct(item?.items, normalizedProductId);
      })
      .map((item) => ({
        value: item.id,
        label: item.name || item.id,
      }));

    if (
      normalizedProductId &&
      normalizedSelectedId &&
      !options.some((item) => String(item?.value || '').trim() === normalizedSelectedId)
    ) {
      const selectedList = invoicePriceLists.find((item) => String(item?.id || '').trim() === normalizedSelectedId);
      if (selectedList && findPriceListItemByProduct(selectedList.items, normalizedProductId)) {
        options.push({ value: selectedList.id, label: selectedList.name || selectedList.id });
      }
    }

    return options;
  };
  const applyPackageRowChanges = (rows: any[], rowIndex: number, nextRow: any) => {
    const nextRows = [...rows];
    nextRows[rowIndex] = nextRow;
    if (isEditing) setTempData(nextRows);
    else setData(nextRows);
    if (mode === 'local' && onChange) onChange(nextRows);
  };
  const loadPackageSnapshot = async (bundleId: string) => {
    const { data: bundleRecord, error } = await supabase
      .from('product_bundles')
      .select('id, name, products')
      .eq('id', bundleId)
      .maybeSingle();
    if (error) throw error;
    if (!bundleRecord) return null;

    const packageItems = normalizeSalesPackageItems(bundleRecord?.products || []);
    const productIds = Array.from(new Set(packageItems.map((item) => String(item.product_id || '')).filter(Boolean)));
    let productMap = new Map<string, any>();
    let billboardMap = new Map<string, any>();
    if (productIds.length > 0) {
      const { data: productRows, error: productError } = await supabase
        .from('products')
        .select('id, name, product_type, main_unit, sell_price, delivery_time')
        .in('id', productIds);
      if (productError) throw productError;
      productMap = new Map((productRows || []).map((item: any) => [String(item.id), item]));

      const { data: billboardRows, error: billboardError } = await supabase
        .from('billboards')
        .select('id, name, address, system_code, daily_rent, monthly_rent, print_cost, width, height')
        .in('id', productIds);
      if (billboardError) throw billboardError;
      billboardMap = new Map((billboardRows || []).map((item: any) => [String(item.id), item]));
    }

    const snapshotItems = packageItems.map((item) => {
      const productMeta = item.product_id ? productMap.get(String(item.product_id)) : null;
      const billboardMeta = item.product_id ? billboardMap.get(String(item.product_id)) : null;
      const mainUnit = String(item.main_unit || productMeta?.main_unit || (billboardMeta ? 'روز' : 'عدد')).trim() || 'عدد';
      const unitPrice = toSafeNumber(
        item.unit_price ||
        productMeta?.sell_price ||
        billboardMeta?.daily_rent ||
        billboardMeta?.monthly_rent ||
        billboardMeta?.print_cost ||
        0
      );
      const quantity = Math.abs(toSafeNumber(item.quantity));
      const totalPrice = calculateRow(
        {
          quantity,
          unit_price: unitPrice,
          discount: item.discount,
          discount_type: item.discount_type,
        },
        RowCalculationType.INVOICE_ROW,
      );

      return {
        product_id: item.product_id,
        product_name: String(getBillboardDisplayName(billboardMeta) || item.product_name || productMeta?.name || item.product_id || '-'),
        product_type: String(item.product_type || productMeta?.product_type || (billboardMeta ? 'service' : 'goods')),
        delivery_time: String(item.delivery_time || productMeta?.delivery_time || '').trim() || null,
        quantity,
        main_unit: mainUnit,
        unit_price: unitPrice,
        discount: item.discount,
        discount_type: item.discount_type || 'amount',
        total_price: totalPrice,
      };
    });

    return {
      id: String(bundleRecord.id),
      name: String(bundleRecord.name || bundleRecord.id),
      items: snapshotItems,
      totalPrice: calculateSalesPackageTotal(snapshotItems),
      description: buildSalesPackageDescription(snapshotItems),
    };
  };

  // --- دریافت دیتای خارجی ---
  useEffect(() => {
    const fetchExternalData = async () => {
      if (mode === 'external_view' && externalSource?.moduleId && externalSource?.recordId) {
        setLoadingData(true);
        try {
          const { data: extData, error } = await supabase
            .from(externalSource.moduleId)
            .select(externalSource.column || 'items')
            .eq('id', externalSource.recordId)
            .single();
          if (error) throw error;
          const items = extData ? (extData as any)[externalSource.column || 'items'] : [];
          const dataWithKeys = Array.isArray(items)
            ? items.map((i: any, idx: number) => ({ ...i, key: i.key || idx }))
            : [];
          setData(dataWithKeys);
        } catch (err) {
          console.error(err);
          setData([]);
        } finally {
          setLoadingData(false);
        }
      }
    };
    fetchExternalData();
  }, [mode, externalSource?.recordId, externalSource?.moduleId, externalSource?.column]);

  // --- کپی دیتا (Populate) ---
  useEffect(() => {
    const fetchAndPopulate = async () => {
      if (populateSource?.moduleId && populateSource?.recordId) {
        setLoadingData(true);
        try {
          const { data: sourceData, error } = await supabase
            .from(populateSource.moduleId)
            .select(populateSource.column || 'items')
            .eq('id', populateSource.recordId)
            .single();
          if (error) throw error;
          const items = sourceData ? (sourceData as any)[populateSource.column || 'items'] : [];
          const populatedItems = (Array.isArray(items) ? items : []).map((item: any) => ({
            ...item,
            id: undefined,
            key: Date.now() + Math.random(),
          }));
          setTempData(populatedItems);
          if (onChange) onChange(populatedItems);
          setIsEditing(true);
          msg.success('اقلام کپی شدند');
        } catch (err) {
          console.error(err);
        } finally {
          setLoadingData(false);
        }
      }
    };
    if (populateSource?.recordId) fetchAndPopulate();
  }, [populateSource?.recordId, populateSource?.moduleId, populateSource?.column]);

  // --- مقداردهی اولیه ---
  useEffect(() => {
    if (mode !== 'external_view' && !populateSource?.recordId && !isProductInventory && !isShelfInventory && !isProductStockMovements) {
      const safeData = normalizePaymentRows(Array.isArray(initialData) ? initialData : []);
      const dataWithKey = safeData.map((item) => ({
        ...item,
        key: item.key || item.row_key || item.id || createLocalRowKey(),
      }));
      const lockedData = isProductionOrder && isBomItemBlock
        ? dataWithKey.map((row: any) => {
            if (!row?.selected_product_id) return row;
            const locked = new Set<string>(row?._lockedFields || []);
            (block.tableColumns || []).forEach((col: any) => {
              const key = col.key;
              if (!editableAfterSelection.has(key)) {
                locked.add(key);
              }
            });
            return { ...row, _lockedFields: Array.from(locked) };
          })
        : dataWithKey;
      setData(lockedData);
      if (mode === 'local') setTempData(lockedData);
    }
  }, [initialData, mode, isProductInventory, isShelfInventory, isProductStockMovements, populateSource?.recordId]);

  useEffect(() => {
    const resolvedFocusRowKey = String(focusRowKey || '').trim();
    if (!resolvedFocusRowKey) return;

    const source = isEditing ? tempData : data;
    const rowExists = source.some((row: any) => String(row?.row_key || row?.key || row?.id || '').trim() === resolvedFocusRowKey);
    if (!rowExists) return;

    if (isCollapsed) {
      setIsCollapsed(false);
      setUserToggledCollapse(false);
    }
    setHighlightedFocusRowKey(resolvedFocusRowKey);

    const scrollTimer = window.setTimeout(() => {
      const selector = `[data-row-key="${escapeSelectorValue(resolvedFocusRowKey)}"]`;
      const element = document.querySelector(selector) as HTMLElement | null;
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }, 180);
    const clearTimer = window.setTimeout(() => {
      setHighlightedFocusRowKey((current) => (current === resolvedFocusRowKey ? null : current));
    }, 3200);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [focusRowKey, data, tempData, isEditing, isCollapsed]);

  // --- دریافت موجودی از جدول product_inventory ---
  useEffect(() => {
    const fetchInventoryRows = async () => {
      if (mode !== 'db' || !recordId || (!isProductInventory && !isShelfInventory && !isProductStockMovements)) return;
      setLoadingData(true);
      try {
        if (isProductStockMovements) {
          const { data: productMeta } = await supabase
            .from('products')
            .select('main_unit, sub_unit, stock')
            .eq('id', recordId)
            .maybeSingle();

          const mainUnit = productMeta?.main_unit || null;
          const subUnit = productMeta?.sub_unit || null;
          const productStock = parseFloat(productMeta?.stock) || 0;
          setCurrentProductUnits({ mainUnit, subUnit });
          setCurrentProductStock(productStock);

          const { data: rows, error } = await supabase
            .from('stock_transfers')
            .select('id, transfer_type, delivered_qty, required_qty, invoice_id, production_order_id, from_shelf_id, to_shelf_id, sender_id, receiver_id, created_at')
            .eq('product_id', recordId)
            .order('created_at', { ascending: true });
          if (error) throw error;

          const userIds = Array.from(
            new Set((rows || []).flatMap((row: any) => [row?.sender_id, row?.receiver_id]).filter(Boolean))
          );
          let userMap = new Map<string, string>();
          if (userIds.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, full_name')
              .in('id', userIds);
            userMap = new Map((profiles || []).map((item: any) => [String(item.id), item.full_name || String(item.id)]));
          }

          const mappedRows = (rows || []).map((row: any, index: number) => {
            const source = String(row?.transfer_type || '').trim() || 'inventory_count';
            const fromShelf = row?.from_shelf_id ? String(row.from_shelf_id) : null;
            const toShelf = row?.to_shelf_id ? String(row.to_shelf_id) : null;
            const voucherType = fromShelf && toShelf ? 'transfer' : toShelf ? 'incoming' : 'outgoing';
            const creatorId = row?.sender_id || row?.receiver_id || null;
            const autoSource = ['sales_invoice', 'purchase_invoice', 'production'].includes(source);
            const isPurchaseSource = source === 'purchase_invoice';
            return {
              id: row.id,
              key: row.id || `move_${index}`,
              voucher_type: voucherType,
              source,
              main_unit: mainUnit,
              main_quantity: Math.abs(parseFloat(row?.delivered_qty) || 0),
              sub_unit: subUnit,
              sub_quantity: Math.abs(parseFloat(row?.required_qty) || 0),
              from_shelf_id: fromShelf,
              to_shelf_id: toShelf,
              invoice_id: isPurchaseSource ? null : (row?.invoice_id || null),
              purchase_invoice_id: isPurchaseSource ? (row?.invoice_id || null) : null,
              production_order_id: row?.production_order_id || null,
              created_by_name: creatorId ? (userMap.get(String(creatorId)) || String(creatorId)) : '-',
              created_at: row?.created_at || null,
              _readonly: autoSource || !!row?.invoice_id || !!row?.production_order_id,
            };
          });
          setData(mappedRows);
          return;
        }

        let query = supabase
          .from('product_inventory')
          .select('id, product_id, shelf_id, warehouse_id, stock, created_at, products(main_unit,sub_unit), shelves(warehouse_id,system_code,shelf_number,name,warehouses(id,name))');
        if (isProductInventory) query = query.eq('product_id', recordId);
        if (isShelfInventory) query = query.eq('shelf_id', recordId);
        const { data: rows, error } = await query.order('created_at', { ascending: true });
        if (error) throw error;

        let productUnits: { mainUnit: string | null; subUnit: string | null } = { mainUnit: null, subUnit: null };
        if (isProductInventory) {
          try {
            const { data: productRow } = await supabase
              .from('products')
              .select('main_unit, sub_unit')
              .eq('id', recordId)
              .single();
            productUnits = {
              mainUnit: productRow?.main_unit || null,
              subUnit: productRow?.sub_unit || null,
            };
            setCurrentProductUnits(productUnits);
          } catch (e) {
            console.warn('Could not load product units', e);
          }
        }

        const dataWithKeys = (rows || []).map((row: any, idx: number) => {
          const mainUnit = row?.products?.main_unit ?? row.main_unit ?? productUnits.mainUnit ?? null;
          const subUnit = row?.products?.sub_unit ?? row.sub_unit ?? productUnits.subUnit ?? null;
          const shelfName = row?.shelves?.name || row?.shelves?.shelf_number || row?.shelf_id || '-';
          const shelfCode = row?.shelves?.system_code || '';
          const stockValue = parseFloat(row?.stock) || 0;
          const subStock = mainUnit && subUnit
            ? convertArea(stockValue, mainUnit as any, subUnit as any)
            : 0;
          return {
            ...row,
            warehouse_id:
              row?.warehouse_id ??
              row?.shelves?.warehouse_id ??
              row?.shelves?.warehouses?.id ??
              null,
            main_unit: mainUnit,
            sub_unit: subUnit,
            sub_stock: Number.isFinite(subStock) ? subStock : 0,
            shelf_display: shelfCode ? `${shelfName} (${shelfCode})` : shelfName,
            key: row.id || row.key || `inv_${idx}`,
          };
        });
        setData(dataWithKeys);
      } catch (err) {
        console.error(err);
        setData([]);
      } finally {
        setLoadingData(false);
      }
    };

    fetchInventoryRows();
  }, [mode, recordId, isProductInventory, isShelfInventory, isProductStockMovements]);

  useEffect(() => {
    const categories = new Set<string>();
    (block.tableColumns || []).forEach((col: any) => {
      if (col.dynamicOptionsCategory) categories.add(col.dynamicOptionsCategory);
    });

    const toFetch = Array.from(categories).filter(
      (cat) => !(dynamicOptions && dynamicOptions[cat]) && !(localDynamicOptions && localDynamicOptions[cat])
    );

    if (toFetch.length === 0) return;

    const load = async () => {
      const updates: Record<string, any[]> = {};
      for (const cat of toFetch) {
        try {
          const rows = await fetchDynamicOptionsByCategory(supabase, cat);
          updates[cat] = rows.filter((i: any) => i.value !== null);
        } catch (err) {
          console.warn('Dynamic options load failed:', cat, err);
        }
      }
      if (Object.keys(updates).length > 0) {
        setLocalDynamicOptions((prev) => ({ ...prev, ...updates }));
      }
    };

    load();
  }, [block.tableColumns, dynamicOptions]);

  const refreshDynamicOptionsForCategory = async (category?: string) => {
    const normalizedCategory = String(category || '').trim();
    if (!normalizedCategory) return;
    try {
      const rows = await fetchDynamicOptionsByCategory(supabase, normalizedCategory, { force: true });
      setLocalDynamicOptions((prev) => ({
        ...prev,
        [normalizedCategory]: (rows || []).filter((item: any) => item?.value !== null),
      }));
    } catch (err) {
      console.warn('Dynamic options refresh failed:', normalizedCategory, err);
    }
  };

  useEffect(() => {
    if (!isInvoiceItems) return;
    const sourceRows = isEditing ? tempData : data;
    const activeRowKeys = new Set<string>();
    sourceRows.forEach((row: any, index: number) => {
      const productId = row?.product_id ? String(row.product_id) : null;
      const rowKey = String(row?.key || row?.id || index);
      activeRowKeys.add(rowKey);
      if (!productId) {
        delete shelfAutoLoadRef.current[rowKey];
        return;
      }
      const signature = `${rowKey}:${productId}`;
      if (shelfAutoLoadRef.current[rowKey] === signature) return;
      shelfAutoLoadRef.current[rowKey] = signature;
      void loadShelvesForRow(rowKey, productId);
    });
    Object.keys(shelfAutoLoadRef.current).forEach((rowKey) => {
      if (!activeRowKeys.has(rowKey)) {
        delete shelfAutoLoadRef.current[rowKey];
      }
    });
  }, [isInvoiceItems, isEditing, tempData, data]);

  useEffect(() => {
    if (!isPurchaseInvoicePayments) return;
    let active = true;
    const loadEligibleCheques = async () => {
      try {
        const { data: rows, error } = await supabase
          .from('cheques')
          .select('id, serial_no, sayad_id, amount, due_date, status, metadata')
          .eq('cheque_type', 'received')
          .eq('status', 'new')
          .order('created_at', { ascending: false })
          .limit(500);
        if (error) throw error;

        const options = (rows || [])
          .filter((row: any) => {
            const spent = Boolean((row?.metadata || {})?.spent_out);
            return !spent;
          })
          .map((row: any) => {
            const serial = String(row?.serial_no || '').trim() || 'بدون شماره';
            const sayad = String(row?.sayad_id || '').trim();
            const amount = toSafeNumber(row?.amount || 0);
            const dueDateRaw = String(row?.due_date || '').trim();
            const dueDateLabel = dueDateRaw
              ? toPersianNumber(safeJalaliFormat(dueDateRaw, 'YYYY/MM/DD') || dueDateRaw)
              : '-';
            const amountLabel = amount > 0 ? formatPersianPrice(amount) : '-';
            const sayadLabel = sayad ? ` (${toPersianNumber(sayad)})` : '';
            return {
              value: String(row.id),
              label: `${serial}${sayadLabel} (${dueDateLabel} - ${amountLabel})`,
            };
          });

        if (active) setEligibleReceivedChequeOptions(options);
      } catch (err) {
        console.warn('Could not load eligible received cheques', err);
        if (active) setEligibleReceivedChequeOptions([]);
      }
    };
    loadEligibleCheques();
    return () => {
      active = false;
    };
  }, [isPurchaseInvoicePayments, isEditing, saving]);

  useEffect(() => {
    if (!isInvoiceItems) return;
    let active = true;

    const loadPriceLists = async () => {
      try {
        const { data: rows, error } = await supabase
          .from('price_lists')
          .select('id, name, items')
          .eq('status', 'active')
          .order('updated_at', { ascending: false })
          .limit(1000);
        if (error) throw error;
        if (!active) return;
        setInvoicePriceLists(
          (rows || []).map((row: any) => ({
            id: String(row?.id || '').trim(),
            name: String(row?.name || row?.id || '').trim(),
            items: Array.isArray(row?.items) ? row.items : [],
          })).filter((row: any) => row.id),
        );
      } catch (err) {
        if (!isAbortLikeError(err)) {
          console.warn('Could not load price lists for invoice items', err);
        }
        if (active) setInvoicePriceLists([]);
      }
    };

    loadPriceLists();
    return () => {
      active = false;
    };
  }, [isInvoiceItems]);

  const AREA_AUTO_UNITS = new Set(['متر مربع', 'سانتیمتر مربع', 'میلیمتر مربع']);
  const DAY_UNIT_VALUES = new Set(['روز', 'day', 'days']);
  const isDayUnit = (unit: any) => DAY_UNIT_VALUES.has(String(unit || '').trim().toLowerCase());
  const isAreaAutoUnit = (unit: any) => AREA_AUTO_UNITS.has(String(unit || '').trim());
  const isGoodsInvoiceRow = (row: any) => !isServiceProduct(row?.product_type);
  const hasDimensionValues = (row: any) =>
    isGoodsInvoiceRow(row) &&
    (toSafeNumber(row?.length) > 0 || toSafeNumber(row?.width) > 0);
  const hasAutoDimensions = (row: any) =>
    isGoodsInvoiceRow(row) &&
    isAreaAutoUnit(row?.main_unit) &&
    hasDimensionValues(row);
  const shouldAutoSubQuantity = (row: any) => !isManualSubUnit(row?.sub_unit);
  const roundToThree = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.round((value + Number.EPSILON) * 1000) / 1000;
  };
  const getDimensionCount = (row: any) => {
    const count = toSafeNumber(row?.dimension_count);
    return count > 0 ? count : 1;
  };
  const syncInvoiceSubQuantity = (row: any) => {
    if (!isAnyInvoiceItems || !row) return;
    if (isPackageInvoiceRow(row)) {
      row.sub_quantity = roundToThree(toSafeNumber(row?.quantity));
      return;
    }

    const useCountAsSubQuantity = row?.dimension_count_to_sub_quantity === true;
    const originalSubUnit = String(row?.dimension_count_original_sub_unit || row?.base_sub_unit || '').trim();

    if (useCountAsSubQuantity) {
      if (!row?.dimension_count_original_sub_unit) {
        row.dimension_count_original_sub_unit = String(row?.sub_unit || row?.base_sub_unit || '').trim() || null;
      }
      row.sub_unit = 'عدد';
      row.sub_quantity = roundToThree(getDimensionCount(row));
      return;
    }

    if (originalSubUnit) {
      row.sub_unit = originalSubUnit;
    } else if (row?.dimension_count_original_sub_unit) {
      row.sub_unit = null;
    }
    row.dimension_count_original_sub_unit = null;

    if (shouldAutoSubQuantity(row)) {
      const qtyMain = toSafeNumber(row?.quantity);
      const mainUnit = String(row?.main_unit || '');
      const subUnit = String(row?.sub_unit || '');
      const converted = mainUnit && subUnit
        ? convertArea(qtyMain, mainUnit as any, subUnit as any)
        : 0;
      row.sub_quantity = Number.isFinite(converted) ? roundToThree(converted) : 0;
      return;
    }

    row.sub_quantity = roundToThree(toSafeNumber(row?.sub_quantity));
  };
  const shouldShowStackedField = (key: string, row: any) => {
    if (isAnyInvoiceItems) {
      if (!isGoodsInvoiceRow(row) && ['length', 'width', 'source_shelf_id'].includes(key)) {
        return false;
      }
      if (['length', 'width'].includes(key) && !hasDimensionValues(row)) return false;
    }
    if (isAnyInvoicePayments) {
      const paymentType = normalizeCashBankPaymentType(row?.payment_type) || '';
      if (key === 'spent_cheque_id' && (paymentType !== 'cheque' || !row?.use_existing_received_cheque)) return false;
      if (key === 'use_existing_received_cheque' && paymentType !== 'cheque') return false;
      if ((key === 'cheque_id' || key === 'cheque_status') && paymentType !== 'cheque') return false;
      if (key === 'barter_id' && (paymentType !== 'barter' || isInvoicePayments)) return false;
    }
    return true;
  };

  const parseIsoDateAsUtc = (value?: string | null) => {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!year || !month || !day) return null;
    return Date.UTC(year, month - 1, day);
  };

  const calculateDateDiffDays = (startDate?: string | null, endDate?: string | null) => {
    const startUtc = parseIsoDateAsUtc(startDate);
    const endUtc = parseIsoDateAsUtc(endDate);
    if (startUtc === null || endUtc === null) return null;
    if (endUtc < startUtc) return 0;
    return Math.floor((endUtc - startUtc) / (24 * 60 * 60 * 1000));
  };

  const applyInvoiceAutoQuantity = (row: any) => {
    if (!isAnyInvoiceItems || !row) return;
    if (isAreaAutoUnit(row?.main_unit) && isGoodsInvoiceRow(row)) {
      const lengthVal = toSafeNumber(row?.length);
      const widthVal = toSafeNumber(row?.width);
      if (lengthVal > 0 || widthVal > 0) {
        row.quantity = roundToThree(lengthVal * widthVal * getDimensionCount(row));
      }
      return;
    }
    const hasDateRange = Boolean(String(row?.start_date || '').trim() && String(row?.end_date || '').trim());
    if (isDayUnit(row?.main_unit) || (hasDateRange && isServiceProduct(row?.product_type))) {
      const dayDiff = calculateDateDiffDays(row?.start_date, row?.end_date);
      if (typeof dayDiff === 'number') row.quantity = roundToThree(dayDiff);
    }
  };

  const getActiveRowsSnapshot = () => (isEditing ? tempDataRef.current : dataRef.current);
  const escapeSelectorValue = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const applyRowUpdate = (nextRows: any[]) => {
    const normalizedRows = normalizePaymentRows(nextRows);
    if (isEditing) {
      tempDataRef.current = normalizedRows;
      setTempData(normalizedRows);
    } else {
      dataRef.current = normalizedRows;
      setData(normalizedRows);
    }
    if (mode === 'local' && onChange) onChange(normalizedRows);
  };

  const updateInvoiceDimensions = (
    index: number,
    changes: {
      length?: number | null;
      width?: number | null;
      dimension_count?: number | null;
      dimension_count_to_sub_quantity?: boolean;
    }
  ) => {
    const source = getActiveRowsSnapshot();
    const nextRows = [...source];
    const nextRow = { ...(nextRows[index] || {}), ...changes };

    applyInvoiceAutoQuantity(nextRow);
    syncInvoiceSubQuantity(nextRow);
    nextRow.total_price = calculateRow(nextRow, block.rowCalculationType);

    nextRows[index] = nextRow;
    applyRowUpdate(nextRows);
  };

  const updateInvoiceDateRange = (index: number, changes: { start_date?: string | null; end_date?: string | null }) => {
    const source = getActiveRowsSnapshot();
    const nextRows = [...source];
    const nextRow = { ...(nextRows[index] || {}), ...changes };
    applyInvoiceAutoQuantity(nextRow);
    syncInvoiceSubQuantity(nextRow);
    nextRow.total_price = calculateRow(nextRow, block.rowCalculationType);

    nextRows[index] = nextRow;
    applyRowUpdate(nextRows);
  };

  const updateRow = (index: number, key: string, value: any) => {
    const source = getActiveRowsSnapshot();
    const newData = [...source];
    newData[index] = { ...newData[index], [key]: value };

    if (isProductStockMovements) {
      if (key === 'voucher_type') {
        if (value === 'incoming') newData[index]['from_shelf_id'] = null;
        if (value === 'outgoing') newData[index]['to_shelf_id'] = null;
      }
      if (key === 'source' && value === 'waste') {
        newData[index]['voucher_type'] = 'outgoing';
        newData[index]['to_shelf_id'] = null;
      }
      if (['main_quantity', 'main_unit', 'sub_unit'].includes(key)) {
        const qtyMain = parseFloat(newData[index]?.main_quantity) || 0;
        const mainUnit = String(newData[index]?.main_unit || '');
        const subUnit = String(newData[index]?.sub_unit || '');
        const converted = mainUnit && subUnit
          ? convertArea(qtyMain, mainUnit as any, subUnit as any)
          : 0;
        newData[index]['sub_quantity'] = Number.isFinite(converted) ? converted : 0;
      }
    }

    if (isAnyInvoiceItems && key === 'product_id') {
      newData[index]['source_shelf_id'] = null;
    }

    if (isAnyInvoiceItems && ['length', 'width', 'start_date', 'end_date', 'main_unit', 'dimension_count'].includes(key)) {
      const current = newData[index];
      applyInvoiceAutoQuantity(current);
    }

    if (isAnyInvoiceItems && ['quantity', 'main_unit', 'sub_unit', 'length', 'width', 'start_date', 'end_date', 'dimension_count', 'dimension_count_to_sub_quantity'].includes(key)) {
      const current = newData[index];
      applyInvoiceAutoQuantity(current);
      syncInvoiceSubQuantity(current);
      if (isPackageInvoiceRow(current)) {
        current.sub_quantity = roundToThree(toSafeNumber(current?.quantity));
        applyPackageInvoicePricing(current, current?.package_items, current?.quantity);
        current.description = buildSalesPackageDescription(current?.package_items, current?.quantity) || current.description || '';
      }
    }

    if (isOperationalPayments && key === 'payment_type') {
      const paymentType = String(value || '').trim();
      const accountField = isInvoicePayments ? 'target_account' : 'source_account';
      newData[index][accountField] = null;
      if (isAnyInvoicePayments && paymentType !== 'cheque') {
        newData[index]['use_existing_received_cheque'] = false;
        newData[index]['spent_cheque_id'] = null;
        newData[index]['cheque_id'] = null;
        newData[index]['cheque_status'] = null;
        newData[index]['cheque_serial_no'] = null;
        newData[index]['cheque_sayad_id'] = null;
        newData[index]['cheque_due_date'] = null;
        newData[index]['cheque_account_holder_name'] = null;
        newData[index]['cheque_bank_name'] = null;
        newData[index]['cheque_image_url'] = null;
      }
      if (isAnyInvoicePayments && paymentType !== 'barter') {
        newData[index]['barter_id'] = null;
        newData[index]['barter_status'] = null;
        newData[index]['barter_remaining_amount'] = null;
        newData[index]['_barter_allocation_key'] = null;
      }
    }

    if (isPurchaseInvoicePayments && key === 'use_existing_received_cheque' && !value) {
      newData[index]['spent_cheque_id'] = null;
    }

    if (isAnyInvoicePayments && key === 'cheque_id') {
      if (!value) {
        newData[index]['cheque_status'] = null;
        newData[index]['cheque_serial_no'] = null;
        newData[index]['cheque_sayad_id'] = null;
        newData[index]['cheque_due_date'] = null;
        newData[index]['cheque_account_holder_name'] = null;
        newData[index]['cheque_bank_name'] = null;
        newData[index]['cheque_image_url'] = null;
      } else if (isPurchaseInvoicePayments) {
        newData[index]['use_existing_received_cheque'] = false;
        newData[index]['spent_cheque_id'] = null;
      }
    }

    if (isAnyInvoicePayments && key === 'barter_id' && !value) {
      newData[index]['barter_status'] = null;
      newData[index]['barter_remaining_amount'] = null;
    }

    if (key === 'selected_product_id' && !value) {
      newData[index]['selected_shelf_id'] = null;
      newData[index]['selected_product_name'] = null;
    }

    if (['length', 'width'].includes(key) && !isAnyInvoiceItems) {
      const lengthVal = parseFloat(newData[index]?.length);
      const widthVal = parseFloat(newData[index]?.width);
      if (Number.isFinite(lengthVal) && Number.isFinite(widthVal)) {
        newData[index]['usage'] = lengthVal * widthVal;
      }
    }

    if (isPriceListItems && ['buy_price', 'profit_percentage'].includes(key)) {
      newData[index]['price'] = calculatePriceWithProfit(
        newData[index]?.buy_price,
        newData[index]?.profit_percentage,
      );
    }

    if (['quantity', 'qty', 'usage', 'stock', 'unit_price', 'price', 'buy_price', 'profit_percentage', 'discount', 'vat', 'length', 'width', 'main_quantity', 'sub_quantity'].includes(key)) {
      newData[index]['total_price'] = calculateRow(newData[index], block.rowCalculationType);
    }

    applyRowUpdate(newData);

    if (isProductionOrder && isBomItemBlock) {
      const filterableKeys = new Set((block.tableColumns || []).filter((c: any) => c.filterable).map((c: any) => c.key));
      const rowKey = getRowKey(newData[index]);
      const isExpanded = expandedRowKeys.some((k) => String(k) === String(rowKey));
      if (filterableKeys.has(key) && isExpanded) {
        loadProductsForRow(rowKey, newData[index], { resetPage: true });
      }
    }

    if (moduleId === 'production_orders' && isBomItemBlock && recordId && ['selected_product_id', 'selected_shelf_id', 'selected_product_name'].includes(key)) {
      const dataToSave = newData.map(({ key: rowKey, ...rest }) => ({
        ...rest,
        total_price: calculateRow(rest, block.rowCalculationType),
      }));
      supabase.from(moduleId).update({ [block.id]: dataToSave }).eq('id', recordId);
    }
    return newData;
  };

  const clearSelectedProduct = (rowIndex: number) => {
    const source = getActiveRowsSnapshot();
    const baseRow = source[rowIndex] || {};
    const rowKey = String(baseRow?.key || baseRow?.id || rowIndex);
    const nextRow: any = { ...baseRow };
    nextRow.selected_product_id = null;
    nextRow.selected_product_name = null;
    nextRow.selected_shelf_id = null;
    delete shelfAutoLoadRef.current[rowKey];

    const locked = new Set<string>((nextRow._lockedFields || []) as string[]);
    locked.forEach((key) => {
      if (key in nextRow) nextRow[key] = undefined;
    });
    nextRow._lockedFields = [];

    const newData = [...source];
    newData[rowIndex] = nextRow;
    applyRowUpdate(newData);
  };

  const handleRelationChange = async (index: number, key: string, value: any, relationConfig: any) => {
    updateRow(index, key, value);

    if (isAnyInvoiceItems && key === 'product_id' && !value) {
      const sourceRows = getActiveRowsSnapshot();
      const nextRows = [...sourceRows];
      const currentRow = { ...(nextRows[index] || {}), product_id: null };
      const rowKey = String(currentRow?.key || currentRow?.id || index);
      delete shelfAutoLoadRef.current[rowKey];
      clearPackageInvoicePricing(currentRow);
      currentRow.package_id = null;
      currentRow.package_name = null;
      currentRow.package_items = [];
      currentRow.item_kind = null;
      currentRow.product_type = null;
      currentRow.price_list_id = null;
      currentRow.source_shelf_id = null;
      currentRow.delivery_time = null;
      currentRow.selected_product_name = null;
      currentRow.product_name = null;
      currentRow.total_price = calculateRow(currentRow, block.rowCalculationType);
      applyPackageRowChanges(nextRows, index, currentRow);
      bumpRowReloadVersion(rowKey);
      return;
    }

    if (isInvoiceItems && key === 'price_list_id') {
      const sourceRows = getActiveRowsSnapshot();
      const nextRows = [...sourceRows];
      const currentRow = { ...(nextRows[index] || {}), [key]: value || null };
      const rowKey = String(currentRow?.key || currentRow?.id || index);
      const productId = String(currentRow?.product_id || '').trim();
      if (!value) {
        currentRow.price_list_id = null;
        currentRow.total_price = calculateRow(currentRow, block.rowCalculationType);
        applyPackageRowChanges(nextRows, index, currentRow);
        bumpRowReloadVersion(rowKey);
        return;
      }
      if (!productId) {
        currentRow.price_list_id = null;
        applyPackageRowChanges(nextRows, index, currentRow);
        msg.warning('ابتدا کالا یا خدمت را انتخاب کنید.');
        return;
      }
      const matchedList = invoicePriceLists.find((item) => item.id === String(value));
      const matchedItem = findPriceListItemByProduct(matchedList?.items, productId);
      if (!matchedItem) {
        currentRow.price_list_id = null;
        applyPackageRowChanges(nextRows, index, currentRow);
        msg.warning('این کالا در لیست قیمت انتخاب‌شده وجود ندارد.');
        return;
      }
      currentRow.unit_price = toSafeNumber(matchedItem?.price);
      currentRow.total_price = calculateRow(currentRow, block.rowCalculationType);
      applyPackageRowChanges(nextRows, index, currentRow);
      bumpRowReloadVersion(rowKey);
      return;
    }

    if (isInvoiceItems && key === 'package_id') {
      const sourceRows = getActiveRowsSnapshot();
      const nextRows = [...sourceRows];
      const currentRow = { ...(nextRows[index] || {}), [key]: value || null };
      const rowKey = String(currentRow?.key || currentRow?.id || index);
      if (!value) {
        clearPackageInvoicePricing(currentRow);
        currentRow.package_id = null;
        currentRow.package_items = [];
        currentRow.package_name = null;
        currentRow.item_kind = currentRow.product_id ? 'product' : null;
        currentRow.unit_price = currentRow.product_id ? currentRow.unit_price : 0;
        currentRow.main_unit = currentRow.product_id ? currentRow.main_unit : null;
        currentRow.sub_unit = currentRow.product_id ? currentRow.sub_unit : null;
        currentRow.delivery_time = currentRow.product_id ? currentRow.delivery_time : null;
        currentRow.total_price = calculateRow(currentRow, block.rowCalculationType);
        applyPackageRowChanges(nextRows, index, currentRow);
        bumpRowReloadVersion(rowKey);
        return;
      }

      try {
        const packageSnapshot = await loadPackageSnapshot(String(value));
        if (!packageSnapshot) throw new Error('پکیج انتخاب‌شده یافت نشد.');
        const packageQuantity = Math.max(1, toSafeNumber(currentRow?.quantity) || 1);
        const genericShelves = getGenericShelfOptions('source_shelf_id');
        currentRow.package_id = packageSnapshot.id;
        currentRow.package_name = packageSnapshot.name;
        currentRow.package_items = packageSnapshot.items;
        currentRow.item_kind = 'package';
        currentRow.product_id = null;
        currentRow.price_list_id = null;
        currentRow.product_type = 'package';
        currentRow.main_unit = 'عدد';
        currentRow.sub_unit = 'عدد';
        currentRow.quantity = packageQuantity;
        currentRow.sub_quantity = packageQuantity;
        applyPackageInvoicePricing(currentRow, packageSnapshot.items, packageQuantity);
        currentRow.length = null;
        currentRow.width = null;
        currentRow.start_date = null;
        currentRow.end_date = null;
        currentRow.delivery_time = null;
        currentRow.description = buildSalesPackageDescription(packageSnapshot.items, packageQuantity) || currentRow.description || '';
        if (
          currentRow.source_shelf_id &&
          !genericShelves.some((item: any) => String(item?.value || '') === String(currentRow.source_shelf_id))
        ) {
          currentRow.source_shelf_id = null;
        }
        currentRow.total_price = calculateRow(currentRow, block.rowCalculationType);
        applyPackageRowChanges(nextRows, index, currentRow);
        bumpRowReloadVersion(rowKey);
      } catch (error: any) {
        console.error(error);
        msg.error(toFaErrorMessage(error, 'بارگذاری پکیج ناموفق بود.'));
      }
      return;
    }

    if (isOperationalPayments && key === 'responsible_id') {
      return;
    }

    if (value && relationConfig?.targetModule) {
      try {
        let targetModule = relationConfig.targetModule as string;
        let record: any = null;
        let error: any = null;
        const invoiceProductOption = isAnyInvoiceItems && key === 'product_id'
          ? getInvoiceProductRelationOptions(getActiveRowsSnapshot()[index]).find((opt: any) => String(opt?.value || '') === String(value))
          : null;

        if (isAnyInvoiceItems && key === 'product_id') {
          if (invoiceProductOption?.module === 'product_bundles') {
            const packageSnapshot = await loadPackageSnapshot(String(value));
            if (!packageSnapshot) throw new Error('پکیج انتخاب‌شده یافت نشد.');
            targetModule = 'product_bundles';
            record = packageSnapshot;
          } else if (invoiceProductOption?.module === 'billboards') {
            const { data: billboardRecord, error: billboardError } = await supabase
              .from('billboards')
              .select('*')
              .eq('id', value)
              .maybeSingle();
            if (billboardError) throw billboardError;
            if (billboardRecord) {
              targetModule = 'billboards';
              record = billboardRecord;
            }
          } else {
            const { data: productRecord, error: productError } = await supabase
              .from('products')
              .select('*')
              .eq('id', value)
              .maybeSingle();
            if (productError) throw productError;
            if (productRecord) {
              targetModule = 'products';
              record = productRecord;
            } else {
              const { data: billboardRecord, error: billboardError } = await supabase
                .from('billboards')
                .select('*')
                .eq('id', value)
                .maybeSingle();
              if (billboardError) throw billboardError;
              if (billboardRecord) {
                targetModule = 'billboards';
                record = billboardRecord;
              } else {
                const packageSnapshot = await loadPackageSnapshot(String(value));
                if (packageSnapshot) {
                  targetModule = 'product_bundles';
                  record = packageSnapshot;
                }
              }
            }
          }
        } else {
          const relationResult = await loadRelationRecordFromConfig(relationConfig, value);
          targetModule = relationResult.targetModule;
          record = relationResult.record;
          error = relationResult.error;
        }

        if (!error && record) {
          const sourceRows = getActiveRowsSnapshot();
          const newData = [...sourceRows];
          const currentRow = { ...newData[index], [key]: value };
          const isBarterRelationSelection = isAnyInvoicePayments && key === 'barter_id';

          block.tableColumns?.forEach((col: any) => {
            if (isBarterRelationSelection) {
              return;
            }
            if (isAnyInvoicePayments && key === 'cheque_id' && col.key === 'status') {
              return;
            }
            if (record[col.key] !== undefined && col.key !== key) {
              currentRow[col.key] = record[col.key];
            }
            if (col.key === 'buy_price' && record['buy_price']) {
              currentRow[col.key] = record['buy_price'];
            }
          });

          if ((isPriceListItems || isSalesPackageItems) && key === 'product_id') {
            const catalogDisplayName = targetModule === 'billboards'
              ? getBillboardDisplayName(record)
              : String(record?.name || '').trim();
            currentRow.selected_product_name = catalogDisplayName || currentRow.selected_product_name || null;
            currentRow.product_name = catalogDisplayName || currentRow.product_name || null;
            currentRow.delivery_time = String(record?.delivery_time || '').trim() || null;
            if (targetModule === 'billboards') {
              currentRow.product_type = 'service';
              currentRow.main_unit = 'روز';
            }
            currentRow.product_type = record?.product_type || currentRow.product_type || 'goods';
            currentRow.main_unit = String(record?.main_unit || 'عدد').trim() || 'عدد';
            if (targetModule === 'billboards') {
              currentRow.product_type = 'service';
              currentRow.main_unit = 'روز';
            }
            if (isPriceListItems) {
              const sourceSellPrice = targetModule === 'billboards'
                ? pickFirstNumber(record?.daily_rent, record?.monthly_rent, record?.print_cost, record?.sell_price)
                : toSafeNumber(record?.sell_price);
              const sourceBuyPrice = targetModule === 'billboards'
                ? sourceSellPrice
                : pickFirstNumber(record?.buy_price, sourceSellPrice);
              currentRow.unit_name = currentRow.main_unit;
              currentRow.currency_label = currencyLabel;
              currentRow.buy_price = sourceBuyPrice;
              currentRow.profit_percentage = calculateProfitPercentage(sourceBuyPrice, sourceSellPrice);
              currentRow.price = sourceBuyPrice > 0
                ? calculatePriceWithProfit(currentRow.buy_price, currentRow.profit_percentage)
                : sourceSellPrice;
            }
            if (targetModule === 'billboards' && !toSafeNumber(currentRow.price)) {
              currentRow.price = toSafeNumber(record?.daily_rent);
            }
            if (isSalesPackageItems) {
              currentRow.unit_price = toSafeNumber(record?.sell_price);
              if (targetModule === 'billboards') {
                currentRow.unit_price = toSafeNumber(record?.daily_rent);
              }
            }
          }

          if (isAnyInvoiceItems && key === 'product_id') {
            if (targetModule === 'product_bundles') {
              const packageQuantity = Math.max(1, toSafeNumber(currentRow?.quantity) || 1);
              const genericShelves = getGenericShelfOptions('source_shelf_id');
              currentRow.product_id = record.id;
              currentRow.package_id = record.id;
              currentRow.package_name = record.name;
              currentRow.package_items = record.items;
              currentRow.item_kind = 'package';
              currentRow.product_type = 'package';
              currentRow.base_sub_unit = 'عدد';
              currentRow.dimension_count_original_sub_unit = null;
              currentRow.selected_product_name = record.name;
              currentRow.product_name = record.name;
              currentRow.price_list_id = null;
              currentRow.main_unit = 'عدد';
              currentRow.sub_unit = 'عدد';
              currentRow.quantity = packageQuantity;
              currentRow.sub_quantity = packageQuantity;
              applyPackageInvoicePricing(currentRow, record.items, packageQuantity);
              currentRow.delivery_time = null;
              currentRow.length = null;
              currentRow.width = null;
              currentRow.start_date = null;
              currentRow.end_date = null;
              currentRow.description = buildSalesPackageDescription(record.items, packageQuantity) || currentRow.description || '';
              if (
                currentRow.source_shelf_id &&
                !genericShelves.some((item: any) => String(item?.value || '') === String(currentRow.source_shelf_id))
              ) {
                currentRow.source_shelf_id = null;
              }
            } else
            if (targetModule === 'billboards') {
              currentRow.product_type = 'service';
              currentRow.item_kind = 'product';
              clearPackageInvoicePricing(currentRow);
              currentRow.package_id = null;
              currentRow.package_name = null;
              currentRow.package_items = [];
              if (String(currentRow.description || '').trim().startsWith('\u0634\u0627\u0645\u0644:')) {
                currentRow.description = '';
              }
              currentRow.price_list_id = null;
              currentRow.main_unit = 'روز';
              currentRow.sub_unit = 'عدد';
              const billboardDisplayName = getBillboardDisplayName(record);
              currentRow.selected_product_name = billboardDisplayName || currentRow.selected_product_name || null;
              currentRow.product_name = billboardDisplayName || currentRow.product_name || null;
              currentRow.delivery_time = String(record?.delivery_time || '').trim() || null;
              if (record?.daily_rent !== undefined && record?.daily_rent !== null && String(record.daily_rent).trim() !== '') {
                currentRow.unit_price = record.daily_rent;
              }
              if (record?.width !== undefined && record?.width !== null && String(record.width).trim() !== '') {
                currentRow.length = record.width;
              }
              if (record?.height !== undefined && record?.height !== null && String(record.height).trim() !== '') {
                currentRow.width = record.height;
              }
            } else {
              currentRow.product_type = record?.product_type || currentRow.product_type || 'goods';
              currentRow.main_unit = record?.main_unit || currentRow.main_unit || null;
              currentRow.sub_unit = record?.sub_unit || currentRow.sub_unit || null;
              currentRow.item_kind = 'product';
              clearPackageInvoicePricing(currentRow);
              currentRow.package_id = null;
              currentRow.package_name = null;
              currentRow.package_items = [];
              if (String(currentRow.description || '').trim().startsWith('\u0634\u0627\u0645\u0644:')) {
                currentRow.description = '';
              }
              currentRow.base_sub_unit = null;
              currentRow.dimension_count_original_sub_unit = null;
              currentRow.selected_product_name = record?.name || currentRow.selected_product_name || null;
              currentRow.product_name = record?.name || currentRow.product_name || null;
              currentRow.delivery_time = String(record?.delivery_time || '').trim() || null;
              const matchedPriceListId = String(currentRow?.price_list_id || '').trim();
              if (matchedPriceListId) {
                const matchedItem = findPriceListItemByProduct(
                  invoicePriceLists.find((item) => item.id === matchedPriceListId)?.items,
                  String(value),
                );
                if (matchedItem) {
                  currentRow.unit_price = toSafeNumber(matchedItem?.price);
                } else {
                  currentRow.price_list_id = null;
                }
              }
              if (record?.sell_price !== undefined && record?.sell_price !== null && String(record.sell_price).trim() !== '') {
                currentRow.unit_price = currentRow.price_list_id
                  ? currentRow.unit_price
                  : toSafeNumber(record.sell_price);
              }
            }
            if (targetModule === 'billboards') {
              currentRow.base_sub_unit = null;
              currentRow.dimension_count_original_sub_unit = null;
            } else if (targetModule === 'products') {
              currentRow.base_sub_unit = currentRow.sub_unit || null;
              currentRow.dimension_count_original_sub_unit = null;
            }
            if (isServiceProduct(currentRow.product_type) && targetModule !== 'billboards') {
              currentRow.length = null;
              currentRow.width = null;
              currentRow.source_shelf_id = null;
            }
            applyInvoiceAutoQuantity(currentRow);
            syncInvoiceSubQuantity(currentRow);
          }

          if (isAnyInvoicePayments && key === 'cheque_id') {
            currentRow.cheque_status = record?.status || currentRow.cheque_status || null;
            currentRow.cheque_serial_no = record?.serial_no || null;
            currentRow.cheque_sayad_id = record?.sayad_id || null;
            currentRow.cheque_due_date = record?.due_date || null;
            currentRow.cheque_account_holder_name = record?.account_holder_name || null;
            currentRow.cheque_bank_name = record?.bank_name || null;
            currentRow.cheque_image_url = record?.image_url || null;
            if (record?.amount !== undefined && record?.amount !== null && String(record.amount).trim() !== '') {
              currentRow.amount = record.amount;
            }
            if (!currentRow.attachment && record?.image_url) {
              currentRow.attachment = record.image_url;
            }
          }

          if (isAnyInvoicePayments && key === 'barter_id') {
            currentRow.barter_status = record?.status || currentRow?.barter_status || null;
            currentRow.barter_remaining_amount = record?.remaining_amount ?? currentRow?.barter_remaining_amount ?? null;
          }

          if (isAnyInvoiceItems && key === 'product_id') {
            currentRow.source_shelf_id = null;
          }

          currentRow['total_price'] = calculateRow(currentRow, block.rowCalculationType);

          newData[index] = currentRow;
          applyRowUpdate(newData);
          if (isAnyInvoiceItems && ['product_id', 'price_list_id', 'package_id'].includes(key)) {
            bumpRowReloadVersion(String(currentRow?.key || currentRow?.id || index));
          }

          if (isInvoiceItems && key === 'product_id' && value && targetModule === 'products' && !isServiceProduct(currentRow.product_type)) {
            const rowKey = String(currentRow.key || currentRow.id || index);
            loadShelvesForRow(rowKey, String(value));
          }
          msg.success('اطلاعات بارگذاری شد');
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const buildRowsForEditing = () => {
    const preparedData = data.map((row, i) => ({
      ...normalizeRowForEdit(row),
      key: row.key || row.id || `edit_${i}`,
      total_price: calculateRow(normalizeRowForEdit(row), block.rowCalculationType),
    }));
    const withDefaults = preparedData.map((row: any) => {
      const nextRow = { ...row };
      (block.tableColumns || []).forEach((col: any) => {
        if (nextRow[col.key] === undefined && col.defaultValue !== undefined) {
          nextRow[col.key] = col.defaultValue;
        }
      });
      if (isAnyInvoiceItems) {
        if (!nextRow.discount_type) nextRow.discount_type = 'amount';
        if (!nextRow.vat_type) nextRow.vat_type = 'percent';
        if (!nextRow.product_type) nextRow.product_type = 'goods';
      }
      if (isProductStockMovements) {
        if (!nextRow.voucher_type) nextRow.voucher_type = 'incoming';
        if (!nextRow.source) nextRow.source = 'opening_balance';
        if (!nextRow.main_unit) nextRow.main_unit = currentProductUnits.mainUnit || null;
        if (!nextRow.sub_unit) nextRow.sub_unit = currentProductUnits.subUnit || null;
      }
      return nextRow;
    });
    return JSON.parse(JSON.stringify(withDefaults));
  };

  const addRow = async (baseRows?: any[]) => {
    if (isReadOnly) return;
    const editingRows = Array.isArray(baseRows) ? baseRows : tempData;
    const visibleColumns = (block.tableColumns || []).filter((c: any) =>
      (canViewField ? canViewField(c.key) !== false : true) &&
      !(isAnyInvoiceItems && c.key === 'package_id')
    );
    const colKeys = new Set(visibleColumns.map((c: any) => c.key));
    const defaults: any = {};
    visibleColumns.forEach((col: any) => {
      const fieldDefault = getImplicitCreateDefaultValue(col);
      if (fieldDefault !== undefined) defaults[col.key] = fieldDefault;
    });

    const numericDefaults: any = {};
    if (colKeys.has('quantity')) numericDefaults.quantity = 1;
    if (colKeys.has('unit_price')) numericDefaults.unit_price = 0;
    if (colKeys.has('buy_price')) numericDefaults.buy_price = 0;
    if (colKeys.has('profit_percentage')) numericDefaults.profit_percentage = 0;
    if (colKeys.has('discount')) numericDefaults.discount = 0;
    if (colKeys.has('vat')) numericDefaults.vat = 0;
    if (colKeys.has('total_price')) numericDefaults.total_price = 0;
    if (isAnyInvoiceItems) {
      numericDefaults.discount_type = 'amount';
      numericDefaults.vat_type = 'percent';
      numericDefaults.product_type = 'goods';
      numericDefaults.dimension_count = 1;
      numericDefaults.dimension_count_to_sub_quantity = false;
    }
    if (isPurchaseInvoicePayments) {
      numericDefaults.use_existing_received_cheque = false;
    }

    const newRow = {
      key: createLocalRowKey(),
      ...numericDefaults,
      ...defaults,
    };

    if (isPriceListItems) {
      newRow.currency_label = currencyLabel;
    }

    if (isProductStockMovements) {
      newRow.voucher_type = newRow.voucher_type || 'incoming';
      newRow.source = newRow.source || 'opening_balance';
      newRow.main_unit = newRow.main_unit || currentProductUnits.mainUnit || null;
      newRow.sub_unit = newRow.sub_unit || currentProductUnits.subUnit || null;
      newRow.main_quantity = parseFloat(newRow.main_quantity) || 0;
      newRow.sub_quantity = parseFloat(newRow.sub_quantity) || 0;
    }

    if (isOperationalPayments) {
      newRow.date = newRow.date || getTodayLocalDateValue();
      if (!newRow.status) {
        const statusColumn = visibleColumns.find((col: any) => String(col?.key || '') === 'status');
        const firstStatus = Array.isArray(statusColumn?.options)
          ? statusColumn.options.find((option: any) => option?.value !== undefined)?.value
          : undefined;
        if (firstStatus !== undefined) newRow.status = firstStatus;
      }
      if (colKeys.has('responsible_id') && !newRow.responsible_id) {
        try {
          const authUser = await getCachedAuthUser(supabase);
          const currentUserId = authUser?.id || null;
          if (currentUserId) {
            newRow.responsible_id = currentUserId;
          }
        } catch (error) {
          if (!isAbortLikeError(error)) {
            console.warn('Could not set default payment responsible user', error);
          }
        }
      }
      if (!toSafeNumber(newRow.amount)) {
        try {
          const remainingAmount = await getPaymentBlockDefaultAmount(Array.isArray(editingRows) ? editingRows : []);
          if (remainingAmount > 0) {
            newRow.amount = remainingAmount;
          }
        } catch (error) {
          if (!isAbortLikeError(error)) {
            console.warn('Could not set default payment amount from remaining balance', error);
          }
        }
      }
      if (isAnyInvoicePayments) {
        const accountField = isInvoicePayments ? 'target_account' : 'source_account';
        const parentAccountValue = String(parentValues?.[accountField] || '').trim();
        if (parentAccountValue && !String(newRow[accountField] || '').trim()) {
          newRow[accountField] = parentAccountValue;
        }
      }
      newRow.row_key = ensurePaymentRowKey(newRow);
    }

    const newData = normalizePaymentRows([...editingRows, newRow]);
    setTempData(newData);
    if (mode === 'local' && onChange) onChange(newData);
  };

  const removeRow = (index: number) => {
    if (isReadOnly) return;
    if (isProductStockMovements && tempData[index]?._readonly) return;
    if (isOperationalPayments) {
      const row = tempData[index];
      if (
        row?._readonly === true
        || row?._lockedByGateway === true
        || row?.locked === true
        || String(row?.source || '').trim() === 'online_gateway'
        || String(row?.gateway_transaction_id || '').trim() !== ''
      ) return;
    }
    const newData = normalizePaymentRows([...tempData]);
    newData.splice(index, 1);
    setTempData(newData);
    if (mode === 'local' && onChange) onChange(newData);
  };

  const moveRow = (fromIndex: number, direction: 'up' | 'down') => {
    if (isReadOnly) return;
    const source = isEditing ? tempData : data;
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= source.length) return;
    const nextRows = normalizePaymentRows([...source]);
    const [movedRow] = nextRows.splice(fromIndex, 1);
    nextRows.splice(toIndex, 0, movedRow);
    if (isEditing) setTempData(nextRows);
    else setData(nextRows);
    if (mode === 'local' && onChange) onChange(nextRows);
  };

  const copyRow = (index: number) => {
    if (isReadOnly) return;
    const source = isEditing ? tempData : data;
    const sourceRow = source[index];
    if (!sourceRow) return;
    if (isProductStockMovements && sourceRow?._readonly) return;
    if (
      isOperationalPayments
      && (
        sourceRow?._readonly === true
        || sourceRow?._lockedByGateway === true
        || sourceRow?.locked === true
        || String(sourceRow?.source || '').trim() === 'online_gateway'
        || String(sourceRow?.gateway_transaction_id || '').trim() !== ''
      )
    ) return;

    const copiedRow = {
      ...sourceRow,
      key: createLocalRowKey(),
    };
    if (isOperationalPayments) {
      copiedRow.row_key = createLocalRowKey();
      copiedRow._cash_bank_operation_id = null;
      copiedRow._barter_allocation_key = null;
    }
    const newData = [...source];
    newData.splice(index + 1, 0, copiedRow);
    const normalizedRows = normalizePaymentRows(newData);
    if (isEditing) setTempData(normalizedRows);
    else setData(normalizedRows);
    if (mode === 'local' && onChange) onChange(normalizedRows);
  };

  const normalizeRowForEdit = (row: any) => {
    const nextRow = sanitizeOperationalPaymentRow({ ...row });
    (block.tableColumns || []).forEach((col: any) => {
      const key = String(col?.key || '');
      if (!key || !(key in nextRow)) return;
      const value = nextRow[key];
      if (value === null || value === undefined) return;

      const isNumeric = [
        FieldType.NUMBER,
        FieldType.PRICE,
        FieldType.PERCENTAGE,
        FieldType.PERCENTAGE_OR_AMOUNT,
        FieldType.STOCK,
      ].includes(col?.type);

      if (isNumeric) {
        const normalized = normalizeNumericString(value);
        nextRow[key] = normalized === '' ? null : normalized;
        return;
      }

      if ([FieldType.SELECT, FieldType.STATUS, FieldType.RELATION].includes(col?.type)) {
        nextRow[key] = String(value);
      }
    });

    if (isAnyInvoiceItems) {
      applyInvoiceAutoQuantity(nextRow);
      if (shouldAutoSubQuantity(nextRow)) {
        const qtyMain = toSafeNumber(nextRow?.quantity);
        const mainUnit = String(nextRow?.main_unit || '');
        const subUnit = String(nextRow?.sub_unit || '');
        if (mainUnit && subUnit) {
          const converted = convertArea(qtyMain, mainUnit as any, subUnit as any);
          nextRow.sub_quantity = Number.isFinite(converted) ? converted : 0;
        }
      }
    }

    return nextRow;
  };

  const startEdit = () => {
    if (isReadOnly) return;
    setUserToggledCollapse(true);
    setIsCollapsed(false);
    setIsEditing(true);
    setTempData(buildRowsForEditing());
  };

  const addPaymentFromHeader = async () => {
    if (isReadOnly) return;
    if (!isEditing) {
      setUserToggledCollapse(true);
      setIsCollapsed(false);
      setIsEditing(true);
      const baseRows = buildRowsForEditing();
      await addRow(baseRows);
      return;
    }
    await addRow();
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setTempData([]);
  };

  const syncInvoiceCustomerStats = async () => {
    if (!moduleId || moduleId !== 'invoices' || !recordId) return;
    if (!(block?.id === 'payments' || block?.id === 'invoiceItems')) return;
    const { data: invoiceRow, error } = await supabase
      .from('invoices')
      .select('customer_id')
      .eq('id', recordId)
      .maybeSingle();
    if (error) throw error;
    await syncCustomerLevelsByInvoiceCustomers({
      supabase: supabase as any,
      customerIds: [invoiceRow?.customer_id],
    });
  };

  const PAYMENT_INCLUDED_STATUSES = new Set(['received', 'paid', 'approved', 'cleared']);
  const normalizePaymentStatus = (value: any) => String(value || '').trim().toLowerCase();
  const calculateFinancialFields = (
    itemRows: any[],
    paymentRows: any[],
    config: {
      rowCalculationType: RowCalculationType;
      totalField: string;
      paidField: string;
      remainingField: string;
      globalDiscountType?: 'percent' | 'amount';
      globalDiscountValue?: number;
    }
  ) => {
    const subtotalAmount = (Array.isArray(itemRows) ? itemRows : []).reduce((sum: number, row: any) => {
      const rowTotal = parseFloat(row?.total_price);
      if (Number.isFinite(rowTotal)) return sum + rowTotal;
      return sum + calculateRow(row || {}, config.rowCalculationType);
    }, 0);
    const globalDiscountAmount = resolveInvoiceGlobalDiscountAmount(
      subtotalAmount,
      config.globalDiscountType || 'amount',
      config.globalDiscountValue || 0
    );
    const totalAmount = Math.max(0, roundMoney(subtotalAmount - globalDiscountAmount));

    const hasStatusColumn = (Array.isArray(paymentRows) ? paymentRows : [])
      .some((row: any) => row && Object.prototype.hasOwnProperty.call(row, 'status'));
    const totalPaidAmount = (Array.isArray(paymentRows) ? paymentRows : []).reduce((sum: number, row: any) => {
      const normalizedStatus = normalizePaymentStatus(row?.status);
      if (hasStatusColumn && normalizedStatus && !PAYMENT_INCLUDED_STATUSES.has(normalizedStatus)) return sum;
      return sum + Math.abs(toSafeNumber(row?.amount));
    }, 0);

    return {
      [config.totalField]: totalAmount,
      [config.paidField]: totalPaidAmount,
      [config.remainingField]: totalAmount - totalPaidAmount,
    };
  };

  const calculateInvoiceFinancialFields = (
    invoiceItemsRows: any[],
    paymentRows: any[],
    globalDiscountType: 'percent' | 'amount' = currentInvoiceGlobalDiscountType,
    globalDiscountValue: number = currentInvoiceGlobalDiscountValue
  ) => calculateFinancialFields(
    invoiceItemsRows,
    paymentRows,
    {
      rowCalculationType: RowCalculationType.INVOICE_ROW,
      totalField: 'total_invoice_amount',
      paidField: 'total_received_amount',
      remainingField: 'remaining_balance',
      globalDiscountType,
      globalDiscountValue,
    }
  );

  const calculateExpenseFinancialFields = (expenseRows: any[], paymentRows: any[]) => calculateFinancialFields(
    expenseRows,
    paymentRows,
    {
      rowCalculationType: RowCalculationType.SIMPLE_MULTIPLY,
      totalField: 'total_amount',
      paidField: 'paid_amount',
      remainingField: 'remaining_amount',
    }
  );

  const getPaymentBlockDefaultAmount = async (currentRows: any[]) => {
    if (!moduleId || !recordId || !isOperationalPayments) return 0;

    const paidAmount = currentRows.reduce((sum, paymentRow) => (
      PAYMENT_INCLUDED_STATUSES.has(normalizePaymentStatus(paymentRow?.status))
        ? sum + toSafeNumber(paymentRow?.amount)
        : sum
    ), 0);

    if (moduleId === 'invoices' || moduleId === 'purchase_invoices') {
      const { data: row, error } = await supabase
        .from(moduleId)
        .select('total_invoice_amount')
        .eq('id', recordId)
        .maybeSingle();
      if (error) throw error;
      const totalAmount = toSafeNumber(row?.total_invoice_amount);
      return Math.max(0, roundMoney(totalAmount - paidAmount));
    }

    if (moduleId === 'expense_documents') {
      const { data: row, error } = await supabase
        .from('expense_documents')
        .select('total_amount')
        .eq('id', recordId)
        .maybeSingle();
      if (error) throw error;
      const totalAmount = toSafeNumber(row?.total_amount);
      return Math.max(0, roundMoney(totalAmount - paidAmount));
    }

    if (moduleId === 'employee_advances') {
      const { data: row, error } = await supabase
        .from('employee_advances')
        .select('amount')
        .eq('id', recordId)
        .maybeSingle();
      if (error) throw error;
      const totalAmount = toSafeNumber(row?.amount);
      return Math.max(0, roundMoney(totalAmount - paidAmount));
    }

    if (moduleId === 'payroll_slips') {
      const { data: row, error } = await supabase
        .from('payroll_slips')
        .select('net_amount')
        .eq('id', recordId)
        .maybeSingle();
      if (error) throw error;
      const totalAmount = toSafeNumber(row?.net_amount);
      return Math.max(0, roundMoney(totalAmount - paidAmount));
    }

    return 0;
  };

  const syncPaymentRowsWithCheques = async (rows: any[], previousRows: any[] = []) => {
    if (!isOperationalPayments || !moduleId || !recordId) return normalizePaymentRows(rows);

    if (
      isAnyInvoicePayments
      && !(await hasIssuedInvoiceAccountingEntries({ supabase, moduleId, recordId }))
    ) {
      return normalizePaymentRows(rows);
    }

    const normalizedRows = normalizePaymentRows(rows);
    const normalizedPreviousRows = normalizePaymentRows(previousRows);
    const accountField = isInvoicePayments ? 'target_account' : 'source_account';
    const operationType = isInvoicePayments ? 'receipt' : 'payment';
    const sourceDateField =
      moduleId === 'expense_documents' ? 'expense_date'
      : moduleId === 'employee_advances' ? 'request_date'
      : moduleId === 'payroll_slips' ? 'period_end'
      : 'invoice_date';

    const { data: sourceHeader, error: sourceError } = await supabase
      .from(moduleId)
      .select('*')
      .eq('id', recordId)
      .maybeSingle();
    if (sourceError) throw sourceError;

    const sourceHeaderRecord = sourceHeader as Record<string, any> | null;
    const customerId = sourceHeaderRecord?.customer_id ? String(sourceHeaderRecord.customer_id) : null;
    const supplierId = sourceHeaderRecord?.supplier_id ? String(sourceHeaderRecord.supplier_id) : null;
    const sourceEmployeeId = sourceHeaderRecord?.employee_id ? String(sourceHeaderRecord.employee_id) : null;
    const defaultAssigneeId = sourceHeaderRecord?.assignee_id ? String(sourceHeaderRecord.assignee_id) : null;
    let sourceEmployeeProfileId: string | null = null;
    if ((isEmployeeAdvancePayments || isPayrollPayments) && sourceEmployeeId) {
      const { data: sourceEmployeeRecord, error: sourceEmployeeError } = await supabase
        .from('employees')
        .select('related_profile_id')
        .eq('id', sourceEmployeeId)
        .maybeSingle();
      if (sourceEmployeeError) throw sourceEmployeeError;
      sourceEmployeeProfileId = String(sourceEmployeeRecord?.related_profile_id || '').trim() || null;
    }
    const partyId = isInvoicePayments ? customerId : isPurchaseInvoicePayments ? supplierId : null;
    const partyType = isInvoicePayments ? 'customer' : 'supplier';
    const sourceOperationDate = sourceHeaderRecord?.[sourceDateField] || getTodayLocalDateValue();
    const nowIso = new Date().toISOString();
    let partyBusinessName = '';
    if (partyId) {
      if (isInvoicePayments) {
        const { data: customerInfo } = await supabase
          .from('customers')
          .select('business_name, first_name, last_name')
          .eq('id', partyId)
          .maybeSingle();
        const businessName = String(customerInfo?.business_name || '').trim();
        const personName = `${String(customerInfo?.first_name || '').trim()} ${String(customerInfo?.last_name || '').trim()}`.trim();
        partyBusinessName = businessName || personName;
      } else {
        const { data: supplierInfo } = await supabase
          .from('suppliers')
          .select('business_name')
          .eq('id', partyId)
          .maybeSingle();
        partyBusinessName = String(supplierInfo?.business_name || '').trim();
      }
    }

    const bankIds = Array.from(
      new Set(
        normalizedRows
          .map((row: any) => String(row?.[accountField] || '').trim())
          .filter(Boolean)
      )
    );

    const bankMetaById = new Map<string, { bank_name: string | null; branch_name: string | null }>();
    const accountModuleById = new Map<string, 'bank_accounts' | 'cash_boxes' | 'petty_funds'>();
    if (bankIds.length > 0) {
      const { data: banks, error: banksError } = await supabase
        .from('bank_accounts')
        .select('id, bank_name, branch_name')
        .in('id', bankIds);
      if (banksError) throw banksError;
      (banks || []).forEach((bank: any) => {
        const id = String(bank?.id || '').trim();
        if (!id) return;
        accountModuleById.set(id, 'bank_accounts');
        bankMetaById.set(id, {
          bank_name: bank?.bank_name ? String(bank.bank_name) : null,
          branch_name: bank?.branch_name ? String(bank.branch_name) : null,
        });
      });

      const { data: cashBoxes, error: cashBoxesError } = await supabase
        .from('cash_boxes')
        .select('id')
        .in('id', bankIds);
      if (cashBoxesError) throw cashBoxesError;
      (cashBoxes || []).forEach((cashBox: any) => {
        const id = String(cashBox?.id || '').trim();
        if (!id || accountModuleById.has(id)) return;
        accountModuleById.set(id, 'cash_boxes');
      });

      const { data: pettyFunds, error: pettyFundsError } = await supabase
        .from('petty_funds')
        .select('id')
        .in('id', bankIds);
      if (pettyFundsError) throw pettyFundsError;
      (pettyFunds || []).forEach((pettyFund: any) => {
        const id = String(pettyFund?.id || '').trim();
        if (!id || accountModuleById.has(id)) return;
        accountModuleById.set(id, 'petty_funds');
      });
    }

    const buildTreasuryAccountPatch = (accountId: string | null) => {
      const normalizedAccountId = String(accountId || '').trim();
      const accountModule = normalizedAccountId ? accountModuleById.get(normalizedAccountId) : null;
      return {
        bank_account_id: accountModule === 'bank_accounts' ? normalizedAccountId : null,
        cash_box_id: accountModule === 'cash_boxes' ? normalizedAccountId : null,
        petty_fund_id: accountModule === 'petty_funds' ? normalizedAccountId : null,
      };
    };

    const buildCompatibleCashOperationPayload = (
      basePayload: Record<string, any>,
      currentOperationType: 'receipt' | 'payment' | 'transfer',
      accountId: string | null
    ) => {
      const normalizedAccountId = String(accountId || '').trim();
      const accountModule = normalizedAccountId ? accountModuleById.get(normalizedAccountId) : null;
      if (normalizedAccountId && !accountModule) {
        throw new Error('حساب مالی انتخاب‌شده معتبر نیست یا در ماژول نقد و بانک پیدا نشد.');
      }

      return transformModulePayloadForSave(
        'cash_bank_operations',
        {
          ...basePayload,
          ...buildTreasuryAccountPatch(accountId),
          payment_account_id: currentOperationType === 'payment' ? normalizedAccountId : null,
          receipt_account_id: currentOperationType === 'receipt' ? normalizedAccountId : null,
        },
        {
          payment_account_id:
            currentOperationType === 'payment' && normalizedAccountId && accountModule
              ? [{ value: normalizedAccountId, module: accountModule }]
              : [],
          receipt_account_id:
            currentOperationType === 'receipt' && normalizedAccountId && accountModule
              ? [{ value: normalizedAccountId, module: accountModule }]
              : [],
        }
      );
    };

    const selectedChequeIds = Array.from(
        new Set(
          normalizedRows
          .filter((row: any) => normalizeCashBankPaymentType(row?.payment_type) === 'cheque')
          .flatMap((row: any) => {
            const directChequeId = String(row?.cheque_id || '').trim();
            const spentChequeId = String(row?.spent_cheque_id || '').trim();
            return [directChequeId, spentChequeId].filter(Boolean);
          })
      )
    );

    const selectedChequeById = new Map<string, any>();
    if (selectedChequeIds.length > 0) {
      const { data: selectedCheques, error: selectedChequesError } = await supabase
        .from('cheques')
        .select('id, cheque_type, status, serial_no, sayad_id, due_date, bank_name, account_holder_name, image_url, metadata')
        .in('id', selectedChequeIds);
      if (selectedChequesError) throw selectedChequesError;
      (selectedCheques || []).forEach((cheque: any) => {
        selectedChequeById.set(String(cheque.id), cheque);
      });
    }

    const selectedBarterIds = Array.from(
      new Set(
        normalizedRows
          .flatMap((row: any) => {
            const directBarterId = String(row?.barter_id || '').trim();
            const syncedBarterId = String(row?._barter_synced_id || '').trim();
            return [directBarterId, syncedBarterId].filter(Boolean);
          })
      )
    );
    const selectedBarterById = new Map<string, any>();
    if (selectedBarterIds.length > 0) {
      const { data: selectedBarters, error: selectedBartersError } = await supabase
        .from('barters')
        .select('id, name, status, initial_amount, spent_amount, remaining_amount, customer_id, supplier_id, employee_id, allocations, metadata')
        .in('id', selectedBarterIds);
      if (selectedBartersError) throw selectedBartersError;
      (selectedBarters || []).forEach((barter: any) => {
        selectedBarterById.set(String(barter.id), barter);
      });
    }

    const applyBarterDelta = async (barterId: string, deltaSpend: number, metadataPatch?: Record<string, any>) => {
      const resolvedId = String(barterId || '').trim();
      if (!resolvedId) throw new Error('شناسه تهاتر نامعتبر است.');
      const current = selectedBarterById.get(resolvedId);
      if (!current) throw new Error('تهاتر انتخاب‌شده یافت نشد.');
      const initialAmount = toSafeNumber(current?.initial_amount);
      const spentAmount = toSafeNumber(current?.spent_amount);
      const nextSpent = Math.max(0, spentAmount + deltaSpend);
      if (nextSpent > initialAmount) {
        throw new Error('مانده تهاتر برای این مبلغ کافی نیست.');
      }
      const nextRemaining = Math.max(0, initialAmount - nextSpent);
      const nextStatus = nextRemaining <= 0 ? 'closed' : nextSpent > 0 ? 'partial' : 'open';
      const nextMetadata = {
        ...((current?.metadata && typeof current.metadata === 'object') ? current.metadata : {}),
        ...(metadataPatch || {}),
      };

      const { error: updateError } = await supabase
        .from('barters')
        .update({
          spent_amount: nextSpent,
          remaining_amount: nextRemaining,
          status: nextStatus,
          metadata: nextMetadata,
          updated_at: nowIso,
        })
        .eq('id', resolvedId);
      if (updateError) throw updateError;

      const nextRow = {
        ...current,
        spent_amount: nextSpent,
        remaining_amount: nextRemaining,
        status: nextStatus,
        metadata: nextMetadata,
      };
      selectedBarterById.set(resolvedId, nextRow);
      return nextRow;
    };

    const normalizeAllocationRows = (value: any) => {
      if (!Array.isArray(value)) return [] as Record<string, any>[];
      return value.filter((item) => item && typeof item === 'object');
    };

    const syncBarterAllocation = async (args: {
      barterId: string | null;
      allocationKey: string;
      active: boolean;
      operationType: 'receipt' | 'payment';
      amount: number;
      rowStatus: string;
      rowDate: string | null;
      description?: string | null;
      attachmentUrl?: string | null;
      expenseAccountId?: string | null;
      customerId?: string | null;
      supplierId?: string | null;
      employeeId?: string | null;
    }) => {
      const resolvedBarterId = String(args.barterId || '').trim();
      if (!resolvedBarterId) return;
      const current = selectedBarterById.get(resolvedBarterId);
      if (!current) return;

      const currentAllocations = normalizeAllocationRows(current?.allocations);
      const nextAllocations = [...currentAllocations];
      const existingIndex = nextAllocations.findIndex((item) => String(item?.id || '') === args.allocationKey);

      if (args.active) {
        const allocationRow = {
          ...(existingIndex >= 0 ? nextAllocations[existingIndex] : {}),
          id: args.allocationKey,
          date: args.rowDate || sourceOperationDate || new Date().toISOString().slice(0, 10),
          operation_type: args.operationType,
          status: args.rowStatus || 'pending',
          customer_id: args.customerId || null,
          supplier_id: args.supplierId || null,
          employee_id: args.employeeId || null,
          expense_account_id: args.expenseAccountId || null,
          source_invoice_id: isInvoicePayments ? recordId : null,
          source_purchase_invoice_id: isPurchaseInvoicePayments ? recordId : null,
          amount: Math.max(0, toSafeNumber(args.amount)),
          description: args.description || null,
          attachment_url: args.attachmentUrl || null,
          source_table: moduleId,
          source_record_id: recordId,
          source_block_id: block?.id,
          updated_at: nowIso,
        };
        if (existingIndex >= 0) nextAllocations[existingIndex] = allocationRow;
        else nextAllocations.push(allocationRow);
      } else if (existingIndex >= 0) {
        nextAllocations.splice(existingIndex, 1);
      }

      if (JSON.stringify(nextAllocations) === JSON.stringify(currentAllocations)) return;

      const { error: allocationUpdateError } = await supabase
        .from('barters')
        .update({
          allocations: nextAllocations,
          updated_at: nowIso,
        })
        .eq('id', resolvedBarterId);
      if (allocationUpdateError) throw allocationUpdateError;

      selectedBarterById.set(resolvedBarterId, {
        ...current,
        allocations: nextAllocations,
      });
    };

    const selectedCashOperationIds = Array.from(
      new Set(
        [...normalizedRows, ...normalizedPreviousRows]
          .map((row: any) => String(row?._cash_bank_operation_id || '').trim())
          .filter(Boolean)
      )
    );
    const selectedCashOperationById = new Map<string, any>();
    if (selectedCashOperationIds.length > 0) {
      const { data: selectedOperations, error: selectedOperationsError } = await supabase
        .from('cash_bank_operations')
        .select('id, metadata')
        .in('id', selectedCashOperationIds);
      if (selectedOperationsError) throw selectedOperationsError;
      (selectedOperations || []).forEach((operation: any) => {
        selectedCashOperationById.set(String(operation.id), operation);
      });
    }

    const getSourceLinkPayload = () => ({
      sales_invoice_id: isInvoicePayments ? recordId : null,
      purchase_invoice_id: isPurchaseInvoicePayments ? recordId : null,
      expense_document_id: isExpensePayments ? recordId : null,
      employee_advance_id: isEmployeeAdvancePayments ? recordId : null,
      payroll_slip_id: isPayrollPayments ? recordId : null,
    });

    const buildCashOperationMetadata = (rowKey: string, baseMetadata?: any, extraMetadata?: Record<string, any>) => ({
      ...((baseMetadata && typeof baseMetadata === 'object') ? baseMetadata : {}),
      ...(extraMetadata || {}),
      source_table: moduleId,
      source_record_id: recordId,
      source_block_id: block?.id,
      source_row_key: rowKey,
      is_auto_generated: true,
    });

    const syncCashBankOperation = async (args: {
      row: any;
      nextRow: any;
      rowKey: string;
      paymentType: string;
      amount: number;
      rowStatus: string;
      accountId: string | null;
      issueDate: string | null;
      attachmentUrl?: string | null;
      barterId?: string | null;
      chequeId?: string | null;
      assigneeId?: string | null;
      cancel?: boolean;
    }) => {
      const {
        row,
        nextRow,
        rowKey,
        paymentType,
        amount,
        rowStatus,
        accountId,
        issueDate,
        attachmentUrl,
        barterId,
        chequeId,
        assigneeId,
        cancel = false,
      } = args;
      const existingCashOperationId = String(nextRow?._cash_bank_operation_id || row?._cash_bank_operation_id || '').trim();
      const existingMetadata = selectedCashOperationById.get(existingCashOperationId)?.metadata;
      const rowTags = normalizeRowTags(nextRow?.tags ?? row?.tags);

      if (cancel || !paymentType || amount <= 0) {
        if (existingCashOperationId) {
          const { error: cancelOperationError } = await supabase
            .from('cash_bank_operations')
            .update({
              status: 'canceled',
              metadata: buildCashOperationMetadata(rowKey, existingMetadata),
              updated_at: nowIso,
            })
            .eq('id', existingCashOperationId);
          if (cancelOperationError) throw cancelOperationError;
        }
        nextRow._cash_bank_operation_id = existingCashOperationId || null;
        return;
      }

      const operationPayload = buildCompatibleCashOperationPayload({
        operation_type: operationType,
        payment_type: paymentType,
        status: rowStatus,
        operation_date: issueDate || sourceOperationDate || getTodayLocalDateValue(),
        amount,
        customer_id: customerId,
        supplier_id: supplierId,
        assignee_id: assigneeId || null,
        assignee_type: assigneeId ? 'user' : null,
        assignee_role_id: null,
        employee_id: isEmployeeAdvancePayments || isPayrollPayments ? sourceEmployeeProfileId : null,
        description: row?.description || null,
        image_url: attachmentUrl || null,
        attachment_url: attachmentUrl || null,
        tags: rowTags,
        barter_id: barterId ? String(barterId) : null,
        cheque_id: chequeId ? String(chequeId) : null,
        metadata: buildCashOperationMetadata(rowKey, existingMetadata),
        updated_at: nowIso,
        ...getSourceLinkPayload(),
      }, operationType as 'receipt' | 'payment' | 'transfer', accountId);

      if (existingCashOperationId) {
        const updateOperationResult = await runWriteWithCompatiblePayload<null>({
          cacheKey: 'cash-bank-operations:update:auto',
          payload: operationPayload,
          execute: (compatiblePayload) =>
            supabase
              .from('cash_bank_operations')
              .update(compatiblePayload)
              .eq('id', existingCashOperationId),
        });
        if (updateOperationResult.error) throw updateOperationResult.error;
        await syncRecordTags(supabase, 'cash_bank_operations', existingCashOperationId, rowTags);
        nextRow._cash_bank_operation_id = existingCashOperationId;
        return;
      }

      const insertOperationResult = await runWriteWithCompatiblePayload<any>({
        cacheKey: 'cash-bank-operations:insert:auto',
        payload: operationPayload,
        execute: (compatiblePayload) =>
          supabase
            .from('cash_bank_operations')
            .insert(compatiblePayload)
            .select('id')
            .single(),
      });
      if (insertOperationResult.error) throw insertOperationResult.error;
      const insertedOperation = insertOperationResult.data;
      const insertedOperationId = String(insertedOperation?.id || '').trim() || null;
      nextRow._cash_bank_operation_id = insertedOperationId;
      if (insertedOperationId) {
        await syncRecordTags(supabase, 'cash_bank_operations', insertedOperationId, rowTags);
        selectedCashOperationById.set(insertedOperationId, {
          id: insertedOperationId,
          metadata: operationPayload.metadata || {},
        });
      }
    };

    const nextRows: any[] = [];
    for (let rowIndex = 0; rowIndex < normalizedRows.length; rowIndex += 1) {
      const row = normalizedRows[rowIndex];
      const nextRow = { ...row };
      const paymentType = normalizeCashBankPaymentType(row?.payment_type) || '';
      if (paymentType && String(nextRow?.payment_type || '').trim() !== paymentType) {
        nextRow.payment_type = paymentType;
      }
      const rowStatusRaw = String(row?.status || '').trim().toLowerCase();
      const rowStatus = ['pending', 'received', 'approved', 'returned', 'canceled'].includes(rowStatusRaw) ? rowStatusRaw : 'pending';
      const accountId = String(row?.[accountField] || '').trim() || null;
      const amount = Math.abs(toSafeNumber(row?.amount));
      const issueDate = row?.date || null;
      const dueDate = row?.cheque_due_date || row?.date || null;
      const bankMeta = accountId ? bankMetaById.get(accountId) : null;
      const syncedBarterId = String(row?._barter_synced_id || '').trim();
      const syncedBarterAmount = Math.abs(toSafeNumber(row?._barter_synced_amount || 0));
      const existingCashOperationId = String(row?._cash_bank_operation_id || '').trim();
      const existingAllocationKey = String(row?._barter_allocation_key || '').trim();
      const rowKey = String(nextRow?.row_key || row?.row_key || '').trim() || ensurePaymentRowKey(row);
      nextRow.row_key = rowKey;
      const allocationKey = existingAllocationKey || rowKey;

      const syncCashBankBarterOperation = async (linkedBarterId?: string | null) => {
        if (paymentType !== 'barter' || amount <= 0) {
          await syncCashBankOperation({
            row,
            nextRow,
            rowKey,
            paymentType: 'barter',
            amount,
            rowStatus,
            accountId,
            issueDate,
            attachmentUrl: row?.attachment || null,
            barterId: linkedBarterId || null,
            assigneeId: String(row?.responsible_id || defaultAssigneeId || '').trim() || null,
            cancel: true,
          });
          return;
        }

        const operationPayload = buildCompatibleCashOperationPayload({
          operation_type: operationType,
          payment_type: 'barter',
          barter_id: linkedBarterId ? String(linkedBarterId) : null,
          status: rowStatus,
          operation_date: issueDate || sourceOperationDate || new Date().toISOString().slice(0, 10),
          amount,
          customer_id: customerId,
          supplier_id: supplierId,
          assignee_id: String(row?.responsible_id || defaultAssigneeId || '').trim() || null,
          assignee_type: String(row?.responsible_id || defaultAssigneeId || '').trim() ? 'user' : null,
          assignee_role_id: null,
          employee_id: isEmployeeAdvancePayments || isPayrollPayments ? sourceEmployeeProfileId : null,
          description: row?.description || null,
          image_url: row?.attachment || null,
          attachment_url: row?.attachment || null,
          tags: normalizeRowTags(nextRow?.tags ?? row?.tags),
          metadata: {
            ...(selectedCashOperationById.get(existingCashOperationId)?.metadata || {}),
            source_table: moduleId,
            source_record_id: recordId,
            source_block_id: block?.id,
            source_row_key: rowKey,
            is_auto_generated: true,
          },
          updated_at: nowIso,
          ...getSourceLinkPayload(),
        }, operationType as 'receipt' | 'payment' | 'transfer', accountId);

        if (existingCashOperationId) {
          const updateOperationResult = await runWriteWithCompatiblePayload<null>({
            cacheKey: 'cash-bank-operations:update:barter',
            payload: operationPayload,
            execute: (compatiblePayload) =>
              supabase
                .from('cash_bank_operations')
                .update(compatiblePayload)
                .eq('id', existingCashOperationId),
          });
          if (updateOperationResult.error) throw updateOperationResult.error;
          await syncRecordTags(supabase, 'cash_bank_operations', existingCashOperationId, normalizeRowTags(nextRow?.tags ?? row?.tags));
          nextRow._cash_bank_operation_id = existingCashOperationId;
          return;
        }

        const insertOperationResult = await runWriteWithCompatiblePayload<any>({
          cacheKey: 'cash-bank-operations:insert:barter',
          payload: operationPayload,
          execute: (compatiblePayload) =>
            supabase
              .from('cash_bank_operations')
              .insert(compatiblePayload)
              .select('id')
              .single(),
        });
        if (insertOperationResult.error) throw insertOperationResult.error;
        const insertedOperation = insertOperationResult.data;
        nextRow._cash_bank_operation_id = String(insertedOperation?.id || '').trim() || null;
        if (nextRow._cash_bank_operation_id) {
          await syncRecordTags(supabase, 'cash_bank_operations', nextRow._cash_bank_operation_id, normalizeRowTags(nextRow?.tags ?? row?.tags));
        }
      };

      if (isPurchaseInvoicePayments && paymentType !== 'barter' && syncedBarterId && syncedBarterAmount > 0) {
        await applyBarterDelta(syncedBarterId, -syncedBarterAmount, {
          last_spend_source_table: moduleId,
          last_spend_source_record_id: recordId,
          last_spend_rollback_at: nowIso,
        });
      }

      if (paymentType !== 'barter') {
        if (syncedBarterId) {
          await syncBarterAllocation({
            barterId: syncedBarterId,
            allocationKey,
            active: false,
            operationType: isInvoicePayments ? 'receipt' : 'payment',
            amount,
            rowStatus,
            rowDate: issueDate || sourceHeaderRecord?.invoice_date || null,
          });
        }
        await syncCashBankBarterOperation(null);
        nextRow.barter_id = null;
        nextRow.barter_status = null;
        nextRow.barter_remaining_amount = null;
        nextRow._barter_synced_id = null;
        nextRow._barter_synced_amount = null;
        nextRow._auto_barter = false;
        nextRow._barter_allocation_key = null;
      }

      if (paymentType === 'barter') {
        nextRow.use_existing_received_cheque = false;
        nextRow.spent_cheque_id = null;
        nextRow.cheque_id = null;
        nextRow.cheque_status = null;
        nextRow.cheque_serial_no = null;
        nextRow.cheque_sayad_id = null;
        nextRow.cheque_due_date = null;
        nextRow.cheque_account_holder_name = null;
        nextRow.cheque_bank_name = null;
        nextRow.cheque_image_url = null;
        nextRow._auto_cheque = false;

        let selectedBarterId = String(row?.barter_id || syncedBarterId || '').trim();
        const shouldCreateReceivedBarter = isInvoicePayments && rowStatus === 'received' && amount > 0;
        const shouldApplyPurchaseSpend = isPurchaseInvoicePayments && rowStatus === 'received' && amount > 0;
        nextRow._barter_allocation_key = allocationKey;

        if (isInvoicePayments && !shouldCreateReceivedBarter) {
          if (selectedBarterId) {
            await syncBarterAllocation({
              barterId: selectedBarterId,
              allocationKey,
              active: false,
              operationType: 'receipt',
              amount,
              rowStatus,
              rowDate: issueDate || sourceHeaderRecord?.invoice_date || null,
            });
          }
          if (selectedBarterId && !!row?._auto_barter) {
            const currentAutoBarter = selectedBarterById.get(selectedBarterId);
            const currentSpent = toSafeNumber(currentAutoBarter?.spent_amount);
            if (currentSpent > 0.000001) {
              throw new Error('این ردیف تهاتر قبلا مصرف شده است و امکان تغییر وضعیت از حالت دریافت‌شده وجود ندارد.');
            }
            if (currentSpent <= 0.000001) {
              const { error: cancelAutoBarterError } = await supabase
                .from('barters')
                .update({
                  status: 'canceled',
                  updated_at: nowIso,
                })
                .eq('id', selectedBarterId);
              if (cancelAutoBarterError) throw cancelAutoBarterError;
            }
          }
          nextRow.barter_id = null;
          nextRow.barter_status = null;
          nextRow.barter_remaining_amount = null;
          nextRow._barter_synced_id = null;
          nextRow._barter_synced_amount = 0;
          nextRow._auto_barter = false;
          nextRow._barter_allocation_key = null;
          await syncCashBankBarterOperation(null);
          nextRows.push(nextRow);
          continue;
        }

        if (isInvoicePayments && shouldCreateReceivedBarter && !selectedBarterId) {
          const sourceName = String(sourceHeaderRecord?.name || sourceHeaderRecord?.system_code || '').trim();
          const businessLabel = String(partyBusinessName || '').trim();
          const autoName = businessLabel
            ? `تهاتر خرید از ${businessLabel}`
            : (sourceName ? `تهاتر خرید از ${sourceName}` : `تهاتر خرید از مشتری`);
          const newBarterPayload = {
            name: autoName,
            barter_date: issueDate || sourceHeaderRecord?.invoice_date || null,
            barter_type: 'incoming',
            status: amount > 0 ? 'open' : 'closed',
            initial_amount: amount,
            spent_amount: 0,
            remaining_amount: amount,
            customer_id: partyType === 'customer' ? partyId : null,
            supplier_id: partyType === 'supplier' ? partyId : null,
            employee_id: null,
            source_invoice_id: isInvoicePayments ? recordId : null,
            source_purchase_invoice_id: isPurchaseInvoicePayments ? recordId : null,
            notes: row?.description || null,
            attachment_url: row?.attachment || null,
            metadata: {
              auto_generated_from: {
                table: moduleId,
                record_id: recordId,
                block: block?.id,
              },
            },
          };
          const { data: insertedBarter, error: insertBarterError } = await supabase
            .from('barters')
            .insert(newBarterPayload)
            .select('id, name, status, initial_amount, spent_amount, remaining_amount, customer_id, supplier_id, employee_id, allocations, metadata')
            .single();
          if (insertBarterError) throw insertBarterError;
          selectedBarterId = String(insertedBarter?.id || '').trim();
          if (!selectedBarterId) throw new Error('تهاتر جدید ایجاد شد اما شناسه معتبر ندارد.');
          selectedBarterById.set(selectedBarterId, insertedBarter);
          nextRow._auto_barter = true;
        }

        if (isInvoicePayments) {
          if (!selectedBarterId) {
            throw new Error('برای ثبت دریافت تهاتر، شناسه تهاتر معتبر یافت نشد.');
          }
          const selectedBarter = selectedBarterById.get(selectedBarterId);
          if (!selectedBarter) {
            throw new Error('تهاتر انتخاب‌شده یافت نشد.');
          }
          const barterMetadata =
            selectedBarter?.metadata && typeof selectedBarter.metadata === 'object'
              ? { ...selectedBarter.metadata }
              : {};
          const autoSource = barterMetadata?.auto_generated_from || {};
          const isAutoManaged =
            !!row?._auto_barter ||
            (String(autoSource?.table || '').trim() === String(moduleId) &&
              String(autoSource?.record_id || '').trim() === String(recordId));
          let syncedBarter = selectedBarter;

          if (isAutoManaged) {
            const currentSpent = toSafeNumber(selectedBarter?.spent_amount);
            if (currentSpent > amount) {
              throw new Error('مبلغ تهاتر نمی‌تواند کمتر از مصرف‌شده فعلی باشد.');
            }
            const nextInitialAmount = amount;
            const nextRemaining = Math.max(0, nextInitialAmount - currentSpent);
            const nextStatus = nextRemaining <= 0 ? 'closed' : currentSpent > 0 ? 'partial' : 'open';
            const nextMetadata = {
              ...barterMetadata,
              auto_generated_from: {
                table: moduleId,
                record_id: recordId,
                block: block?.id,
              },
            };
            const { error: updateBarterError } = await supabase
              .from('barters')
              .update({
                initial_amount: nextInitialAmount,
                remaining_amount: nextRemaining,
                status: nextStatus,
                employee_id: null,
                metadata: nextMetadata,
                updated_at: nowIso,
              })
              .eq('id', selectedBarterId);
            if (updateBarterError) throw updateBarterError;
            syncedBarter = {
              ...selectedBarter,
              initial_amount: nextInitialAmount,
              remaining_amount: nextRemaining,
              status: nextStatus,
              metadata: nextMetadata,
            };
            selectedBarterById.set(selectedBarterId, syncedBarter);
          }

          nextRow.barter_id = selectedBarterId;
          nextRow.barter_status = String(syncedBarter?.status || '');
          nextRow.barter_remaining_amount = toSafeNumber(syncedBarter?.remaining_amount);
          nextRow._barter_synced_id = selectedBarterId;
          nextRow._barter_synced_amount = 0;
          nextRow._barter_created_amount = amount;
          nextRow._auto_barter = true;
          await syncBarterAllocation({
            barterId: selectedBarterId,
            allocationKey,
            active: true,
            operationType: 'receipt',
            amount,
            rowStatus,
            rowDate: issueDate || sourceHeaderRecord?.invoice_date || null,
            description: row?.description || null,
            attachmentUrl: row?.attachment || null,
            customerId: partyType === 'customer' ? partyId : null,
            supplierId: null,
            employeeId: null,
          });
          await syncCashBankBarterOperation(selectedBarterId);
          nextRows.push(nextRow);
          continue;
        }

        if (isPurchaseInvoicePayments) {
          const previousBarterId = String(row?._barter_synced_id || '').trim();
          const previousSpentAmount = Math.abs(toSafeNumber(row?._barter_synced_amount || 0));

          if (!shouldApplyPurchaseSpend) {
            if (previousBarterId && previousSpentAmount > 0) {
              await applyBarterDelta(previousBarterId, -previousSpentAmount, {
                last_spend_source_table: moduleId,
                last_spend_source_record_id: recordId,
                last_spend_rollback_at: nowIso,
              });
            }
            if (previousBarterId) {
              await syncBarterAllocation({
                barterId: previousBarterId,
                allocationKey,
                active: false,
                operationType: 'payment',
                amount,
                rowStatus,
                rowDate: issueDate || sourceHeaderRecord?.invoice_date || null,
              });
            }
            if (selectedBarterId && selectedBarterId !== previousBarterId) {
              await syncBarterAllocation({
                barterId: selectedBarterId,
                allocationKey,
                active: false,
                operationType: 'payment',
                amount,
                rowStatus,
                rowDate: issueDate || sourceHeaderRecord?.invoice_date || null,
              });
            }
            if (selectedBarterId) {
              const selectedBarter = selectedBarterById.get(selectedBarterId);
              nextRow.barter_status = String(selectedBarter?.status || '');
              nextRow.barter_remaining_amount = toSafeNumber(selectedBarter?.remaining_amount);
            } else {
              nextRow.barter_status = null;
              nextRow.barter_remaining_amount = null;
            }
            nextRow.barter_id = selectedBarterId || null;
            nextRow._barter_synced_id = selectedBarterId || null;
            nextRow._barter_synced_amount = 0;
            nextRow._auto_barter = false;
            await syncCashBankBarterOperation(selectedBarterId || null);
            nextRows.push(nextRow);
            continue;
          }

          if (!selectedBarterId) {
            throw new Error('برای پرداخت تهاتری، انتخاب تهاتر الزامی است.');
          }
          const selectedBarter = selectedBarterById.get(selectedBarterId);
          if (!selectedBarter) {
            throw new Error('تهاتر انتخاب‌شده یافت نشد.');
          }

          if (previousBarterId && previousBarterId !== selectedBarterId && previousSpentAmount > 0) {
            await applyBarterDelta(previousBarterId, -previousSpentAmount, {
              last_spend_source_table: moduleId,
              last_spend_source_record_id: recordId,
              last_spend_rollback_at: nowIso,
            });
            await syncBarterAllocation({
              barterId: previousBarterId,
              allocationKey,
              active: false,
              operationType: 'payment',
              amount,
              rowStatus,
              rowDate: issueDate || sourceHeaderRecord?.invoice_date || null,
            });
          }

          const baselineSpent = previousBarterId === selectedBarterId ? previousSpentAmount : 0;
          const spendDelta = amount - baselineSpent;
          let syncedBarter = selectedBarter;
          if (Math.abs(spendDelta) > 0.000001) {
            syncedBarter = await applyBarterDelta(selectedBarterId, spendDelta, {
              last_spend_source_table: moduleId,
              last_spend_source_record_id: recordId,
              last_spend_amount: amount,
              last_spend_at: nowIso,
            });
          }

          nextRow.barter_id = selectedBarterId;
          nextRow.barter_status = String(syncedBarter?.status || '');
          nextRow.barter_remaining_amount = toSafeNumber(syncedBarter?.remaining_amount);
          nextRow._barter_synced_id = selectedBarterId;
          nextRow._barter_synced_amount = amount;
          nextRow._auto_barter = false;
          await syncBarterAllocation({
            barterId: selectedBarterId,
            allocationKey,
            active: true,
            operationType: 'payment',
            amount,
            rowStatus,
            rowDate: issueDate || sourceHeaderRecord?.invoice_date || null,
            description: row?.description || null,
            attachmentUrl: row?.attachment || null,
            expenseAccountId: row?.expense_account_id ? String(row.expense_account_id) : null,
            customerId: null,
            supplierId: partyType === 'supplier' ? partyId : null,
            employeeId: null,
          });
          await syncCashBankBarterOperation(selectedBarterId);
          nextRows.push(nextRow);
          continue;
        }

        await syncCashBankBarterOperation(selectedBarterId || null);
        nextRows.push(nextRow);
        continue;
      }

      if (!isAnyInvoicePayments) {
        await syncCashBankOperation({
          row,
          nextRow,
          rowKey,
          paymentType,
          amount,
          rowStatus,
          accountId,
          issueDate,
          attachmentUrl: String(nextRow?.attachment || row?.attachment || '').trim() || null,
          assigneeId: String(row?.responsible_id || defaultAssigneeId || '').trim() || null,
        });
        nextRows.push(nextRow);
        continue;
      }

      if (paymentType !== 'cheque') {
        nextRow.use_existing_received_cheque = false;
        nextRow.spent_cheque_id = null;
        nextRow.cheque_id = null;
        nextRow.cheque_status = null;
        nextRow.cheque_serial_no = null;
        nextRow.cheque_sayad_id = null;
        nextRow.cheque_due_date = null;
        nextRow.cheque_account_holder_name = null;
        nextRow.cheque_bank_name = null;
        nextRow.cheque_image_url = null;
        nextRow._auto_cheque = false;
        await syncCashBankOperation({
          row,
          nextRow,
          rowKey,
          paymentType,
          amount,
          rowStatus,
          accountId,
          issueDate,
          attachmentUrl: String(nextRow?.attachment || row?.attachment || '').trim() || null,
          assigneeId: String(row?.responsible_id || defaultAssigneeId || '').trim() || null,
        });
        nextRows.push(nextRow);
        continue;
      }

      const selectedChequeId = String(row?.cheque_id || row?.spent_cheque_id || '').trim();
      if (selectedChequeId) {
        const selectedCheque = selectedChequeById.get(selectedChequeId);
        if (!selectedCheque) {
          throw new Error('چک انتخاب‌شده یافت نشد.');
        }
        if (isPurchaseInvoicePayments && !!row?.use_existing_received_cheque && String(selectedCheque?.cheque_type || '') !== 'received') {
          throw new Error('چک انتخاب شده برای خرج چک معتبر نیست.');
        }

        const nextChequeStatus = String(row?.cheque_status || selectedCheque?.status || 'new').trim() || 'new';
        const nextMetadata =
          selectedCheque?.metadata && typeof selectedCheque.metadata === 'object'
            ? { ...selectedCheque.metadata }
            : {};
        if (isPurchaseInvoicePayments && !!row?.use_existing_received_cheque) {
          nextMetadata.spent_out = true;
          nextMetadata.spent_out_at = nowIso;
          nextMetadata.spent_out_source_table = moduleId;
          nextMetadata.spent_out_source_record_id = recordId;
        }
        nextMetadata.linked_invoice_table = moduleId;
        nextMetadata.linked_invoice_id = recordId;

        const { error: selectedChequeUpdateError } = await supabase
          .from('cheques')
          .update({
            status: nextChequeStatus,
            metadata: nextMetadata,
            due_date: selectedCheque?.due_date || dueDate || null,
            bank_name: selectedCheque?.bank_name || bankMeta?.bank_name || null,
            account_holder_name: selectedCheque?.account_holder_name || null,
            updated_at: nowIso,
          })
          .eq('id', selectedChequeId);
        if (selectedChequeUpdateError) throw selectedChequeUpdateError;

        nextRow.cheque_id = selectedChequeId;
        nextRow.spent_cheque_id = isPurchaseInvoicePayments && !!row?.use_existing_received_cheque ? selectedChequeId : null;
        nextRow.cheque_status = nextChequeStatus;
        nextRow.cheque_serial_no = selectedCheque?.serial_no || null;
        nextRow.cheque_sayad_id = selectedCheque?.sayad_id || null;
        nextRow.cheque_due_date = selectedCheque?.due_date || dueDate || null;
        nextRow.cheque_account_holder_name = selectedCheque?.account_holder_name || null;
        nextRow.cheque_bank_name = selectedCheque?.bank_name || bankMeta?.bank_name || null;
        nextRow.cheque_image_url = selectedCheque?.image_url || null;
        if (selectedCheque?.amount !== undefined && selectedCheque?.amount !== null && String(selectedCheque.amount).trim() !== '') {
          nextRow.amount = selectedCheque.amount;
        }
        if (!nextRow.attachment && selectedCheque?.image_url) {
          nextRow.attachment = selectedCheque.image_url;
        }
        nextRow._auto_cheque = false;
        await syncCashBankOperation({
          row,
          nextRow,
          rowKey,
          paymentType,
          amount: Math.abs(toSafeNumber(nextRow?.amount)),
          rowStatus,
          accountId,
          issueDate,
          attachmentUrl: String(nextRow?.attachment || selectedCheque?.image_url || '').trim() || null,
          chequeId: selectedChequeId,
          assigneeId: String(row?.responsible_id || defaultAssigneeId || '').trim() || null,
        });
        nextRows.push(nextRow);
        continue;
      }

      if (isPurchaseInvoicePayments && !!row?.use_existing_received_cheque) {
        const spendChequeId = String(row?.spent_cheque_id || '').trim();
        if (!spendChequeId) {
          throw new Error('برای خرج چک، انتخاب چک دریافتی الزامی است.');
        }
        const spendCheque = selectedChequeById.get(spendChequeId);
        if (!spendCheque) {
          throw new Error('چک انتخاب شده یافت نشد.');
        }
        const metadata = (spendCheque?.metadata && typeof spendCheque.metadata === 'object') ? spendCheque.metadata : {};
        const alreadySpentElsewhere =
          metadata?.spent_out === true &&
          String(metadata?.spent_out_source_record_id || '') !== String(recordId);
        if (String(spendCheque?.cheque_type || '') !== 'received' || String(spendCheque?.status || '') !== 'new' || alreadySpentElsewhere) {
          throw new Error('چک انتخاب شده قابل خرج کردن نیست.');
        }
        const updatedMetadata = {
          ...metadata,
          spent_out: true,
          spent_out_at: nowIso,
          spent_out_source_table: moduleId,
          spent_out_source_record_id: recordId,
        };
        const { error: spendUpdateError } = await supabase
          .from('cheques')
          .update({ metadata: updatedMetadata, updated_at: nowIso })
          .eq('id', spendChequeId);
        if (spendUpdateError) throw spendUpdateError;

        nextRow.cheque_id = spendChequeId;
        nextRow.cheque_status = String(spendCheque?.status || 'new');
        nextRow.cheque_serial_no = spendCheque?.serial_no || null;
        nextRow.cheque_sayad_id = spendCheque?.sayad_id || null;
        nextRow.cheque_due_date = spendCheque?.due_date || dueDate || null;
        nextRow.cheque_account_holder_name = spendCheque?.account_holder_name || null;
        nextRow.cheque_bank_name = spendCheque?.bank_name || bankMeta?.bank_name || null;
        nextRow.cheque_image_url = spendCheque?.image_url || null;
        if (spendCheque?.amount !== undefined && spendCheque?.amount !== null && String(spendCheque.amount).trim() !== '') {
          nextRow.amount = spendCheque.amount;
        }
        if (!nextRow.attachment && spendCheque?.image_url) {
          nextRow.attachment = spendCheque.image_url;
        }
        nextRow._auto_cheque = false;
        await syncCashBankOperation({
          row,
          nextRow,
          rowKey,
          paymentType,
          amount: Math.abs(toSafeNumber(nextRow?.amount)),
          rowStatus,
          accountId,
          issueDate,
          attachmentUrl: String(nextRow?.attachment || spendCheque?.image_url || '').trim() || null,
          chequeId: spendChequeId,
          assigneeId: String(row?.responsible_id || defaultAssigneeId || '').trim() || null,
        });
        nextRows.push(nextRow);
        continue;
      }

      const chequePayload = {
        cheque_type: isInvoicePayments ? 'received' : 'issued',
        status: String(row?.cheque_status || 'new'),
        amount,
        issue_date: issueDate,
        due_date: dueDate,
        party_type: partyType,
        party_id: partyId,
        bank_account_id: accountId,
        bank_name: bankMeta?.bank_name || null,
        branch_name: bankMeta?.branch_name || null,
        notes: row?.description || null,
        metadata: {
          auto_generated_from: {
            table: moduleId,
            record_id: recordId,
            block: block?.id,
          },
        },
      };

      const existingChequeId = String(row?.cheque_id || '').trim();
      const shouldUpdateExisting = !!existingChequeId && !!row?._auto_cheque;
      let linkedChequeId = existingChequeId || null;

      if (shouldUpdateExisting) {
        const { error: updateChequeError } = await supabase
          .from('cheques')
          .update(chequePayload)
          .eq('id', existingChequeId);
        if (updateChequeError) throw updateChequeError;
      } else {
        const { data: insertedCheque, error: insertChequeError } = await supabase
          .from('cheques')
          .insert(chequePayload)
          .select('id')
          .single();
        if (insertChequeError) throw insertChequeError;
        linkedChequeId = String(insertedCheque?.id || '').trim() || null;
      }

      nextRow.use_existing_received_cheque = false;
      nextRow.spent_cheque_id = null;
      nextRow.cheque_id = linkedChequeId;
      nextRow.cheque_status = chequePayload.status;
      nextRow.cheque_due_date = dueDate;
      nextRow.cheque_bank_name = bankMeta?.bank_name || null;
      nextRow._auto_cheque = true;
      await syncCashBankOperation({
        row,
        nextRow,
        rowKey,
        paymentType,
        amount: Math.abs(toSafeNumber(nextRow?.amount)),
        rowStatus,
        accountId,
        issueDate,
        attachmentUrl: String(nextRow?.attachment || '').trim() || null,
        chequeId: linkedChequeId,
        assigneeId: String(row?.responsible_id || defaultAssigneeId || '').trim() || null,
      });
      nextRows.push(nextRow);
    }

    const nextRowKeys = new Set(nextRows.map((row: any) => String(row?.row_key || row?.key || row?.id || '').trim()).filter(Boolean));
    for (const previousRow of normalizedPreviousRows) {
      const previousRowKey = String(previousRow?.row_key || previousRow?.key || previousRow?.id || '').trim();
      if (!previousRowKey || nextRowKeys.has(previousRowKey)) continue;
      const previousCashOperationId = String(previousRow?._cash_bank_operation_id || '').trim();
      if (previousCashOperationId) {
        const existingMetadata = selectedCashOperationById.get(previousCashOperationId)?.metadata;
        const { error: cancelOperationError } = await supabase
          .from('cash_bank_operations')
          .update({
            status: 'canceled',
            metadata: buildCashOperationMetadata(previousRowKey, existingMetadata),
            updated_at: nowIso,
          })
          .eq('id', previousCashOperationId);
        if (cancelOperationError) throw cancelOperationError;
      }
      if (isAnyInvoicePayments && normalizeCashBankPaymentType(previousRow?.payment_type) === 'barter') {
        const previousBarterId = String(previousRow?._barter_synced_id || previousRow?.barter_id || '').trim();
        if (previousBarterId) {
          await syncBarterAllocation({
            barterId: previousBarterId,
            allocationKey: String(previousRow?._barter_allocation_key || previousRowKey).trim(),
            active: false,
            operationType,
            amount: Math.abs(toSafeNumber(previousRow?.amount)),
            rowStatus: String(previousRow?.status || '').trim() || 'pending',
            rowDate: previousRow?.date || sourceOperationDate || null,
          });
        }
      }
    }

    return normalizePaymentRows(nextRows);
  };

  const handleSave = async (confirmedAllocations?: InvoiceAllocationAmount[]) => {
    if (mode === 'local' || mode === 'external_view') return;
    setSaving(true);
    try {
      if (!moduleId || !recordId) throw new Error('رکورد یافت نشد');
      if (isProductStockMovements) {
        const editableRows = (tempData || []).filter((row: any) => !row?._readonly);
        const previousManualRows = (data || []).filter((row: any) => !row?._readonly);
        const allowedManualSources = new Set(['opening_balance', 'inventory_count', 'waste']);
        const toQty = (value: any) => Math.abs(parseFloat(value) || 0);

        const buildDeltas = (rows: any[], multiplier = 1) => {
          const deltas: Array<{ productId: string; shelfId: string; delta: number }> = [];
          rows.forEach((row: any) => {
            const voucherType = String(row?.voucher_type || '');
            const qty = toQty(row?.main_quantity);
            if (!qty) return;
            const fromShelfId = row?.from_shelf_id ? String(row.from_shelf_id) : null;
            const toShelfId = row?.to_shelf_id ? String(row.to_shelf_id) : null;
            if (voucherType === 'incoming' && toShelfId) {
              deltas.push({ productId: recordId, shelfId: toShelfId, delta: qty * multiplier });
            } else if (voucherType === 'outgoing' && fromShelfId) {
              deltas.push({ productId: recordId, shelfId: fromShelfId, delta: -qty * multiplier });
            } else if (voucherType === 'transfer' && fromShelfId && toShelfId) {
              deltas.push({ productId: recordId, shelfId: fromShelfId, delta: -qty * multiplier });
              deltas.push({ productId: recordId, shelfId: toShelfId, delta: qty * multiplier });
            }
          });
          return deltas;
        };

        editableRows.forEach((row: any) => {
          const voucherType = String(row?.voucher_type || '');
          const source = String(row?.source || '');
          const qty = toQty(row?.main_quantity);
          if (!voucherType) throw new Error('نوع حواله انتخاب نشده است.');
          if (!source) throw new Error('منبع حواله انتخاب نشده است.');
          if (!allowedManualSources.has(source)) {
            throw new Error('برای ثبت دستی، فقط منابع "موجودی اول دوره"، "انبارگردانی" و "ضایعات" مجاز هستند.');
          }
          if (qty <= 0) throw new Error('مقدار واحد اصلی باید بیشتر از صفر باشد.');
          if (voucherType === 'incoming' && !row?.to_shelf_id) throw new Error('برای حواله ورود، قفسه ورود الزامی است.');
          if (voucherType === 'outgoing' && !row?.from_shelf_id) throw new Error('برای حواله خروج، قفسه برداشت الزامی است.');
          if (voucherType === 'transfer') {
            if (!row?.from_shelf_id || !row?.to_shelf_id) throw new Error('برای حواله جابجایی، قفسه برداشت و قفسه ورود الزامی است.');
            if (String(row?.from_shelf_id) === String(row?.to_shelf_id)) throw new Error('قفسه برداشت و قفسه ورود نباید یکسان باشند.');
          }
        });

        const reversePrevious = buildDeltas(previousManualRows, -1);
        const nextDeltas = buildDeltas(editableRows, 1);
        await applyInventoryDeltas(supabase as any, [...reversePrevious, ...nextDeltas]);

        const { data: authData } = await supabase.auth.getUser();
        const currentUserId = authData?.user?.id || null;

        const payload = editableRows.map((row: any) => ({
          id: row?.id || undefined,
          product_id: recordId,
          transfer_type: row?.source || 'inventory_count',
          delivered_qty: toQty(row?.main_quantity),
          required_qty: toQty(row?.sub_quantity),
          invoice_id: null,
          production_order_id: null,
          from_shelf_id: row?.from_shelf_id || null,
          to_shelf_id: row?.to_shelf_id || null,
          sender_id: currentUserId,
          receiver_id: currentUserId,
        }));

        const oldManualIds = previousManualRows.map((row: any) => row?.id).filter(Boolean);
        const nextManualIds = new Set(payload.map((row: any) => row?.id).filter(Boolean));
        const removeIds = oldManualIds.filter((id: string) => !nextManualIds.has(id));
        if (removeIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('stock_transfers')
            .delete()
            .in('id', removeIds);
          if (deleteError) throw deleteError;
        }

        if (payload.length > 0) {
          const { error: upsertError } = await supabase
            .from('stock_transfers')
            .upsert(payload, { onConflict: 'id' });
          if (upsertError) throw upsertError;
        }

        await syncMultipleProductsStock(supabase as any, [recordId]);

        const { data: productMeta } = await supabase
          .from('products')
          .select('main_unit, sub_unit, stock')
          .eq('id', recordId)
          .maybeSingle();
        const mainUnit = productMeta?.main_unit || null;
        const subUnit = productMeta?.sub_unit || null;
        setCurrentProductUnits({ mainUnit, subUnit });
        setCurrentProductStock(parseFloat(productMeta?.stock) || 0);

        const { data: refreshedRows, error: rowsError } = await supabase
          .from('stock_transfers')
          .select('id, transfer_type, delivered_qty, required_qty, invoice_id, production_order_id, from_shelf_id, to_shelf_id, sender_id, receiver_id, created_at')
          .eq('product_id', recordId)
          .order('created_at', { ascending: true });
        if (rowsError) throw rowsError;

        const userIds = Array.from(
          new Set((refreshedRows || []).flatMap((row: any) => [row?.sender_id, row?.receiver_id]).filter(Boolean))
        );
        let userMap = new Map<string, string>();
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);
          userMap = new Map((profiles || []).map((item: any) => [String(item.id), item.full_name || String(item.id)]));
        }

        const mappedRows = (refreshedRows || []).map((row: any, index: number) => {
          const source = String(row?.transfer_type || '').trim() || 'inventory_count';
          const fromShelf = row?.from_shelf_id ? String(row.from_shelf_id) : null;
          const toShelf = row?.to_shelf_id ? String(row.to_shelf_id) : null;
          const voucherType = fromShelf && toShelf ? 'transfer' : toShelf ? 'incoming' : 'outgoing';
          const creatorId = row?.sender_id || row?.receiver_id || null;
          const autoSource = ['sales_invoice', 'purchase_invoice', 'production'].includes(source);
          const isPurchaseSource = source === 'purchase_invoice';
          return {
            id: row.id,
            key: row.id || `move_${index}`,
            voucher_type: voucherType,
            source,
            main_unit: mainUnit,
            main_quantity: Math.abs(parseFloat(row?.delivered_qty) || 0),
            sub_unit: subUnit,
            sub_quantity: Math.abs(parseFloat(row?.required_qty) || 0),
            from_shelf_id: fromShelf,
            to_shelf_id: toShelf,
            invoice_id: isPurchaseSource ? null : (row?.invoice_id || null),
            purchase_invoice_id: isPurchaseSource ? (row?.invoice_id || null) : null,
            production_order_id: row?.production_order_id || null,
            created_by_name: creatorId ? (userMap.get(String(creatorId)) || String(creatorId)) : '-',
            created_at: row?.created_at || null,
            _readonly: autoSource || !!row?.invoice_id || !!row?.production_order_id,
          };
        });

        const oldValue = data.map(({ key, ...rest }) => rest);
        const newValue = mappedRows.map(({ key, ...rest }) => rest);
        await insertChangelog(supabase, moduleId, recordId, block, oldValue, newValue);

        setData(mappedRows);
        if (onSaveSuccess) onSaveSuccess(mappedRows);
        msg.success('ذخیره شد');
        setIsEditing(false);
        return;
      }

      if (isProductInventory || isShelfInventory) {
        const baseRows = tempData.map(({ key, ...rest }) => ({ ...rest }));

        let payload = baseRows;
        if (isProductInventory) {
          payload = baseRows
            .filter((row: any) => row.shelf_id)
            .map((row: any) => ({
              product_id: recordId,
              shelf_id: row.shelf_id,
              warehouse_id: row.warehouse_id ?? null,
              stock: parseFloat(row.stock) || 0,
            }));
        }

        if (isShelfInventory) {
          payload = baseRows
            .filter((row: any) => row.product_id)
            .map((row: any) => ({
              product_id: row.product_id,
              shelf_id: recordId,
              warehouse_id: row.warehouse_id ?? null,
              stock: parseFloat(row.stock) || 0,
            }));
        }

        if (payload.length > 1) {
          const dedupedMap = new Map<string, any>();
          payload.forEach((row: any) => {
            const key = `${row.product_id}_${row.shelf_id}`;
            const existing = dedupedMap.get(key);
            if (!existing) {
              dedupedMap.set(key, row);
            } else {
              const existingStock = parseFloat(existing.stock) || 0;
              const nextStock = parseFloat(row.stock) || 0;
              dedupedMap.set(key, {
                ...existing,
                warehouse_id: row.warehouse_id ?? existing.warehouse_id ?? null,
                stock: existingStock + nextStock,
              });
            }
          });
          payload = Array.from(dedupedMap.values());
        }

        const newKeys = new Set(payload.map((row: any) => `${row.product_id}_${row.shelf_id}`));
        const removedIds = data
          .filter((row: any) => !newKeys.has(`${row.product_id}_${row.shelf_id}`) && row.id)
          .map((row: any) => row.id);

        if (removedIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('product_inventory')
            .delete()
            .in('id', removedIds);
          if (deleteError) throw deleteError;
        }

        let savedRows: any[] = [];
        if (payload.length > 0) {
          const { data: saved, error: upsertError } = await supabase
            .from('product_inventory')
            .upsert(payload, { onConflict: 'product_id,shelf_id' })
            .select('*');
          if (upsertError) throw upsertError;
          savedRows = saved || [];
        }

        if (isProductInventory) {
          await updateProductStock(supabase as any, recordId);
        }

        if (isShelfInventory) {
          const affectedProductIds = new Set<string>();
          payload.forEach((row: any) => row.product_id && affectedProductIds.add(row.product_id));
          data.forEach((row: any) => row.product_id && affectedProductIds.add(row.product_id));
          for (const pid of Array.from(affectedProductIds)) {
            await updateProductStock(supabase, pid);
          }
        }

        const oldValue = data.map(({ key, ...rest }) => rest);
        await insertChangelog(supabase, moduleId, recordId, block, oldValue, savedRows);

        const dataWithKey = savedRows.map((row: any, index: number) => ({
          ...row,
          key: row.id || row.key || `inv_${index}`
        }));
        setData(dataWithKey);
        if (onSaveSuccess) onSaveSuccess(dataWithKey);
        msg.success('ذخیره شد');
        setIsEditing(false);
        return;
      }

      let dataToSave = tempData.map(({ key, ...rest }) => ({
        ...rest,
        total_price: calculateRow(rest, block.rowCalculationType),
      }));

      if (isOperationalPayments) {
        dataToSave.forEach((row: any, rowIndex: number) => {
          const amount = Math.abs(toSafeNumber(row?.amount));
          if (!String(row?.payment_type || '').trim()) {
            throw new Error(`ردیف ${rowIndex + 1}: فیلد «نوع پرداخت» الزامی است.`);
          }
          if (!String(row?.status || '').trim()) {
            throw new Error(`ردیف ${rowIndex + 1}: فیلد «وضعیت» الزامی است.`);
          }
          if (!String(row?.date || '').trim()) {
            throw new Error(`ردیف ${rowIndex + 1}: فیلد «تاریخ» الزامی است.`);
          }
          if (amount <= 0) {
            throw new Error(`ردیف ${rowIndex + 1}: فیلد «مبلغ» باید بزرگ‌تر از صفر باشد.`);
          }
        });
      }

      const updatePayload: any = { [block.id]: dataToSave };
      let currentInvoiceRow: Record<string, any> | null = null;
      if (
        (moduleId === 'invoices' || moduleId === 'purchase_invoices') &&
        (block?.id === 'payments' || block?.id === 'invoiceItems')
      ) {
        const { data: fetchedInvoiceRow, error: summarySourceError } = await supabase
          .from(moduleId)
          .select('*')
          .eq('id', recordId)
          .maybeSingle();
        if (summarySourceError) throw summarySourceError;
        currentInvoiceRow = fetchedInvoiceRow as Record<string, any> | null;

        if (block?.id === 'payments' && isAnyInvoicePayments && !confirmedAllocations) {
          const allocationGroupKey = createLocalRowKey();
          const overflowPlan = buildInvoicePaymentOverflowPlan({
            totalAmount: toSafeNumber(currentInvoiceRow?.total_invoice_amount),
            previousPayments: Array.isArray(currentInvoiceRow?.payments) ? currentInvoiceRow.payments : [],
            nextPayments: dataToSave,
            allocationGroupKey,
          });
          if (overflowPlan) {
            const partyId = String(
              isInvoicePayments ? currentInvoiceRow?.customer_id : currentInvoiceRow?.supplier_id
            ).trim();
            if (!partyId) throw new Error('طرف حساب فاکتور برای تخصیص اضافه‌مبلغ مشخص نیست.');
            setPendingInvoicePaymentAllocation({
              plan: overflowPlan,
              allocationGroupKey,
              partyId,
            });
            return;
          }
        }

        if (block?.id === 'payments' && pendingInvoicePaymentAllocation && confirmedAllocations) {
          dataToSave = pendingInvoicePaymentAllocation.plan.sourcePayments;
        }

        const currentInvoiceItems = Array.isArray(currentInvoiceRow?.invoiceItems) ? currentInvoiceRow.invoiceItems : [];
        const currentPayments = Array.isArray(currentInvoiceRow?.payments) ? currentInvoiceRow.payments : [];
        const nextInvoiceItems = block?.id === 'invoiceItems' ? dataToSave : currentInvoiceItems;
        const nextPayments = block?.id === 'payments' ? dataToSave : currentPayments;
        const nextGlobalDiscountType = block?.id === 'invoiceItems'
          ? currentInvoiceGlobalDiscountType
          : normalizeInvoiceGlobalDiscountType(currentInvoiceRow?.global_discount_type);
        const nextGlobalDiscountValue = block?.id === 'invoiceItems'
          ? Math.max(0, toSafeNumber(currentInvoiceGlobalDiscountValue))
          : Math.max(0, toSafeNumber(currentInvoiceRow?.global_discount_value));
        if (block?.id === 'invoiceItems') {
          updatePayload.global_discount_type = nextGlobalDiscountType;
          updatePayload.global_discount_value = nextGlobalDiscountValue;
        }
        Object.assign(
          updatePayload,
          calculateInvoiceFinancialFields(
            nextInvoiceItems,
            nextPayments,
            nextGlobalDiscountType,
            nextGlobalDiscountValue
          )
        );
      }
      if (isOperationalPayments) {
        dataToSave = await syncPaymentRowsWithCheques(dataToSave, data);
        updatePayload[block.id] = dataToSave;
      }
      if ((isExpenseItems || isExpensePayments) && recordId) {
        const { data: fetchedExpenseRow, error: summarySourceError } = await supabase
          .from('expense_documents')
          .select('items, payments')
          .eq('id', recordId)
          .maybeSingle();
        if (summarySourceError) throw summarySourceError;
        const currentExpenseItems = Array.isArray(fetchedExpenseRow?.items) ? fetchedExpenseRow.items : [];
        const currentExpensePayments = Array.isArray(fetchedExpenseRow?.payments) ? fetchedExpenseRow.payments : [];
        const nextExpenseItems = isExpenseItems ? dataToSave : currentExpenseItems;
        const nextExpensePayments = isExpensePayments ? dataToSave : currentExpensePayments;
        Object.assign(updatePayload, calculateExpenseFinancialFields(nextExpenseItems, nextExpensePayments));
      }
      if (isEmployeeAdvancePayments && recordId) {
        const { data: fetchedAdvanceRow, error: summarySourceError } = await supabase
          .from('employee_advances')
          .select('amount')
          .eq('id', recordId)
          .maybeSingle();
        if (summarySourceError) throw summarySourceError;
        const paidAmount = dataToSave.reduce((sum: number, row: any) => {
          const normalizedStatus = normalizePaymentStatus(row?.status);
          if (normalizedStatus && !PAYMENT_INCLUDED_STATUSES.has(normalizedStatus)) return sum;
          return sum + Math.abs(toSafeNumber(row?.amount));
        }, 0);
        const totalAmount = toSafeNumber(fetchedAdvanceRow?.amount);
        Object.assign(updatePayload, {
          paid_amount: paidAmount,
          remaining_amount: Math.max(0, roundMoney(totalAmount - paidAmount)),
        });
      }
      let allocatedInvoiceIds: string[] = [];
      if (
        block?.id === 'payments'
        && isAnyInvoicePayments
        && pendingInvoicePaymentAllocation
        && confirmedAllocations
        && recordId
      ) {
        const syncedRowsByKey = new Map(
          dataToSave.map((row: any, index: number) => [
            String(row?.row_key || row?.id || row?.key || `legacy_${index}`),
            row,
          ])
        );
        const runtimePlan: InvoicePaymentOverflowPlan = {
          ...pendingInvoicePaymentAllocation.plan,
          sourcePayments: dataToSave,
          segments: pendingInvoicePaymentAllocation.plan.segments.map((segment) => ({
            ...segment,
            paymentRow: {
              ...(syncedRowsByKey.get(segment.sourceRowKey) || segment.paymentRow),
              amount: segment.amount,
              _cash_bank_operation_id: null,
              allocation_group_key: pendingInvoicePaymentAllocation.allocationGroupKey,
            },
          })),
        };
        const changedRows = await applyInvoicePaymentAllocation({
          supabase: supabase as any,
          moduleId: moduleId as 'invoices' | 'purchase_invoices',
          sourceInvoiceId: recordId,
          sourceRowKey: runtimePlan.segments[0]?.sourceRowKey || '',
          sourcePayments: dataToSave,
          allocationGroupKey: pendingInvoicePaymentAllocation.allocationGroupKey,
          allocations: confirmedAllocations,
          plan: runtimePlan,
        });
        allocatedInvoiceIds = changedRows
          .map((row: any) => String(row?.invoice_id || '').trim())
          .filter(Boolean);
      } else {
        const { error } = await supabase.from(moduleId).update(updatePayload).eq('id', recordId);
        if (error) throw error;
      }

      if (isPriceListItems) {
        const { data: priceListRow, error: priceListError } = await supabase
          .from('price_lists')
          .select('status')
          .eq('id', recordId)
          .maybeSingle();
        if (priceListError) throw priceListError;
        await syncDefaultPriceListItemsToProducts(supabase, {
          status: priceListRow?.status,
          items: dataToSave,
        });
      }

      if (
        (moduleId === 'invoices' || moduleId === 'purchase_invoices') &&
        (block?.id === 'payments' || block?.id === 'invoiceItems')
      ) {
        const previousInvoiceRecord = {
          ...(currentInvoiceRow || {}),
          id: recordId,
        } as Record<string, any>;
        const nextInvoiceRecord = {
          ...previousInvoiceRecord,
          ...updatePayload,
          id: recordId,
        } as Record<string, any>;
        const invoiceIdsToSync = allocatedInvoiceIds.length > 0
          ? Array.from(new Set(allocatedInvoiceIds))
          : [recordId];
        for (const invoiceIdToSync of invoiceIdsToSync) {
          if (shouldAutoSyncInvoiceAccounting(moduleId)) {
            const accountingSync = await syncInvoiceAccountingEntries({
              supabase: supabase as any,
              moduleId,
              recordId: invoiceIdToSync,
              includePayments: block?.id === 'payments',
            });
            if (accountingSync.errors.length > 0) {
              console.warn('هشدارهای همگام‌سازی سند حسابداری فاکتور:', accountingSync.errors);
            }
          }
          if (invoiceIdToSync === recordId) {
            await runWorkflowsForEvent({
              moduleId,
              event: 'upsert',
              currentRecord: nextInvoiceRecord,
              previousRecord: previousInvoiceRecord,
            });
          }
        }
      }

      const oldValue = data.map(({ key, ...rest }) => rest);
      await insertChangelog(supabase, moduleId, recordId, block, oldValue, dataToSave);

      msg.success('ذخیره شد');
      const normalizedSavedRows = normalizePaymentRows(dataToSave);
      setData(normalizedSavedRows);
      setPendingInvoicePaymentAllocation(null);
      if (onSaveSuccess) onSaveSuccess(normalizedSavedRows);
      try {
        await syncInvoiceCustomerStats();
      } catch (syncErr) {
        console.warn('Customer stats sync failed after table save', syncErr);
      }
      setIsEditing(false);
    } catch (e: any) {
      msg.error(toFaErrorMessage(e, 'ذخیره اطلاعات ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  const getColWidth = (col: any) => {
    if (col.width) return col.width;
    if (col.type === FieldType.RELATION) return 240;
    if (col.type === FieldType.SELECT || col.type === FieldType.MULTI_SELECT || col.type === FieldType.STATUS) return 170;
    if (col.type === FieldType.NUMBER || col.type === FieldType.PERCENTAGE_OR_AMOUNT) return 120;
    if (col.type === FieldType.PRICE) return 140;
    if (col.type === FieldType.DATETIME) return 170;
    if (col.type === FieldType.DATE) return 100;
    return 160;
  };

  const getRowKey = (row: any) => String(row?.row_key || row?.key || row?.id || '');
  const resolveRowIndex = (rowKey: React.Key) => {
    const source = isEditing ? tempData : data;
    return source.findIndex((row: any) => getRowKey(row) === String(rowKey));
  };


  const bumpRowReloadVersion = (rowKey: string) => {
    setRowReloadVersion((prev) => ({
      ...prev,
      [rowKey]: (prev[rowKey] || 0) + 1,
    }));
  };

  const pickFirstNumber = (...values: any[]) => {
    for (const value of values) {
      if (value === undefined || value === null || String(value).trim() === '') continue;
      return toSafeNumber(value);
    }
    return 0;
  };

  const resolveRelatedPriceRecord = async (row: any) => {
    const productId = String(row?.product_id || '').trim();
    if (!productId) return null;

    const options = isAnyInvoiceItems
      ? getInvoiceProductRelationOptions(row)
      : getCatalogProductRelationOptions(row);
    const selectedOption = options.find((option: any) => String(option?.value || '').trim() === productId);
    const hintedModule = String(selectedOption?.module || '').trim();

    if (hintedModule === 'product_bundles') {
      const packageSnapshot = await loadPackageSnapshot(productId);
      return packageSnapshot ? { targetModule: 'product_bundles', record: packageSnapshot } : null;
    }

    if (hintedModule === 'billboards') {
      const { data: billboardRecord, error } = await supabase
        .from('billboards')
        .select('*')
        .eq('id', productId)
        .maybeSingle();
      if (error) throw error;
      return billboardRecord ? { targetModule: 'billboards', record: billboardRecord } : null;
    }

    const { data: productRecord, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .maybeSingle();
    if (productError) throw productError;
    if (productRecord) return { targetModule: 'products', record: productRecord };

    const { data: billboardRecord, error: billboardError } = await supabase
      .from('billboards')
      .select('*')
      .eq('id', productId)
      .maybeSingle();
    if (billboardError) throw billboardError;
    if (billboardRecord) return { targetModule: 'billboards', record: billboardRecord };

    return null;
  };

  const refreshRowPriceFromSource = async (row: any) => {
    const nextRow = { ...(row || {}) };

    if (isAnyInvoiceItems && isPackageInvoiceRow(nextRow)) {
      const packageId = String(nextRow.package_id || nextRow.product_id || '').trim();
      if (!packageId) return nextRow;
      const packageSnapshot = await loadPackageSnapshot(packageId);
      if (!packageSnapshot) return nextRow;
      const packageQuantity = Math.max(1, toSafeNumber(nextRow?.quantity) || 1);
      nextRow.product_id = packageSnapshot.id;
      nextRow.package_id = packageSnapshot.id;
      nextRow.package_name = packageSnapshot.name;
      nextRow.package_items = packageSnapshot.items;
      nextRow.item_kind = 'package';
      nextRow.product_type = 'package';
      nextRow.base_sub_unit = 'عدد';
      nextRow.dimension_count_original_sub_unit = null;
      nextRow.selected_product_name = packageSnapshot.name;
      nextRow.product_name = packageSnapshot.name;
      nextRow.price_list_id = null;
      nextRow.main_unit = 'عدد';
      nextRow.sub_unit = 'عدد';
      nextRow.quantity = packageQuantity;
      nextRow.sub_quantity = packageQuantity;
      applyPackageInvoicePricing(nextRow, packageSnapshot.items, packageQuantity);
      nextRow.delivery_time = null;
      nextRow.length = null;
      nextRow.width = null;
      nextRow.start_date = null;
      nextRow.end_date = null;
      nextRow.description = buildSalesPackageDescription(packageSnapshot.items, packageQuantity) || nextRow.description || '';
      nextRow.total_price = calculateRow(nextRow, block.rowCalculationType);
      return nextRow;
    }

    const relationResult = await resolveRelatedPriceRecord(nextRow);
    if (!relationResult?.record) return nextRow;

    const { targetModule, record } = relationResult;
    const isBillboardSource = targetModule === 'billboards';
    const sourceName = isBillboardSource
      ? (getBillboardDisplayName(record) || nextRow.product_name || nextRow.selected_product_name || null)
      : (record?.name || record?.title || nextRow.product_name || nextRow.selected_product_name || null);
    const sourceMainUnit = isBillboardSource ? 'روز' : (String(record?.main_unit || 'عدد').trim() || 'عدد');
    const sourceProductType = isBillboardSource ? 'service' : (record?.product_type || nextRow.product_type || 'goods');
    const sourceSellPrice = isBillboardSource
      ? pickFirstNumber(record?.daily_rent, record?.monthly_rent, record?.print_cost, record?.sell_price)
      : pickFirstNumber(record?.sell_price);
    const sourceBuyPrice = isBillboardSource
      ? sourceSellPrice
      : pickFirstNumber(record?.buy_price, record?.sell_price);

    nextRow.selected_product_name = sourceName;
    nextRow.product_name = sourceName;
    nextRow.product_type = sourceProductType;
    nextRow.main_unit = sourceMainUnit;
    nextRow.delivery_time = String(record?.delivery_time || '').trim() || null;

    if (isPriceListItems) {
      nextRow.buy_price = sourceBuyPrice;
      nextRow.profit_percentage = calculateProfitPercentage(sourceBuyPrice, sourceSellPrice);
      nextRow.price = sourceBuyPrice > 0
        ? calculatePriceWithProfit(nextRow.buy_price, nextRow.profit_percentage)
        : sourceSellPrice;
      nextRow.currency_label = currencyLabel;
      nextRow.unit_name = sourceMainUnit;
      return nextRow;
    }

    if (isSalesPackageItems) {
      nextRow.unit_price = sourceSellPrice;
      nextRow.total_price = calculateRow(nextRow, block.rowCalculationType);
      return nextRow;
    }

    if (isAnyInvoiceItems) {
      nextRow.item_kind = 'product';
      clearPackageInvoicePricing(nextRow);
      nextRow.package_id = null;
      nextRow.package_name = null;
      nextRow.package_items = [];
      if (String(nextRow.description || '').trim().startsWith('شامل:')) {
        nextRow.description = '';
      }

      if (isBillboardSource) {
        nextRow.price_list_id = null;
        nextRow.sub_unit = 'عدد';
        nextRow.unit_price = sourceSellPrice;
        if (record?.width !== undefined && record?.width !== null && String(record.width).trim() !== '') {
          nextRow.length = record.width;
        }
        if (record?.height !== undefined && record?.height !== null && String(record.height).trim() !== '') {
          nextRow.width = record.height;
        }
      } else {
        nextRow.sub_unit = record?.sub_unit || nextRow.sub_unit || null;
        nextRow.base_sub_unit = nextRow.sub_unit || null;
        const matchedPriceListId = isInvoiceItems ? String(nextRow?.price_list_id || '').trim() : '';
        if (matchedPriceListId) {
          const matchedItem = findPriceListItemByProduct(
            invoicePriceLists.find((item) => item.id === matchedPriceListId)?.items,
            String(nextRow.product_id || ''),
          );
          if (matchedItem) {
            nextRow.unit_price = toSafeNumber(matchedItem?.price);
          } else {
            nextRow.price_list_id = null;
            nextRow.unit_price = isPurchaseInvoiceItems ? sourceBuyPrice : sourceSellPrice;
          }
        } else {
          nextRow.unit_price = isPurchaseInvoiceItems ? sourceBuyPrice : sourceSellPrice;
        }
      }

      if (isServiceProduct(nextRow.product_type) && !isBillboardSource) {
        nextRow.length = null;
        nextRow.width = null;
        nextRow.source_shelf_id = null;
      }
      if (isBillboardSource) {
        nextRow.base_sub_unit = null;
        nextRow.dimension_count_original_sub_unit = null;
      }
      applyInvoiceAutoQuantity(nextRow);
      syncInvoiceSubQuantity(nextRow);
      nextRow.total_price = calculateRow(nextRow, block.rowCalculationType);
    }

    return nextRow;
  };

  const handleRefreshRelatedPrices = async () => {
    if (priceRefreshLoading) return;
    if (!isEditing && mode !== 'local') {
      msg.warning('برای بروزرسانی قیمت، ابتدا جدول را در حالت ویرایش قرار دهید.');
      return;
    }

    const source = isEditing ? tempData : data;
    if (!Array.isArray(source) || source.length === 0) {
      msg.warning('ردیفی برای بروزرسانی قیمت وجود ندارد.');
      return;
    }

    setPriceRefreshLoading(true);
    try {
      const nextRows: any[] = [];
      let changedCount = 0;
      for (const row of source) {
        const before = JSON.stringify(row || {});
        const refreshed = await refreshRowPriceFromSource(row);
        const after = JSON.stringify(refreshed || {});
        if (before !== after) changedCount += 1;
        nextRows.push(refreshed);
      }
      applyRowUpdate(nextRows);
      nextRows.forEach((row, index) => {
        const rowKey = String(row?.key || row?.id || index);
        if (rowKey) bumpRowReloadVersion(rowKey);
      });
      msg.success(changedCount > 0 ? `${toPersianNumber(changedCount)} ردیف بروزرسانی شد.` : 'قیمت‌ها با منبع مرتبط یکسان بودند.');
    } catch (error: any) {
      console.error(error);
      msg.error(toFaErrorMessage(error, 'بروزرسانی قیمت‌ها ناموفق بود.'));
    } finally {
      setPriceRefreshLoading(false);
    }
  };

  const handleCalculatePriceListSellPrices = () => {
    if (!isPriceListItems) return;
    if (!isEditing && mode !== 'local') {
      msg.warning('برای محاسبه قیمت، ابتدا جدول را در حالت ویرایش قرار دهید.');
      return;
    }

    const source = isEditing ? tempData : data;
    if (!Array.isArray(source) || source.length === 0) {
      msg.warning('ردیفی برای محاسبه قیمت وجود ندارد.');
      return;
    }

    let changedCount = 0;
    const nextRows = source.map((row: any) => {
      const nextRow = { ...(row || {}) };
      const nextPrice = calculatePriceWithProfit(nextRow.buy_price, nextRow.profit_percentage);
      if (toSafeNumber(nextRow.price) !== nextPrice) changedCount += 1;
      nextRow.price = nextPrice;
      nextRow.total_price = calculateRow(nextRow, block.rowCalculationType);
      return nextRow;
    });

    applyRowUpdate(nextRows);
    msg.success(changedCount > 0 ? `${toPersianNumber(changedCount)} ردیف محاسبه شد.` : 'قیمت‌ها از قبل با درصد سود فعلی یکسان بودند.');
  };

  const ensureRowExpanded = (rowKey: string) => {
    setExpandedRowKeys((prev) => {
      const keyStr = String(rowKey);
      if (prev.some((k) => String(k) === keyStr)) return prev;
      return [...prev, rowKey];
    });
  };

  const loadProductsForRow = async (rowKey: string, rowData: any, options?: { resetPage?: boolean }) => {
    if (!productsModule) return;
    if (options?.resetPage) bumpRowReloadVersion(rowKey);
    setExpandedProducts((prev) => ({ ...prev, [rowKey]: { loading: true, data: prev[rowKey]?.data || [] } }));
    try {
      let activeFilters = buildProductFilters(block.tableColumns || [], rowData, dynamicOptions, localDynamicOptions);
      let result = await runProductsQuery(supabase, activeFilters);
      let guard = 0;
      while (result.error && result.error.code === '42703' && guard < 6) {
        const missing = result.error.message?.match(/products\.([a-zA-Z0-9_]+)/)?.[1];
        if (!missing) break;
        activeFilters = activeFilters.filter((f) => f.filterKey !== missing);
        result = await runProductsQuery(supabase, activeFilters);
        guard += 1;
      }

      if (result.error) throw result.error;
      setExpandedProducts((prev) => ({ ...prev, [rowKey]: { loading: false, data: result.data || [] } }));
    } catch (err) {
      console.error(err);
      setExpandedProducts((prev) => ({ ...prev, [rowKey]: { loading: false, data: [] } }));
    }
  };

  const loadShelvesForRow = async (rowKey: string, productId: string) => {
    setShelfOptionsByRow((prev) => ({ ...prev, [rowKey]: { loading: true, options: prev[rowKey]?.options || [] } }));
    try {
      const options = await fetchShelfOptions(supabase, productId);
      setShelfOptionsByRow((prev) => ({ ...prev, [rowKey]: { loading: false, options } }));
    } catch (err) {
      if (!isAbortLikeError(err)) {
        console.error(err);
      }
      setShelfOptionsByRow((prev) => ({ ...prev, [rowKey]: { loading: false, options: [] } }));
    }
  };

  const visibleColumns = (block.tableColumns || []).filter((col: any) =>
    (canViewField ? canViewField(col.key) !== false : true) &&
    !(isAnyInvoiceItems && col.key === 'package_id')
  );

  const applySelectedProduct = (rowIndex: number, rowKey: string, selected: any) => {
    if (rowIndex < 0 || !selected) return;

    const source = getActiveRowsSnapshot();
    const baseRow = source[rowIndex] || {};
    const nextRow: any = { ...baseRow };

    nextRow.selected_product_id = selected?.id || null;
    nextRow.selected_product_name = selected?.name || null;

    const locked = new Set<string>();

    (visibleColumns || []).forEach((col: any) => {
      const key = col.key;
      const productKey = productFieldMap[key] || key;
      const productValue = (selected as any)[productKey];
      if (productValue !== undefined) {
        nextRow[key] = productValue;
      }
      if (!editableAfterSelection.has(key)) {
        locked.add(key);
      }
    });

    if (selected?.main_unit !== undefined) {
      nextRow.main_unit = selected.main_unit;
      if (!editableAfterSelection.has('main_unit')) locked.add('main_unit');
    }

    nextRow.total_price = calculateRow(nextRow, block.rowCalculationType);
    nextRow._lockedFields = Array.from(locked);

    const newData = [...source];
    newData[rowIndex] = nextRow;
    applyRowUpdate(newData);

    if (selected?.id) {
      loadShelvesForRow(rowKey, selected.id);
    }
  };


  const handleQrScanForRow = async (rowIndex: number, rowKey: string, scan: { raw: string; moduleId?: string; recordId?: string }) => {
    try {
      if (scan.recordId && scan.moduleId === 'products') {
        const { data: product, error } = await supabase
          .from('products')
          .select('*')
          .eq('id', scan.recordId)
          .single();
        if (!error && product) {
          applySelectedProduct(rowIndex, rowKey, product);
        }
        return;
      }

      const raw = scan.raw?.trim();
      if (!raw) return;
      const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .or(`system_code.eq.${raw},manual_code.eq.${raw},name.eq.${raw}`)
        .limit(1);
      if (!error && products && products.length > 0) {
        applySelectedProduct(rowIndex, rowKey, products[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const selectionColumns = isProductionOrder && isBomItemBlock
    ? [
        {
          title: 'محصول انتخابی',
          dataIndex: 'selected_product_name',
          key: 'selected_product_name',
          width: 240,
          render: (text: any, _record: any, index: number) => {
            const rowKey = getRowKey(_record);
            const productsState = expandedProducts[rowKey];
            const productOptions = (productsState?.data || []).map((item: any) => ({
              value: item.id,
              label: item.system_code ? `${item.system_code} - ${item.name}` : item.name,
            }));

            if (text) {
              return (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700">{text}</span>
                <Button
                  type="text"
                  size="small"
                  icon={<CloseCircleOutlined />}
                  onClick={() => clearSelectedProduct(index)}
                />
              </div>
              );
            }

            return (
              <div className="flex items-center gap-2">
                <Select
                  placeholder="جستجو یا انتخاب محصول"
                  value={null}
                  showSearch
                  options={productOptions}
                  optionFilterProp="label"
                  onDropdownVisibleChange={(open) => {
                    if (!open) return;
                    ensureRowExpanded(rowKey);
                    loadProductsForRow(rowKey, _record, { resetPage: true });
                  }}
                  onChange={async (val) => {
                    const selected = (productsState?.data || []).find((p: any) => String(p.id) === String(val));
                    if (selected) {
                      applySelectedProduct(index, rowKey, selected);
                      return;
                    }
                    const { data: product } = await supabase
                      .from('products')
                      .select('*')
                      .eq('id', val)
                      .single();
                    if (product) applySelectedProduct(index, rowKey, product);
                  }}
                  className="w-full"
                  getPopupContainer={(node) => node?.parentElement || document.body}
                  styles={{ popup: { root: { zIndex: 1100 } } }}
                />
                <QrScanPopover
                  label=""
                  buttonClassName="shrink-0"
                  onScan={(scan) => handleQrScanForRow(index, rowKey, scan)}
                  buttonProps={{ type: 'text', size: 'small' }}
                />
              </div>
            );
          },
        },
        {
          title: 'قفسه برداشت',
          dataIndex: 'selected_shelf_id',
          key: 'selected_shelf_id',
          width: 220,
          render: (_: any, record: any) => {
            const rowKey = getRowKey(record);
            const rowIndex = resolveRowIndex(rowKey);
            const shelvesState = shelfOptionsByRow[rowKey];
            const hasProduct = !!record?.selected_product_id;
            return (
              <div className="flex items-center gap-2">
                <Select
                  placeholder={hasProduct ? 'انتخاب قفسه' : 'ابتدا محصول را انتخاب کنید'}
                  value={record?.selected_shelf_id || null}
                  loading={shelvesState?.loading}
                  options={shelvesState?.options || []}
                  onChange={(val) => {
                    if (rowIndex < 0) return;
                    updateRow(rowIndex, 'selected_shelf_id', val || null);
                  }}
                  onDropdownVisibleChange={(open) => {
                    if (!open || !hasProduct) return;
                    if (!shelvesState?.loading && !(shelvesState?.options || []).length) {
                      loadShelvesForRow(rowKey, record.selected_product_id);
                    }
                  }}
                  disabled={!hasProduct || isReadOnly}
                  allowClear
                  className="w-full"
                  status={hasProduct && !record?.selected_shelf_id ? 'error' : undefined}
                  getPopupContainer={(node) => node?.parentElement || document.body}
                  styles={{ popup: { root: { zIndex: 1100 } } }}
                />
                <QrScanPopover
                  label=""
                  buttonClassName="shrink-0"
                  buttonProps={{ type: 'default', shape: 'circle', size: 'small' }}
                  onScan={({ moduleId: scannedModule, recordId }) => {
                    if (rowIndex < 0) return;
                    if (scannedModule === 'shelves' && recordId) {
                      updateRow(rowIndex, 'selected_shelf_id', recordId);
                    }
                  }}
                />
              </div>
            );
          },
        },
      ]
    : [];

  const getColumnOptions = (col: any, rowKey: string, record: any) => {
    let options = col.options;
    if (col.dynamicOptionsCategory) {
      options = mergeOptionsByValue(
        localDynamicOptions[col.dynamicOptionsCategory] || [],
        dynamicOptions[col.dynamicOptionsCategory] || []
      );
      if (Array.isArray(options)) options = dedupeOptionsByLabel(options);
    }
    if (isProductStockMovements && col.key === 'source' && Array.isArray(options) && !(record as any)?._readonly) {
      const allowed = new Set(['opening_balance', 'inventory_count', 'waste']);
      options = options.filter((opt: any) => allowed.has(String(opt?.value || '')));
    }
      if (col.type === FieldType.RELATION) {
        const specificKey = `${block.id}_${col.key}`;
        options = relationOptions[specificKey] || relationOptions[col.key] || [];
        if (isAnyInvoiceItems && col.key === 'product_id') {
          options = getInvoiceProductRelationOptions(record);
        } else if (isCatalogProductItems && col.key === 'product_id') {
          options = getCatalogProductRelationOptions(record);
        }
        if (isPurchaseInvoicePayments && col.key === 'spent_cheque_id') {
        const selectedId = String(record?.spent_cheque_id || '').trim();
        const selectedFallback = (relationOptions[specificKey] || relationOptions[col.key] || [])
          .find((opt: any) => String(opt?.value || '') === selectedId);
        const existsInEligible = eligibleReceivedChequeOptions.some((opt) => String(opt.value) === selectedId);
        options = existsInEligible || !selectedId
          ? eligibleReceivedChequeOptions
          : [...eligibleReceivedChequeOptions, selectedFallback || { value: selectedId, label: selectedId }];
      }
      if (isInvoiceItems && col.key === 'price_list_id') {
        options = getPriceListOptionsForProduct(record?.product_id, record?.price_list_id);
      }
      if (isInvoiceItems && col.key === 'source_shelf_id') {
        if (isPackageInvoiceRow(record)) {
          options = getGenericShelfOptions(col.key);
        } else {
          const shelvesState = shelfOptionsByRow[rowKey];
          options = shelvesState?.options || [];
        }
      }
    }
    return options;
  };

  const getFieldConfigForColumn = (col: any, record: any): ModuleField => {
    const readonlyWhen = col.readonlyWhen as { field?: string; equals?: unknown } | undefined;
    const readonlyByCondition =
      !!readonlyWhen?.field &&
      Object.prototype.hasOwnProperty.call(record || {}, readonlyWhen.field) &&
      (record as any)[readonlyWhen.field] === readonlyWhen.equals;

    const dynamicReadonlyByInvoice =
      (isAnyInvoiceItems && col.key === 'source_shelf_id' && ((!record?.product_id && !isPackageInvoiceRow(record)) || isServiceProduct(record?.product_type)))
      || (isInvoiceItems && col.key === 'price_list_id' && (!record?.product_id || isPackageInvoiceRow(record)))
      || (isInvoiceItems && col.key === 'price_list_id' && !!record?.product_id && !isPackageInvoiceRow(record) && getPriceListOptionsForProduct(record?.product_id, record?.price_list_id).length === 0)
      || (isAnyInvoiceItems && col.key === 'quantity' && hasAutoDimensions(record))
      || (isAnyInvoiceItems && ['length', 'width'].includes(col.key) && !hasDimensionValues(record))
      || (isAnyInvoiceItems && col.key === 'sub_quantity' && !isManualSubUnit(record?.sub_unit))
      || (isAnyInvoicePayments
        && (
          ((isInvoicePayments && col.key === 'target_account' && shouldDisableInvoicePaymentAccount(record))
            || (((isPurchaseInvoicePayments || isExpensePayments) && col.key === 'source_account')
              && normalizeCashBankPaymentType((record as any)?.payment_type) === 'barter'))
        ));

    const isInvoicePaymentAccountColumn = isOperationalPayments
      && ((isInvoicePayments && col.key === 'target_account') || (!isInvoicePayments && col.key === 'source_account'));
    const relationConfig =
      (isAnyInvoiceItems || isCatalogProductItems) && col.key === 'product_id' && col.relationConfig
        ? {
            ...col.relationConfig,
            sourceModules: Array.isArray(col.relationConfig?.sourceModules) && col.relationConfig.sourceModules.length > 0
              ? col.relationConfig.sourceModules
              : [
                  { targetModule: 'products', targetField: 'name' },
                  { targetModule: 'product_bundles', targetField: 'name', tagLabel: 'پکیج', tagColor: 'cyan' },
                  { targetModule: 'billboards', targetField: 'address', tagLabel: 'محیطی', tagColor: 'purple' },
                ],
          }
        : isInvoicePaymentAccountColumn && col.relationConfig
          ? col.relationConfig
        : col.relationConfig;

    const baseReadonly = Boolean(col.readonly)
      && !(isAnyInvoiceItems && col.key === 'sub_quantity' && isManualSubUnit(record?.sub_unit));
    const gatewayLockedPaymentRow =
      isOperationalPayments
      && (
        (record as any)?._readonly === true
        || (record as any)?._lockedByGateway === true
        || (record as any)?.locked === true
        || String((record as any)?.source || '').trim() === 'online_gateway'
        || String((record as any)?.gateway_transaction_id || '').trim() !== ''
      );

    return {
      key: col.key,
      type: col.type,
      labels: { fa: col.title, en: col.key },
      options: col.options,
      relationConfig,
      dynamicOptionsCategory: col.dynamicOptionsCategory,
      readonly: baseReadonly
        || (gatewayLockedPaymentRow && col.key !== 'responsible_id')
        || (isProductStockMovements && (record as any)?._readonly)
        || (isProductStockMovements && ['invoice_id', 'production_order_id', 'created_by_name', 'created_at', 'main_unit', 'sub_unit'].includes(col.key))
        || (isProductStockMovements && col.key === 'source' && (record as any)?._readonly)
        || (isProductStockMovements && col.key === 'from_shelf_id' && String((record as any)?.voucher_type || '') === 'incoming')
        || (isProductStockMovements && col.key === 'to_shelf_id' && String((record as any)?.voucher_type || '') === 'outgoing')
        || ((record as any)?._lockedFields || []).includes(col.key)
        || (isProductionOrder && isBomItemBlock && (record as any)?.selected_product_id && !editableAfterSelection.has(col.key))
        || readonlyByCondition
        || dynamicReadonlyByInvoice,
    };
  };

  const renderColumnEditor = (col: any, record: any, index: number, text?: any) => {
    const rowKey = getRowKey(record);
    const cellRendererKey = `${rowKey}-${col.key}-${rowReloadVersion[rowKey] || 0}`;
    const value = isPriceListItems && col.key === 'currency_label'
      ? ((text !== undefined ? text : (record as any)?.[col.key]) || currencyLabel)
      : (text !== undefined ? text : (record as any)?.[col.key]);
    const fieldConfig = getFieldConfigForColumn(col, record);
    const options = getColumnOptions(col, rowKey, record);
    const showNoPriceListHint =
      isInvoiceItems &&
      col.key === 'price_list_id' &&
      !!record?.product_id &&
      !record?.price_list_id &&
      !isPackageInvoiceRow(record) &&
      options.length === 0;
    if (fieldConfig.readonly) {
      return (
        <div className="space-y-1">
          <SmartFieldRenderer
            key={cellRendererKey}
            field={fieldConfig}
            value={value}
            onChange={() => undefined}
            forceEditMode={false}
            options={options}
            compactMode={true}
            moduleId={moduleId}
            recordId={recordId}
            allValues={record}
          />
          {showNoPriceListHint ? (
            <div className="text-[10px] text-gray-500 dark:text-gray-400">
              این محصول، لیست قیمتی ندارد
            </div>
          ) : null}
        </div>
      );
    }
    const handleChange = (val: any) => {
      if (col.type === FieldType.RELATION) {
        handleRelationChange(index, col.key, val, fieldConfig.relationConfig);
      } else {
        updateRow(index, col.key, val);
      }
    };
    const typeKey = col.key === 'discount' ? 'discount_type' : col.key === 'vat' ? 'vat_type' : null;
    const typeValue = typeKey ? (record as any)[typeKey] : null;
    const isMovementQty = isProductStockMovements && col.key === 'main_quantity' && !isEditing;
    const movementType = String((record as any)?.voucher_type || '');
    const movementColor = movementType === 'incoming' ? 'text-green-600' : movementType === 'outgoing' ? 'text-red-600' : 'text-blue-600';
    if (isMovementQty) {
      return <span className={`persian-number font-bold ${movementColor}`}>{toPersianNumber(value || 0)}</span>;
    }
    const noteRowKey = getRowKey(record);
    const noteOpen = notePopoverRowKey === noteRowKey;
    const deliveryTimeOpen = deliveryTimePopoverRowKey === noteRowKey;
    const shelfOpen = shelfPopoverRowKey === noteRowKey;
    const dimensionsOpen = dimensionsPopoverRowKey === noteRowKey;
    const calendarOpen = calendarPopoverRowKey === noteRowKey;
    const popoverPlacement = isMobileViewport ? 'bottom' : 'leftTop';
    const popoverOverlayStyle = { maxWidth: '92vw', zIndex: 1400 } as React.CSSProperties;
    const canEditNote = !isReadOnly && (isEditing || mode === 'local');
    const noteValue = String(record?.description || '');
    const deliveryTimeValue = String(record?.delivery_time || '');
    const showInvoiceNote = (isAnyInvoiceItems || isSalesPackageItems || isPriceListItems) && col.key === 'product_id';
    const showDeliveryTime = (isAnyInvoiceItems || isSalesPackageItems || isPriceListItems) && col.key === 'product_id';
    const sourceShelfColumn = visibleColumns.find((c: any) => c.key === 'source_shelf_id');
    const showInvoiceShelf = isAnyInvoiceItems && !!sourceShelfColumn && col.key === 'product_id';
    const shelfOptions = sourceShelfColumn ? getColumnOptions(sourceShelfColumn, noteRowKey, record) : [];
    const shelfValue = record?.source_shelf_id || null;
    const shelfActionLabel = isPurchaseInvoiceItems ? 'انتخاب محل ورود' : 'انتخاب محل خروج';
    const shelfSelectedLabel = isPurchaseInvoiceItems ? 'محل ورود ثبت شده' : 'محل خروج ثبت شده';
    const shelfMissingLabel = isPurchaseInvoiceItems ? 'محل ورود ثبت نشده' : 'محل خروج ثبت نشده';
    const canEditShelf =
      showInvoiceShelf &&
      !isReadOnly &&
      isEditing &&
      !isServiceProduct(record?.product_type) &&
      (!!record?.product_id || isPackageInvoiceRow(record));
    const showInvoiceDimensions = isAnyInvoiceItems && col.key === 'product_id' && !isPackageInvoiceRow(record);
    const canEditDimensions = !isReadOnly && isEditing && !isPackageInvoiceRow(record);
    const lengthValue = record?.length ?? null;
    const widthValue = record?.width ?? null;
    const dimensionCountValue = record?.dimension_count ?? 1;
    const dimensionCountAsSubQuantity = record?.dimension_count_to_sub_quantity === true;
    const dimensionMainUnit = String(record?.main_unit || '').trim() || 'واحد اصلی';
    const dimensionAutoQuantity = isAreaAutoUnit(record?.main_unit);
    const dimensionComputedQuantity = roundToThree(
      toSafeNumber(lengthValue) * toSafeNumber(widthValue) * getDimensionCount(record)
    );
    const hasDimensionsValue = toSafeNumber(lengthValue) > 0 || toSafeNumber(widthValue) > 0;
    const showInvoiceCalendar = isAnyInvoiceItems && col.key === 'product_id' && !isPackageInvoiceRow(record);
    const canEditCalendar = !isReadOnly && isEditing && !isPackageInvoiceRow(record);
    const startDateValue = record?.start_date || null;
    const endDateValue = record?.end_date || null;
    const hasCalendarValue = Boolean(startDateValue || endDateValue);
    const dateDiffDays = calculateDateDiffDays(startDateValue, endDateValue);
    const isPaymentAttachment = isOperationalPayments && col.key === 'attachment';
    const attachmentUrl = String(value || '').trim();
    const showBulkPriceUnit = isBulkProductsTable && col.type === FieldType.PRICE;
    const bulkPriceUnitLabel = String(currencyLabel || '').trim();
    if (col.type === FieldType.CHECKBOX) {
      return (
        <Checkbox
          checked={Boolean(value)}
          disabled={!isEditing || isReadOnly || Boolean(fieldConfig.readonly)}
          onChange={(event) => updateRow(index, col.key, event.target.checked)}
        />
      );
    }
    return (
      <div className="flex items-center gap-1 w-full min-w-0 max-w-full overflow-hidden">
        <div className="flex-1 min-w-0 overflow-hidden">
          <SmartFieldRenderer
            key={cellRendererKey}
            field={fieldConfig}
            value={value}
            onChange={handleChange}
            forceEditMode={isEditing}
            options={options}
            onOptionsUpdate={col.dynamicOptionsCategory ? () => refreshDynamicOptionsForCategory(col.dynamicOptionsCategory) : undefined}
            compactMode={true}
            moduleId={moduleId}
            recordId={recordId}
            allValues={record}
          />
        </div>
        {showBulkPriceUnit && (
          <div className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
            {bulkPriceUnitLabel || 'واحد پول'}
          </div>
        )}
        {showInvoiceNote && (
          <Popover
            trigger="click"
            placement={popoverPlacement}
            overlayStyle={popoverOverlayStyle}
            getPopupContainer={() => document.body}
            open={noteOpen}
            onOpenChange={(open) => setNotePopoverRowKey(open ? noteRowKey : null)}
            content={(
              <div style={{ width: 'min(88vw, 320px)' }}>
                <div className="text-xs text-gray-500 dark:text-gray-300 mb-2">یادداشت ردیف</div>
                <Input.TextArea
                  autoSize={{ minRows: 3, maxRows: 6 }}
                  value={noteValue}
                  disabled={!canEditNote}
                  onChange={(event) => updateRow(index, 'description', event.target.value)}
                  placeholder="یادداشت این ردیف را اینجا بنویسید..."
                />
                <div className="mt-2 flex justify-end">
                  <Space size={2}>
                    <Button
                      size="small"
                      type="text"
                      className="!h-6 !w-6 !min-w-6 !px-0 text-emerald-600"
                      icon={<CheckOutlined />}
                      onClick={() => setNotePopoverRowKey(null)}
                    />
                    <Button
                      size="small"
                      type="text"
                      className="!h-6 !w-6 !min-w-6 !px-0 text-gray-500"
                      icon={<CloseOutlined />}
                      onClick={() => setNotePopoverRowKey(null)}
                    />
                  </Space>
                </div>
              </div>
            )}
          >
            <Button
              size="small"
              type="text"
              className={noteValue.trim() ? 'text-leather-600' : 'text-gray-400 dark:text-gray-300'}
              icon={<FileTextOutlined />}
              title={noteValue.trim() ? 'توضیحات دارد' : 'توضیحات ندارد'}
            />
          </Popover>
        )}
        {showDeliveryTime && (
          <Popover
            trigger="click"
            placement={popoverPlacement}
            overlayStyle={popoverOverlayStyle}
            getPopupContainer={() => document.body}
            open={deliveryTimeOpen}
            onOpenChange={(open) => setDeliveryTimePopoverRowKey(open ? noteRowKey : null)}
            content={(
              <div style={{ width: 'min(88vw, 320px)' }}>
                <div className="text-xs text-gray-500 dark:text-gray-300 mb-2">زمان تحویل ردیف</div>
                <Input.TextArea
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  value={deliveryTimeValue}
                  disabled={!canEditNote}
                  onChange={(event) => updateRow(index, 'delivery_time', event.target.value)}
                  placeholder="مثلا 7 الی 10 روز کاری"
                />
                <div className="mt-2 flex justify-end">
                  <Space size={2}>
                    <Button
                      size="small"
                      type="text"
                      className="!h-6 !w-6 !min-w-6 !px-0 text-emerald-600"
                      icon={<CheckOutlined />}
                      onClick={() => setDeliveryTimePopoverRowKey(null)}
                    />
                    <Button
                      size="small"
                      type="text"
                      className="!h-6 !w-6 !min-w-6 !px-0 text-gray-500"
                      icon={<CloseOutlined />}
                      onClick={() => setDeliveryTimePopoverRowKey(null)}
                    />
                  </Space>
                </div>
              </div>
            )}
          >
            <Button
              size="small"
              type="text"
              className={deliveryTimeValue.trim() ? 'text-leather-600' : 'text-gray-400 dark:text-gray-300'}
              icon={<ClockCircleOutlined />}
              title={deliveryTimeValue.trim() ? 'زمان تحویل ثبت شده' : 'زمان تحویل ثبت نشده'}
            />
          </Popover>
        )}
        {showInvoiceShelf && (
          <Popover
            trigger="click"
            placement={popoverPlacement}
            overlayStyle={popoverOverlayStyle}
            getPopupContainer={() => document.body}
            open={shelfOpen}
            onOpenChange={(open) => {
              if (open && isInvoiceItems && record?.product_id && !isPackageInvoiceRow(record)) {
                const shelvesState = shelfOptionsByRow[noteRowKey];
                if (!shelvesState?.loading && !(shelvesState?.options || []).length) {
                  loadShelvesForRow(noteRowKey, String(record.product_id));
                }
              }
              setShelfPopoverRowKey(open ? noteRowKey : null);
            }}
            content={(
              <div style={{ width: 'min(88vw, 320px)' }}>
                <div className="text-xs text-gray-500 dark:text-gray-300 mb-2">{shelfActionLabel}</div>
                <Select
                  className="w-full"
                  placeholder={(record?.product_id || isPackageInvoiceRow(record)) ? shelfSelectedLabel : shelfMissingLabel}
                  value={shelfValue}
                  options={shelfOptions}
                  onChange={(val) => updateRow(index, 'source_shelf_id', val || null)}
                  showSearch
                  optionFilterProp="label"
                  allowClear
                  disabled={!canEditShelf}
                  getPopupContainer={(node) => node?.parentElement || document.body}
                />
                <div className="mt-2 flex justify-end">
                  <Space size={2}>
                    <Button
                      size="small"
                      type="text"
                      className="!h-6 !w-6 !min-w-6 !px-0 text-emerald-600"
                      icon={<CheckOutlined />}
                      onClick={() => setShelfPopoverRowKey(null)}
                    />
                    <Button
                      size="small"
                      type="text"
                      className="!h-6 !w-6 !min-w-6 !px-0 text-gray-500"
                      icon={<CloseOutlined />}
                      onClick={() => setShelfPopoverRowKey(null)}
                    />
                  </Space>
                </div>
              </div>
            )}
          >
            <Button
              size="small"
              type="text"
              className={shelfValue ? 'text-leather-600' : 'text-gray-400 dark:text-gray-300'}
              icon={<EnvironmentOutlined />}
              title={shelfValue ? shelfSelectedLabel : shelfMissingLabel}
            />
          </Popover>
        )}
        {showInvoiceDimensions && (
          <Popover
            trigger="click"
            placement={popoverPlacement}
            overlayStyle={popoverOverlayStyle}
            getPopupContainer={() => document.body}
            open={dimensionsOpen}
            onOpenChange={(open) => setDimensionsPopoverRowKey(open ? noteRowKey : null)}
            content={(
              <div style={{ width: 'min(88vw, 320px)' }} className="space-y-2">
                <div className="text-xs text-gray-600 dark:text-gray-200">
                  طول و عرض ({dimensionAutoQuantity ? 'محاسبه خودکار' : 'نمایشی'}) بر حسب{' '}
                  <span className="font-semibold text-brand-700 dark:text-brand-300">{dimensionMainUnit}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <InputNumber
                    min={0}
                    controls={false}
                    className="w-full"
                    placeholder="طول"
                    value={lengthValue}
                    disabled={!canEditDimensions}
                    onChange={(val) => updateInvoiceDimensions(index, { length: val ?? null })}
                  />
                  <InputNumber
                    min={0}
                    controls={false}
                    className="w-full"
                    placeholder="عرض"
                    value={widthValue}
                    disabled={!canEditDimensions}
                    onChange={(val) => updateInvoiceDimensions(index, { width: val ?? null })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <InputNumber
                    min={0}
                    controls={false}
                    className="w-full"
                    placeholder="تعداد"
                    value={dimensionCountValue}
                    disabled={!canEditDimensions}
                    onChange={(val) => updateInvoiceDimensions(index, { dimension_count: val ?? null })}
                  />
                  <Checkbox
                    checked={dimensionCountAsSubQuantity}
                    disabled={!canEditDimensions}
                    onChange={(event) => updateInvoiceDimensions(index, { dimension_count_to_sub_quantity: event.target.checked })}
                    className="text-[11px] whitespace-nowrap"
                  >
                    افزودن بعنوان مقدار واحد فرعی (عدد)
                  </Checkbox>
                </div>
                {dimensionAutoQuantity ? (
                  <div className="text-[11px] text-gray-500 dark:text-gray-300">
                    تعداد/مقدار = طول × عرض × تعداد = {toPersianNumber(String(dimensionComputedQuantity || 0))}
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-500 dark:text-gray-300">
                    ابعاد برای نمایش و چاپ ثبت می‌شود و مقدار ردیف را تغییر نمی‌دهد.
                  </div>
                )}
                {!canEditDimensions && (
                  <div className="text-[11px] text-gray-500 dark:text-gray-300">
                    طول: {toPersianNumber(lengthValue ?? 0)} | عرض: {toPersianNumber(widthValue ?? 0)} | تعداد: {toPersianNumber(dimensionCountValue ?? 1)}
                  </div>
                )}
                <div className="flex justify-end">
                  <Space size={2}>
                    <Button
                      size="small"
                      type="text"
                      className="!h-6 !w-6 !min-w-6 !px-0 text-emerald-600"
                      icon={<CheckOutlined />}
                      onClick={() => setDimensionsPopoverRowKey(null)}
                    />
                    <Button
                      size="small"
                      type="text"
                      className="!h-6 !w-6 !min-w-6 !px-0 text-gray-500"
                      icon={<CloseOutlined />}
                      onClick={() => setDimensionsPopoverRowKey(null)}
                    />
                  </Space>
                </div>
              </div>
            )}
          >
            <Button
              size="small"
              type="text"
              className={hasDimensionsValue ? 'text-leather-600' : 'text-gray-400 dark:text-gray-300'}
              icon={<AppstoreOutlined />}
              title={hasDimensionsValue ? 'ابعاد ثبت شده' : 'ابعاد ثبت نشده'}
            />
          </Popover>
        )}
        {showInvoiceCalendar && (
          <Popover
            trigger="click"
            placement={popoverPlacement}
            overlayStyle={popoverOverlayStyle}
            getPopupContainer={() => document.body}
            open={calendarOpen}
            onOpenChange={(open) => setCalendarPopoverRowKey(open ? noteRowKey : null)}
            content={(
              <div style={{ width: 'min(88vw, 320px)' }} className="space-y-2">
                <div className="text-xs text-gray-500 dark:text-gray-300">تعیین تاریخ</div>
                <div>
                  <div className="text-[11px] mb-1 text-gray-500 dark:text-gray-300">تاریخ شروع</div>
                  <PersianDatePicker
                    type="DATE"
                    value={startDateValue}
                    disabled={!canEditCalendar}
                    onChange={(val) => updateInvoiceDateRange(index, { start_date: val })}
                  />
                </div>
                <div>
                  <div className="text-[11px] mb-1 text-gray-500 dark:text-gray-300">تاریخ پایان</div>
                  <PersianDatePicker
                    type="DATE"
                    value={endDateValue}
                    disabled={!canEditCalendar}
                    onChange={(val) => updateInvoiceDateRange(index, { end_date: val })}
                  />
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-300">
                  اختلاف: {typeof dateDiffDays === 'number' ? toPersianNumber(dateDiffDays) : '-'} روز
                </div>
                <div className="flex justify-end">
                  <Space size={2}>
                    <Button
                      size="small"
                      type="text"
                      className="!h-6 !w-6 !min-w-6 !px-0 text-emerald-600"
                      icon={<CheckOutlined />}
                      onClick={() => setCalendarPopoverRowKey(null)}
                    />
                    <Button
                      size="small"
                      type="text"
                      className="!h-6 !w-6 !min-w-6 !px-0 text-gray-500"
                      icon={<CloseOutlined />}
                      onClick={() => setCalendarPopoverRowKey(null)}
                    />
                  </Space>
                </div>
              </div>
            )}
          >
            <Button
              size="small"
              type="text"
              className={hasCalendarValue ? 'text-leather-600' : 'text-gray-400 dark:text-gray-300'}
              icon={<CalendarOutlined />}
              title={hasCalendarValue ? 'تاریخ ثبت شده' : 'تاریخ ثبت نشده'}
            />
          </Popover>
        )}
        {col.type === FieldType.PERCENTAGE_OR_AMOUNT && typeKey && (
          <Button
            size="small"
            type="text"
            onClick={() => {
              const nextType = typeValue === 'percent' ? 'amount' : 'percent';
              updateRow(index, typeKey, nextType);
            }}
            title={typeValue === 'percent' ? 'درصدی' : 'مبلغی'}
            className="px-1"
          >
            {typeValue === 'percent' ? '%' : currencyLabel}
          </Button>
        )}
        {isPaymentAttachment && attachmentUrl && (
          <Button
            size="small"
            type="text"
            icon={<EyeOutlined />}
            title="نمایش پیوست"
            className="text-blue-600"
            onClick={() => setPreviewAttachmentUrl(attachmentUrl)}
          />
        )}
      </div>
    );
  };
  const tableVisibleColumns = isAnyInvoiceItems
    ? visibleColumns.filter((col: any) => !['description', 'source_shelf_id', 'length', 'width', 'use_dimensions'].includes(col.key))
    : visibleColumns;
  const canReorderRows =
    (isAnyInvoiceItems || isPriceListItems || isSalesPackageItems) &&
    !isReadOnly &&
    (isEditing || mode === 'local');
  const canCopyRows = !isReadOnly && (isEditing || mode === 'local');
  const canRefreshRelatedPrices =
    (isAnyInvoiceItems || isPriceListItems || isSalesPackageItems) &&
    !isReadOnly;
  const resolveColumnTitle = (col: any) => {
    if (isAnyInvoicePayments && col?.key === 'amount') {
      return `${col.title} (${currencyLabel})`;
    }
    return col?.title;
  };
  const isPaymentsTable = block?.id === 'payments' && isOperationalPayments;
  const paymentsActionNounFa = isInvoicePayments ? 'دریافت' : 'پرداخت';
  const isGatewayLockedPaymentRow = (row: any) =>
    isPaymentsTable
    && (
      row?._readonly === true
      || row?._lockedByGateway === true
      || row?.locked === true
      || String(row?.source || '').trim() === 'online_gateway'
      || String(row?.gateway_transaction_id || '').trim() !== ''
    );

  const columns = [
    ...(canReorderRows
      ? [
          {
            title: '',
            key: 'row_reorder',
            width: 52,
            render: (_: any, _row: any, index: number) => (
              <div className="flex flex-col items-center justify-center leading-none">
                <Button
                  type="text"
                  size="small"
                  className="!h-5 !w-5 !min-w-5 !px-0 text-gray-500"
                  icon={<UpOutlined />}
                  onClick={() => moveRow(index, 'up')}
                  disabled={index === 0}
                  title="جابجایی به بالا"
                />
                <Button
                  type="text"
                  size="small"
                  className="!h-5 !w-5 !min-w-5 !px-0 text-gray-500"
                  icon={<DownOutlined />}
                  onClick={() => moveRow(index, 'down')}
                  disabled={index === ((isEditing ? tempData : data).length - 1)}
                  title="جابجایی به پایین"
                />
              </div>
            ),
          },
        ]
      : []),
    ...selectionColumns,
    ...(tableVisibleColumns.map((col: any) => ({
      title: resolveColumnTitle(col),
      dataIndex: col.key,
      key: col.key,
      type: col.type,
      width: getColWidth(col),
      render: (text: any, record: any, index: number) => renderColumnEditor(col, record, index, text),
    })) || []),
    ...(isEditing
        ? [
          {
            title: '',
            key: 'actions',
            width: canCopyRows ? 84 : 50,
            render: (_: any, row: any, i: number) => (
              <Space size={0}>
                {canCopyRows ? (
                  <Button
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={() => copyRow(i)}
                    disabled={(isProductStockMovements && row?._readonly) || isGatewayLockedPaymentRow(row)}
                  />
                ) : null}
                <Button
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={() => removeRow(i)}
                  disabled={(isProductStockMovements && row?._readonly) || isGatewayLockedPaymentRow(row)}
                />
              </Space>
            ),
          },
        ]
      : []),
  ];

  const sourceRows = isEditing ? tempData : data;
  const updateInvoiceGlobalDiscount = (patch: Partial<{ type: 'percent' | 'amount'; amount: number }>) => {
    const nextType = patch.type || currentInvoiceGlobalDiscountType;
    const nextAmount = Math.max(0, toSafeNumber(
      patch.amount !== undefined ? patch.amount : currentInvoiceGlobalDiscountValue
    ));
    setCurrentInvoiceGlobalDiscountType(nextType);
    setCurrentInvoiceGlobalDiscountValue(nextAmount);
    onInvoiceGlobalDiscountChange?.({ type: nextType, amount: nextAmount });
  };
  const hasPersistedRows = Array.isArray(data) && data.length > 0;
  const resolveTableRowKey = (record: any) => ensureStableTableRowKey(record);
  const stackedRowGroupA = ['attachment', 'payment_type', 'cheque_id', 'barter_id', 'cheque_status', 'status', 'date', 'amount'];
  const stackedRowGroupB = isInvoicePayments
    ? ['target_account', 'responsible_id', 'description']
    : ['source_account', 'use_existing_received_cheque', 'spent_cheque_id', 'responsible_id', 'description'];
  const stackedColumnsByKey = new Map<string, any>(visibleColumns.map((col: any) => [col.key, col]));

  const renderStackedField = (row: any, rowIndex: number, key: string) => {
    const col = stackedColumnsByKey.get(key);
    if (!col) return null;
    if (!shouldShowStackedField(key, row)) return null;
    return (
      <div key={`${getRowKey(row)}_${key}`} className="min-w-[170px] flex-1">
        <div className="text-[11px] mb-1 text-gray-500 dark:text-gray-300">{resolveColumnTitle(col)}</div>
        {renderColumnEditor(col, row, rowIndex)}
      </div>
    );
  };

  const renderChequeMetaCard = (row: any) => {
    if (!isAnyInvoicePayments) return null;
    if (normalizeCashBankPaymentType(row?.payment_type) !== 'cheque') return null;
    if (!row?.cheque_id && !row?.spent_cheque_id) return null;

    const serialNo = String(row?.cheque_serial_no || '').trim();
    const sayadId = String(row?.cheque_sayad_id || '').trim();
    const dueDate = String(row?.cheque_due_date || '').trim();
    const dueDateFa = dueDate ? (safeJalaliFormat(dueDate, 'YYYY/MM/DD') || dueDate) : '';
    const accountHolder = String(row?.cheque_account_holder_name || '').trim();
    const bankName = String(row?.cheque_bank_name || '').trim();
    const chequeStatusKey = String(row?.cheque_status || '').trim();
    const chequeStatusLabel = CHEQUE_STATUS_LABELS[chequeStatusKey] || chequeStatusKey || '-';
    const imageUrl = String(row?.cheque_image_url || row?.attachment || '').trim();

    return (
      <div className="mt-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-[#141414] px-3 py-2">
        <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-200 mb-2">مشخصات چک</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-600 dark:text-gray-300">
          <div>شماره چک: <span className="persian-number text-gray-800 dark:text-gray-100">{serialNo ? toPersianNumber(serialNo) : '-'}</span></div>
          <div>شماره صیاد: <span className="persian-number text-gray-800 dark:text-gray-100">{sayadId ? toPersianNumber(sayadId) : '-'}</span></div>
          <div>تاریخ سررسید: <span className="persian-number text-gray-800 dark:text-gray-100">{dueDateFa ? toPersianNumber(dueDateFa) : '-'}</span></div>
          <div>نام صاحب حساب: <span className="text-gray-800 dark:text-gray-100">{accountHolder || '-'}</span></div>
          <div>نام بانک: <span className="text-gray-800 dark:text-gray-100">{bankName || '-'}</span></div>
          <div>وضعیت چک: <span className="text-gray-800 dark:text-gray-100">{chequeStatusLabel}</span></div>
        </div>
        {imageUrl ? (
          <div className="mt-2">
            <Button
              size="small"
              type="link"
              className="!px-0"
              icon={<EyeOutlined />}
              onClick={() => setPreviewAttachmentUrl(imageUrl)}
            >
              مشاهده تصویر چک
            </Button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderStackedSummary = () => {
    if (!useStackedInvoiceRows) return null;
    if (isAnyInvoicePayments) {
      const totalAmount = sourceRows.reduce((sum: number, row: any) => sum + (parseFloat(row?.amount) || 0), 0);
      const totalReceived = sourceRows.reduce((sum: number, row: any) => (
        String(row?.status || '') === 'received' ? sum + (parseFloat(row?.amount) || 0) : sum
      ), 0);
      return (
        <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-700 dark:text-gray-100 bg-gray-50 dark:bg-[#171717] flex flex-wrap gap-4">
          <span>جمع مبلغ: <span className="persian-number font-semibold">{formatPersianPrice(totalAmount)}</span></span>
          <span>جمع نهایی وضعیت انجام‌شده: <span className="persian-number font-semibold">{formatPersianPrice(totalReceived)}</span></span>
        </div>
      );
    }
    return null;
  };

  const tableExpandable = isProductionOrder && isBomItemBlock
    ? {
        expandedRowKeys,
        onExpandedRowsChange: (keys: readonly React.Key[]) => setExpandedRowKeys(keys as React.Key[]),
        onExpand: (expanded: boolean, record: any) => {
          if (expanded) {
            const rowKey = getRowKey(record);
            loadProductsForRow(rowKey, record, { resetPage: true });
            if (record?.selected_product_id) {
              loadShelvesForRow(rowKey, record.selected_product_id);
            }
          }
        },
        expandedRowRender: (record: any) => {
          const rowKey = getRowKey(record);
          const rowIndex = resolveRowIndex(rowKey);
          const productsState = expandedProducts[rowKey];
          const selectedProductId = record?.selected_product_id;

          const filterColumns = (block.tableColumns || [])
            .filter((col: any) => col.filterable)
            .map((col: any) => col.key);
          const productFieldKeys = (productsModule?.fields || []).map((f: any) => f.key) || [];
          const specsColumns = filterColumns.filter((key: string) => productFieldKeys.includes(key));

          const baseColumns = ['image_url', 'name', 'system_code'];
          const tailColumns = ['stock', 'buy_price', 'sell_price'];
          const orderedColumns = Array.from(new Set([...baseColumns, ...specsColumns, ...tailColumns]));
          const resolvedColumns = orderedColumns.filter((key) => productFieldKeys.includes(key));
          const fallbackColumns = resolvedColumns.length > 0 ? resolvedColumns : ['name'];

          return (
            <div className="bg-gray-50 dark:bg-[#121212] py-3 px-0 rounded-lg border border-gray-200 dark:border-gray-700">
              {productsState?.loading ? (
                <div className="py-6 flex items-center justify-center"><Spin /></div>
              ) : (
                <div className="smarttable-shell">
                  <SmartTableRenderer
                    key={`products-${rowKey}-${rowReloadVersion[rowKey] || 0}`}
                    moduleConfig={productsModule}
                    data={productsState?.data || []}
                    loading={false}
                    relationOptions={relationOptions}
                    dynamicOptions={dynamicOptions}
                    containerClassName="smarttable-shell-inner"
                    tableLayout="auto"
                    disableScroll={true}
                    visibleColumns={fallbackColumns}
                    pagination={{ pageSize: 5, position: ['bottomCenter'], size: 'small', showSizeChanger: false }}
                    rowSelection={{
                      type: 'radio',
                      selectedRowKeys: selectedProductId ? [selectedProductId] : [],
                      onChange: (_keys: any[], rows: any[]) => {
                        const selected = rows?.[0];
                        if (rowIndex < 0) return;
                        applySelectedProduct(rowIndex, rowKey, selected);
                      },
                    }}
                  />
                </div>
              )}

            </div>
          );
        },
      }
    : undefined;

  if (loadingData) return <div className="p-10 text-center"><Spin /></div>;

  return (
    <>
    <div className={`bg-white dark:bg-[#1a1a1a] p-6 rounded-[2rem] shadow-sm border ${isEditing ? 'border-leather-500' : 'border-gray-200 dark:border-gray-800'} transition-all font-medium`}>
      <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-800 pb-4">
        <div className="flex items-center gap-2 flex-row-reverse">
          <Button
            type="text"
            size="small"
            className="p-0"
            onClick={() => {
              setUserToggledCollapse(true);
              setIsCollapsed((prev) => !prev);
            }}
            icon={<RightOutlined className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />}
          />
          <h3 className="font-bold text-base text-gray-700 dark:text-white m-0 flex items-center gap-2">
            <span className="w-1 h-5 bg-leather-500 rounded-full inline-block"></span>
            {block.titles.fa}
          </h3>
        </div>
        <Space>
          {canRefreshRelatedPrices && (
            <Button
              size="small"
              type="text"
              icon={<ReloadOutlined />}
              loading={priceRefreshLoading}
              disabled={!isEditing && mode !== 'local'}
              title={!isEditing && mode !== 'local' ? 'ابتدا جدول را در حالت ویرایش قرار دهید' : 'بروزرسانی قیمت از رکورد مرتبط'}
              onClick={() => { void handleRefreshRelatedPrices(); }}
            />
          )}
          {isPriceListItems && (
            <Button
              size="small"
              type="primary"
              ghost
              disabled={!isEditing && mode !== 'local'}
              title={!isEditing && mode !== 'local' ? 'ابتدا جدول را در حالت ویرایش قرار دهید' : 'محاسبه قیمت فروش از قیمت خرید و درصد سود جدول'}
              onClick={handleCalculatePriceListSellPrices}
            >
              محاسبه قیمت
            </Button>
          )}
          {mode === 'db' && !isEditing && !isReadOnly && isPaymentsTable && !hasPersistedRows && (
            <Button size="small" icon={<PlusOutlined />} onClick={() => { void addPaymentFromHeader(); }}>
              {`افزودن ${paymentsActionNounFa}`}
            </Button>
          )}
          {mode === 'db' && !isEditing && !isReadOnly && (!isPaymentsTable || hasPersistedRows) && (
            <Button size="small" icon={<EditOutlined />} onClick={startEdit}>
              {isPaymentsTable ? `ویرایش ${paymentsActionNounFa}` : 'ویرایش لیست'}
            </Button>
          )}
        </Space>
      </div>

      {!isCollapsed && (
        useStackedInvoiceRows ? (
          <div className="space-y-3">
            {sourceRows.length === 0 ? (
              <Empty description="لیست خالی است" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              sourceRows.map((row: any, rowIndex: number) => (
                <div
                  key={getRowKey(row) || `${block.id}_${rowIndex}`}
                  data-row-key={getRowKey(row)}
                  className={`rounded-2xl border bg-gradient-to-r from-white to-gray-50 dark:from-[#1c1c1c] dark:to-[#181818] p-3 transition-colors ${
                    highlightedFocusRowKey && highlightedFocusRowKey === getRowKey(row)
                      ? 'border-[rgb(var(--brand-500-rgb))] ring-2 ring-[rgba(var(--brand-500-rgb),0.18)]'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Text className="text-xs text-gray-500 dark:text-gray-300">ردیف {toPersianNumber(rowIndex + 1)}</Text>
                    {isEditing && (
                      <Space size={0}>
                        {canCopyRows ? (
                          <Button
                            type="text"
                            icon={<CopyOutlined />}
                            onClick={() => copyRow(rowIndex)}
                            disabled={(isProductStockMovements && row?._readonly) || isGatewayLockedPaymentRow(row)}
                          />
                        ) : null}
                        <Button
                          danger
                          type="text"
                          icon={<DeleteOutlined />}
                          onClick={() => removeRow(rowIndex)}
                          disabled={(isProductStockMovements && row?._readonly) || isGatewayLockedPaymentRow(row)}
                        />
                      </Space>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {stackedRowGroupA.map((key) => renderStackedField(row, rowIndex, key))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-3">
                    {stackedRowGroupB.map((key) => renderStackedField(row, rowIndex, key))}
                  </div>
                  {renderChequeMetaCard(row)}
                </div>
              ))
            )}
            {(isEditing || mode === 'local') && !isReadOnly && (
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => { void addRow(); }}>افزودن ردیف جدید</Button>
            )}
            {renderStackedSummary()}
          </div>
        ) : (
        <Table
          dataSource={isEditing ? tempData : data}
          columns={columns}
          pagination={false}
          size="middle"
          rowKey={(record: any) => resolveTableRowKey(record)}
          locale={{ emptyText: <Empty description="لیست خالی است" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          className="custom-erp-table font-medium editable-table-main"
          tableLayout="auto"
          scroll={{ x: 'max-content' }}
          rowClassName={(record: any) => (
            highlightedFocusRowKey && highlightedFocusRowKey === getRowKey(record)
              ? 'bg-[rgba(var(--brand-50-rgb),0.75)] dark:bg-[rgba(var(--brand-900-rgb),0.45)]'
              : ''
          )}
          expandable={tableExpandable as any}
          footer={(isEditing || mode === 'local') && !isReadOnly ? () => (
            <Button type="dashed" block icon={<PlusOutlined />} onClick={() => { void addRow(); }}>افزودن ردیف جدید</Button>
          ) : undefined}
          summary={(pageData) => {
            if (isProductStockMovements) {
              const incoming = pageData.reduce((sum: number, row: any) => {
                const qty = Math.abs(parseFloat(row?.main_quantity) || 0);
                const type = String(row?.voucher_type || '');
                if (type === 'incoming' || type === 'transfer') return sum + qty;
                return sum;
              }, 0);
              const outgoing = pageData.reduce((sum: number, row: any) => {
                const qty = Math.abs(parseFloat(row?.main_quantity) || 0);
                const type = String(row?.voucher_type || '');
                if (type === 'outgoing' || type === 'transfer') return sum + qty;
                return sum;
              }, 0);
              return (
                <Table.Summary fixed>
                  <Table.Summary.Row className="font-bold bg-[rgba(var(--brand-50-rgb),0.65)] dark:bg-[rgba(var(--brand-900-rgb),0.45)]">
                    <Table.Summary.Cell index={0} colSpan={columns.length}>
                      <div className="flex flex-wrap gap-4 text-xs md:text-sm">
                        <span>جمع ورود: <span className="text-green-600 persian-number">{toPersianNumber(incoming)}</span></span>
                        <span>جمع خروج: <span className="text-red-600 persian-number">{toPersianNumber(outgoing)}</span></span>
                        <span>موجودی فعلی: <span className="text-leather-600 persian-number">{toPersianNumber(currentProductStock)}</span></span>
                      </div>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              );
            }

            let cellIndex = 0;
            const cells: React.ReactNode[] = [];
            const pageSubtotal = isAnyInvoiceItems
              ? pageData.reduce((sum: number, row: any) => {
                const rowTotal = parseFloat(row?.total_price);
                if (Number.isFinite(rowTotal)) return sum + rowTotal;
                return sum + calculateRow(row || {}, RowCalculationType.INVOICE_ROW);
              }, 0)
              : 0;
            const pageGlobalDiscountAmount = isAnyInvoiceItems
              ? resolveInvoiceGlobalDiscountAmount(
                pageSubtotal,
                currentInvoiceGlobalDiscountType,
                currentInvoiceGlobalDiscountValue
              )
              : 0;
            const pageFinalTotal = isAnyInvoiceItems
              ? Math.max(0, roundMoney(pageSubtotal - pageGlobalDiscountAmount))
              : 0;

            if (isProductionOrder && isBomItemBlock) {
              cells.push(<Table.Summary.Cell index={cellIndex} key="expand-spacer" />);
              cellIndex += 1;
            }

            let summaryLabelRendered = false;
            columns.forEach((col: any, index: number) => {
              if (col.key === 'actions' || col.key === 'row_reorder') {
                cells.push(<Table.Summary.Cell index={cellIndex} key={`actions_${index}`} />);
                cellIndex += 1;
                return;
              }

              if (!summaryLabelRendered) {
                cells.push(
                  <Table.Summary.Cell index={cellIndex} key={`label_${index}`}>
                    <span className="text-[rgb(var(--brand-700-rgb))] dark:text-gray-200">جمع:</span>
                  </Table.Summary.Cell>
                );
                summaryLabelRendered = true;
                cellIndex += 1;
                return;
              }

              if (col.showTotal || ['total_price', 'amount', 'quantity', 'sub_quantity', 'unit_price', 'usage', 'stock'].includes(col.key)) {
                let total = 0;
                const isPriceTotal =
                  col.type === FieldType.PRICE ||
                  ['total_price', 'amount', 'unit_price', 'discount', 'vat'].includes(String(col.key || ''));
                if (isAnyInvoiceItems && (col.key === 'discount' || col.key === 'vat')) {
                  total = pageData.reduce((prev: number, current: any) => {
                    const amounts = getInvoiceAmounts(current);
                    return prev + (col.key === 'discount' ? amounts.discountAmount : amounts.vatAmount);
                  }, 0);
                } else if (isAnyInvoiceItems && col.key === 'total_price') {
                  total = pageFinalTotal;
                } else if (isAnyInvoicePayments && col.key === 'amount') {
                  total = pageData.reduce((prev: number, current: any) =>
                    current?.status === 'received' ? prev + (parseFloat(current[col.key]) || 0) : prev,
                  0);
                } else {
                  total = pageData.reduce((prev: number, current: any) => prev + (parseFloat(current[col.key]) || 0), 0);
                }
                cells.push(
                  <Table.Summary.Cell index={cellIndex} key={`total_${index}`}>
                    <Text className="persian-number !text-[rgb(var(--brand-600-rgb))] dark:!text-leather-300">
                      {formatPersianPrice(total)}
                      {isPriceTotal ? <span className="ms-1 text-[10px] opacity-80">{currencyLabel}</span> : null}
                    </Text>
                  </Table.Summary.Cell>
                );
                summaryLabelRendered = true;
                cellIndex += 1;
                return;
              }

              cells.push(<Table.Summary.Cell index={cellIndex} key={`empty_${index}`} />);
              cellIndex += 1;
            });

            return (
              <Table.Summary fixed>
                {isAnyInvoiceItems ? (
                  <Table.Summary.Row className="bg-[rgba(var(--brand-50-rgb),0.35)] dark:bg-[rgba(var(--brand-900-rgb),0.2)]">
                    <Table.Summary.Cell index={0} colSpan={columns.length}>
                      <div className="flex flex-wrap items-center gap-3 py-1">
                        <span className="text-[rgb(var(--brand-700-rgb))] dark:text-gray-200 font-semibold">تخفیف کل:</span>
                        {(!isReadOnly && (mode === 'local' || isEditing)) ? (
                          <>
                            <Select
                              size="small"
                              value={currentInvoiceGlobalDiscountType}
                              style={{ minWidth: 128 }}
                              options={[
                                { label: 'درصد', value: 'percent' },
                                { label: 'مبلغ', value: 'amount' },
                              ]}
                              onChange={(value) => updateInvoiceGlobalDiscount({ type: normalizeInvoiceGlobalDiscountType(value) })}
                            />
                            <Space.Compact size="small">
                              <InputNumber
                                size="small"
                                min={0}
                                max={currentInvoiceGlobalDiscountType === 'percent' ? 100 : undefined}
                                value={currentInvoiceGlobalDiscountValue}
                                style={{ minWidth: 130 }}
                                className="persian-number"
                                onChange={(value) => updateInvoiceGlobalDiscount({ amount: toSafeNumber(value) })}
                              />
                              <Button size="small" disabled>
                                {currentInvoiceGlobalDiscountType === 'percent' ? '%' : currencyLabel}
                              </Button>
                            </Space.Compact>
                          </>
                        ) : (
                          <span className="persian-number text-gray-700 dark:text-gray-200">
                            {currentInvoiceGlobalDiscountType === 'percent'
                              ? `${toPersianNumber(currentInvoiceGlobalDiscountValue)}٪`
                              : `${formatPersianPrice(currentInvoiceGlobalDiscountValue)} ${currencyLabel}`
                            }
                          </span>
                        )}
                        <span className="persian-number text-red-600 dark:text-red-300 text-xs md:text-sm">
                          ({formatPersianPrice(pageGlobalDiscountAmount)} {currencyLabel} -)
                        </span>
                      </div>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                ) : null}
                <Table.Summary.Row className="font-bold bg-[rgba(var(--brand-50-rgb),0.65)] dark:bg-[rgba(var(--brand-900-rgb),0.45)]">
                  {cells}
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />
        )
      )}
      {isEditing && mode !== 'local' && !isCollapsed && (
        <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
          <Button type="primary" onClick={() => { void handleSave(); }} loading={saving} icon={<SaveOutlined />}>ذخیره</Button>
          <Button onClick={cancelEdit} disabled={saving} icon={<CloseOutlined />}>انصراف</Button>
        </div>
      )}
      <Modal
        open={!!previewAttachmentUrl}
        title="پیش‌نمایش پیوست"
        onCancel={() => setPreviewAttachmentUrl(null)}
        footer={[
          <Button
            key="download"
            icon={<DownloadOutlined />}
            onClick={() => {
              if (!previewAttachmentUrl) return;
              const link = document.createElement('a');
              link.href = previewAttachmentUrl;
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
              link.download = `attachment-${Date.now()}.jpg`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
          >
            دانلود
          </Button>,
          <Button
            key="share"
            icon={<ShareAltOutlined />}
            onClick={async () => {
              if (!previewAttachmentUrl) return;
              const shareApi = typeof navigator !== 'undefined' ? (navigator as any).share : null;
              if (typeof shareApi === 'function') {
                try {
                  await shareApi({ url: previewAttachmentUrl, title: 'پیوست' });
                  return;
                } catch {
                  // fallback to opening in new tab
                }
              }
              window.open(previewAttachmentUrl, '_blank', 'noopener,noreferrer');
            }}
          >
            اشتراک‌گذاری
          </Button>,
          <Button
            key="print"
            icon={<PrinterOutlined />}
            onClick={() => {
              if (!previewAttachmentUrl) return;
              const printWindow = window.open('', '_blank');
              if (!printWindow) return;
              printWindow.document.write(
                `<html><head><title>Print</title></head><body style=\"margin:0;text-align:center;\"><img src=\"${previewAttachmentUrl}\" style=\"max-width:100%;height:auto;\"/></body></html>`
              );
              printWindow.document.close();
              printWindow.focus();
              printWindow.print();
            }}
          >
            پرینت
          </Button>,
        ]}
        width={760}
        destroyOnHidden
      >
        {previewAttachmentUrl ? (
          <div className="flex justify-center">
            <ResilientImage
              src={previewAttachmentUrl}
              preset="gallery"
              alt="Attachment"
              className="max-h-[70vh] w-auto rounded-lg border border-gray-200"
              loading="lazy"
              decoding="async"
            />
          </div>
        ) : null}
      </Modal>
      <style>{`
        .ant-table-expanded-row > td {
          padding-left: 0 !important;
          padding-right: 0 !important;
        }
        .smarttable-shell {
          width: 100%;
          overflow-x: auto;
        }
        .smarttable-shell-inner,
        .smarttable-shell-inner .ant-table,
        .smarttable-shell-inner .ant-table-container {
          width: 100% !important;
          min-width: 0 !important;
        }
        .smarttable-shell-inner .ant-table-content,
        .smarttable-shell-inner .ant-table-container > table {
          width: 100% !important;
        }
        .smarttable-shell-inner .ant-table-container {
          margin: 0 !important;
          padding: 0 !important;
        }
        .smarttable-shell-inner .ant-spin-nested-loading,
        .smarttable-shell-inner .ant-spin-container {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          min-width: 0 !important;
        }
        .smarttable-shell-inner .ant-table-body {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .smarttable-shell-inner .ant-table-body::-webkit-scrollbar {
          height: 0px;
        }
        .smarttable-shell-inner .ant-table-filter-dropdown,
        .smarttable-shell-inner .ant-dropdown {
          z-index: 7000 !important;
        }
        .editable-table-main {
          font-size: 12px;
        }
        .editable-table-main .ant-table {
          font-size: 12px;
        }
        .editable-table-main .ant-table-cell {
          padding: 10px 12px !important;
          font-size: 12px !important;
          overflow: hidden !important;
          text-overflow: ellipsis;
        }
        .editable-table-main .ant-table-thead > tr > th {
          padding: 10px 10px !important;
          font-size: 12px !important;
        }
        .editable-table-main .ant-table-cell .ant-form-item {
          margin-bottom: 0 !important;
          min-width: 0 !important;
        }
        .editable-table-main .ant-table-cell .ant-select,
        .editable-table-main .ant-table-cell .ant-input,
        .editable-table-main .ant-table-cell .ant-input-number,
        .editable-table-main .ant-table-cell .ant-picker {
          max-width: 100% !important;
        }
        .editable-table-main .ant-table-cell .ant-select-selector {
          min-width: 0 !important;
        }
        .custom-erp-table .ant-table-expanded-row > td {
          overflow-x: auto !important;
        }
      `}</style>
    </div>
    {pendingInvoicePaymentAllocation && isAnyInvoicePayments ? (
      <InvoicePaymentAllocationModal
        open
        moduleId={moduleId as 'invoices' | 'purchase_invoices'}
        sourceInvoiceId={recordId}
        partyId={pendingInvoicePaymentAllocation.partyId}
        excessAmount={pendingInvoicePaymentAllocation.plan.excessAmount}
        onCancel={() => setPendingInvoicePaymentAllocation(null)}
        onConfirm={(allocations) => { void handleSave(allocations); }}
      />
    ) : null}
    </>
  );
};

export default EditableTable;
