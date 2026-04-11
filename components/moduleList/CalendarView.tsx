import React, { useEffect, useMemo, useState } from "react";
import { Button, Empty, Segmented, Select, Tag } from "antd";
import {
  CalendarOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import DateObject from "react-date-object";
import gregorian from "react-date-object/calendars/gregorian";
import persian from "react-date-object/calendars/persian";
import gregorian_en from "react-date-object/locales/gregorian_en";
import persian_fa from "react-date-object/locales/persian_fa";
import { FieldType, ModuleDefinition, ModuleField } from "../../types";
import { getHolidaySummaryForDate, type HolidayDaySummary } from "../../utils/holidayCalendar";
import { formatRecordDisplayValue } from "../../utils/recordDisplayFormatter";
import { getRecordTitle } from "../../utils/recordTitle";
import { parseDateValue, toPersianNumber } from "../../utils/persianNumberFormatter";
import { getTaskStatusLabel } from "../../utils/processTaskStatusOptions";

export type ModuleCalendarMode = "month" | "week";

type CalendarDay = {
  key: string;
  date: Date;
  dayLabel: string;
  weekdayLabel: string;
  weekdayShortLabel: string;
  isCurrentMonth: boolean;
  isToday: boolean;
};

type CalendarEvent = {
  key: string;
  item: any;
  date: Date;
  title: string;
  timeLabel: string | null;
  statusLabel: string | null;
};

type CalendarViewProps = {
  moduleId: string;
  moduleConfig: ModuleDefinition;
  data: any[];
  dateFields: ModuleField[];
  dateFieldKey: string;
  onDateFieldChange: (fieldKey: string) => void;
  navigate: (path: string) => void;
};

const DATE_FIELD_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#db2777",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
  "#dc2626",
];

const toDateKey = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(12, 0, 0, 0);
  return next;
};

const getSaturdayOffset = (date: Date) => (date.getDay() + 1) % 7;

const toPersianDateObject = (date: Date) =>
  new DateObject({ date, calendar: gregorian, locale: gregorian_en }).convert(persian, persian_fa);

const toGregorianDate = (date: DateObject) =>
  new DateObject(date).convert(gregorian, gregorian_en).toDate();

const createPersianDate = (year: number, month: number, day: number) =>
  new DateObject({
    year,
    month,
    day,
    hour: 12,
    minute: 0,
    second: 0,
    millisecond: 0,
    calendar: persian,
    locale: persian_fa,
  });

const isSameLocalDay = (left: Date, right: Date) => toDateKey(left) === toDateKey(right);

const buildCalendarDay = (date: Date, currentYear: number, currentMonth: number): CalendarDay => {
  const persianDate = toPersianDateObject(date);
  const weekdayLabel = persianDate.format("dddd");
  return {
    key: toDateKey(date),
    date,
    dayLabel: toPersianNumber(persianDate.format("D")),
    weekdayLabel,
    weekdayShortLabel: weekdayLabel.slice(0, 2),
    isCurrentMonth: persianDate.year === currentYear && persianDate.month.number === currentMonth,
    isToday: isSameLocalDay(date, new Date()),
  };
};

const buildMonthDays = (anchorDate: Date) => {
  const persianAnchor = toPersianDateObject(anchorDate);
  const monthStart = toGregorianDate(createPersianDate(persianAnchor.year, persianAnchor.month.number, 1));
  const gridStart = addDays(monthStart, -getSaturdayOffset(monthStart));

  return Array.from({ length: 42 }).map((_, index) =>
    buildCalendarDay(addDays(gridStart, index), persianAnchor.year, persianAnchor.month.number)
  );
};

const buildWeekDays = (anchorDate: Date) => {
  const start = addDays(anchorDate, -getSaturdayOffset(anchorDate));
  const persianAnchor = toPersianDateObject(anchorDate);
  return Array.from({ length: 7 }).map((_, index) =>
    buildCalendarDay(addDays(start, index), persianAnchor.year, persianAnchor.month.number)
  );
};

const getFieldColor = (dateFields: ModuleField[], fieldKey: string) => {
  const index = Math.max(0, dateFields.findIndex((field) => field.key === fieldKey));
  return DATE_FIELD_COLORS[index % DATE_FIELD_COLORS.length];
};

