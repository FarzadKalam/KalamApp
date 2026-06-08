import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { Calendar } from "react-multi-date-picker";
import DateObject from "react-date-object";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import gregorian from "react-date-object/calendars/gregorian";
import gregorian_en from "react-date-object/locales/gregorian_en";
import { safeJalaliFormat, toPersianNumber } from "../utils/persianNumberFormatter";
import { getHolidaySummaryForDate } from "../utils/holidayCalendar";
import AdaptivePickerSurface from "./AdaptivePickerSurface";
import { AdaptivePickerMode, buildOverlayZIndexBase } from "../utils/popupContainer";
import { TODAY_DAY_STYLE } from "./pickerDayAppearance";

type PickerType = "DATE" | "TIME" | "DATETIME";

type HolidayMarker = {
  isFriday: boolean;
  isOfficialHoliday: boolean;
  titles: string[];
};

interface PersianDatePickerProps {
  value?: string | null;
  onChange?: (val: string | null) => void;
  type: PickerType;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  zIndex?: number;
  modalContainer?: (trigger?: HTMLElement | null) => HTMLElement;
  overlayZIndexBase?: number;
  adaptiveMode?: AdaptivePickerMode;
  pickerTitle?: string;
}

const holidayMonthCache = new Map<string, Promise<Record<string, HolidayMarker>>>();

const normalizeDigits = (value: string) =>
  String(value || "")
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));

const pad2 = (value: number) => String(Math.max(0, value)).padStart(2, "0");

const normalizeCalendarKey = (value: string) =>
  normalizeDigits(String(value || "")).replace(/[^\d/]/g, "");

