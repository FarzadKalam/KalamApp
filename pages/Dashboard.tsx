import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Empty, Grid, Row, Spin, Statistic, Table, Tag, message } from 'antd';
import {
  AppstoreOutlined,
  BankOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  FileTextOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  ProjectOutlined,
  SkinOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType, type ModuleDefinition } from '../types';
import {
  DASHBOARD_PERMISSION_KEY,
  canAccessAssignedRecord,
  fetchCurrentUserRecordAccessContext,
  isSaasAdminModuleId,
  resolvePreferredRoleModuleIds,
  resolveStoriesPermissions,
  resolveSaasAdminFieldPermission,
  type CurrentUserRecordAccessContext,
  type PermissionMap,
} from '../utils/permissions';
import { toPersianNumber, formatPersianPrice } from '../utils/persianNumberFormatter';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { readCurrencyConfig, useCurrencyConfig } from '../utils/currency';
import { BRANDING_APPLIED_EVENT, DEFAULT_BRANDING } from '../theme/brandTheme';
import { readRuntimeBranding } from '../utils/brandingRuntime';
import { fetchModuleListRelationOptions } from '../utils/moduleListOptions';
import { getOptionLabel } from '../utils/optionHelpers';
import PhoneDisplay from '../components/PhoneDisplay';
import GoalProgressSlider from '../components/goals/GoalProgressSlider';
import OccasionsWidget from '../components/dashboard/OccasionsWidget';
import TaskCalendarWidget from '../components/dashboard/TaskCalendarWidget';
import ReportsSliderWidget from '../components/dashboard/ReportsSliderWidget';
import OurProcessesWidget from '../components/dashboard/OurProcessesWidget';
import StoryBar from '../components/stories/StoryBar';
import StoryViewerModal from '../components/stories/StoryViewerModal';
import StoryEditorModal from '../components/stories/StoryEditorModal';
import { notifyStorySms } from '../utils/storyNotification';
import type { OrgStoryWithMeta, OrgStory } from '../components/stories/storyTypes';
import { fetchActiveOrgStoriesWithMeta } from '../utils/orgStories';

type DashboardQuickAction = {
  moduleId: string;
  title: string;
  description: string;
};

type DashboardCardItem = {
  moduleId: string;
  title: string;
  value: number;
  kind: 'number' | 'price';
  subtitle: string;
};

type DashboardRecentSection = {
  moduleId: string;
  title: string;
  columns: any[];
  rows: any[];
};

type DashboardBootstrapResult = {
  widgetPermissions: Record<string, boolean>;
  quickActions: DashboardQuickAction[];
  cards: DashboardCardItem[];
  recentSections: DashboardRecentSection[];
};

const DASHBOARD_BOOTSTRAP_TTL_MS = 5 * 60_000;
const RECENT_RECORDS_LIMIT = 10;
const DASHBOARD_MAX_MODULES = 6;
const DASHBOARD_CARD_CONCURRENCY = 3;
const DASHBOARD_RECENT_CONCURRENCY = 2;
const NEW_RECORDS_DAYS = 30;


const SIMPLE_RECENT_FIELD_TYPES = new Set<FieldType>([
  FieldType.TEXT,
  FieldType.STATUS,
  FieldType.DATE,
  FieldType.DATETIME,
  FieldType.TIME,
  FieldType.NUMBER,
  FieldType.PRICE,
  FieldType.PHONE,
  FieldType.SELECT,
]);

const SYNTHETIC_FIELD_META: Record<string, { label: string; type: FieldType }> = {
  created_at: { label: 'تاریخ ایجاد', type: FieldType.DATETIME },
  updated_at: { label: 'آخرین ویرایش', type: FieldType.DATETIME },
};

let dashboardBootstrapCache: {
  key: string | null;
  data: DashboardBootstrapResult | null;
  expiresAt: number;
} = {
  key: null,
  data: null,
  expiresAt: 0,
};

let dashboardBootstrapPromiseKey: string | null = null;
let dashboardBootstrapPromise: Promise<DashboardBootstrapResult> | null = null;
const dashboardCardCache = new Map<string, { data: DashboardCardItem | null; expiresAt: number }>();
const dashboardCardPromiseCache = new Map<string, Promise<DashboardCardItem | null>>();
const dashboardRecentSectionCache = new Map<string, { data: DashboardRecentSection | null; expiresAt: number }>();
const dashboardRecentSectionPromiseCache = new Map<string, Promise<DashboardRecentSection | null>>();
const dashboardSelectableColumnsCache = new Map<string, string[]>();
const dashboardOrderableColumnsCache = new Map<string, string[]>();

const mapWithConcurrency = async <TItem, TResult>(
  items: TItem[],
  concurrency: number,
  worker: (item: TItem, index: number) => Promise<TResult>
): Promise<TResult[]> => {
  const nextConcurrency = Math.max(1, Math.floor(concurrency || 1));
  const results: TResult[] = new Array(items.length);
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(nextConcurrency, items.length || 1) }, () => runWorker())
  );

  return results;
};

const getTodayPersianDate = () => {
  try {
    const today = new Date();
    const dateObj = new DateObject({
      date: today,
      calendar: gregorian,
      locale: gregorian_en,
    }).convert(persian, persian_fa);
    const gregorianDate = new DateObject({
      date: today,
      calendar: gregorian,
      locale: gregorian_en,
    }).format('YYYY/MM/DD');
    return `${dateObj.format('dddd، DD MMMM YYYY')} | میلادی: ${toPersianNumber(gregorianDate)}`;
  } catch {
    return 'تاریخ امروز';
  }
};

const formatPersianDate = (val: any, format: string) => {
  if (!val) return '-';
  try {
    let dateObj: DateObject;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      dateObj = new DateObject({
        date: val,
        format: 'YYYY-MM-DD',
        calendar: gregorian,
        locale: gregorian_en,
      });
    } else {
      const jsDate = new Date(val);
      if (Number.isNaN(jsDate.getTime())) return '-';
      dateObj = new DateObject({
        date: jsDate,
        calendar: gregorian,
        locale: gregorian_en,
      });
    }
    return dateObj.convert(persian, persian_fa).format(format);
  } catch {
    return '-';
  }
};

