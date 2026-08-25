import React, { useMemo, useState } from 'react';
import { Button, Empty, Segmented, Tag, Tooltip } from 'antd';
import { CalendarOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import DateObject from 'react-date-object';
import gregorian from 'react-date-object/calendars/gregorian';
import persian from 'react-date-object/calendars/persian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import persian_fa from 'react-date-object/locales/persian_fa';
import { CAMPAIGN_TOOL_STATUS_OPTIONS, getCampaignToolLabel } from '../../utils/advertisingCampaigns';
import { parseDateValue, toPersianNumber } from '../../utils/persianNumberFormatter';
import AdaptiveSelectField from '../AdaptiveSelectField';
import type { CampaignToolRecord } from './types';

export type CampaignRangeDateField =
  | 'planned_start_at'
  | 'planned_end_at'
  | 'actual_start_at'
  | 'actual_end_at';

type CampaignRangeCalendarProps = {
  tools: CampaignToolRecord[];
  startFieldKey: CampaignRangeDateField;
  endFieldKey: CampaignRangeDateField;
  onStartFieldChange: (field: CampaignRangeDateField) => void;
  onEndFieldChange: (field: CampaignRangeDateField) => void;
  onToolOpen: (tool: CampaignToolRecord) => void;
};

type DayCell = {
  key: string;
  date: Date;
  day: string;
  weekday: string;
  currentMonth: boolean;
  today: boolean;
};

export type CampaignRangeSegment = {
  tool: CampaignToolRecord;
  dateKey: string;
  isStart: boolean;
  isEnd: boolean;
};

const TOOL_COLORS = ['#2563eb', '#16a34a', '#f97316', '#7c3aed', '#0891b2', '#db2777', '#ca8a04', '#dc2626'];

const toDateKey = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const addDays = (date: Date, count: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  next.setHours(12, 0, 0, 0);
  return next;
};

const normalizeDate = (value: unknown) => {
  const parsed = parseDateValue(value);
  if (!parsed) return null;
  const date = parsed.toDate();
  date.setHours(12, 0, 0, 0);
  return date;
};

const toPersianDate = (date: Date) => (
  new DateObject({ date, calendar: gregorian, locale: gregorian_en }).convert(persian, persian_fa)
);

const toGregorianDate = (date: DateObject) => new DateObject(date).convert(gregorian, gregorian_en).toDate();

const makePersianDate = (year: number, month: number, day: number) => new DateObject({
  year,
  month,
  day,
  hour: 12,
  calendar: persian,
  locale: persian_fa,
});

const buildDayCell = (date: Date, monthYear: number, monthNumber: number): DayCell => {
  const persianDate = toPersianDate(date);
  return {
    key: toDateKey(date),
    date,
    day: toPersianNumber(persianDate.format('D')),
    weekday: persianDate.format('dddd'),
    currentMonth: persianDate.year === monthYear && persianDate.month.number === monthNumber,
    today: toDateKey(date) === toDateKey(new Date()),
  };
};

const getSaturdayOffset = (date: Date) => (date.getDay() + 1) % 7;

const buildMonthDays = (anchor: Date) => {
  const persianAnchor = toPersianDate(anchor);
  const firstDay = toGregorianDate(makePersianDate(persianAnchor.year, persianAnchor.month.number, 1));
  const start = addDays(firstDay, -getSaturdayOffset(firstDay));
  return Array.from({ length: 42 }, (_, index) => (
    buildDayCell(addDays(start, index), persianAnchor.year, persianAnchor.month.number)
  ));
};

const buildWeekDays = (anchor: Date) => {
  const persianAnchor = toPersianDate(anchor);
  const start = addDays(anchor, -getSaturdayOffset(anchor));
  return Array.from({ length: 7 }, (_, index) => (
    buildDayCell(addDays(start, index), persianAnchor.year, persianAnchor.month.number)
  ));
};

export const buildCampaignRangeSegments = (
  tools: CampaignToolRecord[],
  startFieldKey: CampaignRangeDateField,
  endFieldKey: CampaignRangeDateField,
) => {
  const segments = new Map<string, CampaignRangeSegment[]>();
  tools.forEach((tool) => {
    const rawStart = tool[startFieldKey];
    const rawEnd = tool[endFieldKey];
    const first = normalizeDate(rawStart || rawEnd);
    const second = normalizeDate(rawEnd || rawStart);
    if (!first || !second) return;
    const start = first.getTime() <= second.getTime() ? first : second;
    const end = first.getTime() <= second.getTime() ? second : first;
    const totalDays = Math.min(730, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
    for (let index = 0; index <= totalDays; index += 1) {
      const date = addDays(start, index);
      const dateKey = toDateKey(date);
      const current = segments.get(dateKey) || [];
      current.push({
        tool,
        dateKey,
        isStart: index === 0,
        isEnd: index === totalDays,
      });
      segments.set(dateKey, current);
    }
  });
  return segments;
};

const START_FIELD_OPTIONS = [
  { label: 'شروع برنامه‌ریزی‌شده', value: 'planned_start_at' },
  { label: 'شروع واقعی', value: 'actual_start_at' },
];

const END_FIELD_OPTIONS = [
  { label: 'پایان برنامه‌ریزی‌شده', value: 'planned_end_at' },
  { label: 'پایان واقعی', value: 'actual_end_at' },
];

const CampaignRangeCalendar: React.FC<CampaignRangeCalendarProps> = ({
  tools,
  startFieldKey,
  endFieldKey,
  onStartFieldChange,
  onEndFieldChange,
  onToolOpen,
}) => {
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return today;
  });

  const days = useMemo(() => mode === 'week' ? buildWeekDays(anchor) : buildMonthDays(anchor), [anchor, mode]);
  const segments = useMemo(
    () => buildCampaignRangeSegments(tools.filter((tool) => tool.enabled !== false), startFieldKey, endFieldKey),
    [endFieldKey, startFieldKey, tools],
  );
  const toolTypeOrder = useMemo(() => Array.from(new Set(tools.map((tool) => String(tool.tool_type)))), [tools]);
  const colorMap = useMemo(() => Object.fromEntries(toolTypeOrder.map((type, index) => [type, TOOL_COLORS[index % TOOL_COLORS.length]])), [toolTypeOrder]);
  const anchorLabel = useMemo(() => {
    if (mode === 'month') return toPersianNumber(toPersianDate(anchor).format('MMMM YYYY'));
    return toPersianNumber(`${toPersianDate(days[0]?.date || anchor).format('D MMMM')} تا ${toPersianDate(days[days.length - 1]?.date || anchor).format('D MMMM YYYY')}`);
  }, [anchor, days, mode]);

  const move = (amount: number) => {
    if (mode === 'week') {
      setAnchor((current) => addDays(current, amount * 7));
      return;
    }
    setAnchor((current) => {
      const next = toGregorianDate(toPersianDate(current).add(amount, 'month'));
      next.setHours(12, 0, 0, 0);
      return next;
    });
  };

  const resetToday = () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    setAnchor(today);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-white/5 sm:p-4">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:w-[42rem]">
          <label className="min-w-0 text-xs font-semibold text-gray-500">
            معیار شروع
            <AdaptiveSelectField
              value={startFieldKey}
              options={START_FIELD_OPTIONS}
              onChange={(value) => onStartFieldChange(value as CampaignRangeDateField)}
              pickerTitle="انتخاب معیار شروع تقویم"
              className="mt-1 w-full"
            />
          </label>
          <label className="min-w-0 text-xs font-semibold text-gray-500">
            معیار پایان
            <AdaptiveSelectField
              value={endFieldKey}
              options={END_FIELD_OPTIONS}
              onChange={(value) => onEndFieldChange(value as CampaignRangeDateField)}
              pickerTitle="انتخاب معیار پایان تقویم"
              className="mt-1 w-full"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 xl:justify-end">
          <Segmented
            value={mode}
            options={[{ label: 'ماه', value: 'month' }, { label: 'هفته', value: 'week' }]}
            onChange={(value) => setMode(value as 'month' | 'week')}
          />
          <Button onClick={resetToday}>امروز</Button>
          <Button.Group>
            <Button icon={<RightOutlined />} onClick={() => move(-1)} aria-label="بازه قبلی" />
            <Button icon={<LeftOutlined />} onClick={() => move(1)} aria-label="بازه بعدی" />
          </Button.Group>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-center gap-2 text-base font-black text-gray-800 dark:text-gray-100">
        <CalendarOutlined /> {anchorLabel}
      </div>

      <div className="hidden grid-cols-7 gap-1 text-center text-[11px] font-bold text-gray-500 sm:grid">
        {['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'].map((day) => <div key={day}>{day}</div>)}
      </div>

      {tools.length === 0 ? <Empty description="ابزاری برای نمایش در تقویم وجود ندارد" /> : (
        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-7 sm:gap-1">
          {days.map((day) => {
            const daySegments = segments.get(day.key) || [];
            return (
              <div
                key={day.key}
                className={`min-w-0 rounded-xl border p-2 sm:min-h-[8.5rem] ${day.today ? 'border-[rgb(var(--brand-500-rgb))] ring-1 ring-[rgba(var(--brand-400-rgb),0.45)]' : 'border-gray-100 dark:border-white/10'} ${day.currentMonth ? 'bg-white dark:bg-black/10' : 'bg-gray-50 opacity-60 dark:bg-white/5'}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-black text-gray-700 dark:text-gray-200">{day.day}</span>
                  <span className="text-[10px] text-gray-400 sm:hidden">{day.weekday}</span>
                  {day.today ? <Tag color="blue" className="!m-0 !px-1 !text-[9px]">امروز</Tag> : null}
                </div>
                <div className="space-y-1">
                  {daySegments.slice(0, mode === 'month' ? 4 : 8).map((segment) => {
                    const color = colorMap[String(segment.tool.tool_type)] || TOOL_COLORS[0];
                    const title = getCampaignToolLabel(segment.tool.tool_type);
                    const statusLabel = CAMPAIGN_TOOL_STATUS_OPTIONS.find((option) => option.value === segment.tool.status)?.label || 'وضعیت تعریف‌نشده';
                    return (
                      <Tooltip key={`${segment.tool.id}:${day.key}`} title={`${title} — ${statusLabel}`}>
                        <button
                          type="button"
                          onClick={() => onToolOpen(segment.tool)}
                          className={`block w-full truncate px-1.5 py-1 text-right text-[10px] font-bold text-white shadow-sm transition hover:brightness-110 ${segment.isStart ? 'rounded-r-lg' : ''} ${segment.isEnd ? 'rounded-l-lg' : ''}`}
                          style={{ backgroundColor: color }}
                        >
                          {segment.isStart || mode === 'week' ? title : '←'}
                        </button>
                      </Tooltip>
                    );
                  })}
                  {daySegments.length > (mode === 'month' ? 4 : 8) ? (
                    <div className="text-[10px] font-semibold text-gray-400">+ {toPersianNumber(daySegments.length - (mode === 'month' ? 4 : 8))} مورد</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3 border-t border-gray-100 pt-3 text-xs dark:border-white/10">
        {toolTypeOrder.map((type) => (
          <span key={type} className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorMap[type] }} />
            {getCampaignToolLabel(type)}
          </span>
        ))}
      </div>
    </section>
  );
};

export default CampaignRangeCalendar;
