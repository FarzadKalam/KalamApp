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
  CopyOutlined,
  HolderOutlined,
  LeftOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ProjectOutlined,
  RightOutlined,
} from "@ant-design/icons";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
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
import {
  createProcessGroupId,
  ensureProcessRunForDraftStageGroup,
  mapProcessTemplateStagesToDraft,
  resolveProcessRunStageId,
} from "../../utils/processRunRuntime";
import {
  autoAssignProcessV2DraftStages,
  renderProcessV2TemplateValueFromRecord,
} from "../../utils/processV2AutoAssign";
import { assignProcessTemplateModuleAliases } from "../../utils/processTemplateContext";
import { doesProcessTemplateSupportModule } from "../../utils/processTargets";
import { saveProcessV2DraftStage } from "../../utils/processV2DraftStagePersistence";
import { loadProcessTaskModalContext } from "../../utils/processTaskModalContext";
import { buildContentCalendarTaskCopyDraft } from "../../utils/contentCalendarCopy";
import { copyContentCalendarToNextMonth } from "../../utils/contentCalendarCopy";
import type { ProcessV2CardData, ProcessV2Stage } from "../processes/ProcessCardsV2";

type RuntimeItem = {
  id: string;
  kind: "task" | "project" | "project_draft" | "calendar_draft";
  record: any;
  date: Date;
  inherited?: boolean;
  project?: any;
  draftStage?: any;
};
type CreateMode = "choice" | "raw" | "template";
type CalendarClipboard = {
  kind: "task" | "project";
  record: any;
};
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

const CalendarDragHandle: React.FC<{ item: RuntimeItem; disabled?: boolean }> = ({ item, disabled = false }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `calendar-item:${item.kind}:${item.id}`,
    disabled,
    data: { item },
  });
  return <span ref={setNodeRef} {...attributes} {...listeners} aria-label="جابجایی به روز دیگر" title="جابجایی به روز دیگر" onClick={(event) => event.stopPropagation()} className={`inline-flex h-6 w-6 shrink-0 touch-none items-center justify-center rounded text-gray-400 ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-grab active:cursor-grabbing hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10'}`} style={{ opacity: isDragging ? 0.35 : 1 }}><HolderOutlined /></span>;
};

const CalendarDayDropTarget: React.FC<{ dayKey: string; children: React.ReactNode }> = ({ dayKey, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `calendar-day:${dayKey}` });
  return <div ref={setNodeRef} className={isOver ? 'rounded-xl ring-2 ring-[rgba(var(--brand-500-rgb),0.65)]' : undefined}>{children}</div>;
};
const formatTime = (value: any) => {
  const date = asDate(value);
  return date ? toPersian(date).format("HH:mm") : "";
};
const formatContentType = (value: any) =>
  CONTENT_TYPES.find((item) => item.value === String(value || ""))?.label ||
  String(value || "").trim();