const ModuleCalendarView: React.FC<CalendarViewProps> = ({
  moduleId,
  moduleConfig,
  data,
  dateFields,
  dateFieldKey,
  onDateFieldChange,
  navigate,
}) => {
  const [calendarMode, setCalendarMode] = useState<ModuleCalendarMode>("month");
  const [anchorDate, setAnchorDate] = useState(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return today;
  });
  const [holidaySummaries, setHolidaySummaries] = useState<Record<string, HolidayDaySummary | null>>({});

  const selectedDateField = useMemo(
    () => dateFields.find((field) => field.key === dateFieldKey) || dateFields[0] || null,
    [dateFieldKey, dateFields]
  );
  const selectedFieldKey = selectedDateField?.key || "";
  const selectedFieldColor = useMemo(
    () => getFieldColor(dateFields, selectedFieldKey),
    [dateFields, selectedFieldKey]
  );
  const statusField = useMemo(
    () => moduleConfig.fields.find((field) => field.type === FieldType.STATUS || field.key === "status") || null,
    [moduleConfig.fields]
  );
  const days = useMemo(
    () => (calendarMode === "week" ? buildWeekDays(anchorDate) : buildMonthDays(anchorDate)),
    [anchorDate, calendarMode]
  );
  const persianAnchorLabel = useMemo(() => {
    const persianAnchor = toPersianDateObject(anchorDate);
    if (calendarMode === "month") {
      return toPersianNumber(persianAnchor.format("MMMM YYYY"));
    }
    const first = toPersianDateObject(days[0]?.date || anchorDate).format("D MMMM");
    const last = toPersianDateObject(days[days.length - 1]?.date || anchorDate).format("D MMMM YYYY");
    return toPersianNumber(`${first} تا ${last}`);
  }, [anchorDate, calendarMode, days]);

  const eventsByDay = useMemo(() => {
    const next = new Map<string, CalendarEvent[]>();
    if (!selectedDateField) return next;

    data.forEach((item) => {
      const rawValue = item?.[selectedDateField.key];
      const parsed = parseDateValue(rawValue);
      if (!parsed) return;
      const eventDate = parsed.toDate();
      const key = toDateKey(eventDate);
      const current = next.get(key) || [];
      const statusLabel = statusField && item?.[statusField.key] !== undefined && item?.[statusField.key] !== null
        ? (
            moduleId === "tasks" && String(statusField?.key || "") === "status"
              ? getTaskStatusLabel(item[statusField.key], item, statusField.options || [])
              : formatRecordDisplayValue(item[statusField.key], statusField)
          )
        : null;
      current.push({
        key: `${String(item?.id || key)}:${selectedDateField.key}`,
        item,
        date: eventDate,
        title: getRecordTitle(item, moduleConfig, { fallback: "-" }),
        timeLabel: selectedDateField.type === FieldType.DATETIME ? toPersianNumber(parsed.format("HH:mm")) : null,
        statusLabel,
      });
      next.set(key, current);
    });

    next.forEach((events) => {
      events.sort((left, right) => left.date.getTime() - right.date.getTime());
    });

    return next;
  }, [data, moduleConfig, selectedDateField, statusField]);

  const totalEvents = useMemo(
    () => Array.from(eventsByDay.values()).reduce((sum, items) => sum + items.length, 0),
    [eventsByDay]
  );

  useEffect(() => {
    let isActive = true;
    const uniqueDays = Array.from(new Map(days.map((day) => [day.key, day])).values());

    void Promise.all(
      uniqueDays.map(async (day) => {
        const summary = await getHolidaySummaryForDate(day.date);
        return [day.key, summary] as const;
      })
    ).then((entries) => {
      if (!isActive) return;
      setHolidaySummaries(Object.fromEntries(entries));
    });

    return () => {
      isActive = false;
    };
  }, [days]);

  const moveAnchor = (amount: number) => {
    if (calendarMode === "week") {
      setAnchorDate((prev) => addDays(prev, amount * 7));
      return;
    }

    setAnchorDate((prev) => {
      const persianDate = toPersianDateObject(prev).add(amount, "month");
      const next = toGregorianDate(persianDate);
      next.setHours(12, 0, 0, 0);
      return next;
    });
  };

  const resetToday = () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    setAnchorDate(today);
  };

  const renderEvent = (event: CalendarEvent, compact: boolean) => (
    <button
      key={event.key}
      type="button"
      className="w-full min-w-0 rounded-lg border border-gray-200 bg-white/90 px-2 py-1 text-right text-[10px] leading-4 shadow-sm transition hover:border-[rgba(var(--brand-400-rgb),0.9)] hover:bg-[rgba(var(--brand-50-rgb),0.9)] dark:border-white/10 dark:bg-[#1d1d1d] dark:hover:bg-white/10 sm:text-[11px]"
      style={{ borderRight: `3px solid ${selectedFieldColor}` }}
      onClick={() => navigate(`/${moduleId}/${event.item.id}`)}
      title={event.title}
    >
      {event.timeLabel ? (
        <span className="block min-w-0 truncate text-[9px] font-semibold leading-4 text-gray-500 dark:text-gray-400 sm:text-[10px]">
          {event.timeLabel}
        </span>
      ) : null}
      <span className="mt-0.5 block min-w-0 line-clamp-2 break-words text-[9px] font-bold leading-4 text-gray-700 dark:text-gray-100 sm:text-[10px]">
        {event.title}
      </span>
      {!compact && event.statusLabel ? (
        <span className="mt-0.5 block min-w-0 truncate text-[10px] text-gray-500 dark:text-gray-400">
          {event.statusLabel}
        </span>
      ) : null}
    </button>
  );

  const renderDay = (day: CalendarDay) => {
    const summary = holidaySummaries[day.key];
    const events = eventsByDay.get(day.key) || [];
    const isHoliday = !!summary?.isOfficialHoliday || day.date.getDay() === 5;
    const visibleEvents = calendarMode === "month" ? events.slice(0, 3) : events;
    const hiddenCount = events.length - visibleEvents.length;

    return (
      <div
        key={day.key}
        className={[
          "min-w-0 overflow-hidden border border-gray-100 p-1.5 transition-colors dark:border-white/10 sm:p-2",
          calendarMode === "week" ? "min-h-[132px] rounded-xl" : "min-h-[92px] sm:min-h-[132px]",
          isHoliday ? "bg-rose-50/80 dark:bg-rose-950/20" : "bg-white dark:bg-[#151515]",
          day.isCurrentMonth ? "" : "opacity-55",
          day.isToday ? "ring-1 ring-[rgba(var(--brand-500-rgb),0.7)]" : "",
        ].join(" ")}
      >
        <div className="mb-1.5 flex min-w-0 items-start justify-between gap-1">
          <div className="min-w-0">
            <div className={`text-xs font-black ${isHoliday ? "text-rose-700 dark:text-rose-300" : "text-gray-700 dark:text-gray-200"}`}>
              {day.dayLabel}
            </div>
            {calendarMode === "week" ? (
              <div className={`mt-0.5 truncate text-[10px] ${isHoliday ? "text-rose-600 dark:text-rose-300" : "text-gray-500 dark:text-gray-400"}`}>
                {day.weekdayLabel}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {day.isToday ? <Tag color="blue" className="!m-0 !px-1 !text-[9px]">امروز</Tag> : null}
            {isHoliday ? <span className="h-2 w-2 rounded-full bg-rose-500" title={summary?.jalaliLabel || "تعطیل"} /> : null}
          </div>
        </div>

        {isHoliday && summary?.occasions?.length ? (
          <div className="mb-1 truncate text-[9px] font-medium text-rose-600 dark:text-rose-300" title={summary.occasions.map((item) => item.title).join("، ")}>
            {summary.occasions[0]?.title}
          </div>
        ) : null}

        <div className="space-y-1">
          {visibleEvents.map((event) => renderEvent(event, calendarMode === "month"))}
          {hiddenCount > 0 ? (
            <div className="rounded-lg bg-gray-100 px-2 py-1 text-[10px] text-gray-500 dark:bg-white/10 dark:text-gray-300">
              +{toPersianNumber(hiddenCount)} مورد دیگر
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  if (!selectedDateField || dateFields.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-[1.5rem] border border-dashed border-gray-300 bg-white dark:border-gray-700 dark:bg-[#1a1a1a]">
        <Empty description="برای این ماژول فیلد تاریخ قابل نمایش پیدا نشد." />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1a1a1a]">
      <div className="shrink-0 border-b border-gray-200 p-2 dark:border-gray-800 sm:p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-2">
              <CalendarOutlined className="shrink-0 text-[rgba(var(--brand-600-rgb),1)]" />
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-gray-800 dark:text-white">{persianAnchorLabel}</div>
                <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                  {toPersianNumber(totalEvents)} رکورد بر اساس {selectedDateField.labels?.fa || selectedDateField.key}
                </div>
              </div>
            </div>
            <Select
              size="small"
              className="w-full sm:w-56"
              value={selectedFieldKey}
              options={dateFields.map((field) => ({
                value: field.key,
                label: field.labels?.fa || field.key,
              }))}
              onChange={onDateFieldChange}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              size="small"
              value={calendarMode}
              options={[
                { label: "ماهانه", value: "month" },
                { label: "هفتگی", value: "week" },
              ]}
              onChange={(value) => setCalendarMode(value as ModuleCalendarMode)}
            />
            <div className="flex items-center gap-1">
              <Button size="small" icon={<RightOutlined />} onClick={() => moveAnchor(-1)} />
              <Button size="small" onClick={resetToday}>امروز</Button>
              <Button size="small" icon={<LeftOutlined />} onClick={() => moveAnchor(1)} />
            </div>
          </div>
        </div>
      </div>

      {calendarMode === "month" ? (
        <div className="grid shrink-0 grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-[10px] font-bold text-gray-500 dark:border-gray-800 dark:bg-white/5 dark:text-gray-300">
          {days.slice(0, 7).map((day) => (
            <div key={`weekday_${day.key}`} className="px-1 py-2">
              <span className="hidden sm:inline">{day.weekdayLabel}</span>
              <span className="sm:hidden">{day.weekdayShortLabel}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar sm:p-3">
        {calendarMode === "month" ? (
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {days.map(renderDay)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
            {days.map(renderDay)}
          </div>
        )}
      </div>
    </div>
  );
};

export default ModuleCalendarView;
