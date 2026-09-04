import React, { useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Segmented,
  Select,
  Spin,
} from "antd";
import {
  CalendarOutlined,
  LeftOutlined,
  PlusOutlined,
  ProjectOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import DateObject from "react-date-object";
import gregorian from "react-date-object/calendars/gregorian";
import persian from "react-date-object/calendars/persian";
import gregorian_en from "react-date-object/locales/gregorian_en";
import persian_fa from "react-date-object/locales/persian_fa";
import { supabase } from "../../supabaseClient";
import { openTaskProcessModal } from "../../utils/taskProcessModalEvents";
import { getRecordTitle } from "../../utils/recordTitle";
import { MODULES } from "../../moduleRegistry";
import {
  getHolidaySummaryForDate,
  type HolidayDaySummary,
} from "../../utils/holidayCalendar";
import {
  fetchAssigneeDirectory,
  fetchProcessTemplateRows,
} from "../../utils/referenceData";
import { resolveAssigneePresentation } from "../../utils/assigneePresentation";
import IdentityAvatar from "../common/IdentityAvatar";
import { normalizeRoleIconKey } from "../../utils/roleIconCatalog";
import {
  getTaskStatusColor,
  getTaskStatusLabel,
} from "../../utils/processTaskStatusOptions";
import { loadProcessTemplateStages } from "../../utils/processTemplateStages";
import { mapProcessTemplateStagesToDraft } from "../../utils/processRunRuntime";
import { autoAssignProcessV2DraftStages } from "../../utils/processV2AutoAssign";
import { doesProcessTemplateSupportModule } from "../../utils/processTargets";

type RuntimeItem = {
  id: string;
  kind: "task" | "project";
  record: any;
  date: Date;
  inherited?: boolean;
};
type CreateMode = "choice" | "raw" | "template";
const CONTENT_TYPES = [
  { value: "post", label: "پست" },
  { value: "story", label: "استوری" },
  { value: "video", label: "ویدئو" },
  { value: "article", label: "مقاله" },
  { value: "newsletter", label: "خبرنامه" },
  { value: "other", label: "سایر" },
];
const STATUS_COLORS: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#10b981",
  orange: "#f97316",
  gold: "#f59e0b",
  purple: "#8b5cf6",
  pink: "#ec4899",
  gray: "#6b7280",
  default: "#9ca3af",
};
const asDate = (value: any) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};
const toKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  next.setHours(12, 0, 0, 0);
  return next;
};
const toPersian = (date: Date) =>
  new DateObject({ date, calendar: gregorian, locale: gregorian_en }).convert(
    persian,
    persian_fa,
  );
const toGregorian = (date: DateObject) =>
  new DateObject(date).convert(gregorian, gregorian_en).toDate();
const makePersianDate = (year: number, month: number, day: number) =>
  new DateObject({
    year,
    month,
    day,
    hour: 12,
    minute: 0,
    second: 0,
    calendar: persian,
    locale: persian_fa,
  });
const formatTime = (value: any) => {
  const date = asDate(value);
  return date ? toPersian(date).format("HH:mm") : "";
};
const formatContentType = (value: any) =>
  CONTENT_TYPES.find((item) => item.value === String(value || ""))?.label ||
  String(value || "").trim();
const buildDays = (anchor: Date) => {
  const source = toPersian(anchor);
  const start = toGregorian(
    makePersianDate(source.year, source.month.number, 1),
  );
  const gridStart = addDays(start, -((start.getDay() + 1) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const jalali = toPersian(date);
    return {
      date,
      key: toKey(date),
      day: jalali.format("D"),
      weekday: jalali.format("dddd"),
      inMonth:
        jalali.year === source.year &&
        jalali.month.number === source.month.number,
      isToday: toKey(date) === toKey(new Date()),
    };
  });
};

type TemplateProjectPrefill = {
  contentCalendarId: string;
  customerId?: string | null;
  sourceInvoiceId?: string | null;
  dateKey: string;
};

