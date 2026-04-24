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
  CloseOutlined,
  ClockCircleOutlined,
  HistoryOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { formatPersianPrice, parseDateValue, safeJalaliFormat, toGregorianDateString, toPersianNumber } from '../utils/persianNumberFormatter';
import { isTaskDoneStatus, normalizeTaskStatus } from '../utils/taskCompletion';
import { MODULES } from '../moduleRegistry';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import PersianDatePicker from '../components/PersianDatePicker';
import { openTaskProcessModal } from '../utils/taskProcessModalEvents';
import { useCurrencyConfig } from '../utils/currency';
import { buildClientFallbackSystemCode } from '../utils/systemCode';
import GoalProgressSlider from '../components/goals/GoalProgressSlider';
import GoalsManager from '../components/goals/GoalsManager';
import { ensureDefaultHrTaskGoals, executeGoalProgress, normalizeGoalRecord } from '../utils/goals';
import FormulaEditorModal from '../components/formulas/FormulaEditorModal';
import ActivityPerformanceRulesManager from '../components/hr/ActivityPerformanceRulesManager';
import AdaptiveSelectField from '../components/AdaptiveSelectField';
import { evaluateGoalRewardRules, type GoalRewardEntry, type GoalRewardFormula } from '../utils/goalRewardRuntime';
import { syncGoalRewardEntriesForPayroll } from '../utils/goalRewardPayrollSync';
import {
  fetchPayrollLedgerEntries,
  mapPayrollLedgerEntriesToLines,
  markPayrollLedgerEntriesIncluded,
  sumPayrollLedgerEntries,
} from '../utils/payrollLedger';
import {
  evaluateActivityPerformanceRules,
  type ActivityPerformanceEntry,
  type ActivityPerformanceFormula,
  type ActivityPerformanceRule,
} from '../utils/activityPerformanceRuntime';
import { buildCommissionPreviewRows, type CommissionBasis, type CommissionPreviewRow } from '../utils/commissionRuntime';
import type { GoalRecord } from '../utils/goalTypes';
import { resolveOverlayPopupContainer, resolveSelectPopupContainer } from '../utils/popupContainer';

type TaskRecord = {
  id: string;
  name?: string | null;
  status?: string | null;
  assignee_id?: string | null;
  assignee_role_id?: string | null;
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
  [key: string]: any;
};

type ProfileRecord = {
  id: string;
  full_name?: string | null;
  related_profile_id?: string | null;
  source_table?: 'employees' | 'profiles';
  source_id?: string;
  employment_status?: string | null;
  role?: string | null;
  base_salary?: number | string | null;
  overtime_rate?: number | string | null;
  late_penalty_rate?: number | string | null;
  early_bonus_rate?: number | string | null;
  production_bonus_rate?: number | string | null;
  commission_percentage?: number | string | null;
  hire_date?: string | null;
  seniority_base_amount?: number | string | null;
  seniority_formula_id?: string | null;
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
  activityPerformanceTotal: number;
  overtimeHours: number;
  lateHours: number;
  bonusTotal: number;
  penaltyTotal: number;
  baseSalary: number;
  netPayable: number;
  detailRows: TaskDetailRow[];
  activityPerformanceEntries: ActivityPerformanceEntry[];
};

type PayrollFormValues = {
  base_salary: number;
  overtime_rate: number;
  late_penalty_rate: number;
  early_bonus_rate: number;
  production_bonus_rate: number;
  seniority_base_amount: number;
  seniority_formula_id?: string | null;
};

type EmployeeGoalTouchRow = {
  key: string;
  employeeId: string;
  employeeName: string;
  goalId: string;
  goalName: string;
  achievedValue: number;
  targetValue: number;
  activeLevelLabel: string;
  moduleLabel: string;
  periodLabel: string;
  rewardSuggestion: number;
  rewardEntries: GoalRewardEntry[];
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
  actual_check_in_time?: string | null;
  actual_check_out_time?: string | null;
  manual_check_in_time?: string | null;
  manual_check_out_time?: string | null;
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

const calculatePresenceMinutes = (rows: AttendanceComputedRow[]) => {
  const grouped = new Map<string, AttendanceComputedRow[]>();
  rows.forEach((row) => {
    const key = row.employeeId || row.employeeName || 'unknown';
    grouped.set(key, [...(grouped.get(key) || []), row]);
  });

  let total = 0;
  grouped.forEach((items) => {
    const sorted = [...items].sort((a, b) => {
      const aTime = parseDate(a.occurredAt || null)?.valueOf() || 0;
      const bTime = parseDate(b.occurredAt || null)?.valueOf() || 0;
      return aTime - bTime;
    });
    let openCheckIn: dayjs.Dayjs | null = null;
    sorted.forEach((row) => {
      const occurred = parseDate(row.occurredAt || null);
      if (!occurred) return;
      if (row.logType === 'check_in') {
        openCheckIn = occurred;
        return;
      }
      if (row.logType === 'check_out' && openCheckIn) {
        const diff = occurred.diff(openCheckIn, 'minute');
        if (diff > 0 && diff < 24 * 60) {
          total += diff;
        }
        openCheckIn = null;
      }
    });
  });
  return total;
};

const renderDateTime = (value: string | null | undefined) => safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || '-';

const buildSummaries = ({
  profiles,
  tasks,
  activityPerformanceEntries,
  monthStart,
  monthEnd,
  lineQuantityById,
  orderQuantityById,
}: {
  profiles: ProfileRecord[];
  tasks: TaskRecord[];
  activityPerformanceEntries: ActivityPerformanceEntry[];
  monthStart: dayjs.Dayjs;
  monthEnd: dayjs.Dayjs;
  lineQuantityById: Record<string, number>;
  orderQuantityById: Record<string, number>;
}) => {
  const now = dayjs();
  const tasksByAssignee = new Map<string, TaskRecord[]>();
  const activityEntriesByEmployee = new Map<string, ActivityPerformanceEntry[]>();

  (activityPerformanceEntries || []).forEach((entry) => {
    const employeeId = String(entry.employee_id || '').trim();
    if (!employeeId) return;
    activityEntriesByEmployee.set(employeeId, [...(activityEntriesByEmployee.get(employeeId) || []), entry]);
  });

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
    const employeeActivityEntries = (activityEntriesByEmployee.get(String(profile.source_id || profile.id || '')) || [])
      .filter((entry) => payrollEligibleTaskIds.has(String(entry.task_id)));
    const activityPerformanceTotal = employeeActivityEntries.reduce((sum, entry) => sum + toNumber(entry.amount), 0);
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
      (producedQty * productionBonusRate) +
      activityPerformanceTotal;
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
      activityPerformanceTotal,
      overtimeHours,
      lateHours,
      bonusTotal,
      penaltyTotal,
      baseSalary,
      netPayable,
      detailRows: sortedDetailRows,
      activityPerformanceEntries: employeeActivityEntries,
    } as EmployeeSummaryRow;
  });

  return rows.sort((a, b) => b.netPayable - a.netPayable);
};

