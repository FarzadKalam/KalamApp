import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { mapAntdSorterToCrudSorting, useTable } from "@refinedev/antd";
import { CrudFilter, CrudFilters, CrudSort, useDeleteMany } from "@refinedev/core";
import { dataProvider as refineSupabaseDataProvider } from "@refinedev/supabase";
import { useNavigate, useParams } from "react-router-dom";
import { MODULES } from "../moduleRegistry";
import SmartTableRenderer from "../components/SmartTableRenderer";
import { BlockType, FieldType, ModuleDefinition, ModuleField, SavedView, ViewMode } from "../types";
import { App, Badge, Button, Dropdown, Empty, Skeleton } from "antd";
import type { MenuProps } from "antd";
import type { FilterValue } from "antd/es/table/interface";
import { AppstoreAddOutlined, EllipsisOutlined, FileExcelOutlined, FilePdfOutlined, MessageOutlined, PlusOutlined, ReloadOutlined, SettingOutlined, TagsOutlined } from "@ant-design/icons";
import ViewManager from "../components/ViewManager";
import SmartForm from "../components/SmartForm";
import { supabase } from "../supabaseClient";
import Toolbar from "../components/moduleList/Toolbar";
import BulkActionsBar from "../components/moduleList/BulkActionsBar";
import ViewWrapper from "../components/moduleList/ViewWrapper";
import GridView from "../components/moduleList/GridView";
import MapView from "../components/moduleList/MapView";
import ModuleCalendarView from "../components/moduleList/CalendarView";
import RenderCardItem from "../components/moduleList/RenderCardItem";
import { canAccessAssignedRecord, fetchCurrentUserRecordAccessContext, GOALS_PERMISSION_KEY, WORKFLOWS_PERMISSION_KEY, type RecordScope } from "../utils/permissions";
import BulkProductsCreateModal from "../components/products/BulkProductsCreateModal";
import WorkflowsManager from "../components/workflows/WorkflowsManager";
import { buildCopyPayload, copyProcessTemplateStagesRelations, copyProductionOrderRelations, detectCopyNameField } from "../utils/recordCopy";
import { attachTaskCompletionIfNeeded } from "../utils/taskCompletion";
import { fetchTaskSourceRecordOptions, getTaskRelationFieldKey, resolveTaskSourceLink } from "../utils/taskMeta";
import ExcelImportWizard from "../components/moduleList/ExcelImportWizard";
import PrintSection from "../components/moduleShow/PrintSection";
import { useListPrintManager } from "../utils/printTemplates/useListPrintManager";
import { buildListPrintableFields, escapeCsvCell, formatListCellValue } from "../utils/listPrintExport";
import { readCurrencyConfig } from "../utils/currency";
import { fetchAssigneeDirectory, fetchDynamicOptionsMap, fetchRecordTagsMap } from "../utils/referenceData";
import { getFieldLabelFa } from "../utils/fieldLabel";
import { toFaErrorMessage } from "../utils/errorMessageFa";
import { getSingleOptionLabel } from "../utils/optionHelpers";
import { getCachedAuthUser } from "../utils/sessionCache";
import { syncRecordTags } from "../utils/recordTags";
import { mergeOptionMaps, readModuleOptionSnapshot, writeModuleOptionSnapshot } from "../utils/moduleOptionSnapshot";
import { buildModuleListOptionPlan, fetchModuleListRelationOptions, getModuleListVisibleFields } from "../utils/moduleListOptions";
import { resolveModuleListBulkEditOpenState } from "../utils/moduleListBulkEdit";
import { isWebFormTargetModule } from "../utils/webForms";
import GoalsManager from "../components/goals/GoalsManager";
import GoalProgressSlider from "../components/goals/GoalProgressSlider";
import { isRecycleBinEnabledModule, moveModuleRecordsToRecycleBin } from "../utils/recycleBin";
import { toPersianNumber } from "../utils/persianNumberFormatter";
import { AI_CONTEXT_EVENT } from "../utils/aiAssistantEvents";
import RelatedRecordPopover from "../components/RelatedRecordPopover";
import { getRecordPhoneCandidates } from "../utils/recordMessaging";
import { formatIranMobileForInput } from "../utils/phoneNumber";
import MessageComposerModal from "../components/MessageComposerModal";

const DEFAULT_LIST_PAGE_SIZE = 20;
const getDefaultGridPageSize = () => 15;
const getGridLoadStep = () => 15;
const getDefaultKanbanPageSize = () => 15;
const getKanbanLoadStep = () => 15;
type ColumnFiltersState = Record<string, FilterValue | null>;
type BulkBuildTarget = "product_bundles" | "price_lists" | null;
type BulkBuildSourceModule = "products" | "billboards";
const EMPTY_ROWS: any[] = [];

const parseColumnRangeFilter = (raw: unknown): { from?: string | number; to?: string | number } => {
  if (raw === undefined || raw === null || raw === "") return {};
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed && typeof parsed === "object") {
      return parsed as { from?: string | number; to?: string | number };
    }
  } catch {
    return {};
  }
  return {};
};

interface PersistedModuleListState {
  viewMode?: ViewMode;
  searchTerm?: string;
  currentView?: SavedView | null;
  visibleColumns?: string[];
  viewFilters?: CrudFilters;
  columnFilters?: ColumnFiltersState;
  sorters?: CrudSort[];
}

const buildModuleListStateKey = (moduleId?: string | null, suffix?: string | null) => {
  const normalizedModuleId = String(moduleId || "").trim();
  const normalizedSuffix = String(suffix || "").trim();
  return normalizedSuffix
    ? `module_list_state:${normalizedModuleId}:${normalizedSuffix}`
    : `module_list_state:${normalizedModuleId}`;
};

const readPersistedModuleListState = (moduleId?: string | null, suffix?: string | null): PersistedModuleListState | null => {
  if (typeof window === "undefined" || !moduleId) return null;
  try {
    const raw = window.localStorage.getItem(buildModuleListStateKey(moduleId, suffix));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedModuleListState;
  } catch {
    return null;
  }
};

const MODULE_LIST_CREATED_AT_DEFAULT_SORT_MODULES = new Set(["automation_execution_reports"]);

const getDefaultSorters = (moduleConfig?: ModuleDefinition | null): CrudSort[] => {
  if (!moduleConfig) return [{ field: "created_at", order: "desc" }];
  const moduleId = String(moduleConfig.id || "");
  const hasCreatedAt = moduleConfig.fields?.some((field) => field.key === "created_at");
  const field = MODULE_LIST_CREATED_AT_DEFAULT_SORT_MODULES.has(moduleId)
    ? (hasCreatedAt ? "created_at" : "id")
    : "updated_at";
  return [{ field, order: "desc" }];
};

const normalizeCrudSorters = (sorters?: CrudSort[] | null): CrudSort[] =>
  (Array.isArray(sorters) ? sorters : [])
    .filter((item) => String(item?.field || "").trim() && (item?.order === "asc" || item?.order === "desc"))
    .map((item) => ({
      field: String(item.field),
      order: item.order,
    }));

const ensureStableCrudSorters = (sorters?: CrudSort[] | null): CrudSort[] => {
  const normalized = normalizeCrudSorters(sorters);
  if (normalized.some((item) => String(item.field) === "id")) {
    return normalized;
  }
  const fallbackOrder = normalized[0]?.order === "asc" ? "asc" : "desc";
  return [...normalized, { field: "id", order: fallbackOrder }];
};

const stripStableIdSorter = (sorters?: CrudSort[] | null): CrudSort[] => {
  const normalized = normalizeCrudSorters(sorters);
  if (normalized.length > 1 && String(normalized[normalized.length - 1]?.field || "") === "id") {
    return normalized.slice(0, -1);
  }
  return normalized;
};

const sanitizeSorters = (
  rawSorters: CrudSort[] | null | undefined,
  moduleConfig?: ModuleDefinition | null
): CrudSort[] => {
  const sorters = normalizeCrudSorters(rawSorters);
  if (!moduleConfig) {
    return sorters.length ? sorters : getDefaultSorters(moduleConfig);
  }

  const sortableFields = new Set<string>([
    ...moduleConfig.fields.map((field) => String(field?.key || "").trim()).filter(Boolean),
    "id",
    "created_at",
    "updated_at",
  ]);

  const sanitized = sorters.filter((sorter) => sortableFields.has(String(sorter.field || "").trim()));
  return sanitized.length > 0 ? sanitized : getDefaultSorters(moduleConfig);
};

const sanitizePersistedSorters = (sorters?: CrudSort[] | null, moduleConfig?: ModuleDefinition | null): CrudSort[] => {
  const normalized = sanitizeSorters(sorters, moduleConfig);
  const moduleDefault = normalizeCrudSorters(getDefaultSorters(moduleConfig));
  return areCrudSortersEqual(normalized, moduleDefault) ? [] : normalized;
};

const resolveCrudSortersWithDefault = (sorters?: CrudSort[] | null, moduleConfig?: ModuleDefinition | null): CrudSort[] => {
  return sanitizeSorters(sorters, moduleConfig);
};

const areCrudSortersEqual = (left?: CrudSort[] | null, right?: CrudSort[] | null) =>
  JSON.stringify(normalizeCrudSorters(left)) === JSON.stringify(normalizeCrudSorters(right));
const toHeaderOnlyModule = (module: ModuleDefinition, hiddenBlockId: string): ModuleDefinition => ({
  ...module,
  blocks: (module.blocks || []).filter((block) => block.id !== hiddenBlockId),
});

const getBulkBuildSourceModule = (moduleId?: string | null): BulkBuildSourceModule | null => {
  if (moduleId === "products" || moduleId === "billboards") {
    return moduleId;
  }
  return null;
};

const getCatalogRecordBuildMeta = (record: any, sourceModule: BulkBuildSourceModule) => {
  const isBillboard = sourceModule === "billboards";
  const unitPrice = (() => {
    if (!isBillboard) {
      return Number(record?.sell_price || 0) || 0;
    }
    const dailyRent = Number(record?.daily_rent || 0) || 0;
    const monthlyRent = Number(record?.monthly_rent || 0) || 0;
    const printCost = Number(record?.print_cost || 0) || 0;
    return dailyRent || monthlyRent || printCost;
  })();

  return {
    product_id: record?.id || null,
    product_name: record?.name || record?.title || record?.id || "-",
    product_type: isBillboard ? "service" : record?.product_type || "goods",
    main_unit: isBillboard ? "روز" : record?.main_unit || "عدد",
    unit_price: unitPrice,
  };
};

const buildPackageItemsFromRecords = (records: any[], sourceModule: BulkBuildSourceModule) =>
  records
    .map((record: any) => {
      const meta = getCatalogRecordBuildMeta(record, sourceModule);
      const quantity = 1;
      return {
        ...meta,
        quantity,
        discount: 0,
        discount_type: "amount",
        total_price: quantity * meta.unit_price,
      };
    })
    .filter((item: any) => item.product_id);

const buildPriceListItemsFromRecords = (records: any[], sourceModule: BulkBuildSourceModule) => {
  const currencyLabel = readCurrencyConfig().label || "";
  return records
    .map((record: any) => {
      const meta = getCatalogRecordBuildMeta(record, sourceModule);
      return {
        product_id: meta.product_id,
        price: meta.unit_price,
        currency_label: currencyLabel,
        unit_name: meta.main_unit || "",
      };
    })
    .filter((item: any) => item.product_id);
};