const getModuleIcon = (moduleId: string) => {
  const iconMap: Record<string, React.ReactNode> = {
    products: <SkinOutlined />,
    product_bundles: <AppstoreOutlined />,
    price_lists: <AppstoreOutlined />,
    production_orders: <CheckSquareOutlined />,
    invoices: <FileTextOutlined />,
    purchase_invoices: <FileTextOutlined />,
    customers: <TeamOutlined />,
    suppliers: <TeamOutlined />,
    employees: <TeamOutlined />,
    tasks: <CheckSquareOutlined />,
    projects: <ProjectOutlined />,
    warehouses: <BankOutlined />,
    billboards: <AppstoreOutlined />,
    marketing_leads: <FileTextOutlined />,
    attendance_logs: <CheckSquareOutlined />,
    process_runs: <NodeIndexOutlined />,
    process_templates: <NodeIndexOutlined />,
  };
  return iconMap[moduleId] || <AppstoreOutlined />;
};

const getModuleTitle = (moduleId: string) => {
  return MODULES[moduleId]?.titles?.faSingular || MODULES[moduleId]?.titles?.fa || moduleId;
};

const getRecentFieldKeys = (module: ModuleDefinition) => {
  const explicit = (module.dashboard?.recentListFields || []).filter(Boolean);
  if (explicit.length > 0) {
    return explicit;
  }

  return (module.fields || [])
    .filter((field: any) => {
      const isHeaderField = field.location === 'header' || String(field.location || '') === 'header';
      return isHeaderField && SIMPLE_RECENT_FIELD_TYPES.has(field.type);
    })
    .sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0))
    .slice(0, 4)
    .map((field: any) => String(field.key));
};

const getFieldMeta = (module: ModuleDefinition, fieldKey: string) => {
  return (
    module.fields.find((field: any) => String(field.key) === String(fieldKey)) || {
      key: fieldKey,
      labels: { fa: SYNTHETIC_FIELD_META[fieldKey]?.label || fieldKey },
      type: SYNTHETIC_FIELD_META[fieldKey]?.type || FieldType.TEXT,
      options: [],
    }
  );
};

const renderFieldValue = (
  module: ModuleDefinition,
  fieldKey: string,
  value: any,
  relationOptions: Record<string, any[]> = {}
) => {
  const field = getFieldMeta(module, fieldKey);

  if (value === null || value === undefined || value === '') return '-';

  switch (field.type) {
    case FieldType.STATUS:
    case FieldType.SELECT: {
      const option = (field.options || []).find((item: any) => String(item.value) === String(value));
      const text = option?.label || String(value);
      return field.type === FieldType.STATUS ? <Tag color={option?.color || 'default'}>{text}</Tag> : text;
    }
    case FieldType.RELATION:
    case FieldType.USER:
      return getOptionLabel({ ...field, type: FieldType.RELATION }, value, {}, relationOptions);
    case FieldType.PRICE:
      return `${formatPersianPrice(Number(value || 0), true)} ${readCurrencyConfig().label}`;
    case FieldType.NUMBER:
      return toPersianNumber(value);
    case FieldType.PHONE:
      return <PhoneDisplay value={value} size="sm" />;
    case FieldType.DATE:
      return formatPersianDate(value, 'YYYY/MM/DD');
    case FieldType.DATETIME:
      return formatPersianDate(value, 'YYYY/MM/DD HH:mm');
    case FieldType.TIME:
      return toPersianNumber(String(value));
    case FieldType.CHECKBOX:
      return value ? 'بله' : 'خیر';
    default:
      return String(value);
  }
};

const countRows = async (table: string, apply?: (query: any) => any) => {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  if (apply) query = apply(query);
  const { count } = await query;
  return Number(count || 0);
};

const mergeDashboardRowsById = <TRow extends { id?: string | null }>(rows: TRow[]) => {
  const map = new Map<string, TRow>();
  (rows || []).forEach((row) => {
    const rowId = String(row?.id || '').trim();
    if (!rowId) return;
    map.set(rowId, row);
  });
  return Array.from(map.values());
};

const getModuleRecordScope = (permissions: PermissionMap | null | undefined, moduleId: string) => {
  const modulePerm = permissions?.[moduleId] || {};
  return modulePerm.record_scope ?? (modulePerm.view === false ? 'own' : 'all');
};

