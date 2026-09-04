import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Empty, Spin, Tag, Typography } from 'antd';
import { CalendarOutlined, LeftOutlined, ReloadOutlined, RightOutlined, TeamOutlined } from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import { resolveWorkScheduleDayPlan, type WorkScheduleDayPlan } from '../utils/workSchedulePlan';
import { getHolidaySummaryForDate, type HolidayDaySummary } from '../utils/holidayCalendar';

const { Title, Text } = Typography;

type ScheduleColumn = {
  employeeId?: string | null;
  weeklyPlan?: unknown;
  monthlyPlan?: unknown;
};

type WorkSchedule = {
  id: string;
  title: string | null;
  effective_from: string | null;
  effective_to: string | null;
  weekly_plan: { columns?: ScheduleColumn[] } | null;
};

type Employee = {
  id: string;
  full_name: string | null;
  department: string | null;
  team: string | null;
  works_on_official_holidays: boolean | null;
};

const toDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const parseDateKey = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const weekdayKey = (date: Date) => (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[date.getDay()];

const formatShift = (shift: WorkScheduleDayPlan['shift1']) => (
  shift.start && shift.end ? `${toPersianNumber(shift.start)} تا ${toPersianNumber(shift.end)}` : 'ثبت نشده'
);

const AttendanceDailySchedulePage: React.FC = () => {
  const { message } = App.useApp();
  const { scheduleId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<WorkSchedule | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [holidaySummary, setHolidaySummary] = useState<HolidayDaySummary | null>(null);

  const selectedDate = useMemo(() => parseDateKey(searchParams.get('date')) || new Date(), [searchParams]);
  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);

  const loadPage = useCallback(async () => {
    if (!scheduleId) return;
    try {
      setLoading(true);
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('work_schedules')
        .select('id, title, effective_from, effective_to, weekly_plan')
        .eq('id', scheduleId)
        .maybeSingle();
      if (scheduleError) throw scheduleError;
      if (!scheduleData) {
        setSchedule(null);
        setEmployees([]);
        return;
      }

      const nextSchedule = scheduleData as WorkSchedule;
      const employeeIds = Array.from(new Set(
        (Array.isArray(nextSchedule.weekly_plan?.columns) ? nextSchedule.weekly_plan.columns : [])
          .map((column) => String(column?.employeeId || '').trim())
          .filter(Boolean),
      ));
      const employeesResult = employeeIds.length
        ? await supabase.from('employees').select('id, full_name, department, team, works_on_official_holidays').in('id', employeeIds).order('full_name')
        : { data: [], error: null };
      if (employeesResult.error) throw employeesResult.error;
      setSchedule(nextSchedule);
      setEmployees((employeesResult.data || []) as Employee[]);
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'خطا در دریافت برنامه روزانه حضور'));
    } finally {
      setLoading(false);
    }
  }, [message, scheduleId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    let cancelled = false;
    void getHolidaySummaryForDate(selectedDateKey).then((summary) => {
      if (!cancelled) setHolidaySummary(summary);
    });
    return () => { cancelled = true; };
  }, [selectedDateKey]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('erp:breadcrumb', {
      detail: { moduleTitle: 'منابع انسانی', moduleId: 'attendance_daily_schedule', recordName: 'برنامه روزانه حضور' },
    }));
    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, []);

  const rows = useMemo(() => {
    const columnsByEmployeeId = new Map(
      (Array.isArray(schedule?.weekly_plan?.columns) ? schedule.weekly_plan.columns : [])
        .map((column) => [String(column?.employeeId || ''), column] as const),
    );
    return employees.map((employee) => {
      const column = columnsByEmployeeId.get(employee.id);
      const plan = resolveWorkScheduleDayPlan({
        monthlyPlan: column?.monthlyPlan,
        weeklyPlan: column?.weeklyPlan,
        dateKey: selectedDateKey,
        weekdayKey: weekdayKey(selectedDate),
      });
      const hasShift = Boolean(plan.shift1.start || plan.shift1.end || plan.shift2.start || plan.shift2.end);
      // تعطیلی رسمی برای کارکنانی که مجوز کار در تعطیل ندارند، برنامهٔ حضور ایجاد نمی‌کند.
      // جمعه جداست: ممکن است در برنامهٔ هفتگی برای آن شیفت تعریف شده باشد.
      const isClosedForEmployee = holidaySummary?.isOfficialHoliday === true
        && employee.works_on_official_holidays !== true;
      return { employee, plan, hasShift: hasShift && !isClosedForEmployee };
    }).filter((item) => item.hasShift);
  }, [employees, holidaySummary?.isOfficialHoliday, schedule?.weekly_plan, selectedDate, selectedDateKey]);

  const moveDay = (offset: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + offset);
    setSearchParams({ date: toDateKey(next) });
  };

  const dateIsInSchedule = !schedule?.effective_from || !schedule?.effective_to
    || (selectedDateKey >= schedule.effective_from && selectedDateKey <= schedule.effective_to);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Spin size="large" /></div>;

  if (!schedule) {
    return <div className="py-20"><Empty description="برنامه حضور موردنظر یافت نشد یا اجازه مشاهده آن را ندارید." /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 animate-fadeIn">
      <Card className="!rounded-[2rem]" bordered>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-leather-700"><CalendarOutlined /><span className="font-bold">برنامه روزانه حضور</span></div>
            <Title level={2} className="!mb-1">{schedule.title || 'برنامه حضور'}</Title>
            <Text type="secondary">شیفت کارکنان برای هر روز را ببینید و بین روزها جابه‌جا شوید.</Text>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<ReloadOutlined />} onClick={() => void loadPage()}>بازخوانی</Button>
            <Button onClick={() => navigate(`/work_schedules/${schedule.id}`)}>نمای برنامه ماهانه</Button>
          </div>
        </div>
      </Card>

      <Card className="!rounded-[2rem]" bordered>
        <div className="flex items-center justify-between gap-3">
          <Button icon={<RightOutlined />} onClick={() => moveDay(-1)}>روز قبل</Button>
          <div className="text-center">
            <div className="font-black text-lg">{toPersianNumber(safeJalaliFormat(selectedDate.toISOString(), 'dddd، YYYY/MM/DD') || selectedDateKey)}</div>
            <div className="mt-1 text-sm text-gray-500">{schedule.effective_from && schedule.effective_to ? `بازه برنامه: ${toPersianNumber(safeJalaliFormat(schedule.effective_from, 'YYYY/MM/DD') || '')} تا ${toPersianNumber(safeJalaliFormat(schedule.effective_to, 'YYYY/MM/DD') || '')}` : 'برنامه فعال'}</div>
            <div className="mt-2 flex flex-wrap justify-center gap-1">
              {holidaySummary?.isFriday && <Tag color="red">تعطیل هفتگی</Tag>}
              {holidaySummary?.isOfficialHoliday && <Tag color="red">تعطیل رسمی</Tag>}
            </div>
          </div>
          <Button icon={<LeftOutlined />} iconPosition="end" onClick={() => moveDay(1)}>روز بعد</Button>
        </div>
      </Card>

      {holidaySummary?.isOfficialHoliday && (
        <Alert
          type="info"
          showIcon
          message="تعطیل رسمی"
          description={`این روز به‌دلیل ${holidaySummary.occasions.filter((item) => item.isHoliday).map((item) => item.title).join(' و ') || 'مناسبت رسمی'} تعطیل است. فقط کارکنانی که «کار در روزهای تعطیل» برایشان فعال شده، در برنامه حضور نمایش داده می‌شوند.`}
        />
      )}

      {!dateIsInSchedule ? (
        <Empty description="این تاریخ خارج از بازه برنامه حضور است." className="py-16" />
      ) : rows.length === 0 ? (
        <Empty description="برای این روز شیفتی ثبت نشده است." className="py-16" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map(({ employee, plan }) => (
            <Card key={employee.id} className="!rounded-3xl" bordered>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-black text-gray-800"><TeamOutlined className="text-leather-600" />{employee.full_name || 'بدون نام'}</div>
                  {(employee.department || employee.team) && <div className="mt-1 text-xs text-gray-500">{[employee.department, employee.team].filter(Boolean).join(' · ')}</div>}
                </div>
                <Tag color="green" className="!m-0 !rounded-lg">شیفت فعال</Tag>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-gray-50 p-3 dark:bg-white/5"><div className="mb-1 text-xs text-gray-500">شیفت ۱</div><div className="font-bold persian-number">{formatShift(plan.shift1)}</div></div>
                <div className="rounded-2xl bg-gray-50 p-3 dark:bg-white/5"><div className="mb-1 text-xs text-gray-500">شیفت ۲</div><div className="font-bold persian-number">{formatShift(plan.shift2)}</div></div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AttendanceDailySchedulePage;