const ModuleListContentSkeleton: React.FC<{ viewMode: ViewMode }> = ({ viewMode }) => {
  if (viewMode === ViewMode.GRID) {
    return (
      <div className="h-full overflow-y-auto p-1 custom-scrollbar">
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-gray-700 p-3"
            >
              <Skeleton active avatar={{ shape: "square", size: 44 }} paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (viewMode === ViewMode.KANBAN) {
    return (
      <div className="flex gap-4 h-full overflow-x-auto pb-4 px-2">
        {Array.from({ length: 3 }).map((_, colIdx) => (
          <div
            key={colIdx}
            className="min-w-[280px] w-[280px] flex flex-col bg-gray-100/50 dark:bg-white/5 rounded-2xl p-2 border border-gray-200 dark:border-gray-800 h-full"
          >
            <div className="p-2 mb-2">
              <Skeleton.Input active size="small" style={{ width: 120 }} />
            </div>
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 custom-scrollbar pb-2">
              {Array.from({ length: 3 }).map((__, cardIdx) => (
                <div
                  key={cardIdx}
                  className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-gray-700 p-3"
                >
                  <Skeleton active title={{ width: "65%" }} paragraph={{ rows: 2 }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (viewMode === ViewMode.MAP) {
    return (
      <div className="h-full min-h-[420px] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <Skeleton.Image active className="!w-full !h-full" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1a1a1a] rounded-[1.5rem] shadow-sm border border-gray-200 dark:border-gray-800 h-full overflow-hidden p-4">
      <Skeleton active title={{ width: "20%" }} paragraph={{ rows: 10 }} />
    </div>
  );
};

export const ModuleListRefine: React.FC<{
  moduleIdOverride?: string;
  initialViewFiltersOverride?: CrudFilters;
  storageKeySuffix?: string;
}> = ({ moduleIdOverride, initialViewFiltersOverride, storageKeySuffix }) => {
  const { moduleId } = useParams();
  const resolvedModuleId = moduleIdOverride || moduleId;
  const navigate = useNavigate();
  const { modal, message: msg } = App.useApp();
  const showListMessage = useCallback(
    (
      type: "success" | "error" | "warning" | "loading",
      content: string,
      duration?: number,
    ) => {
      const config = {
        content,
        duration: type === "loading" ? duration ?? 0 : duration,
        className: `kalam-list-message kalam-list-message--${type}`,
      };
      if (type === "loading") return msg.loading(config);
      if (type === "warning") return msg.warning(config);
      if (type === "error") return msg.error(config);
      return msg.success(config);
    },
    [msg]
  );
  
  const moduleConfig = resolvedModuleId ? MODULES[resolvedModuleId] : null;
  const dataResource = moduleConfig?.table || resolvedModuleId;
  const searchTargetField = useMemo(() => {
    if (!moduleConfig) return null;
    const keyField = moduleConfig.fields.find(f => f.isKey);
    if (keyField) return keyField.key;
    const priorityKeys = ['name', 'title', 'business_name', 'full_name', 'subject', 'description'];
    const priorityField = moduleConfig.fields.find(f => priorityKeys.includes(f.key));
    if (priorityField) return priorityField.key;
    const textField = moduleConfig.fields.find(f => f.type === FieldType.TEXT);
    if (textField) return textField.key;
    return null;
  }, [moduleConfig]);
  const persistedState = useMemo(
    () => readPersistedModuleListState(resolvedModuleId, storageKeySuffix),
    [resolvedModuleId, storageKeySuffix]
  );
  const cachedOptionSnapshot = useMemo(
    () => readModuleOptionSnapshot(resolvedModuleId),
    [resolvedModuleId]
  );
  const hasCachedModuleOptions = useMemo(
    () =>
      !!cachedOptionSnapshot && (
        Object.keys(cachedOptionSnapshot.dynamicOptions || {}).length > 0 ||
        Object.keys(cachedOptionSnapshot.relationOptions || {}).length > 0 ||
        (cachedOptionSnapshot.allUsers?.length || 0) > 0 ||
        (cachedOptionSnapshot.allRoles?.length || 0) > 0
      ),
    [cachedOptionSnapshot]
  );
  const effectiveInitialViewFilters = useMemo(
    () =>
      Array.isArray(initialViewFiltersOverride) && initialViewFiltersOverride.length > 0
        ? initialViewFiltersOverride
        : (persistedState?.viewFilters || []),
    [initialViewFiltersOverride, persistedState?.viewFilters]
  );
  const defaultSorters = useMemo(
    () => resolveCrudSortersWithDefault(persistedState?.sorters, moduleConfig),
    [moduleConfig, persistedState?.sorters]
  );
  const effectiveInitialFilters = useMemo(
    () => buildMergedFilters(
      effectiveInitialViewFilters,
      persistedState?.searchTerm || "",
      persistedState?.columnFilters || {}
    ),
    [effectiveInitialViewFilters, moduleConfig, persistedState?.columnFilters, persistedState?.searchTerm, searchTargetField]
  );

  // ✅ Use default view mode from module config, fallback to LIST
  const [viewMode, setViewMode] = useState<ViewMode>(persistedState?.viewMode || moduleConfig?.defaultViewMode || ViewMode.LIST);
  const [searchTerm, setSearchTerm] = useState(persistedState?.searchTerm || "");
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectAllPagesLoading, setSelectAllPagesLoading] = useState(false);
  const [selectedRowsMap, setSelectedRowsMap] = useState<Record<string, any>>({});
  const [listVisibleRowKeys, setListVisibleRowKeys] = useState<React.Key[] | null>(null);
  const [currentView, setCurrentView] = useState<SavedView | null>(
    Array.isArray(initialViewFiltersOverride) && initialViewFiltersOverride.length > 0
      ? null
      : (persistedState?.currentView || null)
  );
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [isBulkEditMode, setIsBulkEditMode] = useState(false);
  const [kanbanGroupBy, setKanbanGroupBy] = useState<string>("");
  const [calendarDateField, setCalendarDateField] = useState<string>("");
  const [viewFiltersState, setViewFiltersState] = useState<CrudFilters>(effectiveInitialViewFilters);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(persistedState?.columnFilters || {});
  const [visibleColumns, setVisibleColumns] = useState<string[]>(persistedState?.visibleColumns || []);  // ✅ ستون‌های انتخاب‌شده
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});  // ✅ اضافه شد
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});  // ✅ اضافه شد
  const [optionsReady, setOptionsReady] = useState(false);
  const [tagsMap, setTagsMap] = useState<Record<string, any[]>>({});  // ✅ Map of record id to tags
  const [tagsLoading, setTagsLoading] = useState(false);
  const [gridPageSize, setGridPageSize] = useState<number>(() => getDefaultGridPageSize()); // ✅ Grid pagination
  const [kanbanVisibleCounts, setKanbanVisibleCounts] = useState<Record<string, number>>({});
  const [kanbanDraggingRecordId, setKanbanDraggingRecordId] = useState<string | null>(null);
  const [kanbanDragOverColumn, setKanbanDragOverColumn] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allRoles, setAllRoles] = useState<any[]>([]);
  const [fieldPermissions, setFieldPermissions] = useState<Record<string, boolean>>({});
  const [modulePermissions, setModulePermissions] = useState<{ view?: boolean; edit?: boolean; delete?: boolean; record_scope?: RecordScope }>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRoleId, setCurrentUserRoleId] = useState<string | null>(null);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [allowedRoleIds, setAllowedRoleIds] = useState<string[]>([]);
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>([]);
  const [isBulkProductsModalOpen, setIsBulkProductsModalOpen] = useState(false);
  const [isWorkflowsModalOpen, setIsWorkflowsModalOpen] = useState(false);
  const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false);
  const [isExcelImportModalOpen, setIsExcelImportModalOpen] = useState(false);
  const [isBulkSmsComposerOpen, setIsBulkSmsComposerOpen] = useState(false);
  const [voipCallSyncing, setVoipCallSyncing] = useState(false);
  const [bulkSmsRecipients, setBulkSmsRecipients] = useState<string[]>([]);
  const [bulkSmsSourceRecord, setBulkSmsSourceRecord] = useState<Record<string, any> | null>(null);
  const [canOpenWorkflows, setCanOpenWorkflows] = useState(true);
  const [canOpenGoals, setCanOpenGoals] = useState(true);
  const [canShowGoalCards, setCanShowGoalCards] = useState(true);
  const [listPrintRows, setListPrintRows] = useState<any[]>([]);
  const [bulkBuildTarget, setBulkBuildTarget] = useState<BulkBuildTarget>(null);
  const [previewRecordId, setPreviewRecordId] = useState<string | null>(null);
  const [taskRelationOptionsByField, setTaskRelationOptionsByField] = useState<Record<string, any[]>>({});
  const hasInitializedModuleStateRef = useRef(false);
  const searchSyncInitializedRef = useRef(false);
  const autoSortSyncDoneRef = useRef(false);
  const lastRequestedPageSizeRef = useRef<number | null>(null);
  const lastAppliedFiltersSignatureRef = useRef<string | null>(null);
  const utilitySlotRef = useRef<HTMLDivElement | null>(null);
  const kanbanDragRef = useRef<{ record: any; sourceColumnKey: string; fieldKey: string } | null>(null);
  const [hasListInitialPaintCompleted, setHasListInitialPaintCompleted] = useState(false);
  const [utilitySlotHeight, setUtilitySlotHeight] = useState<number | null>(null);
  const refineProvider = useMemo(() => refineSupabaseDataProvider(supabase), []);

  const { tableProps, tableQueryResult, setFilters, sorters, setSorters, current, setCurrent, pageSize, setPageSize } = useTable({
    resource: dataResource,
    sorters: { initial: ensureStableCrudSorters(defaultSorters) },
    pagination: { pageSize: DEFAULT_LIST_PAGE_SIZE },
    queryOptions: {
      enabled: !!dataResource,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    filters: { initial: effectiveInitialFilters },
    syncWithLocation: false,
  });

  const { mutate: deleteMany } = useDeleteMany();

  const loading = tableQueryResult.isLoading;
  const queryPending = loading || tableQueryResult.isFetching;
  const allData = tableQueryResult.data?.data || EMPTY_ROWS;
  const hasQueryResult = !!tableQueryResult.data || !!tableQueryResult.error;
  const stableSorters = useMemo(
    () => ensureStableCrudSorters(resolveCrudSortersWithDefault(sorters as CrudSort[], moduleConfig)),
    [moduleConfig, sorters]
  );
  const visibleSorters = useMemo(
    () => stripStableIdSorter(stableSorters),
    [stableSorters]
  );
  const selectedRows = useMemo(
    () =>
      selectedRowKeys
        .map((key) => selectedRowsMap[String(key)])
        .filter(Boolean),
    [selectedRowKeys, selectedRowsMap]
  );
  const allSelectedPendingInProductionOrders = useMemo(() => {
    if (resolvedModuleId !== 'production_orders') return false;
    if (!selectedRows.length) return false;
    return selectedRows.every((row: any) => String(row?.status || '') === 'pending');
  }, [resolvedModuleId, selectedRows]);
  const canBulkSendSms = useMemo(
    () => ['customers', 'suppliers', 'employees'].includes(String(resolvedModuleId || '')),
    [resolvedModuleId]
  );
  const showContentSkeleton = queryPending && !hasQueryResult;
  const bulkBuildSourceModule = getBulkBuildSourceModule(resolvedModuleId);
  const totalFilteredRecordCount = useMemo(
    () => {
      const paginationConfig = tableProps?.pagination as { total?: number } | undefined;
      const paginationTotal = Number(paginationConfig?.total || 0);
      return Number(paginationTotal || tableQueryResult.data?.total || 0);
    },
    [tableProps?.pagination, tableQueryResult.data?.total]
  );

  useEffect(() => {
    autoSortSyncDoneRef.current = false;
    lastRequestedPageSizeRef.current = null;
    lastAppliedFiltersSignatureRef.current = null;
  }, [resolvedModuleId, viewMode]);

  useEffect(() => {
    if (!resolvedModuleId) return;
    const isListView = viewMode === ViewMode.LIST;
    const fallbackPageSize = isListView ? DEFAULT_LIST_PAGE_SIZE : getDefaultGridPageSize();
    const desiredPageSize = isListView
      ? DEFAULT_LIST_PAGE_SIZE
      : Math.max(Number(tableQueryResult.data?.total || 0), fallbackPageSize);
    const currentPageSize = Number(pageSize || 0);

    if (isListView && currentPageSize <= 0) return;
    if (!desiredPageSize || currentPageSize === desiredPageSize || lastRequestedPageSizeRef.current === desiredPageSize) return;
    lastRequestedPageSizeRef.current = desiredPageSize;
    if (current !== 1) {
      setCurrent(1);
    }
    setPageSize(desiredPageSize);
  }, [current, pageSize, resolvedModuleId, setCurrent, setPageSize, tableQueryResult.data?.total, viewMode]);

  useEffect(() => {
    if (autoSortSyncDoneRef.current) return;
    autoSortSyncDoneRef.current = true;
    if (areCrudSortersEqual(sorters as CrudSort[], stableSorters)) return;
    setSorters(stableSorters);
  }, [setSorters, sorters, stableSorters]);

  useEffect(() => {
    if (!hasInitializedModuleStateRef.current) {
      hasInitializedModuleStateRef.current = true;
      return;
    }

    const restoredState = readPersistedModuleListState(resolvedModuleId, storageKeySuffix);
    const restoredSorters = resolveCrudSortersWithDefault(restoredState?.sorters, moduleConfig);
    const restoredViewFilters =
      Array.isArray(initialViewFiltersOverride) && initialViewFiltersOverride.length > 0
        ? initialViewFiltersOverride
        : (restoredState?.viewFilters || []);
    setViewMode(restoredState?.viewMode || moduleConfig?.defaultViewMode || ViewMode.LIST);
    setCurrentView(
      Array.isArray(initialViewFiltersOverride) && initialViewFiltersOverride.length > 0
        ? null
        : (restoredState?.currentView || null)
    );
    setSelectedRowKeys([]);
    setSelectedRowsMap({});
    setListVisibleRowKeys(null);
    setVisibleColumns(restoredState?.visibleColumns || []);
    setGridPageSize(getDefaultGridPageSize());
    setKanbanVisibleCounts({});
    setKanbanDraggingRecordId(null);
    setKanbanDragOverColumn(null);
    setKanbanGroupBy("");
    setCalendarDateField("");
    setSearchTerm(restoredState?.searchTerm || "");
    setViewFiltersState(restoredViewFilters);
    setColumnFilters(restoredState?.columnFilters || {});
    setDynamicOptions(cachedOptionSnapshot?.dynamicOptions || {});
    setRelationOptions(cachedOptionSnapshot?.relationOptions || {});
    setAllUsers(cachedOptionSnapshot?.allUsers || []);
    setAllRoles(cachedOptionSnapshot?.allRoles || []);
    setOptionsReady(hasCachedModuleOptions);
    setTagsMap({});
    setTagsLoading(false);
    setEditRecordId(null);
    setIsBulkEditOpen(false);
    setIsBulkEditMode(false);
    setIsBulkProductsModalOpen(false);
    setIsWorkflowsModalOpen(false);
    setIsGoalsModalOpen(false);
    setIsExcelImportModalOpen(false);
    setCanOpenWorkflows(true);
    setCanOpenGoals(true);
    setCanShowGoalCards(true);
    setListPrintRows([]);
    setBulkBuildTarget(null);
    setPreviewRecordId(null);
    setHasListInitialPaintCompleted(false);
    searchSyncInitializedRef.current = false;
    applyCombinedFilters(
      restoredViewFilters,
      restoredState?.searchTerm || "",
      restoredState?.columnFilters || {},
      false,
    );
    setCurrent?.(1);
    setSorters(ensureStableCrudSorters(restoredSorters));
  }, [
    cachedOptionSnapshot,
    hasCachedModuleOptions,
    initialViewFiltersOverride,
    moduleConfig,
    resolvedModuleId,
    setCurrent,
    setSorters,
    storageKeySuffix,
  ]);

  const fetchPermissions = useCallback(async () => {
    if (!resolvedModuleId) return;
    try {
      const context = await fetchCurrentUserRecordAccessContext(supabase);
      if (!context.userId) return;
      setCurrentUserId(context.userId);
      setCurrentUserRoleId(context.roleId);
      setCurrentOrgId(context.orgId);
      setAllowedRoleIds(context.allowedRoleIds);
      setAllowedUserIds(context.allowedUserIds);

      if (!context.roleId) {
        setModulePermissions({});
        setFieldPermissions({});
        setCanOpenWorkflows(true);
        return;
      }

      const permissions = context.permissions || {};
      const modulePerms = permissions?.[resolvedModuleId] || {};
      const workflowPerms = permissions?.[WORKFLOWS_PERMISSION_KEY] || {};
      const goalPerms = permissions?.[GOALS_PERMISSION_KEY] || {};
      setModulePermissions({
        view: modulePerms.view,
        edit: modulePerms.edit,
        delete: modulePerms.delete,
        record_scope: modulePerms.record_scope ?? (modulePerms.view === false ? 'own' : 'all'),
      });
      setFieldPermissions(modulePerms.fields || {});
      setCanOpenWorkflows(
        workflowPerms.view !== false && (workflowPerms?.fields?.module_list_button !== false)
      );
      setCanOpenGoals(
        goalPerms.view !== false && (goalPerms?.fields?.module_list_button !== false)
      );
      setCanShowGoalCards(
        goalPerms.view !== false && (goalPerms?.fields?.module_list_cards !== false)
      );
    } catch (err: any) {
      if (String(err?.name || '') === 'AbortError') {
        return;
      }
      console.warn('Could not fetch permissions:', err);
      setCanOpenWorkflows(true);
      setCanOpenGoals(true);
      setCanShowGoalCards(true);
    }
  }, [resolvedModuleId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const canViewField = useCallback(
    (fieldKey: string) => {
      if (Object.prototype.hasOwnProperty.call(fieldPermissions, fieldKey)) {
        return fieldPermissions[fieldKey] !== false;
      }
      return true;
    },
    [fieldPermissions]
  );

  const listPrintableFields = useMemo(
    () => buildListPrintableFields(moduleConfig, canViewField, visibleColumns, dynamicOptions),
    [canViewField, dynamicOptions, moduleConfig, visibleColumns]
  );
  const handleVisibleDataChange = useCallback((rows: any[]) => {
    const nextKeys = rows.map((row: any) => row?.id).filter(Boolean);
    setListVisibleRowKeys((prev) => {
      if (
        Array.isArray(prev) &&
        prev.length === nextKeys.length &&
        prev.every((key, index) => String(key) === String(nextKeys[index]))
      ) {
        return prev;
      }
      return nextKeys;
    });
  }, []);

  const listPrintManager = useListPrintManager({
    moduleId: resolvedModuleId || '',
    moduleConfig,
    rows: listPrintRows,
    printableFields: listPrintableFields,
    relationOptions,
  });

  const recordScope = modulePermissions.record_scope ?? (modulePermissions.view === false ? 'own' : 'all');
  const canViewModule = modulePermissions.view !== false || recordScope !== 'all';
  const canEditModule = modulePermissions.edit !== false;
  const canDeleteModule = modulePermissions.delete !== false;
  const canOpenModuleSettings = modulePermissions.view !== false && fieldPermissions.__module_settings !== false;
  const isSystemManagedModule = moduleConfig?.systemManaged === true;
  const createDisabled = moduleConfig?.disableCreate === true;
  const detailDisabled = moduleConfig?.disableDetailView === true;
  const useQuickPreviewModal = moduleConfig?.listPreviewMode === "modal" || detailDisabled;
  const canCreateModule = canEditModule && !createDisabled;

  // ✅ Define field keys FIRST (before any useMemo/useEffect that uses them)
  const imageField = moduleConfig?.fields.find(f => f.type === FieldType.IMAGE)?.key;
  const tagsField = moduleConfig?.fields.find(f => f.type === FieldType.TAGS)?.key;
  const tagOnlyBulkEditModule = useMemo<ModuleDefinition | null>(() => {
    if (!moduleConfig) return null;
    if (!isSystemManagedModule || !tagsField) return moduleConfig;
    const tagField = moduleConfig.fields.find((field) => field.type === FieldType.TAGS);
    if (!tagField) return moduleConfig;
    return {
      ...moduleConfig,
      fields: [tagField],
      blocks: [
        {
          id: "system_tags",
          titles: { fa: "برچسب‌ها", en: "Tags" },
          type: BlockType.FIELD_GROUP,
          order: 1,
        },
      ],
    };
  }, [isSystemManagedModule, moduleConfig, tagsField]);
  const statusField = moduleConfig?.fields.find(f => f.type === FieldType.STATUS)?.key;
  const categoryField = resolvedModuleId === 'tasks'
    ? 'related_to_module'
    : moduleConfig?.fields.find(f => f.key === 'category' || f.key === 'product_category' || f.key === 'business_name')?.key;
  const visibleListFieldKeys = useMemo(
    () => getModuleListVisibleFields(moduleConfig, visibleColumns).map((field) => String(field?.key || "").trim()).filter(Boolean),
    [moduleConfig, visibleColumns]
  );
  const shouldLoadTags = useMemo(() => {
    if (!tagsField) return false;
    if (viewMode === ViewMode.LIST) return true;
    return visibleListFieldKeys.includes(String(tagsField));
  }, [tagsField, viewMode, visibleListFieldKeys]);

  // ✅ Merge tags into allData
  const accessibleData = useMemo(() => {
    if (!canViewModule) return [];
    return allData.filter((record: any) =>
      canAccessAssignedRecord(record, currentUserId, currentUserRoleId, recordScope, {
        currentOrgId,
        allowedRoleIds,
        allowedUserIds,
      })
    );
  }, [allData, allowedRoleIds, allowedUserIds, canViewModule, currentOrgId, currentUserId, currentUserRoleId, recordScope]);

  const enrichedData = useMemo(() => {
    if (!tagsField) return accessibleData;
    const tf: string = tagsField;
    return accessibleData.map(record => ({
      ...record,
      [tf]: tagsMap[record.id as string] || []
    }));
  }, [accessibleData, tagsMap, tagsField]);
  const accessibleRecordIds = useMemo(
    () => accessibleData.map((record: any) => String(record?.id || "")).filter(Boolean),
    [accessibleData]
  );
  const accessibleRecordIdsSignature = useMemo(
    () => accessibleRecordIds.join("|"),
    [accessibleRecordIds]
  );
  useEffect(() => {
    if (typeof window === "undefined" || !resolvedModuleId) return;
    const visibleRecordIds = (listVisibleRowKeys || accessibleRecordIds)
      .map((key) => String(key || "").trim())
      .filter(Boolean);
    window.dispatchEvent(new CustomEvent(AI_CONTEXT_EVENT, {
      detail: {
        mode: "list",
        moduleId: resolvedModuleId,
        recordId: null,
        visibleRecordIds,
        selectedRecordIds: selectedRowKeys.map((key) => String(key || "").trim()).filter(Boolean),
        route: `${window.location.pathname}${window.location.search || ""}`,
      },
    }));
  }, [accessibleRecordIds, listVisibleRowKeys, resolvedModuleId, selectedRowKeys]);
  const deferredListDataLoading = viewMode === ViewMode.LIST && !queryPending && (!optionsReady || (shouldLoadTags && tagsLoading));
  const effectiveRelationOptions = useMemo(() => {
    if (resolvedModuleId !== "tasks") return relationOptions;
    const merged: Record<string, any[]> = { ...relationOptions };
    Object.entries(taskRelationOptionsByField).forEach(([fieldKey, options]) => {
      const current = Array.isArray(merged[fieldKey]) ? merged[fieldKey] : [];
      const next = [...current];
      (options || []).forEach((option: any) => {
        if (!next.some((item: any) => String(item?.value || "") === String(option?.value || ""))) {
          next.push(option);
        }
      });
      merged[fieldKey] = next;
    });
    return merged;
  }, [relationOptions, resolvedModuleId, taskRelationOptionsByField]);

  useEffect(() => {
    if (!selectedRowKeys.length) {
      setSelectedRowsMap((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      return;
    }
    setSelectedRowsMap((prev) => {
      const nextMap = { ...prev };
      let changed = false;
      enrichedData.forEach((row: any) => {
        if (selectedRowKeys.some((key) => String(key) === String(row?.id))) {
          const rowKey = String(row.id);
          if (nextMap[rowKey] !== row) {
            nextMap[rowKey] = row;
            changed = true;
          }
        }
      });
      Object.keys(nextMap).forEach((key) => {
        if (!selectedRowKeys.some((selectedKey) => String(selectedKey) === key)) {
          delete nextMap[key];
          changed = true;
        }
      });
      return changed ? nextMap : prev;
    });
  }, [enrichedData, selectedRowKeys]);

  useEffect(() => {
    if (resolvedModuleId !== "tasks" || !enrichedData.length) {
      setTaskRelationOptionsByField((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      return;
    }

    let isActive = true;

    const loadTaskRelationLabels = async () => {
      const requests = new Map<string, { fieldKey: string; moduleId: string; recordId: string }>();

      enrichedData.forEach((task: any) => {
        const sourceLink = resolveTaskSourceLink(task);
        const relatedModuleId = String(sourceLink.moduleId || task?.related_to_module || "").trim();
        const relatedRecordId = String(sourceLink.recordId || "").trim();
        const fieldKey = getTaskRelationFieldKey(relatedModuleId);
        if (!relatedModuleId || !relatedRecordId || !fieldKey) return;
        requests.set(`${fieldKey}:${relatedModuleId}:${relatedRecordId}`, {
          fieldKey,
          moduleId: relatedModuleId,
          recordId: relatedRecordId,
        });
      });

      if (!requests.size) {
        if (isActive) {
          setTaskRelationOptionsByField((prev) => (Object.keys(prev).length > 0 ? {} : prev));
        }
        return;
      }

      const loaded = await Promise.all(
        Array.from(requests.values()).map(async (request) => {
          try {
            const options = await fetchTaskSourceRecordOptions(supabase, request.moduleId, {
              exactId: request.recordId,
              limit: 20,
            });
            const exactOption = (options || []).find((option: any) => String(option?.value || "") === request.recordId);
            if (!exactOption) return null;
            return {
              fieldKey: request.fieldKey,
              option: {
                label: exactOption.label,
                value: String(exactOption.value),
              },
            };
          } catch (error) {
            console.warn("Could not load exact task relation option for module list", request, error);
            return null;
          }
        })
      );

      if (!isActive) return;

      const next: Record<string, any[]> = {};
      loaded.forEach((entry) => {
        if (!entry) return;
        const current = next[entry.fieldKey] || [];
        if (!current.some((item: any) => String(item?.value || "") === String(entry.option.value))) {
          current.push(entry.option);
        }
        next[entry.fieldKey] = current;
      });
      setTaskRelationOptionsByField(next);
    };

    void loadTaskRelationLabels();

    return () => {
      isActive = false;
    };
  }, [enrichedData, resolvedModuleId]);
  const showListSkeleton =
    viewMode === ViewMode.LIST &&
    !hasListInitialPaintCompleted &&
    (queryPending || deferredListDataLoading);
  const gridLoadStep = getGridLoadStep();

  // ✅ Grid view - paginated data
  const gridData = useMemo(() => {
    return enrichedData.slice(0, gridPageSize);
  }, [enrichedData, gridPageSize]);

  const visibleSelectableRowKeys = useMemo(() => {
    const toKeys = (rows: any[]) => rows.map((row: any) => row?.id).filter(Boolean);

    if (viewMode === ViewMode.LIST) {
      return listVisibleRowKeys ?? toKeys(enrichedData);
    }
    if (viewMode === ViewMode.GRID) {
      return toKeys(gridData);
    }
    return toKeys(enrichedData);
  }, [enrichedData, gridData, listVisibleRowKeys, viewMode]);

  useEffect(() => {
    if (viewMode !== ViewMode.LIST) return;
    if (queryPending || deferredListDataLoading) return;
    setHasListInitialPaintCompleted(true);
  }, [deferredListDataLoading, queryPending, viewMode]);

  useEffect(() => {
    if (!canShowGoalCards || selectedRowKeys.length > 0) return;
    const node = utilitySlotRef.current;
    if (!node) return;

    const measure = () => {
      const nextHeight = Math.round(node.getBoundingClientRect().height);
      if (nextHeight > 0) {
        setUtilitySlotHeight((prev) => (prev === nextHeight ? prev : nextHeight));
      }
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    return () => observer.disconnect();
  }, [canShowGoalCards, selectedRowKeys.length]);

  const handleRowSelectionChange = useCallback((nextKeys: React.Key[], nextRows?: any[]) => {
    setSelectedRowKeys(nextKeys);
    setSelectedRowsMap((prev) => {
      const nextMap = { ...prev };
      (nextRows || []).forEach((row: any) => {
        if (row?.id) {
          nextMap[String(row.id)] = row;
        }
      });
      Object.keys(nextMap).forEach((key) => {
        if (!nextKeys.some((selectedKey) => String(selectedKey) === key)) {
          delete nextMap[key];
        }
      });
      return nextMap;
    });
  }, []);

  useEffect(() => {
    if (!resolvedModuleId) return;
    if (typeof window === "undefined") return;
    const stateToPersist: PersistedModuleListState = {
      viewMode,
      searchTerm,
      currentView,
      visibleColumns,
      viewFilters: viewFiltersState,
      columnFilters,
      sorters: sanitizePersistedSorters(visibleSorters, moduleConfig),
    };
    window.localStorage.setItem(
      buildModuleListStateKey(resolvedModuleId, storageKeySuffix),
      JSON.stringify(stateToPersist)
    );
  }, [columnFilters, currentView, moduleConfig, resolvedModuleId, searchTerm, storageKeySuffix, viewFiltersState, viewMode, visibleColumns, visibleSorters]);

  // ✅ اضافه شد: Fetch dynamic و relation options
  useEffect(() => {
    if (!moduleConfig || !resolvedModuleId) return;

    let isActive = true;
    const optionPlan = buildModuleListOptionPlan(moduleConfig, visibleColumns);

    const applySnapshotToState = (snapshot: ReturnType<typeof readModuleOptionSnapshot>) => {
      if (!snapshot || !isActive) return;
      setDynamicOptions(snapshot.dynamicOptions || {});
      setRelationOptions(snapshot.relationOptions || {});
      setAllUsers(snapshot.allUsers || []);
      setAllRoles(snapshot.allRoles || []);
    };

    const fetchOptions = async () => {
      if (!hasCachedModuleOptions) {
        setOptionsReady(false);
      }

      try {
        const directoryPromise = fetchAssigneeDirectory(supabase);
        const immediateDynamicPromise =
          optionPlan.immediateDynamicCategories.length > 0
            ? fetchDynamicOptionsMap(supabase, optionPlan.immediateDynamicCategories)
            : Promise.resolve({} as Record<string, any[]>);
        const [directory, immediateDynamicOptions] = await Promise.all([
          directoryPromise,
          immediateDynamicPromise,
        ]);
        if (!isActive) return;

        setAllUsers(directory.users);
        setAllRoles(directory.roles);

        const immediateRelationOptions = await fetchModuleListRelationOptions(
          supabase,
          optionPlan.immediateRelationFields,
          directory
        );

        const snapshot = writeModuleOptionSnapshot(resolvedModuleId, {
          dynamicOptions: mergeOptionMaps(readModuleOptionSnapshot(resolvedModuleId)?.dynamicOptions, immediateDynamicOptions),
          relationOptions: mergeOptionMaps(readModuleOptionSnapshot(resolvedModuleId)?.relationOptions, immediateRelationOptions),
          allUsers: directory.users,
          allRoles: directory.roles,
        });

        applySnapshotToState(snapshot);
        if (isActive) {
          setOptionsReady(true);
        }

      } catch (error) {
        console.error('Error fetching options', error);
      } finally {
        if (isActive) {
          setOptionsReady(true);
        }
      }
    };

    applySnapshotToState(readModuleOptionSnapshot(resolvedModuleId));
    void fetchOptions();

    return () => {
      isActive = false;
    };
  }, [hasCachedModuleOptions, moduleConfig, resolvedModuleId, visibleColumns]);
  useEffect(() => {
    if (!tagsField || !shouldLoadTags || !resolvedModuleId || accessibleRecordIds.length === 0) {
      setTagsMap((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      setTagsLoading((prev) => (prev ? false : prev));
      return;
    }

    let isActive = true;

    const fetchTags = async () => {
      try {
        setTagsLoading(true);
        const nextTagsMap = await fetchRecordTagsMap(supabase, resolvedModuleId, accessibleRecordIds);

        if (!isActive) return;

        setTagsMap(nextTagsMap);
      } catch (err) {
        if (!isActive) return;
        console.error('Error fetching tags:', err);
        setTagsMap((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      } finally {
        if (isActive) {
          setTagsLoading(false);
        }
      }
    };

    void fetchTags();

    return () => {
      isActive = false;
    };
  }, [accessibleRecordIdsSignature, resolvedModuleId, shouldLoadTags, tagsField]);

  const availableGroupFields = useMemo(() => {
    return moduleConfig?.fields.filter(f => 
        (f.type === FieldType.STATUS || f.type === FieldType.SELECT) && f.options && f.options.length > 0
    ) || [];
  }, [moduleConfig]);

  const availableCalendarFields = useMemo(() => {
    return moduleConfig?.fields.filter((field) =>
      (field.type === FieldType.DATE || field.type === FieldType.DATETIME) &&
      (canViewField ? canViewField(field.key) !== false : true)
    ) || [];
  }, [canViewField, moduleConfig]);

  const mapEnabled = useMemo(() => {
    if (!moduleConfig) return false;
    return moduleConfig.fields.some((field) => field.type === FieldType.LOCATION || field.key === "location");
  }, [moduleConfig]);

  const activeFilterBubbles = useMemo(() => {
    if (!moduleConfig) return [];
    const tagLabelById = new Map<string, string>();
    Object.values(tagsMap || {}).forEach((recordTags) => {
      if (!Array.isArray(recordTags)) return;
      recordTags.forEach((tag: any) => {
        const id = String(tag?.id || "").trim();
        const title = String(tag?.title || tag?.label || "").trim();
        if (id && title && !tagLabelById.has(id)) {
          tagLabelById.set(id, title);
        }
      });
    });

    const operatorLabels: Record<string, string> = {
      contains: "شامل",
      eq: "برابر",
      ne: "نابرابر",
      gt: "بزرگ‌تر از",
      gte: "بزرگ‌تر یا مساوی",
      lt: "کوچک‌تر از",
      lte: "کوچک‌تر یا مساوی",
    };

    const bubbles = viewFiltersState
      .map((filter, index) => {
        const simpleFilter = filter as CrudFilter & {
          field?: string;
          operator?: string;
          value?: any;
          _displayField?: string;
          _displayOperator?: string;
          _displayValue?: any;
        };
        const fieldKey = String(simpleFilter?._displayField || simpleFilter?.field || "");
        if (!fieldKey) return null;
        const field = moduleConfig.fields.find((item) => item.key === fieldKey);
        const fieldLabel = getFieldLabelFa(field, { moduleId: resolvedModuleId, fallback: fieldKey });
        const rawValue = simpleFilter?._displayValue ?? simpleFilter?.value;
        const valueLabel = field
          ? field.type === FieldType.TAGS
            ? (Array.isArray(rawValue)
                ? rawValue
                    .map((item) => {
                      const normalized = String(item ?? "").trim();
                      return tagLabelById.get(normalized) || getSingleOptionLabel(field, normalized, dynamicOptions, relationOptions);
                    })
                    .filter(Boolean)
                    .join("، ")
                : String(tagLabelById.get(String(rawValue ?? "").trim()) || getSingleOptionLabel(field, rawValue, dynamicOptions, relationOptions)))
            : getSingleOptionLabel(field, rawValue, dynamicOptions, relationOptions)
          : String(rawValue ?? "");
        const operatorLabel =
          operatorLabels[String(simpleFilter?._displayOperator || simpleFilter?.operator || "eq")] ||
          String(simpleFilter?._displayOperator || simpleFilter?.operator || "eq");
        return {
          id: `view:${fieldKey}:${index}:${JSON.stringify(rawValue ?? null)}`,
          label: `${fieldLabel}: ${operatorLabel} ${valueLabel}`,
          onRemove: () => {
            setViewFiltersState((prev) => {
              const nextFilters = prev.filter((_item, filterIndex) => filterIndex !== index);
              applyCombinedFilters(nextFilters, searchTerm, columnFilters);
              if ((currentView?.config?.filters || []).length > 0) {
                setCurrentView(null);
              }
              return nextFilters;
            });
          },
        };
      })
      .filter(Boolean) as Array<{ id: string; label: string; onRemove: () => void }>;

    if (searchTerm.trim()) {
      bubbles.unshift({
        id: `search:${searchTerm.trim()}`,
        label: `جستجو: ${searchTerm.trim()}`,
        onRemove: () => setSearchTerm(""),
      });
    }

    return bubbles;
  }, [columnFilters, currentView?.config?.filters, dynamicOptions, moduleConfig, relationOptions, searchTerm, tagsMap, viewFiltersState]);

  const columnFilterBubbles = useMemo(() => {
    if (!moduleConfig) return [];

    return Object.entries(columnFilters || {})
      .flatMap(([fieldKey, values]) => {
        if (!Array.isArray(values) || values.length === 0) return [];

        if (fieldKey === "assignee_id") {
          return values
            .map((raw) => String(raw ?? "").trim())
            .filter(Boolean)
            .map((rawValue) => {
              const user = allUsers.find((item: any) => String(item?.id || "") === rawValue);
              const role = allRoles.find((item: any) => String(item?.id || "") === rawValue);
              const label = user?.display_name || user?.full_name || role?.title || rawValue;
              return {
                id: `column:${fieldKey}:${rawValue}`,
                label: `مسئول: ${label}`,
                onRemove: () => {
                  const nextFilters = { ...columnFilters };
                  const current = Array.isArray(nextFilters[fieldKey]) ? nextFilters[fieldKey] : [];
                  const nextValues = current.filter((item) => String(item) !== rawValue);
                  nextFilters[fieldKey] = nextValues.length > 0 ? nextValues : null;
                  setColumnFilters(nextFilters);
                  applyCombinedFilters(viewFiltersState, searchTerm, nextFilters);
                },
              };
            });
        }

        const field = moduleConfig.fields.find((item) => item.key === fieldKey);
        if (!field) return [];
        const fieldLabel = getFieldLabelFa(field, { moduleId: resolvedModuleId, fallback: fieldKey });
        const tagLabelById = new Map<string, string>();

        if (field.type === FieldType.TAGS) {
          Object.values(tagsMap || {}).forEach((recordTags) => {
            if (!Array.isArray(recordTags)) return;
            recordTags.forEach((tag: any) => {
              const id = String(tag?.id || "").trim();
              const title = String(tag?.title || tag?.label || "").trim();
              if (id && title && !tagLabelById.has(id)) {
                tagLabelById.set(id, title);
              }
            });
          });
        }

        return values
          .map((raw) => String(raw ?? "").trim())
          .filter(Boolean)
          .map((rawValue) => {
            let valueLabel = rawValue;
            if (
              field.type === FieldType.PRICE ||
              field.type === FieldType.DATE ||
              field.type === FieldType.TIME ||
              field.type === FieldType.DATETIME
            ) {
              const range = parseColumnRangeFilter(rawValue);
              const from = range.from !== undefined && range.from !== "" ? String(range.from) : "...";
              const to = range.to !== undefined && range.to !== "" ? String(range.to) : "...";
              valueLabel = `${from} تا ${to}`;
            } else if (field.type === FieldType.TAGS) {
              valueLabel = tagLabelById.get(rawValue) || rawValue;
            } else {
              valueLabel = String(
                getSingleOptionLabel(field, rawValue, dynamicOptions, effectiveRelationOptions) || rawValue
              );
            }
            return {
              id: `column:${fieldKey}:${rawValue}`,
              label: `${fieldLabel}: ${valueLabel}`,
              onRemove: () => {
                const nextFilters = { ...columnFilters };
                const current = Array.isArray(nextFilters[fieldKey]) ? nextFilters[fieldKey] : [];
                const nextValues = current.filter((item) => String(item) !== rawValue);
                nextFilters[fieldKey] = nextValues.length > 0 ? nextValues : null;
                setColumnFilters(nextFilters);
                applyCombinedFilters(viewFiltersState, searchTerm, nextFilters);
              },
            };
          });
      });
  }, [allRoles, allUsers, columnFilters, dynamicOptions, effectiveRelationOptions, moduleConfig, searchTerm, tagsMap, viewFiltersState]);

  const allListFilterBubbles = useMemo(
    () => [...activeFilterBubbles, ...columnFilterBubbles],
    [activeFilterBubbles, columnFilterBubbles]
  );
  const hasListFilterBubbles = allListFilterBubbles.length > 0;

  const clearAllListFilters = useCallback(() => {
    setSearchTerm("");
    setViewFiltersState([]);
    setColumnFilters({});
    if ((currentView?.config?.filters || []).length > 0) {
      setCurrentView(null);
    }
    applyCombinedFilters([], "", {});
  }, [currentView?.config?.filters]);

  useEffect(() => {
    if (viewMode !== ViewMode.KANBAN) return;
    if (kanbanGroupBy) return;
    if (availableGroupFields.length === 0) return;
    const defaultField = availableGroupFields.find((f) => f.type === FieldType.STATUS) || availableGroupFields[0];
    setKanbanGroupBy(defaultField.key);
  }, [viewMode, kanbanGroupBy, availableGroupFields]);

  useEffect(() => {
    if (viewMode !== ViewMode.CALENDAR) return;
    const selectedFieldStillAvailable = availableCalendarFields.some((field) => field.key === calendarDateField);
    if (calendarDateField && selectedFieldStillAvailable) return;
    if (availableCalendarFields.length === 0) return;
    const defaultField =
      availableCalendarFields.find((field) => field.key === "due_date" || field.key === "invoice_date") ||
      availableCalendarFields[0];
    setCalendarDateField(defaultField.key);
  }, [viewMode, calendarDateField, availableCalendarFields]);

  useEffect(() => {
    setKanbanVisibleCounts({});
  }, [kanbanGroupBy, resolvedModuleId, viewMode]);

  useEffect(() => {
    if (viewMode !== ViewMode.MAP) return;
    if (mapEnabled) return;
    setViewMode(moduleConfig?.defaultViewMode || ViewMode.LIST);
  }, [viewMode, mapEnabled, moduleConfig?.defaultViewMode]);

  useEffect(() => {
    if (viewMode !== ViewMode.CALENDAR) return;
    if (availableCalendarFields.length > 0) return;
    setViewMode(moduleConfig?.defaultViewMode || ViewMode.LIST);
  }, [viewMode, availableCalendarFields.length, moduleConfig?.defaultViewMode]);

  const handleRefresh = useCallback(() => {
    void tableQueryResult.refetch();
  }, [tableQueryResult]);

  const handleSyncVoipCalls = useCallback(async () => {
    if (resolvedModuleId !== "voip_call_reports" || voipCallSyncing) return;
    setVoipCallSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("telefonchy_smartcall", {
        body: {
          action: "sync_recent_calls",
          days: 7,
          perPage: 50,
        },
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(String(data?.message || "همگام‌سازی تماس‌های VoIP ناموفق بود."));
      }
      showListMessage("success", String(data?.message || "تماس‌های اخیر VoIP همگام‌سازی شد."));
      await tableQueryResult.refetch();
    } catch (error: any) {
      showListMessage("error", toFaErrorMessage(error, "خطا در همگام‌سازی تماس‌های VoIP"));
    } finally {
      setVoipCallSyncing(false);
    }
  }, [resolvedModuleId, showListMessage, tableQueryResult, voipCallSyncing]);

  const openRecordFromList = useCallback((record: any) => {
    const recordId = String(record?.id || "").trim();
    if (!resolvedModuleId || !recordId) return;
    if (useQuickPreviewModal) {
      setPreviewRecordId(recordId);
      return;
    }
    navigate(`/${resolvedModuleId}/${recordId}`);
  }, [navigate, resolvedModuleId, useQuickPreviewModal]);

  const moduleListNavigate = useCallback((path: string) => {
    const normalizedPath = String(path || "").trim();
    if (useQuickPreviewModal && resolvedModuleId) {
      const moduleRecordPrefix = `/${resolvedModuleId}/`;
      if (normalizedPath.startsWith(moduleRecordPrefix)) {
        const recordId = normalizedPath.slice(moduleRecordPrefix.length).split("/")[0];
        if (recordId && recordId !== "create") {
          setPreviewRecordId(recordId);
          return;
        }
      }
    }
    navigate(normalizedPath);
  }, [navigate, resolvedModuleId, useQuickPreviewModal]);

  function buildColumnCrudFilters(nextColumnFilters: ColumnFiltersState): CrudFilters {
    if (!moduleConfig) return [];

    const filters: CrudFilters = [];

    Object.entries(nextColumnFilters || {}).forEach(([fieldKey, values]) => {
      if (!Array.isArray(values) || values.length === 0) return;

      if (fieldKey === "assignee_id") {
        const assigneeValues = values
          .map((value) => String(value ?? "").trim())
          .filter(Boolean);
        if (assigneeValues.length === 0) return;
        filters.push({
          operator: "or",
          value:
            assigneeValues.length === 1
              ? [
                  { field: "assignee_id", operator: "eq", value: assigneeValues[0] },
                  { field: "assignee_role_id", operator: "eq", value: assigneeValues[0] },
                ]
              : [
                  { field: "assignee_id", operator: "in", value: assigneeValues },
                  { field: "assignee_role_id", operator: "in", value: assigneeValues },
                ],
        });
        return;
      }

      if (
        moduleConfig.id === "products" &&
        (fieldKey === "category" || fieldKey === "product_category")
      ) {
        const categoryValues = values
          .map((value) => String(value ?? "").trim())
          .filter(Boolean);
        if (categoryValues.length === 0) return;
        const operator = categoryValues.length > 1 ? "in" : "eq";
        const payload = categoryValues.length > 1 ? categoryValues : categoryValues[0];
        filters.push({
          operator: "or",
          value: [
            { field: "category", operator, value: payload },
            { field: "product_category", operator, value: payload },
          ],
        });
        return;
      }

      const field = moduleConfig.fields.find((item) => item.key === fieldKey);
      if (!field) return;

      if (
        field.type === FieldType.PRICE ||
        field.type === FieldType.DATE ||
        field.type === FieldType.TIME ||
        field.type === FieldType.DATETIME
      ) {
        const range = parseColumnRangeFilter(values[0]);
        if (range.from !== undefined && range.from !== "") {
          filters.push({ field: fieldKey, operator: "gte", value: range.from });
        }
        if (range.to !== undefined && range.to !== "") {
          filters.push({ field: fieldKey, operator: "lte", value: range.to });
        }
        return;
      }

      if (
        field.type === FieldType.MULTI_SELECT ||
        field.type === FieldType.TAGS ||
        field.type === FieldType.PROGRESS_STAGES
      ) {
        return;
      }

      if (
        field.type === FieldType.TEXT ||
        field.key.includes("name") ||
        field.key.includes("code") ||
        field.key.includes("title")
      ) {
        const searchValue = String(values[0] ?? "").trim();
        if (searchValue) {
          filters.push({ field: fieldKey, operator: "contains", value: searchValue });
        }
        return;
      }

      const scalarValues = values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);

      if (scalarValues.length === 0) return;
      filters.push({
        field: fieldKey,
        operator: scalarValues.length > 1 ? "in" : "eq",
        value: scalarValues.length > 1 ? scalarValues : scalarValues[0],
      });
    });

    return filters;
  }

  function buildMergedFilters(nextViewFilters: CrudFilters, nextSearchTerm: string, nextColumnFilters: ColumnFiltersState): CrudFilters {
    const mergedFilters = [...nextViewFilters];
    mergedFilters.push(...buildColumnCrudFilters(nextColumnFilters));
    if (searchTargetField && nextSearchTerm.trim()) {
      mergedFilters.push({
        field: searchTargetField,
        operator: "contains",
        value: nextSearchTerm.trim(),
      });
    }
    return mergedFilters;
  }

  async function buildViewCrudFilters(nextViewFiltersConfig: any[]): Promise<CrudFilters> {
    if (!moduleConfig || !Array.isArray(nextViewFiltersConfig)) return [];

    const buildDateBoundaryValue = (
      field: ModuleField | undefined,
      date: Date,
      boundary: "start" | "end"
    ) => {
      const normalized = new Date(date);
      if (boundary === "start") {
        normalized.setHours(0, 0, 0, 0);
      } else {
        normalized.setHours(23, 59, 59, 999);
      }

      if (field?.type === FieldType.DATE) {
        return normalized.toISOString().slice(0, 10);
      }
      return normalized.toISOString();
    };

    const filters: CrudFilters = [];

    for (const rawFilter of nextViewFiltersConfig) {
      const fieldKey = String(rawFilter?.field || "").trim();
      const operator = String(rawFilter?.operator || "").trim();
      const value = rawFilter?.value;
      const field = moduleConfig.fields.find((item) => String(item?.key || "").trim() === fieldKey);
      if (!fieldKey || !operator || !field) continue;

      if (field.type === FieldType.TAGS) {
        const normalizedTagIds = (Array.isArray(value) ? value : value !== undefined && value !== null && value !== "" ? [value] : [])
          .map((item) => String(item ?? "").trim())
          .filter(Boolean);

        const loadTaggedRecordIds = async () => {
          const query = supabase
            .from("record_tags")
            .select("record_id")
            .eq("module_id", resolvedModuleId);

          if (normalizedTagIds.length > 0) {
            query.in("tag_id", normalizedTagIds);
          }

          const { data, error } = await query;
          if (error) throw error;
          return Array.from(
            new Set(
              (data || [])
                .map((row: any) => String(row?.record_id || "").trim())
                .filter(Boolean)
            )
          );
        };

        try {
          const taggedRecordIds = await loadTaggedRecordIds();

          if (operator === "is_null") {
            if (taggedRecordIds.length > 0) {
              filters.push({
                field: "id",
                operator: "nin",
                value: taggedRecordIds,
                _displayField: fieldKey,
                _displayOperator: operator,
                _displayValue: normalizedTagIds,
              } as any);
            }
            continue;
          }

          if (operator === "not_null") {
            filters.push({
              field: "id",
              operator: "in",
              value: taggedRecordIds.length > 0 ? taggedRecordIds : ["__no_matching_record__"],
              _displayField: fieldKey,
              _displayOperator: operator,
              _displayValue: normalizedTagIds,
            } as any);
            continue;
          }

          if (normalizedTagIds.length === 0) continue;

          if (["eq", "in", "contains"].includes(operator)) {
            filters.push({
              field: "id",
              operator: "in",
              value: taggedRecordIds.length > 0 ? taggedRecordIds : ["__no_matching_record__"],
              _displayField: fieldKey,
              _displayOperator: operator,
              _displayValue: normalizedTagIds,
            } as any);
            continue;
          }

          if (["neq", "not_in", "not_contains"].includes(operator)) {
            if (taggedRecordIds.length > 0) {
              filters.push({
                field: "id",
                operator: "nin",
                value: taggedRecordIds,
                _displayField: fieldKey,
                _displayOperator: operator,
                _displayValue: normalizedTagIds,
              } as any);
            }
            continue;
          }
        } catch (error) {
          console.warn("Could not resolve tag view filter", { moduleId: resolvedModuleId, fieldKey, operator, error });
        }

        continue;
      }

      switch (operator) {
        case "eq":
        case "contains":
        case "gt":
        case "gte":
        case "lt":
        case "lte":
          filters.push({ field: fieldKey, operator, value } as any);
          continue;
        case "neq":
          filters.push({ field: fieldKey, operator: "ne", value } as any);
          continue;
        case "not_contains":
          filters.push({ field: fieldKey, operator: "ncontains", value } as any);
          continue;
        case "starts_with":
          filters.push({ field: fieldKey, operator: "startswith", value } as any);
          continue;
        case "ends_with":
          filters.push({ field: fieldKey, operator: "endswith", value } as any);
          continue;
        case "in": {
          const values = Array.isArray(value) ? value : value !== undefined && value !== null && value !== "" ? [value] : [];
          if (values.length > 0) {
            filters.push({ field: fieldKey, operator: "in", value: values } as any);
          }
          continue;
        }
        case "not_in": {
          const values = Array.isArray(value) ? value : value !== undefined && value !== null && value !== "" ? [value] : [];
          if (values.length > 0) {
            filters.push({ field: fieldKey, operator: "nin", value: values } as any);
          }
          continue;
        }
        case "is_true":
          filters.push({ field: fieldKey, operator: "eq", value: true } as any);
          continue;
        case "is_false":
          filters.push({ field: fieldKey, operator: "eq", value: false } as any);
          continue;
        case "is_null":
          filters.push({ field: fieldKey, operator: "null", value: null } as any);
          continue;
        case "not_null":
          filters.push({ field: fieldKey, operator: "nnull", value: null } as any);
          continue;
        case "is_today":
        case "is_yesterday":
        case "is_tomorrow": {
          const baseDate = new Date();
          baseDate.setHours(0, 0, 0, 0);
          if (operator === "is_yesterday") baseDate.setDate(baseDate.getDate() - 1);
          if (operator === "is_tomorrow") baseDate.setDate(baseDate.getDate() + 1);
          filters.push(
            { field: fieldKey, operator: "gte", value: buildDateBoundaryValue(field, baseDate, "start") } as any,
            { field: fieldKey, operator: "lte", value: buildDateBoundaryValue(field, baseDate, "end") } as any
          );
          continue;
        }
        default:
          continue;
      }
    }

    return filters;
  }

  function applyCombinedFilters(nextViewFilters: CrudFilters, nextSearchTerm: string, nextColumnFilters: ColumnFiltersState, resetPage = true) {
    const mergedFilters = buildMergedFilters(nextViewFilters, nextSearchTerm, nextColumnFilters);
    const nextSignature = JSON.stringify(mergedFilters);
    if (lastAppliedFiltersSignatureRef.current !== nextSignature) {
      lastAppliedFiltersSignatureRef.current = nextSignature;
      setFilters(mergedFilters, "replace");
    }
    if (resetPage && current !== 1) {
      setCurrent?.(1);
    }
  }

  const handleColumnFiltersChange = useCallback((nextFilters: ColumnFiltersState) => {
    setColumnFilters(nextFilters);
    applyCombinedFilters(viewFiltersState, searchTerm, nextFilters);
  }, [searchTerm, viewFiltersState]);

  const handleViewChange = useCallback((view: SavedView | null, config: any) => {
    const currentConfig = currentView?.config || null;
    const sameViewId = (currentView?.id || null) === (view?.id || null);
    const sameConfig =
      JSON.stringify(currentConfig || null) === JSON.stringify(config || null);
    if (sameViewId && sameConfig) {
      return;
    }

    setCurrentView(view);
    const applyViewFilters = async () => {
      const refineFilters: CrudFilters =
        config && config.filters && Array.isArray(config.filters) && config.filters.length > 0
          ? await buildViewCrudFilters(config.filters)
          : [];
      setViewFiltersState(refineFilters);
      applyCombinedFilters(refineFilters, searchTerm, columnFilters);
    };
    void applyViewFilters();

    // ✅ اعمال ستون‌های انتخاب‌شده
    if (config && config.columns && Array.isArray(config.columns) && config.columns.length > 0) {
        setVisibleColumns(config.columns);
    } else {
        setVisibleColumns([]);
    }
  }, [columnFilters, currentView, resolvedModuleId, searchTerm]);

  // ✅ FIX: سرچ فقط فیلتر سرچ را اضافه/حذف می‌کند و به فیلترهای View دست نمی‌زند
  useEffect(() => {
    if (!searchSyncInitializedRef.current) {
      searchSyncInitializedRef.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      applyCombinedFilters(viewFiltersState, searchTerm, columnFilters);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [columnFilters, searchTerm, viewFiltersState]);

  const handleTableChange = useCallback((pagination: any, _tableFilters: any, sorter: any, extra: any) => {
    if (extra?.action === "filter") {
      return;
    }

    const nextCurrent = Number(pagination?.current || 1);
    const nextPageSize = Number(pagination?.pageSize || DEFAULT_LIST_PAGE_SIZE);
    if (nextPageSize && nextPageSize !== Number(pageSize || 0)) {
      setPageSize(nextPageSize);
    }
    if (nextCurrent && nextCurrent !== Number(current || 1)) {
      setCurrent(nextCurrent);
    }

    if (extra?.action === "sort") {
      const nextSorters = normalizeCrudSorters(mapAntdSorterToCrudSorting(sorter));
      setSorters(ensureStableCrudSorters(nextSorters.length > 0 ? nextSorters : getDefaultSorters(moduleConfig)));
      return;
    }

    if (extra?.action === "paginate") {
      return;
    }

    tableProps.onChange?.(pagination, {}, sorter, extra);
  }, [current, moduleConfig, pageSize, setCurrent, setPageSize, setSorters, tableProps]);

  const handleSelectAllAcrossPages = useCallback(async () => {
    if (!resolvedModuleId || selectAllPagesLoading) return;

    const mergedFilters = buildMergedFilters(viewFiltersState, searchTerm, columnFilters);
    const pageSize = 1000;
    const selectedRowsById = new Map<string, any>();
    const closeLoadingMessage = showListMessage("loading", "در حال انتخاب همه رکوردهای صفحات...");
    setSelectAllPagesLoading(true);

    try {
      let currentPage = 1;
      let totalPages = 1;

      while (currentPage <= totalPages) {
        const response = await refineProvider.getList({
          resource: dataResource || resolvedModuleId,
          pagination: { current: currentPage, pageSize },
          sorters: stableSorters,
          filters: mergedFilters,
          meta: {
            select: "id,status,assignee_type,assignee_id,assignee_role_id",
          },
        });

        const rows = Array.isArray(response?.data) ? response.data : [];
        rows.forEach((row: any) => {
          const rowId = String(row?.id || "").trim();
          if (!rowId) return;
          selectedRowsById.set(rowId, row);
        });

        if (currentPage === 1) {
          const totalRows = Number(response?.total || 0);
          if (totalRows > 0) {
            totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
          } else if (rows.length < pageSize) {
            break;
          } else {
            totalPages = Number.MAX_SAFE_INTEGER;
          }
        } else if (rows.length < pageSize && totalPages === Number.MAX_SAFE_INTEGER) {
          break;
        }

        if (!rows.length) break;
        currentPage += 1;
      }

      const allRows = Array.from(selectedRowsById.values());
      const allowedRows = allRows.filter((row) =>
        canAccessAssignedRecord(row, currentUserId, currentUserRoleId, recordScope)
      );
      const allowedKeys = allowedRows
        .map((row) => String(row?.id || "").trim())
        .filter(Boolean);

      if (!allowedKeys.length) {
        showListMessage("warning", "رکوردی برای انتخاب در همه صفحات پیدا نشد.");
        return;
      }

      setSelectedRowKeys((prev) => Array.from(new Set([...prev, ...allowedKeys])));
      setSelectedRowsMap((prev) => {
        const nextMap = { ...prev };
        allowedRows.forEach((row) => {
          const rowId = String(row?.id || "").trim();
          if (!rowId) return;
          nextMap[rowId] = {
            ...(nextMap[rowId] || {}),
            ...row,
          };
        });
        return nextMap;
      });

      showListMessage("success", `${allowedKeys.length} رکورد از همه صفحات انتخاب شد.`);
    } catch (error: any) {
      showListMessage("error", toFaErrorMessage(error, "انتخاب همه رکوردهای صفحات ناموفق بود."));
    } finally {
      if (typeof closeLoadingMessage === "function") {
        closeLoadingMessage();
      }
      setSelectAllPagesLoading(false);
    }
  }, [
    buildMergedFilters,
    canAccessAssignedRecord,
    columnFilters,
    currentUserId,
    currentUserRoleId,
    recordScope,
    refineProvider,
    dataResource,
    resolvedModuleId,
    searchTerm,
    selectAllPagesLoading,
    showListMessage,
    stableSorters,
    viewFiltersState,
  ]);

  const handleBulkDelete = () => {
    if (selectedRowKeys.length === 0) return;
    if (isSystemManagedModule) {
      showListMessage("warning", "رکوردهای سیستمی قابل حذف نیستند.");
      return;
    }
    modal.confirm({
      title: `حذف ${selectedRowKeys.length} رکورد`,
      content: 'آیا مطمئن هستید؟',
      okType: 'danger',
      okText: 'بله، حذف کن',
      cancelText: 'خیر',
      onOk: async () => {
        if (!resolvedModuleId) return;
        try {
          if (isRecycleBinEnabledModule(resolvedModuleId)) {
            await moveModuleRecordsToRecycleBin(resolvedModuleId, selectedRowKeys as string[]);
          } else {
            await new Promise<void>((resolve, reject) => {
              deleteMany(
                {
                  resource: dataResource || resolvedModuleId,
                  ids: selectedRowKeys as string[],
                  successNotification: false,
                  errorNotification: false,
                },
                {
                  onSuccess: () => resolve(),
                  onError: (error: any) => reject(error),
                }
              );
            });
          }
          setSelectedRowKeys([]);
          showListMessage('success', 'رکوردهای انتخاب‌شده حذف شدند.');
          tableQueryResult.refetch();
        } catch (error: any) {
          showListMessage('error', toFaErrorMessage(error, 'حذف رکوردها ناموفق بود.'));
        }
      }
    });
  };

  const handleBulkEditOpen = () => {
      if (isSystemManagedModule) {
        if (!tagsField) {
          showListMessage("warning", "برای این گزارش فیلد برچسب فعال نیست.");
          return;
        }
        setEditRecordId(null);
        setIsBulkEditMode(true);
        setIsBulkEditOpen(true);
        return;
      }
      const nextState = resolveModuleListBulkEditOpenState(
        selectedRowKeys.map((key) => String(key))
      );
      if (!nextState.shouldOpen) return;
      setEditRecordId(nextState.editRecordId);
      setIsBulkEditMode(nextState.isBulkEditMode);
      setIsBulkEditOpen(true);
  };

  const fetchSelectedRecords = useCallback(async () => {
    if (!selectedRowKeys.length || !moduleConfig || !resolvedModuleId) return [];
    const tableName = moduleConfig.table || resolvedModuleId;
    const ids = selectedRowKeys.map((id) => String(id));
    const { data: rows, error } = await supabase
      .from(tableName)
      .select('*')
      .in('id', ids);
    if (error) throw error;

    const orderMap = new Map(ids.map((id, index) => [id, index]));
    return (rows || []).slice().sort((a: any, b: any) => {
      return (orderMap.get(String(a?.id || '')) ?? 0) - (orderMap.get(String(b?.id || '')) ?? 0);
    });
  }, [moduleConfig, resolvedModuleId, selectedRowKeys]);

  const handleBulkSmsOpen = useCallback(async () => {
    if (!canBulkSendSms) return;
    if (!selectedRowKeys.length) {
      showListMessage("warning", "ابتدا حداقل یک رکورد انتخاب کنید.");
      return;
    }
    try {
      const rows = await fetchSelectedRecords();
      if (!rows.length) {
        showListMessage("warning", "رکوردی برای ارسال پیامک پیدا نشد.");
        return;
      }

      const recipientSet = new Set<string>();
      rows.forEach((row: any) => {
        const candidates = getRecordPhoneCandidates(resolvedModuleId, row);
        candidates.forEach((phone) => {
          const normalized = formatIranMobileForInput(phone);
          if (/^09\d{9}$/.test(String(normalized || ''))) {
            recipientSet.add(normalized);
          }
        });
      });

      const recipients = Array.from(recipientSet);
      if (!recipients.length) {
        showListMessage("warning", "در رکوردهای انتخاب‌شده شماره موبایل معتبر پیدا نشد.");
        return;
      }
      setBulkSmsRecipients(recipients);
      setBulkSmsSourceRecord(rows[0] || null);
      setIsBulkSmsComposerOpen(true);
    } catch (error: any) {
      showListMessage("error", toFaErrorMessage(error, "ارسال پیامک گروهی ناموفق بود."));
    }
  }, [canBulkSendSms, fetchSelectedRecords, resolvedModuleId, selectedRowKeys.length, showListMessage]);

  const bulkBuildModule = useMemo(() => {
    if (!bulkBuildTarget) return null;
    if (bulkBuildTarget === "product_bundles") {
      return toHeaderOnlyModule(MODULES.product_bundles, "products");
    }
    if (bulkBuildTarget === "price_lists") {
      return toHeaderOnlyModule(MODULES.price_lists, "items");
    }
    return null;
  }, [bulkBuildTarget]);

  const handleBuildRecordFromSelection = useCallback(async (values: any) => {
    if (!bulkBuildTarget || !bulkBuildSourceModule) return;
    const selectedRecords = await fetchSelectedRecords();
    if (!selectedRecords.length) {
      throw new Error("هیچ موردی برای ساخت رکورد انتخاب نشده است.");
    }

    const authUser = await getCachedAuthUser(supabase);
    const authUserId = authUser?.id || null;
    const payload =
      bulkBuildTarget === "product_bundles"
        ? { ...values, products: buildPackageItemsFromRecords(selectedRecords, bulkBuildSourceModule) }
        : { ...values, items: buildPriceListItemsFromRecords(selectedRecords, bulkBuildSourceModule) };
    const auditedPayload = authUserId
      ? { ...payload, created_by: payload.created_by ?? authUserId, updated_by: payload.updated_by ?? authUserId }
      : payload;

    const targetTable = bulkBuildTarget === "product_bundles" ? "product_bundles" : "price_lists";
    let insertResult = await supabase.from(targetTable).insert(auditedPayload).select("id").single();
    const errorText = String(insertResult.error?.message || insertResult.error?.details || "").toLowerCase();
    if (insertResult.error && (errorText.includes("created_by") || errorText.includes("updated_by"))) {
      insertResult = await supabase.from(targetTable).insert(payload).select("id").single();
    }
    if (insertResult.error) {
      throw insertResult.error;
    }

    setBulkBuildTarget(null);
    setSelectedRowKeys([]);
    setSelectedRowsMap({});
    await tableQueryResult.refetch();
  }, [bulkBuildSourceModule, bulkBuildTarget, fetchSelectedRecords, tableQueryResult]);

  const handleExportExcel = useCallback(async () => {
    if (!selectedRowKeys.length || !moduleConfig) return;
    const hide = showListMessage('loading', 'در حال آماده‌سازی خروجی...', 0);
    try {
      const recordsToExport = await fetchSelectedRecords();
      if (recordsToExport.length === 0) {
        showListMessage('warning', 'رکوردی برای خروجی یافت نشد.');
        return;
      }

      const exportFields = listPrintableFields.length > 0
        ? listPrintableFields
        : buildListPrintableFields(moduleConfig, canViewField, visibleColumns, dynamicOptions);
      const currencyLabel = readCurrencyConfig().label || '';
      const headers = exportFields.map((field) => escapeCsvCell(field.label)).join(',');
      const rows = recordsToExport
        .map((row: any) =>
          exportFields
            .map((field) => escapeCsvCell(formatListCellValue(field, row, relationOptions, currencyLabel, 'en')))
            .join(',')
        )
        .join('\n');
      const csvContent = `\uFEFF${headers}\n${rows}`;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${resolvedModuleId}_export_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showListMessage('success', 'خروجی آماده شد.');
    } catch (error: any) {
      showListMessage('error', toFaErrorMessage(error, 'خروجی گرفتن ناموفق بود.'));
    } finally {
      hide();
    }
  }, [canViewField, dynamicOptions, fetchSelectedRecords, listPrintableFields, moduleConfig, relationOptions, resolvedModuleId, selectedRowKeys.length, showListMessage, visibleColumns]);

  const handleExportPrint = useCallback(async () => {
    if (!selectedRowKeys.length) return;
    const hide = showListMessage('loading', 'در حال آماده‌سازی پیش‌نمایش چاپ...', 0);
    try {
      const recordsToPrint = await fetchSelectedRecords();
      if (recordsToPrint.length === 0) {
        showListMessage('warning', 'رکوردی برای چاپ یافت نشد.');
        return;
      }
      setListPrintRows(recordsToPrint);
      listPrintManager.setIsPrintModalOpen(true);
    } catch (error: any) {
      showListMessage('error', toFaErrorMessage(error, 'آماده‌سازی چاپ ناموفق بود.'));
    } finally {
      hide();
    }
  }, [fetchSelectedRecords, listPrintManager, selectedRowKeys.length, showListMessage]);

  const handleBulkCopy = () => {
    if (!selectedRowKeys.length || !resolvedModuleId || !moduleConfig) return;
    modal.confirm({
      title: `کپی ${selectedRowKeys.length} رکورد`,
      content: 'از رکوردهای انتخاب‌شده نسخه کپی ساخته شود؟',
      okText: 'بله، کپی کن',
      cancelText: 'انصراف',
      onOk: async () => {
        const tableName = moduleConfig.table || resolvedModuleId;
        const ids = selectedRowKeys.map((id) => String(id));
        const hide = showListMessage('loading', 'در حال کپی رکوردها...', 0);
        try {
          const { data: sourceRows, error: sourceError } = await supabase
            .from(tableName)
            .select('*')
            .in('id', ids);
          if (sourceError) throw sourceError;
          const records = sourceRows || [];
          if (!records.length) {
            showListMessage('warning', 'رکوردی برای کپی یافت نشد.');
            return;
          }
          const nameField = detectCopyNameField(moduleConfig);
          if (resolvedModuleId === 'production_orders' || resolvedModuleId === 'process_templates') {
            let copiedCount = 0;
            for (let idx = 0; idx < records.length; idx += 1) {
              const record = records[idx];
              const payload = buildCopyPayload(record, { nameField, copyIndex: idx, moduleId: resolvedModuleId });
              const { data: inserted, error: insertError } = await supabase
                .from(tableName)
                .insert(payload)
                .select('id')
                .single();
              if (insertError) throw insertError;
              if (inserted?.id) {
                if (resolvedModuleId === 'production_orders') {
                  await copyProductionOrderRelations(supabase, String(record.id), String(inserted.id));
                } else {
                  await copyProcessTemplateStagesRelations(supabase, String(record.id), String(inserted.id));
                }
              }
              copiedCount += 1;
            }
            showListMessage('success', `${copiedCount} رکورد کپی شد.`);
          } else {
            const payloads = records.map((record: any, idx: number) =>
              buildCopyPayload(record, { nameField, copyIndex: idx, moduleId: resolvedModuleId })
            );
            const { error: insertError } = await supabase.from(tableName).insert(payloads);
            if (insertError) throw insertError;
            showListMessage('success', `${payloads.length} رکورد کپی شد.`);
          }
          setSelectedRowKeys([]);
          tableQueryResult.refetch();
        } catch (err: any) {
          showListMessage('error', toFaErrorMessage(err, 'کپی رکوردها ناموفق بود.'));
        } finally {
          hide();
        }
      }
    });
  };
  void handleBulkCopy;

  const handleCopyViaCreateForm = () => {
    if (!selectedRowKeys.length || !resolvedModuleId || !moduleConfig) return;
    if (isSystemManagedModule) {
      showListMessage("warning", "رکوردهای سیستمی قابل کپی نیستند.");
      return;
    }
    if (selectedRowKeys.length > 1) {
      showListMessage("warning", "برای کپی از طریق فرم، فقط یک رکورد را انتخاب کنید.");
      return;
    }
    modal.confirm({
      title: "کپی رکورد",
      content: "فرم ایجاد رکورد جدید با مقادیر کپی‌شده باز شود؟",
      okText: "بله، فرم را باز کن",
      cancelText: "انصراف",
      onOk: async () => {
        const tableName = moduleConfig.table || resolvedModuleId;
        const selectedId = String(selectedRowKeys[0]);
        const hide = showListMessage("loading", "در حال آماده‌سازی کپی...", 0);
        try {
          const { data: record, error: sourceError } = await supabase
            .from(tableName)
            .select("*")
            .eq("id", selectedId)
            .maybeSingle();
          if (sourceError) throw sourceError;
          if (!record) {
            showListMessage("warning", "رکوردی برای کپی یافت نشد.");
            return;
          }
          const nameField = detectCopyNameField(moduleConfig);
          const payload = buildCopyPayload(record, { nameField, moduleId: resolvedModuleId });
          writeModuleOptionSnapshot(resolvedModuleId, {
            dynamicOptions,
            relationOptions,
            allUsers,
            allRoles,
          });
          setSelectedRowKeys([]);
          navigate(`/${resolvedModuleId}/create`, {
            state: {
              initialValues: payload,
              copySource: {
                sourceRecordId: String(record.id),
                copyRelations: resolvedModuleId === "production_orders" || resolvedModuleId === "process_templates",
              },
            },
          });
          showListMessage("success", "فرم ایجاد با اطلاعات کپی‌شده باز شد.");
        } catch (err: any) {
          showListMessage("error", toFaErrorMessage(err, "آماده‌سازی کپی ناموفق بود."));
        } finally {
          hide();
        }
      }
    });
  };

  const handleCreateGroupOrderFromSelection = () => {
    if (resolvedModuleId !== 'production_orders') return;
    if (!selectedRowKeys.length) return;
    if (!allSelectedPendingInProductionOrders) {
      showListMessage('error', 'برای ایجاد سفارش گروهی، همه سفارش‌های انتخاب‌شده باید در وضعیت «در انتظار» باشند.');
      return;
    }
    const selectedIds = selectedRowKeys.map((item) => String(item));
    navigate('/production_group_orders/create', {
      state: { selectedOrderIds: selectedIds },
    });
  };

  const handleBulkSave = async (values: any, meta?: { selectedTags?: any[] }) => {
      const changes: any = {};
      Object.keys(values).forEach(key => {
          const currentValue = values[key];
          const isEmptyArray = Array.isArray(currentValue) && currentValue.length === 0;
          const isEmptyObject =
            currentValue &&
            typeof currentValue === 'object' &&
            !Array.isArray(currentValue) &&
            Object.keys(currentValue).length === 0;
          if (currentValue !== undefined && currentValue !== null && currentValue !== '' && !isEmptyArray && !isEmptyObject) {
              changes[key] = values[key];
          }
      });
      const selectedTags = Array.isArray(meta?.selectedTags)
        ? meta.selectedTags.filter(Boolean)
        : [];
      const hasTagChanges = selectedTags.length > 0;
      if (isSystemManagedModule && Object.keys(changes).length > 0 && !hasTagChanges) {
        showListMessage('warning', 'برای گزارش‌های سیستمی فقط برچسب‌ها قابل ویرایش هستند.');
        return;
      }
      if (Object.keys(changes).length === 0 && !hasTagChanges) return;
      if (!moduleConfig?.table) return;
      const normalizedChanges = Object.keys(changes).length > 0 && resolvedModuleId === 'tasks'
        ? attachTaskCompletionIfNeeded(changes)
        : changes;
      const shouldUpdateRecordPayload = Object.keys(normalizedChanges).length > 0 && !isSystemManagedModule;
      const selectedIds = selectedRowKeys.map((id) => String(id)).filter(Boolean);
      if (!selectedIds.length) return;

      const hide = showListMessage('loading', 'در حال بروزرسانی موارد انتخاب‌شده...', 0);
      try {
        for (const id of selectedIds) {
          if (shouldUpdateRecordPayload) {
            const { error } = await supabase
              .from(moduleConfig.table)
              .update(normalizedChanges)
              .eq('id', id);
            if (error) throw error;
          }

          if (hasTagChanges && resolvedModuleId) {
            await syncRecordTags(supabase, resolvedModuleId, id, selectedTags);
          }
        }

        showListMessage('success', 'رکوردهای انتخاب‌شده بروزرسانی شدند.');
        setIsBulkEditOpen(false);
        setSelectedRowKeys([]);
        setSelectedRowsMap({});
        tableQueryResult.refetch();
      } catch (error: any) {
        showListMessage('error', toFaErrorMessage(error, 'بروزرسانی رکورد ناموفق بود.'));
      } finally {
        hide?.();
      }
  };

  const handleKanbanRecordMove = useCallback(async (record: any, targetColumnKey: string) => {
    if (!moduleConfig?.table || !kanbanGroupBy) return;
    const groupField = moduleConfig.fields.find((field) => field.key === kanbanGroupBy);
    if (!groupField) return;

    if (!canEditModule || groupField.readonly || (canViewField ? canViewField(kanbanGroupBy) === false : false)) {
      showListMessage("warning", "شما دسترسی ویرایش این کارت را ندارید.");
      return;
    }

    const targetOption = groupField.options?.find((option) => String(option?.value ?? "") === String(targetColumnKey));
    const nextValue = targetOption?.value ?? targetColumnKey;
    if (String(record?.[kanbanGroupBy] ?? "") === String(nextValue ?? "")) return;

    const changes = { [kanbanGroupBy]: nextValue };
    const normalizedChanges = resolvedModuleId === "tasks"
      ? attachTaskCompletionIfNeeded(changes)
      : changes;
    const hide = showListMessage("loading", "در حال جابجایی کارت...", 0);

    try {
      const { error } = await supabase
        .from(moduleConfig.table)
        .update(normalizedChanges)
        .eq("id", record.id);
      if (error) throw error;

      showListMessage("success", "کارت جابجا شد.");
      void tableQueryResult.refetch();
    } catch (error: any) {
      showListMessage("error", toFaErrorMessage(error, "جابجایی کارت ناموفق بود."));
    } finally {
      hide?.();
    }
  }, [canEditModule, canViewField, kanbanGroupBy, moduleConfig, resolvedModuleId, showListMessage, tableQueryResult]);

  const handleKanbanDragHandlePointerDown = useCallback((
    record: any,
    sourceColumnKey: string,
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const groupField = moduleConfig?.fields.find((field) => field.key === kanbanGroupBy);
    if (!moduleConfig?.table || !kanbanGroupBy || !groupField || !record?.id) return;

    if (!canEditModule || groupField.readonly || (canViewField ? canViewField(kanbanGroupBy) === false : false)) {
      showListMessage("warning", "شما دسترسی ویرایش این کارت را ندارید.");
      return;
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    kanbanDragRef.current = {
      record,
      sourceColumnKey,
      fieldKey: kanbanGroupBy,
    };
    setKanbanDraggingRecordId(String(record.id));
    setKanbanDragOverColumn(sourceColumnKey);

    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";

    const getColumnKeyFromPoint = (pointerEvent: PointerEvent) => {
      const element = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY) as HTMLElement | null;
      return element?.closest<HTMLElement>("[data-kanban-column-key]")?.dataset.kanbanColumnKey || null;
    };

    let cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      document.body.style.cursor = previousCursor;
      kanbanDragRef.current = null;
      setKanbanDraggingRecordId(null);
      setKanbanDragOverColumn(null);
    }

    function handlePointerMove(pointerEvent: PointerEvent) {
      setKanbanDragOverColumn(getColumnKeyFromPoint(pointerEvent));
    }

    function handlePointerUp(pointerEvent: PointerEvent) {
      const targetColumnKey = getColumnKeyFromPoint(pointerEvent);
      const dragState = kanbanDragRef.current;
      cleanup();

      if (!dragState || dragState.fieldKey !== kanbanGroupBy || !targetColumnKey) return;
      if (targetColumnKey === dragState.sourceColumnKey) return;
      void handleKanbanRecordMove(dragState.record, targetColumnKey);
    }

    function handlePointerCancel() {
      cleanup();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerCancel, { once: true });
  }, [canEditModule, canViewField, handleKanbanRecordMove, kanbanGroupBy, moduleConfig, showListMessage]);

  const handleExport = handleExportExcel;

  const exportMenuItems: MenuProps["items"] = useMemo(() => {
    if (!selectedRowKeys.length) return [];
    return [
      {
        key: 'excel_export',
        icon: <FileExcelOutlined />,
        label: 'خروجی اکسل',
        onClick: () => {
          void handleExportExcel();
        },
      },
      {
        key: 'print_export',
        icon: <FilePdfOutlined />,
        label: 'پرینت / PDF',
        onClick: () => {
          void handleExportPrint();
        },
      },
    ];
  }, [handleExportExcel, handleExportPrint, selectedRowKeys.length]);

  const moduleActionItems: MenuProps["items"] = useMemo(() => {
    const items: MenuProps["items"] = [];

    if (!isSystemManagedModule && canOpenGoals) {
      items.push({ key: "goals", label: "هدف‌گذاری" });
    }
    if (!isSystemManagedModule && canOpenWorkflows) {
      items.push({ key: "workflows", label: "گردش کارها" });
    }
    if (!isSystemManagedModule && canEditModule) {
      items.push({ key: "excel_import", icon: <FileExcelOutlined />, label: "وارد کردن از اکسل" });
    }
    if (!isSystemManagedModule && canEditModule && resolvedModuleId === "products") {
      items.push({ key: "bulk_create", icon: <PlusOutlined />, label: "افزودن گروهی" });
    }
    if (resolvedModuleId === "production_orders") {
      items.push({ key: "group_orders", label: "سفارشات گروهی" });
    }

    if (isWebFormTargetModule(resolvedModuleId)) {
      items.push({ key: "web_forms", label: "وب فرم‌ها" });
    }
    if (canOpenModuleSettings && items.length > 0) {
      items.push({ type: "divider" });
    }

    if (canOpenModuleSettings) {
      items.push({
        key: "module_settings",
        icon: <SettingOutlined />,
        label: `تنظیمات «${moduleConfig?.titles.fa || "ماژول"}»`,
      });
    }

    return items;
  }, [canEditModule, canOpenGoals, canOpenModuleSettings, canOpenWorkflows, isSystemManagedModule, resolvedModuleId, moduleConfig?.titles.fa]);
  const hasModuleActionItems = Array.isArray(moduleActionItems) && moduleActionItems.length > 0;

  const handleModuleActionClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "goals") {
      setIsGoalsModalOpen(true);
      return;
    }
    if (key === "workflows") {
      setIsWorkflowsModalOpen(true);
      return;
    }
    if (key === "excel_import") {
      setIsExcelImportModalOpen(true);
      return;
    }
    if (key === "bulk_create") {
      setIsBulkProductsModalOpen(true);
      return;
    }
    if (key === "group_orders") {
      navigate("/production_group_orders");
      return;
    }
    if (key === "web_forms") {
      navigate(`/web_forms?targetModule=${resolvedModuleId}`);
      return;
    }
    if (key === "module_settings") {
      if (!canOpenModuleSettings) {
        showListMessage('error', 'دسترسی به تنظیمات این ماژول را ندارید.');
        return;
      }
      navigate(`/settings?tab=module_settings&moduleId=${resolvedModuleId}`);
    }
  };

  if (!resolvedModuleId || !moduleConfig) return null;
  if (!canViewModule && !loading && accessibleData.length === 0) {
    return (
      <div className="p-6">
        <Empty description="دسترسی مشاهده برای این ماژول ندارید" />
      </div>
    );
  }

  return (
    <div className="module-list-page box-border p-3 md:p-6 max-w-[1800px] mx-auto pb-28 md:pb-8 h-full min-h-0 flex flex-col overflow-hidden">
        <div className="flex flex-col gap-0 mb-1 md:mb-2 shrink-0">
          {/* ردیف ۱: عنوان + شمارنده + دکمه افزودن */}
        <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 shrink-0">
                <h1 className="text-2xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2 min-w-0">
                <span className="w-2 h-8 bg-leather-500 rounded-full inline-block shrink-0"></span>
                <span className="truncate">{moduleConfig.titles.fa}</span>
            </h1>
            <Badge
                overflowCount={999}
                count={
                  <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 shadow-none font-['Vazirmatn'] persian-number">
                    {toPersianNumber(tableQueryResult.data?.total || 0)}
                  </span>
                }
                style={{ backgroundColor: 'transparent', boxShadow: 'none' }}
                className="module-list-header-count"
             />
            </div>

            {((canShowGoalCards && !isSystemManagedModule) || selectedRowKeys.length > 0) ? (
              <div className="order-last basis-full pt-1 min-w-0 md:order-none md:-mt-1 md:basis-auto md:pt-0 md:flex md:flex-[0_1_666px] md:items-start md:justify-start md:self-start xl:flex-[0_1_742px]">
                <div
                  ref={canShowGoalCards && selectedRowKeys.length === 0 ? utilitySlotRef : undefined}
                  className="w-full min-h-[42px]"
                  style={selectedRowKeys.length > 0 && utilitySlotHeight ? { minHeight: `${utilitySlotHeight}px` } : undefined}
                >
                  {selectedRowKeys.length > 0 ? (
                    <BulkActionsBar
                      placement="inline"
                      selectedCount={selectedRowKeys.length}
                      onClear={() => {
                        setSelectedRowKeys([]);
                        setSelectedRowsMap({});
                      }}
                      onSelectAllPages={visibleSelectableRowKeys.length > 0 ? handleSelectAllAcrossPages : undefined}
                      selectAllPagesLabel={
                        totalFilteredRecordCount > 0
                          ? `انتخاب همه ${toPersianNumber(totalFilteredRecordCount)} رکورد`
                          : "انتخاب همه رکوردها"
                      }
                      selectAllPagesLoading={selectAllPagesLoading}
                      selectAllPagesDisabled={selectAllPagesLoading}
                      onEdit={selectedRowKeys.length && canEditModule && (!isSystemManagedModule || !!tagsField) ? handleBulkEditOpen : undefined}
                      onCopy={selectedRowKeys.length && canEditModule && !isSystemManagedModule ? handleCopyViaCreateForm : undefined}
                      onDelete={selectedRowKeys.length && canDeleteModule && !isSystemManagedModule ? handleBulkDelete : undefined}
                      onExport={selectedRowKeys.length ? handleExport : undefined}
                      exportMenuItems={selectedRowKeys.length ? exportMenuItems : undefined}
                      extraActions={[
                        ...(bulkBuildSourceModule && selectedRowKeys.length > 0 && canEditModule && !isSystemManagedModule
                          ? [
                              {
                                key: "build_package",
                                icon: <AppstoreAddOutlined />,
                                tooltip: "ساخت پکیج",
                                onClick: () => setBulkBuildTarget("product_bundles"),
                              },
                              {
                                key: "build_price_list",
                                icon: <TagsOutlined />,
                                tooltip: "ساخت لیست قیمت",
                                onClick: () => setBulkBuildTarget("price_lists"),
                              },
                            ]
                          : []),
                        ...(selectedRowKeys.length > 0 && canBulkSendSms
                          ? [
                              {
                                key: "bulk_sms",
                                icon: <MessageOutlined />,
                                tooltip: "ارسال پیامک گروهی",
                                onClick: handleBulkSmsOpen,
                              },
                            ]
                          : []),
                      ]}
                      primaryActionLabel={
                        selectedRowKeys.length > 0 && resolvedModuleId === 'production_orders'
                          ? 'ایجاد سفارش گروهی جدید'
                          : undefined
                      }
                      onPrimaryAction={
                        selectedRowKeys.length > 0 && resolvedModuleId === 'production_orders'
                          ? handleCreateGroupOrderFromSelection
                          : undefined
                      }
                      primaryActionDisabled={
                        resolvedModuleId === 'production_orders' && selectedRowKeys.length > 0
                          ? !allSelectedPendingInProductionOrders
                          : false
                      }
                      primaryActionTooltip={
                        resolvedModuleId === 'production_orders' &&
                        selectedRowKeys.length > 0 &&
                        !allSelectedPendingInProductionOrders
                          ? 'فقط سفارش‌های تولید با وضعیت «در انتظار» قابل تبدیل به سفارش گروهی هستند.'
                          : undefined
                      }
                    />
                  ) : (
                    !isSystemManagedModule ? (
                      <GoalProgressSlider
                        moduleId={resolvedModuleId}
                        placement="module_list"
                      />
                    ) : null
                  )}
                </div>
              </div>
            ) : null}

            {selectedRowKeys.length === 0 && (
              <div className="flex items-center gap-2 shrink-0">
                {resolvedModuleId === "voip_call_reports" && (
                  <Button
                    icon={<ReloadOutlined />}
                    loading={voipCallSyncing}
                    onClick={() => {
                      void handleSyncVoipCalls();
                    }}
                    className="rounded-xl"
                  >
                    همگام‌سازی تماس‌ها
                  </Button>
                )}
                {canCreateModule && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => navigate(`/${resolvedModuleId}/create`)}
                    aria-label={`افزودن ${moduleConfig.titles.faSingular || moduleConfig.titles.fa}`}
                    className="rounded-xl bg-leather-600 hover:!bg-leather-500 shadow-lg shadow-leather-500/30 shrink-0"
                  >
                    افزودن
                  </Button>
                )}
                {hasModuleActionItems && (
                  <Dropdown
                    trigger={["click"]}
                    menu={{
                      items: moduleActionItems,
                      onClick: handleModuleActionClick,
                    }}
                    placement="bottomLeft"
                  >
                    <Button icon={<EllipsisOutlined />} className="rounded-xl" />
                  </Dropdown>
                )}
              </div>
            )}
        </div>

        <Toolbar
          viewMode={viewMode}
          setViewMode={setViewMode}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onRefresh={handleRefresh}
          kanbanEnabled={availableGroupFields.length > 0}
          calendarEnabled={availableCalendarFields.length > 0}
          mapEnabled={mapEnabled}
          kanbanGroupBy={kanbanGroupBy}
          kanbanGroupOptions={availableGroupFields.map((f) => ({ label: f.labels.fa, value: f.key }))}
          onKanbanGroupChange={setKanbanGroupBy}
          calendarDateField={calendarDateField}
          calendarDateFieldOptions={availableCalendarFields.map((field) => ({ label: getFieldLabelFa(field, { moduleId: resolvedModuleId, fallback: field.key }), value: field.key }))}
          onCalendarDateFieldChange={setCalendarDateField}
        />

        {hasListFilterBubbles ? (
        <div className="h-7 shrink-0">
          <div className="flex h-full items-center gap-1 overflow-x-auto px-0.5 no-scrollbar">
            {allListFilterBubbles.map((bubble) => (
              <span
                key={bubble.id}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white/92 px-2 py-0.5 text-[10px] leading-4 text-gray-600 shadow-sm dark:border-white/10 dark:bg-[#111827]/90 dark:text-gray-200"
              >
                <span className="truncate">{bubble.label}</span>
                {typeof bubble.onRemove === "function" ? (
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-gray-400 transition hover:bg-gray-100 hover:text-red-500 dark:hover:bg-white/10"
                    onClick={bubble.onRemove}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
             {allListFilterBubbles.length > 0 ? (
              <Button type="link" size="small" className="!h-6 !px-1 shrink-0 text-[10px]" onClick={clearAllListFilters}>
                حذف همه فیلترها
              </Button>
            ) : null}
          </div>
        </div>
        ) : null}
        </div>

         <div className="mb-2 md:mb-3 shrink-0">
           <ViewManager 
             moduleId={resolvedModuleId} 
             currentView={currentView} 
             onViewChange={handleViewChange} 
             onRefresh={handleRefresh}
           />
         </div>

         <ViewWrapper isFullscreen={false}>
         <div className="flex-1 min-h-0 overflow-hidden relative rounded-[1.5rem]">
            {showContentSkeleton || showListSkeleton ? (
                <ModuleListContentSkeleton viewMode={viewMode} />
            ) : accessibleData.length === 0 ? (
             <div className="flex h-full items-center justify-center bg-white dark:bg-[#1a1a1a] rounded-[1.5rem] border border-dashed border-gray-300">
                <Empty description="هیچ داده‌ای یافت نشد" />
             </div>
           ) : (
              <>
                {viewMode === ViewMode.LIST && (
                <div className="bg-white dark:bg-[#1a1a1a] rounded-[1.5rem] shadow-sm border border-gray-200 dark:border-gray-800 h-full overflow-hidden p-1">
                  <SmartTableRenderer 
                    moduleConfig={moduleConfig}
                     data={enrichedData} 
                     loading={queryPending}
                     deferredDataLoading={deferredListDataLoading}
                     tableLayout="fixed"
                     visibleColumns={visibleColumns.length > 0 ? visibleColumns : undefined}
                     pagination={tableProps.pagination}
                     onChange={handleTableChange}
                     rowSelection={{ selectedRowKeys, onChange: handleRowSelectionChange, preserveSelectedRowKeys: true }}
                    onVisibleDataChange={handleVisibleDataChange}
                    onRow={(record: any) => ({
                      onClick: (event: React.MouseEvent<HTMLElement>) => {
                        if (selectedRowKeys.length > 0) return;
                        const target = event.target as HTMLElement | null;
                        if (
                          target?.closest(
                            'a,button,input,label,select,textarea,[role="button"],.ant-btn,.ant-checkbox-wrapper,.ant-checkbox'
                          )
                        ) {
                          return;
                        }
                        openRecordFromList(record);
                      },
                      style: { cursor: selectedRowKeys.length > 0 ? 'default' : 'pointer' },
                    })}
                    dynamicOptions={dynamicOptions}
                     relationOptions={effectiveRelationOptions}
                     tagsMap={tagsMap}
                     allUsers={allUsers}
                     allRoles={allRoles}
                    canViewField={canViewField}
                     columnFilters={columnFilters}
                     onColumnFiltersChange={handleColumnFiltersChange}
                     sorters={visibleSorters}
                      showFilterBar={false}
                      containerClassName="h-full rounded-[1.2rem] overflow-hidden"
                      />
                 </div>
                )}
                  {viewMode === ViewMode.GRID && (
                <div className="h-full overflow-y-auto p-1 custom-scrollbar flex flex-col">
                            <GridView
                              data={gridData}
                              moduleId={resolvedModuleId}
                              moduleConfig={moduleConfig}
                              imageField={imageField}
                              tagsField={tagsField}
                              statusField={statusField}
                              categoryField={categoryField}
                              selectedRowKeys={selectedRowKeys}
                              setSelectedRowKeys={setSelectedRowKeys}
                              navigate={moduleListNavigate}
                              canViewField={canViewField}
                              allUsers={allUsers}
                              allRoles={allRoles}
                              relationOptions={effectiveRelationOptions}
                            />
                            
                    {/* Load More Button */}
                    {gridPageSize < enrichedData.length && (
                      <div className="mt-4 flex justify-center items-center py-5 border-t border-gray-200 dark:border-gray-800">
                      <Button 
                        size="large"
                        onClick={() => setGridPageSize((prev) => Math.min(prev + gridLoadStep, enrichedData.length))}
                        className="h-12 px-6 sm:px-8 font-bold w-full sm:w-auto max-w-full rounded-2xl border-[rgba(var(--brand-300-rgb),0.65)] bg-white/90 hover:!border-[rgba(var(--brand-500-rgb),0.9)] hover:!text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--app-dark-surface-rgb),0.9)]"
                      >
                        مشاهده بیشتر ({gridPageSize} از {enrichedData.length})
                      </Button>
                      </div>
                    )}
                </div>
                )}
                {viewMode === ViewMode.MAP && moduleConfig && resolvedModuleId && (
                <div className="h-full">
                  <MapView
                    data={enrichedData}
                    moduleId={resolvedModuleId}
                    moduleConfig={moduleConfig}
                    navigate={moduleListNavigate}
                  />
                </div>
                )}
                {viewMode === ViewMode.CALENDAR && moduleConfig && resolvedModuleId && (
                <div className="h-full">
                  <ModuleCalendarView
                    data={enrichedData}
                    moduleId={resolvedModuleId}
                    moduleConfig={moduleConfig}
                    dateFields={availableCalendarFields}
                    dateFieldKey={calendarDateField || availableCalendarFields[0]?.key || ""}
                    onDateFieldChange={setCalendarDateField}
                    navigate={moduleListNavigate}
                  />
                </div>
                )}
                {viewMode === ViewMode.KANBAN && (
                <div className="flex items-start gap-5 md:gap-6 h-full overflow-x-auto pb-4 px-2">
                  {moduleConfig.fields.find(f => f.key === kanbanGroupBy)?.options?.map((col: any) => {
                    const columnKey = String(col?.value ?? '');
                    const columnItems = enrichedData.filter((d: any) => d[kanbanGroupBy] === col.value);
                    const visibleCount = kanbanVisibleCounts[columnKey] ?? getDefaultKanbanPageSize();
                    const visibleItems = columnItems.slice(0, visibleCount);
                    const canLoadMore = columnItems.length > visibleCount;
                    return (
                      <div
                        key={columnKey}
                        data-kanban-column-key={columnKey}
                        className={`min-w-[292px] w-[292px] flex flex-col bg-gray-100/55 dark:bg-white/5 rounded-[1.6rem] p-3 border border-gray-200 dark:border-gray-800 shadow-sm h-full transition ${kanbanDragOverColumn === columnKey ? "ring-2 ring-[rgba(var(--brand-500-rgb),0.45)]" : ""}`}
                      >
                        <div className="flex items-center justify-between p-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color || '#ccc' }}></span>
                            <span className="font-bold text-gray-700 dark:text-gray-300 text-sm">{col.label}</span>
                          </div>
                          <span className="bg-white/80 dark:bg-white/10 px-2 py-0.5 rounded-full text-xs text-gray-500">
                            {columnItems.length}
                          </span>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 custom-scrollbar py-1 pb-3">
                          {visibleItems.map((item: any) => (
                            <RenderCardItem 
                              key={item.id} 
                              item={item} 
                              moduleId={resolvedModuleId}
                              moduleConfig={moduleConfig}
                              imageField={imageField}
                              tagsField={tagsField}
                              statusField={statusField}
                              categoryField={categoryField}
                              selectedRowKeys={selectedRowKeys}
                              setSelectedRowKeys={setSelectedRowKeys}
                              navigate={moduleListNavigate}
                              minimal={true}
                              canViewField={canViewField}
                              allUsers={allUsers}
                              allRoles={allRoles}
                              relationOptions={effectiveRelationOptions}
                              showDragHandle={canEditModule && !!kanbanGroupBy}
                              isDragActive={kanbanDraggingRecordId === String(item?.id || "")}
                              dragHandleTitle="جابجایی کارت"
                              onDragHandlePointerDown={(cardItem, event) =>
                                handleKanbanDragHandlePointerDown(cardItem, columnKey, event)
                              }
                            />
                          ))}
                        </div>
                        {canLoadMore ? (
                          <Button
                            block
                            className="mt-2 rounded-2xl border-[rgba(var(--brand-300-rgb),0.65)] bg-white/88 text-[11px] font-semibold text-[rgb(var(--brand-700-rgb))] hover:!border-[rgba(var(--brand-500-rgb),0.9)] hover:!text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--app-dark-surface-rgb),0.92)] dark:text-[rgba(var(--brand-100-rgb),0.96)]"
                            onClick={() => {
                              setKanbanVisibleCounts((prev) => ({
                                ...prev,
                                [columnKey]: Math.min(
                                  (prev[columnKey] ?? getDefaultKanbanPageSize()) + getKanbanLoadStep(),
                                  columnItems.length
                                ),
                              }));
                            }}
                          >
                            نمایش بیشتر ({visibleItems.length} از {columnItems.length})
                          </Button>
                        ) : null}
                        {canCreateModule ? (
                          <Button
                            type="dashed"
                            block
                            icon={<PlusOutlined />}
                            className="mt-2 text-xs rounded-2xl text-gray-500 hover:text-leather-600 hover:border-leather-400"
                            onClick={() => {
                              navigate(`/${resolvedModuleId}/create`, {
                                state: { initialValues: { [kanbanGroupBy]: col.value } }
                              });
                            }}
                          >
                            افزودن به {col.label}
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
               )}
             </>
           )}
         </div>
         </ViewWrapper>
       {isBulkEditOpen && (
           <SmartForm 
               module={isSystemManagedModule && isBulkEditMode ? (tagOnlyBulkEditModule || moduleConfig) : moduleConfig}
               visible={isBulkEditOpen}
               recordId={isSystemManagedModule ? undefined : (editRecordId || undefined)}
               onCancel={() => {
                 setIsBulkEditOpen(false);
                 setEditRecordId(null);
                 setIsBulkEditMode(false);
                 tableQueryResult.refetch();
               }}
               onSave={isBulkEditMode ? handleBulkSave : undefined}
                title={isBulkEditMode ? `ویرایش گروهی ${selectedRowKeys.length} مورد` : `ویرایش مورد انتخابی`}
               isBulkEdit={isBulkEditMode}
           />
       )}
      {bulkBuildModule && (
        <SmartForm
          module={bulkBuildModule}
          visible={!!bulkBuildModule}
          onCancel={() => setBulkBuildTarget(null)}
          onSave={handleBuildRecordFromSelection}
          title={
            bulkBuildTarget === "product_bundles"
              ? `ساخت پکیج از ${selectedRowKeys.length} مورد`
              : `ساخت لیست قیمت از ${selectedRowKeys.length} مورد`
          }
        />
      )}
      {resolvedModuleId === 'products' && (
        <BulkProductsCreateModal
          open={isBulkProductsModalOpen}
          onClose={() => setIsBulkProductsModalOpen(false)}
          onCreated={() => {
            setIsBulkProductsModalOpen(false);
            tableQueryResult.refetch();
          }}
        />
      )}
      {isWorkflowsModalOpen ? (
        <WorkflowsManager
          inline={false}
          open={isWorkflowsModalOpen}
          onClose={() => setIsWorkflowsModalOpen(false)}
          defaultModuleId={resolvedModuleId}
          context="module_list"
        />
      ) : null}
      {isGoalsModalOpen ? (
        <GoalsManager
          inline={false}
          open={isGoalsModalOpen}
          onClose={() => setIsGoalsModalOpen(false)}
          defaultModuleId={resolvedModuleId}
        />
      ) : null}
      <ExcelImportWizard
        open={isExcelImportModalOpen}
        moduleId={resolvedModuleId}
        moduleConfig={moduleConfig}
        onClose={() => setIsExcelImportModalOpen(false)}
        onImported={() => {
          setIsExcelImportModalOpen(false);
          tableQueryResult.refetch();
        }}
      />
      <PrintSection
        isPrintModalOpen={listPrintManager.isPrintModalOpen}
        onClose={() => listPrintManager.setIsPrintModalOpen(false)}
        onPreparePrint={listPrintManager.preparePrint}
        onPrint={listPrintManager.handlePrint}
        printTemplates={listPrintManager.printTemplates}
        selectedTemplateId={listPrintManager.selectedTemplateId}
        onSelectTemplate={listPrintManager.setSelectedTemplateId}
        renderPrintCard={listPrintManager.renderPrintCard}
        printMode={listPrintManager.printMode}
        printableFields={listPrintManager.printableFieldsForTemplate}
        selectedPrintFields={listPrintManager.selectedPrintFields}
        onTogglePrintField={listPrintManager.handleTogglePrintField}
        onSavePrintFields={listPrintManager.handleSavePrintFields}
        savingPrintFields={listPrintManager.savingPrintFields}
        onRefreshPreview={listPrintManager.refreshTemplates}
        allowFieldSelectionTab={listPrintManager.allowFieldSelectionTab}
        previewMeta={listPrintManager.previewMeta}
      />
            {isBulkSmsComposerOpen ? (
        <MessageComposerModal
          open
          mode="sms"
          moduleId={resolvedModuleId}
          record={bulkSmsSourceRecord}
          smsRecipients={bulkSmsRecipients}
          onCancel={() => {
            setIsBulkSmsComposerOpen(false);
            setBulkSmsRecipients([]);
            setBulkSmsSourceRecord(null);
          }}
        />
      ) : null}
      {previewRecordId && useQuickPreviewModal ? (
        <RelatedRecordPopover
          mode="modal"
          moduleId={resolvedModuleId}
          recordId={previewRecordId}
          open={!!previewRecordId}
          overlayZIndex={6200}
          hideFullRecordAction={moduleConfig?.hideFullRecordAction ?? detailDisabled}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setPreviewRecordId(null);
          }}
          onNavigate={(path) => {
            setPreviewRecordId(null);
            navigate(path);
          }}
        />
      ) : null}
    </div>
  );
};

export default ModuleListRefine;