const parseMissingColumnName = (error: any) => {
  const text = String(error?.message || error?.details || error?.hint || '').trim();
  if (!text) return null;
  const patterns = [
    /column ["']?([a-zA-Z0-9_]+)["']?/i,
    /could not find the ['"]?([a-zA-Z0-9_]+)['"]? column/i,
    /schema cache.*\b([a-zA-Z0-9_]+)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return String(match[1]).trim();
  }
  return null;
};

const isDashboardMissingColumnError = (error: any) => Boolean(parseMissingColumnName(error));

const normalizeColumnList = (columns: string[]) =>
  Array.from(new Set((columns || []).map((column) => String(column || '').trim()).filter(Boolean)));

const safeSelectRows = async (
  table: string,
  columns: string[],
  options?: {
    limit?: number;
    orderBy?: Array<{ field: string; ascending: boolean; nullsFirst?: boolean }>;
  }
) => {
  const normalizedTable = String(table || '').trim();
  let activeColumns = normalizeColumnList(columns);
  const cachedColumns = dashboardSelectableColumnsCache.get(normalizedTable);
  if (cachedColumns?.length) {
    const filtered = activeColumns.filter((column) => cachedColumns.includes(column));
    if (filtered.length) activeColumns = filtered;
  }

  let activeOrderBy = (options?.orderBy || []).filter((entry) => entry?.field).map((entry) => ({
    field: String(entry.field).trim(),
    ascending: Boolean(entry.ascending),
    nullsFirst: entry.nullsFirst,
  }));
  const cachedOrderFields = dashboardOrderableColumnsCache.get(normalizedTable);
  if (cachedOrderFields?.length) {
    const filtered = activeOrderBy.filter((entry) => cachedOrderFields.includes(entry.field));
    if (filtered.length) activeOrderBy = filtered;
  }

  while (activeColumns.length > 0) {
    let query = supabase.from(normalizedTable).select(activeColumns.join(','));
    activeOrderBy.forEach((entry) => {
      query = query.order(entry.field, { ascending: entry.ascending, nullsFirst: entry.nullsFirst });
    });
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (!error) {
      dashboardSelectableColumnsCache.set(normalizedTable, [...activeColumns]);
      dashboardOrderableColumnsCache.set(normalizedTable, activeOrderBy.map((entry) => entry.field));
      return { data: data || [], error: null };
    }

    const missingColumn = parseMissingColumnName(error);
    if (missingColumn && activeColumns.includes(missingColumn)) {
      activeColumns = activeColumns.filter((column) => column !== missingColumn);
      continue;
    }
    if (missingColumn && activeOrderBy.some((entry) => entry.field === missingColumn)) {
      activeOrderBy = activeOrderBy.filter((entry) => entry.field !== missingColumn);
      continue;
    }
    return { data: [] as any[], error };
  }

  return { data: [] as any[], error: null };
};

const runOrderedDashboardSelect = async (
  table: string,
  columns: string[],
  options?: {
    limit?: number;
    orderBy?: Array<{ field: string; ascending: boolean; nullsFirst?: boolean }>;
  },
  apply?: (query: any) => any,
) => {
  const normalizedTable = String(table || '').trim();
  let activeColumns = normalizeColumnList(columns);
  const cachedColumns = dashboardSelectableColumnsCache.get(normalizedTable);
  if (cachedColumns?.length) {
    const filtered = activeColumns.filter((column) => cachedColumns.includes(column));
    if (filtered.length) activeColumns = filtered;
  }

  let activeOrderBy = (options?.orderBy || []).filter((entry) => entry?.field).map((entry) => ({
    field: String(entry.field).trim(),
    ascending: Boolean(entry.ascending),
    nullsFirst: entry.nullsFirst,
  }));
  const cachedOrderFields = dashboardOrderableColumnsCache.get(normalizedTable);
  if (cachedOrderFields?.length) {
    const filtered = activeOrderBy.filter((entry) => cachedOrderFields.includes(entry.field));
    if (filtered.length) activeOrderBy = filtered;
  }

  while (activeColumns.length > 0) {
    let query = supabase.from(normalizedTable).select(activeColumns.join(','));
    if (apply) {
      query = apply(query);
    }
    activeOrderBy.forEach((entry) => {
      query = query.order(entry.field, { ascending: entry.ascending, nullsFirst: entry.nullsFirst });
    });
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (!error) {
      dashboardSelectableColumnsCache.set(normalizedTable, [...activeColumns]);
      dashboardOrderableColumnsCache.set(normalizedTable, activeOrderBy.map((entry) => entry.field));
      return { data: data || [], error: null };
    }

    const missingColumn = parseMissingColumnName(error);
    if (missingColumn && activeColumns.includes(missingColumn)) {
      activeColumns = activeColumns.filter((column) => column !== missingColumn);
      continue;
    }
    if (missingColumn && activeOrderBy.some((entry) => entry.field === missingColumn)) {
      activeOrderBy = activeOrderBy.filter((entry) => entry.field !== missingColumn);
      continue;
    }
    return { data: [] as any[], error };
  }

  return { data: [] as any[], error: null };
};

const moduleSupportsScopedRecords = (moduleId: string) => {
  const module = MODULES[moduleId];
  const fieldKeys = new Set((module?.fields || []).map((field: any) => String(field?.key || '')));
  return fieldKeys.has('assignee_id') || fieldKeys.has('assignee_type') || fieldKeys.has('assignee_role_id');
};

const filterRowsByRecordScope = (
  rows: any[],
  moduleId: string,
  recordAccess: CurrentUserRecordAccessContext
) => {
  const recordScope = getModuleRecordScope(recordAccess.permissions, moduleId);
  if (recordScope === 'all') return rows;
  if (!moduleSupportsScopedRecords(moduleId)) return [];
  return rows.filter((row) =>
    canAccessAssignedRecord(row, recordAccess.userId, recordAccess.roleId, recordScope, {
      currentOrgId: recordAccess.orgId,
      allowedRoleIds: recordAccess.allowedRoleIds,
      allowedUserIds: recordAccess.allowedUserIds,
    })
  );
};

const fetchScopedDashboardRows = async (
  table: string,
  moduleId: string,
  columns: string[],
  recordAccess: CurrentUserRecordAccessContext,
  options?: {
    limit?: number;
    orderBy?: Array<{ field: string; ascending: boolean; nullsFirst?: boolean }>;
  }
) => {
  const recordScope = getModuleRecordScope(recordAccess.permissions, moduleId);
  if (recordScope === 'all' || !moduleSupportsScopedRecords(moduleId)) {
    return safeSelectRows(table, columns, options);
  }

  const allowedUserIds = Array.from(
    new Set([recordAccess.userId, ...(recordAccess.allowedUserIds || [])].map((id) => String(id || '').trim()).filter(Boolean))
  );
  const allowedRoleIds = Array.from(
    new Set([recordAccess.roleId, ...(recordAccess.allowedRoleIds || [])].map((id) => String(id || '').trim()).filter(Boolean))
  );

  const typedUserRequest = allowedUserIds.length > 0
    ? runOrderedDashboardSelect(table, columns, options, (query) =>
        query.eq('assignee_type', 'user').in('assignee_id', allowedUserIds)
      )
    : Promise.resolve({ data: [] as any[], error: null });

  const typedRoleRequest = allowedRoleIds.length > 0
    ? runOrderedDashboardSelect(table, columns, options, (query) =>
        query.eq('assignee_type', 'role').in('assignee_role_id', allowedRoleIds)
      )
    : Promise.resolve({ data: [] as any[], error: null });

  const [typedUserResult, typedRoleResult] = await Promise.all([typedUserRequest, typedRoleRequest]);
  const typedErrors = [typedUserResult.error, typedRoleResult.error].filter(Boolean);
  if (typedErrors.length === 0) {
    return { data: mergeDashboardRowsById([...(typedUserResult.data || []), ...(typedRoleResult.data || [])]), error: null };
  }

  const missingAssigneeSchemaOnly = typedErrors.every((error) => {
    const text = String(error?.message || error?.details || '').toLowerCase();
    return text.includes('assignee_') || isDashboardMissingColumnError(error);
  });

  if (!missingAssigneeSchemaOnly) {
    return { data: [] as any[], error: typedErrors[0] };
  }

  const legacyIds = Array.from(new Set([...allowedUserIds, ...allowedRoleIds]));
  if (legacyIds.length === 0) {
    return { data: [], error: null };
  }

  return runOrderedDashboardSelect(table, columns, options, (query) =>
    query.in('assignee_id', legacyIds)
  );
};

const TASK_SHARED_COLUMNS = [
  'id', 'org_id', 'assignee_id', 'assignee_role_id', 'assignee_type',
  'status', 'name', 'priority', 'task_type', 'start_date', 'due_date',
  'completed_at', 'updated_at', 'created_at',
];

let _dashboardTasksCache: {
  data: any[] | null;
  expiresAt: number;
  userId: string | null;
  promise: Promise<any[]> | null;
} = { data: null, expiresAt: 0, userId: null, promise: null };

const fetchDashboardTasksShared = async (
  recordAccess: CurrentUserRecordAccessContext
): Promise<any[]> => {
  const now = Date.now();
  if (
    _dashboardTasksCache.data !== null &&
    _dashboardTasksCache.expiresAt > now &&
    _dashboardTasksCache.userId === String(recordAccess.userId || '')
  ) {
    return _dashboardTasksCache.data;
  }
  if (_dashboardTasksCache.promise) return _dashboardTasksCache.promise;

  _dashboardTasksCache.promise = fetchScopedDashboardRows(
    'tasks', 'tasks', TASK_SHARED_COLUMNS, recordAccess, { limit: 500 }
  ).then(({ data }) => {
    const rows = data || [];
    _dashboardTasksCache = {
      data: rows,
      expiresAt: Date.now() + DASHBOARD_BOOTSTRAP_TTL_MS,
      userId: String(recordAccess.userId || ''),
      promise: null,
    };
    return rows;
  }).catch((err) => {
    _dashboardTasksCache.promise = null;
    throw err;
  });

  return _dashboardTasksCache.promise;
};

const getDashboardCardCacheKey = (
  moduleId: string,
  recordAccess: CurrentUserRecordAccessContext
) =>
  [
    moduleId,
    recordAccess.userId || 'no-user',
    recordAccess.roleId || 'no-role',
    getModuleRecordScope(recordAccess.permissions, moduleId),
    [...(recordAccess.allowedRoleIds || [])].sort().join(',') || 'no-roles',
    [...(recordAccess.allowedUserIds || [])].sort().join(',') || 'no-users',
  ].join(':');

const getDashboardRecentSectionCacheKey = (moduleId: string, recordAccess: CurrentUserRecordAccessContext) =>
  [
    moduleId,
    recordAccess.userId || 'no-user',
    recordAccess.roleId || 'no-role',
    getModuleRecordScope(recordAccess.permissions, moduleId),
    [...(recordAccess.allowedRoleIds || [])].sort().join(',') || 'no-roles',
    [...(recordAccess.allowedUserIds || [])].sort().join(',') || 'no-users',
  ].join(':');

const resolveDashboardModuleIds = (
  permissions: PermissionMap | null | undefined,
  preferredModuleIds: string[]
) => {
  const next: string[] = [];
  const visibleModuleIds = Object.keys(MODULES).filter(
    (moduleId) => !isSaasAdminModuleId(moduleId) && permissions?.[moduleId]?.view !== false
  );

  const pushUnique = (moduleId: string) => {
    if (!moduleId || !MODULES[moduleId] || !visibleModuleIds.includes(moduleId) || next.includes(moduleId)) return;
    next.push(moduleId);
  };

  preferredModuleIds.forEach(pushUnique);

  visibleModuleIds
    .filter((moduleId) => {
      const module = MODULES[moduleId];
      if (!module?.dashboard) return false;
      if (!moduleSupportsScopedRecords(moduleId)) return false;
      return getModuleRecordScope(permissions, moduleId) !== 'all';
    })
    .forEach(pushUnique);

  return next;
};

const loadCardForModule = async (
  moduleId: string,
  recordAccess: CurrentUserRecordAccessContext
): Promise<DashboardCardItem | null> => {
  const cacheKey = getDashboardCardCacheKey(moduleId, recordAccess);
  const cached = dashboardCardCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const pendingCard = dashboardCardPromiseCache.get(cacheKey);
  if (pendingCard) {
    return pendingCard;
  }

  const pending: Promise<DashboardCardItem | null> = (async () => {
  const module = MODULES[moduleId];
  if (!module) return null;

  const preset = module.dashboard?.summaryCard?.preset;
  const title = module.dashboard?.summaryCard?.title || module.titles.fa;
  const recentSince = new Date(Date.now() - NEW_RECORDS_DAYS * 24 * 60 * 60 * 1000).toISOString();

  switch (preset) {
    case 'tasks_pending_mine': {
      const data = await fetchDashboardTasksShared(recordAccess);
      const scopedRows = filterRowsByRecordScope(data, moduleId, recordAccess);
      const pendingCount = scopedRows.filter((row: any) =>
        ['todo', 'in_progress', 'review'].includes(String(row?.status || ''))
      ).length;
      const totalCount = scopedRows.length;
      return {
        moduleId,
        title,
        value: pendingCount,
        kind: 'number',
        subtitle: `از کل ${toPersianNumber(totalCount)} فعالیت`,
      };
    }

    case 'invoices_total_amount_mine': {
      const { data } = await fetchScopedDashboardRows('invoices', moduleId, ['id', 'org_id', 'assignee_id', 'assignee_role_id', 'assignee_type', 'total_invoice_amount'], recordAccess);
      const scopedRows = filterRowsByRecordScope(data || [], moduleId, recordAccess);
      const totalAmount = scopedRows.reduce((sum: number, row: any) => sum + Number(row?.total_invoice_amount || 0), 0);
      const count = scopedRows.length;
      return {
        moduleId,
        title,
        value: totalAmount,
        kind: 'price',
        subtitle: `از ${toPersianNumber(count || 0)} عدد فاکتور`,
      };
    }

    case 'customers_new_mine': {
      const { data } = await fetchScopedDashboardRows('customers', moduleId, ['id', 'org_id', 'assignee_id', 'assignee_role_id', 'assignee_type', 'created_at'], recordAccess);
      const scopedRows = filterRowsByRecordScope(data || [], moduleId, recordAccess);
      const newCount = scopedRows.filter((row: any) => String(row?.created_at || '') >= recentSince).length;
      return {
        moduleId,
        title,
        value: newCount,
        kind: 'number',
        subtitle: `${toPersianNumber(newCount)} عدد برای من`,
      };
    }

    case 'projects_in_progress': {
      if (getModuleRecordScope(recordAccess.permissions, moduleId) !== 'all') {
        return null;
      }
      const activeProjects = await countRows('projects', (query) => query.eq('status', 'in_progress'));
      const memberProjects = recordAccess.userId
        ? await countRows('project_members', (query) =>
            query.eq('user_id', recordAccess.userId).eq('is_active', true)
          )
        : 0;
      return {
        moduleId,
        title,
        value: activeProjects,
        kind: 'number',
        subtitle: `من در ${toPersianNumber(memberProjects)} پروژه نقش دارم`,
      };
    }

    case 'billboards_opening': {
      const { data } = await fetchScopedDashboardRows('billboards', moduleId, ['id', 'org_id', 'assignee_id', 'assignee_role_id', 'assignee_type', 'status'], recordAccess);
      const scopedRows = filterRowsByRecordScope(data || [], moduleId, recordAccess);
      const openingCount = scopedRows.filter((row: any) => String(row?.status || '') === 'opening').length;
      const freeCount = scopedRows.filter((row: any) => String(row?.status || '') === 'free').length;
      return {
        moduleId,
        title,
        value: openingCount,
        kind: 'number',
        subtitle: `تعداد ${toPersianNumber(freeCount)} عدد تابلوی آزاد`,
      };
    }

    case 'products_total': {
      const { data } = await fetchScopedDashboardRows('products', moduleId, ['id', 'org_id', 'assignee_id', 'assignee_role_id', 'assignee_type', 'created_at'], recordAccess);
      const scopedRows = filterRowsByRecordScope(data || [], moduleId, recordAccess);
      const totalCount = scopedRows.length;
      const newCount = scopedRows.filter((row: any) => String(row?.created_at || '') >= recentSince).length;
      return {
        moduleId,
        title,
        value: totalCount,
        kind: 'number',
        subtitle: `${toPersianNumber(newCount)} عدد محصول جدید`,
      };
    }

    default: {
      const selectFields = moduleSupportsScopedRecords(moduleId)
        ? 'id, org_id, assignee_id, assignee_role_id, assignee_type, created_at'
        : 'id, created_at';
      const { data } = await fetchScopedDashboardRows(module.table || moduleId, moduleId, selectFields.split(','), recordAccess);
      const scopedRows = filterRowsByRecordScope(data || [], moduleId, recordAccess);
      const totalCount = scopedRows.length;
      const newCount = scopedRows.filter((row: any) => String(row?.created_at || '') >= recentSince).length;
      return {
        moduleId,
        title,
        value: totalCount,
        kind: 'number',
        subtitle: `${toPersianNumber(newCount)} مورد جدید`,
      };
    }
  }
  })();

  dashboardCardPromiseCache.set(cacheKey, pending);
  try {
    const result = await pending;
    dashboardCardCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + DASHBOARD_BOOTSTRAP_TTL_MS,
    });
    return result;
  } finally {
    if (dashboardCardPromiseCache.get(cacheKey) === pending) {
      dashboardCardPromiseCache.delete(cacheKey);
    }
  }
};

