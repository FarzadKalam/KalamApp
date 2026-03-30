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
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tabs,
  Typography,
} from 'antd';
import {
  ArrowRightOutlined,
  ClockCircleOutlined,
  HistoryOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { formatPersianPrice, parseDateValue, safeJalaliFormat, toGregorianDateString, toPersianNumber } from '../utils/persianNumberFormatter';
import { isTaskDoneStatus, normalizeTaskStatus } from '../utils/taskCompletion';
import { MODULES } from '../moduleRegistry';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import PersianDatePicker from '../components/PersianDatePicker';

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
  related_profile_id?: string | null;
  source_table?: 'employees' | 'profiles';
  source_id?: string;
  role?: string | null;
  base_salary?: number | string | null;
  overtime_rate?: number | string | null;
  late_penalty_rate?: number | string | null;
  early_bonus_rate?: number | string | null;
  production_bonus_rate?: number | string | null;
  insurance_subject?: boolean | null;
  employee_insurance_rate?: number | string | null;
  employer_insurance_rate?: number | string | null;
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

type HrSupportStats = {
  attendance: {
    total: number;
    checkIns: number;
    checkOuts: number;
    leaveLogs: number;
    missionLogs: number;
  };
  schedules: {
    total: number;
    active: number;
    draft: number;
    expired: number;
  };
  requests: {
    leaveTotal: number;
    leavePending: number;
    overtimeTotal: number;
    overtimePending: number;
    missionTotal: number;
    missionPending: number;
  };
};

type AttendanceLogRecord = {
  id: string;
  assignee_id?: string | null;
  employee_id?: string | null;
  related_profile_id?: string | null;
  log_type?: string | null;
  occurred_at?: string | null;
  source_type?: string | null;
  location_text?: string | null;
  notes?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type WorkScheduleDashboardRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  is_active?: boolean | null;
  effective_from?: string | null;
  effective_to?: string | null;
  employee_id?: string | null;
  weekly_plan?: unknown;
  updated_at?: string | null;
  created_at?: string | null;
};

type HrRequestRecord = {
  key: string;
  id: string;
  moduleId: 'leave_requests' | 'overtime_requests' | 'mission_requests';
  typeLabel: string;
  employeeId: string | null;
  status: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  notes: string | null;
};

type AttendanceComputedRow = {
  key: string;
  id: string;
  employeeId: string | null;
  employeeName: string;
  logType: string;
  occurredAt: string | null;
  sourceType: string;
  notes: string | null;
  locationText: string | null;
  scheduleTitle: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  lateMinutes: number;
  earlyArrivalMinutes: number;
  earlyLeaveMinutes: number;
  overtimeStayMinutes: number;
  deltaLabel: string;
  deltaColor: string;
};

type AttendanceModalMode = 'create' | 'view' | 'edit';

type AttendanceModalValues = {
  employee_profile_id: string;
  log_type: string;
  occurred_at: string | null;
  source_type: string;
  location_text?: string;
  notes?: string;
};

const EMPTY_HR_SUPPORT_STATS: HrSupportStats = {
  attendance: { total: 0, checkIns: 0, checkOuts: 0, leaveLogs: 0, missionLogs: 0 },
  schedules: { total: 0, active: 0, draft: 0, expired: 0 },
  requests: { leaveTotal: 0, leavePending: 0, overtimeTotal: 0, overtimePending: 0, missionTotal: 0, missionPending: 0 },
};

const WEEKDAY_KEY_BY_DAY_INDEX: Record<number, 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri'> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
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
  tasks: 'فعالیت ها',
};

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (value: string | null | undefined): dayjs.Dayjs | null => {
  if (!value) return null;
  const parsed = parseDateValue(value);
  return parsed && parsed.isValid() ? parsed : null;
};

const resolveDueDate = (task: TaskRecord): string | null => task.due_date || task.due_at || null;

const isInRange = (value: dayjs.Dayjs | null, start: dayjs.Dayjs, end: dayjs.Dayjs) => {
  if (!value) return false;
  const t = value.valueOf();
  return t >= start.valueOf() && t <= end.valueOf();
};