const isCurrentlyCollaboratingProfile = (profile: ProfileRecord) => {
  if (profile.source_table !== 'employees') return true;
  return String(profile.employment_status || 'active').trim().toLowerCase() === 'active';
};

const HRPage: React.FC = () => {
  const navigate = useNavigate();
  const { employeeId } = useParams();
  const { message } = App.useApp();
  const currency = useCurrencyConfig();
  const currencyLabel = currency.label || 'تومان';
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRange, setSelectedRange] = useState<[Dayjs, Dayjs]>(() => getInitialRangeFromQuery());
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [activityPerformanceEntries, setActivityPerformanceEntries] = useState<ActivityPerformanceEntry[]>([]);
  const [goalTouchRows, setGoalTouchRows] = useState<EmployeeGoalTouchRow[]>([]);
  const [goalTouchLoading, setGoalTouchLoading] = useState(false);
  const [commissionRows, setCommissionRows] = useState<CommissionPreviewRow[]>([]);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [lineQuantityById, setLineQuantityById] = useState<Record<string, number>>({});
  const [orderQuantityById, setOrderQuantityById] = useState<Record<string, number>>({});
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [employeeFilterInitialized, setEmployeeFilterInitialized] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [payrollConfigModalOpen, setPayrollConfigModalOpen] = useState(false);
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
  const [activeTab, setActiveTab] = useState('performance');
  const [showKpiManager, setShowKpiManager] = useState(false);
  const [formulaOptions, setFormulaOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [formulaModalConfig, setFormulaModalConfig] = useState<{
    open: boolean;
    defaultScope: string;
    defaultContextType: string;
    defaultOutputType: string;
    assignToField?: keyof PayrollFormValues;
  }>({
    open: false,
    defaultScope: 'activity_performance',
    defaultContextType: 'task',
    defaultOutputType: 'money',
  });

  const formatMoney = useCallback((value: number) => `${formatPersianPrice(value)} ${currencyLabel}`, [currencyLabel]);

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
    void ensureDefaultHrTaskGoals();
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
      const [employeesResult, profilesResult, tasksResult, formulasResult] = await Promise.all([
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
        supabase
          .from('calculation_formulas')
          .select('id, name')
          .order('name', { ascending: true }),
      ]);

      if (employeesResult.error) throw employeesResult.error;
      if (profilesResult.error) throw profilesResult.error;
      if (tasksResult.error) throw tasksResult.error;
      if (formulasResult.error) throw formulasResult.error;

      const normalizedEmployees = (employeesResult.data || []).map((row: any) => ({
        id: String(row?.id),
        full_name: row?.full_name || null,
        related_profile_id: row?.related_profile_id || null,
        source_table: 'employees' as const,
        source_id: String(row?.id),
        employment_status: row?.employment_status || 'active',
        role: row?.employment_type || null,
        base_salary: row?.base_salary ?? 0,
        overtime_rate: row?.overtime_rate ?? 0,
        late_penalty_rate: row?.late_penalty_rate ?? 0,
        early_bonus_rate: row?.early_bonus_rate ?? 0,
        production_bonus_rate: row?.production_bonus_rate ?? 0,
        commission_percentage: row?.commission_percentage ?? 0,
        hire_date: row?.hire_date || null,
        seniority_base_amount: row?.seniority_base_amount ?? 0,
        seniority_formula_id: row?.seniority_formula_id || null,
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
        employment_status: null,
        role: row?.role || null,
        base_salary: row?.base_salary ?? 0,
        overtime_rate: row?.overtime_rate ?? 0,
        late_penalty_rate: row?.late_penalty_rate ?? 0,
        early_bonus_rate: row?.early_bonus_rate ?? 0,
        production_bonus_rate: row?.production_bonus_rate ?? 0,
        commission_percentage: row?.commission_percentage ?? 0,
        hire_date: row?.hire_date || null,
        insurance_subject: row?.insurance_subject ?? true,
        employee_insurance_rate: row?.employee_insurance_rate ?? 7,
        employer_insurance_rate: row?.employer_insurance_rate ?? 23,
      })) as ProfileRecord[];

      const normalizedProfiles = normalizedEmployees.length > 0
        ? normalizedEmployees
        : normalizedProfilesFallback;

      const normalizedTasks = (tasksResult.data || []).map((row: any) => ({
        ...row,
        id: String(row?.id),
        name: row?.name || null,
        status: row?.status || null,
        assignee_id: row?.assignee_id || null,
        assignee_role_id: row?.assignee_role_id || null,
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

      let nextActivityPerformanceEntries: ActivityPerformanceEntry[] = [];
      try {
        const [rulesResult, performanceFormulasResult] = await Promise.all([
          supabase
            .from('activity_performance_rules')
            .select('id, name, employee_id, task_type, formula_id, output_type, priority, conditions_all, conditions_any, is_active, config')
            .eq('is_active', true)
            .order('priority', { ascending: true }),
          supabase
            .from('calculation_formulas')
            .select('id, name, expression_config, output_type, config')
            .eq('is_active', true),
        ]);

        if (rulesResult.error) throw rulesResult.error;
        if (performanceFormulasResult.error) throw performanceFormulasResult.error;

        const employeeIdByAssigneeId = normalizedProfiles.reduce<Record<string, string>>((acc, profile) => {
          const assigneeId = String(profile.related_profile_id || profile.id || '').trim();
          const employeeId = String(profile.source_id || profile.id || '').trim();
          if (assigneeId && employeeId) acc[assigneeId] = employeeId;
          return acc;
        }, {});
        const taskMetricsById = normalizedTasks.reduce<Record<string, Record<string, any>>>((acc, task) => {
          const performance = evaluateTaskPerformance(task, dayjs());
          const spentHours = toNumber(task.spent_hours ?? task.actual_hours ?? task.duration_hours ?? 0);
          const meta = PERFORMANCE_TAG_META[performance.code];
          acc[String(task.id)] = {
            performance_code: performance.code,
            performance_label: meta.label,
            early_hours: Math.max(0, performance.earlyHours),
            late_hours: Math.max(0, performance.lateHours),
            early_minutes: Math.round(Math.max(0, performance.earlyHours) * 60),
            late_minutes: Math.round(Math.max(0, performance.lateHours) * 60),
            activity_minutes: Math.round(Math.max(0, spentHours) * 60),
            due_at: resolveDueDate(task),
            weight: task.weight ?? task.wage ?? 0,
          };
          return acc;
        }, {});

        nextActivityPerformanceEntries = await evaluateActivityPerformanceRules({
          rules: (rulesResult.data || []) as ActivityPerformanceRule[],
          formulas: (performanceFormulasResult.data || []) as ActivityPerformanceFormula[],
          tasks: normalizedTasks,
          employeeIdByAssigneeId,
          taskMetricsById,
        });
      } catch (error) {
        console.warn('Activity performance rules are not available yet.', error);
        nextActivityPerformanceEntries = [];
      }

      setProfiles(normalizedProfiles);
      setTasks(normalizedTasks);
      setActivityPerformanceEntries(nextActivityPerformanceEntries);
      setFormulaOptions(
        (formulasResult.data || [])
          .map((row: any) => ({
            label: String(row?.name || row?.id || '').trim(),
            value: String(row?.id || '').trim(),
          }))
          .filter((item) => item.label && item.value),
      );

      const [attendanceStatsResult, schedulesStatsResult, leaveStatsResult, overtimeStatsResult, missionStatsResult] = await Promise.allSettled([
        supabase
          .from('attendance_logs')
          .select('id, assignee_id, employee_id, related_profile_id, log_type, occurred_at, source_type, actual_check_in_time, actual_check_out_time, manual_check_in_time, manual_check_out_time, location_text, notes, created_by, updated_by, created_at, updated_at')
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
          actual_check_in_time: row?.actual_check_in_time || null,
          actual_check_out_time: row?.actual_check_out_time || null,
          manual_check_in_time: row?.manual_check_in_time || null,
          manual_check_out_time: row?.manual_check_out_time || null,
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

      if (!employeeFilterInitialized) {
        const defaultSelectedIds = normalizedProfiles
          .filter((profile) => isCurrentlyCollaboratingProfile(profile))
          .map((profile) => profile.id);
        setSelectedEmployeeIds(defaultSelectedIds);
        setEmployeeFilterInitialized(true);
      }
    } catch (err: any) {
      message.error(toFaErrorMessage(err as any, 'خطا در دریافت داده‌های منابع انسانی'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employeeFilterInitialized, message, monthEnd, monthStart]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const allSummaries = useMemo(() => {
    return buildSummaries({
      profiles,
      tasks,
      activityPerformanceEntries,
      monthStart,
      monthEnd,
      lineQuantityById,
      orderQuantityById,
    });
  }, [activityPerformanceEntries, lineQuantityById, monthEnd, monthStart, orderQuantityById, profiles, tasks]);

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

  const singleSelectedProfileForPayrollConfig = useMemo(() => {
    if (visibleSummaries.length !== 1) return null;
    return visibleSummaries[0]?.profile || null;
  }, [visibleSummaries]);

  useEffect(() => {
    if (activeTab !== 'goal_fulfillment') return;

    const run = async () => {
      setGoalTouchLoading(true);
      try {
        const [goalsResult, formulasResult] = await Promise.all([
          supabase
            .from('goals')
            .select('*')
            .eq('is_active', true)
            .order('updated_at', { ascending: false }),
          supabase
            .from('calculation_formulas')
            .select('id, name, expression_config, output_type, config')
            .eq('is_active', true)
            .eq('context_type', 'goal'),
        ]);
        if (goalsResult.error) throw goalsResult.error;
        if (formulasResult.error) throw formulasResult.error;

        const rewardFormulas = (formulasResult.data || []) as GoalRewardFormula[];

        const selectedProfiles = visibleSummaries
          .map((row) => row.profile)
          .filter((profile) => profile.source_table === 'employees' && profile.source_id);
        const nextRows: EmployeeGoalTouchRow[] = [];

        for (const profile of selectedProfiles) {
          const profileUserId = String(profile.related_profile_id || profile.id || '').trim();
          if (!profileUserId) continue;
          for (const rawGoal of (goalsResult.data || [])) {
            try {
              const goal = normalizeGoalRecord(rawGoal as GoalRecord);
              const snapshot = await executeGoalProgress(goal, {
                userId: profileUserId,
                roleId: null,
                permissions: null,
              });
              if (!snapshot || snapshot.achievedValue <= 0) continue;
              const rewardEntries = evaluateGoalRewardRules({
                snapshot,
                formulas: rewardFormulas,
              });
              nextRows.push({
                key: `${profile.source_id}_${goal.id}`,
                employeeId: String(profile.source_id || ''),
                employeeName: profile.full_name || String(profile.source_id || '-'),
                goalId: goal.id,
                goalName: goal.name,
                achievedValue: snapshot.achievedValue,
                targetValue: snapshot.targetValue,
                activeLevelLabel: snapshot.activeLevelKey ? snapshot.levels.find((item) => item.key === snapshot.activeLevelKey)?.label || '-' : 'در حال پیشروی',
                moduleLabel: snapshot.moduleLabel,
                periodLabel: `${snapshot.mainRange.startLabel} تا ${snapshot.mainRange.endLabel}`,
                rewardSuggestion: rewardEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
                rewardEntries,
              });
            } catch {
              continue;
            }
          }
        }

        setGoalTouchRows(nextRows);
      } catch (error) {
        console.warn('Goal fulfillment data is not available yet.', error);
        setGoalTouchRows([]);
      } finally {
        setGoalTouchLoading(false);
      }
    };

    void run();
  }, [activeTab, visibleSummaries]);

  useEffect(() => {
    if (activeTab !== 'commissions') return;

    const run = async () => {
      setCommissionLoading(true);
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select('id, name, status, invoice_date, total_invoice_amount, assignee_id, invoiceItems, payments')
          .gte('invoice_date', toGregorianDateString(monthStart, 'YYYY-MM-DD') || '')
          .lte('invoice_date', toGregorianDateString(monthEnd, 'YYYY-MM-DD') || '')
          .limit(3000);
        if (error) throw error;

        const selectedProfiles = visibleSummaries
          .map((row) => row.profile)
          .filter((profile) => profile.source_table === 'employees' && profile.source_id);
        const employeeIdByAssigneeId = selectedProfiles.reduce<Record<string, string>>((acc, profile) => {
          const assigneeId = String(profile.related_profile_id || profile.id || '').trim();
          const employeeId = String(profile.source_id || '').trim();
          if (assigneeId && employeeId) acc[assigneeId] = employeeId;
          return acc;
        }, {});
        const employeeDefaultCommissionByEmployeeId = selectedProfiles.reduce<Record<string, number>>((acc, profile) => {
          const employeeId = String(profile.source_id || '').trim();
          if (employeeId) acc[employeeId] = toNumber(profile.commission_percentage);
          return acc;
        }, {});

        const bases: CommissionBasis[] = ['approved_invoices', 'settled_invoices', 'settled_and_collected_cheques'];
        const nextRows = bases.flatMap((basis) => buildCommissionPreviewRows({
          invoices: (data || []) as any[],
          employeeIdByAssigneeId,
          employeeDefaultCommissionByEmployeeId,
          basis,
        }));

        setCommissionRows(nextRows);
      } catch (error) {
        console.warn('Commission preview is not available yet.', error);
        setCommissionRows([]);
      } finally {
        setCommissionLoading(false);
      }
    };

    void run();
  }, [activeTab, monthEnd, monthStart, visibleSummaries]);

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

  const performanceTotals = useMemo(() => {
    const totalsRow = visibleSummaries.reduce(
      (acc, row) => ({
        totalTasks: acc.totalTasks + row.totalTasks,
        doneCount: acc.doneCount + row.doneCount,
        overdueOpenCount: acc.overdueOpenCount + row.overdueOpenCount,
        doneEarlyCount: acc.doneEarlyCount + row.doneEarlyCount,
        doneOnTimeCount: acc.doneOnTimeCount + row.doneOnTimeCount,
        doneLateCount: acc.doneLateCount + row.doneLateCount,
        producedQty: acc.producedQty + row.producedQty,
      }),
      {
        totalTasks: 0,
        doneCount: 0,
        overdueOpenCount: 0,
        doneEarlyCount: 0,
        doneOnTimeCount: 0,
        doneLateCount: 0,
        producedQty: 0,
      },
    );

    const onTimeDoneCount = totalsRow.doneEarlyCount + totalsRow.doneOnTimeCount;
    return {
      ...totalsRow,
      onTimeDoneCount,
      completionRate: totalsRow.totalTasks > 0 ? (totalsRow.doneCount / totalsRow.totalTasks) * 100 : 0,
      onTimeRate: totalsRow.doneCount > 0 ? (onTimeDoneCount / totalsRow.doneCount) * 100 : 0,
      lateDoneRate: totalsRow.doneCount > 0 ? (totalsRow.doneLateCount / totalsRow.doneCount) * 100 : 0,
      overdueOpenRate: totalsRow.totalTasks > 0 ? (totalsRow.overdueOpenCount / totalsRow.totalTasks) * 100 : 0,
    };
  }, [visibleSummaries]);

  const goalFulfillmentTotals = useMemo(() => ({
    touchedGoals: goalTouchRows.length,
    achievedLevels: goalTouchRows.filter((row) => row.activeLevelLabel !== 'در حال پیشروی').length,
    rewardSuggestion: goalTouchRows.reduce((sum, row) => sum + row.rewardSuggestion, 0),
  }), [goalTouchRows]);

  const commissionTotals = useMemo(() => {
    const rowsByBasis = {
      approved_invoices: commissionRows.filter((row) => row.basis === 'approved_invoices'),
      settled_invoices: commissionRows.filter((row) => row.basis === 'settled_invoices'),
      settled_and_collected_cheques: commissionRows.filter((row) => row.basis === 'settled_and_collected_cheques'),
    };
    return {
      approved: rowsByBasis.approved_invoices.reduce((sum, row) => sum + row.commission_amount, 0),
      settled: rowsByBasis.settled_invoices.reduce((sum, row) => sum + row.commission_amount, 0),
      collectedCheque: rowsByBasis.settled_and_collected_cheques.reduce((sum, row) => sum + row.commission_amount, 0),
      invoices: new Set(commissionRows.map((row) => row.invoice_id)).size,
      pendingRows: rowsByBasis.settled_and_collected_cheques.length,
    };
  }, [commissionRows]);

  const attendanceInsights = useMemo(() => {
    const deltas = attendanceComputedRows.reduce(
      (acc, row) => ({
        lateMinutes: acc.lateMinutes + row.lateMinutes,
        earlyArrivalMinutes: acc.earlyArrivalMinutes + row.earlyArrivalMinutes,
        earlyLeaveMinutes: acc.earlyLeaveMinutes + row.earlyLeaveMinutes,
        overtimeStayMinutes: acc.overtimeStayMinutes + row.overtimeStayMinutes,
      }),
      { lateMinutes: 0, earlyArrivalMinutes: 0, earlyLeaveMinutes: 0, overtimeStayMinutes: 0 },
    );
    return {
      ...deltas,
      presenceMinutes: calculatePresenceMinutes(attendanceComputedRows),
    };
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

  const openPayrollConfigModal = (profile: ProfileRecord) => {
    setEditingProfile(profile);
    configForm.setFieldsValue({
      base_salary: toNumber(profile.base_salary),
      overtime_rate: toNumber(profile.overtime_rate),
      late_penalty_rate: toNumber(profile.late_penalty_rate),
      early_bonus_rate: toNumber(profile.early_bonus_rate),
      production_bonus_rate: toNumber(profile.production_bonus_rate),
      seniority_base_amount: toNumber(profile.seniority_base_amount),
      seniority_formula_id: profile.seniority_formula_id || null,
    });
    setPayrollConfigModalOpen(true);
  };

  const openConfigModal = (profile: ProfileRecord) => {
    setEditingProfile(profile);
    setConfigModalOpen(true);
  };

  const handleSavePayrollConfig = async () => {
    if (!editingProfile?.id) return;
    try {
      const values = await configForm.validateFields();
      setSavingProfileConfig(true);
      const targetTable = editingProfile.source_table === 'profiles' ? 'profiles' : 'employees';
      const targetId = editingProfile.source_id || editingProfile.id;
      const patch: Record<string, any> = {
        base_salary: toNumber(values.base_salary),
        overtime_rate: toNumber(values.overtime_rate),
        late_penalty_rate: toNumber(values.late_penalty_rate),
        early_bonus_rate: toNumber(values.early_bonus_rate),
        production_bonus_rate: toNumber(values.production_bonus_rate),
      };
      if (targetTable === 'employees') {
        patch.seniority_base_amount = toNumber(values.seniority_base_amount);
        patch.seniority_formula_id = values.seniority_formula_id || null;
      }
      const { error } = await supabase
        .from(targetTable)
        .update(patch)
        .eq('id', targetId);
      if (error) throw error;
      message.success('تنظیمات حقوق ذخیره شد.');
      setPayrollConfigModalOpen(false);
      await fetchData(true);
    } catch (err: any) {
      message.error(toFaErrorMessage(err as any, 'ذخیره تنظیمات ناموفق بود'));
    } finally {
      setSavingProfileConfig(false);
    }
  };

  const handleCreatePayrollSlips = useCallback(async () => {
    try {
      const targetRows = visibleSummaries.filter((row) => row.profile?.source_table === 'employees' && row.profile?.source_id);
      if (targetRows.length === 0) {
        message.info('برای کارکنان انتخاب‌شده داده‌ای برای ایجاد فیش حقوقی وجود ندارد.');
        return;
      }

      const employeeIds = targetRows.map((row) => String(row.profile.source_id || '')).filter(Boolean);
      const periodStart = toGregorianDateString(monthStart, 'YYYY-MM-DD');
      const periodEnd = toGregorianDateString(monthEnd, 'YYYY-MM-DD');
      if (!periodStart || !periodEnd) {
        message.error('بازه فیش حقوقی معتبر نیست.');
        return;
      }

      const { data: existingRows, error: existingError } = await supabase
        .from('payroll_slips')
        .select('id, employee_id')
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .in('employee_id', employeeIds);
      if (existingError) throw existingError;

      const existingEmployeeIds = new Set((existingRows || []).map((row: any) => String(row?.employee_id || '')).filter(Boolean));
      const rowsToCreate = targetRows.filter((row) => !existingEmployeeIds.has(String(row.profile.source_id || '')));
      if (rowsToCreate.length === 0) {
        message.info('برای این بازه، فیش حقوقی کارکنان انتخاب‌شده قبلا ایجاد شده است.');
        navigate('/payroll_slips');
        return;
      }

      await syncGoalRewardEntriesForPayroll(supabase as any, {
        profiles: rowsToCreate
          .map((row) => ({
            employeeId: String(row.profile.source_id || '').trim(),
            profileUserId: String(row.profile.related_profile_id || row.profile.id || '').trim(),
            profileName: row.name,
          }))
          .filter((item) => item.employeeId && item.profileUserId),
        periodStart,
        periodEnd,
      });

      const rowsToCreateEmployeeIds = rowsToCreate.map((row) => String(row.profile.source_id || '')).filter(Boolean);
      const ledgerEntries = await fetchPayrollLedgerEntries(supabase as any, rowsToCreateEmployeeIds, periodStart, periodEnd);
      const ledgerByEmployee = new Map<string, typeof ledgerEntries>();
      ledgerEntries.forEach((entry) => {
        const key = String(entry.employee_id || '').trim();
        if (!key) return;
        ledgerByEmployee.set(key, [...(ledgerByEmployee.get(key) || []), entry]);
      });

      const payloads = await Promise.all(rowsToCreate.map(async (row) => {
        const employeeIdValue = String(row.profile.source_id || '');
        const systemCode = await buildClientFallbackSystemCode(supabase, 'payroll_slips', 'payroll_slips');
        const employeeLedgerEntries = ledgerByEmployee.get(employeeIdValue) || [];
        const ledgerLines = mapPayrollLedgerEntriesToLines(employeeLedgerEntries);
        const ledgerNet = sumPayrollLedgerEntries(employeeLedgerEntries);
        const ledgerBonusTotal = employeeLedgerEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount || 0)), 0);
        const ledgerDeductionTotal = employeeLedgerEntries.reduce((sum, entry) => sum + Math.abs(Math.min(0, Number(entry.amount || 0))), 0);
        const activityPerformanceTotal = toNumber(row.activityPerformanceTotal);
        const activityPerformanceBonusTotal = Math.max(0, activityPerformanceTotal);
        const activityPerformancePenaltyTotal = Math.abs(Math.min(0, activityPerformanceTotal));
        const otherBonusTotal = Math.max(0, row.bonusTotal - activityPerformanceTotal);
        const lines = [
          { line_type: 'earning', title: 'حقوق پایه', amount: row.baseSalary, description: `بازه ${periodStart} تا ${periodEnd}` },
          { line_type: 'earning', title: 'کارکرد فعالیت‌ها', amount: row.taskWageTotal, description: `${row.detailRows.length} فعالیت` },
          ...(otherBonusTotal > 0 ? [{ line_type: 'bonus', title: 'مزایا و پاداش', amount: otherBonusTotal, description: 'محاسبه از عملکرد پایه' }] : []),
          ...(activityPerformanceTotal !== 0 ? [{
            line_type: activityPerformanceTotal < 0 ? 'deduction' : 'bonus',
            title: 'ضرایب فعالیت‌ها',
            amount: Math.abs(activityPerformanceTotal),
            description: `${toPersianNumber(row.activityPerformanceEntries.length)} محاسبه فرمولی`,
          }] : []),
          ...(row.penaltyTotal > 0 ? [{ line_type: 'deduction', title: 'کسورات', amount: row.penaltyTotal, description: 'تاخیر و سایر کسورات' }] : []),
          ...ledgerLines,
          ...(row.profile?.insurance_subject !== false && (toNumber(row.profile?.employee_insurance_rate) > 0)
            ? [{ line_type: 'deduction', title: 'بیمه سهم کارمند', amount: (row.netPayable * toNumber(row.profile?.employee_insurance_rate)) / 100, description: 'برآورد از تنظیمات پرسنل' }]
            : []),
        ];
        const employeeInsuranceAmount = row.profile?.insurance_subject === false
          ? 0
          : (row.netPayable * toNumber(row.profile?.employee_insurance_rate)) / 100;
        const employerInsuranceAmount = row.profile?.insurance_subject === false
          ? 0
          : (row.netPayable * toNumber(row.profile?.employer_insurance_rate)) / 100;

        return {
          name: `فیش حقوق ${row.name} ${toPersianNumber(safeJalaliFormat(monthStart.toISOString(), 'YYYY/MM'))}`,
          system_code: systemCode,
          employee_id: employeeIdValue,
          period_start: periodStart,
          period_end: periodEnd,
          status: 'draft',
          assignee_id: row.profile.related_profile_id || null,
          base_salary: row.baseSalary,
          task_wage_total: row.taskWageTotal,
          bonus_total: otherBonusTotal + activityPerformanceBonusTotal + ledgerBonusTotal,
          deduction_total: row.penaltyTotal + activityPerformancePenaltyTotal + ledgerDeductionTotal + employeeInsuranceAmount,
          insurance_employee_amount: employeeInsuranceAmount,
          insurance_employer_amount: employerInsuranceAmount,
          gross_amount: row.baseSalary + row.taskWageTotal + otherBonusTotal + activityPerformanceBonusTotal + ledgerBonusTotal,
          net_amount: row.netPayable + ledgerNet - employeeInsuranceAmount,
          lines,
          payments: [],
          performance_snapshot: {
            total_tasks: row.totalTasks,
            done_count: row.doneCount,
            overdue_open_count: row.overdueOpenCount,
            overtime_hours: row.overtimeHours,
            late_hours: row.lateHours,
            produced_qty: row.producedQty,
            activity_performance_total: activityPerformanceTotal,
            activity_performance_entries: row.activityPerformanceEntries,
            payroll_ledger_entry_ids: employeeLedgerEntries.map((entry) => entry.id),
          },
          task_ids: row.detailRows.map((detail) => detail.taskId).filter(Boolean),
          notes: `ایجاد شده از داشبورد منابع انسانی برای بازه ${periodStart} تا ${periodEnd}`,
        };
      }));

      const { data: insertedRows, error: insertError } = await supabase
        .from('payroll_slips')
        .insert(payloads)
        .select('id, employee_id');
      if (insertError) throw insertError;

      await Promise.all((insertedRows || []).map(async (inserted: any) => {
        const employeeId = String(inserted?.employee_id || '').trim();
        const slipId = String(inserted?.id || '').trim();
        const ids = (ledgerByEmployee.get(employeeId) || []).map((entry) => entry.id);
        await markPayrollLedgerEntriesIncluded(supabase as any, ids, slipId);
      }));

      message.success(`${toPersianNumber(rowsToCreate.length)} فیش حقوقی ایجاد شد.`);
      const firstId = insertedRows?.[0]?.id ? String(insertedRows[0].id) : '';
      if (firstId) navigate(`/payroll_slips/${firstId}`);
      else navigate('/payroll_slips');
    } catch (error: any) {
      message.error(toFaErrorMessage(error));
    }
  }, [message, monthEnd, monthStart, navigate, visibleSummaries]);

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

  const renderPerformanceMobileCard = (row: EmployeeSummaryRow) => (
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
          onClick={(event) => {
            event.stopPropagation();
            openConfigModal(row.profile);
          }}
        >
          ضریب
        </Button>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        <Tag color="blue">کل {toPersianNumber(row.totalTasks)}</Tag>
        <Tag color="green">انجام‌شده {toPersianNumber(row.doneCount)}</Tag>
        <Tag color="orange">به‌موقع/تعجیل {toPersianNumber(row.doneEarlyCount + row.doneOnTimeCount)}</Tag>
        <Tag color="red">باز عقب‌افتاده {toPersianNumber(row.overdueOpenCount)}</Tag>
      </div>
      <div className="text-xs text-gray-600 leading-6">
        <div>تکمیل با دیرکرد: <span className="persian-number text-red-700">{toPersianNumber(row.doneLateCount)}</span></div>
        <div>تعجیل: <span className="persian-number text-green-700">{toPersianNumber(row.doneEarlyCount)}</span></div>
        <div>تاخیر: <span className="persian-number text-red-700">{toPersianNumber(row.doneLateCount + row.overdueOpenCount)}</span></div>
        <div>تکمیل‌شده: <span className="persian-number text-blue-700">{toPersianNumber(row.doneCount)}</span></div>
      </div>
    </Card>
  );

  const renderTaskMobileCard = (row: TaskDetailRow) => (
    <Card key={row.key} className="mb-3" styles={{ body: { padding: 12 } }}>
      <div className="mb-1">
        <a
          href={`/tasks/${row.taskId}`}
          className="font-bold text-leather-700 hover:underline"
          onClick={(event) => {
            event.preventDefault();
            openTaskProcessModal({ taskId: row.taskId });
          }}
        >
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
          <div>دستمزد فعالیت: <span className="persian-number">{formatMoney(row.wageBase)}</span></div>
        <div>ضریب تولید: <span className="persian-number">{toPersianNumber(row.wageMultiplier)}</span></div>
          <div className="font-bold text-gray-800">دستمزد نهایی: <span className="persian-number">{formatMoney(row.wageFinal)}</span></div>
      </div>
    </Card>
  );

  const performanceColumns = [
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
      title: 'تعداد فعالیت‌ها',
      key: 'totalTasks',
      render: (_: unknown, row: EmployeeSummaryRow) => <span className="persian-number">{toPersianNumber(row.totalTasks)}</span>,
    },
    {
      title: 'تعجیل',
      key: 'doneEarlyCount',
      render: (_: unknown, row: EmployeeSummaryRow) => <span className="persian-number text-green-700">{toPersianNumber(row.doneEarlyCount)}</span>,
    },
    {
      title: 'تاخیر',
      key: 'delayCount',
      render: (_: unknown, row: EmployeeSummaryRow) => <span className="persian-number text-red-700">{toPersianNumber(row.doneLateCount + row.overdueOpenCount)}</span>,
    },
    {
      title: 'تکمیل‌شده',
      key: 'doneCount',
      render: (_: unknown, row: EmployeeSummaryRow) => <span className="persian-number text-blue-700">{toPersianNumber(row.doneCount)}</span>,
    },
    {
      title: 'ضریب',
      key: 'actions',
      width: 110,
      render: (_: unknown, row: EmployeeSummaryRow) => (
        <Button
          size="small"
          onClick={(event) => {
            event.stopPropagation();
            openConfigModal(row.profile);
          }}
        >
          ضریب
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
        <a
          href={`/tasks/${row.taskId}`}
          className="font-medium text-leather-700 hover:underline"
          onClick={(event) => {
            event.preventDefault();
            openTaskProcessModal({ taskId: row.taskId });
          }}
        >
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
      render: (val: number) => <span className="persian-number">{formatMoney(val)}</span>,
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
      render: (val: number) => <span className="persian-number font-bold">{formatMoney(val)}</span>,
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
      render: (val: number) => <span className="persian-number">{formatMoney(val)}</span>,
    },
    {
      title: 'کارکرد',
      dataIndex: 'taskWageTotal',
      key: 'taskWageTotal',
      render: (val: number) => <span className="persian-number">{formatMoney(val)}</span>,
    },
    {
      title: 'ضرایب فعالیت',
      dataIndex: 'activityPerformanceTotal',
      key: 'activityPerformanceTotal',
      render: (val: number) => <span className="persian-number text-green-700">{formatMoney(val)}</span>,
    },
    {
      title: 'مزایا',
      dataIndex: 'bonusTotal',
      key: 'bonusTotal',
      render: (val: number) => <span className="persian-number text-green-700">{formatMoney(val)}</span>,
    },
    {
      title: 'کسورات',
      dataIndex: 'penaltyTotal',
      key: 'penaltyTotal',
      render: (val: number) => <span className="persian-number text-red-700">{formatMoney(val)}</span>,
    },
    {
      title: 'خالص',
      dataIndex: 'netPayable',
      key: 'netPayable',
      render: (val: number) => <span className="persian-number font-bold">{formatMoney(val)}</span>,
    },
  ];

  const goalFulfillmentColumns = [
    {
      title: 'کارمند',
      dataIndex: 'employeeName',
      key: 'employeeName',
      render: (val: string) => <span className="font-bold text-leather-700">{val}</span>,
    },
    {
      title: 'هدف',
      dataIndex: 'goalName',
      key: 'goalName',
    },
    {
      title: 'ماژول',
      dataIndex: 'moduleLabel',
      key: 'moduleLabel',
      render: (val: string) => <Tag>{val}</Tag>,
    },
    {
      title: 'پیشرفت',
      key: 'progress',
      render: (_: unknown, row: EmployeeGoalTouchRow) => (
        <div className="text-sm">
          <div>تحقق: <span className="persian-number">{toPersianNumber(row.achievedValue)}</span></div>
          <div>هدف: <span className="persian-number">{toPersianNumber(row.targetValue)}</span></div>
        </div>
      ),
    },
    {
      title: 'سطح',
      dataIndex: 'activeLevelLabel',
      key: 'activeLevelLabel',
      render: (val: string) => <Tag color={val === 'در حال پیشروی' ? 'blue' : 'gold'}>{val}</Tag>,
    },
    {
      title: 'بازه هدف',
      dataIndex: 'periodLabel',
      key: 'periodLabel',
    },
    {
      title: 'پاداش/جریمه',
      dataIndex: 'rewardSuggestion',
      key: 'rewardSuggestion',
      render: (_: unknown, row: EmployeeGoalTouchRow) => (
        <div className="text-sm">
          <div className={`persian-number font-bold ${row.rewardSuggestion < 0 ? 'text-red-700' : 'text-green-700'}`}>
            {formatMoney(row.rewardSuggestion)}
          </div>
          <div className="mt-1 text-xs leading-6 text-gray-500">
            {row.rewardEntries.length > 0
              ? row.rewardEntries.map((entry) => entry.title).join(' | ')
              : 'تعریف نشده'}
          </div>
        </div>
      ),
    },
  ];

  const commissionBasisLabel: Record<CommissionBasis, string> = {
    approved_invoices: 'فاکتور تاییدشده',
    settled_invoices: 'فاکتور تسویه‌شده',
    settled_and_collected_cheques: 'تسویه و چک وصول‌شده',
  };

  const commissionColumns = [
    {
      title: 'کارمند',
      key: 'employeeName',
      render: (_: unknown, row: CommissionPreviewRow) => (
        <span className="font-bold text-leather-700">
          {profiles.find((profile) => String(profile.source_id || '') === String(row.employee_id))?.full_name || row.employee_id}
        </span>
      ),
    },
    {
      title: 'فاکتور',
      dataIndex: 'invoice_name',
      key: 'invoice_name',
      render: (val: string, row: CommissionPreviewRow) => (
        <a href={`/invoices/${row.invoice_id}`} className="text-leather-700 hover:underline">
          {val}
        </a>
      ),
    },
    {
      title: 'مبنا',
      dataIndex: 'basis',
      key: 'basis',
      render: (val: CommissionBasis) => <Tag>{commissionBasisLabel[val] || val}</Tag>,
    },
    {
      title: 'نسبت احراز',
      dataIndex: 'eligible_ratio',
      key: 'eligible_ratio',
      render: (val: number) => <span className="persian-number">{toPersianNumber((val * 100).toFixed(1))}%</span>,
    },
    {
      title: 'پورسانت',
      dataIndex: 'commission_amount',
      key: 'commission_amount',
      render: (val: number) => <span className="persian-number text-green-700">{formatMoney(val)}</span>,
    },
    {
      title: 'تاریخ',
      dataIndex: 'invoice_date',
      key: 'invoice_date',
      render: (val: string | null) => val ? toPersianNumber(safeJalaliFormat(val, 'YYYY/MM/DD')) : '-',
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
            icon={<SafetyCertificateOutlined />}
            onClick={() => openPayrollConfigModal(selectedEmployeeSummary.profile)}
            className="w-full rounded-xl"
          >
            حقوق و سنوات
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  const performanceTabContent = (
    <>
      <Row gutter={[12, 12]} className="mb-4">
        <Col xs={24} md={6}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">تعداد فعالیت‌ها</div>
            <div className="text-2xl font-black">{toPersianNumber(performanceTotals.totalTasks)}</div>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">تعجیل</div>
            <div className="text-2xl font-black text-green-700">{toPersianNumber(performanceTotals.doneEarlyCount)}</div>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">تاخیر</div>
            <div className="text-2xl font-black text-red-700">{toPersianNumber(performanceTotals.doneLateCount + performanceTotals.overdueOpenCount)}</div>
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">تکمیل‌شده</div>
            <div className="text-2xl font-black text-blue-700">{toPersianNumber(performanceTotals.doneCount)}</div>
          </Card>
        </Col>
      </Row>

      <Card>
        {visibleSummaries.length === 0 ? (
          <Empty description="برای این بازه داده‌ای یافت نشد." />
        ) : (
          isMobile ? (
            <div>{visibleSummaries.map(renderPerformanceMobileCard)}</div>
          ) : (
            <Table
              rowKey="key"
              columns={performanceColumns}
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
          <Card><div className="text-xs text-gray-500 mb-1">جمع حضور</div><div className="text-lg font-black text-blue-700">{formatMinutesLabel(attendanceInsights.presenceMinutes)}</div></Card>
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

  const goalFulfillmentTabContent = (
    <>
      <Row gutter={[12, 12]} className="mb-4">
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">اهداف لمس‌شده</div>
            <div className="text-2xl font-black">{toPersianNumber(goalFulfillmentTotals.touchedGoals)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">سطح‌های محقق‌شده</div>
            <div className="text-2xl font-black">{toPersianNumber(goalFulfillmentTotals.achievedLevels)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">پاداش هدف پیشنهادی</div>
            <div className="text-2xl font-black">{formatMoney(goalFulfillmentTotals.rewardSuggestion)}</div>
          </Card>
        </Col>
      </Row>
      <Card className="mb-4">
        <GoalProgressSlider moduleId="tasks" placement="dashboard" />
      </Card>
      <Card>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button onClick={() => setActiveTab('performance')}>مشاهده عملکرد فعالیت‌ها</Button>
          <Button onClick={() => navigate('/reports')}>گزارش‌ساز</Button>
          <Button onClick={() => setShowKpiManager((prev) => !prev)}>
            {showKpiManager ? 'بستن مدیریت اهداف' : 'مدیریت اهداف'}
          </Button>
        </div>
        {goalTouchLoading ? (
          <div className="py-10 flex items-center justify-center"><Spin /></div>
        ) : goalTouchRows.length === 0 ? (
          <Empty description="برای نیروهای انتخاب‌شده هنوز هدف لمس‌شده‌ای پیدا نشد." />
        ) : (
          <Table
            rowKey="key"
            columns={goalFulfillmentColumns}
            dataSource={goalTouchRows}
            pagination={{ pageSize: 12, showSizeChanger: false }}
            scroll={{ x: 1200 }}
          />
        )}
      </Card>
      {showKpiManager ? (
        <Card className="mt-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-black text-gray-800 dark:text-gray-100">مدیریت اهداف</div>
              <div className="mt-1 text-xs leading-6 text-gray-500">
                فرمول‌های پاداش و محاسبه هر هدف داخل فرم ایجاد یا ویرایش همان هدف تعریف می‌شوند.
              </div>
            </div>
          </div>
          <GoalsManager inline defaultModuleId="tasks" />
        </Card>
      ) : null}
    </>
  );

  const commissionsTabContent = (
    <>
      <Row gutter={[12, 12]} className="mb-4">
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">پورسانت بر مبنای تایید</div>
            <div className="text-2xl font-black">{formatMoney(commissionTotals.approved)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">پورسانت بر مبنای تسویه</div>
            <div className="text-2xl font-black">{formatMoney(commissionTotals.settled)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">مبنای وصول چک</div>
            <div className="text-2xl font-black">{formatMoney(commissionTotals.collectedCheque)}</div>
          </Card>
        </Col>
      </Row>
      <Card>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button onClick={() => navigate('/invoices')}>فاکتورهای فروش</Button>
          <Button onClick={() => navigate('/products')}>درصد پورسانت محصولات</Button>
        </div>
        {commissionLoading ? (
          <div className="py-10 flex items-center justify-center"><Spin /></div>
        ) : commissionRows.length === 0 ? (
          <Empty description="برای این بازه پورسانتی محاسبه نشد." />
        ) : (
          <Table
            rowKey={(row) => `${row.employee_id}_${row.invoice_id}_${row.basis}`}
            columns={commissionColumns}
            dataSource={commissionRows}
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
            <div className="text-2xl font-black">{formatMoney(totals.payable)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">برآورد سهم بیمه کارمند</div>
            <div className="text-2xl font-black">{formatMoney(insuranceTotals.employee)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">برآورد سهم بیمه کارفرما</div>
            <div className="text-2xl font-black">{formatMoney(insuranceTotals.employer)}</div>
          </Card>
        </Col>
      </Row>
      <Card>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button onClick={() => navigate('/employees')}>تنظیمات حقوقی کارکنان</Button>
          <Button
            onClick={() => singleSelectedProfileForPayrollConfig && openPayrollConfigModal(singleSelectedProfileForPayrollConfig)}
            disabled={!singleSelectedProfileForPayrollConfig}
          >
            تنظیمات حقوق و سنوات
          </Button>
          <Button type="primary" onClick={handleCreatePayrollSlips}>
            ایجاد فیش حقوقی
          </Button>
        </div>
        {!singleSelectedProfileForPayrollConfig ? (
          <div className="mb-4 text-xs leading-6 text-gray-500">
            برای ویرایش حقوق پایه، اضافه‌کار و سنوات، یک کارمند را از فیلتر بالای صفحه انتخاب کنید.
          </div>
        ) : null}
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
                    <div className="text-2xl font-black">{formatMoney(selectedEmployeeSummary.taskWageTotal)}</div>
                  </Card>
                </Col>
                <Col xs={24} md={6}>
                  <Card>
                    <div className="text-xs text-gray-500 mb-1">خالص قابل پرداخت</div>
                    <div className="text-2xl font-black">{formatMoney(selectedEmployeeSummary.netPayable)}</div>
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
              <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-[280px_minmax(260px,1fr)_auto_auto]'}`}>
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
                  icon={<CloseOutlined />}
                  onClick={() => setSelectedEmployeeIds([])}
                  disabled={!selectedEmployeeIds.length}
                  className="w-full rounded-xl"
                >
                  حذف فیلتر
                </Button>
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
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              { key: 'performance', label: 'عملکرد', children: performanceTabContent },
              { key: 'attendance', label: 'تردد', children: attendanceTabContent },
              { key: 'schedules', label: 'برنامه حضور', children: schedulesTabContent },
              { key: 'requests', label: 'درخواست‌ها', children: requestsTabContent },
              { key: 'goals', label: 'تحقق اهداف', children: goalFulfillmentTabContent },
              { key: 'commissions', label: 'پورسانت‌ها', children: commissionsTabContent },
              { key: 'payroll', label: 'فیش حقوقی', children: payrollTabContent },
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
                <AdaptiveSelectField
                  showSearch
                  optionFilterProp="label"
                  options={attendanceEmployeeOptions}
                  disabled={attendanceModalMode === 'view'}
                  placeholder="نام کارمند"
                  getPopupContainer={resolveOverlayPopupContainer}
                  modalContainer={resolveOverlayPopupContainer}
                  overlayZIndexBase={12000}
                />
              </Form.Item>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Form.Item
                  name="log_type"
                  label="نوع ثبت"
                  rules={[{ required: true, message: 'نوع ثبت الزامی است' }]}
                >
                  <AdaptiveSelectField
                    disabled={attendanceModalMode === 'view'}
                    options={[
                      { label: 'ورود', value: 'check_in' },
                      { label: 'خروج', value: 'check_out' },
                    ]}
                    getPopupContainer={resolveOverlayPopupContainer}
                    modalContainer={resolveOverlayPopupContainer}
                    overlayZIndexBase={12000}
                  />
                </Form.Item>

                <Form.Item
                  name="source_type"
                  label="منبع ثبت"
                  rules={[{ required: true, message: 'منبع ثبت الزامی است' }]}
                >
                  <AdaptiveSelectField
                    disabled={attendanceModalMode === 'view'}
                    options={[
                      { label: 'دستی', value: 'manual' },
                      { label: 'وب فرم', value: 'web_form' },
                      { label: 'QR', value: 'qr' },
                      { label: 'سیستم', value: 'system' },
                    ]}
                    getPopupContainer={resolveOverlayPopupContainer}
                    modalContainer={resolveOverlayPopupContainer}
                    overlayZIndexBase={12000}
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
                  <ClockCircleOutlined className="text-green-600" />
                  <div className="min-w-0">
                    <div className="text-gray-400">ورود واقعی</div>
                    <div className="truncate font-bold text-gray-700 dark:text-gray-200">
                      {attendanceModalRecord.actual_check_in_time ? toPersianNumber(attendanceModalRecord.actual_check_in_time.slice(0, 5)) : '-'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <ClockCircleOutlined className="text-red-600" />
                  <div className="min-w-0">
                    <div className="text-gray-400">خروج واقعی</div>
                    <div className="truncate font-bold text-gray-700 dark:text-gray-200">
                      {attendanceModalRecord.actual_check_out_time ? toPersianNumber(attendanceModalRecord.actual_check_out_time.slice(0, 5)) : '-'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <ClockCircleOutlined className="text-sky-600" />
                  <div className="min-w-0">
                    <div className="text-gray-400">ورود دستی</div>
                    <div className="truncate font-bold text-gray-700 dark:text-gray-200">
                      {renderDateTime(attendanceModalRecord.manual_check_in_time)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <ClockCircleOutlined className="text-orange-600" />
                  <div className="min-w-0">
                    <div className="text-gray-400">خروج دستی</div>
                    <div className="truncate font-bold text-gray-700 dark:text-gray-200">
                      {renderDateTime(attendanceModalRecord.manual_check_out_time)}
                    </div>
                  </div>
                </div>
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
        title={`ضرایب فعالیت‌ها - ${editingProfile?.full_name || editingProfile?.id || ''}`}
        open={configModalOpen}
        onCancel={() => setConfigModalOpen(false)}
        footer={null}
        width={980}
        destroyOnHidden
      >
        <ActivityPerformanceRulesManager
          employeeProfileId={String(editingProfile?.related_profile_id || editingProfile?.id || '').trim() || null}
        />
      </Modal>

      <Modal
        title={`تنظیمات حقوق و سنوات - ${editingProfile?.full_name || editingProfile?.id || ''}`}
        open={payrollConfigModalOpen}
        forceRender
        onCancel={() => setPayrollConfigModalOpen(false)}
        onOk={handleSavePayrollConfig}
        confirmLoading={savingProfileConfig}
        okText="ذخیره"
        cancelText="انصراف"
        width={780}
      >
        <Form form={configForm} layout="vertical">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
            <Form.Item name="seniority_base_amount" label="مبلغ پایه سنوات">
              <InputNumber min={0} className="w-full" />
            </Form.Item>
          </div>
          <Form.Item name="seniority_formula_id" label="فرمول سنوات">
            <Space.Compact className="w-full">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                getPopupContainer={resolveSelectPopupContainer}
                value={configForm.getFieldValue('seniority_formula_id') || undefined}
                onChange={(value) => configForm.setFieldValue('seniority_formula_id', value || null)}
                options={formulaOptions.map((item: any) => ({
                  label: item.label,
                  value: item.value,
                }))}
                placeholder="فرمول سنوات را انتخاب کنید"
                className="w-full"
              />
              <Button
                onClick={() =>
                  setFormulaModalConfig({
                    open: true,
                    defaultScope: 'payroll',
                    defaultContextType: 'employee',
                    defaultOutputType: 'money',
                    assignToField: 'seniority_formula_id',
                  })
                }
              >
                +
              </Button>
            </Space.Compact>
          </Form.Item>
        </Form>
      </Modal>
      <FormulaEditorModal
        open={formulaModalConfig.open}
        onCancel={() => setFormulaModalConfig((current) => ({ ...current, open: false }))}
        defaultScope={formulaModalConfig.defaultScope}
        defaultContextType={formulaModalConfig.defaultContextType}
        defaultOutputType={formulaModalConfig.defaultOutputType}
        onSaved={(formula) => {
          setFormulaOptions((current) => {
            if (current.some((item) => item.value === formula.id)) return current;
            return [...current, { label: formula.name, value: formula.id }].sort((a, b) => a.label.localeCompare(b.label, 'fa'));
          });
          if (formulaModalConfig.assignToField) {
            configForm.setFieldValue(formulaModalConfig.assignToField, formula.id);
          }
        }}
      />
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