const loadRecentSection = async (
  moduleId: string,
  recordAccess: CurrentUserRecordAccessContext
): Promise<DashboardRecentSection | null> => {
  const cacheKey = getDashboardRecentSectionCacheKey(moduleId, recordAccess);
  const cached = dashboardRecentSectionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const pendingSection = dashboardRecentSectionPromiseCache.get(cacheKey);
  if (pendingSection) {
    return pendingSection;
  }

  const pending: Promise<DashboardRecentSection | null> = (async () => {
  const module = MODULES[moduleId];
  if (!module) return null;

  const fieldKeys = Array.from(new Set(['id', ...getRecentFieldKeys(module)]));
  const selectKeys = Array.from(new Set([...fieldKeys, 'created_at', 'updated_at']));

  const scopedSelectKeys = moduleSupportsScopedRecords(moduleId)
    ? Array.from(new Set([...selectKeys, 'org_id', 'assignee_id', 'assignee_role_id', 'assignee_type']))
    : selectKeys;

  const { data } = await fetchScopedDashboardRows(module.table || moduleId, moduleId, scopedSelectKeys, recordAccess, {
    orderBy: [
      { field: 'updated_at', ascending: false, nullsFirst: false },
      { field: 'created_at', ascending: false, nullsFirst: false },
    ],
    limit: RECENT_RECORDS_LIMIT + 2,
  });

  const recentFields = getRecentFieldKeys(module)
    .map((fieldKey) => getFieldMeta(module, fieldKey))
    .filter(Boolean);
  const relationOptions = recentFields.some((field: any) => field?.type === FieldType.RELATION || field?.type === FieldType.USER)
    ? await fetchModuleListRelationOptions(supabase, recentFields as any[], { users: [], roles: [] })
    : {};

  const columns = getRecentFieldKeys(module).map((fieldKey) => ({
    title: getFieldMeta(module, fieldKey)?.labels?.fa || fieldKey,
    dataIndex: fieldKey,
    key: fieldKey,
    ellipsis: true,
    render: (value: any) => renderFieldValue(module, fieldKey, value, relationOptions),
  }));

  return {
    moduleId,
    title: module.titles.fa,
    columns,
    rows: filterRowsByRecordScope(data || [], moduleId, recordAccess).slice(0, RECENT_RECORDS_LIMIT),
  };
  })();

  dashboardRecentSectionPromiseCache.set(cacheKey, pending);
  try {
    const result = await pending;
    dashboardRecentSectionCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + DASHBOARD_BOOTSTRAP_TTL_MS,
    });
    return result;
  } finally {
    if (dashboardRecentSectionPromiseCache.get(cacheKey) === pending) {
      dashboardRecentSectionPromiseCache.delete(cacheKey);
    }
  }
};