const ContentCalendarRuntime: React.FC<{
  calendar: any;
  canEdit?: boolean;
  onOpenTemplateProject?: (
    prefill: TemplateProjectPrefill,
  ) => void | Promise<void>;
}> = ({ calendar, canEdit = false, onOpenTemplateProject }) => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const calendarId = String(calendar?.id || "").trim();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [directory, setDirectory] = useState<{ users: any[]; roles: any[] }>({
    users: [],
    roles: [],
  });
  const [holidays, setHolidays] = useState<
    Record<string, HolidayDaySummary | null>
  >({});
  const [mode, setMode] = useState<"all" | "tasks" | "projects">("all");
  const [taskDateField, setTaskDateField] = useState("due_date");
  const [projectDateField, setProjectDateField] = useState("due_date");
  const [anchor, setAnchor] = useState(() => new Date());
  const [createDate, setCreateDate] = useState<Date | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode>("choice");
  const [rawName, setRawName] = useState("");
  const [rawContentType, setRawContentType] = useState<string | undefined>();
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateId, setTemplateId] = useState<string>();
  const [templateStages, setTemplateStages] = useState<any[]>([]);
  const [templateStageId, setTemplateStageId] = useState<string>();
  const taskColumns =
    "id,name,status,priority,start_date,due_date,completed_at,project_id,content_calendar_id,content_type,related_to_module,updated_at,assignee_id,assignee_role_id,assignee_type,recurrence_info,task_type";
  const load = async () => {
    if (!calendarId) return;
    setLoading(true);
    try {
      const [projectResult, directResult, assigneeResult] = await Promise.all([
        supabase
          .from("projects")
          .select(
            "id,name,status,priority,start_date,due_date,completed_at,customer_id,content_calendar_id,updated_at,assignee_id,assignee_role_id,assignee_type",
          )
          .eq("content_calendar_id", calendarId)
          .order("due_date", { ascending: true })
          .limit(500),
        supabase
          .from("tasks")
          .select(taskColumns)
          .eq("content_calendar_id", calendarId)
          .order("due_date", { ascending: true })
          .limit(1000),
        fetchAssigneeDirectory(supabase),
      ]);
      if (projectResult.error) throw projectResult.error;
      if (directResult.error) throw directResult.error;
      const projectRows = projectResult.data || [];
      const ids = projectRows.map((row: any) => String(row.id)).filter(Boolean);
      const inherited = ids.length
        ? await supabase
            .from("tasks")
            .select(taskColumns)
            .in("project_id", ids)
            .order("due_date", { ascending: true })
            .limit(2000)
        : ({ data: [], error: null } as any);
      if (inherited.error) throw inherited.error;
      const taskMap = new Map(
        (directResult.data || []).map((row: any) => [
          String(row.id),
          { ...row, __contentCalendarInherited: false },
        ]),
      );
      (inherited.data || []).forEach((row: any) => {
        if (!taskMap.has(String(row.id)))
          taskMap.set(String(row.id), {
            ...row,
            __contentCalendarInherited: true,
          });
      });
      setProjects(projectRows);
      setTasks(Array.from(taskMap.values()));
      setDirectory({
        users: assigneeResult.users || [],
        roles: assigneeResult.roles || [],
      });
    } catch (error: any) {
      message.error(
        `بارگذاری تقویم ناموفق بود: ${String(error?.message || "خطای نامشخص")}`,
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [calendarId]);
  const days = useMemo(() => buildDays(anchor), [anchor]);
  useEffect(() => {
    let active = true;
    void Promise.all(
      days.map(
        async (day) =>
          [day.key, await getHolidaySummaryForDate(day.date)] as const,
      ),
    ).then((rows) => {
      if (active) setHolidays(Object.fromEntries(rows));
    });
    return () => {
      active = false;
    };
  }, [days]);
  const events = useMemo(() => {
    const entries: RuntimeItem[] = [];
    if (mode !== "projects")
      projects.forEach((record) => {
        const date = asDate(record?.[projectDateField]);
        if (date)
          entries.push({
            id: String(record.id),
            kind: "project",
            record,
            date,
          });
      });
    if (mode !== "tasks")
      tasks.forEach((record) => {
        const date = asDate(record?.[taskDateField]);
        if (date)
          entries.push({
            id: String(record.id),
            kind: "task",
            record,
            date,
            inherited: record.__contentCalendarInherited === true,
          });
      });
    return entries.reduce((map, item) => {
      const key = toKey(item.date);
      map.set(key, [...(map.get(key) || []), item]);
      return map;
    }, new Map<string, RuntimeItem[]>());
  }, [mode, projectDateField, projects, taskDateField, tasks]);
  const legends = useMemo(
    () =>
      Array.from(
        new Map(
          tasks.map((task) => {
            const options =
              MODULES.tasks.fields.find((field) => field.key === "status")
                ?.options || [];
            const label = getTaskStatusLabel(task.status, task, options);
            const color =
              STATUS_COLORS[getTaskStatusColor(task.status, task, options)] ||
              STATUS_COLORS.default;
            return [`${label}:${color}`, { label, color }];
          }),
        ).values(),
      ),
    [tasks],
  );
  const resetCreate = () => {
    setCreateDate(null);
    setCreateMode("choice");
    setRawName("");
    setRawContentType(undefined);
    setTemplateId(undefined);
    setTemplateStages([]);
    setTemplateStageId(undefined);
  };
  const createRaw = async () => {
    if (!createDate || !rawName.trim()) {
      message.warning("عنوان فعالیت را وارد کنید.");
      return;
    }
    setCreating(true);
    try {
      const key = toKey(createDate);
      const { error } = await supabase
        .from("tasks")
        .insert({
          name: rawName.trim(),
          status: "todo",
          task_type: "فعالیت سازمانی",
          content_calendar_id: calendarId,
          content_type: rawContentType || null,
          start_date: `${key}T09:00:00`,
          due_date: `${key}T17:00:00`,
        });
      if (error) throw error;
      message.success("فعالیت به تقویم افزوده شد.");
      resetCreate();
      await load();
    } catch (error: any) {
      message.error(
        `ایجاد فعالیت ناموفق بود: ${String(error?.message || "خطای نامشخص")}`,
      );
    } finally {
      setCreating(false);
    }
  };
  const openTemplate = async () => {
    setCreateMode("template");
    try {
      const rows = await fetchProcessTemplateRows(supabase);
      setTemplates(
        rows.filter(
          (row) =>
            row.is_active !== false &&
            // فعالیت نهایی در جدول tasks ساخته می‌شود، اما خود فرآیند ممکن
            // است برای تقویم محتوایی تعریف شده باشد. هر دو نوع الگو باید
            // در این نقطه قابل استفاده باشند.
            (doesProcessTemplateSupportModule(row, "content_calendars") ||
              doesProcessTemplateSupportModule(row, "tasks")),
        ),
      );
    } catch {
      message.error("بارگذاری الگوهای فرآیند ناموفق بود.");
    }
  };
  const chooseTemplate = async (value: string) => {
    setTemplateId(value);
    setTemplateStageId(undefined);
    setTemplateStages([]);
    try {
      setTemplateStages(await loadProcessTemplateStages(supabase, value));
    } catch {
      message.error("بارگذاری مرحله‌های الگو ناموفق بود.");
    }
  };
  const createTemplateTask = async () => {
    if (!createDate || !templateId || !templateStageId) {
      message.warning("الگو و مرحله را انتخاب کنید.");
      return;
    }
    const template = templates.find((row) => row.id === templateId);
    if (!template) return;
    setCreating(true);
    try {
      const key = toKey(createDate);
      const draft = mapProcessTemplateStagesToDraft(
        templateId,
        templateStages,
        {
          templateName: template.name || null,
          targetModuleIds: ["content_calendars"],
          processLinkMap: { content_calendars: calendarId },
        },
      );
      const selected = draft.find(
        (row: any) => String(row.template_stage_id) === templateStageId,
      );
      const result = await autoAssignProcessV2DraftStages({
        supabaseClient: supabase,
        moduleId: "content_calendars",
        recordId: calendarId,
        recordData: calendar,
        draftStages: draft,
        targetGroupId: selected?.process_group_id,
        targetStageId: selected?.id,
      });
      const ids = (result.createdTasks || [])
        .map((item: any) => String(item.id || ""))
        .filter(Boolean);
      if (!ids.length)
        throw new Error(
          result.missingAssigneeCount
            ? "مسئول مرحله در الگو مشخص نشده است."
            : "فعالیتی از مرحله انتخاب‌شده ساخته نشد.",
        );
      const { error } = await supabase
        .from("tasks")
        .update({
          content_calendar_id: calendarId,
          start_date: `${key}T09:00:00`,
          due_date: `${key}T17:00:00`,
        })
        .in("id", ids);
      if (error) throw error;
      message.success("فعالیت الگو به تقویم افزوده شد.");
      resetCreate();
      await load();
    } catch (error: any) {
      message.error(
        `ایجاد فعالیت از الگو ناموفق بود: ${String(error?.message || "خطای نامشخص")}`,
      );
    } finally {
      setCreating(false);
    }
  };
  const renderEvent = (item: RuntimeItem, large = false) => {
    const isTask = item.kind === "task";
    const record = item.record;
    const statusOptions =
      MODULES.tasks.fields.find((field) => field.key === "status")?.options ||
      [];
    const label = isTask
      ? getTaskStatusLabel(record.status, record, statusOptions)
      : String(record.status || "");
    const color = isTask
      ? STATUS_COLORS[
          getTaskStatusColor(record.status, record, statusOptions)
        ] || STATUS_COLORS.default
      : "#8b5cf6";
    const assignee = resolveAssigneePresentation({
      source: record,
      allUsers: directory.users,
      allRoles: directory.roles,
    });
    return (
      <button
        type="button"
        key={`${item.kind}:${item.id}`}
        onClick={() =>
          isTask
            ? openTaskProcessModal({ taskId: item.id, task: record })
            : navigate(`/projects/${item.id}`)
        }
        className={`w-full rounded-lg border border-gray-200 bg-white/90 text-right shadow-sm transition hover:border-[rgba(var(--brand-400-rgb),0.9)] dark:border-white/10 dark:bg-[#1d1d1d] ${large ? "px-3 py-2 text-xs" : "px-2 py-1 text-[10px]"}`}
        style={{ borderRight: `3px solid ${color}` }}
      >
        <span className="flex min-w-0 items-start gap-1.5">
          <span
            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white dark:bg-[#1d1d1d]"
            style={{ borderColor: color }}
          >
            {assignee.assigneeId ? (
              <IdentityAvatar
                size={18}
                option={{
                  kind: assignee.kind === "role" ? "role" : "user",
                  id: assignee.assigneeId,
                  label: assignee.label || "مسئول",
                  avatarUrl: assignee.avatarUrl || undefined,
                  iconKey: normalizeRoleIconKey(assignee.role?.icon_key),
                }}
              />
            ) : (
              <span
                className="h-full w-full"
                style={{ backgroundColor: color }}
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block line-clamp-2 font-bold text-gray-700 dark:text-gray-100">
              {getRecordTitle(record, MODULES[isTask ? "tasks" : "projects"], {
                fallback: "بدون عنوان",
              })}
            </span>
            {assignee.label ? (
              <span className="block truncate text-[9px] text-gray-500 dark:text-gray-400">
                مسئول: {assignee.label}
              </span>
            ) : null}
          </span>
        </span>
        <span className="mt-1 flex flex-wrap gap-x-2 text-[9px] text-gray-500 dark:text-gray-400">
          {isTask && formatContentType(record.content_type) ? (
            <span>نوع محتوا: {formatContentType(record.content_type)}</span>
          ) : null}
          {formatTime(record.due_date) ? (
            <span>موعد: {formatTime(record.due_date)}</span>
          ) : null}
          {label ? <span style={{ color }}>{label}</span> : null}
          {item.inherited ? <span>پروژه</span> : null}
        </span>
      </button>
    );
  };
  const renderDay = (
    day: ReturnType<typeof buildDays>[number],
    list = false,
  ) => {
    const rows = events.get(day.key) || [];
    const holiday = holidays[day.key];
    const isHoliday = !!holiday?.isOfficialHoliday || day.date.getDay() === 5;
    const hasOfficialOccasion = holiday?.isOfficialHoliday === true;
    return (
      <div
        key={day.key}
        className={`min-w-0 overflow-hidden rounded-xl border border-gray-100 p-1.5 dark:border-white/10 ${list ? "p-3" : "min-h-[120px] sm:min-h-[145px]"} ${isHoliday ? "bg-rose-50/80 dark:bg-rose-950/20" : "bg-white dark:bg-[#151515]"} ${day.inMonth || list ? "" : "opacity-50"} ${day.isToday ? "ring-1 ring-[rgba(var(--brand-500-rgb),0.7)]" : ""}`}
      >
        <div className="mb-1 flex items-start justify-between">
          <div>
            <div
              className={`font-black ${list ? "text-sm" : "text-xs"} ${isHoliday ? "text-rose-700 dark:text-rose-300" : "text-gray-700 dark:text-gray-200"}`}
            >
              {day.day}
            </div>
            {list ? (
              <div className="text-[10px] text-gray-500">{day.weekday}</div>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {day.isToday ? (
              <span className="rounded bg-[rgba(var(--brand-100-rgb),0.9)] px-1 text-[9px] font-bold text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--brand-500-rgb),0.2)] dark:text-[rgb(var(--brand-200-rgb))]">
                امروز
              </span>
            ) : null}
            {isHoliday ? (
              <span
                className="h-2 w-2 rounded-full bg-rose-500"
                title={holiday?.jalaliLabel || "تعطیل"}
              />
            ) : null}
            {canEdit ? (
              <Button
                aria-label="افزودن به این روز"
                type="text"
                size="small"
                icon={<PlusOutlined />}
                className="!h-5 !w-5 !min-w-5 !p-0"
                onClick={() => {
                  setCreateDate(day.date);
                  setCreateMode("choice");
                }}
              />
            ) : null}
          </div>
        </div>
        {holiday?.occasions?.length ? (
          <div
            className={`mb-1 truncate text-[9px] font-medium ${hasOfficialOccasion ? "text-rose-600 dark:text-rose-300" : "text-gray-500 dark:text-gray-400"}`}
            title={holiday.occasions.map((item) => item.title).join("، ")}
          >
            {holiday.occasions[0].title}
          </div>
        ) : null}
        <div className={list ? "space-y-2" : "space-y-1"}>
          {rows
            .slice(0, list ? undefined : 3)
            .map((item) => renderEvent(item, list))}
          {!list && rows.length > 3 ? (
            <span className="text-[10px] text-gray-500">
              +{rows.length - 3} مورد دیگر
            </span>
          ) : null}
          {list && !rows.length ? (
            <span className="text-xs text-gray-400">
              رکوردی در این روز ثبت نشده است.
            </span>
          ) : null}
        </div>
      </div>
    );
  };
  const mobileDays = useMemo(() => days.filter((day) => day.inMonth), [days]);
  return (
    <Card
      className="mt-5 !rounded-2xl !bg-white dark:!bg-[#1a1a1a]"
      title={
        <span className="inline-flex items-center gap-2">
          <CalendarOutlined />
          تقویم اجرا
        </span>
      }
      extra={
        <Button size="small" onClick={() => void load()}>
          به‌روزرسانی
        </Button>
      }
    >
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Segmented
            value={mode}
            onChange={(value) => setMode(value as any)}
            options={[
              { label: "همه", value: "all" },
              { label: "فعالیت‌ها", value: "tasks" },
              { label: "پروژه‌ها", value: "projects" },
            ]}
          />
          <Select
            size="small"
            className="w-full sm:w-52"
            value={taskDateField}
            onChange={setTaskDateField}
            options={[
              { value: "start_date", label: "تاریخ فعالیت: شروع" },
              { value: "due_date", label: "تاریخ فعالیت: مهلت" },
              { value: "completed_at", label: "تاریخ فعالیت: تکمیل" },
            ]}
          />
          <Select
            size="small"
            className="w-full sm:w-52"
            value={projectDateField}
            onChange={setProjectDateField}
            options={[
              { value: "start_date", label: "تاریخ پروژه: شروع" },
              { value: "due_date", label: "تاریخ پروژه: پایان" },
              { value: "completed_at", label: "تاریخ پروژه: تکمیل" },
            ]}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button size="small" onClick={() => setAnchor(new Date())}>
            امروز
          </Button>
          <Button
            type="text"
            icon={<RightOutlined />}
            onClick={() =>
              setAnchor(toGregorian(toPersian(anchor).add(-1, "month")))
            }
          />
          <div className="font-black">
            {toPersian(anchor).format("MMMM YYYY")}
          </div>
          <Button
            type="text"
            icon={<LeftOutlined />}
            onClick={() =>
              setAnchor(toGregorian(toPersian(anchor).add(1, "month")))
            }
          />
        </div>
      </div>
      {loading ? (
        <div className="py-12 text-center">
          <Spin />
        </div>
      ) : (
        <>
          <div className="hidden grid-cols-7 gap-1 text-center text-xs text-gray-500 sm:grid">
            {[
              "شنبه",
              "یکشنبه",
              "دوشنبه",
              "سه‌شنبه",
              "چهارشنبه",
              "پنجشنبه",
              "جمعه",
            ].map((name) => (
              <div key={name}>{name}</div>
            ))}
          </div>
          <div className="mt-1 hidden grid-cols-7 gap-1 sm:grid">
            {days.map((day) => renderDay(day))}
          </div>
          <div className="space-y-2 sm:hidden">
            {(mobileDays.length
              ? mobileDays
              : days.filter((day) => day.inMonth)
            ).map((day) => renderDay(day, true))}
          </div>
          {projects.length + tasks.length === 0 ? (
            <Empty
              className="mt-5"
              description="هنوز پروژه یا فعالیتی به این تقویم متصل نشده است."
            />
          ) : null}
        </>
      )}
      {legends.length ? (
        <div className="mt-4 border-t border-gray-100 pt-2 dark:border-gray-800">
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[10px] text-gray-500 dark:text-gray-400">
            {legends.map((item: any) => (
              <span
                key={`${item.label}:${item.color}`}
                className="inline-flex items-center gap-1"
              >
                <i
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <Modal
        open={!!createDate}
        title={`افزودن در ${createDate ? toPersian(createDate).format("YYYY/MM/DD") : ""}`}
        footer={null}
        onCancel={resetCreate}
        destroyOnClose
      >
        {createMode === "choice" ? (
          <div className="grid gap-2">
            <Button
              block
              icon={<PlusOutlined />}
              onClick={() => setCreateMode("raw")}
            >
              ایجاد فعالیت خام
            </Button>
            <Button
              block
              icon={<CalendarOutlined />}
              onClick={() => void openTemplate()}
            >
              ایجاد فعالیت از الگو
            </Button>
            <Button
              block
              icon={<ProjectOutlined />}
              onClick={() => {
                const date = createDate;
                resetCreate();
                if (date)
                  navigate("/projects/create", {
                    state: {
                      initialValues: {
                        content_calendar_id: calendarId,
                        customer_id: calendar?.customer_id || null,
                        source_invoice_id: calendar?.source_invoice_id || null,
                        start_date: toKey(date),
                        due_date: toKey(date),
                      },
                    },
                  });
              }}
            >
              ایجاد پروژه خام
            </Button>
            <Button
              block
              icon={<ProjectOutlined />}
              type="primary"
              onClick={() => {
                const date = createDate;
                resetCreate();
                if (date)
                  void onOpenTemplateProject?.({
                    contentCalendarId: calendarId,
                    customerId: calendar?.customer_id || null,
                    sourceInvoiceId: calendar?.source_invoice_id || null,
                    dateKey: toKey(date),
                  });
              }}
            >
              ایجاد پروژه از الگوی فرآیند
            </Button>
            <div className="pt-2 text-center text-xs text-gray-500">
              برای استفاده بهینه از تقویم محتوایی، ابتدا فعالیت‌ها و فرآیندهای
              تکرارشونده را در قسمت الگوهای فرآیند تکمیل کنید.
            </div>
          </div>
        ) : null}
        {createMode === "raw" ? (
          <div className="space-y-3">
            <Input
              autoFocus
              value={rawName}
              onChange={(event) => setRawName(event.target.value)}
              placeholder="عنوان فعالیت"
            />
            <Select
              allowClear
              className="w-full"
              value={rawContentType}
              onChange={setRawContentType}
              options={CONTENT_TYPES}
              placeholder="نوع محتوا"
            />
            <Button
              block
              type="primary"
              loading={creating}
              onClick={() => void createRaw()}
            >
              ایجاد فعالیت
            </Button>
          </div>
        ) : null}
        {createMode === "template" ? (
          <div className="space-y-3">
            <Select
              showSearch
              optionFilterProp="label"
              className="w-full"
              value={templateId}
              onChange={(value) => void chooseTemplate(value)}
              options={templates.map((item) => ({
                value: item.id,
                label: item.name || "بدون عنوان",
              }))}
              placeholder="انتخاب الگوی فرآیند"
            />
            <Select
              disabled={!templateId}
              className="w-full"
              value={templateStageId}
              onChange={setTemplateStageId}
              options={templateStages.map((item) => ({
                value: item.id,
                label: item.stage_name || item.name || "بدون عنوان",
              }))}
              placeholder="انتخاب مرحله"
            />
            <Button
              block
              type="primary"
              loading={creating}
              disabled={!templateStageId}
              onClick={() => void createTemplateTask()}
            >
              ایجاد فعالیت از مرحله
            </Button>
          </div>
        ) : null}
      </Modal>
    </Card>
  );
};
export default ContentCalendarRuntime;
