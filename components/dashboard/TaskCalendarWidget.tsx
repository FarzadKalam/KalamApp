import React, { useCallback, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Modal, Segmented, Select, Spin } from 'antd';
import { CalendarOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { MODULES } from '../../moduleRegistry';
import ModuleCalendarView from '../moduleList/CalendarView';
import { FieldType } from '../../types';
import { fetchCurrentUserRecordAccessContext, canAccessAssignedRecord } from '../../utils/permissions';
import { supabase } from '../../supabaseClient';
import { formatPersianPrice, parseDateValue, safeJalaliFormat } from '../../utils/persianNumberFormatter';
import PersianDatePicker from '../PersianDatePicker';
import TaskQuickPopoverContent from '../tasks/TaskQuickPopoverContent';
import { fetchAssigneeDirectory } from '../../utils/referenceData';
import { getResolvedAssigneeId } from '../../utils/assigneeValue';
import { openTaskProcessModal } from '../../utils/taskProcessModalEvents';

type TaskCalendarRow = {
  id: string;
  name?: string | null;
  status?: string | null;
  priority?: string | null;
  task_type?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  assignee_id?: string | null;
  assignee_role_id?: string | null;
  assignee_type?: string | null;
  org_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type TaskViewKey = 'all' | 'mine';

const TASK_SELECT_FIELDS =
  'id,name,status,priority,task_type,start_date,due_date,completed_at,assignee_id,assignee_role_id,assignee_type,org_id,updated_at,created_at';

const tasksModule = MODULES.tasks;

const taskDateFields = (tasksModule?.fields || []).filter((field) =>
  ['start_date', 'due_date', 'completed_at'].includes(String(field?.key || '')) &&
  (field.type === FieldType.DATE || field.type === FieldType.DATETIME)
);

const taskTypeField = (tasksModule?.fields || []).find((field) => String(field?.key || '') === 'task_type');
const statusOptions = (tasksModule?.fields || []).find((field) => String(field?.key || '') === 'status')?.options || [];

const createDateAtMidday = (date: Date) => {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  return next;
};

const formatIsoDate = (date: Date | null) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfWeek = (anchor: Date) => {
  const date = createDateAtMidday(anchor);
  const offset = (date.getDay() + 1) % 7;
  date.setDate(date.getDate() - offset);
  return createDateAtMidday(date);
};

const endOfWeek = (anchor: Date) => {
  const from = startOfWeek(anchor);
  from.setDate(from.getDate() + 6);
  return createDateAtMidday(from);
};

const startOfMonth = (anchor: Date) => createDateAtMidday(new Date(anchor.getFullYear(), anchor.getMonth(), 1));

const endOfMonth = (anchor: Date) => createDateAtMidday(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));

const createDefaultRange = () => {
  const now = createDateAtMidday(new Date());
  return {
    from: startOfMonth(now),
    to: endOfMonth(now),
  };
};

const TaskCalendarWidget: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TaskCalendarRow[]>([]);
  const [canViewWidget, setCanViewWidget] = useState(true);
  const [canViewAll, setCanViewAll] = useState(false);
  const [taskView, setTaskView] = useState<TaskViewKey>('mine');
  const [selectedDateField, setSelectedDateField] = useState<string>(taskDateFields[0]?.key || 'due_date');
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>('all');
  const [rangeType, setRangeType] = useState<'week' | 'month' | 'custom'>('month');
  const [dateFrom, setDateFrom] = useState<string>(formatIsoDate(createDefaultRange().from));
  const [dateTo, setDateTo] = useState<string>(formatIsoDate(createDefaultRange().to));
  const [recordAccess, setRecordAccess] = useState<Awaited<ReturnType<typeof fetchCurrentUserRecordAccessContext>> | null>(null);
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [quickTaskLoading, setQuickTaskLoading] = useState(false);
  const [quickTask, setQuickTask] = useState<any | null>(null);
  const [assigneeUserOptions, setAssigneeUserOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [assigneeRoleOptions, setAssigneeRoleOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [assigneeNameMap, setAssigneeNameMap] = useState<Record<string, string>>({});
  const [roleNameMap, setRoleNameMap] = useState<Record<string, string>>({});

  const loadTasks = useCallback(async () => {
    if (!tasksModule) {
      setCanViewWidget(false);
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const access = await fetchCurrentUserRecordAccessContext(supabase);
      const modulePerm = access.permissions?.tasks || {};
      const moduleScope = String(modulePerm.record_scope || (modulePerm.view === false ? 'own' : 'all'));

      if (modulePerm.view === false) {
        setCanViewWidget(false);
        setRows([]);
        setRecordAccess(access);
        return;
      }

      const { data } = await supabase
        .from('tasks')
        .select(TASK_SELECT_FIELDS)
        .order('updated_at', { ascending: false })
        .limit(1200);

      const scopedRows = (data || []).filter((row: any) =>
        canAccessAssignedRecord(row, access.userId, access.roleId, moduleScope as any, {
          currentOrgId: access.orgId,
          allowedRoleIds: access.allowedRoleIds,
          allowedUserIds: access.allowedUserIds,
        })
      ) as TaskCalendarRow[];

      setRows(scopedRows);
      setCanViewWidget(true);
      setCanViewAll(moduleScope === 'all');
      setRecordAccess(access);
      setTaskView(moduleScope === 'all' ? 'all' : 'mine');
    } catch {
      setCanViewWidget(false);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  React.useEffect(() => {
    const now = createDateAtMidday(new Date());
    if (rangeType === 'week') {
      setDateFrom(formatIsoDate(startOfWeek(now)));
      setDateTo(formatIsoDate(endOfWeek(now)));
      return;
    }
    if (rangeType === 'month') {
      setDateFrom(formatIsoDate(startOfMonth(now)));
      setDateTo(formatIsoDate(endOfMonth(now)));
    }
  }, [rangeType]);

  const taskTypeOptions = useMemo(() => {
    const staticOptions = Array.isArray(taskTypeField?.options) ? taskTypeField!.options : [];
    const map = new Map<string, { label: string; value: string }>();
    staticOptions.forEach((item: any) => {
      const value = String(item?.value || '').trim();
      if (!value) return;
      map.set(value, { value, label: String(item?.label || value) });
    });
    rows.forEach((row) => {
      const value = String(row?.task_type || '').trim();
      if (!value || map.has(value)) return;
      map.set(value, { value, label: value });
    });
    return [{ value: 'all', label: 'همه نوع‌ها' }, ...Array.from(map.values())];
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!recordAccess) return [];
    const fromValue = String(dateFrom || '').trim();
    const toValue = String(dateTo || '').trim();
    const fromMs = fromValue ? new Date(`${fromValue}T00:00:00`).getTime() : null;
    const toMs = toValue ? new Date(`${toValue}T23:59:59`).getTime() : null;

    return rows.filter((row) => {
      if (taskView === 'mine') {
        const isMine = canAccessAssignedRecord(row as any, recordAccess.userId, recordAccess.roleId, 'own', {
          currentOrgId: recordAccess.orgId,
          allowedRoleIds: recordAccess.allowedRoleIds,
          allowedUserIds: recordAccess.allowedUserIds,
        });
        if (!isMine) return false;
      }

      if (taskTypeFilter !== 'all' && String(row?.task_type || '') !== taskTypeFilter) {
        return false;
      }

      const parsed = parseDateValue((row as any)?.[selectedDateField]);
      if (!parsed) return false;
      const rowMs = parsed.toDate().getTime();
      if (Number.isFinite(fromMs as number) && rowMs < (fromMs as number)) return false;
      if (Number.isFinite(toMs as number) && rowMs > (toMs as number)) return false;
      return true;
    });
  }, [dateFrom, dateTo, recordAccess, rows, selectedDateField, taskTypeFilter, taskView]);

  const resolveAssigneeDisplayLabel = useCallback(
    (task: any) => {
      const assigneeType = String(task?.assignee_type || '').trim().toLowerCase();
      const resolvedAssigneeId = String(getResolvedAssigneeId(task) || '').trim();
      if (!resolvedAssigneeId) return 'تعیین نشده';
      if (assigneeType === 'role') return roleNameMap[resolvedAssigneeId] || resolvedAssigneeId;
      return assigneeNameMap[resolvedAssigneeId] || resolvedAssigneeId;
    },
    [assigneeNameMap, roleNameMap]
  );

  const openQuickTaskModal = useCallback(
    async (taskId: string) => {
      const normalizedTaskId = String(taskId || '').trim();
      if (!normalizedTaskId) return;
      setQuickTaskOpen(true);
      setQuickTaskLoading(true);
      try {
        const [{ data: taskRow }, directory] = await Promise.all([
          supabase.from('tasks').select('*').eq('id', normalizedTaskId).maybeSingle(),
          fetchAssigneeDirectory(supabase),
        ]);
        setQuickTask(taskRow || null);
        setAssigneeUserOptions(
          (directory.users || [])
            .map((user) => ({
              value: String(user?.id || ''),
              label: String(user?.display_name || user?.full_name || user?.id || '').trim(),
            }))
            .filter((item) => item.value)
        );
        setAssigneeRoleOptions(
          (directory.roles || [])
            .map((role) => ({
              value: String(role?.id || ''),
              label: String(role?.title || role?.id || '').trim(),
            }))
            .filter((item) => item.value)
        );
        setAssigneeNameMap(
          (directory.users || []).reduce<Record<string, string>>((acc, user) => {
            const id = String(user?.id || '').trim();
            if (!id) return acc;
            acc[id] = String(user?.display_name || user?.full_name || user?.id || '').trim();
            return acc;
          }, {})
        );
        setRoleNameMap(
          (directory.roles || []).reduce<Record<string, string>>((acc, role) => {
            const id = String(role?.id || '').trim();
            if (!id) return acc;
            acc[id] = String(role?.title || role?.id || '').trim();
            return acc;
          }, {})
        );
      } catch {
        message.error('خواندن اطلاعات فعالیت ناموفق بود.');
        setQuickTask(null);
      } finally {
        setQuickTaskLoading(false);
      }
    },
    [message]
  );
  void openQuickTaskModal;

  const handleCalendarNavigate = useCallback(
    (path: string) => {
      const match = String(path || '').match(/^\/tasks\/([^/]+)$/);
      if (match?.[1]) {
        openTaskProcessModal({ taskId: match[1] });
        return;
      }
      navigate(path);
    },
    [navigate]
  );

  if (!tasksModule) return null;

  if (!canViewWidget) {
    return (
      <Card className="shadow-sm">
        <Empty description="دسترسی به ویجت تقویم فعالیت‌ها ندارید" />
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarOutlined className="text-[rgba(var(--brand-600-rgb),1)]" />
          <div className="text-base font-bold">تقویم فعالیت‌ها</div>
        </div>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadTasks()} loading={loading}>
          بروزرسانی
        </Button>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="small"
            value={taskView}
            onChange={(value) => setTaskView(value as TaskViewKey)}
            options={
              canViewAll
                ? [
                    { label: 'همه فعالیت‌ها', value: 'all' },
                    { label: 'فعالیت‌های من', value: 'mine' },
                  ]
                : [{ label: 'فعالیت‌های من', value: 'mine' }]
            }
          />
          <Select
            size="small"
            className="min-w-[180px]"
            value={taskTypeFilter}
            onChange={(value) => setTaskTypeFilter(String(value))}
            options={taskTypeOptions}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Segmented
            size="small"
            value={rangeType}
            onChange={(value) => setRangeType(value as 'week' | 'month' | 'custom')}
            options={[
              { label: 'این هفته', value: 'week' },
              { label: 'این ماه', value: 'month' },
              { label: 'سفارشی', value: 'custom' },
            ]}
          />
          <PersianDatePicker
            value={dateFrom}
            onChange={(value) => {
              setRangeType('custom');
              setDateFrom(String(value || ''));
            }}
            type="DATE"
          />
          <PersianDatePicker
            value={dateTo}
            onChange={(value) => {
              setRangeType('custom');
              setDateTo(String(value || ''));
            }}
            type="DATE"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-[460px] items-center justify-center">
          <Spin />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="flex h-[460px] items-center justify-center">
          <Empty description="فعالیتی در بازه انتخاب‌شده پیدا نشد" />
        </div>
      ) : (
        <div className="h-[460px]">
          <ModuleCalendarView
            moduleId="tasks"
            moduleConfig={tasksModule}
            data={filteredRows}
            dateFields={taskDateFields}
            dateFieldKey={selectedDateField}
            onDateFieldChange={(fieldKey) => setSelectedDateField(String(fieldKey || 'due_date'))}
            navigate={handleCalendarNavigate}
          />
        </div>
      )}

      <Modal
        open={quickTaskOpen}
        onCancel={() => {
          setQuickTaskOpen(false);
          setQuickTask(null);
        }}
        footer={null}
        width={420}
        destroyOnHidden
        title="مشاهده سریع فعالیت"
      >
        {quickTaskLoading ? (
          <div className="flex h-[220px] items-center justify-center"><Spin /></div>
        ) : quickTask ? (
          <TaskQuickPopoverContent
            task={quickTask}
            readOnly
            allowReportEditInReadOnly={false}
            currentAssigneeCombo={(() => {
              const assigneeType = String(quickTask?.assignee_type || (quickTask?.assignee_role_id ? 'role' : 'user')).trim().toLowerCase();
              const resolvedAssigneeId = String(getResolvedAssigneeId(quickTask) || '').trim();
              if (!resolvedAssigneeId) return undefined;
              return assigneeType === 'role' ? `role:${resolvedAssigneeId}` : `user:${resolvedAssigneeId}`;
            })()}
            assigneeUserOptions={assigneeUserOptions}
            assigneeRoleOptions={assigneeRoleOptions}
            statusOptions={statusOptions}
            statusValue={String(quickTask?.status || '')}
            canEditTaskStatus={false}
            taskTypeValue={String(quickTask?.task_type || '')}
            isProductionOrder={String(quickTask?.related_to_module || '') === 'production_orders'}
            producedQty={Number(quickTask?.produced_qty || 0)}
            producedQtyDisabled
            description={String(quickTask?.description || '')}
            sortOrder={quickTask?.sort_order ?? null}
            assigneeType={String(quickTask?.assignee_type || (quickTask?.assignee_role_id ? 'role' : 'user') || '')}
            assigneeDisplayLabel={resolveAssigneeDisplayLabel(quickTask)}
            hasWage={quickTask?.wage !== null && quickTask?.wage !== undefined && quickTask?.wage !== ''}
            wageLabel={quickTask?.wage ? formatPersianPrice(Number(quickTask.wage || 0), true) : null}
            hasWeight={quickTask?.weight !== null && quickTask?.weight !== undefined && quickTask?.weight !== ''}
            weightLabel={quickTask?.weight ? String(quickTask.weight) : null}
            dueDateLabel={quickTask?.due_date ? safeJalaliFormat(quickTask.due_date, 'YYYY/MM/DD HH:mm') : null}
            reportDraft={String(quickTask?.task_report || '')}
            supportsHandover={false}
          />
        ) : (
          <Empty description="فعالیتی برای نمایش پیدا نشد" />
        )}
      </Modal>
    </Card>
  );
};

export default TaskCalendarWidget;
