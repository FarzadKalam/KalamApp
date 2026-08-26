import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Modal, Segmented, Select, Spin, Tag } from 'antd';
import { CalendarOutlined, LeftOutlined, PlusOutlined, ProjectOutlined, RightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import DateObject from 'react-date-object';
import gregorian from 'react-date-object/calendars/gregorian';
import persian from 'react-date-object/calendars/persian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import persian_fa from 'react-date-object/locales/persian_fa';
import { supabase } from '../../supabaseClient';
import { openTaskProcessModal } from '../../utils/taskProcessModalEvents';
import { getRecordTitle } from '../../utils/recordTitle';
import { MODULES } from '../../moduleRegistry';

type RuntimeItem = { id: string; kind: 'task' | 'project'; record: any; date: Date; inherited?: boolean };

const asDate = (value: any) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const toKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (date: Date, amount: number) => { const next = new Date(date); next.setDate(next.getDate() + amount); next.setHours(12, 0, 0, 0); return next; };
const toPersian = (date: Date) => new DateObject({ date, calendar: gregorian, locale: gregorian_en }).convert(persian, persian_fa);
const toGregorian = (date: DateObject) => new DateObject(date).convert(gregorian, gregorian_en).toDate();
const makePersianDate = (year: number, month: number, day: number) => new DateObject({ year, month, day, hour: 12, minute: 0, second: 0, calendar: persian, locale: persian_fa });

const buildDays = (anchor: Date) => {
  const source = toPersian(anchor);
  const start = toGregorian(makePersianDate(source.year, source.month.number, 1));
  const offset = (start.getDay() + 1) % 7;
  const gridStart = addDays(start, -offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const persianDate = toPersian(date);
    return { date, key: toKey(date), day: persianDate.format('D'), inMonth: persianDate.year === source.year && persianDate.month.number === source.month.number };
  });
};

