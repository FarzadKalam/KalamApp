import React from 'react';
import { Button, Empty, List, Skeleton } from 'antd';
import { PlusOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { getTaskRelationFieldKey, resolveTaskSourceLink } from '../../utils/taskMeta';
import { updateTaskStatusWithAutomation } from '../../utils/taskUpdateRuntime';
import { buildRecordReferenceKey } from '../../utils/recordReference';
import { openTaskProcessModal } from '../../utils/taskProcessModalEvents';
import { fetchRecordLockMap, mergeRecordLockIntoRecord, type RecordLockState } from '../../utils/recordLockRuntime';
import TaskSummaryCard from '../tasks/TaskSummaryCard';
import RenderCardItem from '../moduleList/RenderCardItem';

type CreatedSortDirection = 'desc' | 'asc';

const TASK_VIEW_PRESETS = [
  { key: 'all', label: 'همه فعالیت‌ها' },
  { key: 'overdue', label: 'سررسیدگذشته‌ها' },
  { key: 'in_progress', label: 'در حال انجام' },
  { key: 'upcoming', label: 'فعالیت‌های پیش‌رو' },
] as const;

type TaskViewPresetKey = typeof TASK_VIEW_PRESETS[number]['key'];
type TasksPanelProps = {
  mode: 'list' | 'grid';
  tasks: any[];
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
  lastLoadedAtRef: React.MutableRefObject<Record<string, number>>;
  handleTaskProducedQtyChange: (taskId: string, value: number | null) => Promise<void>;
  profile: { id: string };
  maxItems: number;
  canLockTaskRecord?: boolean;
  canUnlockTaskRecord?: boolean;
};

const TasksPanel: React.FC<TasksPanelProps> = ({
  mode,
  tasks,
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
  lastLoadedAtRef,
  handleTaskProducedQtyChange,
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
      <div className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/88 p-1 h-10 shadow-sm overflow-hidden dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.88)]">
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
          <List
            dataSource={data}
            renderItem={(task: any) => {
              const sourceLink = resolveTaskSourceLink(task);
              const recordKey = sourceLink.moduleId && sourceLink.recordId ? `${sourceLink.moduleId}:${sourceLink.recordId}` : null;
              const recordTitle = recordKey ? recordTitleMap[recordKey] : null;
              return (
                <TaskSummaryCard
                  task={task}
                  statusOptions={statusOptions}
                  priorityOptions={priorityOptions}
                  assigneeNameMap={assigneeNameMap}
                  roleNameMap={roleNameMap}
                  recordTitle={recordTitle}
                  onClose={handleClose}
                  onStatusChange={async (taskId, status) => {
                    const currentTask = tasks.find((row: any) => String(row?.id) === String(taskId)) || null;
                    const previousTask = currentTask ? { ...currentTask } : null;
                    setTasks((prev) => prev.map((row: any) => (
                      String(row?.id || '') === String(taskId)
                        ? { ...row, status }
                        : row
                    )));
                    try {
                      const updatedTask = await updateTaskStatusWithAutomation({
                        taskId,
                        nextStatus: status,
                        previousTask: currentTask,
                        currentUser: {
                          id: profile.id,
                          fullName: createdByNameMap[String(profile.id || '')] || null,
                        },
                      });
                      setTasks((prev) => prev.map((row: any) => (
                        row.id === taskId ? { ...row, ...updatedTask } : row
                      )));
                      lastLoadedAtRef.current.tasks = 0;
                    } catch (error) {
                      if (previousTask) {
                        setTasks((prev) => prev.map((row: any) => (
                          String(row?.id || '') === String(taskId)
                            ? { ...row, ...previousTask }
                            : row
                        )));
                      }
                      throw error;
                    }
                  }}
                  onProducedQtyChange={async (taskId, value) => {
                    await handleTaskProducedQtyChange(taskId, value);
                  }}
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
            }}
          />
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
