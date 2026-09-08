import React from 'react';
import { Button, Empty, Skeleton, Tooltip } from 'antd';
import { AppstoreOutlined, PlusOutlined, DownOutlined, UnorderedListOutlined, UpOutlined } from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { getTaskRelationFieldKey, resolveTaskSourceLink } from '../../utils/taskMeta';
import { buildRecordReferenceKey } from '../../utils/recordReference';
import { openTaskProcessModal } from '../../utils/taskProcessModalEvents';
import { fetchRecordLockMap, mergeRecordLockIntoRecord, type RecordLockState } from '../../utils/recordLockRuntime';
import RenderCardItem from '../moduleList/RenderCardItem';
import TaskNotificationListRow from '../tasks/TaskNotificationListRow';

type CreatedSortDirection = 'desc' | 'asc';

const TASK_VIEW_PRESETS = [
  { key: 'all', label: 'همه فعالیت‌ها' },
  { key: 'not_done', label: 'انجام نشده‌ها' },
  { key: 'overdue', label: 'سررسیدگذشته‌ها' },
  { key: 'in_progress', label: 'در حال انجام' },
  { key: 'upcoming', label: 'فعالیت‌های پیش‌رو' },
] as const;

type TaskViewPresetKey = typeof TASK_VIEW_PRESETS[number]['key'];
type TasksPanelProps = {
  mode: 'list' | 'grid';
  onModeChange: (mode: 'list' | 'grid') => void;
  filteredTasks: any[];
  visibleCount: number;
  onShowMore: () => void;
  onShowLess: () => void;
  loadingTasks: boolean;
  taskViewKey: TaskViewPresetKey;
  setTaskViewKey: (key: TaskViewPresetKey) => void;
  taskSortDirection: CreatedSortDirection;
  setTaskSortDirection: React.Dispatch<React.SetStateAction<CreatedSortDirection>>;
  directoryUsers: any[];
  directoryRoles: any[];
  openPreviewRecord: (moduleId: string, recordId: string, label?: string) => void;
  recordTitleMap: Record<string, string>;
  formatRecordLabel: (row: any, moduleId?: string | null) => string;
  assigneeNameMap: Record<string, string>;
  roleNameMap: Record<string, string>;
  createdByNameMap: Record<string, string>;
  handleClose: () => void;
  navigate: (path: string) => void;
  setTasks: React.Dispatch<React.SetStateAction<any[]>>;
  profile: { id: string };
  maxItems: number;
  canLockTaskRecord?: boolean;
  canUnlockTaskRecord?: boolean;
};

