import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { mapAntdSorterToCrudSorting, useTable } from "@refinedev/antd";
import { CrudFilter, CrudFilters, CrudSort, useDeleteMany } from "@refinedev/core";
import { dataProvider as refineSupabaseDataProvider } from "@refinedev/supabase";
import { useNavigate, useParams } from "react-router-dom";
import { MODULES } from "../moduleRegistry";
import SmartTableRenderer from "../components/SmartTableRenderer";
import { BlockType, FieldType, ModuleDefinition, ModuleField, SavedView, ViewMode } from "../types";
import { GLOBAL_ASSIGNEE_MODULES } from "../utils/assigneeSupport";
import { App, Badge, Button, Dropdown, Empty, Skeleton } from "antd";
import type { MenuProps } from "antd";
import type { FilterValue } from "antd/es/table/interface";
import { AppstoreAddOutlined, AppstoreOutlined, BranchesOutlined, CalendarOutlined, ColumnWidthOutlined, EllipsisOutlined, EnvironmentOutlined, FileExcelOutlined, FilePdfOutlined, MessageOutlined, PlusOutlined, ReloadOutlined, SettingOutlined, TableOutlined, TagsOutlined } from "@ant-design/icons";
import AdaptivePickerSurface from "../components/AdaptivePickerSurface";
import ViewManager from "../components/ViewManager";
import SmartForm from "../components/SmartForm";
import { supabase } from "../supabaseClient";
import Toolbar from "../components/moduleList/Toolbar";
import BulkActionsBar from "../components/moduleList/BulkActionsBar";
import MergeRecordsModal from "../components/moduleList/MergeRecordsModal";
import ViewWrapper from "../components/moduleList/ViewWrapper";
import GridView from "../components/moduleList/GridView";
import ModuleCalendarView from "../components/moduleList/CalendarView";
import RenderCardItem from "../components/moduleList/RenderCardItem";
import {
  canAccessAssignedRecord,
  fetchCurrentUserRecordAccessContext,
  GOALS_PERMISSION_KEY,
  isSaasAdminModuleId,
  resolveModuleGoalAccessPermissions,
  SAAS_ADMIN_PERMISSION_KEY,
  WORKFLOWS_PERMISSION_KEY,
  type RecordScope,
} from "../utils/permissions";
import BulkProductsCreateModal from "../components/products/BulkProductsCreateModal";
import WorkflowsManager from "../components/workflows/WorkflowsManager";
import { buildCopyPayload, copyProcessTemplateStagesRelations, copyProductionOrderRelations, detectCopyNameField } from "../utils/recordCopy";
import { attachTaskCompletionIfNeeded } from "../utils/taskCompletion";
import { getTaskRelationFieldKey, resolveTaskSourceLink } from "../utils/taskMeta";
import ExcelImportWizard from "../components/moduleList/ExcelImportWizard";
import PrintSection from "../components/moduleShow/PrintSection";
import { useListPrintManager } from "../utils/printTemplates/useListPrintManager";
import { buildListPrintableFields, escapeCsvCell, formatListCellValue } from "../utils/listPrintExport";
import { readCurrencyConfig } from "../utils/currency";

const MapView = React.lazy(() => import("../components/moduleList/MapView"));
import { fetchAssigneeDirectory, fetchDynamicOptionsMap, fetchRecordTagIdMap, fetchRecordTagsMap } from "../utils/referenceData";
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
import { WORKFLOW_ASSIGNEE_FIELD_KEY } from "../utils/workflowTypes";
import { getAssigneeLabel } from "../utils/assigneeLabel";
import { syncDefaultPriceListItemsToProducts } from "../utils/priceListDefaults";
import { buildRecordReferenceKey, fetchRecordReferenceLabels } from "../utils/recordReference";
import {
  isModuleListLiveInvalidationEnabled,
  isModuleListLiveInvalidationSupportedView,
  subscribeToModuleListLiveInvalidation,
} from "../utils/moduleListLive";
import { resolveCashBankSourceNavigation } from "../utils/cashBankNavigation";
import { normalizeModuleFormValues } from "../utils/moduleFormRuntime";
import { enrichAttendancePresenceRows } from "../utils/attendancePresence";
import { backfillOperationalCashBankOperations } from "../utils/cashBankBackfill";
import { fetchMissingCashBankFallbackRows } from "../utils/cashBankFallbackRows";
import { CASH_BANK_LEGACY_ACCOUNT_KEYS } from "../utils/cashBankLegacyAccountKeys";
import SaasUserAdminDrawer from "../components/saas/SaasUserAdminDrawer";
import type { SaasAdminUserRow } from "../utils/saasUserAdmin";

const DEFAULT_LIST_PAGE_SIZE = 20;
const TAG_VIEW_FILTER_FIELD = "__tag_view_filter__";
const getDefaultGridPageSize = () => 15;
const getGridLoadStep = () => 15;
const getDefaultKanbanPageSize = () => 15;

const getTagViewFilterMeta = (filter: any, moduleConfig?: ModuleDefinition | null) => {
  if (!filter || typeof filter !== "object") return null;

  const tagFields = (moduleConfig?.fields || []).filter((field) => field.type === FieldType.TAGS);
  if (tagFields.length === 0) return null;

  const tagFieldKeys = new Set(tagFields.map((field) => String(field.key || "").trim()).filter(Boolean));
  const firstTagFieldKey = String(tagFields[0]?.key || "").trim();
  const directField = String(filter.field || "").trim();
  const displayField = String(filter._displayField || "").trim();
  const payload = filter.value && typeof filter.value === "object" && !Array.isArray(filter.value) ? filter.value : {};
  const payloadField = String(payload?.fieldKey || "").trim();
  const isCustomTagFilter = filter._isTagViewFilter === true || directField === TAG_VIEW_FILTER_FIELD;
  const tagFieldKey =
    (tagFieldKeys.has(directField) ? directField : "") ||
    (tagFieldKeys.has(displayField) ? displayField : "") ||
    (tagFieldKeys.has(payloadField) ? payloadField : "") ||
    (isCustomTagFilter ? payloadField || displayField || firstTagFieldKey : "");

  if (!tagFieldKey) return null;

  const rawTagIds =
    Array.isArray(payload?.tagIds)
      ? payload.tagIds
      : Object.prototype.hasOwnProperty.call(filter, "_displayValue")
        ? filter._displayValue
        : Object.prototype.hasOwnProperty.call(payload, "tagIds")
          ? payload.tagIds
          : filter.value;

  const tagIds = (Array.isArray(rawTagIds) ? rawTagIds : rawTagIds !== undefined && rawTagIds !== null && rawTagIds !== "" ? [rawTagIds] : [])
    .map((tagId) => String(tagId || "").trim())
    .filter(Boolean);

  return {
    fieldKey: tagFieldKey,
    sourceOperator: String(payload?.sourceOperator || filter._displayOperator || filter.operator || "eq").trim(),
    tagIds,
  };
};
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

