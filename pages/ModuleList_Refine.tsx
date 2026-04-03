import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useTable } from "@refinedev/antd";
import { CrudFilter, CrudFilters, CrudSort, useDeleteMany } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { MODULES } from "../moduleRegistry";
import SmartTableRenderer from "../components/SmartTableRenderer";
import { BlockType, FieldType, ModuleDefinition, SavedView, ViewMode } from "../types";
import { App, Badge, Button, Dropdown, Empty, Skeleton } from "antd";
import type { MenuProps } from "antd";
import type { FilterValue } from "antd/es/table/interface";
import { AppstoreAddOutlined, EllipsisOutlined, FileExcelOutlined, FilePdfOutlined, PlusOutlined, SettingOutlined, TagsOutlined } from "@ant-design/icons";
import ViewManager from "../components/ViewManager";
import SmartForm from "../components/SmartForm";
import { supabase } from "../supabaseClient";
import Toolbar from "../components/moduleList/Toolbar";
import BulkActionsBar from "../components/moduleList/BulkActionsBar";
import ViewWrapper from "../components/moduleList/ViewWrapper";
import GridView from "../components/moduleList/GridView";
import MapView from "../components/moduleList/MapView";
import RenderCardItem from "../components/moduleList/RenderCardItem";
import { canAccessAssignedRecord, fetchCurrentUserRoleContext, GOALS_PERMISSION_KEY, WORKFLOWS_PERMISSION_KEY } from "../utils/permissions";
import BulkProductsCreateModal from "../components/products/BulkProductsCreateModal";
import WorkflowsManager from "../components/workflows/WorkflowsManager";
import { buildCopyPayload, copyProductionOrderRelations, detectCopyNameField } from "../utils/recordCopy";
import { attachTaskCompletionIfNeeded } from "../utils/taskCompletion";
import { fetchTaskSourceRecordOptions, getTaskRelationFieldKey, resolveTaskSourceLink } from "../utils/taskMeta";
import ExcelImportWizard from "../components/moduleList/ExcelImportWizard";
import { supportsSystemCode } from "../utils/systemCode";
import { buildCustomerRelationSearchText } from "../utils/customerRelation";
import { getPreferredRelationTargetField } from "../utils/relationTargetField";
import PrintSection from "../components/moduleShow/PrintSection";
import { useListPrintManager } from "../utils/printTemplates/useListPrintManager";
import { buildListPrintableFields, escapeCsvCell, formatListCellValue } from "../utils/listPrintExport";
import { readCurrencyConfig } from "../utils/currency";
import { fetchAssigneeDirectory, fetchDynamicOptionsMap, fetchFormulaOptions, fetchRecordTagsMap } from "../utils/referenceData";
import { toFaErrorMessage } from "../utils/errorMessageFa";
import { getSingleOptionLabel } from "../utils/optionHelpers";
import { getCachedAuthUser } from "../utils/sessionCache";
import { syncRecordTags } from "../utils/recordTags";
import { writeModuleOptionSnapshot } from "../utils/moduleOptionSnapshot";
import { isWebFormTargetModule } from "../utils/webForms";
import GoalsManager from "../components/goals/GoalsManager";
import GoalProgressSlider from "../components/goals/GoalProgressSlider";

const getDefaultGridPageSize = () => 16;
const getGridLoadStep = () => 16;
type ColumnFiltersState = Record<string, FilterValue | null>;
type BulkBuildTarget = "product_bundles" | "price_lists" | null;

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

interface ModuleListOptionsSnapshot {
  dynamicOptions: Record<string, any[]>;
  relationOptions: Record<string, any[]>;
  allUsers: any[];
  allRoles: any[];
}

const moduleListOptionsCache = new Map<string, ModuleListOptionsSnapshot>();

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

const getDefaultSorters = (moduleConfig?: ModuleDefinition | null): CrudSort[] => {
  const hasUpdatedAt = moduleConfig?.fields?.some((field) => field.key === "updated_at");
  return [{ field: hasUpdatedAt ? "updated_at" : "created_at", order: "desc" }];
};

const toHeaderOnlyModule = (module: ModuleDefinition, hiddenBlockId: string): ModuleDefinition => ({
  ...module,
  blocks: (module.blocks || []).filter((block) => block.id !== hiddenBlockId),
});

const buildPackageItemsFromProducts = (records: any[]) =>
  records
    .map((record: any) => {
      const quantity = 1;
      const unitPrice = Number(record?.sell_price || 0) || 0;
      return {
        product_id: record?.id || null,
        product_name: record?.name || record?.title || record?.id || "-",
        product_type: record?.product_type || "goods",
        quantity,
        main_unit: record?.main_unit || "عدد",
        unit_price: unitPrice,
        discount: 0,
        discount_type: "amount",
        total_price: quantity * unitPrice,
      };
    })
    .filter((item: any) => item.product_id);

