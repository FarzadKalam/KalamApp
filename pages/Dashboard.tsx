import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Checkbox, Empty, Grid, Modal, Popover, Skeleton, Statistic, Table, Typography, message } from 'antd';
import {
  DownOutlined,
  SettingOutlined,
  CalendarOutlined,
  PlusOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType, type ModuleDefinition } from '../types';
import {
  DASHBOARD_PERMISSION_KEY,
  SAAS_ADMIN_PERMISSION_KEY,
  SETTINGS_PERMISSION_KEY,
  canAccessAssignedRecord,
  fetchCurrentUserRecordAccessContext,
  isSaasAdminModuleId,
  resolvePreferredRoleModuleIds,
  resolveStoriesPermissions,
  resolveCommunicationsPermissions,
  resolveSaasAdminFieldPermission,
  type CurrentUserRecordAccessContext,
  type PermissionMap,
} from '../utils/permissions';
import { toPersianNumber, formatPersianPrice, safeJalaliFormat } from '../utils/persianNumberFormatter';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { useCurrencyConfig } from '../utils/currency';
import { BRANDING_APPLIED_EVENT, DEFAULT_BRANDING } from '../theme/brandTheme';
import { readRuntimeBranding } from '../utils/brandingRuntime';
import { fetchModuleListRelationOptions, hydrateModuleListRelationOptionsForRows } from '../utils/moduleListOptions';
import { getOptionLabel } from '../utils/optionHelpers';
import { formatRecordDisplayValue } from '../utils/recordDisplayFormatter';
import { getFieldLabelFa } from '../utils/fieldLabel';
import { fetchDynamicOptionsMap } from '../utils/referenceData';
import { getModuleListGroupOptions } from '../utils/moduleListOptions';
import { renderModuleIcon } from '../utils/moduleIcons';
import { readDashboardPreferences, useDashboardPreferences, updateDashboardPreferences } from '../utils/dashboardPreferences';
import { hasCurrentOrgPlanModule } from '../utils/saasPlanModules';
import DashboardWidgetFrame, { DashboardModuleSelection, DashboardWidgetScope } from '../components/dashboard/DashboardWidgetFrame';
import CommunicationsWidget from '../components/dashboard/CommunicationsWidget';
import MyTasksWidget from '../components/dashboard/MyTasksWidget';
import DashboardWidgetLoading from '../components/dashboard/DashboardWidgetLoading';
import DeferredDashboardWidget from '../components/dashboard/DeferredDashboardWidget';
import AutoFitText from '../components/common/AutoFitText';
import { getDashboardGreetingFa } from '../utils/dashboardGreeting';
import '../components/dashboard/Dashboard.css';
import PhoneDisplay from '../components/PhoneDisplay';
import OccasionsWidget from '../components/dashboard/OccasionsWidget';
import DashboardAgentDeskStrip, { type DashboardAgentDeskOverviewMeta } from '../components/dashboard/DashboardAgentDeskStrip';
import AiAgentMessagesCompactBox from '../components/ai/AiAgentMessagesCompactBox';
import {
  buildAgentAccessMapFromOverviewAgents,
  resolveClientAgentAccess,
  type AgentKey,
  type AgentToneStyle,
  type ClientAgentAccessEvaluation,
} from '../utils/aiAgentCatalog';
import StoryBar from '../components/stories/StoryBar';
import type { RecordedVoice } from '../components/ai/AiVoiceRecorder';
import type { AiUploadedFilePrompt } from '../components/ai/AiFileUploadButton';
import AiCapabilityComposerActions, { normalizeAiComposerCapabilities, type AiComposerCapability } from '../components/ai/AiCapabilityComposerActions';
import AiComposeModelBar from '../components/ai/AiComposeModelBar';
import type { AiMediaSettings, AiMediaSourceImage } from '../components/ai/AiMediaSettingsPopover';
import { notifyStorySms } from '../utils/storyNotification';
import type { OrgStoryWithMeta, OrgStory } from '../components/stories/storyTypes';
import { fetchActiveOrgStoriesWithMeta, invalidateOrgStoriesCache } from '../utils/orgStories';
import { blobToBase64 } from '../utils/blobBase64';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import AiSparkleIcon from '../components/ai/AiSparkleIcon';
import { buildAiRecordModuleOptions } from '../utils/aiRecordCreation';
import AiMessageComposer from '../components/ai/AiMessageComposer';
import { isWorkflowVirtualField } from '../utils/moduleFieldVisibility';

const GoalProgressSlider = React.lazy(() => import('../components/goals/GoalProgressSlider'));
const TaskCalendarWidget = React.lazy(() => import('../components/dashboard/TaskCalendarWidget'));
const ReportsSliderWidget = React.lazy(() => import('../components/dashboard/ReportsSliderWidget'));
const OurProcessesWidget = React.lazy(() => import('../components/dashboard/OurProcessesWidget'));
const StoryViewerModal = React.lazy(() => import('../components/stories/StoryViewerModal'));
const StoryEditorModal = React.lazy(() => import('../components/stories/StoryEditorModal'));

type DashboardQuickAction = {
  moduleId: string;
  title: string;
  description: string;
};

const DEFAULT_DASHBOARD_AI_CAPABILITIES: AiComposerCapability[] = [];

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
  moduleIds: string[];
  widgetPermissions: Record<string, boolean>;
  quickActions: DashboardQuickAction[];
  recordAccess: CurrentUserRecordAccessContext;
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

const getTodayPersianDate = () => safeJalaliFormat(new Date(), 'dddd، D MMMM YYYY');
const getModuleIcon = (moduleId: string) => renderModuleIcon(MODULES[moduleId] || moduleId);

const getModuleTitle = (moduleId: string) => {
  return MODULES[moduleId]?.titles?.faSingular || MODULES[moduleId]?.titles?.fa || moduleId;
};

const isSelectableDashboardRecentFieldKey = (module: ModuleDefinition, fieldKey: unknown) => {
  const key = String(fieldKey || '').trim();
  if (!key || key.startsWith('__') || key.includes('.') || key.includes('(') || key.includes(')')) return false;
  if (SYNTHETIC_FIELD_META[key]) return true;
  const field = module.fields?.find((item: any) => String(item?.key || '').trim() === key);
  return Boolean(field && !isWorkflowVirtualField(field));
};

