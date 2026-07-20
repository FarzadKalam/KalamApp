import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Empty, Spin, Tag, Tooltip } from 'antd';
import { LinkOutlined, NodeIndexOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { MODULES } from '../../moduleRegistry';
import { supabase } from '../../supabaseClient';
import {
  canAccessAssignedRecord,
  fetchCurrentUserRecordAccessContext,
  type CurrentUserRecordAccessContext,
} from '../../utils/permissions';
import { resolveTaskSourceLink } from '../../utils/taskMeta';
import { parseProcessLinkMap } from '../../utils/processTargets';
import { getRecordTitle, getRecordTitleCandidateKeys } from '../../utils/recordTitle';
import { runSelectWithCompatibleColumns } from '../../utils/selectCompat';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import {
  fetchProcessWorkItems,
  getPreferredProcessRecordRef,
  getProcessWorkItemIdentity,
  normalizeProcessWorkItemLinks,
  type ProcessWorkItem,
} from '../../utils/processWorkItems';

const ProcessCardsV2RuntimeBlock = React.lazy(() => import('../processes/ProcessCardsV2RuntimeBlock'));

type ProcessWidgetItem = ProcessWorkItem & {
  displayModuleId: string;
  displayRecordId: string;
  displayTitle: string;
};

const INITIAL_VISIBLE_LIMIT = 15;
const LIMIT_STEP = 15;
const MIN_TASK_FETCH_LIMIT = 180;
const MAX_TASK_FETCH_LIMIT = 600;
const MAX_PROCESS_RECORD_FETCH_PER_MODULE = 40;
const COMPLETED_PROCESS_TASK_STATUSES = new Set(['done', 'completed', 'confirmed', 'final', 'settled']);
const PROCESS_RECORD_SCAN_EXCLUDED_MODULE_IDS = new Set([
  'automation_execution_reports',
  'sms_delivery_reports',
  'voip_call_reports',
  'petty_funds',
  'surveys',
  'instructions',
]);

const PROCESS_MODULE_QUERY_CONCURRENCY = 5;

const runWithConcurrencyLimit = async (tasks: (() => Promise<void>)[], limit: number): Promise<void> => {
  let index = 0;
  const worker = async () => {
    while (index < tasks.length) {
      const current = index++;
      await tasks[current]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
};

const TASK_PROCESS_COLUMNS = [
  'id',
  'name',
  'status',
  'assignee_id',
  'assignee_role_id',
  'assignee_type',
  'related_to_module',
  'source_module_id',
  'source_record_id',
  'related_product',
  'related_production_order',
  'project_id',
  'marketing_lead_id',
  'related_customer',
  'related_supplier',
  'related_invoice',
  'purchase_invoice_id',
  'production_line_id',
  'source_template_id',
  'process_group_id',
  'recurrence_info',
  'updated_at',
  'created_at',
] as const;

const PROCESS_RECORD_COLUMNS = [
  'id',
  'org_id',
  'process_template_id',
  'updated_at',
  'created_at',
] as const;
const PROCESS_DRAFT_FIELD_KEYS = [
  'execution_process_draft',
  'marketing_process_draft',
  'process_draft',
  'sub_process_draft',
] as const;

const LINKED_RECORD_COLUMNS = [
  'id',
  'org_id',
  'updated_at',
  'created_at',
  'assignee_id',
  'assignee_role_id',
  'assignee_type',
] as const;

const normalizeId = (value: unknown) => String(value || '').trim();

const parseJsonObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const parseStageDrafts = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getTaskProcessMeta = (task: any) => {
  const recurrence = parseJsonObject(task?.recurrence_info);
  const group = recurrence?.process_group && typeof recurrence.process_group === 'object'
    ? recurrence.process_group
    : {};
  return {
    groupId: normalizeId(group?.id || task?.process_group_id) || null,
    templateId: normalizeId(group?.template_id || task?.source_template_id) || null,
    templateName: normalizeId(group?.template_name) || null,
  };
};

const getStageProcessMeta = (stage: any, fallbackTemplateId?: string | null) => {
  const templateId = normalizeId(stage?.source_template_id || fallbackTemplateId) || null;
  const groupId = normalizeId(stage?.process_group_id || templateId || 'default_process_group') || 'default_process_group';
  return {
    groupId,
    templateId,
    templateName: normalizeId(stage?.source_template_name) || null,
  };
};

const isProcessTaskCompleted = (task: any) =>
  COMPLETED_PROCESS_TASK_STATUSES.has(String(task?.status || '').trim().toLowerCase());

const getProcessSummaryKey = (
  moduleId: string | null,
  recordId: string | null,
  groupId: string | null,
  templateId: string | null
) => [
  normalizeId(moduleId),
  normalizeId(recordId),
  normalizeId(groupId || templateId || 'default_process_group') || 'default_process_group',
].join(':');

const getTaskProcessSummaryKeys = (task: any) => {
  const source = resolveTaskSourceLink(task);
  const moduleId = normalizeId(source.moduleId);
  const recordId = normalizeId(source.recordId);
  if (!moduleId || !recordId) return [];

  const meta = getTaskProcessMeta(task);
  const keys = new Set<string>();
  if (meta.groupId) keys.add(getProcessSummaryKey(moduleId, recordId, meta.groupId, null));
  if (meta.templateId) keys.add(getProcessSummaryKey(moduleId, recordId, null, meta.templateId));
  if (!meta.groupId && !meta.templateId) keys.add(getProcessSummaryKey(moduleId, recordId, null, null));
  return Array.from(keys);
};

const addTaskToProcessSummary = (
  map: Map<string, { total: number; active: number }>,
  task: any
) => {
  const completed = isProcessTaskCompleted(task);
  getTaskProcessSummaryKeys(task).forEach((key) => {
    const previous = map.get(key) || { total: 0, active: 0 };
    map.set(key, {
      total: previous.total + 1,
      active: previous.active + (completed ? 0 : 1),
    });
  });
};

const normalizeAssigneeRecord = (row: any) => {
  if (!row || typeof row !== 'object') return row;
  if (row.assignee_type) return row;
  if (row.assignee_role_id) return { ...row, assignee_type: 'role', assignee_id: row.assignee_role_id };
  if (row.assignee_id) return { ...row, assignee_type: 'user' };
  return row;
};

const isAssignedToAccess = (row: any, access: CurrentUserRecordAccessContext) =>
  canAccessAssignedRecord(
    normalizeAssigneeRecord(row),
    access.userId,
    access.roleId,
    'subtree',
    {
      currentOrgId: access.orgId,
      allowedRoleIds: access.allowedRoleIds,
      allowedUserIds: access.allowedUserIds,
    }
  );

const isStageAssignedToAccess = (stage: any, access: CurrentUserRecordAccessContext) => {
  const userId = normalizeId(stage?.default_assignee_id || stage?.assignee_id || stage?.metadata?.default_assignee_id);
  const roleId = normalizeId(stage?.default_assignee_role_id || stage?.assignee_role_id || stage?.metadata?.default_assignee_role_id);
  if (userId && userId === normalizeId(access.userId)) return true;
  if (roleId && roleId === normalizeId(access.roleId)) return true;
  return false;
};

const getProcessModuleIds = (access: CurrentUserRecordAccessContext) =>
  Object.values(MODULES)
    .filter((module: any) => {
      const moduleId = String(module?.id || '').trim();
      if (!moduleId || !module?.table) return false;
      if (PROCESS_RECORD_SCAN_EXCLUDED_MODULE_IDS.has(moduleId)) return false;
      if (module?.systemManaged || module?.disableDetailView) return false;
      if (access.permissions?.[moduleId]?.view === false) return false;
      const fieldKeys = new Set((module?.fields || []).map((field: any) => String(field?.key || '').trim()));
      return fieldKeys.has('process_template_id')
        || PROCESS_DRAFT_FIELD_KEYS.some((fieldKey) => fieldKeys.has(fieldKey));
    })
    .map((module: any) => String(module.id));

const getProcessDraftFieldKey = (module: any) => {
  const fieldKeys = new Set((module?.fields || []).map((field: any) => String(field?.key || '').trim()));
  return PROCESS_DRAFT_FIELD_KEYS.find((fieldKey) => fieldKeys.has(fieldKey)) || null;
};

const getModuleTitle = (moduleId: string) =>
  MODULES[moduleId]?.titles?.faSingular || MODULES[moduleId]?.titles?.fa || moduleId;

const getItemTime = (item: ProcessWidgetItem) => {
  const parsed = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveProcessDisplayTitles = async (
  processItems: ProcessWorkItem[],
  access: CurrentUserRecordAccessContext,
): Promise<ProcessWidgetItem[]> => {
  const canViewModule = (moduleId: string) => access.permissions?.[moduleId]?.view !== false;
  const displayRefs = processItems.map((item) => getPreferredProcessRecordRef(item, canViewModule));
  const recordsByReference = new Map<string, any>();
  const recordIdsByModule = new Map<string, Set<string>>();

  displayRefs.forEach((reference) => {
    if (!reference || !MODULES[reference.moduleId]?.table) return;
    if (!recordIdsByModule.has(reference.moduleId)) recordIdsByModule.set(reference.moduleId, new Set());
    recordIdsByModule.get(reference.moduleId)!.add(reference.recordId);
  });

  await runWithConcurrencyLimit(
    Array.from(recordIdsByModule.entries()).map(([moduleId, recordIds]) => async () => {
      const module = MODULES[moduleId] as any;
      const columns = Array.from(new Set([
        'id',
        ...getRecordTitleCandidateKeys(module),
      ]));
      const result = await runSelectWithCompatibleColumns<any[]>({
        cacheKey: `dashboard:our-processes:titles:${moduleId}`,
        columns,
        execute: (selectExpr) => supabase
          .from(module.table)
          .select(selectExpr)
          .in('id', Array.from(recordIds)),
      });
      if (result.error) return;
      (result.data || []).forEach((record: any) => {
        const recordId = normalizeId(record?.id);
        if (recordId) recordsByReference.set(`${moduleId}:${recordId}`, record);
      });
    }),
    PROCESS_MODULE_QUERY_CONCURRENCY,
  );

  return processItems.map((item, index) => {
    const displayRef = displayRefs[index] || { moduleId: item.moduleId, recordId: item.recordId };
    const displayModule = MODULES[displayRef.moduleId];
    const displayRecord = recordsByReference.get(`${displayRef.moduleId}:${displayRef.recordId}`);
    return {
      ...item,
      displayModuleId: displayRef.moduleId,
      displayRecordId: displayRef.recordId,
      displayTitle: getRecordTitle(displayRecord, displayModule, {
        fallback: getModuleTitle(displayRef.moduleId),
      }),
    };
  });
};

const OurProcessesWidget: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState<ProcessWidgetItem[]>([]);
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE_LIMIT);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [canViewWidget, setCanViewWidget] = useState(true);
  const unavailableProcessModulesRef = useRef<Set<string>>(new Set());

  const addItem = useCallback((map: Map<string, ProcessWidgetItem>, item: ProcessWidgetItem) => {
    if (!item.moduleId || !item.recordId || !MODULES[item.moduleId]) return;
    const key = getProcessWorkItemIdentity(item);
    const previous = map.get(key);
    const next = { ...item, key };
    if (!previous || getItemTime(next) >= getItemTime(previous)) {
      map.set(key, {
        ...previous,
        ...next,
        lineId: previous && previous.lineId !== next.lineId ? null : next.lineId,
        templateName: next.templateName || previous?.templateName || null,
        templateId: next.templateId || previous?.templateId || null,
        processLinks: {
          ...(previous?.processLinks || {}),
          ...(next.processLinks || {}),
        },
      });
    }
  }, []);

  const loadProcesses = useCallback(async (nextVisibleLimit: number, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const access = await fetchCurrentUserRecordAccessContext(supabase);
      const dashboardPerm = access.permissions?.__dashboard_widgets || {};
      if (dashboardPerm.view === false || dashboardPerm.fields?.our_processes === false) {
        setCanViewWidget(false);
        setItems([]);
        return;
      }

      setCanViewWidget(true);
      const rpcItems = await fetchProcessWorkItems(supabase, access, { limit: nextVisibleLimit + 1 });
      if (rpcItems) {
        const titledItems = await resolveProcessDisplayTitles(rpcItems, access);
        setItems(titledItems.slice(0, nextVisibleLimit));
        setCanLoadMore(rpcItems.length > nextVisibleLimit);
        return;
      }

      const candidateMap = new Map<string, ProcessWidgetItem>();
      const taskFetchLimit = Math.min(
        MAX_TASK_FETCH_LIMIT,
        Math.max(MIN_TASK_FETCH_LIMIT, nextVisibleLimit * 12)
      );

      const taskResult = await runSelectWithCompatibleColumns<any[]>({
        cacheKey: 'dashboard:our-processes:tasks',
        columns: TASK_PROCESS_COLUMNS,
        execute: (selectExpr) =>
          supabase
            .from('tasks')
            .select(selectExpr)
            .order('updated_at', { ascending: false })
            .limit(taskFetchLimit),
      });
      if (taskResult.error) throw taskResult.error;

      const taskRows = Array.isArray(taskResult.data) ? taskResult.data : [];
      const processTaskSummaryMap = new Map<string, { total: number; active: number }>();
      const linkedRecordsByModule = new Map<string, Set<string>>();
      const linkedTasksByKey = new Map<string, any[]>();

      const addTaskProcessItem = (task: any, reason: ProcessWidgetItem['reason']) => {
        if (isProcessTaskCompleted(task)) return;
        const source = resolveTaskSourceLink(task);
        const moduleId = normalizeId(source.moduleId);
        const recordId = normalizeId(source.recordId);
        if (!moduleId || !recordId || !MODULES[moduleId]) return;
        if (access.permissions?.[moduleId]?.view === false) return;
        const meta = getTaskProcessMeta(task);
        addItem(candidateMap, {
          key: '',
          moduleId,
          recordId,
          lineId: normalizeId(task?.production_line_id) || null,
          groupId: meta.groupId,
          templateId: meta.templateId,
          templateName: meta.templateName,
          updatedAt: normalizeId(task?.updated_at || task?.created_at) || null,
          reason,
          processLinks: {
            ...normalizeProcessWorkItemLinks(parseProcessLinkMap(parseJsonObject(task?.recurrence_info)?.process_links)),
            [moduleId]: recordId,
          },
          displayModuleId: moduleId,
          displayRecordId: recordId,
          displayTitle: '',
        });
      };

      taskRows.forEach((task: any) => {
        addTaskToProcessSummary(processTaskSummaryMap, task);

        if (isAssignedToAccess(task, access)) {
          addTaskProcessItem(task, 'task');
        }

        const links = parseProcessLinkMap(parseJsonObject(task?.recurrence_info)?.process_links);
        Object.entries(links).forEach(([moduleId, recordId]) => {
          const normalizedModuleId = normalizeId(moduleId);
          const normalizedRecordId = normalizeId(recordId);
          if (!normalizedModuleId || !normalizedRecordId || !MODULES[normalizedModuleId]) return;
          if (access.permissions?.[normalizedModuleId]?.view === false) return;
          if (!linkedRecordsByModule.has(normalizedModuleId)) linkedRecordsByModule.set(normalizedModuleId, new Set());
          linkedRecordsByModule.get(normalizedModuleId)!.add(normalizedRecordId);
          const linkedKey = `${normalizedModuleId}:${normalizedRecordId}`;
          linkedTasksByKey.set(linkedKey, [...(linkedTasksByKey.get(linkedKey) || []), task]);
        });
      });

      await Promise.all(Array.from(linkedRecordsByModule.entries()).map(async ([moduleId, recordIds]) => {
        const ids = Array.from(recordIds).slice(0, 80);
        if (ids.length === 0) return;
        const module = MODULES[moduleId] as any;
        if (!module?.table) return;
        const result = await runSelectWithCompatibleColumns<any[]>({
          cacheKey: `dashboard:our-processes:linked:${moduleId}`,
          columns: LINKED_RECORD_COLUMNS,
          execute: (selectExpr) =>
            supabase
              .from(module.table)
              .select(selectExpr)
              .in('id', ids),
        });
        if (result.error) return;
        (result.data || []).forEach((row: any) => {
          if (!isAssignedToAccess(row, access)) return;
          const linkedKey = `${moduleId}:${normalizeId(row?.id)}`;
          (linkedTasksByKey.get(linkedKey) || []).forEach((task) => addTaskProcessItem(task, 'linked_record'));
        });
      }));

      const processRecordLimit = Math.min(
        MAX_PROCESS_RECORD_FETCH_PER_MODULE,
        Math.max(12, Math.ceil(nextVisibleLimit / 2))
      );
      const templateIds = new Set<string>();

      await runWithConcurrencyLimit(
        getProcessModuleIds(access).map((moduleId) => async () => {
        if (unavailableProcessModulesRef.current.has(moduleId)) return;
        const module = MODULES[moduleId] as any;
        const processDraftFieldKey = getProcessDraftFieldKey(module);
        if (!processDraftFieldKey) return;
        const result = await runSelectWithCompatibleColumns<any[]>({
          cacheKey: `dashboard:our-processes:records:${moduleId}`,
          columns: [...PROCESS_RECORD_COLUMNS, processDraftFieldKey],
          execute: (selectExpr) =>
            supabase
              .from(module.table)
              .select(selectExpr)
              .order('created_at', { ascending: false })
              .limit(processRecordLimit),
        });
        if (result.error) {
          const errorText = String(result.error?.message || result.error?.details || '').toLowerCase();
          if (
            String(result.error?.code || '').toUpperCase() === '42P01'
            || errorText.includes('does not exist')
            || errorText.includes('relation')
            || errorText.includes('table')
          ) {
            unavailableProcessModulesRef.current.add(moduleId);
          }
          return;
        }

        (result.data || []).forEach((record: any) => {
          const recordId = normalizeId(record?.id);
          if (!recordId) return;
          const stages = parseStageDrafts(record?.[processDraftFieldKey]);
          if (stages.length === 0) return;
          const baseTemplateId = normalizeId(record?.process_template_id) || null;
          if (baseTemplateId) templateIds.add(baseTemplateId);

          const recordAssigned = isAssignedToAccess(record, access);
          const assignedStages = stages.filter((stage) => isStageAssignedToAccess(stage, access));
          if (!recordAssigned && assignedStages.length === 0) return;

          const candidateStages = assignedStages.length > 0 ? assignedStages : stages;
          const groupMap = new Map<string, { groupId: string | null; templateId: string | null; templateName: string | null }>();
          candidateStages.forEach((stage) => {
            const meta = getStageProcessMeta(stage, baseTemplateId);
            if (meta.templateId) templateIds.add(meta.templateId);
            groupMap.set(meta.groupId || 'default_process_group', meta);
          });

          const groups = groupMap.size > 0
            ? Array.from(groupMap.values())
            : [{ groupId: null, templateId: baseTemplateId, templateName: null }];

          groups.forEach((group) => {
            const summary = processTaskSummaryMap.get(getProcessSummaryKey(moduleId, recordId, group.groupId, group.templateId));
            if (summary && summary.total > 0 && summary.active === 0) return;
            addItem(candidateMap, {
              key: '',
              moduleId,
              recordId,
              lineId: null,
              groupId: group.groupId,
              templateId: group.templateId,
              templateName: group.templateName,
              updatedAt: normalizeId(record?.updated_at || record?.created_at) || null,
              reason: assignedStages.length > 0 ? 'draft_stage' : 'record',
              processLinks: {
                ...candidateStages.reduce<Record<string, string>>((links, stage) => ({
                  ...links,
                  ...normalizeProcessWorkItemLinks(parseProcessLinkMap(stage?.process_link_map || stage?.process_links)),
                }), {}),
                [moduleId]: recordId,
              },
              displayModuleId: moduleId,
              displayRecordId: recordId,
              displayTitle: '',
            });
          });
        });
      }),
        PROCESS_MODULE_QUERY_CONCURRENCY
      );

      const itemsBeforeTemplateNames = Array.from(candidateMap.values());
      itemsBeforeTemplateNames.forEach((item) => {
        if (item.templateId) templateIds.add(item.templateId);
      });

      const templateNameMap = new Map<string, string>();
      if (templateIds.size > 0) {
        const { data } = await supabase
          .from('process_templates')
          .select('id,name')
          .in('id', Array.from(templateIds));
        (data || []).forEach((row: any) => {
          const id = normalizeId(row?.id);
          const name = normalizeId(row?.name);
          if (id && name) templateNameMap.set(id, name);
        });
      }

      const sortedItems = (await resolveProcessDisplayTitles(itemsBeforeTemplateNames, access))
        .map((item) => ({
          ...item,
          templateName: item.templateName || (item.templateId ? templateNameMap.get(item.templateId) || null : null),
        }))
        .sort((a, b) => getItemTime(b) - getItemTime(a));

      setItems(sortedItems.slice(0, nextVisibleLimit));
      setCanLoadMore(sortedItems.length > nextVisibleLimit || taskFetchLimit < MAX_TASK_FETCH_LIMIT);
    } catch (error) {
      console.error('Could not load dashboard processes:', error);
      message.error('خواندن فرآیندهای داشبورد ناموفق بود.');
      setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [addItem, message]);

  useEffect(() => {
    void loadProcesses(INITIAL_VISIBLE_LIMIT);
  }, [loadProcesses]);

  const visibleItems = useMemo(() => items, [items]);

  const handleLoadMore = () => {
    const nextLimit = visibleLimit + LIMIT_STEP;
    setVisibleLimit(nextLimit);
    void loadProcesses(nextLimit, true);
  };

  if (!canViewWidget) {
    return (
      <Card className="h-full shadow-sm">
        <Empty description="دسترسی به ویجت فرآیندهای ما ندارید" />
      </Card>
    );
  }

  return (
    <Card className="h-full shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-base font-bold">
            <NodeIndexOutlined className="text-[rgba(var(--brand-600-rgb),1)]" />
            <span>فرآیندهای ما</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            فرآیندهایی که شما، نقش شما، یا رکوردهای مرتبط شما در آن‌ها حضور دارند
          </div>
        </div>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadProcesses(visibleLimit)} loading={loading}>
          بروزرسانی
        </Button>
      </div>

      {loading ? (
        <div className="flex h-[460px] items-center justify-center"><Spin /></div>
      ) : visibleItems.length === 0 ? (
        <div className="flex h-[460px] items-center justify-center">
          <Empty description="فعلا فرآیندی برای نمایش پیدا نشد" />
        </div>
      ) : (
        <div className="flex h-[460px] flex-col">
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {visibleItems.map((item) => (
              <div
                key={item.key}
                className="rounded-2xl border border-gray-200/80 bg-white/85 p-2 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-[#111827]/80"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      className="min-w-0 truncate text-right text-xs font-semibold text-gray-700 hover:text-[rgba(var(--brand-600-rgb),1)] dark:text-gray-200"
                      onClick={() => navigate(`/${item.displayModuleId}/${item.displayRecordId}`)}
                      title={item.templateName ? `${item.displayTitle} - ${item.templateName}` : item.displayTitle}
                    >
                      {toPersianNumber(item.displayTitle)}
                    </button>
                    <Tooltip title="رکوردهای مرتبط با این فرآیند">
                      <Button
                        type="text"
                        size="small"
                        shape="circle"
                        aria-label="رکوردهای مرتبط با این فرآیند"
                        icon={<LinkOutlined />}
                        className="!h-6 !w-6 !min-w-6 !text-gray-500 hover:!text-[rgba(var(--brand-600-rgb),1)]"
                        onClick={() => navigate(`/${item.moduleId}/${item.recordId}`, {
                          state: {
                            openProcessLinks: {
                              groupId: item.groupId,
                              templateId: item.templateId,
                            },
                          },
                        })}
                      />
                    </Tooltip>
                  </div>
                  {item.templateName ? (
                    <Tag className="m-0 max-w-[58%] truncate rounded-full text-[10px]" color="blue">
                      {toPersianNumber(item.templateName)}
                    </Tag>
                  ) : null}
                </div>
                <React.Suspense fallback={<Spin size="small" />}>
                  <ProcessCardsV2RuntimeBlock
                    recordId={item.recordId}
                    moduleId={item.moduleId}
                    recordData={{
                      id: item.recordId,
                      module_id: item.moduleId,
                      process_group_id: item.groupId,
                    }}
                    variant="compact"
                  />
                </React.Suspense>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <span>{toPersianNumber(visibleItems.length)} فرآیند نمایش داده شد</span>
            {canLoadMore ? (
              <Button size="small" onClick={handleLoadMore} loading={loadingMore}>
                مشاهده بیشتر
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
};

export default OurProcessesWidget;
