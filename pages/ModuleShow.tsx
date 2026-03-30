import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, App, Avatar, Checkbox, Modal, Select, Form, Input, Skeleton } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType, BlockType, LogicOperator } from '../types';
import SmartForm from '../components/SmartForm';
import RelatedSidebar from '../components/Sidebar/RelatedSidebar';
import SmartFieldRenderer from '../components/SmartFieldRenderer';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import HeaderActions from '../components/moduleShow/HeaderActions';
import HeroSection from '../components/moduleShow/HeroSection';
import FieldGroupsTabs from '../components/moduleShow/FieldGroupsTabs';
import TablesSection from '../components/moduleShow/TablesSection';
import PrintSection from '../components/moduleShow/PrintSection';
import CustomerFinancialOverviewPanel from '../components/accounting/CustomerFinancialOverviewPanel';
import AccountLedgerPanel from '../components/accounting/AccountLedgerPanel';
import StartProductionModal, { type StartMaterialGroup, type StartMaterialPiece, type StartMaterialDeliveryRow } from '../components/production/StartProductionModal';
import { printStyles } from '../utils/printTemplates';
import { usePrintManager } from '../utils/printTemplates/usePrintManager';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import { convertArea } from '../utils/unitConversions';
import QrScanPopover from '../components/QrScanPopover';
import { PRODUCTION_MESSAGES } from '../utils/productionMessages';
import { getRecordTitle } from '../utils/recordTitle';
import {
  applyProductionMoves,
  rollbackProductionMoves,
  consumeProductionMaterials,
  addFinishedGoods,
  syncProductStock,
} from '../utils/productionWorkflow';
import { applyInvoiceFinalizationInventory } from '../utils/invoiceInventoryWorkflow';
import { createJournalFromInvoice, syncInvoiceAccountingEntries } from '../utils/accountingAutoPosting';
import { canAccessAssignedRecord, fetchCurrentUserRoleContext } from '../utils/permissions';
import { buildClientFallbackSystemCode, supportsSystemCode } from '../utils/systemCode';
import { buildCopyPayload, copyProductionOrderRelations, detectCopyNameField } from '../utils/recordCopy';
import { useCurrencyConfig } from '../utils/currency';
import { fileStorageClient, FILE_STORAGE_BUCKET } from '../utils/storageClient';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { getSafeOptionFallback } from '../utils/optionHelpers';
import { getAssigneeLabel } from '../utils/assigneeLabel';
import { getResolvedAssigneeId } from '../utils/assigneeValue';
import { fetchAssigneeDirectory, fetchDynamicOptionsMap, fetchFormulaOptions } from '../utils/referenceData';
import { getCachedAuthUser } from '../utils/sessionCache';
import { supportsModuleAssignee, supportsModuleRoleAssignee } from '../utils/assigneeSupport';
import { fetchRelationOptionsForField } from '../utils/relationOptions';
import { syncRecordTags } from '../utils/recordTags';
import { getProjectModuleOptions } from '../utils/workflowHelpers';

const toFaAccountingSyncError = (raw: unknown): string => {
  const text = String(raw || '').trim();
  if (!text) return 'خطا در صدور سند حسابداری.';

  const lower = text.toLowerCase();
  if (lower.includes('missing default accounts') && lower.includes('receivable') && lower.includes('revenue')) {
    return 'حساب‌های پیش‌فرض دریافتنی و درآمد فروش تعریف نشده‌اند.';
  }
  if (lower.includes('missing default accounts') && lower.includes('payable')) {
    return 'حساب پیش‌فرض پرداختنی تعریف نشده است.';
  }
  if (lower.includes('json object requested') && lower.includes('multiple')) {
    return 'چند تنظیم هم‌زمان برای حسابداری پیدا شد. لطفا فقط یک تنظیم پیش‌فرض نگه دارید.';
  }
  if (/[a-z]/i.test(text)) {
    return 'خطا در صدور سند حسابداری.';
  }
  return text;
};

const ModuleShowSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#f6f7fb] dark:bg-[#0f1115] px-4 py-5 md:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
        <div className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#17191f]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <Skeleton.Avatar active size={72} shape="square" className="!rounded-2xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <Skeleton.Input active style={{ width: '42%', height: 28 }} />
                <Skeleton.Input active style={{ width: '68%', height: 18 }} />
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <Skeleton.Button key={idx} active size="small" shape="round" />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 3 }).map((_, idx) => (
                <Skeleton.Button key={idx} active />
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#17191f]">
            <Skeleton active title={{ width: '26%' }} paragraph={{ rows: 10 }} />
          </div>
          <div className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#17191f]">
            <Skeleton active title={{ width: '45%' }} paragraph={{ rows: 6 }} />
          </div>
        </div>
      </div>
    </div>
  );
};

const MODULE_SHOW_CACHE_TTL_MS = 30000;
type ModuleShowSnapshot = {
  record: any;
  tags: any[];
  cachedAt: number;
};

const moduleShowSnapshotCache = new Map<string, ModuleShowSnapshot>();
let moduleShowBaseInfoCache: { users: any[]; roles: any[] } | null = null;
let moduleShowBaseInfoPromise: Promise<{ users: any[]; roles: any[] }> | null = null;