const asObject = (value: any): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const renderProjectDraftTitle = (stage: any, project: any) => {
  const rawTitle = String(stage?.stage_name || stage?.name || stage?.title || "فعالیت پیش‌نویس").trim();
  if (!rawTitle || !project || typeof project !== "object") return rawTitle || "فعالیت پیش‌نویس";
  const context = { ...project };
  assignProcessTemplateModuleAliases(context, "projects", project);
  const rendered = renderProcessV2TemplateValueFromRecord(rawTitle, context);
  return String(rendered ?? rawTitle).trim() || rawTitle;
};
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
  copyProject?: {
    name?: string | null;
    customerId?: string | null;
    processTemplateId?: string | null;
    projectAlignment?: any[];
    description?: string | null;
  };
  stayOnOrigin?: boolean;
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
  const [calendarDraftStages, setCalendarDraftStages] = useState<any[]>([]);
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
  const [clipboard, setClipboard] = useState<CalendarClipboard | null>(null);
  const [copiedTask, setCopiedTask] = useState<any | null>(null);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [copyingNextMonth, setCopyingNextMonth] = useState(false);
  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7, delay: 180, tolerance: 5 } }));
  const projectIdsKey = useMemo(
    () => projects.map((project) => String(project?.id || "").trim()).filter(Boolean).join(","),
    [projects],
  );
  const taskColumns =
    "id,name,status,priority,start_date,due_date,completed_at,project_id,content_calendar_id,content_type,related_to_module,updated_at,assignee_id,assignee_role_id,assignee_type,recurrence_info,task_type";
  const load = async () => {
    if (!calendarId) return;
    setLoading(true);
    try {
      const [projectResult, directResult, assigneeResult, calendarResult] = await Promise.all([
        supabase
          .from("projects")
          .select(
            "id,name,status,priority,start_date,due_date,completed_at,customer_id,content_calendar_id,updated_at,assignee_id,assignee_role_id,assignee_type,process_template_id,execution_process_draft,project_alignment,description",
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
        supabase
          .from("content_calendars")
          .select("execution_process_draft")
          .eq("id", calendarId)
          .maybeSingle(),
      ]);
      if (projectResult.error) throw projectResult.error;
      if (directResult.error) throw directResult.error;
      if (calendarResult.error) throw calendarResult.error;
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
      setCalendarDraftStages(Array.isArray(calendarResult.data?.execution_process_draft) ? calendarResult.data.execution_process_draft : []);
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
  useEffect(() => {
    const onProjectCreated = (event: Event) => {
      const createdCalendarId = String((event as CustomEvent)?.detail?.calendarId || "").trim();
      if (createdCalendarId && createdCalendarId === calendarId) void load();
    };
    window.addEventListener("content-calendar-project-created", onProjectCreated);
    return () => window.removeEventListener("content-calendar-project-created", onProjectCreated);
  }, [calendarId]);
  useEffect(() => {
    if (!calendarId) return undefined;
    const channel = supabase.channel(`content-calendar-live-${calendarId}`);
    const refreshCalendar = () => {
      void load();
    };
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "projects", filter: `content_calendar_id=eq.${calendarId}` },
      refreshCalendar,
    );
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "content_calendars", filter: `id=eq.${calendarId}` },
      refreshCalendar,
    );
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks", filter: `content_calendar_id=eq.${calendarId}` },
      refreshCalendar,
    );
    projectIdsKey.split(",").filter(Boolean).forEach((projectId) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` },
        refreshCalendar,
      );
    });
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [calendarId, projectIdsKey]);
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
    // در نمای «همه»، پروژه فقط یک‌بار در روز خودش دیده می‌شود؛ در نمای
    // «فعالیت‌ها» فقط فعالیت‌ها و در نمای «پروژه‌ها» فقط پروژه‌ها نمایش داده می‌شوند.
    if (mode !== "tasks")
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
    if (mode !== "projects")
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
    if (mode !== "projects")
      calendarDraftStages.forEach((draftStage: any, index: number) => {
        const date = asDate(
          draftStage?.start_date
            || draftStage?.due_date
            || calendar?.start_date
            || calendar?.end_date,
        );
        if (!date) return;
        entries.push({
          id: `calendar:${String(draftStage?.process_node_key || draftStage?.id || index)}`,
          kind: "calendar_draft",
          record: draftStage,
          draftStage,
          date,
        });
      });
    if (mode !== "projects")
      projects.forEach((project) => {
        const drafts = Array.isArray(project?.execution_process_draft)
          ? project.execution_process_draft
          : [];
        drafts.forEach((draftStage: any, index: number) => {
          const date = asDate(
            draftStage?.start_date ||
              draftStage?.due_date ||
              project?.start_date ||
              project?.due_date,
          );
          if (!date) return;
          entries.push({
            id: `${String(project.id)}:${String(draftStage?.process_node_key || draftStage?.id || index)}`,
            kind: "project_draft",
            record: draftStage,
            project,
            draftStage,
            date,
          });
        });
      });
    return entries.reduce((map, item) => {
      const key = toKey(item.date);
      map.set(key, [...(map.get(key) || []), item]);
      return map;
    }, new Map<string, RuntimeItem[]>());
  }, [calendar, calendarDraftStages, mode, projectDateField, projects, taskDateField, tasks]);
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
    setCopiedTask(null);
  };
  const draftIdentityKeys = (stage: any) => [
    stage?.id,
    stage?.process_node_key,
    stage?.template_stage_id,
    stage?.process_run_stage_id,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const removeDraftFromOwner = async (table: "content_calendars" | "projects", ownerId: string, selectedStage: any) => {
    const { data, error } = await supabase
      .from(table)
      .select("execution_process_draft")
      .eq("id", ownerId)
      .maybeSingle();
    if (error) throw error;
    const selectedKeys = new Set(draftIdentityKeys(selectedStage));
    const current = Array.isArray(data?.execution_process_draft) ? data.execution_process_draft : [];
    const next = current.filter((stage: any) => !draftIdentityKeys(stage).some((key) => selectedKeys.has(key)));
    if (next.length === current.length) return;
    const { error: updateError } = await supabase.from(table).update({ execution_process_draft: next }).eq("id", ownerId);
    if (updateError) throw updateError;
  };
  const updateDraftInOwner = async (table: "content_calendars" | "projects", ownerId: string, selectedStage: any, patch: Record<string, any>) => {
    const { data, error } = await supabase.from(table).select("execution_process_draft").eq("id", ownerId).maybeSingle();
    if (error) throw error;
    const selectedKeys = new Set(draftIdentityKeys(selectedStage));
    const current = Array.isArray(data?.execution_process_draft) ? data.execution_process_draft : [];
    const next = current.map((stage: any) => {
      if (!draftIdentityKeys(stage).some((key) => selectedKeys.has(key))) return stage;
      return {
        ...stage,
        ...patch,
        metadata: { ...asObject(stage?.metadata), ...asObject(patch?.metadata) },
        recurrence_info: { ...asObject(stage?.recurrence_info), ...asObject(patch?.recurrence_info) },
      };
    });
    const { error: updateError } = await supabase.from(table).update({ execution_process_draft: next }).eq("id", ownerId);
    if (updateError) throw updateError;
  };
  const openDraftActivity = async ({
    draftStages,
    targetStage,
    processTitle,
    templateId: sourceTemplateId = null,
    templateTitle = null,
    contentType = null,
    scheduleDate = null,
    onDraftCreated,
    onDraftSaved,
  }: {
    draftStages: any[];
    targetStage: any;
    processTitle: string;
    templateId?: string | null;
    templateTitle?: string | null;
    contentType?: string | null;
    scheduleDate?: Date | null;
    onDraftCreated?: (createdTaskIds: string[]) => Promise<void> | void;
    onDraftSaved?: (overrides: Record<string, any>) => Promise<void> | void;
  }) => {
    const effectiveCreateDate = scheduleDate || createDate;
    if (!effectiveCreateDate || !calendarId) return;
    setCreating(true);
    try {
      const dateKey = toKey(effectiveCreateDate);
      const defaultSchedule = {
        start_date: `${dateKey}T09:00:00`,
        due_date: `${dateKey}T17:00:00`,
      };
      const context = await ensureProcessRunForDraftStageGroup({
        supabaseClient: supabase,
        moduleId: "content_calendars",
        recordId: calendarId,
        stages: draftStages,
        targetStage,
      });
      if (!context.processRunId || !context.processRunStageId) {
        throw new Error("ایجاد پیش‌نویس فرآیند ناموفق بود.");
      }
      const stagesWithRuntime = draftStages.map((stage) => {
        const processRunStageId = resolveProcessRunStageId(context.stageMap, stage);
        const metadata = asObject(stage?.metadata);
        const recurrence = asObject(stage?.recurrence_info);
        return {
          ...stage,
          ...(String(stage?.id) === String(targetStage?.id) ? defaultSchedule : {}),
          process_run_id: context.processRunId,
          process_run_stage_id: processRunStageId || null,
          process_link_map: {
            ...asObject(stage?.process_link_map),
            content_calendars: calendarId,
          },
          metadata: {
            ...metadata,
            process_run_id: context.processRunId,
            process_run_stage_id: processRunStageId || null,
            content_calendar_id: calendarId,
            ...(String(stage?.id) === String(targetStage?.id) ? defaultSchedule : {}),
          },
          recurrence_info: {
            ...recurrence,
            process_run_id: context.processRunId,
            process_run_stage_id: processRunStageId || null,
          },
        };
      });
      const selectedSource = stagesWithRuntime.find((stage) => String(stage?.id) === String(targetStage?.id));
      if (!selectedSource) throw new Error("مرحلهٔ پیش‌نویس انتخاب‌شده پیدا نشد.");

      const laneMap = new Map<string, { id: string; title: string; stages: ProcessV2Stage[] }>();
      stagesWithRuntime.forEach((source, index) => {
        const laneId = String(source?.process_lane_key || source?.metadata?.process_lane_key || "content_calendar_lane");
        const lane = laneMap.get(laneId) || {
          id: laneId,
          title: String(source?.process_lane_name || source?.metadata?.process_lane_name || "فعالیت‌های محتوا"),
          stages: [],
        };
        lane.stages.push({
          id: String(source?.process_run_stage_id || source?.id || `draft-${index}`),
          title: String(source?.stage_name || source?.name || "فعالیت"),
          kind: "draft",
          status: "draft",
          layoutSlot: Number(source?.sort_order || (index + 1) * 10),
          assigneeLabel: String(source?.assignee_label || "مسئول پیش‌فرض"),
          activityTypeLabel: String(source?.task_type || source?.metadata?.task_type || "فعالیت سازمانی"),
          dueLabel: String(source?.due_date || ""),
          actionCount: Array.isArray(source?.automation_rules) ? source.automation_rules.length : 0,
          source,
        });
        laneMap.set(laneId, lane);
      });
      const modalStage = Array.from(laneMap.values()).flatMap((lane) => lane.stages)
        .find((stage) => String(stage.source?.id) === String(selectedSource.id)) || null;
      if (!modalStage) throw new Error("مرحلهٔ پیش‌نویس قابل نمایش نیست.");
      const modalProcess: ProcessV2CardData = {
        mode: "run",
        id: context.processRunId,
        title: processTitle,
        templateId: sourceTemplateId || '',
        templateTitle: templateTitle || processTitle,
        relatedRecordLabel: getRecordTitle(calendar, MODULES.content_calendars, { fallback: "تقویم محتوایی" }),
        statusLabel: "draft",
        lanes: Array.from(laneMap.values()),
      };
      const mergeTargetOverrides = (overrides?: Record<string, any>) => stagesWithRuntime.map((stage) => {
        if (String(stage?.id) !== String(selectedSource.id)) return stage;
        const patch = asObject(overrides);
        return {
          ...stage,
          ...patch,
          metadata: { ...asObject(stage?.metadata), ...asObject(patch.metadata) },
          recurrence_info: { ...asObject(stage?.recurrence_info), ...asObject(patch.recurrence_info) },
        };
      });
      openTaskProcessModal({
        draftModal: {
          process: modalProcess,
          stage: modalStage,
          laneTitle: Array.from(laneMap.values()).find((lane) => lane.stages.includes(modalStage))?.title || "فعالیت‌های محتوا",
          onSaveDraftActivity: async (overrides) => {
            const savedStage = mergeTargetOverrides(overrides).find((stage) => String(stage?.id) === String(selectedSource.id));
            await saveProcessV2DraftStage({
              supabaseClient: supabase,
              stageId: selectedSource.process_run_stage_id,
              stageName: savedStage?.stage_name || savedStage?.name,
              assigneeUserId: savedStage?.assignee_id || savedStage?.default_assignee_id,
              assigneeRoleId: savedStage?.assignee_role_id || savedStage?.default_assignee_role_id,
              wage: savedStage?.wage,
              plannedStartAt: savedStage?.start_date,
              plannedDueAt: savedStage?.due_date,
              metadata: asObject(savedStage?.metadata),
            });
            await onDraftSaved?.(asObject(overrides));
          },
          onCreateDraftActivity: async (overrides) => {
            const result = await autoAssignProcessV2DraftStages({
              supabaseClient: supabase,
              moduleId: "content_calendars",
              recordId: calendarId,
              recordData: calendar,
              draftStages: mergeTargetOverrides(overrides),
              targetGroupId: selectedSource.process_group_id,
              targetStageId: selectedSource.process_node_key || selectedSource.id,
            });
            const ids = (result.createdTasks || []).map((item: any) => String(item?.id || "")).filter(Boolean);
            if (ids.length > 0) {
              const patch = asObject(overrides);
              const { error } = await supabase
                .from("tasks")
                .update({
                  content_calendar_id: calendarId,
                  content_type: contentType || null,
                  start_date: patch.start_date || defaultSchedule.start_date,
                  due_date: patch.due_date || defaultSchedule.due_date,
                })
                .in("id", ids);
              if (error) throw error;
              await onDraftCreated?.(ids);
              await load();
            }
            if (!ids.length && result.missingAssigneeCount) {
              throw new Error("برای ایجاد فعالیت، مسئول مرحله را تعیین کنید.");
            }
            return result;
          },
        },
      });
      resetCreate();
    } catch (error: any) {
      message.error(`باز کردن پیش‌نویس فعالیت ناموفق بود: ${String(error?.message || "خطای نامشخص")}`);
    } finally {
      setCreating(false);
    }
  };
  const createRaw = async () => {
    if (!createDate || !rawName.trim()) {
      message.warning("عنوان فعالیت را وارد کنید.");
      return;
    }
    const groupId = createProcessGroupId();
    const draftStage = copiedTask
      ? buildContentCalendarTaskCopyDraft({ sourceTask: copiedTask, calendarId, groupId, name: rawName.trim() })
      : {
        id: `content_calendar_draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: rawName.trim(),
        stage_name: rawName.trim(),
        status: "draft",
        is_draft: true,
        task_type: "فعالیت سازمانی",
        sort_order: 10,
        process_group_id: groupId,
        process_group_name: "فعالیت‌های تقویم محتوایی",
        process_target_module_ids: ["content_calendars"],
        process_link_map: { content_calendars: calendarId },
        process_node_key: `${groupId}__activity_1`,
        process_lane_key: `${groupId}__content_calendar_lane`,
        metadata: { task_type: "فعالیت سازمانی", content_calendar_id: calendarId },
      };
    await openDraftActivity({
      draftStages: [draftStage],
      targetStage: draftStage,
      processTitle: copiedTask ? "کپی فعالیت تقویم محتوایی" : "فعالیت‌های تقویم محتوایی",
      contentType: rawContentType || null,
    });
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
    try {
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
      if (!selected) throw new Error("مرحلهٔ الگو پیدا نشد.");
      await openDraftActivity({
        draftStages: draft,
        targetStage: selected,
        processTitle: String(template.name || "فرآیند محتوا"),
        templateId,
        templateTitle: String(template.name || "فرآیند محتوا"),
      });
    } catch (error: any) {
      message.error(
        `آماده‌سازی پیش‌نویس از الگو ناموفق بود: ${String(error?.message || "خطای نامشخص")}`,
      );
    }
  };
  const openCalendarDraftActivity = async (item: RuntimeItem) => {
    const selectedDraft = item.draftStage;
    if (!selectedDraft?.id || !calendarId) return;
    await openDraftActivity({
      draftStages: calendarDraftStages,
      targetStage: selectedDraft,
      processTitle: "فعالیت‌های تقویم محتوایی",
      scheduleDate: item.date,
      onDraftSaved: async (overrides) => {
        await updateDraftInOwner("content_calendars", calendarId, selectedDraft, overrides);
      },
      onDraftCreated: async () => {
        await removeDraftFromOwner("content_calendars", calendarId, selectedDraft);
      },
    });
  };
  const openProjectDraftActivity = async (item: RuntimeItem) => {
    const project = item.project;
    const selectedDraft = item.draftStage;
    if (!project?.id || !selectedDraft?.id || !calendarId) return;
    setCreating(true);
    try {
      const sourceStages = Array.isArray(project.execution_process_draft) ? project.execution_process_draft : [];
      const context = await ensureProcessRunForDraftStageGroup({
        supabaseClient: supabase,
        moduleId: "projects",
        recordId: String(project.id),
        stages: sourceStages,
        targetStage: selectedDraft,
      });
      if (!context.processRunId || !context.processRunStageId) throw new Error("آماده‌سازی مرحلهٔ پروژه ناموفق بود.");
      const dateKey = toKey(item.date);
      const defaultSchedule = { start_date: `${dateKey}T09:00:00`, due_date: `${dateKey}T17:00:00` };
      const stages = sourceStages.map((stage: any) => {
        const isSelected = String(stage?.id) === String(selectedDraft.id);
        const runStageId = resolveProcessRunStageId(context.stageMap, stage);
        return {
          ...stage,
          ...(isSelected ? defaultSchedule : {}),
          project_id: String(project.id),
          process_run_id: context.processRunId,
          process_run_stage_id: runStageId || null,
          process_link_map: { ...asObject(stage?.process_link_map), projects: String(project.id), content_calendars: calendarId },
          metadata: { ...asObject(stage?.metadata), project_id: String(project.id), content_calendar_id: calendarId, process_run_id: context.processRunId, process_run_stage_id: runStageId || null, ...(isSelected ? defaultSchedule : {}) },
        };
      });
      const selected = stages.find((stage: any) => String(stage.id) === String(selectedDraft.id));
      if (!selected) throw new Error("مرحلهٔ پیش‌نویس پیدا نشد.");
      const modalStage: ProcessV2Stage = {
        id: String(selected.process_run_stage_id || selected.id), title: renderProjectDraftTitle(selected, project), kind: "draft", status: "draft", layoutSlot: Number(selected.sort_order || 10), assigneeLabel: String(selected.assignee_label || "مسئول پیش‌فرض"), activityTypeLabel: String(selected.task_type || selected?.metadata?.task_type || "فعالیت سازمانی"), dueLabel: String(selected.due_date || ""), actionCount: Array.isArray(selected.automation_rules) ? selected.automation_rules.length : 0, source: selected,
      };
      const modalProcess: ProcessV2CardData = {
        mode: "run", id: context.processRunId, title: getRecordTitle(project, MODULES.projects, { fallback: "پروژه" }), templateId: String(project.process_template_id || ""), templateTitle: String(selected.process_group_name || "فعالیت‌های پروژه"), relatedRecordLabel: getRecordTitle(calendar, MODULES.content_calendars, { fallback: "تقویم محتوایی" }), statusLabel: "draft", lanes: [{ id: String(selected.process_lane_key || "project_calendar_lane"), title: String(selected.process_lane_name || "فعالیت‌های پروژه"), stages: [modalStage] }],
      };
      openTaskProcessModal({
        draftModal: {
          process: modalProcess,
          stage: modalStage,
          laneTitle: String(selected.process_lane_name || "فعالیت‌های پروژه"),
          onSaveDraftActivity: async (overrides) => {
            const patch = asObject(overrides);
            await saveProcessV2DraftStage({ supabaseClient: supabase, stageId: selected.process_run_stage_id, stageName: patch.stage_name || patch.name || selected.stage_name || selected.name, assigneeUserId: patch.assignee_id || patch.default_assignee_id || selected.assignee_id || selected.default_assignee_id, assigneeRoleId: patch.assignee_role_id || patch.default_assignee_role_id || selected.assignee_role_id || selected.default_assignee_role_id, wage: patch.wage || selected.wage, plannedStartAt: patch.start_date || selected.start_date, plannedDueAt: patch.due_date || selected.due_date, metadata: { ...asObject(selected.metadata), ...asObject(patch.metadata) } });
            await updateDraftInOwner("projects", String(project.id), selected, patch);
          },
          onCreateDraftActivity: async (overrides) => {
            const patch = asObject(overrides);
            const result = await autoAssignProcessV2DraftStages({ supabaseClient: supabase, moduleId: "projects", recordId: String(project.id), recordData: project, draftStages: stages.map((stage: any) => String(stage.id) === String(selected.id) ? { ...stage, ...patch, metadata: { ...asObject(stage.metadata), ...asObject(patch.metadata) } } : stage), targetGroupId: selected.process_group_id, targetStageId: selected.process_node_key || selected.id });
            const ids = (result.createdTasks || []).map((task: any) => String(task?.id || "")).filter(Boolean);
            if (ids.length) {
              const { error } = await supabase.from("tasks").update({ project_id: String(project.id), content_calendar_id: calendarId, start_date: patch.start_date || selected.start_date || defaultSchedule.start_date, due_date: patch.due_date || selected.due_date || defaultSchedule.due_date }).in("id", ids);
              if (error) throw error;
              await removeDraftFromOwner("projects", String(project.id), selected);
              await load();
            }
            if (!ids.length && result.missingAssigneeCount) throw new Error("برای ارجاع فعالیت، مسئول مرحله را تعیین کنید.");
            return result;
          },
        },
      });
    } catch (error: any) {
      message.error(`باز کردن پیش‌نویس پروژه ناموفق بود: ${String(error?.message || "خطای نامشخص")}`);
    } finally {
      setCreating(false);
    }
  };
  const autoAssignDraftItem = async (item: RuntimeItem) => {
    const selected = item.draftStage;
    const isProjectDraft = item.kind === "project_draft";
    const ownerId = isProjectDraft ? String(item.project?.id || "") : calendarId;
    const sourceStages = isProjectDraft
      ? (Array.isArray(item.project?.execution_process_draft) ? item.project.execution_process_draft : [])
      : calendarDraftStages;
    if (!selected?.id || !ownerId || sourceStages.length === 0) return false;
    setCreating(true);
    try {
      const result = await autoAssignProcessV2DraftStages({
        supabaseClient: supabase,
        moduleId: isProjectDraft ? "projects" : "content_calendars",
        recordId: ownerId,
        recordData: isProjectDraft ? item.project : calendar,
        draftStages: sourceStages,
        targetGroupId: selected.process_group_id,
        targetStageId: selected.process_node_key || selected.id,
      });
      const ids = (result.createdTasks || []).map((task: any) => String(task?.id || "")).filter(Boolean);
      if (ids.length) {
        const dateKey = toKey(item.date);
        const { error } = await supabase.from("tasks").update({
          project_id: isProjectDraft ? ownerId : null,
          content_calendar_id: calendarId,
          start_date: selected.start_date || `${dateKey}T09:00:00`,
          due_date: selected.due_date || `${dateKey}T17:00:00`,
        }).in("id", ids);
        if (error) throw error;
        await removeDraftFromOwner(isProjectDraft ? "projects" : "content_calendars", ownerId, selected);
        await load();
        message.success("فعالیت پیش‌نویس ارجاع شد.");
        return true;
      }
      if (result.missingAssigneeCount) throw new Error("برای ارجاع فعالیت، مسئول مرحله را تعیین کنید.");
      message.warning("این پیش‌نویس فعالیت قابل ارجاع نبود.");
      return false;
    } catch (error: any) {
      message.error(`ارجاع فعالیت ناموفق بود: ${String(error?.message || "خطای نامشخص")}`);
      return false;
    } finally {
      setCreating(false);
    }
  };
  const autoAssignAllDraftsForMonth = async () => {
    if (bulkAssigning) return;
    const monthDrafts = days
      .filter((day) => day.inMonth)
      .flatMap((day) => events.get(day.key) || [])
      .filter((item) => item.kind === "project_draft" || item.kind === "calendar_draft");
    if (monthDrafts.length === 0) {
      message.info("در این ماه پیش‌نویسی برای ارجاع وجود ندارد.");
      return;
    }
    setBulkAssigning(true);
    let assignedCount = 0;
    try {
      for (const item of monthDrafts) {
        if (await autoAssignDraftItem(item)) assignedCount += 1;
      }
      if (assignedCount > 0) message.success(`${assignedCount} پیش‌نویس فعالیت ارجاع شد.`);
    } finally {
      setBulkAssigning(false);
    }
  };
  const renderEvent = (item: RuntimeItem, large = false) => {
    const isTask = item.kind === "task";
    const isDraft = item.kind === "project_draft" || item.kind === "calendar_draft";
    const isProjectDraft = item.kind === "project_draft";
    const record = item.record;
    const statusOptions = MODULES.tasks.fields.find((field) => field.key === "status")?.options || [];
    const label = isDraft ? "پیش‌نویس" : isTask ? getTaskStatusLabel(record.status, record, statusOptions) : String(record.status || "");
    const color = isDraft ? "#64748b" : isTask ? STATUS_COLORS[getTaskStatusColor(record.status, record, statusOptions)] || STATUS_COLORS.default : "#8b5cf6";
    const assignee = resolveAssigneePresentation({ source: record, allUsers: directory.users, allRoles: directory.roles });
    const linkedProject = isTask && record?.project_id
      ? projects.find((project) => String(project?.id || "") === String(record.project_id)) || null
      : null;
    const title = isDraft
      ? renderProjectDraftTitle(record, item.project)
      : getRecordTitle(record, MODULES[isTask ? "tasks" : "projects"], { fallback: "بدون عنوان" });
    const open = () => {
      if (isTask) openTaskProcessModal({ taskId: item.id, task: record });
      else if (item.kind === "project_draft") void openProjectDraftActivity(item);
      else if (item.kind === "calendar_draft") void openCalendarDraftActivity(item);
      else navigate(`/projects/${item.id}`);
    };
    const copySource = isTask ? { kind: "task" as const, record } : !isDraft ? { kind: "project" as const, record } : null;
    return <div key={`${item.kind}:${item.id}`} onClick={(event) => { event.stopPropagation(); open(); }} className={`w-full cursor-pointer rounded-lg border text-right shadow-sm transition hover:border-[rgba(var(--brand-400-rgb),0.9)] ${isDraft ? "border-dashed border-slate-300 bg-slate-100/80 dark:border-slate-600 dark:bg-white/[0.06]" : "border-gray-200 bg-white/90 dark:border-white/10 dark:bg-[#1d1d1d]"} ${large ? "px-3 py-2 text-xs" : "px-2 py-1 text-[10px]"}`} style={{ borderRight: `3px ${isDraft ? "dashed" : "solid"} ${color}` }}>
      <div className="flex min-w-0 items-start gap-1.5">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white dark:bg-[#1d1d1d]" style={{ borderColor: color }}>
          {assignee.assigneeId ? <IdentityAvatar size={18} option={{ kind: assignee.kind === "role" ? "role" : "user", id: assignee.assigneeId, label: assignee.label || "مسئول", avatarUrl: assignee.avatarUrl || undefined, iconKey: normalizeRoleIconKey(assignee.role?.icon_key) }} /> : <span className="h-full w-full" style={{ backgroundColor: color }} />}
        </span>
        <span className="min-w-0 flex-1"><span className="block line-clamp-2 font-bold text-gray-700 dark:text-gray-100">{title}</span>{isDraft && isProjectDraft ? <span className="block truncate text-[9px] text-slate-600 dark:text-slate-300">پروژه: {getRecordTitle(item.project, MODULES.projects, { fallback: "پروژه" })}</span> : assignee.label ? <span className="block truncate text-[9px] text-gray-500 dark:text-gray-400">مسئول: {assignee.label}</span> : null}</span>
        {canEdit && copySource ? <Button type="text" size="small" icon={<CopyOutlined />} aria-label={`کپی ${isTask ? "فعالیت" : "پروژه"}`} title={`کپی ${isTask ? "فعالیت" : "پروژه"}`} className="!h-6 !w-6 !min-w-6 !p-0" onClick={(event) => { event.stopPropagation(); setClipboard(copySource); }} /> : null}
        {canEdit && isDraft ? <Button type="text" size="small" icon={<PlayCircleOutlined />} aria-label="ارجاع خودکار پیش‌نویس" title="ارجاع خودکار پیش‌نویس" className="!h-6 !w-6 !min-w-6 !p-0 !text-slate-500" loading={creating} onClick={(event) => { event.stopPropagation(); void autoAssignDraftItem(item); }} /> : null}
        {canEdit && isTask ? <CalendarDragHandle item={item} /> : null}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 text-[9px] text-gray-500 dark:text-gray-400">
        {isTask && formatContentType(record.content_type) ? <span>نوع محتوا: {formatContentType(record.content_type)}</span> : null}
        {formatTime(record.due_date) ? <span>موعد: {formatTime(record.due_date)}</span> : null}
        {label ? <span style={{ color }}>{label}</span> : null}
        {linkedProject ? <button type="button" onClick={(event) => { event.stopPropagation(); navigate(`/projects/${linkedProject.id}`); }} className="font-bold text-[rgb(var(--brand-700-rgb))] underline decoration-dotted underline-offset-2 dark:text-[rgb(var(--brand-200-rgb))]">پروژه: {getRecordTitle(linkedProject, MODULES.projects, { fallback: "پروژه" })}</button> : null}
      </div>
    </div>;
  };
  const placeClipboardOnDay = async (day: ReturnType<typeof buildDays>[number]) => {
    if (!clipboard) return false;
    if (clipboard.kind === "project") {
      void onOpenTemplateProject?.({
        contentCalendarId: calendarId,
        customerId: clipboard.record?.customer_id || calendar?.customer_id || null,
        dateKey: toKey(day.date),
        stayOnOrigin: true,
        copyProject: {
          name: String(clipboard.record?.name || "").trim(),
          customerId: clipboard.record?.customer_id || null,
          processTemplateId: clipboard.record?.process_template_id || null,
          projectAlignment: Array.isArray(clipboard.record?.project_alignment) ? clipboard.record.project_alignment : [],
          description: clipboard.record?.description || null,
        },
      });
    } else {
      try {
        // کارت تقویم سبک است؛ تعریف فیلدها ممکن است فقط در stage اجرایی باشد.
        const sourceTask = await loadProcessTaskModalContext(supabase, clipboard.record, {
          taskId: String(clipboard.record?.id || "").trim() || null,
          processRunStageId: String(clipboard.record?.process_run_stage_id || "").trim() || null,
        });
        setCopiedTask(sourceTask);
        setRawName(String(sourceTask?.name || clipboard.record?.name || "").trim());
        setRawContentType(sourceTask?.content_type || clipboard.record?.content_type || undefined);
      } catch (error: any) {
        message.error(`آماده‌سازی کپی فعالیت ناموفق بود: ${String(error?.message || "خطای نامشخص")}`);
        return false;
      }
      setCreateDate(day.date);
      setCreateMode("raw");
    }
    setClipboard(null);
    return true;
  };
  const handleCalendarDragEnd = async (event: DragEndEvent) => {
    const source = event.active.data.current?.item as RuntimeItem | undefined;
    const targetId = String(event.over?.id || "");
    const dayKey = targetId.startsWith("calendar-day:") ? targetId.slice("calendar-day:".length) : "";
    if (!source || source.kind !== "task" || !dayKey || !canEdit) return;
    const targetDate = new Date(`${dayKey}T12:00:00`);
    const previousDate = source.date;
    const deltaDays = Math.round((targetDate.getTime() - previousDate.getTime()) / 86_400_000);
    if (!deltaDays) return;
    const shiftDate = (value: any) => {
      const date = asDate(value);
      return date ? new Date(date.getTime() + deltaDays * 86_400_000).toISOString() : null;
    };
    try {
      const patch: Record<string, any> = {};
      if (taskDateField === "start_date") {
        patch.start_date = shiftDate(source.record?.start_date) || `${dayKey}T09:00:00`;
        patch.due_date = shiftDate(source.record?.due_date);
      } else if (taskDateField === "completed_at") {
        patch.completed_at = `${dayKey}T12:00:00`;
      } else {
        patch.due_date = shiftDate(source.record?.due_date) || `${dayKey}T17:00:00`;
        patch.start_date = shiftDate(source.record?.start_date);
      }
      Object.keys(patch).forEach((key) => patch[key] === null && delete patch[key]);
      const { error } = await supabase.from("tasks").update(patch).eq("id", source.record.id);
      if (error) throw error;
      message.success("زمان فعالیت جابه‌جا شد.");
      await load();
    } catch (error: any) {
      message.error(`جابجایی فعالیت ناموفق بود: ${String(error?.message || "خطای نامشخص")}`);
    }
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
      <CalendarDayDropTarget dayKey={day.key}>
      <div
        key={day.key}
        onClick={() => { if (clipboard) void placeClipboardOnDay(day); }}
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
      </CalendarDayDropTarget>
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
        <div className="flex flex-wrap items-center justify-end gap-1">
          {canEdit ? <Button size="small" icon={<CopyOutlined />} loading={copyingNextMonth} onClick={async () => {
            setCopyingNextMonth(true);
            try {
              const targetId = await copyContentCalendarToNextMonth({ supabaseClient: supabase, sourceCalendar: { ...calendar, id: calendarId } });
              message.success("کپی تقویم برای ماه بعد ساخته شد.");
              navigate(`/content_calendars/${targetId}`);
            } catch (error: any) {
              message.error(`کپی تقویم ناموفق بود: ${String(error?.message || "خطای نامشخص")}`);
            } finally {
              setCopyingNextMonth(false);
            }
          }}>کپی به ماه بعد</Button> : null}
          {canEdit ? <Button size="small" icon={<PlayCircleOutlined />} loading={bulkAssigning} onClick={() => void autoAssignAllDraftsForMonth()}>ارجاع خودکار</Button> : null}
          {canEdit ? <Button size="small" type="primary" icon={<PlayCircleOutlined />} loading={bulkAssigning} onClick={() => void autoAssignAllDraftsForMonth()}>ارجاع همه پیش‌نویس‌های این ماه</Button> : null}
          <Button size="small" onClick={() => void load()}>به‌روزرسانی</Button>
        </div>
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
      {clipboard ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-indigo-400 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-100">
          <span>در حال کپی {clipboard.kind === "project" ? "پروژه" : "فعالیت"}: <strong>{getRecordTitle(clipboard.record, MODULES[clipboard.kind === "project" ? "projects" : "tasks"], { fallback: "بدون عنوان" })}</strong> — روز مقصد را انتخاب کنید.</span>
          <Button size="small" type="text" onClick={() => setClipboard(null)}>لغو</Button>
        </div>
      ) : null}
      {loading ? (
        <div className="py-12 text-center">
          <Spin />
        </div>
      ) : (
        <DndContext sensors={dragSensors} onDragEnd={(event) => void handleCalendarDragEnd(event)}>
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
          {projects.length + tasks.length + calendarDraftStages.length === 0 ? (
            <Empty
              className="mt-5"
              description="هنوز پروژه یا فعالیتی به این تقویم متصل نشده است."
            />
          ) : null}
        </DndContext>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Card hoverable size="small" className="!rounded-xl !border-slate-200" onClick={() => setCreateMode("raw")}>
              <div className="flex items-start gap-3"><PlusOutlined className="mt-1 text-lg text-slate-500" /><div><div className="font-black">ایجاد پیش‌نویس فعالیت خام</div><div className="mt-1 text-xs text-slate-500">فعالیت را وارد کنید و پیش از ارجاع بررسی کنید.</div></div></div>
            </Card>
            <Card hoverable size="small" className="!rounded-xl !border-blue-300 !bg-blue-50/60 dark:!border-blue-700 dark:!bg-blue-950/20" onClick={() => void openTemplate()}>
              <div className="flex items-start gap-3"><CalendarOutlined className="mt-1 text-lg text-blue-600" /><div><div className="font-black text-blue-800 dark:text-blue-200">ایجاد فعالیت از الگو</div><div className="mt-1 text-xs text-blue-700/80 dark:text-blue-300/80">یک مرحلهٔ فرآیند را به‌صورت پیش‌نویس آماده کنید.</div></div></div>
            </Card>
            <Card hoverable size="small" className="!rounded-xl !border-slate-200" onClick={() => {
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
              }}>
              <div className="flex items-start gap-3"><ProjectOutlined className="mt-1 text-lg text-slate-500" /><div><div className="font-black">ایجاد پروژه خام</div><div className="mt-1 text-xs text-slate-500">پروژه را بدون الگو و با وضعیت پیش‌نویس بسازید.</div></div></div>
            </Card>
            <Card hoverable size="small" className="!rounded-xl !border-emerald-300 !bg-emerald-50/70 dark:!border-emerald-700 dark:!bg-emerald-950/20" onClick={() => {
                const date = createDate;
                resetCreate();
                if (date)
                  void onOpenTemplateProject?.({
                    contentCalendarId: calendarId,
                    customerId: calendar?.customer_id || null,
                    sourceInvoiceId: calendar?.source_invoice_id || null,
                    dateKey: toKey(date),
                  });
              }}>
              <div className="flex items-start gap-3"><ProjectOutlined className="mt-1 text-lg text-emerald-600" /><div><div className="font-black text-emerald-800 dark:text-emerald-200">ایجاد پروژه از الگوی فرآیند</div><div className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">پروژه و مرحله‌های پیش‌نویس آن را یک‌جا آماده کنید.</div></div></div>
            </Card>
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
            {!copiedTask ? <Select
              allowClear
              className="w-full"
              value={rawContentType}
              onChange={setRawContentType}
              options={CONTENT_TYPES}
              placeholder="نوع محتوا"
            /> : null}
            <Button
              block
              type="primary"
              loading={creating}
              onClick={() => void createRaw()}
            >
              باز کردن پیش‌نویس فعالیت
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
              باز کردن پیش‌نویس مرحله
            </Button>
          </div>
        ) : null}
      </Modal>
    </Card>
  );
};
export default ContentCalendarRuntime;