const ContentCalendarRuntime: React.FC<{ calendar: any; canEdit?: boolean }> = ({ calendar, canEdit = false }) => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const calendarId = String(calendar?.id || '').trim();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [mode, setMode] = useState<'all' | 'tasks' | 'projects'>('all');
  const [taskDateField, setTaskDateField] = useState('due_date');
  const [projectDateField, setProjectDateField] = useState('due_date');
  const [anchor, setAnchor] = useState(() => new Date());
  const [createDate, setCreateDate] = useState<Date | null>(null);

  const load = async () => {
    if (!calendarId) return;
    setLoading(true);
    try {
      const projectsResult = await supabase.from('projects').select('id,name,status,priority,start_date,due_date,completed_at,customer_id,content_calendar_id,updated_at').eq('content_calendar_id', calendarId).order('due_date', { ascending: true }).limit(500);
      if (projectsResult.error) throw projectsResult.error;
      const directTasksResult = await supabase.from('tasks').select('id,name,status,priority,start_date,due_date,completed_at,project_id,content_calendar_id,related_to_module,updated_at').eq('content_calendar_id', calendarId).order('due_date', { ascending: true }).limit(1000);
      if (directTasksResult.error) throw directTasksResult.error;
      const projectRows = projectsResult.data || [];
      const projectIds = projectRows.map((row: any) => String(row.id)).filter(Boolean);
      const inheritedResult = projectIds.length
        ? await supabase.from('tasks').select('id,name,status,priority,start_date,due_date,completed_at,project_id,content_calendar_id,related_to_module,updated_at').in('project_id', projectIds).order('due_date', { ascending: true }).limit(2000)
        : { data: [], error: null } as any;
      if (inheritedResult.error) throw inheritedResult.error;
      const directMap = new Map((directTasksResult.data || []).map((row: any) => [String(row.id), { ...row, __contentCalendarInherited: false }]));
      (inheritedResult.data || []).forEach((row: any) => {
        if (!directMap.has(String(row.id))) directMap.set(String(row.id), { ...row, __contentCalendarInherited: true });
      });
      setProjects(projectRows);
      setTasks(Array.from(directMap.values()));
    } catch (error: any) {
      message.error(`بارگذاری تقویم ناموفق بود: ${String(error?.message || 'خطای نامشخص')}`);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [calendarId]);

  const days = useMemo(() => buildDays(anchor), [anchor]);
  const eventMap = useMemo(() => {
    const entries: RuntimeItem[] = [];
    if (mode !== 'projects') projects.forEach((record) => { const date = asDate(record?.[projectDateField]); if (date) entries.push({ id: String(record.id), kind: 'project', record, date }); });
    if (mode !== 'tasks') tasks.forEach((record) => { const date = asDate(record?.[taskDateField]); if (date) entries.push({ id: String(record.id), kind: 'task', record, date, inherited: record.__contentCalendarInherited === true }); });
    return entries.reduce((map, item) => { const key = toKey(item.date); map.set(key, [...(map.get(key) || []), item]); return map; }, new Map<string, RuntimeItem[]>());
  }, [mode, projectDateField, projects, taskDateField, tasks]);
  const anchorLabel = useMemo(() => toPersian(anchor).format('MMMM YYYY'), [anchor]);

  const openCreate = (kind: 'task' | 'project') => {
    if (!createDate) return;
    const key = toKey(createDate);
    if (kind === 'task') {
      navigate('/tasks/create', { state: { initialValues: { content_calendar_id: calendarId, start_date: `${key}T09:00:00`, due_date: `${key}T17:00:00` } } });
    } else {
      navigate('/projects/create', { state: { initialValues: { content_calendar_id: calendarId, customer_id: calendar?.customer_id || null, source_invoice_id: calendar?.source_invoice_id || null, start_date: key, due_date: key } } });
    }
    setCreateDate(null);
  };

  return <Card className="mt-5 !rounded-2xl" title={<span className="inline-flex items-center gap-2"><CalendarOutlined />تقویم اجرا</span>} extra={<Button size="small" onClick={() => void load()}>به‌روزرسانی</Button>}>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Segmented value={mode} onChange={(value) => setMode(value as any)} options={[{ label: 'همه', value: 'all' }, { label: 'فعالیت‌ها', value: 'tasks' }, { label: 'پروژه‌ها', value: 'projects' }]} />
      <Select size="small" value={taskDateField} onChange={setTaskDateField} options={[{ value: 'start_date', label: 'تاریخ فعالیت: شروع' }, { value: 'due_date', label: 'تاریخ فعالیت: مهلت' }, { value: 'completed_at', label: 'تاریخ فعالیت: تکمیل' }]} />
      <Select size="small" value={projectDateField} onChange={setProjectDateField} options={[{ value: 'start_date', label: 'تاریخ پروژه: شروع' }, { value: 'due_date', label: 'تاریخ پروژه: پایان' }, { value: 'completed_at', label: 'تاریخ پروژه: تکمیل' }]} />
    </div>
    {loading ? <div className="py-12 text-center"><Spin /></div> : <>
      <div className="mb-3 flex items-center justify-between"><Button type="text" icon={<RightOutlined />} onClick={() => { const source = toPersian(anchor).add(-1, 'month'); setAnchor(toGregorian(source)); }} /><div className="font-black">{anchorLabel}</div><Button type="text" icon={<LeftOutlined />} onClick={() => { const source = toPersian(anchor).add(1, 'month'); setAnchor(toGregorian(source)); }} /></div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500">{['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((name) => <div key={name}>{name}</div>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => <div key={day.key} className={`min-h-[108px] rounded-xl border p-1.5 text-right ${day.inMonth ? 'bg-white dark:bg-[#171717]' : 'opacity-45'} dark:border-white/10`}>
          <div className="mb-1 flex items-center justify-between"><span className="text-xs font-bold">{day.day}</span>{canEdit && <Button aria-label="افزودن به این روز" type="text" size="small" icon={<PlusOutlined />} className="!h-5 !w-5 !min-w-5 !p-0" onClick={() => setCreateDate(day.date)} />}</div>
          {(eventMap.get(day.key) || []).slice(0, 3).map((item) => <button type="button" key={`${item.kind}:${item.id}`} onClick={() => item.kind === 'task' ? openTaskProcessModal({ taskId: item.id, task: item.record }) : navigate(`/projects/${item.id}`)} className={`mb-1 block w-full rounded-md border px-1.5 py-1 text-right text-[10px] font-semibold ${item.kind === 'task' ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200' : 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-200'}`}><span className="ml-1">{item.kind === 'project' ? <ProjectOutlined /> : null}</span>{getRecordTitle(item.record, MODULES[item.kind === 'task' ? 'tasks' : 'projects'], { fallback: 'بدون عنوان' })}{item.inherited ? <Tag className="!mr-1 !px-1 !text-[8px]" color="default">پروژه</Tag> : null}</button>)}
          {(eventMap.get(day.key) || []).length > 3 ? <span className="text-[10px] text-gray-500">+{(eventMap.get(day.key) || []).length - 3}</span> : null}
        </div>)}
      </div>
      {projects.length + tasks.length === 0 ? <Empty className="mt-5" description="هنوز پروژه یا فعالیتی به این تقویم متصل نشده است." /> : null}
    </>}
    <Modal open={!!createDate} title={`افزودن در ${createDate ? toPersian(createDate).format('YYYY/MM/DD') : ''}`} footer={null} onCancel={() => setCreateDate(null)}>
      <div className="grid gap-2"><Button block icon={<PlusOutlined />} onClick={() => openCreate('task')}>افزودن فعالیت (اقدام تک‌مرحله‌ای)</Button><Button block icon={<ProjectOutlined />} type="primary" onClick={() => openCreate('project')}>افزودن پروژه (فرآیند چندمرحله‌ای)</Button></div>
    </Modal>
  </Card>;
};

export default ContentCalendarRuntime;
