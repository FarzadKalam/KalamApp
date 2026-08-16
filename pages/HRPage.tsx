import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Progress,
  Row,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Tabs,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  EditOutlined,
  EyeOutlined,
  HistoryOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { formatPersianPrice, formatPersianTime, parseDateValue, safeJalaliFormat, toGregorianDateString, toPersianNumber } from '../utils/persianNumberFormatter';
import { isTaskDoneStatus, normalizeTaskStatus } from '../utils/taskCompletion';
import { MODULES } from '../moduleRegistry';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import PersianDatePicker from '../components/PersianDatePicker';
import PersianDateRangePicker, { type PersianDateRangeValue } from '../components/PersianDateRangePicker';
import { openTaskProcessModal } from '../utils/taskProcessModalEvents';
import { useCurrencyConfig } from '../utils/currency';
import { buildClientFallbackSystemCode } from '../utils/systemCode';
import GoalProgressSlider from '../components/goals/GoalProgressSlider';
import GoalsManager from '../components/goals/GoalsManager';
import { ensureDefaultHrTaskGoals, executeGoalProgressForSubjects, normalizeGoalRecord, resolveGoalAssignedMembers } from '../utils/goals';
import FormulaEditorModal from '../components/formulas/FormulaEditorModal';
import ActivityPerformanceRulesManager from '../components/hr/ActivityPerformanceRulesManager';
import AdaptiveSelectField from '../components/AdaptiveSelectField';
import SmartFieldRenderer from '../components/SmartFieldRenderer';
import { evaluateGoalRewardRules, type GoalRewardEntry, type GoalRewardFormula } from '../utils/goalRewardRuntime';
import { buildGoalRewardSourceKey, syncGoalRewardEntriesForPayroll } from '../utils/goalRewardPayrollSync';
import { syncEmployeeCompensationEntriesForPayroll } from '../utils/employeeCompensationPayrollSync';
import { buildPayrollSlipDraft, type PayrollSlipPayment } from '../utils/payrollSlipDraft';
import { syncSeniorityPayrollEntry, calcYearsOfService } from '../utils/seniorityRuntime';
import {
  isMissingPayrollLedgerError,
  type PayrollLedgerEntry,
} from '../utils/payrollLedger';
import { resolveWorkScheduleDayPlan } from '../utils/workSchedulePlan';
import {
  HR_QUERY_KEY_EMPLOYEES,
  buildHrFilterQuery,
  getInitialHrRangeFromQuery,
  isSameHrRange,
  parseHrEmployeeFilterParam,
  persistHrEmployees,
  persistHrRange,
  readHrRangeFromSearch,
  readPersistedHrEmployees,
  shiftHrRangeByMonths,
  shouldDeferHrFilterUrlSync,
  toNativeGregorianDateString,
} from '../utils/hrFilters';

const HR_TASK_FETCH_LIMIT = 1500;
const HR_STATS_FETCH_LIMIT = 1500;
const HR_ATTENDANCE_QUERY_PAGE_SIZE = 500;
const COMMISSION_QUERY_PAGE_SIZE = 250;
const COMMISSION_QUERY_ID_CHUNK_SIZE = 200;
const COMMISSION_INVOICE_SELECT =
  'id, name, status, invoice_date, approved_at, settled_at, completed_at, updated_at, total_invoice_amount, total_received_amount, remaining_balance, assignee_id, invoiceItems, payments, tags';
// این انتخاب حداقلی فقط تا زمان اعمال migrationهای موردنیاز در محیط‌های قدیمی
// استفاده می‌شود تا محاسبه متوقف نشود؛ schema رسمی شامل تاریخ‌های چرخهٔ فاکتور است.
const COMMISSION_INVOICE_SELECT_FALLBACK =
  'id, name, status, invoice_date, assignee_id, invoiceItems, payments';
const COMMISSION_CHEQUE_SELECT = 'id, status, cleared_at, spent_date, updated_at';
const COMMISSION_CHEQUE_SELECT_FALLBACK = 'id, status, updated_at';

const fetchAllCommissionPages = async <T,>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
) => {
  const rows: T[] = [];
  for (let from = 0; ; from += COMMISSION_QUERY_PAGE_SIZE) {
    const result = await fetchPage(from, from + COMMISSION_QUERY_PAGE_SIZE - 1);
    if (result.error) return { data: null, error: result.error };
    const page = result.data || [];
    rows.push(...page);
    if (page.length < COMMISSION_QUERY_PAGE_SIZE) return { data: rows, error: null };
  }
};

const chunkCommissionQueryIds = <T,>(items: T[]) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += COMMISSION_QUERY_ID_CHUNK_SIZE) {
    chunks.push(items.slice(index, index + COMMISSION_QUERY_ID_CHUNK_SIZE));
  }
  return chunks;
};
const HR_GOAL_SELECT =
  'id, org_id, module_id, name, description, goal_scope, period_unit, subperiod_unit, metric_type, metric_field_key, date_field_key, target_value, levels_enabled, bronze_value, silver_value, gold_value, assignee_user_ids, assignee_role_ids, conditions_all, conditions_any, config, is_active, created_at, updated_at, created_by, updated_by';
const HR_EMPLOYEE_SELECT =
  'id, full_name, related_profile_id, employment_status, employment_type, salary_type, default_work_schedule_id, has_flexible_hours, works_on_official_holidays, expected_daily_minutes, grace_minutes_for_late, overtime_auto_approve, leave_auto_approve, mission_auto_approve, base_salary, hourly_rate, overtime_rate, late_penalty_rate, early_bonus_rate, production_bonus_rate, commission_percentage, hire_date, seniority_mode, seniority_base_amount, seniority_formula_id, monthly_paid_leave_hours, insurance_subject, employee_insurance_rate, employer_insurance_rate';
const HR_EMPLOYEE_SELECT_FALLBACK =
  'id, full_name, related_profile_id, employment_status, employment_type, salary_type, default_work_schedule_id, has_flexible_hours, expected_daily_minutes, grace_minutes_for_late, overtime_auto_approve, leave_auto_approve, mission_auto_approve, base_salary, hourly_rate, overtime_rate, late_penalty_rate, early_bonus_rate, production_bonus_rate, commission_percentage, hire_date, seniority_base_amount, seniority_formula_id, monthly_paid_leave_hours, insurance_subject, employee_insurance_rate, employer_insurance_rate';
const HR_PROFILE_SELECT =
  'id, full_name, role, salary_type, default_work_schedule_id, has_flexible_hours, expected_daily_minutes, grace_minutes_for_late, overtime_auto_approve, leave_auto_approve, mission_auto_approve, base_salary, hourly_rate, overtime_rate, late_penalty_rate, early_bonus_rate, production_bonus_rate, commission_percentage';
const HR_TASK_SELECT =
  'id, name, status, task_type, assignee_id, assignee_role_id, assignee_type, due_date, due_at, completed_at, created_at, wage, produced_qty, spent_hours, estimated_hours, actual_hours, duration_hours, weight, related_to_module, related_production_order, production_line_id, recurrence_info, source_template_id';
const HR_PROFILE_SELECT_FALLBACK = 'id, full_name, role';
const HR_PROFILE_SELECT_MINIMAL = 'id, full_name';
const HR_TASK_SELECT_FALLBACK =
  'id, name, status, task_type, assignee_id, assignee_role_id, assignee_type, due_date, due_at, completed_at, created_at, wage, produced_qty, spent_hours, estimated_hours, weight, related_to_module, related_production_order, production_line_id, recurrence_info, source_template_id';
const HR_TASK_SELECT_MINIMAL =
  'id, name, status, assignee_id, created_at, spent_hours, wage, produced_qty';
const PAYROLL_ADVANCE_SETTLEMENT_STATUSES = new Set(['paid', 'posted', 'settled', 'completed']);
const ADVANCE_VISIBLE_STATUSES = new Set(['requested', 'approved', 'paid', 'posted', 'settled', 'completed']);
const isMissingSelectColumnError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  if (code === 'PGRST204') return true;
  return text.includes('column') && (
    text.includes('does not exist') ||
    text.includes('could not find') ||
    text.includes('schema cache')
  );
};
import {
  type ActivityPerformanceEntry,
} from '../utils/activityPerformanceRuntime';
import {
  buildCommissionDraftRows,
  buildCommissionDraftSourceKey,
  getCommissionLineReviewBucket,
  mergeCommissionInvoicePayments,
  recomputeCommissionDraftRow,
  type CommissionBasis,
  type CommissionDecisionStatus,
  type CommissionDraftLine,
  type CommissionDraftRow,
  type CommissionPercentMode,
  type CommissionPersistedDraft,
  type CommissionPostedAllocation,
  type CommissionReviewBucket,
} from '../utils/commissionRuntime';
import type { GoalRecord } from '../utils/goalTypes';
import { resolveOverlayPopupContainer, resolveSelectPopupContainer } from '../utils/popupContainer';
import { fetchAssigneeDirectory } from '../utils/referenceData';
import { employeesModule } from '../modules/employeesConfig';
import { fetchCurrentUserRecordAccessContext, fetchCurrentUserRolePermissions, type ModulePermissionConfig } from '../utils/permissions';
import { evaluateLegacyVisibilityRule } from '../utils/conditionalFieldRules';
import { DEFAULT_SALARY_TYPE, getSalaryTypeLabelFa, resolvePayrollBaseCompensation } from '../utils/payrollSalaryType';
import { getHolidaySummaryForDate } from '../utils/holidayCalendar';
import PrintSection from '../components/moduleShow/PrintSection';
import { useListPrintManager } from '../utils/printTemplates/useListPrintManager';
import { openPrintTemplateEditor } from '../utils/printTemplates/openTemplateEditor';
import {
  buildAttendanceSegments,
  getIncompleteAttendanceRowIds,
  getAttendanceCheckInAt,
  getAttendanceCheckOutAt,
  getAttendanceDateValue,
} from '../utils/attendancePresence';

const COMMISSION_MODAL_Z_INDEX = 14000;
const COMMISSION_PRINT_MODAL_Z_INDEX = COMMISSION_MODAL_Z_INDEX + 100;

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
  salary_type?: string | null;
  default_work_schedule_id?: string | null;
  has_flexible_hours?: boolean | null;
  works_on_official_holidays?: boolean | null;
  expected_daily_minutes?: number | string | null;
  grace_minutes_for_late?: number | string | null;
  overtime_auto_approve?: boolean | null;
  leave_auto_approve?: boolean | null;
  mission_auto_approve?: boolean | null;
  base_salary?: number | string | null;
  hourly_rate?: number | string | null;
  overtime_rate?: number | string | null;
  late_penalty_rate?: number | string | null;
  early_bonus_rate?: number | string | null;
  production_bonus_rate?: number | string | null;
  commission_percentage?: number | string | null;
  hire_date?: string | null;
  seniority_mode?: string | null;
  seniority_base_amount?: number | string | null;
  seniority_formula_id?: string | null;
  monthly_paid_leave_hours?: number | string | null;
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
  weight: number;
  wageBase: number;
  wageMultiplier: number;
  wageFinal: number;
  activityWageAmount: number;
  activityBonusAmount: number;
  activityPenaltyAmount: number;
  activityPerformanceAmount: number;
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
  activityWageTotal: number;
  activityBonusTotal: number;
  activityPenaltyTotal: number;
  activityPerformanceTotal: number;
  overtimeHours: number;
  lateHours: number;
  bonusTotal: number;
  penaltyTotal: number;
  baseSalary: number;
  netPayable: number;
  detailRows: TaskDetailRow[];
  payrollDetailRows: TaskDetailRow[];
  payrollTaskIds: string[];
  activityPerformanceEntries: ActivityPerformanceEntry[];
};

type PayrollFormValues = {
  [key: string]: any;
};

type CommissionModalTab = CommissionReviewBucket | 'previous_calculations';

type CommissionCalculationFormValues = {
  period_range: PersianDateRangeValue | null;
  employee_profile_id: string;
  basis: CommissionBasis;
  percent_mode: CommissionPercentMode;
};

type CommissionLedgerRow = {
  id: string;
  employee_id: string | null;
  employee_name: string;
  period_start: string | null;
  period_end: string | null;
  entry_type: string;
  title: string | null;
  amount: number;
  status: string | null;
  source_record_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  assignee_id: string | null;
  details: Record<string, any> | null;
};

type EmployeeGoalTouchRow = {
  key: string;
  employeeId: string;
  employeeName: string;
  profileRoleId?: string | null;
  goalId: string;
  goalName: string;
  achievedValue: number;
  targetValue: number;
  subAchievedValue: number;
  subTargetValue: number;
  activeLevelLabel: string;
  moduleLabel: string;
  metricLabel: string;
  periodLabel: string;
  subPeriodLabel: string;
  rewardSuggestion: number;
  rewardEntries: GoalRewardEntry[];
  sourceKeys: string[];
  payrollStatus?: 'not_registered' | 'proposed' | 'included_in_payroll';
  payrollSlipId?: string | null;
  payrollSlipName?: string | null;
};

type PayrollPeriodSlipRow = {
  id: string;
  employee_id: string | null;
  name: string | null;
  status: string | null;
  period_start: string | null;
  period_end: string | null;
};

type PayrollDashboardLedgerRow = {
  id: string;
  employee_id: string | null;
  entry_type: string | null;
  source_type: string | null;
  source_record_id?: string | null;
  source_key?: string | null;
  title: string | null;
  amount: number;
  quantity?: number | string | null;
  rate?: number | string | null;
  status: string | null;
  payroll_slip_id?: string | null;
  details?: Record<string, any> | null;
};

type EmployeeAdvanceDashboardRow = {
  id: string;
  employee_id: string | null;
  name: string | null;
  system_code: string | null;
  status: string | null;
  request_date: string | null;
  due_date: string | null;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  related_payroll_slip_id: string | null;
  reason: string | null;
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
    bonusTotal: number;
    bonusPending: number;
    penaltyTotal: number;
    penaltyPending: number;
  };
};

type AttendanceLogRecord = {
  id: string;
  assignee_id?: string | null;
  employee_id?: string | null;
  related_profile_id?: string | null;
  log_type?: string | null;
  occurred_at?: string | null;
  attendance_date?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
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
  moduleId: 'leave_requests' | 'overtime_requests' | 'mission_requests' | 'employee_bonus_requests' | 'employee_penalty_requests';
  typeLabel: string;
  employeeId: string | null;
  status: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  notes: string | null;
};

type ApprovedLeaveRequest = {
  id: string;
  employeeId: string | null;
  assigneeId?: string | null;
  relatedProfileId?: string | null;
  status: string | null;
  leaveType: string | null;
  startDate: string | null;
  endDate: string | null;
  totalMinutes?: number | string | null;
};

type AttendanceComputedRow = {
  key: string;
  id: string;
  rawIds: string[];
  checkInRawId: string | null;
  checkOutRawId: string | null;
  employeeId: string | null;
  employeeName: string;
  logType: string;
  occurredAt: string | null;
  attendanceDate: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  sourceType: string;
  notes: string | null;
  locationText: string | null;
  scheduleTitle: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduleShifts: AttendanceScheduleShift[];
  shiftDeltas: AttendanceShiftDelta[];
  attendanceSegments: AttendanceSegment[];
  lateMinutes: number;
  earlyArrivalMinutes: number;
  earlyLeaveMinutes: number;
  overtimeStayMinutes: number;
  approvedLeaveMinutes: number;
  isApprovedLeave: boolean;
  approvedLeaveRequestId: string | null;
  approvedLeaveType: string | null;
  deltaLabel: string;
  deltaColor: string;
};

type AttendanceScheduleShift = {
  key: 'shift1' | 'shift2';
  label: string;
  start: string | null;
  end: string | null;
};

type AttendanceShiftDelta = AttendanceScheduleShift & {
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  earlyArrivalMinutes: number;
  earlyLeaveMinutes: number;
  overtimeStayMinutes: number;
};

type AttendanceModalMode = 'create' | 'view' | 'edit';

type IncompleteAttendanceRow = {
  key: string;
  raw: AttendanceLogRecord;
  employeeName: string;
  attendanceDate: string | null;
  occurredAt: string | null;
  logType: 'check_in' | 'check_out';
  missingLogType: 'check_in' | 'check_out';
};

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
  requests: { leaveTotal: 0, leavePending: 0, overtimeTotal: 0, overtimePending: 0, missionTotal: 0, missionPending: 0, bonusTotal: 0, bonusPending: 0, penaltyTotal: 0, penaltyPending: 0 },
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

const COMMISSION_BASIS_OPTIONS: Array<{ label: string; value: CommissionBasis; description: string }> = [
  {
    label: 'محاسبه فاکتورهای تایید شده و سطح بالاتر',
    value: 'approved_invoices',
    description: 'تمامی فاکتورهای تاییدشده، نهایی، پیش‌پرداخت، تسویه‌شده و تکمیل‌شده محاسبه می‌شوند.',
  },
  {
    label: 'فاکتورهای تسویه شده',
    value: 'settled_invoices',
    description: 'فقط فاکتورهای کاملاً تسویه‌شده محاسبه می‌شوند؛ وصول چک ملاک نیست.',
  },
  {
    label: 'فاکتورهای تسویه شده و چک‌های وصول شده',
    value: 'settled_and_collected_cheques',
    description: 'فاکتور باید کامل تسویه شده باشد و فقط چک‌هایی که در این بازه وصول شده‌اند محاسبه می‌شوند.',
  },
  {
    label: 'بر اساس مبلغ دریافت شده‌ی فاکتورها',
    value: 'prepaid_and_settled_invoices',
    description: 'پورسانت متناسب با دریافتی واقعی محاسبه می‌شود و هر پرداخت تازه در دورهٔ خودش لحاظ خواهد شد.',
  },
];

const COMMISSION_PERCENT_MODE_OPTIONS: Array<{ label: string; value: CommissionPercentMode }> = [
  { label: 'درصد پیش فرض هر کالا یا خدمات', value: 'product_default' },
  { label: 'درصد پورسانت پیش فرض بازاریاب (کارمند)', value: 'employee_default' },
];

const COMMISSION_INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'پیش‌نویس',
  pending: 'در انتظار',
  confirmed: 'تأییدشده',
  final: 'نهایی',
  prepayment: 'پیش‌پرداخت',
  settled: 'تسویه‌شده',
  completed: 'تکمیل‌شده',
  canceled: 'لغوشده',
  cancelled: 'لغوشده',
};

const COMMISSION_LIST_PRINT_FIELDS = [
  { key: 'review_bucket', label: 'بخش محاسبه', type: 'text', group: 'وضعیت محاسبه' },
  { key: 'employee_name', label: 'بازاریاب', type: 'text', group: 'اطلاعات فاکتور' },
  { key: 'invoice_name', label: 'فاکتور', type: 'text', group: 'اطلاعات فاکتور' },
  { key: 'invoice_status', label: 'وضعیت فاکتور', type: 'text', group: 'اطلاعات فاکتور' },
  { key: 'invoice_date', label: 'تاریخ فاکتور', type: 'date', group: 'اطلاعات فاکتور' },
  { key: 'items_label', label: 'اقلام فاکتور', type: 'long_text', group: 'اطلاعات فاکتور' },
  { key: 'item_count', label: 'تعداد اقلام', type: 'number', group: 'اطلاعات فاکتور' },
  { key: 'invoice_total_amount', label: 'جمع نهایی فاکتور', type: 'price', group: 'مبالغ پورسانت' },
  { key: 'invoice_received_amount', label: 'جمع دریافتی', type: 'price', group: 'مبالغ پورسانت' },
  { key: 'entitled_amount', label: 'پورسانت احرازشده', type: 'price', group: 'مبالغ پورسانت' },
  { key: 'posted_amount', label: 'پورسانت ثبت‌شده قبلی', type: 'price', group: 'مبالغ پورسانت' },
  { key: 'selected_amount', label: 'پورسانت این محاسبه', type: 'price', group: 'مبالغ پورسانت' },
  { key: 'remaining_amount', label: 'مانده پورسانت', type: 'price', group: 'مبالغ پورسانت' },
  { key: 'eligibility_event_at', label: 'تاریخ احراز', type: 'date', group: 'وضعیت محاسبه' },
  { key: 'eligibility_event_type', label: 'رویداد احراز', type: 'text', group: 'وضعیت محاسبه' },
  { key: 'exclusion_reason', label: 'علت عدم لحاظ', type: 'long_text', group: 'وضعیت محاسبه' },
] as const;

const COMMISSION_LIST_PRINT_MODULE = {
  id: 'commission_calculations',
  titles: { fa: 'فهرست پورسانت‌ها', en: 'Commission calculations' },
  fields: COMMISSION_LIST_PRINT_FIELDS.map((field) => ({
    key: field.key,
    labels: { fa: field.label, en: field.label },
    type: field.type,
    isTableColumn: true,
  })),
  blocks: [],
  table: 'payroll_calculation_entries',
};

const HR_PAYROLL_CONFIG_BLOCK_IDS = new Set(['attendance_policy_info', 'payroll_info', 'insurance_info']);
const HR_PAYROLL_CONFIG_BLOCKS = employeesModule.blocks
  .filter((block: any) => HR_PAYROLL_CONFIG_BLOCK_IDS.has(String(block.id || '')))
  .sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0));
const HR_PAYROLL_CONFIG_FIELDS = employeesModule.fields
  .filter((field: any) => HR_PAYROLL_CONFIG_BLOCK_IDS.has(String(field.blockId || '')))
  .sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0));

const PAYROLL_LEDGER_SOURCE_LABELS: Record<string, string> = {
  activity_performance: 'عملکرد فعالیت',
  commission: 'پورسانت',
  goal_reward: 'پاداش هدف',
  attendance_overtime: 'اضافه‌کاری تردد',
  attendance_early_bonus: 'پاداش تعجیل',
  attendance_delay_absence: 'تاخیر / غیبت',
  attendance_paid_leave: 'مرخصی با حقوق',
  employee_bonus: 'پاداش پرسنلی',
  employee_penalty: 'جریمه پرسنلی',
};

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isActivityPerformancePenalty = (entry: ActivityPerformanceEntry) =>
  String(entry.output_type || '').trim() === 'penalty' || toNumber(entry.amount) < 0;

const isActivityPerformanceWage = (entry: ActivityPerformanceEntry) =>
  !isActivityPerformancePenalty(entry) && String(entry.output_type || '').trim() === 'wage';

const summarizeActivityPerformanceEntries = (entries: ActivityPerformanceEntry[]) => {
  return (entries || []).reduce(
    (acc, entry) => {
      const amount = toNumber(entry.amount);
      if (amount === 0) return acc;
      if (isActivityPerformancePenalty(entry)) {
        acc.penalty += Math.abs(amount);
      } else if (isActivityPerformanceWage(entry)) {
        acc.wage += amount;
      } else {
        acc.bonus += amount;
      }
      acc.net += amount;
      return acc;
    },
    { wage: 0, bonus: 0, penalty: 0, net: 0 },
  );
};

const isMissingSourceKeyError = (error: any) => {
  const text = String(error?.message || error?.details || error || '').toLowerCase();
  return text.includes('source_key') && (text.includes('column') || text.includes('could not find') || text.includes('schema cache'));
};

const isMissingCommissionDraftsError = (error: any) => {
  const text = String(error?.message || error?.details || error || '').toLowerCase();
  return text.includes('commission_drafts') && (text.includes('does not exist') || text.includes('could not find'));
};

const resolveCommissionEmployeeProfile = (
  profiles: ProfileRecord[],
  profileId: string | null | undefined,
) => {
  const normalizedProfileId = String(profileId || '').trim();
  if (!normalizedProfileId) return null;
  // در نمای منابع انسانی شناسهٔ کارمند و شناسهٔ پروفایل هر دو در گردش انتخاب
  // استفاده می‌شوند. فرم پورسانت باید هر دو را به همان پروفایل سازمانی تبدیل کند.
  const selectedProfile = profiles.find((profile) => (
    String(profile.id) === normalizedProfileId
    || (profile.source_table === 'employees' && String(profile.source_id || '') === normalizedProfileId)
  ));
  if (!selectedProfile?.source_id || selectedProfile.source_table !== 'employees') return null;
  return selectedProfile;
};

const buildCommissionCalculationSourceKey = ({
  employeeId,
  basis,
  percentMode,
  periodStart,
  periodEnd,
}: {
  employeeId: string;
  basis: CommissionBasis;
  percentMode: CommissionPercentMode;
  periodStart: string;
  periodEnd: string;
}) =>
  [
    'commission_calculation',
    String(employeeId || '').trim(),
    String(basis || '').trim(),
    String(percentMode || '').trim(),
    String(periodStart || '').trim(),
    String(periodEnd || '').trim(),
  ].join(':');

const commissionLedgerStatusMeta: Record<string, { color: string; label: string }> = {
  draft: { color: 'gold', label: 'پیش نویس' },
  proposed: { color: 'blue', label: 'آماده فیش حقوقی' },
  included_in_payroll: { color: 'green', label: 'نهایی' },
  voided: { color: 'red', label: 'باطل شده' },
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

const REJECTED_LEAVE_STATUS_HINTS = ['draft', 'pending', 'review', 'rejected', 'canceled', 'cancelled', 'رد', 'لغو', 'پیش'];

const isApprovedLeaveStatus = (value: string | null | undefined) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return false;
  const normalized = raw
    .replace(/\u200c/g, '')
    .replace(/[\s_-]+/g, '')
    .replace('أ', 'ا')
    .replace('إ', 'ا')
    .replace('آ', 'ا');
  if (REJECTED_LEAVE_STATUS_HINTS.some((hint) => normalized.includes(hint))) return false;
  return (
    normalized.includes('approve')
    || normalized.includes('confirm')
    || normalized.includes('final')
    || normalized.includes('complete')
    || normalized.includes('تاييد')
    || normalized.includes('تایید')
    || normalized.includes('تکمیل')
  );
};

const isMissingLeaveOptionalColumnError = (error: any) => {
  const text = String(error?.message || error?.details || error || '').toLowerCase();
  return text.includes('leave_requests')
    && (text.includes('assignee_id') || text.includes('related_profile_id'))
    && (text.includes('column') || text.includes('schema cache') || text.includes('could not find'));
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

const timeToMinutes = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = toEnglishDigits(String(value)).trim();
  const [hh, mm] = normalized.split(':').map(Number);
  if ([hh, mm].some(Number.isNaN)) return null;
  return (hh * 60) + mm;
};

const minutesToTime = (minutes: number | null) => {
  if (minutes === null) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

const dateTimeToMinutes = (value: string | null | undefined) =>
  timeToMinutes(parseDate(value || null)?.format('HH:mm') || null);

const formatMinutesLabel = (minutes: number) => {
  if (minutes <= 0) return '۰';
  if (minutes < 60) return `${toPersianNumber(minutes)} دقیقه`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0
    ? `${toPersianNumber(hours)} ساعت و ${toPersianNumber(rest)} دقیقه`
    : `${toPersianNumber(hours)} ساعت`;
};

const toIsoDateKey = (value: dayjs.Dayjs | null | undefined): string | null => {
  if (!value || !value.isValid()) return null;
  return toGregorianDateString(value, 'YYYY-MM-DD', { setMidday: true }) || value.format('YYYY-MM-DD');
};

const toEnglishDigits = (value: string) =>
  String(value || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const extractUuidList = (value: string | null | undefined) =>
  Array.from(
    new Set(
      String(value || '')
        .match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi) || [],
    ),
  );

const removeUuidTokens = (value: string | null | undefined) =>
  String(value || '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ' ')
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

const buildApprovedLeaveNoteLabel = (requests: ApprovedLeaveRequest[]) => {
  if (!requests.length) return null;
  const hasHourlyOnly = requests.every((request) => String(request.leaveType || '').trim().toLowerCase() === 'hourly');
  return hasHourlyOnly ? 'مرخصی ساعتی تاییدشده' : 'مرخصی تاییدشده';
};

const isLeaveRequestActiveOnDate = (request: ApprovedLeaveRequest | null | undefined, dateIso: string | null | undefined) => {
  if (!request || !dateIso) return false;
  const day = parseDate(`${dateIso}T12:00:00`);
  const start = parseDate(request.startDate || null);
  const end = parseDate(request.endDate || request.startDate || null);
  if (!day || !start || !end) return false;
  return day.valueOf() >= start.startOf('day').valueOf() && day.valueOf() <= end.endOf('day').valueOf();
};

const buildDateTimeFromIsoDateAndTime = (dateIso: string, timeValue: string | null | undefined) => {
  const trimmed = String(timeValue || '').trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return parseDate(`${dateIso}T${String(match[1]).padStart(2, '0')}:${match[2]}:${match[3] || '00'}`);
};

const getOverlapMinutes = (
  startA: dayjs.Dayjs | null,
  endA: dayjs.Dayjs | null,
  startB: dayjs.Dayjs | null,
  endB: dayjs.Dayjs | null,
) => {
  if (!startA || !endA || !startB || !endB) return 0;
  const start = Math.max(startA.valueOf(), startB.valueOf());
  const end = Math.min(endA.valueOf(), endB.valueOf());
  if (end <= start) return 0;
  return Math.floor((end - start) / (1000 * 60));
};

const getLeaveIntervalsForDay = (leaveRequests: ApprovedLeaveRequest[], dateIso: string) => {
  const dayStart = parseDate(`${dateIso}T00:00:00`);
  const dayEnd = parseDate(`${dateIso}T23:59:59`);
  if (!dayStart || !dayEnd) return [];
  return leaveRequests
    .map((request) => {
      const isHourly = String(request.leaveType || '').trim().toLowerCase() === 'hourly';
      const requestStart = parseDate(request.startDate || null);
      const requestEnd = parseDate(request.endDate || request.startDate || null);
      if (!requestStart || !requestEnd) return null;
      const start = isHourly
        ? (requestStart.valueOf() < dayStart.valueOf() ? dayStart : requestStart)
        : dayStart;
      const end = isHourly
        ? (requestEnd.valueOf() > dayEnd.valueOf() ? dayEnd : requestEnd)
        : dayEnd;
      if (end.valueOf() <= start.valueOf()) return null;
      return { request, start, end };
    })
    .filter((item): item is { request: ApprovedLeaveRequest; start: dayjs.Dayjs; end: dayjs.Dayjs } => Boolean(item));
};

const getScheduledMinutesByShifts = (shifts: AttendanceScheduleShift[]) =>
  shifts.reduce((sum, shift) => {
    const start = timeToMinutes(shift.start);
    const end = timeToMinutes(shift.end);
    return sum + (start !== null && end !== null && end > start ? (end - start) : 0);
  }, 0);

const getLeaveCoveredScheduledMinutes = (
  leaveIntervals: Array<{ request: ApprovedLeaveRequest; start: dayjs.Dayjs; end: dayjs.Dayjs }>,
  attendanceDate: string,
  shifts: AttendanceScheduleShift[],
) =>
  shifts.reduce((sum, shift) => {
    const shiftStart = buildDateTimeFromIsoDateAndTime(attendanceDate, shift.start);
    const shiftEnd = buildDateTimeFromIsoDateAndTime(attendanceDate, shift.end);
    const covered = leaveIntervals.reduce(
      (intervalSum, interval) => intervalSum + getOverlapMinutes(shiftStart, shiftEnd, interval.start, interval.end),
      0,
    );
    return sum + covered;
  }, 0);

const normalizeAttendanceDateTimes = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value && parseDate(value || null)))
        .map((value) => String(value)),
    ),
  ).sort((a, b) => (parseDate(a)?.valueOf() || 0) - (parseDate(b)?.valueOf() || 0));

const pickClosestAttendanceTime = (
  values: string[],
  usedIndexes: Set<number>,
  targetMinutes: number | null,
) => {
  const candidates = values
    .map((value, index) => ({ value, index, minutes: dateTimeToMinutes(value) }))
    .filter((item) =>
      !usedIndexes.has(item.index) &&
      item.minutes !== null,
    );

  if (!candidates.length) return null;

  const picked = candidates.sort((a, b) => {
    if (targetMinutes === null) return a.index - b.index;
    return Math.abs((a.minutes || 0) - targetMinutes) - Math.abs((b.minutes || 0) - targetMinutes);
  })[0];

  usedIndexes.add(picked.index);
  return picked.value;
};

const assignAttendanceTimesToShifts = (
  values: string[],
  sortedShifts: AttendanceScheduleShift[],
  targetPart: 'start' | 'end',
) => {
  if (!values.length) return sortedShifts.map(() => null as string | null);
  if (values.length >= sortedShifts.length) {
    return sortedShifts.map((_, index) => values[index] || null);
  }

  const usedIndexes = new Set<number>();
  return sortedShifts.map((shift) => pickClosestAttendanceTime(values, usedIndexes, timeToMinutes(shift[targetPart])));
};

const buildAttendanceShiftDeltas = (
  scheduleShifts: AttendanceScheduleShift[],
  checkIns: string[],
  checkOuts: string[],
) => {
  const sortedShifts = scheduleShifts
    .filter((shift) => shift.start || shift.end)
    .sort((a, b) => (timeToMinutes(a.start || a.end) ?? 0) - (timeToMinutes(b.start || b.end) ?? 0));
  const assignedCheckIns = assignAttendanceTimesToShifts(checkIns, sortedShifts, 'start');
  const assignedCheckOuts = assignAttendanceTimesToShifts(checkOuts, sortedShifts, 'end');

  return sortedShifts.map((shift, index) => {
    const shiftStart = timeToMinutes(shift.start);
    const shiftEnd = timeToMinutes(shift.end);
    const checkInAt = assignedCheckIns[index] || null;
    const checkOutAt = assignedCheckOuts[index] || null;
    const checkInMinutes = dateTimeToMinutes(checkInAt);
    const checkOutMinutes = dateTimeToMinutes(checkOutAt);

    return {
      ...shift,
      checkInAt,
      checkOutAt,
      lateMinutes: checkInMinutes !== null && shiftStart !== null ? Math.max(checkInMinutes - shiftStart, 0) : 0,
      earlyArrivalMinutes: checkInMinutes !== null && shiftStart !== null ? Math.max(shiftStart - checkInMinutes, 0) : 0,
      earlyLeaveMinutes: checkOutMinutes !== null && shiftEnd !== null ? Math.max(shiftEnd - checkOutMinutes, 0) : 0,
      overtimeStayMinutes: checkOutMinutes !== null && shiftEnd !== null ? Math.max(checkOutMinutes - shiftEnd, 0) : 0,
    };
  });
};

const summarizeAttendanceDelta = (
  lateMinutes: number,
  earlyArrivalMinutes: number,
  earlyLeaveMinutes: number,
  overtimeStayMinutes: number,
) => {
  const parts = [];
  if (lateMinutes > 0) parts.push(`دیرکرد ${formatMinutesLabel(lateMinutes)}`);
  const earlyMinutes = earlyArrivalMinutes + earlyLeaveMinutes;
  if (earlyMinutes > 0) parts.push(`تعجیل ${formatMinutesLabel(earlyMinutes)}`);
  if (overtimeStayMinutes > 0) parts.push(`ماندن اضافه ${formatMinutesLabel(overtimeStayMinutes)}`);

  return {
    deltaLabel: parts.length ? parts.join(' / ') : 'بدون اختلاف',
    deltaColor: lateMinutes > 0 ? 'red' : earlyMinutes > 0 ? 'green' : overtimeStayMinutes > 0 ? 'blue' : 'default',
  };
};

type AttendanceSegment = {
  key: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  presenceMinutes: number;
};

const calculateAttendanceRowPresenceMinutes = (row: AttendanceComputedRow) => {
  if (row.attendanceSegments.length) {
    return row.attendanceSegments.reduce((sum, segment) => sum + segment.presenceMinutes, 0);
  }

  const checkIn = parseDate(row.checkInAt || null);
  const checkOut = parseDate(row.checkOutAt || null);
  if (!checkIn || !checkOut) return 0;
  const diff = checkOut.diff(checkIn, 'minute');
  return diff > 0 && diff < 24 * 60 ? diff : 0;
};

const calculatePresenceMinutes = (rows: AttendanceComputedRow[]) => {
  return rows.reduce((total, row) => {
    return total + calculateAttendanceRowPresenceMinutes(row);
  }, 0);
};

const calculateAttendanceRowScheduledMinutes = (row: AttendanceComputedRow) =>
  getScheduledMinutesByShifts(row.scheduleShifts || []);

const calculateAttendanceShortageMinutes = (row: AttendanceComputedRow) => {
  const scheduledMinutes = calculateAttendanceRowScheduledMinutes(row);
  if (scheduledMinutes <= 0) return 0;
  const presenceMinutes = calculateAttendanceRowPresenceMinutes(row);
  return Math.max(0, scheduledMinutes - presenceMinutes);
};

const calculateAttendanceOvertimeMinutes = (row: AttendanceComputedRow) => {
  const scheduledMinutes = calculateAttendanceRowScheduledMinutes(row);
  const presenceMinutes = calculateAttendanceRowPresenceMinutes(row);
  const approvedLeaveMinutes = Math.max(0, toNumber(row.approvedLeaveMinutes));
  const creditMinutes = presenceMinutes + Math.min(approvedLeaveMinutes, Math.max(0, scheduledMinutes));
  return Math.max(
    0,
    Math.round(Math.max(
      toNumber(row.overtimeStayMinutes),
      creditMinutes - scheduledMinutes,
    )),
  );
};

const calculateAttendanceEarlyBonusMinutes = (row: AttendanceComputedRow) =>
  Math.max(0, Math.round(toNumber(row.earlyArrivalMinutes)));

const resolvePayrollHourlyRateForProfile = (
  profile: ProfileRecord | null | undefined,
  presenceMinutes = 0,
  requiredMinutes = 0,
) => resolvePayrollBaseCompensation({
  salaryType: profile?.salary_type,
  baseSalary: profile?.base_salary,
  hourlyRate: profile?.hourly_rate,
  presenceMinutes,
  requiredMinutes,
}).hourlyRate;

const calculateAttendanceDelayAbsenceMinutes = (
  row: AttendanceComputedRow,
  profile: ProfileRecord | null | undefined,
  paidLeaveMinutes?: number,
) => {
  const scheduledMinutes = calculateAttendanceRowScheduledMinutes(row);
  const presenceMinutes = calculateAttendanceRowPresenceMinutes(row);
  const coveredPaidLeaveMinutes = paidLeaveMinutes ?? calculateAttendancePaidLeaveMinutes(row, profile);
  const shortageMinutes = Math.max(0, scheduledMinutes - presenceMinutes);
  const graceMinutes = Math.max(0, toNumber(profile?.grace_minutes_for_late));
  const chargeableLateMinutes = Math.max(0, toNumber(row.lateMinutes) - graceMinutes);
  const earlyLeaveMinutes = Math.max(0, toNumber(row.earlyLeaveMinutes));
  const unclassifiedAbsenceMinutes = Math.max(
    0,
    scheduledMinutes
      - presenceMinutes
      - Math.max(0, toNumber(row.lateMinutes))
      - earlyLeaveMinutes,
  );
  return Math.max(0, Math.round(Math.min(
    shortageMinutes,
    Math.max(0, chargeableLateMinutes + earlyLeaveMinutes + unclassifiedAbsenceMinutes - coveredPaidLeaveMinutes),
  )));
};

const calculateAttendanceDelayAbsenceBreakdown = (
  row: AttendanceComputedRow,
  profile: ProfileRecord | null | undefined,
  paidLeaveMinutes?: number,
) => {
  const scheduledMinutes = calculateAttendanceRowScheduledMinutes(row);
  const presenceMinutes = calculateAttendanceRowPresenceMinutes(row);
  const coveredPaidLeaveMinutes = paidLeaveMinutes ?? calculateAttendancePaidLeaveMinutes(row, profile);
  const shortageMinutes = Math.max(0, scheduledMinutes - presenceMinutes);
  const graceMinutes = Math.max(0, toNumber(profile?.grace_minutes_for_late));
  const lateMinutes = Math.max(0, toNumber(row.lateMinutes) - graceMinutes);
  const earlyLeaveMinutes = Math.max(0, toNumber(row.earlyLeaveMinutes));
  const rawAbsenceMinutes = Math.max(0, shortageMinutes - toNumber(row.lateMinutes) - earlyLeaveMinutes);
  const isApprovedUnpaidLeave = row.isApprovedLeave
    && String(row.approvedLeaveType || '').trim().toLowerCase() === 'unpaid';
  const unpaidLeaveMinutes = isApprovedUnpaidLeave || String(row.logType || '') === 'leave'
    ? Math.max(0, shortageMinutes - coveredPaidLeaveMinutes)
    : 0;
  const absenceMinutes = String(row.logType || '') === 'absence' ? Math.max(0, rawAbsenceMinutes - coveredPaidLeaveMinutes) : 0;
  const delayMinutes = Math.max(0, lateMinutes + earlyLeaveMinutes);
  const totalMinutes = calculateAttendanceDelayAbsenceMinutes(row, profile, coveredPaidLeaveMinutes);
  const deductionSubtype = unpaidLeaveMinutes > 0
    ? 'unpaid_leave'
    : absenceMinutes > 0
      ? 'absence'
      : delayMinutes > 0
        ? 'late'
        : 'delay_absence';
  return {
    deductionSubtype,
    delayMinutes,
    absenceMinutes,
    unpaidLeaveMinutes,
    paidLeaveMinutes: coveredPaidLeaveMinutes,
    totalMinutes,
  };
};

const calculateAttendancePaidLeaveMinutes = (
  row: AttendanceComputedRow,
  profile?: ProfileRecord | null,
  usedPaidLeaveMinutes = 0,
) => {
  // کسری تردد به‌تنهایی نباید مرخصی با حقوق شود.
  if (!row.isApprovedLeave) return 0;
  if (String(row.approvedLeaveType || '').trim().toLowerCase() === 'unpaid') return 0;

  const shortageMinutes = calculateAttendanceShortageMinutes(row);
  const approvedLeaveMinutes = Math.max(0, toNumber(row.approvedLeaveMinutes));
  if (shortageMinutes <= 0 || approvedLeaveMinutes <= 0) return 0;

  const monthlyLimitMinutes = Math.max(0, toNumber(profile?.monthly_paid_leave_hours) * 60);
  const availableMinutes = Math.max(0, monthlyLimitMinutes - usedPaidLeaveMinutes);
  return Math.min(shortageMinutes, approvedLeaveMinutes, availableMinutes);
};

const renderDateTime = (value: string | null | undefined) => safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || '-';
const renderAttendanceTime = (value: string | null | undefined) =>
  safeJalaliFormat(value, 'HH:mm') || formatPersianTime(value) || '-';

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
  const activityEntriesByTask = new Map<string, ActivityPerformanceEntry[]>();

  (activityPerformanceEntries || []).forEach((entry) => {
    const employeeId = String(entry.employee_id || '').trim();
    if (!employeeId) return;
    activityEntriesByEmployee.set(employeeId, [...(activityEntriesByEmployee.get(employeeId) || []), entry]);
    const taskId = String(entry.task_id || '').trim();
    if (taskId) {
      activityEntriesByTask.set(taskId, [...(activityEntriesByTask.get(taskId) || []), entry]);
    }
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
    const employeeLookupId = String(profile.source_id || profile.id || '');
    const assigneeTasks = tasksByAssignee.get(assigneeLookupId) || [];
    const detailRows: TaskDetailRow[] = assigneeTasks.map((task) => {
      const performance = evaluateTaskPerformance(task, now);
      const performanceMeta = PERFORMANCE_TAG_META[performance.code];
      const wageBase = toNumber(task.wage);
      const wageMultiplier = getProductionWageMultiplier(task, lineQuantityById, orderQuantityById);
      const wageFinal = wageBase * wageMultiplier;
      const taskActivitySummary = summarizeActivityPerformanceEntries(
        (activityEntriesByTask.get(String(task.id)) || [])
          .filter((entry) => String(entry.employee_id || '').trim() === employeeLookupId),
      );

      return {
        key: String(task.id),
        taskId: String(task.id),
        name: String(task.name || 'بدون عنوان'),
        status: String(task.status || '-'),
        relatedModule: String(task.related_to_module || '-'),
        dueAt: resolveDueDate(task),
        completedAt: task.completed_at || null,
        producedQty: toNumber(task.produced_qty),
        weight: toNumber(task.weight),
        wageBase,
        wageMultiplier,
        wageFinal,
        activityWageAmount: taskActivitySummary.wage,
        activityBonusAmount: taskActivitySummary.bonus,
        activityPenaltyAmount: taskActivitySummary.penalty,
        activityPerformanceAmount: taskActivitySummary.net,
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
    const payrollTaskIds = payrollDetailRows.map((row) => String(row.taskId || '').trim()).filter(Boolean);

    const taskWageTotal = payrollDetailRows.reduce((sum, row) => sum + row.wageFinal, 0);
    const producedQty = payrollDetailRows.reduce((sum, row) => sum + row.producedQty, 0);
    const employeeActivityEntries = (activityEntriesByEmployee.get(employeeLookupId) || [])
      .filter((entry) => payrollEligibleTaskIds.has(String(entry.task_id)));
    const activitySummary = summarizeActivityPerformanceEntries(employeeActivityEntries);
    const activityWageTotal = activitySummary.wage;
    const activityBonusTotal = activitySummary.bonus;
    const activityPenaltyTotal = activitySummary.penalty;
    const activityPerformanceTotal = activitySummary.net;
    const overtimeHours = 0;
    const lateHours = payrollDetailRows.reduce((sum, row) => sum + row.lateHours, 0);

    const baseSalary = toNumber(profile.base_salary);
    const bonusTotal = activityBonusTotal;
    const penaltyTotal = activityPenaltyTotal;
    const netPayable = baseSalary + taskWageTotal + activityWageTotal + bonusTotal - penaltyTotal;

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
      activityWageTotal,
      activityBonusTotal,
      activityPenaltyTotal,
      activityPerformanceTotal,
      overtimeHours,
      lateHours,
      bonusTotal,
      penaltyTotal,
      baseSalary,
      netPayable,
      detailRows: sortedDetailRows,
      payrollDetailRows,
      payrollTaskIds,
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
  const location = useLocation();
  const { employeeId } = useParams();
  const { message } = App.useApp();
  const currency = useCurrencyConfig();
  const currencyLabel = currency.label || 'تومان';
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRange, setSelectedRange] = useState<[Dayjs, Dayjs]>(() => getInitialHrRangeFromQuery(location.search));
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [activityPerformanceEntries, setActivityPerformanceEntries] = useState<ActivityPerformanceEntry[]>([]);
  const [savingActivityPerformance, setSavingActivityPerformance] = useState(false);
  const [goalTouchRows, setGoalTouchRows] = useState<EmployeeGoalTouchRow[]>([]);
  const [goalTouchLoading, setGoalTouchLoading] = useState(false);
  const [commissionRows, setCommissionRows] = useState<CommissionDraftRow[]>([]);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [calculatedCommissionRows, setCalculatedCommissionRows] = useState<CommissionLedgerRow[]>([]);
  const [calculatedCommissionLoading, setCalculatedCommissionLoading] = useState(false);
  const [commissionReviewTab, setCommissionReviewTab] = useState<CommissionModalTab>('current_period');
  const [commissionSearch, setCommissionSearch] = useState('');
  const [commissionHistoryRows, setCommissionHistoryRows] = useState<CommissionLedgerRow[]>([]);
  const [commissionHistoryIndex, setCommissionHistoryIndex] = useState(0);
  const [payrollPeriodSlips, setPayrollPeriodSlips] = useState<PayrollPeriodSlipRow[]>([]);
  const [payrollLedgerRows, setPayrollLedgerRows] = useState<PayrollDashboardLedgerRow[]>([]);
  const [employeeAdvanceRows, setEmployeeAdvanceRows] = useState<EmployeeAdvanceDashboardRow[]>([]);
  const [employeeAdvancesLoading, setEmployeeAdvancesLoading] = useState(false);
  const [payrollStatusLoading, setPayrollStatusLoading] = useState(false);
  const [payrollWizardOpen, setPayrollWizardOpen] = useState(false);
  const [payrollWizardPreparing, setPayrollWizardPreparing] = useState(false);
  const [payrollWizardEmployeeId, setPayrollWizardEmployeeId] = useState<string | null>(null);
  const [payrollWizardStep, setPayrollWizardStep] = useState(0);
  const [employeeModulePermissions, setEmployeeModulePermissions] = useState<ModulePermissionConfig>({});
  const [editingPayrollWizardFieldKey, setEditingPayrollWizardFieldKey] = useState<string | null>(null);
  const [payrollWizardDraftValues, setPayrollWizardDraftValues] = useState<Record<string, any>>({});
  const [savingPayrollWizardFieldKey, setSavingPayrollWizardFieldKey] = useState<string | null>(null);
  const [calculatingPayrollWizardSeniority, setCalculatingPayrollWizardSeniority] = useState(false);
  const [creatingPayrollSlip, setCreatingPayrollSlip] = useState(false);
  const [savingGoalLedger, setSavingGoalLedger] = useState(false);
  const [hrActiveGoalId, setHrActiveGoalId] = useState<string | null>(null);
  const [savingOvertimeLedgerKey, setSavingOvertimeLedgerKey] = useState<string | null>(null);
  const [commissionModalOpen, setCommissionModalOpen] = useState(false);
  const [commissionModalSaving, setCommissionModalSaving] = useState(false);
  const [commissionInvoicePaymentsById, setCommissionInvoicePaymentsById] = useState<Map<string, any[]>>(new Map());
  const [commissionForm] = Form.useForm<CommissionCalculationFormValues>();
  const watchedCommissionFormValues = (Form.useWatch([], commissionForm) || {}) as Partial<CommissionCalculationFormValues>;
  const [commissionInitialValues, setCommissionInitialValues] = useState<Partial<CommissionCalculationFormValues> | null>(null);
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
  const [incompleteAttendanceModalOpen, setIncompleteAttendanceModalOpen] = useState(false);
  const [attendanceModulePermissions, setAttendanceModulePermissions] = useState<ModulePermissionConfig | null>(null);
  const [supportStats, setSupportStats] = useState<HrSupportStats>(EMPTY_HR_SUPPORT_STATS);
  const [supportDataLoading, setSupportDataLoading] = useState(false);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceLogRecord[]>([]);
  const [scheduleRows, setScheduleRows] = useState<WorkScheduleDashboardRow[]>([]);
  const [requestRows, setRequestRows] = useState<HrRequestRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<ApprovedLeaveRequest[]>([]);
  const [officialHolidayDateKeys, setOfficialHolidayDateKeys] = useState<Set<string>>(() => new Set());
  const [activeTab, setActiveTab] = useState('performance');
  const [showKpiManager, setShowKpiManager] = useState(false);
  const [formulaModalConfig, setFormulaModalConfig] = useState<{
    open: boolean;
    defaultScope: string;
    defaultContextType: string;
    defaultOutputType: string;
    assignToField?: string;
  }>({
    open: false,
    defaultScope: 'activity_performance',
    defaultContextType: 'task',
    defaultOutputType: 'money',
  });

  const formatMoney = useCallback((value: number) => `${formatPersianPrice(value)} ${currencyLabel}`, [currencyLabel]);

  useEffect(() => {
    let mounted = true;
    const loadPermissions = async () => {
      try {
        const permissions = await fetchCurrentUserRolePermissions(supabase);
        if (!mounted) return;
        setEmployeeModulePermissions(permissions?.employees || {});
        setAttendanceModulePermissions(permissions?.attendance_logs || {});
      } catch (err) {
        console.warn('Could not fetch employee permissions:', err);
        if (mounted) setEmployeeModulePermissions({ edit: true, fields: {} });
        if (mounted) setAttendanceModulePermissions({ edit: false, fields: {} });
      }
    };
    void loadPermissions();
    return () => {
      mounted = false;
    };
  }, []);

  const canViewEmployeePayrollField = useCallback(
    (fieldKey: string) => {
      const fields = employeeModulePermissions.fields || {};
      if (Object.prototype.hasOwnProperty.call(fields, fieldKey)) {
        return fields[fieldKey] !== false;
      }
      return true;
    },
    [employeeModulePermissions.fields],
  );

  const canEditEmployeePayrollConfig = employeeModulePermissions.edit !== false;
  const canCreateAttendance = attendanceModulePermissions !== null && attendanceModulePermissions.edit !== false;

  const monthStart = useMemo(() => selectedRange[0].startOf('day'), [selectedRange]);
  const monthEnd = useMemo(() => selectedRange[1].endOf('day'), [selectedRange]);
  const goalPeriodOverride = useMemo(
    () => ({ startIso: monthStart.toISOString(), endIso: monthEnd.toISOString() }),
    [monthEnd, monthStart],
  );
  const handleHrActiveGoalCardChange = useCallback(
    (card: { goal: { id: string } } | null) => setHrActiveGoalId(card?.goal.id || null),
    [],
  );
  const selectedRangeQuery = useMemo(() => {
    return buildHrFilterQuery([monthStart, monthEnd], selectedEmployeeIds);
  }, [monthEnd, monthStart, selectedEmployeeIds]);

  useEffect(() => {
    let mounted = true;
    const dateKeys: string[] = [];
    let cursor = monthStart.startOf('day');
    const end = monthEnd.startOf('day');
    while (cursor.valueOf() <= end.valueOf()) {
      const dateKey = toNativeGregorianDateString(cursor);
      if (dateKey) dateKeys.push(dateKey);
      cursor = cursor.add(1, 'day');
    }

    if (!dateKeys.length) {
      setOfficialHolidayDateKeys(new Set());
      return;
    }

    void Promise.all(
      dateKeys.map(async (dateKey) => {
        try {
          const summary = await getHolidaySummaryForDate(dateKey);
          return summary?.isOfficialHoliday ? dateKey : null;
        } catch {
          return null;
        }
      }),
    ).then((holidays) => {
      if (!mounted) return;
      setOfficialHolidayDateKeys(new Set(holidays.filter((dateKey): dateKey is string => Boolean(dateKey))));
    });

    return () => {
      mounted = false;
    };
  }, [monthEnd, monthStart]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    void ensureDefaultHrTaskGoals();
  }, []);

  useEffect(() => {
    const rangeFromUrl = readHrRangeFromSearch(location.search);
    if (!rangeFromUrl) return;
    setSelectedRange((current) => {
      if (isSameHrRange(current, rangeFromUrl)) return current;
      persistHrRange(rangeFromUrl);
      return rangeFromUrl;
    });
  }, [location.search]);

  useEffect(() => {
    if (!employeeFilterInitialized || !profiles.length) return;
    const parsed = parseHrEmployeeFilterParam(new URLSearchParams(location.search).get(HR_QUERY_KEY_EMPLOYEES));
    if (!parsed.hasValue) return;
    const validIds = new Set(profiles.map((profile) => String(profile.id)));
    const nextIds = parsed.ids.filter((id) => validIds.has(id));
    setSelectedEmployeeIds((current) => {
      const currentKey = current.join(',');
      const nextKey = nextIds.join(',');
      if (currentKey === nextKey) return current;
      persistHrEmployees(nextIds);
      return nextIds;
    });
  }, [employeeFilterInitialized, location.search, profiles]);

  useEffect(() => {
    if (!employeeFilterInitialized) return;
    if (shouldDeferHrFilterUrlSync(location.search, [monthStart, monthEnd], selectedEmployeeIds)) return;
    const from = toNativeGregorianDateString(monthStart);
    const to = toNativeGregorianDateString(monthEnd);
    if (!from || !to) return;
    persistHrRange([monthStart, monthEnd]);
    const nextPath = employeeId ? `/hr/${employeeId}` : '/hr';
    const nextUrl = `${nextPath}?${buildHrFilterQuery([monthStart, monthEnd], selectedEmployeeIds)}`;
    const currentUrl = `${location.pathname}${location.search}`;
    if (currentUrl !== nextUrl) {
      navigate(nextUrl, { replace: true });
    }
  }, [employeeFilterInitialized, employeeId, location.pathname, location.search, monthEnd, monthStart, navigate, selectedEmployeeIds]);

  const updateSelectedRangeDates = useCallback((value: PersianDateRangeValue | null) => {
    const startDate = parseDateValue(value?.[0] || null);
    const endDate = parseDateValue(value?.[1] || null);
    if (!startDate?.isValid() || !endDate?.isValid()) return;
    setSelectedRange((current) => {
      let nextStart = startDate.startOf('day');
      let nextEnd = endDate.endOf('day');
      if (nextStart.valueOf() > nextEnd.valueOf()) {
        [nextStart, nextEnd] = [current[0].startOf('day'), current[1].endOf('day')];
      }
      persistHrRange([nextStart, nextEnd]);
      return [nextStart, nextEnd];
    });
  }, []);

  const shiftSelectedRangeByMonth = useCallback((monthOffset: number) => {
    setSelectedRange((current) => {
      const nextRange = shiftHrRangeByMonths(current, monthOffset);
      persistHrRange(nextRange);
      return nextRange;
    });
  }, []);

  const toHrRangePickerDate = (value: Dayjs) => {
    return toNativeGregorianDateString(value);
  };

  const getHrRangePickerDisplayValue = (value: [Dayjs, Dayjs]) => {
    const start = toHrRangePickerDate(value[0]);
    const end = toHrRangePickerDate(value[1]);
    const startLabel = start ? safeJalaliFormat(start, 'YYYY/MM/DD') : '';
    const endLabel = end ? safeJalaliFormat(end, 'YYYY/MM/DD') : '';
    if (startLabel && endLabel) return `${toPersianNumber(startLabel)} تا ${toPersianNumber(endLabel)}`;
    if (startLabel) return `${toPersianNumber(startLabel)} تا ...`;
    if (endLabel) return `... تا ${toPersianNumber(endLabel)}`;
    return '';
  };

  const renderHrRangePicker = useCallback((
    value: [Dayjs, Dayjs],
    onChange: (value: PersianDateRangeValue | null) => void,
    overlayZIndexBase = 1400,
  ) => (
    <PersianDateRangePicker
      value={[
        toHrRangePickerDate(value[0]),
        toHrRangePickerDate(value[1]),
      ]}
      onChange={onChange}
      placeholder="بازه زمانی"
      displayValue={getHrRangePickerDisplayValue(value)}
      modalContainer={resolveOverlayPopupContainer}
      overlayZIndexBase={overlayZIndexBase}
      className="w-full"
    />
  ), []);

  const renderHrPeriodControls = useCallback((overlayZIndexBase = 1400) => (
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      <Button
        icon={<ArrowRightOutlined />}
        onClick={() => shiftSelectedRangeByMonth(-1)}
        className="rounded-xl"
      >
        ماه قبل
      </Button>
      <div className="min-w-[260px] flex-1">
        {renderHrRangePicker(selectedRange, updateSelectedRangeDates, overlayZIndexBase)}
      </div>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => shiftSelectedRangeByMonth(1)}
        className="rounded-xl"
      >
        ماه بعد
      </Button>
    </div>
  ), [renderHrRangePicker, selectedRange, shiftSelectedRangeByMonth, updateSelectedRangeDates]);

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const buildHrTasksQuery = (selectExpr: string) => {
        let query = supabase
          .from('tasks')
          .select(selectExpr)
          .not('assignee_id', 'is', null)
          .lte('created_at', monthEnd.toISOString());
        return query
          .order('created_at', { ascending: false })
          .limit(HR_TASK_FETCH_LIMIT);
      };

      const [initialEmployeesResult, initialTasksResult] = await Promise.all([
        supabase.from('employees').select(HR_EMPLOYEE_SELECT).order('full_name', { ascending: true }),
        buildHrTasksQuery(HR_TASK_SELECT),
      ]);

      let employeesResult: any = initialEmployeesResult;
      if (employeesResult.error && isMissingSelectColumnError(employeesResult.error)) {
        employeesResult = await supabase
          .from('employees')
          .select(HR_EMPLOYEE_SELECT_FALLBACK)
          .order('full_name', { ascending: true });
      }
      if (employeesResult.error) throw employeesResult.error;

      let tasksResult = initialTasksResult;
      if (tasksResult.error && isMissingSelectColumnError(tasksResult.error)) {
        tasksResult = await buildHrTasksQuery(HR_TASK_SELECT_FALLBACK);
      }
      if (tasksResult.error && isMissingSelectColumnError(tasksResult.error)) {
        tasksResult = await buildHrTasksQuery(HR_TASK_SELECT_MINIMAL);
      }
      if (tasksResult.error) throw tasksResult.error;

      let profilesResult: { data: any[] | null; error: any } = { data: [], error: null };
      if ((employeesResult.data || []).length === 0) {
        profilesResult = await supabase
          .from('profiles')
          .select(HR_PROFILE_SELECT)
          .order('full_name', { ascending: true });
        if (profilesResult.error && isMissingSelectColumnError(profilesResult.error)) {
          profilesResult = await supabase
            .from('profiles')
            .select(HR_PROFILE_SELECT_FALLBACK)
            .order('full_name', { ascending: true });
        }
        if (profilesResult.error && isMissingSelectColumnError(profilesResult.error)) {
          profilesResult = await supabase
            .from('profiles')
            .select(HR_PROFILE_SELECT_MINIMAL)
            .order('full_name', { ascending: true });
        }
        if (profilesResult.error) throw profilesResult.error;
      }

      const normalizedEmployees = (employeesResult.data || []).map((row: any) => ({
        id: String(row?.id),
        full_name: row?.full_name || null,
        related_profile_id: row?.related_profile_id || null,
        source_table: 'employees' as const,
        source_id: String(row?.id),
        employment_status: row?.employment_status || 'active',
        role: row?.employment_type || null,
        salary_type: row?.salary_type || 'performance',
        default_work_schedule_id: row?.default_work_schedule_id || null,
        has_flexible_hours: row?.has_flexible_hours ?? false,
        works_on_official_holidays: row?.works_on_official_holidays ?? false,
        expected_daily_minutes: row?.expected_daily_minutes ?? 480,
        grace_minutes_for_late: row?.grace_minutes_for_late ?? 0,
        overtime_auto_approve: row?.overtime_auto_approve ?? false,
        leave_auto_approve: row?.leave_auto_approve ?? false,
        mission_auto_approve: row?.mission_auto_approve ?? false,
        base_salary: row?.base_salary ?? 0,
        hourly_rate: row?.hourly_rate ?? 0,
        overtime_rate: row?.overtime_rate ?? 0,
        late_penalty_rate: row?.late_penalty_rate ?? 0,
        early_bonus_rate: row?.early_bonus_rate ?? 0,
        production_bonus_rate: row?.production_bonus_rate ?? 0,
        commission_percentage: row?.commission_percentage ?? 0,
        hire_date: row?.hire_date || null,
        seniority_mode: row?.seniority_mode || 'manual',
        seniority_base_amount: row?.seniority_base_amount ?? 0,
        seniority_formula_id: row?.seniority_formula_id || null,
        monthly_paid_leave_hours: row?.monthly_paid_leave_hours ?? 0,
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
        salary_type: row?.salary_type || 'performance',
        default_work_schedule_id: row?.default_work_schedule_id || null,
        has_flexible_hours: row?.has_flexible_hours ?? false,
        works_on_official_holidays: false,
        expected_daily_minutes: row?.expected_daily_minutes ?? 480,
        grace_minutes_for_late: row?.grace_minutes_for_late ?? 0,
        overtime_auto_approve: row?.overtime_auto_approve ?? false,
        leave_auto_approve: row?.leave_auto_approve ?? false,
        mission_auto_approve: row?.mission_auto_approve ?? false,
        base_salary: row?.base_salary ?? 0,
        hourly_rate: row?.hourly_rate ?? 0,
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

      const normalizedTasks = (tasksResult.data || []).map((row: any) => {
        const recurrenceInfo = row?.recurrence_info && typeof row.recurrence_info === 'object'
          ? row.recurrence_info
          : null;
        return {
          ...row,
          id: String(row?.id),
          name: row?.name || null,
          status: row?.status || null,
          task_type: row?.task_type || recurrenceInfo?.task_type || null,
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
          actual_hours: row?.actual_hours ?? 0,
          duration_hours: row?.duration_hours ?? 0,
          weight: row?.weight ?? recurrenceInfo?.weight ?? 0,
          related_to_module: row?.related_to_module || null,
          related_production_order: row?.related_production_order || null,
          production_line_id: row?.production_line_id || null,
          recurrence_info: recurrenceInfo,
          source_template_id: row?.source_template_id || recurrenceInfo?.source_template_id || null,
        };
      }) as TaskRecord[];

      setProfiles(normalizedProfiles);
      setTasks(normalizedTasks);
      if (!employeeFilterInitialized) {
        let defaultSelectedIds: string[];
        const validIds = new Set(normalizedProfiles.map((p) => p.id));
        const queryEmployees = parseHrEmployeeFilterParam(new URLSearchParams(location.search).get(HR_QUERY_KEY_EMPLOYEES));
        const savedEmployeeIds = queryEmployees.hasValue ? queryEmployees.ids : readPersistedHrEmployees();
        if (savedEmployeeIds) {
          defaultSelectedIds = savedEmployeeIds.filter((id) => validIds.has(id));
        } else {
          defaultSelectedIds = normalizedProfiles
            .filter((profile) => isCurrentlyCollaboratingProfile(profile))
            .map((profile) => profile.id);
        }
        setSelectedEmployeeIds(defaultSelectedIds);
        persistHrEmployees(defaultSelectedIds);
        setEmployeeFilterInitialized(true);
      }
      if (!silent) {
        setLoading(false);
        setRefreshing(true);
      }

      let nextActivityPerformanceEntries: ActivityPerformanceEntry[] = [];
      try {
        const periodStart = toNativeGregorianDateString(monthStart);
        const periodEnd = toNativeGregorianDateString(monthEnd);
        const { data, error } = await supabase.functions.invoke('activity-performance', {
          body: { periodStart, periodEnd, mode: 'preview' },
        });
        if (error || !Array.isArray(data?.entries)) throw error || new Error('activity_performance_response_invalid');
        nextActivityPerformanceEntries = data.entries as ActivityPerformanceEntry[];
      } catch (error) {
        console.warn('Activity performance service is not available yet.', error);
        nextActivityPerformanceEntries = [];
      }

      setActivityPerformanceEntries(nextActivityPerformanceEntries);

      const supportStatsPromise = (async () => {
        setSupportDataLoading(true);
        try {
        const [attendanceStatsResult, schedulesStatsResult, leaveStatsResult, overtimeStatsResult, missionStatsResult, bonusStatsResult, penaltyStatsResult] = await Promise.allSettled([
        (async () => {
          const rows: AttendanceLogRecord[] = [];
          for (let from = 0; ; from += HR_ATTENDANCE_QUERY_PAGE_SIZE) {
            const result = await supabase
              .from('attendance_logs')
              .select('id, assignee_id, employee_id, related_profile_id, log_type, occurred_at, attendance_date, check_in_time, check_out_time, source_type, actual_check_in_time, actual_check_out_time, manual_check_in_time, manual_check_out_time, location_text, notes, created_by, updated_by, created_at, updated_at')
              .gte('occurred_at', monthStart.toISOString())
              .lte('occurred_at', monthEnd.toISOString())
              .order('occurred_at', { ascending: false })
              .order('id', { ascending: false })
              .range(from, from + HR_ATTENDANCE_QUERY_PAGE_SIZE - 1);
            if (result.error) return result;
            const page = (result.data || []) as AttendanceLogRecord[];
            rows.push(...page);
            if (page.length < HR_ATTENDANCE_QUERY_PAGE_SIZE) {
              return { data: rows, error: null };
            }
          }
        })(),
        supabase
          .from('work_schedules')
          .select('id, title, status, is_active, effective_from, effective_to, employee_id, weekly_plan, created_at, updated_at')
          .order('updated_at', { ascending: false })
          .limit(2000),
        (async () => {
          const primary = await supabase
            .from('leave_requests')
            .select('id, employee_id, assignee_id, related_profile_id, status, leave_type, start_date, end_date, total_days, total_minutes, notes, created_at, updated_at')
            .order('created_at', { ascending: false })
            .limit(HR_STATS_FETCH_LIMIT);
          if (!primary.error || !isMissingLeaveOptionalColumnError(primary.error)) return primary;
          return supabase
            .from('leave_requests')
            .select('id, employee_id, status, leave_type, start_date, end_date, total_days, total_minutes, notes, created_at, updated_at')
            .order('created_at', { ascending: false })
            .limit(HR_STATS_FETCH_LIMIT);
        })(),
        supabase
          .from('overtime_requests')
          .select('id, employee_id, status, work_date, start_time, end_time, total_minutes, notes, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(HR_STATS_FETCH_LIMIT),
        supabase
          .from('mission_requests')
          .select('id, employee_id, status, start_date, end_date, destination, notes, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(HR_STATS_FETCH_LIMIT),
        supabase
          .from('employee_bonus_requests')
          .select('id, employee_id, title, status, effective_date, reason, notes, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(HR_STATS_FETCH_LIMIT),
        supabase
          .from('employee_penalty_requests')
          .select('id, employee_id, title, status, effective_date, reason, notes, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(HR_STATS_FETCH_LIMIT),
        ]);

        const nextSupportStats: HrSupportStats = { ...EMPTY_HR_SUPPORT_STATS };
        let nextAttendanceRows: AttendanceLogRecord[] = [];
        let nextScheduleRows: WorkScheduleDashboardRow[] = [];
        const nextRequestRows: HrRequestRecord[] = [];
        let nextLeaveRequests: ApprovedLeaveRequest[] = [];

      if (attendanceStatsResult.status === 'fulfilled' && !attendanceStatsResult.value.error) {
        const rows = attendanceStatsResult.value.data || [];
        nextAttendanceRows = rows.map((row: any) => ({
          id: String(row?.id),
          assignee_id: row?.assignee_id || null,
          employee_id: row?.employee_id || null,
          related_profile_id: row?.related_profile_id || null,
          log_type: row?.log_type || null,
          occurred_at: row?.occurred_at || null,
          attendance_date: row?.attendance_date || null,
          check_in_time: row?.check_in_time || null,
          check_out_time: row?.check_out_time || null,
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
        const employeeIdByAnyId = normalizedProfiles.reduce<Record<string, string>>((acc, profile) => {
          const canonical = String(profile.id || '').trim();
          const source = String(profile.source_id || '').trim();
          const related = String(profile.related_profile_id || '').trim();
          if (canonical) acc[canonical] = canonical;
          if (source) acc[source] = canonical;
          if (related) acc[related] = canonical;
          return acc;
        }, {});

        nextLeaveRequests = rows.map((row: any) => ({
          id: String(row?.id),
          employeeId: (() => {
            const candidates = [
              String(row?.employee_id || '').trim(),
              String(row?.assignee_id || '').trim(),
              String(row?.related_profile_id || '').trim(),
            ].filter(Boolean);
            for (const candidate of candidates) {
              if (employeeIdByAnyId[candidate]) return employeeIdByAnyId[candidate];
            }
            return candidates[0] || null;
          })(),
          assigneeId: row?.assignee_id ? String(row.assignee_id) : null,
          relatedProfileId: row?.related_profile_id ? String(row.related_profile_id) : null,
          status: row?.status || null,
          leaveType: row?.leave_type || null,
          startDate: row?.start_date || null,
          endDate: row?.end_date || null,
          totalMinutes: row?.total_minutes ?? null,
        }));
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

      if (bonusStatsResult.status === 'fulfilled' && !bonusStatsResult.value.error) {
        const rows = (bonusStatsResult.value.data || []).filter((row: any) => isInRange(parseDate(row?.effective_date || null), monthStart, monthEnd));
        nextRequestRows.push(
          ...rows.map((row: any) => ({
            key: `bonus_${String(row?.id)}`,
            id: String(row?.id),
            moduleId: 'employee_bonus_requests' as const,
            typeLabel: 'پاداش',
            employeeId: row?.employee_id ? String(row.employee_id) : null,
            status: row?.status || null,
            dateFrom: row?.effective_date || null,
            dateTo: null,
            notes: row?.reason || row?.notes || row?.title || null,
          })),
        );
        nextSupportStats.requests.bonusTotal = rows.length;
        nextSupportStats.requests.bonusPending = rows.filter((row: any) => row?.status === 'pending').length;
      }

      if (penaltyStatsResult.status === 'fulfilled' && !penaltyStatsResult.value.error) {
        const rows = (penaltyStatsResult.value.data || []).filter((row: any) => isInRange(parseDate(row?.effective_date || null), monthStart, monthEnd));
        nextRequestRows.push(
          ...rows.map((row: any) => ({
            key: `penalty_${String(row?.id)}`,
            id: String(row?.id),
            moduleId: 'employee_penalty_requests' as const,
            typeLabel: 'جریمه',
            employeeId: row?.employee_id ? String(row.employee_id) : null,
            status: row?.status || null,
            dateFrom: row?.effective_date || null,
            dateTo: null,
            notes: row?.reason || row?.notes || row?.title || null,
          })),
        );
        nextSupportStats.requests.penaltyTotal = rows.length;
        nextSupportStats.requests.penaltyPending = rows.filter((row: any) => row?.status === 'pending').length;
      }

      setSupportStats(nextSupportStats);
      setAttendanceRows(nextAttendanceRows);
      setScheduleRows(nextScheduleRows);
      setLeaveRequests(nextLeaveRequests);
      setRequestRows(
        nextRequestRows.sort((a, b) => {
          const aDate = parseDate(a.dateFrom || a.dateTo || null)?.valueOf() || 0;
          const bDate = parseDate(b.dateFrom || b.dateTo || null)?.valueOf() || 0;
          return bDate - aDate;
        }),
      );
        } finally {
          setSupportDataLoading(false);
        }
      })();

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

      if (!silent) {
        setLoading(false);
        setRefreshing(true);
      }

      await supportStatsPromise;
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

  const refreshPayrollPeriodState = useCallback(async () => {
    const periodStart = toNativeGregorianDateString(monthStart);
    const periodEnd = toNativeGregorianDateString(monthEnd);
    const employeeIds = profiles
      .filter((profile) => profile.source_table === 'employees' && profile.source_id)
      .map((profile) => String(profile.source_id || '').trim())
      .filter(Boolean);
    if (!periodStart || !periodEnd || employeeIds.length === 0) {
      setPayrollPeriodSlips([]);
      setPayrollLedgerRows([]);
      return;
    }

    setPayrollStatusLoading(true);
    try {
      await syncEmployeeCompensationEntriesForPayroll(supabase as any, {
        employeeIds,
        periodStart,
        periodEnd,
      });
      const [slipsResult, initialLedgerResult] = await Promise.all([
        supabase
          .from('payroll_slips')
          .select('id, employee_id, name, status, period_start, period_end')
          .eq('period_start', periodStart)
          .eq('period_end', periodEnd)
          .in('employee_id', employeeIds)
          .neq('status', 'canceled'),
        supabase
          .from('payroll_calculation_entries')
          .select('id, employee_id, entry_type, source_type, source_record_id, source_key, title, amount, quantity, rate, status, payroll_slip_id, details')
          .eq('period_start', periodStart)
          .eq('period_end', periodEnd)
          .in('employee_id', employeeIds)
          .in('status', ['draft', 'proposed', 'included_in_payroll']),
      ]);
      let ledgerResult: any = initialLedgerResult;
      if (ledgerResult.error && isMissingSourceKeyError(ledgerResult.error)) {
        ledgerResult = await supabase
          .from('payroll_calculation_entries')
          .select('id, employee_id, entry_type, source_type, source_record_id, title, amount, quantity, rate, status, payroll_slip_id, details')
          .eq('period_start', periodStart)
          .eq('period_end', periodEnd)
          .in('employee_id', employeeIds)
          .in('status', ['draft', 'proposed', 'included_in_payroll']);
      }
      if (slipsResult.error) throw slipsResult.error;
      if (ledgerResult.error && !isMissingPayrollLedgerError(ledgerResult.error)) throw ledgerResult.error;
      setPayrollPeriodSlips((slipsResult.data || []) as PayrollPeriodSlipRow[]);
      setPayrollLedgerRows(((ledgerResult.data || []) as any[]).map((row) => ({
        id: String(row?.id || ''),
        employee_id: row?.employee_id || null,
        entry_type: row?.entry_type || null,
        source_type: row?.source_type || null,
        source_record_id: row?.source_record_id || null,
        source_key: row?.source_key || row?.details?.source_key || null,
        title: row?.title || null,
        amount: toNumber(row?.amount),
        quantity: row?.quantity ?? null,
        rate: row?.rate ?? null,
        status: row?.status || null,
        payroll_slip_id: row?.payroll_slip_id || null,
        details: row?.details || null,
      })));
    } catch (error) {
      console.warn('Payroll period status is not available yet.', error);
      setPayrollPeriodSlips([]);
      setPayrollLedgerRows([]);
    } finally {
      setPayrollStatusLoading(false);
    }
  }, [monthEnd, monthStart, profiles]);

  useEffect(() => {
    void refreshPayrollPeriodState();
  }, [refreshPayrollPeriodState]);

  const payrollSlipByEmployeeId = useMemo(() => {
    return new Map(
      payrollPeriodSlips
        .filter((row) => row.employee_id)
        .map((row) => [String(row.employee_id), row] as const),
    );
  }, [payrollPeriodSlips]);

  const payrollSlipById = useMemo(() => {
    return new Map(payrollPeriodSlips.map((row) => [String(row.id), row] as const));
  }, [payrollPeriodSlips]);

  const payrollLedgerByEmployeeId = useMemo(() => {
    const map = new Map<string, PayrollDashboardLedgerRow[]>();
    payrollLedgerRows.forEach((row) => {
      const employeeKey = String(row.employee_id || '').trim();
      if (!employeeKey) return;
      map.set(employeeKey, [...(map.get(employeeKey) || []), row]);
    });
    return map;
  }, [payrollLedgerRows]);

  const fetchEmployeeAdvancesForDashboard = useCallback(async () => {
    const periodEnd = toNativeGregorianDateString(monthEnd);
    const employeeIds = visibleSummaries
      .map((row) => String(row.profile.source_id || row.profile.id || '').trim())
      .filter(Boolean);
    if (!periodEnd || employeeIds.length === 0) {
      setEmployeeAdvanceRows([]);
      return;
    }

    setEmployeeAdvancesLoading(true);
    try {
      const { data, error } = await supabase
        .from('employee_advances')
        .select('id, employee_id, name, system_code, status, request_date, due_date, amount, paid_amount, remaining_amount, related_payroll_slip_id, reason')
        .in('employee_id', employeeIds)
        .lte('request_date', periodEnd)
        .order('request_date', { ascending: false })
        .limit(HR_STATS_FETCH_LIMIT);
      if (error) throw error;
      setEmployeeAdvanceRows(((data || []) as any[])
        .map((row) => ({
          id: String(row?.id || ''),
          employee_id: row?.employee_id || null,
          name: row?.name || null,
          system_code: row?.system_code || null,
          status: row?.status || null,
          request_date: row?.request_date || null,
          due_date: row?.due_date || null,
          amount: toNumber(row?.amount),
          paid_amount: toNumber(row?.paid_amount),
          remaining_amount: toNumber(row?.remaining_amount),
          related_payroll_slip_id: row?.related_payroll_slip_id || null,
          reason: row?.reason || null,
        }))
        .filter((row) => ADVANCE_VISIBLE_STATUSES.has(String(row.status || '').trim())));
    } catch (error) {
      console.warn('Employee advances are not available yet.', error);
      setEmployeeAdvanceRows([]);
    } finally {
      setEmployeeAdvancesLoading(false);
    }
  }, [monthEnd, visibleSummaries]);

  useEffect(() => {
    if (activeTab !== 'advances' && activeTab !== 'payroll') return;
    void fetchEmployeeAdvancesForDashboard();
  }, [activeTab, fetchEmployeeAdvancesForDashboard]);

  useEffect(() => {
    // Handle both 'goals' and 'goal_fulfillment' tab keys for backwards compatibility
    const isGoalTab = activeTab === 'goals' || activeTab === 'goal_fulfillment';
    if (!isGoalTab && !payrollWizardOpen) return;

    const run = async () => {
      setGoalTouchLoading(true);
      try {
        const [goalsResult, formulasResult, roleContext, directory] = await Promise.all([
          supabase
            .from('goals')
            .select(HR_GOAL_SELECT)
            .eq('is_active', true)
            .order('updated_at', { ascending: false }),
          supabase
            .from('calculation_formulas')
            .select('id, name, expression_config, output_type, config')
            .eq('is_active', true)
            .eq('context_type', 'goal'),
          fetchCurrentUserRecordAccessContext(supabase),
          fetchAssigneeDirectory(supabase),
        ]);
        if (goalsResult.error) throw goalsResult.error;
        if (formulasResult.error) throw formulasResult.error;

        const rewardFormulas = (formulasResult.data || []) as GoalRewardFormula[];
        const directoryUserById = new Map(
          (directory.users || []).map((item) => [String(item.id || '').trim(), item] as const)
        );

        const selectedProfiles = visibleSummaries
          .map((row) => row.profile)
          .filter((profile) => profile.source_table === 'employees' && profile.source_id);
        const selectedMembersByUserId = new Map(
          selectedProfiles
            .map((profile) => {
              const memberUserId = String(profile.related_profile_id || profile.id || '').trim();
              if (!memberUserId) return null;
              const directoryUser = directoryUserById.get(memberUserId);
              return [memberUserId, {
                employeeId: String(profile.source_id || ''),
                employeeName: profile.full_name || String(profile.source_id || '-'),
                userId: memberUserId,
                roleId: directoryUser?.role_id ? String(directoryUser.role_id) : null,
              }] as const;
            })
            .filter((entry): entry is readonly [string, { employeeId: string; employeeName: string; userId: string; roleId: string | null }] => !!entry)
        );
        const nextRows: EmployeeGoalTouchRow[] = [];
        const goalRowsCache = new Map<string, any[]>();

        for (const rawGoal of (goalsResult.data || [])) {
          const goal = normalizeGoalRecord(rawGoal as GoalRecord);
          const assignedMembers = resolveGoalAssignedMembers(goal, directory)
            .map((member) => {
              const selectedMember = selectedMembersByUserId.get(member.userId);
              if (!selectedMember) return null;
              return {
                ...member,
                employeeId: selectedMember.employeeId,
                employeeName: selectedMember.employeeName,
                roleId: member.roleId || selectedMember.roleId,
              };
            })
            .filter((member): member is { userId: string; roleId: string | null; label: string; employeeId: string; employeeName: string } => !!member);

          if (assignedMembers.length === 0) continue;
          try {
            // اجرای گروهی داده‌های این هدف را فقط یک‌بار می‌خواند؛ پیش از این برای
            // هر کارمند همان داده‌ها جداگانه درخواست می‌شد.
            const snapshots = await executeGoalProgressForSubjects(goal, {
              userId: roleContext.userId,
              roleId: roleContext.roleId,
              orgId: roleContext.orgId,
              allowedRoleIds: roleContext.allowedRoleIds,
              allowedUserIds: roleContext.allowedUserIds,
              permissions: roleContext.permissions,
              cache: goalRowsCache,
              overridePeriodRange: { startIso: monthStart.toISOString(), endIso: monthEnd.toISOString() },
              subjects: assignedMembers.map((member) => ({
                userId: member.userId,
                roleId: member.roleId,
                label: member.label,
              })),
            });
            snapshots.forEach((snapshot, index) => {
              const member = assignedMembers[index];
              if (!member) return;
              const rewardEntries = evaluateGoalRewardRules({
                snapshot,
                formulas: rewardFormulas,
              });
              const sourceKeys = rewardEntries
                .filter((entry) => entry.formula_id && toNumber(entry.amount) !== 0)
                .map((entry) => buildGoalRewardSourceKey({
                  employeeId: member.employeeId,
                  goalId: goal.id,
                  formulaId: entry.formula_id,
                  triggerType: entry.trigger_type,
                  outputType: entry.output_type,
                }));
              const matchingLedger = payrollLedgerRows.find((entry) => (
                String(entry.employee_id || '') === member.employeeId &&
                String(entry.source_type || '') === 'goal_reward' &&
                sourceKeys.includes(String(entry.source_key || entry.details?.source_key || ''))
              ));
              const relatedSlip = matchingLedger?.payroll_slip_id
                ? payrollSlipById.get(String(matchingLedger.payroll_slip_id))
                : null;
              nextRows.push({
                key: `${member.employeeId}_${goal.id}`,
                employeeId: member.employeeId,
                employeeName: member.employeeName,
                profileRoleId: member.roleId,
                goalId: goal.id,
                goalName: goal.name,
                achievedValue: snapshot.achievedValue,
                targetValue: snapshot.targetValue,
                subAchievedValue: snapshot.subAchievedValue,
                subTargetValue: snapshot.subTargetValue,
                activeLevelLabel: snapshot.activeLevelKey ? snapshot.levels.find((item) => item.key === snapshot.activeLevelKey)?.label || '-' : 'در حال پیشروی',
                moduleLabel: snapshot.moduleLabel,
                metricLabel: snapshot.metricLabel,
                periodLabel: `${snapshot.mainRange.startLabel} تا ${snapshot.mainRange.endLabel}`,
                subPeriodLabel: `${snapshot.subRange.startLabel} تا ${snapshot.subRange.endLabel}`,
                rewardSuggestion: rewardEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
                rewardEntries,
                sourceKeys,
                payrollStatus: matchingLedger
                  ? (String(matchingLedger.status || '') === 'included_in_payroll'
                    ? 'included_in_payroll'
                    : String(matchingLedger.status || '') === 'proposed' ? 'proposed' : 'not_registered')
                  : 'not_registered',
                payrollSlipId: matchingLedger?.payroll_slip_id || null,
                payrollSlipName: relatedSlip?.name || null,
              });
            });
          } catch {
            continue;
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
  }, [activeTab, monthEnd, monthStart, payrollLedgerRows, payrollSlipById, payrollWizardOpen, visibleSummaries]);

  const fetchCalculatedCommissionRows = useCallback(async () => {
    const periodStart = toNativeGregorianDateString(monthStart);
    const periodEnd = toNativeGregorianDateString(monthEnd);
    if (!periodStart || !periodEnd) return;

    const targetEmployeeIds = visibleSummaries
      .map((row) => String(row.profile.source_id || row.profile.id || '').trim())
      .filter(Boolean);
    if (targetEmployeeIds.length === 0) {
      setCalculatedCommissionRows([]);
      return;
    }

    setCalculatedCommissionLoading(true);
    try {
      const { data, error } = await fetchAllCommissionPages<any>((from, to) => supabase
        .from('payroll_calculation_entries')
        .select('id, employee_id, period_start, period_end, entry_type, source_record_id, title, amount, status, details, created_by, updated_by, created_at, updated_at, assignee_id')
        .eq('source_type', 'commission')
        .in('employee_id', targetEmployeeIds)
        .gte('period_end', periodStart)
        .lte('period_start', periodEnd)
        .neq('status', 'voided')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to));
      if (error) throw error;

      const mappedRows = (data || []).map((row: any) => {
        const employeeIdValue = row?.employee_id ? String(row.employee_id) : null;
        return {
          id: String(row?.id),
          employee_id: employeeIdValue,
          employee_name: employeeIdValue ? profiles.find((profile) => String(profile.id) === employeeIdValue || String(profile.source_id || '') === employeeIdValue)?.full_name || employeeIdValue : '-',
          period_start: row?.period_start || null,
          period_end: row?.period_end || null,
          entry_type: String(row?.entry_type || ''),
          title: row?.title || null,
          amount: toNumber(row?.amount),
          status: row?.status || null,
          source_record_id: row?.source_record_id || null,
          created_at: row?.created_at || null,
          updated_at: row?.updated_at || null,
          created_by: row?.created_by || null,
          updated_by: row?.updated_by || null,
          assignee_id: row?.assignee_id || row?.details?.assignee_id || null,
          details: row?.details || null,
        } as CommissionLedgerRow;
      });
      const grouped = new Map<string, CommissionLedgerRow>();
      mappedRows.forEach((row) => {
        const basis = String(row.details?.basis || '').trim();
        const percentMode = String(row.details?.percent_mode || '').trim();
        const calculationKey = String(
          row.details?.calculation_key
          || [
            row.employee_id || '',
            row.period_start || '',
            row.period_end || '',
            basis,
            percentMode,
            row.status || '',
            row.created_at || '',
          ].join(':')
        ).trim();
        if (!calculationKey) {
          grouped.set(row.id, row);
          return;
        }
        const current = grouped.get(calculationKey);
        const invoiceId = String(row.details?.invoice_id || row.source_record_id || '').trim();
        const itemCount = toNumber(row.details?.item_count);
        const invoiceCount = toNumber(row.details?.invoice_count) || (invoiceId ? 1 : 0);
        if (!current) {
          grouped.set(calculationKey, {
            ...row,
            id: calculationKey,
            source_record_id: null,
            title: row.title || `محاسبه پورسانت ${row.employee_name}`,
            details: {
              ...(row.details || {}),
              calculation_key: calculationKey,
              invoice_count: invoiceCount,
              item_count: itemCount,
              invoice_ids: invoiceId ? [invoiceId] : [],
              ledger_entry_ids: [row.id],
            },
          });
          return;
        }
        const currentInvoiceIds = new Set<string>(Array.isArray(current.details?.invoice_ids) ? current.details?.invoice_ids : []);
        if (invoiceId) currentInvoiceIds.add(invoiceId);
        grouped.set(calculationKey, {
          ...current,
          amount: current.amount + row.amount,
          created_at: current.created_at && row.created_at
            ? (new Date(current.created_at).getTime() >= new Date(row.created_at).getTime() ? current.created_at : row.created_at)
            : current.created_at || row.created_at,
          updated_at: current.updated_at && row.updated_at
            ? (new Date(current.updated_at).getTime() >= new Date(row.updated_at).getTime() ? current.updated_at : row.updated_at)
            : current.updated_at || row.updated_at,
          details: {
            ...(current.details || {}),
            base_amount: toNumber(current.details?.base_amount) + toNumber(row.details?.base_amount),
            selected_amount: toNumber(current.details?.selected_amount) + toNumber(row.details?.selected_amount || row.amount),
            deferred_amount: toNumber(current.details?.deferred_amount) + toNumber(row.details?.deferred_amount),
            excluded_amount: toNumber(current.details?.excluded_amount) + toNumber(row.details?.excluded_amount),
            invoice_count: currentInvoiceIds.size || (toNumber(current.details?.invoice_count) + invoiceCount),
            item_count: toNumber(current.details?.item_count) + itemCount,
            invoice_ids: Array.from(currentInvoiceIds),
            ledger_entry_ids: Array.from(new Set([
              ...(Array.isArray(current.details?.ledger_entry_ids) ? current.details.ledger_entry_ids : []),
              row.id,
            ])),
          },
        });
      });

      setCalculatedCommissionRows(
        Array.from(grouped.values()).sort((a, b) => {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bTime - aTime;
        }),
      );
    } catch (error) {
      if (isMissingPayrollLedgerError(error)) {
        setCalculatedCommissionRows([]);
      } else {
        console.warn('Commission ledger is not available yet.', error);
        setCalculatedCommissionRows([]);
      }
    } finally {
      setCalculatedCommissionLoading(false);
    }
  }, [monthEnd, monthStart, profiles, visibleSummaries]);

  useEffect(() => {
    if (activeTab !== 'commissions') return;
    void fetchCalculatedCommissionRows();
  }, [activeTab, fetchCalculatedCommissionRows]);

  const selectedEmployeeSummary = useMemo(() => {
    if (!employeeId) return null;
    return allSummaries.find((row) => String(row.profile.id) === String(employeeId)) || null;
  }, [allSummaries, employeeId]);

  const selectedActivityGroups = useMemo(() => {
    if (!selectedEmployeeSummary) return [];
    const taskById = new Map(selectedEmployeeSummary.detailRows.map((row) => [String(row.taskId), row]));
    const groups = new Map<string, {
      key: string;
      title: string;
      entries: ActivityPerformanceEntry[];
      metricKeys: string[];
      rows: Array<TaskDetailRow & { metricValues: Record<string, number>; metricAmounts: Record<string, number>; groupAmount: number }>;
      totalAmount: number;
    }>();

    (selectedEmployeeSummary.activityPerformanceEntries || []).forEach((entry) => {
      const groupKey = String(entry.source_rule_id || 'unknown');
      const current = groups.get(groupKey) || {
        key: groupKey,
        title: entry.title || 'محاسبه عملکرد',
        entries: [],
        metricKeys: [],
        rows: [],
        totalAmount: 0,
      };
      current.entries.push(entry);
      const metricKey = String(entry.metric_key || 'amount');
      if (!current.metricKeys.includes(metricKey)) current.metricKeys.push(metricKey);
      current.totalAmount += toNumber(entry.amount);
      groups.set(groupKey, current);
    });

    groups.forEach((group) => {
      const rowsByTask = new Map<string, TaskDetailRow & { metricValues: Record<string, number>; metricAmounts: Record<string, number>; groupAmount: number }>();
      group.entries.forEach((entry) => {
        const taskId = String(entry.task_id || '').trim();
        const baseRow = taskById.get(taskId);
        if (!baseRow) return;
        const row = rowsByTask.get(taskId) || {
          ...baseRow,
          metricValues: {},
          metricAmounts: {},
          groupAmount: 0,
        };
        const metricKey = String(entry.metric_key || 'amount');
        row.metricValues[metricKey] = (row.metricValues[metricKey] || 0) + toNumber(entry.quantity ?? 1);
        row.metricAmounts[metricKey] = (row.metricAmounts[metricKey] || 0) + toNumber(entry.amount);
        row.groupAmount += toNumber(entry.amount);
        rowsByTask.set(taskId, row);
      });
      group.rows = Array.from(rowsByTask.values());
    });

    const matchedTaskIds = new Set(
      Array.from(groups.values()).flatMap((group) => group.rows.map((row) => String(row.taskId))),
    );
    const unmatchedRows = selectedEmployeeSummary.detailRows
      .filter((row) => !matchedTaskIds.has(String(row.taskId)))
      .map((row) => ({
        ...row,
        metricValues: {},
        metricAmounts: {},
        groupAmount: 0,
      }));
    return [
      ...Array.from(groups.values()).filter((group) => group.rows.length > 0),
      ...(unmatchedRows.length > 0 ? [{
        key: 'without_activity_performance',
        title: 'بدون محاسبه عملکرد',
        entries: [],
        metricKeys: [],
        rows: unmatchedRows,
        totalAmount: 0,
      }] : []),
    ];
  }, [selectedEmployeeSummary]);

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
  const filteredAttendanceRows = useMemo(() => {
    if (!selectedEmployeeIds.length) return attendanceRows;
    return attendanceRows.filter((row) => {
      const directEmployeeId = String(row.employee_id || '').trim();
      if (directEmployeeId) return selectedEmployeeIdSet.has(directEmployeeId);
      const assigneeEmployeeId = row.assignee_id
        ? String(profileByRelatedId.get(String(row.assignee_id))?.id || '').trim()
        : '';
      if (assigneeEmployeeId) return selectedEmployeeIdSet.has(assigneeEmployeeId);
      const relatedEmployeeId = row.related_profile_id
        ? String(profileByRelatedId.get(String(row.related_profile_id))?.id || '').trim()
        : '';
      if (relatedEmployeeId) return selectedEmployeeIdSet.has(relatedEmployeeId);
      return false;
    });
  }, [attendanceRows, profileByRelatedId, selectedEmployeeIdSet, selectedEmployeeIds.length]);

  const attendanceTopStats = useMemo(() => ({
    total: filteredAttendanceRows.length,
    checkIns: filteredAttendanceRows.filter((row) => String(row.log_type || '').trim() === 'check_in').length,
    checkOuts: filteredAttendanceRows.filter((row) => String(row.log_type || '').trim() === 'check_out').length,
  }), [filteredAttendanceRows]);
  const incompleteAttendanceRows = useMemo<IncompleteAttendanceRow[]>(() => {
    const incompleteIds = getIncompleteAttendanceRowIds(filteredAttendanceRows);
    return filteredAttendanceRows
      .filter((row) => incompleteIds.has(String(row.id || '').trim()))
      .map((raw) => {
        const directEmployeeId = String(raw.employee_id || '').trim();
        const employee = directEmployeeId
          ? profileById.get(directEmployeeId) || null
          : (raw.assignee_id ? profileByRelatedId.get(String(raw.assignee_id)) : undefined)
            || (raw.related_profile_id ? profileByRelatedId.get(String(raw.related_profile_id)) : undefined)
            || null;
        const logType = String(raw.log_type || '').trim().toLowerCase() === 'check_out'
          ? 'check_out' as const
          : 'check_in' as const;
        const occurredAt = logType === 'check_in'
          ? getAttendanceCheckInAt(raw)
          : getAttendanceCheckOutAt(raw);
        return {
          key: String(raw.id),
          raw,
          employeeName: employee?.full_name || 'کارمند نامشخص',
          attendanceDate: getAttendanceDateValue(raw) || null,
          occurredAt,
          logType,
          missingLogType: (logType === 'check_in' ? 'check_out' : 'check_in') as 'check_in' | 'check_out',
        };
      })
      .sort((a, b) => (parseDate(b.occurredAt || null)?.valueOf() || 0) - (parseDate(a.occurredAt || null)?.valueOf() || 0));
  }, [filteredAttendanceRows, profileById, profileByRelatedId]);
  const attendanceApprovedLeaveStats = useMemo(() => {
    let hourlyMinutes = 0;
    const dailyDayKeys = new Set<string>();
    leaveRequests.forEach((request) => {
      if (!isApprovedLeaveStatus(request.status) || !request.employeeId) return;
      const employeeIdValue = String(request.employeeId || '').trim();
      if (!employeeIdValue || !selectedEmployeeIdSet.has(employeeIdValue)) return;
      const leaveType = String(request.leaveType || '').trim().toLowerCase();
      const start = parseDate(request.startDate || null);
      const end = parseDate(request.endDate || request.startDate || null);
      if (leaveType === 'hourly') {
        const fallbackMinutes = Math.max(0, toNumber(request.totalMinutes ?? 0));
        if (!start || !end) {
          hourlyMinutes += fallbackMinutes;
          return;
        }
        const overlapStart = start.valueOf() < monthStart.valueOf() ? monthStart : start;
        const overlapEnd = end.valueOf() > monthEnd.valueOf() ? monthEnd : end;
        const overlap = overlapEnd.valueOf() > overlapStart.valueOf()
          ? Math.floor((overlapEnd.valueOf() - overlapStart.valueOf()) / (1000 * 60))
          : 0;
        hourlyMinutes += overlap > 0 ? overlap : fallbackMinutes;
        return;
      }
      if (!start || !end) return;
      const rangeStart = start.valueOf() < monthStart.valueOf() ? monthStart : start;
      const rangeEnd = end.valueOf() > monthEnd.valueOf() ? monthEnd : end;
      let cursor = rangeStart.startOf('day');
      const finalDay = rangeEnd.startOf('day');
      while (cursor.valueOf() <= finalDay.valueOf()) {
        const dayKey = toIsoDateKey(cursor);
        if (dayKey) dailyDayKeys.add(`${employeeIdValue}::${dayKey}`);
        cursor = cursor.add(1, 'day');
      }
    });
    return {
      hourlyMinutes,
      dailyDays: dailyDayKeys.size,
    };
  }, [leaveRequests, monthEnd, monthStart, selectedEmployeeIdSet]);

  const approvedLeaveByEmployeeDate = useMemo(() => {
    const byEmployeeDate = new Map<string, Map<string, ApprovedLeaveRequest[]>>();
    leaveRequests
      .filter((request) => request.employeeId && isApprovedLeaveStatus(request.status))
      .forEach((request) => {
        const start = parseDate(request.startDate || null);
        const end = parseDate(request.endDate || request.startDate || null);
        if (!start || !end || !request.employeeId) return;
        const requestStart = start.startOf('day');
        const requestEnd = end.endOf('day');
        const rangeStart = requestStart.valueOf() < monthStart.valueOf() ? monthStart : requestStart;
        const rangeEnd = requestEnd.valueOf() > monthEnd.valueOf() ? monthEnd : requestEnd;
        let cursor = rangeStart.startOf('day');
        const finalDay = rangeEnd.startOf('day');
        while (cursor.valueOf() <= finalDay.valueOf()) {
          const dateKey = toIsoDateKey(cursor);
          if (!dateKey) {
            cursor = cursor.add(1, 'day');
            continue;
          }
          const employeeKey = String(request.employeeId);
          const dateMap = byEmployeeDate.get(employeeKey) || new Map<string, ApprovedLeaveRequest[]>();
          const list = dateMap.get(dateKey) || [];
          list.push(request);
          dateMap.set(dateKey, list);
          byEmployeeDate.set(employeeKey, dateMap);
          cursor = cursor.add(1, 'day');
        }
      });
    return byEmployeeDate;
  }, [leaveRequests, monthEnd, monthStart]);

  const approvedLeaveById = useMemo(() => {
    const map = new Map<string, ApprovedLeaveRequest>();
    leaveRequests
      .filter((request) => isApprovedLeaveStatus(request.status))
      .forEach((request) => {
        const id = String(request.id || '').trim();
        if (id) map.set(id, request);
      });
    return map;
  }, [leaveRequests]);

  const computeScheduleForEmployee = useCallback(
    (employeeId: string | null, targetDateIso: string | null) => {
      if (!employeeId || !targetDateIso) {
        return { title: null, start: null as string | null, end: null as string | null, shifts: [] as AttendanceScheduleShift[] };
      }

      const targetDate = parseDate(targetDateIso);
      if (!targetDate) {
        return { title: null, start: null as string | null, end: null as string | null, shifts: [] as AttendanceScheduleShift[] };
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
        const isLegacyDirectEmployeeSchedule = String(schedule.employee_id || '') === String(employeeId);
        if (!matchedColumn && !isLegacyDirectEmployeeSchedule) continue;

        const currentDayPlan = resolveWorkScheduleDayPlan({
          monthlyPlan: matchedColumn?.monthlyPlan,
          weeklyPlan: matchedColumn ? matchedColumn?.weeklyPlan : schedule.weekly_plan,
          dateKey: targetDate.format('YYYY-MM-DD'),
          weekdayKey: dayKey,
        });
        if (!currentDayPlan) continue;

        const shifts: AttendanceScheduleShift[] = (['shift1', 'shift2'] as const)
          .map((shiftKey, index) => ({
            key: shiftKey,
            label: `شیفت ${toPersianNumber(index + 1)}`,
            start: currentDayPlan[shiftKey].start,
            end: currentDayPlan[shiftKey].end,
          }))
          .filter((shift) => shift.start || shift.end)
          .sort((a, b) => (timeToMinutes(a.start || a.end) ?? 0) - (timeToMinutes(b.start || b.end) ?? 0));
        const starts = shifts.map((shift) => timeToMinutes(shift.start)).filter((value): value is number => value !== null);
        const ends = shifts.map((shift) => timeToMinutes(shift.end)).filter((value): value is number => value !== null);
        const earliestStart = starts.length ? Math.min(...starts) : null;
        const latestEnd = ends.length ? Math.max(...ends) : null;

        return {
          title: schedule.title || null,
          start: minutesToTime(earliestStart),
          end: minutesToTime(latestEnd),
          shifts,
        };
      }

      return { title: null, start: null as string | null, end: null as string | null, shifts: [] as AttendanceScheduleShift[] };
    },
    [scheduleRows],
  );

  const attendanceComputedRows = useMemo<AttendanceComputedRow[]>(() => {
    const dailyRows = new Map<string, {
      row: AttendanceComputedRow;
      firstAtValue: number;
      lastAtValue: number;
      checkIns: string[];
      checkOuts: string[];
    }>();

    attendanceRows.forEach((row) => {
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
        const checkInAt = getAttendanceCheckInAt(row);
        const checkOutAt = getAttendanceCheckOutAt(row);
        const baseAt = checkInAt || checkOutAt || row.occurred_at || null;
        const parsedBaseAt = parseDate(baseAt);
        const attendanceBaseDate = getAttendanceDateValue(row) || baseAt;
        const attendanceDate = toIsoDateKey(parseDate(attendanceBaseDate || null));
        const approvedLeaveRequestsByEmployee = employeeId && attendanceDate
          ? approvedLeaveByEmployeeDate.get(String(employeeId))?.get(attendanceDate) || []
          : [];
        const linkedLeaveIds = extractUuidList([row.notes, row.location_text].filter(Boolean).join(' '));
        const approvedLeaveRequestsByLinkedId = linkedLeaveIds
          .map((id) => approvedLeaveById.get(id) || null)
          .filter((request): request is ApprovedLeaveRequest => Boolean(request && isLeaveRequestActiveOnDate(request, attendanceDate)));
        const approvedLeaveRequests = Array.from(
          new Map(
            [...approvedLeaveRequestsByEmployee, ...approvedLeaveRequestsByLinkedId]
              .map((request) => [String(request.id), request] as const),
          ).values(),
        );
        const leaveIntervals = attendanceDate
          ? getLeaveIntervalsForDay(approvedLeaveRequests, attendanceDate)
          : [];
        const groupKey = `${employeeId || row.assignee_id || row.related_profile_id || 'unknown'}::${attendanceDate || row.id}`;
        const existing = dailyRows.get(groupKey);
        const sourceTypes = [existing?.row.sourceType, row.source_type].filter((item) => item && item !== '-');
        const rawNotes = [existing?.row.notes, row.notes].filter(Boolean).join(' | ') || null;
        const cleanedNotes = removeUuidTokens(rawNotes);
        const leaveNoteLabel = buildApprovedLeaveNoteLabel(approvedLeaveRequests);
        const notes = leaveNoteLabel && (!cleanedNotes || cleanedNotes.length < 3)
          ? leaveNoteLabel
          : (cleanedNotes || null);
        const locationText = [existing?.row.locationText, row.location_text].filter(Boolean).join(' | ') || null;
        const checkIns = normalizeAttendanceDateTimes([...(existing?.checkIns || []), checkInAt || null]);
        const checkOuts = normalizeAttendanceDateTimes([...(existing?.checkOuts || []), checkOutAt || null]);
        const attendanceSegments = buildAttendanceSegments([
          ...checkIns.map((checkInAt, order) => ({
            rowId: `check-in-${order}`,
            type: 'check_in' as const,
            at: parseDate(checkInAt)?.toDate() || new Date(0),
            order,
          })),
          ...checkOuts.map((checkOutAt, order) => ({
            rowId: `check-out-${order}`,
            type: 'check_out' as const,
            at: parseDate(checkOutAt)?.toDate() || new Date(0),
            order: checkIns.length + order,
          })),
        ].filter((event) => event.at.getTime() > 0), groupKey);
        const nextCheckInAt = checkIns[0] || null;
        const nextCheckOutAt = checkOuts[checkOuts.length - 1] || null;
        const rowTimeValue = parsedBaseAt?.valueOf() || 0;
        const firstAtValue = existing ? Math.min(existing.firstAtValue, rowTimeValue || existing.firstAtValue) : rowTimeValue;
        const lastAtValue = existing ? Math.max(existing.lastAtValue, rowTimeValue || existing.lastAtValue) : rowTimeValue;
        const occurredAt = parseDate(nextCheckOutAt || null)?.valueOf()
          ? nextCheckOutAt
          : nextCheckInAt || baseAt;
        const rawSchedule = computeScheduleForEmployee(employeeId, nextCheckInAt || nextCheckOutAt || baseAt);
        const isOfficialHolidayOff = Boolean(
          attendanceDate
          && officialHolidayDateKeys.has(attendanceDate)
          && employee?.works_on_official_holidays !== true,
        );
        const schedule = isOfficialHolidayOff
          ? { title: rawSchedule.title, start: null as string | null, end: null as string | null, shifts: [] as AttendanceScheduleShift[] }
          : rawSchedule;
        const scheduledMinutes = attendanceDate ? getScheduledMinutesByShifts(schedule.shifts) : 0;
        const requiredMinutes = scheduledMinutes;
        const coveredScheduledMinutes = attendanceDate
          ? Math.min(scheduledMinutes, getLeaveCoveredScheduledMinutes(leaveIntervals, attendanceDate, schedule.shifts))
          : 0;
        const coveredRequiredMinutes = scheduledMinutes > 0
          ? coveredScheduledMinutes
          : (leaveIntervals.length > 0 ? requiredMinutes : 0);
        const shiftDeltas = buildAttendanceShiftDeltas(schedule.shifts, checkIns, checkOuts);
        const adjustedShiftDeltas = shiftDeltas.map((shift) => {
          if (!attendanceDate || leaveIntervals.length === 0) return shift;
          const shiftStart = buildDateTimeFromIsoDateAndTime(attendanceDate, shift.start);
          const shiftEnd = buildDateTimeFromIsoDateAndTime(attendanceDate, shift.end);
          const shiftCheckIn = parseDate(shift.checkInAt || null);
          const shiftCheckOut = parseDate(shift.checkOutAt || null);
          const lateExemptMinutes = leaveIntervals.reduce(
            (sum, interval) => sum + getOverlapMinutes(shiftStart, shiftCheckIn, interval.start, interval.end),
            0,
          );
          const earlyLeaveExemptMinutes = leaveIntervals.reduce(
            (sum, interval) => sum + getOverlapMinutes(shiftCheckOut, shiftEnd, interval.start, interval.end),
            0,
          );
          return {
            ...shift,
            lateMinutes: Math.max(0, shift.lateMinutes - lateExemptMinutes),
            earlyLeaveMinutes: Math.max(0, shift.earlyLeaveMinutes - earlyLeaveExemptMinutes),
          };
        });
        const checkInMinutes = dateTimeToMinutes(nextCheckInAt);
        const checkOutMinutes = dateTimeToMinutes(nextCheckOutAt);
        const startMinutes = timeToMinutes(schedule.start);
        const endMinutes = timeToMinutes(schedule.end);
        const fallbackDelta = {
          lateMinutes: checkInMinutes !== null && startMinutes !== null ? Math.max(checkInMinutes - startMinutes, 0) : 0,
          earlyArrivalMinutes: checkInMinutes !== null && startMinutes !== null ? Math.max(startMinutes - checkInMinutes, 0) : 0,
          earlyLeaveMinutes: checkOutMinutes !== null && endMinutes !== null ? Math.max(endMinutes - checkOutMinutes, 0) : 0,
          overtimeStayMinutes: checkOutMinutes !== null && endMinutes !== null ? Math.max(checkOutMinutes - endMinutes, 0) : 0,
        };
        const fallbackScheduledStart = attendanceDate ? buildDateTimeFromIsoDateAndTime(attendanceDate, schedule.start) : null;
        const fallbackScheduledEnd = attendanceDate ? buildDateTimeFromIsoDateAndTime(attendanceDate, schedule.end) : null;
        const fallbackCheckInAt = parseDate(nextCheckInAt || null);
        const fallbackCheckOutAt = parseDate(nextCheckOutAt || null);
        const fallbackLateExempt = leaveIntervals.reduce(
          (sum, interval) => sum + getOverlapMinutes(fallbackScheduledStart, fallbackCheckInAt, interval.start, interval.end),
          0,
        );
        const fallbackEarlyLeaveExempt = leaveIntervals.reduce(
          (sum, interval) => sum + getOverlapMinutes(fallbackCheckOutAt, fallbackScheduledEnd, interval.start, interval.end),
          0,
        );
        const adjustedFallbackDelta = {
          ...fallbackDelta,
          lateMinutes: Math.max(0, fallbackDelta.lateMinutes - fallbackLateExempt),
          earlyLeaveMinutes: Math.max(0, fallbackDelta.earlyLeaveMinutes - fallbackEarlyLeaveExempt),
        };
        const shiftTotals = adjustedShiftDeltas.reduce(
          (acc, shift) => ({
            lateMinutes: acc.lateMinutes + shift.lateMinutes,
            earlyArrivalMinutes: acc.earlyArrivalMinutes + shift.earlyArrivalMinutes,
            earlyLeaveMinutes: acc.earlyLeaveMinutes + shift.earlyLeaveMinutes,
            overtimeStayMinutes: acc.overtimeStayMinutes + shift.overtimeStayMinutes,
          }),
          { lateMinutes: 0, earlyArrivalMinutes: 0, earlyLeaveMinutes: 0, overtimeStayMinutes: 0 },
        );
        const totalsForDelta = adjustedShiftDeltas.length ? shiftTotals : adjustedFallbackDelta;
        let lateMinutes = totalsForDelta.lateMinutes;
        const earlyArrivalMinutes = totalsForDelta.earlyArrivalMinutes;
        let earlyLeaveMinutes = totalsForDelta.earlyLeaveMinutes;
        const overtimeStayMinutes = totalsForDelta.overtimeStayMinutes;
        const hourlyApprovedMinutes = approvedLeaveRequests.reduce((sum, request) => {
          if (String(request.leaveType || '').trim().toLowerCase() !== 'hourly') return sum;
          return sum + Math.max(0, toNumber(request.totalMinutes ?? 0));
        }, 0);
        // Fallback for hourly leaves that are approved but do not carry a usable time interval.
        if (leaveIntervals.length === 0 && hourlyApprovedMinutes > 0) {
          const deductLate = Math.min(lateMinutes, hourlyApprovedMinutes);
          lateMinutes -= deductLate;
          const remaining = hourlyApprovedMinutes - deductLate;
          if (remaining > 0) {
            earlyLeaveMinutes = Math.max(0, earlyLeaveMinutes - remaining);
          }
        }
        const deltaSummary = summarizeAttendanceDelta(
          lateMinutes,
          earlyArrivalMinutes,
          earlyLeaveMinutes,
          overtimeStayMinutes,
        );
        const isApprovedLeave = leaveIntervals.length > 0 || hourlyApprovedMinutes > 0 || approvedLeaveRequests.length > 0;
        const deltaLabel = isApprovedLeave
          ? deltaSummary.deltaLabel === 'بدون اختلاف'
            ? 'مرخصی تاییدشده'
            : `مرخصی تاییدشده / ${deltaSummary.deltaLabel}`
          : deltaSummary.deltaLabel;
        const deltaColor = isApprovedLeave ? 'cyan' : deltaSummary.deltaColor;

        dailyRows.set(groupKey, {
          firstAtValue,
          lastAtValue,
          checkIns,
          checkOuts,
          row: {
            key: groupKey,
            id: existing?.row.id || row.id,
            rawIds: [...(existing?.row.rawIds || []), row.id],
            checkInRawId: existing?.row.checkInRawId || (checkInAt ? row.id : null),
            checkOutRawId: checkOutAt ? row.id : existing?.row.checkOutRawId || null,
            employeeId: employeeId || null,
            employeeName: String(employeeName || 'بدون کارمند'),
            logType: nextCheckInAt && nextCheckOutAt ? 'daily' : nextCheckInAt ? 'check_in' : nextCheckOutAt ? 'check_out' : String(row.log_type || '-'),
            occurredAt: occurredAt || null,
            attendanceDate,
            checkInAt: nextCheckInAt,
            checkOutAt: nextCheckOutAt,
            sourceType: sourceTypes.length ? Array.from(new Set(sourceTypes.map(String))).join(' / ') : '-',
            notes,
            locationText,
            scheduleTitle: schedule.title,
            scheduledStart: schedule.start,
            scheduledEnd: schedule.end,
            scheduleShifts: schedule.shifts,
            shiftDeltas: adjustedShiftDeltas,
            attendanceSegments,
            lateMinutes,
            earlyArrivalMinutes,
            earlyLeaveMinutes,
            overtimeStayMinutes,
            approvedLeaveMinutes: Math.max(coveredRequiredMinutes, leaveIntervals.length === 0 ? hourlyApprovedMinutes : coveredRequiredMinutes),
            isApprovedLeave,
            approvedLeaveRequestId: approvedLeaveRequests[0]?.id || null,
            approvedLeaveType: approvedLeaveRequests[0]?.leaveType || null,
            deltaLabel,
            deltaColor,
          },
        });
      });

    const timelineEmployeeIds = Array.from(
      new Set(
        (selectedEmployeeIds.length ? selectedEmployeeIds : profiles.map((profile) => profile.id))
          .map((value) => String(value || '').trim())
          .filter(Boolean),
      ),
    );

    timelineEmployeeIds.forEach((employeeId) => {
      const profile = profileById.get(employeeId);
      const employeeName = String(profile?.full_name || employeeId);
      let cursor = monthStart.startOf('day');
      const today = dayjs().endOf('day');
      const finalDay = (monthEnd.valueOf() < today.valueOf() ? monthEnd : today).startOf('day');
      while (cursor.valueOf() <= finalDay.valueOf()) {
        const attendanceDate = toIsoDateKey(cursor);
        if (!attendanceDate) {
          cursor = cursor.add(1, 'day');
          continue;
        }
        const groupKey = `${employeeId}::${attendanceDate}`;
        if (dailyRows.has(groupKey)) {
          cursor = cursor.add(1, 'day');
          continue;
        }
        if (officialHolidayDateKeys.has(attendanceDate) && profile?.works_on_official_holidays !== true) {
          cursor = cursor.add(1, 'day');
          continue;
        }

        const schedule = computeScheduleForEmployee(employeeId, attendanceDate);
        const scheduledMinutes = getScheduledMinutesByShifts(schedule.shifts);
        const requiredMinutes = scheduledMinutes;
        const approvedLeaveRequests = approvedLeaveByEmployeeDate.get(employeeId)?.get(attendanceDate) || [];
        const leaveIntervals = getLeaveIntervalsForDay(approvedLeaveRequests, attendanceDate);
        const coveredScheduledMinutes = Math.min(
          scheduledMinutes,
          getLeaveCoveredScheduledMinutes(leaveIntervals, attendanceDate, schedule.shifts),
        );
        const coveredRequiredMinutes = scheduledMinutes > 0
          ? coveredScheduledMinutes
          : (leaveIntervals.length > 0 ? requiredMinutes : 0);
        const hasApprovedLeave = leaveIntervals.length > 0;
        const hasAnySchedule = scheduledMinutes > 0 || schedule.shifts.length > 0;
        if (!hasAnySchedule && !hasApprovedLeave) {
          cursor = cursor.add(1, 'day');
          continue;
        }

        const syntheticShiftDeltas = schedule.shifts.map((shift) => ({
          ...shift,
          checkInAt: null,
          checkOutAt: null,
          lateMinutes: 0,
          earlyArrivalMinutes: 0,
          earlyLeaveMinutes: hasApprovedLeave ? 0 : getScheduledMinutesByShifts([shift]),
          overtimeStayMinutes: 0,
        }));
        const deltaLabel = hasApprovedLeave ? 'مرخصی تاییدشده' : 'غیبت';
        const deltaColor = hasApprovedLeave ? 'cyan' : 'red';
        const notes = hasApprovedLeave
          ? (buildApprovedLeaveNoteLabel(approvedLeaveRequests) || 'مرخصی تاییدشده')
          : 'غیبت بر اساس برنامه حضور';
        const middleAt = parseDate(`${attendanceDate}T12:00:00`)?.valueOf() || 0;
        dailyRows.set(groupKey, {
          firstAtValue: middleAt,
          lastAtValue: middleAt,
          checkIns: [],
          checkOuts: [],
          row: {
            key: groupKey,
            id: `${employeeId}_${attendanceDate}_synthetic`,
            rawIds: [],
            checkInRawId: null,
            checkOutRawId: null,
            employeeId,
            employeeName,
            logType: hasApprovedLeave ? 'leave' : 'absence',
            occurredAt: `${attendanceDate}T12:00:00`,
            attendanceDate,
            checkInAt: null,
            checkOutAt: null,
            sourceType: hasApprovedLeave ? 'leave_request' : 'system',
            notes,
            locationText: null,
            scheduleTitle: schedule.title,
            scheduledStart: schedule.start,
            scheduledEnd: schedule.end,
            scheduleShifts: schedule.shifts,
            shiftDeltas: syntheticShiftDeltas,
            attendanceSegments: [],
            lateMinutes: 0,
            earlyArrivalMinutes: 0,
            earlyLeaveMinutes: hasApprovedLeave ? 0 : scheduledMinutes,
            overtimeStayMinutes: 0,
            approvedLeaveMinutes: coveredRequiredMinutes,
            isApprovedLeave: hasApprovedLeave,
            approvedLeaveRequestId: approvedLeaveRequests[0]?.id || null,
            approvedLeaveType: approvedLeaveRequests[0]?.leaveType || null,
            deltaLabel,
            deltaColor,
          },
        });

        cursor = cursor.add(1, 'day');
      }
    });

    return Array.from(dailyRows.values())
      .sort((a, b) => {
        const aDate = parseDate(a.row.attendanceDate ? `${a.row.attendanceDate}T12:00:00` : null)?.valueOf() || 0;
        const bDate = parseDate(b.row.attendanceDate ? `${b.row.attendanceDate}T12:00:00` : null)?.valueOf() || 0;
        if (aDate !== bDate) return bDate - aDate;
        return b.lastAtValue - a.lastAtValue;
      })
      .map((item) => item.row)
      .filter((row) => {
        if (!selectedEmployeeIds.length) return true;
        return !!row.employeeId && selectedEmployeeIdSet.has(String(row.employeeId));
      });
  }, [
    attendanceRows,
    approvedLeaveByEmployeeDate,
    approvedLeaveById,
    computeScheduleForEmployee,
    monthEnd,
    monthStart,
    profileById,
    profileByRelatedId,
    profiles,
    officialHolidayDateKeys,
    selectedEmployeeIdSet,
    selectedEmployeeIds,
  ]);

  const attendancePresenceMinutesByEmployeeId = useMemo(() => {
    const next = new Map<string, number>();
    attendanceComputedRows.forEach((row) => {
      const employeeIdValue = String(row.employeeId || '').trim();
      if (!employeeIdValue) return;
      next.set(employeeIdValue, (next.get(employeeIdValue) || 0) + calculateAttendanceRowPresenceMinutes(row));
    });
    return next;
  }, [attendanceComputedRows]);

  const computeRequiredWorkMinutesForProfile = useCallback((profile: ProfileRecord | null | undefined) => {
    if (!profile?.id) return 0;
    let total = 0;
    let cursor = monthStart.startOf('day');
    const end = monthEnd.startOf('day');
    while (cursor.valueOf() <= end.valueOf()) {
      const dateIso = toNativeGregorianDateString(cursor);
      if (dateIso && officialHolidayDateKeys.has(dateIso) && profile.works_on_official_holidays !== true) {
        cursor = cursor.add(1, 'day');
        continue;
      }
      const schedule = computeScheduleForEmployee(String(profile.id), dateIso);
      if (schedule.shifts.length > 0) {
        total += schedule.shifts.reduce((sum, shift) => {
          const start = timeToMinutes(shift.start);
          const finish = timeToMinutes(shift.end);
          return sum + (start !== null && finish !== null && finish > start ? finish - start : 0);
        }, 0);
      } else if (cursor.toDate().getDay() !== 5) {
        total += toNumber(profile.expected_daily_minutes || 480);
      }
      cursor = cursor.add(1, 'day');
    }
    return total;
  }, [computeScheduleForEmployee, monthEnd, monthStart, officialHolidayDateKeys]);

  const paidLeaveEligibleMinutesByAttendanceRowKey = useMemo(() => {
    const next = new Map<string, number>();
    const usedPaidLeaveMinutesByEmployeeId = new Map<string, number>();
    const rows = [...attendanceComputedRows].sort((a, b) => String(a.attendanceDate || '').localeCompare(String(b.attendanceDate || '')));
    rows.forEach((row) => {
      const employeeIdValue = String(row.employeeId || '').trim();
      if (!employeeIdValue) return;
      const profile = profileById.get(employeeIdValue) || null;
      const usedPaidLeaveMinutes = usedPaidLeaveMinutesByEmployeeId.get(employeeIdValue) || 0;
      const eligibleMinutes = calculateAttendancePaidLeaveMinutes(row, profile, usedPaidLeaveMinutes);
      usedPaidLeaveMinutesByEmployeeId.set(employeeIdValue, usedPaidLeaveMinutes + eligibleMinutes);
      next.set(row.key, eligibleMinutes);
    });
    return next;
  }, [attendanceComputedRows, profileById]);

  const payrollAttendanceTotalsByEmployeeId = useMemo(() => {
    const next = new Map<string, {
      presenceMinutes: number;
      hourlyAmount: number;
      overtimeMinutes: number;
      overtimeAmount: number;
      earlyBonusMinutes: number;
      earlyBonusAmount: number;
      delayAbsenceMinutes: number;
      delayAbsenceAmount: number;
      paidLeaveMinutes: number;
      paidLeaveAmount: number;
    }>();
    const rows = [...attendanceComputedRows].sort((a, b) => String(a.attendanceDate || '').localeCompare(String(b.attendanceDate || '')));
    rows.forEach((row) => {
      const employeeIdValue = String(row.employeeId || '').trim();
      if (!employeeIdValue) return;
      const profile = profileById.get(employeeIdValue) || null;
      const current = next.get(employeeIdValue) || {
        presenceMinutes: 0,
        hourlyAmount: 0,
        overtimeMinutes: 0,
        overtimeAmount: 0,
        earlyBonusMinutes: 0,
        earlyBonusAmount: 0,
        delayAbsenceMinutes: 0,
        delayAbsenceAmount: 0,
        paidLeaveMinutes: 0,
        paidLeaveAmount: 0,
      };
      const requiredMinutes = computeRequiredWorkMinutesForProfile(profile);
      const presenceMinutes = calculateAttendanceRowPresenceMinutes(row);
      const hourlyRate = resolvePayrollHourlyRateForProfile(profile, presenceMinutes, requiredMinutes);
      const overtimeMinutes = calculateAttendanceOvertimeMinutes(row);
      // پاداش اضافه‌کاری فقط با نرخ صریح همان کارمند محاسبه می‌شود؛ نرخ خالی/صفر مجوز جایگزینی با دستمزد ساعتی نیست.
      const overtimeRate = Math.max(0, toNumber(profile?.overtime_rate));
      const earlyBonusMinutes = calculateAttendanceEarlyBonusMinutes(row);
      const earlyBonusRate = toNumber(profile?.early_bonus_rate) || hourlyRate;
      const paidLeaveMinutes = paidLeaveEligibleMinutesByAttendanceRowKey.get(row.key) || 0;
      const delayAbsenceMinutes = calculateAttendanceDelayAbsenceMinutes(row, profile, paidLeaveMinutes);
      // جریمه تاخیر و غیبت نیز باید صریحاً برای کارمند تنظیم شده باشد.
      const delayAbsenceRate = Math.max(0, toNumber(profile?.late_penalty_rate));

      current.presenceMinutes += presenceMinutes;
      current.hourlyAmount += Math.round((presenceMinutes / 60) * hourlyRate);
      current.overtimeMinutes += overtimeMinutes;
      current.overtimeAmount += Math.round((overtimeMinutes / 60) * overtimeRate);
      current.earlyBonusMinutes += earlyBonusMinutes;
      current.earlyBonusAmount += Math.round((earlyBonusMinutes / 60) * earlyBonusRate);
      current.delayAbsenceMinutes += delayAbsenceMinutes;
      current.delayAbsenceAmount += Math.round((delayAbsenceMinutes / 60) * delayAbsenceRate);
      current.paidLeaveMinutes += paidLeaveMinutes;
      current.paidLeaveAmount += Math.round((paidLeaveMinutes / 60) * hourlyRate);
      next.set(employeeIdValue, current);
    });
    return next;
  }, [attendanceComputedRows, computeRequiredWorkMinutesForProfile, paidLeaveEligibleMinutesByAttendanceRowKey, profileById]);

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
    return requestRows.filter((row) =>
      ['leave_requests', 'overtime_requests', 'mission_requests'].includes(String(row.moduleId || ''))
      && (!row.employeeId || selectedEmployeeIdSet.has(String(row.employeeId)))
    );
  }, [requestRows, selectedEmployeeIdSet]);

  const visibleCompensationRows = useMemo(() => {
    return requestRows.filter((row) =>
      ['employee_bonus_requests', 'employee_penalty_requests'].includes(String(row.moduleId || ''))
      && (!row.employeeId || selectedEmployeeIdSet.has(String(row.employeeId)))
    );
  }, [requestRows, selectedEmployeeIdSet]);

  const visibleRequestStats = useMemo(() => {
    return visibleRequestRows.reduce((acc, row) => {
      const moduleId = String(row.moduleId || '');
      const isPending = String(row.status || '').trim().toLowerCase() === 'pending';
      if (moduleId === 'leave_requests') {
        acc.leaveTotal += 1;
        if (isPending) acc.leavePending += 1;
      } else if (moduleId === 'overtime_requests') {
        acc.overtimeTotal += 1;
        if (isPending) acc.overtimePending += 1;
      } else if (moduleId === 'mission_requests') {
        acc.missionTotal += 1;
        if (isPending) acc.missionPending += 1;
      }
      return acc;
    }, {
      leaveTotal: 0,
      leavePending: 0,
      overtimeTotal: 0,
      overtimePending: 0,
      missionTotal: 0,
      missionPending: 0,
    });
  }, [visibleRequestRows]);

  const visibleCompensationStats = useMemo(() => {
    return visibleCompensationRows.reduce((acc, row) => {
      const moduleId = String(row.moduleId || '');
      const isPending = String(row.status || '').trim().toLowerCase() === 'pending';
      if (moduleId === 'employee_bonus_requests') {
        acc.bonusTotal += 1;
        if (isPending) acc.bonusPending += 1;
      } else if (moduleId === 'employee_penalty_requests') {
        acc.penaltyTotal += 1;
        if (isPending) acc.penaltyPending += 1;
      }
      return acc;
    }, {
      bonusTotal: 0,
      bonusPending: 0,
      penaltyTotal: 0,
      penaltyPending: 0,
    });
  }, [visibleCompensationRows]);

  const totals = useMemo(() => {
    return visibleSummaries.reduce(
      (acc, row) => {
        const employeeIdValue = String(row.profile.source_id || row.profile.id || '').trim();
        const compensation = resolvePayrollBaseCompensation({
          salaryType: row.profile.salary_type,
          baseSalary: row.profile.base_salary,
          hourlyRate: row.profile.hourly_rate,
          presenceMinutes: employeeIdValue ? (attendancePresenceMinutesByEmployeeId.get(employeeIdValue) || 0) : 0,
          requiredMinutes: computeRequiredWorkMinutesForProfile(row.profile),
        });
        const netPayable = compensation.amount
          + row.taskWageTotal
          + row.activityWageTotal
          + row.bonusTotal
          - row.penaltyTotal;
        return {
          employees: acc.employees + 1,
          totalTasks: acc.totalTasks + row.totalTasks,
          done: acc.done + row.doneCount,
          overdue: acc.overdue + row.overdueOpenCount,
          payable: acc.payable + netPayable,
        };
      },
      { employees: 0, totalTasks: 0, done: 0, overdue: 0, payable: 0 },
    );
  }, [attendancePresenceMinutesByEmployeeId, computeRequiredWorkMinutesForProfile, visibleSummaries]);

  const insuranceTotals = useMemo(() => {
    return visibleSummaries.reduce(
      (acc, row) => {
        if (row.profile.insurance_subject === false) return acc;
        const employeeIdValue = String(row.profile.source_id || row.profile.id || '').trim();
        const compensation = resolvePayrollBaseCompensation({
          salaryType: row.profile.salary_type,
          baseSalary: row.profile.base_salary,
          hourlyRate: row.profile.hourly_rate,
          presenceMinutes: employeeIdValue ? (attendancePresenceMinutesByEmployeeId.get(employeeIdValue) || 0) : 0,
          requiredMinutes: computeRequiredWorkMinutesForProfile(row.profile),
        });
        const employeeRate = toNumber(row.profile.employee_insurance_rate);
        const employerRate = toNumber(row.profile.employer_insurance_rate);
        const base = compensation.amount
          + row.taskWageTotal
          + row.activityWageTotal
          + row.bonusTotal
          - row.penaltyTotal;
        return {
          employee: acc.employee + ((base * employeeRate) / 100),
          employer: acc.employer + ((base * employerRate) / 100),
        };
      },
      { employee: 0, employer: 0 },
    );
  }, [attendancePresenceMinutesByEmployeeId, computeRequiredWorkMinutesForProfile, visibleSummaries]);

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

  const goalCards = useMemo(() => {
    const grouped = new Map<string, {
      key: string;
      goalId: string;
      goalName: string;
      moduleLabel: string;
      periodLabel: string;
      rows: EmployeeGoalTouchRow[];
      rewardTotal: number;
    }>();
    goalTouchRows.forEach((row) => {
      const current = grouped.get(row.goalId) || {
        key: row.goalId,
        goalId: row.goalId,
        goalName: row.goalName,
        moduleLabel: row.moduleLabel,
        periodLabel: row.periodLabel,
        rows: [],
        rewardTotal: 0,
      };
      current.rows.push(row);
      current.rewardTotal += toNumber(row.rewardSuggestion);
      grouped.set(row.goalId, current);
    });
    return Array.from(grouped.values());
  }, [goalTouchRows]);

  useEffect(() => {
    if (goalCards.length === 0) {
      setHrActiveGoalId(null);
      return;
    }
    if (!hrActiveGoalId || !goalCards.some((card) => card.goalId === hrActiveGoalId)) {
      setHrActiveGoalId(goalCards[0].goalId);
    }
  }, [goalCards, hrActiveGoalId]);

  const activeGoalCard = useMemo(
    () => goalCards.find((card) => card.goalId === hrActiveGoalId) || goalCards[0] || null,
    [goalCards, hrActiveGoalId],
  );

  const goalFulfillmentTotals = useMemo(() => ({
    totalGoals: goalCards.length,
    assignedMembers: goalTouchRows.length,
    rewardSuggestion: goalTouchRows.reduce((sum, row) => sum + row.rewardSuggestion, 0),
  }), [goalCards.length, goalTouchRows]);

  const selectedGoalSubjectUserIds = useMemo(
    () => visibleSummaries
      .map((row) => String(row.profile.related_profile_id || row.profile.id || '').trim())
      .filter(Boolean),
    [visibleSummaries],
  );
  const goalSubjectUserFilter = useMemo(
    () => (selectedEmployeeIds.length > 0 || selectedGoalSubjectUserIds.length === 0 ? selectedGoalSubjectUserIds : null),
    [selectedEmployeeIds.length, selectedGoalSubjectUserIds],
  );

  const commissionRowsByBucket = useMemo(() => {
    const empty: Record<CommissionReviewBucket, any[]> = {
      current_period: [],
      backlog: [],
      excluded: [],
    };
    commissionRows.forEach((row) => {
      (['current_period', 'backlog', 'excluded'] as CommissionReviewBucket[]).forEach((bucket) => {
        const bucketLines = row.lines.filter((line) => getCommissionLineReviewBucket(row, line) === bucket);
        if (bucketLines.length === 0) return;
        empty[bucket].push({
          ...row,
          key: `${row.key}:${bucket}`,
          lines: bucketLines,
          item_count: bucketLines.length,
          entitled_amount: bucketLines.reduce((sum, line) => sum + line.entitled_amount, 0),
          posted_amount: bucketLines.reduce((sum, line) => sum + line.posted_amount, 0),
          remaining_amount: bucketLines.reduce((sum, line) => sum + line.remaining_amount, 0),
          selected_amount: bucketLines.reduce((sum, line) => sum + line.selected_amount, 0),
          exclusion_reason: bucketLines.find((line) => line.exclusion_reason)?.exclusion_reason || row.exclusion_reason,
          sourceRowKey: row.key,
          bucket,
        });
      });
    });
    return empty;
  }, [commissionRows]);

  const filterCommissionInvoiceRows = useCallback((rows: CommissionDraftRow[]) => {
    const query = commissionSearch.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => [
      row.invoice_name,
      row.invoice_status,
      row.invoice_date,
      ...row.lines.flatMap((line) => [line.product_label, line.product_id]),
    ].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [commissionSearch]);

  const filteredCommissionRowsByBucket = useMemo(() => ({
    current_period: filterCommissionInvoiceRows(commissionRowsByBucket.current_period),
    backlog: filterCommissionInvoiceRows(commissionRowsByBucket.backlog),
    excluded: filterCommissionInvoiceRows(commissionRowsByBucket.excluded),
  }), [commissionRowsByBucket, filterCommissionInvoiceRows]);

  const selectedPreviousCommission = commissionHistoryRows[commissionHistoryIndex] || null;

  const commissionPrintRows = useMemo(() => {
    const reviewBucketLabels: Record<CommissionReviewBucket, string> = {
      current_period: 'پورسانت‌های این ماه',
      backlog: 'معوق / بازمانده',
      excluded: 'مستثنا / عدم‌لحاظ',
    };
    const selectedEmployeeId = String(watchedCommissionFormValues.employee_profile_id || '').trim();
    const selectedEmployeeName = profiles.find((profile) => String(profile.id || '') === selectedEmployeeId)?.full_name || '';
    const toPrintableRow = (row: any, bucketLabel: string, employeeName = selectedEmployeeName) => ({
      review_bucket: bucketLabel,
      employee_name: employeeName || '—',
      invoice_name: row?.invoice_name || 'بدون عنوان',
      invoice_status: COMMISSION_INVOICE_STATUS_LABELS[String(row?.invoice_status || '').trim().toLowerCase()] || row?.invoice_status || '—',
      invoice_date: row?.invoice_date || null,
      items_label: (Array.isArray(row?.lines) ? row.lines : [])
        .map((line: any) => String(line?.product_label || '').trim())
        .filter(Boolean)
        .join('، '),
      item_count: toNumber(row?.item_count || (Array.isArray(row?.lines) ? row.lines.length : 0)),
      invoice_total_amount: toNumber(row?.invoice_total_amount),
      invoice_received_amount: toNumber(row?.invoice_received_amount),
      entitled_amount: toNumber(row?.entitled_amount),
      posted_amount: toNumber(row?.posted_amount),
      selected_amount: toNumber(row?.selected_amount ?? row?.commission_amount),
      remaining_amount: toNumber(row?.remaining_amount),
      eligibility_event_at: row?.eligibility_event_at || null,
      eligibility_event_type: row?.eligibility_event_type || '',
      exclusion_reason: row?.exclusion_reason || '',
    });

    if (commissionReviewTab === 'previous_calculations') {
      const previousRows = Array.isArray(selectedPreviousCommission?.details?.rows)
        ? selectedPreviousCommission.details.rows
        : [];
      return previousRows
        .filter((row: any) => {
          const query = commissionSearch.trim().toLowerCase();
          if (!query) return true;
          return [
            row?.invoice_name,
            row?.invoice_status,
            row?.invoice_date,
            ...(Array.isArray(row?.lines) ? row.lines.flatMap((line: any) => [line?.product_label, line?.product_id]) : []),
          ].some((value) => String(value || '').toLowerCase().includes(query));
        })
        .map((row: any) => toPrintableRow(row, 'محاسبهٔ ثبت‌شدهٔ قبلی', selectedPreviousCommission?.employee_name || selectedEmployeeName));
    }

    return filteredCommissionRowsByBucket[commissionReviewTab]
      .map((row) => toPrintableRow(row, reviewBucketLabels[commissionReviewTab]));
  }, [commissionReviewTab, commissionSearch, filteredCommissionRowsByBucket, profiles, selectedPreviousCommission, watchedCommissionFormValues.employee_profile_id]);

  const commissionListPrintManager = useListPrintManager({
    moduleId: 'commission_calculations',
    moduleConfig: COMMISSION_LIST_PRINT_MODULE,
    rows: commissionPrintRows,
    printableFields: COMMISSION_LIST_PRINT_FIELDS as any,
    contextTitle: 'اطلاعات محاسبه پورسانت',
    contextValues: {
      employee_name: selectedPreviousCommission?.employee_name || '',
      period_start: selectedPreviousCommission?.period_start || watchedCommissionFormValues.period_range?.[0] || null,
      period_end: selectedPreviousCommission?.period_end || watchedCommissionFormValues.period_range?.[1] || null,
    },
    summary: {
      title: 'جمع فهرست فعلی',
      fields: [
        { key: 'invoice_count', label: 'تعداد فاکتور', type: 'number' },
        { key: 'commission_total', label: 'جمع پورسانت', type: 'price' },
      ],
      values: {
        invoice_count: commissionPrintRows.length,
        commission_total: commissionPrintRows.reduce((sum, row) => sum + toNumber(row.selected_amount), 0),
      },
    },
  });
  const generateCommissionFinalPdfPreview = useCallback(
    (onProgress: (progress: { percent: number; label: string }) => void) =>
      commissionListPrintManager.generateCurrentPdfBlob({ onProgress }),
    [commissionListPrintManager.generateCurrentPdfBlob],
  );

  useEffect(() => {
    setCommissionHistoryIndex((current) => Math.min(current, Math.max(commissionHistoryRows.length - 1, 0)));
  }, [commissionHistoryRows.length]);

  const commissionDraftTotals = useMemo(() => ({
    selected: commissionRows.reduce((sum, row) => sum + row.selected_amount, 0),
    deferred: commissionRows.reduce(
      (sum, row) => sum + row.lines
        .filter((line) => line.decision_status === 'defer_to_next_period')
        .reduce((lineSum, line) => lineSum + line.remaining_amount, 0),
      0,
    ),
    excluded: commissionRows.reduce(
      (sum, row) => sum + row.lines
        .filter((line) => line.decision_status === 'exclude')
        .reduce((lineSum, line) => lineSum + line.entitled_amount, 0),
      0,
    ),
  }), [commissionRows]);

  const payrollLedgerTotalsByEmployeeId = useMemo(() => {
    const map = new Map<string, {
      commission: number;
      goals: number;
      activity: number;
      attendance: number;
      attendanceOvertime: number;
      attendanceEarlyBonus: number;
      attendanceDelayAbsence: number;
      attendancePaidLeave: number;
      bonuses: number;
      penalties: number;
      proposedNet: number;
      includedNet: number;
    }>();
    payrollLedgerRows.forEach((row) => {
      const employeeIdValue = String(row.employee_id || '').trim();
      if (!employeeIdValue) return;
      const current = map.get(employeeIdValue) || {
        commission: 0,
        goals: 0,
        activity: 0,
        attendance: 0,
        attendanceOvertime: 0,
        attendanceEarlyBonus: 0,
        attendanceDelayAbsence: 0,
        attendancePaidLeave: 0,
        bonuses: 0,
        penalties: 0,
        proposedNet: 0,
        includedNet: 0,
      };
      const amount = toNumber(row.amount);
      const sourceType = String(row.source_type || '');
      if (sourceType === 'commission') current.commission += amount;
      else if (sourceType === 'goal_reward') current.goals += amount;
      else if (sourceType === 'activity_performance') current.activity += amount;
      else if (sourceType === 'employee_bonus') current.bonuses += Math.max(0, amount);
      else if (sourceType === 'employee_penalty') current.penalties += Math.abs(Math.min(0, amount));
      else if (sourceType === 'attendance_overtime') current.attendanceOvertime += Math.max(0, amount);
      else if (sourceType === 'attendance_early_bonus') current.attendanceEarlyBonus += Math.max(0, amount);
      else if (sourceType === 'attendance_delay_absence') current.attendanceDelayAbsence += Math.abs(Math.min(0, amount));
      else if (sourceType === 'attendance_paid_leave') current.attendancePaidLeave += Math.max(0, amount);
      if (sourceType.startsWith('attendance_')) current.attendance += amount;
      if (String(row.status || '') === 'included_in_payroll') current.includedNet += amount;
      else current.proposedNet += amount;
      map.set(employeeIdValue, current);
    });
    return map;
  }, [payrollLedgerRows]);

  const commissionTotals = useMemo(() => {
    const rowsByBasis = {
      approved_invoices: calculatedCommissionRows.filter((row) => row.details?.basis === 'approved_invoices'),
      settled_invoices: calculatedCommissionRows.filter((row) => row.details?.basis === 'settled_invoices'),
      full_settlement_only: calculatedCommissionRows.filter((row) => row.details?.basis === 'full_settlement_only'),
      prepaid_and_settled_invoices: calculatedCommissionRows.filter((row) => row.details?.basis === 'prepaid_and_settled_invoices'),
      prepaid_and_collected_cheques: calculatedCommissionRows.filter((row) => row.details?.basis === 'prepaid_and_collected_cheques'),
      settled_and_collected_cheques: calculatedCommissionRows.filter((row) => row.details?.basis === 'settled_and_collected_cheques'),
    };
    return {
      approved: rowsByBasis.approved_invoices.reduce((sum, row) => sum + row.amount, 0),
      settled: rowsByBasis.settled_invoices.reduce((sum, row) => sum + row.amount, 0),
      fullSettlement: rowsByBasis.full_settlement_only.reduce((sum, row) => sum + row.amount, 0),
      prepaid: rowsByBasis.prepaid_and_settled_invoices.reduce((sum, row) => sum + row.amount, 0),
      prepaidCollectedCheque: rowsByBasis.prepaid_and_collected_cheques.reduce((sum, row) => sum + row.amount, 0),
      collectedCheque: rowsByBasis.settled_and_collected_cheques.reduce((sum, row) => sum + row.amount, 0),
      invoices: new Set(calculatedCommissionRows.map((row) => row.details?.invoice_id || row.source_record_id).filter(Boolean)).size,
      pendingRows: rowsByBasis.settled_and_collected_cheques.length,
    };
  }, [calculatedCommissionRows]);

  const attendanceInsights = useMemo(() => {
    const deltas = attendanceComputedRows.reduce(
      (acc, row) => ({
        lateMinutes: acc.lateMinutes + row.lateMinutes,
        earlyArrivalMinutes: acc.earlyArrivalMinutes + row.earlyArrivalMinutes,
        earlyLeaveMinutes: acc.earlyLeaveMinutes + row.earlyLeaveMinutes,
        overtimeStayMinutes: acc.overtimeStayMinutes + row.overtimeStayMinutes,
        approvedLeaveMinutes: acc.approvedLeaveMinutes + row.approvedLeaveMinutes,
        approvedLeaveDays: acc.approvedLeaveDays + (row.isApprovedLeave ? 1 : 0),
      }),
      {
        lateMinutes: 0,
        earlyArrivalMinutes: 0,
        earlyLeaveMinutes: 0,
        overtimeStayMinutes: 0,
        approvedLeaveMinutes: 0,
        approvedLeaveDays: 0,
      },
    );
    return {
      ...deltas,
      presenceMinutes: calculatePresenceMinutes(attendanceComputedRows),
    };
  }, [attendanceComputedRows]);

  const resolveSummaryPayrollBaseCompensation = useCallback((row: EmployeeSummaryRow | null | undefined) => {
    if (!row?.profile) {
      return resolvePayrollBaseCompensation({ salaryType: DEFAULT_SALARY_TYPE });
    }
    const employeeIdValue = String(row.profile.source_id || row.profile.id || '').trim();
    return resolvePayrollBaseCompensation({
      salaryType: row.profile.salary_type,
      baseSalary: row.profile.base_salary,
      hourlyRate: row.profile.hourly_rate,
      presenceMinutes: employeeIdValue ? (attendancePresenceMinutesByEmployeeId.get(employeeIdValue) || 0) : 0,
      requiredMinutes: computeRequiredWorkMinutesForProfile(row.profile),
    });
  }, [attendancePresenceMinutesByEmployeeId, computeRequiredWorkMinutesForProfile]);

  const payrollWizardSummary = useMemo(() => {
    if (!payrollWizardEmployeeId) return null;
    return visibleSummaries.find((row) => String(row.profile.source_id || row.profile.id) === String(payrollWizardEmployeeId)) || null;
  }, [payrollWizardEmployeeId, visibleSummaries]);

  const visiblePayrollConfigFields = useMemo(
    () => HR_PAYROLL_CONFIG_FIELDS.filter((field: any) => canViewEmployeePayrollField(String(field.key || ''))),
    [canViewEmployeePayrollField],
  );

  const payrollWizardEmployeeLedger = useMemo(() => {
    if (!payrollWizardEmployeeId) return [];
    return payrollLedgerByEmployeeId.get(String(payrollWizardEmployeeId)) || [];
  }, [payrollLedgerByEmployeeId, payrollWizardEmployeeId]);

  const payrollWizardSettleableAdvances = useMemo(() => {
    if (!payrollWizardEmployeeId) return [];
    return employeeAdvanceRows.filter((advance) => (
      String(advance.employee_id || '') === String(payrollWizardEmployeeId)
      && !advance.related_payroll_slip_id
      && PAYROLL_ADVANCE_SETTLEMENT_STATUSES.has(String(advance.status || '').trim())
      && advance.paid_amount > 0
    ));
  }, [employeeAdvanceRows, payrollWizardEmployeeId]);

  const payrollWizardOpenLedger = useMemo(
    () => payrollWizardEmployeeLedger.filter((entry) => ['draft', 'proposed'].includes(String(entry.status || ''))),
    [payrollWizardEmployeeLedger],
  );

  const payrollWizardIncludedLedger = useMemo(
    () => payrollWizardEmployeeLedger.filter((entry) => String(entry.status || '') === 'included_in_payroll'),
    [payrollWizardEmployeeLedger],
  );

  const payrollWizardAttendanceRows = useMemo(() => {
    if (!payrollWizardEmployeeId) return [];
    return attendanceComputedRows.filter((row) => String(row.employeeId || '') === String(payrollWizardEmployeeId));
  }, [attendanceComputedRows, payrollWizardEmployeeId]);

  const payrollWizardGoalRows = useMemo(() => {
    if (!payrollWizardEmployeeId) return [];
    return goalTouchRows.filter((row) => String(row.employeeId || '') === String(payrollWizardEmployeeId));
  }, [goalTouchRows, payrollWizardEmployeeId]);

  const payrollWizardRequiredMinutes = useMemo(
    () => computeRequiredWorkMinutesForProfile(payrollWizardSummary?.profile),
    [computeRequiredWorkMinutesForProfile, payrollWizardSummary?.profile],
  );

  const payrollWizardBaseCompensation = useMemo(() => {
    return resolvePayrollBaseCompensation({
      salaryType: payrollWizardSummary?.profile?.salary_type,
      baseSalary: payrollWizardSummary?.profile?.base_salary,
      hourlyRate: payrollWizardSummary?.profile?.hourly_rate,
      presenceMinutes: calculatePresenceMinutes(payrollWizardAttendanceRows),
      requiredMinutes: payrollWizardRequiredMinutes,
    });
  }, [
    payrollWizardAttendanceRows,
    payrollWizardRequiredMinutes,
    payrollWizardSummary?.profile?.base_salary,
    payrollWizardSummary?.profile?.hourly_rate,
    payrollWizardSummary?.profile?.salary_type,
  ]);

  const payrollWizardHourlyRate = useMemo(
    () => payrollWizardBaseCompensation.hourlyRate,
    [payrollWizardBaseCompensation.hourlyRate],
  );

  const payrollWizardLedgerNet = useMemo(
    () => payrollWizardOpenLedger.reduce((sum, entry) => sum + toNumber(entry.amount), 0),
    [payrollWizardOpenLedger],
  );

  const payrollWizardAdvanceSettlementTotal = useMemo(
    () => payrollWizardSettleableAdvances.reduce((sum, advance) => sum + advance.paid_amount, 0),
    [payrollWizardSettleableAdvances],
  );

  const buildAdvancePayrollSlipPayments = useCallback((advances: EmployeeAdvanceDashboardRow[]): PayrollSlipPayment[] => (
    advances
      .map((advance): PayrollSlipPayment | null => {
        const amount = advance.paid_amount;
        if (amount <= 0) return null;
        const dateText = advance.request_date ? safeJalaliFormat(advance.request_date, 'YYYY/MM/DD') : '';
        const description = [
          `تسویه با مساعده ${advance.system_code || advance.name || dateText || 'بدون شماره'}`,
          advance.reason || '',
        ].filter(Boolean).join('؛ ');
        return {
          row_key: `advance_${advance.id}`,
          employee_advance_id: advance.id,
          payment_type: 'credit',
          status: 'paid',
          date: advance.request_date,
          amount,
          description,
          is_advance_settlement: true,
          _readonly: true,
          _lockedFields: ['employee_advance_id', 'amount', 'payment_type', 'status'],
        };
      })
      .filter((item): item is PayrollSlipPayment => Boolean(item))
  ), []);

  const payrollWizardDraft = useMemo(() => {
    const presenceMinutesValue = calculatePresenceMinutes(payrollWizardAttendanceRows);
    const presenceHours = presenceMinutesValue / 60;
    const baseSalaryDescription = payrollWizardBaseCompensation.isHourly
      ? `${presenceHours.toFixed(1)} ساعت × ${formatPersianPrice(payrollWizardHourlyRate)} ${currencyLabel}/ساعت`
      : `بازه ${toNativeGregorianDateString(monthStart) || ''} تا ${toNativeGregorianDateString(monthEnd) || ''}`;
    return buildPayrollSlipDraft({
      baseSalary: payrollWizardBaseCompensation.amount,
      baseSalaryTitle: payrollWizardBaseCompensation.displayTitle,
      baseSalaryDescription,
      taskWageTotal: payrollWizardSummary?.taskWageTotal || 0,
      taskWageDescription: `${payrollWizardSummary?.payrollDetailRows.length || 0} فعالیت`,
      ledgerEntries: payrollWizardOpenLedger as PayrollLedgerEntry[],
      advancePayments: buildAdvancePayrollSlipPayments(payrollWizardSettleableAdvances),
      insuranceSubject: payrollWizardSummary?.profile?.insurance_subject,
      employeeInsuranceRate: payrollWizardSummary?.profile?.employee_insurance_rate,
      employerInsuranceRate: payrollWizardSummary?.profile?.employer_insurance_rate,
      currencyLabel,
    });
  }, [
    buildAdvancePayrollSlipPayments,
    currencyLabel,
    monthEnd,
    monthStart,
    payrollWizardAttendanceRows,
    payrollWizardBaseCompensation.amount,
    payrollWizardBaseCompensation.displayTitle,
    payrollWizardBaseCompensation.isHourly,
    payrollWizardSettleableAdvances,
    payrollWizardHourlyRate,
    payrollWizardOpenLedger,
    payrollWizardSummary,
  ]);

  const payrollWizardPreviewLines = payrollWizardDraft.lines;
  const payrollWizardInsurance = useMemo(() => ({
    employee: payrollWizardDraft.employeeInsuranceAmount,
    employer: payrollWizardDraft.employerInsuranceAmount,
  }), [payrollWizardDraft.employeeInsuranceAmount, payrollWizardDraft.employerInsuranceAmount]);
  const payrollWizardFinalNet = payrollWizardDraft.netAmount;

  const payrollWizardSeniorityAmount = useMemo(
    () => payrollWizardOpenLedger
      .filter((e) => String(e.source_type || '') === 'seniority')
      .reduce((sum, e) => sum + toNumber(e.amount), 0),
    [payrollWizardOpenLedger],
  );

  const payrollWizardSeniorityYears = useMemo(() => {
    const profile = payrollWizardSummary?.profile;
    if (profile?.seniority_mode !== 'labor_law' || !profile?.hire_date) return 0;
    const periodEnd = toNativeGregorianDateString(monthEnd);
    if (!periodEnd) return 0;
    return calcYearsOfService(profile.hire_date, periodEnd);
  }, [payrollWizardSummary?.profile, monthEnd]);

  const openPayrollWizard = useCallback((employeeIdValue: string) => {
    setPayrollWizardEmployeeId(employeeIdValue);
    setPayrollWizardStep(0);
    setEditingPayrollWizardFieldKey(null);
    setPayrollWizardDraftValues({});
    setPayrollWizardPreparing(true);
    setPayrollWizardOpen(true);
    void fetchEmployeeAdvancesForDashboard();
  }, [fetchEmployeeAdvancesForDashboard]);

  const closePayrollWizard = useCallback(() => {
    setPayrollWizardOpen(false);
    setPayrollWizardPreparing(false);
    setPayrollWizardEmployeeId(null);
    setPayrollWizardStep(0);
    setEditingPayrollWizardFieldKey(null);
    setPayrollWizardDraftValues({});
    setCalculatingPayrollWizardSeniority(false);
  }, []);

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

  const openIncompleteAttendanceCompletion = useCallback((row: IncompleteAttendanceRow) => {
    if (!canCreateAttendance) return;
    const now = dayjs();
    const occurredAt = row.attendanceDate
      ? dayjs(`${row.attendanceDate}T${now.format('HH:mm:ss')}`).toISOString()
      : now.toISOString();
    setIncompleteAttendanceModalOpen(false);
    openAttendanceModal('create', {
      id: '',
      employee_id: row.raw.employee_id || null,
      related_profile_id: row.raw.related_profile_id || null,
      assignee_id: row.raw.assignee_id || null,
      log_type: row.missingLogType,
      occurred_at: occurredAt,
      source_type: 'manual',
      location_text: null,
      notes: null,
    });
  }, [canCreateAttendance, openAttendanceModal]);

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

  const loadCommissionHistory = useCallback(async (
    employeeIdValue: string,
    employeeName: string,
    beforePeriodStart: string,
  ) => {
    if (!employeeIdValue) {
      setCommissionHistoryRows([]);
      return;
    }
    const { data, error } = await supabase
      .from('payroll_calculation_entries')
      .select('id, period_start, period_end, title, amount, status, details, created_at, updated_at')
      .eq('source_type', 'commission')
      .eq('employee_id', employeeIdValue)
      .neq('status', 'voided')
      .order('period_end', { ascending: false })
      .limit(HR_STATS_FETCH_LIMIT);
    if (error) throw error;
    setCommissionHistoryRows(((data || []) as any[])
      .map((entry) => ({
        id: String(entry?.id || ''),
        employee_id: employeeIdValue,
        employee_name: employeeName,
        period_start: entry?.period_start || null,
        period_end: entry?.period_end || null,
        entry_type: 'commission',
        title: entry?.title || null,
        amount: toNumber(entry?.amount),
        status: entry?.status || null,
        source_record_id: null,
        created_at: entry?.created_at || null,
        updated_at: entry?.updated_at || null,
        created_by: null,
        updated_by: null,
        assignee_id: null,
        details: entry?.details || null,
      } as CommissionLedgerRow))
      .filter((entry) => entry.id && entry.period_end && entry.period_end < beforePeriodStart));
    setCommissionHistoryIndex(0);
  }, []);

  const openCommissionModal = useCallback(() => {
    const selectedEmployeeId =
      (selectedEmployeeIds.length === 1 ? selectedEmployeeIds[0] : null) ||
      visibleSummaries.find((row) => row.profile.source_table === 'employees')?.profile.id ||
      profiles.find((profile) => profile.source_table === 'employees')?.id ||
      '';
    const defaultProfile = resolveCommissionEmployeeProfile(profiles, selectedEmployeeId);
    const defaultProfileId = String(defaultProfile?.id || '');
    setCommissionInitialValues({
      period_range: [
        toNativeGregorianDateString(selectedRange[0]),
        toNativeGregorianDateString(selectedRange[1]),
      ],
      employee_profile_id: defaultProfileId,
      basis: 'prepaid_and_settled_invoices',
      percent_mode: 'product_default',
    });
    setCommissionRows([]);
    setCommissionReviewTab('current_period');
    setCommissionSearch('');
    setCommissionHistoryRows([]);
    setCommissionHistoryIndex(0);
    setCommissionModalOpen(true);
    if (defaultProfile?.source_id) {
      void loadCommissionHistory(
        String(defaultProfile.source_id),
        defaultProfile.full_name || 'بازاریاب انتخاب‌شده',
        toNativeGregorianDateString(selectedRange[0]) || '',
      ).catch((error) => console.warn('Could not load commission history:', error));
    }
  }, [loadCommissionHistory, profiles, selectedEmployeeIds, selectedRange, visibleSummaries]);

  useEffect(() => {
    if (!commissionModalOpen || !commissionInitialValues) return;
    commissionForm.setFieldsValue(commissionInitialValues as any);
  }, [commissionForm, commissionInitialValues, commissionModalOpen]);

  const getCommissionPeriodValues = useCallback((values: {
    period_range?: PersianDateRangeValue | null;
    employee_profile_id?: string;
    basis?: CommissionBasis;
    percent_mode?: CommissionPercentMode;
  }) => {
    const periodStart = String(values.period_range?.[0] || toNativeGregorianDateString(selectedRange[0]) || '').trim();
    const periodEnd = String(values.period_range?.[1] || toNativeGregorianDateString(selectedRange[1]) || '').trim();
    const startDate = parseDateValue(periodStart);
    const endDate = parseDateValue(periodEnd);
    if (!periodStart || !periodEnd || !startDate?.isValid() || !endDate?.isValid()) return null;
    if (startDate.startOf('day').valueOf() > endDate.startOf('day').valueOf()) return null;
    return { periodStart, periodEnd };
  }, [selectedRange]);

  const handleBuildCommissionPreview = useCallback(async () => {
    try {
      const values = await commissionForm.validateFields();
      const selectedProfile = resolveCommissionEmployeeProfile(profiles, values.employee_profile_id);
      if (!selectedProfile) {
        message.error('برای محاسبه پورسانت باید یک کارمند متصل به کاربر انتخاب شود.');
        return;
      }
      const periodValues = getCommissionPeriodValues(values);
      if (!periodValues) {
        message.error('بازه زمانی محاسبه معتبر نیست.');
        return;
      }
      const { periodStart, periodEnd } = periodValues;

      setCommissionLoading(true);
      const employeeIdValue = String(selectedProfile.source_id || selectedProfile.id);
      const assigneeId = String(selectedProfile.related_profile_id || selectedProfile.id || '').trim();
      const fetchCommissionInvoices = async (select: string) => fetchAllCommissionPages<any>((from, to) => supabase
        .from('invoices')
        .select(select)
        .eq('assignee_id', assigneeId)
        .lte('invoice_date', periodEnd)
        .order('invoice_date', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to));
      const invoicesPromise = fetchCommissionInvoices(COMMISSION_INVOICE_SELECT)
        .then(async (result) => {
          if (!result.error || !isMissingSelectColumnError(result.error)) return result;
          return fetchCommissionInvoices(COMMISSION_INVOICE_SELECT_FALLBACK);
        });
      const [invoicesResult, existingResult, draftsResult] = await Promise.all([
        invoicesPromise,
        fetchAllCommissionPages<any>((from, to) => supabase
          .from('payroll_calculation_entries')
          .select('id, period_start, period_end, title, amount, status, details, created_at, updated_at')
          .eq('source_type', 'commission')
          .eq('employee_id', employeeIdValue)
          .neq('status', 'voided')
          .order('id', { ascending: true })
          .range(from, to)),
        fetchAllCommissionPages<any>((from, to) => supabase
          .from('commission_drafts')
          .select('id, source_key, employee_id, assignee_id, period_start, period_end, source_basis, percent_mode, eligibility_event_type, eligibility_event_at, invoice_id, invoice_item_key, entitled_amount, posted_amount, remaining_amount, decision_status, decision_reason, deferred_from_period, deferred_to_period, manual_decision_by, manual_decision_at, draft_status, details')
          .eq('employee_id', employeeIdValue)
          .eq('source_basis', values.basis)
          .eq('percent_mode', values.percent_mode)
          .neq('draft_status', 'canceled')
          .order('id', { ascending: true })
          .range(from, to)),
      ]);
      if (invoicesResult.error) throw invoicesResult.error;
      if (existingResult.error && !isMissingPayrollLedgerError(existingResult.error)) throw existingResult.error;
      if (draftsResult.error && !isMissingCommissionDraftsError(draftsResult.error)) throw draftsResult.error;

      setCommissionHistoryRows(((existingResult.data || []) as any[])
        .map((entry) => ({
          id: String(entry?.id || ''),
          employee_id: employeeIdValue,
          employee_name: selectedProfile.full_name || 'بازاریاب انتخاب‌شده',
          period_start: entry?.period_start || null,
          period_end: entry?.period_end || null,
          entry_type: 'commission',
          title: entry?.title || null,
          amount: toNumber(entry?.amount),
          status: entry?.status || null,
          source_record_id: null,
          created_at: entry?.created_at || null,
          updated_at: entry?.updated_at || null,
          created_by: null,
          updated_by: null,
          assignee_id: assigneeId || null,
          details: entry?.details || null,
        } as CommissionLedgerRow))
        .filter((entry) => entry.id && entry.period_end && entry.period_end < periodStart)
        .sort((left, right) => String(right.period_end).localeCompare(String(left.period_end))));
      setCommissionHistoryIndex(0);

      const invoices = ((invoicesResult.data || []) as any[]).map((invoice) => ({
        ...invoice,
        invoiceItems: Array.isArray(invoice?.invoiceItems) ? invoice.invoiceItems : [],
        payments: Array.isArray(invoice?.payments) ? invoice.payments : [],
      }));
      const invoiceIds = invoices.map((invoice) => String(invoice.id || '').trim()).filter(Boolean);
      const operationPaymentsByInvoiceId = new Map<string, any[]>();
      if (invoiceIds.length > 0) {
        const operationRows: any[] = [];
        for (const invoiceIdChunk of chunkCommissionQueryIds(invoiceIds)) {
          const operationResult = await fetchAllCommissionPages<any>((from, to) => supabase
            .from('cash_bank_operations')
            .select('id, sales_invoice_id, operation_type, operation_date, payment_type, status, cheque_id, amount, created_at')
            .in('sales_invoice_id', invoiceIdChunk)
            .neq('operation_type', 'transfer')
            .in('status', ['received', 'approved', 'paid', 'posted', 'settled', 'completed', 'cleared', 'done'])
            .order('id', { ascending: true })
            .range(from, to));
          if (operationResult.error) throw operationResult.error;
          operationRows.push(...(operationResult.data || []));
        }
        const chequeIds = Array.from(new Set(
          operationRows
            .map((operation: any) => String(operation?.cheque_id || '').trim())
            .filter(Boolean),
        ));
        const chequeStatusById = new Map<string, string>();
        const chequeCollectionDateById = new Map<string, string>();
        if (chequeIds.length > 0) {
          const chequeRows: any[] = [];
          for (const chequeIdChunk of chunkCommissionQueryIds(chequeIds)) {
            const fetchCommissionCheques = async (select: string) => fetchAllCommissionPages<any>((from, to) => supabase
              .from('cheques')
              .select(select)
              .in('id', chequeIdChunk)
              .order('id', { ascending: true })
              .range(from, to));
            const primaryChequeResult = await fetchCommissionCheques(COMMISSION_CHEQUE_SELECT);
            const chequeResult = (
              primaryChequeResult.error && isMissingSelectColumnError(primaryChequeResult.error)
                ? await fetchCommissionCheques(COMMISSION_CHEQUE_SELECT_FALLBACK)
                : primaryChequeResult
            );
            if (chequeResult.error) throw chequeResult.error;
            chequeRows.push(...(chequeResult.data || []));
          }
          chequeRows.forEach((cheque: any) => {
            const chequeId = String(cheque?.id || '').trim();
            if (!chequeId) return;
            chequeStatusById.set(chequeId, String(cheque?.status || '').trim());
            const collectionDate = cheque?.cleared_at || cheque?.spent_date || cheque?.updated_at || null;
            if (collectionDate) chequeCollectionDateById.set(chequeId, String(collectionDate));
          });
        }
        operationRows.forEach((operation: any) => {
          if (String(operation?.operation_type || '').trim().toLowerCase() === 'payment') return;
          const invoiceId = String(operation?.sales_invoice_id || '').trim();
          if (!invoiceId) return;
          const rows = operationPaymentsByInvoiceId.get(invoiceId) || [];
          rows.push({
            _cash_bank_operation_id: operation.id,
            amount: operation.amount,
            status: operation.status,
            payment_type: operation.payment_type,
            cheque_status: chequeStatusById.get(String(operation?.cheque_id || '').trim()) || null,
            cheque_cleared_at: chequeCollectionDateById.get(String(operation?.cheque_id || '').trim()) || null,
            date: operation.operation_date || operation.created_at || null,
          });
          operationPaymentsByInvoiceId.set(invoiceId, rows);
        });
      }
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const productIds = Array.from(new Set(
        invoices
          .flatMap((invoice) => invoice.invoiceItems || [])
          .map((item: any) => String(item?.product_id || '').trim())
          .filter((id: string) => uuidPattern.test(id)),
      ));
      const productById = new Map<string, any>();
      if (productIds.length > 0) {
        for (const productIdChunk of chunkCommissionQueryIds(productIds)) {
          const productsResult = await fetchAllCommissionPages<any>((from, to) => supabase
            .from('products')
            .select('id, name, commission_percentage')
            .in('id', productIdChunk)
            .order('id', { ascending: true })
            .range(from, to));
          if (productsResult.error) throw productsResult.error;
          (productsResult.data || []).forEach((product: any) => productById.set(String(product.id), product));
        }
      }
      const billboardById = new Map<string, any>();
      if (productIds.length > 0) {
        for (const productIdChunk of chunkCommissionQueryIds(productIds)) {
          const billboardsResult = await fetchAllCommissionPages<any>((from, to) => supabase
            .from('billboards')
            .select('id, name, address, commission_percentage')
            .in('id', productIdChunk)
            .order('id', { ascending: true })
            .range(from, to));
          if (billboardsResult.error) throw billboardsResult.error;
          (billboardsResult.data || []).forEach((billboard: any) => billboardById.set(String(billboard.id), billboard));
        }
      }

      const enrichedInvoices = invoices.map((invoice) => ({
        ...invoice,
        payments: mergeCommissionInvoicePayments(
          invoice.payments,
          operationPaymentsByInvoiceId.get(String(invoice.id || '')) || [],
        ),
        invoiceItems: (invoice.invoiceItems || []).map((item: any) => {
          const product = productById.get(String(item?.product_id || ''));
          const billboard = billboardById.get(String(item?.product_id || ''));
          return {
            ...item,
            product_name: item?.product_name || item?.name || product?.name || billboard?.name || billboard?.address || item?.product_id || null,
            commission_percentage: item?.commission_percentage ?? product?.commission_percentage ?? billboard?.commission_percentage ?? 0,
          };
        }),
      }));

      const postedAllocations: CommissionPostedAllocation[] = [];
      (existingResult.data || []).forEach((entry: any) => {
        if (String(entry?.status || '').trim() === 'draft') return;
        const details = entry?.details || {};
        const entryBasis = String(details?.basis || values.basis || '').trim() as CommissionBasis;
        const entryPercentMode = String(details?.percent_mode || values.percent_mode || '').trim() as CommissionPercentMode;
        const invoiceId = String(details?.invoice_id || entry?.source_record_id || '').trim();
        const lines = Array.isArray(details?.lines) ? details.lines : [];
        const invoiceRows = Array.isArray(details?.rows) ? details.rows : [];
        if (invoiceRows.length > 0) {
          invoiceRows.forEach((invoiceRow: any) => {
            const rowInvoiceId = String(invoiceRow?.invoice_id || '').trim();
            const rowLines = Array.isArray(invoiceRow?.lines) ? invoiceRow.lines : [];
            rowLines.forEach((line: any) => {
              const itemKey = String(line?.item_key || line?.invoice_item_key || '').trim();
              if (!rowInvoiceId || !itemKey) return;
              postedAllocations.push({
                basis: entryBasis,
                percent_mode: entryPercentMode,
                invoice_id: rowInvoiceId,
                invoice_item_key: itemKey,
                posted_amount: toNumber(line?.commission_amount ?? line?.selected_amount ?? 0),
              });
            });
          });
          return;
        }
        if (lines.length > 0) {
          lines.forEach((line: any) => {
            const itemKey = String(line?.item_key || line?.invoice_item_key || '').trim();
            if (!invoiceId || !itemKey) return;
            postedAllocations.push({
              basis: entryBasis,
              percent_mode: entryPercentMode,
              invoice_id: invoiceId,
              invoice_item_key: itemKey,
              posted_amount: toNumber(line?.commission_amount ?? line?.selected_amount ?? 0),
            });
          });
          return;
        }
        const itemKeys = Array.isArray(details?.item_keys) ? details.item_keys.map((itemKey: any) => String(itemKey || '').trim()).filter(Boolean) : [];
        if (invoiceId && itemKeys.length === 1) {
          postedAllocations.push({
            basis: entryBasis,
            percent_mode: entryPercentMode,
            invoice_id: invoiceId,
            invoice_item_key: itemKeys[0],
            posted_amount: toNumber(entry?.amount),
          });
        }
      });

      // Build invoice payments map for cheque display
      const paymentsMap = new Map<string, any[]>();
      enrichedInvoices.forEach((invoice) => {
        if (invoice.id && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
          paymentsMap.set(String(invoice.id), invoice.payments);
        }
      });
      setCommissionInvoicePaymentsById(paymentsMap);

      const previewRows = buildCommissionDraftRows({
        invoices: enrichedInvoices,
        employeeIdByAssigneeId: { [assigneeId]: employeeIdValue },
        employeeDefaultCommissionByEmployeeId: { [employeeIdValue]: toNumber(selectedProfile.commission_percentage) },
        basis: values.basis,
        percentMode: values.percent_mode,
        periodStart,
        periodEnd,
        postedAllocations,
        existingDrafts: ((draftsResult.data || []) as any[]).map((row) => ({
          ...row,
          employee_id: String(row.employee_id || employeeIdValue),
          assignee_id: row.assignee_id ? String(row.assignee_id) : null,
          period_start: String(row.period_start || periodStart),
          period_end: String(row.period_end || periodEnd),
          invoice_id: String(row.invoice_id || ''),
          invoice_item_key: String(row.invoice_item_key || ''),
          source_basis: String(row.source_basis || values.basis) as CommissionBasis,
          percent_mode: String(row.percent_mode || values.percent_mode) as CommissionPercentMode,
          entitled_amount: toNumber(row.entitled_amount),
          posted_amount: toNumber(row.posted_amount),
          remaining_amount: toNumber(row.remaining_amount),
          decision_status: String(row.decision_status || 'auto') as CommissionDecisionStatus,
        })) as CommissionPersistedDraft[],
        includeNotCalculated: false,
      });
      setCommissionRows(previewRows);
      setCommissionReviewTab(previewRows.some((row) => row.selected_amount > 0) ? 'current_period' : 'backlog');
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(toFaErrorMessage(err, 'محاسبه پورسانت ناموفق بود'));
      setCommissionRows([]);
    } finally {
      setCommissionLoading(false);
    }
  }, [commissionForm, getCommissionPeriodValues, message, profiles]);

  const updateCommissionRowLines = useCallback((
    rowKey: string,
    updater: (line: CommissionDraftLine) => CommissionDraftLine,
  ) => {
    setCommissionRows((current) => current.map((row) => (
      row.key === rowKey
        ? recomputeCommissionDraftRow({
          ...row,
          lines: row.lines.map((line) => updater(line)),
        })
        : row
    )));
  }, []);

  const applyCommissionDecisionToRow = useCallback((rowKey: string, decision: CommissionDecisionStatus) => {
    updateCommissionRowLines(rowKey, (line) => ({
      ...line,
      decision_status: decision,
      decision_reason: decision === 'auto' ? null : line.decision_reason,
    }));
  }, [updateCommissionRowLines]);

  const applyCommissionDecisionToLine = useCallback((
    rowKey: string,
    lineKey: string,
    decision: CommissionDecisionStatus,
  ) => {
    updateCommissionRowLines(rowKey, (line) => (
      line.key === lineKey
        ? {
          ...line,
          decision_status: decision,
          decision_reason: decision === 'auto' ? null : line.decision_reason,
        }
        : line
    ));
  }, [updateCommissionRowLines]);

  const applyCommissionDecisionToBucket = useCallback((bucket: CommissionReviewBucket, decision: CommissionDecisionStatus) => {
    setCommissionRows((current) => current.map((row) => {
      const nextLines = row.lines.map((line) => (
        getCommissionLineReviewBucket(row, line) === bucket
          ? {
            ...line,
            decision_status: decision,
            decision_reason: decision === 'auto' ? null : line.decision_reason,
          }
          : line
      ));
      return recomputeCommissionDraftRow({ ...row, lines: nextLines });
    }));
  }, []);

  const resolveCommissionReviewRowKey = useCallback((row: any) => (
    String(row?.sourceRowKey || row?.key || '').replace(/:(current_period|backlog|excluded)$/, '')
  ), []);

  const buildCommissionDraftPayloads = useCallback(async ({
    periodStart,
    periodEnd,
    posting,
  }: {
    periodStart: string;
    periodEnd: string;
    posting: boolean;
  }) => {
    const authResult = await supabase.auth.getUser();
    const currentUserId = authResult.data.user?.id || null;
    return commissionRows
      .flatMap((row) => row.lines.map((line) => ({ row, line })))
      .filter(({ line }) => (
        line.entitled_amount > 0
        || line.remaining_amount > 0
        || line.decision_status !== 'auto'
        || Boolean(line.draft_id)
      ))
      .map(({ row, line }) => {
        const postedAmount = posting ? line.posted_amount + line.selected_amount : line.posted_amount;
        const remainingAmount = line.decision_status === 'exclude'
          ? 0
          : Math.max(0, line.remaining_amount - (posting ? line.selected_amount : 0));
        return {
          id: line.draft_id || undefined,
          source_key: line.source_key || buildCommissionDraftSourceKey({
            employeeId: line.employee_id,
            basis: row.basis,
            percentMode: row.percent_mode,
            invoiceId: row.invoice_id,
            itemKey: line.invoice_item_key,
            sourcePeriodStart: line.source_period_start,
            sourcePeriodEnd: line.source_period_end,
          }),
          employee_id: line.employee_id,
          assignee_id: line.assignee_id || null,
          period_start: line.source_period_start || periodStart,
          period_end: line.source_period_end || periodEnd,
          source_basis: row.basis,
          percent_mode: row.percent_mode,
          eligibility_event_type: line.eligibility_event_type || row.eligibility_event_type || null,
          eligibility_event_at: line.eligibility_event_at || row.eligibility_event_at || null,
          invoice_id: row.invoice_id,
          invoice_item_key: line.invoice_item_key,
          entitled_amount: line.entitled_amount,
          posted_amount: postedAmount,
          remaining_amount: remainingAmount,
          decision_status: line.decision_status,
          decision_reason: line.decision_reason || null,
          deferred_from_period: line.decision_status === 'defer_to_next_period'
            ? (line.deferred_from_period || line.source_period_start || periodStart)
            : line.deferred_from_period || null,
          deferred_to_period: line.decision_status === 'defer_to_next_period' ? null : line.deferred_to_period || null,
          manual_decision_by: line.decision_status === 'auto' ? null : currentUserId,
          manual_decision_at: line.decision_status === 'auto' ? null : new Date().toISOString(),
          draft_status: posting && line.selected_amount > 0 && remainingAmount <= 0 ? 'posted' : 'draft',
          details: {
            invoice_name: row.invoice_name,
            invoice_date: row.invoice_date,
            invoice_status: row.invoice_status,
            invoice_total_amount: row.invoice_total_amount,
            invoice_received_amount: row.invoice_received_amount,
            invoice_tags: row.invoice_tags,
            product_id: line.product_id,
            product_label: line.product_label,
            quantity: line.quantity,
            net_amount: line.net_amount,
            commission_percent: line.commission_percent,
            event_pool_amount: row.event_pool_amount,
          },
        };
      });
  }, [commissionRows]);

  const saveCommissionCalculationAtomically = useCallback(async ({
    ledgerPayload,
    draftPayloads,
  }: {
    ledgerPayload: Record<string, any>;
    draftPayloads: Record<string, any>[];
  }) => {
    const { error } = await supabase.rpc('save_commission_calculation', {
      p_ledger_payload: ledgerPayload,
      p_draft_payloads: draftPayloads,
    });
    if (error) throw error;
  }, []);

  const buildCommissionCalculationLedgerPayload = useCallback(({
    periodStart,
    periodEnd,
    selectedProfile,
    status,
  }: {
    periodStart: string;
    periodEnd: string;
    selectedProfile: ProfileRecord;
    status: 'draft' | 'proposed';
  }) => {
    const employeeIdValue = String(selectedProfile.source_id || selectedProfile.id || '').trim();
    const assigneeIdValue = String(selectedProfile.related_profile_id || '').trim() || null;
    const employeeLabel = selectedProfile.full_name || 'بازاریاب انتخاب‌شده';
    const basis = commissionForm.getFieldValue('basis') as CommissionBasis;
    const percentMode = commissionForm.getFieldValue('percent_mode') as CommissionPercentMode;
    const activeRows = commissionRows.filter((row) => row.selected_amount > 0 || row.lines.some((line) => line.decision_status !== 'auto'));
    const selectedLines = activeRows.flatMap((row) => row.lines.filter((line) => line.selected_amount > 0));
    const invoiceIds = Array.from(new Set(activeRows.map((row) => String(row.invoice_id || '').trim()).filter(Boolean)));
    const amount = activeRows.reduce((sum, row) => sum + row.selected_amount, 0);
    const baseAmount = selectedLines.reduce((sum, line) => sum + line.net_amount, 0);
    const weightedRateBase = selectedLines.reduce((sum, line) => sum + (line.commission_percent * line.net_amount), 0);
    const deferredAmount = activeRows.reduce(
      (sum, row) => sum + row.lines
        .filter((line) => line.decision_status === 'defer_to_next_period')
        .reduce((lineSum, line) => lineSum + line.remaining_amount, 0),
      0,
    );
    const excludedAmount = activeRows.reduce(
      (sum, row) => sum + row.lines
        .filter((line) => line.decision_status === 'exclude')
        .reduce((lineSum, line) => lineSum + line.entitled_amount, 0),
      0,
    );
    const effectiveRate = baseAmount > 0 ? weightedRateBase / baseAmount : 0;
    const calculationKey = buildCommissionCalculationSourceKey({
      employeeId: employeeIdValue,
      basis,
      percentMode,
      periodStart,
      periodEnd,
    });

    return {
      employee_id: employeeIdValue,
      period_start: periodStart,
      period_end: periodEnd,
      entry_type: `commission_calculation_${basis}_${percentMode}`,
      source_type: 'commission',
      source_key: calculationKey,
      source_module_id: `commission_calculation:${basis}:${percentMode}`,
      source_record_id: null,
      title: `محاسبه پورسانت ${employeeLabel}`,
      amount,
      quantity: selectedLines.length,
      rate: effectiveRate,
      status,
      assignee_id: assigneeIdValue,
      details: {
        calculation_key: calculationKey,
        basis,
        percent_mode: percentMode,
        assignee_id: assigneeIdValue,
        employee_id: employeeIdValue,
        employee_name: employeeLabel,
        base_amount: baseAmount,
        selected_amount: amount,
        deferred_amount: deferredAmount,
        excluded_amount: excludedAmount,
        commission_percent: effectiveRate,
        invoice_count: invoiceIds.length,
        item_count: selectedLines.length,
        row_count: activeRows.length,
        rows: activeRows.map((row) => {
          const invoicePayments = commissionInvoicePaymentsById.get(String(row.invoice_id || '')) || [];
          const chequePayments = invoicePayments.filter((p: any) => String(p?.payment_type || '').toLowerCase() === 'cheque');
          return {
            invoice_id: row.invoice_id,
            invoice_name: row.invoice_name,
            invoice_date: row.invoice_date,
            invoice_status: row.invoice_status,
            basis: row.basis,
            percent_mode: row.percent_mode,
            base_amount: row.base_amount,
            entitled_amount: row.entitled_amount,
            posted_amount: row.posted_amount,
            remaining_amount: row.remaining_amount,
            selected_amount: row.selected_amount,
            item_count: row.item_count,
            source_period_start: row.source_period_start,
            source_period_end: row.source_period_end,
            has_cheque: chequePayments.length > 0,
            cheque_payments: chequePayments.map((p: any) => ({
              cheque_number: p?.cheque_number || p?.serial_no || null,
              amount: p?.amount || 0,
              due_date: p?.due_date || p?.maturity_date || null,
              cheque_status: p?.cheque_status || p?.status || null,
              bank_name: p?.bank_name || null,
            })),
            lines: row.lines.map((line) => ({
              source_key: line.source_key,
              item_key: line.invoice_item_key,
              product_label: line.product_label,
              product_id: line.product_id,
              quantity: line.quantity,
              net_amount: line.net_amount,
              commission_percent: line.commission_percent,
              commission_amount: line.selected_amount,
              entitled_amount: line.entitled_amount,
              posted_amount: line.posted_amount,
              remaining_amount: line.remaining_amount,
              decision_status: line.decision_status,
              source_period_start: line.source_period_start,
              source_period_end: line.source_period_end,
            })),
          };
        }),
      },
    };
  }, [commissionForm, commissionInvoicePaymentsById, commissionRows]);

  const handleSaveCommissionDraft = useCallback(async () => {
    try {
      const values = await commissionForm.validateFields();
      const periodValues = getCommissionPeriodValues(values);
      if (!periodValues) {
        message.error('بازه زمانی محاسبه معتبر نیست.');
        return;
      }
      const selectedProfile = resolveCommissionEmployeeProfile(profiles, values.employee_profile_id);
      if (!selectedProfile) {
        message.error('برای ذخیره پورسانت باید یک بازاریاب معتبر انتخاب شود.');
        return;
      }
      const payloads = await buildCommissionDraftPayloads({
        periodStart: periodValues.periodStart,
        periodEnd: periodValues.periodEnd,
        posting: false,
      });
      if (payloads.length === 0) {
        message.info('پیش‌نویسی برای ذخیره وجود ندارد.');
        return;
      }
      setCommissionModalSaving(true);
      await saveCommissionCalculationAtomically({
        draftPayloads: payloads,
        ledgerPayload: buildCommissionCalculationLedgerPayload({
          periodStart: periodValues.periodStart,
          periodEnd: periodValues.periodEnd,
          selectedProfile,
          status: 'draft',
        }),
      });
      message.success('پیش‌نویس پورسانت ذخیره شد.');
      await handleBuildCommissionPreview();
      await refreshPayrollPeriodState();
      await fetchCalculatedCommissionRows();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(toFaErrorMessage(err, 'ذخیره پیش‌نویس پورسانت ناموفق بود'));
    } finally {
      setCommissionModalSaving(false);
    }
  }, [buildCommissionCalculationLedgerPayload, buildCommissionDraftPayloads, commissionForm, fetchCalculatedCommissionRows, getCommissionPeriodValues, handleBuildCommissionPreview, message, profiles, refreshPayrollPeriodState, saveCommissionCalculationAtomically]);

  const handleSaveCommissionCalculation = useCallback(async () => {
    try {
      const values = await commissionForm.validateFields();
      const periodValues = getCommissionPeriodValues(values);
      if (!periodValues) {
        message.error('بازه زمانی محاسبه معتبر نیست.');
        return;
      }
      const { periodStart, periodEnd } = periodValues;
      const selectedProfile = resolveCommissionEmployeeProfile(profiles, values.employee_profile_id);
      if (!selectedProfile) {
        message.error('برای ثبت پورسانت باید یک بازاریاب معتبر انتخاب شود.');
        return;
      }
      const rowsToSave = commissionRows
        .map((row) => ({
          row,
          selectedLines: row.lines.filter((line) => line.selected_amount > 0 && getCommissionLineReviewBucket(row, line) !== 'excluded'),
        }))
        .filter((entry) => entry.selectedLines.length > 0);
      if (rowsToSave.length === 0) {
        message.info('ردیف قابل ثبت برای پورسانت وجود ندارد.');
        return;
      }

      setCommissionModalSaving(true);
      const payload = buildCommissionCalculationLedgerPayload({
        periodStart,
        periodEnd,
        selectedProfile,
        status: 'proposed',
      });
      const draftPayloads = await buildCommissionDraftPayloads({
        periodStart,
        periodEnd,
        posting: true,
      });
      await saveCommissionCalculationAtomically({ ledgerPayload: payload, draftPayloads });
      message.success('محاسبه پورسانت ثبت شد.');
      setCommissionModalOpen(false);
      setCommissionRows([]);
      await refreshPayrollPeriodState();
      await fetchCalculatedCommissionRows();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(toFaErrorMessage(err, 'ثبت محاسبه پورسانت ناموفق بود'));
    } finally {
      setCommissionModalSaving(false);
    }
  }, [buildCommissionCalculationLedgerPayload, buildCommissionDraftPayloads, commissionForm, commissionRows, fetchCalculatedCommissionRows, getCommissionPeriodValues, message, profiles, refreshPayrollPeriodState, saveCommissionCalculationAtomically]);

  const handleEditCommissionDraft = useCallback((row: CommissionLedgerRow) => {
    // شناسهٔ ذخیره‌شده در محاسبه‌های قبلی ممکن است شناسهٔ کارمند یا پروفایل باشد.
    // همان resolver مرکزیِ مودال، هر دو حالت را به پروفایل سازمانی تبدیل می‌کند.
    const employeeProfile = resolveCommissionEmployeeProfile(profiles, row.employee_id);
    const basis = row.details?.basis as CommissionBasis | undefined;
    const percentMode = row.details?.percent_mode as CommissionPercentMode | undefined;
    if (!employeeProfile || !row.period_start || !row.period_end || !basis || !percentMode) {
      message.error('اطلاعات پیش‌نویس پورسانت برای ویرایش کامل نیست.');
      return;
    }

    const values: CommissionCalculationFormValues = {
      period_range: [row.period_start, row.period_end],
      employee_profile_id: String(employeeProfile.id),
      basis,
      percent_mode: percentMode,
    };
    setCommissionInitialValues(values);
    commissionForm.setFieldsValue({
      ...values,
      period_range: [row.period_start, row.period_end],
    });
    setCommissionRows([]);
    setCommissionReviewTab('current_period');
    setCommissionModalOpen(true);
    window.setTimeout(() => {
      void handleBuildCommissionPreview();
    }, 0);
  }, [commissionForm, handleBuildCommissionPreview, message, profiles]);

  const handleDeleteCommissionCalculation = useCallback((row: CommissionLedgerRow) => {
    const isUuidLike = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    const rawLedgerEntryIds = Array.isArray(row.details?.ledger_entry_ids) && row.details.ledger_entry_ids.length > 0
      ? row.details.ledger_entry_ids
      : [row.id];
    const ledgerEntryIds = Array.from(new Set(
      rawLedgerEntryIds
        .map((value: unknown) => String(value || '').trim())
        .filter((value) => Boolean(value) && isUuidLike(value)),
    ));
    const calculationKey = String(row.details?.calculation_key || '').trim();
    const sourceKeys = Array.from(new Set(
      (Array.isArray(row.details?.rows) ? row.details.rows : [])
        .flatMap((invoiceRow: any) => Array.isArray(invoiceRow?.lines) ? invoiceRow.lines : [])
        .map((line: any) => String(line?.source_key || '').trim())
        .filter(Boolean),
    ));

    Modal.confirm({
      title: 'حذف محاسبه پورسانت',
      content: 'در این صورت همه پورسانت های لحاظ شده در این محاسبه پورسانت حذف خواهند شد.',
      okText: 'حذف',
      okButtonProps: { danger: true },
      cancelText: 'انصراف',
      onOk: async () => {
        setCommissionModalSaving(true);
        try {
          if (ledgerEntryIds.length > 0) {
            const { error } = await supabase
              .from('payroll_calculation_entries')
              .update({ status: 'voided', updated_at: new Date().toISOString() })
              .in('id', ledgerEntryIds);
            if (error && !isMissingPayrollLedgerError(error)) throw error;
          } else if (calculationKey && row.employee_id && row.period_start && row.period_end) {
            const { error } = await supabase
              .from('payroll_calculation_entries')
              .update({ status: 'voided', updated_at: new Date().toISOString() })
              .eq('source_type', 'commission')
              .eq('employee_id', row.employee_id)
              .eq('period_start', row.period_start)
              .eq('period_end', row.period_end)
              .eq('source_key', calculationKey);
            if (error && !isMissingPayrollLedgerError(error) && !isMissingSourceKeyError(error)) throw error;
          }
          if (sourceKeys.length > 0) {
            const { error } = await supabase
              .from('commission_drafts')
              .update({
                draft_status: 'canceled',
                posted_amount: 0,
                remaining_amount: 0,
                updated_at: new Date().toISOString(),
              })
              .in('source_key', sourceKeys);
            if (error && !isMissingCommissionDraftsError(error)) throw error;
          }
          const basis = String(row.details?.basis || '').trim();
          const percentMode = String(row.details?.percent_mode || '').trim();
          if (row.employee_id && row.period_start && row.period_end && basis && percentMode) {
            const { error } = await supabase
              .from('commission_drafts')
              .update({
                draft_status: 'canceled',
                posted_amount: 0,
                remaining_amount: 0,
                updated_at: new Date().toISOString(),
              })
              .eq('employee_id', row.employee_id)
              .eq('period_start', row.period_start)
              .eq('period_end', row.period_end)
              .eq('source_basis', basis)
              .eq('percent_mode', percentMode);
            if (error && !isMissingCommissionDraftsError(error)) throw error;
          }
          message.success('محاسبه پورسانت حذف شد و ردیف‌های آن دوباره قابل محاسبه هستند.');
          await refreshPayrollPeriodState();
          await fetchCalculatedCommissionRows();
        } catch (error) {
          message.error(toFaErrorMessage(error as any, 'حذف محاسبه پورسانت ناموفق بود'));
          throw error;
        } finally {
          setCommissionModalSaving(false);
        }
      },
    });
  }, [fetchCalculatedCommissionRows, message, refreshPayrollPeriodState]);

  const openPayrollConfigModal = (profile: ProfileRecord) => {
    setEditingProfile(profile);
    const values = HR_PAYROLL_CONFIG_FIELDS.reduce<Record<string, any>>((acc, field: any) => {
      acc[field.key] = (profile as any)[field.key] ?? field.defaultValue ?? null;
      return acc;
    }, {});
    configForm.setFieldsValue(values);
    setPayrollConfigModalOpen(true);
  };

  const openConfigModal = (profile: ProfileRecord) => {
    setEditingProfile(profile);
    setConfigModalOpen(true);
  };

  const handleSaveActivityPerformanceEntries = useCallback(async () => {
    if (!selectedEmployeeSummary?.profile?.source_id) {
      message.error('کارمند معتبر برای ثبت محاسبه عملکرد پیدا نشد.');
      return;
    }
    const periodStart = toNativeGregorianDateString(monthStart);
    const periodEnd = toNativeGregorianDateString(monthEnd);
    if (!periodStart || !periodEnd) {
      message.error('بازه محاسبه معتبر نیست.');
      return;
    }

    // ثبت فقط در سرویس مرکزی انجام می‌شود؛ RPC آن هم منبعِ واردشده در هر فیش
    // را قفل می‌کند تا از هیچ تب یا بازهٔ دیگری دوباره محاسبه نشود.
    setSavingActivityPerformance(true);
    try {
      const { data, error } = await supabase.functions.invoke('activity-performance', {
        body: {
          periodStart,
          periodEnd,
          mode: 'prepare',
          employeeIds: [String(selectedEmployeeSummary.profile.source_id)],
        },
      });
      if (error || !Array.isArray(data?.entries)) throw error || new Error('activity_performance_prepare_invalid');
      message.success(`${toPersianNumber(data.entries.length)} ردیف عملکرد از مسیر مرکزی آماده فیش شد.`);
      await fetchData(true);
      return;
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'آماده‌سازی سروری عملکرد ناموفق بود.'));
      return;
    } finally {
      setSavingActivityPerformance(false);
    }

  }, [fetchData, message, monthEnd, monthStart, selectedEmployeeSummary]);

  const handleSaveGoalRewardRows = useCallback(async (rows: EmployeeGoalTouchRow[]) => {
    const periodStart = toNativeGregorianDateString(monthStart);
    const periodEnd = toNativeGregorianDateString(monthEnd);
    if (!periodStart || !periodEnd) {
      message.error('بازه محاسبه معتبر نیست.');
      return;
    }
    const profileItems = rows
      .filter((row) => row.rewardEntries.length > 0 && row.payrollStatus !== 'included_in_payroll')
      .map((row) => {
        const profile = profiles.find((item) => String(item.source_id || item.id) === String(row.employeeId));
        return profile ? {
          employeeId: String(profile.source_id || profile.id),
          profileUserId: String(profile.related_profile_id || profile.id),
          profileRoleId: row.profileRoleId || null,
          profileName: profile.full_name || row.employeeName || null,
        } : null;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const uniqueProfiles = Array.from(new Map(profileItems.map((item) => [item.employeeId, item])).values());
    if (uniqueProfiles.length === 0) {
      message.info('ردیف قابل ثبت برای تحقق اهداف وجود ندارد.');
      return;
    }

    setSavingGoalLedger(true);
    try {
      await syncGoalRewardEntriesForPayroll(supabase as any, {
        profiles: uniqueProfiles,
        periodStart,
        periodEnd,
      });
      message.success('محاسبه تحقق اهداف در فیش حقوقی آماده شد.');
      await refreshPayrollPeriodState();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ثبت تحقق اهداف ناموفق بود.'));
    } finally {
      setSavingGoalLedger(false);
    }
  }, [message, monthEnd, monthStart, profiles, refreshPayrollPeriodState]);

  const buildAttendanceOvertimeSourceKey = (row: AttendanceComputedRow) =>
    `attendance_overtime:${String(row.employeeId || '').trim()}:${String(row.attendanceDate || row.key || '').trim()}`;

  const buildAttendanceEarlyBonusSourceKey = (row: AttendanceComputedRow) =>
    `attendance_early_bonus:${String(row.employeeId || '').trim()}:${String(row.attendanceDate || row.key || '').trim()}`;

  const buildAttendanceDelayAbsenceSourceKey = (row: AttendanceComputedRow) =>
    `attendance_delay_absence:${String(row.employeeId || '').trim()}:${String(row.attendanceDate || row.key || '').trim()}`;

  const buildAttendancePaidLeaveSourceKey = (row: AttendanceComputedRow) =>
    `attendance_paid_leave:${String(row.employeeId || '').trim()}:${String(row.attendanceDate || row.key || '').trim()}:${String(row.approvedLeaveRequestId || 'auto')}`;

  const resolveAttendanceLedgerEntry = useCallback((
    row: AttendanceComputedRow,
    sourceType: 'attendance_overtime' | 'attendance_early_bonus' | 'attendance_delay_absence' | 'attendance_paid_leave',
  ) => {
    const employee = profiles.find((item) => String(item.source_id || item.id) === String(row.employeeId));
    const requiredMinutes = computeRequiredWorkMinutesForProfile(employee || null);
    const presenceMinutes = calculateAttendanceRowPresenceMinutes(row);
    const hourlyRate = resolvePayrollHourlyRateForProfile(employee || null, presenceMinutes, requiredMinutes);

    if (sourceType === 'attendance_overtime') {
      const minutes = calculateAttendanceOvertimeMinutes(row);
      const rate = Math.max(0, toNumber(employee?.overtime_rate));
      return {
        sourceKey: buildAttendanceOvertimeSourceKey(row),
        sourceType,
        entryType: 'attendance_overtime',
        title: `اضافه‌کاری ${row.employeeName}`,
        minutes,
        rate,
        amount: Math.round((minutes / 60) * rate),
        sourceModuleId: 'attendance_logs',
      };
    }

    if (sourceType === 'attendance_early_bonus') {
      const minutes = calculateAttendanceEarlyBonusMinutes(row);
      const rate = toNumber(employee?.early_bonus_rate);
      return {
        sourceKey: buildAttendanceEarlyBonusSourceKey(row),
        sourceType,
        entryType: 'attendance_early_bonus',
        title: `پاداش تعجیل ${row.employeeName}`,
        minutes,
        rate,
        amount: Math.round((minutes / 60) * rate),
        sourceModuleId: 'attendance_logs',
      };
    }

    if (sourceType === 'attendance_delay_absence') {
      const paidLeaveMinutes = paidLeaveEligibleMinutesByAttendanceRowKey.get(row.key) || 0;
      const minutes = calculateAttendanceDelayAbsenceMinutes(
        row,
        employee || null,
        paidLeaveMinutes,
      );
      const breakdown = calculateAttendanceDelayAbsenceBreakdown(row, employee || null, paidLeaveMinutes);
      const rate = Math.max(0, toNumber(employee?.late_penalty_rate));
      return {
        sourceKey: buildAttendanceDelayAbsenceSourceKey(row),
        sourceType,
        entryType: 'attendance_delay_absence',
        title: `مرخصی بدون حقوق / تاخیر و غیبت ${row.employeeName}`,
        minutes,
        rate,
        amount: -Math.round((minutes / 60) * rate),
        sourceModuleId: 'attendance_logs',
        deductionSubtype: breakdown.deductionSubtype,
        delayMinutes: breakdown.delayMinutes,
        absenceMinutes: breakdown.absenceMinutes,
        unpaidLeaveMinutes: breakdown.unpaidLeaveMinutes,
        paidLeaveMinutes: breakdown.paidLeaveMinutes,
      };
    }

    const minutes = paidLeaveEligibleMinutesByAttendanceRowKey.get(row.key) || 0;
    const rate = hourlyRate;
    return {
      sourceKey: buildAttendancePaidLeaveSourceKey(row),
      sourceType,
      entryType: 'attendance_paid_leave',
      title: `مرخصی با حقوق ${row.employeeName}`,
      minutes,
      rate,
      amount: Math.round((minutes / 60) * rate),
      sourceModuleId: 'leave_requests',
    };
  }, [computeRequiredWorkMinutesForProfile, paidLeaveEligibleMinutesByAttendanceRowKey, profiles]);

  const handleApproveAttendanceOvertime = useCallback(async (row: AttendanceComputedRow) => {
    const meta = resolveAttendanceLedgerEntry(row, 'attendance_overtime');
    if (!row.employeeId || meta.minutes <= 0) return;
    const periodStart = toNativeGregorianDateString(monthStart);
    const periodEnd = toNativeGregorianDateString(monthEnd);
    if (!periodStart || !periodEnd) {
      message.error('بازه محاسبه معتبر نیست.');
      return;
    }
    const sourceKey = meta.sourceKey;
    const overtimeHours = meta.minutes / 60;
    const amount = meta.amount;
    setSavingOvertimeLedgerKey(sourceKey);
    try {
      const { error: requestError } = await supabase.from('overtime_requests').insert({
        employee_id: row.employeeId,
        status: 'approved',
        work_date: row.attendanceDate,
        start_time: row.scheduledEnd || null,
        end_time: parseDate(row.checkOutAt)?.format('HH:mm') || null,
        total_minutes: meta.minutes,
        notes: `تایید اضافه‌کاری از ویزارد فیش حقوقی برای ${row.employeeName}`,
      });
      if (requestError) throw requestError;

      const { data: existingRows, error: existingError } = await supabase
        .from('payroll_calculation_entries')
        .select('id, status')
        .eq('employee_id', row.employeeId)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .eq('source_type', 'attendance_overtime')
        .eq('source_key', sourceKey)
        .neq('status', 'voided');
      if (existingError && !isMissingPayrollLedgerError(existingError) && !isMissingSourceKeyError(existingError)) throw existingError;
      const alreadyExists = (existingRows || []).some((entry: any) => String(entry?.status || '') !== 'voided');
      if (!alreadyExists && amount !== 0) {
        const { error: insertError } = await supabase.from('payroll_calculation_entries').insert({
          employee_id: row.employeeId,
          period_start: periodStart,
          period_end: periodEnd,
          entry_type: meta.entryType,
          source_type: meta.sourceType,
          source_key: sourceKey,
          source_module_id: meta.sourceModuleId,
          source_record_id: row.rawIds[0] || row.id || null,
          title: meta.title,
          amount,
          quantity: overtimeHours,
          rate: meta.rate,
          status: 'proposed',
          details: {
            source_key: sourceKey,
            attendance_date: row.attendanceDate,
            raw_ids: row.rawIds,
            overtime_minutes: meta.minutes,
            employee_name: row.employeeName,
          },
        });
        if (insertError && !isMissingPayrollLedgerError(insertError)) throw insertError;
      }
      message.success('اضافه‌کاری تایید و برای فیش آماده شد.');
      await refreshPayrollPeriodState();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ثبت اضافه‌کاری ناموفق بود.'));
    } finally {
      setSavingOvertimeLedgerKey(null);
    }
  }, [message, monthEnd, monthStart, refreshPayrollPeriodState, resolveAttendanceLedgerEntry]);

  const handlePrepareAttendanceLedgerEntry = useCallback(async (
    row: AttendanceComputedRow,
    sourceType: 'attendance_early_bonus' | 'attendance_delay_absence' | 'attendance_paid_leave',
  ) => {
    if (!row.employeeId) return;
    const periodStart = toNativeGregorianDateString(monthStart);
    const periodEnd = toNativeGregorianDateString(monthEnd);
    if (!periodStart || !periodEnd) {
      message.error('بازه محاسبه معتبر نیست.');
      return;
    }
    const meta = resolveAttendanceLedgerEntry(row, sourceType);
    if (!meta.sourceKey || meta.minutes <= 0 || meta.amount === 0) return;
    const attendanceDetails = sourceType === 'attendance_delay_absence'
      ? {
        deduction_subtype: (meta as any).deductionSubtype || null,
        delay_minutes: (meta as any).delayMinutes || 0,
        absence_minutes: (meta as any).absenceMinutes || 0,
        unpaid_leave_minutes: (meta as any).unpaidLeaveMinutes || 0,
        paid_leave_minutes: (meta as any).paidLeaveMinutes || 0,
      }
      : {};
    setSavingOvertimeLedgerKey(meta.sourceKey);
    try {
      const { data: existingRows, error: existingError } = await supabase
        .from('payroll_calculation_entries')
        .select('id, status')
        .eq('employee_id', row.employeeId)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .eq('source_type', sourceType)
        .eq('source_key', meta.sourceKey);
      if (existingError && !isMissingPayrollLedgerError(existingError) && !isMissingSourceKeyError(existingError)) throw existingError;

      const existing = (existingRows || [])[0] as any;
      if (existing?.id && String(existing.status || '') !== 'included_in_payroll') {
        const { error } = await supabase
          .from('payroll_calculation_entries')
          .update({
            entry_type: meta.entryType,
            title: meta.title,
            amount: meta.amount,
            quantity: meta.minutes / 60,
            rate: meta.rate,
            status: 'proposed',
            details: {
              source_key: meta.sourceKey,
              attendance_date: row.attendanceDate,
              raw_ids: row.rawIds,
              minutes: meta.minutes,
              employee_name: row.employeeName,
              approved_leave_request_id: row.approvedLeaveRequestId,
              ...attendanceDetails,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error && !isMissingPayrollLedgerError(error)) throw error;
      } else if (!existing?.id) {
        const { error } = await supabase.from('payroll_calculation_entries').insert({
          employee_id: row.employeeId,
          period_start: periodStart,
          period_end: periodEnd,
          entry_type: meta.entryType,
          source_type: meta.sourceType,
          source_key: meta.sourceKey,
          source_module_id: meta.sourceModuleId,
          source_record_id: sourceType === 'attendance_paid_leave' ? row.approvedLeaveRequestId : row.rawIds[0] || row.id || null,
          title: meta.title,
          amount: meta.amount,
          quantity: meta.minutes / 60,
          rate: meta.rate,
          status: 'proposed',
          details: {
            source_key: meta.sourceKey,
            attendance_date: row.attendanceDate,
            raw_ids: row.rawIds,
            minutes: meta.minutes,
            employee_name: row.employeeName,
            approved_leave_request_id: row.approvedLeaveRequestId,
            ...attendanceDetails,
          },
        });
        if (error && !isMissingPayrollLedgerError(error)) throw error;
      }
      message.success('ردیف برای فیش حقوقی آماده شد.');
      await refreshPayrollPeriodState();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ثبت ردیف فیش ناموفق بود.'));
    } finally {
      setSavingOvertimeLedgerKey(null);
    }
  }, [message, monthEnd, monthStart, refreshPayrollPeriodState, resolveAttendanceLedgerEntry]);

  const handleVoidAttendanceLedgerEntry = useCallback(async (entryId: string | null | undefined) => {
    const id = String(entryId || '').trim();
    if (!id) return;
    setSavingOvertimeLedgerKey(id);
    try {
      const { error } = await supabase
        .from('payroll_calculation_entries')
        .update({ status: 'voided', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error && !isMissingPayrollLedgerError(error)) throw error;
      message.success('ردیف از فیش حقوقی کنار گذاشته شد.');
      await refreshPayrollPeriodState();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'عدم لحاظ ردیف ناموفق بود.'));
    } finally {
      setSavingOvertimeLedgerKey(null);
    }
  }, [message, refreshPayrollPeriodState]);

  const prepareAttendancePayrollLedgerEntriesForRows = useCallback(async (rows: AttendanceComputedRow[]) => {
    const periodStart = toNativeGregorianDateString(monthStart);
    const periodEnd = toNativeGregorianDateString(monthEnd);
    if (!periodStart || !periodEnd || rows.length === 0) return;

    const evaluatedCandidates = rows
      .filter((row) => String(row.employeeId || '').trim())
      .flatMap((row) => ([
        resolveAttendanceLedgerEntry(row, 'attendance_overtime'),
        resolveAttendanceLedgerEntry(row, 'attendance_early_bonus'),
        resolveAttendanceLedgerEntry(row, 'attendance_paid_leave'),
        resolveAttendanceLedgerEntry(row, 'attendance_delay_absence'),
      ].map((meta) => ({ row, meta }))));

    const candidates = evaluatedCandidates
      .filter(({ meta }) => meta.sourceKey && meta.minutes > 0 && meta.amount !== 0);

    const employeeIds = Array.from(new Set(evaluatedCandidates.map(({ row }) => String(row.employeeId || '').trim()).filter(Boolean)));
    const sourceKeys = Array.from(new Set(evaluatedCandidates.map(({ meta }) => meta.sourceKey).filter(Boolean)));
    if (employeeIds.length === 0 || sourceKeys.length === 0) return;

    const { data: existingRows, error: existingError } = await supabase
      .from('payroll_calculation_entries')
      .select('id, status, source_type, source_key, details')
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .in('employee_id', employeeIds)
      .in('source_key', sourceKeys);
    if (existingError && !isMissingPayrollLedgerError(existingError) && !isMissingSourceKeyError(existingError)) throw existingError;

    const existingByTypeAndKey = new Map(
      (existingRows || []).map((entry: any) => [
        `${String(entry?.source_type || '').trim()}::${String(entry?.source_key || entry?.details?.source_key || '').trim()}`,
        entry,
      ] as const),
    );

    // اگر محاسبهٔ تازه آیتمی را نامعتبر کرد، نسخهٔ پیشنهادی قبلی آن نباید در
    // فیش باقی بماند. اقلامی که داخل فیش ثبت‌شده‌اند snapshot هستند.
    for (const { meta } of evaluatedCandidates) {
      const existing = existingByTypeAndKey.get(`${meta.sourceType}::${meta.sourceKey}`);
      const isEligible = Boolean(meta.sourceKey && meta.minutes > 0 && meta.amount !== 0);
      if (!existing?.id || isEligible || !['draft', 'proposed'].includes(String(existing.status || ''))) continue;

      const { error } = await supabase
        .from('payroll_calculation_entries')
        .update({ status: 'voided', updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error && !isMissingPayrollLedgerError(error)) throw error;
    }

    for (const { row, meta } of candidates) {
      const existing = existingByTypeAndKey.get(`${meta.sourceType}::${meta.sourceKey}`);
      if (String(existing?.status || '') === 'included_in_payroll' || String(existing?.status || '') === 'voided') continue;
      const payloadDetails = {
        source_key: meta.sourceKey,
        attendance_date: row.attendanceDate,
        raw_ids: row.rawIds,
        minutes: meta.minutes,
        rate: meta.rate,
        employee_name: row.employeeName,
        approved_leave_request_id: row.approvedLeaveRequestId,
        ...(meta.sourceType === 'attendance_delay_absence' ? {
          deduction_subtype: (meta as any).deductionSubtype || null,
          delay_minutes: (meta as any).delayMinutes || 0,
          absence_minutes: (meta as any).absenceMinutes || 0,
          unpaid_leave_minutes: (meta as any).unpaidLeaveMinutes || 0,
          paid_leave_minutes: (meta as any).paidLeaveMinutes || 0,
        } : {}),
      };

      if (existing?.id) {
        const { error } = await supabase
          .from('payroll_calculation_entries')
          .update({
            entry_type: meta.entryType,
            title: meta.title,
            amount: meta.amount,
            quantity: meta.minutes / 60,
            rate: meta.rate,
            status: 'proposed',
            details: payloadDetails,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error && !isMissingPayrollLedgerError(error)) throw error;
        continue;
      }

      const { error } = await supabase.from('payroll_calculation_entries').insert({
        employee_id: row.employeeId,
        period_start: periodStart,
        period_end: periodEnd,
        entry_type: meta.entryType,
        source_type: meta.sourceType,
        source_key: meta.sourceKey,
        source_module_id: meta.sourceModuleId,
        source_record_id: meta.sourceType === 'attendance_paid_leave' ? row.approvedLeaveRequestId : row.rawIds[0] || row.id || null,
        title: meta.title,
        amount: meta.amount,
        quantity: meta.minutes / 60,
        rate: meta.rate,
        status: 'proposed',
        details: payloadDetails,
      });
      if (error && !isMissingPayrollLedgerError(error) && String(error?.code || '').toUpperCase() !== '23505') throw error;
    }
  }, [monthEnd, monthStart, resolveAttendanceLedgerEntry]);

  const handleSavePayrollConfig = async () => {
    if (!editingProfile?.id) return;
    try {
      await configForm.validateFields();
      const values = configForm.getFieldsValue(true);
      setSavingProfileConfig(true);
      const targetTable = editingProfile.source_table === 'profiles' ? 'profiles' : 'employees';
      const targetId = editingProfile.source_id || editingProfile.id;
      const fieldsToSave = targetTable === 'employees'
        ? HR_PAYROLL_CONFIG_FIELDS
        : HR_PAYROLL_CONFIG_FIELDS.filter((field: any) => [
          'base_salary',
          'overtime_rate',
          'late_penalty_rate',
          'early_bonus_rate',
          'production_bonus_rate',
          'insurance_subject',
          'employee_insurance_rate',
          'employer_insurance_rate',
        ].includes(String(field.key)));
      const patch = fieldsToSave.reduce<Record<string, any>>((acc, field: any) => {
        if (!Object.prototype.hasOwnProperty.call(values, field.key)) return acc;
        const rawValue = values[field.key];
        if (rawValue === undefined) return acc;
        const type = String(field.type || '');
        if (['number', 'price', 'percentage'].includes(type)) acc[field.key] = toNumber(rawValue);
        else if (type === 'checkbox') acc[field.key] = Boolean(rawValue);
        else acc[field.key] = rawValue === undefined || rawValue === '' ? null : rawValue;
        return acc;
      }, {});
      if (Object.keys(patch).length === 0) {
        message.info('مقداری برای ذخیره تغییر نکرده است.');
        return;
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

  const handleSavePayrollWizardConfigField = async (field: any) => {
    const profile = payrollWizardSummary?.profile;
    const fieldKey = String(field?.key || '').trim();
    if (!profile?.id || !fieldKey) return;
    if (!canEditEmployeePayrollConfig) {
      message.error('دسترسی ویرایش تنظیمات کارمند را ندارید.');
      return;
    }

    const targetTable = profile.source_table === 'profiles' ? 'profiles' : 'employees';
    const targetId = profile.source_id || profile.id;
    const profileFallbackAllowedFields = new Set([
      'base_salary',
      'overtime_rate',
      'late_penalty_rate',
      'early_bonus_rate',
      'production_bonus_rate',
      'insurance_subject',
      'employee_insurance_rate',
      'employer_insurance_rate',
    ]);
    if (targetTable !== 'employees' && !profileFallbackAllowedFields.has(fieldKey)) {
      message.error('این فیلد برای رکورد کاربر قابل ویرایش نیست.');
      return;
    }

    const rawValue = Object.prototype.hasOwnProperty.call(payrollWizardDraftValues, fieldKey)
      ? payrollWizardDraftValues[fieldKey]
      : (profile as any)[fieldKey];
    const type = String(field.type || '');
    const nextValue = ['number', 'price', 'percentage'].includes(type)
      ? toNumber(rawValue)
      : type === 'checkbox'
        ? Boolean(rawValue)
        : rawValue === undefined || rawValue === '' ? null : rawValue;

    setSavingPayrollWizardFieldKey(fieldKey);
    try {
      const { error } = await supabase
        .from(targetTable)
        .update({ [fieldKey]: nextValue })
        .eq('id', targetId);
      if (error) throw error;

      setProfiles((current) => current.map((item) => (
        String(item.source_id || item.id) === String(profile.source_id || profile.id)
          ? { ...item, [fieldKey]: nextValue }
          : item
      )));
      setEditingPayrollWizardFieldKey(null);
      setPayrollWizardDraftValues((current) => {
        const next = { ...current };
        delete next[fieldKey];
        return next;
      });
      message.success('فیلد ذخیره شد.');
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'ذخیره فیلد ناموفق بود'));
    } finally {
      setSavingPayrollWizardFieldKey(null);
    }
  };

  const ensureActivityPerformanceLedgerForSummary = useCallback(async (row: EmployeeSummaryRow, periodStart: string, periodEnd: string) => {
    const employeeIdValue = String(row.profile.source_id || '').trim();
    if (!employeeIdValue) return;
    const { data, error } = await supabase.functions.invoke('activity-performance', {
      body: { periodStart, periodEnd, mode: 'prepare', employeeIds: [employeeIdValue] },
    });
    if (error || !Array.isArray(data?.entries)) throw error || new Error('activity_performance_prepare_invalid');
    return;

    const candidateEntries = (row.activityPerformanceEntries || [])
      .filter((entry) => String(entry.source_key || '').trim() && toNumber(entry.amount) !== 0);
    if (candidateEntries.length === 0) return;

    const sourceKeys = candidateEntries.map((entry) => String(entry.source_key || '').trim()).filter(Boolean);
    const { data: existingRows, error: existingError } = await supabase
      .from('payroll_calculation_entries')
      .select('source_key, details')
      .eq('source_type', 'activity_performance')
      .eq('employee_id', employeeIdValue)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .neq('status', 'voided')
      .in('source_key', sourceKeys);
    if (existingError && !isMissingPayrollLedgerError(existingError) && !isMissingSourceKeyError(existingError)) throw existingError;

    const existingKeys = new Set((existingRows || []).map((entry: any) => String(entry?.source_key || entry?.details?.source_key || '').trim()).filter(Boolean));
    const payloads = candidateEntries
      .filter((entry) => !existingKeys.has(String(entry.source_key || '').trim()))
      .map((entry) => ({
        employee_id: employeeIdValue,
        period_start: periodStart,
        period_end: periodEnd,
        entry_type: entry.output_type === 'penalty' || toNumber(entry.amount) < 0 ? 'penalty' : 'activity_performance',
        source_type: 'activity_performance',
        source_key: String(entry.source_key || '').trim(),
        source_module_id: 'tasks',
        source_record_id: entry.task_id || null,
        title: entry.title || entry.metric_label || 'محاسبه عملکرد',
        amount: toNumber(entry.amount),
        quantity: entry.quantity ?? null,
        rate: entry.rate ?? null,
        status: 'proposed',
        assignee_id: row.profile.related_profile_id || null,
        details: {
          source_key: entry.source_key || null,
          source_rule_id: entry.source_rule_id,
          formula_id: entry.formula_id || null,
          task_id: entry.task_id,
          metric_key: entry.metric_key || null,
          metric_label: entry.metric_label || null,
          output_type: entry.output_type,
          snapshot: entry.snapshot || {},
        },
      }));
    if (payloads.length > 0) {
      const { error } = await supabase.from('payroll_calculation_entries').insert(payloads);
      if (error && String(error?.code || '').toUpperCase() !== '23505') throw error;
    }
  }, []);

  useEffect(() => {
    if (!payrollWizardOpen || !payrollWizardSummary) return;
    const periodStart = toNativeGregorianDateString(monthStart);
    const periodEnd = toNativeGregorianDateString(monthEnd);
    if (!periodStart || !periodEnd) return;
    let cancelled = false;
    const run = async () => {
      setPayrollWizardPreparing(true);
      try {
        await ensureActivityPerformanceLedgerForSummary(payrollWizardSummary, periodStart, periodEnd);
        const profile = payrollWizardSummary.profile;
        if (profile?.source_id) {
          const directory = await fetchAssigneeDirectory(supabase);
          const profileUserId = String(profile.related_profile_id || profile.id || '').trim();
          const directoryUser = (directory.users || []).find((user) => String(user.id || '').trim() === profileUserId);
          await Promise.all([
            syncEmployeeCompensationEntriesForPayroll(supabase as any, {
              employeeIds: [String(profile.source_id)],
              periodStart,
              periodEnd,
            }),
            syncGoalRewardEntriesForPayroll(supabase as any, {
              profiles: [{
                employeeId: String(profile.source_id),
                profileUserId,
                profileRoleId: directoryUser?.role_id ? String(directoryUser.role_id) : null,
                profileName: payrollWizardSummary.name,
              }],
              periodStart,
              periodEnd,
            }),
          ]);
          await prepareAttendancePayrollLedgerEntriesForRows(payrollWizardAttendanceRows);
        }
        if (profile?.seniority_mode === 'labor_law' && profile?.hire_date && profile?.source_id) {
          await syncSeniorityPayrollEntry(supabase as any, {
            employeeId: String(profile.source_id),
            hireDate: profile.hire_date,
            periodStart,
            periodEnd,
          });
        }
        if (!cancelled) await refreshPayrollPeriodState();
      } catch (error) {
        console.warn('Could not prepare payroll wizard.', error);
      } finally {
        if (!cancelled) setPayrollWizardPreparing(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    ensureActivityPerformanceLedgerForSummary,
    monthEnd,
    monthStart,
    payrollWizardAttendanceRows,
    payrollWizardOpen,
    payrollWizardSummary,
    prepareAttendancePayrollLedgerEntriesForRows,
    refreshPayrollPeriodState,
  ]);

  const handleCalculatePayrollWizardSeniority = useCallback(async () => {
    const profile = payrollWizardSummary?.profile;
    const employeeId = String(profile?.source_id || '').trim();
    const hireDate = String(profile?.hire_date || '').trim();
    const periodStart = toNativeGregorianDateString(monthStart);
    const periodEnd = toNativeGregorianDateString(monthEnd);
    if (profile?.seniority_mode !== 'labor_law') {
      message.warning('برای این کارمند، فرمول سنوات باید روی «پایه سنوات - قانون کار ایران (خودکار)» باشد.');
      return;
    }
    if (!employeeId || !hireDate || !periodStart || !periodEnd) {
      message.error('تاریخ شروع همکاری یا بازه فیش برای محاسبه سنوات کامل نیست.');
      return;
    }

    setCalculatingPayrollWizardSeniority(true);
    try {
      const amount = await syncSeniorityPayrollEntry(supabase as any, {
        employeeId,
        hireDate,
        periodStart,
        periodEnd,
      });
      await refreshPayrollPeriodState();
      message.success(amount > 0 ? 'سنوات این ماه محاسبه و به اقلام فیش اضافه شد.' : 'برای این بازه، کارمند هنوز شرایط دریافت پایه سنوات را ندارد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'محاسبه سنوات ناموفق بود.'));
    } finally {
      setCalculatingPayrollWizardSeniority(false);
    }
  }, [message, monthEnd, monthStart, payrollWizardSummary?.profile, refreshPayrollPeriodState]);

  const handleCreatePayrollSlipFromWizard = useCallback(async () => {
    const row = payrollWizardSummary;
    if (!row?.profile?.source_id) {
      message.error('کارمند معتبر برای ایجاد فیش پیدا نشد.');
      return;
    }
    const employeeIdValue = String(row.profile.source_id);
    const periodStart = toNativeGregorianDateString(monthStart);
    const periodEnd = toNativeGregorianDateString(monthEnd);
    if (!periodStart || !periodEnd) {
      message.error('بازه فیش حقوقی معتبر نیست.');
      return;
    }
    const existingSlip = payrollSlipByEmployeeId.get(employeeIdValue);
    if (existingSlip?.id) {
      navigate(`/payroll_slips/${existingSlip.id}`);
      return;
    }
    if (payrollWizardPreparing) {
      message.info('اقلام فیش هنوز در حال آماده‌سازی هستند؛ چند لحظه دیگر دوباره تلاش کنید.');
      return;
    }

    setCreatingPayrollSlip(true);
    try {
      // ثبت دقیقاً از همان snapshotی انجام می‌شود که مرحلهٔ آخر ویزارد نمایش داده است.
      const ledgerEntries = payrollWizardOpenLedger as PayrollLedgerEntry[];
      const systemCode = await buildClientFallbackSystemCode(supabase, 'payroll_slips', 'payroll_slips');
      const payload = {
        name: `فیش حقوق ${row.name} ${toPersianNumber(safeJalaliFormat(monthStart.toISOString(), 'YYYY/MM'))}`,
        system_code: systemCode,
        employee_id: employeeIdValue,
        period_start: periodStart,
        period_end: periodEnd,
        status: 'draft',
        assignee_id: row.profile.related_profile_id || null,
        base_salary: payrollWizardBaseCompensation.amount,
        task_wage_total: row.taskWageTotal,
        bonus_total: payrollWizardDraft.ledgerBonusTotal,
        deduction_total: payrollWizardDraft.ledgerDeductionTotal + payrollWizardDraft.employeeInsuranceAmount,
        insurance_employee_amount: payrollWizardDraft.employeeInsuranceAmount,
        insurance_employer_amount: payrollWizardDraft.employerInsuranceAmount,
        gross_amount: payrollWizardDraft.grossAmount,
        net_amount: payrollWizardDraft.netAmount,
        lines: payrollWizardDraft.lines,
        payments: payrollWizardDraft.payments,
        performance_snapshot: {
          total_tasks: row.totalTasks,
          done_count: row.doneCount,
          overtime_hours: row.overtimeHours,
          late_hours: row.lateHours,
          produced_qty: row.producedQty,
          payroll_ledger_entry_ids: ledgerEntries.map((entry) => entry.id),
          employee_advance_ids: payrollWizardSettleableAdvances.map((advance) => advance.id),
          attendance: {
            required_minutes: payrollWizardRequiredMinutes,
            hourly_rate: payrollWizardHourlyRate,
            presence_minutes: calculatePresenceMinutes(payrollWizardAttendanceRows),
          },
        },
        task_ids: row.payrollTaskIds,
        notes: `ایجاد شده از ویزارد منابع انسانی برای بازه ${periodStart} تا ${periodEnd}`,
      };

      const bonusRequestIds = ledgerEntries
        .filter((entry) => String(entry.source_type || '') === 'employee_bonus')
        .map((entry) => String(entry.source_record_id || '').trim())
        .filter(Boolean);
      const penaltyRequestIds = ledgerEntries
        .filter((entry) => String(entry.source_type || '') === 'employee_penalty')
        .map((entry) => String(entry.source_record_id || '').trim())
        .filter(Boolean);
      const advanceIds = payrollWizardSettleableAdvances.map((advance) => String(advance.id || '').trim()).filter(Boolean);
      const { data: insertedSlipId, error: insertError } = await supabase.rpc('create_payroll_slip_from_wizard', {
        p_payload: payload,
        p_ledger_entry_ids: ledgerEntries.map((entry) => entry.id),
        p_bonus_request_ids: bonusRequestIds,
        p_penalty_request_ids: penaltyRequestIds,
        p_advance_ids: advanceIds,
      });
      if (insertError) throw insertError;
      const insertedId = String(insertedSlipId || '').trim();
      if (!insertedId) throw new Error('شناسه فیش ایجادشده دریافت نشد.');
      message.success('فیش حقوقی پیش‌نویس ایجاد شد.');
      closePayrollWizard();
      await refreshPayrollPeriodState();
      await fetchEmployeeAdvancesForDashboard();
      navigate(`/payroll_slips/${insertedId}`);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ایجاد فیش حقوقی ناموفق بود.'));
    } finally {
      setCreatingPayrollSlip(false);
    }
  }, [
    closePayrollWizard,
    fetchEmployeeAdvancesForDashboard,
    message,
    monthEnd,
    monthStart,
    navigate,
    payrollSlipByEmployeeId,
    payrollWizardAttendanceRows,
    payrollWizardBaseCompensation.amount,
    payrollWizardHourlyRate,
    payrollWizardRequiredMinutes,
    payrollWizardSettleableAdvances,
    payrollWizardDraft,
    payrollWizardOpenLedger,
    payrollWizardPreparing,
    payrollWizardSummary,
    refreshPayrollPeriodState,
  ]);

  const renderPayrollWizardConfigField = (field: any) => {
    const profile = payrollWizardSummary?.profile;
    if (!profile) return null;
    const fieldKey = String(field.key || '').trim();
    const fieldLabel = field.labels?.fa || 'فیلد';
    const isEditing = editingPayrollWizardFieldKey === fieldKey;
    const baseValue = (profile as any)[fieldKey] ?? field.defaultValue ?? null;
    const fieldValue = Object.prototype.hasOwnProperty.call(payrollWizardDraftValues, fieldKey)
      ? payrollWizardDraftValues[fieldKey]
      : baseValue;
    const allValues = { ...profile, ...payrollWizardDraftValues, [fieldKey]: fieldValue };
    if (!evaluateLegacyVisibilityRule(field.logic, allValues)) return null;

    if (isEditing) {
      return (
        <div key={fieldKey} className="rounded-xl border border-gray-200 px-3 py-2 dark:border-gray-800">
          <div className="mb-1 text-[11px] font-bold text-gray-500">{fieldLabel}</div>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <SmartFieldRenderer
                field={field}
                value={fieldValue}
                onChange={(value) => setPayrollWizardDraftValues((current) => ({ ...current, [fieldKey]: value }))}
                allValues={allValues}
                moduleId="employees"
                forceEditMode
                compactMode
                overlayZIndexBase={12000}
                popupContainer={resolveOverlayPopupContainer}
                preferLocalPopupContainer
              />
            </div>
            <Button
              size="small"
              type="text"
              icon={<CheckOutlined />}
              loading={savingPayrollWizardFieldKey === fieldKey}
              onClick={() => handleSavePayrollWizardConfigField(field)}
              className="!h-8 !w-8 !min-w-8 rounded-full border border-gray-200 text-gray-500 hover:!border-emerald-200 hover:!text-emerald-600"
            />
            <Button
              size="small"
              type="text"
              icon={<CloseOutlined />}
              onClick={() => {
                setEditingPayrollWizardFieldKey(null);
                setPayrollWizardDraftValues((current) => {
                  const next = { ...current };
                  delete next[fieldKey];
                  return next;
                });
              }}
              className="!h-8 !w-8 !min-w-8 rounded-full border border-gray-200 text-gray-500 hover:!border-rose-200 hover:!text-rose-600"
            />
          </div>
        </div>
      );
    }

    return (
      <div
        key={fieldKey}
        className={`group min-h-[58px] rounded-xl border border-gray-100 px-3 py-2 transition-colors dark:border-gray-800 ${
          canEditEmployeePayrollConfig ? 'cursor-pointer hover:border-gray-200 hover:bg-gray-50 dark:hover:bg-white/5' : ''
        }`}
        onClick={() => {
          if (!canEditEmployeePayrollConfig) return;
          setEditingPayrollWizardFieldKey(fieldKey);
          setPayrollWizardDraftValues((current) => ({ ...current, [fieldKey]: baseValue }));
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-gray-500">{fieldLabel}</div>
            <div className="mt-1 min-h-[22px] text-sm font-bold text-gray-800 dark:text-gray-100">
              <SmartFieldRenderer
                field={field}
                value={baseValue}
                onChange={() => undefined}
                allValues={profile}
                moduleId="employees"
                forceEditMode={false}
                compactMode
                overlayZIndexBase={12000}
                popupContainer={resolveOverlayPopupContainer}
                preferLocalPopupContainer
              />
            </div>
          </div>
          {canEditEmployeePayrollConfig && (
            <EditOutlined className="mt-1 shrink-0 text-xs text-leather-400 opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </div>
      </div>
    );
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
        <Tag color="gold">{getSalaryTypeLabelFa(row.profile.salary_type)}</Tag>
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
        <div>وزن: <span className="persian-number">{toPersianNumber(row.weight)}</span></div>
          <div className="font-bold text-gray-800">دستمزد نهایی: <span className="persian-number">{formatMoney(row.wageFinal)}</span></div>
        <div>دستمزد ضریب: <span className="persian-number text-blue-700">{formatMoney(row.activityWageAmount)}</span></div>
        <div>پاداش: <span className="persian-number text-green-700">{formatMoney(row.activityBonusAmount)}</span></div>
        <div>جریمه: <span className="persian-number text-red-700">{formatMoney(row.activityPenaltyAmount)}</span></div>
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
      title: 'دستمزد',
      key: 'wageTotal',
      render: (_: unknown, row: EmployeeSummaryRow) => (
        <span className="persian-number font-bold">{formatMoney(row.taskWageTotal + row.activityWageTotal)}</span>
      ),
    },
    {
      title: 'پاداش',
      key: 'activityBonusTotal',
      render: (_: unknown, row: EmployeeSummaryRow) => (
        <span className="persian-number text-green-700">{formatMoney(row.activityBonusTotal)}</span>
      ),
    },
    {
      title: 'عملکرد',
      key: 'activityPerformanceTotal',
      render: (_: unknown, row: EmployeeSummaryRow) => (
        <span className={`persian-number font-bold ${row.activityPerformanceTotal < 0 ? 'text-red-700' : 'text-green-700'}`}>
          {formatMoney(row.activityPerformanceTotal)}
        </span>
      ),
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
      title: 'وزن',
      dataIndex: 'weight',
      key: 'weight',
      render: (val: number) => <span className="persian-number">{toPersianNumber(val)}</span>,
    },
    {
      title: 'دستمزد نهایی',
      dataIndex: 'wageFinal',
      key: 'wageFinal',
      render: (val: number) => <span className="persian-number font-bold">{formatMoney(val)}</span>,
    },
    {
      title: 'دستمزد',
      dataIndex: 'activityWageAmount',
      key: 'activityWageAmount',
      render: (val: number) => <span className="persian-number text-blue-700">{formatMoney(val)}</span>,
    },
    {
      title: 'پاداش',
      dataIndex: 'activityBonusAmount',
      key: 'activityBonusAmount',
      render: (val: number) => <span className="persian-number text-green-700">{formatMoney(val)}</span>,
    },
    {
      title: 'جریمه',
      dataIndex: 'activityPenaltyAmount',
      key: 'activityPenaltyAmount',
      render: (val: number) => <span className="persian-number text-red-700">{formatMoney(val)}</span>,
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
      title: 'تاریخ',
      dataIndex: 'attendanceDate',
      key: 'attendanceDate',
      render: (_: string | null, row: AttendanceComputedRow) => (
        <span>{row.attendanceDate ? toPersianNumber(safeJalaliFormat(row.attendanceDate, 'YYYY/MM/DD')) : '-'}</span>
      ),
    },
    {
      title: 'ورود',
      dataIndex: 'checkInAt',
      key: 'checkInAt',
      render: (val: string | null, row: AttendanceComputedRow) => {
        const segmentEntries = row.attendanceSegments.filter((segment) => segment.checkInAt);
        if (segmentEntries.length > 1) {
          return (
            <div className="flex flex-col gap-1">
              {segmentEntries.map((segment, index) => (
                <Tag key={`${segment.key}_in`} color="green" className="w-fit">
                  {toPersianNumber(index + 1)}: {toPersianNumber(safeJalaliFormat(segment.checkInAt || '', 'HH:mm'))}
                </Tag>
              ))}
            </div>
          );
        }
        const shiftEntries = row.shiftDeltas.filter((shift) => shift.checkInAt);
        if (row.shiftDeltas.length > 1 && shiftEntries.length) {
          return (
            <div className="flex flex-col gap-1">
              {shiftEntries.map((shift) => (
                <Tag key={`${shift.key}_in`} color="green" className="w-fit">
                  {shift.label}: {toPersianNumber(safeJalaliFormat(shift.checkInAt || '', 'HH:mm'))}
                </Tag>
              ))}
            </div>
          );
        }
        return val
          ? <Tag color="green">{toPersianNumber(safeJalaliFormat(val, 'HH:mm'))}</Tag>
          : <span className="text-gray-400">-</span>;
      },
    },
    {
      title: 'خروج',
      dataIndex: 'checkOutAt',
      key: 'checkOutAt',
      render: (val: string | null, row: AttendanceComputedRow) => {
        const segmentEntries = row.attendanceSegments.filter((segment) => segment.checkOutAt);
        if (segmentEntries.length > 1) {
          return (
            <div className="flex flex-col gap-1">
              {segmentEntries.map((segment, index) => (
                <Tag key={`${segment.key}_out`} color="red" className="w-fit">
                  {toPersianNumber(index + 1)}: {toPersianNumber(safeJalaliFormat(segment.checkOutAt || '', 'HH:mm'))}
                </Tag>
              ))}
            </div>
          );
        }
        const shiftEntries = row.shiftDeltas.filter((shift) => shift.checkOutAt);
        if (row.shiftDeltas.length > 1 && shiftEntries.length) {
          return (
            <div className="flex flex-col gap-1">
              {shiftEntries.map((shift) => (
                <Tag key={`${shift.key}_out`} color="red" className="w-fit">
                  {shift.label}: {toPersianNumber(safeJalaliFormat(shift.checkOutAt || '', 'HH:mm'))}
                </Tag>
              ))}
            </div>
          );
        }
        return val
          ? <Tag color="red">{toPersianNumber(safeJalaliFormat(val, 'HH:mm'))}</Tag>
          : <span className="text-gray-400">-</span>;
      },
    },
    {
      title: 'برنامه حضور',
      key: 'schedule',
      render: (_: unknown, row: AttendanceComputedRow) => (
        <div className="text-xs leading-6">
          <div className="font-bold">{row.scheduleTitle || '-'}</div>
          {row.scheduleShifts.length ? (
            row.scheduleShifts.map((shift) => (
              <div key={shift.key} className="text-gray-500">
                {shift.label}: {toPersianNumber(shift.start || '--')} تا {toPersianNumber(shift.end || '--')}
              </div>
            ))
          ) : (
            <div className="text-gray-500">
              {row.scheduledStart || row.scheduledEnd ? `${toPersianNumber(row.scheduledStart || '--')} تا ${toPersianNumber(row.scheduledEnd || '--')}` : 'بدون برنامه'}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'اختلاف',
      key: 'delta',
      render: (_: unknown, row: AttendanceComputedRow) => <Tag color={row.deltaColor}>{row.deltaLabel}</Tag>,
    },
    {
      title: 'جزئیات',
      key: 'delta_details',
      render: (_: unknown, row: AttendanceComputedRow) => (
        <div className="text-xs leading-6">
          <div className="mb-2">
            <div>جمع حضور: <span className="persian-number text-blue-700">{formatMinutesLabel(calculateAttendanceRowPresenceMinutes(row))}</span></div>
            <div>جمع دیرکرد: <span className="persian-number text-red-700">{formatMinutesLabel(row.lateMinutes)}</span></div>
          </div>
          {row.attendanceSegments.length > 1 && (
            <div className="mb-2">
              <div className="font-bold text-gray-700">بازه‌های حضور</div>
              {row.attendanceSegments.map((segment, index) => (
                <div key={segment.key}>
                  {toPersianNumber(index + 1)}: {segment.checkInAt ? toPersianNumber(safeJalaliFormat(segment.checkInAt, 'HH:mm')) : '-'}
                  {' تا '}
                  {segment.checkOutAt ? toPersianNumber(safeJalaliFormat(segment.checkOutAt, 'HH:mm')) : '-'}
                  {'، '}
                  <span className="persian-number text-blue-700">{formatMinutesLabel(segment.presenceMinutes)}</span>
                </div>
              ))}
            </div>
          )}
          {row.shiftDeltas.length ? (
            row.shiftDeltas.map((shift) => (
              <div key={shift.key} className="mb-1">
                <div className="font-bold text-gray-700">{shift.label}</div>
                <div>دیرکرد: <span className="persian-number text-red-700">{formatMinutesLabel(shift.lateMinutes)}</span></div>
                <div>تعجیل ورود: <span className="persian-number text-green-700">{formatMinutesLabel(shift.earlyArrivalMinutes)}</span></div>
                <div>تعجیل خروج: <span className="persian-number text-orange-600">{formatMinutesLabel(shift.earlyLeaveMinutes)}</span></div>
                <div>اضافه‌ماندن: <span className="persian-number text-blue-700">{formatMinutesLabel(shift.overtimeStayMinutes)}</span></div>
                {row.approvedLeaveMinutes > 0 ? <div>مرخصی تاییدشده: <span className="persian-number text-cyan-700">{formatMinutesLabel(row.approvedLeaveMinutes)}</span></div> : null}
              </div>
            ))
          ) : (
            <>
              <div>دیرکرد: <span className="persian-number text-red-700">{formatMinutesLabel(row.lateMinutes)}</span></div>
              <div>تعجیل ورود: <span className="persian-number text-green-700">{formatMinutesLabel(row.earlyArrivalMinutes)}</span></div>
              <div>تعجیل خروج: <span className="persian-number text-orange-600">{formatMinutesLabel(row.earlyLeaveMinutes)}</span></div>
              <div>اضافه‌ماندن: <span className="persian-number text-blue-700">{formatMinutesLabel(row.overtimeStayMinutes)}</span></div>
              {row.approvedLeaveMinutes > 0 ? <div>مرخصی تاییدشده: <span className="persian-number text-cyan-700">{formatMinutesLabel(row.approvedLeaveMinutes)}</span></div> : null}
            </>
          )}
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
            disabled={row.rawIds.length === 0}
            onClick={(event) => {
              event.stopPropagation();
              const rawId = row.checkInRawId || row.checkOutRawId || row.id;
              const rawRow = attendanceRows.find((item) => String(item.id) === String(rawId)) || null;
              if (!rawRow) return;
              openAttendanceModal('view', rawRow);
            }}
          >
            مشاهده
          </Button>
          <Button
            size="small"
            disabled={row.rawIds.length === 0}
            onClick={(event) => {
              event.stopPropagation();
              const rawId = row.checkInRawId || row.checkOutRawId || row.id;
              const rawRow = attendanceRows.find((item) => String(item.id) === String(rawId)) || null;
              if (!rawRow) return;
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
          requested: { label: 'درخواست شده', color: 'orange' },
          review: { label: 'بازبینی', color: 'gold' },
          approved: { label: 'تایید شده', color: 'green' },
          completed: { label: 'تکمیل شده', color: 'blue' },
          paid: { label: 'پرداخت شده', color: 'green' },
          settled: { label: 'تسویه شده', color: 'purple' },
          posted: { label: 'سند شده', color: 'cyan' },
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
      title: 'نوع حقوق',
      key: 'salaryType',
      render: (_: unknown, row: EmployeeSummaryRow) => <Tag color="gold">{getSalaryTypeLabelFa(row.profile.salary_type)}</Tag>,
    },
    {
      title: 'حقوق پایه',
      dataIndex: 'baseSalary',
      key: 'baseSalary',
      render: (_: number, row: EmployeeSummaryRow) => {
        const compensation = resolveSummaryPayrollBaseCompensation(row);
        return <span className="persian-number">{formatMoney(compensation.amount)}</span>;
      },
    },
    {
      title: 'حقوق ساعتی',
      key: 'hourlyRate',
      render: (_: unknown, row: EmployeeSummaryRow) => {
        const totals = payrollAttendanceTotalsByEmployeeId.get(String(row.profile.source_id || row.profile.id));
        return <span className="persian-number">{formatMoney(totals?.hourlyAmount || 0)}</span>;
      },
    },
    {
      title: 'اضافه‌کاری',
      key: 'attendanceOvertime',
      render: (_: unknown, row: EmployeeSummaryRow) => {
        const totals = payrollAttendanceTotalsByEmployeeId.get(String(row.profile.source_id || row.profile.id));
        return <span className="persian-number text-green-700">{formatMoney(totals?.overtimeAmount || 0)}</span>;
      },
    },
    {
      title: 'پاداش تعجیل',
      key: 'attendanceEarlyBonus',
      render: (_: unknown, row: EmployeeSummaryRow) => {
        const totals = payrollAttendanceTotalsByEmployeeId.get(String(row.profile.source_id || row.profile.id));
        return <span className="persian-number text-green-700">{formatMoney(totals?.earlyBonusAmount || 0)}</span>;
      },
    },
    {
      title: 'تاخیر / غیبت',
      key: 'attendanceDelayAbsence',
      render: (_: unknown, row: EmployeeSummaryRow) => {
        const totals = payrollAttendanceTotalsByEmployeeId.get(String(row.profile.source_id || row.profile.id));
        return <span className="persian-number text-red-700">{formatMoney(totals?.delayAbsenceAmount || 0)}</span>;
      },
    },
    {
      title: 'کارکرد',
      dataIndex: 'taskWageTotal',
      key: 'taskWageTotal',
      render: (val: number) => <span className="persian-number">{formatMoney(val)}</span>,
    },
    {
      title: 'عملکرد ثبت‌شده',
      key: 'activityLedger',
      render: (_: unknown, row: EmployeeSummaryRow) => {
        const totals = payrollLedgerTotalsByEmployeeId.get(String(row.profile.source_id || row.profile.id));
        return <span className="persian-number text-green-700">{formatMoney(totals?.activity || 0)}</span>;
      },
    },
    {
      title: 'پورسانت‌ها',
      key: 'commissionLedger',
      render: (_: unknown, row: EmployeeSummaryRow) => {
        const totals = payrollLedgerTotalsByEmployeeId.get(String(row.profile.source_id || row.profile.id));
        return <span className="persian-number text-green-700">{formatMoney(totals?.commission || 0)}</span>;
      },
    },
    {
      title: 'پاداش‌ها',
      key: 'bonusLedger',
      render: (_: unknown, row: EmployeeSummaryRow) => {
        const totals = payrollLedgerTotalsByEmployeeId.get(String(row.profile.source_id || row.profile.id));
        return <span className="persian-number text-green-700">{formatMoney(totals?.bonuses || 0)}</span>;
      },
    },
    {
      title: 'جریمه‌ها',
      key: 'penaltyLedger',
      render: (_: unknown, row: EmployeeSummaryRow) => {
        const totals = payrollLedgerTotalsByEmployeeId.get(String(row.profile.source_id || row.profile.id));
        return <span className="persian-number text-red-700">{formatMoney(totals?.penalties || 0)}</span>;
      },
    },
    {
      title: 'تحقق اهداف',
      key: 'goalLedger',
      render: (_: unknown, row: EmployeeSummaryRow) => {
        const totals = payrollLedgerTotalsByEmployeeId.get(String(row.profile.source_id || row.profile.id));
        return <span className="persian-number text-green-700">{formatMoney(totals?.goals || 0)}</span>;
      },
    },
    {
      title: 'وضعیت فیش',
      key: 'payrollStatus',
      render: (_: unknown, row: EmployeeSummaryRow) => {
        const slip = payrollSlipByEmployeeId.get(String(row.profile.source_id || row.profile.id));
        return slip ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>{slip.name || 'فیش صادر شده'}</Tag>
        ) : (
          <Tag color="default">بدون فیش</Tag>
        );
      },
    },
    {
      title: 'خالص پیشنهادی',
      key: 'netPayable',
      render: (_: unknown, row: EmployeeSummaryRow) => {
        const compensation = resolveSummaryPayrollBaseCompensation(row);
        const baseNetPayable = compensation.amount
          + row.taskWageTotal
          + row.activityWageTotal
          + row.bonusTotal
          - row.penaltyTotal;
        const totals = payrollLedgerTotalsByEmployeeId.get(String(row.profile.source_id || row.profile.id));
        const insurance = row.profile.insurance_subject === false
          ? 0
          : (baseNetPayable * toNumber(row.profile.employee_insurance_rate)) / 100;
        return <span className="persian-number font-bold">{formatMoney(baseNetPayable + (totals?.proposedNet || 0) - insurance)}</span>;
      },
    },
    {
      title: 'عملیات',
      key: 'actions',
      fixed: 'right' as const,
      render: (_: unknown, row: EmployeeSummaryRow) => {
        const employeeIdValue = String(row.profile.source_id || row.profile.id);
        const slip = payrollSlipByEmployeeId.get(employeeIdValue);
        return (
          <Space size="small" wrap>
            {slip ? (
              <>
                <Button size="small" icon={<EyeOutlined />} onClick={() => openPayrollWizard(employeeIdValue)}>
                  مشاهده فیش پیشرفته
                </Button>
                <Button size="small" onClick={() => navigate(`/payroll_slips/${slip.id}`)}>
                  مشاهده فیش ثبت شده
                </Button>
              </>
            ) : (
              <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => openPayrollWizard(employeeIdValue)}>
                ایجاد فیش پیشرفته
              </Button>
            )}
            {!slip ? (
              <Button size="small" onClick={() => openPayrollConfigModal(row.profile)}>
                تنظیمات حقوق
              </Button>
            ) : null}
          </Space>
        );
      },
    },
  ];

  const commissionBasisLabel: Record<CommissionBasis, string> = {
    approved_invoices: 'تاییدشده و سطح بالاتر',
    settled_invoices: 'فاکتور تسویه‌شده',
    full_settlement_only: 'تسویه کامل',
    prepaid_and_settled_invoices: 'بر اساس مبلغ دریافتی',
    prepaid_and_collected_cheques: 'پیش‌پرداخت و چک وصول‌شده',
    settled_and_collected_cheques: 'تسویه و چک وصول‌شده',
  };
  const commissionDecisionOptions: Array<{ label: string; value: CommissionDecisionStatus }> = [
    { label: 'خودکار', value: 'auto' },
    { label: 'لحاظ شود', value: 'include' },
    { label: 'لحاظ نشود', value: 'exclude' },
    { label: 'انتقال به ماه بعد', value: 'defer_to_next_period' },
  ];
  const renderProfileName = (id: string | null | undefined) => {
    if (!id) return '-';
    return profileByRelatedId.get(String(id))?.full_name || profileById.get(String(id))?.full_name || String(id);
  };
  const invoiceStatusOptions = (((MODULES.invoices?.fields || []).find((field: any) => field?.key === 'status') as any)?.options || []) as Array<{ label: string; value: string; color?: string }>;
  const renderInvoiceStatusTag = (status: string | null | undefined) => {
    const normalized = String(status || '').trim();
    if (!normalized) return <Tag>-</Tag>;
    const option = invoiceStatusOptions.find((item) => String(item.value) === normalized);
    return <Tag color={option?.color || 'default'}>{option?.label || normalized}</Tag>;
  };

  const commissionInvoiceColumns = [
    {
      title: 'بازاریاب',
      key: 'employeeName',
      render: (_: unknown, row: any) => (
        <span className="font-bold text-leather-700">
          {profiles.find((profile) => String(profile.source_id || '') === String(row.employee_id))?.full_name || row.employee_id}
        </span>
      ),
    },
    {
      title: 'فاکتور',
      dataIndex: 'invoice_name',
      key: 'invoice_name',
      render: (val: string, row: any) => {
        const hasCheque = (commissionInvoicePaymentsById.get(String(row.invoice_id || '')) || []).some((p: any) => String(p?.payment_type || '').toLowerCase() === 'cheque');
        return (
          <div className="flex flex-wrap items-center gap-1">
            <a href={`/invoices/${row.invoice_id}`} className="text-leather-700 hover:underline">{val}</a>
            {hasCheque && <Tag color="orange" className="text-xs">چک</Tag>}
          </div>
        );
      },
    },
    {
      title: 'وضعیت فاکتور',
      dataIndex: 'invoice_status',
      key: 'invoice_status',
      render: (val: string | null) => renderInvoiceStatusTag(val),
    },
    {
      title: 'جمع نهایی فاکتور',
      dataIndex: 'invoice_total_amount',
      key: 'invoice_total_amount',
      render: (val: number) => <span className="persian-number">{formatMoney(val)}</span>,
    },
    {
      title: 'جمع دریافتی',
      dataIndex: 'invoice_received_amount',
      key: 'invoice_received_amount',
      render: (val: number) => <span className="persian-number">{formatMoney(val)}</span>,
    },
    {
      title: 'سهم بازاریاب',
      key: 'marketerShare',
      render: (_: unknown, row: any) => (
        <div className="text-sm">
          <div className="text-xs text-gray-500">{toPersianNumber(row.item_count)} قلم</div>
          <div className="persian-number font-bold text-green-700">{formatMoney(row.selected_amount)}</div>
        </div>
      ),
    },
    {
      title: 'قبلاً ثبت‌شده',
      dataIndex: 'posted_amount',
      key: 'posted_amount',
      render: (val: number) => <span className="persian-number">{formatMoney(val)}</span>,
    },
    {
      title: 'مانده',
      dataIndex: 'remaining_amount',
      key: 'remaining_amount',
      render: (val: number) => <span className="persian-number">{formatMoney(val)}</span>,
    },
    {
      title: 'منشأ',
      key: 'origin',
      render: (_: unknown, row: any) => (
        <Space size="small" wrap>
          <Tag color={row.is_from_previous_period ? 'orange' : 'blue'}>
            {row.is_from_previous_period ? 'مانده ماه‌های قبل' : 'احرازشده این دوره'}
          </Tag>
          {row.eligibility_event_type ? <Tag>{row.eligibility_event_type}</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'رویداد احراز',
      dataIndex: 'eligibility_event_at',
      key: 'eligibility_event_at',
      render: (val: string | null) => val ? toPersianNumber(safeJalaliFormat(val, 'YYYY/MM/DD')) : '-',
    },
    {
      title: 'عملیات',
      key: 'actions',
      render: (_: unknown, row: any) => (
        <Space size="small" wrap>
          <Button size="small" onClick={() => applyCommissionDecisionToRow(resolveCommissionReviewRowKey(row), 'include')}>لحاظ</Button>
          <Button size="small" onClick={() => applyCommissionDecisionToRow(resolveCommissionReviewRowKey(row), 'defer_to_next_period')}>انتقال</Button>
          <Button size="small" danger onClick={() => applyCommissionDecisionToRow(resolveCommissionReviewRowKey(row), 'exclude')}>عدم لحاظ</Button>
          <Button size="small" onClick={() => applyCommissionDecisionToRow(resolveCommissionReviewRowKey(row), 'auto')}>خودکار</Button>
        </Space>
      ),
    },
  ];

  const calculatedCommissionColumns = [
    {
      title: 'بازاریاب',
      dataIndex: 'employee_name',
      key: 'employee_name',
      render: (val: string) => <span className="font-bold text-leather-700">{val}</span>,
    },
    {
      title: 'محاسبه',
      dataIndex: 'title',
      key: 'title',
      render: (val: string | null, row: CommissionLedgerRow) => (
        <div>
          <div className="font-bold text-gray-800 dark:text-gray-100">{val || 'محاسبه پورسانت'}</div>
          <div className="mt-1 text-xs text-gray-500">
            {toPersianNumber(safeJalaliFormat(row.period_start, 'YYYY/MM/DD'))} تا {toPersianNumber(safeJalaliFormat(row.period_end, 'YYYY/MM/DD'))}
          </div>
        </div>
      ),
    },
    {
      title: 'مبنا',
      key: 'basis',
      render: (_: unknown, row: CommissionLedgerRow) => {
        const basis = row.details?.basis as CommissionBasis | undefined;
        return <Tag>{basis ? commissionBasisLabel[basis] || basis : '-'}</Tag>;
      },
    },
    {
      title: 'درصد',
      key: 'percent_mode',
      render: (_: unknown, row: CommissionLedgerRow) => {
        const percentMode = row.details?.percent_mode as CommissionPercentMode | undefined;
        const label = COMMISSION_PERCENT_MODE_OPTIONS.find((item) => item.value === percentMode)?.label || percentMode || '-';
        return <Tag color="purple">{label}</Tag>;
      },
    },
    {
      title: 'جمع مبنا',
      key: 'base_amount',
      render: (_: unknown, row: CommissionLedgerRow) => <span className="persian-number">{formatMoney(toNumber(row.details?.base_amount))}</span>,
    },
    {
      title: 'فاکتور / ردیف',
      key: 'counts',
      render: (_: unknown, row: CommissionLedgerRow) => (
        <span className="persian-number text-xs text-gray-600">
          {toPersianNumber(toNumber(row.details?.invoice_count))} / {toPersianNumber(toNumber(row.details?.item_count))}
        </span>
      ),
    },
    {
      title: 'پورسانت',
      dataIndex: 'amount',
      key: 'amount',
      render: (val: number) => <span className="persian-number font-bold text-green-700">{formatMoney(val)}</span>,
    },
    {
      title: 'وضعیت',
      dataIndex: 'status',
      key: 'status',
      render: (val: string | null) => {
        const meta = commissionLedgerStatusMeta[String(val || '')] || { color: 'default', label: val || '-' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: 'مسئول',
      dataIndex: 'assignee_id',
      key: 'assignee_id',
      render: (val: string | null) => renderProfileName(val),
    },
    {
      title: 'تاریخ ایجاد',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val: string | null) => renderDateTime(val),
    },
    {
      title: 'ایجاد کننده',
      dataIndex: 'created_by',
      key: 'created_by',
      render: (val: string | null) => renderProfileName(val),
    },
    {
      title: 'آخرین ویرایش',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (val: string | null) => renderDateTime(val),
    },
    {
      title: 'آخرین ویرایشگر',
      dataIndex: 'updated_by',
      key: 'updated_by',
      render: (val: string | null) => renderProfileName(val),
    },
    {
      title: 'عملیات',
      key: 'actions',
      fixed: 'left' as const,
      render: (_: unknown, row: CommissionLedgerRow) => {
        const status = String(row.status || '');
        return (
          <Space size="small" wrap>
            <Button size="small" icon={<EditOutlined />} onClick={() => handleEditCommissionDraft(row)}>
              {status === 'draft' ? 'ویرایش' : 'بازبینی'}
            </Button>
            <Button
              size="small"
              danger
              loading={commissionModalSaving}
              onClick={() => handleDeleteCommissionCalculation(row)}
            >
              حذف
            </Button>
          </Space>
        );
      },
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
          <Tag color="gold">{getSalaryTypeLabelFa(selectedEmployeeSummary.profile.salary_type)}</Tag>
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
        <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-[auto_minmax(420px,1fr)_auto_auto]'}`}>
          <Button
            icon={<ArrowRightOutlined />}
            onClick={() => navigate(`/hr?${selectedRangeQuery}`)}
            className="w-full md:w-auto rounded-xl"
          >
            بازگشت
          </Button>
          {renderHrPeriodControls(1400)}
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
            onClick={() => openConfigModal(selectedEmployeeSummary.profile)}
            className="w-full rounded-xl"
          >
            ضرایب فعالیت‌ها
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
              scroll={{ x: 1450 }}
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
          <Card><div className="text-xs text-gray-500 mb-1">کل رکوردهای تردد</div><div className="text-2xl font-black">{toPersianNumber(attendanceTopStats.total)}</div></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><div className="text-xs text-gray-500 mb-1">ورودها</div><div className="text-2xl font-black text-green-700">{toPersianNumber(attendanceTopStats.checkIns)}</div></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><div className="text-xs text-gray-500 mb-1">خروج‌ها</div><div className="text-2xl font-black text-red-700">{toPersianNumber(attendanceTopStats.checkOuts)}</div></Card>
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
        <Col xs={24} md={6}>
          <Card>
            <div className="text-xs text-gray-500 mb-2">مرخصی تاییدشده</div>
            <div className="text-sm font-black text-cyan-700">
              مرخصی ساعتی: {formatMinutesLabel(attendanceApprovedLeaveStats.hourlyMinutes)}
            </div>
            <div className="text-sm font-black text-blue-700 mt-1">
              مرخصی روزانه: {toPersianNumber(attendanceApprovedLeaveStats.dailyDays)} روز
            </div>
          </Card>
        </Col>
      </Row>
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <Button onClick={() => navigate('/attendance_logs')}>مشاهده ترددها</Button>
          <Button onClick={() => navigate('/work_schedules')}>برنامه حضور</Button>
          <Button type="primary" onClick={() => openAttendanceModal('create')}>ثبت رکورد تردد</Button>
        </div>
        {incompleteAttendanceRows.length > 0 ? (
          <div className="mb-4">
            <Button
              size="small"
              danger
              type="dashed"
              icon={<ClockCircleOutlined />}
              onClick={() => setIncompleteAttendanceModalOpen(true)}
            >
              {toPersianNumber(incompleteAttendanceRows.length)} تردد ناقص ثبت شده است
            </Button>
          </div>
        ) : null}
        {attendanceComputedRows.length === 0 ? (
          <Empty description="رکورد ترددی برای این بازه یافت نشد." />
        ) : (
          <Table
            rowKey="key"
            columns={attendanceColumns}
            dataSource={attendanceComputedRows}
            loading={supportDataLoading}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 1600 }}
            onRow={(row: AttendanceComputedRow) => ({
              onClick: () => {
                const rawId = row.checkInRawId || row.checkOutRawId || row.id;
                const rawRow = attendanceRows.find((item) => String(item.id) === String(rawId)) || null;
                if (!rawRow) return;
                openAttendanceModal('view', rawRow);
              },
              style: { cursor: row.rawIds.length > 0 ? 'pointer' : 'default' },
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
            loading={supportDataLoading}
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
        <Col xs={24} md={12} xl={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">مرخصی‌ها</div>
            <div className="text-lg font-black">{toPersianNumber(visibleRequestStats.leaveTotal)}</div>
            <div className="text-xs text-orange-600 mt-1">در انتظار: {toPersianNumber(visibleRequestStats.leavePending)}</div>
          </Card>
        </Col>
        <Col xs={24} md={12} xl={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">اضافه‌کاری‌ها</div>
            <div className="text-lg font-black">{toPersianNumber(visibleRequestStats.overtimeTotal)}</div>
            <div className="text-xs text-orange-600 mt-1">در انتظار: {toPersianNumber(visibleRequestStats.overtimePending)}</div>
          </Card>
        </Col>
        <Col xs={24} md={12} xl={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">ماموریت‌ها</div>
            <div className="text-lg font-black">{toPersianNumber(visibleRequestStats.missionTotal)}</div>
            <div className="text-xs text-orange-600 mt-1">در انتظار: {toPersianNumber(visibleRequestStats.missionPending)}</div>
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
            loading={supportDataLoading}
            pagination={{ pageSize: 15, showSizeChanger: false }}
            scroll={{ x: 1200 }}
          />
        )}
      </Card>
    </>
  );

  const compensationTabContent = (
    <>
      <Row gutter={[12, 12]} className="mb-4">
        <Col xs={24} md={12}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">پاداش‌ها</div>
            <div className="text-lg font-black">{toPersianNumber(visibleCompensationStats.bonusTotal)}</div>
            <div className="text-xs text-orange-600 mt-1">در انتظار: {toPersianNumber(visibleCompensationStats.bonusPending)}</div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">جریمه‌ها</div>
            <div className="text-lg font-black">{toPersianNumber(visibleCompensationStats.penaltyTotal)}</div>
            <div className="text-xs text-orange-600 mt-1">در انتظار: {toPersianNumber(visibleCompensationStats.penaltyPending)}</div>
          </Card>
        </Col>
      </Row>
      <Card>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button onClick={() => navigate('/employee_bonus_requests')}>پاداش‌ها</Button>
          <Button onClick={() => navigate('/employee_penalty_requests')}>جریمه‌ها</Button>
        </div>
        {visibleCompensationRows.length === 0 ? (
          <Empty description="آیتم پاداش یا جریمه‌ای برای این بازه یافت نشد." />
        ) : (
          <Table
            rowKey="key"
            columns={requestColumns}
            dataSource={visibleCompensationRows}
            loading={supportDataLoading}
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
            <div className="text-xs text-gray-500 mb-1">اهداف فعال</div>
            <div className="text-2xl font-black">{toPersianNumber(goalFulfillmentTotals.totalGoals)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">اعضای منتسب</div>
            <div className="text-2xl font-black">{toPersianNumber(goalFulfillmentTotals.assignedMembers)}</div>
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
        <GoalProgressSlider
          moduleId={null}
          placement="dashboard"
          autoPlay={false}
          showPlaybackControls={false}
          subjectUserIds={goalSubjectUserFilter}
          onActiveCardChange={handleHrActiveGoalCardChange}
          periodOverride={goalPeriodOverride}
        />
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
        ) : !activeGoalCard ? (
          <Empty description="برای نیروهای انتخاب‌شده هنوز عضو منتسبی داخل هدف‌ها پیدا نشد." />
        ) : (
          <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-black text-gray-800 dark:text-gray-100">{activeGoalCard.goalName}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                  <Tag>{activeGoalCard.moduleLabel}</Tag>
                  <span>{activeGoalCard.periodLabel}</span>
                  <span>جمع پاداش: <span className="persian-number font-bold text-green-700">{formatMoney(activeGoalCard.rewardTotal)}</span></span>
                </div>
              </div>
              <Button
                type="primary"
                loading={savingGoalLedger}
                disabled={!activeGoalCard.rows.some((row) => row.rewardEntries.length > 0 && row.payrollStatus !== 'included_in_payroll')}
                onClick={() => handleSaveGoalRewardRows(activeGoalCard.rows)}
              >
                افزودن کارت به فیش حقوقی
              </Button>
            </div>
            <div className="space-y-3">
              {activeGoalCard.rows.map((row) => {
                const mainPercent = row.targetValue > 0 ? Math.min(100, (row.achievedValue / row.targetValue) * 100) : 0;
                const subBase = row.subTargetValue || row.targetValue;
                const subPercent = subBase > 0 ? Math.min(100, (row.subAchievedValue / subBase) * 100) : 0;
                const isIncluded = row.payrollStatus === 'included_in_payroll';
                const isProposed = row.payrollStatus === 'proposed';
                return (
                  <div key={row.key} className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold text-leather-700">{row.employeeName}</div>
                      <Space size="small" wrap>
                        <Tag color={row.activeLevelLabel === 'در حال پیشروی' ? 'blue' : 'gold'}>{row.activeLevelLabel}</Tag>
                        {isIncluded ? (
                          <Tag color="green" icon={<CheckCircleOutlined />}>
                            ثبت شده در فیش {row.payrollSlipName || ''}
                          </Tag>
                        ) : isProposed ? (
                          <Tag color="cyan">آماده فیش حقوقی</Tag>
                        ) : (
                          <Tag>ثبت نشده</Tag>
                        )}
                        {row.payrollSlipId ? (
                          <Button size="small" onClick={() => navigate(`/payroll_slips/${row.payrollSlipId}`)}>مشاهده فیش</Button>
                        ) : (
                          <Button
                            size="small"
                            disabled={!row.rewardEntries.length || isIncluded || isProposed}
                            loading={savingGoalLedger}
                            onClick={() => handleSaveGoalRewardRows([row])}
                          >
                            افزودن به فیش
                          </Button>
                        )}
                      </Space>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <div className="mb-1 text-xs text-gray-500">پیشرفت اصلی ({row.metricLabel})</div>
                        <Progress percent={Number(mainPercent.toFixed(1))} />
                        <div className="persian-number text-xs text-gray-500">
                          {toPersianNumber(row.achievedValue)} از {toPersianNumber(row.targetValue)}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-gray-500">پیشرفت فرعی - {row.subPeriodLabel}</div>
                        <Progress percent={Number(subPercent.toFixed(1))} strokeColor="#16a34a" />
                        <div className="persian-number text-xs text-gray-500">
                          {toPersianNumber(row.subAchievedValue)} از {toPersianNumber(subBase)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                      <span>
                        {row.rewardEntries.length
                          ? row.rewardEntries.map((entry) => `${entry.title}: ${formatMoney(toNumber(entry.amount))}`).join(' | ')
                          : 'فرمول پاداش تعریف نشده'}
                      </span>
                      <span className={`persian-number font-black ${row.rewardSuggestion < 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {formatMoney(row.rewardSuggestion)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
        <Col xs={24} md={8} lg={4}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">پورسانت بر مبنای تایید</div>
            <div className="text-2xl font-black">{formatMoney(commissionTotals.approved)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8} lg={4}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">پورسانت بر مبنای تسویه</div>
            <div className="text-2xl font-black">{formatMoney(commissionTotals.settled)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8} lg={4}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">تسویه کامل</div>
            <div className="text-2xl font-black">{formatMoney(commissionTotals.fullSettlement)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8} lg={4}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">دریافتی واقعی معتبر</div>
            <div className="text-2xl font-black">{formatMoney(commissionTotals.prepaid)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8} lg={4}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">پیش‌پرداخت و چک وصول‌شده</div>
            <div className="text-2xl font-black">{formatMoney(commissionTotals.prepaidCollectedCheque)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8} lg={4}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">مبنای وصول چک</div>
            <div className="text-2xl font-black">{formatMoney(commissionTotals.collectedCheque)}</div>
          </Card>
        </Col>
      </Row>
      <Card>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button type="primary" onClick={openCommissionModal}>محاسبه پورسانت</Button>
          <Button onClick={() => navigate('/invoices')}>فاکتورهای فروش</Button>
          <Button onClick={() => navigate('/products')}>درصد پورسانت محصولات</Button>
          <Button onClick={fetchCalculatedCommissionRows} loading={calculatedCommissionLoading}>بروزرسانی</Button>
        </div>
        {calculatedCommissionLoading ? (
          <div className="py-10 flex items-center justify-center"><Spin /></div>
        ) : calculatedCommissionRows.length === 0 ? (
          <Empty description="برای این بازه پورسانت ثبت‌شده‌ای وجود ندارد." />
        ) : (
          <Table
            rowKey="id"
            columns={calculatedCommissionColumns}
            dataSource={calculatedCommissionRows}
            pagination={{ pageSize: 15, showSizeChanger: false }}
            scroll={{ x: 1200 }}
            expandable={{
              expandedRowRender: (ledgerRow: CommissionLedgerRow) => {
                const invoiceRows: any[] = Array.isArray(ledgerRow.details?.rows) ? ledgerRow.details.rows : [];
                if (invoiceRows.length === 0) return <div className="py-3 text-gray-400 text-sm text-center">جزئیات فاکتوری ثبت نشده است.</div>;
                return (
                  <div className="space-y-4 p-2">
                    {invoiceRows.map((invRow: any, idx: number) => {
                      const cheques: any[] = Array.isArray(invRow.cheque_payments) ? invRow.cheque_payments : [];
                      const hasCheque = invRow.has_cheque || cheques.length > 0;
                      const lines: any[] = Array.isArray(invRow.lines) ? invRow.lines : [];
                      return (
                        <div key={invRow.invoice_id || idx} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                          <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 flex flex-wrap items-center gap-2">
                            <a href={`/invoices/${invRow.invoice_id}`} className="font-bold text-leather-700 hover:underline text-sm">
                              {invRow.invoice_name || invRow.invoice_id || `فاکتور ${toPersianNumber(idx + 1)}`}
                            </a>
                            {invRow.invoice_status && renderInvoiceStatusTag(invRow.invoice_status)}
                            {hasCheque && <Tag color="orange" className="text-xs">دارای چک</Tag>}
                            <span className="mr-auto persian-number text-xs text-gray-500">
                              سهم: <span className="font-bold text-green-700">{formatMoney(toNumber(invRow.selected_amount))}</span>
                            </span>
                          </div>
                          {lines.length > 0 && (
                            <Table
                              rowKey={(line: any, lineIdx?: number) => line.source_key || line.item_key || String(lineIdx ?? 0)}
                              size="small"
                              pagination={false}
                              dataSource={lines}
                              className="commission-detail-lines"
                              columns={[
                                { title: 'کالا/خدمات', dataIndex: 'product_label', key: 'product_label', render: (val: string) => <span className="text-sm">{val || '-'}</span> },
                                { title: 'تعداد', dataIndex: 'quantity', key: 'quantity', render: (val: number) => <span className="persian-number">{toPersianNumber(val)}</span> },
                                { title: 'مبلغ ردیف', dataIndex: 'net_amount', key: 'net_amount', render: (val: number) => <span className="persian-number">{formatMoney(val)}</span> },
                                { title: 'درصد پورسانت', dataIndex: 'commission_percent', key: 'commission_percent', render: (val: number) => <span className="persian-number">{toPersianNumber(val)}٪</span> },
                                { title: 'مبلغ پورسانت', dataIndex: 'commission_amount', key: 'commission_amount', render: (val: number) => <span className="persian-number font-bold text-green-700">{formatMoney(val)}</span> },
                                { title: 'تصمیم', dataIndex: 'decision_status', key: 'decision_status', render: (val: string) => {
                                  const opt = commissionDecisionOptions.find((o) => o.value === val);
                                  return opt ? <Tag>{opt.label}</Tag> : <Tag>{val || 'خودکار'}</Tag>;
                                }},
                              ]}
                            />
                          )}
                          {hasCheque && cheques.length > 0 && (
                            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-orange-50 dark:bg-orange-900/10">
                              <div className="text-xs font-bold text-orange-700 mb-2">اطلاعات چک‌های فاکتور</div>
                              <div className="flex flex-wrap gap-3">
                                {cheques.map((cheque: any, ci: number) => (
                                  <div key={ci} className="bg-white dark:bg-gray-900 border border-orange-200 dark:border-orange-700 rounded-md px-3 py-2 text-xs space-y-1 min-w-[180px]">
                                    {cheque.cheque_number && <div><span className="text-gray-500">شماره چک: </span><span className="persian-number font-bold">{toPersianNumber(cheque.cheque_number)}</span></div>}
                                    {cheque.bank_name && <div><span className="text-gray-500">بانک: </span><span>{cheque.bank_name}</span></div>}
                                    <div><span className="text-gray-500">مبلغ: </span><span className="persian-number font-bold text-green-700">{formatMoney(toNumber(cheque.amount))}</span></div>
                                    {cheque.due_date && <div><span className="text-gray-500">سررسید: </span><span className="persian-number">{toPersianNumber(safeJalaliFormat(cheque.due_date, 'YYYY/MM/DD'))}</span></div>}
                                    {cheque.cheque_status && <div><span className="text-gray-500">وضعیت: </span><Tag color={cheque.cheque_status === 'cleared' ? 'green' : cheque.cheque_status === 'bounced' ? 'red' : 'blue'} className="text-xs">{cheque.cheque_status}</Tag></div>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              },
              rowExpandable: (ledgerRow: CommissionLedgerRow) => Array.isArray(ledgerRow.details?.rows) && (ledgerRow.details?.rows as any[]).length > 0,
            }}
          />
        )}
      </Card>
    </>
  );

  const advanceStatusMeta: Record<string, { label: string; color: string }> = {
    requested: { label: 'درخواست شده', color: 'orange' },
    approved: { label: 'تایید شده', color: 'blue' },
    paid: { label: 'پرداخت شده', color: 'green' },
    posted: { label: 'سند شده', color: 'cyan' },
    settled: { label: 'تسویه شده', color: 'purple' },
    completed: { label: 'تکمیل شده', color: 'green' },
  };
  const payrollSettleableAdvanceRows = employeeAdvanceRows.filter((row) => (
    !row.related_payroll_slip_id
    && PAYROLL_ADVANCE_SETTLEMENT_STATUSES.has(String(row.status || '').trim())
    && row.paid_amount > 0
  ));
  const advancesTabContent = (
    <>
      <Row gutter={[12, 12]} className="mb-4">
        <Col xs={24} md={8}>
          <Card>
                <div className="text-xs text-gray-500 mb-1">مساعده‌های قابل تسویه با فیش</div>
            <div className="text-2xl font-black">{toPersianNumber(payrollSettleableAdvanceRows.length)}</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">جمع پرداخت‌شده از محل مساعده</div>
            <div className="text-2xl font-black text-blue-700">
              {formatMoney(payrollSettleableAdvanceRows.reduce((sum, row) => sum + row.paid_amount, 0))}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <div className="text-xs text-gray-500 mb-1">مساعده‌های متصل به فیش</div>
            <div className="text-2xl font-black">{toPersianNumber(employeeAdvanceRows.filter((row) => row.related_payroll_slip_id).length)}</div>
          </Card>
        </Col>
      </Row>
      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button type="primary" onClick={() => navigate('/employee_advances')}>مشاهده ماژول مساعده‌ها</Button>
          <Button onClick={fetchEmployeeAdvancesForDashboard} loading={employeeAdvancesLoading}>بروزرسانی</Button>
        </div>
        {employeeAdvancesLoading ? (
          <div className="py-10 flex items-center justify-center"><Spin /></div>
        ) : employeeAdvanceRows.length === 0 ? (
          <Empty description="مساعده‌ای برای نیروهای انتخاب‌شده یافت نشد." />
        ) : (
          <Table
            rowKey="id"
            dataSource={employeeAdvanceRows}
            pagination={{ pageSize: 15, showSizeChanger: false }}
            scroll={{ x: 1100 }}
            columns={[
              {
                title: 'کارمند',
                key: 'employee',
                render: (_: unknown, row: EmployeeAdvanceDashboardRow) =>
                  profiles.find((profile) => String(profile.source_id || profile.id) === String(row.employee_id || ''))?.full_name || '-',
              },
              {
                title: 'مساعده',
                key: 'advance',
                render: (_: unknown, row: EmployeeAdvanceDashboardRow) => (
                  <button type="button" className="text-leather-700 font-bold hover:underline" onClick={() => navigate(`/employee_advances/${row.id}`)}>
                    {row.system_code || row.name || 'مساعده'}
                  </button>
                ),
              },
              { title: 'تاریخ درخواست', dataIndex: 'request_date', key: 'request_date', render: (val: string | null) => val ? toPersianNumber(safeJalaliFormat(val, 'YYYY/MM/DD')) : '-' },
              { title: 'مبلغ', dataIndex: 'amount', key: 'amount', render: (val: number) => <span className="persian-number">{formatMoney(val)}</span> },
              { title: 'پرداخت شده', dataIndex: 'paid_amount', key: 'paid_amount', render: (val: number) => <span className="persian-number">{formatMoney(val)}</span> },
              {
                title: 'وضعیت',
                dataIndex: 'status',
                key: 'status',
                render: (val: string | null) => {
                  const meta = advanceStatusMeta[String(val || '')] || { label: val || '-', color: 'default' };
                  return <Tag color={meta.color}>{meta.label}</Tag>;
                },
              },
              {
                title: 'وضعیت فیش',
                key: 'payroll',
                render: (_: unknown, row: EmployeeAdvanceDashboardRow) => {
                  const slip = row.related_payroll_slip_id ? payrollSlipById.get(String(row.related_payroll_slip_id)) : null;
                  if (slip) return <Button size="small" onClick={() => navigate(`/payroll_slips/${slip.id}`)}>{slip.name || 'مشاهده فیش'}</Button>;
                  const settleable = PAYROLL_ADVANCE_SETTLEMENT_STATUSES.has(String(row.status || '').trim()) && row.paid_amount > 0;
                  return <Tag color={settleable ? 'blue' : 'default'}>{settleable ? 'آماده ثبت در پرداخت‌های فیش' : 'در انتظار پرداخت'}</Tag>;
                },
              },
              { title: 'توضیحات', dataIndex: 'reason', key: 'reason', render: (val: string | null) => val || '-' },
            ]}
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
          <Button onClick={refreshPayrollPeriodState} loading={payrollStatusLoading}>بروزرسانی وضعیت فیش‌ها</Button>
        </div>
        {visibleSummaries.length === 0 ? (
          <Empty description="داده‌ای برای محاسبه حقوق در این بازه یافت نشد." />
        ) : (
          <Table
            rowKey="key"
            columns={payrollColumns}
            dataSource={visibleSummaries}
            pagination={{ pageSize: 15, showSizeChanger: false }}
            scroll={{ x: 1500 }}
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
                    <div className="text-2xl font-black">{formatMoney((() => {
                      const compensation = resolveSummaryPayrollBaseCompensation(selectedEmployeeSummary);
                      return compensation.amount
                        + selectedEmployeeSummary.taskWageTotal
                        + selectedEmployeeSummary.activityWageTotal
                        + selectedEmployeeSummary.bonusTotal
                        - selectedEmployeeSummary.penaltyTotal;
                    })())}</div>
                  </Card>
                </Col>
              </Row>

              <Card>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-gray-500">
                    جمع محاسبه عملکرد قابل ثبت:{' '}
                    <span className="font-black text-green-700 persian-number">
                      {formatMoney(selectedEmployeeSummary.activityPerformanceTotal)}
                    </span>
                  </div>
                  <Button
                    type="primary"
                    onClick={handleSaveActivityPerformanceEntries}
                    loading={savingActivityPerformance}
                    disabled={!selectedEmployeeSummary.activityPerformanceEntries.length}
                  >
                    ثبت محاسبه عملکرد
                  </Button>
                </div>
                {selectedEmployeeSummary.detailRows.length === 0 ? (
                  <Empty description="برای این نیرو در این بازه موردی یافت نشد." />
                ) : (
                  isMobile ? (
                    <div>{selectedEmployeeSummary.detailRows.map(renderTaskMobileCard)}</div>
                  ) : (
                    <div className="space-y-4">
                      {selectedActivityGroups.map((group) => {
                        const metricLabelByKey = new Map(
                          group.entries.map((entry) => [String(entry.metric_key || 'amount'), entry.metric_label || entry.metric_key || 'مقدار']),
                        );
                        const baseDetailColumnCount = detailColumns.length;
                        const groupColumns = [
                          ...detailColumns,
                          ...group.metricKeys.map((metricKey) => ({
                            title: metricLabelByKey.get(metricKey) || metricKey,
                            key: `metric_${metricKey}`,
                            render: (_: unknown, row: any) => (
                              <div className="text-xs leading-6">
                                <div className="persian-number">{toPersianNumber((row.metricValues?.[metricKey] || 0).toFixed(2))}</div>
                                <div className="persian-number font-bold text-green-700">{formatMoney(row.metricAmounts?.[metricKey] || 0)}</div>
                              </div>
                            ),
                          })),
                          ...(group.entries.length > 0 ? [{
                            title: 'جمع گروه',
                            key: 'groupAmount',
                            render: (_: unknown, row: any) => <span className="persian-number font-bold">{formatMoney(row.groupAmount || 0)}</span>,
                          }] : []),
                        ];
                        return (
                          <div key={group.key} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="font-bold text-gray-800 dark:text-gray-100">{group.title}</div>
                              {group.entries.length > 0 ? (
                                <Tag color={group.totalAmount < 0 ? 'red' : 'green'}>{formatMoney(group.totalAmount)}</Tag>
                              ) : null}
                            </div>
                            <Table
                              rowKey="key"
                              columns={groupColumns as any}
                              dataSource={group.rows}
                              pagination={{ pageSize: 30, showSizeChanger: false }}
                              scroll={{ x: 1700 + (group.metricKeys.length * 180) }}
                              summary={() => group.entries.length > 0 ? (
                                <Table.Summary fixed>
                                  <Table.Summary.Row>
                                    <Table.Summary.Cell index={0} colSpan={baseDetailColumnCount}>جمع</Table.Summary.Cell>
                                    {group.metricKeys.map((metricKey, index) => (
                                      <Table.Summary.Cell key={metricKey} index={index + baseDetailColumnCount}>
                                        <div className="text-xs leading-6">
                                          <div className="persian-number">
                                            {toPersianNumber((group.rows as any[]).reduce((sum: number, row: any) => sum + toNumber(row.metricValues?.[metricKey]), 0).toFixed(2))}
                                          </div>
                                          <div className="persian-number font-bold text-green-700">
                                            {formatMoney((group.rows as any[]).reduce((sum: number, row: any) => sum + toNumber(row.metricAmounts?.[metricKey]), 0))}
                                          </div>
                                        </div>
                                      </Table.Summary.Cell>
                                    ))}
                                    <Table.Summary.Cell index={baseDetailColumnCount + group.metricKeys.length}>
                                      <span className="persian-number font-bold">{formatMoney(group.totalAmount)}</span>
                                    </Table.Summary.Cell>
                                  </Table.Summary.Row>
                                </Table.Summary>
                              ) : null}
                            />
                          </div>
                        );
                      })}
                    </div>
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
              <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-[minmax(420px,1fr)_minmax(260px,1fr)_auto_auto]'}`}>
                {renderHrPeriodControls(1400)}
                <AdaptiveSelectField
                  mode="multiple"
                  allowClear
                  placeholder="فیلتر نیرو"
                  value={selectedEmployeeIds}
                  onChange={(values) => {
                    const ids = values as string[];
                    setSelectedEmployeeIds(ids);
                    persistHrEmployees(ids);
                  }}
                  options={employeeOptions}
                  className="w-full min-w-0"
                  getPopupContainer={resolveSelectPopupContainer}
                  modalContainer={resolveSelectPopupContainer}
                  maxTagCount="responsive"
                />
                <Button
                  icon={<CloseOutlined />}
                  onClick={() => {
                    setSelectedEmployeeIds([]);
                    persistHrEmployees([]);
                  }}
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
              { key: 'compensation', label: 'پاداش / جریمه', children: compensationTabContent },
              { key: 'goals', label: 'تحقق اهداف', children: goalFulfillmentTabContent },
              { key: 'commissions', label: 'پورسانت‌ها', children: commissionsTabContent },
              { key: 'advances', label: 'مساعده‌ها', children: advancesTabContent },
              { key: 'payroll', label: 'فیش حقوقی', children: payrollTabContent },
            ]}
          />
        </>
      )}

      <Modal
        title={payrollWizardSummary ? `ویزارد فیش حقوقی - ${payrollWizardSummary.name}` : 'ویزارد فیش حقوقی'}
        open={payrollWizardOpen}
        onCancel={closePayrollWizard}
        footer={null}
        width={1080}
        destroyOnHidden
      >
        {payrollWizardSummary ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-gray-800 dark:text-gray-100">{payrollWizardSummary.name}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    بازه {toPersianNumber(safeJalaliFormat(monthStart.toISOString(), 'YYYY/MM/DD'))} تا {toPersianNumber(safeJalaliFormat(monthEnd.toISOString(), 'YYYY/MM/DD'))}
                  </div>
                </div>
                <Space size="small" wrap>
                  {payrollSlipByEmployeeId.get(String(payrollWizardSummary.profile.source_id || payrollWizardSummary.profile.id)) ? (
                    <Tag color="green">
                      فیش موجود: {payrollSlipByEmployeeId.get(String(payrollWizardSummary.profile.source_id || payrollWizardSummary.profile.id))?.name || 'پیش‌نویس'}
                    </Tag>
                  ) : (
                    <Tag color="blue">فیش هنوز ایجاد نشده</Tag>
                  )}
                  <Tag color="gold">خالص پیشنهادی: {formatMoney(payrollWizardFinalNet)}</Tag>
                </Space>
              </div>
            </div>

            <Steps
              current={payrollWizardStep}
              items={[
                { title: 'تردد و حقوق پایه' },
                { title: 'آیتم‌های حقوقی' },
                { title: 'تحقق اهداف' },
                { title: 'بازبینی نهایی' },
              ]}
            />

            {payrollWizardStep === 0 ? (
              <div className="space-y-4">
                <Row gutter={[12, 12]}>
                  <Col xs={24} md={6}><Card><div className="text-xs text-gray-500 mb-1">حضور موثر</div><div className="persian-number text-2xl font-black">{toPersianNumber((calculatePresenceMinutes(payrollWizardAttendanceRows) / 60).toFixed(1))} ساعت</div></Card></Col>
                  <Col xs={24} md={6}><Card><div className="text-xs text-gray-500 mb-1">ساعات موظف</div><div className="persian-number text-2xl font-black">{toPersianNumber((payrollWizardRequiredMinutes / 60).toFixed(1))} ساعت</div></Card></Col>
                  <Col xs={24} md={6}><Card><div className="text-xs text-gray-500 mb-1">نرخ ساعتی</div><div className="persian-number text-2xl font-black">{formatMoney(payrollWizardHourlyRate)}</div></Card></Col>
                  <Col xs={24} md={6}>
                    <Card>
                      <div className="text-xs text-gray-500 mb-1">{payrollWizardBaseCompensation.isHourly ? 'دستمزد ساعتی محاسبه‌شده' : 'حقوق پایه (ثابت)'}</div>
                      <div className={`persian-number text-2xl font-black ${payrollWizardBaseCompensation.isHourly ? 'text-blue-700' : ''}`}>{formatMoney(payrollWizardBaseCompensation.amount)}</div>
                    </Card>
                  </Col>
                </Row>
                <Row gutter={[12, 12]}>
                  <Col xs={24} md={6}><Card><div className="text-xs text-gray-500 mb-1">اضافه‌کاری آماده فیش</div><div className="persian-number text-2xl font-black text-green-700">{formatMoney(payrollLedgerTotalsByEmployeeId.get(String(payrollWizardSummary.profile.source_id || payrollWizardSummary.profile.id))?.attendanceOvertime || 0)}</div></Card></Col>
                  <Col xs={24} md={6}><Card><div className="text-xs text-gray-500 mb-1">پاداش تعجیل آماده فیش</div><div className="persian-number text-2xl font-black text-green-700">{formatMoney(payrollLedgerTotalsByEmployeeId.get(String(payrollWizardSummary.profile.source_id || payrollWizardSummary.profile.id))?.attendanceEarlyBonus || 0)}</div></Card></Col>
                  <Col xs={24} md={6}><Card><div className="text-xs text-gray-500 mb-1">تاخیر / غیبت آماده فیش</div><div className="persian-number text-2xl font-black text-red-700">{formatMoney(payrollLedgerTotalsByEmployeeId.get(String(payrollWizardSummary.profile.source_id || payrollWizardSummary.profile.id))?.attendanceDelayAbsence || 0)}</div></Card></Col>
                  <Col xs={24} md={6}><Card><div className="text-xs text-gray-500 mb-1">مرخصی با حقوق آماده فیش</div><div className="persian-number text-2xl font-black text-cyan-700">{formatMoney(payrollLedgerTotalsByEmployeeId.get(String(payrollWizardSummary.profile.source_id || payrollWizardSummary.profile.id))?.attendancePaidLeave || 0)}</div></Card></Col>
                  <Col xs={24} md={6}><Card><div className="text-xs text-gray-500 mb-1">سقف مرخصی با حقوق</div><div className="persian-number text-2xl font-black">{toPersianNumber(toNumber(payrollWizardSummary.profile?.monthly_paid_leave_hours))} ساعت/ماه</div></Card></Col>
                  {payrollWizardSummary.profile?.seniority_mode === 'labor_law' ? (
                    <Col xs={24} md={6}>
                      <Card>
                        <div className="text-xs text-gray-500 mb-1">پایه سنوات (قانون کار)</div>
                        <div className="persian-number text-2xl font-black text-emerald-700">{formatMoney(payrollWizardSeniorityAmount)}</div>
                        <div className="text-xs text-gray-400 mt-1">{toPersianNumber(payrollWizardSeniorityYears)} سال سابقه</div>
                        <div className="mt-3">
                          <label className="mb-1 block text-xs text-gray-500">سنوات این ماه</label>
                          <Input readOnly value={formatMoney(payrollWizardSeniorityAmount)} className="persian-number" />
                        </div>
                        <Button
                          className="mt-2 w-full"
                          size="small"
                          type="primary"
                          loading={calculatingPayrollWizardSeniority}
                          onClick={() => void handleCalculatePayrollWizardSeniority()}
                        >
                          محاسبه سنوات این ماه
                        </Button>
                      </Card>
                    </Col>
                  ) : null}
                </Row>

                <Card>
                  <div className="mb-3 text-sm font-bold text-gray-700 dark:text-gray-200">تنظیمات حقوق و تردد</div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                    {visiblePayrollConfigFields.map((field: any) => renderPayrollWizardConfigField(field))}
                  </div>
                </Card>

                <Card>
                  <div className="mb-3 text-sm font-bold text-gray-700 dark:text-gray-200">لاگ تردد و اضافه‌کاری</div>
                  {payrollWizardAttendanceRows.length === 0 ? (
                    <Empty description="برای این بازه رکورد ترددی وجود ندارد." />
                  ) : (
                    <Table
                      rowKey="key"
                      size="small"
                      pagination={{ pageSize: 8, showSizeChanger: false }}
                      scroll={{ x: 1200 }}
                      dataSource={payrollWizardAttendanceRows}
                      columns={[
                        { title: 'تاریخ', key: 'attendanceDate', render: (_: unknown, row: any) => row.attendanceDate ? toPersianNumber(safeJalaliFormat(row.attendanceDate, 'YYYY/MM/DD')) : '-' },
                        { title: 'ورود', dataIndex: 'checkInAt', key: 'checkInAt', render: (val: string | null) => <span className="persian-number">{renderAttendanceTime(val)}</span> },
                        { title: 'خروج', dataIndex: 'checkOutAt', key: 'checkOutAt', render: (val: string | null) => <span className="persian-number">{renderAttendanceTime(val)}</span> },
                        { title: 'حضور', key: 'presence', render: (_: unknown, row: any) => { const pm = calculatePresenceMinutes([row]); return <span className="persian-number">{toPersianNumber((pm / 60).toFixed(1))} ساعت</span>; } },
                        { title: 'تاخیر (دقیقه)', key: 'late', render: (_: unknown, row: any) => { const grace = toNumber(payrollWizardSummary?.profile?.grace_minutes_for_late); const effective = Math.max(0, row.lateMinutes - grace); return <span className={`persian-number ${effective > 0 ? 'text-red-700 font-bold' : 'text-gray-500'}`}>{toPersianNumber(row.lateMinutes)}{grace > 0 ? ` (مجاز: ${toPersianNumber(grace)})` : ''}</span>; } },
                        { title: 'مرخصی تاییدشده (دقیقه)', key: 'approved_leave', render: (_: unknown, row: any) => <span className="persian-number text-cyan-700">{toPersianNumber(row.approvedLeaveMinutes || 0)}</span> },
                        { title: 'تعجیل (دقیقه)', key: 'early', render: (_: unknown, row: any) => <span className="persian-number text-green-700">{toPersianNumber(row.earlyArrivalMinutes)}</span> },
                        { title: 'اضافه‌کاری (دقیقه)', key: 'overtime', render: (_: unknown, row: any) => <span className="persian-number">{toPersianNumber(calculateAttendanceOvertimeMinutes(row))}</span> },
                        { title: 'پاداش تعجیل قابل لحاظ', key: 'early_bonus_amount', render: (_: unknown, row: any) => { const meta = resolveAttendanceLedgerEntry(row, 'attendance_early_bonus'); return meta.minutes > 0 ? <span className="persian-number text-green-700">{formatMoney(meta.amount)}</span> : '-'; } },
                        { title: 'تاخیر / غیبت قابل لحاظ', key: 'delay_absence_amount', render: (_: unknown, row: any) => { const meta = resolveAttendanceLedgerEntry(row, 'attendance_delay_absence'); return meta.minutes > 0 ? <span className="persian-number text-red-700">{formatMoney(Math.abs(meta.amount))}</span> : '-'; } },
                        { title: 'مرخصی با حقوق قابل لحاظ', key: 'paid_leave_amount', render: (_: unknown, row: any) => { const meta = resolveAttendanceLedgerEntry(row, 'attendance_paid_leave'); return meta.minutes > 0 ? <span className="persian-number text-cyan-700">{formatMoney(meta.amount)}</span> : '-'; } },
                        {
                          title: 'وضعیت فیش',
                          key: 'ledger',
                          render: (_: unknown, row: any) => {
                            const entries = [
                              { label: 'اضافه‌کاری', sourceType: 'attendance_overtime', sourceKey: buildAttendanceOvertimeSourceKey(row) },
                              { label: 'تعجیل', sourceType: 'attendance_early_bonus', sourceKey: buildAttendanceEarlyBonusSourceKey(row) },
                              { label: 'تاخیر/غیبت', sourceType: 'attendance_delay_absence', sourceKey: buildAttendanceDelayAbsenceSourceKey(row) },
                              { label: 'مرخصی', sourceType: 'attendance_paid_leave', sourceKey: buildAttendancePaidLeaveSourceKey(row) },
                            ].map((item) => {
                              const entry = payrollWizardEmployeeLedger.find((ledger) => ledger.source_type === item.sourceType && String(ledger.source_key || ledger.details?.source_key || '') === item.sourceKey);
                              if (!entry) return null;
                              return (
                                <Tag key={item.sourceType} color={entry.status === 'included_in_payroll' ? 'green' : 'cyan'}>
                                  {item.label}: {entry.status === 'included_in_payroll' ? 'در فیش' : 'آماده'}
                                </Tag>
                              );
                            }).filter(Boolean);
                            return entries.length ? <Space size={[0, 4]} wrap>{entries}</Space> : <Tag>ثبت نشده</Tag>;
                          },
                        },
                        {
                          title: 'عملیات',
                          key: 'actions',
                          render: (_: unknown, row: any) => {
                            const overtimeEntry = payrollWizardEmployeeLedger.find((ledger) => ledger.source_type === 'attendance_overtime' && String(ledger.source_key || ledger.details?.source_key || '') === buildAttendanceOvertimeSourceKey(row));
                            const earlyBonusEntry = payrollWizardEmployeeLedger.find((ledger) => ledger.source_type === 'attendance_early_bonus' && String(ledger.source_key || ledger.details?.source_key || '') === buildAttendanceEarlyBonusSourceKey(row));
                            const delayEntry = payrollWizardEmployeeLedger.find((ledger) => ledger.source_type === 'attendance_delay_absence' && String(ledger.source_key || ledger.details?.source_key || '') === buildAttendanceDelayAbsenceSourceKey(row));
                            const leaveEntry = payrollWizardEmployeeLedger.find((ledger) => ledger.source_type === 'attendance_paid_leave' && String(ledger.source_key || ledger.details?.source_key || '') === buildAttendancePaidLeaveSourceKey(row));
                            const overtimeMeta = resolveAttendanceLedgerEntry(row, 'attendance_overtime');
                            const earlyBonusMeta = resolveAttendanceLedgerEntry(row, 'attendance_early_bonus');
                            const delayMeta = resolveAttendanceLedgerEntry(row, 'attendance_delay_absence');
                            const leaveMeta = resolveAttendanceLedgerEntry(row, 'attendance_paid_leave');
                            return (
                              <Space size="small" wrap>
                                {overtimeMeta.minutes > 0 && !overtimeEntry ? (
                                  <Button size="small" loading={savingOvertimeLedgerKey === overtimeMeta.sourceKey} onClick={() => handleApproveAttendanceOvertime(row)}>
                                    لحاظ اضافه‌کاری
                                  </Button>
                                ) : null}
                                {earlyBonusMeta.minutes > 0 && !earlyBonusEntry ? (
                                  <Button size="small" loading={savingOvertimeLedgerKey === earlyBonusMeta.sourceKey} onClick={() => handlePrepareAttendanceLedgerEntry(row, 'attendance_early_bonus')}>
                                    لحاظ پاداش تعجیل
                                  </Button>
                                ) : null}
                                {delayMeta.minutes > 0 && !delayEntry ? (
                                  <Button size="small" danger loading={savingOvertimeLedgerKey === delayMeta.sourceKey} onClick={() => handlePrepareAttendanceLedgerEntry(row, 'attendance_delay_absence')}>
                                    لحاظ مرخصی بدون حقوق
                                  </Button>
                                ) : null}
                                {leaveMeta.minutes > 0 && !leaveEntry ? (
                                  <Button size="small" loading={savingOvertimeLedgerKey === leaveMeta.sourceKey} onClick={() => handlePrepareAttendanceLedgerEntry(row, 'attendance_paid_leave')}>
                                    لحاظ مرخصی
                                  </Button>
                                ) : null}
                                {overtimeEntry && overtimeEntry.status !== 'included_in_payroll' ? <Button size="small" loading={savingOvertimeLedgerKey === overtimeEntry.id} onClick={() => handleVoidAttendanceLedgerEntry(overtimeEntry.id)}>عدم لحاظ اضافه‌کاری</Button> : null}
                                {earlyBonusEntry && earlyBonusEntry.status !== 'included_in_payroll' ? <Button size="small" loading={savingOvertimeLedgerKey === earlyBonusEntry.id} onClick={() => handleVoidAttendanceLedgerEntry(earlyBonusEntry.id)}>عدم لحاظ تعجیل</Button> : null}
                                {delayEntry && delayEntry.status !== 'included_in_payroll' ? <Button size="small" loading={savingOvertimeLedgerKey === delayEntry.id} onClick={() => handleVoidAttendanceLedgerEntry(delayEntry.id)}>عدم لحاظ تاخیر/غیبت</Button> : null}
                                {leaveEntry && leaveEntry.status !== 'included_in_payroll' ? <Button size="small" loading={savingOvertimeLedgerKey === leaveEntry.id} onClick={() => handleVoidAttendanceLedgerEntry(leaveEntry.id)}>عدم لحاظ مرخصی</Button> : null}
                              </Space>
                            );
                          },
                        },
                      ]}
                    />
                  )}
                </Card>
              </div>
            ) : null}

            {payrollWizardStep === 1 ? (
              <div className="space-y-4">
                <Row gutter={[12, 12]}>
                  <Col xs={24} md={8}><Card><div className="text-xs text-gray-500 mb-1">عملکرد آماده فیش</div><div className="persian-number text-2xl font-black text-green-700">{formatMoney(payrollLedgerTotalsByEmployeeId.get(String(payrollWizardSummary.profile.source_id || payrollWizardSummary.profile.id))?.activity || 0)}</div></Card></Col>
                  <Col xs={24} md={8}><Card><div className="text-xs text-gray-500 mb-1">پورسانت آماده فیش</div><div className="persian-number text-2xl font-black text-green-700">{formatMoney(payrollLedgerTotalsByEmployeeId.get(String(payrollWizardSummary.profile.source_id || payrollWizardSummary.profile.id))?.commission || 0)}</div></Card></Col>
                  <Col xs={24} md={8}><Card><div className="text-xs text-gray-500 mb-1">ثبت‌شده در فیش‌های قبلی</div><div className="persian-number text-2xl font-black">{formatMoney(payrollWizardIncludedLedger.reduce((sum, entry) => sum + toNumber(entry.amount), 0))}</div></Card></Col>
                  <Col xs={24} md={12}><Card><div className="text-xs text-gray-500 mb-1">پاداش آماده فیش</div><div className="persian-number text-2xl font-black text-green-700">{formatMoney(payrollLedgerTotalsByEmployeeId.get(String(payrollWizardSummary.profile.source_id || payrollWizardSummary.profile.id))?.bonuses || 0)}</div></Card></Col>
                  <Col xs={24} md={12}><Card><div className="text-xs text-gray-500 mb-1">جریمه آماده فیش</div><div className="persian-number text-2xl font-black text-red-700">{formatMoney(payrollLedgerTotalsByEmployeeId.get(String(payrollWizardSummary.profile.source_id || payrollWizardSummary.profile.id))?.penalties || 0)}</div></Card></Col>
                </Row>
                <Card>
                  <div className="mb-3 text-sm font-bold text-gray-700 dark:text-gray-200">ردیف‌های آماده فیش برای آیتم‌های حقوقی</div>
                  {payrollWizardEmployeeLedger.filter((entry) => ['activity_performance', 'commission', 'employee_bonus', 'employee_penalty'].includes(String(entry.source_type || ''))).length === 0 ? (
                    <Empty description="ردیفی برای این مرحله وجود ندارد." />
                  ) : (
                    <Table
                      rowKey="id"
                      size="small"
                      pagination={false}
                      dataSource={payrollWizardEmployeeLedger.filter((entry) => ['activity_performance', 'commission', 'employee_bonus', 'employee_penalty'].includes(String(entry.source_type || '')))}
                      columns={[
                        { title: 'عنوان', dataIndex: 'title', key: 'title', render: (val: string | null) => val || '-' },
                        { title: 'منبع', dataIndex: 'source_type', key: 'source_type', render: (val: string | null) => <Tag>{PAYROLL_LEDGER_SOURCE_LABELS[String(val || '')] || 'نامشخص'}</Tag> },
                        { title: 'مبلغ', dataIndex: 'amount', key: 'amount', render: (val: number) => <span className="persian-number font-bold">{formatMoney(val)}</span> },
                        {
                          title: 'وضعیت',
                          dataIndex: 'status',
                          key: 'status',
                          render: (val: string | null) => {
                            const meta = commissionLedgerStatusMeta[String(val || '')] || { color: 'default', label: val || '-' };
                            return <Tag color={meta.color}>{meta.label}</Tag>;
                          },
                        },
                      ]}
                    />
                  )}
                </Card>
              </div>
            ) : null}

            {payrollWizardStep === 2 ? (
              <Card>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-bold text-gray-700 dark:text-gray-200">تحقق اهداف این کارمند</div>
                  <Button
                    disabled={!payrollWizardGoalRows.some((row) => row.rewardEntries.length > 0 && row.payrollStatus !== 'included_in_payroll' && row.payrollStatus !== 'proposed')}
                    loading={savingGoalLedger}
                    onClick={() => handleSaveGoalRewardRows(payrollWizardGoalRows)}
                  >
                    افزودن همه به فیش
                  </Button>
                </div>
                {goalTouchLoading ? (
                  <div className="flex justify-center py-8"><Spin /></div>
                ) : payrollWizardGoalRows.length === 0 ? (
                  <Empty description="هدف فعالی برای این بازه لمس نشده است." />
                ) : (
                  <div className="space-y-3">
                    {payrollWizardGoalRows.map((row) => (
                      <div key={row.key} className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-bold text-gray-800 dark:text-gray-100">{row.goalName}</div>
                            <div className="text-xs text-gray-500">{row.periodLabel}</div>
                          </div>
                          <Space size="small" wrap>
                            <Tag>{row.activeLevelLabel}</Tag>
                            <Tag color={row.payrollStatus === 'included_in_payroll' ? 'green' : row.payrollStatus === 'proposed' ? 'cyan' : 'default'}>
                              {row.payrollStatus === 'included_in_payroll' ? 'در فیش' : row.payrollStatus === 'proposed' ? 'آماده فیش' : 'ثبت نشده'}
                            </Tag>
                            {row.payrollSlipId ? (
                              <Button size="small" onClick={() => navigate(`/payroll_slips/${row.payrollSlipId}`)}>مشاهده فیش</Button>
                            ) : (
                              <Button size="small" disabled={row.payrollStatus === 'included_in_payroll' || row.payrollStatus === 'proposed' || row.rewardEntries.length === 0} loading={savingGoalLedger} onClick={() => handleSaveGoalRewardRows([row])}>
                                افزودن به فیش
                              </Button>
                            )}
                          </Space>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <div className="text-xs text-gray-500">پیشرفت اصلی</div>
                            <Progress percent={row.targetValue > 0 ? Number(Math.min(100, ((row.achievedValue / row.targetValue) * 100)).toFixed(1)) : 0} />
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">پیشرفت فرعی</div>
                            <Progress percent={(row.subTargetValue || row.targetValue) > 0 ? Number(Math.min(100, ((row.subAchievedValue / (row.subTargetValue || row.targetValue)) * 100)).toFixed(1)) : 0} strokeColor="#16a34a" />
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                          <span>{row.rewardEntries.map((entry) => entry.title).join(' | ') || 'بدون فرمول'}</span>
                          <span className="persian-number font-black">{formatMoney(row.rewardSuggestion)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ) : null}

            {payrollWizardStep === 3 ? (
              <div className="space-y-4">
                {payrollWizardPreparing ? (
                  <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-100">
                    <Spin size="small" /> اقلام فیش در حال بررسی و آماده‌سازی هستند.
                  </div>
                ) : null}
                <Row gutter={[12, 12]}>
                  <Col xs={24} md={6}><Card><div className="text-xs text-gray-500 mb-1">{payrollWizardBaseCompensation.displayTitle}</div><div className="persian-number text-2xl font-black">{formatMoney(payrollWizardBaseCompensation.amount)}</div></Card></Col>
                  <Col xs={24} md={6}><Card><div className="text-xs text-gray-500 mb-1">کارکرد فعالیت‌ها</div><div className="persian-number text-2xl font-black">{formatMoney(payrollWizardSummary.taskWageTotal)}</div></Card></Col>
                  <Col xs={24} md={6}><Card><div className="text-xs text-gray-500 mb-1">ردیف‌های حقوق و مزایا</div><div className="persian-number text-2xl font-black">{formatMoney(payrollWizardLedgerNet)}</div></Card></Col>
                  <Col xs={24} md={6}><Card><div className="text-xs text-gray-500 mb-1">پرداخت‌شده با مساعده</div><div className="persian-number text-2xl font-black text-blue-700">{formatMoney(payrollWizardAdvanceSettlementTotal)}</div></Card></Col>
                  <Col xs={24} md={6}><Card><div className="text-xs text-gray-500 mb-1">بیمه سهم کارمند</div><div className="persian-number text-2xl font-black text-red-700">{formatMoney(payrollWizardInsurance.employee)}</div></Card></Col>
                  {payrollWizardSummary.profile?.seniority_mode === 'labor_law' ? <Col xs={24} md={6}><Card><div className="text-xs text-gray-500 mb-1">سنوات این ماه</div><div className="persian-number text-2xl font-black text-emerald-700">{formatMoney(payrollWizardSeniorityAmount)}</div></Card></Col> : null}
                </Row>
                <Card>
                  <div className="mb-3 text-sm font-bold text-gray-700 dark:text-gray-200">اقلامی که در فیش پیش‌نویس قرار می‌گیرند</div>
                  <Table
                    rowKey="key"
                    size="small"
                    pagination={false}
                    dataSource={payrollWizardPreviewLines
                      .map((line, index) => ({
                        key: `${line.title}:${index}`,
                        title: line.title,
                        description: line.description,
                        amount: line.line_type === 'deduction' ? -Math.abs(line.amount) : Math.abs(line.amount),
                        type: line.line_type,
                      }))
                      .filter((item) => item.amount !== 0)}
                    columns={[
                      { title: 'شرح', dataIndex: 'title', key: 'title' },
                      { title: 'نوع', dataIndex: 'type', key: 'type', render: (val: string) => <Tag color={val === 'deduction' ? 'red' : 'green'}>{val === 'deduction' ? 'کسورات' : 'مزایا'}</Tag> },
                      { title: 'مبلغ', dataIndex: 'amount', key: 'amount', render: (val: number) => <span className={`persian-number font-bold ${val < 0 ? 'text-red-700' : 'text-green-700'}`}>{formatMoney(val)}</span> },
                      { title: 'توضیحات', dataIndex: 'description', key: 'description', render: (val: string) => val || '-' },
                    ]}
                  />
                </Card>
                {payrollWizardDraft.payments.length > 0 ? (
                  <Card>
                    <div className="mb-1 text-sm font-bold text-gray-700 dark:text-gray-200">پرداخت‌های ثبت‌شده در فیش</div>
                    <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">مساعده‌های پرداخت‌شده در این بخش فقط به پرداخت فیش مرتبط می‌شوند و از جمع کسورات کم نمی‌شوند.</div>
                    <Table
                      rowKey="row_key"
                      size="small"
                      pagination={false}
                      dataSource={payrollWizardDraft.payments}
                      columns={[
                        { title: 'نوع پرداخت', key: 'type', render: () => <Tag color="blue">مساعده مرتبط</Tag> },
                        { title: 'مبلغ پرداخت‌شده', dataIndex: 'amount', key: 'amount', render: (value: number) => <span className="persian-number font-bold text-blue-700">{formatMoney(value)}</span> },
                        { title: 'توضیحات', dataIndex: 'description', key: 'description', render: (value: string) => value || '-' },
                      ]}
                    />
                  </Card>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <Button onClick={closePayrollWizard}>انصراف</Button>
              <Space>
                {payrollWizardStep > 0 ? <Button onClick={() => setPayrollWizardStep((current) => Math.max(0, current - 1))}>مرحله قبل</Button> : null}
                {payrollWizardStep < 3 ? (
                  <Button type="primary" loading={payrollWizardPreparing} disabled={payrollWizardPreparing} onClick={() => setPayrollWizardStep((current) => Math.min(3, current + 1))}>مرحله بعد</Button>
                ) : (
                  <Button type="primary" loading={creatingPayrollSlip || payrollWizardPreparing} disabled={payrollWizardPreparing} onClick={handleCreatePayrollSlipFromWizard}>ایجاد فیش پیش‌نویس</Button>
                )}
              </Space>
            </div>
          </div>
        ) : (
          <Empty description="کارمند معتبری برای ویزارد انتخاب نشده است." />
        )}
      </Modal>

      <Modal
        title="محاسبه پورسانت"
        open={commissionModalOpen}
        onCancel={() => setCommissionModalOpen(false)}
        footer={null}
        width={1200}
        destroyOnHidden
        zIndex={COMMISSION_MODAL_Z_INDEX}
      >
        <div className="space-y-4">
          <Form form={commissionForm} layout="vertical">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Form.Item
                name="period_range"
                label="بازه زمانی"
                className="md:col-span-2"
                rules={[
                  {
                    validator: async (_, value: PersianDateRangeValue | null) => {
                      const startDate = parseDateValue(value?.[0] || null);
                      const endDate = parseDateValue(value?.[1] || null);
                      if (!value?.[0] || !value?.[1] || !startDate?.isValid() || !endDate?.isValid()) {
                        throw new Error('بازه زمانی الزامی است');
                      }
                      if (startDate.startOf('day').valueOf() > endDate.startOf('day').valueOf()) {
                        throw new Error('بازه زمانی معتبر نیست');
                      }
                    },
                  },
                ]}
              >
                <PersianDateRangePicker
                  placeholder="بازه زمانی"
                  modalContainer={resolveSelectPopupContainer}
                  overlayZIndexBase={14000}
                  className="w-full"
                />
              </Form.Item>
              <Form.Item
                name="employee_profile_id"
                label="نام بازاریاب"
                rules={[{ required: true, message: 'انتخاب بازاریاب الزامی است' }]}
              >
                <AdaptiveSelectField
                  showSearch
                  optionFilterProp="label"
                  options={profiles
                    .filter((profile) => profile.source_table === 'employees' && profile.related_profile_id)
                    .map((profile) => ({ label: profile.full_name || profile.id, value: String(profile.id) }))}
                  placeholder="نام بازاریاب"
                  getPopupContainer={resolveSelectPopupContainer}
                  modalContainer={resolveSelectPopupContainer}
                  overlayZIndexBase={14000}
                />
              </Form.Item>
              <Form.Item
                name="basis"
                label="نوع محاسبه پورسانت"
                rules={[{ required: true, message: 'نوع محاسبه الزامی است' }]}
              >
                <AdaptiveSelectField
                  options={COMMISSION_BASIS_OPTIONS}
                  optionRender={(option) => {
                    const item = option?.data || option;
                    return (
                      <div className="py-1">
                        <div className="font-bold">{item?.label}</div>
                        <div className="mt-1 text-xs leading-5 text-gray-500">{item?.description}</div>
                      </div>
                    );
                  }}
                  renderMobileOption={(option) => (
                    <div className="py-1">
                      <div className="font-bold">{option.label}</div>
                      <div className="mt-1 text-xs leading-5 text-gray-500">{option.description}</div>
                    </div>
                  )}
                  getPopupContainer={resolveSelectPopupContainer}
                  modalContainer={resolveSelectPopupContainer}
                  overlayZIndexBase={14000}
                />
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(previous, current) => previous.basis !== current.basis}>
                {({ getFieldValue }) => {
                  const selectedBasis = getFieldValue('basis') as CommissionBasis | undefined;
                  const selectedOption = COMMISSION_BASIS_OPTIONS.find((item) => item.value === selectedBasis);
                  return selectedOption ? (
                    <div className="-mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                      {selectedOption.description}
                    </div>
                  ) : null;
                }}
              </Form.Item>
              <Form.Item
                name="percent_mode"
                label="درصد پورسانت"
                rules={[{ required: true, message: 'نوع درصد پورسانت الزامی است' }]}
              >
                <AdaptiveSelectField
                  options={COMMISSION_PERCENT_MODE_OPTIONS}
                  getPopupContainer={resolveSelectPopupContainer}
                  modalContainer={resolveSelectPopupContainer}
                  overlayZIndexBase={14000}
                />
              </Form.Item>
            </div>
          </Form>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                <div>
                  قابل ثبت:{' '}
                  <span className="font-black text-green-700 persian-number">{formatMoney(commissionDraftTotals.selected)}</span>
                </div>
                <div>
                  منتقل به ماه بعد:{' '}
                  <span className="font-black text-amber-600 persian-number">{formatMoney(commissionDraftTotals.deferred)}</span>
                </div>
                <div>
                  عدم لحاظ:{' '}
                  <span className="font-black text-red-700 persian-number">{formatMoney(commissionDraftTotals.excluded)}</span>
                </div>
              </div>
              <Space>
                <Button onClick={handleBuildCommissionPreview} loading={commissionLoading}>محاسبه</Button>
                <Button onClick={handleSaveCommissionDraft} loading={commissionModalSaving} disabled={commissionRows.length === 0}>
                  ذخیره پیش‌نویس
                </Button>
                <Button
                  type="primary"
                  onClick={handleSaveCommissionCalculation}
                  loading={commissionModalSaving}
                  disabled={commissionDraftTotals.selected <= 0}
                >
                  ثبت نهایی
                </Button>
              </Space>
            </div>
            {commissionLoading ? (
              <div className="py-10 flex items-center justify-center"><Spin /></div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Input
                    value={commissionSearch}
                    onChange={(event) => setCommissionSearch(event.target.value)}
                    allowClear
                    placeholder="جستجو در فاکتورها و اقلام..."
                    className="max-w-md"
                  />
                  <Button
                    icon={<PrinterOutlined />}
                    disabled={commissionPrintRows.length === 0}
                    onClick={() => commissionListPrintManager.setIsPrintModalOpen(true)}
                  >
                    پیش‌نمایش چاپ
                  </Button>
                </div>
              <Tabs
                activeKey={commissionReviewTab}
                onChange={(key) => setCommissionReviewTab(key as CommissionModalTab)}
                items={[
                  {
                    key: 'current_period',
                    label: `پورسانت‌های این ماه (${toPersianNumber(filteredCommissionRowsByBucket.current_period.length)})`,
                    children: (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <Button size="small" onClick={() => applyCommissionDecisionToBucket('current_period', 'include')}>لحاظ همه</Button>
                          <Button size="small" onClick={() => applyCommissionDecisionToBucket('current_period', 'defer_to_next_period')}>انتقال همه</Button>
                          <Button size="small" danger onClick={() => applyCommissionDecisionToBucket('current_period', 'exclude')}>عدم لحاظ همه</Button>
                          <Button size="small" onClick={() => applyCommissionDecisionToBucket('current_period', 'auto')}>بازگشت به خودکار</Button>
                        </div>
                        {filteredCommissionRowsByBucket.current_period.length === 0 ? (
                          <Empty description="ردیف احرازشده‌ای در این دوره باقی نمانده است." />
                        ) : (
                          <Table
                            rowKey="key"
                            columns={commissionInvoiceColumns}
                            dataSource={filteredCommissionRowsByBucket.current_period}
                            pagination={{ pageSize: 10, showSizeChanger: false }}
                            scroll={{ x: 1400 }}
                            expandable={{
                              expandedRowRender: (invoiceRow: any) => {
                                const invoiceCheques: any[] = (commissionInvoicePaymentsById.get(String(invoiceRow.invoice_id || '')) || []).filter((p: any) => String(p?.payment_type || '').toLowerCase() === 'cheque');
                                return (
                                  <div className="space-y-3">
                                    <Table
                                      rowKey="key"
                                      size="small"
                                      pagination={false}
                                      dataSource={invoiceRow.lines}
                                      columns={[
                                        { title: 'کالا/خدمات', dataIndex: 'product_label', key: 'product_label' },
                                        { title: 'تعداد', dataIndex: 'quantity', key: 'quantity', render: (val: number) => <span className="persian-number">{toPersianNumber(val)}</span> },
                                        { title: 'مبلغ نهایی ردیف', dataIndex: 'net_amount', key: 'net_amount', render: (val: number) => <span className="persian-number">{formatMoney(val)}</span> },
                                        { title: 'درصد', dataIndex: 'commission_percent', key: 'commission_percent', render: (val: number) => <span className="persian-number">{toPersianNumber(val)}%</span> },
                                        { title: 'احراز این دوره', dataIndex: 'entitled_amount', key: 'entitled_amount', render: (val: number) => <span className="persian-number">{formatMoney(val)}</span> },
                                        { title: 'قبلاً ثبت‌شده', dataIndex: 'posted_amount', key: 'posted_amount', render: (val: number) => <span className="persian-number">{formatMoney(val)}</span> },
                                        { title: 'قابل ثبت', dataIndex: 'selected_amount', key: 'selected_amount', render: (val: number) => <span className="persian-number font-bold text-green-700">{formatMoney(val)}</span> },
                                        {
                                          title: 'تصمیم',
                                          key: 'decision_status',
                                          render: (_: unknown, line: CommissionDraftLine) => (
                                            <AdaptiveSelectField
                                              value={line.decision_status}
                                              options={commissionDecisionOptions}
                                              onChange={(value) => applyCommissionDecisionToLine(resolveCommissionReviewRowKey(invoiceRow), line.key, value as CommissionDecisionStatus)}
                                              getPopupContainer={resolveSelectPopupContainer}
                                              modalContainer={resolveSelectPopupContainer}
                                              overlayZIndexBase={15000}
                                            />
                                          ),
                                        },
                                      ]}
                                    />
                                    {invoiceCheques.length > 0 && (
                                      <div className="px-3 py-2 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-700 rounded-lg">
                                        <div className="text-xs font-bold text-orange-700 mb-2">چک‌های فاکتور</div>
                                        <div className="flex flex-wrap gap-3">
                                          {invoiceCheques.map((cheque: any, ci: number) => (
                                            <div key={ci} className="bg-white dark:bg-gray-900 border border-orange-200 rounded-md px-3 py-2 text-xs space-y-1 min-w-[160px]">
                                              {cheque.cheque_number && <div><span className="text-gray-500">شماره: </span><span className="persian-number font-bold">{toPersianNumber(cheque.cheque_number)}</span></div>}
                                              {cheque.bank_name && <div><span className="text-gray-500">بانک: </span>{cheque.bank_name}</div>}
                                              <div><span className="text-gray-500">مبلغ: </span><span className="persian-number font-bold text-green-700">{formatMoney(toNumber(cheque.amount))}</span></div>
                                              {(cheque.due_date || cheque.maturity_date) && <div><span className="text-gray-500">سررسید: </span><span className="persian-number">{toPersianNumber(safeJalaliFormat(cheque.due_date || cheque.maturity_date, 'YYYY/MM/DD'))}</span></div>}
                                              {(cheque.cheque_status || cheque.status) && <div><span className="text-gray-500">وضعیت: </span><Tag color={(cheque.cheque_status || cheque.status) === 'cleared' ? 'green' : (cheque.cheque_status || cheque.status) === 'bounced' ? 'red' : 'blue'} className="text-xs">{cheque.cheque_status || cheque.status}</Tag></div>}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              },
                            }}
                          />
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'backlog',
                    label: `معوق / بازمانده (${toPersianNumber(filteredCommissionRowsByBucket.backlog.length)})`,
                    children: filteredCommissionRowsByBucket.backlog.length === 0 ? (
                      <Empty description="ردیف معوق یا منتقل‌شده‌ای وجود ندارد." />
                    ) : (
                      <Table
                        rowKey="key"
                        columns={commissionInvoiceColumns}
                        dataSource={filteredCommissionRowsByBucket.backlog}
                        pagination={{ pageSize: 10, showSizeChanger: false }}
                        scroll={{ x: 1400 }}
                        expandable={{
                          expandedRowRender: (invoiceRow: any) => {
                            const invoiceCheques: any[] = (commissionInvoicePaymentsById.get(String(invoiceRow.invoice_id || '')) || []).filter((p: any) => String(p?.payment_type || '').toLowerCase() === 'cheque');
                            return (
                              <div className="space-y-3">
                                <Table
                                  rowKey="key"
                                  size="small"
                                  pagination={false}
                                  dataSource={invoiceRow.lines}
                                  columns={[
                                    { title: 'قلم', dataIndex: 'product_label', key: 'product_label' },
                                    { title: 'دوره احراز', key: 'sourcePeriod', render: (_: unknown, line: CommissionDraftLine) => <span className="persian-number">{toPersianNumber(safeJalaliFormat(line.source_period_start, 'YYYY/MM/DD'))}</span> },
                                    { title: 'مانده', dataIndex: 'remaining_amount', key: 'remaining_amount', render: (val: number) => <span className="persian-number">{formatMoney(val)}</span> },
                                    { title: 'وضعیت', key: 'decision', render: (_: unknown, line: CommissionDraftLine) => <Tag color={line.decision_status === 'defer_to_next_period' ? 'orange' : 'blue'}>{line.decision_status === 'defer_to_next_period' ? 'منتقل‌شده' : 'آماده تصمیم'}</Tag> },
                                    {
                                      title: 'اقدام',
                                      key: 'action',
                                      render: (_: unknown, line: CommissionDraftLine) => (
                                        <AdaptiveSelectField
                                          value={line.decision_status}
                                          options={commissionDecisionOptions}
                                          onChange={(value) => applyCommissionDecisionToLine(resolveCommissionReviewRowKey(invoiceRow), line.key, value as CommissionDecisionStatus)}
                                          getPopupContainer={resolveSelectPopupContainer}
                                          modalContainer={resolveSelectPopupContainer}
                                          overlayZIndexBase={15000}
                                        />
                                      ),
                                    },
                                  ]}
                                />
                                {invoiceCheques.length > 0 && (
                                  <div className="px-3 py-2 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-700 rounded-lg">
                                    <div className="text-xs font-bold text-orange-700 mb-2">چک‌های فاکتور</div>
                                    <div className="flex flex-wrap gap-3">
                                      {invoiceCheques.map((cheque: any, ci: number) => (
                                        <div key={ci} className="bg-white dark:bg-gray-900 border border-orange-200 rounded-md px-3 py-2 text-xs space-y-1 min-w-[160px]">
                                          {cheque.cheque_number && <div><span className="text-gray-500">شماره: </span><span className="persian-number font-bold">{toPersianNumber(cheque.cheque_number)}</span></div>}
                                          {cheque.bank_name && <div><span className="text-gray-500">بانک: </span>{cheque.bank_name}</div>}
                                          <div><span className="text-gray-500">مبلغ: </span><span className="persian-number font-bold text-green-700">{formatMoney(toNumber(cheque.amount))}</span></div>
                                          {(cheque.due_date || cheque.maturity_date) && <div><span className="text-gray-500">سررسید: </span><span className="persian-number">{toPersianNumber(safeJalaliFormat(cheque.due_date || cheque.maturity_date, 'YYYY/MM/DD'))}</span></div>}
                                          {(cheque.cheque_status || cheque.status) && <div><span className="text-gray-500">وضعیت: </span><Tag color={(cheque.cheque_status || cheque.status) === 'cleared' ? 'green' : (cheque.cheque_status || cheque.status) === 'bounced' ? 'red' : 'blue'} className="text-xs">{cheque.cheque_status || cheque.status}</Tag></div>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          },
                        }}
                      />
                    ),
                  },
                  {
                    key: 'excluded',
                    label: `مستثنا / عدم‌لحاظ (${toPersianNumber(filteredCommissionRowsByBucket.excluded.length)})`,
                    children: filteredCommissionRowsByBucket.excluded.length === 0 ? (
                      <Empty description="ردیف مستثنا یا عدم‌لحاظی وجود ندارد." />
                    ) : (
                      <Table
                        rowKey="key"
                        columns={commissionInvoiceColumns}
                        dataSource={filteredCommissionRowsByBucket.excluded}
                        pagination={{ pageSize: 10, showSizeChanger: false }}
                        scroll={{ x: 1400 }}
                        expandable={{
                          expandedRowRender: (invoiceRow: any) => (
                            <Table
                              rowKey="key"
                              size="small"
                              pagination={false}
                              dataSource={invoiceRow.lines}
                              columns={[
                                { title: 'قلم', dataIndex: 'product_label', key: 'product_label' },
                                { title: 'مبلغ نهایی', dataIndex: 'net_amount', key: 'net_amount', render: (val: number) => <span className="persian-number">{formatMoney(val)}</span> },
                                { title: 'علت', key: 'reason', render: (_: unknown, line: CommissionDraftLine) => <span>{line.exclusion_reason || invoiceRow.exclusion_reason || '-'}</span> },
                                {
                                  title: 'اقدام',
                                  key: 'restore',
                                  render: (_: unknown, line: CommissionDraftLine) => (
                                    <Button size="small" onClick={() => applyCommissionDecisionToLine(resolveCommissionReviewRowKey(invoiceRow), line.key, 'include')}>
                                      لحاظ
                                    </Button>
                                  ),
                                },
                              ]}
                            />
                          ),
                        }}
                      />
                    ),
                  },
                  {
                    key: 'previous_calculations',
                    label: `پورسانت‌های محاسبه‌شدهٔ قبلی (${toPersianNumber(commissionHistoryRows.length)})`,
                    children: !selectedPreviousCommission ? (
                      <Empty description="برای این بازاریاب، محاسبهٔ ثبت‌شده‌ای پیش از این بازه وجود ندارد." />
                    ) : (() => {
                      const historyRows = (Array.isArray(selectedPreviousCommission.details?.rows)
                        ? selectedPreviousCommission.details.rows
                        : [])
                        .filter((row: any) => {
                          const query = commissionSearch.trim().toLowerCase();
                          if (!query) return true;
                          return [
                            row?.invoice_name,
                            row?.invoice_status,
                            row?.invoice_date,
                            ...(Array.isArray(row?.lines) ? row.lines.flatMap((line: any) => [line?.product_label, line?.product_id]) : []),
                          ].some((value) => String(value || '').toLowerCase().includes(query));
                        });
                      const statusMeta = commissionLedgerStatusMeta[String(selectedPreviousCommission.status || '')] || {
                        color: 'default',
                        label: selectedPreviousCommission.status || '-',
                      };
                      return (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/5">
                            <div className="min-w-0">
                              <div className="font-bold text-gray-800 dark:text-gray-100">{selectedPreviousCommission.title || 'محاسبه پورسانت'}</div>
                              <div className="mt-1 text-xs text-gray-500">
                                بازه: {toPersianNumber(safeJalaliFormat(selectedPreviousCommission.period_start, 'YYYY/MM/DD'))} تا {toPersianNumber(safeJalaliFormat(selectedPreviousCommission.period_end, 'YYYY/MM/DD'))}
                              </div>
                            </div>
                            <Space wrap>
                              <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                              <span className="font-black text-green-700 persian-number">{formatMoney(selectedPreviousCommission.amount)}</span>
                              <Button size="small" disabled={commissionHistoryIndex >= commissionHistoryRows.length - 1} onClick={() => setCommissionHistoryIndex((current) => current + 1)}>قبلی</Button>
                              <Button size="small" disabled={commissionHistoryIndex <= 0} onClick={() => setCommissionHistoryIndex((current) => current - 1)}>بعدی</Button>
                            </Space>
                          </div>
                          {historyRows.length === 0 ? (
                            <Empty description="جزئیات فاکتورهای این محاسبه ثبت نشده است." />
                          ) : (
                            <Table
                              rowKey={(row: any, index) => `${row?.invoice_id || 'invoice'}:${index}`}
                              columns={commissionInvoiceColumns}
                              dataSource={historyRows.map((row: any) => ({
                                ...row,
                                employee_id: selectedPreviousCommission.employee_id,
                              }))}
                              pagination={{ pageSize: 10, showSizeChanger: false }}
                              scroll={{ x: 1400 }}
                              expandable={{
                                expandedRowRender: (invoiceRow: any) => (
                                  <Table
                                    rowKey={(line: any, index) => line?.item_key || line?.source_key || index}
                                    size="small"
                                    pagination={false}
                                    dataSource={Array.isArray(invoiceRow?.lines) ? invoiceRow.lines : []}
                                    columns={[
                                      { title: 'قلم', dataIndex: 'product_label', key: 'product_label' },
                                      { title: 'مبلغ نهایی', dataIndex: 'net_amount', key: 'net_amount', render: (value: number) => <span className="persian-number">{formatMoney(toNumber(value))}</span> },
                                      { title: 'درصد', dataIndex: 'commission_percent', key: 'commission_percent', render: (value: number) => <span className="persian-number">{toPersianNumber(value)}٪</span> },
                                      { title: 'پورسانت ثبت‌شده', dataIndex: 'commission_amount', key: 'commission_amount', render: (value: number) => <span className="persian-number font-bold text-green-700">{formatMoney(toNumber(value))}</span> },
                                    ]}
                                  />
                                ),
                              }}
                            />
                          )}
                        </div>
                      );
                    })(),
                  },
                ]}
              />
              </>
            )}
          </Card>
        </div>
      </Modal>

      <PrintSection
        isPrintModalOpen={commissionListPrintManager.isPrintModalOpen}
        onClose={() => commissionListPrintManager.setIsPrintModalOpen(false)}
        onPreparePrint={commissionListPrintManager.preparePrint}
        onPrint={commissionListPrintManager.handlePrint}
        onGenerateFinalPdfPreview={generateCommissionFinalPdfPreview}
        previewContentVersion={commissionListPrintManager.printPreviewSourceVersion}
        printTemplates={commissionListPrintManager.printTemplates}
        selectedTemplateId={commissionListPrintManager.selectedTemplateId}
        onSelectTemplate={commissionListPrintManager.setSelectedTemplateId}
        canEditPrintTemplates={commissionListPrintManager.canEditPrintTemplates}
        onEditTemplate={(templateId) => openPrintTemplateEditor('commission_calculations', templateId)}
        renderPrintCard={commissionListPrintManager.renderPrintCard}
        printMode={commissionListPrintManager.printMode}
        printableFields={commissionListPrintManager.printableFieldsForTemplate}
        selectedPrintFields={commissionListPrintManager.selectedPrintFields}
        onTogglePrintField={commissionListPrintManager.handleTogglePrintField}
        onTogglePrintFieldGroup={commissionListPrintManager.handleTogglePrintFieldGroup}
        onMovePrintField={commissionListPrintManager.handleMovePrintField}
        imageDisplayMode={commissionListPrintManager.imageDisplayMode}
        onChangeImageDisplayMode={commissionListPrintManager.handleChangeImageDisplayMode}
        onSavePrintFields={commissionListPrintManager.handleSavePrintFields}
        savingPrintFields={commissionListPrintManager.savingPrintFields}
        printSignatureRows={commissionListPrintManager.printSignatureStates}
        printSignatureQuickAddOptions={commissionListPrintManager.printSignatureQuickAddOptions}
        signatureOptionsByRow={commissionListPrintManager.signatureOptionsByRow}
        onAddPrintSignatureRow={commissionListPrintManager.handleAddPrintSignatureRow}
        onRemovePrintSignatureRow={commissionListPrintManager.handleRemovePrintSignatureRow}
        onMovePrintSignatureRow={commissionListPrintManager.handleMovePrintSignatureRow}
        onTogglePrintSignatureEnabled={commissionListPrintManager.handleTogglePrintSignatureEnabled}
        onTogglePrintSignatureAutomatic={commissionListPrintManager.handleTogglePrintSignatureAutomatic}
        onChangePrintSignatureName={commissionListPrintManager.handleChangePrintSignatureName}
        onChangePrintSignatureSubtitle={commissionListPrintManager.handleChangePrintSignatureSubtitle}
        onChangePrintSignatureSignerModule={commissionListPrintManager.handleChangePrintSignatureSignerModule}
        onChangePrintSignatureSignerId={commissionListPrintManager.handleChangePrintSignatureSignerId}
        onSearchPrintSignatureOptions={commissionListPrintManager.loadSignatureSignerOptions}
        onRefreshPreview={() => { void commissionListPrintManager.refreshTemplates(); }}
        allowFieldSelectionTab={commissionListPrintManager.allowFieldSelectionTab}
        showImageDisplayModeControl={commissionListPrintManager.showImageDisplayModeControl}
        previewMeta={commissionListPrintManager.previewMeta}
        modalZIndex={COMMISSION_PRINT_MODAL_Z_INDEX}
      />

      <Modal
        title="ترددهای ناقص"
        open={incompleteAttendanceModalOpen}
        onCancel={() => setIncompleteAttendanceModalOpen(false)}
        footer={<Button onClick={() => setIncompleteAttendanceModalOpen(false)}>بستن</Button>}
        width={900}
        destroyOnHidden
      >
        <div className="space-y-4">
          <Typography.Text type="secondary">
            این فهرست فقط ترددهای کارمندان انتخاب‌شده در بازهٔ زمانی فعلی را نشان می‌دهد. هر مورد باید با ورود یا خروج مکمل تکمیل شود.
          </Typography.Text>
          <Table
            rowKey="key"
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 760 }}
            dataSource={incompleteAttendanceRows}
            locale={{ emptyText: 'تردد ناقصی در این بازه وجود ندارد.' }}
            columns={[
              { title: 'کارمند', dataIndex: 'employeeName', key: 'employeeName' },
              {
                title: 'تاریخ',
                dataIndex: 'attendanceDate',
                key: 'attendanceDate',
                render: (value: string | null) => value ? toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD')) : '-',
              },
              {
                title: 'ثبت‌شده',
                key: 'logType',
                render: (_: unknown, row: IncompleteAttendanceRow) => (
                  <Tag color={row.logType === 'check_in' ? 'green' : 'red'}>
                    {row.logType === 'check_in' ? 'ورود' : 'خروج'}{row.occurredAt ? `، ${toPersianNumber(safeJalaliFormat(row.occurredAt, 'HH:mm'))}` : ''}
                  </Tag>
                ),
              },
              {
                title: 'نیازمند تکمیل',
                key: 'missingLogType',
                render: (_: unknown, row: IncompleteAttendanceRow) => (
                  <Tag color={row.missingLogType === 'check_in' ? 'green' : 'red'}>
                    {row.missingLogType === 'check_in' ? 'ثبت ورود' : 'ثبت خروج'}
                  </Tag>
                ),
              },
              {
                title: 'عملیات',
                key: 'actions',
                render: (_: unknown, row: IncompleteAttendanceRow) => canCreateAttendance ? (
                  <Button
                    size="small"
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => openIncompleteAttendanceCompletion(row)}
                  >
                    {row.missingLogType === 'check_in' ? 'افزودن ورود' : 'افزودن خروج'}
                  </Button>
                ) : <Tag>اجازه ثبت ندارید</Tag>,
              },
            ]}
          />
        </div>
      </Modal>

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
        title={`تنظیمات حقوق و دستمزد - ${editingProfile?.full_name || editingProfile?.id || ''}`}
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
          <div className="mb-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <div className="text-xs text-gray-500">ساعات موظف این بازه</div>
                <div className="persian-number mt-1 text-lg font-black">{toPersianNumber((computeRequiredWorkMinutesForProfile(editingProfile) / 60).toFixed(1))} ساعت</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">حقوق پایه</div>
                <div className="persian-number mt-1 text-lg font-black">{formatMoney(toNumber(configForm.getFieldValue('base_salary')))}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">نرخ ساعتی پیشنهادی</div>
                <div className="persian-number mt-1 text-lg font-black text-green-700">
                  {formatMoney((() => {
                    const requiredMinutes = computeRequiredWorkMinutesForProfile(editingProfile);
                    const explicitRate = toNumber(configForm.getFieldValue('hourly_rate'));
                    if (explicitRate > 0) return explicitRate;
                    const requiredHours = requiredMinutes / 60;
                    return requiredHours > 0 ? toNumber(configForm.getFieldValue('base_salary')) / requiredHours : 0;
                  })())}
                </div>
              </div>
            </div>
          </div>

          {HR_PAYROLL_CONFIG_BLOCKS.map((block: any) => {
            const blockFields = visiblePayrollConfigFields.filter((field: any) => String(field.blockId || '') === String(block.id || ''));
            if (blockFields.length === 0) return null;
            return (
              <div key={block.id} className="mb-5 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                <div className="mb-4 text-sm font-black text-gray-800 dark:text-gray-100">{block.titles?.fa || 'تنظیمات'}</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {blockFields.map((field: any) => {
                    if (!evaluateLegacyVisibilityRule(field.logic, configForm.getFieldsValue(true))) return null;
                    return (
                      <Form.Item key={field.key} className="mb-0">
                        <SmartFieldRenderer
                          field={field}
                          value={configForm.getFieldValue(field.key)}
                          onChange={(value) => configForm.setFieldValue(String(field.key), value)}
                          allValues={configForm.getFieldsValue(true)}
                          moduleId="employees"
                          forceEditMode
                          overlayZIndexBase={12000}
                          popupContainer={resolveOverlayPopupContainer}
                          preferLocalPopupContainer
                        />
                      </Form.Item>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Form>
      </Modal>
      <FormulaEditorModal
        open={formulaModalConfig.open}
        onCancel={() => setFormulaModalConfig((current) => ({ ...current, open: false }))}
        defaultScope={formulaModalConfig.defaultScope}
        defaultContextType={formulaModalConfig.defaultContextType}
        defaultOutputType={formulaModalConfig.defaultOutputType}
        onSaved={(formula) => {
          if (formulaModalConfig.assignToField) {
            configForm.setFieldValue(formulaModalConfig.assignToField, formula.id);
          }
        }}
      />
    </div>
  );
};

export default HRPage;