const sanitizeModuleVisibleColumns = (
  moduleId: string | null | undefined,
  moduleConfig: ModuleDefinition | null | undefined,
  columns?: string[] | null,
) => {
  const allowedFieldKeys = new Set((moduleConfig?.fields || []).map((field) => String(field?.key || "").trim()).filter(Boolean));
  const seen = new Set<string>();
  const sanitized = (Array.isArray(columns) ? columns : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((key) => {
      if (moduleId === "cash_bank_operations" && CASH_BANK_LEGACY_ACCOUNT_KEYS.has(key)) return false;
      if (moduleId === "attendance_logs" && key === "closure_status") return false;
      if (!allowedFieldKeys.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (moduleId === "cash_bank_operations" && allowedFieldKeys.has("image_url")) {
    return ["image_url", ...sanitized.filter((key) => key !== "image_url")];
  }
  return sanitized;
};

const normalizeVisibleColumnsForView = (
  moduleId: string | null | undefined,
  moduleConfig: ModuleDefinition | null | undefined,
  currentView: SavedView | null | undefined,
  columns?: string[] | null,
) => {
  const sanitized = sanitizeModuleVisibleColumns(moduleId, moduleConfig, columns);
  const isDefaultView = !currentView || currentView.is_default || String(currentView.id || '').startsWith('default_');
  if (!isDefaultView) return sanitized;

  const allFieldKeys = (moduleConfig?.fields || [])
    .map((field) => String(field?.key || '').trim())
    .filter(Boolean)
    .filter((key, index, list) => list.indexOf(key) === index);

  if (sanitized.length > 0 && allFieldKeys.length > 0 && sanitized.length === allFieldKeys.length) {
    return [];
  }
  return sanitized;
};

const MODULE_LIST_BASE_SELECT_KEYS = [
  "id",
  "org_id",
  "created_at",
  "updated_at",
  "system_code",
  "name",
  "title",
  "status",
  "assignee_type",
  "assignee_id",
  "assignee_role_id",
  "employee_id",
  "metadata",
] as const;

const MODULE_LIST_EXTRA_SELECT_KEYS: Record<string, string[]> = {
  cash_bank_operations: ["metadata", "employee_id"],
};

const MODULE_LIST_HEAVY_FIELD_TYPES = new Set<FieldType>([
  FieldType.LONG_TEXT,
  FieldType.SUPER_LONG_TEXT,
  FieldType.JSON,
  FieldType.CHECKLIST,
  FieldType.PROGRESS_STAGES,
]);

const isSelectableColumnKey = (key?: string | null) => {
  const value = String(key || "").trim();
  return !!value && !value.startsWith("__") && !value.includes(".") && !value.includes("(") && !value.includes(")");
};

const collectCrudFilterFields = (filters?: CrudFilters | null): string[] => {
  const keys = new Set<string>();
  const visit = (item: any) => {
    if (!item || typeof item !== "object") return;
    const field = String(item.field || "").trim();
    if (field) keys.add(field);
    if (Array.isArray(item.value)) item.value.forEach(visit);
    if (Array.isArray(item.filters)) item.filters.forEach(visit);
  };
  (filters || []).forEach(visit);
  return Array.from(keys);
};

const buildModuleListRowSelect = (
  moduleConfig: ModuleDefinition | null | undefined,
  visibleColumns?: string[] | null,
  options?: {
    viewMode?: ViewMode;
    kanbanGroupBy?: string | null;
    calendarDateField?: string | null;
    filters?: CrudFilters | null;
  }
) => {
  if (!moduleConfig) return "*";

  const selectedKeys = new Set<string>();
  const moduleFieldKeys = new Set(
    (moduleConfig.fields || []).map((field) => String(field?.key || "").trim()).filter(Boolean)
  );
  const extraSelectKeys = new Set(MODULE_LIST_EXTRA_SELECT_KEYS[moduleConfig.id] || []);
  // ستون‌های assignee فقط برای ماژول‌هایی که از global assignee پشتیبانی می‌کنند اضافه می‌شوند
  const MANAGED_SYSTEM_COLUMNS = new Set(['assignee_type', 'assignee_id', 'assignee_role_id']);
  const moduleSupportsAssignee = GLOBAL_ASSIGNEE_MODULES.has(moduleConfig.id) || GLOBAL_ASSIGNEE_MODULES.has(moduleConfig.table || '');
  const addKey = (key?: string | null) => {
    if (isSelectableColumnKey(key)) selectedKeys.add(String(key).trim());
  };
  const addKnownKey = (key?: string | null) => {
    const normalized = String(key || "").trim();
    if (normalized === "id" || moduleFieldKeys.has(normalized) || extraSelectKeys.has(normalized) || (MANAGED_SYSTEM_COLUMNS.has(normalized) && moduleSupportsAssignee)) {
      addKey(normalized);
    }
  };

  MODULE_LIST_BASE_SELECT_KEYS.forEach(addKnownKey);
  getModuleListVisibleFields(moduleConfig, visibleColumns || undefined).forEach((field) => addKnownKey(field.key));
  collectCrudFilterFields(options?.filters).forEach(addKnownKey);

  (moduleConfig.fields || []).forEach((field) => {
    const key = String(field?.key || "").trim();
    if (!isSelectableColumnKey(key)) return;
    if (field.isKey || field.isTableColumn) addKnownKey(key);
    if (!MODULE_LIST_HEAVY_FIELD_TYPES.has(field.type) && field.type !== FieldType.TAGS) {
      addKnownKey(key);
    }
    const dependsOn = String(field.relationConfig?.dependsOn || "").trim();
    if (dependsOn) addKnownKey(dependsOn);
    if (field.type === FieldType.IMAGE || field.type === FieldType.LOCATION) addKnownKey(key);
    if (field.type === FieldType.DATE || field.type === FieldType.DATETIME || field.type === FieldType.STATUS) addKnownKey(key);
  });

  if (options?.viewMode === ViewMode.KANBAN) addKnownKey(options.kanbanGroupBy);
  if (options?.viewMode === ViewMode.CALENDAR) addKnownKey(options.calendarDateField);
  if (options?.viewMode === ViewMode.MAP) {
    (moduleConfig.fields || []).forEach((field) => {
      if (field.type === FieldType.LOCATION || field.key === "location") addKnownKey(field.key);
    });
  }

  return Array.from(selectedKeys).join(",");
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

const roundMoney = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
};

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
  const buyPrice = isBillboard ? unitPrice : ((Number(record?.buy_price || 0) || 0) || unitPrice);
  const profitPercentage = buyPrice > 0 ? roundMoney(((unitPrice - buyPrice) / buyPrice) * 100) : 0;

  return {
    product_id: record?.id || null,
    product_name: record?.name || record?.title || record?.id || "-",
    product_type: isBillboard ? "service" : record?.product_type || "goods",
    main_unit: isBillboard ? "روز" : record?.main_unit || "عدد",
    unit_price: unitPrice,
    buy_price: buyPrice,
    profit_percentage: profitPercentage,
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
        is_default_sell_price: false,
        buy_price: meta.buy_price,
        profit_percentage: meta.profit_percentage,
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
  const cashBankBackfillAttemptedRef = useRef(false);
  const [cashBankFallbackRows, setCashBankFallbackRows] = useState<any[]>([]);
  const [viewFiltersState, setViewFiltersState] = useState<CrudFilters>(effectiveInitialViewFilters);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(persistedState?.columnFilters || {});
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    () => normalizeVisibleColumnsForView(
      resolvedModuleId,
      moduleConfig,
      persistedState?.currentView || null,
      persistedState?.visibleColumns || []
    )
  );  // ✅ ستون‌های انتخاب‌شده
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>(
    () => cachedOptionSnapshot?.dynamicOptions || {}
  );  // ✅ اضافه شد
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>(
    () => cachedOptionSnapshot?.relationOptions || {}
  );  // ✅ اضافه شد
  const [optionsReady, setOptionsReady] = useState(() => hasCachedModuleOptions);
  const [tagsMap, setTagsMap] = useState<Record<string, any[]>>({});  // ✅ Map of record id to tags
  const [tagsLoading, setTagsLoading] = useState(false);
  const [loadedTagsRecordIdsSignature, setLoadedTagsRecordIdsSignature] = useState("");
  const [tagViewFilterRows, setTagViewFilterRows] = useState<any[]>([]);
  const [tagViewFilterTotal, setTagViewFilterTotal] = useState(0);
  const [tagViewFilterLoading, setTagViewFilterLoading] = useState(false);
  const [tagViewFilterRefreshSeed, setTagViewFilterRefreshSeed] = useState(0);
  const [nonListRows, setNonListRows] = useState<any[]>([]);
  const [nonListTotal, setNonListTotal] = useState(0);
  const [nonListLoading, setNonListLoading] = useState(false);
  const [nonListReady, setNonListReady] = useState(false);
  const [gridPageSize, setGridPageSize] = useState<number>(() => getDefaultGridPageSize()); // ✅ Grid pagination
  const [kanbanVisibleCounts, setKanbanVisibleCounts] = useState<Record<string, number>>({});
  const [kanbanDraggingRecordId, setKanbanDraggingRecordId] = useState<string | null>(null);
  const [kanbanDragOverColumn, setKanbanDragOverColumn] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>(() => cachedOptionSnapshot?.allUsers || []);
  const [allRoles, setAllRoles] = useState<any[]>(() => cachedOptionSnapshot?.allRoles || []);
  const [fieldPermissions, setFieldPermissions] = useState<Record<string, boolean>>({});
  const [modulePermissions, setModulePermissions] = useState<{ view?: boolean; edit?: boolean; delete?: boolean; record_scope?: RecordScope }>({});
  const [permissionFilters, setPermissionFilters] = useState<CrudFilters>([]);
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
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeRecords, setMergeRecords] = useState<Array<Record<string, any>>>([]);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeSubmitting, setMergeSubmitting] = useState(false);
  const [canOpenWorkflows, setCanOpenWorkflows] = useState(true);
  const [canOpenGoals, setCanOpenGoals] = useState(true);
  const [canShowGoalCards, setCanShowGoalCards] = useState(true);
  const [listPrintRows, setListPrintRows] = useState<any[]>([]);
  const [bulkBuildTarget, setBulkBuildTarget] = useState<BulkBuildTarget>(null);
  const [previewRecordId, setPreviewRecordId] = useState<string | null>(null);
  const [saasUserDrawerRecord, setSaasUserDrawerRecord] = useState<SaasAdminUserRow | null>(null);
  const [taskRelationOptionsByField, setTaskRelationOptionsByField] = useState<Record<string, any[]>>({});
  const [taskRelationOptionsLoading, setTaskRelationOptionsLoading] = useState(false);
  const [loadedTaskRelationOptionsSignature, setLoadedTaskRelationOptionsSignature] = useState("");
  const stableFiltersKey = useMemo(
    () => JSON.stringify(effectiveInitialFilters),
    [effectiveInitialFilters]
  );
  const moduleListRowSelect = useMemo(
    () => buildModuleListRowSelect(moduleConfig, visibleColumns, {
      viewMode,
      kanbanGroupBy,
      calendarDateField,
      filters: effectiveInitialFilters,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calendarDateField, stableFiltersKey, kanbanGroupBy, moduleConfig, viewMode, visibleColumns]
  );
  const hasInitializedModuleStateRef = useRef(false);
  const searchSyncInitializedRef = useRef(false);
  const autoSortSyncDoneRef = useRef(false);
  const lastRequestedPageSizeRef = useRef<number | null>(null);
  const lastAppliedFiltersSignatureRef = useRef<string | null>(null);
  const utilitySlotRef = useRef<HTMLDivElement | null>(null);
  const kanbanDragRef = useRef<{ record: any; sourceColumnKey: string; fieldKey: string } | null>(null);
  const tagViewFilterIdsCacheRef = useRef<{ signature: string; ids: string[] } | null>(null);
  const [hasListInitialPaintCompleted, setHasListInitialPaintCompleted] = useState(false);
  const [utilitySlotHeight, setUtilitySlotHeight] = useState<number | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768;
  });
  const [isMobileViewModeSheetOpen, setIsMobileViewModeSheetOpen] = useState(false);
  const refineProvider = useMemo(() => refineSupabaseDataProvider(supabase), []);
  const moduleListLiveInvalidationEnabled = useMemo(
    () => isModuleListLiveInvalidationEnabled(resolvedModuleId),
    [resolvedModuleId]
  );
  const moduleListLiveInvalidationSupportedView = useMemo(
    () => isModuleListLiveInvalidationSupportedView(viewMode),
    [viewMode]
  );
  const isListView = viewMode === ViewMode.LIST;

  const { tableProps, tableQueryResult, setFilters, sorters, setSorters, current, setCurrent, pageSize, setPageSize } = useTable({
    resource: dataResource,
    meta: { select: moduleListRowSelect },
    sorters: { initial: ensureStableCrudSorters(defaultSorters) },
    pagination: { pageSize: DEFAULT_LIST_PAGE_SIZE },
    queryOptions: {
      enabled: !!dataResource,
      staleTime: 60_000,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    filters: { initial: effectiveInitialFilters },
    syncWithLocation: false,
  });

  const { mutate: deleteMany } = useDeleteMany();

  const baseLoading = tableQueryResult.isLoading;
  const baseQueryPending = baseLoading || tableQueryResult.isFetching;
  const baseAllData = tableQueryResult.data?.data || EMPTY_ROWS;
  const baseHasQueryResult = !!tableQueryResult.data || !!tableQueryResult.error;
  const stableSorters = useMemo(
    () => ensureStableCrudSorters(resolveCrudSortersWithDefault(sorters as CrudSort[], moduleConfig)),
    [moduleConfig, sorters]
  );
  const visibleSorters = useMemo(
    () => stripStableIdSorter(stableSorters),
    [stableSorters]
  );
  const activeTagViewFilters = useMemo(
    () =>
      (viewFiltersState || [])
        .map((item: any) => getTagViewFilterMeta(item, moduleConfig))
        .filter(Boolean) as Array<{ fieldKey: string; sourceOperator: string; tagIds: string[] }>,
    [moduleConfig, viewFiltersState]
  );
  const normalizedActiveTagViewFilters = useMemo(
    () =>
      activeTagViewFilters.map((item) => ({
        sourceOperator: String(item?.sourceOperator || "eq").trim(),
        tagIds: (Array.isArray(item?.tagIds) ? item.tagIds : [])
          .map((tagId) => String(tagId || "").trim())
          .filter(Boolean),
      })),
    [activeTagViewFilters]
  );
  const hasActiveTagViewFilters = activeTagViewFilters.length > 0;
  const loading = isListView
    ? (hasActiveTagViewFilters ? tagViewFilterLoading : baseLoading)
    : nonListLoading;
  const queryPending = isListView
    ? (hasActiveTagViewFilters ? tagViewFilterLoading : baseQueryPending)
    : nonListLoading;
  const allData = isListView
    ? (hasActiveTagViewFilters ? tagViewFilterRows : baseAllData)
    : nonListRows;
  const effectiveAllData = useMemo(() => {
    if (resolvedModuleId !== "cash_bank_operations" || cashBankFallbackRows.length === 0) return allData;
    const existingIds = new Set((allData || []).map((row: any) => String(row?.id || "").trim()).filter(Boolean));
    const fallbackRows = cashBankFallbackRows.filter((row: any) => !existingIds.has(String(row?.id || "").trim()));
    return [...(allData || []), ...fallbackRows];
  }, [allData, cashBankFallbackRows, resolvedModuleId]);
  const hasQueryResult = isListView
    ? (hasActiveTagViewFilters
      ? (!tagViewFilterLoading || tagViewFilterRows.length > 0)
      : baseHasQueryResult)
    : nonListReady;
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
  const isListPageSizeReady = viewMode !== ViewMode.LIST || Number(pageSize || 0) > 0;
  const totalFilteredRecordCount = useMemo(
    () => {
      if (resolvedModuleId === "cash_bank_operations" && cashBankFallbackRows.length > 0) {
        return effectiveAllData.length;
      }
      if (!isListView) {
        return Number(nonListTotal || effectiveAllData.length || 0);
      }
      if (hasActiveTagViewFilters) {
        return Number(tagViewFilterTotal || 0);
      }
      const paginationConfig = tableProps?.pagination as { total?: number } | undefined;
      const paginationTotal = Number(paginationConfig?.total || 0);
      return Number(paginationTotal || tableQueryResult.data?.total || 0);
    },
    [cashBankFallbackRows.length, effectiveAllData.length, hasActiveTagViewFilters, isListView, nonListTotal, resolvedModuleId, tableProps?.pagination, tableQueryResult.data?.total, tagViewFilterTotal]
  );
  const effectiveTablePagination = useMemo(() => {
    if (resolvedModuleId === "cash_bank_operations" && cashBankFallbackRows.length > 0) {
      return {
        ...(tableProps.pagination || {}),
        total: effectiveAllData.length,
        current: Math.max(1, Number(current || 1)),
        pageSize: Math.max(1, Number(pageSize || DEFAULT_LIST_PAGE_SIZE)),
      };
    }
    if (!hasActiveTagViewFilters) return tableProps.pagination;
    return {
      ...(tableProps.pagination || {}),
      total: tagViewFilterTotal,
      current: Math.max(1, Number(current || 1)),
      pageSize: Math.max(1, Number(pageSize || DEFAULT_LIST_PAGE_SIZE)),
    };
  }, [cashBankFallbackRows.length, current, effectiveAllData.length, hasActiveTagViewFilters, pageSize, resolvedModuleId, tableProps.pagination, tagViewFilterTotal]);

  const fetchRowsByIdsPreservingOrder = useCallback(async (ids: string[], serverFilters: CrudFilters) => {
    if (!ids.length || !resolvedModuleId) return [];
    const resource = dataResource || resolvedModuleId;
    const CHUNK_SIZE = 500;
    const rowById = new Map<string, any>();

    for (let index = 0; index < ids.length; index += CHUNK_SIZE) {
      const chunkIds = ids.slice(index, index + CHUNK_SIZE);
      const response = await refineProvider.getList({
        resource,
        pagination: { current: 1, pageSize: Math.max(chunkIds.length, 1) },
        sorters: stableSorters,
        filters: [
          ...serverFilters,
          { field: "id", operator: "in", value: chunkIds } as any,
        ],
        meta: {
          select: buildModuleListRowSelect(moduleConfig, visibleColumns, {
            viewMode,
            kanbanGroupBy,
            calendarDateField,
            filters: serverFilters,
          }),
        },
      });
      const rows = Array.isArray(response?.data) ? response.data : [];
      rows.forEach((row: any) => {
        const rowId = String(row?.id || "").trim();
        if (rowId) {
          rowById.set(rowId, row);
        }
      });
    }

    return ids
      .map((id) => rowById.get(id))
      .filter(Boolean);
  }, [calendarDateField, dataResource, refineProvider, kanbanGroupBy, moduleConfig, resolvedModuleId, stableSorters, viewMode, visibleColumns]);

  const fetchAllRowsForFilters = useCallback(async (serverFilters: CrudFilters) => {
    if (!resolvedModuleId) {
      return { rows: [], total: 0 };
    }
    const resource = dataResource || resolvedModuleId;
    const SCAN_PAGE_SIZE = 500;
    const rows: any[] = [];
    let currentPage = 1;
    let totalPages = 1;
    let resolvedTotal = 0;

    while (currentPage <= totalPages) {
      const response = await refineProvider.getList({
        resource,
        pagination: { current: currentPage, pageSize: SCAN_PAGE_SIZE },
        sorters: stableSorters,
        filters: serverFilters,
        meta: {
          select: buildModuleListRowSelect(moduleConfig, visibleColumns, {
            viewMode,
            kanbanGroupBy,
            calendarDateField,
            filters: serverFilters,
          }),
        },
      });

      const pageRows = Array.isArray(response?.data) ? response.data : [];
      rows.push(...pageRows);

      if (currentPage === 1) {
        resolvedTotal = Number(response?.total || 0);
        if (resolvedTotal > 0) {
          totalPages = Math.max(1, Math.ceil(resolvedTotal / SCAN_PAGE_SIZE));
        } else if (pageRows.length < SCAN_PAGE_SIZE) {
          break;
        } else {
          totalPages = Number.MAX_SAFE_INTEGER;
        }
      } else if (pageRows.length < SCAN_PAGE_SIZE && totalPages === Number.MAX_SAFE_INTEGER) {
        break;
      }

      if (pageRows.length === 0) break;
      currentPage += 1;
    }

    return {
      rows,
      total: resolvedTotal || rows.length,
    };
  }, [calendarDateField, dataResource, refineProvider, kanbanGroupBy, moduleConfig, resolvedModuleId, stableSorters, viewMode, visibleColumns]);

  const fetchOrderedIdsForFilters = useCallback(async (serverFilters: CrudFilters) => {
    if (!resolvedModuleId || !dataResource) return [];

    const orderedIds: string[] = [];
    const SCAN_PAGE_SIZE = 1000;
    let scanPage = 1;
    let totalPages = 1;

    while (scanPage <= totalPages) {
      const response = await refineProvider.getList({
        resource: dataResource,
        pagination: { current: scanPage, pageSize: SCAN_PAGE_SIZE },
        sorters: stableSorters,
        filters: serverFilters,
        meta: { select: "id" },
      });

      const rows = Array.isArray(response?.data) ? response.data : [];
      orderedIds.push(
        ...rows
          .map((row: any) => String(row?.id || "").trim())
          .filter(Boolean)
      );

      if (scanPage === 1) {
        const totalRows = Number(response?.total || 0);
        if (totalRows > 0) {
          totalPages = Math.max(1, Math.ceil(totalRows / SCAN_PAGE_SIZE));
        } else if (rows.length < SCAN_PAGE_SIZE) {
          break;
        } else {
          totalPages = Number.MAX_SAFE_INTEGER;
        }
      } else if (rows.length < SCAN_PAGE_SIZE && totalPages === Number.MAX_SAFE_INTEGER) {
        break;
      }

      if (rows.length === 0) break;
      scanPage += 1;
    }

    return orderedIds;
  }, [dataResource, refineProvider, resolvedModuleId, stableSorters]);

  const resolveOrderedTagFilteredIds = useCallback(async (serverFilters: CrudFilters) => {
    if (!resolvedModuleId || !dataResource) return [];

    const cacheSignature = JSON.stringify({
      moduleId: resolvedModuleId,
      dataResource,
      filters: serverFilters,
      sorters: stableSorters,
      tagFilters: normalizedActiveTagViewFilters,
    });

    if (tagViewFilterIdsCacheRef.current?.signature === cacheSignature) {
      return tagViewFilterIdsCacheRef.current.ids;
    }

    const needsAllTaggedUniverse = normalizedActiveTagViewFilters.some(
      (item) => {
        const operator = String(item?.sourceOperator || "eq").trim();
        return operator === "is_null" || operator === "not_null";
      }
    );
    const hasNegativeTagFilter = normalizedActiveTagViewFilters.some((item) => {
      const operator = String(item?.sourceOperator || "eq").trim();
      return operator === "neq" || operator === "not_in" || operator === "not_contains";
    });
    const unionTagIds = Array.from(
      new Set(normalizedActiveTagViewFilters.flatMap((item) => item.tagIds).filter(Boolean))
    );
    const TAG_FAST_FILTER_LIMIT = 800;
    const [selectedTagIdMap, allTagIdMap] = await Promise.all([
      unionTagIds.length > 0
        ? fetchRecordTagIdMap(supabase, resolvedModuleId, { tagIds: unionTagIds })
        : Promise.resolve({} as Record<string, string[]>),
      needsAllTaggedUniverse
        ? fetchRecordTagIdMap(supabase, resolvedModuleId)
        : Promise.resolve({} as Record<string, string[]>),
    ]);

    const selectedTagsByRecord = new Map<string, Set<string>>(
      Object.entries(selectedTagIdMap).map(([recordId, tagIds]) => [recordId, new Set(tagIds)])
    );
    const allTagsByRecord = new Map<string, Set<string>>(
      Object.entries(allTagIdMap).map(([recordId, tagIds]) => [recordId, new Set(tagIds)])
    );

    const taggedRecordIds = needsAllTaggedUniverse
      ? new Set(Array.from(allTagsByRecord.keys()))
      : null;

    const positiveMatchSets: Array<Set<string>> = [];
    const excludedRecordIds = new Set<string>();
    const buildMatchedRecordIdSet = (tagIds: string[]) => {
      const matched = new Set<string>();
      if (tagIds.length === 0) return matched;
      selectedTagsByRecord.forEach((recordTagIds, recordId) => {
        if (tagIds.some((tagId) => recordTagIds.has(tagId))) {
          matched.add(recordId);
        }
      });
      return matched;
    };

    normalizedActiveTagViewFilters.forEach((tagFilter) => {
      const operator = String(tagFilter.sourceOperator || "eq").trim();
      const tagIds = tagFilter.tagIds;

      if (operator === "not_null") {
        positiveMatchSets.push(taggedRecordIds || new Set<string>());
        return;
      }

      if (operator === "is_null") {
        (taggedRecordIds || new Set<string>()).forEach((recordId) => excludedRecordIds.add(recordId));
        return;
      }

      const matchedRecordIds = buildMatchedRecordIdSet(tagIds);
      if (operator === "eq" || operator === "in" || operator === "contains") {
        positiveMatchSets.push(matchedRecordIds);
        return;
      }

      if (operator === "neq" || operator === "not_in" || operator === "not_contains") {
        matchedRecordIds.forEach((recordId) => excludedRecordIds.add(recordId));
      }
    });

    const includedRecordIds = positiveMatchSets.length > 0
      ? positiveMatchSets.reduce((carry, currentSet) => {
        if (!carry) return new Set(currentSet);
        const next = new Set<string>();
        carry.forEach((recordId) => {
          if (currentSet.has(recordId)) {
            next.add(recordId);
          }
        });
        return next;
      }, null as Set<string> | null)
      : null;

    if (includedRecordIds && includedRecordIds.size === 0) {
      tagViewFilterIdsCacheRef.current = {
        signature: cacheSignature,
        ids: [],
      };
      return [];
    }

    const canUseDirectIdFastPath =
      (!includedRecordIds || includedRecordIds.size <= TAG_FAST_FILTER_LIMIT) &&
      (!excludedRecordIds.size || excludedRecordIds.size <= TAG_FAST_FILTER_LIMIT) &&
      (includedRecordIds !== null || excludedRecordIds.size > 0 || needsAllTaggedUniverse || hasNegativeTagFilter);

    if (canUseDirectIdFastPath) {
      const narrowedFilters: CrudFilters = [...serverFilters];
      if (includedRecordIds && includedRecordIds.size > 0) {
        narrowedFilters.push({
          field: "id",
          operator: "in",
          value: Array.from(includedRecordIds),
        } as any);
      }
      if (excludedRecordIds.size > 0) {
        narrowedFilters.push({
          field: "id",
          operator: "nin",
          value: Array.from(excludedRecordIds),
        } as any);
      }

      const orderedFilteredIds = await fetchOrderedIdsForFilters(narrowedFilters);
      tagViewFilterIdsCacheRef.current = {
        signature: cacheSignature,
        ids: orderedFilteredIds,
      };
      return orderedFilteredIds;
    }

    const tagsByRecord = needsAllTaggedUniverse ? allTagsByRecord : selectedTagsByRecord;

    const passesTagFilters = (recordId: string) => {
      const recordTagIds = tagsByRecord.get(recordId) || new Set<string>();
      const hasAnyTag = recordTagIds.size > 0;

      for (const tagFilter of normalizedActiveTagViewFilters) {
        const op = String(tagFilter.sourceOperator || "eq");
        const tagIds = tagFilter.tagIds;

        if (op === "is_null") {
          if (hasAnyTag) return false;
          continue;
        }

        if (op === "not_null") {
          if (!hasAnyTag) return false;
          continue;
        }

        if (tagIds.length === 0) continue;
        const hasSelectedTag = tagIds.some((tagId) => recordTagIds.has(tagId));

        if (op === "eq" || op === "in" || op === "contains") {
          if (!hasSelectedTag) return false;
          continue;
        }

        if (op === "neq" || op === "not_in" || op === "not_contains") {
          if (hasSelectedTag) return false;
          continue;
        }
      }

      return true;
    };
    const baseOrderedIds = await fetchOrderedIdsForFilters(serverFilters);
    const orderedFilteredIds = baseOrderedIds.filter((id) => passesTagFilters(id));

    tagViewFilterIdsCacheRef.current = {
      signature: cacheSignature,
      ids: orderedFilteredIds,
    };
    return orderedFilteredIds;
  }, [dataResource, fetchOrderedIdsForFilters, normalizedActiveTagViewFilters, resolvedModuleId, stableSorters]);

  useEffect(() => {
    autoSortSyncDoneRef.current = false;
    lastRequestedPageSizeRef.current = null;
    lastAppliedFiltersSignatureRef.current = null;
    tagViewFilterIdsCacheRef.current = null;
    cashBankBackfillAttemptedRef.current = false;
    setCashBankFallbackRows([]);
    setTagViewFilterRows([]);
    setTagViewFilterTotal(0);
    setTagViewFilterLoading(false);
  }, [resolvedModuleId, viewMode]);

  useEffect(() => {
    if (resolvedModuleId !== "cash_bank_operations" || queryPending || cashBankBackfillAttemptedRef.current) return;
    cashBankBackfillAttemptedRef.current = true;
    let cancelled = false;

    const runBackfill = async () => {
      const loadFallbackRows = async () => {
        try {
          const fallbackRows = await fetchMissingCashBankFallbackRows(supabase);
          if (!cancelled) setCashBankFallbackRows(Array.isArray(fallbackRows) ? fallbackRows : []);
        } catch (fallbackError) {
          if (!cancelled) {
            console.warn("cash bank fallback fetch failed", fallbackError);
            setCashBankFallbackRows([]);
          }
        }
      };

      try {
        const result = await backfillOperationalCashBankOperations(supabase);
        if (cancelled) return;
        if (result.inserted > 0 || result.updated > 0 || result.canceled > 0 || result.sourceRecordsUpdated > 0) {
          showListMessage(
            "success",
            `نقد و بانک همگام شد: ${toPersianNumber(result.inserted)} جدید، ${toPersianNumber(result.updated)} بروزرسانی، ${toPersianNumber(result.canceled)} لغو.`,
            5,
          );
          await tableQueryResult.refetch();
        }
        await loadFallbackRows();
      } catch (error) {
        if (cancelled) return;
        console.warn("cash bank backfill failed", error);
        await loadFallbackRows();
      }
    };

    void runBackfill();
    return () => {
      cancelled = true;
    };
  }, [queryPending, resolvedModuleId, showListMessage, tableQueryResult]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const updateViewport = () => setIsMobileViewport(window.innerWidth < 768);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (isMobileViewport) return;
    setIsMobileViewModeSheetOpen(false);
  }, [isMobileViewport]);

  useEffect(() => {
    if (!resolvedModuleId || !isListView) return;
    const currentPageSize = Number(pageSize || 0);
    if (currentPageSize > 0) return;
    if (lastRequestedPageSizeRef.current === DEFAULT_LIST_PAGE_SIZE) return;
    lastRequestedPageSizeRef.current = DEFAULT_LIST_PAGE_SIZE;
    setPageSize(DEFAULT_LIST_PAGE_SIZE);
  }, [isListView, pageSize, resolvedModuleId, setPageSize]);

  useEffect(() => {
    if (autoSortSyncDoneRef.current) return;
    autoSortSyncDoneRef.current = true;
    if (areCrudSortersEqual(sorters as CrudSort[], stableSorters)) return;
    setSorters(stableSorters);
  }, [setSorters, sorters, stableSorters]);

  useEffect(() => {
    if (isListView || !resolvedModuleId || !dataResource) {
      setNonListRows((prev) => (prev.length > 0 ? [] : prev));
      setNonListTotal((prev) => (prev !== 0 ? 0 : prev));
      setNonListLoading(false);
      setNonListReady(false);
      return;
    }

    let isActive = true;

    const loadNonListRows = async () => {
      try {
        setNonListLoading(true);
        setNonListReady(false);
        const serverFilters = buildMergedFilters(viewFiltersState, searchTerm, columnFilters);

        if (hasActiveTagViewFilters) {
          const orderedIds = await resolveOrderedTagFilteredIds(serverFilters);
          const rows = orderedIds.length > 0
            ? await fetchRowsByIdsPreservingOrder(orderedIds, serverFilters)
            : [];
          if (!isActive) return;
          setNonListRows(rows);
          setNonListTotal(orderedIds.length);
          setNonListReady(true);
          return;
        }

        const { rows, total } = await fetchAllRowsForFilters(serverFilters);
        if (!isActive) return;
        setNonListRows(rows);
        setNonListTotal(total);
        setNonListReady(true);
      } catch (error) {
        if (!isActive) return;
        console.error("Error while loading non-list module rows:", error);
        setNonListRows([]);
        setNonListTotal(0);
        setNonListReady(true);
      } finally {
        if (isActive) {
          setNonListLoading(false);
        }
      }
    };

    void loadNonListRows();

    return () => {
      isActive = false;
    };
  }, [
    columnFilters,
    dataResource,
    fetchAllRowsForFilters,
    fetchRowsByIdsPreservingOrder,
    hasActiveTagViewFilters,
    isListView,
    resolvedModuleId,
    resolveOrderedTagFilteredIds,
    searchTerm,
    tagViewFilterRefreshSeed,
    viewFiltersState,
  ]);

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
    setVisibleColumns(normalizeVisibleColumnsForView(
      resolvedModuleId,
      moduleConfig,
      restoredState?.currentView || null,
      restoredState?.visibleColumns || []
    ));
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
    setLoadedTagsRecordIdsSignature("");
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
    setSaasUserDrawerRecord(null);
    setTaskRelationOptionsByField({});
    setTaskRelationOptionsLoading(false);
    setLoadedTaskRelationOptionsSignature("");
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
      if (isSaasAdminModuleId(resolvedModuleId)) {
        const saasPerms = permissions?.[SAAS_ADMIN_PERMISSION_KEY] || {};
        const saasFields = saasPerms.fields || {};
        const editFieldKey = resolvedModuleId === "saas_orgs"
          ? "edit_orgs"
          : resolvedModuleId === "saas_demo_requests"
            ? "edit_requests"
            : null;
        const canViewSaas = saasPerms.view === true || saasPerms.edit === true || (editFieldKey ? saasFields[editFieldKey] === true : false);
        const canEditSaas = canViewSaas && (saasPerms.edit === true || (editFieldKey ? saasFields[editFieldKey] === true : false) || resolvedModuleId === "saas_users");
        setModulePermissions({
          view: canViewSaas,
          edit: canEditSaas,
          delete: false,
          record_scope: "all",
        });
        setFieldPermissions({});
        setCanOpenWorkflows(false);
        setCanOpenGoals(false);
        setCanShowGoalCards(false);
        return;
      }
      const modulePerms = permissions?.[resolvedModuleId] || {};
      const workflowPerms = permissions?.[WORKFLOWS_PERMISSION_KEY] || {};
      const goalPerms = permissions?.[GOALS_PERMISSION_KEY] || {};
      const moduleGoalAccess = resolveModuleGoalAccessPermissions(permissions, resolvedModuleId);
      setModulePermissions({
        view: modulePerms.view,
        edit: modulePerms.edit,
        delete: modulePerms.delete,
        record_scope: modulePerms.record_scope ?? (modulePerms.view === false ? 'own' : 'all'),
      });
      setFieldPermissions(modulePerms.fields || {});
      // build permission-level filters from view_conditions
      const viewCondGroup = modulePerms.view_conditions;
      if (viewCondGroup && Array.isArray(viewCondGroup.conditions) && viewCondGroup.conditions.length > 0) {
        buildViewCrudFilters(viewCondGroup.conditions, viewCondGroup.logic).then((pFilters) => {
          setPermissionFilters(pFilters);
          applyCombinedFilters(effectiveInitialViewFilters as CrudFilters, persistedState?.searchTerm || '', persistedState?.columnFilters || {}, false);
        }).catch(() => setPermissionFilters([]));
      } else {
        setPermissionFilters([]);
      }
      setCanOpenWorkflows(
        workflowPerms.view !== false && (workflowPerms?.fields?.module_list_button !== false)
      );
      setCanOpenGoals(
        goalPerms.view !== false && (goalPerms?.fields?.module_list_button !== false) && moduleGoalAccess.canViewGoal
      );
      setCanShowGoalCards(
        goalPerms.view !== false && (goalPerms?.fields?.module_list_cards !== false) && moduleGoalAccess.canViewModuleCards
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

  useEffect(() => {
    if (
      !moduleListLiveInvalidationEnabled
      || !moduleListLiveInvalidationSupportedView
      || !resolvedModuleId
      || !currentOrgId
    ) {
      return;
    }

    let refreshTimer: number | null = null;
    const unsubscribe = subscribeToModuleListLiveInvalidation({
      supabaseClient: supabase,
      orgId: currentOrgId,
      moduleId: resolvedModuleId,
      onInvalidate: () => {
        if (typeof window !== "undefined" && refreshTimer !== null) {
          window.clearTimeout(refreshTimer);
        }
        if (typeof window !== "undefined") {
          refreshTimer = window.setTimeout(() => {
            refreshTimer = null;
            void tableQueryResult.refetch();
          }, 300);
        } else {
          void tableQueryResult.refetch();
        }
      },
    });

    return () => {
      if (typeof window !== "undefined" && refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      unsubscribe();
    };
  }, [
    currentOrgId,
    moduleListLiveInvalidationEnabled,
    moduleListLiveInvalidationSupportedView,
    resolvedModuleId,
    tableQueryResult,
  ]);

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
  const useSaasUserDrawer = moduleConfig?.listDetailSurface === "saas_user_drawer";
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
    return effectiveAllData
      .filter((record: any) => {
        const normalizedRecord =
          resolvedModuleId === "cash_bank_operations"
            ? {
                ...record,
                assignee_id: record?.assignee_id || record?.employee_id || null,
                assignee_type:
                  (record?.assignee_id || record?.employee_id)
                    ? (String(record?.assignee_type || "").trim() || "user")
                    : record?.assignee_type,
              }
            : record;
        return canAccessAssignedRecord(normalizedRecord, currentUserId, currentUserRoleId, recordScope, {
          currentOrgId,
          allowedRoleIds,
          allowedUserIds,
        });
      })
      .filter((record: any) => {
        if (resolvedModuleId !== "cash_bank_operations") return true;
        if (String(record?.status || "").trim() !== "canceled") return true;
        const rawMetadata = record?.metadata;
        const metadata =
          rawMetadata && typeof rawMetadata === "object"
            ? rawMetadata
            : typeof rawMetadata === "string"
              ? (() => {
                  try {
                    return JSON.parse(rawMetadata);
                  } catch {
                    return null;
                  }
                })()
              : null;
        return metadata?.is_auto_generated !== true;
      });
  }, [allowedRoleIds, allowedUserIds, canViewModule, currentOrgId, currentUserId, currentUserRoleId, effectiveAllData, recordScope, resolvedModuleId]);

  const normalizedAccessibleData = useMemo(() => {
    if (resolvedModuleId === "attendance_logs") return enrichAttendancePresenceRows(accessibleData);
    if (resolvedModuleId !== "cash_bank_operations") return accessibleData;
    return accessibleData.map((record: any) => normalizeModuleFormValues(resolvedModuleId, record));
  }, [accessibleData, resolvedModuleId]);

  const enrichedData = useMemo(() => {
    if (!tagsField) return normalizedAccessibleData;
    const tf: string = tagsField;
    return normalizedAccessibleData.map(record => ({
      ...record,
      [tf]: tagsMap[record.id as string] || (Array.isArray(record?.[tf]) ? record[tf] : [])
    }));
  }, [normalizedAccessibleData, tagsMap, tagsField]);
  const accessibleRecordIds = useMemo(
    () => normalizedAccessibleData.map((record: any) => String(record?.id || "")).filter(Boolean),
    [normalizedAccessibleData]
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
  const taskRelationLabelRequests = useMemo(() => {
    if (resolvedModuleId !== "tasks" || !enrichedData.length) return [];
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
    return Array.from(requests.values());
  }, [enrichedData, resolvedModuleId]);
  const taskRelationLabelRequestsSignature = useMemo(
    () => taskRelationLabelRequests
      .map((request) => `${request.fieldKey}:${request.moduleId}:${request.recordId}`)
      .join("|"),
    [taskRelationLabelRequests]
  );
  const shouldWaitForTags =
    shouldLoadTags &&
    accessibleRecordIdsSignature.length > 0 &&
    loadedTagsRecordIdsSignature !== accessibleRecordIdsSignature;
  const shouldWaitForTaskRelationLabels =
    resolvedModuleId === "tasks" &&
    taskRelationLabelRequestsSignature.length > 0 &&
    loadedTaskRelationOptionsSignature !== taskRelationLabelRequestsSignature;
  const deferredListDataLoading = viewMode === ViewMode.LIST && !queryPending && (
    !optionsReady ||
    tagsLoading ||
    shouldWaitForTags ||
    taskRelationOptionsLoading ||
    shouldWaitForTaskRelationLabels
  );
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
    if (resolvedModuleId !== "tasks" || !taskRelationLabelRequests.length) {
      setTaskRelationOptionsByField((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      setTaskRelationOptionsLoading(false);
      setLoadedTaskRelationOptionsSignature("");
      return;
    }

    let isActive = true;

    const loadTaskRelationLabels = async () => {
      let labelMap: Record<string, string> = {};
      try {
        setTaskRelationOptionsLoading(true);
        labelMap = await fetchRecordReferenceLabels(
          supabase,
          taskRelationLabelRequests.map((request) => ({
            moduleId: request.moduleId,
            recordId: request.recordId,
          }))
        );
      } catch (error) {
        console.warn("Could not load task relation labels for module list", error);
      }

      if (!isActive) return;

      const next: Record<string, any[]> = {};
      taskRelationLabelRequests.forEach((request) => {
        const label = String(labelMap[buildRecordReferenceKey(request.moduleId, request.recordId)] || "").trim();
        if (!label) return;
        const current = next[request.fieldKey] || [];
        if (!current.some((item: any) => String(item?.value || "") === request.recordId)) {
          current.push({
            label,
            value: request.recordId,
          });
        }
        next[request.fieldKey] = current;
      });
      setTaskRelationOptionsByField(next);
      setLoadedTaskRelationOptionsSignature(taskRelationLabelRequestsSignature);
      setTaskRelationOptionsLoading(false);
    };

    void loadTaskRelationLabels();

    return () => {
      isActive = false;
    };
  }, [resolvedModuleId, taskRelationLabelRequests, taskRelationLabelRequestsSignature]);
  const showListSkeleton =
    viewMode === ViewMode.LIST &&
    (
      !isListPageSizeReady ||
      (!hasListInitialPaintCompleted && (queryPending || deferredListDataLoading))
    );
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
    if (!isListPageSizeReady) return;
    if (queryPending) return;
    if (deferredListDataLoading) return;
    setHasListInitialPaintCompleted(true);
  }, [deferredListDataLoading, isListPageSizeReady, queryPending, viewMode]);

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
        // همه ۳ درخواست موازی شروع می‌شوند — relation options بدون directory (null-safe)
        const [directory, immediateDynamicOptions, partialRelationOptions] = await Promise.all([
          fetchAssigneeDirectory(supabase),
          optionPlan.immediateDynamicCategories.length > 0
            ? fetchDynamicOptionsMap(supabase, optionPlan.immediateDynamicCategories)
            : Promise.resolve({} as Record<string, any[]>),
          fetchModuleListRelationOptions(supabase, optionPlan.immediateRelationFields, null),
        ]);
        if (!isActive) return;

        setAllUsers(directory.users);
        setAllRoles(directory.roles);

        // پس از دریافت directory، فیلدهای user/profile/role را بدون کوئری DB جدید override می‌کنیم
        const profileOptions = (directory.users || []).map((u: any) => ({
          label: u.display_name || u.full_name || u.id,
          value: u.id,
        }));
        const roleOptions = (directory.roles || []).map((r: any) => ({
          label: r.title || r.id,
          value: r.id,
        }));
        const assigneeOptions = [
          ...profileOptions,
          ...roleOptions.filter((r) => !profileOptions.some((u) => String(u.value) === String(r.value))),
        ];
        const directoryOverrides: Record<string, any[]> = {
          profiles: profileOptions,
          assignee_id: assigneeOptions,
          org_roles: roleOptions,
          roles: roleOptions,
        };
        (optionPlan.immediateRelationFields || []).forEach((f) => {
          const k = String(f.key || '').trim();
          if (!k) return;
          if (f.type === FieldType.USER || f.relationConfig?.targetModule === 'profiles') {
            directoryOverrides[k] = profileOptions;
          } else if (f.relationConfig?.targetModule === 'org_roles' || f.relationConfig?.targetModule === 'roles') {
            directoryOverrides[k] = roleOptions;
          }
        });
        const immediateRelationOptions = { ...partialRelationOptions, ...directoryOverrides };

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
      setLoadedTagsRecordIdsSignature("");
      return;
    }

    let isActive = true;

    const fetchTags = async () => {
      try {
        setTagsLoading(true);
        const nextTagsMap = await fetchRecordTagsMap(supabase, resolvedModuleId, accessibleRecordIds);

        if (!isActive) return;

        setTagsMap(nextTagsMap);
        setLoadedTagsRecordIdsSignature(accessibleRecordIdsSignature);
      } catch (err) {
        if (!isActive) return;
        console.error('Error fetching tags:', err);
        setTagsMap((prev) => (Object.keys(prev).length > 0 ? {} : prev));
        setLoadedTagsRecordIdsSignature(accessibleRecordIdsSignature);
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

  const kanbanGroupOptions = useMemo(
    () => availableGroupFields.map((f) => ({ label: f.labels.fa, value: f.key })),
    [availableGroupFields]
  );
  const calendarDateFieldOptions = useMemo(
    () => availableCalendarFields.map((field) => ({
      label: getFieldLabelFa(field, { moduleId: resolvedModuleId, fallback: field.key }),
      value: field.key,
    })),
    [availableCalendarFields, resolvedModuleId]
  );
  const mobileViewModeOptions = useMemo(
    () => [
      { label: "جدول", value: ViewMode.LIST, icon: <TableOutlined /> },
      { label: "گرید", value: ViewMode.GRID, icon: <AppstoreOutlined /> },
      ...(mapEnabled ? [{ label: "نقشه", value: ViewMode.MAP, icon: <EnvironmentOutlined /> }] : []),
      ...(availableCalendarFields.length > 0 ? [{ label: "تقویم", value: ViewMode.CALENDAR, icon: <CalendarOutlined /> }] : []),
      ...(availableGroupFields.length > 0 ? [{ label: "کانبان", value: ViewMode.KANBAN, icon: <ColumnWidthOutlined /> }] : []),
    ],
    [availableCalendarFields.length, availableGroupFields.length, mapEnabled]
  );

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
        const fieldLabel = fieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY
          ? getAssigneeLabel(resolvedModuleId)
          : getFieldLabelFa(field, { moduleId: resolvedModuleId, fallback: fieldKey });
        const rawValue = simpleFilter?._displayValue ?? simpleFilter?.value;
        const valueLabel = fieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY
          ? (Array.isArray(rawValue) ? rawValue : [rawValue])
              .map((item) => {
                const normalized = String(item ?? "").trim();
                if (!normalized) return "";
                if (normalized.startsWith("user_")) {
                  const userId = normalized.slice(5);
                  const user = allUsers.find((entry: any) => String(entry?.id || "").trim() === userId);
                  return user?.display_name || user?.full_name || userId;
                }
                if (normalized.startsWith("role_")) {
                  const roleId = normalized.slice(5);
                  const role = allRoles.find((entry: any) => String(entry?.id || "").trim() === roleId);
                  return role?.title ? `نقش: ${role.title}` : `نقش: ${roleId}`;
                }
                const user = allUsers.find((entry: any) => String(entry?.id || "").trim() === normalized);
                if (user) return user?.display_name || user?.full_name || normalized;
                const role = allRoles.find((entry: any) => String(entry?.id || "").trim() === normalized);
                if (role) return `نقش: ${role.title || normalized}`;
                return normalized;
              })
              .filter(Boolean)
              .join("، ")
          : field
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
  }, [allRoles, allUsers, columnFilters, currentView?.config?.filters, dynamicOptions, moduleConfig, relationOptions, resolvedModuleId, searchTerm, tagsMap, viewFiltersState]);

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
    tagViewFilterIdsCacheRef.current = null;
    setTagViewFilterRefreshSeed((prev) => prev + 1);
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
    if (resolvedModuleId === "cash_bank_operations") {
      const sourceNavigation = resolveCashBankSourceNavigation(record);
      if (sourceNavigation) {
        navigate(`/${sourceNavigation.moduleId}/${sourceNavigation.recordId}`, {
          state: sourceNavigation.state,
        });
        return;
      }
    }
    if (useSaasUserDrawer) {
      setSaasUserDrawerRecord(record as SaasAdminUserRow);
      return;
    }
    if (useQuickPreviewModal) {
      setPreviewRecordId(recordId);
      return;
    }
    navigate(`/${resolvedModuleId}/${recordId}`);
  }, [navigate, resolvedModuleId, useQuickPreviewModal, useSaasUserDrawer]);

  const handleTableRowProps = useCallback((record: any) => ({
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
  }), [selectedRowKeys, openRecordFromList]);

  const moduleListNavigate = useCallback((path: string) => {
    const normalizedPath = String(path || "").trim();
    if (resolvedModuleId === "cash_bank_operations") {
      const moduleRecordPrefix = `/${resolvedModuleId}/`;
      if (normalizedPath.startsWith(moduleRecordPrefix)) {
        const recordId = normalizedPath.slice(moduleRecordPrefix.length).split("/")[0];
        if (recordId && recordId !== "create") {
          const cashBankRecord = enrichedData.find((item: any) => String(item?.id || "").trim() === recordId);
          const sourceNavigation = resolveCashBankSourceNavigation(cashBankRecord);
          if (sourceNavigation) {
            navigate(`/${sourceNavigation.moduleId}/${sourceNavigation.recordId}`, {
              state: sourceNavigation.state,
            });
            return;
          }
        }
      }
    }
    if (useSaasUserDrawer && resolvedModuleId) {
      const moduleRecordPrefix = `/${resolvedModuleId}/`;
      if (normalizedPath.startsWith(moduleRecordPrefix)) {
        const recordId = normalizedPath.slice(moduleRecordPrefix.length).split("/")[0];
        const record = enrichedData.find((item: any) => String(item?.id || "") === recordId);
        if (record) {
          setSaasUserDrawerRecord(record as SaasAdminUserRow);
          return;
        }
      }
    }
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
  }, [enrichedData, navigate, resolvedModuleId, useQuickPreviewModal, useSaasUserDrawer]);

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

  function buildMergedFilters(nextViewFilters: CrudFilters, nextSearchTerm: string, nextColumnFilters: ColumnFiltersState, nextPermFilters: CrudFilters = []): CrudFilters {
    const mergedFilters = [...nextPermFilters, ...nextViewFilters].filter((item: any) => {
      return !getTagViewFilterMeta(item, moduleConfig);
    });
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

  async function buildViewCrudFilters(nextViewFiltersConfig: any[], logic?: 'and' | 'or'): Promise<CrudFilters> {
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

    const resolveAssigneeTargets = async (rawValue: any) => {
      const normalizedValues = (Array.isArray(rawValue) ? rawValue : rawValue !== undefined && rawValue !== null && rawValue !== "" ? [rawValue] : [])
        .map((item) => String(item ?? "").trim())
        .filter(Boolean);

      if (normalizedValues.length === 0) {
        return {
          assigneeIds: [] as string[],
          assigneeRoleIds: [] as string[],
        };
      }

      const directory = await fetchAssigneeDirectory(supabase);
      const users = Array.isArray(directory?.users) ? directory.users : [];
      const roles = Array.isArray(directory?.roles) ? directory.roles : [];
      const userIdSet = new Set(users.map((user) => String(user?.id || "").trim()).filter(Boolean));
      const roleIdSet = new Set(roles.map((role) => String(role?.id || "").trim()).filter(Boolean));
      const assigneeIds = new Set<string>();
      const assigneeRoleIds = new Set<string>();

      // resolve special current-viewer tokens once
      let currentViewerUserId: string | null = null;
      let currentViewerRoleId: string | null = null;
      const needsCurrentUser = normalizedValues.includes("__current_user__") || normalizedValues.includes("__current_role__");
      if (needsCurrentUser) {
        const authUser = await getCachedAuthUser(supabase);
        currentViewerUserId = authUser?.id ? String(authUser.id) : null;
        if (currentViewerUserId) {
          const meInDir = users.find((u) => String(u?.id || "") === currentViewerUserId);
          currentViewerRoleId = meInDir?.role_id ? String(meInDir.role_id) : null;
        }
      }

      normalizedValues.forEach((entry) => {
        if (entry === "__current_user__") {
          if (currentViewerUserId) assigneeIds.add(currentViewerUserId);
          return;
        }

        if (entry === "__current_role__") {
          if (currentViewerRoleId) {
            assigneeRoleIds.add(currentViewerRoleId);
            assigneeIds.add(currentViewerRoleId);
            users.forEach((user) => {
              if (String(user?.role_id || "").trim() === currentViewerRoleId) {
                assigneeIds.add(String(user?.id || "").trim());
              }
            });
          }
          return;
        }

        if (entry.startsWith("user_")) {
          const userId = String(entry.slice(5) || "").trim();
          if (userId) assigneeIds.add(userId);
          return;
        }

        if (entry.startsWith("role_")) {
          const roleId = String(entry.slice(5) || "").trim();
          if (!roleId) return;
          assigneeRoleIds.add(roleId);
          assigneeIds.add(roleId);
          users.forEach((user) => {
            if (String(user?.role_id || "").trim() === roleId) {
              assigneeIds.add(String(user?.id || "").trim());
            }
          });
          return;
        }

        if (userIdSet.has(entry)) {
          assigneeIds.add(entry);
        }

        if (roleIdSet.has(entry)) {
          assigneeRoleIds.add(entry);
          assigneeIds.add(entry);
          users.forEach((user) => {
            if (String(user?.role_id || "").trim() === entry) {
              assigneeIds.add(String(user?.id || "").trim());
            }
          });
        }
      });

      return {
        assigneeIds: Array.from(assigneeIds).filter(Boolean),
        assigneeRoleIds: Array.from(assigneeRoleIds).filter(Boolean),
      };
    };

    const filters: CrudFilters = [];

    for (const rawFilter of nextViewFiltersConfig) {
      const fieldKey = String(rawFilter?.field || "").trim();
      const operator = String(rawFilter?.operator || "").trim();
      const value = rawFilter?.value;
      if (!fieldKey || !operator) continue;

      if (fieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY) {
        if (operator === "is_null") {
          filters.push(
            { field: "assignee_id", operator: "null", value: null, _displayField: fieldKey, _displayOperator: operator, _displayValue: value } as any,
            { field: "assignee_role_id", operator: "null", value: null, _displayField: fieldKey, _displayOperator: operator, _displayValue: value } as any
          );
          continue;
        }

        if (operator === "not_null") {
          filters.push({
            operator: "or",
            value: [
              { field: "assignee_id", operator: "nnull", value: null },
              { field: "assignee_role_id", operator: "nnull", value: null },
            ],
            _displayField: fieldKey,
            _displayOperator: operator,
            _displayValue: value,
          } as any);
          continue;
        }

        const { assigneeIds, assigneeRoleIds } = await resolveAssigneeTargets(value);

        if (operator === "eq" || operator === "contains" || operator === "in") {
          const nextOrFilters: CrudFilter[] = [];
          if (assigneeIds.length > 0) {
            nextOrFilters.push({
              field: "assignee_id",
              operator: assigneeIds.length > 1 ? "in" : "eq",
              value: assigneeIds.length > 1 ? assigneeIds : assigneeIds[0],
            } as any);
          }
          if (assigneeRoleIds.length > 0) {
            nextOrFilters.push({
              field: "assignee_role_id",
              operator: assigneeRoleIds.length > 1 ? "in" : "eq",
              value: assigneeRoleIds.length > 1 ? assigneeRoleIds : assigneeRoleIds[0],
            } as any);
          }
          if (nextOrFilters.length > 0) {
            filters.push((nextOrFilters.length === 1
              ? {
                  ...nextOrFilters[0],
                  _displayField: fieldKey,
                  _displayOperator: operator,
                  _displayValue: value,
                }
              : {
                  operator: "or",
                  value: nextOrFilters,
                  _displayField: fieldKey,
                  _displayOperator: operator,
                  _displayValue: value,
                }) as any);
          }
          continue;
        }

        if (operator === "neq" || operator === "not_contains" || operator === "not_in") {
          if (assigneeIds.length > 0) {
            filters.push({
              field: "assignee_id",
              operator: assigneeIds.length > 1 ? "nin" : "ne",
              value: assigneeIds.length > 1 ? assigneeIds : assigneeIds[0],
              _displayField: fieldKey,
              _displayOperator: operator,
              _displayValue: value,
            } as any);
          }
          if (assigneeRoleIds.length > 0) {
            filters.push({
              field: "assignee_role_id",
              operator: assigneeRoleIds.length > 1 ? "nin" : "ne",
              value: assigneeRoleIds.length > 1 ? assigneeRoleIds : assigneeRoleIds[0],
              _displayField: fieldKey,
              _displayOperator: operator,
              _displayValue: value,
            } as any);
          }
          continue;
        }

        continue;
      }

      const field = moduleConfig.fields.find((item) => String(item?.key || "").trim() === fieldKey);
      if (!field) continue;

      if (field.type === FieldType.TAGS) {
        const normalizedTagIds = (Array.isArray(value) ? value : value !== undefined && value !== null && value !== "" ? [value] : [])
          .map((item) => String(item ?? "").trim())
          .filter(Boolean);

        filters.push({
          field: TAG_VIEW_FILTER_FIELD,
          operator: "eq",
          value: {
            fieldKey,
            sourceOperator: operator,
            tagIds: normalizedTagIds,
          },
          _displayField: fieldKey,
          _displayOperator: operator,
          _displayValue: normalizedTagIds,
          _isTagViewFilter: true,
        } as any);
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

    if (logic === 'or' && filters.length > 1) {
      return [{ operator: 'or', value: filters } as any];
    }

    return filters;
  }

  function applyCombinedFilters(nextViewFilters: CrudFilters, nextSearchTerm: string, nextColumnFilters: ColumnFiltersState, resetPage = true) {
    const mergedFilters = buildMergedFilters(nextViewFilters, nextSearchTerm, nextColumnFilters, permissionFilters);
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

  useEffect(() => {
    if (!isListView || !hasActiveTagViewFilters || !resolvedModuleId || !dataResource) {
      setTagViewFilterRows((prev) => (prev.length > 0 ? [] : prev));
      setTagViewFilterTotal((prev) => (prev !== 0 ? 0 : prev));
      setTagViewFilterLoading((prev) => (prev ? false : prev));
      tagViewFilterIdsCacheRef.current = null;
      return;
    }

    let isActive = true;

    const loadTagFilteredRows = async () => {
      try {
        setTagViewFilterLoading(true);

        const serverFilters = buildMergedFilters(viewFiltersState, searchTerm, columnFilters);
        const orderedFilteredIds = await resolveOrderedTagFilteredIds(serverFilters);

        const safeCurrent = Math.max(1, Number(current || 1));
        const safePageSize = Math.max(1, Number(pageSize || DEFAULT_LIST_PAGE_SIZE));
        const fromIndex = (safeCurrent - 1) * safePageSize;
        const pageIds = orderedFilteredIds.slice(fromIndex, fromIndex + safePageSize);

        const pageRows = pageIds.length > 0
          ? await fetchRowsByIdsPreservingOrder(pageIds, serverFilters)
          : [];

        if (!isActive) return;
        setTagViewFilterRows(pageRows);
        setTagViewFilterTotal(orderedFilteredIds.length);
      } catch (error) {
        if (!isActive) return;
        console.error("Error while applying tag view filters:", error);
        setTagViewFilterRows([]);
        setTagViewFilterTotal(0);
      } finally {
        if (isActive) {
          setTagViewFilterLoading(false);
        }
      }
    };

    void loadTagFilteredRows();

    return () => {
      isActive = false;
    };
  }, [
    columnFilters,
    current,
    dataResource,
    fetchRowsByIdsPreservingOrder,
    hasActiveTagViewFilters,
    isListView,
    pageSize,
    resolveOrderedTagFilteredIds,
    searchTerm,
    tagViewFilterRefreshSeed,
    viewFiltersState,
  ]);

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

    // اعمال ستون‌های انتخاب‌شده
    if (config && config.columns && Array.isArray(config.columns) && config.columns.length > 0) {
        setVisibleColumns(normalizeVisibleColumnsForView(resolvedModuleId, moduleConfig, view, config.columns));
    } else {
        setVisibleColumns([]);
    }

    // اعمال ترتیب نمایش
    if (config && Array.isArray(config.sort) && config.sort.length > 0) {
      const viewSorters = config.sort
        .filter((s: any) => String(s?.field || '').trim() && (s?.order === 'asc' || s?.order === 'desc'))
        .map((s: any) => ({ field: String(s.field), order: s.order as 'asc' | 'desc' }));
      if (viewSorters.length > 0) {
        setSorters(ensureStableCrudSorters(viewSorters));
      }
    }
  }, [columnFilters, currentView, moduleConfig, resolvedModuleId, searchTerm, setSorters]);

  const handleViewModeChange = useCallback((nextMode: ViewMode) => {
    if (nextMode === viewMode) return;
    lastRequestedPageSizeRef.current = null;
    setSelectedRowKeys([]);
    setSelectedRowsMap({});
    setListVisibleRowKeys(null);

    if (nextMode === ViewMode.LIST) {
      setHasListInitialPaintCompleted(false);
      if (current !== 1) {
        setCurrent?.(1);
      }
      if (Number(pageSize || 0) !== DEFAULT_LIST_PAGE_SIZE) {
        lastRequestedPageSizeRef.current = DEFAULT_LIST_PAGE_SIZE;
        setPageSize(DEFAULT_LIST_PAGE_SIZE);
      }
    } else if (nextMode === ViewMode.GRID) {
      setGridPageSize(getDefaultGridPageSize());
    } else if (nextMode === ViewMode.KANBAN) {
      setKanbanVisibleCounts({});
    }

    setViewMode(nextMode);
  }, [current, pageSize, setCurrent, setPageSize, viewMode]);

  const handleMobileViewModeSelect = useCallback((nextMode: ViewMode) => {
    handleViewModeChange(nextMode);
    if (nextMode !== ViewMode.KANBAN && nextMode !== ViewMode.CALENDAR) {
      setIsMobileViewModeSheetOpen(false);
    }
  }, [handleViewModeChange]);

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

  const handleMergeOpen = useCallback(async () => {
    if (!selectedRowKeys.length || !moduleConfig || !resolvedModuleId) return;
    if (isSystemManagedModule) {
      showListMessage("warning", "رکوردهای سیستمی قابل ادغام نیستند.");
      return;
    }
    if (!canEditModule) {
      showListMessage("warning", "برای ادغام رکوردها دسترسی ویرایش لازم است.");
      return;
    }
    if (selectedRowKeys.length < 2) {
      showListMessage("warning", "برای ادغام حداقل دو رکورد انتخاب کنید.");
      return;
    }

    setIsMergeModalOpen(true);
    setMergeLoading(true);
    try {
      const rows = await fetchSelectedRecords();
      if (rows.length < 2) {
        showListMessage("warning", "حداقل دو رکورد معتبر برای ادغام پیدا نشد.");
        setIsMergeModalOpen(false);
        return;
      }
      setMergeRecords(rows);
    } catch (error: any) {
      setIsMergeModalOpen(false);
      showListMessage("error", toFaErrorMessage(error, "آماده‌سازی ادغام ناموفق بود."));
    } finally {
      setMergeLoading(false);
    }
  }, [canEditModule, fetchSelectedRecords, isSystemManagedModule, moduleConfig, resolvedModuleId, selectedRowKeys.length, showListMessage]);

  const handleMergeConfirm = useCallback(async (
    payload: Record<string, any>,
    meta: { survivorId: string; duplicateIds: string[] },
  ) => {
    if (!moduleConfig?.table || !resolvedModuleId || !meta.survivorId || meta.duplicateIds.length === 0) return;
    setMergeSubmitting(true);
    const hide = showListMessage("loading", "در حال ادغام رکوردها...", 0);
    try {
      const { error: updateError } = await supabase
        .from(moduleConfig.table)
        .update(payload)
        .eq("id", meta.survivorId);
      if (updateError) throw updateError;

      if (isRecycleBinEnabledModule(resolvedModuleId)) {
        await moveModuleRecordsToRecycleBin(resolvedModuleId, meta.duplicateIds);
      } else {
        await new Promise<void>((resolve, reject) => {
          deleteMany(
            {
              resource: dataResource || resolvedModuleId,
              ids: meta.duplicateIds,
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

      showListMessage("success", "رکوردهای انتخاب‌شده ادغام شدند.");
      setIsMergeModalOpen(false);
      setMergeRecords([]);
      setSelectedRowKeys([]);
      setSelectedRowsMap({});
      tableQueryResult.refetch();
    } catch (error: any) {
      showListMessage("error", toFaErrorMessage(error, "ادغام رکوردها ناموفق بود."));
    } finally {
      hide?.();
      setMergeSubmitting(false);
    }
  }, [dataResource, deleteMany, moduleConfig?.table, resolvedModuleId, showListMessage, tableQueryResult]);

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

    if (bulkBuildTarget === "price_lists") {
      await syncDefaultPriceListItemsToProducts(supabase, {
        status: payload?.status ?? "active",
        active: payload?.active,
        items: payload?.items,
      });
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
    <div className="module-list-page box-border p-3 md:p-5 max-w-[1800px] mx-auto pb-20 md:pb-5 h-full min-h-0 flex flex-col overflow-hidden">
        <div className="flex flex-col gap-0 mb-0.5 md:mb-1 shrink-0">
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
                    {toPersianNumber(totalFilteredRecordCount)}
                  </span>
                }
                style={{ backgroundColor: 'transparent', boxShadow: 'none' }}
                className="module-list-header-count"
             />
            </div>

            {(selectedRowKeys.length > 0 || (isMobileViewport && canShowGoalCards && !isSystemManagedModule)) ? (
              <div className="order-last basis-full pt-0 min-w-0 md:order-none md:mt-0 md:basis-auto md:pt-0 md:flex md:flex-[0_1_420px] md:items-center md:justify-start md:self-center xl:flex-[0_1_460px]">
                <div
                  ref={canShowGoalCards && selectedRowKeys.length === 0 ? utilitySlotRef : undefined}
                  className="w-full min-h-[30px]"
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
                        ...(selectedRowKeys.length > 1 && canEditModule && !isSystemManagedModule
                          ? [
                              {
                                key: "merge_records",
                                icon: <BranchesOutlined />,
                                tooltip: "ادغام",
                                onClick: handleMergeOpen,
                              },
                            ]
                          : []),
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
                    isMobileViewport && !isSystemManagedModule ? (
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
          renderMode={isMobileViewport ? "mobile-compact" : "desktop"}
          viewMode={viewMode}
          setViewMode={handleViewModeChange}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onRefresh={handleRefresh}
          kanbanEnabled={availableGroupFields.length > 0}
          calendarEnabled={availableCalendarFields.length > 0}
          mapEnabled={mapEnabled}
          kanbanGroupBy={kanbanGroupBy}
          kanbanGroupOptions={kanbanGroupOptions}
          onKanbanGroupChange={setKanbanGroupBy}
          calendarDateField={calendarDateField}
          calendarDateFieldOptions={calendarDateFieldOptions}
          onCalendarDateFieldChange={setCalendarDateField}
          onViewModeLauncherClick={() => setIsMobileViewModeSheetOpen(true)}
          mobileTrailingContent={
            isMobileViewport ? (
              <ViewManager
                moduleId={resolvedModuleId}
                currentView={currentView}
                onViewChange={handleViewChange}
                onRefresh={handleRefresh}
                renderMode="mobile-sheet"
              />
            ) : null
          }
        />

        <AdaptivePickerSurface
          open={isMobileViewModeSheetOpen}
          title="حالت‌های نمایش"
          subtitle="نحوه نمایش رکوردها را انتخاب کنید"
          zIndex={1055}
          onClose={() => setIsMobileViewModeSheetOpen(false)}
        >
          <div className="space-y-3">
            <div className="space-y-2">
              {mobileViewModeOptions.map((option) => {
                const isActive = viewMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-right transition ${
                      isActive
                        ? "border-leather-500 bg-[rgba(var(--brand-50-rgb),0.72)] dark:border-leather-500 dark:bg-white/10"
                        : "border-gray-200 bg-white dark:border-white/10 dark:bg-[#171717]"
                    }`}
                    onClick={() => handleMobileViewModeSelect(option.value as ViewMode)}
                  >
                    <span className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-100">
                      {option.icon}
                      {option.label}
                    </span>
                    {isActive ? (
                      <span className="shrink-0 rounded-full bg-leather-600 px-2 py-0.5 text-[10px] font-bold text-white">فعال</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {viewMode === ViewMode.KANBAN && kanbanGroupOptions.length > 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white px-3 py-3 dark:border-white/10 dark:bg-[#171717]">
                <div className="mb-2 text-xs font-bold text-gray-500 dark:text-gray-400">گروه‌بندی کانبان</div>
                <div className="space-y-2">
                  {kanbanGroupOptions.map((option) => {
                    const isActive = (kanbanGroupBy || kanbanGroupOptions[0]?.value) === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                          isActive
                            ? "bg-[rgba(var(--brand-50-rgb),0.72)] text-[rgb(var(--brand-700-rgb))] dark:bg-white/10 dark:text-white"
                            : "bg-gray-50 text-gray-700 dark:bg-white/5 dark:text-gray-200"
                        }`}
                        onClick={() => setKanbanGroupBy(option.value)}
                      >
                        <span>{option.label}</span>
                        {isActive ? <span className="text-[10px] font-bold">انتخاب شده</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {viewMode === ViewMode.CALENDAR && calendarDateFieldOptions.length > 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white px-3 py-3 dark:border-white/10 dark:bg-[#171717]">
                <div className="mb-2 text-xs font-bold text-gray-500 dark:text-gray-400">فیلد تاریخ تقویم</div>
                <div className="space-y-2">
                  {calendarDateFieldOptions.map((option) => {
                    const isActive = (calendarDateField || calendarDateFieldOptions[0]?.value) === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                          isActive
                            ? "bg-[rgba(var(--brand-50-rgb),0.72)] text-[rgb(var(--brand-700-rgb))] dark:bg-white/10 dark:text-white"
                            : "bg-gray-50 text-gray-700 dark:bg-white/5 dark:text-gray-200"
                        }`}
                        onClick={() => setCalendarDateField(option.value)}
                      >
                        <span>{option.label}</span>
                        {isActive ? <span className="text-[10px] font-bold">انتخاب شده</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </AdaptivePickerSurface>

        {hasListFilterBubbles ? (
        <div className="h-6 shrink-0">
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

         {!isMobileViewport ? (
           <div className="mb-1 shrink-0">
             <ViewManager
               moduleId={resolvedModuleId}
               currentView={currentView}
               onViewChange={handleViewChange}
               onRefresh={handleRefresh}
               renderMode="inline"
             />
           </div>
         ) : null}

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
                     pagination={effectiveTablePagination}
                     onChange={handleTableChange}
                     rowSelection={{ selectedRowKeys, onChange: handleRowSelectionChange, preserveSelectedRowKeys: true }}
                    onVisibleDataChange={handleVisibleDataChange}
                    onRow={handleTableRowProps}
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
                <div className="h-full overflow-y-auto px-1 pb-1 custom-scrollbar flex flex-col">
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
                      <div className="mt-3 flex justify-center items-center py-3 border-t border-gray-200 dark:border-gray-800">
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
                  <React.Suspense fallback={<Skeleton active paragraph={{ rows: 4 }} />}>
                    <MapView
                      data={enrichedData}
                      moduleId={resolvedModuleId}
                      moduleConfig={moduleConfig}
                      navigate={moduleListNavigate}
                    />
                  </React.Suspense>
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
                <div className="flex items-start gap-4 md:gap-5 h-full overflow-x-auto pb-2 px-1">
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
      {isMergeModalOpen && moduleConfig ? (
        <MergeRecordsModal
          open={isMergeModalOpen}
          moduleConfig={moduleConfig}
          records={mergeRecords}
          loading={mergeLoading}
          submitting={mergeSubmitting}
          canViewField={canViewField}
          dynamicOptions={dynamicOptions}
          relationOptions={effectiveRelationOptions}
          onCancel={() => {
            if (mergeSubmitting) return;
            setIsMergeModalOpen(false);
            setMergeRecords([]);
          }}
          onConfirm={handleMergeConfirm}
        />
      ) : null}
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
        onTogglePrintFieldGroup={listPrintManager.handleTogglePrintFieldGroup}
        onMovePrintField={listPrintManager.handleMovePrintField}
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
      {saasUserDrawerRecord && useSaasUserDrawer ? (
        <SaasUserAdminDrawer
          open
          record={saasUserDrawerRecord}
          onClose={() => setSaasUserDrawerRecord(null)}
          onChanged={() => {
            setSaasUserDrawerRecord(null);
            void tableQueryResult.refetch();
          }}
        />
      ) : null}
      {previewRecordId && useQuickPreviewModal && !useSaasUserDrawer ? (
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