const buildPriceListItemsFromProducts = (records: any[]) => {
  const currencyLabel = readCurrencyConfig().label || "";
  return records
    .map((record: any) => ({
      product_id: record?.id || null,
      price: Number(record?.sell_price || 0) || 0,
      currency_label: currencyLabel,
      unit_name: record?.main_unit || "",
    }))
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
    <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 h-full overflow-hidden p-4">
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
      const baseStyle = {
        marginTop: 88,
        borderRadius: 14,
        color: "#fff",
        boxShadow: "0 16px 34px rgba(120, 74, 23, 0.24)",
      } as React.CSSProperties;
      const styleByType: Record<string, React.CSSProperties> = {
        success: {
          background: "linear-gradient(135deg, #7c4a17 0%, #a16207 100%)",
          border: "1px solid rgba(251, 191, 36, 0.34)",
        },
        warning: {
          background: "linear-gradient(135deg, #9a3412 0%, #c2410c 100%)",
          border: "1px solid rgba(251, 191, 36, 0.32)",
        },
        loading: {
          background: "linear-gradient(135deg, #7c4a17 0%, #92400e 100%)",
          border: "1px solid rgba(251, 191, 36, 0.3)",
        },
        error: {
          background: "linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)",
          border: "1px solid rgba(252, 165, 165, 0.3)",
          boxShadow: "0 16px 34px rgba(127, 29, 29, 0.24)",
        },
      };
      const config = {
        content,
        duration: type === "loading" ? duration ?? 0 : duration,
        style: { ...baseStyle, ...(styleByType[type] || styleByType.success) },
      };
      if (type === "loading") return msg.loading(config);
      if (type === "warning") return msg.warning(config);
      if (type === "error") return msg.error(config);
      return msg.success(config);
    },
    [msg]
  );
  
  const moduleConfig = resolvedModuleId ? MODULES[resolvedModuleId] : null;
  const persistedState = useMemo(
    () => readPersistedModuleListState(resolvedModuleId, storageKeySuffix),
    [resolvedModuleId, storageKeySuffix]
  );
  const effectiveInitialViewFilters = useMemo(
    () =>
      Array.isArray(initialViewFiltersOverride) && initialViewFiltersOverride.length > 0
        ? initialViewFiltersOverride
        : (persistedState?.viewFilters || []),
    [initialViewFiltersOverride, persistedState?.viewFilters]
  );
  const defaultSorters = useMemo(
    () => (persistedState?.sorters?.length ? persistedState.sorters : getDefaultSorters(moduleConfig)),
    [moduleConfig, persistedState?.sorters]
  );

  // ✅ Use default view mode from module config, fallback to LIST
  const [viewMode, setViewMode] = useState<ViewMode>(persistedState?.viewMode || moduleConfig?.defaultViewMode || ViewMode.LIST);
  const [searchTerm, setSearchTerm] = useState(persistedState?.searchTerm || "");
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
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
  const [viewFiltersState, setViewFiltersState] = useState<CrudFilters>(effectiveInitialViewFilters);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(persistedState?.columnFilters || {});
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);  // ✅ ستون‌های انتخاب‌شده
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});  // ✅ اضافه شد
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});  // ✅ اضافه شد
  const [optionsReady, setOptionsReady] = useState(false);
  const [tagsMap, setTagsMap] = useState<Record<string, any[]>>({});  // ✅ Map of record id to tags
  const [tagsLoading, setTagsLoading] = useState(false);
  const [gridPageSize, setGridPageSize] = useState<number>(() => getDefaultGridPageSize()); // ✅ Grid pagination
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allRoles, setAllRoles] = useState<any[]>([]);
  const [fieldPermissions, setFieldPermissions] = useState<Record<string, boolean>>({});
  const [modulePermissions, setModulePermissions] = useState<{ view?: boolean; edit?: boolean; delete?: boolean; record_scope?: 'all' | 'own' | 'team' }>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRoleId, setCurrentUserRoleId] = useState<string | null>(null);
  const [isBulkProductsModalOpen, setIsBulkProductsModalOpen] = useState(false);
  const [isWorkflowsModalOpen, setIsWorkflowsModalOpen] = useState(false);
  const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false);
  const [isExcelImportModalOpen, setIsExcelImportModalOpen] = useState(false);
  const [canOpenWorkflows, setCanOpenWorkflows] = useState(true);
  const [canOpenGoals, setCanOpenGoals] = useState(true);
  const [canShowGoalCards, setCanShowGoalCards] = useState(true);
  const [listPrintRows, setListPrintRows] = useState<any[]>([]);
  const [bulkBuildTarget, setBulkBuildTarget] = useState<BulkBuildTarget>(null);
  const [taskRelationOptionsByField, setTaskRelationOptionsByField] = useState<Record<string, any[]>>({});
  const hasInitializedModuleStateRef = useRef(false);

  const { tableProps, tableQueryResult, setFilters, sorters, setSorters, setCurrent } = useTable({
    resource: resolvedModuleId,
    sorters: { initial: defaultSorters },
    pagination: { pageSize: 10 }, 
    queryOptions: {
      enabled: !!resolvedModuleId,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    filters: { initial: effectiveInitialViewFilters },
    syncWithLocation: false,
  });

  const { mutate: deleteMany } = useDeleteMany();

  const loading = tableQueryResult.isLoading;
  const queryPending = loading || tableQueryResult.isFetching;
  const allData = tableQueryResult.data?.data || [];
  const hasQueryResult = !!tableQueryResult.data || !!tableQueryResult.error;
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
  const showContentSkeleton = queryPending && !hasQueryResult;

  useEffect(() => {
    if (!hasInitializedModuleStateRef.current) {
      hasInitializedModuleStateRef.current = true;
      return;
    }

    const restoredState = readPersistedModuleListState(resolvedModuleId, storageKeySuffix);
    const restoredSorters = restoredState?.sorters?.length ? restoredState.sorters : getDefaultSorters(moduleConfig);
    const restoredViewFilters =
      Array.isArray(initialViewFiltersOverride) && initialViewFiltersOverride.length > 0
        ? initialViewFiltersOverride
        : (restoredState?.viewFilters || []);
    const cachedOptions = resolvedModuleId ? moduleListOptionsCache.get(resolvedModuleId) : null;
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
    setKanbanGroupBy("");
    setSearchTerm(restoredState?.searchTerm || "");
    setViewFiltersState(restoredViewFilters);
    setColumnFilters(restoredState?.columnFilters || {});
    setDynamicOptions(cachedOptions?.dynamicOptions || {});
    setRelationOptions(cachedOptions?.relationOptions || {});
    setAllUsers(cachedOptions?.allUsers || []);
    setAllRoles(cachedOptions?.allRoles || []);
    setOptionsReady(!!cachedOptions);
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
    applyCombinedFilters(
      restoredViewFilters,
      restoredState?.searchTerm || "",
      restoredState?.columnFilters || {},
      false,
    );
    setCurrent?.(1);
    setSorters(restoredSorters);
  }, [initialViewFiltersOverride, moduleConfig, resolvedModuleId, setCurrent, setSorters, storageKeySuffix]);

  const fetchPermissions = useCallback(async () => {
    if (!resolvedModuleId) return;
    try {
      const context = await fetchCurrentUserRoleContext(supabase);
      if (!context.userId) return;
      setCurrentUserId(context.userId);
      setCurrentUserRoleId(context.roleId);

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
    () => buildListPrintableFields(moduleConfig, canViewField, visibleColumns),
    [canViewField, moduleConfig, visibleColumns]
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

  // ✅ Define field keys FIRST (before any useMemo/useEffect that uses them)
  const imageField = moduleConfig?.fields.find(f => f.type === FieldType.IMAGE)?.key;
  const tagsField = moduleConfig?.fields.find(f => f.type === FieldType.TAGS)?.key;
  const statusField = moduleConfig?.fields.find(f => f.type === FieldType.STATUS)?.key;
  const categoryField = resolvedModuleId === 'tasks'
    ? 'related_to_module'
    : moduleConfig?.fields.find(f => f.key === 'category' || f.key === 'product_category' || f.key === 'business_name')?.key;

  // ✅ Merge tags into allData
  const accessibleData = useMemo(() => {
    if (!canViewModule) return [];
    return allData.filter((record: any) =>
      canAccessAssignedRecord(record, currentUserId, currentUserRoleId, recordScope)
    );
  }, [allData, canViewModule, currentUserId, currentUserRoleId, recordScope]);

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
  const deferredListDataLoading = viewMode === ViewMode.LIST && !queryPending && (!optionsReady || tagsLoading);
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
      setSelectedRowsMap({});
      return;
    }
    setSelectedRowsMap((prev) => {
      const nextMap = { ...prev };
      enrichedData.forEach((row: any) => {
        if (selectedRowKeys.some((key) => String(key) === String(row?.id))) {
          nextMap[String(row.id)] = row;
        }
      });
      Object.keys(nextMap).forEach((key) => {
        if (!selectedRowKeys.some((selectedKey) => String(selectedKey) === key)) {
          delete nextMap[key];
        }
      });
      return nextMap;
    });
  }, [enrichedData, selectedRowKeys]);

  useEffect(() => {
    if (resolvedModuleId !== "tasks" || !enrichedData.length) {
      setTaskRelationOptionsByField({});
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
        if (isActive) setTaskRelationOptionsByField({});
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
  const showListSkeleton = false;
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

  const allVisibleRowsSelected = useMemo(() => {
    if (visibleSelectableRowKeys.length === 0) return false;
    const selectedSet = new Set(selectedRowKeys.map((key) => String(key)));
    return visibleSelectableRowKeys.every((key) => selectedSet.has(String(key)));
  }, [selectedRowKeys, visibleSelectableRowKeys]);

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
      sorters: sorters as CrudSort[],
    };
    window.localStorage.setItem(
      buildModuleListStateKey(resolvedModuleId, storageKeySuffix),
      JSON.stringify(stateToPersist)
    );
  }, [columnFilters, currentView, resolvedModuleId, searchTerm, sorters, storageKeySuffix, viewFiltersState, viewMode, visibleColumns]);

  // ✅ اضافه شد: Fetch dynamic و relation options
  useEffect(() => {
    if (!moduleConfig) return;

    let isActive = true;

    const fetchOptions = async () => {
      setOptionsReady(false);
      try {
        const directory = await fetchAssigneeDirectory(supabase);

        if (!isActive) return;
        setAllUsers(directory.users);
        setAllRoles(directory.roles);

        const dynFields: any[] = [...moduleConfig.fields.filter((f) => (f as any).dynamicOptionsCategory)];
        moduleConfig.blocks?.forEach((b) => {
          if ((b.type === BlockType.TABLE || b.type === BlockType.GRID_TABLE) && b.tableColumns) {
            b.tableColumns.forEach((c) => {
              if (
                (c.type === FieldType.SELECT || c.type === FieldType.MULTI_SELECT) &&
                (c as any).dynamicOptionsCategory
              ) {
                dynFields.push(c);
              }
            });
          }
        });

        const dynCategories: string[] = Array.from(
          new Set(
            dynFields
              .map((f) => (f as any).dynamicOptionsCategory as string | undefined)
              .filter(Boolean)
          )
        ) as string[];

        const dynOpts: Record<string, any[]> = await fetchDynamicOptionsMap(supabase, dynCategories);
        if (!isActive) return;
        try {
          const formulas = await fetchFormulaOptions(supabase);
          if (formulas.length > 0) {
            dynOpts['calculation_formulas'] = formulas;
          }
        } catch (err) {
          console.warn('Could not load calculation formulas', err);
        }
        setDynamicOptions(dynOpts);

        const relFields: any[] = [...moduleConfig.fields.filter((f) => f.type === FieldType.RELATION || f.type === FieldType.USER)];
        moduleConfig.blocks?.forEach((b) => {
          if (b.type === BlockType.TABLE && b.tableColumns) {
            b.tableColumns.forEach((c) => {
              if (c.type === FieldType.RELATION || c.type === FieldType.USER) relFields.push({ ...c, key: `${b.id}_${c.key}` });
            });
          }
        });

        const relOpts: Record<string, any[]> = {};

        const profileOptions = (directory.users || []).map((p: any) => ({ label: p.display_name || p.full_name || p.id, value: p.id }));
        const roleOptions = (directory.roles || []).map((role: any) => ({ label: role.title || role.id, value: role.id }));
        const assigneeOptions = [
          ...profileOptions,
          ...roleOptions.filter((role) => !profileOptions.some((user) => String(user.value) === String(role.value))),
        ];
        relOpts["profiles"] = profileOptions;
        relOpts["assignee_id"] = assigneeOptions;
        relOpts["org_roles"] = roleOptions;
        relOpts["roles"] = roleOptions;

        const relResults = await Promise.all(
          relFields.map(async (field) => {
            if (field.type === FieldType.USER) {
              return { key: field.key, options: profileOptions };
            }
            if (field.relationConfig) {
              const { targetModule, targetField, filter } = field.relationConfig;
              const resolvedTargetField = getPreferredRelationTargetField(targetModule, targetField);
              const includeSystemCode = targetModule !== "cheques" && supportsSystemCode(targetModule);
              const customerExtraFields =
                targetModule === "customers"
                  ? ["full_name", "first_name", "last_name", "business_name", "legal_name", "mobile_1", "phone"]
                  : [];
              const selectFields = Array.from(
                new Set(
                  targetModule === "profiles"
                    ? ["id"].concat(resolvedTargetField ? [resolvedTargetField] : [])
                    : ["id"].concat(includeSystemCode ? ["system_code"] : []).concat(resolvedTargetField ? [resolvedTargetField] : []).concat(customerExtraFields)
                )
              );
              if (targetModule === "shelves" && !selectFields.includes("shelf_number")) {
                selectFields.push("shelf_number");
              }
              const RELATION_BATCH_SIZE = 500;
              const RELATION_MAX_PAGES = 40;
              const runQuery = async (fields: string[]) => {
                const rows: any[] = [];
                for (let page = 0; page < RELATION_MAX_PAGES; page += 1) {
                  const from = page * RELATION_BATCH_SIZE;
                  const to = from + RELATION_BATCH_SIZE - 1;
                  let query = supabase
                    .from(targetModule)
                    .select(fields.join(", "))
                    .range(from, to);
                  if (filter) Object.keys(filter).forEach((k) => (query = query.eq(k, filter[k])));
                  const result = await query;
                  if (result.error) return { data: null as any, error: result.error };
                  const chunk = result.data || [];
                  rows.push(...chunk);
                  if (chunk.length < RELATION_BATCH_SIZE) break;
                }
                return { data: rows, error: null as any };
              };

              let { data: relData, error: relError } = await runQuery(selectFields);
              const errorText = String((relError as any)?.message || (relError as any)?.details || '').toLowerCase();
              const errorCode = String((relError as any)?.code || '').toUpperCase();
              const hasColumnError = errorCode === '42703' || errorCode === 'PGRST204' || errorText.includes('column');

              if (relError && hasColumnError) {
                const fallbackNoSystemCode = selectFields.filter((f) => f !== "system_code");
                let fallback = await runQuery(fallbackNoSystemCode);

                if (fallback.error && targetField) {
                  const fallbackFieldErrorText = String((fallback.error as any)?.message || (fallback.error as any)?.details || '').toLowerCase();
                  const missingTargetField =
                    fallbackFieldErrorText.includes(String(targetField).toLowerCase()) ||
                    String((fallback.error as any)?.code || '').toUpperCase() === '42703' ||
                    String((fallback.error as any)?.code || '').toUpperCase() === 'PGRST204';

                  if (missingTargetField) {
                    const byName = await runQuery(["id", resolvedTargetField]);
                    if (!byName.error) {
                      fallback = byName;
                    } else {
                      fallback = await runQuery(["id"]);
                    }
                  }
                }

                relData = fallback.data;
              }

              const options = (relData || []).map((i: any) => {
                const isCustomer = targetModule === "customers";
                const labelValue = isCustomer
                  ? String(i?.full_name || i?.[resolvedTargetField] || i?.business_name || i?.system_code || i?.id || 'بدون نام').trim()
                  : ((resolvedTargetField ? (i as any)[resolvedTargetField] : null) || i.shelf_number || i.system_code || i.id);
                const sys = !isCustomer && (i as any).system_code ? ` (${(i as any).system_code})` : "";
                return {
                  label: `${labelValue}${sys}`,
                  value: i.id,
                  searchText: isCustomer
                    ? buildCustomerRelationSearchText(i, resolvedTargetField)
                    : `${String(labelValue || '').toLowerCase()} ${String((i as any).system_code || '').toLowerCase()}`.trim(),
                };
              });
              return { key: field.key, options };
            }
            return null;
          })
        );

        if (!isActive) return;
        relResults.forEach((res) => {
          if (res) {
            relOpts[res.key] = res.options;
            if (res.key.includes("_")) relOpts[res.key.split("_").pop()!] = res.options;
          }
        });
        setRelationOptions(relOpts);
        if (resolvedModuleId) {
          moduleListOptionsCache.set(resolvedModuleId, {
            dynamicOptions: dynOpts,
            relationOptions: relOpts,
            allUsers: directory.users,
            allRoles: directory.roles,
          });
        }
      } catch (error) {
        console.error("Error fetching options", error);
      } finally {
        if (isActive) setOptionsReady(true);
      }
    };

    fetchOptions();

    return () => {
      isActive = false;
    };
  }, [moduleConfig]);

  // ✅ Fetch tags for all records
  useEffect(() => {
    if (!tagsField || !resolvedModuleId || accessibleRecordIds.length === 0) {
      setTagsMap({});
      setTagsLoading(false);
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
        setTagsMap({});
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
  }, [accessibleRecordIds, resolvedModuleId, tagsField]);

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

  const availableGroupFields = useMemo(() => {
    return moduleConfig?.fields.filter(f => 
        (f.type === FieldType.STATUS || f.type === FieldType.SELECT) && f.options && f.options.length > 0
    ) || [];
  }, [moduleConfig]);

  const mapEnabled = useMemo(() => {
    if (!moduleConfig) return false;
    return moduleConfig.fields.some((field) => field.type === FieldType.LOCATION || field.key === "location");
  }, [moduleConfig]);

  const activeFilterBubbles = useMemo(() => {
    if (!moduleConfig) return [];

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
        const simpleFilter = filter as CrudFilter & { field?: string; operator?: string; value?: any };
        const fieldKey = String(simpleFilter?.field || "");
        if (!fieldKey) return null;
        const field = moduleConfig.fields.find((item) => item.key === fieldKey);
        const fieldLabel = field?.labels?.fa || fieldKey;
        const rawValue = simpleFilter?.value;
        const valueLabel = field
          ? getSingleOptionLabel(field, rawValue, dynamicOptions, relationOptions)
          : String(rawValue ?? "");
        const operatorLabel = operatorLabels[String(simpleFilter?.operator || "eq")] || String(simpleFilter?.operator || "eq");
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
  }, [columnFilters, currentView?.config?.filters, dynamicOptions, moduleConfig, relationOptions, searchTerm, viewFiltersState]);

  const clearExternalFilters = useCallback(() => {
    setSearchTerm("");
    setViewFiltersState([]);
    if ((currentView?.config?.filters || []).length > 0) {
      setCurrentView(null);
    }
    applyCombinedFilters([], "", columnFilters);
  }, [columnFilters, currentView?.config?.filters]);

  useEffect(() => {
    if (viewMode !== ViewMode.KANBAN) return;
    if (kanbanGroupBy) return;
    if (availableGroupFields.length === 0) return;
    const defaultField = availableGroupFields.find((f) => f.type === FieldType.STATUS) || availableGroupFields[0];
    setKanbanGroupBy(defaultField.key);
  }, [viewMode, kanbanGroupBy, availableGroupFields]);

  useEffect(() => {
    if (viewMode !== ViewMode.MAP) return;
    if (mapEnabled) return;
    setViewMode(moduleConfig?.defaultViewMode || ViewMode.LIST);
  }, [viewMode, mapEnabled, moduleConfig?.defaultViewMode]);

  const handleRefresh = useCallback(() => {
    void tableQueryResult.refetch();
  }, [tableQueryResult]);

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

  function applyCombinedFilters(nextViewFilters: CrudFilters, nextSearchTerm: string, nextColumnFilters: ColumnFiltersState, resetPage = true) {
    const mergedFilters = [...nextViewFilters];
    mergedFilters.push(...buildColumnCrudFilters(nextColumnFilters));
    if (searchTargetField && nextSearchTerm.trim()) {
      mergedFilters.push({
        field: searchTargetField,
        operator: "contains",
        value: nextSearchTerm.trim(),
      });
    }
    setFilters(mergedFilters, "replace");
    if (resetPage) {
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
    const refineFilters: CrudFilters =
      config && config.filters && Array.isArray(config.filters) && config.filters.length > 0
        ? config.filters.map((f: any) => ({
            field: f.field,
            operator: f.operator || 'eq',
            value: f.value
          }))
        : [];
    setViewFiltersState(refineFilters);
    applyCombinedFilters(refineFilters, searchTerm, columnFilters);

    // ✅ اعمال ستون‌های انتخاب‌شده
    if (config && config.columns && Array.isArray(config.columns) && config.columns.length > 0) {
        setVisibleColumns(config.columns);
    } else {
        setVisibleColumns([]);
    }
  }, [columnFilters, currentView, searchTerm]);

  // ✅ FIX: سرچ فقط فیلتر سرچ را اضافه/حذف می‌کند و به فیلترهای View دست نمی‌زند
  useEffect(() => {
    const handle = window.setTimeout(() => {
      applyCombinedFilters(viewFiltersState, searchTerm, columnFilters);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [columnFilters, searchTerm, viewFiltersState]);

  const handleTableChange = useCallback((pagination: any, tableFilters: any, sorter: any, extra: any) => {
    if (extra?.action === "filter") {
      return;
    }
    tableProps.onChange?.(pagination, tableFilters, sorter, extra);
  }, [tableProps]);

  const handleSelectAllVisible = useCallback(() => {
    if (!visibleSelectableRowKeys.length) return;
    setSelectedRowKeys((prev) => Array.from(new Set([...prev, ...visibleSelectableRowKeys])));
  }, [visibleSelectableRowKeys]);

  const handleBulkDelete = () => {
    if (selectedRowKeys.length === 0) return;
    modal.confirm({
      title: `حذف ${selectedRowKeys.length} رکورد`,
      content: 'آیا مطمئن هستید؟',
      okType: 'danger',
      okText: 'بله، حذف کن',
      cancelText: 'خیر',
      onOk: () => {
        deleteMany(
          {
            resource: resolvedModuleId!,
            ids: selectedRowKeys as string[],
            successNotification: false,
            errorNotification: false,
          },
          {
            onSuccess: () => {
              setSelectedRowKeys([]);
              showListMessage('success', 'رکوردهای انتخاب‌شده حذف شدند.');
              tableQueryResult.refetch();
            },
            onError: (error: any) => {
              showListMessage('error', toFaErrorMessage(error, 'حذف رکوردها ناموفق بود.'));
            },
          }
        );
      }
    });
  };

  const handleBulkEditOpen = () => {
      if (selectedRowKeys.length === 0) return;
      if (selectedRowKeys.length === 1) {
        setEditRecordId(String(selectedRowKeys[0]));
        setIsBulkEditMode(false);
      } else {
        setEditRecordId(null);
        setIsBulkEditMode(true);
      }
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
    if (!bulkBuildTarget) return;
    const selectedProducts = await fetchSelectedRecords();
    if (!selectedProducts.length) {
      throw new Error("هیچ محصولی برای ساخت رکورد انتخاب نشده است.");
    }

    const authUser = await getCachedAuthUser(supabase);
    const authUserId = authUser?.id || null;
    const payload =
      bulkBuildTarget === "product_bundles"
        ? { ...values, products: buildPackageItemsFromProducts(selectedProducts) }
        : { ...values, items: buildPriceListItemsFromProducts(selectedProducts) };
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
  }, [bulkBuildTarget, fetchSelectedRecords, tableQueryResult]);

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
        : buildListPrintableFields(moduleConfig, canViewField, visibleColumns);
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
  }, [canViewField, fetchSelectedRecords, listPrintableFields, moduleConfig, relationOptions, resolvedModuleId, selectedRowKeys.length, showListMessage, visibleColumns]);

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
          if (resolvedModuleId === 'production_orders') {
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
                await copyProductionOrderRelations(supabase, String(record.id), String(inserted.id));
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
                copyRelations: resolvedModuleId === "production_orders",
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
      if (Object.keys(changes).length === 0 && !hasTagChanges) return;
      if (!moduleConfig?.table) return;
      const normalizedChanges = Object.keys(changes).length > 0 && resolvedModuleId === 'tasks'
        ? attachTaskCompletionIfNeeded(changes)
        : changes;
      const selectedIds = selectedRowKeys.map((id) => String(id)).filter(Boolean);
      if (!selectedIds.length) return;

      const hide = showListMessage('loading', 'در حال بروزرسانی موارد انتخاب‌شده...', 0);
      try {
        for (const id of selectedIds) {
          if (Object.keys(normalizedChanges).length > 0) {
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

    if (canOpenGoals) {
      items.push({ key: "goals", label: "هدف‌گذاری" });
    }
    if (canOpenWorkflows) {
      items.push({ key: "workflows", label: "گردش کارها" });
    }
    if (canEditModule) {
      items.push({ key: "excel_import", icon: <FileExcelOutlined />, label: "وارد کردن از اکسل" });
    }
    if (canEditModule && resolvedModuleId === "products") {
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
  }, [canEditModule, canOpenGoals, canOpenModuleSettings, canOpenWorkflows, resolvedModuleId, moduleConfig?.titles.fa]);
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
    <div className="module-list-page box-border p-3 md:p-6 max-w-[1800px] mx-auto pb-24 md:pb-6 h-full min-h-0 flex flex-col overflow-hidden">
        <div className="flex flex-col gap-2 mb-4 shrink-0">
        {/* ردیف ۱: عنوان + شمارنده + دکمه افزودن */}
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-2xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2 min-w-0">
                <span className="w-2 h-8 bg-leather-500 rounded-full inline-block shrink-0"></span>
                <span className="truncate">{moduleConfig.titles.fa}</span>
            </h1>
            <Badge
                count={tableQueryResult.data?.total || 0}
                overflowCount={999}
                style={{ backgroundColor: '#f0f0f0', color: '#666', boxShadow: 'none' }}
            />
            </div>

            {selectedRowKeys.length === 0 && (
              <div className="flex items-center gap-2 shrink-0">
                {canEditModule && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => navigate(`/${resolvedModuleId}/create`)}
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

        {canShowGoalCards ? (
          <GoalProgressSlider
            moduleId={resolvedModuleId}
            placement="module_list"
            className="mt-1"
          />
        ) : null}

        <Toolbar
          viewMode={viewMode}
          setViewMode={setViewMode}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onRefresh={handleRefresh}
          kanbanEnabled={availableGroupFields.length > 0}
          mapEnabled={mapEnabled}
          kanbanGroupBy={kanbanGroupBy}
          kanbanGroupOptions={availableGroupFields.map((f) => ({ label: f.labels.fa, value: f.key }))}
          onKanbanGroupChange={setKanbanGroupBy}
        />

        <BulkActionsBar
          selectedCount={selectedRowKeys.length}
          onClear={() => {
            setSelectedRowKeys([]);
            setSelectedRowsMap({});
          }}
          onSelectAll={visibleSelectableRowKeys.length > 0 ? handleSelectAllVisible : undefined}
          selectAllDisabled={allVisibleRowsSelected}
          onEdit={selectedRowKeys.length && canEditModule ? handleBulkEditOpen : undefined}
          onCopy={selectedRowKeys.length && canEditModule ? handleCopyViaCreateForm : undefined}
          onDelete={selectedRowKeys.length && canDeleteModule ? handleBulkDelete : undefined}
          onExport={selectedRowKeys.length ? handleExport : undefined}
          exportMenuItems={selectedRowKeys.length ? exportMenuItems : undefined}
          extraActions={
            resolvedModuleId === "products" && selectedRowKeys.length > 0 && canEditModule
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
              : []
          }
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
        </div>

         <div className="mb-3 shrink-0">
           <ViewManager 
             moduleId={resolvedModuleId} 
             currentView={currentView} 
             onViewChange={handleViewChange} 
             onRefresh={handleRefresh}
           />
         </div>

         <ViewWrapper isFullscreen={false}>
         <div className="flex-1 min-h-0 overflow-hidden relative rounded-[2rem]">
            {showContentSkeleton || showListSkeleton ? (
               <ModuleListContentSkeleton viewMode={viewMode} />
           ) : accessibleData.length === 0 ? (
             <div className="flex h-full items-center justify-center bg-white dark:bg-[#1a1a1a] rounded-[2rem] border border-dashed border-gray-300">
                <Empty description="هیچ داده‌ای یافت نشد" />
             </div>
           ) : (
             <>
               {viewMode === ViewMode.LIST && (
                <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 h-full overflow-hidden">
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
                      onClick: () => navigate(`/${resolvedModuleId}/${record.id}`), 
                      style: { cursor: 'pointer' } 
                    })}
                    dynamicOptions={dynamicOptions}
                    relationOptions={effectiveRelationOptions}
                    allUsers={allUsers}
                    allRoles={allRoles}
                    canViewField={canViewField}
                    columnFilters={columnFilters}
                    onColumnFiltersChange={handleColumnFiltersChange}
                    externalFilterBubbles={activeFilterBubbles}
                    onClearExternalFilters={clearExternalFilters}
                    sorters={sorters as CrudSort[]}
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
                              navigate={navigate}
                              canViewField={canViewField}
                              allUsers={allUsers}
                              allRoles={allRoles}
                              relationOptions={effectiveRelationOptions}
                            />
                            
                   {/* Load More Button */}
                   {gridPageSize < enrichedData.length && (
                     <div className="flex justify-center items-center py-5 border-t border-gray-200 dark:border-gray-800">
                     <Button 
                       size="large"
                       onClick={() => setGridPageSize((prev) => Math.min(prev + gridLoadStep, enrichedData.length))}
                       className="h-12 px-6 sm:px-8 font-bold w-full sm:w-auto max-w-full"
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
                    navigate={navigate}
                  />
                </div>
               )}
               {viewMode === ViewMode.KANBAN && (
                <div className="flex gap-4 h-full overflow-x-auto pb-4 px-2">
                  {moduleConfig.fields.find(f => f.key === kanbanGroupBy)?.options?.map((col: any) => {
                    const columnItems = enrichedData.filter((d: any) => d[kanbanGroupBy] === col.value);
                    return (
                      <div key={col.value} className="min-w-[280px] w-[280px] flex flex-col bg-gray-100/50 dark:bg-white/5 rounded-2xl p-2 border border-gray-200 dark:border-gray-800 h-full">
                        <div className="flex items-center justify-between p-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color || '#ccc' }}></span>
                            <span className="font-bold text-gray-700 dark:text-gray-300 text-sm">{col.label}</span>
                          </div>
                          <span className="bg-white dark:bg-white/10 px-2 py-0.5 rounded-full text-xs text-gray-500">
                            {columnItems.length}
                          </span>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-0 custom-scrollbar pb-2">
                          {columnItems.map((item: any) => (
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
                              navigate={navigate}
                              minimal={true}
                              canViewField={canViewField}
                              allUsers={allUsers}
                              allRoles={allRoles}
                              relationOptions={effectiveRelationOptions}
                            />
                          ))}
                        </div>
                        <Button 
                          type="dashed" 
                          block 
                          icon={<PlusOutlined />} 
                          className="mt-2 text-xs text-gray-500 hover:text-leather-600 hover:border-leather-400"
                          onClick={() => {
                            navigate(`/${resolvedModuleId}/create`, { 
                              state: { initialValues: { [kanbanGroupBy]: col.value } } 
                            });
                          }}
                        >
                          افزودن به {col.label}
                        </Button>
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
               module={moduleConfig}
               visible={isBulkEditOpen}
               recordId={editRecordId || undefined}
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
    </div>
  );
};

export default ModuleListRefine;
