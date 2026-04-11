import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Checkbox,
  Empty,
  Input,
  Popover,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  EditOutlined,
  EyeOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import RelatedSidebar from '../components/Sidebar/RelatedSidebar';
import ProductionStagesField from '../components/ProductionStagesField';
import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import PersianDatePicker from '../components/PersianDatePicker';
import { parseDateValue, safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { getHolidaySummaryForDate, type HolidayDaySummary } from '../utils/holidayCalendar';

const { Title, Text } = Typography;

const DAYS = [
  { key: 'sat', label: 'شنبه', accent: 'bg-slate-50 dark:bg-slate-900/30' },
  { key: 'sun', label: 'یکشنبه', accent: 'bg-white dark:bg-transparent' },
  { key: 'mon', label: 'دوشنبه', accent: 'bg-slate-50 dark:bg-slate-900/30' },
  { key: 'tue', label: 'سه‌شنبه', accent: 'bg-white dark:bg-transparent' },
  { key: 'wed', label: 'چهارشنبه', accent: 'bg-slate-50 dark:bg-slate-900/30' },
  { key: 'thu', label: 'پنجشنبه', accent: 'bg-white dark:bg-transparent' },
  { key: 'fri', label: 'جمعه', accent: 'bg-rose-50 dark:bg-rose-950/20' },
] as const;

const SHIFTS = [
  { key: 'shift1', label: 'شیفت 1' },
  { key: 'shift2', label: 'شیفت 2' },
] as const;

const STATUS_OPTIONS = [
  { label: 'پیش‌نویس', value: 'draft' },
  { label: 'فعال', value: 'active' },
  { label: 'منقضی', value: 'expired' },
];

type DayKey = (typeof DAYS)[number]['key'];
type ShiftKey = (typeof SHIFTS)[number]['key'];
type StatusKey = 'draft' | 'active' | 'expired';
type PageMode = 'view' | 'edit';

type ShiftPlan = { start: string | null; end: string | null };
type WeeklyPlan = Record<DayKey, Record<ShiftKey, ShiftPlan>>;

type EmployeeRecord = {
  id: string;
  full_name: string | null;
  department: string | null;
  team: string | null;
  employment_status: string | null;
};

type WorkScheduleRecord = {
  id: string;
  title?: string | null;
  status?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  weekly_plan?: unknown;
};

type SerializedColumn = {
  employeeId: string | null;
  weeklyPlan: WeeklyPlan;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
};

type ColumnState = SerializedColumn & {
  key: string;
  dirty: boolean;
  saving: boolean;
};

const emptyPlan = (): WeeklyPlan =>
  DAYS.reduce((acc, day) => {
    acc[day.key] = { shift1: { start: null, end: null }, shift2: { start: null, end: null } };
    return acc;
  }, {} as WeeklyPlan);

const normalizePlan = (raw: any): WeeklyPlan => {
  const base = emptyPlan();
  if (!raw || typeof raw !== 'object') return base;

  DAYS.forEach((day) => {
    SHIFTS.forEach((shift) => {
      base[day.key][shift.key] = {
        start: typeof raw?.[day.key]?.[shift.key]?.start === 'string' ? raw[day.key][shift.key].start : null,
        end: typeof raw?.[day.key]?.[shift.key]?.end === 'string' ? raw[day.key][shift.key].end : null,
      };
    });
  });

  return base;
};

const makeColumn = (seed?: Partial<ColumnState>): ColumnState => ({
  key: seed?.key || `col_${Math.random().toString(36).slice(2, 10)}`,
  employeeId: seed?.employeeId || null,
  weeklyPlan: seed?.weeklyPlan || emptyPlan(),
  createdAt: seed?.createdAt || null,
  updatedAt: seed?.updatedAt || null,
  createdBy: seed?.createdBy || null,
  updatedBy: seed?.updatedBy || null,
  dirty: seed?.dirty || false,
  saving: seed?.saving || false,
});

const columnsFromRecord = (record: WorkScheduleRecord | null): ColumnState[] => {
  const rawColumns = Array.isArray((record?.weekly_plan as any)?.columns) ? (record?.weekly_plan as any).columns : [];
  const parsed = rawColumns
    .map((item: SerializedColumn, index: number) =>
      makeColumn({
        key: `col_${index}_${String(item?.employeeId || '')}`,
        employeeId: item?.employeeId || null,
        weeklyPlan: normalizePlan(item?.weeklyPlan),
        createdAt: item?.createdAt || null,
        updatedAt: item?.updatedAt || null,
        createdBy: item?.createdBy || null,
        updatedBy: item?.updatedBy || null,
      }),
    )
    .filter((column: ColumnState) => Boolean(column.employeeId));

  return parsed.length ? parsed : [makeColumn()];
};

const metaDate = (value: string | null | undefined) =>
  value ? toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || '-') : '-';

