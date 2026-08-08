import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { resolveCardStatusMeta } from "../../utils/recordCardHelpers";
import { getRecordTitle } from "../../utils/recordTitle";
import { parseDateValue, toPersianNumber } from "../../utils/persianNumberFormatter";
import { getTaskStatusLabel } from "../../utils/processTaskStatusOptions";
import { fetchAssigneeDirectory } from "../../utils/referenceData";
import { getCalendarSummaryFields } from "../../utils/calendarPresentation";
import { resolveAssigneePresentation } from "../../utils/assigneePresentation";
import IdentityAvatar from "../common/IdentityAvatar";
import { supabase } from "../../supabaseClient";
import { normalizeRoleIconKey } from "../../utils/roleIconCatalog";

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
  statusColor: string | null;
  summaryLines: Array<{ label: string; value: string }>;
};

type CalendarViewProps = {
  moduleId: string;
  moduleConfig: ModuleDefinition;
  data: any[];
  dateFields: ModuleField[];
  dateFieldKey: string;
  onDateFieldChange: (fieldKey: string) => void;
  navigate: (path: string) => void;
  canViewField?: (fieldKey: string) => boolean;
  fieldOptions?: Record<string, Array<{ value?: unknown; label?: unknown }>>;
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

const normalizeEventStatusColor = (color?: string | null) => {
  const value = String(color || "").trim();
  if (!value || value === "default") return null;
  return value;
};

const DEFAULT_STATUS_COLOR = "#9ca3af";

const getEventAccentColor = (event: CalendarEvent, fallbackColor: string) =>
  event.statusLabel ? (event.statusColor || DEFAULT_STATUS_COLOR) : fallbackColor;

const buildFieldOptionValueMap = (
  fieldOptions: Record<string, Array<{ value?: unknown; label?: unknown }>> = {},
) => Object.fromEntries(
  Object.entries(fieldOptions).map(([fieldKey, options]) => [
    fieldKey,
    Object.fromEntries(
      (options || [])
        .filter((option) => option?.value !== undefined && option?.value !== null)
        .map((option) => [String(option.value), String(option.label || option.value)]),
    ),
  ]),
);

const ModuleCalendarView: React.FC<CalendarViewProps> = ({
  moduleId,
  moduleConfig,
  data,
  dateFields,
  dateFieldKey,
  onDateFieldChange,
  navigate,
  canViewField,
  fieldOptions,
}) => {
  const [calendarMode, setCalendarMode] = useState<ModuleCalendarMode>("month");
  const [anchorDate, setAnchorDate] = useState(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return today;
  });
  const [holidaySummaries, setHolidaySummaries] = useState<Record<string, HolidayDaySummary | null>>({});
  const [expandedDayKeys, setExpandedDayKeys] = useState<string[]>([]);
  const [assigneeDirectory, setAssigneeDirectory] = useState<{ users: any[]; roles: any[] }>({ users: [], roles: [] });
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

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
    () => {
      const field = moduleConfig.fields.find((item) => item.key === "status")
        || moduleConfig.fields.find((item) => item.type === FieldType.STATUS)
        || null;
      return field && canViewField?.(field.key) !== false ? field : null;
    },
    [canViewField, moduleConfig.fields]
  );
  const fieldOptionValueMap = useMemo(() => buildFieldOptionValueMap(fieldOptions), [fieldOptions]);
  const days = useMemo(
    () => (calendarMode === "week" ? buildWeekDays(anchorDate) : buildMonthDays(anchorDate)),
    [anchorDate, calendarMode]
  );
  const currentMonthDays = useMemo(
    () => days.filter((day) => day.isCurrentMonth),
    [days]
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

  useEffect(() => {
    let isActive = true;
    fetchAssigneeDirectory(supabase)
      .then((directory) => {
        if (isActive) {
          setAssigneeDirectory({ users: directory.users || [], roles: directory.roles || [] });
        }
      })
      .catch(() => {
        if (isActive) setAssigneeDirectory({ users: [], roles: [] });
      });
    return () => {
      isActive = false;
    };
  }, []);

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
      const statusMeta = resolveCardStatusMeta(item, moduleConfig, statusField?.key);
      const statusLabel = statusField && item?.[statusField.key] !== undefined && item?.[statusField.key] !== null
        ? (
            moduleId === "tasks" && String(statusField?.key || "") === "status"
              ? getTaskStatusLabel(item[statusField.key], item, statusField.options || [])
              : formatRecordDisplayValue(item[statusField.key], statusField)
          )
        : null;
      const summaryLines = getCalendarSummaryFields(item, moduleConfig, {
        excludedFieldKeys: [selectedDateField.key, statusField?.key || ""],
        canViewField,
        limit: 2,
      }).map((field) => ({
        label: field.labels?.fa || field.key,
        value: formatRecordDisplayValue(item?.[field.key], field, fieldOptionValueMap, ""),
      })).filter((line) => Boolean(line.value));
      current.push({
        key: `${String(item?.id || key)}:${selectedDateField.key}`,
        item,
        date: eventDate,
        title: getRecordTitle(item, moduleConfig, { fallback: "-" }),
        timeLabel: selectedDateField.type === FieldType.DATETIME ? toPersianNumber(parsed.format("HH:mm")) : null,
        statusLabel,
        statusColor: normalizeEventStatusColor(statusMeta?.color),
        summaryLines,
      });
      next.set(key, current);
    });

    next.forEach((events) => {
      events.sort((left, right) => left.date.getTime() - right.date.getTime());
    });

    return next;
  }, [canViewField, data, fieldOptionValueMap, moduleConfig, selectedDateField, statusField]);

  const statusLegendItems = useMemo(() => {
    if (!statusField) return [];
    const items = new Map<string, { key: string; label: string; color: string }>();
    Array.from(eventsByDay.values()).flat().forEach((event) => {
      if (!event.statusLabel) return;
      const key = `${event.statusLabel}:${event.statusColor || DEFAULT_STATUS_COLOR}`;
      if (!items.has(key)) {
        items.set(key, { key, label: event.statusLabel, color: event.statusColor || DEFAULT_STATUS_COLOR });
      }
    });
    if (items.size > 0) return Array.from(items.values());
    return (statusField.options || []).map((option) => ({
      key: String(option.value),
      label: String(option.label || option.value),
      color: normalizeEventStatusColor(option.color) || DEFAULT_STATUS_COLOR,
    }));
  }, [eventsByDay, statusField]);

  const totalEvents = useMemo(
    () => Array.from(eventsByDay.values()).reduce((sum, items) => sum + items.length, 0),
    [eventsByDay]
  );
  const expandedDayKeySet = useMemo(() => new Set(expandedDayKeys), [expandedDayKeys]);
  const mobileMonthDays = useMemo(() => {
    const prioritized = currentMonthDays.filter((day) => {
      const hasEvents = (eventsByDay.get(day.key) || []).length > 0;
      const isHoliday = !!holidaySummaries[day.key]?.isOfficialHoliday || day.date.getDay() === 5;
      return hasEvents || day.isToday || isHoliday;
    });
    return prioritized.length > 0 ? prioritized : currentMonthDays;
  }, [currentMonthDays, eventsByDay, holidaySummaries]);

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

  useEffect(() => {
    setExpandedDayKeys([]);
  }, [anchorDate, calendarMode, selectedFieldKey]);

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

  const toggleDayExpansion = (dayKey: string) => {
    setExpandedDayKeys((prev) => (
      prev.includes(dayKey) ? prev.filter((key) => key !== dayKey) : [...prev, dayKey]
    ));
  };

  const renderEvent = (event: CalendarEvent, variant: "compact" | "comfortable") => {
    const accentColor = getEventAccentColor(event, selectedFieldColor);
    const assignee = resolveAssigneePresentation({
      source: event.item,
      allUsers: assigneeDirectory.users,
      allRoles: assigneeDirectory.roles,
    });
    const hasAssignee = Boolean(assignee.assigneeId);
    const summaryLimit = variant === "compact" ? 1 : 2;
    const eventTooltip = [
      event.title,
      ...event.summaryLines.map((line) => `${line.label}: ${line.value}`),
      assignee.label ? `مسئول: ${assignee.label}` : "",
    ].filter(Boolean).join("\n");

    return (
      <button
      key={event.key}
      type="button"
      className={[
        "w-full min-w-0 rounded-lg border border-gray-200 bg-white/90 text-right shadow-sm transition hover:border-[rgba(var(--brand-400-rgb),0.9)] hover:bg-[rgba(var(--brand-50-rgb),0.9)] dark:border-white/10 dark:bg-[#1d1d1d] dark:hover:bg-white/10",
        variant === "compact"
          ? "px-2 py-1 text-[10px] leading-4 sm:text-[11px]"
          : "px-3 py-2 text-xs leading-5",
      ].join(" ")}
      style={{ borderRight: `3px solid ${accentColor}` }}
      onClick={() => navigate(`/${moduleId}/${event.item.id}`)}
      title={eventTooltip}
    >
      {event.timeLabel ? (
        <span className={`block min-w-0 truncate font-semibold text-gray-500 dark:text-gray-400 ${variant === "compact" ? "text-[9px] leading-4 sm:text-[10px]" : "text-[11px] leading-5"}`}>
          {event.timeLabel}
        </span>
      ) : null}
      <span className="mt-0.5 flex min-w-0 items-start gap-1.5">
        <span
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white dark:bg-[#1d1d1d]"
          style={{ borderColor: accentColor }}
          title={assignee.label ? `مسئول: ${assignee.label}` : "بدون مسئول"}
        >
          {hasAssignee ? (
            <IdentityAvatar
              size={18}
              option={{
                kind: assignee.kind === "role" ? "role" : "user",
                id: assignee.assigneeId || "assignee",
                label: assignee.label || "مسئول",
                avatarUrl: assignee.avatarUrl || undefined,
                iconKey: normalizeRoleIconKey(assignee.role?.icon_key),
              }}
            />
          ) : (
            <span className="h-full w-full rounded-full" style={{ backgroundColor: accentColor }} />
          )}
        </span>
        <span className={`block min-w-0 break-words font-bold text-gray-700 dark:text-gray-100 ${variant === "compact" ? "line-clamp-2 text-[9px] leading-4 sm:text-[10px]" : "line-clamp-3 text-[11px] leading-5"}`}>
          {event.title}
        </span>
      </span>
      {event.summaryLines.slice(0, summaryLimit).map((line) => (
        <span key={line.label} className={`mt-0.5 block min-w-0 truncate text-gray-500 dark:text-gray-400 ${variant === "compact" ? "text-[9px] leading-4 sm:text-[10px]" : "text-[11px] leading-5"}`}>
          <span className="font-semibold text-gray-600 dark:text-gray-300">{line.label}: </span>
          {line.value}
        </span>
      ))}
    </button>
    );
  };

  const renderDay = (day: CalendarDay, layout: "grid" | "list" = "grid") => {
    const isListLayout = layout === "list";
    const summary = holidaySummaries[day.key];
    const events = eventsByDay.get(day.key) || [];
    const isHoliday = !!summary?.isOfficialHoliday || day.date.getDay() === 5;
    const isExpandableMonthDay = calendarMode === "month";
    const isExpanded = expandedDayKeySet.has(day.key);
    const collapsedLimit = isListLayout ? 4 : 3;
    const visibleEvents = isExpandableMonthDay && !isExpanded ? events.slice(0, collapsedLimit) : events;
    const hiddenCount = events.length - visibleEvents.length;

    return (
      <div
        key={day.key}
        data-calendar-today={day.isToday ? "true" : undefined}
        className={[
          "min-w-0 overflow-hidden border border-gray-100 transition-colors dark:border-white/10",
          isListLayout
            ? "rounded-2xl p-3"
            : calendarMode === "week"
              ? "min-h-[132px] rounded-xl p-1.5 sm:p-2"
              : "min-h-[92px] rounded-xl p-1.5 sm:min-h-[132px] sm:p-2",
          isHoliday ? "bg-rose-50/80 dark:bg-rose-950/20" : "bg-white dark:bg-[#151515]",
          day.isCurrentMonth || isListLayout ? "" : "opacity-55",
          day.isToday ? "ring-1 ring-[rgba(var(--brand-500-rgb),0.7)]" : "",
        ].join(" ")}
      >
        <div className={`mb-1.5 flex min-w-0 items-start justify-between gap-2 ${isListLayout ? "sm:items-center" : ""}`}>
          <div className="min-w-0">
            <div className={`${isListLayout ? "text-sm" : "text-xs"} font-black ${isHoliday ? "text-rose-700 dark:text-rose-300" : "text-gray-700 dark:text-gray-200"}`}>
              {day.dayLabel}
            </div>
            {calendarMode === "week" || isListLayout ? (
              <div className={`mt-0.5 truncate ${isListLayout ? "text-xs" : "text-[10px]"} ${isHoliday ? "text-rose-600 dark:text-rose-300" : "text-gray-500 dark:text-gray-400"}`}>
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
          <div className={`mb-1 truncate font-medium text-rose-600 dark:text-rose-300 ${isListLayout ? "text-[11px]" : "text-[9px]"}`} title={summary.occasions.map((item) => item.title).join("، ")}>
            {summary.occasions[0]?.title}
          </div>
        ) : null}

        <div className={isListLayout ? "space-y-2" : "space-y-1"}>
          {visibleEvents.length > 0 ? visibleEvents.map((event) => renderEvent(event, isListLayout ? "comfortable" : calendarMode === "month" ? "compact" : "comfortable")) : (
            isListLayout ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-400 dark:border-white/10 dark:bg-white/5 dark:text-gray-500">
                رکوردی در این روز ثبت نشده است.
              </div>
            ) : null
          )}
          {isExpandableMonthDay && events.length > collapsedLimit ? (
            <button
              type="button"
              className="w-full rounded-lg border border-dashed border-[rgba(var(--brand-400-rgb),0.28)] bg-[rgba(var(--brand-50-rgb),0.75)] px-2 py-1.5 text-[11px] font-bold text-[rgba(var(--brand-700-rgb),1)] transition hover:bg-[rgba(var(--brand-100-rgb),0.9)] dark:bg-[rgba(var(--brand-900-rgb),0.22)] dark:text-[rgb(var(--brand-200-rgb))]"
              onClick={() => toggleDayExpansion(day.key)}
            >
              {isExpanded ? "بستن" : `+${toPersianNumber(hiddenCount)} مورد دیگر`}
            </button>
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
              onChange={(value) => {
                setCalendarMode(value as ModuleCalendarMode);
              }}
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
        <div className="hidden shrink-0 grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-[10px] font-bold text-gray-500 dark:border-gray-800 dark:bg-white/5 dark:text-gray-300 sm:grid">
          {days.slice(0, 7).map((day) => (
            <div key={`weekday_${day.key}`} className="px-1 py-2">
              <span className="hidden sm:inline">{day.weekdayLabel}</span>
              <span className="sm:hidden">{day.weekdayShortLabel}</span>
            </div>
          ))}
        </div>
      ) : null}

       <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar sm:p-3">
        {calendarMode === "month" ? (
          <>
            <div className="space-y-2 sm:hidden">
              {mobileMonthDays.map((day) => renderDay(day, "list"))}
            </div>
            <div className="hidden grid-cols-7 gap-1 sm:grid sm:gap-2">
              {days.map((day) => renderDay(day, "grid"))}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
            {days.map((day) => renderDay(day, "grid"))}
          </div>
        )}
      </div>
      {statusLegendItems.length > 0 ? (
        <div className="shrink-0 border-t border-gray-100 px-2 py-1.5 dark:border-gray-800 sm:px-3">
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[10px] text-gray-500 dark:text-gray-400">
            {statusLegendItems.map((item) => (
              <span key={item.key} className="inline-flex items-center gap-1 whitespace-nowrap">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ModuleCalendarView;
