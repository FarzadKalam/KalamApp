import React from 'react';
import { InputNumber, Select } from 'antd';
import { AppstoreOutlined, FileOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { getResolvedAssigneeId } from '../../utils/assigneeValue';
import { resolveTaskSourceLink } from '../../utils/taskMeta';
import { getTaskStatusOptions } from '../../utils/processTaskStatusOptions';
import TaskActionButtons from './TaskActionButtons';
import { openTaskProcessModal } from '../../utils/taskProcessModalEvents';
import ResilientImage from '../common/ResilientImage';
import RecordLockControl from '../recordLocks/RecordLockControl';
import { getRecordLockStateFromRecord, mergeRecordLockIntoRecord, type RecordLockState } from '../../utils/recordLockRuntime';

const ProductionStagesField = React.lazy(() => import('../ProductionStagesField'));

interface TaskSummaryCardProps {
  task: any;
  statusOptions: Array<{ label: string; value: string | number }>;
  priorityOptions: Array<{ label: string; value: string | number }>;
  assigneeNameMap?: Record<string, string>;
  roleNameMap?: Record<string, string>;
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

const TaskSummaryCard: React.FC<TaskSummaryCardProps> = ({
  task,
  statusOptions,
  priorityOptions,
  assigneeNameMap = {},
  roleNameMap = {},
  recordTitle,
  onClose,
  onStatusChange,
  onProducedQtyChange,
  onTaskUpdated,
  currentUser = null,
  canLockRecord = false,
  canUnlockRecord = false,
}) => {
  const [lockPatch, setLockPatch] = React.useState<Record<string, any>>({});
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

  const canEditProducedQty = !isLocked && !['todo', 'pending'].includes(String(effectiveTask?.status || '').toLowerCase());
  const taskMainFileUrl = String(effectiveTask?.image_url || '').trim();
  const taskMainFileName = taskMainFileUrl.split('?')[0].split('/').pop() || 'file';
  const assigneeId = String(getResolvedAssigneeId(effectiveTask) || '');
  const assigneeLabel = effectiveTask.assignee_type === 'role'
    ? (roleNameMap[assigneeId] || 'نقش')
    : (assigneeNameMap[assigneeId] || 'کاربر');

  return (
    <div className="mb-2">
      <div className={`border ${statusColor} rounded-2xl bg-white/95 p-3 shadow-sm transition-all hover:border-[rgba(var(--brand-400-rgb),0.75)] hover:shadow-md dark:bg-[rgba(var(--app-dark-surface-rgb),0.65)]`}>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-full text-right text-sm font-bold leading-5 text-gray-800 hover:underline line-clamp-2 break-words overflow-hidden dark:text-gray-200"
            onClick={() => {
              openTaskProcessModal({ task: effectiveTask });
              onClose?.();
            }}
          >
            {toPersianNumber(String(effectiveTask.name || 'بدون عنوان'))}
          </button>
          <div className="flex flex-wrap items-center justify-end gap-1">
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
            />
            {onStatusChange ? (
              <Select
                size="small"
                value={effectiveTask.status}
                onChange={(value) => {
                  if (isLocked) return;
                  void onStatusChange(String(effectiveTask.id), String(value));
                }}
                disabled={isLocked}
                options={resolvedStatusOptions.map((option) => ({ label: option.label, value: option.value }))}
                style={{ minWidth: 120 }}
              />
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-2">
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

        <div className="mt-3 overflow-hidden rounded-xl border border-gray-100 bg-gray-100 dark:border-gray-700 dark:bg-gray-900 h-32">
          {taskMainFileUrl ? (
            isVideoUrl(taskMainFileUrl) ? (
              <video
                src={taskMainFileUrl}
                className="h-full w-full object-cover"
                preload="metadata"
                controls
              />
            ) : isImageUrl(taskMainFileUrl) ? (
              <ResilientImage src={taskMainFileUrl} preset="card" alt={String(effectiveTask?.name || 'task-image')} className="h-full w-full object-cover" loading="lazy" />
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

        <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 gap-3">
          {recordTitle && relatedModuleId && relatedRecordId ? (
            <span className="truncate">
              رکورد مرتبط:{' '}
              <Link to={`/${relatedModuleId}/${relatedRecordId}`} className="text-leather-600" onClick={onClose}>
                {toPersianNumber(String(recordTitle))}
              </Link>
            </span>
          ) : <span />}
          <span className="flex items-center gap-1 shrink-0">
            {effectiveTask.assignee_type === 'role' ? <TeamOutlined /> : <UserOutlined />}
            {toPersianNumber(String(assigneeLabel))}
          </span>
        </div>

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
            <React.Suspense fallback={null}>
              <ProductionStagesField
                recordId={String(relatedProcessRecordId)}
                moduleId={relatedModuleId}
                readOnly
                compact
                cardCompact
                allowReportEditInReadOnly
                lazyLoad
              />
            </React.Suspense>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TaskSummaryCard;