const getRecentFieldKeys = (module: ModuleDefinition) => {
  const explicit = (module.dashboard?.recentListFields || [])
    .filter((fieldKey) => isSelectableDashboardRecentFieldKey(module, fieldKey));
  if (explicit.length > 0) {
    return explicit;
  }

  return (module.fields || [])
    .filter((field: any) => {
      if (isWorkflowVirtualField(field)) return false;
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
      labels: { fa: SYNTHETIC_FIELD_META[fieldKey]?.label || 'فیلد' },
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

  if (field.type === FieldType.RELATION || field.type === FieldType.USER) return getOptionLabel(field, value, {}, relationOptions);
  if (field.type === FieldType.PHONE) return <PhoneDisplay value={value} size="sm" />;
  return formatRecordDisplayValue(value, field);

};

const countRows = async (table: string, apply?: (query: any) => any) => {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  if (apply) query = apply(query);
  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
};

const canUseDashboardServerCounts = (
  moduleId: string,
  recordAccess: CurrentUserRecordAccessContext
) => getModuleRecordScope(recordAccess.permissions, moduleId) === 'all';

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
    offset?: number;
    orderBy?: Array<{ field: string; ascending: boolean; nullsFirst?: boolean }>;
  }
) => {
  const normalizedTable = String(table || '').trim();
  const projectionKey = `${normalizedTable}:${normalizeColumnList(columns).sort().join(',')}:${(options?.orderBy || []).map(entry => entry.field).join(',')}`;
  let activeColumns = normalizeColumnList(columns);
  const cachedColumns = dashboardSelectableColumnsCache.get(projectionKey);
  if (cachedColumns?.length) {
    const filtered = activeColumns.filter((column) => cachedColumns.includes(column));
    if (filtered.length) activeColumns = filtered;
  }

  let activeOrderBy = (options?.orderBy || []).filter((entry) => entry?.field).map((entry) => ({
    field: String(entry.field).trim(),
    ascending: Boolean(entry.ascending),
    nullsFirst: entry.nullsFirst,
  }));
  const cachedOrderFields = dashboardOrderableColumnsCache.get(projectionKey);
  if (cachedOrderFields?.length) {
    const filtered = activeOrderBy.filter((entry) => cachedOrderFields.includes(entry.field));
    if (filtered.length) activeOrderBy = filtered;
  }

  while (activeColumns.length > 0) {
    let query = supabase.from(normalizedTable).select(activeColumns.join(','));
    activeOrderBy.forEach((entry) => {
      query = query.order(entry.field, { ascending: entry.ascending, nullsFirst: entry.nullsFirst });
    });
    if (options?.offset !== undefined) {
      query = query.range(options.offset, options.offset + (options.limit || 250) - 1);
    } else if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (!error) {
      dashboardSelectableColumnsCache.set(projectionKey, [...activeColumns]);
      dashboardOrderableColumnsCache.set(projectionKey, activeOrderBy.map((entry) => entry.field));
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
    offset?: number;
    orderBy?: Array<{ field: string; ascending: boolean; nullsFirst?: boolean }>;
  },
  apply?: (query: any) => any,
) => {
  const normalizedTable = String(table || '').trim();
  const projectionKey = `${normalizedTable}:${normalizeColumnList(columns).sort().join(',')}:${(options?.orderBy || []).map(entry => entry.field).join(',')}`;
  let activeColumns = normalizeColumnList(columns);
  const cachedColumns = dashboardSelectableColumnsCache.get(projectionKey);
  if (cachedColumns?.length) {
    const filtered = activeColumns.filter((column) => cachedColumns.includes(column));
    if (filtered.length) activeColumns = filtered;
  }

  let activeOrderBy = (options?.orderBy || []).filter((entry) => entry?.field).map((entry) => ({
    field: String(entry.field).trim(),
    ascending: Boolean(entry.ascending),
    nullsFirst: entry.nullsFirst,
  }));
  const cachedOrderFields = dashboardOrderableColumnsCache.get(projectionKey);
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
    if (options?.offset !== undefined) {
      query = query.range(options.offset, options.offset + (options.limit || 250) - 1);
    } else if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (!error) {
      dashboardSelectableColumnsCache.set(projectionKey, [...activeColumns]);
      dashboardOrderableColumnsCache.set(projectionKey, activeOrderBy.map((entry) => entry.field));
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

const fetchScopedDashboardRowsResult = async (
  table: string,
  moduleId: string,
  columns: string[],
  recordAccess: CurrentUserRecordAccessContext,
  options?: {
    limit?: number;
    offset?: number;
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

const fetchScopedDashboardRows = async (...args: Parameters<typeof fetchScopedDashboardRowsResult>) => {
  const result = await fetchScopedDashboardRowsResult(...args);
  if (result.error) throw result.error;
  return result;
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
  const viewerKey = getDashboardCardCacheKey('tasks', recordAccess);
  if (
    _dashboardTasksCache.data !== null &&
    _dashboardTasksCache.expiresAt > now &&
    _dashboardTasksCache.userId === viewerKey
  ) {
    return _dashboardTasksCache.data;
  }
  if (_dashboardTasksCache.promise && _dashboardTasksCache.userId === viewerKey) return _dashboardTasksCache.promise;
  _dashboardTasksCache.userId = viewerKey;

  _dashboardTasksCache.promise = fetchScopedDashboardRows(
    'tasks', 'tasks', TASK_SHARED_COLUMNS, recordAccess, { limit: 500 }
  ).then(({ data }) => {
    const rows = data || [];
    _dashboardTasksCache = {
      data: rows,
      expiresAt: Date.now() + DASHBOARD_BOOTSTRAP_TTL_MS,
      userId: viewerKey,
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
    recordAccess.orgId || 'no-org',
    JSON.stringify(recordAccess.permissions?.[moduleId] || {}),
    moduleId,
    recordAccess.userId || 'no-user',
    recordAccess.roleId || 'no-role',
    getModuleRecordScope(recordAccess.permissions, moduleId),
    [...(recordAccess.allowedRoleIds || [])].sort().join(',') || 'no-roles',
    [...(recordAccess.allowedUserIds || [])].sort().join(',') || 'no-users',
  ].join(':');

const getDashboardRecentSectionCacheKey = getDashboardCardCacheKey;

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
      if (canUseDashboardServerCounts(moduleId, recordAccess)) {
        const [pendingCount, totalCount] = await Promise.all([
          countRows('tasks', query => query.not('status', 'in', '(done,completed,canceled,cancelled)')),
          countRows('tasks'),
        ]);
        return { moduleId, title, value: pendingCount, kind: 'number', subtitle: 'از کل ' + toPersianNumber(totalCount) + ' فعالیت' };
      }
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
      // A bounded page of amounts is not a total. Stream only the required columns;
      // use stable primary-key pagination and keep a constant-size accumulator.
      let totalAmount = 0, count = 0, offset = 0;
      const pageSize = 250;
      while (true) {
        const { data } = await fetchScopedDashboardRows('invoices', moduleId, ['id', 'org_id', 'assignee_id', 'assignee_role_id', 'assignee_type', 'total_invoice_amount'], recordAccess, {
          limit: pageSize, offset, orderBy: [{ field: 'id', ascending: true }],
        });
        const scopedRows = filterRowsByRecordScope(data || [], moduleId, recordAccess);
        totalAmount += scopedRows.reduce((sum: number, row: any) => sum + Number(row?.total_invoice_amount || 0), 0);
        count += scopedRows.length;
        if (data.length < pageSize) break;
        offset += pageSize;
      }
      return {
        moduleId,
        title,
        value: totalAmount,
        kind: 'price',
        subtitle: `از ${toPersianNumber(count || 0)} عدد فاکتور`,
      };
    }

    case 'customers_new_mine': {
      if (canUseDashboardServerCounts(moduleId, recordAccess)) {
        const newCount = await countRows('customers', (query) => query.gte('created_at', recentSince));
        return {
          moduleId,
          title,
          value: newCount,
          kind: 'number',
          subtitle: `${toPersianNumber(newCount)} عدد جدید`,
        };
      }
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
      if (canUseDashboardServerCounts(moduleId, recordAccess)) {
        const [openingCount, freeCount] = await Promise.all([
          countRows('billboards', (query) => query.eq('status', 'opening')),
          countRows('billboards', (query) => query.eq('status', 'free')),
        ]);
        return {
          moduleId,
          title,
          value: openingCount,
          kind: 'number',
          subtitle: `تعداد ${toPersianNumber(freeCount)} عدد تابلوی آزاد`,
        };
      }
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
      if (canUseDashboardServerCounts(moduleId, recordAccess)) {
        const [totalCount, newCount] = await Promise.all([
          countRows('products'),
          countRows('products', (query) => query.gte('created_at', recentSince)),
        ]);
        return {
          moduleId,
          title,
          value: totalCount,
          kind: 'number',
          subtitle: `${toPersianNumber(newCount)} عدد محصول جدید`,
        };
      }
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
      if (canUseDashboardServerCounts(moduleId, recordAccess)) {
        const tableName = module.table || moduleId;
        const [totalCount, newCount] = await Promise.all([
          countRows(tableName),
          countRows(tableName, (query) => query.gte('created_at', recentSince)),
        ]);
        return {
          moduleId,
          title,
          value: totalCount,
          kind: 'number',
          subtitle: `${toPersianNumber(newCount)} مورد جدید`,
        };
      }
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

  const recentFieldKeys = getRecentFieldKeys(module).filter(key => recordAccess.permissions?.[moduleId]?.fields?.[key] !== false);
  const fieldKeys = Array.from(new Set(['id', ...recentFieldKeys]));
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

  const recentFields = recentFieldKeys
    .map((fieldKey) => getFieldMeta(module, fieldKey))
    .filter(Boolean);
  const scopedRows = filterRowsByRecordScope(data || [], moduleId, recordAccess).slice(0, RECENT_RECORDS_LIMIT);
  const relationOptions = recentFields.some((field: any) => field?.type === FieldType.RELATION || field?.type === FieldType.USER)
    ? {
        ...(await fetchModuleListRelationOptions(supabase, recentFields as any[], { users: [], roles: [] })),
        ...(await hydrateModuleListRelationOptionsForRows(supabase, recentFields as any[], scopedRows, { users: [], roles: [] }).catch(() => ({}))),
      }
    : {};

  const dynamicOptions = await fetchDynamicOptionsMap(supabase, recentFields.map((field: any) => field.dynamicOptionsCategory).filter(Boolean));
  const columns = recentFieldKeys.map((fieldKey) => ({
    title: getFieldLabelFa(getFieldMeta(module, fieldKey), { moduleId, fallback: 'فیلد' }),
    dataIndex: fieldKey,
    key: fieldKey,
    ellipsis: true,
    render: (value: any) => {
      const field = getFieldMeta(module, fieldKey);
      const mergedField = { ...field, options: getModuleListGroupOptions(field, dynamicOptions) };
      return field.type === FieldType.RELATION || field.type === FieldType.USER || field.type === FieldType.PHONE ? renderFieldValue(module, fieldKey, value, relationOptions) : formatRecordDisplayValue(value, mergedField);
    },
  }));

  return {
    moduleId,
    title: module.titles.fa,
    columns,
    rows: scopedRows,
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
  const permissions = snapshot.permissions || {};
  const dashboardPermissions = permissions?.[DASHBOARD_PERMISSION_KEY] || {};

  if (!userId) {
    return {
      moduleIds: [],
      widgetPermissions: {},
      quickActions: [],
      recordAccess,
    };
  }

  if (dashboardPermissions.view === false) {
    return {
      moduleIds: [],
      widgetPermissions: { __all: false },
      quickActions: [],
      recordAccess,
    };
  }

  const preferences = readDashboardPreferences(snapshot.orgId, userId);
  const preferredModuleIds = preferences.moduleIds ?? resolvePreferredRoleModuleIds(permissions, MODULES, 8);
  const candidates = (preferences.moduleIds ? preferredModuleIds.filter(id => MODULES[id] && !isSaasAdminModuleId(id) && permissions[id]?.view !== false) : resolveDashboardModuleIds(permissions, preferredModuleIds)).slice(0, DASHBOARD_MAX_MODULES);
  const availability = await mapWithConcurrency(candidates, 3, id => hasCurrentOrgPlanModule(id, { defaultEnabled: true }));
  const dashboardModuleIds = candidates.filter((_, index) => availability[index]);
  const quickActions = dashboardModuleIds.filter(id => permissions[id]?.create !== false).map(moduleId => ({
    moduleId, title: MODULES[moduleId]?.dashboard?.quickCreateLabel || `ایجاد ${getModuleTitle(moduleId)}`,
    description: getModuleTitle(moduleId),
  }));
  return { moduleIds: dashboardModuleIds, widgetPermissions: (dashboardPermissions.fields || {}) as Record<string, boolean>, quickActions, recordAccess };
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const handledStoryDeepLinkRef = useRef<string | null>(null);
  const currency = useCurrencyConfig();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(true);
  const [dashboardReady, setDashboardReady] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const update = () => setClock(new Date());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer);window.removeEventListener('focus', update); };
  }, []);
  const [brandTitle, setBrandTitle] = useState(() => readRuntimeBranding().appTitle || DEFAULT_BRANDING.brandName);
  const [widgetPermissions, setWidgetPermissions] = useState<Record<string, boolean>>({});
  const [quickActions, setQuickActions] = useState<DashboardQuickAction[]>([]);
  const [cards, setCards] = useState<DashboardCardItem[]>([]);
  const [recentSections, setRecentSections] = useState<DashboardRecentSection[]>([]);
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [dashboardPermissions, setDashboardPermissions] = useState<PermissionMap>({});
  const [dashboardError, setDashboardError] = useState('');
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [dashboardAiQuestion, setDashboardAiQuestion] = useState('');
  const [dashboardVoiceSending, setDashboardVoiceSending] = useState(false);
  const [dashboardFileSending, setDashboardFileSending] = useState(false);
  const [dashboardAiCapabilities, setDashboardAiCapabilities] = useState<AiComposerCapability[]>(DEFAULT_DASHBOARD_AI_CAPABILITIES);
  const [dashboardAiCapabilityAvailability, setDashboardAiCapabilityAvailability] = useState<Record<string, any>>({});
  const [dashboardRecordCreationTargetModuleId, setDashboardRecordCreationTargetModuleId] = useState<string | null>(null);
  const [dashboardMediaSettings, setDashboardMediaSettings] = useState<AiMediaSettings>({});
  const [dashboardMediaSourceImages, setDashboardMediaSourceImages] = useState<AiMediaSourceImage[]>([]);
  const [dashboardModelOverrides, setDashboardModelOverrides] = useState<Record<string, string>>({});
  const dashboardModelOverrideRef = useRef<string | null>(null);
  const [dashboardSelectedAgents, setDashboardSelectedAgents] = useState<AgentKey[]>([]);
  const [dashboardToneStyle, setDashboardToneStyle] = useState<AgentToneStyle>('friendly_warm');
  const [dashboardAgentAccessMap, setDashboardAgentAccessMap] = useState<Partial<Record<AgentKey, ClientAgentAccessEvaluation>> | null>(null);
  const [dashboardAgentInboxOpen, setDashboardAgentInboxOpen] = useState(false);
  const [dashboardAgentInboxAgentKey, setDashboardAgentInboxAgentKey] = useState<AgentKey | null>(null);
  const [dashboardAgentInboxMeta, setDashboardAgentInboxMeta] = useState<{
    approvalCount: number;
    unreadCount: number;
    threadCount: number;
  }>({ approvalCount: 0, unreadCount: 0, threadCount: 0 });
  const dashboardInboxAutoOpenedRef = useRef(false);

  const handleToggleDashboardAgentInbox = useCallback((focusAgentKey?: AgentKey) => {
    if (focusAgentKey) {
      setDashboardAgentInboxAgentKey(focusAgentKey);
      setDashboardAgentInboxOpen(true);
      return;
    }
    setDashboardAgentInboxAgentKey(null);
    setDashboardAgentInboxOpen((prev) => !prev);
  }, []);

  const handleDashboardDeskOverviewMeta = useCallback((meta: DashboardAgentDeskOverviewMeta) => {
    setDashboardAgentInboxMeta((prev) => ({ ...prev, approvalCount: meta.totalApprovals }));
    if (Array.isArray(meta.agents)) {
      setDashboardAgentAccessMap(buildAgentAccessMapFromOverviewAgents(meta.agents));
    }
    if (meta.totalApprovals > 0 && !dashboardInboxAutoOpenedRef.current) {
      dashboardInboxAutoOpenedRef.current = true;
      setDashboardAgentInboxOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!dashboardAgentAccessMap) return;
    setDashboardSelectedAgents((prev) => {
      const next = prev.filter((key) => {
        const access = dashboardAgentAccessMap[key];
        return Boolean(access && (access.canView ?? access.canUse) !== false && (access.canChat ?? access.canUse) !== false);
      });
      return next.length === prev.length ? prev : next;
    });
  }, [dashboardAgentAccessMap]);

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
  const preferences = useDashboardPreferences(orgId, currentUserId);
  const modulePreferenceKey = preferences.moduleIds?.join('|') ?? '__default__';
  const dataVisibilityKey = preferences.hiddenWidgets.filter(id => id.startsWith('summary:') || id.startsWith('recent:') || id === 'summary_cards' || id === 'recent_lists').sort().join('|');
  const communicationsAccess = resolveCommunicationsPermissions(dashboardPermissions);
  const refreshDashboard = useCallback(() => {
    dashboardCardCache.clear();dashboardRecentSectionCache.clear();_dashboardTasksCache.expiresAt = 0;
    setRefreshRevision(value => value + 1);
  }, []);
  const widgetScope = useMemo(() => ({ orgId, userId: currentUserId, onRefresh: refreshDashboard }), [orgId, currentUserId, refreshDashboard]);
  const moduleSelection = <DashboardModuleSelection orgId={orgId} userId={currentUserId} selected={preferences.moduleIds ?? selectedModuleIds}
    options={Object.keys(MODULES).filter(id => !isSaasAdminModuleId(id) && dashboardPermissions[id]?.view !== false).map(id => ({ value: id, label: MODULES[id].titles.fa }))} />;
  const widgetChoices = [
    { id: 'stories', label: 'استوری‌ها' },{ id: 'ai', label: 'دستیار هوشمند' },{ id: 'agents_desk', label: 'میز کار ایجنت‌ها' },{ id: 'my_tasks', label: 'کارهای من' },{ id: 'reports_slider', label: 'گزارش‌های منتخب' },
    { id: 'activity_calendar', label: 'تقویم فعالیت‌ها' },{ id: 'our_processes', label: 'فرآیندهای ما' },{ id: 'communications', label: 'ارتباطات' },{ id: 'goals', label: 'اهداف و موفقیت‌ها' },{ id: 'quick_add', label: 'افزودن سریع' },
    ...cards.map(card => ({ id: 'summary:' + card.moduleId, label: card.title })),...recentSections.map(section => ({ id: 'recent:' + section.moduleId, label: section.title })),
  ];
  const dashboardRecordCreationModuleOptions = useMemo(() => buildAiRecordModuleOptions(), []);
  const dashboardImageMode = dashboardAiCapabilities.includes('image_generation');
  const dashboardVoiceOutputMode = dashboardAiCapabilities.includes('voice_output');
  const dashboardVideoMode = dashboardAiCapabilities.includes('video_generation');
  const dashboardMediaModelId = dashboardImageMode
    ? dashboardModelOverrides.image_generation || dashboardModelOverrideRef.current
    : dashboardVideoMode
      ? dashboardModelOverrides.video_generation || dashboardModelOverrideRef.current
      : dashboardVoiceOutputMode
        ? dashboardModelOverrides.voice_output || dashboardModelOverrideRef.current
        : null;
  const dashboardNeedsRecordModule = dashboardAiCapabilities.includes('record_creation') && !dashboardRecordCreationTargetModuleId;
  const dashboardAiSendDisabled = !dashboardAiQuestion.trim() || dashboardNeedsRecordModule;

  const handleDashboardCapabilitiesChange = useCallback((next: AiComposerCapability[]) => {
    const normalizedNext = normalizeAiComposerCapabilities(next);
    setDashboardAiCapabilities(normalizedNext);
    if (normalizedNext.includes('free_chat')) {
      setDashboardMediaSourceImages([]);
    }
    if (normalizedNext.includes('process_operation') || !normalizedNext.includes('record_creation')) {
      setDashboardRecordCreationTargetModuleId(null);
    }
  }, []);

  useEffect(() => {
    const syncBranding = () => {
      const branding = readRuntimeBranding();
      setBrandTitle(branding.appTitle || DEFAULT_BRANDING.brandName);
    };
    syncBranding();
    window.addEventListener(BRANDING_APPLIED_EVENT, syncBranding as EventListener);
    return () => {
      window.removeEventListener(BRANDING_APPLIED_EVENT, syncBranding as EventListener);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      setLoading(true);setDashboardError('');
      try {
        const snapshot = await fetchSessionBootstrap(supabase);
        if (!active) return;
        const userId = snapshot.user?.id ? String(snapshot.user.id) : null;
        setCurrentUserId(userId);setOrgId(snapshot.orgId || null);
        setDashboardPermissions(snapshot.permissions || {});
        const profile = snapshot.profile;
        setCurrentUserName(String(profile?.full_name || profile?.display_name || ''));
        setCurrentUserAvatar(profile?.avatar_url || null);
        const perms = snapshot.permissions as PermissionMap | null;
        setStoriesPermissions(resolveStoriesPermissions(perms));
        setCanPublishSaasStory(resolveSaasAdminFieldPermission(perms, 'publish_saas_story'));
        setCanPublishSaasAdminStory(resolveSaasAdminFieldPermission(perms, 'publish_saas_admin_story'));
        if (userId) {
          const normalizedRole = String(profile?.role || '').trim().toLowerCase();
          setDashboardAgentAccessMap((prev) => prev || resolveClientAgentAccess({
            permissions: perms,
            userId,
            roleId: snapshot.roleId,
            isOrgAdmin:
              perms?.[SETTINGS_PERMISSION_KEY]?.edit === true
              || perms?.[SAAS_ADMIN_PERMISSION_KEY]?.edit === true
              || normalizedRole === 'super_admin'
              || normalizedRole === 'admin',
          }));
        }
        const prepared = await buildDashboardBootstrap();
        if (!active) return;
        setWidgetPermissions(prepared.widgetPermissions);
        setSelectedModuleIds(prepared.moduleIds);
        setQuickActions(prepared.quickActions);
        setCards([]);setRecentSections([]);setDashboardReady(true);
        const preferences = readDashboardPreferences(snapshot.orgId, userId);
        const hidden = new Set(preferences.hiddenWidgets);
        const reportFailure = (cause: unknown) => { if (active) setDashboardError(toFaErrorMessage(cause as any, 'دریافت بخشی از داشبورد انجام نشد؛ دوباره تلاش کنید.')); };
        await Promise.all([
          mapWithConcurrency(prepared.moduleIds.filter(id => prepared.widgetPermissions.summary_cards !== false && !hidden.has('summary_cards') && !hidden.has('summary:' + id)), DASHBOARD_CARD_CONCURRENCY, async id => {
            try { const card = await loadCardForModule(id, prepared.recordAccess);if (active && card) setCards(previous => [...previous.filter(item => item.moduleId !== id), card]); }
            catch (cause) { reportFailure(cause); }
          }),
          mapWithConcurrency(prepared.moduleIds.filter(id => prepared.widgetPermissions.recent_lists !== false && !hidden.has('recent_lists') && !hidden.has('recent:' + id)), DASHBOARD_RECENT_CONCURRENCY, async id => {
            try { const section = await loadRecentSection(id, prepared.recordAccess);if (active && section) setRecentSections(previous => [...previous.filter(item => item.moduleId !== id), section].sort((a,b) => prepared.moduleIds.indexOf(a.moduleId) - prepared.moduleIds.indexOf(b.moduleId))); }
            catch (cause) { reportFailure(cause); }
          }),
        ]);
      } catch (cause) {
        if (!active) return;
        setDashboardError(toFaErrorMessage(cause as any, 'دریافت داشبورد انجام نشد.'));
        setWidgetPermissions({ __all: false });setDashboardReady(true);
      } finally { if (active) setLoading(false); }
    };
    void loadDashboard();
    return () => { active = false; };
  }, [modulePreferenceKey, dataVisibilityKey, refreshRevision]);

  useEffect(() => {
    let isMounted = true;
    const loadAiOverview = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('ai-assistant', {
          body: { action: 'get_ai_overview' },
        });
        if (error) throw error;
        if (!isMounted) return;
        setDashboardAiCapabilityAvailability(data?.capabilityAvailability || {});
      } catch {
        // ارسال گفتگو خطای واقعی قابلیت را نشان می‌دهد؛ این فقط برای وضعیت کنترل‌هاست.
      }
    };
    void loadAiOverview();
    return () => {
      isMounted = false;
    };
  }, []);

  const canShowWidget = (key: string) => {
    if (!dashboardReady) return false;
    if (widgetPermissions.__all === false) return false;
    return widgetPermissions[key] !== false && !preferences.hiddenWidgets.includes(key);
  };

  const showReportsWidget = canShowWidget('reports_slider');
  const showOurProcessesWidget = canShowWidget('our_processes');
  const showActivityCalendarWidget = canShowWidget('activity_calendar');

  const handleSubmitDashboardAiQuestion = useCallback(() => {
    const question = dashboardAiQuestion.trim();
    if (!question) return;
    if (dashboardNeedsRecordModule) {
      message.warning('برای ساخت رکورد، ابتدا نوع رکورد را انتخاب کنید.');
      return;
    }
    setDashboardAiQuestion('');
      navigate('/ai', {
        state: {
          aiInitialPrompt: question,
          aiInitialCapabilities: dashboardAiCapabilities.length ? dashboardAiCapabilities : undefined,
          aiInitialAgents: dashboardSelectedAgents.length ? dashboardSelectedAgents : undefined,
          aiInitialToneStyle: dashboardToneStyle,
          aiInitialRecordCreationTargetModuleId: dashboardRecordCreationTargetModuleId,
          aiInitialModelOverride: dashboardModelOverrideRef.current,
          aiInitialMediaSettings: dashboardMediaSettings,
          aiInitialMediaSourceImages: dashboardMediaSourceImages,
          aiAutoSubmitInitial: true,
          forceNewThread: true,
        },
      });
  }, [dashboardAiCapabilities, dashboardAiQuestion, dashboardMediaSettings, dashboardMediaSourceImages, dashboardNeedsRecordModule, dashboardRecordCreationTargetModuleId, dashboardSelectedAgents, dashboardToneStyle, message, navigate]);

  const handleSubmitDashboardVoice = useCallback(async (voice: RecordedVoice) => {
    if (dashboardVoiceSending) return;
    setDashboardVoiceSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'transcribe_voice',
          audio: {
            data: await blobToBase64(voice.blob),
            mimeType: voice.mimeType,
            durationMs: voice.durationMs,
            filename: voice.filename,
          },
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'ارسال فایل صوتی ناموفق بود.'));
      const transcript = String(data?.transcript || '').trim();
      if (!transcript) throw new Error('متنی از فایل صوتی دریافت نشد.');
      navigate('/ai', {
        state: {
          aiInitialPrompt: transcript,
          aiInitialInputKind: 'voice',
          aiInitialCapabilities: dashboardAiCapabilities.length ? dashboardAiCapabilities : undefined,
          aiInitialAgents: dashboardSelectedAgents.length ? dashboardSelectedAgents : undefined,
          aiInitialToneStyle: dashboardToneStyle,
          aiInitialRecordCreationTargetModuleId: dashboardRecordCreationTargetModuleId,
          aiInitialModelOverride: dashboardModelOverrideRef.current,
          aiInitialMediaSettings: dashboardMediaSettings,
          aiInitialMediaSourceImages: dashboardMediaSourceImages,
          aiAutoSubmitInitial: true,
          forceNewThread: true,
        },
      });
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ارسال فایل صوتی به هوش مصنوعی ناموفق بود.'));
    } finally {
      setDashboardVoiceSending(false);
    }
  }, [dashboardAiCapabilities, dashboardMediaSettings, dashboardMediaSourceImages, dashboardRecordCreationTargetModuleId, dashboardSelectedAgents, dashboardToneStyle, dashboardVoiceSending, message, navigate]);

  const handleSubmitDashboardFiles = useCallback(async (filePrompts: AiUploadedFilePrompt[]) => {
    if (dashboardFileSending) return;
    setDashboardFileSending(true);
    try {
      const preparedFiles = (filePrompts || []).filter((item) => item?.fileName);
      if (!preparedFiles.length) return;
      navigate('/ai', {
        state: {
          aiInitialFiles: preparedFiles,
          aiInitialPrompt: dashboardAiQuestion.trim() || '',
          aiInitialCapabilities: dashboardAiCapabilities.length ? dashboardAiCapabilities : undefined,
          aiInitialAgents: dashboardSelectedAgents.length ? dashboardSelectedAgents : undefined,
          aiInitialToneStyle: dashboardToneStyle,
          aiInitialRecordCreationTargetModuleId: dashboardRecordCreationTargetModuleId,
          aiInitialModelOverride: dashboardModelOverrideRef.current,
          aiInitialMediaSettings: dashboardMediaSettings,
          aiInitialMediaSourceImages: dashboardMediaSourceImages,
          aiAutoSubmitInitial: false,
          forceNewThread: true,
        },
      });
      setDashboardAiQuestion('');
    } finally {
      setDashboardFileSending(false);
    }
  }, [dashboardAiCapabilities, dashboardAiQuestion, dashboardFileSending, dashboardMediaSettings, dashboardMediaSourceImages, dashboardRecordCreationTargetModuleId, dashboardSelectedAgents, dashboardToneStyle, navigate]);

  const handleSubmitDashboardFile = useCallback(async (filePrompt: AiUploadedFilePrompt) => {
    await handleSubmitDashboardFiles([filePrompt]);
  }, [handleSubmitDashboardFiles]);

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
    invalidateOrgStoriesCache(orgId);
    setStoryRefreshKey((k) => k + 1);
    return true;
  }, [orgId]);

  const handleTogglePin = useCallback(async (storyId: string, isPinned: boolean) => {
    await supabase
      .from('org_stories')
      .update({ is_pinned: !isPinned, updated_at: new Date().toISOString() })
      .eq('id', storyId);
    invalidateOrgStoriesCache(orgId);
    setStoryRefreshKey((k) => k + 1);
  }, [orgId]);

  const handleMarkViewed = useCallback(async (storyId: string) => {
    if (!currentUserId) return;
    await supabase.rpc('record_story_view', { p_story_id: storyId });
    invalidateOrgStoriesCache(orgId);
    setStoryViewerList((prev) =>
      prev.map((s) => (s.id === storyId ? { ...s, isViewedByMe: true } : s)),
    );
  }, [currentUserId, orgId]);

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
    invalidateOrgStoriesCache(orgId);
  }, [currentUserId, orgId, storyViewerList]);

  useEffect(() => {
    const requestedStoryId = String(searchParams.get('storyId') || '').trim();
    if (!requestedStoryId || !orgId || !currentUserId || !storiesPermissions?.canView) return;
    if (handledStoryDeepLinkRef.current === requestedStoryId) return;
    handledStoryDeepLinkRef.current = requestedStoryId;

    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchActiveOrgStoriesWithMeta({
          supabaseClient: supabase,
          orgId,
          currentUserId,
          force: true,
        });
        if (cancelled) return;
        const target = list.find((s) => s.id === requestedStoryId);
        if (target) {
          handleOpenStory(target, list);
        }
      } finally {
        if (!cancelled) {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete('storyId');
          setSearchParams(nextParams, { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, handleOpenStory, orgId, searchParams, setSearchParams, storiesPermissions?.canView]);

  const canAccessAiPage = Boolean(communicationsAccess?.canUseWorkspace);
  const canViewOrgKnowledge = (dashboardPermissions?.[SETTINGS_PERMISSION_KEY]?.view !== false) && (dashboardPermissions?.[SETTINGS_PERMISSION_KEY]?.fields?.ai_knowledge !== false);

  const aiWidgetSettings = useMemo(() => (
    <div className="space-y-4 py-2">
      <Typography.Paragraph className="text-sm text-gray-600 dark:text-gray-300">
        دسترسی‌های سریع به بخش‌های هوش مصنوعی و پایگاه دانش سازمان:
      </Typography.Paragraph>
      <div className="flex flex-col gap-2.5">
        {canAccessAiPage && (
          <Button
            type="default"
            icon={<AiSparkleIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
            onClick={() => navigate('/ai')}
            className="flex items-center justify-start gap-2 h-11 text-right"
          >
            <span>ورود به صفحهٔ گفتگوی هوش مصنوعی</span>
          </Button>
        )}
        {canViewOrgKnowledge && (
          <Button
            type="default"
            icon={<ReadOutlined className="text-indigo-600 dark:text-indigo-400" />}
            onClick={() => navigate('/org-knowledge')}
            className="flex items-center justify-start gap-2 h-11 text-right"
          >
            <span>مدیریت دانش سازمان</span>
          </Button>
        )}
        {!canAccessAiPage && !canViewOrgKnowledge && (
          <Typography.Text type="secondary" className="text-xs">
            دسترسی به صفحات اختصاصی هوش مصنوعی یا دانش سازمان برای نقش شما فعال نیست.
          </Typography.Text>
        )}
      </div>
    </div>
  ), [canAccessAiPage, canViewOrgKnowledge, navigate]);

  return (
    <DashboardWidgetScope.Provider value={widgetScope}>
    <div className="dashboard-shell" dir="rtl">
      <header className="dashboard-page-heading">
        <div><h1>{currentUserName ? `سلام ${currentUserName.split(' ')[0]}، ${getDashboardGreetingFa(clock)}` : brandTitle}</h1>
          <div className="dashboard-date-line"><CalendarOutlined /><span>{getTodayPersianDate()}</span>
            <Popover trigger="click" placement="bottomRight" content={<div className="dashboard-occasion-popover"><OccasionsWidget /></div>}><Button type="text" size="small">مناسبت‌ها <DownOutlined /></Button></Popover>
          </div>
        </div>
        <Button className="dashboard-personalize-trigger" icon={<SettingOutlined />} onClick={() => setPersonalizeOpen(true)} aria-label="شخصی‌سازی داشبورد"><span className="dashboard-personalize-label">شخصی‌سازی</span></Button>
      </header>
      {dashboardError && <Alert type="error" showIcon message={dashboardError} action={<Button onClick={refreshDashboard}>تلاش دوباره</Button>} />}
      <div className="dashboard-overview-row">
        {orgId && currentUserId && storiesPermissions?.canView && <DashboardWidgetFrame widgetId="stories" title="استوری‌ها" defaultOrder={0} className="dashboard-stories-frame" onRefresh={() => setStoryRefreshKey(value => value + 1)}>
          <StoryBar key={storyRefreshKey} orgId={orgId} currentUserId={currentUserId} canPublish={storiesPermissions.canPublish}
            onAddStory={() => { setEditingStory(null); setStoryEditorOpen(true); }} onOpenStory={handleOpenStory} />
        </DashboardWidgetFrame>}
        {dashboardReady && communicationsAccess.canUseWorkspace && <DashboardWidgetFrame widgetId="ai" title="دستیار هوشمند سازمان" defaultOrder={1} className="dashboard-ai-frame" settings={aiWidgetSettings}>
          <Card className="dashboard-content-card">
            <AiMessageComposer reserveMenuSpace value={dashboardAiQuestion} onChange={setDashboardAiQuestion} onSubmit={handleSubmitDashboardAiQuestion}
              canSubmit={!dashboardAiSendDisabled} busy={dashboardVoiceSending || dashboardFileSending} maxRows={4}
              placeholder="از ایجنت‌ها و دستیار هوشمند سازمان بپرسید…"
              sendLabel={dashboardVideoMode ? 'ساخت ویدیو با هوش مصنوعی' : dashboardVoiceOutputMode ? 'تولید صدا با هوش مصنوعی' : dashboardImageMode ? 'ساخت تصویر با هوش مصنوعی' : dashboardSelectedAgents.length > 1 ? `ارسال به ${dashboardSelectedAgents.length.toLocaleString('fa-IR')} ایجنت` : 'ارسال پیام به هوش مصنوعی'}
              tools={<AiCapabilityComposerActions
                      compact={isMobile}
                      selected={dashboardAiCapabilities}
                      onChange={handleDashboardCapabilitiesChange}
                      capabilityAvailability={dashboardAiCapabilityAvailability}
                      selectedAgents={dashboardSelectedAgents}
                      onAgentsChange={setDashboardSelectedAgents}
                      agentAccessMap={dashboardAgentAccessMap}
                      toneStyle={dashboardToneStyle}
                      onToneStyleChange={setDashboardToneStyle}
                      moduleId={null}
                      recordId={null}
                      onVoiceSend={handleSubmitDashboardVoice}
                      onFilePrepared={handleSubmitDashboardFile}
                      onFilesPrepared={handleSubmitDashboardFiles}
                      voiceLoading={dashboardVoiceSending}
                      fileLoading={dashboardFileSending}
                      directFileUpload
                      allowMultipleFiles
                      recordCreationModuleOptions={dashboardRecordCreationModuleOptions}
                      recordCreationTargetModuleId={dashboardRecordCreationTargetModuleId}
                      onRecordCreationTargetModuleChange={setDashboardRecordCreationTargetModuleId}
                      mediaSettings={dashboardMediaSettings}
                      onMediaSettingsChange={setDashboardMediaSettings}
                      mediaModelId={dashboardMediaModelId}
                    />} model={<AiComposeModelBar
                      compact
                      selectedCapabilities={dashboardAiCapabilities}
                      fallbackCapability="dashboard_chat"
                      persistedOverrides={dashboardModelOverrides}
                      onModelOverrideChange={(model, capability) => {
                        dashboardModelOverrideRef.current = model;
                        const key = String(capability || '').trim();
                        if (!key) return;
                        setDashboardModelOverrides((prev) => {
                          if (model) return { ...prev, [key]: model };
                          const next = { ...prev };
                          delete next[key];
                          return next;
                        });
                      }}
                    />} />
          </Card>
        </DashboardWidgetFrame>}
      </div>
      {dashboardReady && communicationsAccess.canUseWorkspace && canShowWidget('agents_desk') ? (
        <DashboardWidgetFrame widgetId="agents_desk" title="میز کار ایجنت‌ها" defaultOrder={1.5} className="dashboard-agents-desk-frame mb-5">
          <div className="space-y-3">
            <DashboardAgentDeskStrip
              selectedAgents={dashboardSelectedAgents}
              onToggleAgent={(key) => {
                setDashboardSelectedAgents((prev) => (
                  prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
                ));
              }}
              agentAccessMap={dashboardAgentAccessMap}
              toneStyle={dashboardToneStyle}
              inboxOpen={dashboardAgentInboxOpen}
              onToggleInbox={handleToggleDashboardAgentInbox}
              onOverviewMeta={handleDashboardDeskOverviewMeta}
              externalInboxBadgeCount={
                dashboardAgentInboxOpen
                  ? dashboardAgentInboxMeta.approvalCount + dashboardAgentInboxMeta.unreadCount
                  : undefined
              }
            />
            {dashboardAgentInboxOpen ? (
              <AiAgentMessagesCompactBox
                layoutMode="wide"
                agentAccessMap={dashboardAgentAccessMap}
                initialAgentKey={dashboardAgentInboxAgentKey}
                onClose={() => setDashboardAgentInboxOpen(false)}
                onMetaChange={setDashboardAgentInboxMeta}
                onSelectAgent={(agentKey) => {
                  setDashboardSelectedAgents((prev) => (prev.includes(agentKey) ? prev : [...prev, agentKey]));
                }}
              />
            ) : null}
          </div>
        </DashboardWidgetFrame>
      ) : null}
      {loading && !dashboardReady && <div className="dashboard-initial-loading" role="status" aria-label="در حال آماده‌سازی داشبورد" aria-busy="true"><div className="dashboard-summary-grid">{Array.from({ length: 6 }, (_, index) => <Card key={index}><Skeleton active paragraph={{ rows: 2 }} /></Card>)}</div><div className="dashboard-widget-grid"><DashboardWidgetLoading widgetId="reports_slider" title="گزارش‌ها" defaultOrder={3} /><DashboardWidgetLoading widgetId="my_tasks" title="کارهای من" defaultOrder={4} /></div></div>}
      {!loading && dashboardReady && widgetPermissions.__all === false && !dashboardError && <Card><Empty description="دسترسی مشاهدهٔ داشبورد برای این نقش غیرفعال است." /></Card>}
      {canShowWidget('summary_cards') && selectedModuleIds.length > 0 && <div className="dashboard-summary-grid">{selectedModuleIds.map(moduleId => { const card = cards.find(item => item.moduleId === moduleId);if (!card && !loading) return null;return <DashboardWidgetFrame key={moduleId} widgetId={`summary:${moduleId}`} title={card?.title || getModuleTitle(moduleId)} settings={moduleSelection}>
        <Card className="dashboard-summary-card" onClick={() => navigate(`/${moduleId}`)} tabIndex={0} role="link" onKeyDown={event => { if (event.key === 'Enter') navigate(`/${moduleId}`); }}>
          <div className="dashboard-stat-label">{getModuleIcon(moduleId)}<span>{getModuleTitle(moduleId)}</span></div>
          {card ? <><Statistic title={card.title} value={card.value} formatter={value => <AutoFitText>{card.kind === 'price' ? formatPersianPrice(Number(value || 0), true) : toPersianNumber(Number(value || 0))}</AutoFitText>} suffix={card.kind === 'price' ? currency.label : undefined} />
          <p className="dashboard-stat-description">{card.subtitle}</p></> : <Skeleton active paragraph={{ rows: 2 }} title={false} />}
        </Card>
      </DashboardWidgetFrame>; })}</div>}
      <div className="dashboard-widget-grid">
        {showReportsWidget && (
          <React.Suspense fallback={<DashboardWidgetLoading widgetId="reports_slider" title="گزارش‌ها" defaultOrder={3} />}>
            <ReportsSliderWidget
              key={`reports:${orgId}:${currentUserId}`}
              selectedModuleIds={selectedModuleIds}
              selectedReportIds={preferences.reportIds}
              defaultReportId={preferences.defaultReportId}
              onReportSelectionChange={(reportIds) => updateDashboardPreferences(orgId, currentUserId, { reportIds })}
              onDefaultReportChange={(defaultReportId) => updateDashboardPreferences(orgId, currentUserId, { defaultReportId: defaultReportId || undefined })}
            />
          </React.Suspense>
        )}
        {canShowWidget('my_tasks') && orgId && <MyTasksWidget key={`tasks:${orgId}:${currentUserId}`} orgId={orgId} />}
        {canShowWidget('communications') && orgId && <CommunicationsWidget key={orgId} orgId={orgId} permissions={dashboardPermissions} />}
        {canShowWidget('goals') && <DashboardWidgetFrame widgetId="goals" title="اهداف و موفقیت‌ها" defaultOrder={6} className="dashboard-goals-frame">
          <React.Suspense fallback={<Skeleton active paragraph={{ rows: 5 }} />}><GoalProgressSlider key={refreshRevision} placement="dashboard" hideWhenEmpty={isMobile} /></React.Suspense>
        </DashboardWidgetFrame>}
        {showActivityCalendarWidget && <DeferredDashboardWidget widgetId="activity_calendar" title="تقویم فعالیت‌ها" defaultOrder={7} className="dashboard-wide-widget"><TaskCalendarWidget key={`calendar:${orgId}:${currentUserId}`} /></DeferredDashboardWidget>}
        {showOurProcessesWidget && <DeferredDashboardWidget widgetId="our_processes" title="فرآیندهای ما" defaultOrder={8}><OurProcessesWidget key={`${orgId}:${currentUserId}`} /></DeferredDashboardWidget>}
        {canShowWidget('quick_add') && quickActions.length > 0 && <DashboardWidgetFrame widgetId="quick_add" title="افزودن سریع" defaultOrder={8.5} settings={moduleSelection}>
          <Card title="افزودن سریع" className="dashboard-content-card"><div className="dashboard-quick-actions">{quickActions.map(action => <button type="button" className="dashboard-quick-action" key={action.moduleId} onClick={() => navigate(`/${action.moduleId}/create`)}><span className="dashboard-quick-icon">{getModuleIcon(action.moduleId)}</span><span className="dashboard-quick-copy"><strong>{action.title}</strong><small>{action.description}</small></span><PlusOutlined className="dashboard-quick-plus" /></button>)}</div></Card>
        </DashboardWidgetFrame>}
        {canShowWidget('recent_lists') && recentSections.map(section => <DashboardWidgetFrame key={section.moduleId} widgetId={`recent:${section.moduleId}`} title={section.title} defaultOrder={10} settings={moduleSelection}>
          <Card className="dashboard-content-card" title={<div className="flex items-center gap-2">{getModuleIcon(section.moduleId)}<span>{section.title}</span></div>}>
            <div className="mb-3 flex flex-wrap items-center gap-2"><Button icon={<PlusOutlined />} onClick={() => navigate(`/${section.moduleId}/create`)}>ایجاد</Button><Button type="link" onClick={() => navigate(`/${section.moduleId}`)}>مشاهدهٔ همه</Button></div>
            <Table dataSource={section.rows} columns={section.columns} size="small" pagination={false} locale={{ emptyText: 'رکوردی ثبت نشده است' }} rowKey="id" scroll={{ x: true }}
              onRow={record => ({ onClick: () => navigate(`/${section.moduleId}/${record.id}`), className: 'cursor-pointer' })} />
          </Card>
        </DashboardWidgetFrame>)}
      </div>
      <Modal title="داشبورد من" open={personalizeOpen} onCancel={() => setPersonalizeOpen(false)} footer={<Button onClick={() => setPersonalizeOpen(false)}>بستن</Button>} destroyOnClose>
        {moduleSelection}
        <div className="mt-5"><h3 className="mb-3 font-bold">نمایش ویجت‌ها</h3><div className="flex flex-col gap-3">{widgetChoices.map(widget => <Checkbox key={widget.id} checked={!preferences.hiddenWidgets.includes(widget.id)} onChange={event => updateDashboardPreferences(orgId, currentUserId, { hiddenWidgets: event.target.checked ? preferences.hiddenWidgets.filter(id => id !== widget.id) : [...new Set([...preferences.hiddenWidgets, widget.id])] })}>{widget.label}</Checkbox>)}</div></div>
        <Button className="mt-5" onClick={() => updateDashboardPreferences(orgId, currentUserId, { hiddenWidgets: [], widgetOrder: [] })}>بازگرداندن نمایش و ترتیب پیش‌فرض</Button>
      </Modal>
    </div>
      {/* ─── Story Modals ─── */}
      {/* ─── StoryViewerModal ─── */}
      {storyViewerOpen && storyViewerList.length > 0 && currentUserId && (
        <React.Suspense fallback={null}><StoryViewerModal
          open={storyViewerOpen}
          stories={storyViewerList}
          initialIndex={storyViewerIndex}
          currentOrgId={orgId || ''}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
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
        /></React.Suspense>
      )}

      {/* ─── StoryEditorModal ─── */}
      {storyEditorOpen && orgId && currentUserId && (
        <React.Suspense fallback={null}><StoryEditorModal
          open={storyEditorOpen}
          orgId={orgId}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          currentUserAvatar={currentUserAvatar}
          editingStory={editingStory}
          canPublishSaasStory={canPublishSaasStory}
          canPublishSaasAdminStory={canPublishSaasAdminStory}
          onClose={() => { setStoryEditorOpen(false); setEditingStory(null); }}
          onSaved={() => {
            invalidateOrgStoriesCache(orgId);
            setStoryRefreshKey((k) => k + 1);
          }}
          onNotifySms={(storyId, text, recipientIds) => {
            notifyStorySms(storyId, text, recipientIds);
          }}
        /></React.Suspense>
      )}
    </DashboardWidgetScope.Provider>
  );
};

export default Dashboard;