const buildDashboardBootstrap = async (): Promise<DashboardBootstrapResult> => {
  const [snapshot, recordAccess] = await Promise.all([
    fetchSessionBootstrap(supabase),
    fetchCurrentUserRecordAccessContext(supabase),
  ]);
  const userId = snapshot.user?.id ? String(snapshot.user.id) : null;
  const roleId = snapshot.roleId ? String(snapshot.roleId) : null;
  const permissions = snapshot.permissions || {};
  const dashboardPermissions = permissions?.[DASHBOARD_PERMISSION_KEY] || {};

  if (!userId) {
    return {
      widgetPermissions: {},
      quickActions: [],
      cards: [],
      recentSections: [],
    };
  }

  if (dashboardPermissions.view === false) {
    return {
      widgetPermissions: { __all: false },
      quickActions: [],
      cards: [],
      recentSections: [],
    };
  }

  const preferredModuleIds = resolvePreferredRoleModuleIds(permissions, MODULES, 8);
  const dashboardModuleIds = resolveDashboardModuleIds(permissions, preferredModuleIds).slice(0, DASHBOARD_MAX_MODULES);
  const cacheKey = [
    userId,
    roleId || 'no-role',
    preferredModuleIds.join(','),
    dashboardModuleIds.join(','),
    [...(recordAccess.allowedRoleIds || [])].sort().join(',') || 'no-roles',
    [...(recordAccess.allowedUserIds || [])].sort().join(',') || 'no-users',
  ].join(':');

  if (
    dashboardBootstrapCache.key === cacheKey &&
    dashboardBootstrapCache.data &&
    dashboardBootstrapCache.expiresAt > Date.now()
  ) {
    return dashboardBootstrapCache.data;
  }

  if (dashboardBootstrapPromise && dashboardBootstrapPromiseKey === cacheKey) {
    return dashboardBootstrapPromise;
  }

  dashboardBootstrapPromiseKey = cacheKey;
  dashboardBootstrapPromise = (async () => {
    const quickActions = preferredModuleIds.slice(0, DASHBOARD_MAX_MODULES).map((moduleId) => ({
      moduleId,
      title: MODULES[moduleId]?.dashboard?.quickCreateLabel || `ایجاد ${getModuleTitle(moduleId)}`,
      description: getModuleTitle(moduleId),
    }));

    const [cards, recentSections] = await Promise.all([
      mapWithConcurrency(dashboardModuleIds, DASHBOARD_CARD_CONCURRENCY, (moduleId) =>
        loadCardForModule(moduleId, recordAccess)
      ),
      mapWithConcurrency(dashboardModuleIds, DASHBOARD_RECENT_CONCURRENCY, (moduleId) =>
        loadRecentSection(moduleId, recordAccess)
      ),
    ]);

    const result: DashboardBootstrapResult = {
      widgetPermissions: (dashboardPermissions.fields || {}) as Record<string, boolean>,
      quickActions,
      cards: cards.filter(Boolean) as DashboardCardItem[],
      recentSections: recentSections.filter(Boolean) as DashboardRecentSection[],
    };

    dashboardBootstrapCache = {
      key: cacheKey,
      data: result,
      expiresAt: Date.now() + DASHBOARD_BOOTSTRAP_TTL_MS,
    };

    return result;
  })();

  try {
    return await dashboardBootstrapPromise;
  } finally {
    if (dashboardBootstrapPromiseKey === cacheKey) {
      dashboardBootstrapPromise = null;
      dashboardBootstrapPromiseKey = null;
    }
  }
};

