import { useEffect, useMemo, useState } from 'react';
import { Alert, ConfigProvider, Descriptions, Modal, Spin, Tag, theme as antdTheme } from 'antd';
import { CalendarOutlined, CheckCircleOutlined, ProjectOutlined, AlignLeftOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import { supabasePublic } from '../supabaseClient';
import { usePublicTimeTheme } from '../components/public/PublicThemeBoundary';
import { getHolidaySummaryForDate, type HolidayDaySummary } from '../utils/holidayCalendar';
import CalendarDayEvents from '../components/contentCalendars/CalendarDayEvents';
import CalendarTodayBadge from '../components/contentCalendars/CalendarTodayBadge';
import { getContentCalendarLegend, getContentCalendarStatus, getContentCalendarContentTypeLabel } from '../utils/contentCalendarPresentation';

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const toPersian = (date: Date) => new DateObject({ date, calendar: gregorian, locale: gregorian_en }).convert(persian, persian_fa);
const toGregorian = (date: DateObject) => new DateObject(date).convert(gregorian, gregorian_en).toDate();
const addDays = (date: Date, amount: number) => { const next = new Date(date); next.setDate(next.getDate() + amount); next.setHours(12, 0, 0, 0); return next; };
const asDate = (value: any) => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; };
const formatDate = (value: any) => { const date = asDate(value); return date ? toPersian(date).format('YYYY/MM/DD HH:mm') : '—'; };
const formatValue = (value: any): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (value === true) return 'بله';
  if (value === false) return 'خیر';
  if (Array.isArray(value)) return value.map(formatValue).join('، ');
  if (typeof value === 'object') return String(value?.label || value?.name || value?.title || '—');
  return String(value);
};

