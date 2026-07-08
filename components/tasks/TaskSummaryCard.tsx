import React from 'react';
import { InputNumber, Tag } from 'antd';
import { AppstoreOutlined, FileOutlined, LockOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { getResolvedAssigneeId } from '../../utils/assigneeValue';
import { resolveAssigneePresentation } from '../../utils/assigneePresentation';
import { resolveTaskSourceLink } from '../../utils/taskMeta';
import {
  getTaskStatusOptions,
} from '../../utils/processTaskStatusOptions';
import TaskActionButtons from './TaskActionButtons';
import { openTaskProcessModal } from '../../utils/taskProcessModalEvents';
import ResilientImage from '../common/ResilientImage';
import RecordLockControl from '../recordLocks/RecordLockControl';
import { getRecordLockStateFromRecord, mergeRecordLockIntoRecord, type RecordLockState } from '../../utils/recordLockRuntime';
import ProcessCardsV2RuntimeBlock from '../processes/ProcessCardsV2RuntimeBlock';
import { supabase } from '../../supabaseClient';
import { hasProcessTaskTitleTokens, resolveProcessTaskTitle } from '../../utils/processTaskTitle';
import type { ProcessRuntimeSnapshot } from '../../utils/processRuntimeSnapshot';

const ProductionStagesField = React.lazy(() => import('../ProductionStagesField'));

interface TaskSummaryCardProps {
  task: any;
  statusOptions: Array<{ label: string; value: string | number }>;
  priorityOptions: Array<{ label: string; value: string | number }>;
  assigneeNameMap?: Record<string, string>;
  roleNameMap?: Record<string, string>;
  allUsers?: any[];
  allRoles?: any[];
  recordTitle?: string | null;
  onClose?: () => void;
  onStatusChange?: (taskId: string, status: string) => void | Promise<void>;
  onProducedQtyChange?: (taskId: string, value: number | null) => void | Promise<void>;
  onTaskUpdated?: (task: any) => void | Promise<void>;
  currentUser?: { id?: string | null; fullName?: string | null } | null;
  canLockRecord?: boolean;
  canUnlockRecord?: boolean;
}

const processRecordKeyByModule: Record<string, string> = {
  projects: 'project_id',
  customers: 'related_customer',
  invoices: 'related_invoice',
  purchase_invoices: 'purchase_invoice_id',
  marketing_leads: 'marketing_lead_id',
};

const resolveOptionLabel = (value: any, options?: Array<{ label: string; value: any }>) => {
  if (!options?.length) return null;
  const found = options.find((option) => String(option.value) === String(value));
  return found?.label || null;
};

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isVideoUrl = (value: unknown) => /\.(mp4|webm|ogg|mov|m4v|avi|mkv)(\?|#|$)/i.test(String(value || '').trim());
const isImageUrl = (value: unknown) => /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)(\?|#|$)/i.test(String(value || '').trim());
const parsePlainObject = (value: unknown): Record<string, any> => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const TaskSummaryCard: React.FC<TaskSummaryCardProps> = ({
  task,
  statusOptions,
  priorityOptions,
  assigneeNameMap = {},
  roleNameMap = {},
  allUsers = [],
  allRoles = [],
  recordTitle,
  onClose,
  onProducedQtyChange,
  onTaskUpdated,
  currentUser = null,
  canLockRecord = false,
  canUnlockRecord = false,
}) => {
  const [lockPatch, setLockPatch] = React.useState<Record<string, any>>({});
  const [resolvedTaskTitle, setResolvedTaskTitle] = React.useState('');
  React.useEffect(() => {
    setLockPatch({});
  }, [task?.id, task?.updated_at]);
  const effectiveTask = { ...(task || {}), ...lockPatch };
  const lockState = getRecordLockStateFromRecord(effectiveTask);
  const isLocked = lockState.isLocked;
  const handleLockChanged = React.useCallback((nextLockState: RecordLockState) => {
    setLockPatch((prev) => mergeRecordLockIntoRecord(prev, nextLockState));
  }, []);
  const sourceLink = resolveTaskSourceLink(effectiveTask);
  const rawTaskTitle = String(effectiveTask.name || 'بدون عنوان').trim();
  React.useEffect(() => {
    let cancelled = false;
    setResolvedTaskTitle('');
    if (!hasProcessTaskTitleTokens(rawTaskTitle)) return undefined;
    resolveProcessTaskTitle(supabase, effectiveTask, rawTaskTitle)
      .then((title) => {
        if (!cancelled) setResolvedTaskTitle(title);
      })
      .catch(() => {
        if (!cancelled) setResolvedTaskTitle('');
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveTask?.id, effectiveTask?.updated_at, rawTaskTitle]);
  const displayTaskTitle = resolvedTaskTitle || (hasProcessTaskTitleTokens(rawTaskTitle) ? 'فعالیت' : rawTaskTitle);
  const resolvedStatusOptions = getTaskStatusOptions(effectiveTask, statusOptions);
  const relatedModuleId = String(sourceLink.moduleId || '');
  const relatedRecordId = sourceLink.recordId;

  const statusColor = effectiveTask.status === 'done'
    ? 'border-green-300'
    : effectiveTask.status === 'canceled'
      ? 'border-red-300'
      : effectiveTask.status === 'review'
        ? 'border-orange-300'
        : 'border-[rgba(var(--brand-200-rgb),0.6)] dark:border-[rgba(var(--brand-300-rgb),0.3)]';

  const isProductionTask = (
    relatedModuleId === 'production_orders'
    && effectiveTask?.related_production_order
    && effectiveTask?.production_line_id
  );

  const relatedProcessRecordKey = processRecordKeyByModule[relatedModuleId];
  const relatedProcessRecordId = relatedProcessRecordKey ? effectiveTask?.[relatedProcessRecordKey] : null;
  const isExecutionProcessTask = (
    !isProductionTask
    && !!relatedProcessRecordId
    && Object.prototype.hasOwnProperty.call(processRecordKeyByModule, relatedModuleId)
  );
  const relatedProcessRuntimeSnapshot = React.useMemo<ProcessRuntimeSnapshot | null>(() => {
    if (!isExecutionProcessTask || !relatedModuleId || !relatedProcessRecordId) return null;
    const recurrence = parsePlainObject(effectiveTask?.recurrence_info);
    const metadata = parsePlainObject(effectiveTask?.metadata);
    const processNodeKey = String(
      effectiveTask?.process_node_key
      || recurrence.process_node_key
      || metadata.process_node_key
      || effectiveTask?.process_run_stage_id
      || effectiveTask?.id
      || ''
    ).trim();
    const processLaneKey = String(
      effectiveTask?.process_lane_key
      || recurrence.process_lane_key
      || metadata.process_lane_key
      || 'lane_1'
    ).trim();
    const snapshotTask = {
      ...effectiveTask,
      source_module_id: effectiveTask?.source_module_id || relatedModuleId,
      source_record_id: effectiveTask?.source_record_id || String(relatedProcessRecordId),
      process_node_key: processNodeKey || undefined,
      process_lane_key: processLaneKey || 'lane_1',
      recurrence_info: {
        ...recurrence,
        ...(processNodeKey ? { process_node_key: processNodeKey } : {}),
        process_lane_key: processLaneKey || recurrence.process_lane_key || 'lane_1',
      },
      metadata,
    };
    return {
      moduleId: relatedModuleId,
      recordId: String(relatedProcessRecordId),
      loaded: true,
      runs: [],
      stages: [],
      tasks: [snapshotTask],
      hasStartedExecution: true,
    };
  }, [effectiveTask, isExecutionProcessTask, relatedModuleId, relatedProcessRecordId]);

  const canEditProducedQty = !isLocked && !['todo', 'pending'].includes(String(effectiveTask?.status || '').toLowerCase());
  const taskMainFileUrl = String(effectiveTask?.image_url || '').trim();
  const taskMainFileName = taskMainFileUrl.split('?')[0].split('/').pop() || 'file';
  const assigneeId = String(getResolvedAssigneeId(effectiveTask) || '');
  const effectiveAssigneeType = String(effectiveTask?.assignee_type || '').trim()
    || (effectiveTask?.assignee_role_id ? 'role' : 'user');
  const assigneePresentation = resolveAssigneePresentation({
    source: {
      ...effectiveTask,
      assignee_type: effectiveAssigneeType,
      assignee_name: effectiveTask.assignee_name || (effectiveAssigneeType === 'user' ? assigneeNameMap[assigneeId] : undefined),
      assignee_role_title: effectiveTask.assignee_role_title || (effectiveAssigneeType === 'role' ? roleNameMap[assigneeId] : undefined),
    },
    allUsers,
    allRoles,
  });
  const assigneeLabel = assigneePresentation.label || 'تعیین نشده';
  const canReview = resolvedStatusOptions.some((option) => String(option?.value || '') === 'review');
  const taskTags = React.useMemo(() => {
    const raw = effectiveTask?.tags;
    if (Array.isArray(raw)) return raw.map((item) => String(item || '').trim()).filter(Boolean);
    return String(raw || '')
      .split(/[،,]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }, [effectiveTask?.tags]);

  return (
    <div className="mb-2">
      <div className={`border ${statusColor} rounded-2xl bg-[linear-gradient(145deg,#ffffff,#f3f6fb)] p-2.5 shadow-[0_16px_34px_rgba(15,23,42,0.10),inset_0_2px_5px_rgba(255,255,255,0.86),inset_0_-10px_22px_rgba(148,163,184,0.14)] transition-all hover:border-[rgba(var(--brand-400-rgb),0.75)] hover:shadow-[0_20px_42px_rgba(15,23,42,0.14),inset_0_2px_6px_rgba(255,255,255,0.92),inset_0_-10px_24px_rgba(148,163,184,0.16)] dark:bg-[linear-gradient(145deg,rgba(38,38,38,0.98),rgba(24,24,24,0.98))] dark:shadow-[0_16px_36px_rgba(0,0,0,0.38),inset_0_1px_3px_rgba(255,255,255,0.06),inset_0_-12px_24px_rgba(0,0,0,0.20)]`}>
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-1.5">
            <button
              type="button"
              className="min-w-0 flex-1 text-right text-sm font-bold leading-5 text-gray-800 hover:underline line-clamp-2 break-words overflow-hidden dark:text-gray-200"
              onClick={() => {
                openTaskProcessModal({ task: effectiveTask });
                onClose?.();
              }}
            >
              {toPersianNumber(displayTaskTitle)}
            </button>
            <div className="flex shrink-0 items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
              <RecordLockControl
                moduleId="tasks"
                recordId={String(effectiveTask?.id || '')}
                lockState={lockState}
                canLock={canLockRecord}
                canUnlock={canUnlockRecord}
                onChanged={handleLockChanged}
              />
              <TaskActionButtons
                task={effectiveTask}
                disabled={isLocked}
                currentUser={currentUser}
                onTaskUpdated={onTaskUpdated}
                onlyReschedule
              />
            </div>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] font-semibold text-gray-400">
            {isLocked ? (
              <span className="inline-flex items-center gap-1 text-red-500">
                <LockOutlined />
                <span>قفل شده</span>
              </span>
            ) : null}
            {taskTags.slice(0, 3).map((tag) => (
              <Tag key={tag} className="!m-0 !rounded-full !border-0 !bg-gray-100 !px-1.5 !py-0 !text-[10px] !font-semibold !text-gray-500 dark:!bg-white/10 dark:!text-gray-300">
                {toPersianNumber(tag)}
              </Tag>
            ))}
            {taskTags.length > 3 ? (
              <span className="rounded-full bg-gray-100 px-1.5 py-0 text-[10px] text-gray-500 dark:bg-white/10 dark:text-gray-300">
                +{toPersianNumber(taskTags.length - 3)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="relative z-30 mt-0.5 px-1 py-2">
          <div className="flex min-w-0 items-center justify-center gap-1.5 overflow-visible">
            <div className="relative z-30 flex min-w-0 items-center justify-center gap-1 overflow-x-auto overflow-y-visible py-1">
              <TaskActionButtons
                task={effectiveTask}
                disabled={isLocked}
                currentUser={currentUser}
                onTaskUpdated={onTaskUpdated}
                showReview={canReview}
                statusOptions={resolvedStatusOptions}
                hideReschedule
              />
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
          <span className="flex min-w-0 items-center gap-1 shrink-0">
            {effectiveTask.assignee_type === 'role' ? <TeamOutlined /> : <UserOutlined />}
            <span className="truncate font-semibold">{toPersianNumber(String(assigneeLabel))}</span>
          </span>
          {recordTitle && relatedModuleId && relatedRecordId ? (
            <span className="min-w-0 truncate">
              رکورد مرتبط:{' '}
              <Link to={`/${relatedModuleId}/${relatedRecordId}`} className="text-leather-600" onClick={onClose}>
                {toPersianNumber(String(recordTitle))}
              </Link>
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2">
          {effectiveTask.priority ? (
            <span className="text-[11px] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-[rgba(var(--brand-700-rgb),0.26)] text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
              {resolveOptionLabel(effectiveTask.priority, priorityOptions) || effectiveTask.priority}
            </span>
          ) : null}
          {effectiveTask.due_date ? (
            <span className="text-[11px] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-[rgba(var(--brand-700-rgb),0.26)] text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
              موعد: {safeJalaliFormat(effectiveTask.due_date, 'YYYY/MM/DD HH:mm')}
            </span>
          ) : null}
        </div>

        <div className="mt-2 overflow-hidden rounded-xl border border-gray-100 bg-gray-100 dark:border-gray-700 dark:bg-gray-900 h-24">
          {taskMainFileUrl ? (
            isVideoUrl(taskMainFileUrl) ? (
              <video
                src={taskMainFileUrl}
                className="h-full w-full object-cover"
                preload="metadata"
                controls
              />
            ) : isImageUrl(taskMainFileUrl) ? (
              <ResilientImage src={taskMainFileUrl} preset="card" alt={String(displayTaskTitle || 'task-image')} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-gray-50 to-gray-200 text-gray-600 dark:from-gray-800 dark:to-gray-900 dark:text-gray-200">
                <FileOutlined className="text-xl opacity-70" />
                <span className="max-w-[90%] truncate text-[11px]" title={taskMainFileName}>
                  {toPersianNumber(String(taskMainFileName))}
                </span>
              </div>
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-400">
              <AppstoreOutlined className="text-2xl opacity-40" />
            </div>
          )}
        </div>

        {isProductionTask ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-600 dark:text-gray-300">مقدار تولید شده:</span>
            <InputNumber
              size="small"
              min={0}
              value={toNumber(effectiveTask?.produced_qty)}
              disabled={!canEditProducedQty || !onProducedQtyChange}
              className="w-28 persian-number"
              onChange={(value) => {
                if (!onProducedQtyChange) return;
                if (isLocked) return;
                void onProducedQtyChange(String(effectiveTask.id), value);
              }}
            />
          </div>
        ) : null}

        {isProductionTask ? (
          <div className="mt-3">
            <React.Suspense fallback={null}>
              <ProductionStagesField
                recordId={String(effectiveTask.related_production_order)}
                moduleId="production_orders"
                readOnly
                compact
                cardCompact
                allowReportEditInReadOnly
                lazyLoad
                onlyLineId={String(effectiveTask.production_line_id)}
              />
            </React.Suspense>
          </div>
        ) : null}

        {isExecutionProcessTask ? (
          <div className="mt-3">
            <ProcessCardsV2RuntimeBlock
              recordId={String(relatedProcessRecordId)}
              moduleId={relatedModuleId}
              variant="compact"
              enabled
              runtimeSnapshot={relatedProcessRuntimeSnapshot}
              snapshotOnly
              highlightedTaskId={String(effectiveTask?.id || '')}
              highlightedRunStageId={String(effectiveTask?.process_run_stage_id || '')}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TaskSummaryCard;