const formatTimeLabel = (value: string | null | undefined) => (value ? toPersianNumber(value) : '--');

const workDaysFromPlan = (plan: WeeklyPlan) =>
  DAYS.filter((day) => SHIFTS.some((shift) => plan[day.key][shift.key].start || plan[day.key][shift.key].end)).map((day) => day.key);

const firstBounds = (plan: WeeklyPlan) => {
  for (const day of DAYS) {
    for (const shift of SHIFTS) {
      const entry = plan[day.key][shift.key];
      if (entry.start || entry.end) return { start: entry.start || null, end: entry.end || null };
    }
  }
  return { start: null, end: null };
};

const avgDailyMinutes = (columns: ColumnState[]) => {
  const values = columns
    .flatMap((column) =>
      DAYS.map((day) =>
        SHIFTS.reduce((sum, shift) => {
          const item = column.weeklyPlan[day.key][shift.key];
          if (!item.start || !item.end) return sum;
          const [sh, sm] = item.start.split(':').map(Number);
          const [eh, em] = item.end.split(':').map(Number);
          if ([sh, sm, eh, em].some(Number.isNaN)) return sum;
          const diff = (eh * 60 + em) - (sh * 60 + sm);
          return diff > 0 ? sum + diff : sum;
        }, 0),
      ),
    )
    .filter((value) => value > 0);

  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 480;
};

const dayKeyFromDate = (date: Date): DayKey => {
  const keys: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return keys[date.getDay()];
};

const buildDateRange = (from?: string | null, to?: string | null) => {
  const start = parseDateValue(from)?.toDate();
  const end = parseDateValue(to)?.toDate();
  if (!start || !end || start.getTime() > end.getTime()) return [];

  start.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);

  const days: Date[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime() && days.length < 370) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

const WorkSchedulesPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  const isCreate = location.pathname.endsWith('/create');
  const isEditRoute = isCreate || location.pathname.endsWith('/edit');
  const pageMode: PageMode = isEditRoute ? 'edit' : 'view';

  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(id || null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleStatus, setScheduleStatus] = useState<StatusKey>('draft');
  const [effectiveFrom, setEffectiveFrom] = useState<string | null>(null);
  const [effectiveTo, setEffectiveTo] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnState[]>([makeColumn()]);
  const [nameFilter, setNameFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState<string | undefined>();
  const [departmentFilter, setDepartmentFilter] = useState<string | undefined>();
  const [copyPopover, setCopyPopover] = useState<{ columnKey: string; dayKey: DayKey } | null>(null);
  const [copyTargets, setCopyTargets] = useState<DayKey[]>([]);
  const [officialHolidaySummaries, setOfficialHolidaySummaries] = useState<HolidayDaySummary[]>([]);
  const [officialHolidaysLoading, setOfficialHolidaysLoading] = useState(false);

  useEffect(() => {
    setRecordId(id || null);
  }, [id]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('erp:breadcrumb', {
        detail: {
          moduleTitle: 'برنامه حضور',
          moduleId: 'work_schedules',
          recordName: isCreate ? 'ایجاد برنامه حضور' : scheduleTitle || 'جزئیات برنامه حضور',
        },
      }),
    );

    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, [isCreate, scheduleTitle]);

  const loadPage = useCallback(async () => {
    try {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      setCurrentUserId(authData?.user?.id || null);

      const [employeesRes, recordRes] = await Promise.all([
        supabase.from('employees').select('id, full_name, department, team, employment_status').order('full_name', { ascending: true }),
        isCreate || !recordId ? Promise.resolve({ data: null, error: null } as any) : supabase.from('work_schedules').select('*').eq('id', recordId).maybeSingle(),
      ]);

      if (employeesRes.error) throw employeesRes.error;
      if (recordRes?.error) throw recordRes.error;

      const nextEmployees = (employeesRes.data || []) as EmployeeRecord[];
      const record = (recordRes?.data || null) as WorkScheduleRecord | null;
      const nextColumns = columnsFromRecord(record);
      const userIds = Array.from(
        new Set(nextColumns.flatMap((column) => [column.createdBy, column.updatedBy]).filter((value): value is string => Boolean(value))),
      );

      let nextProfileNames: Record<string, string> = {};
      if (userIds.length) {
        const { data: profilesData, error: profilesError } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
        if (profilesError) throw profilesError;
        nextProfileNames = Object.fromEntries((profilesData || []).map((item: any) => [String(item.id), String(item.full_name || 'بدون نام')]));
      }

      setEmployees(nextEmployees);
      setProfileNames(nextProfileNames);
      setColumns(nextColumns);
      setScheduleTitle(String(record?.title || ''));
      setScheduleStatus((record?.status as StatusKey) || 'draft');
      setEffectiveFrom(record?.effective_from || null);
      setEffectiveTo(record?.effective_to || null);
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'خطا در دریافت برنامه حضور'));
    } finally {
      setLoading(false);
    }
  }, [isCreate, message, recordId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const employeeMap = useMemo(() => Object.fromEntries(employees.map((employee) => [employee.id, employee])), [employees]);
  const departments = useMemo(() => Array.from(new Set(employees.map((x) => String(x.department || '').trim()).filter(Boolean))), [employees]);
  const teams = useMemo(() => Array.from(new Set(employees.map((x) => String(x.team || '').trim()).filter(Boolean))), [employees]);

  const filteredEmployees = useMemo(() => {
    const term = nameFilter.trim().toLowerCase();
    return employees.filter((employee) => {
      if (departmentFilter && String(employee.department || '') !== departmentFilter) return false;
      if (teamFilter && String(employee.team || '') !== teamFilter) return false;
      if (term && !String(employee.full_name || '').toLowerCase().includes(term)) return false;
      return true;
    });
  }, [departmentFilter, employees, nameFilter, teamFilter]);

  const visibleColumns = useMemo(
    () =>
      columns.filter((column) => {
        if (!column.employeeId) return pageMode === 'edit';
        const employee = employeeMap[column.employeeId];
        if (!employee) return pageMode === 'edit';
        if (departmentFilter && String(employee.department || '') !== departmentFilter) return false;
        if (teamFilter && String(employee.team || '') !== teamFilter) return false;
        const term = nameFilter.trim().toLowerCase();
        if (term && !String(employee.full_name || '').toLowerCase().includes(term)) return false;
        return true;
      }),
    [columns, departmentFilter, employeeMap, nameFilter, pageMode, teamFilter],
  );

  const assignedVisibleColumns = useMemo(
    () => visibleColumns.filter((column) => Boolean(column.employeeId)),
    [visibleColumns],
  );

  useEffect(() => {
    let isActive = true;
    const dates = buildDateRange(effectiveFrom, effectiveTo);

    if (!dates.length) {
      setOfficialHolidaySummaries([]);
      setOfficialHolidaysLoading(false);
      return;
    }

    setOfficialHolidaysLoading(true);
    void Promise.all(dates.map((date) => getHolidaySummaryForDate(date)))
      .then((summaries) => {
        if (!isActive) return;
        setOfficialHolidaySummaries(
          summaries.filter((summary): summary is HolidayDaySummary => !!summary?.isOfficialHoliday)
        );
      })
      .finally(() => {
        if (isActive) setOfficialHolidaysLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [effectiveFrom, effectiveTo]);

  const officialHolidayCountsByDay = useMemo(() => {
    return officialHolidaySummaries.reduce<Record<DayKey, number>>((acc, summary) => {
      const date = parseDateValue(summary.dateKey)?.toDate();
      if (!date) return acc;
      const dayKey = dayKeyFromDate(date);
      acc[dayKey] = (acc[dayKey] || 0) + 1;
      return acc;
    }, { sat: 0, sun: 0, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 });
  }, [officialHolidaySummaries]);

  const getEmployeeOptions = useCallback(
    (currentEmployeeId: string | null) => {
      const current = currentEmployeeId ? employeeMap[currentEmployeeId] : undefined;
      const pool = current && !filteredEmployees.some((employee) => employee.id === current.id) ? [current, ...filteredEmployees] : filteredEmployees;
      return pool.map((employee) => ({ value: employee.id, label: employee.full_name || 'بدون نام' }));
    },
    [employeeMap, filteredEmployees],
  );

  const updateColumn = (columnKey: string, updater: (column: ColumnState) => ColumnState) => {
    setColumns((prev) => prev.map((column) => (column.key === columnKey ? updater(column) : column)));
  };

  const handleEmployeeChange = (columnKey: string, employeeId: string | null) => {
    const duplicate = columns.find((column) => column.key !== columnKey && column.employeeId === employeeId);
    if (employeeId && duplicate) {
      message.warning('این کارمند در یکی از ستون‌های دیگر انتخاب شده است.');
      return;
    }
    updateColumn(columnKey, (column) => ({ ...column, employeeId, dirty: true }));
  };

  const updateCell = (columnKey: string, dayKey: DayKey, shiftKey: ShiftKey, part: 'start' | 'end', value: string | null) => {
    updateColumn(columnKey, (column) => ({
      ...column,
      dirty: true,
      weeklyPlan: {
        ...column.weeklyPlan,
        [dayKey]: {
          ...column.weeklyPlan[dayKey],
          [shiftKey]: { ...column.weeklyPlan[dayKey][shiftKey], [part]: value },
        },
      },
    }));
  };

  const applyCopyDay = (columnKey: string, sourceDay: DayKey) => {
    if (!copyTargets.length) {
      message.info('حداقل یک روز را انتخاب کن.');
      return;
    }

    updateColumn(columnKey, (column) => {
      const source = column.weeklyPlan[sourceDay];
      const nextPlan = { ...column.weeklyPlan };
      copyTargets.forEach((dayKey) => {
        nextPlan[dayKey] = {
          shift1: { ...source.shift1 },
          shift2: { ...source.shift2 },
        };
      });
      return { ...column, weeklyPlan: nextPlan, dirty: true };
    });

    setCopyPopover(null);
    setCopyTargets([]);
    message.success('کپی انجام شد.');
  };

  const ensureProfileNames = useCallback(
    async (nextColumns: ColumnState[]) => {
      const missingIds = Array.from(
        new Set(nextColumns.flatMap((column) => [column.createdBy, column.updatedBy]).filter((value): value is string => Boolean(value))),
      ).filter((profileId) => !profileNames[profileId]);

      if (!missingIds.length) return;

      const { data } = await supabase.from('profiles').select('id, full_name').in('id', missingIds);
      if (!data?.length) return;

      setProfileNames((prev) => ({
        ...prev,
        ...Object.fromEntries(data.map((item: any) => [String(item.id), String(item.full_name || 'بدون نام')])),
      }));
    },
    [profileNames],
  );

  const persistRecord = useCallback(
    async (targetColumnKey?: string) => {
      if (!scheduleTitle.trim()) {
        message.warning('نام برنامه حضور را وارد کن.');
        return;
      }

      if (!effectiveFrom || !effectiveTo) {
        message.warning('بازه زمانی برنامه حضور باید کامل باشد.');
        return;
      }

      const nowIso = new Date().toISOString();
      const nextColumns = columns
        .filter((column) => column.employeeId)
        .map((column) => {
          if (!targetColumnKey || targetColumnKey === column.key || (!recordId && column.dirty)) {
            return {
              ...column,
              createdAt: column.createdAt || nowIso,
              createdBy: column.createdBy || currentUserId,
              updatedAt: nowIso,
              updatedBy: currentUserId,
              dirty: false,
              saving: false,
            };
          }
          return column;
        });

      if (!nextColumns.length) {
        message.warning('حداقل یک کارمند باید در برنامه حضور باشد.');
        return;
      }

      try {
        setSavingAll(!targetColumnKey);
        if (targetColumnKey) {
          updateColumn(targetColumnKey, (column) => ({ ...column, saving: true }));
        }

        const allWeeklyDays = Array.from(new Set(nextColumns.flatMap((column) => workDaysFromPlan(column.weeklyPlan))));
        const first = firstBounds(nextColumns[0].weeklyPlan);
        const payload = {
          title: scheduleTitle.trim(),
          status: scheduleStatus,
          effective_from: effectiveFrom,
          effective_to: effectiveTo,
          schedule_type: 'fixed',
          is_active: scheduleStatus === 'active',
          employee_id: null,
          expected_daily_minutes: avgDailyMinutes(nextColumns),
          weekly_days: allWeeklyDays,
          start_time: first.start,
          end_time: first.end,
          weekly_plan: {
            version: 2,
            columns: nextColumns.map((column) => ({
              employeeId: column.employeeId,
              weeklyPlan: column.weeklyPlan,
              createdAt: column.createdAt,
              updatedAt: column.updatedAt,
              createdBy: column.createdBy,
              updatedBy: column.updatedBy,
            })),
          },
          updated_by: currentUserId,
        };

        const query = recordId
          ? supabase.from('work_schedules').update(payload).eq('id', recordId)
          : supabase.from('work_schedules').insert({ ...payload, created_by: currentUserId });

        const { data, error } = await query.select('*').single();
        if (error) throw error;

        const saved = data as WorkScheduleRecord;
        setRecordId(saved.id);
        setColumns(nextColumns);
        await ensureProfileNames(nextColumns);

        if (!recordId && saved.id) {
          navigate(`/work_schedules/${saved.id}`, { replace: true });
        }

        message.success('برنامه حضور ذخیره شد.');
      } catch (error) {
        setColumns((prev) => prev.map((column) => ({ ...column, saving: false })));
        message.error(toFaErrorMessage(error as any, 'خطا در ذخیره برنامه حضور'));
      } finally {
        setSavingAll(false);
      }
    },
    [columns, currentUserId, effectiveFrom, effectiveTo, ensureProfileNames, message, navigate, recordId, scheduleStatus, scheduleTitle],
  );

  const renderMetaCard = (column: ColumnState) => (
    <div className="bg-gray-50 dark:bg-white/5 rounded-2xl p-3 grid grid-cols-2 gap-3 text-[11px] text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-white/5">
      <div className="flex items-center gap-2">
        <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
          <SafetyCertificateOutlined className="text-green-600" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="opacity-70">ایجادکننده</span>
          <span className="font-bold text-gray-700 dark:text-gray-300 truncate">{column.createdBy ? profileNames[column.createdBy] || '...' : '-'}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
          <ClockCircleOutlined className="text-blue-500" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="opacity-70">زمان ایجاد</span>
          <span className="font-bold text-gray-700 dark:text-gray-300 persian-number truncate">{metaDate(column.createdAt)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
          <EditOutlined className="text-orange-500" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="opacity-70">آخرین ویرایشگر</span>
          <span className="font-bold text-gray-700 dark:text-gray-300 truncate">{column.updatedBy ? profileNames[column.updatedBy] || '...' : '-'}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
          <HistoryOutlined className="text-purple-500" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="opacity-70">زمان ویرایش</span>
          <span className="font-bold text-gray-700 dark:text-gray-300 persian-number truncate">{metaDate(column.updatedAt)}</span>
        </div>
      </div>
    </div>
  );

  const renderViewCard = (column: ColumnState) => {
    const employee = column.employeeId ? employeeMap[column.employeeId] : undefined;
    if (!employee) return null;

    return (
      <div key={column.key} className="rounded-[2rem] border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1a1a1a] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-l from-leather-50/70 to-white dark:from-white/5 dark:to-transparent">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-black text-lg text-gray-800 dark:text-white truncate">{employee.full_name || 'بدون نام'}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                {[employee.department, employee.team].filter(Boolean).join(' / ') || 'واحد و تیم ثبت نشده'}
              </div>
            </div>
            {column.dirty && <Tag color="orange">تغییر کرده</Tag>}
          </div>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-white/5">
          {DAYS.map((day) => {
            const holidayCount = officialHolidayCountsByDay[day.key] || 0;
            return (
            <div key={`${column.key}_${day.key}`} className="px-5 py-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="font-bold text-gray-800 dark:text-white">{day.label}</div>
                <div className="flex flex-wrap justify-end gap-1">
                  {day.key === 'fri' && <Tag color="red">تعطیل هفتگی</Tag>}
                  {holidayCount > 0 && <Tag color="red">{toPersianNumber(holidayCount)} تعطیلی در بازه</Tag>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SHIFTS.map((shift) => {
                  const item = column.weeklyPlan[day.key][shift.key];
                  const hasTime = item.start || item.end;
                  return (
                    <div
                      key={`${column.key}_${day.key}_${shift.key}_view`}
                      className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/5 px-3 py-3"
                    >
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">{shift.label}</div>
                      {hasTime ? (
                        <div className="flex items-center justify-between gap-2 font-bold text-gray-700 dark:text-gray-200 persian-number">
                          <span>{formatTimeLabel(item.start)}</span>
                          <span className="text-gray-400">تا</span>
                          <span>{formatTimeLabel(item.end)}</span>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400 dark:text-gray-500">ثبت نشده</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>

        <div className="p-5 border-t border-gray-200 dark:border-gray-800">
          {renderMetaCard(column)}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className={`space-y-6 animate-fadeIn ${recordId && !isCreate ? 'md:pl-20' : ''}`}>
      {recordId && !isCreate && MODULES.work_schedules && (
        <RelatedSidebar
          moduleConfig={MODULES.work_schedules}
          recordId={String(recordId)}
          recordName={scheduleTitle || 'برنامه حضور'}
        />
      )}
      <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-leather-500 to-leather-800 opacity-80" />
        <div className="flex flex-col gap-5">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Title level={2} className="!mb-1 !text-gray-800 dark:!text-white">
                {isCreate ? 'ایجاد برنامه حضور' : 'برنامه حضور'}
              </Title>
              <Text className="text-gray-500 dark:text-gray-400">
                مدیریت برنامه حضور ماهانه یا بازه‌ای کارکنان در قالب جدول هفتگی
              </Text>
            </div>
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={() => void loadPage()}>
                بازخوانی
              </Button>
              {!isCreate && pageMode === 'view' && recordId && (
                <Button type="primary" icon={<EditOutlined />} onClick={() => navigate(`/work_schedules/${recordId}/edit`)}>
                  ویرایش برنامه
                </Button>
              )}
              {pageMode === 'edit' && recordId && (
                <Button icon={<EyeOutlined />} onClick={() => navigate(`/work_schedules/${recordId}`)}>
                  حالت نمایش
                </Button>
              )}
              {pageMode === 'edit' && (
                <>
                  <Button icon={<PlusOutlined />} onClick={() => setColumns((prev) => [...prev, makeColumn()])}>
                    افزودن ستون کارمند
                  </Button>
                  <Button type="primary" icon={<SaveOutlined />} loading={savingAll} onClick={() => void persistRecord()}>
                    ذخیره برنامه
                  </Button>
                </>
              )}
            </Space>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Input
              value={scheduleTitle}
              onChange={(e) => setScheduleTitle(e.target.value)}
              placeholder="نام برنامه حضور، مثلا اردیبهشت 1405"
            />
            <Select value={scheduleStatus} onChange={(value) => setScheduleStatus(value)} options={STATUS_OPTIONS} placeholder="وضعیت" />
            <PersianDatePicker type="DATE" value={effectiveFrom} onChange={setEffectiveFrom} placeholder="از تاریخ" className="w-full" />
            <PersianDatePicker type="DATE" value={effectiveTo} onChange={setEffectiveTo} placeholder="تا تاریخ" className="w-full" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="فیلتر بر اساس نام کارمند" allowClear />
            <Select
              allowClear
              value={departmentFilter}
              onChange={(value) => setDepartmentFilter(value)}
              placeholder="فیلتر واحد سازمانی"
              options={departments.map((value) => ({ value, label: value }))}
            />
            <Select
              allowClear
              value={teamFilter}
              onChange={(value) => setTeamFilter(value)}
              placeholder="فیلتر تیم"
              options={teams.map((value) => ({ value, label: value }))}
            />
            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              <TeamOutlined />
              <span>
                ستون‌های قابل نمایش:
                {' '}
                <span className="font-bold persian-number">{toPersianNumber(pageMode === 'view' ? assignedVisibleColumns.length : visibleColumns.length)}</span>
              </span>
            </div>
          </div>

          {(officialHolidaysLoading || officialHolidaySummaries.length > 0) && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">
              <div className="mb-2 flex items-center gap-2 font-bold">
                <CalendarOutlined />
                <span>تعطیلی‌های رسمی در بازه برنامه حضور</span>
              </div>
              {officialHolidaysLoading ? (
                <div className="text-xs opacity-80">در حال بررسی تقویم رسمی...</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {officialHolidaySummaries.slice(0, 10).map((summary) => (
                    <Tag key={summary.dateKey} color="red" className="!m-0 max-w-full !rounded-lg !px-2 !py-1">
                      <span className="font-bold">{summary.jalaliLabel}</span>
                      {summary.occasions[0]?.title ? ` - ${summary.occasions[0].title}` : ''}
                    </Tag>
                  ))}
                  {officialHolidaySummaries.length > 10 ? (
                    <Tag color="red" className="!m-0 !rounded-lg !px-2 !py-1">
                      +{toPersianNumber(officialHolidaySummaries.length - 10)} روز دیگر
                    </Tag>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
        {pageMode === 'view' && recordId && (
          <div className="border-b border-gray-200 dark:border-gray-800 p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-block h-6 w-1 rounded-full bg-leather-500" />
              <div className="text-lg font-black text-gray-800 dark:text-white">فرآیندها</div>
            </div>
            <ProductionStagesField
              recordId={String(recordId)}
              moduleId="work_schedules"
              readOnly
              compact
              cardCompact
              forceProcessRecordMode
            />
          </div>
        )}
        {pageMode === 'view' ? (
          assignedVisibleColumns.length === 0 ? (
            <div className="py-16">
              <Empty description="کارمندی برای نمایش این برنامه با فیلترهای فعلی پیدا نشد." />
            </div>
          ) : (
            <div className="p-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
              {assignedVisibleColumns.map(renderViewCard)}
            </div>
          )
        ) : visibleColumns.length === 0 ? (
          <div className="py-16">
            <Empty description="ستونی برای نمایش وجود ندارد." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-max w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th
                    className="sticky top-0 z-30 bg-gray-50 dark:bg-[#171717] border-b border-gray-200 dark:border-gray-800 px-4 py-4 text-right min-w-[160px]"
                    style={{ right: 0 }}
                  >
                    روز
                  </th>
                  <th
                    className="sticky top-0 z-30 bg-gray-50 dark:bg-[#171717] border-b border-gray-200 dark:border-gray-800 px-4 py-4 text-right min-w-[120px]"
                    style={{ right: 160 }}
                  >
                    شیفت
                  </th>
                  {visibleColumns.map((column) => {
                    const employee = column.employeeId ? employeeMap[column.employeeId] : undefined;
                    return (
                      <th
                        key={column.key}
                        className="align-top bg-gray-50 dark:bg-[#171717] border-b border-r border-gray-200 dark:border-gray-800 px-4 py-4 min-w-[330px]"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Select
                              showSearch
                              allowClear
                              className="flex-1 text-right"
                              placeholder="انتخاب کارمند"
                              value={column.employeeId || undefined}
                              optionFilterProp="label"
                              options={getEmployeeOptions(column.employeeId)}
                              onChange={(value) => handleEmployeeChange(column.key, value || null)}
                            />
                            {columns.length > 1 && (
                              <Button
                                size="small"
                                danger
                                onClick={() => setColumns((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== column.key) : prev))}
                              >
                                حذف
                              </Button>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2 min-h-[28px]">
                            <div className="min-w-0">
                              <div className="font-black text-base text-gray-800 dark:text-white truncate">{employee?.full_name || 'ستون جدید'}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {[employee?.department, employee?.team].filter(Boolean).join(' / ') || 'واحد و تیم ثبت نشده'}
                              </div>
                            </div>
                            <Space size={6}>
                              {column.dirty && <Tag color="orange">تغییر کرده</Tag>}
                              <Button
                                type="primary"
                                size="small"
                                icon={<SaveOutlined />}
                                loading={column.saving}
                                onClick={() => void persistRecord(column.key)}
                              >
                                ذخیره
                              </Button>
                            </Space>
                          </div>
                          {renderMetaCard(column)}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day) => {
                  const holidayCount = officialHolidayCountsByDay[day.key] || 0;
                  return SHIFTS.map((shift, shiftIndex) => (
                    <tr key={`${day.key}_${shift.key}`} className={day.accent}>
                      {shiftIndex === 0 && (
                        <td
                          rowSpan={2}
                          className={`sticky z-20 border-b border-l border-gray-200 dark:border-gray-800 px-4 py-4 align-middle font-black text-gray-800 dark:text-white ${day.accent}`}
                          style={{ right: 0 }}
                        >
                          <div className="flex flex-col gap-1">
                            <span>{day.label}</span>
                            {day.key === 'fri' && <Tag color="red">تعطیل هفتگی</Tag>}
                            {holidayCount > 0 && <Tag color="red">{toPersianNumber(holidayCount)} تعطیلی در بازه</Tag>}
                          </div>
                        </td>
                      )}
                      <td
                        className={`sticky z-20 border-b border-l border-gray-200 dark:border-gray-800 px-4 py-4 align-middle text-sm font-bold text-gray-600 dark:text-gray-300 ${day.accent}`}
                        style={{ right: 160 }}
                      >
                        {shift.label}
                      </td>
                      {visibleColumns.map((column) => {
                        const item = column.weeklyPlan[day.key][shift.key];
                        const disabled = !column.employeeId || column.saving || savingAll;
                        return (
                          <td
                            key={`${column.key}_${day.key}_${shift.key}`}
                            className="border-b border-l border-gray-200 dark:border-gray-800 px-4 py-3 min-w-[330px] bg-white dark:bg-[#121212]"
                          >
                            {column.employeeId ? (
                              <div className="grid grid-cols-2 gap-3 relative">
                                {shiftIndex === 0 && (
                                  <div className="absolute left-0 -top-1">
                                    <Popover
                                      trigger="click"
                                      open={copyPopover?.columnKey === column.key && copyPopover?.dayKey === day.key}
                                      onOpenChange={(open) => {
                                        if (open) {
                                          setCopyPopover({ columnKey: column.key, dayKey: day.key });
                                          setCopyTargets([]);
                                        } else if (copyPopover?.columnKey === column.key && copyPopover?.dayKey === day.key) {
                                          setCopyPopover(null);
                                          setCopyTargets([]);
                                        }
                                      }}
                                      content={(
                                        <div className="w-56 space-y-3">
                                          <div className="text-xs text-gray-500">کپی این روز برای چه روزهایی انجام شود؟</div>
                                          <Checkbox.Group
                                            value={copyTargets}
                                            onChange={(values) => setCopyTargets(values as DayKey[])}
                                            className="flex flex-col gap-2"
                                          >
                                            {DAYS.filter((x) => x.key !== day.key).map((x) => (
                                              <Checkbox key={x.key} value={x.key}>
                                                {x.label}
                                              </Checkbox>
                                            ))}
                                          </Checkbox.Group>
                                          <div className="flex items-center justify-between">
                                            <Button
                                              size="small"
                                              onClick={() => {
                                                setCopyPopover(null);
                                                setCopyTargets([]);
                                              }}
                                            >
                                              انصراف
                                            </Button>
                                            <Button type="primary" size="small" onClick={() => applyCopyDay(column.key, day.key)}>
                                              کپی
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    >
                                      <Button type="text" size="small" icon={<CopyOutlined />} />
                                    </Popover>
                                  </div>
                                )}
                                <div className="space-y-1">
                                  <span className="text-[11px] text-gray-500 dark:text-gray-400">از</span>
                                  <PersianDatePicker
                                    type="TIME"
                                    value={item.start}
                                    onChange={(value) => updateCell(column.key, day.key, shift.key, 'start', value)}
                                    disabled={disabled}
                                    placeholder="شروع"
                                    className="w-full"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[11px] text-gray-500 dark:text-gray-400">تا</span>
                                  <PersianDatePicker
                                    type="TIME"
                                    value={item.end}
                                    onChange={(value) => updateCell(column.key, day.key, shift.key, 'end', value)}
                                    disabled={disabled}
                                    placeholder="پایان"
                                    className="w-full"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="h-[68px] rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center text-sm text-gray-400">
                                ابتدا کارمند را انتخاب کن
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkSchedulesPage;