const TasksPanel: React.FC<TasksPanelProps> = ({
  mode,
  onModeChange,
  filteredTasks,
  visibleCount,
  onShowMore,
  onShowLess,
  loadingTasks,
  taskViewKey,
  setTaskViewKey,
  taskSortDirection,
  setTaskSortDirection,
  directoryUsers,
  directoryRoles,
  openPreviewRecord,
  recordTitleMap,
  formatRecordLabel,
  assigneeNameMap,
  roleNameMap,
  createdByNameMap,
  handleClose,
  navigate,
  setTasks,
  profile,
  maxItems,
  canLockTaskRecord = false,
  canUnlockTaskRecord = false,
}) => {
  const [taskLockMap, setTaskLockMap] = React.useState<Map<string, RecordLockState>>(() => new Map());
  const tasksConfig = MODULES['tasks'];
  const statusOptions = tasksConfig?.fields?.find((f: any) => f.key === 'status')?.options || [];
  const priorityOptions = tasksConfig?.fields?.find((f: any) => f.key === 'priority')?.options || [];

  const taskIdsSignature = React.useMemo(
    () => filteredTasks.map((task: any) => String(task?.id || '').trim()).filter(Boolean).join('|'),
    [filteredTasks]
  );
  React.useEffect(() => {
    const taskIds = taskIdsSignature.split('|').map((id) => id.trim()).filter(Boolean);
    if (taskIds.length === 0) {
      setTaskLockMap(new Map());
      return;
    }
    let cancelled = false;
    fetchRecordLockMap('tasks', taskIds)
      .then((nextMap) => {
        if (!cancelled) setTaskLockMap(nextMap);
      })
      .catch(() => {
        if (!cancelled) setTaskLockMap(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [taskIdsSignature]);

  const lockedFilteredTasks = React.useMemo(
    () => filteredTasks.map((task: any) => {
      const lockState = taskLockMap.get(String(task?.id || '').trim());
      return lockState ? mergeRecordLockIntoRecord(task, lockState) : task;
    }),
    [filteredTasks, taskLockMap]
  );

  const data = lockedFilteredTasks.slice(0, visibleCount);
  const remainingCount = Math.max(0, lockedFilteredTasks.length - data.length);
  const canShowLess = visibleCount > maxItems;

  const relationOptionsByField = tasks.reduce<Record<string, Array<{ label: string; value: string }>>>((acc, task: any) => {
    const sourceLink = resolveTaskSourceLink(task);
    const relatedModuleId = String(sourceLink.moduleId || task?.related_to_module || '').trim();
    const relatedRecordId = String(sourceLink.recordId || '').trim();
    const fieldKey = getTaskRelationFieldKey(relatedModuleId);
    if (!fieldKey || !relatedModuleId || !relatedRecordId) return acc;

    const recordKey = buildRecordReferenceKey(relatedModuleId, relatedRecordId);
    const label = recordTitleMap[recordKey]
      || formatRecordLabel({ id: relatedRecordId, module_id: relatedModuleId }, relatedModuleId);
    if (!label) return acc;

    const current = acc[fieldKey] || [];
    if (!current.some((item) => String(item.value) === relatedRecordId)) {
      current.push({ label, value: relatedRecordId });
    }
    acc[fieldKey] = current;

    return acc;
  }, {});

  const renderCreatedAtSortControls = () => (
    <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-1 py-0.5 dark:border-gray-700 dark:bg-white/5">
      <Button
        type="text"
        size="small"
        icon={<DownOutlined />}
        className={taskSortDirection === 'desc' ? '!text-[rgb(var(--brand-700-rgb))]' : '!text-gray-400'}
        onClick={() => setTaskSortDirection('desc')}
      />
      <Button
        type="text"
        size="small"
        icon={<UpOutlined />}
        className={taskSortDirection === 'asc' ? '!text-[rgb(var(--brand-700-rgb))]' : '!text-gray-400'}
        onClick={() => setTaskSortDirection('asc')}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="grid h-10 grid-cols-[auto,minmax(0,1fr),auto] items-center gap-2 overflow-hidden rounded-xl border border-gray-200/80 bg-white/88 p-1 shadow-sm dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.88)]">
        {renderCreatedAtSortControls()}
        <div className="flex items-center gap-1 overflow-x-auto flex-1 no-scrollbar px-1">
          {TASK_VIEW_PRESETS.map((view) => (
            <div
              key={view.key}
              onClick={() => {
                setTaskViewKey(view.key);
              }}
              className={`group px-3 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap transition-all flex items-center gap-2 select-none border ${
                taskViewKey === view.key
                  ? 'bg-leather-600 text-white border-leather-600 shadow-sm font-bold'
                  : 'bg-transparent border-transparent hover:bg-gray-100/80 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
              }`}
            >
              {view.label}
            </div>
          ))}
        </div>
        <div className="flex shrink-0 items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-white/5" role="group" aria-label="حالت نمایش فعالیت‌ها">
          <Tooltip title="نمایش شبکه‌ای">
            <Button
              type="text"
              size="small"
              icon={<AppstoreOutlined />}
              className={mode === 'grid' ? '!bg-white !text-[rgb(var(--brand-700-rgb))] !shadow-sm dark:!bg-white/15' : '!text-gray-400'}
              aria-label="نمایش شبکه‌ای"
              aria-pressed={mode === 'grid'}
              onClick={() => onModeChange('grid')}
            />
          </Tooltip>
          <Tooltip title="نمایش فهرستی">
            <Button
              type="text"
              size="small"
              icon={<UnorderedListOutlined />}
              className={mode === 'list' ? '!bg-white !text-[rgb(var(--brand-700-rgb))] !shadow-sm dark:!bg-white/15' : '!text-gray-400'}
              aria-label="نمایش فهرستی"
              aria-pressed={mode === 'list'}
              onClick={() => onModeChange('list')}
            />
          </Tooltip>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => navigate('/tasks/create')}
        >
          افزودن فعالیت
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loadingTasks ? (
          <div className="space-y-2">
            <Skeleton active paragraph={{ rows: 2 }} />
            <Skeleton active paragraph={{ rows: 2 }} />
          </div>
        ) : data.length === 0 ? (
          <Empty description="فعالیتی یافت نشد" />
        ) : mode === 'grid' ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {data.map((task: any) => (
              <RenderCardItem
                key={task.id}
                item={task}
                moduleId="tasks"
                moduleConfig={tasksConfig}
                statusField="status"
                categoryField="task_type"
                tagsField="tags"
                allUsers={directoryUsers}
                allRoles={directoryRoles}
                selectedRowKeys={[]}
                setSelectedRowKeys={() => undefined}
                navigate={(path) => {
                  const [, moduleId, recordId] = String(path || '').split('/');
                  if (!moduleId || !recordId) return;
                  if (moduleId === 'tasks') {
                    openTaskProcessModal({ task });
                    return;
                  }
                  openPreviewRecord(
                    moduleId,
                    recordId,
                    recordTitleMap[`${moduleId}:${recordId}`] || formatRecordLabel({ id: recordId, module_id: moduleId }, moduleId)
                  );
                }}
                canViewField={() => true}
                relationOptions={relationOptionsByField}
                hideSelection
                canLockRecord={canLockTaskRecord}
                canUnlockRecord={canUnlockTaskRecord}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {data.map((task: any) => {
              const sourceLink = resolveTaskSourceLink(task);
              const recordKey = sourceLink.moduleId && sourceLink.recordId ? `${sourceLink.moduleId}:${sourceLink.recordId}` : null;
              const recordTitle = recordKey ? recordTitleMap[recordKey] : null;
              return (
                <TaskNotificationListRow
                  key={task.id}
                  task={task}
                  statusOptions={statusOptions}
                  priorityOptions={priorityOptions}
                  assigneeNameMap={assigneeNameMap}
                  roleNameMap={roleNameMap}
                  allUsers={directoryUsers}
                  allRoles={directoryRoles}
                  recordTitle={recordTitle}
                  onClose={handleClose}
                  onTaskUpdated={async (updatedTask) => {
                    setTasks((prev) => prev.map((row: any) => (
                      String(row?.id || '') === String(updatedTask?.id || '')
                        ? { ...row, ...updatedTask }
                        : row
                    )));
                  }}
                  currentUser={{
                    id: profile.id,
                    fullName: createdByNameMap[String(profile.id || '')] || null,
                  }}
                  canLockRecord={canLockTaskRecord}
                  canUnlockRecord={canUnlockTaskRecord}
                />
              );
            })}
          </div>
        )}
      </div>

      {lockedFilteredTasks.length > maxItems ? (
        <div className="flex items-center justify-between gap-2">
          {canShowLess ? (
            <Button type="link" onClick={onShowLess}>
              نمایش کمتر
            </Button>
          ) : <span />}
          {remainingCount > 0 ? (
            <Button type="link" onClick={onShowMore}>
              مشاهده موارد بیشتر ({toPersianNumber(String(remainingCount))})
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default React.memo(TasksPanel);