// پیش‌بارگذاری استوری‌ها در موازات bootstrap داشبورد
const fetchInitialStories = async (orgId: string, userId: string): Promise<OrgStoryWithMeta[]> => {
  try {
    return await fetchActiveOrgStoriesWithMeta({
      supabaseClient: supabase,
      orgId,
      currentUserId: userId,
    });
  } catch {
    return [];
  }
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const currency = useCurrencyConfig();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(true);
  const [dashboardReady, setDashboardReady] = useState(false);
  const [brandTitle, setBrandTitle] = useState(() => readRuntimeBranding().appTitle || DEFAULT_BRANDING.brandName);
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(() => readRuntimeBranding().logoUrl || null);
  const [widgetPermissions, setWidgetPermissions] = useState<Record<string, boolean>>({});
  const [quickActions, setQuickActions] = useState<DashboardQuickAction[]>([]);
  const [cards, setCards] = useState<DashboardCardItem[]>([]);
  const [recentSections, setRecentSections] = useState<DashboardRecentSection[]>([]);
  const [prefetchedTasks, setPrefetchedTasks] = useState<any[]>([]);

  // ─── استوری‌ها ───────────────────────────────
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState('');
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [storiesPermissions, setStoriesPermissions] = useState<ReturnType<typeof resolveStoriesPermissions> | null>(null);
  const [canPublishSaasStory, setCanPublishSaasStory] = useState(false);
  const [canPublishSaasAdminStory, setCanPublishSaasAdminStory] = useState(false);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  const [storyViewerList, setStoryViewerList] = useState<OrgStoryWithMeta[]>([]);
  const [storyEditorOpen, setStoryEditorOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<OrgStory | null>(null);
  const [storyRefreshKey, setStoryRefreshKey] = useState(0);
  const [initialStories, setInitialStories] = useState<OrgStoryWithMeta[]>([]);
  const quickActionDesktopColumns = useMemo(() => {
    const count = quickActions.length;
    if (count <= 0) return 1;
    if (count <= 4) return count;
    if (count <= 6) return 3;
    return 4;
  }, [quickActions.length]);

  useEffect(() => {
    const syncBranding = () => {
      const branding = readRuntimeBranding();
      setBrandTitle(branding.appTitle || DEFAULT_BRANDING.brandName);
      setBrandLogoUrl(branding.logoUrl || null);
    };
    syncBranding();
    window.addEventListener(BRANDING_APPLIED_EVENT, syncBranding as EventListener);
    return () => {
      window.removeEventListener(BRANDING_APPLIED_EVENT, syncBranding as EventListener);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      setLoading(true);
      try {
        // مرحله ۱: session سریع است (معمولاً کش شده)
        const snapshot = await fetchSessionBootstrap(supabase);
        const userId = snapshot.user?.id ? String(snapshot.user.id) : null;
        const snapshotOrgId = snapshot.orgId ? String(snapshot.orgId) : null;

        // مرحله ۲: bootstrap و استوری‌ها را موازی fetch می‌کنیم
        const [result, fetchedStories] = await Promise.all([
          buildDashboardBootstrap(),
          userId && snapshotOrgId
            ? fetchInitialStories(snapshotOrgId, userId)
            : Promise.resolve([]),
        ]);

        if (!isMounted) return;
        setWidgetPermissions(result.widgetPermissions || {});
        setQuickActions(result.quickActions || []);
        setCards(result.cards || []);
        setRecentSections(result.recentSections || []);
        if (_dashboardTasksCache.data) {
          setPrefetchedTasks(_dashboardTasksCache.data);
        }

        if (userId) {
          setCurrentUserId(userId);
          setOrgId(snapshotOrgId);
          const profile = (snapshot as any).profile;
          setCurrentUserName(
            String(profile?.full_name || profile?.display_name || snapshot.user?.email || '')
          );
          setCurrentUserAvatar(profile?.avatar_url ? String(profile.avatar_url) : null);
          const perms = snapshot.permissions as PermissionMap | null;
          setStoriesPermissions(resolveStoriesPermissions(perms));
          setCanPublishSaasStory(resolveSaasAdminFieldPermission(perms, 'publish_saas_story'));
          setCanPublishSaasAdminStory(resolveSaasAdminFieldPermission(perms, 'publish_saas_admin_story'));
          setInitialStories(fetchedStories);
        }
      } catch (error) {
        console.error('Error loading dashboard:', error);
        if (!isMounted) return;
        setWidgetPermissions({});
        setQuickActions([]);
        setCards([]);
        setRecentSections([]);
      } finally {
        if (!isMounted) return;
        setLoading(false);
        setDashboardReady(true);
      }
    };

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const canShowWidget = (key: string) => {
    if (!dashboardReady) return false;
    if (widgetPermissions.__all === false) return false;
    return widgetPermissions[key] !== false;
  };

  const showReportsWidget = canShowWidget('reports_slider');
  const showOurProcessesWidget = canShowWidget('our_processes');
  const showActivityCalendarWidget = canShowWidget('activity_calendar');

  // ─── handler‌های استوری ───────────────────────
  const handleOpenStory = useCallback((story: OrgStoryWithMeta, allStories: OrgStoryWithMeta[]) => {
    const idx = allStories.findIndex((s) => s.id === story.id);
    setStoryViewerList(allStories);
    setStoryViewerIndex(Math.max(0, idx));
    setStoryViewerOpen(true);
  }, []);

  const handleEditStory = useCallback((story: OrgStoryWithMeta) => {
    setEditingStory(story as OrgStory);
    setStoryViewerOpen(false);
    setStoryEditorOpen(true);
  }, []);

  const handleDeleteStory = useCallback(async (storyId: string) => {
    const storyIdNormalized = String(storyId || '').trim();
    if (!storyIdNormalized) return false;

    const { data, error } = await supabase
      .from('org_stories')
      .delete()
      .eq('id', storyIdNormalized)
      .select('id');

    if (error) {
      message.error(String(error.message || 'حذف استوری انجام نشد.'));
      return false;
    }

    if (!Array.isArray(data) || data.length === 0) {
      message.error('استوری حذف نشد. احتمالاً هنوز مجوز حذف روی دیتابیس اعمال نشده یا این استوری متعلق به شما نیست.');
      setStoryRefreshKey((k) => k + 1);
      return false;
    }

    setStoryViewerList((prev) => prev.filter((story) => story.id !== storyIdNormalized));
    setStoryRefreshKey((k) => k + 1);
    return true;
  }, []);

  const handleTogglePin = useCallback(async (storyId: string, isPinned: boolean) => {
    await supabase
      .from('org_stories')
      .update({ is_pinned: !isPinned, updated_at: new Date().toISOString() })
      .eq('id', storyId);
    setStoryRefreshKey((k) => k + 1);
  }, []);

  const handleMarkViewed = useCallback(async (storyId: string) => {
    if (!currentUserId) return;
    await supabase.rpc('record_story_view', { p_story_id: storyId });
  }, [currentUserId]);

  const handleReact = useCallback(async (storyId: string, emoji: string) => {
    if (!currentUserId) return;
    const existing = storyViewerList.find((s) => s.id === storyId)?.myReaction;
    const isToggleOff = existing?.emoji === emoji;

    // به‌روزرسانی خوش‌بینانه state
    setStoryViewerList((prev) =>
      prev.map((s) => {
        if (s.id !== storyId) return s;
        return {
          ...s,
          myReaction: isToggleOff
            ? null
            : {
                id: '',
                org_id: String(orgId || ''),
                story_id: storyId,
                user_id: currentUserId,
                user_name: null,
                emoji,
                created_at: new Date().toISOString(),
              },
        };
      })
    );

    if (isToggleOff) {
      await supabase.from('org_story_reactions').delete().eq('story_id', storyId).eq('user_id', currentUserId);
    } else {
      await supabase.from('org_story_reactions').upsert({ story_id: storyId, user_id: currentUserId, emoji });
    }
  }, [currentUserId, orgId, storyViewerList]);

  return (
    <>
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg p-4 md:p-6">

      {/* ─── باکس استوری‌ها — جداگانه بالای کارت سازمان ─── */}
      {orgId && currentUserId && storiesPermissions?.canView && (
        <div className="mb-3">
          <StoryBar
            key={storyRefreshKey}
            orgId={orgId}
            currentUserId={currentUserId}
            canPublish={storiesPermissions.canPublish}
            onAddStory={() => { setEditingStory(null); setStoryEditorOpen(true); }}
            onOpenStory={handleOpenStory}
            initialStories={storyRefreshKey === 0 ? initialStories : undefined}
          />
        </div>
      )}

      <div className="mb-6">
        <div className="bg-white dark:bg-dark-surface rounded-lg shadow-sm p-6 border border-gray-200 dark:border-dark-border">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch xl:justify-between">
            <div className="flex-1">
              <div className="mb-2 flex items-center gap-3">
                {brandLogoUrl ? (
                  <img src={brandLogoUrl} alt={brandTitle} className="h-12 w-12 rounded-xl object-contain ring-1 ring-gray-200 dark:ring-dark-border" />
                ) : null}
                <h1 className="text-3xl font-black text-leather-500">{brandTitle}</h1>
              </div>
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <CalendarOutlined />
                <span className="text-sm">{getTodayPersianDate()}</span>
              </div>
              <OccasionsWidget />
            </div>
            <div className="w-full xl:max-w-[430px]">
              <GoalProgressSlider placement="dashboard" hideWhenEmpty={isMobile} />
            </div>
          </div>
        </div>
      </div>

      {loading && !dashboardReady && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-dark-border dark:bg-dark-surface">
          <Spin size="large" />
        </div>
      )}

      {!loading && dashboardReady && widgetPermissions.__all === false && (
        <Card className="mb-6 shadow-sm">
          <Empty description="دسترسی مشاهده داشبورد برای این نقش غیرفعال است." />
        </Card>
      )}

      {canShowWidget('quick_add') && quickActions.length > 0 && (
        <div className="mb-6">
          <Card className="shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-lg font-bold">افزودن سریع</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">بر اساس ماژول های پر استفاده و انتخاب های سریع این نقش</div>
            </div>
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: isMobile
                  ? 'minmax(0, 1fr)'
                  : `repeat(${quickActionDesktopColumns}, minmax(0, 1fr))`,
              }}
            >
              {quickActions.map((action, index) => (
                <div key={action.moduleId}>
                  <Button
                    type={index === 0 ? 'primary' : 'default'}
                    icon={getModuleIcon(action.moduleId)}
                    size="large"
                    block
                    onClick={() => navigate(`/${action.moduleId}/create`)}
                    className="h-auto py-4"
                  >
                    <div className="text-center">
                      <div className="font-bold">{action.title}</div>
                      <div className="mt-1 text-xs opacity-75">{action.description}</div>
                    </div>
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {canShowWidget('summary_cards') && cards.length > 0 && (
        <Row gutter={[16, 16]} className="mb-6">
          {cards.map((card) => (
            <Col xs={24} sm={12} lg={6} key={card.moduleId}>
              <Card
                className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/${card.moduleId}`)}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{getModuleTitle(card.moduleId)}</div>
                  <div className="text-leather-500">{getModuleIcon(card.moduleId)}</div>
                </div>
                <Statistic
                  title={card.title}
                  value={card.value}
                  formatter={(value) =>
                    card.kind === 'price'
                      ? formatPersianPrice(Number(value || 0), true)
                      : toPersianNumber(Number(value || 0))
                  }
                  suffix={card.kind === 'price' ? currency.label : undefined}
                  valueStyle={{ color: 'rgb(var(--brand-500-rgb))', fontSize: '1.5rem', fontWeight: 'bold' }}
                />
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{card.subtitle}</div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {(showReportsWidget || showOurProcessesWidget) && (
        <Row gutter={[16, 16]} className="mb-6">
          {showReportsWidget && (
            <Col xs={24} lg={showOurProcessesWidget ? 12 : 24}>
              <ReportsSliderWidget />
            </Col>
          )}
          {showOurProcessesWidget && (
            <Col xs={24} lg={showReportsWidget ? 12 : 24}>
              <OurProcessesWidget />
            </Col>
          )}
        </Row>
      )}

      {showActivityCalendarWidget && (
        <Row gutter={[16, 16]} className="mb-6">
          <Col xs={24}>
            <TaskCalendarWidget prefetchedTasks={prefetchedTasks.length > 0 ? prefetchedTasks : undefined} />
          </Col>
        </Row>
      )}

      {canShowWidget('recent_lists') && recentSections.length > 0 && (
        <Row gutter={[16, 16]}>
          {recentSections.map((section) => (
            <Col xs={24} lg={12} key={section.moduleId}>
              <Card
                className="shadow-sm hover:shadow-md transition-shadow"
                title={
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-leather-500">{getModuleIcon(section.moduleId)}</span>
                      <span className="text-lg font-bold">{section.title}</span>
                    </div>
                    <Button
                      type="link"
                      icon={<PlusOutlined />}
                      onClick={() => navigate(`/${section.moduleId}/create`)}
                    >
                      ایجاد
                    </Button>
                  </div>
                }
                extra={
                  <Button type="link" onClick={() => navigate(`/${section.moduleId}`)}>
                    مشاهده همه
                  </Button>
                }
              >
                <Table
                  dataSource={section.rows}
                  columns={section.columns}
                  size="small"
                  pagination={false}
                  locale={{ emptyText: 'رکوردی ثبت نشده است' }}
                  rowKey="id"
                  scroll={{ x: true }}
                  onRow={(record) => ({
                    onClick: () => navigate(`/${section.moduleId}/${record.id}`),
                    className: 'cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border',
                  })}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>

      {/* ─── Story Modals ─── */}
      {/* ─── StoryViewerModal ─── */}
      {storyViewerOpen && storyViewerList.length > 0 && currentUserId && (
        <StoryViewerModal
          open={storyViewerOpen}
          stories={storyViewerList}
          initialIndex={storyViewerIndex}
          currentUserId={currentUserId}
          canEditOwn={storiesPermissions?.canEditOwn ?? false}
          canDeleteOwn={storiesPermissions?.canDeleteOwn ?? false}
          canEditOthers={storiesPermissions?.canEditOthers ?? false}
          canDeleteOthers={storiesPermissions?.canDeleteOthers ?? false}
          canPin={storiesPermissions?.canPin ?? false}
          canViewReactions={storiesPermissions?.canViewReactions ?? false}
          onClose={() => setStoryViewerOpen(false)}
          onEdit={handleEditStory}
          onDelete={handleDeleteStory}
          onTogglePin={handleTogglePin}
          onMarkViewed={handleMarkViewed}
          onReact={handleReact}
        />
      )}

      {/* ─── StoryEditorModal ─── */}
      {storyEditorOpen && orgId && currentUserId && (
        <StoryEditorModal
          open={storyEditorOpen}
          orgId={orgId}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          currentUserAvatar={currentUserAvatar}
          editingStory={editingStory}
          canPublishSaasStory={canPublishSaasStory}
          canPublishSaasAdminStory={canPublishSaasAdminStory}
          onClose={() => { setStoryEditorOpen(false); setEditingStory(null); }}
          onSaved={() => setStoryRefreshKey((k) => k + 1)}
          onNotifySms={(storyId, text, recipientIds) => {
            notifyStorySms(storyId, text, recipientIds);
          }}
        />
      )}
    </>
  );
};

export default Dashboard;
