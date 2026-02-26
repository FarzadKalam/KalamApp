import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import { ArrowRightOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import { isTaskDoneStatus, normalizeTaskStatus } from '../utils/taskCompletion';
import { MODULES } from '../moduleRegistry';

type TaskRecord = {
  id: string;
  name?: string | null;
  status?: string | null;
  assignee_id?: string | null;
  assignee_type?: string | null;
  due_date?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  wage?: number | string | null;
  produced_qty?: number | string | null;
  spent_hours?: number | string | null;
  estimated_hours?: number | string | null;
  related_to_module?: string | null;
  related_production_order?: string | null;
  production_line_id?: string | null;
};

type ProfileRecord = {
  id: string;
  full_name?: string | null;
  role?: string | null;
  base_salary?: number | string | null;
  overtime_rate?: number | string | null;
  late_penalty_rate?: number | string | null;
  early_bonus_rate?: number | string | null;
  production_bonus_rate?: number | string | null;
};

type TaskPerformanceCode =
  | 'early'
  | 'on_time'
  | 'late'
  | 'done_without_timestamp'
  | 'done_no_due'
  | 'open_overdue'
  | 'open_in_time'
  | 'open_no_due'
  | 'canceled';

type TaskDetailRow = {
  key: string;
  taskId: string;
  name: string;
  status: string;
  relatedModule: string;
  dueAt: string | null;
  completedAt: string | null;
  producedQty: number;
  wageBase: number;
  wageMultiplier: number;
  wageFinal: number;
  performanceCode: TaskPerformanceCode;
  performanceLabel: string;
  performanceColor: string;
  lateHours: number;
  earlyHours: number;
};

type EmployeeSummaryRow = {
  key: string;
  profile: ProfileRecord;
  name: string;
  totalTasks: number;
  doneCount: number;
  openCount: number;
  canceledCount: number;
  overdueOpenCount: number;
  doneEarlyCount: number;
  doneOnTimeCount: number;
  doneLateCount: number;
  producedQty: number;
  taskWageTotal: number;
  overtimeHours: number;
  lateHours: number;
  bonusTotal: number;
  penaltyTotal: number;
  baseSalary: number;
  netPayable: number;
  detailRows: TaskDetailRow[];
};

type PayrollFormValues = {
  base_salary: number;
  overtime_rate: number;
  late_penalty_rate: number;
  early_bonus_rate: number;
  production_bonus_rate: number;
};

const PERFORMANCE_TAG_META: Record<TaskPerformanceCode, { label: string; color: string }> = {
  early: { label: 'تعجیل', color: 'green' },
  on_time: { label: 'به موقع', color: 'blue' },
  late: { label: 'دیرکرد', color: 'red' },
  done_without_timestamp: { label: 'تکمیل شده (زمان نامشخص)', color: 'gold' },
  done_no_due: { label: 'تکمیل شده (بدون موعد)', color: 'cyan' },
  open_overdue: { label: 'انجام نشده (دیرکرد)', color: 'red' },
  open_in_time: { label: 'انجام نشده (در مهلت)', color: 'orange' },
  open_no_due: { label: 'انجام نشده (بدون موعد)', color: 'default' },
  canceled: { label: 'لغو شده', color: 'default' },
};

const TASK_STATUS_FA: Record<string, string> = {
  todo: 'انجام نشده',
  pending: 'در انتظار',
  in_progress: 'در حال انجام',
  review: 'بازبینی',
  done: 'تکمیل شده',
  completed: 'تکمیل شده',
  canceled: 'لغو شده',
};

const RELATED_MODULE_FA: Record<string, string> = {
  production_orders: 'تولید',
  production_boms: 'شناسنامه‌های تولید',
  production_group_orders: 'سفارشات گروهی تولید',
  customers: 'مشتریان',
  products: 'محصولات',
  suppliers: 'تامین کنندگان',
  invoices: 'فاکتورهای فروش',
  purchase_invoices: 'فاکتورهای خرید',
  tasks: 'وظایف',
};

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (value: string | null | undefined): dayjs.Dayjs | null => {
  if (!value) return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
};

const resolveDueDate = (task: TaskRecord): string | null => task.due_date || task.due_at || null;

const isInRange = (value: dayjs.Dayjs | null, start: dayjs.Dayjs, end: dayjs.Dayjs) => {
  if (!value) return false;
  const t = value.valueOf();
  return t >= start.valueOf() && t <= end.valueOf();
};

const parseDateParam = (rawDate: string | null): Dayjs | null => {
  if (!rawDate) return null;
  const parsed = dayjs(rawDate);
  return parsed.isValid() ? parsed : null;
};

const getInitialRangeFromQuery = (): [Dayjs, Dayjs] => {
  const query = new URLSearchParams(window.location.search);
  const from = parseDateParam(query.get('from'));
  const to = parseDateParam(query.get('to'));
  if (from && to && from.valueOf() <= to.valueOf()) {
    return [from.startOf('day'), to.endOf('day')];
  }
  return [dayjs().startOf('month').startOf('day'), dayjs().endOf('month').endOf('day')];
};

const toStatusLabel = (rawStatus: string | null | undefined) => {
  const key = String(rawStatus || '').trim().toLowerCase();
  return TASK_STATUS_FA[key] || rawStatus || '-';
};

const toModuleLabel = (rawModule: string | null | undefined) => {
  const key = String(rawModule || '').trim();
  if (!key) return '-';
  const fromMap = RELATED_MODULE_FA[key];
  if (fromMap) return fromMap;
  const fromRegistry = MODULES[key]?.titles?.fa;
  return fromRegistry || key;
};

const evaluateTaskPerformance = (task: TaskRecord, now: dayjs.Dayjs) => {
  const status = normalizeTaskStatus(task.status);
  const due = parseDate(resolveDueDate(task));
  const completed = parseDate(task.completed_at || null);
  const done = isTaskDoneStatus(status);
  const canceled = status === 'canceled';

  if (canceled) {
    return { code: 'canceled' as const, lateHours: 0, earlyHours: 0 };
  }

  if (done) {
    if (!due) {
      return { code: 'done_no_due' as const, lateHours: 0, earlyHours: 0 };
    }
    if (!completed) {
      return { code: 'done_without_timestamp' as const, lateHours: 0, earlyHours: 0 };
    }

    const diffHours = completed.diff(due, 'minute') / 60;
    if (diffHours < -0.01) {
      return { code: 'early' as const, lateHours: 0, earlyHours: Math.abs(diffHours) };
    }
    if (diffHours <= 0.01) {
      return { code: 'on_time' as const, lateHours: 0, earlyHours: 0 };
    }
    return { code: 'late' as const, lateHours: diffHours, earlyHours: 0 };
  }

  if (!due) {
    return { code: 'open_no_due' as const, lateHours: 0, earlyHours: 0 };
  }

  if (now.valueOf() > due.valueOf()) {
    return { code: 'open_overdue' as const, lateHours: now.diff(due, 'minute') / 60, earlyHours: 0 };
  }

  return { code: 'open_in_time' as const, lateHours: 0, earlyHours: 0 };
};

const isTaskRelevantForMonth = (task: TaskRecord, monthStart: dayjs.Dayjs, monthEnd: dayjs.Dayjs) => {
  const created = parseDate(task.created_at || null);
  const due = parseDate(resolveDueDate(task));
  const completed = parseDate(task.completed_at || null);
  const status = normalizeTaskStatus(task.status);
  const done = isTaskDoneStatus(status);
  const canceled = status === 'canceled';

  if (isInRange(created, monthStart, monthEnd)) return true;
  if (isInRange(due, monthStart, monthEnd)) return true;
  if (isInRange(completed, monthStart, monthEnd)) return true;
  if (!done && !canceled && due && due.valueOf() <= monthEnd.valueOf()) return true;

  return false;
};

const isTaskEligibleForPayroll = (task: TaskRecord, monthStart: dayjs.Dayjs, monthEnd: dayjs.Dayjs) => {
  if (!isTaskDoneStatus(task.status)) return false;

  const completed = parseDate(task.completed_at || null);
  if (isInRange(completed, monthStart, monthEnd)) return true;
  if (completed) return false;

  const due = parseDate(resolveDueDate(task));
  if (isInRange(due, monthStart, monthEnd)) return true;

  const created = parseDate(task.created_at || null);
  return isInRange(created, monthStart, monthEnd);
};

const getProductionWageMultiplier = (
  task: TaskRecord,
  lineQuantityById: Record<string, number>,
  orderQuantityById: Record<string, number>,
) => {
  if (String(task.related_to_module || '') !== 'production_orders') return 1;

  const lineId = String(task.production_line_id || '');
  if (lineId && Object.prototype.hasOwnProperty.call(lineQuantityById, lineId)) {
    return lineQuantityById[lineId];
  }

  const orderId = String(task.related_production_order || '');
  if (orderId && Object.prototype.hasOwnProperty.call(orderQuantityById, orderId)) {
    return orderQuantityById[orderId];
  }

  return 1;
};
const buildSummaries = ({
  profiles,
  tasks,
  monthStart,
  monthEnd,
  lineQuantityById,
  orderQuantityById,
}: {
  profiles: ProfileRecord[];
  tasks: TaskRecord[];
  monthStart: dayjs.Dayjs;
  monthEnd: dayjs.Dayjs;
  lineQuantityById: Record<string, number>;
  orderQuantityById: Record<string, number>;
}) => {
  const now = dayjs();
  const tasksByAssignee = new Map<string, TaskRecord[]>();

  tasks.forEach((task) => {
    const assigneeId = String(task.assignee_id || '');
    if (!assigneeId) return;
    if (!isTaskRelevantForMonth(task, monthStart, monthEnd)) return;
    const list = tasksByAssignee.get(assigneeId) || [];
    list.push(task);
    tasksByAssignee.set(assigneeId, list);
  });

  const rows = profiles.map((profile) => {
    const assigneeTasks = tasksByAssignee.get(String(profile.id)) || [];
    const detailRows: TaskDetailRow[] = assigneeTasks.map((task) => {
      const performance = evaluateTaskPerformance(task, now);
      const performanceMeta = PERFORMANCE_TAG_META[performance.code];
      const wageBase = toNumber(task.wage);
      const wageMultiplier = getProductionWageMultiplier(task, lineQuantityById, orderQuantityById);
      const wageFinal = wageBase * wageMultiplier;

      return {
        key: String(task.id),
        taskId: String(task.id),
        name: String(task.name || 'بدون عنوان'),
        status: String(task.status || '-'),
        relatedModule: String(task.related_to_module || '-'),
        dueAt: resolveDueDate(task),
        completedAt: task.completed_at || null,
        producedQty: toNumber(task.produced_qty),
        wageBase,
        wageMultiplier,
        wageFinal,
        performanceCode: performance.code,
        performanceLabel: performanceMeta.label,
        performanceColor: performanceMeta.color,
        lateHours: Math.max(0, performance.lateHours),
        earlyHours: Math.max(0, performance.earlyHours),
      };
    });

    const sortedDetailRows = [...detailRows].sort((a, b) => {
      const aTime = parseDate(a.completedAt || a.dueAt || null)?.valueOf() || 0;
      const bTime = parseDate(b.completedAt || b.dueAt || null)?.valueOf() || 0;
      return bTime - aTime;
    });

    const totalTasks = sortedDetailRows.length;
    const doneRows = sortedDetailRows.filter((row) => isTaskDoneStatus(row.status));
    const canceledRows = sortedDetailRows.filter((row) => normalizeTaskStatus(row.status) === 'canceled');
    const openRows = sortedDetailRows.filter(
      (row) => !isTaskDoneStatus(row.status) && normalizeTaskStatus(row.status) !== 'canceled',
    );
    const overdueOpenRows = sortedDetailRows.filter((row) => row.performanceCode === 'open_overdue');
    const doneEarlyRows = sortedDetailRows.filter((row) => row.performanceCode === 'early');
    const doneOnTimeRows = sortedDetailRows.filter((row) => row.performanceCode === 'on_time');
    const doneLateRows = sortedDetailRows.filter((row) => row.performanceCode === 'late');

    const payrollEligibleTaskIds = new Set(
      assigneeTasks
        .filter((task) => isTaskEligibleForPayroll(task, monthStart, monthEnd))
        .map((task) => String(task.id)),
    );
    const payrollDetailRows = sortedDetailRows.filter((row) => payrollEligibleTaskIds.has(String(row.taskId)));

    const taskWageTotal = payrollDetailRows.reduce((sum, row) => sum + row.wageFinal, 0);
    const producedQty = payrollDetailRows.reduce((sum, row) => sum + row.producedQty, 0);
    const overtimeHours = assigneeTasks
      .filter((task) => payrollEligibleTaskIds.has(String(task.id)))
      .reduce((sum, task) => {
        const spent = toNumber(task.spent_hours);
        const estimated = toNumber(task.estimated_hours);
        return sum + Math.max(0, spent - estimated);
      }, 0);
    const lateHours = payrollDetailRows.reduce((sum, row) => sum + row.lateHours, 0);

    const baseSalary = toNumber(profile.base_salary);
    const overtimeRate = toNumber(profile.overtime_rate);
    const latePenaltyRate = toNumber(profile.late_penalty_rate);
    const earlyBonusRate = toNumber(profile.early_bonus_rate);
    const productionBonusRate = toNumber(profile.production_bonus_rate);
    const earlyCount = payrollDetailRows.filter((row) => row.performanceCode === 'early').length;

    const bonusTotal =
      (overtimeHours * overtimeRate) +
      (earlyCount * earlyBonusRate) +
      (producedQty * productionBonusRate);
    const penaltyTotal = lateHours * latePenaltyRate;
    const netPayable = baseSalary + taskWageTotal + bonusTotal - penaltyTotal;

    return {
      key: String(profile.id),
      profile,
      name: profile.full_name || profile.id,
      totalTasks,
      doneCount: doneRows.length,
      openCount: openRows.length,
      canceledCount: canceledRows.length,
      overdueOpenCount: overdueOpenRows.length,
      doneEarlyCount: doneEarlyRows.length,
      doneOnTimeCount: doneOnTimeRows.length,
      doneLateCount: doneLateRows.length,
      producedQty,
      taskWageTotal,
      overtimeHours,
      lateHours,
      bonusTotal,
      penaltyTotal,
      baseSalary,
      netPayable,
      detailRows: sortedDetailRows,
    } as EmployeeSummaryRow;
  });

  return rows.sort((a, b) => b.netPayable - a.netPayable);
};

const HRPage: React.FC = () => {
  const navigate = useNavigate();
  const { employeeId } = useParams();
  const { message } = App.useApp();
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRange, setSelectedRange] = useState<[Dayjs, Dayjs]>(() => getInitialRangeFromQuery());
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [lineQuantityById, setLineQuantityById] = useState<Record<string, number>>({});
  const [orderQuantityById, setOrderQuantityById] = useState<Record<string, number>>({});
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileRecord | null>(null);
  const [savingProfileConfig, setSavingProfileConfig] = useState(false);
  const [configForm] = Form.useForm<PayrollFormValues>();

  const monthStart = useMemo(() => selectedRange[0].startOf('day'), [selectedRange]);
  const monthEnd = useMemo(() => selectedRange[1].endOf('day'), [selectedRange]);
  const selectedRangeQuery = `from=${monthStart.format('YYYY-MM-DD')}&to=${monthEnd.format('YYYY-MM-DD')}`;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const onDateRangeChange = (values: [Dayjs | null, Dayjs | null] | null) => {
    if (!values || !values[0] || !values[1]) return;
    setSelectedRange([values[0].startOf('day'), values[1].endOf('day')]);
  };

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const [profilesResult, tasksResult] = await Promise.all([
        supabase.from('profiles').select('*').order('full_name', { ascending: true }),
        supabase
          .from('tasks')
          .select('*')
          .or('assignee_type.eq.user,assignee_type.is.null')
          .not('assignee_id', 'is', null)
          .lte('created_at', monthEnd.toISOString())
          .order('created_at', { ascending: false })
          .limit(5000),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (tasksResult.error) throw tasksResult.error;

      const normalizedProfiles = (profilesResult.data || []).map((row: any) => ({
        id: String(row?.id),
        full_name: row?.full_name || null,
        role: row?.role || null,
        base_salary: row?.base_salary ?? 0,
        overtime_rate: row?.overtime_rate ?? 0,
        late_penalty_rate: row?.late_penalty_rate ?? 0,
        early_bonus_rate: row?.early_bonus_rate ?? 0,
        production_bonus_rate: row?.production_bonus_rate ?? 0,
      })) as ProfileRecord[];

      const normalizedTasks = (tasksResult.data || []).map((row: any) => ({
        id: String(row?.id),
        name: row?.name || null,
        status: row?.status || null,
        assignee_id: row?.assignee_id || null,
        assignee_type: row?.assignee_type || null,
        due_date: row?.due_date || null,
        due_at: row?.due_at || null,
        completed_at: row?.completed_at || null,
        created_at: row?.created_at || null,
        wage: row?.wage ?? 0,
        produced_qty: row?.produced_qty ?? 0,
        spent_hours: row?.spent_hours ?? 0,
        estimated_hours: row?.estimated_hours ?? 0,
        related_to_module: row?.related_to_module || null,
        related_production_order: row?.related_production_order || null,
        production_line_id: row?.production_line_id || null,
      })) as TaskRecord[];

      setProfiles(normalizedProfiles);
      setTasks(normalizedTasks);

      const lineIds = Array.from(
        new Set(
          normalizedTasks
            .map((task) => String(task.production_line_id || ''))
            .filter((val) => val.length > 0),
        ),
      );

      const lineResult = lineIds.length
        ? await supabase.from('production_lines').select('id, production_order_id, quantity').in('id', lineIds)
        : { data: [], error: null };
      if ((lineResult as any).error) throw (lineResult as any).error;

      const lineMap: Record<string, number> = {};
      const orderIdPool = new Set<string>();
      ((lineResult as any).data || []).forEach((row: any) => {
        const id = String(row?.id || '');
        if (!id) return;
        lineMap[id] = toNumber(row?.quantity);
        if (row?.production_order_id) orderIdPool.add(String(row.production_order_id));
      });

      normalizedTasks.forEach((task) => {
        const orderId = String(task.related_production_order || '');
        if (orderId) orderIdPool.add(orderId);
      });

      const orderIds = Array.from(orderIdPool);
      const orderResult = orderIds.length
        ? await supabase.from('production_orders').select('id, quantity').in('id', orderIds)
        : { data: [], error: null };
      if ((orderResult as any).error) throw (orderResult as any).error;

      const orderMap: Record<string, number> = {};
      ((orderResult as any).data || []).forEach((row: any) => {
        const id = String(row?.id || '');
        if (!id) return;
        orderMap[id] = toNumber(row?.quantity);
      });

      setLineQuantityById(lineMap);
      setOrderQuantityById(orderMap);

      setSelectedEmployeeIds((prev) => {
        if (prev.length > 0) return prev;
        return normalizedProfiles.map((profile) => profile.id);
      });
    } catch (err: any) {
      message.error(`خطا در دریافت داده‌های منابع انسانی: ${err?.message || err}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [message, monthEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const allSummaries = useMemo(() => {
    return buildSummaries({
      profiles,
      tasks,
      monthStart,
      monthEnd,
      lineQuantityById,
      orderQuantityById,
    });
  }, [lineQuantityById, monthEnd, monthStart, orderQuantityById, profiles, tasks]);

  const employeeOptions = useMemo(() => {
    return profiles.map((profile) => ({
      label: profile.full_name || profile.id,
      value: profile.id,
    }));
  }, [profiles]);

  const visibleSummaries = useMemo(() => {
    if (!selectedEmployeeIds.length) return allSummaries;
    const selectedSet = new Set(selectedEmployeeIds.map((id) => String(id)));
    return allSummaries.filter((row) => selectedSet.has(String(row.profile.id)));
  }, [allSummaries, selectedEmployeeIds]);

  const selectedEmployeeSummary = useMemo(() => {
    if (!employeeId) return null;
    return allSummaries.find((row) => String(row.profile.id) === String(employeeId)) || null;
  }, [allSummaries, employeeId]);

  const totals = useMemo(() => {
    return visibleSummaries.reduce(
      (acc, row) => ({
        employees: acc.employees + 1,
        totalTasks: acc.totalTasks + row.totalTasks,
        done: acc.done + row.doneCount,
        overdue: acc.overdue + row.overdueOpenCount,
        payable: acc.payable + row.netPayable,
      }),
      { employees: 0, totalTasks: 0, done: 0, overdue: 0, payable: 0 },
    );
  }, [visibleSummaries]);

  const openConfigModal = (profile: ProfileRecord) => {
    setEditingProfile(profile);
    configForm.setFieldsValue({
      base_salary: toNumber(profile.base_salary),
      overtime_rate: toNumber(profile.overtime_rate),
      late_penalty_rate: toNumber(profile.late_penalty_rate),
      early_bonus_rate: toNumber(profile.early_bonus_rate),
      production_bonus_rate: toNumber(profile.production_bonus_rate),
    });
    setConfigModalOpen(true);
  };

  const handleSavePayrollConfig = async () => {
    if (!editingProfile?.id) return;
    try {
      const values = await configForm.validateFields();
      setSavingProfileConfig(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          base_salary: toNumber(values.base_salary),
          overtime_rate: toNumber(values.overtime_rate),
          late_penalty_rate: toNumber(values.late_penalty_rate),
          early_bonus_rate: toNumber(values.early_bonus_rate),
          production_bonus_rate: toNumber(values.production_bonus_rate),
        })
        .eq('id', editingProfile.id);
      if (error) throw error;
      message.success('تنظیمات حقوق ذخیره شد.');
      setConfigModalOpen(false);
      await fetchData(true);
    } catch (err: any) {
      message.error(`ذخیره تنظیمات ناموفق بود: ${err?.message || err}`);
    } finally {
      setSavingProfileConfig(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 h-[calc(100vh-120px)] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  const goToEmployeeDetails = (profileId: string) => {
    navigate(`/hr/${profileId}?${selectedRangeQuery}`);
  };

  const renderSummaryMobileCard = (row: EmployeeSummaryRow) => (
    <Card
      key={row.key}
      className="mb-3 cursor-pointer"
      onClick={() => goToEmployeeDetails(String(row.profile.id))}
      styles={{ body: { padding: 12 } }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-leather-700">{row.name}</div>
        <Button
          size="small"
          icon={<SettingOutlined />}
          onClick={(event) => {
            event.stopPropagation();
            openConfigModal(row.profile);
          }}
        >
          ضرایب
        </Button>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        <Tag color="blue">کل {toPersianNumber(row.totalTasks)}</Tag>
        <Tag color="green">انجام‌شده {toPersianNumber(row.doneCount)}</Tag>
        <Tag color="red">عقب‌افتاده {toPersianNumber(row.overdueOpenCount)}</Tag>
      </div>
      <div className="text-xs text-gray-600 leading-6">
        <div>پایه: <span className="persian-number">{formatPersianPrice(row.baseSalary)} تومان</span></div>
        <div>کارکرد: <span className="persian-number">{formatPersianPrice(row.taskWageTotal)} تومان</span></div>
        <div className="font-bold text-gray-800">قابل پرداخت: <span className="persian-number">{formatPersianPrice(row.netPayable)} تومان</span></div>
      </div>
    </Card>
  );

  const renderTaskMobileCard = (row: TaskDetailRow) => (
    <Card key={row.key} className="mb-3" styles={{ body: { padding: 12 } }}>
      <div className="mb-1">
        <a href={`/tasks/${row.taskId}`} className="font-bold text-leather-700 hover:underline">
          {row.name}
        </a>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        <Tag>{toModuleLabel(row.relatedModule)}</Tag>
        <Tag>{toStatusLabel(row.status)}</Tag>
        <Tag color={row.performanceColor}>{row.performanceLabel}</Tag>
      </div>
      <div className="text-xs text-gray-600 leading-6">
        <div>موعد: {row.dueAt ? toPersianNumber(safeJalaliFormat(row.dueAt, 'YYYY/MM/DD HH:mm')) : '-'}</div>
        <div>تکمیل: {row.completedAt ? toPersianNumber(safeJalaliFormat(row.completedAt, 'YYYY/MM/DD HH:mm')) : '-'}</div>
        <div>زودتر: <span className="persian-number text-green-700">{toPersianNumber(row.earlyHours.toFixed(1))}</span> ساعت</div>
        <div>دیرتر: <span className="persian-number text-red-700">{toPersianNumber(row.lateHours.toFixed(1))}</span> ساعت</div>
        <div>دستمزد وظیفه: <span className="persian-number">{formatPersianPrice(row.wageBase)} تومان</span></div>
        <div>ضریب تولید: <span className="persian-number">{toPersianNumber(row.wageMultiplier)}</span></div>
        <div className="font-bold text-gray-800">دستمزد نهایی: <span className="persian-number">{formatPersianPrice(row.wageFinal)} تومان</span></div>
      </div>
    </Card>
  );

  const summaryColumns = [
    {
      title: 'نیرو',
      dataIndex: 'name',
      key: 'name',
      render: (_: string, row: EmployeeSummaryRow) => (
        <button
          type="button"
          className="text-leather-700 font-bold hover:underline text-right"
          onClick={(event) => {
            event.stopPropagation();
            goToEmployeeDetails(String(row.profile.id));
          }}
        >
          {row.name}
        </button>
      ),
    },
    {
      title: 'وظایف',
      key: 'task_counts',
      render: (_: unknown, row: EmployeeSummaryRow) => (
        <Space size={4} wrap>
          <Tag color="blue">کل {toPersianNumber(row.totalTasks)}</Tag>
          <Tag color="green">انجام‌شده {toPersianNumber(row.doneCount)}</Tag>
          <Tag color="orange">باز {toPersianNumber(row.openCount)}</Tag>
          <Tag color="red">عقب‌افتاده {toPersianNumber(row.overdueOpenCount)}</Tag>
        </Space>
      ),
    },
    {
      title: 'زمان‌بندی',
      key: 'timing',
      render: (_: unknown, row: EmployeeSummaryRow) => (
        <Space size={4} wrap>
          <Tag color="green">تعجیل {toPersianNumber(row.doneEarlyCount)}</Tag>
          <Tag color="blue">به‌موقع {toPersianNumber(row.doneOnTimeCount)}</Tag>
          <Tag color="red">دیر {toPersianNumber(row.doneLateCount)}</Tag>
        </Space>
      ),
    },
    {
      title: 'حقوق ماه',
      key: 'salary',
      render: (_: unknown, row: EmployeeSummaryRow) => (
        <div className="text-sm space-y-1">
          <div>پایه: <span className="persian-number">{formatPersianPrice(row.baseSalary)} تومان</span></div>
          <div>کارکرد: <span className="persian-number">{formatPersianPrice(row.taskWageTotal)} تومان</span></div>
          <div className="font-black">قابل پرداخت: <span className="persian-number">{formatPersianPrice(row.netPayable)} تومان</span></div>
        </div>
      ),
    },
    {
      title: 'تنظیمات',
      key: 'actions',
      width: 130,
      render: (_: unknown, row: EmployeeSummaryRow) => (
        <Button
          icon={<SettingOutlined />}
          onClick={(event) => {
            event.stopPropagation();
            openConfigModal(row.profile);
          }}
          size="small"
        >
          ضرایب
        </Button>
      ),
    },
  ];

  const detailColumns = [
    {
      title: 'وظیفه',
      dataIndex: 'name',
      key: 'name',
      render: (_: string, row: TaskDetailRow) => (
        <a href={`/tasks/${row.taskId}`} className="font-medium text-leather-700 hover:underline">
          {row.name}
        </a>
      ),
    },
    {
      title: 'بخش',
      dataIndex: 'relatedModule',
      key: 'relatedModule',
      render: (val: string) => <Tag>{toModuleLabel(val)}</Tag>,
    },
    {
      title: 'وضعیت',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => <Tag>{toStatusLabel(val)}</Tag>,
    },
    {
      title: 'ارزیابی',
      dataIndex: 'performanceLabel',
      key: 'performanceLabel',
      render: (_: string, row: TaskDetailRow) => <Tag color={row.performanceColor}>{row.performanceLabel}</Tag>,
    },
    {
      title: 'موعد',
      dataIndex: 'dueAt',
      key: 'dueAt',
      render: (val: string | null) => (
        <span>{val ? toPersianNumber(safeJalaliFormat(val, 'YYYY/MM/DD HH:mm')) : '-'}</span>
      ),
    },
    {
      title: 'تکمیل',
      dataIndex: 'completedAt',
      key: 'completedAt',
      render: (val: string | null) => (
        <span>{val ? toPersianNumber(safeJalaliFormat(val, 'YYYY/MM/DD HH:mm')) : '-'}</span>
      ),
    },
    {
      title: 'زودتر (ساعت)',
      dataIndex: 'earlyHours',
      key: 'earlyHours',
      render: (val: number) => <span className="persian-number text-green-700">{toPersianNumber(val.toFixed(1))}</span>,
    },
    {
      title: 'دیرتر (ساعت)',
      dataIndex: 'lateHours',
      key: 'lateHours',
      render: (val: number) => <span className="persian-number text-red-700">{toPersianNumber(val.toFixed(1))}</span>,
    },
    {
      title: 'دستمزد وظیفه',
      dataIndex: 'wageBase',
      key: 'wageBase',
      render: (val: number) => <span className="persian-number">{formatPersianPrice(val)} تومان</span>,
    },
    {
      title: 'ضریب تولید',
      dataIndex: 'wageMultiplier',
      key: 'wageMultiplier',
      render: (val: number) => <span className="persian-number">{toPersianNumber(val)}</span>,
    },
    {
      title: 'دستمزد نهایی',
      dataIndex: 'wageFinal',
      key: 'wageFinal',
      render: (val: number) => <span className="persian-number font-bold">{formatPersianPrice(val)} تومان</span>,
    },
  ];

  const detailHeader = selectedEmployeeSummary ? (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-2xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2 min-w-0">
            <span className="w-2 h-8 bg-leather-500 rounded-full inline-block shrink-0"></span>
            <span className="truncate">جزئیات عملکرد - {selectedEmployeeSummary.name}</span>
          </h1>
          <Badge
            count={selectedEmployeeSummary.detailRows.length}
            overflowCount={999}
            style={{ backgroundColor: '#f0f0f0', color: '#666', boxShadow: 'none' }}
          />
        </div>
        <Typography.Text type="secondary" className="text-sm">
          بازه گزارش: {toPersianNumber(safeJalaliFormat(monthStart.toISOString(), 'YYYY/MM/DD'))} تا {toPersianNumber(safeJalaliFormat(monthEnd.toISOString(), 'YYYY/MM/DD'))}
        </Typography.Text>
      </div>

      <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-200 dark:border-gray-800 p-2">
        <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-[auto_280px_auto_auto]'}`}>
          <Button
            icon={<ArrowRightOutlined />}
            onClick={() => navigate(`/hr?${selectedRangeQuery}`)}
            className="w-full md:w-auto rounded-xl"
          >
            بازگشت
          </Button>
          <DatePicker.RangePicker
            value={selectedRange}
            onChange={onDateRangeChange}
            allowClear={false}
            className="w-full"
            classNames={{ popup: { root: 'hr-range-popup' } }}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchData(true)}
            loading={refreshing}
            className="w-full rounded-xl"
          >
            بروزرسانی
          </Button>
          <Button
            icon={<SettingOutlined />}
            onClick={() => openConfigModal(selectedEmployeeSummary.profile)}
            className="w-full rounded-xl"
          >
            تنظیم ضرایب
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="p-3 md:p-6 max-w-[1700px] mx-auto pb-20 animate-fadeIn">
      {employeeId ? (
        <>
          {detailHeader}
          {!selectedEmployeeSummary ? (
            <Card>
              <Empty description="نیرو یافت نشد." />
            </Card>
          ) : (
            <>
              <Row gutter={[12, 12]} className="mb-4">
                <Col xs={24} md={6}>
                  <Card>
                    <div className="text-xs text-gray-500 mb-1">تعداد وظایف</div>
                    <div className="text-2xl font-black">{toPersianNumber(selectedEmployeeSummary.totalTasks)}</div>
                  </Card>
                </Col>
                <Col xs={24} md={6}>
                  <Card>
                    <div className="text-xs text-gray-500 mb-1">تعجیل / دیرکرد</div>
                    <div className="text-sm">
                      <div className="text-green-700">تعجیل: {toPersianNumber(selectedEmployeeSummary.doneEarlyCount)}</div>
                      <div className="text-red-700">دیرکرد: {toPersianNumber(selectedEmployeeSummary.doneLateCount)}</div>
                    </div>
                  </Card>
                </Col>
                <Col xs={24} md={6}>
                  <Card>
                    <div className="text-xs text-gray-500 mb-1">جمع دستمزد کارکرد</div>
                    <div className="text-2xl font-black">{formatPersianPrice(selectedEmployeeSummary.taskWageTotal)} تومان</div>
                  </Card>
                </Col>
                <Col xs={24} md={6}>
                  <Card>
                    <div className="text-xs text-gray-500 mb-1">خالص قابل پرداخت</div>
                    <div className="text-2xl font-black">{formatPersianPrice(selectedEmployeeSummary.netPayable)} تومان</div>
                  </Card>
                </Col>
              </Row>

              <Card>
                {selectedEmployeeSummary.detailRows.length === 0 ? (
                  <Empty description="برای این نیرو در این بازه موردی یافت نشد." />
                ) : (
                  isMobile ? (
                    <div>{selectedEmployeeSummary.detailRows.map(renderTaskMobileCard)}</div>
                  ) : (
                    <Table
                      rowKey="key"
                      columns={detailColumns}
                      dataSource={selectedEmployeeSummary.detailRows}
                      pagination={{ pageSize: 30, showSizeChanger: false }}
                      scroll={{ x: 1300 }}
                    />
                  )
                )}
              </Card>
            </>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-2xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2 min-w-0">
                  <span className="w-2 h-8 bg-leather-500 rounded-full inline-block shrink-0"></span>
                  <span className="truncate">منابع انسانی و محاسبه حقوق</span>
                </h1>
                <Badge
                  count={visibleSummaries.length}
                  overflowCount={999}
                  style={{ backgroundColor: '#f0f0f0', color: '#666', boxShadow: 'none' }}
                />
              </div>
              <Typography.Text type="secondary" className="text-sm">
                بازه گزارش: {toPersianNumber(safeJalaliFormat(monthStart.toISOString(), 'YYYY/MM/DD'))} تا {toPersianNumber(safeJalaliFormat(monthEnd.toISOString(), 'YYYY/MM/DD'))}
              </Typography.Text>
            </div>

            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-200 dark:border-gray-800 p-2">
              <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-[280px_minmax(260px,1fr)_auto]'}`}>
                <DatePicker.RangePicker
                  value={selectedRange}
                  onChange={onDateRangeChange}
                  allowClear={false}
                  className="w-full"
                  classNames={{ popup: { root: 'hr-range-popup' } }}
                />
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="فیلتر نیرو"
                  value={selectedEmployeeIds}
                  onChange={(values) => setSelectedEmployeeIds(values as string[])}
                  options={employeeOptions}
                  className="w-full min-w-0"
                />
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => fetchData(true)}
                  loading={refreshing}
                  className="w-full rounded-xl"
                >
                  بروزرسانی
                </Button>
              </div>
            </div>
          </div>

          <Row gutter={[12, 12]} className="mb-4">
            <Col xs={24} md={6}>
              <Card>
                <div className="text-xs text-gray-500 mb-1">تعداد نیرو</div>
                <div className="text-2xl font-black">{toPersianNumber(totals.employees)}</div>
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card>
                <div className="text-xs text-gray-500 mb-1">کل وظایف ماه</div>
                <div className="text-2xl font-black">{toPersianNumber(totals.totalTasks)}</div>
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card>
                <div className="text-xs text-gray-500 mb-1">وظایف انجام‌شده</div>
                <div className="text-2xl font-black text-green-700">{toPersianNumber(totals.done)}</div>
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card>
                <div className="text-xs text-gray-500 mb-1">جمع قابل پرداخت</div>
                <div className="text-2xl font-black">{formatPersianPrice(totals.payable)} تومان</div>
              </Card>
            </Col>
          </Row>

          <Card>
            {visibleSummaries.length === 0 ? (
              <Empty description="برای این بازه داده‌ای یافت نشد." />
            ) : (
              isMobile ? (
                <div>{visibleSummaries.map(renderSummaryMobileCard)}</div>
              ) : (
                <Table
                  rowKey="key"
                  columns={summaryColumns}
                  dataSource={visibleSummaries}
                  pagination={{ pageSize: 20, showSizeChanger: false }}
                  onRow={(row: EmployeeSummaryRow) => ({
                    onClick: () => goToEmployeeDetails(String(row.profile.id)),
                    style: { cursor: 'pointer' },
                  })}
                  scroll={{ x: 1100 }}
                />
              )
            )}
          </Card>
        </>
      )}

      <Modal
        title={`تنظیم ضرایب حقوق - ${editingProfile?.full_name || editingProfile?.id || ''}`}
        open={configModalOpen}
        onCancel={() => setConfigModalOpen(false)}
        onOk={handleSavePayrollConfig}
        confirmLoading={savingProfileConfig}
        okText="ذخیره"
        cancelText="انصراف"
      >
        <Form form={configForm} layout="vertical">
          <Form.Item name="base_salary" label="حقوق پایه ماهانه">
            <InputNumber min={0} className="w-full" />
          </Form.Item>
          <Form.Item name="overtime_rate" label="نرخ هر ساعت اضافه‌کار">
            <InputNumber min={0} className="w-full" />
          </Form.Item>
          <Form.Item name="late_penalty_rate" label="جریمه هر ساعت دیرکرد">
            <InputNumber min={0} className="w-full" />
          </Form.Item>
          <Form.Item name="early_bonus_rate" label="پاداش هر وظیفه با تعجیل">
            <InputNumber min={0} className="w-full" />
          </Form.Item>
          <Form.Item name="production_bonus_rate" label="پاداش به ازای هر واحد تولید">
            <InputNumber min={0} className="w-full" />
          </Form.Item>
        </Form>
      </Modal>
      <style>{`
        .hr-range-popup .ant-picker-panels > *:last-child {
          display: none !important;
        }
        .hr-range-popup .ant-picker-panels {
          min-width: auto !important;
        }
      `}</style>
    </div>
  );
};

export default HRPage;
