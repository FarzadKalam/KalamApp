import React, { useCallback, useMemo, useState } from 'react';
import { Button, Card, Empty, Segmented, Select, Spin } from 'antd';
import { CalendarOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { MODULES } from '../../moduleRegistry';
import ModuleCalendarView from '../moduleList/CalendarView';
import { FieldType } from '../../types';
import { fetchCurrentUserRecordAccessContext } from '../../utils/permissions';
import { supabase } from '../../supabaseClient';
import PersianDatePicker from '../PersianDatePicker';
import { openTaskProcessModal } from '../../utils/taskProcessModalEvents';
import { fetchDynamicOptionsByCategory } from '../../utils/referenceData';
import { getMergedTaskTypeOptions } from '../../utils/taskMeta';

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
const TASK_QUERY_LIMIT = 240;

const tasksModule = MODULES.tasks;

const taskDateFields = (tasksModule?.fields || []).filter((field) =>
  ['start_date', 'due_date', 'completed_at'].includes(String(field?.key || '')) &&
  (field.type === FieldType.DATE || field.type === FieldType.DATETIME)
);

const taskTypeField = (tasksModule?.fields || []).find((field) => String(field?.key || '') === 'task_type');

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

const mergeTaskRowsById = (rows: any[]) => {
  const map = new Map<string, TaskCalendarRow>();
  (rows || []).forEach((row) => {
    const rowId = String(row?.id || '').trim();
    if (!rowId) return;
    map.set(rowId, row as TaskCalendarRow);
  });
  return Array.from(map.values());
};

type TaskCalendarWidgetProps = {
  prefetchedTasks?: any[];
};

const TaskCalendarWidget: React.FC<TaskCalendarWidgetProps> = ({ prefetchedTasks }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!prefetchedTasks || prefetchedTasks.length === 0);
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
  const [allTaskTypeOptions, setAllTaskTypeOptions] = useState<Array<{ label: string; value: string }>>([]);
  const initialLoadDoneRef = React.useRef(false);
  const selectedDateFieldMeta = useMemo(
    () => taskDateFields.find((field) => String(field?.key || '') === selectedDateField) || null,
    [selectedDateField]
  );

  const loadTasks = useCallback(async () => {
    if (!tasksModule) {
      setCanViewWidget(false);
      setRows([]);
      setLoading(false);
      return;
    }

    const isInitialLoad = !initialLoadDoneRef.current;
    initialLoadDoneRef.current = true;

    if (isInitialLoad && prefetchedTasks && prefetchedTasks.length > 0) {
      try {
        const access = await fetchCurrentUserRecordAccessContext(supabase);
        const modulePerm = access.permissions?.tasks || {};
        if (modulePerm.view !== false) {
          const normalizedDateField = String(selectedDateField || 'due_date').trim() || 'due_date';
          const fromValue = String(dateFrom || '').trim();
          const toValue = String(dateTo || '').trim();
          const usesDateTimeRange = selectedDateFieldMeta?.type === FieldType.DATETIME || normalizedDateField === 'completed_at';
          const filtered = (prefetchedTasks as TaskCalendarRow[]).filter((row) => {
            const fieldVal = String((row as any)[normalizedDateField] || '').trim();
            if (!fieldVal) return true;
            const compareVal = usesDateTimeRange ? fieldVal.slice(0, 10) : fieldVal;
            if (fromValue && compareVal < fromValue) return false;
            if (toValue && compareVal > toValue) return false;
            return true;
          });
          setRows(filtered);
          setCanViewWidget(true);
          setCanViewAll(String(modulePerm.record_scope || 'all') === 'all');
          setRecordAccess(access);
          setLoading(false);
          return;
        }
      } catch {
        // fall through to normal fetch
      }
    }

    setLoading(true);
    try {
      const access = await fetchCurrentUserRecordAccessContext(supabase);
      const modulePerm = access.permissions?.tasks || {};
      const moduleScope = String(modulePerm.record_scope || (modulePerm.view === false ? 'own' : 'all'));
      const effectiveTaskView: TaskViewKey = moduleScope === 'all' ? taskView : 'mine';
      const normalizedDateField = String(selectedDateField || 'due_date').trim() || 'due_date';
      const fromValue = String(dateFrom || '').trim();
      const toValue = String(dateTo || '').trim();
      const usesDateTimeRange = selectedDateFieldMeta?.type === FieldType.DATETIME || normalizedDateField === 'completed_at';

      if (modulePerm.view === false) {
        setCanViewWidget(false);
        setRows([]);
        setRecordAccess(access);
        return;
      }

      const applySharedFilters = (query: any) => {
        let next = query
          .neq('status', 'canceled')
          .order(normalizedDateField, { ascending: false, nullsFirst: false })
          .order('updated_at', { ascending: false })
          .limit(TASK_QUERY_LIMIT);
        if (fromValue) {
          next = next.gte(normalizedDateField, usesDateTimeRange ? `${fromValue}T00:00:00.000` : fromValue);
        }
        if (toValue) {
          next = next.lte(normalizedDateField, usesDateTimeRange ? `${toValue}T23:59:59.999` : toValue);
        }
        return next;
      };

      const buildTasksQuery = () =>
        applySharedFilters(
          supabase
            .from('tasks')
            .select(TASK_SELECT_FIELDS)
        );

      let nextRows: TaskCalendarRow[] = [];
      if (effectiveTaskView === 'all') {
        const { data, error } = await buildTasksQuery();
        if (error) throw error;
        nextRows = (data || []) as TaskCalendarRow[];
      } else {
        const userId = String(access.userId || '').trim();
        const roleId = String(access.roleId || '').trim();
        const typedRoleQuery = roleId
          ? buildTasksQuery().eq('assignee_type', 'role').eq('assignee_role_id', roleId)
          : Promise.resolve({ data: [] as any[], error: null });
        const [typedUserResult, typedRoleResult] = await Promise.all([
          buildTasksQuery().eq('assignee_type', 'user').eq('assignee_id', userId),
          typedRoleQuery,
        ]);

        const typedQueryFailed = [typedUserResult.error, typedRoleResult.error].some((error) => {
          const text = String(error?.message || error?.details || '').toLowerCase();
          return Boolean(error) && !text.includes('assignee_');
        });

        if (typedQueryFailed) {
          if (typedUserResult.error) throw typedUserResult.error;
          if (typedRoleResult.error) throw typedRoleResult.error;
        }

        if (!typedUserResult.error && !typedRoleResult.error) {
          nextRows = mergeTaskRowsById([...(typedUserResult.data || []), ...(typedRoleResult.data || [])]);
        } else {
          const [legacyUserResult, legacyRoleResult] = await Promise.all([
            buildTasksQuery().eq('assignee_id', userId),
            roleId ? buildTasksQuery().eq('assignee_id', roleId) : Promise.resolve({ data: [] as any[], error: null }),
          ]);
          if (legacyUserResult.error) throw legacyUserResult.error;
          if (legacyRoleResult.error) throw legacyRoleResult.error;
          nextRows = mergeTaskRowsById([...(legacyUserResult.data || []), ...(legacyRoleResult.data || [])]);
        }
      }

      setRows(nextRows);
      setCanViewWidget(true);
      setCanViewAll(moduleScope === 'all');
      setRecordAccess(access);
      if (moduleScope !== 'all' && taskView !== 'mine') {
        setTaskView('mine');
      }
    } catch {
      setCanViewWidget(false);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, prefetchedTasks, selectedDateField, selectedDateFieldMeta?.type, taskView]);

  React.useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const options = taskTypeField?.dynamicOptionsCategory
          ? await fetchDynamicOptionsByCategory(supabase, taskTypeField.dynamicOptionsCategory)
          : getMergedTaskTypeOptions([]);
        if (!cancelled) {
          setAllTaskTypeOptions(options);
        }
      } catch {
        if (!cancelled) {
          setAllTaskTypeOptions(getMergedTaskTypeOptions([]));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const map = new Map<string, { label: string; value: string }>();
    allTaskTypeOptions.forEach((item: any) => {
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
  }, [allTaskTypeOptions, rows]);

  const filteredRows = useMemo(() => {
    if (!recordAccess) return [];

    return rows.filter((row) => {
      if (taskTypeFilter !== 'all' && String(row?.task_type || '') !== taskTypeFilter) {
        return false;
      }
      return true;
    });
  }, [recordAccess, rows, taskTypeFilter]);

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
            fieldOptions={taskTypeField?.key ? { [taskTypeField.key]: allTaskTypeOptions } : {}}
          />
        </div>
      )}

    </Card>
  );
};

export default TaskCalendarWidget;
