import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarOutlined } from "@ant-design/icons";
import { Calendar } from "react-multi-date-picker";
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import gregorian from "react-date-object/calendars/gregorian";
import gregorian_en from "react-date-object/locales/gregorian_en";
import { toPersianNumber } from "../utils/persianNumberFormatter";
import AdaptivePickerSurface from "./AdaptivePickerSurface";
import { type AdaptivePickerMode, buildOverlayZIndexBase } from "../utils/popupContainer";

export type PersianDateRangeValue = [string | null, string | null];

interface PersianDateRangePickerProps {
  value?: PersianDateRangeValue | null;
  onChange?: (val: PersianDateRangeValue | null) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  zIndex?: number;
  modalContainer?: (trigger?: HTMLElement | null) => HTMLElement;
  overlayZIndexBase?: number;
  adaptiveMode?: AdaptivePickerMode;
  pickerTitle?: string;
}

const normalizeDigits = (value: string) =>
  String(value || "")
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));

const toPersianDateObject = (value?: string | null): DateObject | null => {
  if (!value) return null;
  try {
    return new DateObject({
      date: normalizeDigits(value),
      format: "YYYY-MM-DD",
      calendar: gregorian,
      locale: gregorian_en,
    }).convert(persian, persian_fa);
  } catch {
    return null;
  }
};

const fromJsDate = (date: Date) =>
  new DateObject({
    date,
    calendar: gregorian,
    locale: gregorian_en,
  }).convert(persian, persian_fa);

const serializeDateObject = (value: DateObject | null) => {
  if (!value) return null;
  try {
    return new DateObject(value).convert(gregorian, gregorian_en).format("YYYY-MM-DD");
  } catch {
    return null;
  }
};

const compareDateObjects = (a: DateObject | null, b: DateObject | null) => {
  const aValue = serializeDateObject(a);
  const bValue = serializeDateObject(b);
  if (!aValue || !bValue) return 0;
  return aValue.localeCompare(bValue);
};

const normalizeDraftRange = (range: [DateObject | null, DateObject | null]): [DateObject | null, DateObject | null] => {
  const [start, end] = range;
  if (start && end && compareDateObjects(start, end) > 0) return [end, start];
  return [start, end];
};

const createDraftRange = (value?: PersianDateRangeValue | null): [DateObject | null, DateObject | null] =>
  normalizeDraftRange([toPersianDateObject(value?.[0]), toPersianDateObject(value?.[1])]);