const buildHolidayLookupKey = (year: number, month: number, day: number) => `${year}-${month}-${day}`;
const buildGregorianLookupKey = (value: Date | DateObject | null | undefined) => {
  if (!value) return "";
  try {
    const gregorianValue =
      value instanceof DateObject
        ? new DateObject(value).convert(gregorian, gregorian_en)
        : new DateObject({
            date: value,
            calendar: gregorian,
            locale: gregorian_en,
          });
    return gregorianValue.format("YYYY-MM-DD");
  } catch {
    return "";
  }
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const createNowDateObject = () =>
  new DateObject({
    date: new Date(),
    calendar: gregorian,
    locale: gregorian_en,
  }).convert(persian, persian_fa);

const createTimeBaseDateObject = () =>
  new DateObject({
    date: "1970-01-01 00:00",
    format: "YYYY-MM-DD HH:mm",
    calendar: gregorian,
    locale: gregorian_en,
  }).convert(persian, persian_fa);

const fromJsDate = (date: Date) =>
  new DateObject({
    date,
    calendar: gregorian,
    locale: gregorian_en,
  }).convert(persian, persian_fa);

const convertToPersianDateObject = (value?: string | null, type?: PickerType): DateObject | null => {
  if (!value) return null;
  try {
    if (type === "TIME") {
      const normalized = normalizeDigits(value);
      return new DateObject({
        date: `1970-01-01 ${normalized}`,
        format: normalized.length > 5 ? "YYYY-MM-DD HH:mm:ss" : "YYYY-MM-DD HH:mm",
        calendar: gregorian,
        locale: gregorian_en,
      }).convert(persian, persian_fa);
    }

    if (type === "DATE") {
      return new DateObject({
        date: value,
        format: "YYYY-MM-DD",
        calendar: gregorian,
        locale: gregorian_en,
      }).convert(persian, persian_fa);
    }

    const jsDate = new Date(value);
    if (Number.isNaN(jsDate.getTime())) return null;
    return new DateObject({
      date: jsDate,
      calendar: gregorian,
      locale: gregorian_en,
    }).convert(persian, persian_fa);
  } catch {
    return null;
  }
};

const serializeDateObject = (date: DateObject | null, type: PickerType): string | null => {
  if (!date) return null;
  const greg = new DateObject(date).convert(gregorian, gregorian_en);
  const jsDate = greg.toDate();
  if (!(jsDate instanceof Date) || Number.isNaN(jsDate.getTime())) return null;
  if (type === "DATE") return greg.format("YYYY-MM-DD");
  if (type === "TIME") return greg.format("HH:mm");
  return jsDate.toISOString();
};

const getDisplayValue = (value: string | null | undefined, type: PickerType) => {
  if (!value) return "";
  if (type === "DATE") return toPersianNumber(safeJalaliFormat(value, "YYYY/MM/DD") || "");
  if (type === "DATETIME") return toPersianNumber(safeJalaliFormat(value, "YYYY/MM/DD HH:mm") || "");

  const normalized = normalizeDigits(value);
  const timePart = normalized.split(":");
  if (timePart.length >= 2) return toPersianNumber(`${timePart[0]}:${timePart[1]}`);
  return toPersianNumber(normalized);
};

const getDraftHour = (draft: DateObject | null, type: PickerType) => {
  if (!draft) return type === "TIME" ? 0 : new Date().getHours();
  return Number(normalizeDigits(draft.format("HH")));
};

const getDraftMinute = (draft: DateObject | null, type: PickerType) => {
  if (!draft) return type === "TIME" ? 0 : new Date().getMinutes();
  return Number(normalizeDigits(draft.format("mm")));
};

const withTime = (base: DateObject | null, type: PickerType, hour: number, minute: number) => {
  const source = new Date(base?.toDate?.() || (type === "TIME" ? createTimeBaseDateObject().toDate() : createNowDateObject().toDate()));
  source.setHours(clamp(hour, 0, 23), clamp(minute, 0, 59), 0, 0);
  return fromJsDate(source);
};

const withDate = (base: DateObject | null, picked: DateObject, type: PickerType) => {
  const next = new Date(picked.toDate());
  const source = base || (type === "TIME" ? createTimeBaseDateObject() : createNowDateObject());
  next.setHours(getDraftHour(source, type), getDraftMinute(source, type), 0, 0);
  return fromJsDate(next);
};

const loadHolidayMarkersForMonth = async (source: DateObject): Promise<Record<string, HolidayMarker>> => {
  const jalaliSource = new DateObject(source).convert(persian, persian_fa);
  const year = Number(normalizeDigits(String(jalaliSource.year || 0)));
  const month = Number(normalizeDigits(String(jalaliSource.month?.number || 0)));
  if (!year || !month) return {};

  const monthCacheKey = `${year}-${month}`;
  if (!holidayMonthCache.has(monthCacheKey)) {
    holidayMonthCache.set(
      monthCacheKey,
      (async () => {
        const daysInMonth = Number(jalaliSource.month?.length || 31);
        const results = await Promise.all(
          Array.from({ length: daysInMonth }, async (_, dayOffset) => {
            const day = dayOffset + 1;
            const jalaliDateKey = `${year}/${pad2(month)}/${pad2(day)}`;
            const dateObject = new DateObject({
              date: jalaliDateKey,
              format: "YYYY/MM/DD",
              calendar: persian,
              locale: persian_fa,
            });
            const summary = await getHolidaySummaryForDate(dateObject);
            const marker: HolidayMarker = {
              isFriday: Boolean(summary?.isFriday || dateObject.weekDay?.index === 5),
              isOfficialHoliday: Boolean(summary?.isOfficialHoliday),
              titles: summary?.occasions?.map((item) => item.title).filter(Boolean) || [],
            };
            const gregorianKey = buildGregorianLookupKey(dateObject);
            return {
              numericKey: buildHolidayLookupKey(year, month, day),
              normalizedKey: normalizeCalendarKey(jalaliDateKey),
              plainKey: normalizeCalendarKey(`${year}/${month}/${day}`),
              gregorianKey,
              marker,
            };
          })
        );

        return results.reduce<Record<string, HolidayMarker>>((acc, item) => {
          acc[item.numericKey] = item.marker;
          acc[item.normalizedKey] = item.marker;
          acc[item.plainKey] = item.marker;
          if (item.gregorianKey) {
            acc[item.gregorianKey] = item.marker;
          }
          return acc;
        }, {});
      })().catch(() => ({}))
    );
  }

  return holidayMonthCache.get(monthCacheKey) || Promise.resolve({});
};

const QuickActionButton: React.FC<{
  label: string;
  onClick: () => void;
}> = ({ label, onClick }) => (
  <button type="button" className="kalam-adaptive-picker__chip" onClick={onClick}>
    {label}
  </button>
);

const PersianDatePicker: React.FC<PersianDatePickerProps> = ({
  value,
  onChange,
  type,
  className,
  disabled,
  placeholder,
  zIndex = 10050,
  modalContainer,
  overlayZIndexBase,
  pickerTitle,
}) => {
  const safeOnChange = onChange ?? (() => {});
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateObject | null>(() => convertToPersianDateObject(value, type));
  const [viewDate, setViewDate] = useState<DateObject | null>(() => convertToPersianDateObject(value, type));
  const [step, setStep] = useState<"date" | "time">(type === "TIME" ? "time" : "date");
  const [holidayMarkers, setHolidayMarkers] = useState<Record<string, HolidayMarker>>({});

  useEffect(() => {
    if (open) return;
    const nextDraft = convertToPersianDateObject(value, type);
    setDraft(nextDraft);
    setViewDate(nextDraft);
    setStep(type === "TIME" ? "time" : "date");
  }, [open, type, value]);

  const syncHolidayMonth = async (source: DateObject | null) => {
    if (type === "TIME" || !source) return;
    const markers = await loadHolidayMarkersForMonth(source);
    setHolidayMarkers((prev) => ({ ...prev, ...markers }));
  };

  useEffect(() => {
    if (!open || type === "TIME") return;
    void syncHolidayMonth(viewDate || draft || createNowDateObject());
  }, [draft, open, type, viewDate]);

  const committedValue = useMemo(() => getDisplayValue(value, type), [type, value]);
  const draftSerialized = useMemo(() => serializeDateObject(draft, type), [draft, type]);
  const draftDisplay = useMemo(() => getDisplayValue(draftSerialized, type), [draftSerialized, type]);
  const draftDateKey = useMemo(() => {
    if (!draft || type === "TIME") return "";
    return buildHolidayLookupKey(
      Number(normalizeDigits(String(draft.year || 0))),
      Number(normalizeDigits(String(draft.month?.number || 0))),
      Number(normalizeDigits(String(draft.day || 0)))
    );
  }, [draft, type]);
  const activeHoliday = draftDateKey ? holidayMarkers[draftDateKey] : null;

  const applyValue = () => {
    safeOnChange(serializeDateObject(draft, type));
    setOpen(false);
  };

  const clearValue = () => {
    setDraft(null);
    safeOnChange(null);
    setOpen(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled) return;
    setOpen(nextOpen);
  };

  const handleCalendarChange = (nextValue: DateObject | DateObject[] | null) => {
    const picked = Array.isArray(nextValue) ? nextValue[0] : nextValue;
    if (!picked) {
      setDraft(null);
      return;
    }

    const normalized = type === "DATE" ? new DateObject(picked) : withDate(draft, picked, type);
    setDraft(normalized);
    setViewDate(new DateObject(picked));

    if (type === "DATETIME") {
      setStep("time");
    }
  };

  const updateTimePart = (part: "hour" | "minute", raw: string) => {
    const englishValue = normalizeDigits(raw).replace(/[^\d]/g, "");
    const numericValue = clamp(Number(englishValue || "0"), 0, part === "hour" ? 23 : 59);
    const next = withTime(
      draft,
      type,
      part === "hour" ? numericValue : getDraftHour(draft, type),
      part === "minute" ? numericValue : getDraftMinute(draft, type)
    );
    setDraft(next);
  };

  const applyQuickDate = (offsetDays: number) => {
    const jsDate = new Date();
    jsDate.setDate(jsDate.getDate() + offsetDays);
    const nextDate = withDate(draft, fromJsDate(jsDate), type);
    setDraft(nextDate);
    setViewDate(new DateObject(nextDate));
    if (type === "DATETIME") setStep("time");
  };

  const applyQuickTime = (hour: number, minute: number) => {
    setDraft(withTime(draft, type, hour, minute));
  };

  const applyNow = () => {
    const now = createNowDateObject();
    if (type === "TIME") {
      setDraft(withTime(createTimeBaseDateObject(), type, Number(now.format("HH")), Number(now.format("mm"))));
      return;
    }
    setDraft(now);
    setViewDate(new DateObject(now));
    if (type === "DATETIME") setStep("time");
  };

  const renderCalendar = () => {
    if (type === "TIME") return null;

    const currentCalendarDate = viewDate || draft || createNowDateObject();

    return (
      <div className="kalam-adaptive-picker__calendar-wrap">
        <Calendar
          value={draft ?? undefined}
          currentDate={currentCalendarDate}
          onChange={handleCalendarChange}
          onMonthChange={(next: any) => {
            const nextDate = Array.isArray(next) ? next[0] : next;
            if (nextDate) {
              const normalized = new DateObject(nextDate);
              setViewDate(normalized);
              void syncHolidayMonth(normalized);
            }
          }}
          onYearChange={(next: any) => {
            const nextDate = Array.isArray(next) ? next[0] : next;
            if (nextDate) {
              const normalized = new DateObject(nextDate);
              setViewDate(normalized);
              void syncHolidayMonth(normalized);
            }
          }}
          calendar={persian}
          locale={persian_fa}
          format="YYYY/MM/DD"
          weekStartDayIndex={0}
          className="rmdp-leather kalam-adaptive-picker__calendar"
          mapDays={({ date, today }: any) => {
            const isToday =
              Boolean(today) &&
              date?.year === today?.year &&
              date?.monthIndex === today?.monthIndex &&
              date?.day === today?.day;
            const year = Number(normalizeDigits(String(date?.year || 0)));
            const month = Number(normalizeDigits(String(date?.month?.number || (Number.isFinite(date?.monthIndex) ? Number(date.monthIndex) + 1 : 0))));
            const day = Number(normalizeDigits(String(date?.day || 0)));
            const dateKeyCandidates = [
              year && month && day ? buildHolidayLookupKey(year, month, day) : "",
              typeof date?.format === "function" ? normalizeCalendarKey(date.format("YYYY/MM/DD")) : "",
              typeof date?.format === "function" ? normalizeCalendarKey(date.format("YYYY/M/D")) : "",
              year && month && day ? normalizeCalendarKey(`${year}/${pad2(month)}/${pad2(day)}`) : "",
              year && month && day ? normalizeCalendarKey(`${year}/${month}/${day}`) : "",
            ].filter(Boolean);
            const jsDate = typeof date?.toDate === "function" ? date.toDate() : null;
            const gregorianKey = buildGregorianLookupKey(date);
            if (gregorianKey) {
              dateKeyCandidates.push(gregorianKey);
            }
            const marker = dateKeyCandidates.map((key) => holidayMarkers[key]).find(Boolean);
            const isFriday = jsDate instanceof Date && !Number.isNaN(jsDate.getTime()) ? jsDate.getDay() === 5 : Boolean(marker?.isFriday);
            const classes = [
              marker?.isOfficialHoliday ? "kalam-rmdp-day--holiday" : "",
              isFriday ? "kalam-rmdp-day--friday" : "",
              isToday ? "kalam-rmdp-day--today" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return {
              className: classes || undefined,
              style: marker?.isOfficialHoliday
                ? {
                    color: "var(--kalam-holiday-fg, #b42318)",
                    backgroundColor: "var(--kalam-holiday-bg, rgba(239, 68, 68, 0.14))",
                    border: "1px solid var(--kalam-holiday-border, rgba(239, 68, 68, 0.3))",
                    borderRadius: "14px",
                  }
                : isFriday
                  ? {
                      color: "var(--kalam-holiday-fg, #b42318)",
                      backgroundColor: "var(--kalam-friday-bg, rgba(239, 68, 68, 0.08))",
                      borderRadius: "14px",
                    }
                  : isToday
                    ? {
                        ...TODAY_DAY_STYLE,
                      }
                    : undefined,
              title: marker?.titles?.length ? marker.titles.join(" | ") : undefined,
            };
          }}
        />
        {activeHoliday ? (
          <div className="kalam-adaptive-picker__holiday">
            <div className="kalam-adaptive-picker__holiday-label">
              {activeHoliday.isOfficialHoliday ? "تعطیل رسمی" : activeHoliday.isFriday ? "جمعه" : "مناسبت"}
            </div>
            <div className="kalam-adaptive-picker__holiday-text">
              {activeHoliday.titles.length > 0 ? activeHoliday.titles.join("، ") : "روز انتخاب‌شده در تقویم مشخص شده است."}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderTimeEditor = () => {
    if (type === "DATE") return null;

    const hour = pad2(getDraftHour(draft, type));
    const minute = pad2(getDraftMinute(draft, type));

    return (
      <div className="kalam-adaptive-picker__time-editor">
        <div className="kalam-adaptive-picker__time-fields">
          <label className="kalam-adaptive-picker__time-field">
            <span>دقیقه</span>
            <input
              value={toPersianNumber(minute)}
              onChange={(event) => updateTimePart("minute", event.currentTarget.value)}
              inputMode="numeric"
              className="persian-number"
            />
          </label>
          <div className="kalam-adaptive-picker__time-separator">:</div>
          <label className="kalam-adaptive-picker__time-field">
            <span>ساعت</span>
            <input
              value={toPersianNumber(hour)}
              onChange={(event) => updateTimePart("hour", event.currentTarget.value)}
              inputMode="numeric"
              className="persian-number"
            />
          </label>
        </div>

        <div className="kalam-adaptive-picker__chips">
          <QuickActionButton label="الان" onClick={applyNow} />
          <QuickActionButton label="۰۸:۰۰" onClick={() => applyQuickTime(8, 0)} />
          <QuickActionButton label="۱۲:۰۰" onClick={() => applyQuickTime(12, 0)} />
          <QuickActionButton label="۱۶:۰۰" onClick={() => applyQuickTime(16, 0)} />
          <QuickActionButton label="۲۰:۰۰" onClick={() => applyQuickTime(20, 0)} />
        </div>
      </div>
    );
  };

  const panelTitle = pickerTitle || (type === "DATE" ? "انتخاب تاریخ" : type === "TIME" ? "انتخاب زمان" : "انتخاب تاریخ و زمان");
  const triggerIcon = type === "TIME" ? <ClockCircleOutlined /> : <CalendarOutlined />;
  const panelSubtitle =
    draftDisplay || (placeholder && placeholder !== panelTitle ? placeholder : "");
  const panelContent = (
    <>
      {(type === "DATE" || type === "DATETIME") && step === "date" ? (
        <>
          <div className="kalam-adaptive-picker__chips">
            <QuickActionButton label="امروز" onClick={() => applyQuickDate(0)} />
            <QuickActionButton label="فردا" onClick={() => applyQuickDate(1)} />
            <QuickActionButton label="هفته بعد" onClick={() => applyQuickDate(7)} />
          </div>
          {renderCalendar()}
        </>
      ) : null}

      {(type === "TIME" || (type === "DATETIME" && step === "time")) && (
        <>
          {type === "DATETIME" ? (
            <div className="kalam-adaptive-picker__summary-card">
              <div>تاریخ انتخاب‌شده</div>
              <strong>{toPersianNumber(draft?.format("YYYY/MM/DD") || "—")}</strong>
            </div>
          ) : null}
          {renderTimeEditor()}
        </>
      )}

    </>
  );
  const zIndexBase = overlayZIndexBase ?? buildOverlayZIndexBase(zIndex - 40).base;

  return (
    <div ref={fieldRef} className={`kalam-adaptive-picker__field ${className || ""}`.trim()}>
      <button
        type="button"
        className="kalam-rmdp-input kalam-adaptive-picker__trigger"
        disabled={disabled}
        aria-label={panelTitle}
        onClick={() => handleOpenChange(true)}
      >
        <span className="kalam-adaptive-picker__trigger-icon">{triggerIcon}</span>
        <span className={`kalam-adaptive-picker__trigger-text ${committedValue ? "is-filled" : ""}`}>
          {committedValue || placeholder || panelTitle}
        </span>
      </button>

      <AdaptivePickerSurface
        open={open}
        title={panelTitle}
        subtitle={panelSubtitle}
        zIndex={overlayZIndexBase ? zIndexBase + 40 : zIndex}
        onClose={() => setOpen(false)}
        onConfirm={type === "DATETIME" && step === "date" ? () => setStep("time") : applyValue}
        confirmLabel={type === "DATETIME" && step === "date" ? "مرحله بعد" : "تایید"}
        onClear={value ? clearValue : undefined}
        headerExtra={type === "DATETIME" ? (
          <div className="kalam-adaptive-picker__steps">
            <button
              type="button"
              className={`kalam-adaptive-picker__step ${step === "date" ? "is-active" : ""}`}
              onClick={() => setStep("date")}
            >
              تاریخ
            </button>
            <button
              type="button"
              className={`kalam-adaptive-picker__step ${step === "time" ? "is-active" : ""}`}
              onClick={() => setStep("time")}
            >
              زمان
            </button>
          </div>
        ) : undefined}
        modalContainer={modalContainer}
      >
        {panelContent}
      </AdaptivePickerSurface>
    </div>
  );
};

export default PersianDatePicker;