const ModuleShow: React.FC = () => {
  const { moduleId = 'products', id } = useParams();
  const navigate = useNavigate();
  const { message: msg, modal } = App.useApp();
  const { label: currencyLabel } = useCurrencyConfig();
  const moduleConfig = MODULES[moduleId];
  const supportsAssignee = supportsModuleAssignee(moduleConfig);
  const supportsRoleAssignee = supportsModuleRoleAssignee(moduleConfig);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [, setLinkedBomData] = useState<any>(null);
  const [currentTags, setCurrentTags] = useState<any[]>([]); // استیت تگ‌ها

  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [editingFields, setEditingFields] = useState<Record<string, boolean>>({});
  const [tempValues, setTempValues] = useState<Record<string, any>>({});
  const [, setSavingField] = useState<string | null>(null);
  const [, setUploadingImage] = useState(false);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});
  const [, setOptionsReady] = useState(false);
  const hasRecordDataRef = useRef(false);
  const activeRecordRequestRef = useRef(0);
  const recordFetchPromiseRef = useRef<Promise<void> | null>(null);
  const recordFetchKeyRef = useRef<string>('');
  const skipNextOptionsFetchRef = useRef(false);
  const [fieldPermissions, setFieldPermissions] = useState<Record<string, boolean>>({});
  const [modulePermissions, setModulePermissions] = useState<{ view?: boolean; edit?: boolean; delete?: boolean; record_scope?: 'all' | 'own' | 'team' }>({});
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [autoSyncedBomId, setAutoSyncedBomId] = useState<string | null>(null);
  const [autoSyncedProcessTemplateId, setAutoSyncedProcessTemplateId] = useState<string | null>(null);
  const bomCopyPromptRef = useRef<string | null>(null);
  const processTemplatePromptRef = useRef<string | null>(null);
  const processDraftFieldKey = useMemo(() => {
    if (!moduleConfig?.fields?.length) return null;
    const hasProcessTemplateField = moduleConfig.fields.some((f: any) => String(f?.key || '') === 'process_template_id');
    if (!hasProcessTemplateField) return null;
    const knownDraftKeys = ['execution_process_draft', 'marketing_process_draft', 'production_stages_draft'];
    return knownDraftKeys.find((key) => moduleConfig.fields.some((f: any) => String(f?.key || '') === key)) || null;
  }, [moduleConfig?.fields]);
  const [productionModal, setProductionModal] = useState<'start' | 'stop' | 'complete' | null>(null);
  const [productionShelfOptions, setProductionShelfOptions] = useState<{ label: string; value: string }[]>([]);
  const [sourceShelfOptionsByProduct, setSourceShelfOptionsByProduct] = useState<Record<string, { label: string; value: string; stock?: number }[]>>({});
  const [startMaterials, setStartMaterials] = useState<StartMaterialGroup[]>([]);
  const [outputProductOptions, setOutputProductOptions] = useState<{ label: string; value: string; product_type?: string | null }[]>([]);
  const [outputShelfOptions, setOutputShelfOptions] = useState<{ label: string; value: string }[]>([]);
  const [outputProductId, setOutputProductId] = useState<string | null>(null);
  const [outputShelfId, setOutputShelfId] = useState<string | null>(null);
  const [isCreateProductOpen, setIsCreateProductOpen] = useState(false);
  const [isCreateCustomerFromLeadOpen, setIsCreateCustomerFromLeadOpen] = useState(false);
  const [outputProductType, setOutputProductType] = useState<'goods' | null>(null);
  const [outputMode, setOutputMode] = useState<'existing' | 'new'>('existing');
  const [productionQuantityPreview, setProductionQuantityPreview] = useState<number | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [issueAccountingLoading, setIssueAccountingLoading] = useState(false);
  const assigneeLabel = getAssigneeLabel(moduleId);
  const [stockMovementQuickAddSignal, setStockMovementQuickAddSignal] = useState(0);
  const [isQuickProjectModalOpen, setIsQuickProjectModalOpen] = useState(false);
  const [quickProjectLoading, setQuickProjectLoading] = useState(false);
  const [quickProjectCustomerOptions, setQuickProjectCustomerOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [quickProjectTemplateOptions, setQuickProjectTemplateOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [quickProjectForm] = Form.useForm();
  const startDraftStorageKey = useMemo(() => (id ? `production-start-draft:${id}` : null), [id]);
  const [canIssueAccountingEntry, setCanIssueAccountingEntry] = useState(true);
    const fetchProductionQuantity = useCallback(async () => {
      if (moduleId !== 'production_orders' || !id) return null;
      const { data: lines } = await supabase
        .from('production_lines')
        .select('quantity, qty, count')
        .eq('production_order_id', id);
      const total = (lines || []).reduce((sum: number, row: any) => {
        const raw = row?.quantity ?? row?.qty ?? row?.count ?? 0;
        return sum + (parseFloat(raw) || 0);
      }, 0);
      return total;
    }, [moduleId, id]);

  useEffect(() => {
    const cacheKey = `${moduleId}:${id || ''}`;
    const cachedSnapshot = moduleShowSnapshotCache.get(cacheKey);
    const hasFreshSnapshot = !!cachedSnapshot && (Date.now() - cachedSnapshot.cachedAt) < MODULE_SHOW_CACHE_TTL_MS;
    hasRecordDataRef.current = false;
    skipNextOptionsFetchRef.current = false;
    setData(hasFreshSnapshot ? cachedSnapshot?.record ?? null : null);
    setLoading(!hasFreshSnapshot);
    setAutoSyncedBomId(null);
    setAutoSyncedProcessTemplateId(null);
    setDynamicOptions({});
    setRelationOptions({});
    setOptionsReady(false);
    setCurrentTags(hasFreshSnapshot ? cachedSnapshot?.tags ?? [] : []);
    setAccessDenied(false);
    hasRecordDataRef.current = hasFreshSnapshot;
  }, [id, moduleId]);

  useEffect(() => {
    hasRecordDataRef.current = !!data;
  }, [data]);

  const readOrderQuantity = useCallback((record: any, override?: number | null) => {
    const raw = override ?? record?.quantity ?? record?.production_qty ?? record?.production_quantity ?? record?.qty ?? record?.count ?? 0;
    const parsed = parseFloat(raw as any);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const getOrderQuantity = useCallback((override?: number | null) => {
    return readOrderQuantity(data, override);
  }, [data, readOrderQuantity]);

  const resolveProductionQuantity = useCallback(async (record?: any) => {
    const qtyFromRecord = readOrderQuantity(record ?? data);
    if (qtyFromRecord > 0) return qtyFromRecord;
    const qtyFromLines = await fetchProductionQuantity();
    if (typeof qtyFromLines === 'number' && qtyFromLines > 0) return qtyFromLines;
    return 0;
  }, [data, fetchProductionQuantity, readOrderQuantity]);

  const filteredOutputProductOptions = useMemo(() => {
    if (!outputProductType) return outputProductOptions;
    return outputProductOptions.filter((item) => String(item?.product_type || '') === outputProductType);
  }, [outputProductOptions, outputProductType]);

  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    const gridBlock = moduleConfig?.blocks?.find((block: any) => block?.id === 'grid_materials') as any;
    const categories = gridBlock?.gridConfig?.categories || [];
    categories.forEach((category: any) => {
      const key = String(category?.value || '');
      if (!key) return;
      map.set(key, category?.label || key);
    });
    return map;
  }, [moduleConfig]);

  const productMetaMap = useMemo(() => {
    const map = new Map<string, { name: string; system_code: string }>();
    const products = relationOptions?.products || [];
    products.forEach((product: any) => {
      const id = String(product?.value || '');
      if (!id) return;
      const label = String(product?.label || '').trim();
      const hyphenIndex = label.indexOf(' - ');
      let systemCode = '';
      let name = label || id;
      if (hyphenIndex > 0) {
        systemCode = label.slice(0, hyphenIndex).trim();
        name = label.slice(hyphenIndex + 3).trim() || label;
      }
      map.set(id, {
        name,
        system_code: systemCode,
      });
    });
    return map;
  }, [relationOptions]);

  const toNumber = (value: any) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const calcDeliveredQty = (row?: Partial<StartMaterialDeliveryRow> | null) => {
    const length = Math.max(0, toNumber((row as any)?.length));
    const width = Math.max(0, toNumber((row as any)?.width));
    const quantity = Math.max(0, toNumber((row as any)?.quantity));
    return length * width * quantity;
  };

  const sumDeliveredRows = (rows: StartMaterialDeliveryRow[]) => {
    return rows.reduce((sum: number, row: StartMaterialDeliveryRow) => sum + calcDeliveredQty(row), 0);
  };

  const buildDeliveryRowKey = () => `delivery_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const normalizeDeliveryRow = (group: StartMaterialGroup, rawRow?: any): StartMaterialDeliveryRow => {
    const firstPiece = Array.isArray(group.pieces) && group.pieces.length > 0 ? group.pieces[0] : null;
    return {
      key: String(rawRow?.key || buildDeliveryRowKey()),
      pieceKey: rawRow?.pieceKey ? String(rawRow.pieceKey) : undefined,
      name: String(rawRow?.name ?? firstPiece?.name ?? ''),
      length: toNumber(rawRow?.length ?? firstPiece?.length ?? 0),
      width: toNumber(rawRow?.width ?? firstPiece?.width ?? 0),
      quantity: toNumber(rawRow?.quantity ?? firstPiece?.quantity ?? 1),
      mainUnit: String(rawRow?.mainUnit ?? firstPiece?.mainUnit ?? ''),
      subUnit: String(rawRow?.subUnit ?? firstPiece?.subUnit ?? ''),
      deliveredQty: calcDeliveredQty({
        length: rawRow?.length ?? firstPiece?.length ?? 0,
        width: rawRow?.width ?? firstPiece?.width ?? 0,
        quantity: rawRow?.quantity ?? firstPiece?.quantity ?? 1,
      }),
    };
  };

  const recalcStartGroup = (group: StartMaterialGroup): StartMaterialGroup => {
    const pieces = Array.isArray(group.pieces) ? group.pieces : [];
    const deliveryRows = (Array.isArray(group.deliveryRows) ? group.deliveryRows : []).map((row) => ({
      ...row,
      deliveredQty: calcDeliveredQty(row),
    }));
    return {
      ...group,
      deliveryRows,
      totalPerItemUsage: pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + piece.perItemUsage, 0),
      totalUsage: pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + piece.totalUsage, 0),
      totalDeliveredQty: sumDeliveredRows(deliveryRows),
    };
  };

  const getRowSelectedProduct = useCallback((row: any) => {
    const header = row?.header || {};
    const pieces = Array.isArray(row?.pieces) ? row.pieces : [];

    const selectedProductId =
      header?.selected_product_id ||
      row?.selected_product_id ||
      row?.product_id ||
      pieces.find((piece: any) => piece?.selected_product_id || piece?.product_id)?.selected_product_id ||
      pieces.find((piece: any) => piece?.selected_product_id || piece?.product_id)?.product_id ||
      null;

    const selectedProductMeta = selectedProductId ? productMetaMap.get(String(selectedProductId)) : null;
    const selectedProductName =
      header?.selected_product_name ||
      row?.selected_product_name ||
      row?.product_name ||
      selectedProductMeta?.name ||
      '-';
    const selectedProductCode =
      header?.selected_product_code ||
      row?.selected_product_code ||
      row?.product_system_code ||
      selectedProductMeta?.system_code ||
      '';

    return {
      selectedProductId: selectedProductId ? String(selectedProductId) : null,
      selectedProductName: String(selectedProductName || '-'),
      selectedProductCode: String(selectedProductCode || ''),
    };
  }, [productMetaMap]);

  const buildStartMaterialsDraft = useCallback((order: any, quantity: number): StartMaterialGroup[] => {
    const rows = Array.isArray(order?.grid_materials) ? order.grid_materials : [];
    const normalizedOrderQty = quantity > 0 ? quantity : 1;
    return rows
      .map((row: any, rowIndex: number) => {
        const categoryValue = String(row?.header?.category || '');
        const categoryLabel = categoryLabelMap.get(categoryValue) || categoryValue || 'بدون دسته‌بندی';
        const rowPieces = Array.isArray(row?.pieces) && row.pieces.length > 0 ? row.pieces : [row];
        const pieces: StartMaterialPiece[] = rowPieces
          .map((piece: any, pieceIndex: number) => {
            const totalUsageRaw = toNumber(piece?.total_usage);
            const perItemUsageRaw = toNumber(piece?.final_usage);
            const perItemUsage = perItemUsageRaw > 0
              ? perItemUsageRaw
              : (totalUsageRaw > 0 ? totalUsageRaw / normalizedOrderQty : 0);
            const totalUsage = totalUsageRaw > 0
              ? totalUsageRaw
              : perItemUsage * normalizedOrderQty;
            const subPerItemUsageRaw = toNumber(piece?.qty_sub);
            const subUsage = subPerItemUsageRaw > 0
              ? subPerItemUsageRaw * normalizedOrderQty
              : 0;
            return {
              key: `${String(piece?.key || 'piece')}_${rowIndex}_${pieceIndex}`,
              name: String(piece?.name || `قطعه ${pieceIndex + 1}`),
              length: toNumber(piece?.length),
              width: toNumber(piece?.width),
              quantity: toNumber(piece?.quantity),
              totalQuantity: toNumber(piece?.quantity) * normalizedOrderQty,
              mainUnit: String(piece?.main_unit || row?.header?.main_unit || ''),
              subUnit: String(piece?.sub_unit || ''),
              subUsage,
              perItemUsage,
              totalUsage,
            } as StartMaterialPiece;
          });

        const totalPerItemUsage = pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + piece.perItemUsage, 0);
        const totalUsage = pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + piece.totalUsage, 0);
        const { selectedProductId, selectedProductName, selectedProductCode } = getRowSelectedProduct(row);
        const sourceShelfId =
          row?.selected_shelf_id ||
          row?.shelf_id ||
          rowPieces.find((piece: any) => piece?.selected_shelf_id || piece?.shelf_id)?.selected_shelf_id ||
          rowPieces.find((piece: any) => piece?.selected_shelf_id || piece?.shelf_id)?.shelf_id ||
          null;
        return {
          key: `${String(row?.key || 'group')}_${rowIndex}`,
          rowIndex,
          categoryLabel,
          selectedProductId,
          selectedProductName,
          selectedProductCode,
          sourceShelfId: sourceShelfId ? String(sourceShelfId) : null,
          productionShelfId: order?.production_shelf_id || null,
          pieces,
          deliveryRows: [],
          totalPerItemUsage,
          totalUsage,
          totalDeliveredQty: 0,
          collapsed: rowIndex !== 0,
          isConfirmed: false,
        } as StartMaterialGroup;
      })
      .filter((group: StartMaterialGroup) => group.pieces.length > 0);
  }, [categoryLabelMap, getRowSelectedProduct]);

  const askStartWarning = useCallback((content: string) => {
    return new Promise<boolean>((resolve) => {
      modal.confirm({
        title: 'تایید ادامه',
        content,
        okText: 'ادامه',
        cancelText: 'انصراف',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }, [modal]);

  const isConfiguredMaterialRow = useCallback((row: any) => {
    const category = String(row?.header?.category || '').trim();
    const { selectedProductId } = getRowSelectedProduct(row);
    const pieces = Array.isArray(row?.pieces) ? row.pieces : [];
    const hasPieceData = pieces.some((piece: any) => {
      const name = String(piece?.name || '').trim();
      const length = toNumber(piece?.length);
      const width = toNumber(piece?.width);
      const quantity = toNumber(piece?.quantity);
      const usage = toNumber(piece?.final_usage ?? piece?.total_usage);
      return name.length > 0 || length > 0 || width > 0 || usage > 0 || quantity > 1;
    });
    return !!category || !!selectedProductId || hasPieceData;
  }, [getRowSelectedProduct]);

  const addStartDeliveryRow = useCallback((groupIndex: number) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const deliveryRows = Array.isArray(group.deliveryRows) ? [...group.deliveryRows] : [];
      deliveryRows.push(normalizeDeliveryRow(group));
      next[groupIndex] = recalcStartGroup({ ...group, deliveryRows, isConfirmed: false });
      return next;
    });
  }, []);

  const deleteStartDeliveryRows = useCallback((groupIndex: number, rowKeys: string[]) => {
    if (!rowKeys.length) return;
    const keySet = new Set(rowKeys.map((key) => String(key)));
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const deliveryRows = (group.deliveryRows || []).filter((row) => !keySet.has(String(row.key)));
      next[groupIndex] = recalcStartGroup({ ...group, deliveryRows, isConfirmed: false });
      return next;
    });
  }, []);

  const transferStartDeliveryRows = useCallback((
    sourceGroupIndex: number,
    rowKeys: string[],
    targetGroupIndex: number,
    mode: 'copy' | 'move'
  ) => {
    if (!rowKeys.length) return;
    setStartMaterials((prev) => {
      const next = [...prev];
      const sourceGroup = next[sourceGroupIndex];
      const targetGroup = next[targetGroupIndex];
      if (!sourceGroup || !targetGroup) return prev;
      if (mode === 'move' && sourceGroupIndex === targetGroupIndex) return prev;

      const keySet = new Set(rowKeys.map((key) => String(key)));
      const sourceRows = Array.isArray(sourceGroup.deliveryRows) ? sourceGroup.deliveryRows : [];
      const selectedRows = sourceRows.filter((row) => keySet.has(String(row.key)));
      if (!selectedRows.length) return prev;

      const copiedRows = selectedRows.map((row) =>
        normalizeDeliveryRow(targetGroup, {
          ...row,
          key: buildDeliveryRowKey(),
          pieceKey: undefined,
        })
      );

      const nextTargetRows = [...(targetGroup.deliveryRows || []), ...copiedRows];
      next[targetGroupIndex] = recalcStartGroup({
        ...targetGroup,
        deliveryRows: nextTargetRows,
        isConfirmed: false,
      });

      if (mode === 'move') {
        const nextSourceRows = sourceRows.filter((row) => !keySet.has(String(row.key)));
        next[sourceGroupIndex] = recalcStartGroup({
          ...sourceGroup,
          deliveryRows: nextSourceRows,
          isConfirmed: false,
        });
      }

      return next;
    });
  }, []);

  const updateStartDeliveryRowField = useCallback((
    groupIndex: number,
    rowKey: string,
    field: keyof Omit<StartMaterialDeliveryRow, 'key'>,
    value: any
  ) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const deliveryRows = [...(group.deliveryRows || [])];
      const rowIndex = deliveryRows.findIndex((row) => String(row.key) === String(rowKey));
      if (rowIndex < 0) return prev;
      const currentRow = deliveryRows[rowIndex];
      const numericFields: Array<keyof Omit<StartMaterialDeliveryRow, 'key'>> = ['length', 'width', 'quantity'];
      const nextValue = numericFields.includes(field)
        ? Math.max(0, toNumber(value))
        : (value == null ? '' : String(value));
      const updatedRow = { ...currentRow, [field]: nextValue };
      deliveryRows[rowIndex] = { ...updatedRow, deliveredQty: calcDeliveredQty(updatedRow) };
      next[groupIndex] = recalcStartGroup({ ...group, deliveryRows, isConfirmed: false });
      return next;
    });
  }, []);

  const setStartMaterialCollapsed = useCallback((groupIndex: number, collapsed: boolean) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      next[groupIndex] = { ...group, collapsed };
      return next;
    });
  }, []);

  const setStartMaterialSourceShelf = useCallback((groupIndex: number, shelfId: string | null) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      next[groupIndex] = { ...group, sourceShelfId: shelfId, isConfirmed: false };
      return next;
    });
  }, []);

  const handleSourceShelfScan = useCallback((groupIndex: number, shelfId: string) => {
    const group = startMaterials[groupIndex];
    if (!group) return;
    const productId = group.selectedProductId;
    if (!productId) {
      msg.error('برای این ردیف، محصول انتخاب نشده است.');
      return;
    }
    const validOptions = sourceShelfOptionsByProduct[productId] || [];
    const isAllowed = validOptions.some((option) => option.value === shelfId);
    if (!isAllowed) {
      msg.error('این قفسه برای محصول انتخاب‌شده موجودی ندارد.');
      return;
    }
    setStartMaterialSourceShelf(groupIndex, shelfId);
  }, [msg, setStartMaterialSourceShelf, sourceShelfOptionsByProduct, startMaterials]);

  const setStartMaterialProductionShelf = useCallback((groupIndex: number, shelfId: string | null) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      next[groupIndex] = { ...group, productionShelfId: shelfId, isConfirmed: false };
      return next;
    });
  }, []);

  const readStartDraft = useCallback(() => {
    if (!startDraftStorageKey || typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(startDraftStorageKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, [startDraftStorageKey]);

  const writeStartDraft = useCallback((groups: StartMaterialGroup[]) => {
    if (!startDraftStorageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        startDraftStorageKey,
        JSON.stringify({
          groups,
        })
      );
    } catch {
      // ignore storage errors
    }
  }, [startDraftStorageKey]);

  const clearStartDraft = useCallback(() => {
    if (!startDraftStorageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(startDraftStorageKey);
    } catch {
      // ignore storage errors
    }
  }, [startDraftStorageKey]);

  const buildConsumptionMoves = useCallback((order: any, quantity: number, productionShelfId: string) => {
    const tables = ['items_leather', 'items_lining', 'items_fitting', 'items_accessory'];
    const moves: Array<{ product_id: string; from_shelf_id: string; to_shelf_id: string; quantity: number }> = [];
    tables.forEach((table) => {
      const rows = Array.isArray(order?.[table]) ? order[table] : [];
      rows.forEach((row: any) => {
        const usage = parseFloat(row?.usage ?? row?.quantity ?? row?.qty ?? row?.count ?? 0) || 0;
        if (usage <= 0) return;
        const productId = row?.selected_product_id || row?.product_id;
        if (!productId) return;
        moves.push({
          product_id: productId,
          from_shelf_id: productionShelfId,
          to_shelf_id: productionShelfId,
          quantity: usage * quantity,
        });
      });
    });
    return moves;
  }, []);

  const buildFinalStageConsumptionMoves = useCallback(async () => {
    if (!id) return [] as Array<{ product_id: string; from_shelf_id: string; to_shelf_id: string; quantity: number }>;
    try {
      const { data: taskRows, error } = await supabase
        .from('tasks')
        .select('id, sort_order, production_line_id, production_shelf_id, recurrence_info')
        .eq('related_production_order', id);
      if (error) throw error;

      const tasks = Array.isArray(taskRows) ? taskRows : [];
      if (!tasks.length) return [];

      const byLine = new Map<string, any[]>();
      tasks.forEach((task: any) => {
        const lineKey = String(task?.production_line_id || 'default');
        if (!byLine.has(lineKey)) byLine.set(lineKey, []);
        byLine.get(lineKey)!.push(task);
      });

      const finalMoves: Array<{ product_id: string; from_shelf_id: string; to_shelf_id: string; quantity: number }> = [];
      byLine.forEach((lineTasks) => {
        const ordered = [...lineTasks].sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
        const lastTask = ordered[ordered.length - 1];
        if (!lastTask) return;

        let recurrenceInfo: any = lastTask?.recurrence_info;
        if (typeof recurrenceInfo === 'string') {
          try {
            recurrenceInfo = JSON.parse(recurrenceInfo);
          } catch {
            recurrenceInfo = null;
          }
        }

        const handover = recurrenceInfo?.production_handover;
        const groups = Array.isArray(handover?.groups) ? handover.groups : [];
        const targetShelfId = String(
          handover?.targetShelfId
          || handover?.target_shelf_id
          || lastTask?.production_shelf_id
          || data?.production_shelf_id
          || ''
        );
        if (!targetShelfId || !groups.length) return;

        groups.forEach((group: any) => {
          const pieces = Array.isArray(group?.pieces) ? group.pieces : [];
          const selectedPiece = pieces.find((piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id) || null;
          const productId = String(
            group?.selectedProductId
            || group?.selected_product_id
            || selectedPiece?.selectedProductId
            || selectedPiece?.selected_product_id
            || selectedPiece?.product_id
            || ''
          );
          if (!productId) return;
          const qty = pieces.reduce((sum: number, piece: any) => {
            const raw = piece?.handoverQty ?? piece?.handover_qty ?? piece?.sourceQty ?? piece?.source_qty ?? 0;
            const value = parseFloat(raw);
            return sum + (Number.isFinite(value) ? value : 0);
          }, 0);
          if (!qty || qty <= 0) return;
          finalMoves.push({
            product_id: productId,
            from_shelf_id: targetShelfId,
            to_shelf_id: targetShelfId,
            quantity: qty,
          });
        });
      });

      return finalMoves;
    } catch (err) {
      console.warn('Could not build final stage consumption moves', err);
      return [] as Array<{ product_id: string; from_shelf_id: string; to_shelf_id: string; quantity: number }>;
    }
  }, [data?.production_shelf_id, id]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRoleId, setCurrentUserRoleId] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allRoles, setAllRoles] = useState<any[]>([]);

  const mergeUsersById = (rows: any[]) =>
    rows.reduce((acc: any[], row: any) => {
      const id = String(row?.id || '').trim();
      if (!id) return acc;
      const existingIndex = acc.findIndex((item) => String(item?.id || '') === id);
      if (existingIndex >= 0) {
        const next = [...acc];
        next[existingIndex] = { ...next[existingIndex], ...row };
        return next;
      }
      return [...acc, row];
    }, []);

  const fetchBaseInfo = useCallback(async () => {
      if (moduleShowBaseInfoCache) {
        setAllUsers((prev) => mergeUsersById([...prev, ...moduleShowBaseInfoCache!.users]));
        setAllRoles(moduleShowBaseInfoCache.roles);
        return;
      }

      if (!moduleShowBaseInfoPromise) {
        moduleShowBaseInfoPromise = (async () => {
          const directory = await fetchAssigneeDirectory(supabase);
          moduleShowBaseInfoCache = {
            users: directory.users || [],
            roles: directory.roles || [],
          };
          return moduleShowBaseInfoCache;
        })().finally(() => {
          moduleShowBaseInfoPromise = null;
        });
      }

      const directory = await moduleShowBaseInfoPromise;
      setAllUsers((prev) => mergeUsersById([...prev, ...directory.users]));
      setAllRoles(directory.roles);
  }, []);

  const ensureUserLabels = useCallback(async (userIds: Array<string | null | undefined>) => {
    const normalizedIds = Array.from(
      new Set(userIds.map((item) => String(item || '').trim()).filter(Boolean))
    );
    if (!normalizedIds.length) return;

    const missingIds = normalizedIds.filter((id) => !allUsers.some((user) => String(user?.id || '') === id));
    if (!missingIds.length) return;

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, mobile_1, avatar_url')
      .in('id', missingIds);
    if (error || !profiles?.length) return;

    const normalizedProfiles = (profiles || []).map((user: any) => ({
      ...user,
      full_name:
        String(user?.full_name || '').trim() ||
        String(user?.email || '').trim() ||
        String(user?.mobile_1 || '').trim() ||
        `کاربر ${String(user?.id || '').slice(0, 8)}`,
    }));

    setAllUsers((prev) => mergeUsersById([...prev, ...normalizedProfiles]));
  }, [allUsers]);

  const fetchRecord = useCallback((force = false) => {
    if (!id || !moduleConfig) return;
    const fetchKey = `${moduleId}:${id}`;
    if (!force && recordFetchPromiseRef.current && recordFetchKeyRef.current === fetchKey) {
      return recordFetchPromiseRef.current;
    }
    const requestId = activeRecordRequestRef.current + 1;
    activeRecordRequestRef.current = requestId;
    setLoading((prev) => (hasRecordDataRef.current ? prev : true));
    const run = (async () => {
      try {
        // 👇 تغییر مهم: اضافه کردن صریح فیلدهای سیستمی به select
        const { data: record, error } = await supabase
            .from(moduleId)
            .select(`
                *,
                created_at,
                updated_at,
                created_by,
                updated_by
            `)
            .eq('id', id)
            .maybeSingle();

        if (error && String(error.code) !== 'PGRST116') throw error;
        if (activeRecordRequestRef.current !== requestId) return;
        if (!record) {
          if (moduleId === 'products') {
            const { data: billboardRecord, error: billboardError } = await supabase
              .from('billboards')
              .select('id')
              .eq('id', id)
              .maybeSingle();
            if (billboardError && String(billboardError.code) !== 'PGRST116') throw billboardError;
            if (billboardRecord?.id) {
              navigate(`/billboards/${id}`, { replace: true });
              return;
            }
          }
          if (activeRecordRequestRef.current !== requestId) return;
          setData(null);
          msg.error('رکورد موردنظر یافت نشد یا حذف شده است.');
          return;
        }

        let nextRecord: any = record;
        if (moduleId === 'products') {
          const mainUnit = nextRecord?.main_unit;
          const subUnit = nextRecord?.sub_unit;
          const stockValue = parseFloat(nextRecord?.stock) || 0;
          if (mainUnit && subUnit) {
            const computedSubStock = convertArea(stockValue, mainUnit, subUnit);
            if (Number.isFinite(computedSubStock)) {
              nextRecord = { ...nextRecord, sub_stock: computedSubStock };
            }
          }
        }
        if (moduleId === 'process_templates') {
          const { data: templateStages } = await supabase
            .from('process_template_stages')
            .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
            .eq('template_id', id)
            .order('sort_order', { ascending: true });
          nextRecord = {
            ...nextRecord,
            template_stages_preview: (templateStages || []).map((stage: any, index: number) => ({
              ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
              id: stage.id || `${id}_${index + 1}`,
              name: stage.stage_name || `مرحله ${index + 1}`,
              sort_order: stage.sort_order || ((index + 1) * 10),
              wage: stage.wage || 0,
              weight: Number(stage?.metadata?.weight || 0),
              duration_value: Number(stage?.metadata?.duration_value || 0),
              duration_unit: stage?.metadata?.duration_unit || 'day',
              duration_from: stage?.metadata?.duration_from || 'project_start',
              default_assignee_id: stage.default_assignee_id || null,
              default_assignee_role_id: stage.default_assignee_role_id || null,
              template_stage_id: stage.id || null,
            })),
          };
        }
        if (moduleId === 'process_runs') {
          const { data: runStages } = await supabase
            .from('process_run_stages')
            .select('id, stage_name, sort_order, status, wage, assignee_user_id, assignee_role_id, task_id, metadata')
            .eq('process_run_id', id)
            .order('sort_order', { ascending: true });
          nextRecord = {
            ...nextRecord,
            run_stages_preview: (runStages || []).map((stage: any, index: number) => ({
              ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
              id: stage.id || `${id}_${index + 1}`,
              name: stage.stage_name || `مرحله ${index + 1}`,
              sort_order: stage.sort_order || ((index + 1) * 10),
              status: stage.status || 'todo',
              wage: stage.wage || 0,
              weight: Number(stage?.metadata?.weight || 0),
              duration_value: Number(stage?.metadata?.duration_value || 0),
              duration_unit: stage?.metadata?.duration_unit || 'day',
              duration_from: stage?.metadata?.duration_from || 'project_start',
              assignee_id: stage.assignee_user_id || null,
              assignee_role_id: stage.assignee_role_id || null,
              assignee_type: stage.assignee_role_id ? 'role' : (stage.assignee_user_id ? 'user' : null),
              process_run_stage_id: stage.id || null,
              task_id: stage.task_id || null,
            })),
          };
        }
        if (activeRecordRequestRef.current !== requestId) return;
        skipNextOptionsFetchRef.current = true;
        setData(nextRecord);
        void fetchOptions(nextRecord, requestId);
        void (async () => {
          const { data: tagsData } = await supabase
            .from('record_tags')
            .select('tags(id, title, color)')
            .eq('record_id', id);
          if (activeRecordRequestRef.current !== requestId) return;
          const tags = tagsData?.map((item: any) => item.tags).filter(Boolean) || [];
          moduleShowSnapshotCache.set(fetchKey, {
            record: nextRecord,
            tags,
            cachedAt: Date.now(),
          });
          setCurrentTags(tags);
        })();
    } catch (err: any) {
        const abortLike = String(err?.name || '').toLowerCase() === 'aborterror'
          || String(err?.message || '').toLowerCase().includes('signal is aborted');
        if (!abortLike) {
          const code = String(err?.code || '');
          const rawMessage = String(err?.message || '');
          const missingRow = code === 'PGRST116' || /0 rows/i.test(rawMessage);
          if (missingRow) {
            msg.error('رکورد موردنظر یافت نشد یا حذف شده است.');
            return;
          }
          console.error(err);
          msg.error(toFaErrorMessage(err, 'خطا در دریافت رکورد.'));
        }
    } finally {
        if (activeRecordRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    })().finally(() => {
      if (recordFetchKeyRef.current === fetchKey) {
        recordFetchPromiseRef.current = null;
        recordFetchKeyRef.current = '';
      }
    });
    recordFetchKeyRef.current = fetchKey;
    recordFetchPromiseRef.current = run;
    return run;
  }, [id, moduleConfig, moduleId, msg, navigate]);

  useEffect(() => {
    if (!id) return;
    const timer = window.setTimeout(() => {
      void fetchBaseInfo();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [id, fetchBaseInfo]);

  useEffect(() => {
    void fetchRecord();
  }, [fetchRecord]);

  useEffect(() => {
    void ensureUserLabels([data?.created_by, data?.updated_by, data?.assignee_type === 'user' ? data?.assignee_id : null]);
  }, [data?.created_by, data?.updated_by, data?.assignee_id, data?.assignee_type, ensureUserLabels]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [id, moduleId]);

  useEffect(() => {
    if (!data) {
      setAccessDenied(false);
      return;
    }
    const recordScope = modulePermissions.record_scope ?? (modulePermissions.view === false ? 'own' : 'all');
    const hasModuleViewAccess = modulePermissions.view !== false || recordScope !== 'all';
    const scopedAccess = canAccessAssignedRecord(data, currentUserId, currentUserRoleId, recordScope);
    setAccessDenied(!hasModuleViewAccess || !scopedAccess);
  }, [data, currentUserId, currentUserRoleId, modulePermissions.record_scope, modulePermissions.view]);

  const loadProductionShelves = useCallback(async () => {
    const { data: shelves } = await supabase
      .from('shelves')
      .select('id, shelf_number, name, warehouses(name)')
      .limit(500);
    const filtered = (shelves || []).filter((row: any) => {
      const name = row?.warehouses?.name || '';
      return name.includes('تولید') || /production/i.test(name);
    });
    const options = (filtered.length ? filtered : (shelves || [])).map((row: any) => ({
      value: row.id,
      label: `${row.shelf_number || row.name || row.id}${row?.warehouses?.name ? ` - ${row.warehouses.name}` : ''}`
    }));
    setProductionShelfOptions(options);
  }, []);

  const loadSourceShelvesByProduct = useCallback(async (productIds: string[]) => {
    if (!productIds.length) {
      setSourceShelfOptionsByProduct({});
      return;
    }
    const { data: inventoryRows } = await supabase
      .from('product_inventory')
      .select('product_id, shelf_id, stock')
      .in('product_id', productIds)
      .gt('stock', 0);

    const rows = (inventoryRows || []).filter((row: any) => row?.product_id && row?.shelf_id);
    const shelfIds = Array.from(new Set(rows.map((row: any) => String(row.shelf_id))));
    let shelfMap = new Map<string, { label: string; isProductionWarehouse: boolean }>();
    if (shelfIds.length > 0) {
      const { data: shelves } = await supabase
        .from('shelves')
        .select('id, shelf_number, name, warehouses(name)')
        .in('id', shelfIds)
        .limit(1000);
      shelfMap = new Map((shelves || []).map((shelf: any) => {
        const warehouseName = String(shelf?.warehouses?.name || '');
        const isProductionWarehouse = warehouseName.includes('تولید') || /production/i.test(warehouseName);
        const label = `${shelf.shelf_number || shelf.name || shelf.id}${warehouseName ? ` - ${warehouseName}` : ''}`;
        return [String(shelf.id), { label, isProductionWarehouse }];
      }));
    }

    const next: Record<string, { label: string; value: string; stock?: number }[]> = {};
    rows.forEach((row: any) => {
      const productId = String(row.product_id);
      const shelfId = String(row.shelf_id);
      const stock = parseFloat(row?.stock) || 0;
      const shelfInfo = shelfMap.get(shelfId);
      if (shelfInfo?.isProductionWarehouse) return;
      const labelBase = shelfInfo?.label || shelfId;
      const label = `${labelBase} (موجودی: ${toPersianNumber(stock)})`;
      if (!next[productId]) next[productId] = [];
      if (!next[productId].some((opt) => opt.value === shelfId)) {
        next[productId].push({ value: shelfId, label, stock });
      }
    });
    setSourceShelfOptionsByProduct(next);
  }, []);

  const loadOutputShelves = useCallback(async () => {
    const { data: shelves } = await supabase
      .from('shelves')
      .select('id, shelf_number, name, warehouses(name)')
      .limit(500);
    const options = (shelves || []).map((row: any) => ({
      value: row.id,
      label: `${row.shelf_number || row.name || row.id}${row?.warehouses?.name ? ` - ${row.warehouses.name}` : ''}`
    }));
    setOutputShelfOptions(options);
  }, []);

  const loadOutputProducts = useCallback(async () => {
    const { data: products } = await supabase
      .from('products')
      .select('id, name, system_code, product_type')
      .limit(500);
    const options = (products || []).map((row: any) => ({
      value: row.id,
      label: row.system_code ? `${row.name} (${row.system_code})` : row.name,
      product_type: row.product_type || null,
    }));
    setOutputProductOptions(options);
  }, []);

  const openProductionModal = async (type: 'start' | 'stop' | 'complete') => {
    if (type === 'start') {
      let modalRecord = data;
      if (moduleId === 'production_orders' && id) {
        try {
          const { data: latestRecord, error: latestError } = await supabase
            .from(moduleId)
            .select('*')
            .eq('id', id)
            .single();
          if (latestError) throw latestError;
          if (latestRecord) {
            modalRecord = { ...(data || {}), ...latestRecord };
            setData((prev: any) => ({ ...(prev || {}), ...latestRecord }));
          }
        } catch (err) {
          console.warn('Could not refresh production order before opening modal', err);
        }
      }

      const materialRows = Array.isArray(modalRecord?.grid_materials) ? modalRecord.grid_materials : [];
      const configuredRows = materialRows.filter((row: any) => isConfiguredMaterialRow(row));
      const missingProductCount = configuredRows.filter((row: any) => !getRowSelectedProduct(row).selectedProductId).length;
      if (missingProductCount > 0) {
        const shouldContinue = await askStartWarning(
          `برای ${toPersianNumber(missingProductCount)} تعداد از مواد اولیه ای که ثبت کرده اید، محصول انتخاب نشده، آیا ادامه می دهید؟`
        );
        if (!shouldContinue) return;
      }

      const draftStages = Array.isArray(modalRecord?.production_stages_draft)
        ? modalRecord.production_stages_draft.filter((stage: any) => String(stage?.name || stage?.title || '').trim() !== '')
        : [];
      let hasIncompleteDraftStages = false;
      let hasProductionLine = true;
      if (id) {
        const [{ data: tasksData, error: tasksError }, { data: linesData, error: linesError }] = await Promise.all([
          supabase
            .from('tasks')
            .select('id, name, title, production_line_id')
            .eq('related_production_order', id),
          supabase
            .from('production_lines')
            .select('id')
            .eq('production_order_id', id),
        ]);
        if (!linesError) {
          hasProductionLine = Array.isArray(linesData) && linesData.length > 0;
        }
        if (!tasksError && !linesError && hasProductionLine && draftStages.length > 0) {
          const normalizeName = (value: any) => String(value || '').trim().toLowerCase();
          const draftStageNames = draftStages
            .map((stage: any) => normalizeName(stage?.name || stage?.title))
            .filter(Boolean);
          const draftStageNameSet = new Set(draftStageNames);
          const lineCount = Array.isArray(linesData) ? linesData.length : 0;
          const expectedDraftTasksCount = lineCount * draftStageNames.length;
          const createdFromDraftCount = (tasksData || []).filter((task: any) => {
            const taskName = normalizeName(task?.name || task?.title);
            return draftStageNameSet.has(taskName);
          }).length;
          hasIncompleteDraftStages = createdFromDraftCount < expectedDraftTasksCount;
        }
      }
      if (hasIncompleteDraftStages || !hasProductionLine) {
        const shouldContinue = await askStartWarning(
          'برای این سفارش، خط تولید تکمیل نشده و یک یا چند فعالیت در حالت پیش نویس هستند، آیا ادامه می دهید؟'
        );
        if (!shouldContinue) return;
      }

      const resolvedQty = await resolveProductionQuantity({
        ...(modalRecord || {}),
        quantity: data?.quantity ?? modalRecord?.quantity,
      });
      setProductionQuantityPreview(resolvedQty > 0 ? resolvedQty : null);
      const baseGroups = buildStartMaterialsDraft(modalRecord, resolvedQty);
      const selectedProductIds: string[] = Array.from(
        new Set(
          baseGroups
            .map((group) => group.selectedProductId)
            .filter((value): value is string => !!value)
        )
      );
      const fetchedProductMeta = new Map<string, { name: string; system_code: string }>();
      if (selectedProductIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, name, system_code')
          .in('id', selectedProductIds);
        (products || []).forEach((product: any) => {
          fetchedProductMeta.set(String(product.id), {
            name: String(product.name || ''),
            system_code: String(product.system_code || ''),
          });
        });
      }
      const draft = readStartDraft();
      const draftGroups = Array.isArray(draft?.groups) ? draft.groups : [];
      const mergedGroups: StartMaterialGroup[] = baseGroups.map((group: StartMaterialGroup) => {
        const selectedMeta = group.selectedProductId
          ? (fetchedProductMeta.get(group.selectedProductId) || productMetaMap.get(group.selectedProductId))
          : null;
        const savedGroup = draftGroups.find((item: any) => item?.key === group.key);
        const baseWithMeta = {
          ...group,
          selectedProductName: selectedMeta?.name || group.selectedProductName,
          selectedProductCode: selectedMeta?.system_code || group.selectedProductCode,
        };
        if (!savedGroup) return baseWithMeta;
        const savedDeliveryRows = Array.isArray(savedGroup?.deliveryRows) ? savedGroup.deliveryRows : [];
        const deliveryRows: StartMaterialDeliveryRow[] = savedDeliveryRows.map((row: any) =>
          normalizeDeliveryRow(baseWithMeta, row)
        );
        const totalPerItemUsage = baseWithMeta.pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + piece.perItemUsage, 0);
        const totalUsage = baseWithMeta.pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + piece.totalUsage, 0);
        const totalDeliveredQty = sumDeliveredRows(deliveryRows);
        const savedName = typeof savedGroup?.selectedProductName === 'string' && savedGroup.selectedProductName.trim() && savedGroup.selectedProductName !== '-'
          ? savedGroup.selectedProductName
          : null;
        const savedCode = typeof savedGroup?.selectedProductCode === 'string' && savedGroup.selectedProductCode.trim()
          ? savedGroup.selectedProductCode
          : null;
        return {
          ...baseWithMeta,
          deliveryRows,
          totalPerItemUsage,
          totalUsage,
          totalDeliveredQty,
          selectedProductName: savedName || baseWithMeta.selectedProductName,
          selectedProductCode: savedCode || baseWithMeta.selectedProductCode,
          sourceShelfId: savedGroup?.sourceShelfId ?? baseWithMeta.sourceShelfId,
          productionShelfId: savedGroup?.productionShelfId ?? baseWithMeta.productionShelfId,
          collapsed: typeof savedGroup?.collapsed === 'boolean' ? savedGroup.collapsed : baseWithMeta.collapsed,
          isConfirmed: savedGroup?.isConfirmed === true,
        };
      });
      setStartMaterials(mergedGroups);
      await loadProductionShelves();
      await loadSourceShelvesByProduct(selectedProductIds);
      setProductionModal(type);
      return;
    }
    if (type === 'complete') {
      await loadOutputShelves();
      await loadOutputProducts();
      const resolvedQty = await resolveProductionQuantity();
      setProductionQuantityPreview(resolvedQty > 0 ? resolvedQty : null);
      setOutputMode('existing');
      setOutputProductId(null);
      setOutputProductType(null);
      setProductionModal(type);
      return;
    }
    setProductionModal(type);
  };

  const finalizeStatusUpdate = async (payload: any) => {
    if (!id) return;
    const { error } = await supabase.from(moduleId).update(payload).eq('id', id);
    if (error) throw error;
    setData((prev: any) => ({ ...prev, ...payload }));
  };

  useEffect(() => {
    if (productionModal !== 'start') return;
    writeStartDraft(startMaterials);
  }, [productionModal, startMaterials, writeStartDraft]);

  useEffect(() => {
    if (productionModal !== 'start') return;
    if (productMetaMap.size === 0) return;
    setStartMaterials((prev) =>
      prev.map((group) => {
        if (!group.selectedProductId) return group;
        const meta = productMetaMap.get(group.selectedProductId);
        if (!meta) return group;
        const nextName = group.selectedProductName && group.selectedProductName !== '-' ? group.selectedProductName : meta.name;
        const nextCode = group.selectedProductCode || meta.system_code || '';
        return { ...group, selectedProductName: nextName, selectedProductCode: nextCode };
      })
    );
  }, [productionModal, productMetaMap]);

  const handleProductionStatusChange = async (nextStatus: string) => {
    if (moduleId !== 'production_orders') return;
    if (data?.status === nextStatus) return;
    if (nextStatus === 'in_progress') {
      await openProductionModal('start');
      return;
    }
    if (nextStatus === 'pending') {
      await openProductionModal('stop');
      return;
    }
    if (nextStatus === 'completed') {
      await openProductionModal('complete');
    }
  };

  const fetchFieldPermissions = useCallback(async () => {
    try {
      const context = await fetchCurrentUserRoleContext(supabase);
      setCurrentUserId(context.userId);
      setCurrentUserRoleId(context.roleId);

      if (!context.roleId) {
        setFieldPermissions({});
        setModulePermissions({});
        setCanIssueAccountingEntry(true);
        return;
      }

      const permissions = context.permissions || {};
      const modulePerms = permissions?.[moduleId] || {};
      const journalPerms = permissions?.journal_entries || {};
      const perms = modulePerms.fields || {};
      setFieldPermissions(perms);
      setModulePermissions({
        view: modulePerms.view,
        edit: modulePerms.edit,
        delete: modulePerms.delete,
        record_scope: modulePerms.record_scope ?? (modulePerms.view === false ? 'own' : 'all'),
      });
      setCanIssueAccountingEntry(journalPerms.view !== false && journalPerms.edit !== false);
    } catch (err) {
      if (String((err as any)?.name || '') === 'AbortError') return;
      console.warn('Could not fetch field permissions:', err);
      setCanIssueAccountingEntry(true);
    }
  }, [moduleId]);

  useEffect(() => {
    fetchFieldPermissions();
  }, [fetchFieldPermissions]);

  const canViewField = useCallback(
    (fieldKey: string) => {
      if (Object.prototype.hasOwnProperty.call(fieldPermissions, fieldKey)) {
        return fieldPermissions[fieldKey] !== false;
      }
      return true;
    },
    [fieldPermissions]
  );

  const canEditModule = modulePermissions.edit !== false;
  const canDeleteModule = modulePermissions.delete !== false;



  const fetchLinkedBom = useCallback(async (bomId: string) => {
      const { data: bom } = await supabase.from('production_boms').select('*').eq('id', bomId).single();
      if (bom) setLinkedBomData(bom);
  }, []);

  const fetchOptions = useCallback(async (recordData: any = null, requestId?: number) => {
    if (!moduleConfig) return;
    try {
      const dynFields: any[] = [...moduleConfig.fields.filter(f => (f as any).dynamicOptionsCategory)];
      moduleConfig.blocks?.forEach(b => {
        if (b.tableColumns) {
          b.tableColumns.forEach(c => {
            if ((c.type === FieldType.SELECT || c.type === FieldType.MULTI_SELECT) && (c as any).dynamicOptionsCategory) {
              dynFields.push(c);
            }
          });
        }
      });
      
      const dynCategories = Array.from(
        new Set(
          dynFields
            .map((field) => (field as any).dynamicOptionsCategory as string | undefined)
            .filter(Boolean)
        )
      ) as string[];
      const dynOpts: Record<string, any[]> = await fetchDynamicOptionsMap(supabase, dynCategories);
      try {
        const formulas = await fetchFormulaOptions(supabase);
        if (formulas.length > 0) {
          dynOpts['calculation_formulas'] = formulas;
        }
      } catch (err) {
        console.warn('Could not load calculation formulas', err);
      }
      if (requestId && activeRecordRequestRef.current !== requestId) return;
      setDynamicOptions(dynOpts);

      const relOpts: Record<string, any[]> = {};
      const relationFieldsWithValue = moduleConfig.fields.filter((field) => {
        if (field.type !== FieldType.RELATION || !field.relationConfig) return false;
        const rawValue = recordData?.[field.key];
        return rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '';
      });

      const relationResults = await Promise.allSettled(
        relationFieldsWithValue.map(async (field) => {
          const options = await fetchRelationOptionsForField(supabase, field, {
            allValues: recordData || {},
            exactId: recordData?.[field.key],
            limit: 1,
          });
          return { fieldKey: field.key, options };
        })
      );

      relationResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          relOpts[result.value.fieldKey] = result.value.options;
        } else {
          console.warn('Could not fetch exact relation option for ModuleShow field:', result.reason);
        }
      });
      if (requestId && activeRecordRequestRef.current !== requestId) return;
      setRelationOptions(relOpts);
    } finally {
      if (requestId && activeRecordRequestRef.current !== requestId) return;
      setOptionsReady(true);
    }
  }, [moduleConfig]);

  useEffect(() => {
    if (data) {
      if (skipNextOptionsFetchRef.current) {
        skipNextOptionsFetchRef.current = false;
      } else {
        void fetchOptions(data);
      }
      if (moduleId === 'products' && data.production_bom_id) {
        fetchLinkedBom(data.production_bom_id);
      } else if (moduleId === 'production_boms') {
        setLinkedBomData(data); 
      } else {
        setLinkedBomData(null);
      }
    }
  }, [data, moduleId, fetchOptions, fetchLinkedBom]);

  useEffect(() => {
    if (moduleId !== 'production_orders' || !data?.bom_id) return;
    if (autoSyncedBomId === data.bom_id) return;

    const isEmptyArray = (val: any) => !Array.isArray(val) || val.length === 0;
    const shouldSync = isEmptyArray(data?.grid_materials) || isEmptyArray(data?.production_stages_draft);
    if (!shouldSync) return;

    const syncFromBom = async () => {
      try {
        const { data: bom, error } = await supabase
          .from('production_boms')
          .select('name, grid_materials, production_stages_draft, product_category')
          .eq('id', data.bom_id)
          .single();
        if (error) throw error;

        const patch: any = {
          grid_materials: bom?.grid_materials || [],
          production_stages_draft: bom?.production_stages_draft || [],
          product_category: bom?.product_category ?? data?.product_category ?? null,
          name: bom?.name || data?.name || '',
        };

        await supabase.from('production_orders').update(patch).eq('id', data.id);
        setData((prev: any) => ({ ...prev, ...patch }));
        setAutoSyncedBomId(data.bom_id);
      } catch (err) {
        console.warn('همگام‌سازی خودکار از BOM ناموفق بود', err);
      }
    };

    syncFromBom();
  }, [moduleId, data, autoSyncedBomId]);

  useEffect(() => {
    if (!processDraftFieldKey || !data?.process_template_id || !data?.id) return;
    if (autoSyncedProcessTemplateId === data.process_template_id) return;

    const currentDraft = (data as any)?.[processDraftFieldKey];
    const isDraftEmpty = !Array.isArray(currentDraft) || currentDraft.length === 0;
    if (!isDraftEmpty) return;

    const syncFromProcessTemplate = async () => {
      try {
        const { data: stages, error } = await supabase
          .from('process_template_stages')
          .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
          .eq('template_id', data.process_template_id)
          .order('sort_order', { ascending: true });
        if (error) throw error;

        const mappedDraft = (stages || []).map((stage: any, index: number) => ({
            ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
          id: stage.id || `${data.process_template_id}_${index + 1}`,
          name: stage.stage_name || `مرحله ${index + 1}`,
          sort_order: stage.sort_order || ((index + 1) * 10),
          wage: stage.wage || 0,
              weight: Number(stage?.metadata?.weight || 0),
              duration_value: Number(stage?.metadata?.duration_value || 0),
              duration_unit: stage?.metadata?.duration_unit || 'day',
              duration_from: stage?.metadata?.duration_from || 'project_start',
              default_assignee_id: stage.default_assignee_id || null,
          default_assignee_role_id: stage.default_assignee_role_id || null,
          template_stage_id: stage.id || null,
        }));

        const patch = { [processDraftFieldKey]: mappedDraft } as any;
        await supabase.from(moduleId).update(patch).eq('id', data.id);
        setData((prev: any) => ({ ...prev, ...patch }));
        setAutoSyncedProcessTemplateId(data.process_template_id);
      } catch (err) {
        console.warn('همگام‌سازی خودکار از الگوی فرآیند ناموفق بود', err);
      }
    };

    syncFromProcessTemplate();
  }, [moduleId, data, processDraftFieldKey, autoSyncedProcessTemplateId]);

  useEffect(() => {
    if (!moduleConfig) return;
    const recordName = getRecordTitle(data, moduleConfig, { fallback: '' });
    window.dispatchEvent(new CustomEvent('erp:breadcrumb', {
      detail: {
        moduleTitle: moduleConfig.titles?.fa || moduleId,
        moduleId,
        recordName,
      }
    }));
    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, [moduleConfig, moduleId, data, id]);

  useEffect(() => {
    if (!moduleConfig) return;
    const moduleTitle = moduleConfig.titles?.fa || moduleId;
    const recordName = getRecordTitle(data, moduleConfig, { fallback: '' });
    const brandTitle = document.documentElement.getAttribute('data-brand-title') || 'هلدینگ رسانه ای کلام تازه.';
    document.title = recordName ? `${recordName} | ${moduleTitle} | ${brandTitle}` : `${moduleTitle} | ${brandTitle}`;
  }, [moduleConfig, moduleId, data]);

    const handleAssigneeChange = useCallback(async (value: string) => {
      if (!supportsAssignee) {
        msg.error('برای این ماژول ارجاع مسئول فعال نشده است.');
        return;
      }
      const [type, assignId] = value.split('_');
      if (type === 'role' && !supportsRoleAssignee) {
        msg.error('در این ماژول فقط امکان انتخاب مسئول از نوع پرسنل وجود دارد.');
        return;
      }
      try {
        const payload = type === 'role'
          ? { assignee_id: null, assignee_role_id: assignId, assignee_type: type }
          : { assignee_id: assignId, assignee_role_id: null, assignee_type: type };
        const { error } = await supabase.from(moduleConfig?.table || moduleId).update(payload).eq('id', id);
        if (error) throw error;

        const previousAssigneeId = getResolvedAssigneeId(data);
        const prevAssigneeType = String(data?.assignee_type || (data?.assignee_role_id ? 'role' : 'user'));
        const prevAssignee = previousAssigneeId ? `${prevAssigneeType}:${previousAssigneeId}` : null;
        const nextAssignee = assignId ? `${type}:${assignId}` : null;

        const resolveAssigneeLabel = async (val: string | null) => {
          if (!val) return 'خالی';
          const [t, uid] = val.split(':');
          if (t === 'user') {
            const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', uid).maybeSingle();
            return profile?.full_name || uid;
          }
          if (t === 'role') {
            const { data: role } = await supabase.from('org_roles').select('title').eq('id', uid).maybeSingle();
            return role?.title || uid;
          }
          return uid;
        };

        const oldLabel = await resolveAssigneeLabel(prevAssignee);
        const newLabel = await resolveAssigneeLabel(nextAssignee);

        setData((prev: any) => ({
          ...prev,
          assignee_id: type === 'role' ? null : assignId,
          assignee_role_id: type === 'role' ? assignId : null,
          assignee_type: type,
        }));

        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        const recordTitle = getRecordTitle(data, moduleConfig) || null;
        await supabase.from('changelogs').insert([
          {
            module_id: moduleId,
            record_id: id,
            action: 'update',
            field_name: 'assignee_id',
            field_label: assigneeLabel,
            old_value: oldLabel,
            new_value: newLabel,
            user_id: userId,
            record_title: recordTitle,
          },
        ]);

        msg.success(`${assigneeLabel} رکورد تغییر کرد`);
      } catch (e: any) { msg.error('خطا: ' + e.message); }
    }, [assigneeLabel, data?.assignee_id, data?.assignee_type, data, id, moduleConfig?.table, moduleId, msg, supportsAssignee, supportsRoleAssignee]);

  // تابع برای کپی اقلام BOM به جداول مواد اولیه (با تایید کاربر)
    const handleRelatedBomChange = useCallback(async (bomId: string) => {
      if (!bomId) return;
      if (bomCopyPromptRef.current === bomId) return;
      bomCopyPromptRef.current = bomId;

      modal.confirm({
        title: 'کپی از شناسنامه تولید',
        content: 'جداول سفارش تولید ریست شوند و مقادیر از روی BOM کپی شوند؟',
        okText: 'بله، کپی کن',
        cancelText: 'خیر',
        onCancel: () => {
          bomCopyPromptRef.current = null;
        },
        onOk: async () => {
          try {
            const { data: bom, error: bomError } = await supabase
              .from('production_boms')
              .select('*')
              .eq('id', bomId)
              .single();

            if (bomError) throw bomError;
              
            const updateData: any = {};
            if (bom.grid_materials) {
              updateData['grid_materials'] = bom.grid_materials;
            }
            if (moduleId === 'production_orders') {
              updateData['bom_id'] = bomId;
              updateData['name'] = bom?.name || '';
            } else {
              updateData['related_bom'] = bomId;
            }
            updateData['product_category'] = bom?.product_category ?? null;
            if (bom.production_stages_draft) {
              updateData['production_stages_draft'] = bom.production_stages_draft;
            }

            const { error: updateError } = await supabase
              .from(moduleId)
              .update(updateData)
              .eq('id', id);

            if (updateError) throw updateError;

            setData((prev: any) => ({ 
              ...prev, 
              ...updateData 
            }));
              
            setLinkedBomData(bom);
            msg.success('اقلام شناسنامه تولید بارگذاری شد و بهای تمام شده محاسبه شد');
          } catch (e: any) {
            msg.error('خطا در بارگذاری اقلام: ' + e.message);
          } finally {
            bomCopyPromptRef.current = null;
          }
        }
      });
    }, [id, moduleId, msg, modal]);

  const handleProcessTemplateChange = useCallback(async (templateId: string) => {
    if (!templateId || !processDraftFieldKey || !id) return;
    if (processTemplatePromptRef.current === templateId) return;
    processTemplatePromptRef.current = templateId;

    modal.confirm({
      title: 'کپی مراحل از الگوی فرآیند',
      content: 'مراحل پیش‌نویس فرآیند با الگوی انتخاب‌شده جایگزین شود؟',
      okText: 'بله، جایگزین کن',
      cancelText: 'خیر',
      onCancel: () => {
        processTemplatePromptRef.current = null;
      },
      onOk: async () => {
        try {
          const { data: stages, error } = await supabase
            .from('process_template_stages')
            .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
            .eq('template_id', templateId)
            .order('sort_order', { ascending: true });
          if (error) throw error;

          const mappedDraft = (stages || []).map((stage: any, index: number) => ({
            ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
            id: stage.id || `${templateId}_${index + 1}`,
            name: stage.stage_name || `مرحله ${index + 1}`,
            sort_order: stage.sort_order || ((index + 1) * 10),
            wage: stage.wage || 0,
              weight: Number(stage?.metadata?.weight || 0),
              duration_value: Number(stage?.metadata?.duration_value || 0),
              duration_unit: stage?.metadata?.duration_unit || 'day',
              duration_from: stage?.metadata?.duration_from || 'project_start',
              default_assignee_id: stage.default_assignee_id || null,
            default_assignee_role_id: stage.default_assignee_role_id || null,
            template_stage_id: stage.id || null,
          }));

          const patch: Record<string, any> = {
            process_template_id: templateId,
            [processDraftFieldKey]: mappedDraft,
          };
          const { error: updateError } = await supabase.from(moduleId).update(patch).eq('id', id);
          if (updateError) throw updateError;

          setData((prev: any) => ({ ...(prev || {}), ...patch }));
          setAutoSyncedProcessTemplateId(templateId);
          msg.success('مراحل فرآیند بارگذاری شد');
        } catch (e: any) {
          msg.error('خطا در بارگذاری مراحل فرآیند: ' + (e?.message || e));
        } finally {
          processTemplatePromptRef.current = null;
        }
      },
    });
  }, [id, moduleId, msg, modal, processDraftFieldKey]);

  const handleDelete = () => {
    modal.confirm({ title: 'حذف رکورد', okType: 'danger', onOk: async () => { await supabase.from(moduleId).delete().eq('id', id); navigate(`/${moduleId}`); } });
  };

  const handleCopyRecord = useCallback(() => {
    if (!data || !id || !moduleConfig) return;
    modal.confirm({
      title: 'کپی رکورد',
      content: 'از این رکورد یک نسخه کپی ساخته شود؟',
      okText: 'بله، کپی کن',
      cancelText: 'انصراف',
      onOk: async () => {
        try {
          const nameField = detectCopyNameField(moduleConfig);
          const payload = buildCopyPayload(data, { nameField, moduleId });
          const tableName = moduleConfig.table || moduleId;
          const { data: inserted, error } = await supabase
            .from(tableName)
            .insert(payload)
            .select('id')
            .single();
          if (error) throw error;
          if (moduleId === 'production_orders' && inserted?.id) {
            await copyProductionOrderRelations(supabase, String(id), String(inserted.id));
          }
          msg.success('کپی رکورد با موفقیت ایجاد شد.');
          if (inserted?.id) navigate(`/${moduleId}/${inserted.id}`);
        } catch (e: any) {
          msg.error(`کپی رکورد ناموفق بود: ${e?.message || e}`);
        }
      }
    });
  }, [data, id, moduleConfig, modal, moduleId, msg, navigate]);

  const isMissingColumnError = (error: any, columnName: string) => {
    const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
    const needle = String(columnName || '').toLowerCase();
    return !!text && !!needle && text.includes(needle) && (text.includes('column') || text.includes('schema cache'));
  };

  const createProjectWithFallback = async (payload: Record<string, any>) => {
    let currentPayload: Record<string, any> = { ...payload };
    const optionalColumns = ['source_invoice_id', 'source_purchase_invoice_id'];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data: inserted, error } = await supabase
        .from('projects')
        .insert(currentPayload)
        .select('id')
        .single();
      if (!error && inserted?.id) return String(inserted.id);
      const removable = optionalColumns.filter((columnName) =>
        Object.prototype.hasOwnProperty.call(currentPayload, columnName) && isMissingColumnError(error, columnName)
      );
      if (!removable.length) throw error || new Error('ایجاد پروژه ناموفق بود');
      removable.forEach((columnName) => {
        delete currentPayload[columnName];
      });
    }
    throw new Error('ایجاد پروژه ناموفق بود');
  };

  const loadQuickProjectModalOptions = useCallback(async () => {
    try {
      const [{ data: customers }, { data: templates, error: templatesError }] = await Promise.all([
        supabase
          .from('customers')
          .select('id,first_name,last_name,business_name,system_code')
          .order('last_name', { ascending: true })
          .limit(200),
        supabase
          .from('process_templates')
          .select('id,name,module_id,is_active')
          .order('name', { ascending: true }),
      ]);
      if (templatesError) throw templatesError;
      const customerOptions = (customers || []).map((row: any) => ({
        value: String(row.id),
        label: `${String(row?.system_code || '').trim() ? `${row.system_code} - ` : ''}${String(
          row?.business_name
          || `${String(row?.first_name || '').trim()} ${String(row?.last_name || '').trim()}`.trim()
          || row?.id
          || '-'
        )}`,
      }));
      const scopedTemplates = (templates || []).filter((row: any) => {
        const rowModule = String(row?.module_id || '').trim();
        const isActive = row?.is_active !== false;
        return isActive && (!rowModule || rowModule === 'projects');
      });
      const templateOptions = scopedTemplates.map((row: any) => ({
        value: String(row.id),
        label: String(row?.name || row?.id),
      }));
      setQuickProjectCustomerOptions(customerOptions);
      setQuickProjectTemplateOptions(templateOptions);
    } catch (error) {
      console.warn('Could not load quick project modal options', error);
      setQuickProjectCustomerOptions([]);
      setQuickProjectTemplateOptions([]);
    }
  }, []);

  const handleOpenQuickProjectModal = useCallback(async () => {
    await loadQuickProjectModalOptions();
    const baseTitle = String(getRecordTitle(data, moduleConfig, { fallback: '' }) || data?.name || data?.title || data?.system_code || 'جدید').trim();
    const suggestedName = `پروژه "${baseTitle || 'جدید'}"`;
    const suggestedCustomerId = moduleId === 'invoices'
      ? (data?.customer_id || null)
      : (moduleId === 'tasks' ? (data?.related_customer || null) : null);
    quickProjectForm.setFieldsValue({
      name: suggestedName,
      customer_id: suggestedCustomerId,
      process_template_id: data?.process_template_id || undefined,
    });
    setIsQuickProjectModalOpen(true);
  }, [data, loadQuickProjectModalOptions, moduleConfig, moduleId, quickProjectForm]);

  const handleQuickProjectCreate = useCallback(async (values: any) => {
    if (!id) return;
    setQuickProjectLoading(true);
    try {
      const selectedTemplateId = String(values?.process_template_id || '').trim() || null;
      const selectedTemplateLabel = quickProjectTemplateOptions.find((item) => String(item.value) === selectedTemplateId)?.label || null;
      let executionDraft: any[] = [];
      if (selectedTemplateId) {
        const { data: stages, error: stagesError } = await supabase
          .from('process_template_stages')
          .select('id, stage_name, sort_order, wage, default_assignee_id, default_assignee_role_id, metadata')
          .eq('template_id', selectedTemplateId)
          .order('sort_order', { ascending: true });
        if (stagesError) throw stagesError;
        const groupId = `process_group_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const groupLabel = String(selectedTemplateLabel || 'فرآیند ۱').trim() || 'فرآیند ۱';
        executionDraft = (stages || []).map((stage: any, index: number) => {
          const metadata = stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {};
          return {
            ...(metadata || {}),
            id: stage.id || `${selectedTemplateId}_${index + 1}`,
            name: stage.stage_name || `مرحله ${index + 1}`,
            sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
            wage: Number(stage?.wage || 0),
            weight: Number(metadata?.weight || 0),
            duration_value: Number(metadata?.duration_value || 0),
            duration_unit: String(metadata?.duration_unit || 'day') === 'hour' ? 'hour' : 'day',
            duration_from: String(metadata?.duration_from || 'project_start') === 'previous_stage_end' ? 'previous_stage_end' : 'project_start',
            description: String(metadata?.description || '').trim() || null,
            task_type: String(metadata?.task_type || '').trim() || null,
            default_assignee_id: stage?.default_assignee_id || null,
            default_assignee_role_id: stage?.default_assignee_role_id || null,
            source_template_id: selectedTemplateId,
            source_template_name: selectedTemplateLabel,
            process_group_id: groupId,
            process_group_name: groupLabel,
            template_stage_id: stage.id || null,
          };
        });
      }

      const authUser = await getCachedAuthUser(supabase);
      const userId = authUser?.id || null;
      const payload: Record<string, any> = {
        name: String(values?.name || '').trim(),
        status: 'draft',
        customer_id: values?.customer_id || null,
        process_template_id: selectedTemplateId,
        execution_process_draft: executionDraft,
        source_invoice_id: moduleId === 'invoices' ? id : null,
        source_purchase_invoice_id: moduleId === 'purchase_invoices' ? id : null,
        created_by: userId,
      };
      if (!payload.name) {
        msg.error('نام پروژه الزامی است');
        return;
      }
      const projectId = await createProjectWithFallback(payload);

      if (moduleId === 'invoices') {
        await supabase.from('invoices').update({ project_id: projectId }).eq('id', id);
      } else if (moduleId === 'purchase_invoices') {
        await supabase.from('purchase_invoices').update({ project_id: projectId }).eq('id', id);
      }

      setIsQuickProjectModalOpen(false);
      quickProjectForm.resetFields();
      msg.success('پروژه ایجاد شد');
      navigate(`/projects/${projectId}`);
    } catch (error: any) {
      msg.error(`ایجاد پروژه ناموفق بود: ${error?.message || error}`);
    } finally {
      setQuickProjectLoading(false);
    }
  }, [id, moduleId, msg, navigate, quickProjectForm, quickProjectTemplateOptions]);



  const handleIssueAccounting = async () => {
    if (!id) return;
    setIssueAccountingLoading(true);
    try {
      await createJournalFromInvoice(supabase, id, navigate, msg);
    } finally {
      setIssueAccountingLoading(false);
    }
  };

    const handleHeaderAction = (actionId: string) => {

      if (actionId === 'create_journal_entry') {

        handleIssueAccounting();

        return;

      }

      if (actionId === 'create_production_order') {
      if (!MODULES['production_orders']) {
        msg.error('ماژول سفارش تولید یافت نشد');
        return;
      }
      setIsCreateOrderOpen(true);
      return;
    }
    if (actionId === 'quick_stock_movement' && (moduleId === 'products' || moduleId === 'shelves')) {
      if (!canEditModule) return;
      setStockMovementQuickAddSignal((prev) => prev + 1);
      return;
    }
    if (actionId === 'create_process') {
      if (!processDraftFieldKey) {
        msg.info('برای این ماژول فرآیند فعال نیست');
        return;
      }
      const processSectionEl = document.getElementById(`process-section-${String(moduleId)}-${String(id || '')}`);
      processSectionEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kalamapp:open-process-append', {
          detail: { moduleId: String(moduleId), recordId: String(id || '') },
        }));
      }
      return;
    }
    if (actionId === 'create_project') {
      void handleOpenQuickProjectModal();
      return;
    }
    if (actionId === 'create_customer_from_lead' && moduleId === 'marketing_leads') {
      if (!canEditModule) return;
      setIsCreateCustomerFromLeadOpen(true);
      return;
    }
    if (actionId === 'auto_name' && (moduleId === 'products' || moduleId === 'production_orders' || moduleId === 'customers')) {
      if (!canEditModule) return;
      const supportsAutoToggle = moduleId === 'products' || moduleId === 'production_orders';
      let enableAuto = !!data?.auto_name_enabled;
      modal.confirm({
        title: moduleId === 'products'
          ? 'نامگذاری خودکار محصول'
          : moduleId === 'production_orders'
            ? 'نامگذاری خودکار سفارش تولید'
            : 'نامگذاری خودکار مشتری',
        content: (
          <div className="space-y-3">
            <div>
              {moduleId === 'products'
                ? 'نام محصول از مقادیر فعلی ساخته شود؟'
                : moduleId === 'production_orders'
                  ? 'نام سفارش تولید بر اساس BOM و رنگ ساخته شود؟'
                  : 'نام کامل مشتری از فیلدهای فعلی ساخته شود؟'}
            </div>
            {supportsAutoToggle && (
              <Checkbox defaultChecked={enableAuto} onChange={(e) => { enableAuto = e.target.checked; }}>
                با تغییر فیلدهای مرتبط، نام به صورت خودکار بروزرسانی شود
              </Checkbox>
            )}
          </div>
        ),
        okText: 'اعمال',
        cancelText: 'انصراف',
        onOk: async () => {
          const nextName = moduleId === 'products'
            ? buildAutoProductName(data)
            : moduleId === 'production_orders'
              ? buildAutoProductionOrderName(data)
              : buildAutoCustomerName(data);
          if (!nextName) {
            msg.warning('اطلاعات کافی برای نامگذاری خودکار وجود ندارد.');
            return;
          }

          const updatePayload = moduleId === 'customers'
            ? { full_name: nextName }
            : { name: nextName, auto_name_enabled: enableAuto };

          try {
            const { error } = await supabase
              .from(moduleId)
              .update(updatePayload)
              .eq('id', id);
            if (error) throw error;

            if (moduleId === 'customers') {
              setData((prev: any) => ({ ...prev, full_name: nextName }));
            } else {
              setData((prev: any) => ({ ...prev, name: nextName, auto_name_enabled: enableAuto }));
            }

            await insertChangelog({
              action: 'update',
              fieldName: moduleId === 'customers' ? 'full_name' : 'name',
              fieldLabel: getFieldLabel(moduleId === 'customers' ? 'full_name' : 'name'),
              oldValue: moduleId === 'customers' ? (data?.full_name ?? null) : (data?.name ?? null),
              newValue: nextName
            });
            msg.success(moduleId === 'customers' ? 'نام کامل مشتری بروزرسانی شد.' : 'نام با موفقیت بروزرسانی شد.');
          } catch (e: any) {
            msg.error('بروزرسانی نام ناموفق بود: ' + e.message);
          }
        }
      });
      return;
    }
    msg.info('این عملیات هنوز پیاده‌سازی نشده است');
  };




  const handleImageUpdate = useCallback(async (file: File) => {
    if (!canEditModule) {
      msg.warning('ابتدا رکورد را ذخیره کنید');
      return false;
    }
    if (!id) {
      msg.warning('ابتدا رکورد را ذخیره کنید');
      return false;
    }
    setUploadingImage(true);
    try {
      const ext = String(file.name.split('.').pop() || '').trim();
      const baseName = String(file.name || 'image').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${baseName}${ext && !baseName.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? `.${ext}` : ''}`;
      const filePath = `record_files/${moduleId}/${id}/${fileName}`;
      const { error: upErr } = await fileStorageClient.storage.from(FILE_STORAGE_BUCKET).upload(filePath, file);
      if (upErr) throw upErr;
      const { data: urlData } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(filePath);
      const { error: updateError } = await supabase
        .from(moduleId)
        .update({ image_url: urlData.publicUrl })
        .eq('id', id);
      if (updateError) throw updateError;
      const { error: fileInsertError } = await supabase
        .from('record_files')
        .insert([
          {
            module_id: moduleId,
            record_id: id,
            file_url: urlData.publicUrl,
            file_type: 'image',
            file_name: file.name || null,
            mime_type: file.type || null,
            sort_order: 0,
          },
        ]);
      if (fileInsertError) {
        console.warn('Could not append uploaded image to record_files', fileInsertError);
      }
      setData((prev: any) => ({ ...prev, image_url: urlData.publicUrl }));
      msg.success('تصویر بروزرسانی شد');
    } catch (e: any) { msg.error('خطا: ' + e.message); } finally { setUploadingImage(false); }
    return false;
  }, [canEditModule, id, moduleId, msg]);


  const getFieldLabel = useCallback(
    (fieldKey: string) => moduleConfig?.fields?.find(f => f.key === fieldKey)?.labels?.fa || fieldKey,
    [moduleConfig]
  );

  const insertChangelog = useCallback(
    async (payload: { action: string; fieldName?: string; fieldLabel?: string; oldValue?: any; newValue?: any }) => {
      try {
        if (!moduleId || !id) return;
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        const recordTitle = getRecordTitle(data, moduleConfig) || null;

        const { error } = await supabase.from('changelogs').insert([
          {
            module_id: moduleId,
            record_id: id,
            action: payload.action,
            field_name: payload.fieldName || null,
            field_label: payload.fieldLabel || null,
            old_value: payload.oldValue ?? null,
            new_value: payload.newValue ?? null,
            user_id: userId,
            record_title: recordTitle,
          },
        ]);
        if (error) throw error;
      } catch (err) {
        console.warn('Changelog insert failed:', err);
      }
    },
    [moduleId, id, data]
  );

  const logFieldChange = useCallback(
    async (fieldKey: string, oldValue: any, newValue: any) => {
      await insertChangelog({
        action: 'update',
        fieldName: fieldKey,
        fieldLabel: getFieldLabel(fieldKey),
        oldValue,
        newValue,
      });
    },
    [getFieldLabel, insertChangelog]
  );

  const handleMainImageChange = useCallback(async (url: string | null) => {
    if (!canEditModule) return;
    try {
      const { error } = await supabase.from(moduleId).update({ image_url: url }).eq('id', id);
      if (error) throw error;
      setData((prev: any) => ({ ...prev, image_url: url }));
      await insertChangelog({
        action: 'update',
        fieldName: 'image_url',
        fieldLabel: getFieldLabel('image_url'),
        oldValue: data?.image_url ?? null,
        newValue: url,
      });
      msg.success('تصویر اصلی بروزرسانی شد');
    } catch (e: any) {
      msg.error('خطا در بروزرسانی تصویر: ' + e.message);
    }
  }, [canEditModule, data?.image_url, getFieldLabel, id, insertChangelog, moduleId, msg]);

  const handleCreateOrderFromBom = useCallback(async (values: any) => {
    try {
      const { data: inserted, error } = await supabase
        .from('production_orders')
        .insert(values)
        .select('id')
        .single();
      if (error) throw error;
      if (inserted?.id) {
        const postPayload: any = {};
        if (values?.grid_materials !== undefined) postPayload.grid_materials = values.grid_materials;
        if (values?.production_stages_draft !== undefined) postPayload.production_stages_draft = values.production_stages_draft;
        if (Object.keys(postPayload).length > 0) {
          await supabase.from('production_orders').update(postPayload).eq('id', inserted.id);
        }
        const hasDraftStages = Array.isArray(values?.production_stages_draft) && values.production_stages_draft.length > 0;
        if (hasDraftStages) {
          await supabase.from('production_lines').insert({
            production_order_id: inserted.id,
            line_no: 1,
            quantity: 0,
          });
        }
      }
      setIsCreateOrderOpen(false);
      msg.success('سفارش تولید ایجاد شد');
      if (inserted?.id) {
        navigate(`/production_orders/${inserted.id}`);
      }
    } catch (e: any) {
      msg.error(e.message || 'خطا در ایجاد سفارش تولید');
    }
  }, [msg, navigate]);

  const saveEdit = async (key: string) => {
    if (!canEditModule) return;
    if (moduleId === 'production_orders' && key === 'status') {
      const newStatus = tempValues[key];
      await handleProductionStatusChange(String(newStatus));
      setTimeout(() => setEditingFields(prev => ({ ...prev, [key]: false })), 100);
      return;
    }
    setSavingField(key);
    let newValue = tempValues[key];
    if (newValue === '' || newValue === undefined) newValue = null;
    try {
      const { error } = await supabase.from(moduleId).update({ [key]: newValue }).eq('id', id);
      if (error) throw error;
      if ((moduleId === 'invoices' || moduleId === 'purchase_invoices') && key === 'status') {
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        await applyInvoiceFinalizationInventory({
          supabase: supabase as any,
          moduleId,
          recordId: id || '',
          previousStatus: data?.status ?? null,
          nextStatus: newValue,
          invoiceItems: data?.invoiceItems || [],
          userId,
        });
        const accountingSync = await syncInvoiceAccountingEntries({
          supabase: supabase as any,
          moduleId,
          recordId: id || '',
          recordData: {
            ...(data || {}),
            [key]: newValue,
          },
          includePayments: true,
        });
        if (accountingSync.errors.length > 0) {
          console.warn('هشدارهای همگام‌سازی سند حسابداری فاکتور:', accountingSync.errors);
          msg.warning(`هشدار صدور سند: ${toFaAccountingSyncError(accountingSync.errors[0])}`);
        }
      }
      setData((prev: any) => ({ ...prev, [key]: newValue }));
      await insertChangelog({
        action: 'update',
        fieldName: key,
        fieldLabel: getFieldLabel(key),
        oldValue: data?.[key],
        newValue,
      });
      msg.success('ذخیره شد');
      setTimeout(() => setEditingFields(prev => ({ ...prev, [key]: false })), 100);
    } catch (error: any) { msg.error(error.message); } finally { setSavingField(null); }
  };

  const areValuesEqual = (a: any, b: any) => {
    if (Array.isArray(a) || Array.isArray(b)) {
      try {
        return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      } catch {
        return a === b;
      }
    }
    return a === b;
  };

  const isUuid = useCallback((value: any) => (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(String(value || ''))
  ), []);

  const syncProcessTemplateStages = useCallback(async (templateId: string, rawStages: any[]) => {
    const nextStages = (Array.isArray(rawStages) ? rawStages : []).map((stage: any, index: number) => ({
      id: isUuid(stage?.id) ? String(stage.id) : null,
      stage_name: String(stage?.name || stage?.stage_name || `مرحله ${index + 1}`),
      sort_order: Number(stage?.sort_order || ((index + 1) * 10)),
      wage: Number(stage?.wage || 0),
      metadata: {
        ...(stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {}),
        weight: Number(stage?.weight || stage?.metadata?.weight || 0),
        duration_value: Number(stage?.duration_value || stage?.metadata?.duration_value || 0),
        duration_unit: String(stage?.duration_unit || stage?.metadata?.duration_unit || 'day') === 'hour' ? 'hour' : 'day',
        duration_from: String(stage?.duration_from || stage?.metadata?.duration_from || 'project_start') === 'previous_stage_end'
          ? 'previous_stage_end'
          : 'project_start',
      },
      default_assignee_id: isUuid(stage?.default_assignee_id) ? String(stage.default_assignee_id) : null,
      default_assignee_role_id: isUuid(stage?.default_assignee_role_id) ? String(stage.default_assignee_role_id) : null,
    }));

    const { data: existingRows, error: existingError } = await supabase
      .from('process_template_stages')
      .select('id')
      .eq('template_id', templateId);
    if (existingError) throw existingError;

    const existingIds = new Set((existingRows || []).map((row: any) => String(row.id)));
    const keptExistingIds = new Set(
      nextStages
        .map((stage) => stage.id)
        .filter((stageId): stageId is string => Boolean(stageId && existingIds.has(stageId)))
    );
    const removeIds = Array.from(existingIds).filter((stageId) => !keptExistingIds.has(stageId));
    if (removeIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('process_template_stages')
        .delete()
        .in('id', removeIds);
      if (deleteError) throw deleteError;
    }

    for (const stage of nextStages) {
      if (stage.id && existingIds.has(stage.id)) {
        const { error: updateError } = await supabase
          .from('process_template_stages')
          .update({
            stage_name: stage.stage_name,
            sort_order: stage.sort_order,
            wage: stage.wage,
            metadata: stage.metadata,
            default_assignee_id: stage.default_assignee_id,
            default_assignee_role_id: stage.default_assignee_role_id,
          })
          .eq('id', stage.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('process_template_stages')
          .insert({
            template_id: templateId,
            stage_name: stage.stage_name,
            sort_order: stage.sort_order,
            wage: stage.wage,
            metadata: stage.metadata,
            default_assignee_id: stage.default_assignee_id,
            default_assignee_role_id: stage.default_assignee_role_id,
          });
        if (insertError) throw insertError;
      }
    }
  }, [isUuid]);

  const handleSmartFormSave = useCallback(async (
    values: any,
    meta?: { templateStagesPreview?: any[] }
  ) => {
    try {
      if (!id) return;
      const previous = data || {};

      const changedKeys = Object.keys(values).filter((k) => !areValuesEqual(values[k], previous[k]));

      await supabase.from(moduleId).update(values).eq('id', id);
      if (moduleId === 'process_templates') {
        await syncProcessTemplateStages(String(id), meta?.templateStagesPreview || []);
      }

      if (moduleId === 'invoices' || moduleId === 'purchase_invoices') {
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        await applyInvoiceFinalizationInventory({
          supabase: supabase as any,
          moduleId,
          recordId: id,
          previousStatus: previous?.status || null,
          nextStatus: values?.status ?? previous?.status ?? null,
          invoiceItems: values?.invoiceItems ?? previous?.invoiceItems ?? [],
          userId,
        });
        const accountingSync = await syncInvoiceAccountingEntries({
          supabase: supabase as any,
          moduleId,
          recordId: id,
          recordData: {
            ...previous,
            ...values,
          },
          includePayments: true,
        });
        if (accountingSync.errors.length > 0) {
          console.warn('هشدارهای همگام‌سازی سند حسابداری فاکتور:', accountingSync.errors);
          msg.warning(`هشدار صدور سند: ${toFaAccountingSyncError(accountingSync.errors[0])}`);
        }
      }

      for (const key of changedKeys) {
        await logFieldChange(key, previous[key], values[key]);
      }

      msg.success('ذخیره شد');
      setIsEditDrawerOpen(false);
      void fetchRecord(true);
    } catch (err: any) {
      msg.error(err.message);
    }
  }, [data, fetchRecord, id, logFieldChange, moduleId, msg, syncProcessTemplateStages]);

  const handleIssueAccountingEntry = useCallback(async () => {
    if (issueAccountingLoading) return;
    if (!id) return;
    if (moduleId !== 'invoices' && moduleId !== 'purchase_invoices') return;
    if (!canIssueAccountingEntry) {
      msg.error('دسترسی صدور سند حسابداری ندارید.');
      return;
    }

    const normalizedStatus = String(data?.status || '').trim().toLowerCase();
    if (!['final', 'settled', 'completed', 'confirmed'].includes(normalizedStatus)) {
      msg.warning('برای صدور سند، وضعیت فاکتور باید یکی از حالت‌های تایید/نهایی/تسویه/تکمیل باشد.');
      return;
    }

    const eventLabelMap: Record<string, string> = {
      sales_invoice_finalized: 'سند فروش',
      purchase_invoice_finalized: 'سند خرید',
      sales_payment_received: 'سند دریافت وجه',
      purchase_payment_paid: 'سند پرداخت وجه',
    };

    setIssueAccountingLoading(true);
    try {
      const accountingSync = await syncInvoiceAccountingEntries({
        supabase: supabase as any,
        moduleId,
        recordId: id,
        includePayments: true,
      });

      if (accountingSync.errors.length > 0) {
        console.warn('هشدارهای همگام‌سازی دستی سند حسابداری فاکتور:', accountingSync.errors);
      }

      if (accountingSync.createdEventKeys.length > 0) {
        const label = accountingSync.createdEventKeys
          .map((key) => eventLabelMap[key] || key)
          .join('، ');
        msg.success(`صدور سند انجام شد: ${label}`);
        const lastJournalId = accountingSync.createdJournalEntryIds[accountingSync.createdJournalEntryIds.length - 1];
        if (lastJournalId) {
          const journalModule = MODULES.journal_entries;
          navigate(`/${journalModule.table}/${lastJournalId}`);
        }
        if (accountingSync.errors.length > 0) {
          msg.warning(`صدور سند با هشدار: ${toFaAccountingSyncError(accountingSync.errors[0])}`);
        }
      } else if (accountingSync.errors.length === 0) {
        msg.info('سندی صادر نشد (قبلا صادر شده یا قواعد حسابداری کامل نیست).');
      } else {
        msg.warning(`صدور سند ناموفق: ${toFaAccountingSyncError(accountingSync.errors[0])}`);
      }

      await fetchRecord(true);
    } catch (error: any) {
      msg.error(error?.message || 'خطا در صدور سند حسابداری');
    } finally {
      setIssueAccountingLoading(false);
    }
  }, [canIssueAccountingEntry, data?.status, fetchRecord, id, issueAccountingLoading, moduleId, msg, navigate]);

  const startEdit = (key: string, value: any) => {
    if (!canEditModule) return;
    setEditingFields(prev => ({ ...prev, [key]: true }));
    setTempValues(prev => ({ ...prev, [key]: value }));
  };
  const cancelEdit = (key: string) => { setEditingFields(prev => ({ ...prev, [key]: false })); };

  const checkVisibility = (logicOrRule: any) => {
    if (!logicOrRule) return true;
    const rule = logicOrRule.visibleIf || logicOrRule;
    if (!rule || !rule.field) return true;
    const { field, operator, value } = rule;
    const currentValue = data?.[field];
    if (currentValue === undefined || currentValue === null) {
      if (operator === LogicOperator.NOT_EQUALS) return false;
    }
    if (operator === LogicOperator.EQUALS) return currentValue === value;
    if (operator === LogicOperator.NOT_EQUALS) return currentValue !== value;
    if (operator === LogicOperator.CONTAINS) return Array.isArray(currentValue) ? currentValue.includes(value) : false;
    if (operator === LogicOperator.GREATER_THAN) return Number(currentValue) > Number(value);
    if (operator === LogicOperator.LESS_THAN) return Number(currentValue) < Number(value);
    return true;
  };

    const getOptionLabel = (field: any, value: any) => {
      if (!field) return getSafeOptionFallback(value);
      // اگر MULTI_SELECT است و آرایه است
      if (field.type === FieldType.MULTI_SELECT && Array.isArray(value)) {
          return value.map(v => {
              let opt = field.options?.find((o: any) => o.value === v);
              if (opt) return opt.label;
              if ((field as any).dynamicOptionsCategory) {
                  const cat = (field as any).dynamicOptionsCategory;
                  opt = dynamicOptions[cat]?.find((o: any) => o.value === v);
                  if (opt) return opt.label;
              }
              return getSafeOptionFallback(v);
          }).join(', ');
      }
      
      let opt = field.options?.find((o: any) => o.value === value);
      if (opt) return opt.label;
      if ((field as any).dynamicOptionsCategory) {
          const cat = (field as any).dynamicOptionsCategory;
          opt = dynamicOptions[cat]?.find((o: any) => o.value === value);
          if (opt) return opt.label;
      }
      if (field.type === FieldType.RELATION) {
          for (const key in relationOptions) {
              const found = relationOptions[key]?.find((o: any) => o.value === value);
              if (found) return found.label;
          }
      }
      return getSafeOptionFallback(value);
  };

  const getFieldValueLabel = (fieldKey: string, value: any) => {
    if (value === undefined || value === null) return '';
    const field = moduleConfig?.fields?.find(f => f.key === fieldKey);
    if (!field) return getSafeOptionFallback(value, '');
    return String(getOptionLabel(field, value));
  };

  const buildAutoProductName = (record: any) => {
    if (!record) return '';
    const parts: string[] = [];
    const addPart = (part?: string) => {
      if (!part) return;
      const trimmed = String(part).trim();
      if (trimmed) parts.push(trimmed);
    };

    const productType = record?.product_type;
    if (productType === 'goods') {
      addPart(getFieldValueLabel('category', record?.category));
    } else if (productType === 'service') {
      addPart(getFieldValueLabel('product_category', record?.product_category));
    } else {
      addPart(getFieldValueLabel('category', record?.category));
      addPart(getFieldValueLabel('product_category', record?.product_category));
    }
    addPart(getFieldValueLabel('brand_name', record?.brand_name));

    return parts.join(' ');
  };

  const buildAutoProductionOrderName = (record: any) => {
    if (!record) return '';
    const parts: string[] = [];
    const addPart = (part?: string) => {
      if (!part) return;
      const trimmed = String(part).trim();
      if (trimmed) parts.push(trimmed);
    };
    const bomLabelRaw = getFieldValueLabel('bom_id', record?.bom_id);
    const bomLabelClean = String(bomLabelRaw || '').replace(/\s*\([^()]*\)\s*$/, '').trim();
    addPart(bomLabelClean);
    addPart(getFieldValueLabel('color', record?.color));
    return parts.join(' ');
  };


  const buildAutoCustomerName = (record: any) => {
    if (!record) return '';
    const normalize = (value: any) => String(value ?? '').replace(/\s+/g, ' ').trim();
    const businessName = normalize(record?.business_name);
    const personType = normalize(record?.person_type).toLowerCase();

    if (personType === 'legal') {
      const legalName = normalize(record?.legal_name);
      if (legalName && businessName) return legalName + ' - ' + businessName;
      return legalName || businessName;
    }

    const realName = [record?.prefix, record?.first_name, record?.last_name]
      .map((part) => normalize(part))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (realName && businessName) return realName + ' - ' + businessName;
    return realName || businessName;
  };

  const buildCustomerInitialValuesFromLead = useCallback(() => {
    if (moduleId !== 'marketing_leads') return {};
    return {
      business_name: data?.business_name || '',
      prefix: data?.prefix || null,
      first_name: data?.first_name || '',
      last_name: data?.last_name || '',
      mobile_1: data?.mobile || '',
      mobile_2: data?.mobile_2 || '',
      assistant_phone: data?.assistant_phone || '',
      email: data?.email || '',
      province: data?.province || null,
      city: data?.city || null,
      address: data?.address || '',
      location: data?.location || undefined,
      industry: data?.industry || null,
      lead_source: data?.lead_source || data?.source || null,
      notes: data?.notes || '',
      assignee_id: data?.assignee_id || null,
      assignee_type: data?.assignee_type || null,
      assignee_role_id: data?.assignee_role_id || null,
    } as Record<string, any>;
  }, [data, moduleId]);

  const formatPersian = (val: any, kind: 'DATE' | 'TIME' | 'DATETIME') => {
    if (!val) return '';
    try {
      let dateObj: DateObject;

      if (kind === 'TIME') {
        dateObj = new DateObject({
          date: `1970-01-01 ${val}`,
          format: 'YYYY-MM-DD HH:mm',
          calendar: gregorian,
          locale: gregorian_en,
        });
      } else if (kind === 'DATE') {
        dateObj = new DateObject({
          date: val,
          format: 'YYYY-MM-DD',
          calendar: gregorian,
          locale: gregorian_en,
        });
      } else {
        const jsDate = new Date(val);
        if (Number.isNaN(jsDate.getTime())) return '';
        dateObj = new DateObject({
          date: jsDate,
          calendar: gregorian,
          locale: gregorian_en,
        });
      }

      const format = kind === 'DATE' ? 'YYYY/MM/DD' : kind === 'TIME' ? 'HH:mm' : 'YYYY/MM/DD HH:mm';
      return dateObj.convert(persian, persian_fa).format(format);
    } catch {
      return '';
    }
  };
  
  const formatPrintValue = (field: any, value: any) => {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.join('، ');
    if (field.type === FieldType.CHECKBOX) return value ? 'بله' : 'خیر';
    if (field.type === FieldType.PRICE) return `${Number(value).toLocaleString()} ${currencyLabel}`;
    if (field.type === FieldType.PERCENTAGE) return `${value}%`;
    if (field.type === FieldType.DATE) {
      return formatPersian(value, 'DATE') || String(value);
    }
    if (field.type === FieldType.TIME) {
      return formatPersian(value, 'TIME') || String(value);
    }
    if (field.type === FieldType.DATETIME) {
      return formatPersian(value, 'DATETIME') || String(value);
    }
    if (field.type === FieldType.STATUS || field.type === FieldType.SELECT || field.type === FieldType.MULTI_SELECT || field.type === FieldType.RELATION) {
      return String(getOptionLabel(field, value));
    }
    return String(value);
  };

  const printableFields = useMemo(() => {
    if (!moduleConfig || !data) return [];
    const hasValue = (val: any) => {
      if (val === null || val === undefined) return false;
      if (typeof val === 'string') return val.trim() !== '';
      if (Array.isArray(val)) return val.length > 0;
      return true;
    };
    return moduleConfig.fields
      .filter(f => f.type !== FieldType.IMAGE && f.type !== FieldType.JSON && f.type !== FieldType.READONLY_LOOKUP)
      .filter(f => !f.logic || checkVisibility(f.logic))
      .filter(f => canViewField(f.key))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(f => ({ ...f, value: data[f.key] }))
      .filter(f => hasValue(f.value));
  }, [moduleConfig, data, dynamicOptions, relationOptions]);

  // ✅ استفاده از custom hook برای مدیریت print
  const printManager = usePrintManager({
    moduleId,
    data,
    moduleConfig,
    printableFields,
    formatPrintValue,
    relationOptions,
    canViewField,
  });

  const getUserName = (uid: string) => {
      if (!String(uid || '').trim()) return 'سیستم';
      const user = allUsers.find(u => u.id === uid);
      return user?.full_name || user?.email || user?.mobile_1 || 'نامشخص';
  };

  const currentAssigneeOption = useMemo(() => {
    if (!supportsAssignee) return null;
    const resolvedAssigneeId = getResolvedAssigneeId(data);
    if (!resolvedAssigneeId) return null;
    const normalizedType = String(data?.assignee_type || (data?.assignee_role_id ? 'role' : 'user'));
    const matchedUser = allUsers.find((user) => String(user?.id || '') === resolvedAssigneeId);
    const matchedRole = allRoles.find((role) => String(role?.id || '') === resolvedAssigneeId);
    const explicitLabel = String(
      data?.assignee_name ||
      data?.assignee_label ||
      data?.assignee_role_name ||
      ''
    ).trim();
    return {
      label:
        explicitLabel ||
        (normalizedType === 'role'
          ? String(matchedRole?.title || 'تیم انتخاب‌شده')
          : String(matchedUser?.full_name || matchedUser?.email || matchedUser?.mobile_1 || 'مسئول انتخاب‌شده')),
      value: `${normalizedType}_${resolvedAssigneeId}`,
      emoji: normalizedType === 'role' ? <TeamOutlined /> : <UserOutlined />,
      type: normalizedType,
    };
  }, [allRoles, allUsers, data, data?.assignee_label, data?.assignee_name, data?.assignee_role_name, data?.assignee_type, supportsAssignee]);

  const getAssigneeOptions = () => {
    if (!supportsAssignee) return [];
    const userOptions = allUsers.map((u) => ({
      label: u.full_name || u.email || u.mobile_1 || `کاربر ${String(u.id || '').slice(0, 8)}`,
      value: `user_${u.id}`,
      emoji: <UserOutlined />,
    }));
    const roleOptions = allRoles.map((r) => ({
      label: r.title,
      value: `role_${r.id}`,
      emoji: <TeamOutlined />,
    }));
    const hasCurrentUser = currentAssigneeOption?.type === 'user' && userOptions.some((item) => item.value === currentAssigneeOption.value);
    const hasCurrentRole = currentAssigneeOption?.type === 'role' && roleOptions.some((item) => item.value === currentAssigneeOption.value);
    return [
      {
        label: 'پرسنل',
        title: 'users',
        options: currentAssigneeOption?.type === 'user' && !hasCurrentUser
          ? [currentAssigneeOption, ...userOptions]
          : userOptions,
      },
      ...(supportsRoleAssignee
        ? [{
            label: 'تیم‌ها (جایگاه سازمانی)',
            title: 'roles',
            options: currentAssigneeOption?.type === 'role' && !hasCurrentRole
              ? [currentAssigneeOption, ...roleOptions]
              : roleOptions,
          }]
        : []),
    ];
  };

  const handleConfirmStartProduction = async () => {
    try {
      const confirmedGroups = startMaterials.filter((group) => group.isConfirmed === true);
      if (confirmedGroups.length === 0) {
        msg.warning('هیچ محصولی در حالت تایید نهایی نیست');
        return;
      }
      const materialsWithDelivery = confirmedGroups.filter((group) => group.totalDeliveredQty > 0);
      if (!materialsWithDelivery.length) {
        msg.error('برای محصول‌های تایید شده، مقدار تحویل شده معتبر ثبت نشده است.');
        return;
      }
      const missingProduct = materialsWithDelivery.filter((group) => !group.selectedProductId);
      if (missingProduct.length > 0) {
        msg.error(PRODUCTION_MESSAGES.requireSelectedProduct);
        return;
      }
      const missingSourceShelf = materialsWithDelivery.filter((group) => !group.sourceShelfId);
      if (missingSourceShelf.length > 0) {
        msg.error('برخی قفسه‌های برداشت برای محصول انتخاب‌شده موجودی معتبر ندارند.');
        return;
      }
      const invalidSourceShelf = materialsWithDelivery.filter((group) => {
        const options = group.selectedProductId ? (sourceShelfOptionsByProduct[group.selectedProductId] || []) : [];
        return !options.some((option) => option.value === group.sourceShelfId);
      });
      if (invalidSourceShelf.length > 0) {
        msg.error('برخی قفسه‌های برداشت برای محصول انتخاب‌شده موجودی معتبر ندارند.');
        return;
      }
      const missingProductionShelf = materialsWithDelivery.filter((group) => !group.productionShelfId);
      if (missingProductionShelf.length > 0) {
        msg.error(PRODUCTION_MESSAGES.requireProductionShelf);
        return;
      }
      const moves = materialsWithDelivery.map((group) => ({
        product_id: String(group.selectedProductId),
        from_shelf_id: String(group.sourceShelfId),
        to_shelf_id: String(group.productionShelfId),
        quantity: group.totalDeliveredQty,
      }));

      setStatusLoading(true);
      await applyProductionMoves(moves);
      try {
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        const transferPayload = moves.map((move) => ({
          transfer_type: 'production',
          product_id: move.product_id,
          delivered_qty: move.quantity,
          required_qty: move.quantity,
          invoice_id: null,
          production_order_id: id || null,
          from_shelf_id: move.from_shelf_id,
          to_shelf_id: move.to_shelf_id,
          sender_id: userId,
          receiver_id: userId,
        }));
        if (transferPayload.length > 0) {
          await supabase.from('stock_transfers').insert(transferPayload);
        }
      } catch (movementLogError) {
        console.warn('Could not log production stock transfers', movementLogError);
      }
      const currentGridMaterials = Array.isArray(data?.grid_materials) ? data.grid_materials : [];
      const deliveredByGroupKey = new Map<string, StartMaterialGroup>(
        materialsWithDelivery.map((group) => [group.key, group])
      );
      const nextGridMaterials = currentGridMaterials.map((row: any, rowIndex: number) => {
        const rowKey = `${String(row?.key || 'group')}_${rowIndex}`;
        const group = deliveredByGroupKey.get(rowKey);
        if (!group) return row;
        const rowPieces = Array.isArray(row?.pieces) ? row.pieces : [];
        const deliveredByPieceKey = new Map<string, number>();
        (group.deliveryRows || []).forEach((deliveryRow: StartMaterialDeliveryRow) => {
          const pieceKey = String(deliveryRow?.pieceKey || '');
          if (!pieceKey) return;
          const current = deliveredByPieceKey.get(pieceKey) || 0;
          deliveredByPieceKey.set(pieceKey, current + calcDeliveredQty(deliveryRow));
        });
        const nextPieces = rowPieces.map((piece: any, pieceIndex: number) => {
          const normalizedPieceKey = `${String(piece?.key || 'piece')}_${rowIndex}_${pieceIndex}`;
          const deliveredQty = deliveredByPieceKey.get(normalizedPieceKey);
          if (deliveredQty === undefined) return piece;
          return {
            ...piece,
            delivered_qty: deliveredQty,
          };
        });
        return {
          ...row,
          selected_shelf_id: group.sourceShelfId || row?.selected_shelf_id || null,
          production_shelf_id: group.productionShelfId || row?.production_shelf_id || null,
          delivered_total_qty: group.totalDeliveredQty,
          delivery_rows: group.deliveryRows || [],
          pieces: nextPieces,
        };
      });
      const firstProductionShelfId = moves[0]?.to_shelf_id || null;
      const nowIso = new Date().toISOString();
      await finalizeStatusUpdate({
        status: 'in_progress',
        production_shelf_id: firstProductionShelfId,
        production_moves: moves,
        grid_materials: nextGridMaterials,
        production_started_at: nowIso,
      });
      clearStartDraft();
      msg.success('تولید آغاز شد');
      setProductionModal(null);
    } catch (e: any) {
      msg.error(e.message || 'خطا در شروع تولید');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleConfirmStartGroup = useCallback((groupIndex: number) => {
    const group = startMaterials[groupIndex];
    if (!group) return;
    if (!group.selectedProductId) {
      msg.error('برای این محصول، محصول انتخاب‌شده مشخص نیست.');
      return;
    }
    if (!group.sourceShelfId) {
      msg.error('برای این محصول، قفسه برداشت انتخاب نشده است.');
      return;
    }
    const validSourceShelves = group.selectedProductId ? (sourceShelfOptionsByProduct[group.selectedProductId] || []) : [];
    if (!validSourceShelves.some((option) => option.value === group.sourceShelfId)) {
      msg.error('قفسه برداشت انتخاب‌شده برای این محصول موجودی ندارد.');
      return;
    }
    if (!group.productionShelfId) {
      msg.error('برای این محصول، قفسه تولید انتخاب نشده است.');
      return;
    }
    if (!group.totalDeliveredQty || group.totalDeliveredQty <= 0) {
      msg.error('برای این محصول، مقدار تحویل شده معتبر نیست.');
      return;
    }
    setStartMaterials((prev) => {
      const next = [...prev];
      const current = next[groupIndex];
      if (!current) return prev;
      next[groupIndex] = { ...current, isConfirmed: true, collapsed: true };
      return next;
    });
    msg.success('این محصول ثبت شد.');
  }, [msg, sourceShelfOptionsByProduct, startMaterials]);

  const handleConfirmStopProduction = async () => {
    try {
      const moves = Array.isArray(data?.production_moves) ? data.production_moves : [];
      const currentGridMaterials = Array.isArray(data?.grid_materials) ? data.grid_materials : [];
      const clearedGridMaterials = currentGridMaterials.map((row: any) => {
        const pieces = Array.isArray(row?.pieces) ? row.pieces : [];
        const nextRow = { ...row };
        if (Object.prototype.hasOwnProperty.call(nextRow, 'delivered_total_qty')) {
          delete (nextRow as any).delivered_total_qty;
        }
        if (Object.prototype.hasOwnProperty.call(nextRow, 'delivery_rows')) {
          delete (nextRow as any).delivery_rows;
        }
        return {
          ...nextRow,
          pieces: pieces.map((piece: any) => {
            const nextPiece = { ...piece };
            if (Object.prototype.hasOwnProperty.call(nextPiece, 'delivered_qty')) {
              delete (nextPiece as any).delivered_qty;
            }
            return nextPiece;
          }),
        };
      });
      if (moves.length === 0) {
        msg.warning('حرکتی برای بازگشت موجودی ثبت نشده است');
        const nowIso = new Date().toISOString();
        await finalizeStatusUpdate({
          status: 'pending',
          production_shelf_id: null,
          production_moves: null,
          grid_materials: clearedGridMaterials,
          production_stopped_at: nowIso,
        });
        setProductionModal(null);
        return;
      }
      setStatusLoading(true);
      await rollbackProductionMoves(moves);
      const productIds = Array.from(new Set(moves.map((move: any) => String(move?.product_id || '')).filter(Boolean))) as string[];
      if (productIds.length > 0) {
        await Promise.all(productIds.map((productId) => syncProductStock(productId)));
      }
      const nowIso = new Date().toISOString();
      await finalizeStatusUpdate({
        status: 'pending',
        production_shelf_id: null,
        production_moves: null,
        grid_materials: clearedGridMaterials,
        production_stopped_at: nowIso,
      });
      msg.success('تولید متوقف شد');
      setProductionModal(null);
    } catch (e: any) {
      msg.error(e.message || 'خطا در توقف تولید');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleConfirmCompleteProduction = async () => {
    try {
      if (!outputProductType) {
        msg.error('نوع محصول تولید شده را انتخاب کنید.');
        return;
      }
      if (!outputProductId) {
        msg.error(PRODUCTION_MESSAGES.requireOutputProduct);
        return;
      }
      if (!outputShelfId) {
        msg.error(PRODUCTION_MESSAGES.requireOutputShelf);
        return;
      }
      const normalizedQty = await resolveProductionQuantity();
      if (!normalizedQty || normalizedQty <= 0) {
        msg.error(PRODUCTION_MESSAGES.requireQuantity);
        return;
      }
      const moves = Array.isArray(data?.production_moves) ? data.production_moves : [];
      const productionShelfId = data?.production_shelf_id;
      const finalStageMoves = await buildFinalStageConsumptionMoves();
      const fallbackMoves = moves.length
        ? moves
        : (productionShelfId ? buildConsumptionMoves(data, normalizedQty, String(productionShelfId)) : []);
      const consumptionMoves = finalStageMoves.length ? finalStageMoves : fallbackMoves;
      if (!consumptionMoves.length) {
        msg.error(PRODUCTION_MESSAGES.requireProductionShelf);
        return;
      }
      setStatusLoading(true);
      if (consumptionMoves.length) {
        await consumeProductionMaterials(consumptionMoves, productionShelfId || undefined);
      }
      const consumedGrouped = new Map<string, number>();
      consumptionMoves.forEach((move: any) => {
        const shelfId = String(move?.to_shelf_id || productionShelfId || '');
        const productId = String(move?.product_id || '');
        const qty = parseFloat(move?.quantity) || 0;
        if (!productId || !shelfId || qty <= 0) return;
        const key = `${productId}:${shelfId}`;
        consumedGrouped.set(key, (consumedGrouped.get(key) || 0) + qty);
      });
      const consumedProductIds = Array.from(
        new Set(consumptionMoves.map((move: any) => String(move?.product_id || '')).filter(Boolean))
      ) as string[];
      if (consumedProductIds.length > 0) {
        await Promise.all(consumedProductIds.map((productId) => syncProductStock(productId)));
      }
      try {
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        const consumptionTransferPayload = Array.from(consumedGrouped.entries()).map(([key, qty]) => {
          const [productId, fromShelfId] = key.split(':');
          return {
            transfer_type: 'production',
            product_id: productId,
            delivered_qty: qty,
            required_qty: qty,
            invoice_id: null,
            production_order_id: id || null,
            from_shelf_id: fromShelfId || null,
            to_shelf_id: null,
            sender_id: userId,
            receiver_id: userId,
          };
        });
        if (consumptionTransferPayload.length > 0) {
          await supabase.from('stock_transfers').insert(consumptionTransferPayload);
        }
      } catch (consumptionLogErr) {
        console.warn('Could not log production material consumption transfers', consumptionLogErr);
      }
      await addFinishedGoods(outputProductId, outputShelfId, normalizedQty);
      await syncProductStock(outputProductId);
      try {
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        await supabase.from('stock_transfers').insert({
          transfer_type: 'production',
          product_id: outputProductId,
          delivered_qty: normalizedQty,
          required_qty: normalizedQty,
          invoice_id: null,
          production_order_id: id || null,
          from_shelf_id: null,
          to_shelf_id: outputShelfId,
          sender_id: userId,
          receiver_id: userId,
        });
      } catch (transferLogErr) {
        console.warn('Could not log finished goods transfer', transferLogErr);
      }
      const nowIso = new Date().toISOString();
      await finalizeStatusUpdate({
        status: 'completed',
        production_output_product_id: outputProductId,
        production_output_shelf_id: outputShelfId,
        production_output_qty: normalizedQty,
        production_completed_at: nowIso,
      });
      msg.success('تولید تکمیل شد');
      setProductionModal(null);
    } catch (e: any) {
      msg.error(e.message || 'خطا در تکمیل تولید');
    } finally {
      setStatusLoading(false);
    }
  };

  const buildNewProductInitialValues = () => {
    return {
      name: data?.name || '',
      product_type: outputProductType || 'goods',
      category: data?.product_category || null,
      product_category: null,
      auto_name_enabled: true,
    } as any;
  };

  const handleCreateProductSave = async (values: any, meta?: { selectedTags?: any[] }) => {
    try {
      setStatusLoading(true);
      const payload = { ...values };
      if (supportsSystemCode('products') && !payload.system_code) {
        payload.system_code = await buildClientFallbackSystemCode(supabase, 'products', 'products');
      }
      const { data: inserted, error } = await supabase
        .from('products')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      const productId = inserted?.id;
      if (!productId) throw new Error('ثبت محصول ناموفق بود');
      if (Array.isArray(meta?.selectedTags) && meta.selectedTags.length > 0) {
        await syncRecordTags(supabase, 'products', String(productId), meta.selectedTags);
      }
      setOutputProductId(productId);
      const outputShelf = outputShelfId || null;
      if (!outputShelf) {
        msg.error(PRODUCTION_MESSAGES.requireOutputShelf);
        return;
      }
      setOutputShelfId(outputShelf);

      const normalizedQty = await resolveProductionQuantity();
      if (!normalizedQty || normalizedQty <= 0) {
        msg.error(PRODUCTION_MESSAGES.requireQuantity);
        return;
      }
      const moves = Array.isArray(data?.production_moves) ? data.production_moves : [];
      const productionShelfId = data?.production_shelf_id;
      const finalStageMoves = await buildFinalStageConsumptionMoves();
      const fallbackMoves = moves.length
        ? moves
        : (productionShelfId ? buildConsumptionMoves(data, normalizedQty, String(productionShelfId)) : []);
      const consumptionMoves = finalStageMoves.length ? finalStageMoves : fallbackMoves;
      if (!consumptionMoves.length) {
        msg.error(PRODUCTION_MESSAGES.requireProductionShelf);
        return;
      }
      if (consumptionMoves.length) {
        await consumeProductionMaterials(consumptionMoves, productionShelfId || undefined);
      }
      const consumedGrouped = new Map<string, number>();
      consumptionMoves.forEach((move: any) => {
        const shelfId = String(move?.to_shelf_id || productionShelfId || '');
        const productId = String(move?.product_id || '');
        const qty = parseFloat(move?.quantity) || 0;
        if (!productId || !shelfId || qty <= 0) return;
        const key = `${productId}:${shelfId}`;
        consumedGrouped.set(key, (consumedGrouped.get(key) || 0) + qty);
      });
      const consumedProductIds = Array.from(
        new Set(consumptionMoves.map((move: any) => String(move?.product_id || '')).filter(Boolean))
      ) as string[];
      if (consumedProductIds.length > 0) {
        await Promise.all(consumedProductIds.map((productId) => syncProductStock(productId)));
      }
      try {
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        const consumptionTransferPayload = Array.from(consumedGrouped.entries()).map(([key, qty]) => {
          const [productId, fromShelfId] = key.split(':');
          return {
            transfer_type: 'production',
            product_id: productId,
            delivered_qty: qty,
            required_qty: qty,
            invoice_id: null,
            production_order_id: id || null,
            from_shelf_id: fromShelfId || null,
            to_shelf_id: null,
            sender_id: userId,
            receiver_id: userId,
          };
        });
        if (consumptionTransferPayload.length > 0) {
          await supabase.from('stock_transfers').insert(consumptionTransferPayload);
        }
      } catch (consumptionLogErr) {
        console.warn('Could not log production material consumption transfers for new product', consumptionLogErr);
      }
      await addFinishedGoods(productId, outputShelf, normalizedQty);
      await syncProductStock(productId);
      try {
        const authUser = await getCachedAuthUser(supabase);
        const userId = authUser?.id || null;
        await supabase.from('stock_transfers').insert({
          transfer_type: 'production',
          product_id: productId,
          delivered_qty: normalizedQty,
          required_qty: normalizedQty,
          invoice_id: null,
          production_order_id: id || null,
          from_shelf_id: null,
          to_shelf_id: outputShelf,
          sender_id: userId,
          receiver_id: userId,
        });
      } catch (transferLogErr) {
        console.warn('Could not log finished goods transfer for new product', transferLogErr);
      }
      const nowIso = new Date().toISOString();
      await finalizeStatusUpdate({
        status: 'completed',
        production_output_product_id: productId,
        production_output_shelf_id: outputShelf,
        production_output_qty: normalizedQty,
        production_completed_at: nowIso,
      });

      msg.success('محصول جدید ایجاد شد و سفارش تکمیل شد');
      setIsCreateProductOpen(false);
    } catch (e: any) {
      msg.error(e.message || 'خطا در ایجاد محصول');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleCreateCustomerFromLeadSave = useCallback(async (values: any) => {
    try {
      if (!id || moduleId !== 'marketing_leads') return;
      const authUser = await getCachedAuthUser(supabase);
      const authUserId = authUser?.id || null;
      const customerPayload = {
        ...values,
        assignee_id: values?.assignee_id ?? data?.assignee_id ?? null,
        assignee_type: values?.assignee_type ?? data?.assignee_type ?? null,
        assignee_role_id: values?.assignee_role_id ?? data?.assignee_role_id ?? null,
        created_by: values?.created_by ?? authUserId ?? undefined,
        updated_by: values?.updated_by ?? authUserId ?? undefined,
      };

      const { data: insertedCustomer, error: insertError } = await supabase
        .from('customers')
        .insert(customerPayload)
        .select('id')
        .single();
      if (insertError) throw insertError;

      const customerId = insertedCustomer?.id;
      if (!customerId) throw new Error('ایجاد مشتری ناموفق بود.');

      const { error: leadUpdateError } = await supabase
        .from('marketing_leads')
        .update({
          customer_id: customerId,
          lead_type: 'existing_customer',
          updated_by: authUserId ?? undefined,
        })
        .eq('id', id);
      if (leadUpdateError) throw leadUpdateError;

      msg.success('مشتری از روی لید ایجاد شد.');
      setIsCreateCustomerFromLeadOpen(false);
      void fetchRecord(true);
    } catch (err: any) {
      msg.error(toFaErrorMessage(err));
      throw err;
    }
  }, [data, fetchRecord, id, moduleId, msg]);

  const handleRecordPatch = useCallback((patch: Record<string, any>) => {
    setData((prev: any) => ({ ...(prev || {}), ...patch }));
  }, []);
  const extraBlockContent = useMemo<Record<string, React.ReactNode>>(() => {
    const content: Record<string, React.ReactNode> = {};
    if (moduleId === 'customers' && id) {
      content.financial_stats = <CustomerFinancialOverviewPanel customerId={id} customerData={data} />;
    }
    return content;
  }, [data, id, moduleId]);

  if (accessDenied) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        دسترسی مشاهده برای این رکورد ندارید.
      </div>
    );
  }
  if (!moduleConfig || (!data && loading)) {
    return <ModuleShowSkeleton />;
  }
  if (!data) return null;

  const renderSmartField = (field: any, isHeader = false) => {
    if (!canViewField(field.key)) return null;
    const isEditing = editingFields[field.key];
    const value = data[field.key];
    const isProcessDraftField = (
      field.key === 'execution_process_draft' ||
      field.key === 'marketing_process_draft' ||
      field.key === 'template_stages_preview' ||
      field.key === 'run_stages_preview'
    );
    const isSuperLongTextField = field.type === FieldType.SUPER_LONG_TEXT;
    const compactMode = (field.type === FieldType.PROGRESS_STAGES || isProcessDraftField) ? false : true;

    if (field.type === FieldType.PROGRESS_STAGES || isProcessDraftField) {
      let options = field.options;
      if (moduleId === 'process_templates' && field.key === 'module_id') options = getProjectModuleOptions();
      else if ((field as any).dynamicOptionsCategory) options = dynamicOptions[(field as any).dynamicOptionsCategory];
      else if (field.type === FieldType.RELATION) options = relationOptions[field.key];

      return (
        <div className="w-full">
          <SmartFieldRenderer
            field={field}
            value={value}
            onChange={(nextValue) => {
              if (!isProcessDraftField || !id || !canEditModule) return;
              if (field.key === 'template_stages_preview' || field.key === 'run_stages_preview') return;
              const patch = { [field.key]: nextValue } as Record<string, any>;
              setData((prev: any) => ({ ...(prev || {}), ...patch }));
              void supabase
                .from(moduleId)
                .update(patch)
                .eq('id', id)
                .then(({ error }) => {
                  if (error) {
                    msg.error('ذخیره مراحل فرآیند ناموفق بود');
                  }
                });
            }}
            forceEditMode={canEditModule}
            compactMode={false}
            options={options}
            recordId={id}
            moduleId={moduleId}
            allValues={data}
          />
        </div>
      );
    }
    let baseValue = value ?? undefined;

    if (field.type === FieldType.MULTI_SELECT && typeof baseValue === 'string') {
      try {
        baseValue = JSON.parse(baseValue);
      } catch {
        baseValue = baseValue ? [baseValue] : [];
      }
    }

    const tempValue = tempValues[field.key] !== undefined ? tempValues[field.key] : baseValue;
    let options = field.options;
    if (moduleId === 'process_templates' && field.key === 'module_id') options = getProjectModuleOptions();
    else if ((field as any).dynamicOptionsCategory) options = dynamicOptions[(field as any).dynamicOptionsCategory];
    else if (field.type === FieldType.RELATION) options = relationOptions[field.key];

    if (isEditing) {
      return (
        <div className={`flex gap-1 min-w-[150px] w-full ${isSuperLongTextField ? 'items-start' : 'items-center'}`}>
          <div className="flex-1">
            <SmartFieldRenderer
              field={field}
              value={tempValue}
              onChange={(val) => {
                setTempValues(prev => ({ ...prev, [field.key]: val }));
                const shouldHandleBom =
                  (field.key === 'related_bom' && val && val !== data?.related_bom) ||
                  (moduleId === 'production_orders' && field.key === 'bom_id' && val && val !== data?.bom_id);
                const shouldHandleProcessTemplate =
                  !!processDraftFieldKey &&
                  field.key === 'process_template_id' &&
                  val &&
                  val !== data?.process_template_id;
                if (shouldHandleBom) {
                  setTimeout(() => handleRelatedBomChange(val), 100);
                }
                if (shouldHandleProcessTemplate) {
                  setTimeout(() => handleProcessTemplateChange(val), 100);
                }
              }}
              forceEditMode={true}
              compactMode={compactMode}
              options={options}
              onOptionsUpdate={fetchOptions}
              recordId={id}
              moduleId={moduleId}
              allValues={data}
            />
          </div>
          <Button
            size="small"
            type="text"
            icon={<CheckOutlined />}
            onClick={() => saveEdit(field.key)}
            className="!h-8 !w-8 !min-w-8 rounded-full border border-gray-200 text-gray-500 hover:!border-emerald-200 hover:!text-emerald-600"
          />
          <Button
            size="small"
            type="text"
            icon={<CloseOutlined />}
            onClick={() => cancelEdit(field.key)}
            className="!h-8 !w-8 !min-w-8 rounded-full border border-gray-200 text-gray-500 hover:!border-rose-200 hover:!text-rose-600"
          />
        </div>
      );
    }

    const displayNode = (
      <SmartFieldRenderer
        field={field}
        value={baseValue}
        onChange={() => undefined}
        forceEditMode={false}
        compactMode={compactMode}
        options={options}
        recordId={id}
        moduleId={moduleId}
        allValues={data}
      />
    );

    if (isHeader) {
      return (
        <div className="group flex items-center gap-2 cursor-pointer" onClick={() => !field.readonly && canEditModule && startEdit(field.key, value)}>
          {displayNode}
          {!field.readonly && canEditModule && <EditOutlined className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-xs" />}
        </div>
      );
    }

    return (
      <div
        className={`group flex justify-between min-h-[32px] hover:bg-gray-50 dark:hover:bg-white/5 px-3 rounded-lg -mx-3 transition-colors cursor-pointer border border-transparent hover:border-gray-100 dark:hover:border-gray-700 ${isSuperLongTextField ? 'items-start py-2' : 'items-center'}`}
        onClick={() => !field.readonly && canEditModule && startEdit(field.key, value)}
      >
        <div className="text-gray-800 dark:text-gray-200 flex-1 min-w-0">{displayNode}</div>
        {!field.readonly && canEditModule && <EditOutlined className="text-leather-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>
    );
  };

  const canUseAction = (actionId: string) => canViewField(`__action_${actionId}`);

  const fieldGroups = moduleConfig.blocks?.filter(
    (b) => b.type === BlockType.FIELD_GROUP && checkVisibility(b) && canViewField(String(b.id))
  );
  const headerActions = (moduleConfig.actionButtons || [])
    .filter((b: any) => b.placement === 'header')
    .filter((b: any) => canUseAction(b.id))
    .map((b: any) => ({
      id: b.id,
      label: b.label,
      variant: b.variant,
      onClick: () => handleHeaderAction(b.id)
    }));
  if (canEditModule) {
    headerActions.push({
      id: 'create_process',
      label: 'ایجاد فرآیند',
      variant: 'primary',
      onClick: () => handleHeaderAction('create_process')
    });
  }
  if (['products', 'invoices', 'purchase_invoices', 'tasks'].includes(String(moduleId)) && canEditModule) {
    headerActions.push({
      id: 'create_project',
      label: 'ایجاد پروژه',
      variant: 'default',
      onClick: () => handleHeaderAction('create_project')
    });
  }
  if (moduleId === 'marketing_leads' && canEditModule && data?.lead_type === 'new_lead' && !data?.customer_id) {
    headerActions.push({
      id: 'create_customer_from_lead',
      label: 'ایجاد مشتری',
      variant: 'primary',
      onClick: () => handleHeaderAction('create_customer_from_lead')
    });
  }
  if (moduleId === 'products' && canUseAction('quick_stock_movement')) {
    headerActions.push({
      id: 'quick_stock_movement',
      label: 'افزودن حواله',
      variant: 'default',
      onClick: () => handleHeaderAction('quick_stock_movement')
    });
  }
  if (moduleId === 'shelves' && canUseAction('quick_stock_movement')) {
    headerActions.push({
      id: 'quick_stock_movement',
      label: 'افزودن حواله',
      variant: 'default',
      onClick: () => handleHeaderAction('quick_stock_movement')
    });
  }
  if ((moduleId === 'invoices' || moduleId === 'purchase_invoices') && canIssueAccountingEntry) {
    headerActions.push({
      id: 'issue_accounting_entry',
      label: issueAccountingLoading ? 'در حال صدور...' : 'صدور سند',
      variant: 'primary',
      onClick: handleIssueAccountingEntry,
    });
  }
  if (moduleId === 'production_orders') {
    if (data?.status === 'in_progress') {
      if (canUseAction('stop_production')) {
        headerActions.push({
          id: 'stop_production',
          label: 'توقف تولید',
          variant: 'default',
          onClick: () => handleProductionStatusChange('pending')
        });
      }
      if (canUseAction('complete_production')) {
        headerActions.push({
          id: 'complete_production',
          label: 'تکمیل تولید',
          variant: 'primary',
          onClick: () => handleProductionStatusChange('completed')
        });
      }
    } else if (data?.status === 'pending') {
      if (canUseAction('start_production')) {
        headerActions.push({
          id: 'start_production',
          label: 'شروع تولید',
          variant: 'primary',
          onClick: () => handleProductionStatusChange('in_progress')
        });
      }
    }
  }

  const currentAssigneeId = getResolvedAssigneeId(data);
  const currentAssigneeType = String(data?.assignee_type || (data?.assignee_role_id ? 'role' : 'user'));
  let assigneeIcon = <UserOutlined />;
  if (currentAssigneeId) {
      if (currentAssigneeType === 'user') {
          const u = allUsers.find(u => u.id === currentAssigneeId);
          if (u) { assigneeIcon = u.avatar_url ? <Avatar src={u.avatar_url} size="small" /> : <Avatar icon={<UserOutlined />} size="small" />; }
      } else {
          const r = allRoles.find(r => r.id === currentAssigneeId);
          if (r) { assigneeIcon = <Avatar icon={<TeamOutlined />} size="small" className="bg-blue-100 text-blue-600" />; }
      }
  }
  const resolvedRecordTitle = getRecordTitle(data, moduleConfig, { fallback: '' });
  const handleHeaderRefresh = async () => {
    await fetchRecord(true);
  };

  return (
    <div className="p-4 pt-1 md:p-6 md:pt-1 max-w-[1600px] mx-auto pb-20 transition-all overflow-hidden pl-0 md:pl-16 scrollbar-wide">
      <div className="mb-4 md:mb-0">
        <RelatedSidebar
          moduleConfig={moduleConfig}
          recordId={id!}
          recordName={resolvedRecordTitle}
          mentionUsers={allUsers}
          mentionRoles={allRoles}
        />
      </div>

      <HeaderActions
        moduleTitle={moduleConfig.titles.fa}
        recordName={resolvedRecordTitle}
        shareUrl={printManager.printQrValue}
        onBack={() => navigate(`/${moduleId}`)}
        onHome={() => navigate('/')}
        onModule={() => navigate(`/${moduleId}`)}
        onPrint={() => printManager.setIsPrintModalOpen(true)}
        onRefresh={handleHeaderRefresh}
        onCopy={canEditModule ? handleCopyRecord : undefined}
        refreshLoading={loading}
        onEdit={() => setIsEditDrawerOpen(true)}
        onDelete={handleDelete}
        canEdit={canEditModule}
        canDelete={canDeleteModule}
        extraActions={headerActions}
      />

      <HeroSection
        data={{ ...data, id }}
        recordTitle={resolvedRecordTitle}
        moduleId={moduleId}
        moduleConfig={moduleConfig}
        currentTags={currentTags}
        onTagsChange={() => void fetchRecord(true)}
        renderSmartField={renderSmartField}
        getOptionLabel={getOptionLabel}
        getUserName={getUserName}
        handleAssigneeChange={handleAssigneeChange}
        getAssigneeOptions={getAssigneeOptions}
        assigneeIcon={assigneeIcon}
        canManageAssignee={supportsAssignee}
        onImageUpdate={handleImageUpdate}
        onMainImageChange={handleMainImageChange}
        canViewField={canViewField}
        canEditModule={canEditModule}
        checkVisibility={checkVisibility}
      />

      <FieldGroupsTabs
        fieldGroups={fieldGroups}
        moduleConfig={moduleConfig}
        data={data}
        moduleId={moduleId}
        recordId={id!}
        relationOptions={relationOptions}
        dynamicOptions={dynamicOptions}
        renderSmartField={renderSmartField}
        checkVisibility={checkVisibility}
        canViewField={canViewField}
        canEditModule={canEditModule}
        onDataUpdate={handleRecordPatch}
        stockMovementQuickAddSignal={stockMovementQuickAddSignal}
        extraBlockContent={extraBlockContent}
      />

      <TablesSection
        module={moduleConfig}
        data={data}
        relationOptions={relationOptions}
        dynamicOptions={dynamicOptions}
        checkVisibility={checkVisibility}
        canViewField={canViewField}
        canEditModule={canEditModule}
        onDataUpdate={handleRecordPatch}
      />

      {moduleId === 'chart_of_accounts' && id ? (
        <AccountLedgerPanel
          accountId={id}
          accountCode={data?.code ?? null}
          accountName={data?.name ?? null}
        />
      ) : null}

      {isEditDrawerOpen && (
        <SmartForm
          module={moduleConfig}
          visible={isEditDrawerOpen}
          recordId={id}
          initialValues={data || {}}
          onSave={handleSmartFormSave}
          onCancel={() => {
            setIsEditDrawerOpen(false);
          }}
        />
      )}

      {isCreateOrderOpen && MODULES['production_orders'] && (
        <SmartForm
          module={MODULES['production_orders']}
          visible={isCreateOrderOpen}
          title="ایجاد سفارش تولید"
          initialValues={{
            bom_id: id,
            name: data?.name || '',
            product_category: data?.product_category || null,
            grid_materials: data?.grid_materials || [],
            production_stages_draft: data?.production_stages_draft || [],
            __skipBomConfirm: true,
          }}
          onCancel={() => setIsCreateOrderOpen(false)}
          onSave={handleCreateOrderFromBom}
        />
      )}

      {isCreateCustomerFromLeadOpen && MODULES['customers'] && (
        <SmartForm
          module={MODULES['customers']}
          visible={isCreateCustomerFromLeadOpen}
          title="ایجاد مشتری از روی لید"
          initialValues={buildCustomerInitialValuesFromLead()}
          onCancel={() => setIsCreateCustomerFromLeadOpen(false)}
          onSave={handleCreateCustomerFromLeadSave}
        />
      )}

      <Modal
        title="ایجاد سریع پروژه"
        open={isQuickProjectModalOpen}
        onCancel={() => {
          setIsQuickProjectModalOpen(false);
          quickProjectForm.resetFields();
        }}
        footer={null}
        destroyOnHidden
      >
        <Form form={quickProjectForm} layout="vertical" onFinish={handleQuickProjectCreate} className="pt-2">
          <Form.Item
            name="name"
            label="نام پروژه"
            rules={[{ required: true, message: 'نام پروژه الزامی است' }]}
          >
            <Input placeholder='مثال: پروژه "فاکتور فروش ۱۲۳"' />
          </Form.Item>

          <Form.Item name="customer_id" label="مشتری مرتبط">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={quickProjectCustomerOptions}
              placeholder="انتخاب مشتری"
              getPopupContainer={(node) => node?.parentElement || document.body}
            />
          </Form.Item>

          <Form.Item name="process_template_id" label="الگوی فرآیند پروژه">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={quickProjectTemplateOptions}
              placeholder="انتخاب الگو (اختیاری)"
              getPopupContainer={(node) => node?.parentElement || document.body}
            />
          </Form.Item>

          {(moduleId === 'invoices' || moduleId === 'purchase_invoices') && (
            <div className="rounded-xl border border-leather-200 bg-leather-50 px-3 py-2 text-xs text-leather-700">
              {moduleId === 'invoices'
                ? 'این پروژه به‌صورت خودکار به فاکتور فروش جاری هم لینک می‌شود.'
                : 'این پروژه به‌صورت خودکار به فاکتور خرید جاری هم لینک می‌شود.'}
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2 border-t pt-4">
            <Button onClick={() => { setIsQuickProjectModalOpen(false); quickProjectForm.resetFields(); }}>
              انصراف
            </Button>
            <Button type="primary" htmlType="submit" loading={quickProjectLoading} className="bg-leather-600 hover:!bg-leather-500 border-none">
              ایجاد پروژه
            </Button>
          </div>
        </Form>
      </Modal>

      {moduleId === 'production_orders' && (
        <>
          <StartProductionModal
            open={productionModal === 'start'}
            loading={statusLoading}
            materials={startMaterials}
            orderName={String(data?.name || '')}
            sourceShelfOptionsByProduct={sourceShelfOptionsByProduct}
            productionShelfOptions={productionShelfOptions}
            onCancel={() => setProductionModal(null)}
            onStart={handleConfirmStartProduction}
            onToggleGroup={setStartMaterialCollapsed}
            onDeliveryRowAdd={addStartDeliveryRow}
            onDeliveryRowsDelete={deleteStartDeliveryRows}
            onDeliveryRowsTransfer={transferStartDeliveryRows}
            onDeliveryRowFieldChange={updateStartDeliveryRowField}
            onSourceShelfChange={setStartMaterialSourceShelf}
            onSourceShelfScan={handleSourceShelfScan}
            onProductionShelfChange={setStartMaterialProductionShelf}
            onConfirmGroup={handleConfirmStartGroup}
          />

          <Modal
            title={PRODUCTION_MESSAGES.stopTitle}
            open={productionModal === 'stop'}
            onOk={handleConfirmStopProduction}
            onCancel={() => setProductionModal(null)}
            okText="توقف تولید"
            cancelText="انصراف"
            confirmLoading={statusLoading}
            destroyOnHidden
          >
            <div className="text-sm text-gray-600 whitespace-pre-line">
              {PRODUCTION_MESSAGES.stopNotice}
            </div>
          </Modal>

          <Modal
            title={PRODUCTION_MESSAGES.completeTitle}
            open={productionModal === 'complete'}
            onOk={outputMode === 'existing' ? handleConfirmCompleteProduction : undefined}
            onCancel={() => setProductionModal(null)}
            okText={outputMode === 'existing' ? 'ثبت تکمیل' : undefined}
            cancelText="انصراف"
            confirmLoading={statusLoading}
            destroyOnHidden
            footer={outputMode === 'existing' ? undefined : null}
          >
            <div className="space-y-4">
              <div className="text-sm text-gray-700 whitespace-pre-line">
                تعداد "{toPersianNumber(getOrderQuantity(productionQuantityPreview))}" عدد از محصول بر اساس شناسنامه تولید "{getFieldValueLabel('bom_id', data?.bom_id) || '-'}" تولید شد.
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                <div className="text-xs text-gray-500">قفسه نگهداری محصول تولید شده:</div>
                <div className="flex items-center gap-2">
                  <Select
                    placeholder="انتخاب قفسه مقصد"
                    value={outputShelfId}
                    onChange={(val) => setOutputShelfId(val)}
                    options={outputShelfOptions}
                    showSearch
                    optionFilterProp="label"
                    className="w-full"
                    getPopupContainer={(node) => node?.parentElement || document.body}
                  />
                  <QrScanPopover
                    label=""
                    buttonProps={{ type: 'default', shape: 'circle' }}
                    onScan={({ moduleId: scannedModule, recordId: scannedRecordId }) => {
                      if (scannedModule === 'shelves' && scannedRecordId) {
                        setOutputShelfId(scannedRecordId);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                <div className="text-xs text-gray-500">نوع محصول تولید شده:</div>
                <Select
                  placeholder="انتخاب نوع محصول"
                  value={outputProductType}
                  onChange={(val) => {
                    setOutputProductType(val);
                    setOutputProductId(null);
                  }}
                  options={[
                    { label: 'کالا', value: 'goods' },
                  ]}
                  className="w-full"
                  getPopupContainer={(node) => node?.parentElement || document.body}
                />
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
                <div className="text-xs text-gray-500">روش ثبت محصول خروجی:</div>
                <div className="flex items-center gap-2">
                  <Button
                    type={outputMode === 'existing' ? 'primary' : 'default'}
                    onClick={() => setOutputMode('existing')}
                  >
                    افزودن به محصول فعلی
                  </Button>
                  <Button
                    type={outputMode === 'new' ? 'primary' : 'default'}
                    onClick={() => setOutputMode('new')}
                  >
                    تعریف محصول جدید
                  </Button>
                </div>

                {outputMode === 'existing' && (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500">به موجودی یکی از محصولات فعلی اضافه کنید:</div>
                    <div className="flex items-center gap-2">
                      <Select
                        placeholder="انتخاب محصول"
                        value={outputProductId}
                        onChange={(val) => setOutputProductId(val)}
                        options={filteredOutputProductOptions}
                        showSearch
                        optionFilterProp="label"
                        className="w-full"
                        getPopupContainer={(node) => node?.parentElement || document.body}
                      />
                      <QrScanPopover
                        label=""
                        buttonProps={{ type: 'default', shape: 'circle' }}
                        onScan={({ moduleId: scannedModule, recordId: scannedRecordId }) => {
                          if (scannedModule === 'products' && scannedRecordId) {
                            const match = filteredOutputProductOptions.find((item) => item.value === scannedRecordId);
                            if (!match) {
                              msg.error('این محصول با نوع انتخاب‌شده همخوانی ندارد.');
                              return;
                            }
                            setOutputProductId(scannedRecordId);
                          }
                        }}
                      />
                    </div>
                  </div>
                )}

                {outputMode === 'new' && (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 flex items-center justify-between">
                    <div className="text-xs text-gray-500">محصول جدید بسازید:</div>
                    <Button
                      onClick={() => {
                        if (!outputShelfId) {
                          msg.error(PRODUCTION_MESSAGES.requireOutputShelf);
                          return;
                        }
                        if (!outputProductType) {
                          msg.error('نوع محصول تولید شده را انتخاب کنید.');
                          return;
                        }
                        setProductionModal(null);
                        setIsCreateProductOpen(true);
                      }}
                      type="dashed"
                    >
                      تعریف محصول جدید
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Modal>

          {isCreateProductOpen && MODULES['products'] && (
            <SmartForm
              module={MODULES['products']}
              visible={isCreateProductOpen}
              title="ایجاد محصول جدید از سفارش تولید"
              initialValues={buildNewProductInitialValues()}
              onCancel={() => setIsCreateProductOpen(false)}
              onSave={handleCreateProductSave}
            />
          )}
        </>
      )}

      <PrintSection
        isPrintModalOpen={printManager.isPrintModalOpen}
        onClose={() => printManager.setIsPrintModalOpen(false)}
        onPrint={printManager.handlePrint}
        printTemplates={printManager.printTemplates}
        selectedTemplateId={printManager.selectedTemplateId}
        onSelectTemplate={printManager.setSelectedTemplateId}
        renderPrintCard={printManager.renderPrintCard}
        printMode={printManager.printMode}
        printableFields={printManager.printableFieldsForTemplate || printableFields}
        selectedPrintFields={printManager.selectedPrintFields}
        onTogglePrintField={printManager.handleTogglePrintField}
        onSavePrintFields={printManager.handleSavePrintFields}
        savingPrintFields={printManager.savingPrintFields}
        onRefreshPreview={printManager.refreshTemplates}
        allowFieldSelectionTab={printManager.allowFieldSelectionTab}
        previewMeta={printManager.previewMeta}
      />

      <style>{`
        .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .custom-erp-table .ant-table-thead > tr > th { background: #f9fafb !important; color: #6b7280 !important; font-size: 12px !important; }
        .dark .custom-erp-table .ant-table-thead > tr > th { background: #262626 !important; color: #bbb; border-bottom: 1px solid #303030 !important; }
        .dark .ant-tabs-tab { color: #888; }
        .dark .ant-tabs-tab-active .ant-tabs-tab-btn { color: white !important; }
        .dark .ant-table-cell { background: #1a1a1a !important; color: #ddd !important; border-bottom: 1px solid #303030 !important; }
        .dark .ant-table-tbody > tr:hover > td { background: #222 !important; }
      `}</style>
      <style>{printStyles}</style>
    </div>
  );
};

export default ModuleShow;