const formatDisplayDate = (value?: string | null) => {
  if (!value) return "";
  const normalized = normalizeDigits(String(value)).trim();
  const jalaliMatch = normalized.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (jalaliMatch) {
    const year = Number(jalaliMatch[1]);
    if (year >= 1300 && year <= 1499) {
      return toPersianNumber(`${year}/${String(jalaliMatch[2]).padStart(2, "0")}/${String(jalaliMatch[3]).padStart(2, "0")}`);
    }
  }
  const date = new Date(`${normalized.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return toPersianNumber(new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date));
};

const getDisplayValue = (value?: PersianDateRangeValue | null) => {
  const start = formatDisplayDate(value?.[0]);
  const end = formatDisplayDate(value?.[1]);
  if (start && end) return `${start} تا ${end}`;
  if (start) return `${start} تا ...`;
  if (end) return `... تا ${end}`;
  return "";
};

const QuickActionButton: React.FC<{
  label: string;
  onClick: () => void;
}> = ({ label, onClick }) => (
  <button type="button" className="kalam-adaptive-picker__chip" onClick={onClick}>
    {label}
  </button>
);

const PersianDateRangePicker: React.FC<PersianDateRangePickerProps> = ({
  value,
  onChange,
  className,
  disabled,
  placeholder = "انتخاب بازه زمانی",
  zIndex = 10050,
  modalContainer,
  overlayZIndexBase,
  pickerTitle = "انتخاب بازه زمانی",
}) => {
  const safeOnChange = onChange ?? (() => {});
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState<PersianDateRangeValue | null>(value ?? null);
  const effectiveValue = value === undefined ? internalValue : value;
  const effectiveValueKey = `${effectiveValue?.[0] || ""}|${effectiveValue?.[1] || ""}`;
  const [draft, setDraft] = useState<[DateObject | null, DateObject | null]>(() => createDraftRange(effectiveValue));
  const [viewDate, setViewDate] = useState<DateObject | null>(() => createDraftRange(effectiveValue)[0]);

  useEffect(() => {
    if (open) return;
    const nextDraft = createDraftRange(effectiveValue);
    setDraft(nextDraft);
    setViewDate(nextDraft[0]);
  }, [effectiveValueKey, open]);

  const committedValue = useMemo(() => getDisplayValue(effectiveValue), [effectiveValueKey]);
  const draftValue = useMemo<PersianDateRangeValue | null>(() => {
    const start = serializeDateObject(draft[0]);
    const end = serializeDateObject(draft[1]);
    return start || end ? [start, end] : null;
  }, [draft]);
  const draftDisplay = useMemo(() => getDisplayValue(draftValue), [draftValue]);
  const confirmDisabled = !draftValue?.[0] || !draftValue?.[1];

  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled) return;
    setOpen(nextOpen);
  };

  const applyRange = () => {
    if (!draftValue?.[0] || !draftValue?.[1]) return;
    const nextValue: PersianDateRangeValue = [draftValue[0], draftValue[1]];
    setInternalValue(nextValue);
    safeOnChange(nextValue);
    setOpen(false);
  };

  const clearRange = () => {
    setDraft([null, null]);
    setInternalValue(null);
    safeOnChange(null);
    setOpen(false);
  };

  const handleCalendarChange = (nextValue: DateObject | DateObject[] | null) => {
    const picked = Array.isArray(nextValue) ? nextValue : nextValue ? [nextValue] : [];
    const nextDraft = normalizeDraftRange([
      picked[0] ? new DateObject(picked[0]) : null,
      picked[1] ? new DateObject(picked[1]) : null,
    ]);
    setDraft(nextDraft);
    setViewDate(nextDraft[0] || nextDraft[1] || null);
  };

  const applyQuickRange = (daysBack: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - daysBack);
    const nextDraft = normalizeDraftRange([fromJsDate(start), fromJsDate(end)]);
    setDraft(nextDraft);
    setViewDate(nextDraft[0]);
  };

  const zIndexBase = overlayZIndexBase ?? buildOverlayZIndexBase(zIndex - 40).base;
  const calendarValue = draft.filter(Boolean) as DateObject[];
  const currentCalendarDate = viewDate || draft[0] || draft[1] || fromJsDate(new Date());

  return (
    <div ref={fieldRef} className={`kalam-adaptive-picker__field ${className || ""}`.trim()}>
      <button
        type="button"
        className="kalam-rmdp-input kalam-adaptive-picker__trigger"
        disabled={disabled}
        aria-label={pickerTitle}
        onClick={() => handleOpenChange(true)}
      >
        <span className="kalam-adaptive-picker__trigger-icon"><CalendarOutlined /></span>
        <span className={`kalam-adaptive-picker__trigger-text ${committedValue ? "is-filled" : ""}`}>
          {committedValue || placeholder}
        </span>
      </button>

      <AdaptivePickerSurface
        open={open}
        title={pickerTitle}
        subtitle={draftDisplay || placeholder}
        zIndex={overlayZIndexBase ? zIndexBase + 40 : zIndex}
        onClose={() => setOpen(false)}
        onConfirm={applyRange}
        confirmDisabled={confirmDisabled}
        onClear={effectiveValue?.[0] || effectiveValue?.[1] ? clearRange : undefined}
        modalContainer={modalContainer}
      >
        <div className="kalam-adaptive-picker__chips">
          <QuickActionButton label="امروز" onClick={() => applyQuickRange(0)} />
          <QuickActionButton label="۷ روز اخیر" onClick={() => applyQuickRange(6)} />
          <QuickActionButton label="۳۰ روز اخیر" onClick={() => applyQuickRange(29)} />
        </div>
        <div className="kalam-adaptive-picker__calendar-wrap">
          <Calendar
            range
            value={calendarValue}
            currentDate={currentCalendarDate}
            onChange={handleCalendarChange}
            onMonthChange={(next: any) => {
              const nextDate = Array.isArray(next) ? next[0] : next;
              if (nextDate) setViewDate(new DateObject(nextDate));
            }}
            onYearChange={(next: any) => {
              const nextDate = Array.isArray(next) ? next[0] : next;
              if (nextDate) setViewDate(new DateObject(nextDate));
            }}
            calendar={persian}
            locale={persian_fa}
            format="YYYY/MM/DD"
            weekStartDayIndex={0}
            className="rmdp-leather kalam-adaptive-picker__calendar"
          />
        </div>
      </AdaptivePickerSurface>
    </div>
  );
};

export default PersianDateRangePicker;
