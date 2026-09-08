import React from 'react';
import { Button, Tag } from 'antd';
import { DownOutlined, LockOutlined, UpOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { resolveTaskSourceLink } from '../../utils/taskMeta';
import { getTaskStatusLabel, getTaskStatusOptions, getTaskStatusSwatchColor } from '../../utils/processTaskStatusOptions';
import { openTaskProcessModal } from '../../utils/taskProcessModalEvents';
import { hasProcessTaskTitleTokens, resolveProcessTaskTitle } from '../../utils/processTaskTitle';
import { supabase } from '../../supabaseClient';
import { getRecordLockStateFromRecord, mergeRecordLockIntoRecord, type RecordLockState } from '../../utils/recordLockRuntime';
import AssigneeAvatarDisplay from '../common/AssigneeAvatarDisplay';
import RecordLockControl from '../recordLocks/RecordLockControl';
import TaskActionButtons from './TaskActionButtons';
import TaskRelatedProcessBar from './TaskRelatedProcessBar';

type SelectOption = { label: string; value: string | number; color?: string; icon?: string };

type TaskNotificationListRowProps = {
  task: any;
  statusOptions: SelectOption[];
  priorityOptions: SelectOption[];
  assigneeNameMap?: Record<string, string>;
  roleNameMap?: Record<string, string>;
  allUsers?: any[];
  allRoles?: any[];
  recordTitle?: string | null;
  onClose?: () => void;
  onTaskUpdated?: (task: any) => void | Promise<void>;
  currentUser?: { id?: string | null; fullName?: string | null } | null;
  canLockRecord?: boolean;
  canUnlockRecord?: boolean;
};

const resolveOptionLabel = (value: any, options: SelectOption[]) =>
  options.find((option) => String(option.value) === String(value))?.label || null;

const getTaskTags = (task: any) => {
  const raw = task?.tags;
  if (Array.isArray(raw)) return raw.map((item) => String(item || '').trim()).filter(Boolean);
  return String(raw || '')
    .split(/[،,]/g)
    .map((item) => item.trim())
    .filter(Boolean);
};

/**
 * The dense notification representation deliberately shares the activity runtime
 * (custom statuses, locks and related processes) with the activity card.
 */
const TaskNotificationListRow: React.FC<TaskNotificationListRowProps> = ({
  task,
  statusOptions,
  priorityOptions,
  assigneeNameMap = {},
  roleNameMap = {},
  allUsers = [],
  allRoles = [],
  recordTitle,
  onClose,
  onTaskUpdated,
  currentUser = null,
  canLockRecord = false,
  canUnlockRecord = false,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const [lockPatch, setLockPatch] = React.useState<Record<string, any>>({});
  const [resolvedTaskTitle, setResolvedTaskTitle] = React.useState('');

  React.useEffect(() => {
    setExpanded(false);
    setLockPatch({});
  }, [task?.id]);

  const effectiveTask = { ...(task || {}), ...lockPatch };
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
  const sourceLink = resolveTaskSourceLink(effectiveTask);
  const resolvedStatusOptions = getTaskStatusOptions(effectiveTask, statusOptions);
  const currentStatusLabel = getTaskStatusLabel(effectiveTask?.status, effectiveTask, statusOptions);
  const statusColor = getTaskStatusSwatchColor(effectiveTask?.status, effectiveTask, statusOptions);
  const lockState = getRecordLockStateFromRecord(effectiveTask);
  const taskTags = React.useMemo(() => getTaskTags(effectiveTask), [effectiveTask?.tags]);
  const handleLockChanged = React.useCallback((nextLockState: RecordLockState) => {
    setLockPatch((previous) => mergeRecordLockIntoRecord(previous, nextLockState));
  }, []);

  return (
    <article
      className="overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.92)]"
      style={{ borderRightWidth: 4, borderRightColor: statusColor }}
    >
      <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
        <AssigneeAvatarDisplay
          source={{
            ...effectiveTask,
            assignee_name: effectiveTask.assignee_name || assigneeNameMap[String(effectiveTask?.assignee_id || '')],
            assignee_role_title: effectiveTask.assignee_role_title || roleNameMap[String(effectiveTask?.assignee_role_id || effectiveTask?.assignee_id || '')],
          }}
          allUsers={allUsers}
          allRoles={allRoles}
          avatarSize={30}
          showLabel={false}
          emptyPlaceholder={<span className="h-[30px] w-[30px] rounded-full border border-dashed border-gray-300 dark:border-gray-600" />}
          className="shrink-0"
        />

        <button
          type="button"
          className="min-w-0 flex-1 text-right"
          onClick={() => {
            openTaskProcessModal({ task: effectiveTask });
            onClose?.();
          }}
        >
          <span className="block truncate text-sm font-bold text-gray-800 hover:text-leather-700 hover:underline dark:text-gray-100">
            {toPersianNumber(displayTaskTitle)}
          </span>
          {currentStatusLabel ? (
            <span className="mt-0.5 block truncate text-[10px] font-semibold" style={{ color: statusColor }}>
              {currentStatusLabel}
            </span>
          ) : null}
        </button>

        <div className="relative z-20 flex shrink-0 items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
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
            disabled={lockState.isLocked}
            currentUser={currentUser}
            onTaskUpdated={onTaskUpdated}
            statusOptions={resolvedStatusOptions}
            hideReschedule
            buttonClassName="!h-8 !w-8"
          />
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-gray-100 px-3 py-2.5 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
            {lockState.isLocked ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-300">
                <LockOutlined />
                قفل شده
              </span>
            ) : null}
            {effectiveTask.priority ? (
              <Tag className="!m-0 !rounded-full !border-0 !bg-[rgba(var(--brand-50-rgb),0.9)] !px-2 !py-0.5 !text-[11px] !text-gray-700 dark:!bg-[rgba(var(--brand-700-rgb),0.28)] dark:!text-gray-100">
                {toPersianNumber(resolveOptionLabel(effectiveTask.priority, priorityOptions) || String(effectiveTask.priority))}
              </Tag>
            ) : null}
            {effectiveTask.due_date ? (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-white/10">
                موعد: {safeJalaliFormat(effectiveTask.due_date, 'YYYY/MM/DD HH:mm')}
              </span>
            ) : null}
            {taskTags.map((tag) => (
              <Tag key={tag} className="!m-0 !rounded-full !border-0 !bg-gray-100 !px-2 !py-0.5 !text-[11px] !text-gray-600 dark:!bg-white/10 dark:!text-gray-200">
                {toPersianNumber(tag)}
              </Tag>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-300">
            <AssigneeAvatarDisplay
              source={{
                ...effectiveTask,
                assignee_name: effectiveTask.assignee_name || assigneeNameMap[String(effectiveTask?.assignee_id || '')],
                assignee_role_title: effectiveTask.assignee_role_title || roleNameMap[String(effectiveTask?.assignee_role_id || effectiveTask?.assignee_id || '')],
              }}
              allUsers={allUsers}
              allRoles={allRoles}
              avatarSize={20}
              className="min-w-0"
              labelClassName="truncate font-semibold"
            />
            {recordTitle && sourceLink.moduleId && sourceLink.recordId ? (
              <span className="min-w-0 truncate">
                رکورد مرتبط:{' '}
                <Link to={`/${sourceLink.moduleId}/${sourceLink.recordId}`} className="text-leather-600 hover:underline" onClick={onClose}>
                  {toPersianNumber(String(recordTitle))}
                </Link>
              </span>
            ) : null}
          </div>

          <TaskRelatedProcessBar
            task={effectiveTask}
            variant="compact"
            className="mt-3"
            stopClickPropagation
          />
        </div>
      ) : null}

      <Button
        type="text"
        size="small"
        block
        className="!h-7 !rounded-none !border-x-0 !border-b-0 !border-t !border-gray-100 !text-gray-400 hover:!text-leather-700 dark:!border-white/10 dark:!text-gray-400"
        icon={expanded ? <UpOutlined /> : <DownOutlined />}
        aria-expanded={expanded}
        aria-label={expanded ? 'بستن جزئیات فعالیت' : 'نمایش جزئیات فعالیت'}
        onClick={() => setExpanded((previous) => !previous)}
      />
    </article>
  );
};

export default React.memo(TaskNotificationListRow);