export default function OnlineContentCalendarPublicPage() {
  const { token } = useParams<{ token: string }>();
  const isDark = usePublicTimeTheme();
  const [payload, setPayload] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [anchor, setAnchor] = useState(new Date());
  const [holidays, setHolidays] = useState<Record<string, HolidayDaySummary | null>>({});
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [fullText, setFullText] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPayload(null);
    setError('');
    setSelectedTask(null);
    void Promise.resolve(supabasePublic.rpc('get_public_content_calendar', { p_token: String(token || '').trim() }))
      .then(({ data, error: rpcError }) => {
        if (!active) return;
        if (rpcError || data?.error) throw rpcError || new Error('تقویم پیدا نشد یا لینک آن غیرفعال است.');
        setPayload(data);
      })
      .catch((reason: any) => active && setError(String(reason?.message || 'بارگذاری تقویم ناموفق بود.')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [token]);

  const days = useMemo(() => {
    const current = toPersian(anchor);
    const first = toGregorian(new DateObject({ year: current.year, month: current.month.number, day: 1, calendar: persian, locale: persian_fa }));
    const start = addDays(first, -((first.getDay() + 1) % 7));
    return Array.from({ length: 42 }, (_, index) => {
      const date = addDays(start, index);
      const jalali = toPersian(date);
      return { date, key: dateKey(date), day: jalali.format('D'), inMonth: jalali.year === current.year && jalali.month.number === current.month.number, today: dateKey(date) === dateKey(new Date()) };
    });
  }, [anchor]);

  const events = useMemo(() => {
    const map = new Map<string, any[]>();
    [...(payload?.projects || []).map((row: any) => ({ ...row, kind: 'project' })), ...(payload?.tasks || []).map((row: any) => ({ ...row, kind: 'task' }))]
      .forEach((row: any) => {
        const date = asDate(row.due_date || row.start_date || row.completed_at);
        if (date) map.set(dateKey(date), [...(map.get(dateKey(date)) || []), row]);
      });
    return map;
  }, [payload]);

  const legend = useMemo(() => getContentCalendarLegend(days.filter((day) => day.inMonth)
    .flatMap((day) => events.get(day.key) || []).map((row) => getContentCalendarStatus(row, row.kind))), [days, events]);

  useEffect(() => {
    let active = true;
    void Promise.all(days.map(async (day) => [day.key, await getHolidaySummaryForDate(day.date)] as const))
      .then((rows) => { if (active) setHolidays(Object.fromEntries(rows)); });
    return () => { active = false; };
  }, [days]);

  const calendar = payload?.calendar || {};
  const company = payload?.company?.company_settings || {};
  const name = company?.trade_name || company?.company_name || 'سازمان';
  const themeConfig = { algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm, token: { colorPrimary: '#2563eb', fontFamily: 'Peyda, Tahoma, Arial, sans-serif' } };

  if (loading) return <ConfigProvider direction="rtl" theme={themeConfig}><div className="flex min-h-screen items-center justify-center"><Spin size="large" /></div></ConfigProvider>;
  if (error) return <ConfigProvider direction="rtl" theme={themeConfig}><div dir="rtl" className="mx-auto mt-16 max-w-lg px-4"><Alert type="error" showIcon message="تقویم در دسترس نیست" description={error} /></div></ConfigProvider>;

  return <ConfigProvider direction="rtl" theme={themeConfig}>
    <main dir="rtl" className="min-h-screen bg-slate-100 p-3 text-slate-800 dark:bg-slate-950 dark:text-slate-100 sm:p-8">
      <section className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-slate-900">
        <header className="bg-gradient-to-bl from-blue-800 via-blue-600 to-sky-400 px-6 py-8 text-white sm:px-10">
          <div className="text-sm text-white/75">{name}</div>
          <h1 className="mt-2 text-2xl font-black sm:text-4xl"><CalendarOutlined className="ml-2" />{calendar.name || 'تقویم محتوایی آنلاین'}</h1>
          {calendar.description ? <p className="mt-3 max-w-3xl text-sm text-white/90">{calendar.description}</p> : null}
        </header>
        <div className="p-3 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <button className="rounded-lg px-3 py-1 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setAnchor(toGregorian(toPersian(anchor).add(-1, 'month')))}>ماه قبل</button>
            <div className="font-black">{toPersian(anchor).format('MMMM YYYY')}</div>
            <button type="button" aria-label={fullText ? 'نمایش فشرده' : 'نمایش متن کامل'} aria-pressed={fullText}
              title={fullText ? 'نمایش فشرده' : 'نمایش متن کامل'} onClick={() => setFullText((value) => !value)}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${fullText ? 'border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200' : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300'}`}><AlignLeftOutlined /></button>
            <button className="rounded-lg px-3 py-1 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setAnchor(toGregorian(toPersian(anchor).add(1, 'month')))}>ماه بعد</button>
          </div>
          <div className="hidden grid-cols-7 gap-1 text-center text-xs text-slate-500 sm:grid">{['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'].map((weekday) => <div key={weekday}>{weekday}</div>)}</div>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-7 sm:gap-1">
            {days.map((day) => {
              const holiday = holidays[day.key];
              const isOfficialHoliday = holiday?.isOfficialHoliday === true;
              const isFriday = day.date.getDay() === 5;
              return <div key={day.key} data-calendar-day={day.key} className={`min-w-0 min-h-16 rounded-xl border p-3 text-right sm:min-h-[104px] sm:p-1.5 ${day.inMonth ? 'bg-white dark:bg-slate-800' : 'hidden opacity-35 sm:block'} ${isOfficialHoliday ? 'border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-200' : isFriday ? 'border-rose-200 bg-rose-50/50 text-rose-700 dark:bg-rose-950/20' : 'border-slate-100 dark:border-slate-700'} ${day.today ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-1"><b>{day.day}<span className="mr-2 text-[11px] font-medium sm:hidden">{toPersian(day.date).format('dddd')}</span></b>{day.today ? <CalendarTodayBadge /> : null}</div>
                {holiday?.occasions?.[0] ? <div className={`mt-1 ${fullText ? 'whitespace-normal break-words [overflow-wrap:anywhere]' : 'truncate'} text-[10px] font-bold ${isOfficialHoliday ? 'text-rose-700 dark:text-rose-200' : 'text-amber-700 dark:text-amber-300'}`} title={holiday.occasions.map((occasion) => occasion.title).join('، ')}>{(fullText ? holiday.occasions : holiday.occasions.slice(0, 1)).map((occasion) => occasion.title).join('، ')}</div> : null}
                <div className="mt-1 space-y-1">
                  <CalendarDayEvents key={`${token}:${day.key}`} items={events.get(day.key) || []} renderItem={(row: any) => {
                    const status = getContentCalendarStatus(row, row.kind);
                    const content = <><div className={`${fullText ? 'whitespace-normal break-words [overflow-wrap:anywhere]' : 'truncate'} font-bold`}>{row.kind === 'task' ? <CheckCircleOutlined className="ml-1" /> : <ProjectOutlined className="ml-1" />}{row.name || 'بدون عنوان'}</div>{row.kind === 'task' && row.content_type ? <Tag className="!m-0 !mt-1 !whitespace-normal !break-words" color="blue">{getContentCalendarContentTypeLabel(row.content_type)}</Tag> : null}<div className="mt-1 text-[10px]" style={{ color: status.color }}>{status.label}</div></>;
                    return row.kind === 'task'
                      ? <button type="button" key={`${row.kind}-${row.id}`} style={{ borderInlineStart: `2px solid ${status.color}` }} className="block w-full min-w-0 rounded-md bg-slate-50 p-1 text-right text-[11px] transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-700 dark:hover:bg-slate-600" onClick={() => setSelectedTask(row)}>{content}</button>
                      : <div key={`${row.kind}-${row.id}`} style={{ borderInlineStart: `2px solid ${status.color}` }} className="min-w-0 rounded-md bg-slate-50 p-1 text-[11px] dark:bg-slate-700">{content}</div>;
                  }} />
                </div>
              </div>;
            })}
          </div>
          {legend.length ? <aside aria-label="راهنمای وضعیت‌های این ماه" className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-700">
            {legend.map((status) => <span key={`${status.kind}:${status.label}:${status.color}`} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status.color }} />{status.kind === 'project' ? 'پروژه' : 'فعالیت'}: {status.label}</span>)}
          </aside> : null}
        </div>
      </section>
    </main>
    <Modal open={!!selectedTask} title={selectedTask?.name || 'جزئیات فعالیت'} footer={null} onCancel={() => setSelectedTask(null)} destroyOnHidden>
      <Descriptions column={1} size="small" bordered>
        {(selectedTask?.public_fields || []).map((field: any, index: number) => <Descriptions.Item key={`${field?.label || 'field'}-${index}`} label={field?.label || 'فیلد فعالیت'}>{formatValue(field?.value)}</Descriptions.Item>)}
        <Descriptions.Item label="زمان شروع">{formatDate(selectedTask?.start_date)}</Descriptions.Item>
        <Descriptions.Item label="موعد انجام">{formatDate(selectedTask?.due_date)}</Descriptions.Item>
        {selectedTask?.completed_at ? <Descriptions.Item label="زمان تکمیل واقعی">{formatDate(selectedTask.completed_at)}</Descriptions.Item> : null}
      </Descriptions>
    </Modal>
  </ConfigProvider>;
}