const parseDateParam = (rawDate: string | null): Dayjs | null => {
  if (!rawDate) return null;
  const parsed = parseDateValue(rawDate);
  if (!parsed || !parsed.isValid()) return null;
  const gregorian = toGregorianDateString(parsed, 'YYYY-MM-DD');
  if (!gregorian) return null;
  const year = Number(gregorian.slice(0, 4));
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null;
  const normalized = dayjs(gregorian);
  return normalized.isValid() ? normalized : null;
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

const normalizeSchedulePlan = (raw: any) => {
  const emptyShift = { start: null as string | null, end: null as string | null };
  const base = {
    sat: { shift1: { ...emptyShift }, shift2: { ...emptyShift } },
    sun: { shift1: { ...emptyShift }, shift2: { ...emptyShift } },
    mon: { shift1: { ...emptyShift }, shift2: { ...emptyShift } },
    tue: { shift1: { ...emptyShift }, shift2: { ...emptyShift } },
    wed: { shift1: { ...emptyShift }, shift2: { ...emptyShift } },
    thu: { shift1: { ...emptyShift }, shift2: { ...emptyShift } },
    fri: { shift1: { ...emptyShift }, shift2: { ...emptyShift } },
  };

  if (!raw || typeof raw !== 'object') return base;

  (Object.keys(base) as Array<keyof typeof base>).forEach((dayKey) => {
    (['shift1', 'shift2'] as const).forEach((shiftKey) => {
      base[dayKey][shiftKey] = {
        start: typeof raw?.[dayKey]?.[shiftKey]?.start === 'string' ? raw[dayKey][shiftKey].start : null,
        end: typeof raw?.[dayKey]?.[shiftKey]?.end === 'string' ? raw[dayKey][shiftKey].end : null,
      };
    });
  });

  return base;
};

const timeToMinutes = (value: string | null | undefined) => {
  if (!value) return null;
  const [hh, mm] = String(value).split(':').map(Number);
  if ([hh, mm].some(Number.isNaN)) return null;
  return (hh * 60) + mm;
};

const formatMinutesLabel = (minutes: number) => {
  if (minutes <= 0) return '۰';
  if (minutes < 60) return `${toPersianNumber(minutes)} دقیقه`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0
    ? `${toPersianNumber(hours)} ساعت و ${toPersianNumber(rest)} دقیقه`
    : `${toPersianNumber(hours)} ساعت`;
};

const renderDateTime = (value: string | null | undefined) => safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || '-';

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
    const assigneeLookupId = String(profile.related_profile_id || profile.id || '');
    const assigneeTasks = tasksByAssignee.get(assigneeLookupId) || [];
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
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [attendanceModalMode, setAttendanceModalMode] = useState<AttendanceModalMode>('create');
  const [attendanceModalRecord, setAttendanceModalRecord] = useState<AttendanceLogRecord | null>(null);
  const [attendanceModalSaving, setAttendanceModalSaving] = useState(false);
  const [attendanceForm] = Form.useForm<AttendanceModalValues>();
  const [supportStats, setSupportStats] = useState<HrSupportStats>(EMPTY_HR_SUPPORT_STATS);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceLogRecord[]>([]);
  const [scheduleRows, setScheduleRows] = useState<WorkScheduleDashboardRow[]>([]);
  const [requestRows, setRequestRows] = useState<HrRequestRecord[]>([]);

  const monthStart = useMemo(() => selectedRange[0].startOf('day'), [selectedRange]);
  const monthEnd = useMemo(() => selectedRange[1].endOf('day'), [selectedRange]);
  const selectedRangeQuery = useMemo(() => {
    const from = toGregorianDateString(monthStart, 'YYYY-MM-DD');
    const to = toGregorianDateString(monthEnd, 'YYYY-MM-DD');
    return `from=${from || ''}&to=${to || ''}`;
  }, [monthStart, monthEnd]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const from = toGregorianDateString(monthStart, 'YYYY-MM-DD');
    const to = toGregorianDateString(monthEnd, 'YYYY-MM-DD');
    if (!from || !to) return;
    const nextPath = employeeId ? `/hr/${employeeId}` : '/hr';
    const nextUrl = `${nextPath}?from=${from}&to=${to}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl !== nextUrl) {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }, [employeeId, monthEnd, monthStart]);

  const onDateRangeChange = (values: [Dayjs | null, Dayjs | null] | null) => {
    if (!values || !values[0] || !values[1]) return;
    setSelectedRange([values[0].startOf('day'), values[1].endOf('day')]);
  };

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const [employeesResult, profilesResult, tasksResult] = await Promise.all([
        supabase.from('employees').select('*').order('full_name', { ascending: true }),
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

      if (employeesResult.error) throw employeesResult.error;
      if (profilesResult.error) throw profilesResult.error;
      if (tasksResult.error) throw tasksResult.error;

      const normalizedEmployees = (employeesResult.data || []).map((row: any) => ({
        id: String(row?.id),
        full_name: row?.full_name || null,
        related_profile_id: row?.related_profile_id || null,
        source_table: 'employees' as const,
        source_id: String(row?.id),
        role: row?.employment_type || null,
        base_salary: row?.base_salary ?? 0,
        overtime_rate: row?.overtime_rate ?? 0,
        late_penalty_rate: row?.late_penalty_rate ?? 0,
        early_bonus_rate: row?.early_bonus_rate ?? 0,
        production_bonus_rate: row?.production_bonus_rate ?? 0,
        insurance_subject: row?.insurance_subject ?? true,
        employee_insurance_rate: row?.employee_insurance_rate ?? 7,
        employer_insurance_rate: row?.employer_insurance_rate ?? 23,
      })) as ProfileRecord[];

      const normalizedProfilesFallback = (profilesResult.data || []).map((row: any) => ({
        id: String(row?.id),
        full_name: row?.full_name || null,
        related_profile_id: row?.id || null,
        source_table: 'profiles' as const,
        source_id: String(row?.id),
        role: row?.role || null,
        base_salary: row?.base_salary ?? 0,
        overtime_rate: row?.overtime_rate ?? 0,
        late_penalty_rate: row?.late_penalty_rate ?? 0,
        early_bonus_rate: row?.early_bonus_rate ?? 0,
        production_bonus_rate: row?.production_bonus_rate ?? 0,
        insurance_subject: row?.insurance_subject ?? true,
        employee_insurance_rate: row?.employee_insurance_rate ?? 7,
        employer_insurance_rate: row?.employer_insurance_rate ?? 23,
      })) as ProfileRecord[];

      const normalizedProfiles = normalizedEmployees.length > 0
        ? normalizedEmployees
        : normalizedProfilesFallback;

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

      const [attendanceStatsResult, schedulesStatsResult, leaveStatsResult, overtimeStatsResult, missionStatsResult] = await Promise.allSettled([
        supabase
          .from('attendance_logs')
          .select('id, assignee_id, employee_id, related_profile_id, log_type, occurred_at, source_type, location_text, notes, created_by, updated_by, created_at, updated_at')
          .gte('occurred_at', monthStart.toISOString())
          .lte('occurred_at', monthEnd.toISOString())
          .order('occurred_at', { ascending: false })
          .limit(5000),
        supabase
          .from('work_schedules')
          .select('id, title, status, is_active, effective_from, effective_to, employee_id, weekly_plan, created_at, updated_at')
          .order('updated_at', { ascending: false })
          .limit(2000),
        supabase
          .from('leave_requests')
          .select('id, employee_id, status, leave_type, start_date, end_date, total_days, total_minutes, notes, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(5000),
        supabase
          .from('overtime_requests')
          .select('id, employee_id, status, work_date, start_time, end_time, total_minutes, notes, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(5000),
        supabase
          .from('mission_requests')
          .select('id, employee_id, status, start_date, end_date, destination, notes, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(5000),
      ]);

      const nextSupportStats: HrSupportStats = { ...EMPTY_HR_SUPPORT_STATS };
      let nextAttendanceRows: AttendanceLogRecord[] = [];
      let nextScheduleRows: WorkScheduleDashboardRow[] = [];
      const nextRequestRows: HrRequestRecord[] = [];

      if (attendanceStatsResult.status === 'fulfilled' && !attendanceStatsResult.value.error) {
        const rows = attendanceStatsResult.value.data || [];
        nextAttendanceRows = rows.map((row: any) => ({
          id: String(row?.id),
          assignee_id: row?.assignee_id || null,
          employee_id: row?.employee_id || null,
          related_profile_id: row?.related_profile_id || null,
          log_type: row?.log_type || null,
          occurred_at: row?.occurred_at || null,
          source_type: row?.source_type || null,
          location_text: row?.location_text || null,
          notes: row?.notes || null,
          created_by: row?.created_by || null,
          updated_by: row?.updated_by || null,
          created_at: row?.created_at || null,
          updated_at: row?.updated_at || null,
        }));
        nextSupportStats.attendance = {
          total: rows.length,
          checkIns: rows.filter((row: any) => row?.log_type === 'check_in').length,
          checkOuts: rows.filter((row: any) => row?.log_type === 'check_out').length,
          leaveLogs: rows.filter((row: any) => row?.log_type === 'leave').length,
          missionLogs: rows.filter((row: any) => row?.log_type === 'mission').length,
        };
      }

      if (schedulesStatsResult.status === 'fulfilled' && !schedulesStatsResult.value.error) {
        const rows = (schedulesStatsResult.value.data || []).filter((row: any) => {
          const from = parseDate(row?.effective_from || null);
          const to = parseDate(row?.effective_to || null);
          if (from && from.valueOf() > monthEnd.valueOf()) return false;
          if (to && to.valueOf() < monthStart.valueOf()) return false;
          return true;
        });
        nextScheduleRows = rows.map((row: any) => ({
          id: String(row?.id),
          title: row?.title || null,
          status: row?.status || null,
          is_active: row?.is_active ?? false,
          effective_from: row?.effective_from || null,
          effective_to: row?.effective_to || null,
          employee_id: row?.employee_id || null,
          weekly_plan: row?.weekly_plan ?? null,
          created_at: row?.created_at || null,
          updated_at: row?.updated_at || null,
        }));
        nextSupportStats.schedules = {
          total: rows.length,
          active: rows.filter((row: any) => row?.status === 'active' || row?.is_active === true).length,
          draft: rows.filter((row: any) => row?.status === 'draft').length,
          expired: rows.filter((row: any) => row?.status === 'expired').length,
        };
      }

      if (leaveStatsResult.status === 'fulfilled' && !leaveStatsResult.value.error) {
        const rows = (leaveStatsResult.value.data || []).filter((row: any) => {
          const from = parseDate(row?.start_date || null);
          const to = parseDate(row?.end_date || null);
          if (from && from.valueOf() > monthEnd.valueOf()) return false;
          if (to && to.valueOf() < monthStart.valueOf()) return false;
          return true;
        });
        nextRequestRows.push(
          ...rows.map((row: any) => ({
            key: `leave_${String(row?.id)}`,
            id: String(row?.id),
            moduleId: 'leave_requests' as const,
            typeLabel: 'مرخصی',
            employeeId: row?.employee_id ? String(row.employee_id) : null,
            status: row?.status || null,
            dateFrom: row?.start_date || null,
            dateTo: row?.end_date || null,
            notes: row?.notes || null,
          })),
        );
        nextSupportStats.requests.leaveTotal = rows.length;
        nextSupportStats.requests.leavePending = rows.filter((row: any) => row?.status === 'pending').length;
      }

      if (overtimeStatsResult.status === 'fulfilled' && !overtimeStatsResult.value.error) {
        const rows = (overtimeStatsResult.value.data || []).filter((row: any) => isInRange(parseDate(row?.work_date || null), monthStart, monthEnd));
        nextRequestRows.push(
          ...rows.map((row: any) => ({
            key: `overtime_${String(row?.id)}`,
            id: String(row?.id),
            moduleId: 'overtime_requests' as const,
            typeLabel: 'اضافه‌کاری',
            employeeId: row?.employee_id ? String(row.employee_id) : null,
            status: row?.status || null,
            dateFrom: row?.work_date || null,
            dateTo: null,
            notes: row?.notes || null,
          })),
        );
        nextSupportStats.requests.overtimeTotal = rows.length;
        nextSupportStats.requests.overtimePending = rows.filter((row: any) => row?.status === 'pending').length;
      }

      if (missionStatsResult.status === 'fulfilled' && !missionStatsResult.value.error) {
        const rows = (missionStatsResult.value.data || []).filter((row: any) => {
          const from = parseDate(row?.start_date || null);
          const to = parseDate(row?.end_date || null);
          if (from && from.valueOf() > monthEnd.valueOf()) return false;
          if (to && to.valueOf() < monthStart.valueOf()) return false;
          return true;
        });
        nextRequestRows.push(
          ...rows.map((row: any) => ({
            key: `mission_${String(row?.id)}`,
            id: String(row?.id),
            moduleId: 'mission_requests' as const,
            typeLabel: 'ماموریت',
            employeeId: row?.employee_id ? String(row.employee_id) : null,
            status: row?.status || null,
            dateFrom: row?.start_date || null,
            dateTo: row?.end_date || null,
            notes: row?.notes || null,
          })),
        );
        nextSupportStats.requests.missionTotal = rows.length;
        nextSupportStats.requests.missionPending = rows.filter((row: any) => row?.status === 'pending').length;
      }

      setSupportStats(nextSupportStats);
      setAttendanceRows(nextAttendanceRows);
      setScheduleRows(nextScheduleRows);
      setRequestRows(
        nextRequestRows.sort((a, b) => {
          const aDate = parseDate(a.dateFrom || a.dateTo || null)?.valueOf() || 0;
          const bDate = parseDate(b.dateFrom || b.dateTo || null)?.valueOf() || 0;
          return bDate - aDate;
        }),
      );

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
      message.error(toFaErrorMessage(err as any, 'خطا در دریافت داده‌های منابع انسانی'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [message, monthEnd, monthStart]);

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

  const profileByRelatedId = useMemo(() => {
    const entries = profiles
      .filter((profile) => Boolean(profile.related_profile_id))
      .map((profile) => [String(profile.related_profile_id), profile] as const);
    return new Map(entries);
  }, [profiles]);

  const profileById = useMemo(() => {
    return new Map(profiles.map((profile) => [String(profile.id), profile] as const));
  }, [profiles]);

  const attendanceEmployeeOptions = useMemo(
    () =>
      profiles.map((profile) => ({
        label: profile.full_name || profile.id,
        value: String(profile.id),
      })),
    [profiles],
  );

  const selectedEmployeeIdSet = useMemo(
    () => new Set((selectedEmployeeIds.length ? selectedEmployeeIds : profiles.map((profile) => profile.id)).map((value) => String(value))),
    [profiles, selectedEmployeeIds],
  );

  const computeScheduleForEmployee = useCallback(
    (employeeId: string | null, targetDateIso: string | null) => {
      if (!employeeId || !targetDateIso) {
        return { title: null, start: null as string | null, end: null as string | null };
      }

      const targetDate = parseDate(targetDateIso);
      if (!targetDate) {
        return { title: null, start: null as string | null, end: null as string | null };
      }

      const candidates = scheduleRows
        .filter((schedule) => {
          const from = parseDate(schedule.effective_from || null);
          const to = parseDate(schedule.effective_to || null);
          if (from && targetDate.valueOf() < from.startOf('day').valueOf()) return false;
          if (to && targetDate.valueOf() > to.endOf('day').valueOf()) return false;
          return true;
        })
        .sort((a, b) => {
          const aScore = a.status === 'active' || a.is_active ? 1 : 0;
          const bScore = b.status === 'active' || b.is_active ? 1 : 0;
          if (aScore !== bScore) return bScore - aScore;
          const aUpdated = parseDate(a.updated_at || a.created_at || null)?.valueOf() || 0;
          const bUpdated = parseDate(b.updated_at || b.created_at || null)?.valueOf() || 0;
          return bUpdated - aUpdated;
        });

      const dayKey = WEEKDAY_KEY_BY_DAY_INDEX[targetDate.day()];
      for (const schedule of candidates) {
        const rawColumns = Array.isArray((schedule.weekly_plan as any)?.columns) ? (schedule.weekly_plan as any).columns : [];
        const matchedColumn = rawColumns.find((column: any) => String(column?.employeeId || '') === String(employeeId));
        if (!matchedColumn) continue;

        const normalizedPlan = normalizeSchedulePlan(matchedColumn?.weeklyPlan);
        const currentDayPlan = normalizedPlan?.[dayKey];
        if (!currentDayPlan) continue;

        const starts = [currentDayPlan.shift1.start, currentDayPlan.shift2.start].map(timeToMinutes).filter((value): value is number => value !== null);
        const ends = [currentDayPlan.shift1.end, currentDayPlan.shift2.end].map(timeToMinutes).filter((value): value is number => value !== null);
        const earliestStart = starts.length ? Math.min(...starts) : null;
        const latestEnd = ends.length ? Math.max(...ends) : null;

        const start =
          earliestStart === null
            ? null
            : `${String(Math.floor(earliestStart / 60)).padStart(2, '0')}:${String(earliestStart % 60).padStart(2, '0')}`;
        const end =
          latestEnd === null
            ? null
            : `${String(Math.floor(latestEnd / 60)).padStart(2, '0')}:${String(latestEnd % 60).padStart(2, '0')}`;

        return {
          title: schedule.title || null,
          start,
          end,
        };
      }

      return { title: null, start: null as string | null, end: null as string | null };
    },
    [scheduleRows],
  );

  const attendanceComputedRows = useMemo<AttendanceComputedRow[]>(() => {
    return attendanceRows
      .map((row) => {
        const directEmployeeId = row.employee_id ? String(row.employee_id) : null;
        const fromAssignee = row.assignee_id ? profileByRelatedId.get(String(row.assignee_id)) : undefined;
        const fromRelated = row.related_profile_id ? profileByRelatedId.get(String(row.related_profile_id)) : undefined;
        const employee = directEmployeeId
          ? profileById.get(directEmployeeId) || null
          : fromAssignee || fromRelated || null;
        const employeeId = employee ? String(employee.id) : directEmployeeId;
        const employeeName =
          employee?.full_name ||
          (row.assignee_id ? profileByRelatedId.get(String(row.assignee_id))?.full_name : null) ||
          (row.assignee_id ? row.assignee_id : 'بدون کارمند');
        const schedule = computeScheduleForEmployee(employeeId, row.occurred_at || null);
        const actualTime = timeToMinutes(parseDate(row.occurred_at || null)?.format('HH:mm') || null);
        const startMinutes = timeToMinutes(schedule.start);
        const endMinutes = timeToMinutes(schedule.end);
        const logType = String(row.log_type || '');
        const lateMinutes = logType === 'check_in' && actualTime !== null && startMinutes !== null ? Math.max(actualTime - startMinutes, 0) : 0;
        const earlyArrivalMinutes = logType === 'check_in' && actualTime !== null && startMinutes !== null ? Math.max(startMinutes - actualTime, 0) : 0;
        const earlyLeaveMinutes = logType === 'check_out' && actualTime !== null && endMinutes !== null ? Math.max(endMinutes - actualTime, 0) : 0;
        const overtimeStayMinutes = logType === 'check_out' && actualTime !== null && endMinutes !== null ? Math.max(actualTime - endMinutes, 0) : 0;

        let deltaLabel = 'بدون اختلاف';
        let deltaColor = 'default';
        if (lateMinutes > 0) {
          deltaLabel = `دیرکرد ${formatMinutesLabel(lateMinutes)}`;
          deltaColor = 'red';
        } else if (earlyArrivalMinutes > 0) {
          deltaLabel = `تعجیل ورود ${formatMinutesLabel(earlyArrivalMinutes)}`;
          deltaColor = 'green';
        } else if (earlyLeaveMinutes > 0) {
          deltaLabel = `تعجیل خروج ${formatMinutesLabel(earlyLeaveMinutes)}`;
          deltaColor = 'orange';
        } else if (overtimeStayMinutes > 0) {
          deltaLabel = `ماندن اضافه ${formatMinutesLabel(overtimeStayMinutes)}`;
          deltaColor = 'blue';
        }

        return {
          key: row.id,
          id: row.id,
          employeeId: employeeId || null,
          employeeName: String(employeeName || 'بدون کارمند'),
          logType: logType || '-',
          occurredAt: row.occurred_at || null,
          sourceType: String(row.source_type || '-'),
          notes: row.notes || null,
          locationText: row.location_text || null,
          scheduleTitle: schedule.title,
          scheduledStart: schedule.start,
          scheduledEnd: schedule.end,
          lateMinutes,
          earlyArrivalMinutes,
          earlyLeaveMinutes,
          overtimeStayMinutes,
          deltaLabel,
          deltaColor,
        };
      })
      .filter((row) => !row.employeeId || selectedEmployeeIdSet.has(String(row.employeeId)));
  }, [attendanceRows, computeScheduleForEmployee, profileById, profileByRelatedId, selectedEmployeeIdSet]);

  const visibleScheduleRows = useMemo(() => {
    return scheduleRows.filter((schedule) => {
      const rawColumns = Array.isArray((schedule.weekly_plan as any)?.columns) ? (schedule.weekly_plan as any).columns : [];
      const employeeIds = rawColumns.map((column: any) => String(column?.employeeId || '')).filter(Boolean);
      if (!employeeIds.length && schedule.employee_id) {
        employeeIds.push(String(schedule.employee_id));
      }
      if (!employeeIds.length) return true;
      return employeeIds.some((value: string) => selectedEmployeeIdSet.has(String(value)));
    });
  }, [scheduleRows, selectedEmployeeIdSet]);

  const visibleRequestRows = useMemo(() => {
    return requestRows.filter((row) => !row.employeeId || selectedEmployeeIdSet.has(String(row.employeeId)));
  }, [requestRows, selectedEmployeeIdSet]);

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

  const insuranceTotals = useMemo(() => {
    return visibleSummaries.reduce(
      (acc, row) => {
        if (row.profile.insurance_subject === false) return acc;
        const employeeRate = toNumber(row.profile.employee_insurance_rate);
        const employerRate = toNumber(row.profile.employer_insurance_rate);
        const base = toNumber(row.baseSalary);
        return {
          employee: acc.employee + ((base * employeeRate) / 100),
          employer: acc.employer + ((base * employerRate) / 100),
        };
      },
      { employee: 0, employer: 0 },
    );
  }, [visibleSummaries]);

  const attendanceInsights = useMemo(() => {
    return attendanceComputedRows.reduce(
      (acc, row) => ({
        lateMinutes: acc.lateMinutes + row.lateMinutes,
        earlyArrivalMinutes: acc.earlyArrivalMinutes + row.earlyArrivalMinutes,
        earlyLeaveMinutes: acc.earlyLeaveMinutes + row.earlyLeaveMinutes,
        overtimeStayMinutes: acc.overtimeStayMinutes + row.overtimeStayMinutes,
      }),
      { lateMinutes: 0, earlyArrivalMinutes: 0, earlyLeaveMinutes: 0, overtimeStayMinutes: 0 },
    );
  }, [attendanceComputedRows]);

  const closeAttendanceModal = useCallback(() => {
    setAttendanceModalOpen(false);
    setAttendanceModalRecord(null);
    setAttendanceModalMode('create');
    attendanceForm.resetFields();
  }, [attendanceForm]);

  const openAttendanceModal = useCallback(
    (mode: AttendanceModalMode, row?: AttendanceLogRecord | null) => {
      const selectedProfileId = (() => {
        if (row?.employee_id && profileById.has(String(row.employee_id))) return String(row.employee_id);
        if (row?.assignee_id) {
          const relatedProfile = profileByRelatedId.get(String(row.assignee_id));
          if (relatedProfile) return String(relatedProfile.id);
        }
        if (row?.related_profile_id) {
          const relatedProfile = profileByRelatedId.get(String(row.related_profile_id));
          if (relatedProfile) return String(relatedProfile.id);
        }
        if (selectedEmployeeIds.length === 1) return String(selectedEmployeeIds[0]);
        return profiles[0]?.id ? String(profiles[0].id) : '';
      })();

      setAttendanceModalMode(mode);
      setAttendanceModalRecord(row || null);
      attendanceForm.setFieldsValue({
        employee_profile_id: selectedProfileId,
        log_type: row?.log_type || 'check_in',
        occurred_at: row?.occurred_at || new Date().toISOString(),
        source_type: row?.source_type || 'manual',
        location_text: row?.location_text || '',
        notes: row?.notes || '',
      });
      setAttendanceModalOpen(true);
    },
    [attendanceForm, profileById, profileByRelatedId, profiles, selectedEmployeeIds],
  );

  const handleAttendanceModalSave = useCallback(async () => {
    try {
      const values = await attendanceForm.validateFields();
      const selectedProfile = profileById.get(String(values.employee_profile_id || ''));
      if (!selectedProfile) {
        message.error('کارمند انتخاب‌شده معتبر نیست.');
        return;
      }

      const relatedProfileId =
        selectedProfile.related_profile_id ||
        (selectedProfile.source_table === 'profiles' ? selectedProfile.id : null);
      const payload = {
        employee_id: selectedProfile.source_table === 'employees' ? selectedProfile.id : null,
        related_profile_id: relatedProfileId,
        assignee_id: relatedProfileId,
        assignee_type: 'user',
        log_type: values.log_type,
        occurred_at: values.occurred_at,
        source_type: values.source_type,
        location_text: values.location_text || null,
        notes: values.notes || null,
      };

      setAttendanceModalSaving(true);
      const response = attendanceModalMode === 'create'
        ? await supabase.from('attendance_logs').insert(payload).select('*').single()
        : await supabase.from('attendance_logs').update(payload).eq('id', attendanceModalRecord?.id).select('*').single();
      if (response.error) throw response.error;
      message.success(attendanceModalMode === 'create' ? 'رکورد تردد ثبت شد.' : 'رکورد تردد به‌روزرسانی شد.');
      closeAttendanceModal();
      await fetchData(true);
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(toFaErrorMessage(err, 'ذخیره رکورد تردد ناموفق بود'));
    } finally {
      setAttendanceModalSaving(false);
    }
  }, [attendanceForm, attendanceModalMode, attendanceModalRecord?.id, closeAttendanceModal, fetchData, message, profileById]);

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
      const targetTable = editingProfile.source_table === 'profiles' ? 'profiles' : 'employees';
      const targetId = editingProfile.source_id || editingProfile.id;
      const { error } = await supabase
        .from(targetTable)
        .update({
          base_salary: toNumber(values.base_salary),
          overtime_rate: toNumber(values.overtime_rate),
          late_penalty_rate: toNumber(values.late_penalty_rate),
          early_bonus_rate: toNumber(values.early_bonus_rate),
          production_bonus_rate: toNumber(values.production_bonus_rate),
        })
        .eq('id', targetId);
      if (error) throw error;
      message.success('تنظیمات حقوق ذخیره شد.');
      setConfigModalOpen(false);
      await fetchData(true);
    } catch (err: any) {
      message.error(toFaErrorMessage(err as any, 'ذخیره تنظیمات ناموفق بود'));
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
        <div>دستمزد فعالیت: <span className="persian-number">{formatPersianPrice(row.wageBase)} تومان</span></div>
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
      title: 'فعالیت ها',
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
      title: 'فعالیت',
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
      title: 'دستمزد فعالیت',
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

  const attendanceColumns = [
    {
      title: 'کارمند',
      dataIndex: 'employeeName',
      key: 'employeeName',
      render: (val: string) => <span className="font-medium text-leather-700">{val}</span>,
    },
    {
      title: 'نوع',
      dataIndex: 'logType',
      key: 'logType',
      render: (val: string) => {
        const map: Record<string, { label: string; color: string }> = {
          check_in: { label: 'ورود', color: 'green' },
          check_out: { label: 'خروج', color: 'red' },
          leave: { label: 'مرخصی', color: 'gold' },
          mission: { label: 'ماموریت', color: 'blue' },
        };
        const meta = map[String(val || '')] || { label: val || '-', color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: 'زمان ثبت',
      dataIndex: 'occurredAt',
      key: 'occurredAt',
      render: (val: string | null) => <span>{val ? toPersianNumber(safeJalaliFormat(val, 'YYYY/MM/DD HH:mm')) : '-'}</span>,
    },
    {
      title: 'برنامه حضور',
      key: 'schedule',
      render: (_: unknown, row: AttendanceComputedRow) => (
        <div className="text-xs leading-6">
          <div className="font-bold">{row.scheduleTitle || '-'}</div>
          <div className="text-gray-500">
            {row.scheduledStart || row.scheduledEnd ? `${toPersianNumber(row.scheduledStart || '--')} تا ${toPersianNumber(row.scheduledEnd || '--')}` : 'بدون برنامه'}
          </div>
        </div>
      ),
    },
    {
      title: 'اختلاف',
      key: 'delta',
      render: (_: unknown, row: AttendanceComputedRow) => <Tag color={row.deltaColor}>{row.deltaLabel}</Tag>,
    },
    {
      title: 'جزئیات اختلاف',
      key: 'delta_details',
      render: (_: unknown, row: AttendanceComputedRow) => (
        <div className="text-xs leading-6">
          <div>دیرکرد: <span className="persian-number text-red-700">{formatMinutesLabel(row.lateMinutes)}</span></div>
          <div>تعجیل ورود: <span className="persian-number text-green-700">{formatMinutesLabel(row.earlyArrivalMinutes)}</span></div>
          <div>تعجیل خروج: <span className="persian-number text-orange-600">{formatMinutesLabel(row.earlyLeaveMinutes)}</span></div>
          <div>اضافه‌ماندن: <span className="persian-number text-blue-700">{formatMinutesLabel(row.overtimeStayMinutes)}</span></div>
        </div>
      ),
    },
    {
      title: 'منبع ثبت',
      dataIndex: 'sourceType',
      key: 'sourceType',
      render: (val: string) => <Tag>{val || '-'}</Tag>,
    },
    {
      title: 'یادداشت',
      dataIndex: 'notes',
      key: 'notes',
      render: (val: string | null) => val || '-',
    },
    {
      title: 'نمایش',
      key: 'actions',
      width: 140,
      render: (_: unknown, row: AttendanceComputedRow) => (
        <Space>
          <Button
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              const rawRow = attendanceRows.find((item) => String(item.id) === String(row.id)) || null;
              openAttendanceModal('view', rawRow);
            }}
          >
            مشاهده
          </Button>
          <Button
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              const rawRow = attendanceRows.find((item) => String(item.id) === String(row.id)) || null;
              openAttendanceModal('edit', rawRow);
            }}
          >
            ویرایش
          </Button>
        </Space>
      ),
    },
  ];

  const scheduleListColumns = [
    {
      title: 'نام برنامه',
      dataIndex: 'title',
      key: 'title',
      render: (_: string, row: WorkScheduleDashboardRow) => (
        <button type="button" className="text-leather-700 font-bold hover:underline" onClick={() => navigate(`/work_schedules/${row.id}`)}>
          {row.title || 'بدون عنوان'}
        </button>
      ),
    },
    {
      title: 'وضعیت',
      dataIndex: 'status',
      key: 'status',
      render: (val: string | null) => {
        const meta: Record<string, { label: string; color: string }> = {
          draft: { label: 'پیش‌نویس', color: 'orange' },
          active: { label: 'فعال', color: 'green' },
          expired: { label: 'منقضی', color: 'default' },
        };
        const item = meta[String(val || '')] || { label: val || '-', color: 'default' };
        return <Tag color={item.color}>{item.label}</Tag>;
      },
    },
    {
      title: 'بازه',
      key: 'range',
      render: (_: unknown, row: WorkScheduleDashboardRow) => (
        <span>
          {row.effective_from ? toPersianNumber(safeJalaliFormat(row.effective_from, 'YYYY/MM/DD')) : '-'} تا {row.effective_to ? toPersianNumber(safeJalaliFormat(row.effective_to, 'YYYY/MM/DD')) : '-'}
        </span>
      ),
    },
    {
      title: 'تعداد نیرو',
      key: 'employees',
      render: (_: unknown, row: WorkScheduleDashboardRow) => {
        const rawColumns = Array.isArray((row.weekly_plan as any)?.columns) ? (row.weekly_plan as any).columns : [];
        const employeeCount = new Set(rawColumns.map((column: any) => String(column?.employeeId || '')).filter(Boolean)).size || (row.employee_id ? 1 : 0);
        return <span className="persian-number">{toPersianNumber(employeeCount)}</span>;
      },
    },
    {
      title: 'آخرین ویرایش',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (val: string | null) => <span>{val ? toPersianNumber(safeJalaliFormat(val, 'YYYY/MM/DD HH:mm')) : '-'}</span>,
    },
  ];

  const requestColumns = [
    {
      title: 'نوع',
      dataIndex: 'typeLabel',
      key: 'typeLabel',
      render: (val: string) => <Tag>{val}</Tag>,
    },
    {
      title: 'کارمند',
      dataIndex: 'employeeId',
      key: 'employeeId',
      render: (val: string | null) => profileById.get(String(val || ''))?.full_name || '-',
    },
    {
      title: 'وضعیت',
      dataIndex: 'status',
      key: 'status',
      render: (val: string | null) => {
        const meta: Record<string, { label: string; color: string }> = {
          draft: { label: 'پیش‌نویس', color: 'default' },
          pending: { label: 'در انتظار', color: 'orange' },
          approved: { label: 'تایید شده', color: 'green' },
          rejected: { label: 'رد شده', color: 'red' },
          canceled: { label: 'لغو شده', color: 'default' },
        };
        const item = meta[String(val || '')] || { label: val || '-', color: 'default' };
        return <Tag color={item.color}>{item.label}</Tag>;
      },
    },
    {
      title: 'بازه / تاریخ',
      key: 'dates',
      render: (_: unknown, row: HrRequestRecord) => (
        <span>
          {row.dateFrom ? toPersianNumber(safeJalaliFormat(row.dateFrom, 'YYYY/MM/DD')) : '-'}
          {row.dateTo ? ` تا ${toPersianNumber(safeJalaliFormat(row.dateTo, 'YYYY/MM/DD'))}` : ''}
        </span>
      ),
    },
    {
      title: 'توضیحات',
      dataIndex: 'notes',
      key: 'notes',
      render: (val: string | null) => val || '-',
    },
    {
      title: 'نمایش',
      key: 'actions',
      render: (_: unknown, row: HrRequestRecord) => (
        <Button size="small" onClick={() => navigate(`/${row.moduleId}/${row.id}`)}>
          مشاهده
        </Button>
      ),
    },
  ];

  const payrollColumns = [
    {
      title: 'کارمند',
      dataIndex: 'name',
      key: 'name',
      render: (val: string) => <span className="font-bold text-leather-700">{val}</span>,
    },
    {
      title: 'حقوق پایه',
      dataIndex: 'baseSalary',
      key: 'baseSalary',
      render: (val: number) => <span className="persian-number">{formatPersianPrice(val)} تومان</span>,
    },
    {
      title: 'کارکرد',
      dataIndex: 'taskWageTotal',
      key: 'taskWageTotal',
      render: (val: number) => <span className="persian-number">{formatPersianPrice(val)} تومان</span>,
    },
    {
      title: 'مزایا',
      dataIndex: 'bonusTotal',
      key: 'bonusTotal',
      render: (val: number) => <span className="persian-number text-green-700">{formatPersianPrice(val)} تومان</span>,
    },
    {
      title: 'کسورات',
      dataIndex: 'penaltyTotal',
      key: 'penaltyTotal',
      render: (val: number) => <span className="persian-number text-red-700">{formatPersianPrice(val)} تومان</span>,
    },
    {
      title: 'خالص',
      dataIndex: 'netPayable',
      key: 'netPayable',
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
            className="w-full hr-range-picker persian-number"
            format="YYYY/MM/DD"
            inputReadOnly
            placeholder={['از تاریخ', 'تا تاریخ']}
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

  const overviewTabContent = (
    <>
      <Row gutter={[12, 12]} className="mb-4">
        <Col xs={24} md={6}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">تعداد نیرو</div>
            <div className="text-2xl font-black">{toPersianNumber(totals.employees)}</div>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">کل فعالیت های ماه</div>
            <div className="text-2xl font-black">{toPersianNumber(totals.totalTasks)}</div>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">فعالیت های انجام‌شده</div>
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
  );

  const attendanceTabContent = (
    <>
      <Row gutter={[12, 12]} className="mb-4">
        <Col xs={24} md={6}>
          <Card><div className="text-xs text-gray-500 mb-1">کل رکوردهای تردد</div><div className="text-2xl font-black">{toPersianNumber(supportStats.attendance.total)}</div></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><div className="text-xs text-gray-500 mb-1">ورودها</div><div className="text-2xl font-black text-green-700">{toPersianNumber(supportStats.attendance.checkIns)}</div></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><div className="text-xs text-gray-500 mb-1">خروج‌ها</div><div className="text-2xl font-black text-red-700">{toPersianNumber(supportStats.attendance.checkOuts)}</div></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><div className="text-xs text-gray-500 mb-1">ثبت مرخصی/ماموریت</div><div className="text-2xl font-black">{toPersianNumber(supportStats.attendance.leaveLogs + supportStats.attendance.missionLogs)}</div></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><div className="text-xs text-gray-500 mb-1">جمع دیرکرد</div><div className="text-lg font-black text-red-700">{formatMinutesLabel(attendanceInsights.lateMinutes)}</div></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><div className="text-xs text-gray-500 mb-1">تعجیل / اضافه‌ماندن</div><div className="text-sm font-black"><div className="text-green-700">{formatMinutesLabel(attendanceInsights.earlyArrivalMinutes + attendanceInsights.earlyLeaveMinutes)}</div><div className="text-blue-700">{formatMinutesLabel(attendanceInsights.overtimeStayMinutes)}</div></div></Card>
        </Col>
      </Row>
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <Button onClick={() => navigate('/attendance_logs')}>مشاهده ترددها</Button>
          <Button onClick={() => navigate('/work_schedules')}>برنامه حضور</Button>
          <Button type="primary" onClick={() => openAttendanceModal('create')}>ثبت رکورد تردد</Button>
        </div>
        {attendanceComputedRows.length === 0 ? (
          <Empty description="رکورد ترددی برای این بازه یافت نشد." />
        ) : (
          <Table
            rowKey="key"
            columns={attendanceColumns}
            dataSource={attendanceComputedRows}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 1600 }}
            onRow={(row: AttendanceComputedRow) => ({
              onClick: () => {
                const rawRow = attendanceRows.find((item) => String(item.id) === String(row.id)) || null;
                openAttendanceModal('view', rawRow);
              },
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </Card>
    </>
  );

  const schedulesTabContent = (
    <>
      <Row gutter={[12, 12]} className="mb-4">
        <Col xs={24} md={6}>
          <Card><div className="text-xs text-gray-500 mb-1">کل برنامه‌ها</div><div className="text-2xl font-black">{toPersianNumber(supportStats.schedules.total)}</div></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><div className="text-xs text-gray-500 mb-1">فعال</div><div className="text-2xl font-black text-green-700">{toPersianNumber(supportStats.schedules.active)}</div></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><div className="text-xs text-gray-500 mb-1">پیش‌نویس</div><div className="text-2xl font-black text-orange-600">{toPersianNumber(supportStats.schedules.draft)}</div></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><div className="text-xs text-gray-500 mb-1">منقضی</div><div className="text-2xl font-black text-gray-700">{toPersianNumber(supportStats.schedules.expired)}</div></Card>
        </Col>
      </Row>
      <Card>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button onClick={() => navigate('/work_schedules')}>لیست برنامه‌های حضور</Button>
          <Button type="primary" onClick={() => navigate('/work_schedules/create')}>ایجاد برنامه جدید</Button>
        </div>
        {visibleScheduleRows.length === 0 ? (
          <Empty description="برنامه حضوری برای این بازه یافت نشد." />
        ) : (
          <Table
            rowKey="id"
            columns={scheduleListColumns}
            dataSource={visibleScheduleRows}
            pagination={{ pageSize: 12, showSizeChanger: false }}
            scroll={{ x: 1100 }}
          />
        )}
      </Card>
    </>
  );

  const requestsTabContent = (
    <>
      <Row gutter={[12, 12]} className="mb-4">
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">مرخصی‌ها</div>
            <div className="text-lg font-black">{toPersianNumber(supportStats.requests.leaveTotal)}</div>
            <div className="text-xs text-orange-600 mt-1">در انتظار: {toPersianNumber(supportStats.requests.leavePending)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">اضافه‌کاری‌ها</div>
            <div className="text-lg font-black">{toPersianNumber(supportStats.requests.overtimeTotal)}</div>
            <div className="text-xs text-orange-600 mt-1">در انتظار: {toPersianNumber(supportStats.requests.overtimePending)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">ماموریت‌ها</div>
            <div className="text-lg font-black">{toPersianNumber(supportStats.requests.missionTotal)}</div>
            <div className="text-xs text-orange-600 mt-1">در انتظار: {toPersianNumber(supportStats.requests.missionPending)}</div>
          </Card>
        </Col>
      </Row>
      <Card>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button onClick={() => navigate('/leave_requests')}>مرخصی‌ها</Button>
          <Button onClick={() => navigate('/overtime_requests')}>اضافه‌کاری‌ها</Button>
          <Button onClick={() => navigate('/mission_requests')}>ماموریت‌ها</Button>
        </div>
        {visibleRequestRows.length === 0 ? (
          <Empty description="درخواستی برای این بازه یافت نشد." />
        ) : (
          <Table
            rowKey="key"
            columns={requestColumns}
            dataSource={visibleRequestRows}
            pagination={{ pageSize: 15, showSizeChanger: false }}
            scroll={{ x: 1200 }}
          />
        )}
      </Card>
    </>
  );

  const payrollTabContent = (
    <>
      <Row gutter={[12, 12]} className="mb-4">
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">جمع قابل پرداخت</div>
            <div className="text-2xl font-black">{formatPersianPrice(totals.payable)} تومان</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">برآورد سهم بیمه کارمند</div>
            <div className="text-2xl font-black">{formatPersianPrice(insuranceTotals.employee)} تومان</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">برآورد سهم بیمه کارفرما</div>
            <div className="text-2xl font-black">{formatPersianPrice(insuranceTotals.employer)} تومان</div>
          </Card>
        </Col>
      </Row>
      <Card>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button onClick={() => navigate('/employees')}>تنظیمات حقوقی کارکنان</Button>
          <Button type="primary" onClick={() => message.info('مرحله بعدی: ساخت اسنپ‌شات و ایجاد فیش حقوقی')}>
            ایجاد فیش حقوقی
          </Button>
        </div>
        {visibleSummaries.length === 0 ? (
          <Empty description="داده‌ای برای محاسبه حقوق در این بازه یافت نشد." />
        ) : (
          <Table
            rowKey="key"
            columns={payrollColumns}
            dataSource={visibleSummaries}
            pagination={{ pageSize: 15, showSizeChanger: false }}
            scroll={{ x: 1100 }}
          />
        )}
      </Card>
    </>
  );

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
                    <div className="text-xs text-gray-500 mb-1">تعداد فعالیت ها</div>
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
                  className="w-full hr-range-picker persian-number"
                  format="YYYY/MM/DD"
                  inputReadOnly
                  placeholder={['از تاریخ', 'تا تاریخ']}
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

          <Tabs
            defaultActiveKey="overview"
            items={[
              { key: 'overview', label: 'کلی', children: overviewTabContent },
              { key: 'attendance', label: 'تردد', children: attendanceTabContent },
              { key: 'schedules', label: 'برنامه حضور', children: schedulesTabContent },
              { key: 'requests', label: 'درخواست‌ها', children: requestsTabContent },
              { key: 'payroll', label: 'حقوق و بیمه', children: payrollTabContent },
            ]}
          />
        </>
      )}

      <Modal
        title={attendanceModalMode === 'create' ? 'افزودن سریع رکورد تردد' : attendanceModalMode === 'edit' ? 'ویرایش رکورد تردد' : 'نمایش رکورد تردد'}
        open={attendanceModalOpen}
        onCancel={closeAttendanceModal}
        footer={null}
        destroyOnHidden
        width={760}
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#17191f]">
            <Form form={attendanceForm} layout="vertical">
              <Form.Item
                name="employee_profile_id"
                label="نام کارمند"
                rules={[{ required: true, message: 'انتخاب کارمند الزامی است' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={attendanceEmployeeOptions}
                  disabled={attendanceModalMode === 'view'}
                  placeholder="نام کارمند"
                />
              </Form.Item>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Form.Item
                  name="log_type"
                  label="نوع ثبت"
                  rules={[{ required: true, message: 'نوع ثبت الزامی است' }]}
                >
                  <Select
                    disabled={attendanceModalMode === 'view'}
                    options={[
                      { label: 'ورود', value: 'check_in' },
                      { label: 'خروج', value: 'check_out' },
                      { label: 'مرخصی', value: 'leave' },
                      { label: 'ماموریت', value: 'mission' },
                    ]}
                  />
                </Form.Item>

                <Form.Item
                  name="source_type"
                  label="منبع ثبت"
                  rules={[{ required: true, message: 'منبع ثبت الزامی است' }]}
                >
                  <Select
                    disabled={attendanceModalMode === 'view'}
                    options={[
                      { label: 'دستی', value: 'manual' },
                      { label: 'وب فرم', value: 'web_form' },
                      { label: 'QR', value: 'qr' },
                      { label: 'سیستم', value: 'system' },
                    ]}
                  />
                </Form.Item>

                <Form.Item
                  name="occurred_at"
                  label="زمان ثبت"
                  rules={[{ required: true, message: 'زمان ثبت الزامی است' }]}
                >
                  <div>
                    <PersianDatePicker type="DATETIME" disabled={attendanceModalMode === 'view'} placeholder="زمان ثبت" />
                  </div>
                </Form.Item>

                <Form.Item name="location_text" label="موقعیت / آدرس">
                  <Input disabled={attendanceModalMode === 'view'} />
                </Form.Item>
              </div>

              <Form.Item name="notes" label="یادداشت">
                <Input.TextArea rows={3} disabled={attendanceModalMode === 'view'} />
              </Form.Item>
            </Form>
          </div>

          {attendanceModalRecord && (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/5">
              <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <SafetyCertificateOutlined className="text-green-600" />
                  <div className="min-w-0">
                    <div className="text-gray-400">ایجادکننده</div>
                    <div className="truncate font-bold text-gray-700 dark:text-gray-200">
                      {attendanceModalRecord.created_by
                        ? profileByRelatedId.get(String(attendanceModalRecord.created_by))?.full_name || profileById.get(String(attendanceModalRecord.created_by))?.full_name || attendanceModalRecord.created_by
                        : '-'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <ClockCircleOutlined className="text-blue-600" />
                  <div className="min-w-0">
                    <div className="text-gray-400">زمان ایجاد</div>
                    <div className="truncate font-bold text-gray-700 dark:text-gray-200">{renderDateTime(attendanceModalRecord.created_at)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <HistoryOutlined className="text-amber-600" />
                  <div className="min-w-0">
                    <div className="text-gray-400">آخرین ویرایشگر</div>
                    <div className="truncate font-bold text-gray-700 dark:text-gray-200">
                      {attendanceModalRecord.updated_by
                        ? profileByRelatedId.get(String(attendanceModalRecord.updated_by))?.full_name || profileById.get(String(attendanceModalRecord.updated_by))?.full_name || attendanceModalRecord.updated_by
                        : '-'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <ClockCircleOutlined className="text-violet-600" />
                  <div className="min-w-0">
                    <div className="text-gray-400">زمان ویرایش</div>
                    <div className="truncate font-bold text-gray-700 dark:text-gray-200">{renderDateTime(attendanceModalRecord.updated_at)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button onClick={closeAttendanceModal}>بستن</Button>
            {attendanceModalMode === 'view' ? (
              <Button
                type="primary"
                onClick={() => setAttendanceModalMode('edit')}
              >
                ویرایش
              </Button>
            ) : (
              <Button type="primary" loading={attendanceModalSaving} onClick={handleAttendanceModalSave}>
                {attendanceModalMode === 'create' ? 'ثبت' : 'ذخیره تغییرات'}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        title={`تنظیم ضرایب حقوق - ${editingProfile?.full_name || editingProfile?.id || ''}`}
        open={configModalOpen}
        forceRender
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
          <Form.Item name="early_bonus_rate" label="پاداش هر فعالیت با تعجیل">
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
        .hr-range-picker input {
          font-family: Vazirmatn, sans-serif !important;
        }
      `}</style>
    </div>
  );
};

export default HRPage;
